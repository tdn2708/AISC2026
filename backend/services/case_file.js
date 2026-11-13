/**
 * HỒ SƠ XỬ LÝ MỘT ĐIỂM ĐAU — hàm thuần, từ dữ liệu tới việc làm
 * ==================================================================
 * Mở từ một điểm đau (pain_points.js). Bốn bước, mỗi bước tự xét dữ liệu
 * có gì; thiếu thì ghi rõ thiếu gì (`available: false` + `missing`), không bịa:
 *   1. Khoanh vùng: sản phẩm, nguồn, thời gian, chứng từ, đơn hàng, khu vực.
 *   2. Ai làm: bộ phận theo nhóm vấn đề + việc mẫu theo nguyên nhân
 *      (playbook_library), chỉ giữ việc điền được đủ số liệu.
 *   3. Đồ làm sẵn: trả lời công khai từng phản hồi, thư gửi đối tác có số
 *      liệu, tin nhắn bù cho khách (chỉ khi có đơn hàng).
 *   4. Theo dõi: lưu hồ sơ, 7 ngày sau đo lại tỉ lệ câu nhắc điểm đau.
 * Mọi con số trong câu chữ đều lấy từ dữ liệu; LLM (nếu có) chỉ viết lại câu.
 */

const { LIBRARY, CATEGORY_FALLBACK, INSTRUMENTATION_ACTIONS, SLOTS } = require('./playbook_library');
const { ACTION_KIND } = require('./playbook');
const taxonomy = require('./taxonomy');
const metrics = require('./metrics');
const { gramsOf, fold } = require('./pain_points');
const { buildGrouper } = require('./product_group');

const DAY = 86400000;

/** Tên tiếng Việt của chỗ trống trong mẫu việc (khi việc bị loại vì thiếu số) */
const SLOT_WORDS = { ...SLOTS, topShare: 'tỉ trọng sản phẩm', topBaselineShare: 'tỉ lệ nền theo khu vực', affected: 'số khách', evidenceCount: 'số phản hồi', windowDays: 'số ngày', revenue: 'giá trị đơn hàng', currentRate: 'tỉ lệ hiện tại', baselineRate: 'tỉ lệ nền 28 ngày' };
const WEEKS = 12;

const pct = (x) => {
  const v = Number(x) * 100;
  return `${(v < 1 ? v.toFixed(2) : String(Number(v.toFixed(1)))).replace('.', ',')}%`;
};
const int = (n) => Number(n || 0).toLocaleString('vi-VN');
const money = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')} đ`;
const vnDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

function countBy(list, fn) {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, share: count / list.length }));
}

/** Đếm theo tuần (12 tuần gần nhất, tính lùi từ mốc `now`) */
function weekly(list, nowMs) {
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: new Date(nowMs - (WEEKS - i) * 7 * DAY).toISOString(), count: 0 }));
  for (const f of list) {
    const age = nowMs - new Date(f.timestamp).getTime();
    const idx = WEEKS - 1 - Math.floor(age / (7 * DAY));
    if (idx >= 0 && idx < WEEKS && age >= 0) weeks[idx].count += 1;
  }
  return weeks;
}

/** Điền mẫu câu; thiếu một chỗ trống bất kỳ thì trả null (việc đó bị loại) */
function fill(template, slots) {
  let ok = true;
  const text = template.replace(/\{(\w+)\}/g, (m, k) => {
    if (slots[k] == null || slots[k] === '') { ok = false; return m; }
    return slots[k];
  });
  return ok ? text : null;
}

/**
 * @param {object} point điểm đau (có `members` không liệt kê)
 * @param {object} group mảng chứa điểm đau
 * @param {{ items: Array, transactions?: Array, now: Date|string }} ctx
 */
