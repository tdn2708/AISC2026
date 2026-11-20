/**
 * API QUẢN TRỊ MÁY CHỦ — /api/admin/*
 * ==================================================================
 * Mọi route ở đây đều đã qua requireSession + requireAdmin trong server.js.
 * Giới hạn tần suất: 60 lượt/phút/IP chung; 20 lượt/phút/IP cho thao tác ghi.
 */
const express = require('express');
const auth = require('../services/auth');
const admin = require('../services/admin');
const processHealth = require('../services/process_health');
const { rateLimit } = require('../services/rate_limit');
const { isButlerEnabled } = require('../services/butler');
const zalo = require('../services/butler/zalo');

const readLimit = rateLimit({ max: 60, windowMs: 60 * 1000, name: 'quản trị máy chủ' });
const writeLimit = rateLimit({ max: 20, windowMs: 60 * 1000, name: 'thao tác quản trị' });

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(`[ADMIN API] ${req.method} ${req.path}:`, err.message);
    if (res.headersSent) return;
    res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ, vui lòng thử lại sau.' : err.message });
  });
};

function auditRow(doc) {
  return {
    id: String(doc._id),
    at: doc.at,
    adminId: doc.adminId ? String(doc.adminId) : null,
    adminEmail: doc.adminEmail || '',
    action: doc.action,
    targetId: doc.targetId ? String(doc.targetId) : null,
    targetEmail: doc.targetEmail || null,
    detail: doc.detail || {},
    ok: doc.ok !== false
  };
}

async function safeCount(col, filter = {}) {
  try {
    return await col.countDocuments(filter, { maxTimeMS: 2000 });
  } catch {
    return null;
  }
}

