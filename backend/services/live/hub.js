/**
 * ĐIỀU PHỐI PHIÊN LIVE
 * ==================================================================
 * Mỗi phiên đang chạy có một Runtime trong bộ nhớ:
 *   bộ kết nối nền tảng  ->  phân loại (intent.js)  ->  tổng hợp (aggregator.js)
 *                                                  ->  ghi MongoDB theo lô
 *                                                  ->  đẩy xuống trình duyệt (SSE)
 *
 * Lưu trữ:
 *   live_sessions  một phiên: nền tảng, tài khoản, danh mục sản phẩm, chính
 *                  sách bán hàng, trạng thái, số liệu chốt lúc kết thúc
 *   live_comments  mỗi bình luận: chữ đã che thông tin cá nhân, ý định, chủ
 *                  đề, sản phẩm, biến thể, trạng thái xử lý, câu trả lời
 *
 * Tên tài khoản của người bình luận được giữ (người bán cần nó để xác nhận
 * đơn, và nó vốn công khai trên phiên live), kèm mã băm có muối để đếm người
 * mà không cần tên. Số điện thoại, email khách gõ vào bình luận bị che trước
 * khi ghi; chỉ giữ cờ `hasPhone` để người bán biết mà nhắn riêng.
 *
 * Máy chủ khởi động lại giữa phiên thì Runtime mất; phiên được báo "bị ngắt"
 * và nối lại được bằng một nút bấm. Bình luận đã ghi không mất.
 */

const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { classifyComment, INTENT_LABEL, TOPIC_LABEL } = require('./intent');
const { LiveAggregator, groupKeyOf } = require('./aggregator');
const { suggestAnswer } = require('./answer');
const { createTikTokConnector } = require('./connectors/tiktok');
const { createYouTubeConnector } = require('./connectors/youtube');
const { createSimulator } = require('./connectors/simulator');

const PLATFORMS = {
  tiktok: { label: 'TikTok Live', live: true },
  youtube: { label: 'YouTube Live', live: true },
  manual: { label: 'Nhập tay hoặc webhook', live: false },
  simulator: { label: 'Mô phỏng megalive', live: true }
};

const STATS_INTERVAL_MS = 1500;
const FLUSH_INTERVAL_MS = 700;
const HEARTBEAT_MS = 15000;

const runtimes = new Map();
const indexed = new WeakSet();

async function ensureIndexes(db) {
  if (indexed.has(db)) return;
  indexed.add(db);
  await Promise.allSettled([
    db.collection('live_sessions').createIndex({ createdAt: -1 }),
    db.collection('live_comments').createIndex({ sessionId: 1, ts: 1 }),
    db.collection('live_comments').createIndex({ sessionId: 1, groupKey: 1 }),
    db.collection('live_comments').createIndex(
      { sessionId: 1, platformMsgId: 1 },
      { unique: true, partialFilterExpression: { platformMsgId: { $type: 'string' } } }
    )
  ]);
}

function authorHash(platform, handle) {
  if (!handle) return null;
  return crypto.createHash('sha256').update(`${process.env.PII_SALT || 'live'}|${platform}|${handle}`).digest('hex').slice(0, 16);
}

function platformInfo() {
  return Object.entries(PLATFORMS).map(([key, p]) => ({
    key,
    label: p.label,
    ready: key === 'youtube' ? Boolean(process.env.YOUTUBE_API_KEY) : true,
    note: key === 'youtube' && !process.env.YOUTUBE_API_KEY ? 'Máy chủ chưa có YOUTUBE_API_KEY' : null
  }));
}

