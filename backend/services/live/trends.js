/**
 * XU HƯỚNG NGƯỜI MUA TRONG PHIÊN LIVE (hàm thuần, dùng chung cho phiên đang chạy và phiên đã lưu)
 * ==================================================================
 * Trả lời bốn câu người đứng live cần biết, so 10 phút gần nhất với 10 phút trước đó:
 *   wants  khách đang MUỐN MUA gì   (lượt chốt và câu hỏi còn hàng, size theo sản phẩm, biến thể;
 *                                    phiên chưa khai danh mục thì theo chính câu chốt, vd mã "198")
 *   asks   khách đang MUỐN BIẾT gì  (chủ đề câu hỏi, kèm một câu khách hỏi thật)
 *   needs  khách đang CẦN gì        (người chờ trả lời, khiếu nại mới)
 *   sales  nhịp bán                 (lượt chốt mỗi phút 5 phút gần nhất so với 10 phút trước,
 *                                    người xem theo phút, chốt trên 100 người xem)
 * Mọi con số là đếm thật từ bình luận; không ước đoán khi thiếu dữ liệu (null).
 */

const MIN = 60 * 1000;
const WINDOW = 10;

const share = (n, d) => (d > 0 ? n / d : null);

/** Trạng thái nhịp: cần đủ dữ liệu ở kỳ trước mới nói tăng hay giảm */
function rateState(now, before, beforeCount) {
  if (!now && !before) return 'none';
  if (beforeCount < 3) return now > 0 ? 'start' : 'none';
  if (now >= before * 1.3) return 'up';
  if (now <= before * 0.6) return 'down';
  return 'steady';
}

function countBy(list, keyOf) {
  const m = new Map();
  for (const e of list) {
    const k = keyOf(e);
    if (k == null) continue;
    const v = m.get(k) || { now: 0, before: 0 };
    m.set(k, v);
  }
  return m;
}

/**
 * @param {{ events: Array, groups: Map, minutes: Map, products: Map, lastAt: number|null }} agg
 * @param {{ now?: number, topicLabel?: Object }} opts
 */
