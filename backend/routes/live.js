/**
 * API LIVESTREAM — /api/live/*
 * ==================================================================
 * Kho được chọn bằng X-Workspace như mọi API khác. Trình duyệt không gửi được
 * header khi mở luồng sự kiện (EventSource), nên luồng nhận ?workspace=.
 *
 * Phiên mô phỏng chỉ mở được trong kho demo: kho thật chỉ chứa dữ liệu thật.
 */

const express = require('express');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const hub = require('../services/live/hub');
const { suggestAnswer, buildRewritePrompt } = require('../services/live/answer');
const { INTENT_LABEL, TOPIC_LABEL, TOPICS } = require('../services/live/intent');
const { MEGALIVE_CATALOG, MEGALIVE_POLICY } = require('../services/live/connectors/simulator');

const router = express.Router();

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(`[LIVE API] ${req.method} ${req.path}:`, err.message);
    if (!res.headersSent) res.status(status).json({ error: err.message });
  });
};

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? null : String(v).trim().slice(0, max));
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const list = (v, max = 30) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => str(x, 60)).filter(Boolean).slice(0, max);

/** Danh mục sản phẩm từ giao diện: chỉ giữ các trường đã biết, ép kiểu */
function cleanProducts(input) {
  if (!Array.isArray(input)) return [];
  const used = new Set();
  return input.slice(0, 60).map((p, i) => {
    const name = str(p?.name, 120);
    if (!name) return null;
    let id = str(p.id, 40) || slug(name) || `sp-${i + 1}`;
    while (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    let stock = null;
    if (typeof p.stock === 'number' || (typeof p.stock === 'string' && p.stock.trim() !== '' && Number.isFinite(Number(p.stock)))) stock = Number(p.stock);
    else if (p.stock && typeof p.stock === 'object') {
      stock = Object.fromEntries(Object.entries(p.stock).slice(0, 30).map(([k, v]) => [str(k, 20), num(v)]).filter(([k, v]) => k && v != null));
    }
    return {
      id,
      code: str(p.code, 10) || String(i + 1),
      name,
      price: num(p.price),
      salePrice: num(p.salePrice),
      sizes: list(p.sizes, 20),
      colors: list(p.colors, 20),
      stock,
      material: str(p.material, 300),
      usage: str(p.usage, 300),
      keywords: list(p.keywords, 20),
      sizeGuide: Array.isArray(p.sizeGuide)
        ? p.sizeGuide.slice(0, 12).map((g) => ({ size: str(g?.size, 10), maxKg: num(g?.maxKg), maxCm: num(g?.maxCm) })).filter((g) => g.size)
        : []
    };
  }).filter(Boolean);
}

const POLICY_KEYS = ['shipping', 'payment', 'returns', 'promo', 'authenticity', 'howToOrder', 'complaint'];
function cleanPolicy(input = {}) {
  return Object.fromEntries(POLICY_KEYS.map((k) => [k, str(input?.[k], 400) || '']));
}

// Mọi thao tác ghi lên một phiên làm cũ số liệu đã nhớ của phiên đó (hub.memoized).
// Bỏ cả trước lẫn sau khi ghi: request đọc chen giữa không được nhớ lại bản cũ.
router.use('/sessions/:id', (req, res, next) => {
  if (req.method !== 'GET') {
    hub.dropMemo(req.params.id);
    res.on('finish', () => hub.dropMemo(req.params.id));
  }
  next();
});

async function sessionOr404(req) {
  const s = await hub.loadSession(req.db, req.params.id);
  if (!s) throw bad('Không tìm thấy phiên live', 404);
  return s;
}

// ------------------------------------------------------------------
// Danh mục nền tảng, mẫu
// ------------------------------------------------------------------

router.get('/platforms', (req, res) => {
  res.json({
    platforms: hub.platformInfo().map((p) => (p.key === 'simulator' && req.workspace !== 'demo'
      ? { ...p, ready: false, note: 'Chỉ dùng trong kho demo' }
      : p)),
    intents: Object.entries(INTENT_LABEL).map(([key, label]) => ({ key, label })),
    topics: [...TOPICS, { key: 'other', label: TOPIC_LABEL.other }],
    sample: { products: MEGALIVE_CATALOG, policy: MEGALIVE_POLICY }
  });
});

// ------------------------------------------------------------------
// Phiên
// ------------------------------------------------------------------

/**
 * Tóm tắt cho trang Tổng quan: phiên đang live (số liệu trực tiếp, việc cần
 * làm gấp nhất) và phiên đã kết thúc gần nhất (kết quả, việc cho phiên sau).
 * Báo cáo của phiên đã kết thúc được nhớ tới khi có thao tác ghi lên phiên đó.
 */
router.get('/overview', wrap(async (req, res) => {
  await hub.ensureIndexes(req.db);
  const col = req.db.collection('live_sessions');
  const recent = await col.find({}).sort({ createdAt: -1 }).limit(20).toArray();
  const live = recent
    .map((s) => ({ s, r: hub.runtimeFor(s._id, req.workspace) }))
    .filter(({ r }) => r && r.status !== 'ended')
    .map(({ s, r }) => {
      const snap = r.snapshot();
      return {
        id: String(s._id), title: s.title, platform: s.platform, simulated: Boolean(s.simulated), status: r.status, startedAt: s.startedAt,
        viewers: snap.viewers.now, comments: snap.totals.comments, orders: snap.totals.byIntent.order, complaints: snap.totals.byIntent.complaint,
        queueOpen: snap.queueOpen, actions: snap.actions.active.slice(0, 2).map((a) => ({ title: a.title, severity: a.severity }))
      };
    });
  const lastEnded = recent.find((s) => s.status === 'ended');
  let latest = null;
  if (lastEnded) {
    const rep = await hub.reportFor(req.db, lastEnded, null);
    latest = {
      id: String(lastEnded._id), title: lastEnded.title, platform: lastEnded.platform, simulated: Boolean(lastEnded.simulated),
      startedAt: lastEnded.startedAt, endedAt: lastEnded.endedAt,
      revenue: rep.revenue.estimated, lostRevenue: rep.revenue.lostTotal, orders: rep.totals.byIntent.order,
      complaints: rep.complaints.total, complaintsUnpushed: rep.complaints.total - rep.complaints.pushed,
      answeredShare: rep.response.answeredShare,
      todo: rep.todo.slice(0, 3)
    };
  }
  res.json({ live, latest });
}));

router.get('/sessions', wrap(async (req, res) => {
  await hub.ensureIndexes(req.db);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const docs = await req.db.collection('live_sessions').find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  res.json({ sessions: docs.map((s) => hub.publicSession(s, hub.runtimeFor(s._id, req.workspace))) });
}));

router.post('/sessions', wrap(async (req, res) => {
  const b = req.body || {};
  const platform = str(b.platform, 20);
  if (!hub.PLATFORMS[platform]) throw bad('Nền tảng không hợp lệ');
  if (platform === 'simulator' && req.workspace !== 'demo') throw bad('Phiên mô phỏng chỉ mở được trong kho demo; kho thật chỉ chứa dữ liệu thật');
  if (platform === 'youtube' && !process.env.YOUTUBE_API_KEY) throw bad('Máy chủ chưa có YOUTUBE_API_KEY');
  const target = str(b.target, 300);
  if ((platform === 'tiktok' || platform === 'youtube') && !target) throw bad(platform === 'tiktok' ? 'Nhập tên tài khoản TikTok đang live' : 'Nhập liên kết video YouTube đang live');

  const useSample = platform === 'simulator' || b.useSampleCatalog === true;
  const products = useSample && !(Array.isArray(b.products) && b.products.length) ? cleanProducts(MEGALIVE_CATALOG) : cleanProducts(b.products);
  const policy = useSample && !b.policy ? cleanPolicy(MEGALIVE_POLICY) : cleanPolicy(b.policy);

  const session = {
    title: str(b.title, 120) || (platform === 'simulator' ? 'Megalive 11.11 (mô phỏng)' : `Live ${hub.PLATFORMS[platform].label} ${new Date().toLocaleDateString('vi-VN')}`),
    platform,
    target: platform === 'simulator' ? 'megalive-1111' : target,
    simulated: platform === 'simulator',
    speed: platform === 'simulator' ? Math.min(4, Math.max(0.25, Number(b.speed) || 1)) : null,
    seed: platform === 'simulator' ? Math.floor(Math.random() * 1e9) : null,
    products,
    policy,
    currentProductId: products.some((p) => p.id === b.currentProductId) ? b.currentProductId : products[0]?.id || null,
    status: 'connecting',
    ingestKey: crypto.randomBytes(12).toString('hex'),
    createdAt: new Date()
  };
  await hub.ensureIndexes(req.db);
  const { insertedId } = await req.db.collection('live_sessions').insertOne(session);
  session._id = insertedId;
  const r = await hub.startSession(req.db, req.workspace, session);
  res.status(201).json({ session: hub.publicSession(session, r) });
}));

router.get('/sessions/:id', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const r = hub.runtimeFor(s._id, req.workspace);
  res.json({ session: hub.publicSession(r ? r.session : s, r), snapshot: r ? r.snapshot() : await hub.rebuildSnapshot(req.db, s) });
}));

