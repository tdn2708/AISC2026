/**
 * Phiếu chấm kiểm mù điểm đau (KE-HOACH-GIAO-DIEN.md 13.5). CHỈ ĐỌC prod.
 * Chạy lõi ĐÃ KHÓA trên 8 mảng mù, ghi một trang HTML để người chấm mở bằng trình duyệt.
 * Script chỉ in SỐ LƯỢNG ra màn hình, không in nội dung (người làm không được đọc).
 *   node scripts/blind_sheet.js <file.html>
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { execSync } = require('child_process');
const { MongoClient } = require('mongodb');
const { computeContext } = require('../services/context_compute');
const { findPainPoints } = require('../services/pain_points');

const BLIND = new Set(['sữa rửa mặt', 'đồng hồ thông minh', 'tã dán', 'bình giữ nhiệt', 'bàn phím', 'cáp sạc', 'sữa bột', 'máy sấy tóc']);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('cần đường dẫn file ra');
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db('customer_radar_real');
  const raw = await db.collection('feedbacks').find({}).sort({ timestamp: -1 }).toArray();
  for (const f of raw) f._id = String(f._id);
  const audit = await db.collection('audit_labels').find({}).toArray();
  const review = await db.collection('review_labels').find({}).toArray();
  await c.close();
  const ctx = computeContext({ rawFeedbacks: raw, transactions: [], auditLabels: audit, reviewLabels: review, anchorToData: true, halfLifeDays: 180 });
  const r = findPainPoints(ctx.items, { now: ctx.asOf, groupFilter: (k, label) => BLIND.has(String(label).toLowerCase()) });
  const sha = execSync('git rev-parse --short HEAD').toString().trim();

  const points = r.groups.flatMap((g) => g.painPoints.map((p) => ({ g, p })));
  const rows = points.map(({ g, p }, i) => `
  <section data-i="${i}">
    <h2>${i + 1}. ${esc(g.label)}: "${esc(p.phrase)}"</h2>
    <p class="m">${p.customers} khách, ${p.count} câu${p.variants.length ? `; khách cũng viết: ${p.variants.map((v) => `"${esc(v)}"`).join(', ')}` : ''}</p>
    <ol>${p.examples.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ol>
    <fieldset><legend>Đây có phải MỘT chuyện cụ thể, giao việc được không?</legend>
      <label><input type="radio" name="q${i}" value="dung"> Đúng</label>
      <label><input type="radio" name="q${i}" value="sai"> Sai (lẫn nhiều chuyện, chung chung, hoặc chỉ là tên hàng)</label>
      <label><input type="radio" name="q${i}" value="kchac"> Không chắc</label>
      <input type="text" name="n${i}" placeholder="Ghi chú (không bắt buộc)">
    </fieldset>
  </section>`).join('\n');
  const summary = r.groups.map((g) => `<li>${esc(g.label)}: ${g.status === 'too_few' ? 'chưa đủ câu' : `${g.painPoints.length} điểm đau`} (${g.negatives} câu chê)</li>`).join('');

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phiếu chấm kiểm mù</title>
<style>
:root{--bg:#F4F6F9;--card:#fff;--ink:#13233F;--mid:#36465F;--line:#d8dee8;--acc:#1F6FA8}
@media (prefers-color-scheme:dark){:root{--bg:#0D1524;--card:#142036;--ink:#e9eef6;--mid:#b6c1d2;--line:#2a3a55;--acc:#8CCBEB}}
body{background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,sans-serif;margin:0;padding:24px 16px}
main{max-width:860px;margin:0 auto}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;margin:16px 0}
h1{font-size:24px}h2{font-size:18px;margin:0 0 4px}.m{color:var(--mid);margin:0 0 8px}fieldset{border:0;padding:0;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
legend{font-weight:600;margin-bottom:6px}input[type=text]{flex:1 1 240px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}
button{background:var(--acc);color:#fff;border:0;border-radius:6px;padding:10px 16px;font-weight:600;cursor:pointer}pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);padding:12px;border-radius:6px}
</style></head><body><main>
<h1>Phiếu chấm kiểm mù: điểm đau</h1>
<p>Mã đã khóa ở commit <b>${sha}</b> trước khi chạy trên 8 mảng này. Người làm chưa đọc câu nào của 8 mảng.
Với mỗi điểm đau, đọc cụm từ và 5 câu gốc rồi chấm. <b>Đúng</b> khi các câu nói cùng một chuyện cụ thể và giao được cho một người làm.
Chấm xong bấm "Xuất kết quả" ở cuối, chép đoạn chữ hiện ra gửi lại.</p>
<ul>${summary}</ul>
${rows || '<p>Không có điểm đau nào ở 8 mảng này.</p>'}
<button id="x">Xuất kết quả</button><pre id="o"></pre>
</main><script>
const K='blind-${sha}';const n=${points.length};
try{const s=JSON.parse(localStorage.getItem(K)||'{}');for(const [k,v] of Object.entries(s)){const el=document.querySelector('[name="'+k+'"]'+(k[0]==='q'?'[value="'+v+'"]':''));if(el){if(k[0]==='q')el.checked=true;else el.value=v;}}}catch(e){}
document.addEventListener('input',()=>{const s={};document.querySelectorAll('input').forEach(i=>{if(i.type==='radio'&&i.checked)s[i.name]=i.value;if(i.type==='text'&&i.value)s[i.name]=i.value});try{localStorage.setItem(K,JSON.stringify(s))}catch(e){}});
document.getElementById('x').onclick=()=>{const r=[];let d=0,sa=0,k=0;for(let i=0;i<n;i++){const v=(document.querySelector('[name="q'+i+'"]:checked')||{}).value||'';if(v==='dung')d++;if(v==='sai')sa++;if(v==='kchac')k++;r.push((i+1)+':'+(v||'-')+((document.querySelector('[name="n'+i+'"]')||{}).value?' ('+document.querySelector('[name="n'+i+'"]').value+')':''))}
document.getElementById('o').textContent='commit ${sha}; '+n+' điểm đau; đúng '+d+', sai '+sa+', không chắc '+k+', chưa chấm '+(n-d-sa-k)+'\\n'+r.join('\\n');};
</script></body></html>`;
  fs.writeFileSync(out, html);
  console.log(`commit ${sha}: ${points.length} điểm đau ở ${r.groups.filter((g) => g.painPoints.length).length}/${r.groups.length} mảng mù; ghi ${out}`);
})().catch((e) => { console.error('LỖI', e.message); process.exit(1); });