module.exports = ({ authDb, workspaces }) => {
  const router = express.Router();
  router.use(readLimit);

  const usersCol = () => authDb.collection('users');
  const sessionsCol = () => authDb.collection('auth_sessions');
  const auditCol = () => authDb.collection('admin_audit');
  const linksCol = () => authDb.collection('butler_links');

  async function loadTargetOrError(idParam, res) {
    const oid = admin.toObjectId(idParam);
    if (!oid) {
      res.status(400).json({ error: 'Mã tài khoản không đúng định dạng.' });
      return null;
    }
    const user = await usersCol().findOne({ _id: oid });
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return null;
    }
    return user;
  }

  // 1. Tổng quan sức khỏe máy chủ, tài khoản và nhật ký gần đây
  router.get('/overview', wrap(async (req, res) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const snap = processHealth.snapshot();
    const delay = processHealth.loopDelay();
    const errs = processHealth.recentErrors(5 * 60 * 1000);
    const rssLimitRaw = Number(process.env.RSS_LIMIT_MB);
    const rssLimitMb = Number.isFinite(rssLimitRaw) && rssLimitRaw > 0 ? rssLimitRaw : 512;
    const commit = process.env.RENDER_GIT_COMMIT
      ? String(process.env.RENDER_GIT_COMMIT).trim().slice(0, 7) || null
      : null;

    const [
      demoCount,
      realCount,
      totalUsers,
      active7d,
      lockedUsers,
      adminUsers,
      openSessions,
      recentDocs
    ] = await Promise.all([
      workspaces?.demo ? safeCount(workspaces.demo.collection('feedbacks')) : null,
      workspaces?.real ? safeCount(workspaces.real.collection('feedbacks')) : null,
      safeCount(usersCol()),
      safeCount(usersCol(), { lastLoginAt: { $gte: sevenDaysAgo } }),
      safeCount(usersCol(), { status: 'locked' }),
      safeCount(usersCol(), { role: 'admin' }),
      safeCount(sessionsCol(), { expiresAt: { $gt: now } }),
      auditCol().find({}).sort({ at: -1 }).limit(8).toArray()
    ]);

    res.json({
      server: {
        uptimeSec: snap.uptimeSec,
        rssMb: snap.rssMb,
        rssLimitMb,
        loopDelayMs: delay.p95Ms ?? delay.p99Ms ?? null,
        errors5m: errs.count,
        node: process.version,
        commit,
        butler: {
          enabled: isButlerEnabled(),
          zalo: zalo.health()
        },
        workspaces: {
          demo: demoCount,
          real: realCount
        }
      },
      accounts: {
        total: totalUsers,
        active7d,
        locked: lockedUsers,
        admins: adminUsers,
        openSessions
      },
      recent: recentDocs.map(auditRow)
    });
  }));

  // 2. Danh sách tài khoản có tìm kiếm, lọc, sắp xếp và phân trang
  router.get('/users', wrap(async (req, res) => {
    const pq = admin.parseListQuery(req.query || {});
    const now = new Date();
    const filter = {};
    if (pq.status === 'active') filter.status = { $ne: 'locked' };
    else if (pq.status === 'locked') filter.status = 'locked';
    else if (pq.status === 'admin') filter.role = 'admin';

    if (pq.qEscaped) {
      const re = new RegExp(pq.qEscaped, 'i');
      filter.$or = [{ email: re }, { name: re }];
    }

    const sortSpec =
      pq.sort === 'created'
        ? { createdAt: -1, _id: -1 }
        : pq.sort === 'email'
          ? { email: 1 }
          : { lastLoginAt: -1, createdAt: -1 };

    const [total, allCount, lockedCount, adminCount, pageDocs] = await Promise.all([
      usersCol().countDocuments(filter, { maxTimeMS: 2000 }),
      usersCol().countDocuments({}, { maxTimeMS: 2000 }),
      usersCol().countDocuments({ status: 'locked' }, { maxTimeMS: 2000 }),
      usersCol().countDocuments({ role: 'admin' }, { maxTimeMS: 2000 }),
      usersCol()
        .find(filter, { maxTimeMS: 2000 })
        .sort(sortSpec)
        .skip((pq.page - 1) * pq.limit)
        .limit(pq.limit)
        .toArray()
    ]);

    const pageIds = pageDocs.map((u) => u._id);
    const sessionCountMap = new Map();
    const zaloSet = new Set();

    if (pageIds.length > 0) {
      const [sessAgg, linkedDocs] = await Promise.all([
        sessionsCol()
          .aggregate([
            { $match: { userId: { $in: pageIds }, expiresAt: { $gt: now } } },
            { $group: { _id: '$userId', n: { $sum: 1 } } }
          ])
          .toArray(),
        linksCol()
          .find({ userId: { $in: pageIds }, chatId: { $type: 'string' } }, { projection: { userId: 1 } })
          .toArray()
      ]);
      for (const row of sessAgg) sessionCountMap.set(String(row._id), row.n);
      for (const l of linkedDocs) zaloSet.add(String(l.userId));
    }

    const items = pageDocs.map((u) =>
      admin.adminUserRow(u, {
        sessions: sessionCountMap.get(String(u._id)) || 0,
        zaloLinked: zaloSet.has(String(u._id))
      })
    );

    res.json({
      items,
      total,
      page: pq.page,
      pages: Math.max(1, Math.ceil(total / pq.limit)),
      counts: {
        all: allCount,
        active: Math.max(0, allCount - lockedCount),
        locked: lockedCount,
        admin: adminCount
      }
    });
  }));

  // 3. Chi tiết một tài khoản
  router.get('/users/:id', wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const now = new Date();
    const [sessions, link, auditDocs, lockedByUser] = await Promise.all([
      sessionsCol().find({ userId: target._id, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).toArray(),
      linksCol().findOne({ userId: target._id }),
      auditCol().find({ targetId: target._id }).sort({ at: -1 }).limit(20).toArray(),
      target.lockedBy ? usersCol().findOne({ _id: target.lockedBy }, { projection: { email: 1 } }) : null
    ]);

    const zaloInfo = {
      linked: Boolean(link?.chatId),
      zaloName: link?.chatId ? link.zaloName || null : null,
      linkedAt: link?.chatId ? link.linkedAt || null : null
    };

    const userObj = {
      ...admin.adminUserRow(target, { sessions: sessions.length, zaloLinked: zaloInfo.linked }),
      lockedByEmail: lockedByUser?.email || null
    };

    res.json({
      user: userObj,
      sessions: sessions.map((s) => admin.sessionRow(s, req.session?.tokenHash)),
      zalo: zaloInfo,
      audit: auditDocs.map(auditRow)
    });
  }));

  // 4. Khóa tài khoản
  router.post('/users/:id/lock', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 200) {
      return res.status(400).json({ error: 'Lý do khóa tài khoản cần từ 3 đến 200 ký tự.' });
    }

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'lock', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    const now = new Date();
    const patch = {
      status: 'locked',
      lockedAt: now,
      lockedBy: req.user._id,
      lockedReason: reason
    };
    await usersCol().updateOne({ _id: target._id }, { $set: patch });
    await admin.revokeAll(authDb, target._id);
    await admin.audit(authDb, req, 'lock', target, { reason }, true);

    const link = await linksCol().findOne({ userId: target._id }, { projection: { chatId: 1 } });
    res.json({
      user: {
        ...admin.adminUserRow({ ...target, ...patch }, { sessions: 0, zaloLinked: Boolean(link?.chatId) }),
        lockedByEmail: req.user.email
      }
    });
  }));

  // 5. Mở khóa tài khoản
  router.post('/users/:id/unlock', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'unlock', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    const patch = {
      status: 'active',
      lockedAt: null,
      lockedBy: null,
      lockedReason: null
    };
    await usersCol().updateOne({ _id: target._id }, { $set: patch });
    auth.forgetUser(target._id);
    await admin.audit(authDb, req, 'unlock', target, {}, true);

    const [sessCount, link] = await Promise.all([
      sessionsCol().countDocuments({ userId: target._id, expiresAt: { $gt: new Date() } }),
      linksCol().findOne({ userId: target._id }, { projection: { chatId: 1 } })
    ]);
    res.json({
      user: {
        ...admin.adminUserRow({ ...target, ...patch }, { sessions: sessCount, zaloLinked: Boolean(link?.chatId) }),
        lockedByEmail: null
      }
    });
  }));

  // 6. Đăng xuất khỏi mọi máy
  router.post('/users/:id/sessions/revoke', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'revoke_sessions', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    const isSelf = String(target._id) === String(req.user._id);
    const revoked = await admin.revokeAll(authDb, target._id, {
      exceptHash: isSelf ? req.session?.tokenHash : null
    });
    await admin.audit(authDb, req, 'revoke_sessions', target, { revoked }, true);
    res.json({ revoked });
  }));

  // 7. Xóa một phiên đăng nhập cụ thể
  router.delete('/sessions/:sid', writeLimit, wrap(async (req, res) => {
    const sid = admin.toObjectId(req.params.sid);
    if (!sid) return res.status(400).json({ error: 'Mã phiên không đúng định dạng.' });

    const session = await sessionsCol().findOne({ _id: sid });
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên đăng nhập này.' });

    if (req.session && session.tokenHash === req.session.tokenHash) {
      return res.status(409).json({ error: 'Không thể xóa phiên hiện tại ở đây. Hãy dùng nút Đăng xuất.' });
    }

    const target = await usersCol().findOne({ _id: session.userId });
    await sessionsCol().deleteOne({ _id: sid });
    auth.forgetUser(session.userId);
    await admin.audit(
      authDb,
      req,
      'revoke_session',
      target || { _id: session.userId, email: null },
      { sessionId: String(sid), kind: session.kind || 'user' },
      true
    );
    res.json({ ok: true });
  }));

  // 8. Đặt lại mật khẩu (tạo mật khẩu tạm, hiện đúng một lần, buộc đổi khi đăng nhập)
  router.post('/users/:id/reset-password', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'reset_password', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    const pw = admin.tempPassword();
    const passwordHash = await auth.hashPassword(pw);
    const now = new Date();
    await usersCol().updateOne(
      { _id: target._id },
      { $set: { passwordHash, mustChangePassword: true, passwordChangedAt: now } }
    );
    await admin.revokeAll(authDb, target._id);
    await admin.audit(authDb, req, 'reset_password', target, { mustChangePassword: true }, true);

    res.set('Cache-Control', 'no-store');
    res.json({ tempPassword: pw });
  }));

  // 9. Đổi vai trò (admin / user)
  router.post('/users/:id/role', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const nextRole = req.body?.role;
    if (nextRole !== 'admin' && nextRole !== 'user') {
      return res.status(400).json({ error: 'Vai trò phải là "admin" hoặc "user".' });
    }

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'set_role', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    const prevRole = auth.roleOf(target);
    await usersCol().updateOne({ _id: target._id }, { $set: { role: nextRole } });
    auth.forgetUser(target._id);
    await admin.audit(authDb, req, 'set_role', target, { from: prevRole, to: nextRole }, true);

    const [sessCount, link] = await Promise.all([
      sessionsCol().countDocuments({ userId: target._id, expiresAt: { $gt: new Date() } }),
      linksCol().findOne({ userId: target._id }, { projection: { chatId: 1 } })
    ]);
    res.json({
      user: admin.adminUserRow({ ...target, role: nextRole }, { sessions: sessCount, zaloLinked: Boolean(link?.chatId) })
    });
  }));

  // 10. Xóa vĩnh viễn tài khoản
  router.delete('/users/:id', writeLimit, wrap(async (req, res) => {
    const target = await loadTargetOrError(req.params.id, res);
    if (!target) return;

    const confirmEmail = auth.normalizeEmail(req.body?.confirmEmail);
    if (!confirmEmail || confirmEmail !== target.email) {
      return res.status(400).json({ error: 'Email xác nhận chưa khớp với tài khoản cần xóa.' });
    }

    const adminCount = await admin.countAdmins(authDb);
    const denied = admin.guard(req.user, target, 'delete_user', { adminCount });
    if (denied) return res.status(403).json({ error: denied });

    await admin.deleteUserCascade(authDb, target._id);
    await admin.audit(authDb, req, 'delete_user', target, { name: target.name || '' }, true);
    res.json({ ok: true });
  }));

  // 11. Nhật ký quản trị có lọc và phân trang
  router.get('/audit', wrap(async (req, res) => {
    const pageNum = Math.trunc(Number(req.query?.page));
    const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
    const limitNum = Math.trunc(Number(req.query?.limit));
    const limit = Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(50, Math.max(10, limitNum))
      : 20;
    const action = typeof req.query?.action === 'string' && auth.ADMIN_AUDIT_ACTIONS.has(req.query.action)
      ? req.query.action
      : null;
    const filter = action ? { action } : {};

    const [total, docs] = await Promise.all([
      auditCol().countDocuments(filter, { maxTimeMS: 2000 }),
      auditCol()
        .find(filter, { maxTimeMS: 2000 })
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray()
    ]);

    res.json({
      items: docs.map(auditRow),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit))
    });
  }));

  return router;
};
