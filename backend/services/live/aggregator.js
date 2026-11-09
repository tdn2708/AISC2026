/**
 * TỔNG HỢP SỐ LIỆU MỘT PHIÊN LIVE
 * ==================================================================
 * Nhận từng bình luận đã phân loại, giữ các con số người đứng live cần nhìn:
 * nhịp bình luận theo phút, số người xem, sản phẩm được hỏi và được chốt
 * nhiều nhất, và HÀNG ĐỢI CẦN TRẢ LỜI.
 *
 * Hàng đợi gom các câu hỏi giống nhau (cùng chủ đề, cùng sản phẩm, cùng size
 * nếu là câu hỏi tồn kho) thành một thẻ: lúc cao điểm 40 người cùng hỏi "giá
 * bao nhiêu", người đứng live trả lời một lần trên sóng là xong cả 40. Khiếu
 * nại thì không gom: mỗi khiếu nại là một khách cụ thể cần được xử lý.
 *
 * Dùng chung cho phiên đang chạy (bộ nhớ) và phiên đã kết thúc (dựng lại từ
 * các bình luận đã lưu), nên hai nơi luôn ra cùng một con số.
 */

const { TOPIC_LABEL, INTENT_LABEL } = require('./intent');

const MINUTE = 60 * 1000;
const NEEDS_ANSWER = new Set(['question', 'complaint']);

/** Khóa gom nhóm; ghi kèm vào bình luận khi lưu để đánh dấu "đã trả lời" theo nhóm */
function groupKeyOf(c) {
  if (c.intent === 'complaint') return `complaint|${c._id}`;
  if (c.intent !== 'question') return null;
  const size = c.topic === 'stock' || c.topic === 'size' ? c.variant?.size || '' : '';
  return `q|${c.topic || 'other'}|${c.productId || '-'}|${size}`;
}

class LiveAggregator {
  constructor(session = {}) {
    this.products = new Map((session.products || []).map((p) => [p.id, p]));
    this.total = 0;
    this.byIntent = { complaint: 0, question: 0, order: 0, praise: 0, chatter: 0 };
    this.minutes = new Map();
    this.authors = new Set();
    this.viewers = { now: null, peak: null };
    this.likes = null;
    this.productStats = new Map();
    this.topics = new Map();
    this.groups = new Map();
    this.orders = [];
    this.firstAt = null;
    // Nhật ký gọn từng bình luận cho bộ gợi ý hành động (coach.js):
    // so nhịp 3 phút gần nhất với 3 phút trước, đếm cầu theo biến thể…
    this.events = [];
    this.lastAt = null;
  }

  setProducts(products = []) {
    this.products = new Map(products.map((p) => [p.id, p]));
  }

  setViewers(n) {
    if (!Number.isFinite(n)) return;
    this.viewers.now = n;
    this.viewers.peak = Math.max(this.viewers.peak || 0, n);
  }

  setLikes(n) {
    if (Number.isFinite(n)) this.likes = Math.max(this.likes || 0, n);
  }

  /** @param {object} c bình luận đã lưu: {_id, ts, intent, topic, productId, variant, quantity, author, groupKey, status, answer} */
  add(c) {
    const ts = new Date(c.ts).getTime();
    this.total += 1;
    this.byIntent[c.intent] = (this.byIntent[c.intent] || 0) + 1;
    if (c.author?.hash) this.authors.add(c.author.hash);
    this.firstAt = this.firstAt == null ? ts : Math.min(this.firstAt, ts);
    this.lastAt = this.lastAt == null ? ts : Math.max(this.lastAt, ts);
    this.events.push({
      t: ts, intent: c.intent, topic: c.topic || null, productId: c.productId || null,
      size: c.variant?.size || null, color: c.variant?.color || null, qty: c.quantity || 0,
      groupKey: c.groupKey || null, inferred: Boolean(c.productInferred)
    });
    // Giữ đủ để đo hiệu quả hành động cả phiên; chỉ cắt khi phiên rất dài
    if (this.events.length > 60000) {
      const cut = (this.lastAt || ts) - 3 * 60 * MINUTE;
      this.events = this.events.filter((e) => e.t >= cut);
    }

    const mk = Math.floor(ts / MINUTE) * MINUTE;
    const m = this.minutes.get(mk) || { t: mk, total: 0, question: 0, order: 0, complaint: 0 };
    m.total += 1;
    if (m[c.intent] != null) m[c.intent] += 1;
    this.minutes.set(mk, m);

    if (c.productId) {
      const ps = this.productStats.get(c.productId) || { questions: 0, orders: 0, quantity: 0, complaints: 0, praise: 0 };
      if (c.intent === 'question') ps.questions += 1;
      if (c.intent === 'order') { ps.orders += 1; ps.quantity += c.quantity || 1; }
      if (c.intent === 'complaint') ps.complaints += 1;
      if (c.intent === 'praise') ps.praise += 1;
      this.productStats.set(c.productId, ps);
    }
    if (c.intent === 'question') this.topics.set(c.topic || 'other', (this.topics.get(c.topic || 'other') || 0) + 1);

    if (c.intent === 'order') {
      this.orders.push({
        id: String(c._id), ts: c.ts, handle: c.author?.handle || null, nickname: c.author?.nickname || null,
        productId: c.productId || null, variant: c.variant || {}, quantity: c.quantity || 1,
        hasPhone: Boolean(c.hasPhone), text: c.text, status: c.orderStatus || 'new'
      });
    }

    if (NEEDS_ANSWER.has(c.intent)) {
      const key = c.groupKey || groupKeyOf(c);
      const g = this.groups.get(key) || {
        key, intent: c.intent, topic: c.topic || null, productId: c.productId || null,
        size: key.split('|')[3] || null, count: 0, newSinceAnswer: 0, firstAt: c.ts, lastAt: c.ts,
        samples: [], status: 'open', answer: null, latestId: null
      };
      g.count += 1;
      g.lastAt = c.ts;
      g.latestId = String(c._id);
      g.samples = [{ id: String(c._id), handle: c.author?.handle || null, text: c.text, ts: c.ts, body: c.body || null, variant: c.variant || {} }, ...g.samples].slice(0, 3);
      if (c.status === 'answered' || c.status === 'dismissed') {
        g.status = c.status;
        if (c.answer) g.answer = c.answer;
      } else if (g.status !== 'open') {
        // Đã trả lời rồi mà vẫn có người hỏi lại: mở lại thẻ, đếm số câu mới
        g.newSinceAnswer += 1;
        if (g.newSinceAnswer >= 3 || c.intent === 'complaint') g.status = 'open';
      }
      this.groups.set(key, g);
    }
    return this;
  }

