/**
 * GÓI DÙNG VÀ THANH TOÁN
 * ==================================================================
 * Ba gói (khớp src/lib/plans.js): try (Dùng thử, 0 đ), shop (199.000 đ/tháng),
 * live (499.000 đ/tháng). Máy chủ là nơi khóa tính năng; giao diện chỉ hiện.
 *
 * Thu tiền bằng chuyển khoản ngân hàng có mã đơn (VietQR), không cần cổng thanh toán:
 *  1. Shop chọn gói và số tháng: tạo đơn `billing_orders` trạng thái pending, mã
 *     chuyển khoản dạng "CR7K2M9Q" (không trùng, không chứa ký tự dễ nhầm).
 *  2. Giao diện hiện mã QR (img.vietqr.io, theo PAY_BANK_BIN, PAY_ACCOUNT_NO,
 *     PAY_ACCOUNT_NAME) đã điền sẵn số tiền và nội dung là mã đơn.
 *  3. Gói bật khi (a) ngân hàng báo có tiền qua webhook của SePay hoặc Casso
 *     (BILLING_WEBHOOK_KEY), nội dung chứa mã đơn và số tiền đủ; hoặc (b) quản trị
 *     viên xác nhận trong /admin. Hai đường dùng chung confirmOrder, chạy lại không
 *     cộng tháng hai lần (đơn đã paid thì bỏ qua).
 *
 * Tài khoản mẫu và quản trị viên luôn dùng đủ tính năng (gói live), không cần trả.
 */
const crypto = require('crypto');

const PLANS = {
  try: { id: 'try', name: 'Dùng thử', priceVnd: 0, rank: 0, feedbackPerMonth: 500 },
  shop: { id: 'shop', name: 'Shop', priceVnd: 199000, rank: 1, feedbackPerMonth: null },
  live: { id: 'live', name: 'Shop có live', priceVnd: 499000, rank: 2, feedbackPerMonth: null }
};
const PAID_PLANS = ['shop', 'live'];
const MONTH_CHOICES = [1, 3, 6, 12];
const DAY_MS = 86400000;
const PERIOD_DAYS = 30;
const DEMO_EMAIL = 'demo@customerradar.vn';

/** Tính năng và gói thấp nhất mở nó */
const FEATURE_PLAN = {
  orders_import: 'shop',
  butler_commands: 'shop',
  live: 'live'
};
const FEATURE_LABEL = {
  orders_import: 'Nạp đơn hàng từ sàn',
  butler_commands: 'Lệnh Quản gia từ xa',
  live: 'Đọc bình luận livestream'
};

/** Gói đang có hiệu lực của tài khoản (hết hạn thì về Dùng thử) */
function effectivePlan(user, now = new Date()) {
  if (!user) return 'try';
  if (user.email === DEMO_EMAIL || user.role === 'admin') return 'live';
  if (PAID_PLANS.includes(user.plan) && user.planUntil && new Date(user.planUntil).getTime() > new Date(now).getTime()) return user.plan;
  return 'try';
}

function planAllows(user, feature, now = new Date()) {
  const need = FEATURE_PLAN[feature];
  if (!need) return true;
  return PLANS[effectivePlan(user, now)].rank >= PLANS[need].rank;
}

/** Lỗi 402 kèm gói cần, để giao diện dẫn sang trang bảng giá */
function planRequired(feature) {
  const need = PLANS[FEATURE_PLAN[feature]];
  const e = new Error(`${FEATURE_LABEL[feature] || 'Tính năng này'} có ở gói ${need.name} trở lên. Nâng cấp ở trang Bảng giá.`);
  e.status = 402;
  e.code = 'plan_required';
  e.plan = need.id;
  return e;
}

/** Middleware Express: chặn khi gói chưa đủ (402 plan_required) */
function requireFeature(feature) {
  return (req, res, next) => {
    if (!req.user || planAllows(req.user, feature)) return next();
    const e = planRequired(feature);
    return res.status(402).json({ error: e.message, code: e.code, plan: e.plan });
  };
}

