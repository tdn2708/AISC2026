/**
 * KIỂM TRƯỚC GIỜ DEMO (chỉ đọc web thật, cách nhau 25 giây đúng quy tắc gọi prod)
 * ==================================================================
 * In: máy chủ có thức không, bộ nhớ, độ khựng; kho demo bao nhiêu phản hồi,
 * độ tin, độ mới; và các con số đưa lên slide. Không ghi gì vào web thật.
 *
 * Chạy: cd backend && npm run demo:check
 *        (đổi địa chỉ: API=https://... npm run demo:check)
 */
const API = (process.env.API || 'https://aisc2026-q1vx.onrender.com').replace(/\/+$/, '');
const GAP_MS = Number(process.env.GAP_MS || 25000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, headers = {}) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(120000) });
  const ms = Date.now() - t0;
  let json = null;
  try { json = await res.json(); } catch { /* không phải JSON */ }
  return { status: res.status, ms, json };
}

(async () => {
  const problems = [];
  console.log(`Kiểm ${API}\n`);

  const h = await get('/health/live');
  if (h.status !== 200) problems.push(`máy chủ trả ${h.status}`);
  else {
    const j = h.json;
    console.log(`Máy chủ: trả lời trong ${(h.ms / 1000).toFixed(1)} giây${h.ms > 15000 ? ' (vừa ngủ dậy)' : ''}, chạy được ${Math.round(j.uptimeSec / 60)} phút, bộ nhớ ${j.rssMb} MB, khựng p99 ${j.loop?.p99Ms} ms`);
    if (j.rssMb >= 450) problems.push(`bộ nhớ ${j.rssMb} MB, sát giới hạn 512 MB`);
    if (j.loop?.p99Ms >= 500) problems.push(`máy chủ khựng p99 ${j.loop.p99Ms} ms`);
  }

  await sleep(GAP_MS);
  const t = await get('/api/trust/health', { 'X-Workspace': 'demo' });
  if (t.status !== 200 || !t.json) problems.push(`không đọc được kho demo (${t.status})`);
  else {
    const j = t.json;
    console.log(`Kho demo: ${j.rawCollected?.toLocaleString('vi-VN')} phản hồi thu về, ${j.validForAnalysis?.toLocaleString('vi-VN')} được tính, độ tin ${j.dataHealthScore}/100, độ trễ thu thập ${j.ingestionLagMinutes} phút`);
    if (!j.rawCollected) problems.push('kho demo trống: chạy npm run demo:prep');
    if (j.ingestionLagMinutes > 24 * 60) problems.push('dữ liệu demo đã cũ hơn 1 ngày: dữ liệu phát lại có thể đã hết, chạy npm run demo:prep');
    console.log('\nSố cho slide:');
    console.log(`  - ${j.rawCollected?.toLocaleString('vi-VN')} phản hồi thu về, loại ${j.spamRemoved?.count} rác (${String(j.spamRemoved?.pct).replace('.', ',')}%) và ${j.inauthenticFlagged?.count} nghi đánh giá ảo`);
    console.log(`  - ${j.validForAnalysis?.toLocaleString('vi-VN')} phản hồi được tính vào chỉ số, độ tin số liệu ${j.dataHealthScore}/100`);
    console.log(`  - Đối soát được với đơn hàng: ${String(j.reconciliationRate).replace('.', ',')}%`);
  }

  console.log('\nViệc tay trước giờ demo (xem KICH-BAN-DEMO.md):');
  console.log('  1. Mở trang Livestream, mở một phiên Mô phỏng mới (kho Mô phỏng).');
  console.log('  2. Mở trang Quản gia, bấm gửi tin thử, kiểm Zalo nhận được.');
  console.log('  3. Đăng nhập sẵn trên máy chiếu, bật chế độ chủ shop.');

  if (problems.length) {
    console.log(`\nCẦN XỬ LÝ: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log('\nSẴN SÀNG: máy chủ và kho demo ổn.');
})().catch((e) => {
  console.log(`Không kiểm được: ${e.message}`);
  process.exit(1);
});
