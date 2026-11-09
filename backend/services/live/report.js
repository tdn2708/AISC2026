/**
 * BÁO CÁO SAU PHIÊN LIVE — biến một phiên live thành danh sách việc cho phiên sau
 * ==================================================================
 * Sau mỗi phiên, người bán thường chỉ có con số doanh thu của sàn. Báo cáo này
 * trả lời những câu sàn không trả lời:
 *   - Phễu: bao nhiêu người xem, bình luận, hỏi, chốt; rơi rụng ở đâu
 *   - Doanh thu ước tính từ bình luận chốt, và doanh thu BỊ LỠ vì hết hàng
 *   - Câu hỏi nào bị bỏ sót, trả lời chậm bao lâu, danh mục thiếu gì
 *   - Khiếu nại thuộc nhóm vấn đề nào (cùng phân loại với hệ thống chính)
 *   - Việc trợ lý đã gợi ý, người đứng live đã làm gì, hiệu quả ra sao
 *   - So với phiên trước
 * và kết thúc bằng VIỆC CẦN LÀM cho phiên sau, xếp theo mức ưu tiên.
 *
 * Mọi con số tính từ bình luận đã lưu và danh mục shop khai báo; "doanh thu"
 * ở đây là ước tính từ lượt chốt trên bình luận, không phải số tiền sàn ghi nhận.
 */

const { LiveAggregator } = require('./aggregator');
const { measureEffect, stockKeys } = require('./coach');
const { suggestAnswer } = require('./answer');
const { TOPIC_LABEL, fold } = require('./intent');
const { classifyByRulesFallback } = require('../ai_analyzer');
const taxonomy = require('../taxonomy');

const MIN = 60 * 1000;

/**
 * Nhóm vấn đề của một khiếu nại trên live, theo danh mục của hệ thống chính.
 * Khiếu nại trên live ngắn và khác văn đánh giá trên sàn ("nhắn tin không ai
 * trả lời", "đặt 5 ngày chưa giao"), nên thử luật riêng trước rồi mới tới bộ
 * luật chung.
 */