/** Đầu tháng theo giờ Việt Nam (UTC+7), dùng cho hạn mức phản hồi mỗi tháng */
function vnMonthStart(now = new Date()) {
  const vn = new Date(new Date(now).getTime() + 7 * 3600000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3600000);
}

/**
 * Còn được nạp bao nhiêu phản hồi trong tháng (null: không giới hạn).
 * Đếm phản hồi đưa vào kho trong tháng này (collectedAt), mọi đường nạp cộng chung.
 */
async function feedbackRoom(db, user, now = new Date()) {
  const plan = PLANS[effectivePlan(user, now)];
  if (plan.feedbackPerMonth == null) return { limit: null, used: null, left: null };
  const used = await db.collection('feedbacks').countDocuments({ collectedAt: { $gte: vnMonthStart(now) } });
  return { limit: plan.feedbackPerMonth, used, left: Math.max(0, plan.feedbackPerMonth - used) };
}

// Mã chuyển khoản: 'CR' + 6 ký tự, bỏ 0/O/1/I/L để đọc qua điện thoại không nhầm
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newOrderCode() {
  const bytes = crypto.randomBytes(6);
  let s = 'CR';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}
const CODE_RE = /CR[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}/;

function payInfo(order, env = process.env) {
  const bin = String(env.PAY_BANK_BIN || '').trim();
  const acc = String(env.PAY_ACCOUNT_NO || '').trim();
  const name = String(env.PAY_ACCOUNT_NAME || '').trim();
  if (!/^\d{6}$/.test(bin) || !/^[0-9A-Za-z]{4,30}$/.test(acc)) return null;
  const q = new URLSearchParams({ amount: String(order.amount), addInfo: order.code });
  if (name) q.set('accountName', name);
  return {
    bankBin: bin,
    bankName: String(env.PAY_BANK_NAME || '').trim() || null,
    accountNo: acc,
    accountName: name || null,
    amount: order.amount,
    content: order.code,
    qrUrl: `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?${q.toString()}`
  };
}

function validateOrder(body = {}) {
  const plan = String(body.plan || '');
  const months = Number(body.months || 1);
  if (!PAID_PLANS.includes(plan)) return { error: 'Chọn gói Shop hoặc Shop có live.' };
  if (!MONTH_CHOICES.includes(months)) return { error: `Số tháng là một trong ${MONTH_CHOICES.join(', ')}.` };
  return { value: { plan, months, amount: PLANS[plan].priceVnd * months } };
}

async function ensureBillingIndexes(authDb) {
  await Promise.all([
    authDb.collection('billing_orders').createIndex({ code: 1 }, { unique: true }),
    authDb.collection('billing_orders').createIndex({ userId: 1, createdAt: -1 }),
    authDb.collection('billing_orders').createIndex({ status: 1, createdAt: -1 })
  ]);
}

const publicOrder = (o, env = process.env) => (o ? {
  code: o.code,
  plan: o.plan,
  planName: PLANS[o.plan]?.name || o.plan,
  months: o.months,
  amount: o.amount,
  status: o.status,
  createdAt: o.createdAt,
  paidAt: o.paidAt || null,
  pay: o.status === 'pending' ? payInfo(o, env) : null
} : null);

/** Tạo đơn chờ trả; một tài khoản giữ tối đa 3 đơn đang chờ (đơn cũ nhất bị hủy) */
async function createOrder(authDb, user, { plan, months, amount }, now = new Date()) {
  const col = authDb.collection('billing_orders');
  const pending = await col.find({ userId: user._id, status: 'pending' }).sort({ createdAt: 1 }).toArray();
  if (pending.length >= 3) {
    await col.updateMany({ _id: { $in: pending.slice(0, pending.length - 2).map((o) => o._id) } }, { $set: { status: 'cancelled', cancelledAt: now } });
  }
  for (let i = 0; i < 5; i++) {
    const doc = { code: newOrderCode(), userId: user._id, email: user.email, plan, months, amount, status: 'pending', createdAt: now };
    try {
      await col.insertOne(doc);
      return doc;
    } catch (e) {
      if (e && e.code === 11000) continue;
      throw e;
    }
  }
  throw new Error('Không tạo được mã đơn, thử lại.');
}