/** Luồng sự kiện thời gian thực: session, stats, comment, backlog */
router.get('/sessions/:id/stream', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const r = hub.runtimeFor(s._id, req.workspace);
  if (!r) {
    // Phiên không chạy: gửi trạng thái cuối rồi đóng
    res.write(`event: session\ndata: ${JSON.stringify(hub.publicSession(s, null))}\n\n`);
    res.write(`event: stats\ndata: ${JSON.stringify(await hub.rebuildSnapshot(req.db, s))}\n\n`);
    res.write('event: closed\ndata: {}\n\n');
    return res.end();
  }
  const off = r.subscribe(res);
  req.on('close', off);
}));

router.post('/sessions/:id/stop', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.stop('Người dùng kết thúc phiên');
  else if (s.status !== 'ended') {
    const snap = await hub.rebuildSnapshot(req.db, s);
    await req.db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { status: 'ended', endedAt: new Date(), summary: hub.summarize(snap) } });
  }
  const fresh = await hub.loadSession(req.db, req.params.id);
  res.json({ session: hub.publicSession(fresh, null) });
}));

router.post('/sessions/:id/resume', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  if (hub.runtimeFor(s._id, req.workspace)) throw bad('Phiên đang chạy');
  if (s.platform === 'simulator' && req.workspace !== 'demo') throw bad('Phiên mô phỏng chỉ chạy trong kho demo');
  await req.db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { status: 'connecting', error: null }, $unset: { endedAt: '' } });
  const r = await hub.startSession(req.db, req.workspace, { ...s, status: 'connecting', error: null, endedAt: null });
  res.json({ session: hub.publicSession(r.session, r) });
}));

