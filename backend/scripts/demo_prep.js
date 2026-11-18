/**
 * CHUẨN BỊ DEMO: nạp kho demo đúng ngày giờ demo rồi kiểm web thật
 * ==================================================================
 * GHI ĐÈ kho demo trên Atlas dùng chung với web thật (giữ phản hồi thu thập
 * thật và các phiên live). Phải gõ --yes mới chạy.
 *
 *   cd backend && npm run demo:prep -- --anchor=2026-12-10T09:00:00+07:00 --yes
 *
 * Các sự cố cài sẵn rơi đúng vào hôm demo (--anchor), có 30 ngày phát lại sau đó.
 * Xong thì chạy demo_check.js (chỉ đọc).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const anchor = (args.find((a) => a.startsWith('--anchor=')) || '').slice('--anchor='.length);
if (!args.includes('--yes')) {
  console.log('Lệnh này ghi đè kho demo của web thật. Chạy lại kèm --yes nếu chắc chắn.');
  console.log('Ví dụ: npm run demo:prep -- --anchor=2026-12-10T09:00:00+07:00 --yes');
  process.exit(1);
}
if (anchor && Number.isNaN(new Date(anchor).getTime())) {
  console.log(`--anchor không phải ngày hợp lệ: ${anchor}`);
  process.exit(1);
}
const db = process.env.MONGODB_DB || 'customer_radar';
console.log(`Nạp lại kho ${db}${anchor ? `, mốc demo ${anchor}` : ''}...`);
const seed = spawnSync(process.execPath, ['seed_realistic_data.js', ...(anchor ? [`--anchor=${anchor}`] : [])], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status || 1);

console.log('\nĐợi máy chủ nhận dữ liệu mới (khoảng 1 phút) rồi kiểm...');
setTimeout(() => {
  const check = spawnSync(process.execPath, [path.join(__dirname, 'demo_check.js')], { stdio: 'inherit' });
  process.exit(check.status || 0);
}, 60000);
