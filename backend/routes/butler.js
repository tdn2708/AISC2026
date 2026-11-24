/**
 * ĐƯỜNG DẪN API CHO QUẢN GIA (/api/butler)
 * ==================================================================
 * Gồm webhook công khai cho Zalo Bot Platform (có kiểm tra secret) và
 * các đường quản lý kết nối, cài đặt, lịch sử trò chuyện, ra lệnh trên web.
 */

const express = require('express');
const auth = require('../services/auth');
const normalizer = require('../services/normalizer');
const { rateLimit } = require('../services/rate_limit');
const zalo = require('../services/butler/zalo');
const store = require('../services/butler/store');
const outbox = require('../services/butler/outbox');
const { watchStatus } = require('../services/butler/watcher');
const { liveWatchStatus } = require('../services/butler/live_watch');
const { SEV_RANK } = require('../services/butler/incidents');
const engine = require('../services/butler/engine');
const { isButlerEnabled } = require('../services/butler');
const hub = require('../services/live/hub');

const webhookLimit = rateLimit({ max: 120, windowMs: 60 * 1000, name: 'webhook Zalo' });
const commandLimit = rateLimit({ max: 30, windowMs: 60 * 1000, name: 'lệnh quản gia' });
const linkCodeLimit = rateLimit({ max: 5, windowMs: 10 * 60 * 1000, name: 'lấy mã nối Zalo' });
const testLimit = rateLimit({ max: 3, windowMs: 10 * 60 * 1000, name: 'gửi tin thử' });

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(`[QUẢN GIA API] ${req.method} ${req.path}:`, err.message);
    if (res.headersSent) return;
    res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ, vui lòng thử lại sau.' : err.message });
  });
};