/** Hạn mới: cộng thêm từ hạn cũ nếu còn, đổi gói khác thì tính từ hôm nay */
function extendPlan(user, plan, months, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const current = user.planUntil ? new Date(user.planUntil).getTime() : 0;
  const base = user.plan === plan && current > nowMs ? current : nowMs;
  return new Date(base + months * PERIOD_DAYS * DAY_MS);
}

/**
 * Đánh dấu đã trả và bật gói. Đơn không còn pending thì không làm gì (chạy lại an
 * toàn: webhook ngân hàng có thể gửi lại cùng một giao dịch).
 */
async function confirmOrder(authDb, code, { by, amountPaid = null, ref = null, now = new Date() } = {}) {
  const col = authDb.collection('billing_orders');
  const order = await col.findOne({ code });
  if (!order) return { ok: false, reason: 'not_found' };
  if (order.status !== 'pending') return { ok: false, reason: 'not_pending', order };
  if (amountPaid != null && Number(amountPaid) < order.amount) return { ok: false, reason: 'amount_short', order };
  const claimed = await col.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    { $set: { status: 'paid', paidAt: now, paidBy: by || null, paidRef: ref, amountPaid: amountPaid ?? order.amount } },
    { returnDocument: 'after' }
  );
  const paid = claimed?.value !== undefined ? claimed.value : claimed;
  if (!paid) return { ok: false, reason: 'not_pending', order };
  const user = await authDb.collection('users').findOne({ _id: order.userId });
  if (!user) return { ok: false, reason: 'user_gone', order: paid };
  const until = extendPlan(user, order.plan, order.months, now);
  await authDb.collection('users').updateOne({ _id: user._id }, { $set: { plan: order.plan, planUntil: until, planWanted: null, planWantedAt: null } });
  return { ok: true, order: paid, userId: user._id, plan: order.plan, planUntil: until };
}

/**
 * Webhook ngân hàng (SePay hoặc Casso). Cả hai gửi giao dịch tiền vào với nội dung
 * chuyển khoản và số tiền; ta tìm mã đơn trong nội dung.
 *   SePay: { id, transferType: 'in', transferAmount, content, ... }, header Authorization: Apikey <key>
 *   Casso: { data: [{ id, amount, description, ... }] }, header Secure-Token: <key>
 */
function parseBankWebhook(body = {}) {
  const list = Array.isArray(body.data) ? body.data : [body];
  const out = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    if (t.transferType && t.transferType !== 'in') continue;
    const amount = Number(t.transferAmount ?? t.amount);
    const text = String(t.content ?? t.description ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = CODE_RE.exec(text);
    if (!m || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({ code: m[0], amount, ref: String(t.id ?? t.referenceCode ?? t.tid ?? '') || null });
  }
  return out;
}

function webhookKeyOk(req, env = process.env) {
  const want = String(env.BILLING_WEBHOOK_KEY || '');
  if (want.length < 16) return false;
  const auth = String(req.get('Authorization') || '');
  const given = auth.replace(/^Apikey\s+/i, '').replace(/^Bearer\s+/i, '') || String(req.get('Secure-Token') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Phần gói gửi về trình duyệt */
function planSummary(user, now = new Date()) {
  const id = effectivePlan(user, now);
  return {
    plan: id,
    planName: PLANS[id].name,
    planUntil: id !== 'try' && user?.planUntil && user.email !== DEMO_EMAIL && user.role !== 'admin' ? user.planUntil : null,
    feedbackPerMonth: PLANS[id].feedbackPerMonth,
    features: Object.fromEntries(Object.keys(FEATURE_PLAN).map((f) => [f, planAllows(user, f, now)]))
  };
}

module.exports = {
  PLANS, PAID_PLANS, MONTH_CHOICES, FEATURE_PLAN,
  effectivePlan, planAllows, planRequired, requireFeature, feedbackRoom, vnMonthStart,
  newOrderCode, CODE_RE, payInfo, validateOrder, ensureBillingIndexes, publicOrder,
  createOrder, extendPlan, confirmOrder, parseBankWebhook, webhookKeyOk, planSummary
};