const LIVE_COMPLAINT_RULES = [
  ['CustomerService', /(?<![a-z])(tra loi|rep|phan hoi|nhan tin|inbox|ib|seen|thai do|goi khong nghe)(?![a-z])/],
  ['ReturnRefund', /(?<![a-z])(hoan tien|tra hang|doi hang|sai (size|mau|hang)|giao (sai|nham)|gui nham)(?![a-z])/],
  ['Delivery', /(?<![a-z])(chua (nhan|giao|thay|ve|toi|den)|giao (cham|lau|tre)|cham qua|lau qua|ship cham|van chuyen|d+ ngay)(?![a-z])/],
  ['ProductQuality', /(?<![a-z])(loi|hong|rach|xu|bong keo|phai|khac hinh|khong giong|kem chat luong|duong may|be|vo|mop)(?![a-z])/],
  ['Payment', /(?<![a-z])(thanh toan|chuyen khoan|tru tien|mat tien)(?![a-z])/]
];
function complaintCategory(text) {
  const f = fold(text);
  const hit = LIVE_COMPLAINT_RULES.find(([, re]) => re.test(f));
  if (hit) return hit[0];
  return classifyByRulesFallback(text).category || 'Other';
}
const median = (arr) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const vndShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu` : `${Math.round(n / 1000).toLocaleString('vi-VN')} nghìn`);

/**
 * Đi theo thời gian, trừ tồn kho theo từng lượt chốt: lượt chốt đến khi biến
 * thể đã hết là cầu bị lỡ.
 */
function stockReplay(comments, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const left = new Map();
  for (const p of products) for (const k of stockKeys(p)) left.set(`${p.id}|${k.key ?? ''}`, k.initial);
  const lost = new Map();
  let revenue = 0;
  let revenueConfirmed = 0;
  let unpricedOrders = 0;
  for (const c of comments) {
    if (c.intent !== 'order' || c.orderStatus === 'cancelled') continue;
    const p = byId.get(c.productId);
    const qty = c.quantity || 1;
    if (!p) { unpricedOrders += 1; continue; }
    const price = p.salePrice ?? p.price;
    const keys = stockKeys(p).map((k) => k.key);
    const key = keys.includes(null) ? null : keys.find((k) => k === c.variant?.size || k === c.variant?.color);
    const slot = key === undefined ? null : `${p.id}|${key ?? ''}`;
    if (slot && left.has(slot) && left.get(slot) <= 0) {
      const l = lost.get(slot) || { productId: p.id, name: p.name, variant: key, qty: 0, people: 0, value: 0 };
      l.qty += qty;
      l.people += 1;
      l.value += price ? qty * price : 0;
      lost.set(slot, l);
      continue;
    }
    if (slot && left.has(slot)) left.set(slot, left.get(slot) - qty);
    if (price) {
      revenue += qty * price;
      if (c.orderStatus === 'confirmed') revenueConfirmed += qty * price;
    } else unpricedOrders += 1;
  }
  return { revenue, revenueConfirmed, unpricedOrders, lost: [...lost.values()].sort((a, b) => b.value - a.value || b.qty - a.qty) };
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} session tài liệu live_sessions
 */
async function buildReport(db, session) {
  const comments = await db.collection('live_comments').find({ sessionId: session._id }).sort({ ts: 1 }).toArray();
  const products = session.products || [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const agg = new LiveAggregator(session);
  for (const c of comments) agg.add(c);
  if (session.summary?.viewers) agg.viewers = { ...session.summary.viewers };
  const snap = agg.snapshot({ now: agg.lastAt || Date.now(), queueLimit: 500 });

  // ---------- Phễu ----------
  const uniq = (pred) => new Set(comments.filter(pred).map((c) => c.author?.hash).filter(Boolean)).size;
  const funnel = {
    viewersPeak: agg.viewers.peak,
    commenters: uniq(() => true),
    askers: uniq((c) => c.intent === 'question'),
    buyers: uniq((c) => c.intent === 'order' && c.orderStatus !== 'cancelled'),
    confirmed: uniq((c) => c.intent === 'order' && c.orderStatus === 'confirmed')
  };

  // ---------- Doanh thu và cầu bị lỡ ----------
  const money = stockReplay(comments, products);

  // ---------- Trả lời câu hỏi ----------
  const groups = [...agg.groups.values()].filter((g) => g.intent === 'question');
  const answered = groups.filter((g) => g.status === 'answered');
  const askedPeople = groups.reduce((s, g) => s + g.count, 0);
  const answeredPeople = answered.reduce((s, g) => s + g.count, 0);
  const waits = answered.map((g) => (g.answer?.at ? (new Date(g.answer.at) - new Date(g.firstAt)) / MIN : null)).filter((x) => x != null && x >= 0);
  const missed = groups.filter((g) => g.status === 'open').sort((a, b) => b.count - a.count).slice(0, 8).map((g) => ({
    topic: g.topic, topicLabel: TOPIC_LABEL[g.topic] || 'Câu hỏi khác', productName: byId.get(g.productId)?.name || null, people: g.count, sample: g.samples?.[0]?.text || ''
  }));
  const gapMap = new Map();
  for (const g of groups) {
    if (g.topic === 'other') continue;
    const s = suggestAnswer({ intent: 'question', topic: g.topic, productId: g.productId, variant: { size: g.size } }, session);
    if (s.grounded) continue;
    const k = `${g.topic}|${g.productId || '-'}`;
    const e = gapMap.get(k) || { topic: g.topic, topicLabel: TOPIC_LABEL[g.topic] || 'Câu hỏi khác', productName: byId.get(g.productId)?.name || null, people: 0 };
    e.people += g.count;
    gapMap.set(k, e);
  }
  const gaps = [...gapMap.values()].sort((a, b) => b.people - a.people).slice(0, 6);

  // ---------- Khiếu nại theo nhóm vấn đề của hệ thống chính ----------
  const complaintRows = comments.filter((c) => c.intent === 'complaint');
  const catCount = new Map();
  for (const c of complaintRows) {
    const key = complaintCategory(c.text);
    const e = catCount.get(key) || { category: key, label: taxonomy.categoryLabel(key), count: 0, samples: [] };
    e.count += 1;
    if (e.samples.length < 2) e.samples.push(c.text);
    catCount.set(key, e);
  }
  const complaints = { total: complaintRows.length, pushed: complaintRows.filter((c) => c.pushedToFeedback).length, byCategory: [...catCount.values()].sort((a, b) => b.count - a.count) };

  // ---------- Sản phẩm ----------
  const productRows = snap.products.map((p) => ({ ...p, conversion: p.questions ? p.orders / p.questions : null }));
  const bestMinute = snap.series.slice().sort((a, b) => b.order - a.order)[0] || null;
  let bestMinuteProduct = null;
  if (bestMinute && bestMinute.order) {
    const t = new Date(bestMinute.t).getTime();
    const cnt = new Map();
    comments.filter((c) => c.intent === 'order' && c.productId && new Date(c.ts).getTime() >= t && new Date(c.ts).getTime() < t + MIN)
      .forEach((c) => cnt.set(c.productId, (cnt.get(c.productId) || 0) + 1));
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    bestMinuteProduct = top ? byId.get(top[0])?.name || null : null;
  }

  // ---------- Hành động trong phiên ----------
  const actions = (session.actions || []).map((a) => ({ ...a, effect: a.status === 'done' ? measureEffect(agg, a, a.at, Date.now(), true) : null }));

  // ---------- So với phiên trước ----------
  const prevDoc = await db.collection('live_sessions').find({ _id: { $ne: session._id }, status: 'ended', createdAt: { $lt: session.createdAt }, simulated: Boolean(session.simulated) }).sort({ createdAt: -1 }).limit(1).next();
  const previous = prevDoc ? {
    id: String(prevDoc._id), title: prevDoc.title, at: prevDoc.startedAt || prevDoc.createdAt,
    comments: prevDoc.summary?.comments ?? null,
    orders: prevDoc.summary?.byIntent?.order ?? null,
    complaints: prevDoc.summary?.byIntent?.complaint ?? null,
    answeredShare: prevDoc.summary?.answeredShare ?? null,
    revenue: prevDoc.summary?.revenue ?? null
  } : null;

  // ---------- Việc cần làm cho phiên sau ----------
  const todo = [];
  const newOrders = comments.filter((c) => c.intent === 'order' && (c.orderStatus || 'new') === 'new');
  if (newOrders.length) {
    todo.push({ priority: 'high', kind: 'orders', title: `Lên đơn cho ${newOrders.length} lượt chốt chưa xử lý`, detail: `${newOrders.filter((c) => c.hasPhone).length} khách để lại số điện thoại (đã che trong hệ thống), số còn lại nhắn qua tin nhắn nền tảng. Tải danh sách CSV ở mục Khách chốt đơn.` });
  }
  if (complaints.total) {
    const top = complaints.byCategory[0];
    todo.push({ priority: 'high', kind: 'complaints', title: `Xử lý ${complaints.total} khiếu nại trước phiên sau`, detail: `Nhiều nhất là ${top.label.toLowerCase()} (${top.count}). ${complaints.pushed < complaints.total ? 'Đưa khiếu nại vào hệ thống phản hồi để theo dõi cùng các kênh khác.' : 'Đã đưa vào hệ thống phản hồi.'}` });
  }
  for (const l of money.lost.slice(0, 3)) {
    todo.push({ priority: 'high', kind: 'restock', title: `Nhập thêm ${l.name}${l.variant ? ` ${/^[A-Z0-9]+$/.test(l.variant) ? `size ${l.variant}` : l.variant}` : ''}`, detail: `${l.people} lượt chốt (${l.qty} sản phẩm) đến sau khi đã hết hàng${l.value ? `, khoảng ${vndShort(l.value)} doanh thu bị lỡ` : ''}.` });
  }
  for (const g of gaps.slice(0, 3)) {
    todo.push({ priority: 'medium', kind: 'catalog', title: `Bổ sung ${g.topicLabel.toLowerCase()}${g.productName ? ` cho ${g.productName}` : ''} vào danh mục`, detail: `${g.people} khách hỏi nhưng danh mục chưa có thông tin, nên trợ lý không gợi ý được câu trả lời.` });
  }
  const answeredShare = askedPeople ? answeredPeople / askedPeople : null;
  if (answeredShare != null && answeredShare < 0.6 && askedPeople >= 10) {
    todo.push({ priority: 'medium', kind: 'staffing', title: 'Thêm người trả lời bình luận', detail: `Chỉ ${Math.round(answeredShare * 100)}% khách hỏi được trả lời${waits.length ? `, thời gian chờ trung vị ${median(waits).toFixed(1).replace('.', ',')} phút` : ''}.` });
  }
  const topTopics = snap.topics.slice(0, 3);
  const qTotal = snap.topics.reduce((s, t) => s + t.count, 0);
  if (topTopics.length && qTotal >= 10) {
    const share = topTopics.reduce((s, t) => s + t.count, 0) / qTotal;
    todo.push({ priority: 'medium', kind: 'script', title: `Nói sẵn về ${topTopics.map((t) => t.label.toLowerCase()).join(', ')} ngay đầu phiên`, detail: `Ba chủ đề này chiếm ${Math.round(share * 100)}% câu hỏi. Chủ động nói trước giúp giảm câu hỏi lặp lại.` });
  }
  const weak = productRows.filter((p) => p.questions >= 8 && p.conversion != null && p.conversion < 0.2).sort((a, b) => b.questions - a.questions)[0];
  if (weak) {
    todo.push({ priority: 'medium', kind: 'product', title: `Xem lại cách bán ${weak.name}`, detail: `${weak.questions} câu hỏi nhưng chỉ ${weak.orders} lượt chốt. Có thể do giá, size, hoặc cần cho xem sản phẩm thật kỹ hơn.` });
  }
  const best = productRows.slice().sort((a, b) => b.quantity - a.quantity)[0];
  if (best && best.quantity > 0) {
    todo.push({ priority: 'low', kind: 'opening', title: `Mở đầu phiên sau bằng ${best.name}`, detail: `Chốt nhiều nhất phiên này (${best.quantity} sản phẩm).${bestMinuteProduct && bestMinute ? ` Phút chốt dồn nhất có ${bestMinute.order} lượt, chủ yếu ${bestMinuteProduct}.` : ''}` });
  }

  return {
    session: { id: String(session._id), title: session.title, platform: session.platform, simulated: Boolean(session.simulated), startedAt: session.startedAt || null, endedAt: session.endedAt || null },
    totals: snap.totals,
    funnel,
    revenue: { estimated: money.revenue, confirmed: money.revenueConfirmed, unpricedOrders: money.unpricedOrders, lost: money.lost, lostTotal: money.lost.reduce((s, l) => s + l.value, 0) },
    response: { groups: groups.length, askedPeople, answeredPeople, answeredShare, medianWaitMin: median(waits), missed, gaps },
    complaints,
    products: productRows,
    topics: snap.topics,
    bestMinute: bestMinute && bestMinute.order ? { t: bestMinute.t, orders: bestMinute.order, product: bestMinuteProduct } : null,
    actions,
    previous,
    todo
  };
}

module.exports = { buildReport, stockReplay, complaintCategory };