/** Bình luận thô từ bộ kết nối -> tài liệu lưu trong live_comments */
function buildCommentDoc(session, ev) {
  const c = classifyComment(ev.text, { products: session.products || [] });
  const inferred = !c.productId && (c.intent === 'question' || c.intent === 'order') && session.currentProductId;
  const doc = {
    _id: new ObjectId(),
    sessionId: session._id,
    platform: session.platform,
    platformMsgId: ev.platformMsgId ? String(ev.platformMsgId) : null,
    ts: ev.ts ? new Date(ev.ts) : new Date(),
    receivedAt: new Date(),
    author: {
      handle: ev.author?.handle ? String(ev.author.handle).slice(0, 80) : null,
      nickname: ev.author?.nickname ? String(ev.author.nickname).slice(0, 80) : null,
      hash: authorHash(session.platform, ev.author?.platformUserId || ev.author?.handle)
    },
    text: c.text.slice(0, 500),
    piiTypes: c.piiTypes,
    hasPhone: c.hasPhone,
    intent: c.intent,
    topic: c.topic,
    sentiment: c.sentiment,
    productId: c.productId || (inferred ? session.currentProductId : null),
    productInferred: Boolean(inferred),
    variant: c.variant,
    quantity: c.quantity,
    body: c.body,
    reasons: c.reasons,
    labelledBy: 'rules',
    status: c.intent === 'question' || c.intent === 'complaint' ? 'open' : null,
    orderStatus: c.intent === 'order' ? 'new' : null
  };
  if (Number.isNaN(doc.ts.getTime())) doc.ts = new Date();
  doc.groupKey = groupKeyOf(doc);
  return doc;
}

function publicComment(d, productName) {
  return {
    id: String(d._id),
    ts: d.ts,
    author: { handle: d.author?.handle || null, nickname: d.author?.nickname || null },
    text: d.text,
    intent: d.intent,
    intentLabel: INTENT_LABEL[d.intent],
    topic: d.topic,
    topicLabel: d.topic ? TOPIC_LABEL[d.topic] : null,
    productId: d.productId,
    productName: productName || null,
    productInferred: Boolean(d.productInferred),
    variant: d.variant || {},
    quantity: d.quantity,
    hasPhone: Boolean(d.hasPhone),
    groupKey: d.groupKey,
    status: d.status,
    labelledBy: d.labelledBy
  };
}

function publicSession(s, runtime) {
  const status = runtime ? runtime.status : (s.status === 'live' || s.status === 'connecting' || s.status === 'reconnecting') ? 'interrupted' : s.status;
  return {
    id: String(s._id),
    title: s.title,
    platform: s.platform,
    platformLabel: PLATFORMS[s.platform]?.label || s.platform,
    target: s.target,
    status,
    error: runtime?.error || s.error || null,
    simulated: Boolean(s.simulated),
    products: s.products || [],
    policy: s.policy || {},
    currentProductId: s.currentProductId || null,
    info: runtime?.info || s.info || null,
    createdAt: s.createdAt,
    startedAt: s.startedAt || null,
    endedAt: s.endedAt || null,
    summary: s.summary || null,
    ingestKey: s.ingestKey
  };
}

/** Gợi ý trả lời cho một thẻ trong hàng đợi */
function withSuggestion(g, session) {
  const latest = g.samples?.[0] || {};
  const s = suggestAnswer({
    intent: g.intent,
    topic: g.topic,
    productId: g.productId,
    variant: { ...(latest.variant || {}), ...(g.size ? { size: g.size } : {}) },
    body: latest.body,
    author: g.count > 1 ? null : { handle: latest.handle }
  }, session);
  return { ...g, suggestion: s };
}

function decorateSnapshot(snap, session) {
  return {
    ...snap,
    queue: snap.queue.map((g) => withSuggestion(g, session)),
    currentProductId: session.currentProductId || null
  };
}

// ==================================================================
// Runtime
// ==================================================================

class Runtime {
  constructor(session, db, workspace) {
    this.session = session;
    this.db = db;
    this.workspace = workspace;
    this.status = 'connecting';
    this.error = null;
    this.info = null;
    this.agg = new LiveAggregator(session);
    this.subscribers = new Set();
    this.pending = [];
    this.seen = new Set();
    this.recent = [];
    this.connector = null;
    this.flushTimer = setInterval(() => this.flush().catch((e) => console.warn('[LIVE] Ghi lỗi:', e.message)), FLUSH_INTERVAL_MS);
    this.statsTimer = setInterval(() => this.pushStats(), STATS_INTERVAL_MS);
    this.heartbeat = setInterval(() => this.broadcastRaw(': ping\n\n'), HEARTBEAT_MS);
    this.dirty = false;
  }

  get id() {
    return String(this.session._id);
  }

  async preload() {
    // Phiên nối lại sau khi máy chủ khởi động lại: nạp các bình luận đã có
    const docs = await this.db.collection('live_comments').find({ sessionId: this.session._id }).sort({ ts: 1 }).toArray();
    for (const d of docs) {
      this.agg.add(d);
      if (d.platformMsgId) this.seen.add(d.platformMsgId);
    }
    this.recent = docs.slice(-200);
    const s = this.session.summary;
    if (s?.viewers?.peak) this.agg.setViewers(s.viewers.now || s.viewers.peak);
  }

