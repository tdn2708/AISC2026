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
const { saltReady } = require('./pii_salt');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30; // "Giữ đăng nhập": 30 ngày
const SHORT_SESSION_HOURS = 12; // không giữ: phiên của tab, máy chủ vẫn giới hạn 12 giờ
const ADMIN_SESSION_HOURS = 8; // phiên quản trị luôn hết hạn sau 8 giờ, không có "giữ đăng nhập"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const ADMIN_PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const NAME_MAX = 80;
const SHOP_MAX = 120;
const UA_MAX = 160;
const ADMIN_AUDIT_TTL_SECONDS = 180 * 86400; // giữ nhật ký quản trị tối đa 180 ngày

const ADMIN_AUDIT_ACTIONS = new Set([
  'login',
  'lock',
  'unlock',
  'revoke_sessions',
  'revoke_session',
  'reset_password',
  'set_role',
  'delete_user'
]);

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

const roleOf = (u) => (u && u.role === 'admin' ? 'admin' : 'user');
const isLocked = (u) => Boolean(u && u.status === 'locked');

/** Thông tin tài khoản được phép gửi về trình duyệt (không bao giờ có passwordHash) */
const publicUser = (u) => (u ? {
  id: String(u._id),
  email: u.email,
  name: u.name,
  shop: u.shop || '',
  role: roleOf(u),
  status: isLocked(u) ? 'locked' : 'active',
  mustChangePassword: Boolean(u.mustChangePassword),
  createdAt: u.createdAt,
  isDemo: u.email === DEMO_ACCOUNT.email
} : null);

async function ensureAuthIndexes(authDb) {
  await Promise.all([
    authDb.collection('users').createIndex({ email: 1 }, { unique: true }),
    authDb.collection('auth_sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    authDb.collection('auth_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    authDb.collection('auth_sessions').createIndex({ userId: 1 }),
    authDb.collection('admin_audit').createIndex({ at: 1 }, { expireAfterSeconds: ADMIN_AUDIT_TTL_SECONDS }),
    authDb.collection('admin_audit').createIndex({ targetId: 1, at: -1 })
  ]);
}

const warnAdmin = (msg) => {
  console.warn(msg);
  return null;
};

/** Tài khoản mẫu cho người xem thử: tạo nếu chưa có, không bao giờ ghi đè */
async function ensureDemoAccount(authDb) {
  const users = authDb.collection('users');
  if (await users.findOne({ email: DEMO_ACCOUNT.email }, { projection: { _id: 1 } })) return false;
  await users.updateOne(
    { email: DEMO_ACCOUNT.email },
    {
      $setOnInsert: {
        email: DEMO_ACCOUNT.email,
        name: DEMO_ACCOUNT.name,
        shop: DEMO_ACCOUNT.shop,
        passwordHash: await hashPassword(DEMO_ACCOUNT.password),
        role: 'user',
        status: 'active',
        lockedAt: null,
        lockedReason: null,
        lockedBy: null,
        mustChangePassword: false,
        passwordChangedAt: null,
        createdAt: new Date(),
        lastLoginAt: null
      }
    },
    { upsert: true }
  );
  return true;
}

/**
 * Tài khoản quản trị máy chủ từ biến môi trường.
 * Không lưu mật khẩu quản trị trong mã nguồn; không bao giờ in mật khẩu ra log.
 */
async function ensureAdminAccount(authDb, env = process.env) {
  const rawEmail = env && typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL : '';
  const password = env && typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';
  if (!rawEmail.trim() && !password) return null;
  if (!rawEmail.trim() || !password) {
    return warnAdmin('Tài khoản quản trị: cần đặt cả ADMIN_EMAIL lẫn ADMIN_PASSWORD, đang thiếu một biến nên bỏ qua.');
  }

  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return warnAdmin('Tài khoản quản trị: email cấu hình chưa đúng định dạng, bỏ qua.');
  }
  if (email === DEMO_ACCOUNT.email) {
    return warnAdmin('Tài khoản quản trị: không được dùng email của tài khoản mẫu, bỏ qua.');
  }
  if (password.length < ADMIN_PASSWORD_MIN || passwordProblems(password).length > 0) {
    return warnAdmin(`Tài khoản quản trị: mật khẩu cần ít nhất ${ADMIN_PASSWORD_MIN} ký tự có cả chữ và số, bỏ qua.`);
  }

  const users = authDb.collection('users');
  const existing = await users.findOne({ email });
  const resetPassword = String(env.ADMIN_PASSWORD_RESET) === '1';

  if (existing) {
    const patch = { role: 'admin', status: 'active' };
    if (isLocked(existing)) {
      patch.lockedAt = null;
      patch.lockedReason = null;
      patch.lockedBy = null;
    }
    if (resetPassword) {
      patch.passwordHash = await hashPassword(password);
      patch.passwordChangedAt = new Date();
      patch.mustChangePassword = false;
    }
    await users.updateOne({ _id: existing._id }, { $set: patch });
    if (resetPassword) {
      await authDb.collection('auth_sessions').deleteMany({ userId: existing._id });
    }
    forgetUser(existing._id);
    return { email, created: false, passwordReset: resetPassword };
  }

  const doc = {
    email,
    name: 'Quản trị máy chủ',
    shop: '',
    passwordHash: await hashPassword(password),
    role: 'admin',
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lockedBy: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    createdAt: new Date(),
    lastLoginAt: null
  };
  await users.updateOne({ email }, { $setOnInsert: doc }, { upsert: true });
  return { email, created: true, passwordReset: false };
}

