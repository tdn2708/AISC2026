/**
 * GÓI VÀ THANH TOÁN (services/billing.js)
 *   GET   /api/billing                 gói đang dùng, hạn, hạn mức phản hồi tháng này, đơn gần đây
 *   POST  /api/billing/orders          { plan: 'shop'|'live', months: 1|3|6|12 } -> 201 đơn + mã QR chuyển khoản
 *   POST  /api/billing/webhook         SePay/Casso báo tiền vào (khóa BILLING_WEBHOOK_KEY), tự bật gói
 *   GET   /api/admin/billing           (quản trị) đơn theo trạng thái
 *   POST  /api/admin/billing/:code/confirm  (quản trị) xác nhận đã nhận tiền, bật gói
 */
const express = require('express');
const billing = require('../services/billing');
const auth = require('../services/auth');

module.exports = ({ authDb }) => {
  const shop = express.Router();
  const admin = express.Router();
  billing.ensureBillingIndexes(authDb).catch((e) => console.warn('[GÓI] Chưa tạo được chỉ mục:', e.message));

  shop.get('/', async (req, res, next) => {
    try {
      const [orders, room] = await Promise.all([
        authDb.collection('billing_orders').find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(5).toArray(),
        req.workspace === 'real' ? billing.feedbackRoom(req.db, req.user) : Promise.resolve(null)
      ]);
      res.json({
        ...billing.planSummary(req.user),
        room,
        months: billing.MONTH_CHOICES,
        orders: orders.map((o) => billing.publicOrder(o)),
        payReady: Boolean(billing.payInfo({ amount: 1, code: 'CRTEST00' }))
      });
    } catch (e) { next(e); }
  });

  shop.post('/orders', async (req, res, next) => {
    try {
      if (req.user.email === auth.DEMO_ACCOUNT.email) return res.status(403).json({ error: 'Tài khoản mẫu đã mở đủ tính năng, không cần mua gói.' });
      const v = billing.validateOrder(req.body || {});
      if (v.error) return res.status(400).json({ error: v.error });
      const order = await billing.createOrder(authDb, req.user, v.value);
      res.status(201).json(billing.publicOrder(order));
    } catch (e) { next(e); }
  });

  shop.post('/webhook', async (req, res, next) => {
    try {
      if (!billing.webhookKeyOk(req)) return res.status(401).json({ error: 'Sai khóa webhook' });
      const txs = billing.parseBankWebhook(req.body || {});
      const results = [];
      for (const t of txs) {
        const r = await billing.confirmOrder(authDb, t.code, { by: 'bank', amountPaid: t.amount, ref: t.ref });
        if (r.ok) auth.forgetUser(r.userId);
        results.push({ code: t.code, ok: r.ok, reason: r.reason || null });
        if (r.ok) console.log(`[GÓI] Đã nhận tiền đơn ${t.code}: bật gói ${r.plan} tới ${r.planUntil.toISOString().slice(0, 10)}`);
      }
      // SePay cần { success: true } để không gửi lại; Casso chỉ cần 200
      res.json({ success: true, confirmed: results.filter((r) => r.ok).length, results });
    } catch (e) { next(e); }
  });

  admin.get('/', async (req, res, next) => {
    try {
      const status = ['pending', 'paid', 'cancelled'].includes(req.query.status) ? req.query.status : 'pending';
      const list = await authDb.collection('billing_orders').find({ status }).sort({ createdAt: -1 }).limit(100).toArray();
      res.json({ status, orders: list.map((o) => ({ ...billing.publicOrder(o), email: o.email, paidBy: o.paidBy || null })) });
    } catch (e) { next(e); }
  });

  admin.post('/:code/confirm', async (req, res, next) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      if (!billing.CODE_RE.test(code)) return res.status(400).json({ error: 'Mã đơn không đúng dạng' });
      const r = await billing.confirmOrder(authDb, code, { by: req.user.email });
      if (!r.ok) {
        const msg = { not_found: 'Không có đơn này', not_pending: 'Đơn không còn chờ trả', user_gone: 'Tài khoản của đơn đã bị xóa' }[r.reason] || 'Không xác nhận được';
        return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: msg });
      }
      auth.forgetUser(r.userId);
      await require('../services/admin')
        .audit(authDb, req, 'confirm_payment', { _id: r.userId, email: r.order.email }, { code, plan: r.plan, planUntil: r.planUntil.toISOString() })
        .catch((e) => console.warn('[GÓI] Chưa ghi được nhật ký:', e.message));
      res.json({ ok: true, plan: r.plan, planUntil: r.planUntil, order: billing.publicOrder(r.order) });
    } catch (e) { next(e); }
  });

  return { shop, admin };
};