router.delete('/sessions/:id', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  // Chỉ xóa được phiên mô phỏng; phiên thật là dữ liệu của shop, không xóa qua giao diện
  if (!s.simulated) throw bad('Chỉ xóa được phiên mô phỏng', 403);
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.stop('Xóa phiên');
  await req.db.collection('live_comments').deleteMany({ sessionId: s._id });
  await req.db.collection('live_sessions').deleteOne({ _id: s._id });
  res.json({ ok: true });
}));

router.put('/sessions/:id/catalog', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const products = cleanProducts(req.body?.products);
  const policy = cleanPolicy(req.body?.policy);
  const currentProductId = products.some((p) => p.id === s.currentProductId) ? s.currentProductId : products[0]?.id || null;
  await req.db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { products, policy, currentProductId } });
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) {
    Object.assign(r.session, { products, policy, currentProductId });
    r.agg.setProducts(products);
    r.dirty = true;
    r.broadcast('session', hub.publicSession(r.session, r));
  }
  res.json({ session: hub.publicSession({ ...s, products, policy, currentProductId }, r) });
}));

router.post('/sessions/:id/current-product', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const productId = str(req.body?.productId, 40);
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.setCurrentProduct(productId);
  else await req.db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { currentProductId: productId } });
  res.json({ ok: true, currentProductId: productId });
}));

