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
const { LiveAggregator, groupKeyOf, REPLAY_PROJECTION } = require('./aggregator');
const { suggestAnswer } = require('./answer');
const { coach, measureEffect } = require('./coach');
const { stockReplay } = require('./report');
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
const FLUSH_MAX_BATCH = 2000;
const COMMENT_PUSH_MS = 200;
const COACH_EVERY_MS = 3000;
// TikTok/YouTube im lặng quá lâu (kết nối treo, không báo ngắt): tự nối lại
const STALL_MS = Number(process.env.LIVE_STALL_MS) || 3 * 60 * 1000;
const PENDING_MAX = 100000;
const BACKLOG_GRACE_MS = 2 * 60 * 1000;
// Nối lại sau khi treo: chờ giữa các lần thử (5 lần, tổng khoảng 7,5 phút)
const REOPEN_WAITS_MS = (process.env.LIVE_REOPEN_WAITS_MS || '15000,30000,60000,120000,240000').split(',').map(Number);
// Lời báo của bộ kết nối khi chủ kênh đã tắt live: kết thúc phiên, không thử lại
// Lỗi tạm thời đáng thử lại (máy chủ ký, mạng, giới hạn lượt, trang trò chuyện tạm không đọc được)
// (TikTok "tạm chặn" DEVICE_BLOCKED KHÔNG thử lại: nối thêm chỉ kéo dài thời gian bị chặn)
const TRANSIENT_RE = /máy chủ ký|sign|50\d|timeout|timed out|ECONN|socket hang up|network|giới hạn lượt|rate.?limit|429|Không đọc được trang/i;
const BLOCKED_RE = /DEVICE_BLOCKED|tạm chặn/i;
const LIVE_ENDED_RE =/đang không phát live|không đang phát live|đã kết thúc|bản phát lại|tắt tính năng trò chuyện/i;
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

// Thiếu muối bí mật thì dùng muối ngẫu nhiên của tiến trình: mã người xem vẫn
// ổn định trong lúc máy chủ chạy, nhưng không ai dò ngược được từ tên hiển thị
const PROCESS_SALT = crypto.randomBytes(24).toString('hex');

function authorHash(platform, handle) {
  if (!handle) return null;
  const salt = require('../pii_salt').saltReady() ? process.env.PII_SALT : PROCESS_SALT;
  return crypto.createHash('sha256').update(`${salt}|${platform}|${handle}`).digest('hex').slice(0, 16);
}

