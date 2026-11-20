/**
 * DỊCH VỤ QUẢN TRỊ MÁY CHỦ VÀ SỔ TÀI KHOẢN
 * ==================================================================
 * Tách phần luật thuần (guard, tempPassword, adminUserRow, sessionRow,
 * parseListQuery, escapeRe) để kiểm thử không cần MongoDB, và phần thao tác
 * cơ sở dữ liệu (audit, countAdmins, revokeAll, deleteUserCascade).
 */
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const auth = require('./auth');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // bỏ O, I
const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // bỏ o, l
const DIGITS = '23456789'; // bỏ 0, 1
const ALPHABET = UPPER + LOWER + DIGITS;
const TEMP_PASSWORD_LEN = 14;

const VALID_STATUS = new Set(['all', 'active', 'locked', 'admin']);
const VALID_SORT = new Set(['lastLogin', 'created', 'email']);
const SELF_FORBIDDEN_ACTIONS = new Set(['lock', 'delete_user', 'set_role']);
const DEMO_ALLOWED_ACTIONS = new Set(['revoke_sessions', 'revoke_session']);
const LAST_ADMIN_ACTIONS = new Set(['set_role', 'delete_user', 'lock']);
const SECRET_KEYS = new Set(['password', 'tempPassword', 'passwordHash', 'token', 'tokenHash', 'current', 'next']);