// ------------------------------------------------------------------
// Bình luận
// ------------------------------------------------------------------

router.get('/sessions/:id/comments', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const q = { sessionId: s._id };
  if (INTENT_LABEL[req.query.intent]) q.intent = req.query.intent;
  if (req.query.groupKey) q.groupKey = String(req.query.groupKey);
  if (req.query.q) q.text = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80), $options: 'i' };
  if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) q.ts = { $lt: new Date(req.query.before) };
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const docs = await req.db.collection('live_comments').find(q).sort({ ts: -1 }).limit(limit).toArray();
  const names = new Map((s.products || []).map((p) => [p.id, p.name]));
  res.json({ comments: docs.map((d) => hub.publicComment(d, names.get(d.productId))), total: await req.db.collection('live_comments').countDocuments(q) });
}));

/** Đọc CSV đơn giản: author,text,time (có hoặc không có dòng tiêu đề) */
function parseCsv(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  if (rows.length && /^(author|tác giả|tac gia|user|name|ten)$/i.test(rows[0][0]?.trim())) rows.shift();
  return rows.map(([author, text, time]) => ({ author: author?.trim(), text: (text ?? author)?.trim(), ts: time?.trim() }));
}

/**
 * Nhận bình luận từ bên ngoài: dán tay, nhập tệp sau phiên live (Facebook,
 * Shopee Live xuất ra CSV), hoặc webhook từ công cụ khác. Cần khóa nhập của
 * phiên (X-Ingest-Key) để người ngoài không đổ rác vào được.
 */
router.post('/sessions/:id/comments', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const key = req.get('X-Ingest-Key') || req.body?.key || req.query.key;
  if (!key || key !== s.ingestKey) throw bad('Sai khóa nhập của phiên', 403);
  const b = req.body || {};
  let items = Array.isArray(b.comments) ? b.comments : b.text ? [b] : b.csv ? parseCsv(b.csv) : [];
  if (!items.length) throw bad('Không có bình luận nào');
  if (items.length > 5000) throw bad('Tối đa 5.000 bình luận mỗi lần');
  items = items.map((c, i) => ({
    type: 'comment',
    platformMsgId: c.id ? String(c.id) : null,
    author: { handle: str(c.handle || c.author, 80), nickname: str(c.nickname || c.author, 80), platformUserId: str(c.userId, 80) },
    text: str(c.text, 1000),
    ts: c.ts && !Number.isNaN(Date.parse(c.ts)) ? new Date(c.ts) : new Date(Date.now() - (items.length - i))
  })).filter((c) => c.text);

  const r = hub.runtimeFor(s._id, req.workspace);
  let accepted = 0;
  if (r) {
    for (const ev of items) if (r.ingest(ev)) accepted += 1;
    await r.flush();
  } else {
    // Phiên đã kết thúc: nhập bổ sung (ví dụ tệp xuất sau live)
    const docs = items.map((ev) => hub.buildCommentDoc(s, ev));
    try {
      const out = await req.db.collection('live_comments').insertMany(docs, { ordered: false });
      accepted = out.insertedCount;
    } catch (e) {
      if (e.code !== 11000 && !e.writeErrors) throw e;
      accepted = e.result?.insertedCount ?? e.insertedCount ?? 0;
    }
    if (s.status === 'ended') {
      const snap = await hub.rebuildSnapshot(req.db, s);
      await req.db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { summary: hub.summarize(snap) } });
    }
  }
  res.json({ received: items.length, accepted, duplicates: items.length - accepted });
}));