function buildCaseFile(point, group, ctx) {
  const nowMs = new Date(ctx.now).getTime();
  const members = point.members || [];
  const transactions = ctx.transactions || [];

  // ---------- 1. Khoanh vùng ----------
  const products = countBy(members, (f) => f.productName);
  const sources = countBy(members, (f) => f.source);
  const regions = countBy(members, (f) => f.region);
  const withOrder = members.filter((f) => f.orderId);
  const txByOrder = new Map(transactions.filter((t) => t.orderId).map((t) => [String(t.orderId), t]));
  const matchedTx = withOrder.map((f) => txByOrder.get(String(f.orderId))).filter(Boolean);
  const orderValue = matchedTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const verified = members.filter((f) => ['P1', 'P2'].includes(f.trust?.tier)).length;
  const missing1 = [];
  if (!withOrder.length) missing1.push('Không có mã đơn hàng nên chưa nối được với đơn, chưa biết giá trị đơn bị ảnh hưởng.');
  if (!regions.length) missing1.push('Không có khu vực giao hàng nên chưa khoanh được theo vùng.');
  if (members.every((f) => !f.productName)) missing1.push('Không có tên sản phẩm.');

  const scope = {
    count: members.length,
    customers: point.customers,
    verified,
    firstSeen: point.firstSeen,
    lastSeen: point.lastSeen,
    products: products.slice(0, 8),
    sources,
    regions: regions.slice(0, 6),
    orders: { withOrder: withOrder.length, matched: matchedTx.length, value: orderValue },
    weeks: weekly(members, nowMs),
    // Toàn bộ phản hồi của điểm đau (để trả lời, tải về): đã che PII lúc nạp
    feedbacks: members
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((f) => ({
        id: String(f._id),
        text: f.originalText,
        rating: f.rating ?? null,
        productName: f.productName || null,
        source: f.source || null,
        timestamp: f.timestamp || null,
        author: f.author || null,
        orderId: f.orderId || null,
        region: f.region || null,
        verified: ['P1', 'P2'].includes(f.trust?.tier)
      })),
    missing: missing1
  };

  // ---------- 2. Ai làm ----------
  const category = point.category;
  const cause = point.cause;
  const top = products[0];
  const topRegion = regions[0];
  const spanDays = point.firstSeen && point.lastSeen
    ? Math.max(1, Math.round((new Date(point.lastSeen) - new Date(point.firstSeen)) / DAY))
    : null;
  const slots = {
    product: top ? top.name : null,
    topShare: top && products.length > 1 ? pct(top.share) : top ? 'toàn bộ' : null,
    region: topRegion && topRegion.share >= 0.3 ? topRegion.name : null,
    topBaselineShare: null,
    affected: int(point.customers),
    evidenceCount: int(members.length),
    windowDays: spanDays != null ? int(spanDays) : null,
    revenue: orderValue > 0 ? money(orderValue) : null,
    currentRate: null,
    baselineRate: null
  };
  const pb = cause && LIBRARY[cause];
  const raw = pb ? pb.actions : (CATEGORY_FALLBACK[category] || []);
  const actions = [];
  const dropped = [];
  for (const a of raw) {
    const text = fill(a.template, slots);
    const kind = ACTION_KIND[a.kind] || ACTION_KIND.INVESTIGATE;
    if (!text) {
      const need = (a.template.match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).filter((k) => slots[k] == null);
      dropped.push({ id: a.id, need: need.map((k) => SLOT_WORDS[k] || k) });
      continue;
    }
    actions.push({
      id: a.id,
      text,
      kind: kind.key,
      kindLabel: kind.label,
      escalated: a.tier === 'escalated',
      requiresApproval: kind.cost || kind.touchesCustomer,
      effortDays: a.effortDays ?? null
    });
  }
  // Dữ liệu còn thiếu để làm việc đúng chỗ (nhà xe, số lô...): một việc thu thập
  const gap = pb?.gapSlot && INSTRUMENTATION_ACTIONS[pb.gapSlot];
  const gapAction = gap
    ? { id: gap.id, text: fill(gap.template, slots) || gap.template.replace(/\{\w+\}/g, int(members.length)), kind: 'INTERNAL_FIX', kindLabel: ACTION_KIND.INTERNAL_FIX.label, gap: SLOTS[pb.gapSlot] }
    : null;
  const who = {
    owner: category ? taxonomy.categoryOwner(category) : null,
    categoryLabel: point.categoryLabel,
    causeLabel: point.causeLabel,
    causeShare: point.causeShare,
    actions,
    dataGap: gapAction,
    dropped,
    note: pb ? null : 'Chưa có bộ việc mẫu cho nguyên nhân này; dùng việc chung của nhóm vấn đề.'
  };

  // ---------- 3. Đồ làm sẵn ----------
  const quotes = point.examples.slice(0, 3).map((e) => `"${e.text}"`);
  const productList = products.slice(0, 3).map((p) => `${p.name} (${int(p.count)} phản hồi)`).join('; ');
  const recipient = category === 'ProductQuality' ? 'nhà cung cấp hoặc hãng'
    : category === 'Delivery' ? 'đơn vị vận chuyển'
      : category === 'Payment' ? 'đơn vị cổng thanh toán'
        : null;
  const letterLines = [
    `Kính gửi ${recipient || (who.owner ? `bộ phận ${who.owner}` : 'bộ phận phụ trách')},`,
    '',
    `Từ ${vnDate(point.firstSeen)} đến ${vnDate(point.lastSeen)}, ${int(point.customers)} khách đã phản ánh cùng một chuyện: "${point.phrase}"${point.causeLabel ? ` (${point.causeLabel.toLowerCase()})` : ''}.`,
    productList ? `Sản phẩm liên quan: ${productList}.` : null,
    verified ? `Trong đó ${int(verified)} phản hồi có chứng từ mua hàng.` : null,
    withOrder.length ? `${int(withOrder.length)} phản hồi có mã đơn hàng${orderValue ? `, tổng giá trị đơn ${money(orderValue)}` : ''}.` : null,
    '',
    'Một số phản hồi nguyên văn (đã che thông tin cá nhân):',
    ...quotes.map((q) => `- ${q}`),
    '',
    category === 'ProductQuality'
      ? 'Đề nghị kiểm tra lô hàng đã giao và cho biết hướng xử lý (đổi lô, hỗ trợ bảo hành) trước ngày ...'
      : category === 'Delivery'
        ? 'Đề nghị đối chiếu hành trình các đơn liên quan và cam kết thời gian xử lý trước ngày ...'
        : 'Đề nghị rà soát và báo lại hướng xử lý trước ngày ...',
    '',
    'Trân trọng.'
  ].filter((l) => l != null);

  const letter = {
    available: true,
    recipient: recipient || who.owner || 'bộ phận phụ trách',
    text: letterLines.join('\n'),
    missing: category === 'Delivery' ? ['Dữ liệu không có tên nhà xe: phải điền tay đơn vị vận chuyển.'] : []
  };

  const compensation = withOrder.length
    ? {
      available: true,
      customers: new Set(withOrder.map((f) => String(f.customerId || f.author || f._id))).size,
      orders: withOrder.length,
      orderValue,
      // Gợi ý mặc định 10% giá trị đơn; người duyệt đổi trên giao diện
      voucherRate: 0.1,
      template: `Chào anh/chị, shop rất tiếc vì đơn hàng vừa rồi gặp chuyện "${point.phrase}". Shop xin gửi mã giảm giá cho lần mua tới và đã chuyển phản ánh cho bộ phận ${who.owner || 'phụ trách'} xử lý. Mong anh/chị cho shop cơ hội phục vụ tốt hơn.`,
      missing: matchedTx.length < withOrder.length ? [`${int(withOrder.length - matchedTx.length)} đơn không tìm thấy trong dữ liệu giao dịch nên chưa có giá trị đơn.`] : []
    }
    : { available: false, missing: ['Phản hồi không có mã đơn hàng nên chưa biết gửi tin bù cho ai. Trả lời công khai ở dưới vẫn làm được.'] };

  const replies = {
    available: members.length > 0,
    count: members.length,
    note: 'Bấm soạn từng câu; câu trả lời chỉ dựa trên nội dung phản hồi và việc shop đã duyệt.'
  };

  // ---------- 4. Theo dõi ----------
  const tasks = [
    ...actions.map((a) => ({ id: a.id, text: a.text, kind: a.kind, owner: who.owner, requiresApproval: a.requiresApproval })),
    ...(gapAction ? [{ id: gapAction.id, text: gapAction.text, kind: gapAction.kind, owner: 'Kỹ thuật / IT' }] : []),
    { id: 'REPLY-PUBLIC', text: `Trả lời công khai ${int(members.length)} phản hồi nhắc "${point.phrase}".`, kind: 'CUSTOMER_CONTACT', owner: 'CSKH', requiresApproval: true }
  ];

  return {
    key: point.key,
    phrase: point.phrase,
    variants: point.variants,
    group: { key: group.key, label: group.label, source: group.source, sourceLabel: group.sourceLabel, negatives: group.negatives, feedbacks: group.feedbacks },
    shareOfNegatives: point.shareOfNegatives,
    stats: point.stats,
    steps: { scope, who, ready: { replies, letter, compensation }, follow: { tasks, windowDays: 7 } }
  };
}