function buyerTrends(agg, { now = Date.now(), topicLabel = {} } = {}) {
  const last = agg.lastAt || now;
  // Phiên đã dừng (không bình luận mới quá 15 phút): mốc là bình luận cuối, không phải giờ hiện tại
  const end = now - last > 15 * MIN ? last : now;
  const from = end - 2 * WINDOW * MIN;
  const recent = [];
  for (let i = agg.events.length - 1; i >= 0; i -= 1) {
    const e = agg.events[i];
    if (e.t < from) break;
    if (e.t <= end) recent.push(e);
  }
  const isNow = (e) => e.t > end - WINDOW * MIN;
  const name = (id) => agg.products.get(id)?.name || null;

  // ---------- Muốn mua ----------
  const wantKey = (e) => {
    const buying = e.intent === 'order' || (e.intent === 'question' && (e.topic === 'stock' || e.topic === 'size'));
    if (!buying) return null;
    if (e.productId) {
      const v = [e.size && `size ${e.size}`, e.color].filter(Boolean).join(', ');
      return `${e.productId}|${v}`;
    }
    return e.intent === 'order' && e.okey ? `code|${e.okey}` : null;
  };
  const wants = countBy(recent, wantKey);
  for (const e of recent) {
    const k = wantKey(e);
    if (k == null) continue;
    const w = wants.get(k);
    const units = e.intent === 'order' ? e.qty || 1 : 0;
    if (isNow(e)) { w.now += 1; w.unitsNow = (w.unitsNow || 0) + units; } else w.before += 1;
  }
  const wantList = [...wants.entries()]
    .filter(([, v]) => v.now > 0)
    .map(([k, v]) => {
      const [a, b] = k.split('|');
      const label = a === 'code' ? `"${b}"` : `${name(a) || 'Sản phẩm'}${b ? ` ${b}` : ''}`;
      return { key: k, label, now: v.now, before: v.before, units: v.unitsNow || 0, byCode: a === 'code' };
    })
    .sort((x, y) => y.now - x.now || y.units - x.units)
    .slice(0, 3);

  // ---------- Muốn biết ----------
  const asks = countBy(recent.filter((e) => e.intent === 'question'), (e) => e.topic || 'other');
  for (const e of recent) {
    if (e.intent !== 'question') continue;
    const a = asks.get(e.topic || 'other');
    if (isNow(e)) a.now += 1; else a.before += 1;
  }
  // Một câu khách hỏi thật cho mỗi chủ đề: lấy từ nhóm còn mở đông người nhất
  const sampleOf = (topic) => {
    let best = null;
    for (const g of agg.groups.values()) {
      if (g.intent !== 'question' || (g.topic || 'other') !== topic || !g.samples?.length) continue;
      const score = (g.status === 'open' ? 1e6 : 0) + g.count;
      if (!best || score > best.score) best = { score, text: g.samples[0].text };
    }
    return best ? best.text : null;
  };
  const askList = [...asks.entries()]
    .filter(([, v]) => v.now > 0)
    .sort((x, y) => (x[0] === 'other') - (y[0] === 'other') || y[1].now - x[1].now)
    .slice(0, 3)
    .map(([k, v]) => ({ key: k, label: topicLabel[k] || 'Câu hỏi khác', now: v.now, before: v.before, sample: sampleOf(k) }));

  // ---------- Đang cần ----------
  let waiting = 0;
  let oldest = null;
  for (const g of agg.groups.values()) {
    if (g.status !== 'open' || g.intent !== 'question') continue;
    waiting += g.count;
    const t = new Date(g.firstAt).getTime();
    if (oldest == null || t < oldest) oldest = t;
  }
  const complaintsNow = recent.filter((e) => e.intent === 'complaint' && isNow(e)).length;
  const openComplaints = [...agg.groups.values()].filter((g) => g.intent === 'complaint' && g.status === 'open').length;
  const needs = [];
  if (openComplaints) needs.push({ kind: 'complaint', count: openComplaints, recent: complaintsNow, tone: 'crit' });
  if (waiting) needs.push({ kind: 'waiting', count: waiting, waitMin: oldest != null ? Math.max(0, Math.round((end - oldest) / MIN)) : null, tone: waiting >= 8 ? 'high' : 'med' });

  // ---------- Nhịp bán ----------
  // Cùng cửa sổ với coach.js (order_slowdown): [đầu, cuối)
  const orders5 = recent.filter((e) => e.intent === 'order' && e.t >= end - 5 * MIN && e.t < end);
  const ordersPrev = recent.filter((e) => e.intent === 'order' && e.t >= end - 15 * MIN && e.t < end - 5 * MIN);
  // Phiên chưa đủ 5 (hoặc 15) phút: chia cho thời gian thật đã có, không chia cứng 5 và 10 phút
  const first = Number.isFinite(agg.firstAt) ? agg.firstAt : end;
  const spanNow = Math.min(5, Math.max(1, (end - first) / MIN));
  const spanPrev = Math.max(0, Math.min(10, (end - 5 * MIN - first) / MIN));
  const perMinNow = orders5.length / spanNow;
  const perMinBefore = spanPrev >= 1 ? ordersPrev.length / spanPrev : 0;
  const minutes = [...agg.minutes.values()].sort((a, b) => a.t - b.t);
  const viewersAt = (t0, t1) => {
    const v = minutes.filter((m) => m.t >= t0 && m.t < t1 && Number.isFinite(m.viewers)).map((m) => m.viewers);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const viewersNow = viewersAt(end - WINDOW * MIN, end + MIN);
  const viewersBefore = viewersAt(end - 2 * WINDOW * MIN, end - WINDOW * MIN);
  const orders10 = recent.filter((e) => e.intent === 'order' && isNow(e)).length;
  const sales = {
    perMinNow: Number(perMinNow.toFixed(2)),
    perMinBefore: Number(perMinBefore.toFixed(2)),
    unitsNow: orders5.reduce((s, e) => s + (e.qty || 1), 0),
    state: spanPrev >= 3 ? rateState(perMinNow, perMinBefore, ordersPrev.length) : (perMinNow > 0 ? 'start' : 'none'),
    viewersNow: viewersNow != null ? Math.round(viewersNow) : null,
    viewersBefore: viewersBefore != null ? Math.round(viewersBefore) : null,
    // Lượt chốt trên 100 người xem trong 10 phút gần nhất
    per100Viewers: viewersNow ? Number(((share(orders10, viewersNow) || 0) * 100).toFixed(2)) : null
  };

  return { windowMin: WINDOW, asOf: new Date(end).toISOString(), wants: wantList, asks: askList, needs, sales };
}

module.exports = { buyerTrends, rateState };