/** Sửa nhãn ý định của một bình luận (nhãn người, dùng được cho huấn luyện) */
router.post('/sessions/:id/comments/:commentId/label', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  if (!ObjectId.isValid(req.params.commentId)) throw bad('Mã bình luận không hợp lệ');
  const intent = str(req.body?.intent, 20);
  if (!INTENT_LABEL[intent]) throw bad('Ý định không hợp lệ');
  const topic = intent === 'question' ? (TOPIC_LABEL[req.body?.topic] ? req.body.topic : 'other') : null;
  const col = req.db.collection('live_comments');
  const d = await col.findOne({ _id: new ObjectId(req.params.commentId), sessionId: s._id });
  if (!d) throw bad('Không tìm thấy bình luận', 404);
  const next = { ...d, intent, topic };
  const { groupKeyOf } = require('../services/live/aggregator');
  const set = {
    intent, topic,
    sentiment: intent === 'complaint' ? 'Negative' : intent === 'praise' ? 'Positive' : 'Neutral',
    groupKey: groupKeyOf(next),
    status: intent === 'question' || intent === 'complaint' ? (d.status === 'answered' ? 'answered' : 'open') : null,
    orderStatus: intent === 'order' ? d.orderStatus || 'new' : null,
    labelledBy: 'human',
    machineLabel: d.machineLabel || { intent: d.intent, topic: d.topic }
  };
  await col.updateOne({ _id: d._id }, { $set: set });
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await hub.refreshRuntime(r);
  const names = new Map((s.products || []).map((p) => [p.id, p.name]));
  res.json({ comment: hub.publicComment({ ...d, ...set }, names.get(d.productId)) });
}));

// ------------------------------------------------------------------
// Hàng đợi cần trả lời, đơn chốt
// ------------------------------------------------------------------

router.post('/sessions/:id/groups/resolve', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const key = str(req.body?.key, 200);
  const status = ['answered', 'dismissed', 'open'].includes(req.body?.status) ? req.body.status : 'answered';
  if (!key) throw bad('Thiếu khóa nhóm');
  const answer = status === 'answered' ? { text: str(req.body?.text, 600) || null, by: str(req.body?.by, 60) || 'người đứng live', provider: str(req.body?.provider, 20) || 'template', at: new Date() } : null;
  const set = { status, ...(answer ? { answer } : {}) };
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.flush();
  const out = await req.db.collection('live_comments').updateMany({ sessionId: s._id, groupKey: key, intent: { $in: ['question', 'complaint'] } }, { $set: set });
  if (r) {
    r.agg.resolve(key, status, answer);
    r.dirty = true;
    r.pushStats();
  }
  res.json({ ok: true, updated: out.modifiedCount });
}));

/** Viết lại câu gợi ý bằng LLM, chỉ dùng dữ kiện của bản mẫu */
router.post('/sessions/:id/groups/rewrite', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const key = str(req.body?.key, 200);
  const r = hub.runtimeFor(s._id, req.workspace);
  const snap = r ? r.snapshot() : await hub.rebuildSnapshot(req.db, s);
  const g = [...snap.queue, ...snap.answered].find((x) => x.key === key);
  if (!g) throw bad('Không tìm thấy nhóm câu hỏi', 404);
  const draft = g.suggestion || hub.withSuggestion(g, s).suggestion;
  const latest = g.samples?.[0] || {};
  const chatEngine = require('../services/chat_engine');
  const llm = await chatEngine.synthesize(buildRewritePrompt({ text: latest.text }, draft, { platformLabel: hub.PLATFORMS[s.platform]?.label }));
  res.json({
    text: llm ? llm.text.replace(/^["“]|["”]$/g, '').trim() : draft.text,
    provider: llm ? llm.provider : 'template',
    grounded: draft.grounded,
    facts: draft.facts
  });
}));

