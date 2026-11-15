/**
 * KHÓA ĐƯỜNG GHI VÀ CORS
 * ------------------------------------------------------------------
 * Trước đây ai biết địa chỉ máy chủ cũng gửi được lệnh ghi (nạp file, gán
 * nhãn, mở hồ sơ, tạo phiên live) và gọi được trợ lý tốn lượt Gemini.
 *
 * 1. Khóa ghi: mọi request không phải GET/HEAD/OPTIONS phải mang header
 *    `X-Write-Key` đúng bằng biến môi trường WRITE_KEY. Biến trống thì KHÔNG
 *    khóa (máy local, test), nên đẩy mã này lên trước khi đặt biến không làm
 *    hỏng gì.
 *    Giới hạn phải nói rõ: giao diện Vercel cũng phải gửi khóa này, nên nó nằm
 *    trong gói JS ai mở DevTools cũng đọc được. Nó chặn bot quét, script gọi
 *    bừa và người đoán địa chỉ API, không chặn người cố tình đọc mã trang.
 *    Muốn chặn hẳn thì cần đăng nhập thật với phiên ở máy chủ.
 * 2. Ngoại lệ: webhook bình luận live (`POST /api/live/sessions/:id/comments`)
 *    do hệ thống ngoài gọi, đã có khóa nhập riêng của từng phiên (ingestKey).
 * 3. CORS: chỉ trang của nhóm được đọc phản hồi trong trình duyệt. Gọi không
 *    có Origin (curl, máy chủ khác) không bị CORS chặn; việc đó do khóa ghi lo.
 */
const crypto = require('crypto');

const DEFAULT_ORIGINS = ['https://aisc-2026.vercel.app'];
// localhost và 127.0.0.1 mọi cổng (Vite 5173, 5199, bản build xem thử 4173)
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function allowedOrigins(env = process.env) {
  const extra = String(env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

/** Tùy chọn cho thư viện `cors`: origin lạ thì không gắn header cho phép */
function corsOptions(env = process.env) {
  const list = allowedOrigins(env);
  return {
    origin(origin, cb) {
      if (!origin || list.has(origin) || LOCAL_ORIGIN.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    maxAge: 600
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WEBHOOK_PATH = /^\/api\/live\/sessions\/[^/]+\/comments\/?$/;
// Đăng ký, đăng nhập, đăng xuất: có giới hạn tần suất riêng (routes/auth.js) và
// không chạm dữ liệu phân tích. Không miễn thì Vercel thiếu mã ghi là không ai vào được.
const AUTH_PATH = /^\/api\/auth\/(signup|login|logout)\/?$/;

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function writeGuard(env = process.env) {
  return (req, res, next) => {
    const key = String(env.WRITE_KEY || '');
    if (!key || SAFE_METHODS.has(req.method)) return next();
    if (req.method === 'POST' && (WEBHOOK_PATH.test(req.path) || AUTH_PATH.test(req.path))) return next();
    const sent = req.get('X-Write-Key');
    if (sent && sameSecret(sent, key)) return next();
    return res.status(401).json({ error: 'Thiếu hoặc sai mã ghi. Thao tác này chỉ chạy từ trang Customer Radar của nhóm.' });
  };
}

module.exports = { corsOptions, writeGuard, allowedOrigins, LOCAL_ORIGIN };