  connectorFor() {
    const s = this.session;
    if (s.platform === 'tiktok') return createTikTokConnector({ target: s.target });
    if (s.platform === 'youtube') return createYouTubeConnector({ target: s.target });
    if (s.platform === 'simulator') return createSimulator({ products: s.products, speed: s.speed || 1, seed: s.seed });
    return null;
  }

  async start() {
    this.connector = this.connectorFor();
    if (!this.connector) {
      // Nhập tay, webhook: không có kết nối nền tảng, phiên mở ngay
      await this.setStatus('live');
      return;
    }
    try {
      await this.connector.start((ev) => this.onEvent(ev));
      if (this.status === 'connecting') await this.setStatus('live');
    } catch (e) {
      this.error = e.message;
      await this.setStatus('error', { error: e.message });
      this.dispose();
    }
  }

  async setStatus(status, extra = {}) {
    this.status = status;
    const set = { status, ...extra };
    if (status === 'live' && !this.session.startedAt) {
      set.startedAt = new Date();
      this.session.startedAt = set.startedAt;
    }
    if (this.info) set.info = this.info;
    await this.db.collection('live_sessions').updateOne({ _id: this.session._id }, { $set: set });
    this.broadcast('session', publicSession({ ...this.session, ...set }, this));
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'comment':
        this.ingest(ev);
        break;
      case 'viewers':
        this.agg.setViewers(ev.count);
        this.dirty = true;
        break;
      case 'likes':
        this.agg.setLikes(ev.total);
        this.dirty = true;
        break;
      case 'product':
        this.setCurrentProduct(ev.productId).catch(() => {});
        break;
      case 'connected':
        this.info = ev.info || null;
        this.error = null;
        this.setStatus('live').catch(() => {});
        break;
      case 'reconnecting':
        this.setStatus('reconnecting').catch(() => {});
        break;
      case 'end':
        this.stop(ev.reason || 'Phiên live đã kết thúc').catch(() => {});
        break;
      case 'error':
        this.error = ev.message;
        this.setStatus('error', { error: ev.message }).catch(() => {});
        break;
      default:
    }
  }

  /** @returns {object|null} tài liệu đã nhận, null nếu trùng hoặc rỗng */
  ingest(ev) {
    if (!ev.text || !String(ev.text).trim()) return null;
    if (ev.platformMsgId) {
      const k = String(ev.platformMsgId);
      if (this.seen.has(k)) return null;
      this.seen.add(k);
      if (this.seen.size > 20000) this.seen = new Set([...this.seen].slice(-10000));
    }
    const doc = buildCommentDoc(this.session, ev);
    this.agg.add(doc);
    this.pending.push(doc);
    this.recent.push(doc);
    if (this.recent.length > 300) this.recent.splice(0, this.recent.length - 200);
    this.broadcast('comment', publicComment(doc, this.agg.productName(doc.productId)));
    this.dirty = true;
    return doc;
  }

  async flush() {
    if (!this.pending.length) return;
    const batch = this.pending.splice(0);
    try {
      await this.db.collection('live_comments').insertMany(batch, { ordered: false });
    } catch (e) {
      // Trùng khóa (bình luận đã có từ lần kết nối trước) thì bỏ qua
      if (e.code !== 11000 && !e.writeErrors?.every((w) => w.code === 11000)) throw e;
    }
  }

  snapshot() {
    return decorateSnapshot(this.agg.snapshot(), this.session);
  }

  pushStats() {
    if (!this.dirty || !this.subscribers.size) return;
    this.dirty = false;
    this.broadcast('stats', this.snapshot());
  }

  subscribe(res) {
    this.subscribers.add(res);
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('session', publicSession(this.session, this));
    send('stats', this.snapshot());
    send('backlog', this.recent.slice(-120).map((d) => publicComment(d, this.agg.productName(d.productId))));
    return () => this.subscribers.delete(res);
  }

  broadcastRaw(chunk) {
    for (const res of this.subscribers) {
      try { res.write(chunk); } catch { this.subscribers.delete(res); }
    }
  }

  broadcast(event, data) {
    if (!this.subscribers.size) return;
    this.broadcastRaw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async setCurrentProduct(productId) {
    const exists = (this.session.products || []).some((p) => p.id === productId);
    this.session.currentProductId = exists ? productId : null;
    await this.db.collection('live_sessions').updateOne({ _id: this.session._id }, { $set: { currentProductId: this.session.currentProductId } });
    this.broadcast('session', publicSession(this.session, this));
    this.dirty = true;
  }

  async stop(reason) {
    if (this.status === 'ended') return;
    this.connector?.stop();
    await this.flush().catch(() => {});
    this.status = 'ended';
    const snap = this.agg.snapshot();
    const summary = summarize(snap);
    this.session.endedAt = new Date();
    this.session.summary = summary;
    await this.db.collection('live_sessions').updateOne(
      { _id: this.session._id },
      { $set: { status: 'ended', endedAt: this.session.endedAt, endReason: reason || null, summary } }
    );
    this.session.status = 'ended';
    this.broadcast('session', publicSession(this.session, this));
    this.broadcast('stats', this.snapshot());
    this.dispose();
  }

  dispose() {
    clearInterval(this.flushTimer);
    clearInterval(this.statsTimer);
    // Giữ kết nối SSE thêm một nhịp để trình duyệt nhận trạng thái cuối
    setTimeout(() => {
      clearInterval(this.heartbeat);
      for (const res of this.subscribers) {
        try { res.end(); } catch { /* đã đóng */ }
      }
      this.subscribers.clear();
    }, 1000);
    if (runtimes.get(this.id) === this) runtimes.delete(this.id);
  }
}