/** Báo cáo sau phiên: phễu, doanh thu, cầu bị lỡ, câu hỏi bỏ sót, việc cần làm */
router.get('/sessions/:id/report', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  res.json(await hub.reportFor(req.db, s, hub.runtimeFor(s._id, req.workspace)));
}));

/**
 * Đưa khiếu nại (và lời khen nếu chọn) của phiên vào kho phản hồi chính, để
 * Trust Layer, cảnh báo và báo cáo tính chung với các kênh khác. Gán nhãn bằng
 * cùng quy trình nhiều tầng như dữ liệu thu thập từ sàn. Chạy lại không tạo
 * bản trùng: bình luận đã đưa được đánh dấu.
 */
router.post('/sessions/:id/push-feedback', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const intents = req.body?.includePraise ? ['complaint', 'praise'] : ['complaint'];
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.flush();
  const col = req.db.collection('live_comments');
  const docs = await col.find({ sessionId: s._id, intent: { $in: intents }, pushedToFeedback: { $ne: true } }).sort({ ts: 1 }).limit(300).toArray();
  if (!docs.length) return res.json({ inserted: 0, duplicates: 0, message: 'Không còn bình luận nào cần đưa' });

  const { labelReviews } = require('../services/label_cascade');
  const { buildFeedbackDocs, saveFeedbacks } = require('../services/ingest');
  const { invalidate } = require('../services/analysis_context');
  const SOURCE = { tiktok: 'TikTok', youtube: 'YouTube' };
  const names = new Map((s.products || []).map((p) => [p.id, p.name]));
  const labels = await labelReviews(docs.map((d) => ({ text: d.text, rating: null })));
  // Mã bình luận live làm khóa chống trùng: tên đã che ("l***") và cùng một câu
  // khiếu nại quen thuộc của nhiều khách khác nhau không bị gộp nhầm làm một
  const raw = docs.map((d) => ({
    source: SOURCE[s.platform] || 'Livestream',
    rawText: d.text,
    author: d.author?.handle || 'Ẩn danh',
    timestamp: d.ts,
    productName: names.get(d.productId) || null,
    rating: null,
    platformFacts: { platform: `live-${s.platform}`, reviewId: String(d._id), rawCustomerId: d.author?.hash || null, verifiedPurchase: false }
  }));
  const fb = buildFeedbackDocs(raw, labels, { collectedVia: 'livestream', fallbackProduct: s.title, sourceUrl: null });
  fb.forEach((f, i) => {
    f.liveSessionId = s._id;
    f.liveCommentId = docs[i]._id;
    if (s.simulated) f.simulated = true;
  });
  const out = await saveFeedbacks(req.db, fb);
  await col.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: { pushedToFeedback: true } });
  invalidate(req.db);
  res.json({ ...out, labelled: labels.filter((l) => l?.labelledBy).length });
}));

/** Người đứng live đã làm (done) hoặc bỏ qua (dismissed) một việc trợ lý gợi ý */
router.post('/sessions/:id/actions', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const id = str(req.body?.id, 200);
  const status = ['done', 'dismissed'].includes(req.body?.status) ? req.body.status : null;
  if (!id || !status) throw bad('Thiếu mã việc hoặc trạng thái');
  const r = hub.runtimeFor(s._id, req.workspace);
  if (!r) throw bad('Phiên không còn chạy', 409);
  const entry = await r.resolveAction(id, status, str(req.body?.by, 60));
  if (!entry) throw bad('Việc này không còn hiệu lực', 404);
  res.json({ ok: true, action: entry });
}));