  /** Đánh dấu một nhóm đã xử lý (đồng bộ với cập nhật trong database) */
  resolve(key, status, answer) {
    const g = this.groups.get(key);
    if (!g) return null;
    g.status = status;
    g.answer = answer || g.answer;
    g.newSinceAnswer = 0;
    return g;
  }

  setOrderStatus(id, status) {
    const o = this.orders.find((x) => x.id === String(id));
    if (o) o.status = status;
    return o || null;
  }

  productName(id) {
    return this.products.get(id)?.name || null;
  }

  /**
   * @param {{ now?: number, minutes?: number, queueLimit?: number }} opts
   */
  snapshot({ now = Date.now(), minutes = 60, queueLimit = 40 } = {}) {
    const end = Math.max(now, this.lastAt || 0);
    const series = [...this.minutes.values()].sort((a, b) => a.t - b.t).slice(-minutes);
    const last = series[series.length - 1];
    const perMinuteNow = last && end - last.t < 2 * MINUTE ? last.total : 0;

    const products = [...this.productStats.entries()]
      .map(([id, s]) => ({ id, name: this.productName(id) || 'Sản phẩm đã xóa', ...s }))
      .sort((a, b) => (b.orders * 3 + b.questions) - (a.orders * 3 + a.questions));

    const topics = [...this.topics.entries()]
      .map(([key, count]) => ({ key, label: TOPIC_LABEL[key] || key, count }))
      .sort((a, b) => b.count - a.count);

    // Khiếu nại lên đầu, rồi nhóm đông người hỏi, rồi nhóm mới nhất
    const rank = (g) => (g.intent === 'complaint' ? 1e6 : 0) + g.count * 10 + new Date(g.lastAt).getTime() / 1e12;
    const all = [...this.groups.values()];
    const open = all.filter((g) => g.status === 'open').sort((a, b) => rank(b) - rank(a));
    const answered = all.filter((g) => g.status !== 'open').sort((a, b) => new Date(b.answer?.at || b.lastAt) - new Date(a.answer?.at || a.lastAt));
    const decorate = (g) => ({
      ...g,
      intentLabel: INTENT_LABEL[g.intent],
      topicLabel: g.intent === 'complaint' ? 'Khiếu nại' : TOPIC_LABEL[g.topic] || 'Câu hỏi khác',
      productName: this.productName(g.productId)
    });

    const answeredQuestions = all.filter((g) => g.status === 'answered').reduce((s, g) => s + g.count, 0);
    const askedQuestions = all.reduce((s, g) => s + g.count, 0);

    return {
      totals: {
        comments: this.total,
        byIntent: this.byIntent,
        commenters: this.authors.size,
        perMinuteNow,
        orderQuantity: this.orders.reduce((s, o) => s + (o.status === 'cancelled' ? 0 : o.quantity || 1), 0),
        answeredShare: askedQuestions ? answeredQuestions / askedQuestions : null
      },
      viewers: this.viewers,
      likes: this.likes,
      firstAt: this.firstAt ? new Date(this.firstAt).toISOString() : null,
      lastAt: this.lastAt ? new Date(this.lastAt).toISOString() : null,
      series: series.map((m) => ({ ...m, t: new Date(m.t).toISOString() })),
      products,
      topics,
      queue: open.slice(0, queueLimit).map(decorate),
      queueOpen: open.length,
      answered: answered.slice(0, 20).map(decorate),
      orders: this.orders.slice(-200).reverse().map((o) => ({ ...o, productName: this.productName(o.productId) }))
    };
  }
}

module.exports = { LiveAggregator, groupKeyOf };