function platformInfo() {
  return Object.entries(PLATFORMS).map(([key, p]) => ({
    key,
    label: p.label,
    // YouTube không có khóa API vẫn đọc được khung trò chuyện công khai (youtube_public.js)
    ready: true,
    note: null
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
      // Bỏ "@" đầu tên (YouTube trả sẵn "@ten"): giao diện và câu trả lời tự thêm một "@"
      handle: ev.author?.handle ? String(ev.author.handle).replace(/^@+/, '').slice(0, 80) || null : null,
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

/**
 * Thời lượng thật sự đã live (mili giây), KHÔNG tính khoảng phiên bị ngắt (máy chủ khởi
 * động lại, mất kết nối rồi nối lại sau nhiều giờ). Phiên ghi ba trường: `activeMs` (các đoạn
 * đã chạy xong), `segmentStartedAt` (đoạn đang chạy) và `lastActiveAt` (nhịp tim của đoạn
 * đó, cập nhật mỗi 30 giây). Phiên cũ chưa có các trường này: đã kết thúc thì lấy mốc đầu đến
 * mốc cuối như trước, đang bị ngắt thì trả null (không đoán).
 */
function liveDurationMs(s, runtime, now = Date.now()) {
  if (!s || !s.startedAt) return null;
  const base = Number(s.activeMs) || 0;
  if (s.segmentStartedAt != null) {
    const start = new Date(s.segmentStartedAt).getTime();
    let end = null;
    if (runtime && runtime.status === 'live') end = now;
    else if (s.lastActiveAt) end = new Date(s.lastActiveAt).getTime();
    return end == null ? null : base + Math.max(0, end - start);
  }
  if (s.activeMs != null) return base;
  if (s.status === 'ended' && s.endedAt) return Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
  return null;
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
    // Thời lượng đã live không tính lúc bị ngắt; null nếu phiên cũ không đủ dữ liệu
    liveMs: liveDurationMs(s, runtime),
    summary: s.summary || null,
    health: runtime ? runtime.healthInfo() : null,
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

/** Nhật ký hành động kèm hiệu quả trước/sau (mới nhất trước) */
function actionHistory(agg, session) {
  return (session.actions || []).slice().reverse().map((a) => ({
    ...a,
    effect: a.status === 'done' ? measureEffect(agg, a, a.at, Date.now(), session.status === 'ended') : null
  }));
}

function decorateSnapshot(snap, session, agg, active = []) {
  return {
    ...snap,
    queue: snap.queue.map((g) => withSuggestion(g, session)),
    currentProductId: session.currentProductId || null,
    actions: { active, history: agg ? actionHistory(agg, session) : [] }
  };
}

const ACTION_COOLDOWN_MS = 10 * 60 * 1000;

// Nạp lại bình luận theo từng đợt, chỉ giữ phần cần thiết trong RAM
const REPLAY_BATCH = 500;
const RECENT_KEEP = 200;
const SEEN_KEEP = 10000;
// Trần bình luận cho phiên mô phỏng: simulator sinh khoảng 2 câu/giây, để
// chạy cả ngày thì phiên phình tới hàng trăm nghìn câu và máy chủ hết RAM
const SIM_MAX_COMMENTS = Math.max(1000, Number(process.env.LIVE_SIM_MAX_COMMENTS) || 50000);
const SIM_CAP_REASON = `Phiên mô phỏng đã đủ ${SIM_MAX_COMMENTS.toLocaleString('vi-VN')} bình luận, tự dừng để máy chủ không hết bộ nhớ`;

/** Đọc bình luận của một phiên theo thời gian, bằng cursor, bỏ các trường không dùng */
function replayCursor(db, sessionId, extra = {}) {
  return db.collection('live_comments')
    .find({ sessionId, ...extra }, { projection: REPLAY_PROJECTION })
    .sort({ ts: 1 })
    .batchSize(REPLAY_BATCH);
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
    this.flushTimer = setInterval(() => {
      this.flush().catch((e) => console.warn('[LIVE] Ghi lỗi:', e.message));
      this.touch().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    this.statsTimer = setInterval(() => { this.pushStats(); this.checkStall(); }, STATS_INTERVAL_MS);
    this.lastEventAt = Date.now();
    this.outBuf = [];
    this.pushTimer = setInterval(() => this.pushComments(), COMMENT_PUSH_MS);
    this.heartbeat = setInterval(() => this.broadcastRaw(': ping\n\n'), HEARTBEAT_MS);
    this.dirty = false;
    this.flushing = null;
    this.flushNext = null;
    this.statusSince = Date.now();
    this.health = { failingSince: null, writeFailures: 0, lastWriteError: null, lastWriteErrorAt: null, dropped: 0, reconnects: 0, recoveredAt: null };
    // Việc đã làm hoặc bỏ qua: ẩn trong ACTION_COOLDOWN_MS rồi mới được gợi ý lại
    this.suppressed = new Map((session.actions || []).map((a) => [a.id, new Date(a.at).getTime() + ACTION_COOLDOWN_MS]));
    this.lastActions = [];
  }

  /** Việc cần làm ngay theo dữ liệu hiện tại (coach.js), bỏ các việc vừa xử lý */
  activeActions() {
    const now = Date.now();
    // Việc gấp đổi chậm: tính lại tối đa mỗi COACH_EVERY_MS, các lượt đẩy số liệu
    // ở giữa dùng lại kết quả (ghi nhận làm/bỏ qua thì tính lại ngay)
    if (this.coachAt && now - this.coachAt < COACH_EVERY_MS && this.coachRaw) {
      return this.coachRaw.filter((a) => !(this.suppressed.get(a.id) > now));
    }
    this.coachRaw = coach({ agg: this.agg, session: this.session, suggestionFor: (g) => withSuggestion(g, this.session).suggestion, now });
    this.coachAt = now;
    const list = this.coachRaw.filter((a) => !(this.suppressed.get(a.id) > now));
    this.lastActions = list;
    return list;
  }

  /**
   * Ghi nhận người đứng live đã làm (done) hoặc bỏ qua (dismissed) một việc.
   * Một số việc tự thực hiện luôn: chuyển sản phẩm đang giới thiệu, đánh dấu
   * nhóm câu hỏi đã trả lời bằng câu vừa đọc trên sóng.
   */
  async resolveAction(id, status, by) {
    const a = this.lastActions.find((x) => x.id === id) || this.activeActions().find((x) => x.id === id);
    if (!a) return null;
    const entry = {
      id: a.id, type: a.type, key: a.key, title: a.title, severity: a.severity, productId: a.productId || null,
      groupKey: a.groupKey || null, watch: a.watch, variant: a.variant ?? null, script: a.script || null, lostValue: a.lostValue ?? null,
      status, by: by || null, at: new Date()
    };
    this.session.actions = [...(this.session.actions || []), entry];
    this.suppressed.set(a.id, entry.at.getTime() + ACTION_COOLDOWN_MS);
    this.coachAt = 0;
    await this.db.collection('live_sessions').updateOne({ _id: this.session._id }, { $push: { actions: entry } });
    if (status === 'done' && a.do?.kind === 'switch_product') await this.setCurrentProduct(a.do.productId);
    if (status === 'done' && a.type === 'question_burst' && a.groupKey) {
      await this.flush();
      const answer = { text: a.script || null, by: by || 'người đứng live', provider: 'on-air', at: entry.at };
      await this.db.collection('live_comments').updateMany({ sessionId: this.session._id, groupKey: a.groupKey, intent: 'question' }, { $set: { status: 'answered', answer } });
      this.agg.resolve(a.groupKey, 'answered', answer);
    }
    this.dirty = true;
    this.pushStats();
    return entry;
  }

  get id() {
    return String(this.session._id);
  }

  async preload() {
    // Phiên nối lại sau khi máy chủ khởi động lại: nạp các bình luận đã có.
    // Đọc bằng cursor từng đợt, không .toArray(): phiên 35 nghìn bình luận
    // nạp một lần làm máy chủ 512 MB hết RAM và khởi động lại.
    const recent = [];
    for await (const d of replayCursor(this.db, this.session._id)) {
      this.agg.add(d);
      if (d.platformMsgId) {
        this.seen.add(d.platformMsgId);
        if (this.seen.size > SEEN_KEEP * 2) this.seen = new Set([...this.seen].slice(-SEEN_KEEP));
      }
      recent.push(d);
      if (recent.length > RECENT_KEEP * 2) recent.splice(0, recent.length - RECENT_KEEP);
    }
    this.recent = recent.slice(-RECENT_KEEP);
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
      try { this.connector.stop(); } catch { /* đã đóng */ }
      // Lỗi tạm của bên ngoài (máy chủ ký TikTok trả 500, mạng, giới hạn lượt): thử lại giãn dần
      // thay vì bỏ phiên (23/11: phòng TikTok 1.700 người xem hỏng ngay lúc mở vì máy ký lỗi 500).
      // Sai tên, kênh không live, link hỏng thì báo lỗi ngay để người dùng sửa.
      if (this.isPlatformLive() && TRANSIENT_RE.test(e.message || '')) {
        this.error = `${e.message}. Đang thử nối lại`;
        await this.setStatus('reconnecting').catch(() => {});
        this.health.reconnects += 1;
        await new Promise((r) => { this.reopenTimer = setTimeout(r, REOPEN_WAITS_MS[0]); });
        if (this.status === 'ended' || this.disposed) return;
        await this.reopen(1);
        return;
      }
      this.error = e.message;
      await this.setStatus('error', { error: e.message });
      this.dispose();
    }
  }

  /**
   * Số mili giây của đoạn chạy trước khi bị ngắt, tính tới lần cuối còn hoạt động. Phiên cũ
   * chưa ghi nhịp tim thì ước tính tới bình luận cuối cùng đã nhận (không tính tới lúc nối lại).
   */
  priorSegmentMs() {
    const s = this.session;
    if (s.segmentStartedAt && s.lastActiveAt) {
      return Math.max(0, new Date(s.lastActiveAt).getTime() - new Date(s.segmentStartedAt).getTime());
    }
    if (s.activeMs == null && s.startedAt && this.agg.lastAt) {
      return Math.max(0, Number(this.agg.lastAt) - new Date(s.startedAt).getTime());
    }
    return 0;
  }

  /** Nhịp tim: ghi mốc còn hoạt động để biết phiên bị ngắt từ lúc nào (tối đa 30 giây một lần) */
  async touch() {
    const now = Date.now();
    if (this.status !== 'live' || !this.segmentOpen || now - (this.lastTouchAt || 0) < 30000) return;
    this.lastTouchAt = now;
    await this.db.collection('live_sessions').updateOne({ _id: this.session._id }, { $set: { lastActiveAt: new Date(now) } });
  }

  async setStatus(status, extra = {}) {
    if (status !== this.status) this.statusSince = Date.now();
    this.status = status;
    const set = { status, ...extra };
    if (status === 'live' && !this.session.startedAt) {
      set.startedAt = new Date();
      this.session.startedAt = set.startedAt;
    }
    // Mở một đoạn chạy mới: cộng dồn đoạn trước (nếu phiên được nối lại) rồi bắt đầu đếm lại
    if (status === 'live' && !this.segmentOpen) {
      const now = new Date();
      set.activeMs = (Number(this.session.activeMs) || 0) + this.priorSegmentMs();
      set.segmentStartedAt = now;
      set.lastActiveAt = now;
      this.session.activeMs = set.activeMs;
      this.session.segmentStartedAt = now;
      this.session.lastActiveAt = now;
      this.segmentOpen = true;
      this.lastTouchAt = now.getTime();
    }
    if (this.info) set.info = this.info;
    await this.db.collection('live_sessions').updateOne({ _id: this.session._id }, { $set: set });
    this.broadcast('session', publicSession({ ...this.session, ...set }, this));
  }

  onEvent(ev) {
    this.lastEventAt = Date.now();
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
        this.health.reconnects += 1;
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

  /**
   * Kết nối nền tảng treo: vẫn "mở" nhưng không còn sự kiện nào (bình luận, số
   * người xem, lượt thích) trong STALL_MS. Đóng kết nối cũ, mở lại từ đầu.
   */
  checkStall(now = Date.now()) {
    if (!this.connector || this.status !== 'live' || this.restarting) return false;
    if (this.session.platform !== 'tiktok' && this.session.platform !== 'youtube') return false;
    if (now - this.lastEventAt < STALL_MS) return false;
    this.restarting = true;
    this.health.stalls = (this.health.stalls || 0) + 1;
    this.health.reconnects += 1;
    this.error = `Không nhận được dữ liệu từ ${PLATFORMS[this.session.platform]?.label || 'nền tảng'} trong ${Math.round(STALL_MS / 60000)} phút, đang nối lại`;
    this.setStatus('reconnecting').catch(() => {});
    try { this.connector.stop(); } catch { /* đã đóng */ }
    this.lastEventAt = now;
    this.reopen(0)
      .catch(() => {})
      .finally(() => { this.restarting = false; });
    return true;
  }

  /**
   * Mở lại kết nối nền tảng sau khi treo. Lỗi thoáng qua (mạng, máy chủ ký của TikTok)
   * thì thử lại giãn dần thay vì bỏ phiên; nền tảng báo chủ kênh đã tắt live thì kết
   * thúc phiên như bình thường; thử hết lượt vẫn lỗi mới báo lỗi.
   */
  async reopen(attempt) {
    if (this.status === 'ended') return;
    const connector = this.connectorFor();
    this.connector = connector;
    try {
      await connector.start((ev) => this.onEvent(ev));
      if (this.status !== 'live') await this.setStatus('live');
      this.error = null;
    } catch (e) {
      try { connector.stop(); } catch { /* đã đóng */ }
      if (LIVE_ENDED_RE.test(e.message || '')) {
        await this.stop(e.message);
        return;
      }
      if (attempt + 1 >= REOPEN_WAITS_MS.length || BLOCKED_RE.test(e.message || '')) {
        this.error = e.message;
        await this.setStatus('error', { error: e.message });
        this.dispose();
        return;
      }
      this.error = `${e.message}. Đang thử nối lại`;
      await this.setStatus('reconnecting').catch(() => {});
      this.health.reconnects += 1;
      await new Promise((r) => { this.reopenTimer = setTimeout(r, REOPEN_WAITS_MS[attempt]); });
      if (this.status === 'ended' || this.disposed) return;
      await this.reopen(attempt + 1);
    }
  }

  /** Phiên đọc từ nền tảng live thật (không phải nhập tay, webhook hay mô phỏng) */
  isPlatformLive() {
    return this.session.platform === 'tiktok' || this.session.platform === 'youtube';
  }

  /** Phiên mô phỏng đã chạm trần bình luận */
  overCap() {
    return this.session.platform === 'simulator' && this.agg.total >= SIM_MAX_COMMENTS;
  }

  /** @returns {object|null} tài liệu đã nhận, null nếu trùng hoặc rỗng */
  ingest(ev) {
    if (!ev.text || !String(ev.text).trim()) return null;
    if (this.overCap()) {
      if (!this.capping) {
        this.capping = true;
        this.stop(SIM_CAP_REASON).catch((e) => console.warn('[LIVE] Dừng phiên lỗi:', e.message));
      }
      return null;
    }
    // TikTok/YouTube trả kèm tin cũ lúc mới nối (YouTube tới vài chục tin, có tin từ cả giờ
    // trước): tin viết trước khi mở phiên quá BACKLOG_GRACE_MS không tính, kẻo thành "khách
    // đang chờ 56 phút" trong phiên mới mở. Tin trong lúc máy chủ khởi động lại vẫn giữ.
    if (this.isPlatformLive() && ev.ts) {
      const t = new Date(ev.ts).getTime();
      const opened = new Date(this.session.createdAt || this.session.startedAt || Date.now()).getTime();
      if (Number.isFinite(t) && t < opened - BACKLOG_GRACE_MS) {
        this.health.skippedOld = (this.health.skippedOld || 0) + 1;
        return null;
      }
    }
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
    // Gom bình luận, đẩy theo lô mỗi COMMENT_PUSH_MS: giờ cao điểm 500 bình luận/giây
    // với 50 màn hình xem là 25.000 lượt ghi SSE mỗi giây nếu đẩy từng cái
    if (this.subscribers.size) this.outBuf.push(publicComment(doc, this.agg.productName(doc.productId)));
    this.dirty = true;
    return doc;
  }

  /**
   * Ghi các bình luận đang chờ. Mỗi lời gọi chỉ chờ tới lượt ghi có chứa bình
   * luận của chính nó: đang có lượt ghi thì xếp đúng MỘT lượt nối tiếp, lượt đó
   * lấy hết bình luận đến trong lúc chờ (webhook dồn dập không sinh hàng trăm
   * lượt ghi, cũng không bắt yêu cầu nào chờ hàng chờ cạn).
   * Ghi lỗi (mạng, Atlas chập chờn) thì trả phần chưa ghi về đầu hàng chờ để
   * lượt sau ghi tiếp, không bỏ bình luận nào: tài liệu đã có _id nên phần đã
   * vào rồi chỉ báo trùng khóa, được bỏ qua.
   */
  flush() {
    if (this.flushing) {
      if (!this.flushNext) {
        this.flushNext = this.flushing.catch(() => {}).then(() => {
          this.flushNext = null;
          return this.flushOnce();
        });
      }
      return this.flushNext;
    }
    return this.flushOnce();
  }

  flushOnce() {
    if (!this.pending.length) return Promise.resolve();
    const batch = this.pending.splice(0);
    this.flushing = (async () => {
      try {
        for (let i = 0; i < batch.length; i += FLUSH_MAX_BATCH) {
          const part = batch.slice(i, i + FLUSH_MAX_BATCH);
          try {
            await this.db.collection('live_comments').insertMany(part, { ordered: false });
          } catch (e) {
            const dupOnly = e.code === 11000 || (Array.isArray(e.writeErrors) && e.writeErrors.length && e.writeErrors.every((w) => w.code === 11000));
            if (dupOnly) continue;
            const failed = Array.isArray(e.writeErrors) && e.writeErrors.length
              ? part.filter((_, k) => e.writeErrors.some((w) => w.index === k && w.code !== 11000))
              : part;
            this.pending.unshift(...failed, ...batch.slice(i + FLUSH_MAX_BATCH));
            if (this.pending.length > PENDING_MAX) {
              // Atlas mất quá lâu: giữ phần mới nhất để không hết RAM, đếm phần bỏ để báo
              const drop = this.pending.length - PENDING_MAX;
              this.pending.splice(0, drop);
              this.health.dropped += drop;
            }
            if (!this.health.writeFailures) this.health.failingSince = new Date();
            this.health.writeFailures += 1;
            this.health.lastWriteError = e.message;
            this.health.lastWriteErrorAt = new Date();
            this.dirty = true;
            throw e;
          }
        }
        if (this.health.writeFailures) {
          this.health.recoveredAt = new Date();
          this.health.writeFailures = 0;
          this.health.failingSince = null;
          this.dirty = true;
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Tình trạng kỹ thuật của phiên, cho giao diện và quản gia báo Zalo */
  healthInfo() {
    return {
      pendingWrites: this.pending.length,
      writeFailures: this.health.writeFailures,
      failingSince: this.health.failingSince,
      status: this.status,
      statusSince: new Date(this.statusSince),
      lastWriteError: this.health.lastWriteError,
      lastWriteErrorAt: this.health.lastWriteErrorAt,
      dropped: this.health.dropped,
      reconnects: this.health.reconnects,
      subscribers: this.subscribers.size
    };
  }

  snapshot() {
    const snap = decorateSnapshot(this.agg.snapshot(), this.session, this.agg, this.status === 'ended' ? [] : this.activeActions());
    snap.health = this.healthInfo();
    return snap;
  }

  pushComments() {
    if (!this.outBuf.length) return;
    const batch = this.outBuf;
    this.outBuf = [];
    this.broadcast('comments', batch);
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
    // Doanh thu ước tính từ bình luận chốt, để so sánh giữa các phiên
    try {
      const comments = await replayCursor(this.db, this.session._id, { intent: 'order' }).toArray();
      const money = stockReplay(comments, this.session.products || []);
      summary.revenue = money.revenue;
      summary.lostRevenue = money.lost.reduce((s, l) => s + l.value, 0);
    } catch (e) {
      console.warn('[LIVE] Không tính được doanh thu:', e.message);
    }
    this.session.endedAt = new Date();
    this.session.summary = summary;
    // Chốt thời lượng: cộng đoạn đang chạy vào tổng, bỏ mốc đoạn
    let activeMs = Number(this.session.activeMs) || 0;
    if (this.segmentOpen && this.session.segmentStartedAt) {
      activeMs += Math.max(0, this.session.endedAt.getTime() - new Date(this.session.segmentStartedAt).getTime());
    }
    this.session.activeMs = activeMs;
    delete this.session.segmentStartedAt;
    delete this.session.lastActiveAt;
    this.segmentOpen = false;
    await this.db.collection('live_sessions').updateOne(
      { _id: this.session._id },
      { $set: { status: 'ended', endedAt: this.session.endedAt, endReason: reason || null, summary, activeMs }, $unset: { segmentStartedAt: '', lastActiveAt: '' } }
    );
    this.session.status = 'ended';
    this.broadcast('session', publicSession(this.session, this));
    this.broadcast('stats', this.snapshot());
    this.dispose();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.reopenTimer);
    clearInterval(this.flushTimer);
    clearInterval(this.statsTimer);
    clearInterval(this.pushTimer);
    this.pushComments();
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

/** Số phiên live đang chạy trong tiến trình này (để việc nặng khác nhường CPU) */
function activeCount() {
  let n = 0;
  for (const r of runtimes.values()) if (r.status !== 'ended') n += 1;
  return n;
}

function runtimeFor(id, workspace) {
  const r = runtimes.get(String(id));
  return r && r.workspace === workspace ? r : null;
}

async function loadSession(db, id) {
  if (!ObjectId.isValid(id)) return null;
  return db.collection('live_sessions').findOne({ _id: new ObjectId(id) });
}

/**
 * TỰ NỐI LẠI SAU KHI MÁY CHỦ KHỞI ĐỘNG LẠI
 * Render triển khai bản mới hay tự khởi động lại giữa giờ live thì phiên mất
 * runtime trong bộ nhớ. Phiên còn hoạt động trong AUTO_RESUME_MIN phút gần
 * nhất được nối lại ngay (nạp bình luận cũ rồi kết nối lại nền tảng); phiên
 * mô phỏng đã đủ trần thì để yên. Trả về danh sách phiên đã nối lại.
 */
async function autoResume(workspaces, { minutes = Number(process.env.LIVE_AUTO_RESUME_MIN) || 20, now = new Date() } = {}) {
  const since = new Date(now.getTime() - minutes * 60000);
  const resumed = [];
  for (const [ws, db] of Object.entries(workspaces)) {
    const list = await db.collection('live_sessions').find({
      status: { $in: ['connecting', 'live', 'reconnecting'] },
      $or: [{ lastActiveAt: { $gte: since } }, { lastActiveAt: null, createdAt: { $gte: since } }]
    }).limit(10).toArray();
    for (const s of list) {
      if (runtimeFor(s._id, ws)) continue;
      if (s.platform === 'simulator' && ws !== 'demo') continue;
      try {
        if (s.platform === 'simulator') {
          const n = await db.collection('live_comments').countDocuments({ sessionId: s._id });
          if (n >= SIM_MAX_COMMENTS) continue;
        }
        const resumes = (Number(s.autoResumes) || 0) + 1;
        await db.collection('live_sessions').updateOne({ _id: s._id }, { $set: { status: 'connecting', error: null, autoResumedAt: now, autoResumes: resumes } });
        await startSession(db, ws, { ...s, status: 'connecting', error: null, autoResumedAt: now, autoResumes: resumes }, { retry: true });
        resumed.push({ workspace: ws, id: String(s._id), title: s.title });
      } catch (e) {
        console.warn(`[LIVE] Không tự nối lại được phiên ${s._id}:`, e.message);
      }
    }
  }
  return resumed;
}

/** Ghi nốt bình luận đang chờ của mọi phiên, trước khi tiến trình tắt */
async function flushAll(timeoutMs = 8000) {
  const all = [...runtimes.values()].map((r) => r.flush().catch((e) => console.warn('[LIVE] Ghi nốt lỗi:', e.message)));
  await Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/**
 * GIỮ MÁY CHỦ THỨC KHI ĐANG LIVE
 * Render gói miễn phí ngủ sau 15 phút không có request vào. Phiên TikTok mà
 * không ai mở trang web và không có webhook thì máy chủ có thể ngủ giữa phiên.
 * Còn phiên nào đang chạy thì tự gọi địa chỉ công khai của chính mình mỗi
 * LIVE_KEEPALIVE_MS (Render coi đó là request vào); hết phiên thì thôi.
 */
const LIVE_KEEPALIVE_MS = Number(process.env.LIVE_KEEPALIVE_MS) || 10 * 60 * 1000;
let keepAliveTimer = null;
function ensureLiveKeepAlive() {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.LIVE_KEEPALIVE_URL || '').replace(/\/+$/, '');
  if (!base || keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (activeCount() === 0) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
      return;
    }
    fetch(`${base}/health/live`, { signal: AbortSignal.timeout(15000) }).catch(() => {});
  }, LIVE_KEEPALIVE_MS);
  if (keepAliveTimer.unref) keepAliveTimer.unref();
}

/**
 * @param {{ retry?: boolean }} opts retry: lỗi kết nối thì thử lại giãn dần (tự nối lại sau khi
 *   máy chủ khởi động lại: TikTok hay chặn tạm lúc vừa bật, không nên bỏ phiên ngay). Người bấm
 *   mở phiên mới thì không thử lại, để thấy lỗi ngay.
 */
async function startSession(db, workspace, session, { retry = false } = {}) {
  await ensureIndexes(db);
  const r = new Runtime(session, db, workspace);
  runtimes.set(r.id, r);
  ensureLiveKeepAlive();
  if (session.startedAt) await r.preload();
  if (r.overCap()) {
    await r.stop(SIM_CAP_REASON);
    return r;
  }
  if (retry && r.isPlatformLive()) r.reopen(0).catch((e) => console.warn('[LIVE] Nối lại lỗi:', e.message));
  else r.start();
  return r;
}

/**
 * BỘ NHỚ CHO PHIÊN KHÔNG CÒN CHẠY
 * Số liệu và báo cáo của phiên đã kết thúc chỉ đổi khi có thao tác ghi (đánh
 * dấu đơn, sửa nhãn, nhập bổ sung, sửa danh mục). Mỗi lần mở lại phiên, giao
 * diện gọi 3-4 API và trước đây mỗi API đọc lại toàn bộ bình luận của phiên.
 * Mọi request ghi vào /sessions/:id gọi dropMemo (routes/live.js).
 */
const idleMemo = new Map();
const memoVersion = new Map();
const IDLE_MEMO_TTL_MS = 10 * 60 * 1000;

function dropMemo(id) {
  const key = String(id);
  idleMemo.delete(key);
  memoVersion.set(key, (memoVersion.get(key) || 0) + 1);
  if (memoVersion.size > 500) memoVersion.clear();
}

async function memoized(id, kind, fn) {
  const key = String(id);
  const hit = idleMemo.get(key);
  if (hit && Date.now() - hit.at < IDLE_MEMO_TTL_MS && hit[kind]) return hit[kind];
  const version = memoVersion.get(key) || 0;
  const value = await fn();
  // Có thao tác ghi trong lúc đang dựng: kết quả này đã cũ, không nhớ
  if ((memoVersion.get(key) || 0) === version) {
    const entry = idleMemo.get(key);
    if (entry && Date.now() - entry.at < IDLE_MEMO_TTL_MS) entry[kind] = value;
    else idleMemo.set(key, { at: Date.now(), [kind]: value });
    if (idleMemo.size > 50) idleMemo.delete(idleMemo.keys().next().value);
  }
  return value;
}

/** Báo cáo của một phiên; phiên đang chạy thì luôn tính mới */
async function reportFor(db, session, runtime) {
  const { buildReport } = require('./report');
  if (runtime) {
    await runtime.flush();
    return buildReport(db, { ...session, ...runtime.session, summary: { ...(session.summary || {}), viewers: runtime.agg.viewers } });
  }
  return memoized(session._id, 'report', () => buildReport(db, session));
}

/** Số liệu của phiên không còn chạy: dựng lại từ các bình luận đã lưu */
function rebuildSnapshot(db, session) {
  return memoized(session._id, 'snapshot', () => buildSnapshot(db, session));
}

async function buildSnapshot(db, session) {
  const agg = new LiveAggregator(session);
  for await (const d of replayCursor(db, session._id)) agg.add(d);
  if (session.summary?.viewers) {
    agg.viewers = { ...session.summary.viewers };
  }
  if (session.summary?.likes != null) agg.likes = session.summary.likes;
  return decorateSnapshot(agg.snapshot({ now: agg.lastAt || Date.now() }), session, agg, []);
}

/** Sau khi sửa nhãn hay trạng thái trên phiên đang chạy: dựng lại bộ tổng hợp */
async function refreshRuntime(runtime) {
  const agg = new LiveAggregator(runtime.session);
  agg.viewers = { ...runtime.agg.viewers };
  agg.likes = runtime.agg.likes;
  await runtime.flush();
  for await (const d of replayCursor(runtime.db, runtime.session._id)) agg.add(d);
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
  liveDurationMs,
  withSuggestion,
  runtimeFor,
  activeCount,
  ensureLiveKeepAlive,
  liveKeepAliveOn: () => Boolean(keepAliveTimer),
  loadSession,
  startSession,
  autoResume,
  flushAll,
  rebuildSnapshot,
  reportFor,
  dropMemo,
  refreshRuntime,
  summarize,
  authorHash,
  SIM_MAX_COMMENTS,
  SIM_CAP_REASON,
  Runtime,
  _runtimes: runtimes
};