router.post('/sessions/:id/orders/:commentId', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const status = ['new', 'confirmed', 'cancelled'].includes(req.body?.status) ? req.body.status : null;
  if (!status || !ObjectId.isValid(req.params.commentId)) throw bad('Trạng thái hoặc mã không hợp lệ');
  const r = hub.runtimeFor(s._id, req.workspace);
  if (r) await r.flush();
  await req.db.collection('live_comments').updateOne({ _id: new ObjectId(req.params.commentId), sessionId: s._id, intent: 'order' }, { $set: { orderStatus: status } });
  if (r) {
    r.agg.setOrderStatus(req.params.commentId, status);
    r.dirty = true;
    r.pushStats();
  }
  res.json({ ok: true });
}));

// ------------------------------------------------------------------
// Xuất dữ liệu (cho người làm fine-tune và cho shop)
// ------------------------------------------------------------------

const csvCell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * ?kind=comments  mọi bình luận đã chuẩn hóa (không có tên người bình luận)
 * ?kind=qa        cặp câu hỏi - câu trả lời đã được người đứng live xác nhận
 * ?kind=orders    danh sách khách chốt đơn (có tên tài khoản, để shop xử lý)
 * ?format=jsonl|csv
 */
router.get('/sessions/:id/export', wrap(async (req, res) => {
  const s = await sessionOr404(req);
  const kind = ['comments', 'qa', 'orders'].includes(req.query.kind) ? req.query.kind : 'comments';
  const format = req.query.format === 'csv' ? 'csv' : 'jsonl';
  const names = new Map((s.products || []).map((p) => [p.id, p.name]));
  const q = { sessionId: s._id };
  if (kind === 'qa') Object.assign(q, { status: 'answered', 'answer.text': { $type: 'string' } });
  if (kind === 'orders') q.intent = 'order';
  const docs = await req.db.collection('live_comments').find(q).sort({ ts: 1 }).toArray();

  let rows;
  if (kind === 'orders') {
    rows = docs.map((d) => ({
      time: d.ts.toISOString(), handle: d.author?.handle, nickname: d.author?.nickname, product: names.get(d.productId) || '',
      size: d.variant?.size || '', color: d.variant?.color || '', quantity: d.quantity || 1, hasPhone: d.hasPhone ? 'có' : '', status: d.orderStatus || 'new', comment: d.text
    }));
  } else if (kind === 'qa') {
    rows = docs.map((d) => ({
      question: d.text, answer: d.answer.text, intent: d.intent, topic: d.topic, product: names.get(d.productId) || '', answeredBy: d.answer.provider, platform: s.platform, simulated: Boolean(s.simulated)
    }));
  } else {
    rows = docs.map((d) => ({
      text: d.text, intent: d.intent, topic: d.topic, sentiment: d.sentiment, product: names.get(d.productId) || '', productInferred: Boolean(d.productInferred),
      size: d.variant?.size || '', color: d.variant?.color || '', quantity: d.quantity, labelledBy: d.labelledBy, platform: s.platform, simulated: Boolean(s.simulated), ts: d.ts.toISOString()
    }));
  }

  const base = `live-${slug(s.title) || s._id}-${kind}`;
  if (format === 'csv') {
    const cols = rows.length ? Object.keys(rows[0]) : ['empty'];
    const body = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"` });
    return res.send(body);
  }
  res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.jsonl"` });
  res.send(rows.map((r) => JSON.stringify(r)).join('\n'));
}));

/** Thử phân loại một câu (trang Phòng thí nghiệm, kiểm thử nhanh) */
router.post('/classify', (req, res) => {
  const { classifyComment } = require('../services/live/intent');
  const text = str(req.body?.text, 1000);
  if (!text) return res.status(400).json({ error: 'Thiếu nội dung' });
  const c = classifyComment(text, { products: MEGALIVE_CATALOG });
  res.json({ ...c, suggestion: suggestAnswer({ ...c, author: null }, { products: MEGALIVE_CATALOG, policy: MEGALIVE_POLICY }) });
});

module.exports = router;