async function createUser(authDb, { name, shop, email, password }) {
  const doc = {
    email,
    name,
    shop,
    passwordHash: await hashPassword(password),
    role: 'user',
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lockedBy: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    createdAt: new Date(),
    // Đăng ký xong là đăng nhập luôn (routes/auth.js tạo phiên ngay), nên đây là lần đăng nhập đầu
    lastLoginAt: new Date()
  };
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

/** Băm IP bằng muối bí mật nếu có, cắt 12 ký tự; không bao giờ lưu IP thô */
function hashIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw || !saltReady()) return null;
  return crypto.createHash('sha256').update(`${raw}${process.env.PII_SALT}`).digest('hex').slice(0, 12);
}

/** Tạo phiên cho `user` (cả bản ghi người dùng, để ghi luôn vào bộ đệm: trang đầu sau đăng nhập không phải đọc lại) */
async function createSession(authDb, user, { remember: keep = true, admin = false, ua = '', ip = '' } = {}) {
  const token = newToken();
  const now = new Date();
  const isAdminSession = Boolean(admin);
  const ms = isAdminSession
    ? ADMIN_SESSION_HOURS * 36e5
    : (keep ? SESSION_DAYS * 864e5 : SHORT_SESSION_HOURS * 36e5);
  const session = {
    tokenHash: hashToken(token),
    userId: new ObjectId(String(user._id)),
    kind: isAdminSession ? 'admin' : 'user',
    ua: cleanText(ua, UA_MAX),
    ipHash: hashIp(ip),
    createdAt: now,
    expiresAt: new Date(now.getTime() + ms)
  };
  await authDb.collection('auth_sessions').insertOne(session);
  remember(session.tokenHash, user, session);
  return { token, expiresAt: session.expiresAt };
}