module.exports = ({ authDb, workspaces, getInbound }) => {
  const router = express.Router();

  // 1. Webhook nhận sự kiện từ Zalo Bot Platform
  router.post('/zalo/webhook', webhookLimit, (req, res) => {
    if (zalo.mode() !== 'webhook') {
      return res.status(404).json({ error: 'Chế độ webhook đang tắt.' });
    }
    const secret = String(process.env.ZALO_WEBHOOK_SECRET || '');
    if (secret.length < 8 || secret.length > 256) {
      return res.status(503).json({ error: 'Máy chủ chưa cấu hình ZALO_WEBHOOK_SECRET.' });
    }
    if (!zalo.verifySecret(req.get('X-Bot-Api-Secret-Token'))) {
      return res.status(403).json({ error: 'Sai mã xác thực webhook.' });
    }

    res.status(200).json({ ok: true });

    const body = req.body;
    const deferTimer = setTimeout(() => {
      const inbound = typeof getInbound === 'function' ? getInbound() : null;
      if (inbound) {
        const updates = zalo.normalizeUpdate(body);
        for (const u of updates) {
          inbound.push(u);
        }
      }
    }, 50);
    if (deferTimer.unref) deferTimer.unref();
  });

  // Mọi API còn lại gắn với tài khoản đang đăng nhập. Không có tài khoản (tắt
  // AUTH_REQUIRED khi thử, hoặc phiên hết hạn) thì trả 401 thay vì lỗi 500
  router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Cần đăng nhập để dùng quản gia', code: 'auth_required' });
    next();
  });

  // 2. Trạng thái tổng thể của quản gia và kết nối Zalo của tài khoản hiện tại
  router.get('/status', wrap(async (req, res) => {
    const enabled = isButlerEnabled();
    let botName = null;
    if (zalo.configured()) {
      try {
        const me = await zalo.getMe();
        botName = me.name;
      } catch {
        botName = null;
      }
    }

    const [watcherMeta, liveWatchMeta, link, openIncidents, outboxStats] = await Promise.all([
      watchStatus(authDb),
      liveWatchStatus(authDb),
      store.getLink(authDb, req.user._id),
      authDb
        .collection('butler_incidents')
        .find({ workspace: req.workspace, resolvedAt: null })
        .sort({ lastSeenAt: -1 })
        .limit(10)
        .toArray(),
      outbox.stats(authDb, req.user._id)
    ]);

    const watchWs = require('../services/tenants').keyFor(req.user, (link?.settings?.workspace || 'real') === 'demo' ? 'demo' : 'real');
    const watchDb = workspaces[watchWs] || req.db;
    const nextSched = watchDb
      ? await watchDb
          .collection('live_schedule')
          .findOne({ status: 'scheduled', startAt: { $gte: new Date() } }, { sort: { startAt: 1 } })
          .catch(() => null)
      : null;
    const nextLive = nextSched
      ? {
          title: nextSched.title,
          startAt: nextSched.startAt,
          platformLabel: Object.hasOwn(hub.PLATFORMS, nextSched.platform)
            ? hub.PLATFORMS[nextSched.platform].label
            : nextSched.platform
        }
      : null;

    openIncidents.sort((a, b) => (SEV_RANK[b.severity] || 1) - (SEV_RANK[a.severity] || 1));

    res.json({
      enabled,
      zalo: {
        ...zalo.health(),
        botName
      },
      watcher: watcherMeta,
      liveWatch: liveWatchMeta,
      nextLive,
      link: {
        linked: Boolean(link?.chatId),
        zaloName: link?.zaloName || null,
        linkedAt: link?.linkedAt || null
      },
      settings: { ...store.DEFAULT_SETTINGS, ...(link?.settings || {}) },
      incidents: openIncidents.map((inc) => ({
        _id: inc._id,
        key: inc.key,
        kind: inc.kind,
        severity: inc.severity,
        title: inc.title,
        why: inc.why,
        to: inc.to,
        firstSeenAt: inc.firstSeenAt,
        lastSeenAt: inc.lastSeenAt
      })),
      outbox: outboxStats,
      ...(process.env.NODE_ENV !== 'production'
        ? {
            rssMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
            ctxCalls: global.__butlerCtxCalls || 0
          }
        : {})
    });
  }));

  // 3. Lịch sử cuộc trò chuyện chung giữa web và Zalo
  router.get('/messages', wrap(async (req, res) => {
    const data = await store.recentMessages(authDb, req.user._id, {
      before: req.query.before,
      limit: req.query.limit
    });
    res.json(data);
  }));

  // 4. Gửi lệnh hoặc câu hỏi từ giao diện web
  router.post('/command', commandLimit, wrap(async (req, res) => {
    const raw = typeof req.body?.text === 'string'
      ? normalizer.canonicalize(req.body.text).trim()
      : '';
    if (!raw || raw.length > 2000) {
      return res.status(400).json({ error: 'Cần nội dung lệnh từ 1 đến 2000 ký tự.' });
    }

    const link = await store.getLink(authDb, req.user._id);
    const reply = await engine.handle({
      authDb,
      workspaces,
      user: req.user,
      link,
      text: raw,
      channel: 'web',
      workspace: req.workspace
    });

    const userMsg = await store.saveMessage(authDb, {
      userId: req.user._id,
      channel: 'web',
      role: 'user',
      text: raw,
      reply: null,
      workspace: req.workspace,
      at: new Date()
    });

    const { text: replyText, ...replyRest } = reply;
    const butlerMsg = await store.saveMessage(authDb, {
      userId: req.user._id,
      channel: 'web',
      role: 'butler',
      text: replyText,
      reply: { kind: reply.kind, ...replyRest },
      workspace: req.workspace,
      at: new Date()
    });

    res.json({
      reply,
      messages: [userMsg, butlerMsg]
    });
  }));

  // 5. Tạo mã 6 số để nối tài khoản với Zalo
  router.post('/link-code', linkCodeLimit, wrap(async (req, res) => {
    if (req.user.email === auth.DEMO_ACCOUNT.email) {
      return res.status(403).json({
        error: 'Tài khoản mẫu dùng chung nên không nối Zalo được. Tạo tài khoản riêng để nhận báo.'
      });
    }
    if (!zalo.configured()) {
      return res.status(409).json({
        error: 'Máy chủ chưa cấu hình bot Zalo.'
      });
    }

    const { code, expiresAt } = await store.createLinkCode(authDb, req.user._id);
    let botName = null;
    try {
      const me = await zalo.getMe();
      botName = me.name;
    } catch {
      botName = null;
    }

    res.json({ code, expiresAt, botName });
  }));

  // 6. Ngắt kết nối Zalo
  router.delete('/link', wrap(async (req, res) => {
    const prev = await store.unlink(authDb, req.user._id);
    if (prev && prev.chatId) {
      await outbox.enqueue(authDb, {
        dedupKey: `unlink|${req.user._id}|${Date.now()}`,
        userId: req.user._id,
        chatId: prev.chatId,
        kind: 'link',
        text: 'Đã ngắt Zalo khỏi tài khoản này.'
      });
    }
    res.json({ ok: true });
  }));

  // 7. Cập nhật cài đặt báo sự cố
  router.patch('/settings', wrap(async (req, res) => {
    const updated = await store.updateSettings(authDb, req.user._id, req.body || {});
    res.json({ settings: updated.settings });
  }));

  // 8. Nhật ký tin đi gần nhất
  router.get('/outbox', wrap(async (req, res) => {
    const items = await outbox.recentOutbox(authDb, req.user._id, req.query.limit);
    res.json({ items });
  }));

  // 9. Gửi tin nhắn thử qua Zalo
  router.post('/test', testLimit, wrap(async (req, res) => {
    const link = await store.getLink(authDb, req.user._id);
    if (!link?.chatId) {
      return res.status(409).json({ error: 'Chưa nối Zalo cho tài khoản này.' });
    }
    const minuteBucket = Math.floor(Date.now() / 60000);
    const r = await outbox.enqueue(authDb, {
      dedupKey: `test|${req.user._id}|${minuteBucket}`,
      userId: req.user._id,
      chatId: link.chatId,
      kind: 'test',
      text: 'Tin thử từ quản gia Customer Radar. Đọc được tin này là báo qua Zalo đã chạy.'
    });
    res.json({ ok: true, ...r });
  }));

  return router;
};