/** Thoát ký tự đặc biệt trước khi đưa chuỗi người dùng vào biểu thức chính quy */
function escapeRe(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Chốt chặn nghiệp vụ quản trị (hàm thuần).
 * Trả `null` khi được phép, hoặc chuỗi tiếng Việt nêu lý do từ chối.
 */
function guard(actor, target, action, { adminCount = 1 } = {}) {
  if (!target) return 'Không tìm thấy tài khoản.';
  if (target.email === auth.DEMO_ACCOUNT.email && !DEMO_ALLOWED_ACTIONS.has(action)) {
    return 'Tài khoản mẫu dùng chung nên không đổi được.';
  }
  if (actor && String(actor._id) === String(target._id) && SELF_FORBIDDEN_ACTIONS.has(action)) {
    return 'Không tự khóa, tự xóa hay tự đổi vai trò của chính mình.';
  }
  if (auth.roleOf(target) === 'admin' && LAST_ADMIN_ACTIONS.has(action) && Number(adminCount) <= 1) {
    return 'Phải còn ít nhất một quản trị viên.';
  }
  return null;
}

/**
 * Sinh mật khẩu tạm 14 ký tự bằng crypto.randomInt:
 * bỏ ký tự dễ nhầm (0 O o 1 l I), luôn có chữ hoa, chữ thường và số, luôn qua passwordProblems.
 */
function tempPassword() {
  const chars = [
    UPPER[crypto.randomInt(0, UPPER.length)],
    LOWER[crypto.randomInt(0, LOWER.length)],
    DIGITS[crypto.randomInt(0, DIGITS.length)]
  ];
  while (chars.length < TEMP_PASSWORD_LEN) {
    chars.push(ALPHABET[crypto.randomInt(0, ALPHABET.length)]);
  }
  // Trộn Fisher-Yates bằng crypto.randomInt
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

/** Bản ghi một dòng tài khoản gửi về bàn quản trị (không bao giờ có passwordHash) */
function adminUserRow(u, { sessions = 0, zaloLinked = false } = {}) {
  if (!u) return null;
  return {
    id: String(u._id),
    email: u.email,
    name: u.name || '',
    shop: u.shop || '',
    role: auth.roleOf(u),
    status: auth.isLocked(u) ? 'locked' : 'active',
    isDemo: u.email === auth.DEMO_ACCOUNT.email,
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null,
    lockedAt: u.lockedAt || null,
    lockedReason: u.lockedReason || null,
    sessions: Number(sessions) || 0,
    zaloLinked: Boolean(zaloLinked),
    mustChangePassword: Boolean(u.mustChangePassword)
  };
}

/** Bản ghi một phiên đăng nhập gửi về ngăn kéo (không bao giờ có tokenHash) */
function sessionRow(s, currentTokenHash = null) {
  if (!s) return null;
  return {
    id: String(s._id),
    kind: s.kind === 'admin' ? 'admin' : 'user',
    ua: s.ua || '',
    createdAt: s.createdAt || null,
    expiresAt: s.expiresAt || null,
    current: Boolean(currentTokenHash && s.tokenHash === currentTokenHash)
  };
}

/** Chuẩn hóa tham số lọc và phân trang danh sách tài khoản */
function parseListQuery(q = {}) {
  const rawQ = String(q?.q ?? '').trim().slice(0, 80);
  const status = VALID_STATUS.has(q?.status) ? q.status : 'all';
  const sort = VALID_SORT.has(q?.sort) ? q.sort : 'lastLogin';
  const pageNum = Math.trunc(Number(q?.page));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
  const limitNum = Math.trunc(Number(q?.limit));
  const limit = Number.isFinite(limitNum) && limitNum > 0
    ? Math.min(50, Math.max(10, limitNum))
    : 20;
  return {
    q: rawQ,
    qEscaped: escapeRe(rawQ),
    status,
    sort,
    page,
    limit
  };
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const clean = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SECRET_KEYS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}

function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  const s = String(id || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return null;
  return new ObjectId(s);
}

/** Ghi một dòng vào nhật ký quản trị `admin_audit` (không bao giờ ghi mật khẩu hay token) */
async function audit(authDb, req, action, target = null, detail = {}, ok = true) {
  if (!auth.ADMIN_AUDIT_ACTIONS.has(action)) {
    throw new Error(`Hành động nhật ký không hợp lệ: ${action}`);
  }
  const doc = {
    at: new Date(),
    adminId: req?.user?._id ? toObjectId(req.user._id) || req.user._id : null,
    adminEmail: req?.user?.email || '',
    action,
    targetId: target?._id ? toObjectId(target._id) || target._id : null,
    targetEmail: target?.email || null,
    detail: sanitizeDetail(detail),
    ok: Boolean(ok)
  };
  await authDb.collection('admin_audit').insertOne(doc);
  return doc;
}

/** Đếm số quản trị viên đang hoạt động (không bị khóa) */
async function countAdmins(authDb) {
  return authDb.collection('users').countDocuments({ role: 'admin', status: { $ne: 'locked' } });
}

/** Xóa toàn bộ phiên của một tài khoản (tùy chọn giữ lại phiên hiện tại) và xóa khỏi bộ đệm */
async function revokeAll(authDb, userId, { exceptHash = null } = {}) {
  const uid = toObjectId(userId);
  if (!uid) return 0;
  const filter = { userId: uid };
  if (exceptHash) filter.tokenHash = { $ne: exceptHash };
  const r = await authDb.collection('auth_sessions').deleteMany(filter);
  auth.forgetUser(uid);
  return r.deletedCount || 0;
}

/**
 * Xóa tài khoản cùng phiên và dữ liệu quản gia theo userId trong authDb.
 * Không xóa butler_incidents (theo kho) và không đụng kho dữ liệu phản hồi của shop.
 */
async function deleteUserCascade(authDb, userId) {
  const uid = toObjectId(userId);
  if (!uid) return;
  await Promise.all([
    authDb.collection('users').deleteOne({ _id: uid }),
    authDb.collection('auth_sessions').deleteMany({ userId: uid }),
    authDb.collection('butler_links').deleteMany({ userId: uid }),
    authDb.collection('butler_messages').deleteMany({ userId: uid }),
    authDb.collection('butler_outbox').deleteMany({ userId: uid }),
    authDb.collection('butler_link_codes').deleteMany({ userId: uid }),
    authDb.collection('butler_pending').deleteOne({ _id: String(uid) })
  ]);
  auth.forgetUser(uid);
}

module.exports = {
  escapeRe,
  guard,
  tempPassword,
  adminUserRow,
  sessionRow,
  parseListQuery,
  toObjectId,
  audit,
  countAdmins,
  revokeAll,
  deleteUserCascade
};
