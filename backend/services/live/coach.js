/**
 * TRỢ LÝ HÀNH ĐỘNG TRONG PHIÊN LIVE — từ dữ liệu ra việc cần làm ngay
 * ==================================================================
 * Nền tảng live cho người bán thấy số người xem và doanh số, nhưng không nói
 * "bây giờ nên làm gì". Mô-đun này đọc bình luận đã phân loại và trả về một
 * danh sách việc cụ thể, mỗi việc có:
 *   - lý do bằng số liệu (bao nhiêu người, trong mấy phút),
 *   - câu nói mẫu để đọc trên sóng (chỉ dùng dữ kiện shop đã khai báo),
 *   - bước tiếp theo, và chỉ số sẽ theo dõi để đo hiệu quả sau khi làm.
 *
 * Toàn bộ là luật có ngưỡng, không gọi mô hình: chạy mỗi 1,5 giây, giải thích
 * được, và không bịa. Các ngưỡng đặt theo nhịp một phiên live bán hàng nhỏ
 * và vừa (vài chục bình luận mỗi phút); phiên rất lớn vẫn kích hoạt được vì
 * hầu hết ngưỡng là số người tuyệt đối trong cửa sổ ngắn.
 *
 * Loại việc (thứ tự = mức ưu tiên):
 *   complaint_spike   khiếu nại dồn dập: xin lỗi chung trên sóng, cử người trực tin nhắn
 *   soldout_demand    biến thể đã hết vẫn có người chốt: báo hết, gợi ý biến thể còn hàng
 *   question_burst    nhiều người cùng hỏi một điều: trả lời MỘT lần trên sóng
 *   low_stock         biến thể sắp hết: tạo khan hiếm, chốt nhanh
 *   backlog           hàng đợi câu hỏi dồn ứ: cần thêm người trả lời
 *   hot_other_product khách hỏi dồn sản phẩm chưa giới thiệu: chuyển sản phẩm
 *   ask_not_buy       hỏi nhiều mà ít chốt: đẩy mã giảm giá, thời hạn
 *   engagement_drop   bình luận giảm mạnh: mini game, đổi nhịp
 *   missing_info      danh mục thiếu thông tin khách đang hỏi: bổ sung danh mục
 */

const { TOPIC_LABEL } = require('./intent');

const MIN = 60 * 1000;
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1 };

