/**
 * TÀI KHOẢN VÀ PHIÊN ĐĂNG NHẬP
 * ------------------------------------------------------------------
 * Lưu ở database riêng (mặc định `<MONGODB_DB>_auth`, đổi bằng MONGODB_AUTH_DB),
 * không nằm trong kho demo hay kho thật: `npm run seed` xóa và ghi lại kho demo,
 * và tài khoản không thuộc về một kho dữ liệu nào.
 *
 *   users          { email (chữ thường, duy nhất), name, shop, passwordHash, createdAt, lastLoginAt }
 *   auth_sessions  { tokenHash, userId, createdAt, expiresAt }  (chỉ mục TTL tự xóa phiên hết hạn)
 *
 * Mật khẩu băm bằng scrypt có sẵn trong Node (không thêm thư viện), muối 16 byte
 * riêng từng tài khoản, chuỗi lưu dạng `scrypt$N$r$p$muối$băm`. Phiên là chuỗi
 * ngẫu nhiên 32 byte; database chỉ giữ SHA-256 của nó, nên người đọc được
 * database cũng không dùng lại được phiên của ai.
 *
 * Các hàm băm, kiểm tra và chuẩn hóa là hàm thuần để test không cần MongoDB.
 */
const crypto = require('crypto');
const { ObjectId } = require('mongodb');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30; // "Giữ đăng nhập": 30 ngày
const SHORT_SESSION_HOURS = 12; // không giữ: phiên của tab, máy chủ vẫn giới hạn 12 giờ

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 80;
const SHOP_MAX = 120;

const DEMO_ACCOUNT = {
  email: 'demo@customerradar.vn',
  password: 'demo2026',
  name: 'Tài khoản mẫu',
  shop: 'Cửa hàng mẫu Customer Radar'
};

const normalizeEmail = (v) => String(v || '').trim().toLowerCase();
const cleanText = (v, max) => String(v || '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function scryptAsync(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (!expected.length) return false;
  const key = await scryptAsync(String(password), Buffer.from(saltB64, 'base64'), {
    N: Number(N), r: Number(r), p: Number(p), keylen: expected.length
  });
  return crypto.timingSafeEqual(key, expected);
}

/** Kiểm tra mật khẩu: trả danh sách luật chưa đạt (rỗng = đạt). Giao diện dùng cùng luật. */
function passwordProblems(password) {
  const pw = String(password || '');
  const out = [];
  if (pw.length < PASSWORD_MIN) out.push(`Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`);
  if (pw.length > PASSWORD_MAX) out.push(`Mật khẩu dài tối đa ${PASSWORD_MAX} ký tự.`);
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) out.push('Mật khẩu cần có cả chữ và số.');
  return out;
}

/**
 * Kiểm tra dữ liệu đăng ký. Trả { value } hoặc { errors: { field: message } }.
 * Lỗi viết cho người dùng: nói sai chỗ nào và sửa thế nào.
 */
function validateSignup(body = {}) {
  const name = cleanText(body.name, NAME_MAX);
  const shop = cleanText(body.shop, SHOP_MAX);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (name.length < 2) errors.name = 'Nhập họ và tên (ít nhất 2 ký tự).';
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Email chưa đúng dạng, ví dụ ten@cuahang.vn.';
  const pw = passwordProblems(password);
  if (pw.length) errors.password = pw[0];
  if (Object.keys(errors).length) return { errors };
  return { value: { name, shop, email, password } };
}

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** Thông tin tài khoản được phép gửi về trình duyệt (không bao giờ có passwordHash) */
const publicUser = (u) => (u ? {
  id: String(u._id),
  email: u.email,
  name: u.name,
  shop: u.shop || '',
  createdAt: u.createdAt,
  isDemo: u.email === DEMO_ACCOUNT.email
} : null);

async function ensureAuthIndexes(authDb) {
  await Promise.all([
    authDb.collection('users').createIndex({ email: 1 }, { unique: true }),
    authDb.collection('auth_sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    authDb.collection('auth_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    authDb.collection('auth_sessions').createIndex({ userId: 1 })
  ]);
}

/** Tài khoản mẫu cho người xem thử: tạo nếu chưa có, không bao giờ ghi đè */
async function ensureDemoAccount(authDb) {
  const users = authDb.collection('users');
  if (await users.findOne({ email: DEMO_ACCOUNT.email }, { projection: { _id: 1 } })) return false;
  await users.updateOne(
    { email: DEMO_ACCOUNT.email },
    { $setOnInsert: { email: DEMO_ACCOUNT.email, name: DEMO_ACCOUNT.name, shop: DEMO_ACCOUNT.shop, passwordHash: await hashPassword(DEMO_ACCOUNT.password), createdAt: new Date(), lastLoginAt: null } },
    { upsert: true }
  );
  return true;
}

async function createUser(authDb, { name, shop, email, password }) {
  const doc = { email, name, shop, passwordHash: await hashPassword(password), createdAt: new Date(), lastLoginAt: null };
  try {
    const r = await authDb.collection('users').insertOne(doc);
    return { user: { ...doc, _id: r.insertedId } };
  } catch (e) {
    if (e && e.code === 11000) return { taken: true };
    throw e;
  }
}

async function findByEmail(authDb, email) {
  return authDb.collection('users').findOne({ email: normalizeEmail(email) });
}

async function createSession(authDb, userId, { remember = true } = {}) {
  const token = newToken();
  const now = new Date();
  const ms = remember ? SESSION_DAYS * 864e5 : SHORT_SESSION_HOURS * 36e5;
  await authDb.collection('auth_sessions').insertOne({ tokenHash: hashToken(token), userId: new ObjectId(String(userId)), createdAt: now, expiresAt: new Date(now.getTime() + ms) });
  return { token, expiresAt: new Date(now.getTime() + ms) };
}

/** Đọc token từ header `Authorization: Bearer <token>` */
function bearerToken(req) {
  const h = String(req.get('Authorization') || '');
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(h.trim());
  return m ? m[1] : null;
}

async function sessionUser(authDb, token) {
  if (!token) return null;
  const s = await authDb.collection('auth_sessions').findOne({ tokenHash: hashToken(token) });
  // TTL của MongoDB chạy mỗi phút: phiên vừa hết hạn có thể còn trong collection
  if (!s || s.expiresAt <= new Date()) return null;
  const user = await authDb.collection('users').findOne({ _id: s.userId });
  return user ? { user, session: s } : null;
}

async function endSession(authDb, token) {
  if (!token) return 0;
  const r = await authDb.collection('auth_sessions').deleteOne({ tokenHash: hashToken(token) });
  return r.deletedCount;
}

module.exports = {
  DEMO_ACCOUNT,
  PASSWORD_MIN,
  NAME_MAX,
  SHOP_MAX,
  normalizeEmail,
  cleanText,
  hashPassword,
  verifyPassword,
  passwordProblems,
  validateSignup,
  hashToken,
  publicUser,
  ensureAuthIndexes,
  ensureDemoAccount,
  createUser,
  findByEmail,
  createSession,
  bearerToken,
  sessionUser,
  endSession
};
