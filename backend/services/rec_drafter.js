/**
 * ĐỀ XUẤT CỤ THỂ DO MÔ HÌNH VIẾT, MÁY KIỂM TRƯỚC KHI HIỆN
 * ==================================================================
 * Kế hoạch do luật (recommender.js) chọn từ thư viện mẫu nên đúng nhưng chung.
 * Với cảnh báo Nghiêm trọng / Cao, mô hình ngôn ngữ được đưa GÓI BẰNG CHỨNG
 * thật (số liệu cảnh báo, chiều dữ liệu đang trội, doanh thu rủi ro, vài câu
 * khách viết nguyên văn, các bước luật đã chọn) và viết tối đa 3 việc cụ thể.
 *
 * Bản viết chỉ được hiện khi qua đủ cổng kiểm:
 *   1. đúng khuôn JSON, 1 đến 3 việc, mỗi việc ngắn
 *   2. mọi con số (từ 2 chữ số) phải có trong gói bằng chứng
 *   3. không nêu tên sản phẩm / khu vực / kênh nào ngoài gói bằng chứng
 *   4. không tự nhận đã làm, không hứa tự động thực hiện
 * Trượt một cổng là bỏ cả bản, giao diện chỉ hiện kế hoạch của luật.
 *
 * Chạy nền, không bắt API chờ; nhớ theo (kho, cảnh báo, phiên bản dữ liệu);
 * giới hạn số lượt gọi mỗi giờ vì Gemini miễn phí dùng chung 500 lượt/ngày.
 */
const { verifyNumericGrounding } = require('./recommender');

const MAX_CALLS_PER_HOUR = Number(process.env.REC_DRAFT_MAX_PER_HOUR) || 12;
const MAX_PER_REQUEST = 3;
const cache = new Map(); // key -> { status: 'ready'|'pending'|'rejected'|'failed', draft, reason, at }
const calls = [];

const SEVERE = new Set(['Critical', 'High']);

function normNum(n) {
  return String(n).replace(/[.,\s]/g, '');
}

/** Mọi con số xuất hiện trong một chuỗi, ở dạng đã bỏ dấu phân cách */
function numbersIn(text) {
  return (String(text || '').match(/\d[\d.,]*/g) || []).map((x) => x.replace(/[.,]+$/, ''));
}

/** Gói bằng chứng gửi cho mô hình, cũng là tập dữ kiện để kiểm bản viết */
function buildPack(rec, alert, ctx) {
  const st = alert.statistics || {};
  const pct = (v) => (v == null ? null : `${(v * 100).toFixed(1).replace('.', ',')}%`);
  const lines = [];
  lines.push(`Cảnh báo: ${alert.categoryLabel || alert.category}${alert.causeLabel ? `: ${alert.causeLabel}` : ''}${alert.productName ? `, sản phẩm ${alert.productName}` : ''}${alert.region ? `, khu vực ${alert.region}` : ''}. Mức: ${alert.severityVi || alert.severity}.`);
  if (st.baselineRate != null && st.currentRate != null) lines.push(`Tỉ lệ khiếu nại tăng từ ${pct(st.baselineRate)} lên ${pct(st.currentRate)}.`);
  if (alert.affectedCustomers != null) lines.push(`Khách bị ảnh hưởng ước tính: ${alert.affectedCustomers}.`);
  if (rec.evidence?.evidenceCount != null) lines.push(`Số phản hồi làm bằng chứng: ${rec.evidence.evidenceCount}.`);
  for (const f of rec.dataProfile?.facts || []) lines.push(f.text.replace(/, z = [^)]*\)/, ')'));
  const rev = rec.dataProfile?.slots?.revenue;
  if (rev) lines.push(`Doanh thu chịu rủi ro: ${rev}.`);
  if (alert.owner) lines.push(`Bộ phận phụ trách: ${alert.owner}.`);
  const steps = (rec.steps || []).slice(0, 4).map((s, i) => `${i + 1}. ${s.text}`);

  const ids = new Set((alert.evidenceIds || []).map(String));
  const quotes = [];
  for (const f of ctx.items || []) {
    if (quotes.length >= 6) break;
    if (ids.has(String(f._id)) && f.originalText) quotes.push(String(f.originalText).replace(/\s+/g, ' ').slice(0, 160));
  }

  const factText = [...lines, ...steps, ...quotes].join('\n');
  const allowedNumbers = new Set(numbersIn(factText).map(normNum));
  // Thêm vài dạng hay gặp của cùng con số: phần trăm làm tròn, số lần
  for (const f of rec.dataProfile?.facts || []) for (const n of f.numbers || []) if (n != null) allowedNumbers.add(normNum(Math.round(Number(n))));
  for (let i = 1; i <= 10; i += 1) allowedNumbers.add(String(i)); // đếm bước, ngày ngắn

  const mentioned = (v) => v && factText.includes(v);
  const entityPool = (field) => [...new Set((ctx.items || []).map((f) => f[field]).filter(Boolean))];
  const forbidden = [
    ...entityPool('productName').filter((v) => !mentioned(v)),
    ...entityPool('region').filter((v) => !mentioned(v) && v.length > 3),
    ...entityPool('source').filter((v) => !mentioned(v) && v.length > 3)
  ];

  return { lines, steps, quotes, factText, allowedNumbers: [...allowedNumbers], forbidden };
}