const vnd = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const pct = (x) => `${Math.round(x * 100)}%`;
const lowerFirst = (t) => (t && !/^[A-ZĐ]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

/** Tách biến thể theo cách shop khai báo tồn kho: theo size, theo màu, hoặc cả sản phẩm */
function stockKeys(p) {
  if (p.stock == null) return [];
  if (typeof p.stock === 'number') return [{ key: null, initial: p.stock }];
  return Object.entries(p.stock).map(([k, v]) => ({ key: k, initial: Number(v) }));
}

const matchesKey = (e, key) => key == null || e.size === key || e.color === key;

/** Số lượng đã chốt cho một biến thể trong cả phiên (trừ đơn hủy) */
function orderedQty(orders, productId, key) {
  return orders
    .filter((o) => o.productId === productId && o.status !== 'cancelled' && (key == null || o.variant?.size === key || o.variant?.color === key))
    .reduce((s, o) => s + (o.quantity || 1), 0);
}

/** Biến thể thay thế còn hàng gần nhất (size kề bên trước, rồi biến thể khác) */
function alternativeFor(p, key, orders) {
  const keys = stockKeys(p).filter((k) => k.key && k.key !== key)
    .map((k) => ({ ...k, left: k.initial - orderedQty(orders, p.id, k.key) }))
    .filter((k) => k.left > 0);
  if (!keys.length) return null;
  const order = p.sizes || [];
  const i = order.indexOf(key);
  if (i >= 0) {
    keys.sort((a, b) => Math.abs(order.indexOf(a.key) - i) - Math.abs(order.indexOf(b.key) - i));
  }
  return keys[0];
}

const rate = (events, from, to, pred = () => true) =>
  events.filter((e) => e.t >= from && e.t < to && pred(e)).length / Math.max(1, (to - from) / MIN);

/**
 * @param {{ agg: import('./aggregator').LiveAggregator, session: object, suggestionFor?: Function, now?: number }} input
 * @returns {Array<object>} việc cần làm, đã xếp theo mức ưu tiên
 */
function coach({ agg, session, suggestionFor, now = Date.now() }) {
  const out = [];
  const products = session.products || [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const policy = session.policy || {};
  // Mốc là giờ hiện tại: phiên đang live mà im lặng thì chính sự im lặng là tín hiệu
  const end = now;
  const ev = agg.events.filter((e) => e.t >= end - 15 * MIN);
  const last = (mins) => ev.filter((e) => e.t >= end - mins * MIN);
  const orders = agg.orders;

  // ---------- 1. Khiếu nại dồn dập ----------
  {
    const recent = last(5);
    const complaints = recent.filter((e) => e.intent === 'complaint').length;
    if (complaints >= 3 && complaints / Math.max(1, recent.length) >= 0.04) {
      out.push({
        type: 'complaint_spike',
        key: 'all',
        severity: 'critical',
        title: `${complaints} khiếu nại trong 5 phút`,
        why: `${pct(complaints / recent.length)} bình luận 5 phút qua là khiếu nại. Để lâu trên sóng, người xem khác sẽ ngại chốt đơn.`,
        script: `Shop xin lỗi các bạn có đơn trước chưa ổn ạ. Bạn nhắn mã đơn vào tin nhắn của shop, sau live shop xử lý từng đơn ngay.${policy.complaint ? ` ${policy.complaint}` : ''}`,
        steps: ['Cử một người trực tin nhắn, nhận mã đơn của từng khách', 'Trả lời từng thẻ khiếu nại ở đầu hàng đợi'],
        watch: 'complaint'
      });
    }
  }

  // ---------- 2 + 4. Tồn kho: đã hết mà vẫn có cầu / sắp hết ----------
  for (const p of products) {
    for (const k of stockKeys(p)) {
      const left = k.initial - orderedQty(orders, p.id, k.key);
      const label = k.key ? `${p.name} ${/^[A-Z0-9]+$/.test(k.key) ? `size ${k.key}` : k.key}` : p.name;
      const demand = last(10).filter((e) => e.productId === p.id && matchesKey(e, k.key) && (e.intent === 'order' || (e.intent === 'question' && e.topic === 'stock')));
      const demandOrders = demand.filter((e) => e.intent === 'order');
      const unitPrice = p.salePrice ?? p.price;
      if (left <= 0 && demand.length >= 2) {
        const alt = k.key ? alternativeFor(p, k.key, orders) : null;
        const lostQty = demandOrders.reduce((s, e) => s + (e.qty || 1), 0);
        out.push({
          type: 'soldout_demand',
          key: `${p.id}|${k.key ?? ''}`,
          severity: 'critical',
          productId: p.id,
          title: `${label} đã hết, vẫn có ${demand.length} người muốn mua`,
          why: `${demandOrders.length} lượt chốt và ${demand.length - demandOrders.length} câu hỏi còn hàng trong 10 phút cho biến thể đã hết${k.initial === 0 ? ' (tồn kho khai báo 0)' : ` (đã chốt hết ${k.initial})`}.${unitPrice ? ` Doanh thu đang lỡ khoảng ${vnd(lostQty * unitPrice)}.` : ''}`,
          script: `${label} bên em hết rồi ạ.${alt ? ` Bạn nào cần thì lấy ${/^[A-Z0-9]+$/.test(alt.key) ? `size ${alt.key}` : alt.key} vẫn còn hàng nha.` : ''} Bạn bình luận "chờ ${k.key || 'hàng'}" để shop báo ngay khi về hàng.`,
          steps: [alt ? `Gợi ý ${alt.key} (còn khoảng ${alt.left})` : 'Gợi ý sản phẩm tương tự còn hàng', 'Ghi nhận nhu cầu để nhập thêm hàng (có trong báo cáo sau live)'],
          lostValue: unitPrice ? lostQty * unitPrice : null,
          variant: k.key,
          // Đo lượt chốt vào ĐÚNG biến thể đã hết: giảm là khách đã được chuyển
          // sang biến thể khác. Đo cả sản phẩm thì lẫn nhịp đổi sản phẩm của phiên.
          watch: 'soldout'
        });
      } else if (left > 0 && left <= Math.max(3, Math.ceil(k.initial * 0.15)) && demandOrders.length >= 2) {
        out.push({
          type: 'low_stock',
          key: `${p.id}|${k.key ?? ''}`,
          severity: 'high',
          productId: p.id,
          title: `${label} chỉ còn khoảng ${left}`,
          why: `Đã chốt ${k.initial - left}/${k.initial}, ${demandOrders.length} lượt chốt trong 10 phút qua. Nói rõ số lượng còn lại giúp khách chốt nhanh và tránh nhận quá số hàng có.`,
          script: `${label} chỉ còn ${left} cái cuối thôi ạ, bạn nào ưng chốt nhanh giúp shop nha!`,
          steps: ['Ngừng nhận đơn khi đủ số lượng, báo hết trên sóng', 'Kiểm tra kho trước khi xác nhận đơn'],
          watch: 'order'
        });
      }
    }
  }

  // ---------- 3. Nhiều người cùng hỏi một điều ----------
  // Chỉ 2 nhóm đông nhất, và phải chiếm phần đáng kể câu hỏi gần đây: phiên
  // đông thì nhóm nào cũng vượt 5 người, gợi ý hết là thành nhiễu.
  const openGroups = [...agg.groups.values()].filter((g) => g.status === 'open' && g.intent === 'question');
  const recentQuestions = last(3).filter((e) => e.intent === 'question').length;
  const bursts = openGroups
    .map((g) => ({ g, recentAsk: last(3).filter((e) => e.groupKey === g.key).length }))
    .filter((x) => x.recentAsk >= 5 && x.recentAsk >= recentQuestions * 0.08)
    .sort((a, b) => b.recentAsk - a.recentAsk)
    .slice(0, 2);
  for (const { g, recentAsk } of bursts) {
    {
      const sug = suggestionFor ? suggestionFor(g) : null;
      const pname = byId.get(g.productId)?.name;
      const p = byId.get(g.productId);
      // Trên sóng nói cho mọi người, không nói theo số đo của một khách
      const guide = g.topic === 'size' && p?.sizeGuide?.length ? p.sizeGuide : null;
      const cm = (x) => `1m${String(x - 100).padStart(2, '0')}`;
      const onAir = guide
        ? `Bảng size ${p.name}: ${guide.map((x) => `${x.size} ${[x.maxKg && `đến ${x.maxKg}kg`, x.maxCm && `cao dưới ${cm(x.maxCm)}`].filter(Boolean).join(', ')}`).join('; ')}. Bạn nào phân vân thì bình luận chiều cao, cân nặng, shop tư vấn riêng nha.`
        : sug?.text ? sug.text.replace(/^@\S+\s*/, '') : null;
      out.push({
        type: 'question_burst',
        key: g.key,
        severity: 'high',
        productId: g.productId,
        groupKey: g.key,
        title: `${recentAsk} người vừa hỏi ${(TOPIC_LABEL[g.topic] || 'cùng một câu').toLowerCase()}${pname ? ` ${pname}` : ''}`,
        why: `${recentAsk} câu cùng nội dung trong 3 phút (${g.count} câu cả phiên). Trả lời một lần trên sóng thay vì từng người.`,
        script: onAir,
        grounded: guide ? true : sug ? sug.grounded : null,
        steps: ['Đọc câu trả lời trên sóng', 'Ghim câu trả lời lên đầu phần bình luận nếu nền tảng cho phép'],
        watch: 'repeat'
      });
    }
  }

  // ---------- 5. Hàng đợi dồn ứ ----------
  {
    const open = [...agg.groups.values()].filter((g) => g.status === 'open');
    const people = open.reduce((s, g) => s + g.count, 0);
    const oldest = open.length ? Math.min(...open.map((g) => new Date(g.firstAt).getTime())) : null;
    const waitMin = oldest ? (end - oldest) / MIN : 0;
    if (open.length >= 10 || (waitMin >= 5 && people >= 8)) {
      out.push({
        type: 'backlog',
        key: 'queue',
        severity: 'high',
        title: `${open.length} nhóm câu hỏi chưa trả lời, ${people} khách đang chờ`,
        why: `Nhóm lâu nhất đã chờ ${Math.round(waitMin)} phút. Khách hỏi không được đáp thường rời phiên trước khi chốt.`,
        script: null,
        steps: ['Nhờ thêm một người trả lời bình luận trong hàng đợi', 'Trả lời trên sóng 3 nhóm đông người hỏi nhất', 'Bấm "Bỏ qua" các nhóm đã lỗi thời'],
        watch: 'queue'
      });
    }
  }

  // ---------- 6. Khách hỏi dồn sản phẩm chưa giới thiệu ----------
  {
    const cur = session.currentProductId;
    const recent = last(5).filter((e) => e.productId && !e.inferred && (e.intent === 'question' || e.intent === 'order'));
    const counts = new Map();
    for (const e of recent) counts.set(e.productId, (counts.get(e.productId) || 0) + 1);
    const curCount = counts.get(cur) || 0;
    const best = [...counts.entries()].filter(([id]) => id !== cur).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 5 && best[1] >= 1.5 * curCount) {
      const p = byId.get(best[0]);
      if (p) {
        out.push({
          type: 'hot_other_product',
          key: p.id,
          severity: 'medium',
          productId: p.id,
          title: `Khách đang hỏi dồn ${p.name}`,
          why: `${best[1]} câu hỏi và lượt chốt về ${p.name} trong 5 phút, trong khi sản phẩm đang giới thiệu có ${curCount}.`,
          script: `Nhiều bạn hỏi ${p.name}, shop lên luôn sản phẩm số ${p.code} cho mọi người xem nha!`,
          steps: [`Chuyển sang giới thiệu ${p.name}`],
          watch: 'order',
          do: { kind: 'switch_product', productId: p.id }
        });
      }
    }
  }

  // ---------- 7. Hỏi nhiều, chốt ít ----------
  {
    const cur = session.currentProductId;
    const p = byId.get(cur);
    const recent = last(5).filter((e) => e.productId === cur);
    const asks = recent.filter((e) => e.intent === 'question' && ['price', 'promo', 'size', 'stock'].includes(e.topic)).length;
    const buys = recent.filter((e) => e.intent === 'order').length;
    if (p && asks >= 6 && buys <= asks * 0.25) {
      out.push({
        type: 'ask_not_buy',
        key: p.id,
        severity: 'medium',
        productId: p.id,
        title: `${p.name}: ${asks} câu hỏi, ${buys} lượt chốt`,
        why: `Trong 5 phút, khách hỏi giá, size, tồn kho nhiều nhưng tỉ lệ chốt chỉ ${pct(buys / asks)}. Thường là còn do dự về giá hoặc size.`,
        script: policy.promo
          ? `Bạn nào đang phân vân ${p.name} thì ${lowerFirst(policy.promo.replace(/\.$/, ''))}, chỉ áp dụng trong phiên live này thôi ạ!`
          : null,
        grounded: Boolean(policy.promo),
        steps: [policy.promo ? 'Nhắc mã khuyến mãi kèm thời hạn' : 'Chưa khai báo khuyến mãi: cân nhắc một ưu đãi giới hạn thời gian', p.sizeGuide?.length ? 'Đọc bảng size trên sóng' : 'Bổ sung bảng size vào danh mục'],
        watch: 'order'
      });
    }
  }

  // ---------- 8. Bình luận giảm mạnh ----------
  {
    const recentRate = rate(ev, end - 3 * MIN, end);
    const prevRate = rate(ev, end - 9 * MIN, end - 3 * MIN);
    if (prevRate >= 8 && recentRate < prevRate * 0.6) {
      const hot = [...agg.productStats.entries()].filter(([id]) => id !== session.currentProductId).sort((a, b) => (b[1].questions + b[1].orders) - (a[1].questions + a[1].orders))[0];
      const hp = hot ? byId.get(hot[0]) : null;
      out.push({
        type: 'engagement_drop',
        key: 'rate',
        severity: 'medium',
        title: `Bình luận giảm ${pct(1 - recentRate / prevRate)} trong 3 phút`,
        why: `Từ ${prevRate.toFixed(1).replace('.', ',')} xuống ${recentRate.toFixed(1).replace('.', ',')} bình luận mỗi phút. Người xem đang mất hứng.`,
        script: 'Ai muốn shop mở thêm một deal nữa thì thả số 1 lên bình luận nha!',
        steps: [hp ? `Chuyển sang ${hp.name} (được hỏi nhiều nhất phiên)` : 'Đổi sang sản phẩm khác', 'Mở mini game hoặc deal giới hạn thời gian'],
        watch: 'comments',
        do: hp ? { kind: 'switch_product', productId: hp.id } : null
      });
    }
  }

  // ---------- 9. Danh mục thiếu thông tin khách đang hỏi ----------
  if (suggestionFor) {
    // Gộp theo chủ đề + sản phẩm: câu hỏi size bị tách nhóm theo từng size,
    // nhưng chỗ thiếu trong danh mục chỉ là một
    const gaps = new Map();
    for (const g of openGroups) {
      const sug = suggestionFor(g);
      if (!sug || sug.grounded !== false) continue;
      const k = `${g.topic}|${g.productId || '-'}`;
      const e = gaps.get(k) || { topic: g.topic, productId: g.productId, count: 0, groupKey: g.key };
      e.count += g.count;
      gaps.set(k, e);
    }
    for (const [k, e] of gaps) {
      if (e.count < 3 || e.topic === 'other') continue;
      const pname = byId.get(e.productId)?.name;
      out.push({
        type: 'missing_info',
        key: k,
        severity: 'medium',
        productId: e.productId,
        groupKey: e.groupKey,
        title: `Thiếu thông tin ${(TOPIC_LABEL[e.topic] || 'khách hỏi').toLowerCase()}${pname ? ` của ${pname}` : ''}`,
        why: `${e.count} người hỏi nhưng danh mục chưa có thông tin này, nên gợi ý trả lời chỉ là "shop kiểm tra rồi báo lại".`,
        script: null,
        steps: ['Bổ sung vào Sản phẩm, chính sách', 'Gợi ý trả lời sẽ tự cập nhật ngay'],
        watch: 'repeat',
        do: { kind: 'open_catalog' }
      });
    }
  }

  // Tối đa 6 việc, mỗi loại tối đa 2: người đứng live chỉ làm được vài việc một lúc
  const perType = new Map();
  return out
    .map((a) => ({ ...a, id: `${a.type}|${a.key}` }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.lostValue || 0) - (a.lostValue || 0))
    .filter((a) => {
      const n = perType.get(a.type) || 0;
      perType.set(a.type, n + 1);
      return n < 2;
    })
    .slice(0, 6);
}

/**
 * Chỉ số trước/sau một hành động, mỗi bên 3 phút. Là so sánh trước-sau trên
 * cùng phiên, KHÔNG phải thử nghiệm có đối chứng: nhịp phiên live tự lên xuống,
 * nên giao diện ghi rõ "chưa loại trừ yếu tố khác".
 */
function measureEffect(agg, action, at, now = Date.now(), ended = false) {
  // Việc ghi trước khi có cách đo theo biến thể vẫn được đo đúng
  if (action.type === 'soldout_demand') {
    action = { ...action, watch: 'soldout', variant: action.variant ?? (String(action.key || '').split('|')[1] || null) };
  }
  const t = new Date(at).getTime();
  const span = 3 * MIN;
  // Phiên đã kết thúc: cửa sổ "sau" dừng ở bình luận cuối cùng
  const end = ended ? Math.max(agg.lastAt || t, t) : now;
  const ready = end >= t + span;
  const afterEnd = Math.min(t + span, end);
  const pick = {
    order: (e) => e.intent === 'order' && (!action.productId || action.type === 'engagement_drop' || e.productId === action.productId),
    soldout: (e) => e.intent === 'order' && e.productId === action.productId && (action.variant == null || e.size === action.variant || e.color === action.variant),
    complaint: (e) => e.intent === 'complaint',
    comments: () => true,
    repeat: (e) => e.groupKey && e.groupKey === action.groupKey,
    queue: (e) => e.intent === 'question'
  }[action.watch] || (() => true);
  const before = rate(agg.events, t - span, t, pick);
  const after = afterEnd - t >= 30 * 1000 ? rate(agg.events, t, afterEnd, pick) : 0;
  const LABEL = {
    order: 'lượt chốt mỗi phút',
    soldout: 'lượt chốt vào hàng đã hết mỗi phút',
    complaint: 'khiếu nại mỗi phút',
    comments: 'bình luận mỗi phút',
    repeat: 'người hỏi lại mỗi phút',
    queue: 'câu hỏi mới mỗi phút'
  };
  // Hướng tốt: chốt đơn, bình luận tăng; khiếu nại, câu hỏi lặp lại giảm
  const better = ['order', 'comments'].includes(action.watch) ? after > before : after < before;
  return { ready, metric: LABEL[action.watch] || 'bình luận mỗi phút', before, after, better: ready ? better : null };
}

module.exports = { coach, measureEffect, orderedQty, stockKeys };