/**
 * Tỉ lệ phản hồi nhắc điểm đau trong mảng, 7 ngày trước và 7 ngày sau lúc mở
 * hồ sơ. So sánh trước/sau, KHÔNG phải thí nghiệm có đối chứng.
 * @param {Array} items phản hồi của ngữ cảnh (chưa lọc)
 * @param {{ groupKey: string, phraseKeys: string[], createdAt: Date }} c hồ sơ đã lưu
 */
function caseEffect(items, c, now, windowDays = 7) {
  const countable = items.filter(metrics.isCountable);
  const groupOf = buildGrouper(countable);
  const keys = new Set(c.phraseKeys || []);
  const scope = c.groupKey === 'shop' ? countable : countable.filter((f) => groupOf(f).key === c.groupKey);
  // Câu gõ không dấu: khớp theo dạng bỏ dấu của cụm đã lưu
  const folded = new Set([...keys].map(fold));
  const hit = (f) => f.sentiment === 'Negative' && [...gramsOf(f).keys()].some((k) => keys.has(k) || (fold(k) === k && folded.has(k)));
  const at = new Date(c.createdAt).getTime();
  const nowMs = new Date(now).getTime();
  const span = windowDays * DAY;
  const win = (from, to) => {
    const list = scope.filter((f) => { const t = new Date(f.timestamp).getTime(); return t >= from && t < to; });
    const hits = list.filter(hit).length;
    return { n: list.length, hits, rate: list.length ? hits / list.length : null };
  };
  const before = win(at - span, at);
  const after = win(at, Math.min(at + span, nowMs));
  const elapsed = Math.max(0, (nowMs - at) / DAY);
  return {
    status: elapsed >= windowDays ? 'done' : 'pending',
    daysLeft: elapsed >= windowDays ? 0 : Math.ceil(windowDays - elapsed),
    before,
    after,
    change: before.rate != null && after.rate != null ? after.rate - before.rate : null,
    enough: before.n >= 30 && after.n >= 30
  };
}

module.exports = { buildCaseFile, caseEffect, fill };