function buildPrompt(pack) {
  return [
    'Bạn là trưởng vận hành của một cửa hàng bán online ở Việt Nam. Dựa CHỈ trên dữ kiện dưới đây, viết tối đa 3 việc cụ thể nên làm ngay để xử lý cảnh báo.',
    'Quy tắc bắt buộc:',
    '- Chỉ dùng con số, tên sản phẩm, khu vực, kênh có trong DỮ KIỆN. Không bịa số, không ước lượng thêm.',
    '- Mỗi việc là một câu mệnh lệnh ngắn (dưới 200 ký tự), nói rõ làm gì, với ai hoặc ở đâu.',
    '- Có thể gộp, cụ thể hoá hoặc sắp lại các BƯỚC LUẬT ĐÃ CHỌN; không đề xuất việc trái với chúng.',
    '- Không nói hệ thống đã làm hay sẽ tự làm. Việc tốn tiền hoặc liên hệ khách thì ghi "cần duyệt".',
    '- Trả về đúng JSON, không thêm chữ nào khác: {"actions":[{"text":"...","why":"..."}]}. "why" dẫn đúng dữ kiện đã dùng.',
    '',
    'DỮ KIỆN:',
    ...pack.lines,
    '',
    'BƯỚC LUẬT ĐÃ CHỌN:',
    ...pack.steps,
    '',
    'KHÁCH VIẾT NGUYÊN VĂN:',
    ...pack.quotes.map((q) => `- "${q}"`)
  ].join('\n');
}

const FORBIDDEN_CLAIMS = /(đã (thực hiện|gửi|hoàn tiền|liên hệ|xử lý xong)|hệ thống (sẽ )?tự (động )?(làm|gửi|hoàn|thực hiện)|tự động hoàn tiền)/i;

/** Các cổng kiểm. Trả { ok, draft } hoặc { ok: false, reason } */
function verifyDraft(raw, pack) {
  let obj;
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    obj = JSON.parse(m ? m[0] : raw);
  } catch {
    return { ok: false, reason: 'không đúng khuôn JSON' };
  }
  const actions = Array.isArray(obj?.actions) ? obj.actions : [];
  if (!actions.length || actions.length > 3) return { ok: false, reason: `số việc ${actions.length}` };
  const clean = [];
  for (const a of actions) {
    const text = String(a?.text || '').trim();
    const why = String(a?.why || '').trim();
    if (!text || text.length > 260 || why.length > 300) return { ok: false, reason: 'việc rỗng hoặc quá dài' };
    const whole = `${text} ${why}`;
    const g = verifyNumericGrounding(whole, pack.allowedNumbers);
    if (!g.grounded) return { ok: false, reason: `số không có trong bằng chứng: ${g.ungrounded.slice(0, 3).join(', ')}` };
    const stray = pack.forbidden.find((name) => whole.includes(name));
    if (stray) return { ok: false, reason: `nêu "${stray}" không có trong bằng chứng` };
    if (FORBIDDEN_CLAIMS.test(whole)) return { ok: false, reason: 'tự nhận đã làm hoặc hứa tự động làm' };
    clean.push({ text, why });
  }
  return { ok: true, draft: { actions: clean } };
}

function budgetLeft(now = Date.now()) {
  while (calls.length && now - calls[0] > 3600 * 1000) calls.shift();
  return MAX_CALLS_PER_HOUR - calls.length;
}

async function generate(key, rec, alert, ctx, synth) {
  const pack = buildPack(rec, alert, ctx);
  calls.push(Date.now());
  try {
    const out = await synth(buildPrompt(pack));
    if (!out?.text) {
      cache.set(key, { status: 'failed', reason: 'không gọi được mô hình', at: Date.now() });
      return;
    }
    const v = verifyDraft(out.text, pack);
    cache.set(key, v.ok
      ? { status: 'ready', draft: { ...v.draft, provider: out.provider }, at: Date.now() }
      : { status: 'rejected', reason: v.reason, at: Date.now() });
    if (!v.ok) console.warn(`[ĐỀ XUẤT AI] Loại bản viết cho ${alert.id}: ${v.reason}`);
  } catch (e) {
    cache.set(key, { status: 'failed', reason: e.message, at: Date.now() });
  }
}

/**
 * Gắn bản viết đã kiểm vào các khuyến nghị nặng; chưa có thì bắt đầu viết ở
 * nền (trong ngân sách) và trả trạng thái "pending". Không bao giờ chờ mô hình.
 */
function attachDrafts(recs, alertById, ctx, { dbName = '', synth } = {}) {
  const doSynth = synth || ((p) => require('./chat_engine').synthesize(p));
  let started = 0;
  for (const rec of recs) {
    const alert = alertById.get(rec.alertId);
    if (!alert || !SEVERE.has(alert.severity) || !rec.steps?.length) continue;
    const key = `${dbName}|${rec.alertId}|${ctx.computedAt || ''}`;
    const hit = cache.get(key);
    if (hit?.status === 'ready') {
      rec.aiDraft = hit.draft;
      continue;
    }
    if (hit) {
      rec.aiDraftStatus = hit.status;
      continue;
    }
    if (started < MAX_PER_REQUEST && budgetLeft() > 0) {
      started += 1;
      cache.set(key, { status: 'pending', at: Date.now() });
      rec.aiDraftStatus = 'pending';
      generate(key, rec, alert, ctx, doSynth);
    }
  }
  if (cache.size > 300) {
    const old = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 200);
    for (const [k] of old) cache.delete(k);
  }
  return recs;
}

module.exports = { attachDrafts, buildPack, buildPrompt, verifyDraft, _cache: cache };