/** Số liệu chốt lưu cùng phiên, để trang danh sách phiên không phải dựng lại */
function summarize(snap) {
  return {
    comments: snap.totals.comments,
    byIntent: snap.totals.byIntent,
    commenters: snap.totals.commenters,
    orderQuantity: snap.totals.orderQuantity,
    answeredShare: snap.totals.answeredShare,
    viewers: snap.viewers,
    likes: snap.likes,
    topProduct: snap.products[0] ? { id: snap.products[0].id, name: snap.products[0].name, orders: snap.products[0].orders } : null,
    topTopic: snap.topics[0] || null,
    openQueue: snap.queueOpen
  };
}

// ==================================================================
// API cho routes
// ==================================================================

function runtimeFor(id, workspace) {
  const r = runtimes.get(String(id));
  return r && r.workspace === workspace ? r : null;
}

async function loadSession(db, id) {
  if (!ObjectId.isValid(id)) return null;
  return db.collection('live_sessions').findOne({ _id: new ObjectId(id) });
}

async function startSession(db, workspace, session) {
  await ensureIndexes(db);
  const r = new Runtime(session, db, workspace);
  runtimes.set(r.id, r);
  if (session.startedAt) await r.preload();
  r.start();
  return r;
}

/** Số liệu của phiên không còn chạy: dựng lại từ các bình luận đã lưu */
async function rebuildSnapshot(db, session) {
  const agg = new LiveAggregator(session);
  const cursor = db.collection('live_comments').find({ sessionId: session._id }).sort({ ts: 1 });
  for await (const d of cursor) agg.add(d);
  if (session.summary?.viewers) {
    agg.viewers = { ...session.summary.viewers };
  }
  if (session.summary?.likes != null) agg.likes = session.summary.likes;
  return decorateSnapshot(agg.snapshot({ now: agg.lastAt || Date.now() }), session);
}

/** Sau khi sửa nhãn hay trạng thái trên phiên đang chạy: dựng lại bộ tổng hợp */
async function refreshRuntime(runtime) {
  const agg = new LiveAggregator(runtime.session);
  agg.viewers = { ...runtime.agg.viewers };
  agg.likes = runtime.agg.likes;
  await runtime.flush();
  const cursor = runtime.db.collection('live_comments').find({ sessionId: runtime.session._id }).sort({ ts: 1 });
  for await (const d of cursor) agg.add(d);
  runtime.agg = agg;
  runtime.dirty = true;
  runtime.pushStats();
}

module.exports = {
  PLATFORMS,
  platformInfo,
  ensureIndexes,
  buildCommentDoc,
  publicComment,
  publicSession,
  withSuggestion,
  runtimeFor,
  loadSession,
  startSession,
  rebuildSnapshot,
  refreshRuntime,
  summarize,
  authorHash,
  _runtimes: runtimes
};
