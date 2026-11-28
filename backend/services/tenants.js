/**
 * TÁCH DỮ LIỆU TỪNG SHOP
 * ==================================================================
 * Trước bản này mọi tài khoản dùng chung hai kho (demo, real): một shop mới đăng
 * ký đọc được toàn bộ đánh giá, đơn hàng và quyết định của shop khác (kiểm thử
 * 24/11). Nay:
 *
 *  - Tài khoản mẫu (demo@customerradar.vn) giữ hai kho chung như cũ: kho mô phỏng
 *    và kho thật trưng bày (đánh giá Tiki tự thu thập). Kịch bản demo không đổi.
 *  - Mọi tài khoản khác có KHO THẬT RIÊNG: database `cr_t_<mã tài khoản>` (dbNameFor),
 *    tạo khi dùng lần đầu. Đánh giá, đơn, quyết định, hồ sơ, phiên live của shop
 *    nằm trong đó và chỉ tài khoản đó đọc được.
 *  - Kho mô phỏng là dữ liệu dựng sẵn để xem thử: shop khác chỉ ĐỌC (lệnh ghi bị
 *    chặn), để tên người quyết định, nhãn duyệt của shop này không lộ sang shop kia.
 *
 * Khóa kho (`key`) là tên gọi trong bộ nhớ cho các phần chạy nền (phiên live, quản
 * gia, sự cố): 'demo', 'real' (kho thật trưng bày) hoặc 't_<mã tài khoản>'. Hai shop
 * cùng chọn "Dữ liệu thật" nên có hai khóa khác nhau, phiên live và sự cố không lẫn.
 * Header X-Workspace của trình duyệt chỉ nhận 'demo' hoặc 'real'; không ai chọn được
 * khóa của shop khác (riêng webhook live nhận khóa 't_' vì đã có khóa nhập của phiên).
 */
const TENANT_KEY_RE = /^t_[a-f0-9]{24}$/;

let state = null;

/**
 * @param {object} o
 *   client      MongoClient đã kết nối
 *   workspaces  sổ kho dùng chung với mọi phần chạy nền ({ demo, real }); kho riêng
 *               được thêm vào đây khi dùng, để vòng canh quản gia và tự nối lại phiên
 *               live thấy chúng mà không phải đổi chữ ký hàm
 *   authDb      database tài khoản
 *   ensureIndexes(db) tạo chỉ mục cho kho mới
 *   demoUserId  _id của tài khoản mẫu (chuỗi)
 */
function init({ client, workspaces, authDb, ensureIndexes = null, demoUserId = null }) {
  state = {
    client,
    workspaces,
    authDb,
    ensureIndexes,
    demoUserId: demoUserId ? String(demoUserId) : null,
    realBase: workspaces.real.databaseName,
    indexed: new Set(),
    // Tài khoản dùng hai kho chung: tài khoản mẫu, quản trị viên và người được cấp
    // `sharedWorkspaces: true` (thành viên nhóm quản kho trưng bày)
    shared: new Set(demoUserId ? [String(demoUserId)] : [])
  };
  return state;
}

const DEMO_EMAIL = 'demo@customerradar.vn';
const sharedByFields = (u) => Boolean(u && (u.email === DEMO_EMAIL || u.role === 'admin' || u.sharedWorkspaces === true));

const isTenantKey = (key) => TENANT_KEY_RE.test(String(key || ''));
/** Khóa có phải dữ liệu thật (kho trưng bày hoặc kho riêng của shop) */
const isRealKey = (key) => key === 'real' || isTenantKey(key);

/**
 * Tài khoản dùng chung hai kho cũ (chưa khởi tạo, ví dụ test thuần, thì coi như chung).
 * Nhận cả tài khoản (đọc thẳng các trường, rồi ghi nhớ) lẫn mã tài khoản (tra sổ ghi nhớ:
 * vòng canh quản gia chỉ có mã).
 */
function isShared(userOrId) {
  if (!state) return true;
  if (userOrId == null) return true;
  if (typeof userOrId === 'object' && userOrId._id !== undefined) {
    const id = String(userOrId._id);
    const yes = sharedByFields(userOrId);
    if (yes) state.shared.add(id); else if (id !== state.demoUserId) state.shared.delete(id);
    return yes;
  }
  return state.shared.has(String(userOrId));
}
const idOf = (userOrId) => (userOrId && typeof userOrId === 'object' && userOrId._id !== undefined ? userOrId._id : userOrId);

/**
 * Tên database của kho riêng. Atlas bản dùng chung giới hạn tên 38 byte, nên không ghép
 * sau tên kho thật (customer_radar_ui_test_real_t_<24 ký tự> dài 56 byte, bị từ chối):
 * prod là `cr_t_<mã>` (29 byte), chạy thử trên kho _test là `cr_test_t_<mã>` (34 byte,
 * còn chữ _test để các script dọn dẹp nhận ra). Hai môi trường chung cụm không lẫn nhau.
 */
const TENANT_DB_RE = /^cr(_test)?_t_[a-f0-9]{24}$/;
const isTenantDbName = (name) => TENANT_DB_RE.test(String(name || ''));
function dbNameFor(userId) {
  const prefix = /_test/.test(state.realBase) ? 'cr_test_t_' : 'cr_t_';
  return `${prefix}${String(userId)}`;
}