/** Đọc token từ header `Authorization: Bearer <token>` */
function bearerToken(req) {
  const h = String(req.get('Authorization') || '');
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Bộ nhớ đệm phiên: một lần mở Tổng quan gọi khoảng 10 API, mỗi API mà đọc
 * Mongo hai lần (phiên + người dùng) thì chậm thấy rõ trên Render. Giữ 60 giây
 * trong tiến trình (Render chạy một tiến trình); đăng xuất và sửa hồ sơ xóa ngay.
 */
// Đo 16/11 (local, Atlas): mở Tổng quan bắn khoảng 12 API cùng lúc; khi chưa có bộ đệm, mỗi API
// tự đọc phiên hai lần và cả loạt mất 1.860 ms (driver mở thêm kết nối), có bộ đệm còn 11 ms.
// Nên: đăng nhập, đăng ký ghi phiên vào bộ đệm ngay (remember); request trùng token dùng chung
// MỘT lượt đọc (inflight); giữ 5 phút. Đăng xuất, sửa hồ sơ xóa ngay, nên không phải chờ hết 5 phút.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // tokenHash -> { user, session, at }
const inflight = new Map(); // tokenHash -> Promise đang đọc

const remember = (key, user, session) => {
  if (cache.size > 5000) cache.clear();
  cache.set(key, { user, session, at: Date.now() });
};

const forgetUser = (userId) => {
  for (const [k, v] of cache) if (String(v.user._id) === String(userId)) cache.delete(k);
};

async function lookupSession(authDb, key) {
  const s = await authDb.collection('auth_sessions').findOne({ tokenHash: key });
  // TTL của MongoDB chạy mỗi phút: phiên vừa hết hạn có thể còn trong collection
  if (!s || s.expiresAt <= new Date()) {
    cache.delete(key);
    return null;
  }
  const user = await authDb.collection('users').findOne({ _id: s.userId });
  if (!user || isLocked(user)) {
    cache.delete(key);
    return null;
  }
  remember(key, user, s);
  return { user, session: s };
}

async function sessionUser(authDb, token) {
  if (!token) return null;
  const key = hashToken(token);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS && hit.session.expiresAt.getTime() > now) {
    if (isLocked(hit.user)) {
      cache.delete(key);
      return null;
    }
    return { user: hit.user, session: hit.session };
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = lookupSession(authDb, key).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function endSession(authDb, token) {
  if (!token) return 0;
  cache.delete(hashToken(token));
  const r = await authDb.collection('auth_sessions').deleteOne({ tokenHash: hashToken(token) });
  return r.deletedCount;
}

/**
 * API DỮ LIỆU CẦN ĐĂNG NHẬP
 * Mọi /api/* phải có phiên, trừ:
 *   /api/auth/*                              đăng ký, đăng nhập (router riêng tự kiểm)
 *   GET  /api/trust/health                   chỉ số tổng hợp của sổ đối chiếu, không câu chữ, không tên;
 *                                            trang giới thiệu và khối mực ở trang đăng nhập cần nó
 *   POST /api/live/sessions/:id/comments     webhook của hệ thống ngoài, đã có khóa nhập của phiên
 *   POST /api/butler/zalo/webhook            webhook của Zalo Bot Platform, tự kiểm X-Bot-Api-Secret-Token
 * EventSource và liên kết tải file không gửi được header, nên riêng GET luồng
 * live và xuất file nhận token qua `?access_token=`.
 * Đặt AUTH_REQUIRED=0 để tắt (chạy thử cục bộ không cần đăng nhập).
 */
const PUBLIC = [
  [null, /^\/api\/auth(\/|$)/],
  ['GET', /^\/api\/trust\/health\/?$/],
  ['POST', /^\/api\/live\/sessions\/[^/]+\/comments\/?$/],
  ['POST', /^\/api\/butler\/zalo\/webhook\/?$/]
];
const QUERY_TOKEN_PATH = /^\/api\/live\/sessions\/[^/]+\/(stream|export)\/?$/;

function isPublicApi(method, path) {
  if (method === 'OPTIONS') return true;
  return PUBLIC.some(([m, re]) => (!m || m === method || (m === 'GET' && method === 'HEAD')) && re.test(path));
}

/** Token của request: header Bearer; riêng luồng live và xuất file thì cả ?access_token= */
function requestToken(req, path) {
  const fromHeader = bearerToken(req);
  if (fromHeader) return fromHeader;
  if (req.method === 'GET' && QUERY_TOKEN_PATH.test(path)) {
    const q = String(req.query?.access_token || '');
    if (/^[A-Za-z0-9_-]{20,200}$/.test(q)) return q;
  }
  return null;
}

function requireSession(authDb, env = process.env) {
  return async (req, res, next) => {
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    // Phần quản trị luôn cần phiên thật, không bị bỏ qua khi AUTH_REQUIRED=0
    if (String(env.AUTH_REQUIRED) === '0' && !/^\/api\/admin(\/|$)/.test(path)) return next();
    if (isPublicApi(req.method, path)) return next();
    try {
      const found = await sessionUser(authDb, requestToken(req, path));
      if (!found) return res.status(401).json({ error: 'Cần đăng nhập để xem dữ liệu này.', code: 'auth_required' });
      req.user = found.user;
      req.session = found.session;
      // Mật khẩu tạm do quản trị viên cấp: chưa đổi thì chỉ dùng được /api/auth/* (đổi mật khẩu, đăng xuất, /me).
      // Chặn ở máy chủ chứ không chỉ ở hộp thoại, để gọi API thẳng bằng mật khẩu tạm cũng không dùng được.
      if (found.user.mustChangePassword) {
        return res.status(403).json({ error: 'Cần đặt mật khẩu mới trước khi dùng tiếp.', code: 'password_change_required' });
      }
      // Nhật ký (quyết định, nhãn duyệt, câu trả lời live) ghi tên tài khoản thật, không tin tên trình duyệt gửi
      if (req.body && typeof req.body === 'object' && typeof req.body.by === 'string') req.body.by = found.user.name;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Chỉ cho phép tài khoản có vai trò quản trị đi qua; luôn chặn dù AUTH_REQUIRED=0 */
function requireAdmin(req, res, next) {
  if (!req.user || isLocked(req.user)) {
    return res.status(401).json({ error: 'Cần đăng nhập để xem dữ liệu này.', code: 'auth_required' });
  }
  if (roleOf(req.user) !== 'admin') {
    return res.status(403).json({ error: 'Tài khoản này không có quyền quản trị.', code: 'admin_required' });
  }
  return next();
}

module.exports = {
  DEMO_ACCOUNT,
  PASSWORD_MIN,
  ADMIN_PASSWORD_MIN,
  ADMIN_SESSION_HOURS,
  ADMIN_AUDIT_ACTIONS,
  NAME_MAX,
  SHOP_MAX,
  normalizeEmail,
  cleanText,
  hashPassword,
  verifyPassword,
  passwordProblems,
  validateSignup,
  hashToken,
  hashIp,
  roleOf,
  isLocked,
  publicUser,
  ensureAuthIndexes,
  ensureDemoAccount,
  ensureAdminAccount,
  createUser,
  findByEmail,
  createSession,
  bearerToken,
  sessionUser,
  endSession,
  forgetUser,
  isPublicApi,
  requestToken,
  requireSession,
  requireAdmin
};