/** Đăng ký kho riêng vào sổ kho (đồng bộ: client.db không gọi mạng) */
function register(userId) {
  const key = `t_${String(userId)}`;
  if (!isTenantKey(key)) return null;
  if (!state.workspaces[key]) state.workspaces[key] = state.client.db(dbNameFor(userId));
  const db = state.workspaces[key];
  if (state.ensureIndexes && !state.indexed.has(key)) {
    state.indexed.add(key);
    Promise.resolve(state.ensureIndexes(db)).catch((e) => console.warn(`[KHO RIÊNG] Chưa tạo được chỉ mục ${key}:`, e.message));
    // Ghi tên kho vào tài khoản: khởi động lại thì đăng ký lại ngay (tự nối phiên live, vòng canh)
    state.authDb.collection('users')
      .updateOne({ _id: toId(userId), tenantDb: { $ne: db.databaseName } }, { $set: { tenantDb: db.databaseName } })
      .catch(() => {});
  }
  return key;
}

function toId(userId) {
  try {
    const { ObjectId } = require('mongodb');
    return ObjectId.isValid(String(userId)) ? new ObjectId(String(userId)) : userId;
  } catch {
    return userId;
  }
}

/**
 * Khóa kho cho một tài khoản và tên kho người dùng chọn ('demo' | 'real').
 * Shop thường: 'demo' vẫn là kho mô phỏng chung (chỉ đọc), 'real' là kho riêng.
 */
function keyFor(userOrId, ws) {
  if (ws === 'demo') return 'demo';
  if (isShared(userOrId)) return 'real';
  return register(idOf(userOrId)) || 'real';
}

/** Database theo khóa; khóa lạ thì null */
function dbForKey(key) {
  if (!state) return null;
  if (key === 'demo' || key === 'real') return state.workspaces[key];
  if (!isTenantKey(key)) return null;
  return register(key.slice(2)) ? state.workspaces[key] : null;
}

/** Khởi động: đăng ký mọi kho riêng đã có (tài khoản mang tenantDb) */
async function registerExisting() {
  if (!state) return 0;
  const shared = await state.authDb.collection('users')
    .find({ $or: [{ email: DEMO_EMAIL }, { role: 'admin' }, { sharedWorkspaces: true }] }, { projection: { _id: 1 } }).toArray();
  for (const u of shared) state.shared.add(String(u._id));
  const users = await state.authDb.collection('users').find({ tenantDb: { $exists: true } }, { projection: { _id: 1 } }).toArray();
  for (const u of users) if (!isShared(u._id)) register(u._id);
  return users.length;
}

// Lệnh POST chỉ tính toán, không ghi kho: shop khác vẫn dùng được trên kho mô phỏng
const DEMO_READONLY_ALLOW = /^\/api\/(chat|reply\/draft|classify|analyze(\/batch)?|model-inputs|test)$/;
const LIVE_WEBHOOK = /^\/api\/live\/sessions\/[a-f0-9]{24}\/comments$/;

/**
 * Middleware đặt sau requireSession. Đổi req.db của kho thật sang kho riêng của tài
 * khoản, gắn req.wsKey, và chặn ghi vào kho mô phỏng chung với shop không phải tài
 * khoản mẫu.
 */
function middleware() {
  return (req, res, next) => {
    if (!state) { req.wsKey = req.workspace; return next(); }
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (!req.user) {
      // Webhook live không có phiên đăng nhập: khóa 't_' chọn kho, khóa nhập của phiên giữ cửa
      const raw = String(req.get('X-Workspace') || req.query.workspace || '').toLowerCase();
      // Chỉ kho đã có (đăng ký lúc khởi động hoặc khi chủ shop dùng): khóa bịa không tạo được database mới
      if (req.method === 'POST' && LIVE_WEBHOOK.test(path) && isTenantKey(raw) && state.workspaces[raw]) {
        req.workspace = 'real'; req.db = state.workspaces[raw]; req.wsKey = raw;
        return next();
      }
      req.wsKey = req.workspace;
      return next();
    }
    const key = keyFor(req.user, req.workspace);
    req.wsKey = key;
    req.db = dbForKey(key) || req.db;
    if (req.workspace === 'demo' && !isShared(req.user) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && !DEMO_READONLY_ALLOW.test(path) && /^\/api\/(?!auth\/|admin\/|butler\/|billing\/)/.test(path)) {
      return res.status(403).json({
        error: 'Kho mô phỏng chỉ để xem thử. Dữ liệu của shop bạn nằm ở kho Dữ liệu thật (chọn ở góc trên thanh bên).',
        code: 'demo_readonly'
      });
    }
    next();
  };
}

/** Danh sách các kho dữ liệu thật đã đăng ký ([key, db]): gồm 'real' và mọi 't_<userId>' */
function listRealWorkspaces() {
  if (!state || !state.workspaces) return [];
  return Object.entries(state.workspaces).filter(([k, db]) => db && (k === 'real' || isTenantKey(k)));
}

module.exports = { init, keyFor, dbForKey, listRealWorkspaces, isTenantKey, isRealKey, isShared, registerExisting, middleware, dbNameFor, isTenantDbName };
