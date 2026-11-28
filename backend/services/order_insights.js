/**
 * PHÂN TÍCH ĐƠN HÀNG, HỦY ĐƠN, TRẢ HÀNG & KẾ HOẠCH NGÀY SALE — hàm thuần
 * ==================================================================
 * Đầu vào:
 *   - transactions        (đơn không hủy: hoàn thành, đang giao, đã giao)
 *   - cancellations       (collection order_cancellations: đơn đã hủy)
 *   - feedbacks           (ctx.items: phản hồi đã qua Trust Layer, nối chéo kênh bằng modelCode)
 *   - liveSessions        (phiên live không mô phỏng, đo live kéo đơn khi trùng ngày)
 *
 * Mọi tỉ lệ đều kèm khoảng tin cậy Wilson 95% và cỡ mẫu thật.
 * Không suy đoán "giao trễ" vì file sàn chỉ có hạn bàn giao và mốc xác nhận hoàn tất.
 */

const stats = require('./statistics');
const metrics = require('./metrics');
const { modelCodeOf, listingTagOf } = require('./product_group');
const { fitAndEvaluateCancelModel } = require('./cancel_model');

const VN_OFFSET_MS = 7 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 86400 * 1000;

const foldVi = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Khoảng tin cậy Wilson 95% cho tỉ lệ k / n */
function wilsonCI(k, n, z = 1.959964) {
  if (!Number.isFinite(n) || n <= 0) {
    return { rate: null, low: null, high: null, k: 0, n: 0 };
  }
  const safeK = Math.max(0, Math.min(n, Number(k) || 0));
  const p = safeK / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    rate: Number(p.toFixed(4)),
    low: Number(Math.max(0, center - half).toFixed(4)),
    high: Number(Math.min(1, center + half).toFixed(4)),
    k: safeK,
    n
  };
}

function quantile(values, q) {
  if (!values || !values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

const median = (values) => quantile(values, 0.5);
const p90 = (values) => quantile(values, 0.9);

/**
 * Phân loại trạng thái đơn hàng từ sàn:
 * - 'cancelled': đã hủy
 * - 'completed': hoàn thành / người mua xác nhận đã nhận hàng
 * - 'shipping': đang giao hoặc đã giao (chưa chốt hoàn tất)
 */
function classifyOrderStatus(status) {
  const f = foldVi(status);
  if (!f) return 'completed';
  if (/\b(da huy|huy|cancel|cancelled|canceled|tra hang hoan tien toan bo)\b/.test(f)) {
    return 'cancelled';
  }
  if (/\b(hoan thanh|completed|da nhan duoc hang|xac nhan da nhan)\b/.test(f)) {
    return 'completed';
  }
  return 'shipping';
}

const CANCEL_GROUP_META = {
  edit: { key: 'edit', label: 'Khách sửa đơn (đổi đơn, voucher, phân loại, địa chỉ)' },
  unpaid: { key: 'unpaid', label: 'Chưa thanh toán hoặc vướng thanh toán' },
  lost: { key: 'lost', label: 'Đổi ý hoặc tìm thấy giá rẻ hơn' },
  delivery: { key: 'delivery', label: 'Giao hàng thất bại' },
  service: { key: 'service', label: 'Người bán không trả lời thắc mắc' },
  other: { key: 'other', label: 'Lý do khác' }
};

const CANCEL_GROUP_ORDER = ['edit', 'unpaid', 'lost', 'delivery', 'service', 'other'];

/** Gom lý do hủy vào 5 nhóm chính + other (B3.2) */
function classifyCancelGroup(reason) {
  const f = foldVi(reason);
  if (!f) return 'other';
  if (/(thay doi don hang|change order|voucher|ma giam gia|thay doi san pham|change product|thay doi dia chi|change delivery address|change address)/.test(f)) {
    return 'edit';
  }
  if (/(chua duoc thanh toan|chua thanh toan|unpaid|thu tuc thanh toan|payment)/.test(f)) {
    return 'unpaid';
  }
  if (/(doi y|khong muon mua|change of mind|gia re hon|cheaper|better price)/.test(f)) {
    return 'lost';
  }
  if (/(giao hang that bai|giao that bai|delivery failed|failed delivery)/.test(f)) {
    return 'delivery';
  }
  if (/(nguoi ban khong tra loi|khong phan hoi|seller did not respond|unresponsive)/.test(f)) {
    return 'service';
  }
  return 'other';
}

/**
 * Tách tiền tố của sàn ("Hủy bởi người mua  lí do là: ...", "Tự động hủy bởi hệ thống ... lí do là: ...")
 * trả { cancelReason, cancelledBy ('buyer' | 'system'), cancelGroup }.
 */
function parseCancelReason(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return { cancelReason: null, cancelledBy: 'buyer', cancelGroup: 'other' };
  }
  const f = foldVi(text);
  let cancelledBy = 'buyer';
  if (/tu dong huy|he thong|system/.test(f)) {
    cancelledBy = 'system';
  } else if (!/huy boi nguoi mua|buyer/.test(f) && /(chua duoc thanh toan|giao hang that bai)/.test(f)) {
    cancelledBy = 'system';
  }

  const stripped = text
    .replace(/^(?:hủy bởi người mua|tự động hủy bởi hệ thống(?:\s+[^\s:]+)?|hủy bởi người bán)\s*(?:l[íý]\s*do\s*l[àa]\s*:\s*)?/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cancelReason = stripped || text.replace(/\s+/g, ' ');
  const cancelGroup = classifyCancelGroup(cancelReason);
  return { cancelReason, cancelledBy, cancelGroup };
}

function vnDateKey(ms) {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function vnHour(ms) {
  return new Date(ms + VN_OFFSET_MS).getUTCHours();
}

function vnWeekday(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function shortDayLabel(dateKey) {
  if (!dateKey) return '—';
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
}

function cleanProductTitle(name) {
  return String(name || '')
    .replace(/^\s*(?:\[[^\]]*\]\s*)+/g, '')
    .trim() || String(name || '').trim();
}

function linesOfOrder(doc) {
  if (Array.isArray(doc?.lines) && doc.lines.length > 0) return doc.lines;
  return [{
    sku: doc?.sku || null,
    productName: doc?.productName || null,
    modelCode: doc?.modelCode || modelCodeOf(doc?.productName) || null,
    listingTag: doc?.listingTag !== undefined ? doc.listingTag : listingTagOf(doc?.productName),
    quantity: Number(doc?.quantity) > 0 ? Number(doc.quantity) : 1,
    returnQty: Number(doc?.returnQty) > 0 ? Number(doc.returnQty) : 0,
    unitPrice: Number(doc?.unitPrice) > 0 ? Number(doc.unitPrice) : null
  }];
}

function isPreOrder(orderType) {
  const f = foldVi(orderType);
  return Boolean(f && /(dat truoc|pre-?order)/.test(f));
}

function hasReturn(doc, line = null) {
  if (line && Number(line.returnQty) > 0) return true;
  if (Number(doc?.returnQty) > 0) return true;
  return Boolean(doc?.returnStatus && String(doc.returnStatus).trim());
}

/**
 * Đo hiệu quả phiên live kéo đơn khi khoảng ngày đơn hàng phủ qua phiên live (B8).
 */
function computeLiveUplift(allOrders, liveSessions = []) {
  const realSessions = (liveSessions || []).filter(
    (s) => s && s.platform !== 'simulator' && !s.simulated && s.startedAt
  );
  if (!allOrders.length || !realSessions.length) {
    return {
      available: false,
      reason: !allOrders.length
        ? 'Chưa có dữ liệu đơn hàng'
        : 'Chưa có phiên live thật để đối chiếu với đơn hàng',
      sessionsMatched: 0
    };
  }

  let minOrderMs = Infinity;
  let maxOrderMs = -Infinity;
  for (const o of allOrders) {
    if (Number.isFinite(o.orderedMs)) {
      if (o.orderedMs < minOrderMs) minOrderMs = o.orderedMs;
      if (o.orderedMs > maxOrderMs) maxOrderMs = o.orderedMs;
    }
  }
  if (!Number.isFinite(minOrderMs)) {
    return { available: false, reason: 'Đơn hàng chưa có ngày đặt hợp lệ', sessionsMatched: 0 };
  }

  const minDay = vnDateKey(minOrderMs);
  const maxDay = vnDateKey(maxOrderMs);

  const overlapping = realSessions.filter((s) => {
    const st = new Date(s.startedAt).getTime();
    if (!Number.isFinite(st)) return false;
    const d = vnDateKey(st);
    return d >= minDay && d <= maxDay;
  });

  if (!overlapping.length) {
    return {
      available: false,
      reason: `Dữ liệu đơn kết thúc ngày ${shortDayLabel(maxDay)}, chưa phủ tới ngày diễn ra phiên live`,
      sessionsMatched: 0
    };
  }

  const liveSlotSet = new Set();
  const liveDaySet = new Set();
  const liveHourSet = new Set();
  const liveWeekdays = new Set();

  for (const s of overlapping) {
    const startMs = new Date(s.startedAt).getTime();
    const rawEnd = s.endedAt || s.lastActiveAt;
    const endMs = rawEnd ? Math.max(startMs, new Date(rawEnd).getTime()) : startMs + 2 * HOUR_MS;
    const cappedEnd = Math.min(endMs, startMs + 12 * HOUR_MS);
    for (let cur = Math.floor(startMs / HOUR_MS) * HOUR_MS; cur <= cappedEnd; cur += HOUR_MS) {
      const dKey = vnDateKey(cur);
      const hr = vnHour(cur);
      liveSlotSet.add(`${dKey}|${hr}`);
      liveDaySet.add(dKey);
      liveHourSet.add(hr);
      liveWeekdays.add(vnWeekday(dKey));
    }
  }

  // Tập ngày có mặt trong khoảng dữ liệu đơn
  const allDays = [];
  const startDayMs = Math.floor((minOrderMs + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  const endDayMs = Math.floor((maxOrderMs + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  for (let ms = startDayMs; ms <= endDayMs; ms += DAY_MS) {
    allDays.push(vnDateKey(ms));
  }

  const nonLiveDays = allDays.filter((d) => !liveDaySet.has(d));
  const sameWeekdayDays = nonLiveDays.filter((d) => liveWeekdays.has(vnWeekday(d)));
  const baselineDays = sameWeekdayDays.length >= 2 ? sameWeekdayDays : nonLiveDays;
  const baselineBasis = sameWeekdayDays.length >= 2 ? 'same_weekday' : 'non_live_days';
  const baselineDaySet = new Set(baselineDays);

  let liveOrders = 0;
  let liveActiveOrders = 0;
  let baselineOrders = 0;
  let liveTagInLive = 0;
  let liveTagOutside = 0;

  for (const o of allOrders) {
    if (!Number.isFinite(o.orderedMs)) continue;
    const dKey = vnDateKey(o.orderedMs);
    const hr = vnHour(o.orderedMs);
    const inLiveSlot = liveSlotSet.has(`${dKey}|${hr}`);
    const hasLiveTag = o.lines.some((l) => l.listingTag === 'live');
    if (inLiveSlot) {
      liveOrders += 1;
      if (!o.isCancelled) liveActiveOrders += 1;
      if (hasLiveTag) liveTagInLive += 1;
    } else {
      if (hasLiveTag) liveTagOutside += 1;
      if (baselineDaySet.has(dKey) && liveHourSet.has(hr)) {
        baselineOrders += 1;
      }
    }
  }

  const liveHoursCount = Math.max(1, liveSlotSet.size);
  const baselineHoursCount = baselineDays.length * liveHourSet.size;
  const liveOrdersPerHour = Number((liveOrders / liveHoursCount).toFixed(2));
  const baselineOrdersPerHour = baselineHoursCount > 0
    ? Number((baselineOrders / baselineHoursCount).toFixed(2))
    : null;
  const upliftRatio = baselineOrdersPerHour && baselineOrdersPerHour > 0
    ? Number((liveOrdersPerHour / baselineOrdersPerHour).toFixed(2))
    : null;

  return {
    available: true,
    sessionsMatched: overlapping.length,
    baselineBasis,
    baselineDaysCount: baselineDays.length,
    liveHoursCount,
    liveOrders,
    liveActiveOrders,
    liveOrdersPerHour,
    baselineOrders,
    baselineHoursCount,
    baselineOrdersPerHour,
    upliftRatio,
    liveTagOrdersInLive: liveTagInLive,
    liveTagOrdersOutside: liveTagOutside
  };
}

/**
 * Phân tích toàn diện đơn hàng + đơn hủy + đánh giá chéo kênh (B3, B6, B8).
 */
function analyzeOrders({ transactions = [], cancellations = [], feedbacks = [], liveSessions = [], skipModel = false } = {}) {
  const activeDocs = Array.isArray(transactions) ? transactions : [];
  const cancelDocs = Array.isArray(cancellations) ? cancellations : [];
  const totalOrders = activeDocs.length + cancelDocs.length;

  if (totalOrders === 0) {
    return {
      hasOrders: false,
      summary: null,
      cancelGroups: [],
      repurchase: null,
      byModel: [],
      byTag: [],
      saleDays: [],
      handover: null,
      nextSalePlan: null,
      liveUplift: { available: false, reason: 'Chưa có dữ liệu đơn hàng', sessionsMatched: 0 },
      limitations: []
    };
  }

  // Chuẩn hóa danh sách đơn hợp nhất
  const normalizedActive = activeDocs.map((doc) => {
    const orderedMs = doc.orderedAt ? new Date(doc.orderedAt).getTime() : NaN;
    const shippedMs = doc.shippedAt ? new Date(doc.shippedAt).getTime() : NaN;
    return {
      doc,
      isCancelled: false,
      state: classifyOrderStatus(doc.status),
      orderedMs,
      shippedMs,
      amount: Number(doc.amount) > 0 ? Number(doc.amount) : null,
      buyerKey: doc.buyerKey || null,
      preOrder: isPreOrder(doc.orderType),
      returned: hasReturn(doc),
      lines: linesOfOrder(doc)
    };
  });

  const normalizedCancel = cancelDocs.map((doc) => {
    const orderedMs = doc.orderedAt ? new Date(doc.orderedAt).getTime() : NaN;
    const shippedMs = doc.shippedAt ? new Date(doc.shippedAt).getTime() : NaN;
    const parsed = doc.cancelGroup
      ? { cancelReason: doc.cancelReason || null, cancelledBy: doc.cancelledBy || 'buyer', cancelGroup: doc.cancelGroup }
      : parseCancelReason(doc.cancelReason);
    return {
      doc,
      isCancelled: true,
      state: 'cancelled',
      orderedMs,
      shippedMs,
      amount: Number(doc.amount) > 0 ? Number(doc.amount) : null,
      buyerKey: doc.buyerKey || null,
      preOrder: isPreOrder(doc.orderType),
      returned: false,
      cancelGroup: parsed.cancelGroup,
      cancelReason: parsed.cancelReason,
      cancelledBy: parsed.cancelledBy,
      lines: linesOfOrder(doc)
    };
  });

  const allOrders = [...normalizedActive, ...normalizedCancel];

  // 1. Tóm tắt cấp đơn (summary)
  let completedCount = 0;
  let shippingCount = 0;
  let returnOrders = 0;
  const completedAmounts = [];
  let completedRevenue = 0;
  let cancelledValue = 0;
  let preOrderTotal = 0;
  let preOrderCancelled = 0;
  let normalOrderTotal = 0;
  let normalOrderCancelled = 0;
  const buyerOrderCounts = new Map();
  let minOrderMs = Infinity;
  let maxOrderMs = -Infinity;

  for (const o of allOrders) {
    if (Number.isFinite(o.orderedMs)) {
      if (o.orderedMs < minOrderMs) minOrderMs = o.orderedMs;
      if (o.orderedMs > maxOrderMs) maxOrderMs = o.orderedMs;
    }
    if (o.buyerKey) {
      buyerOrderCounts.set(o.buyerKey, (buyerOrderCounts.get(o.buyerKey) || 0) + 1);
    }
    if (o.preOrder) {
      preOrderTotal += 1;
      if (o.isCancelled) preOrderCancelled += 1;
    } else {
      normalOrderTotal += 1;
      if (o.isCancelled) normalOrderCancelled += 1;
    }

    if (o.isCancelled) {
      if (o.amount) cancelledValue += o.amount;
    } else {
      if (o.returned) returnOrders += 1;
      if (o.state === 'completed') {
        completedCount += 1;
        if (o.amount) {
          completedRevenue += o.amount;
          completedAmounts.push(o.amount);
        }
      } else {
        shippingCount += 1;
      }
    }
  }

  const avgOrderValue = completedAmounts.length ? Math.round(completedRevenue / completedAmounts.length) : null;
  const medianOrderValue = completedAmounts.length ? Math.round(median(completedAmounts)) : null;
  const repeatBuyers = [...buyerOrderCounts.values()].filter((n) => n >= 2).length;
  const spanDays = Number.isFinite(minOrderMs) && Number.isFinite(maxOrderMs)
    ? Math.max(1, Math.round((Math.floor((maxOrderMs + VN_OFFSET_MS) / DAY_MS) - Math.floor((minOrderMs + VN_OFFSET_MS) / DAY_MS)) + 1))
    : null;

  const summary = {
    totalOrders,
    completedOrders: completedCount,
    shippingOrders: shippingCount,
    cancelledOrders: cancelDocs.length,
    cancelWilson: wilsonCI(cancelDocs.length, totalOrders),
    cancelRate: totalOrders ? Number((cancelDocs.length / totalOrders).toFixed(4)) : 0,
    returnOrders,
    returnWilson: wilsonCI(returnOrders, activeDocs.length),
    completedRevenue: Math.round(completedRevenue),
    avgOrderValue,
    medianOrderValue,
    cancelledValue: Math.round(cancelledValue),
    preOrders: {
      total: preOrderTotal,
      cancelled: preOrderCancelled,
      cancelWilson: wilsonCI(preOrderCancelled, preOrderTotal),
      normalCancelWilson: wilsonCI(normalOrderCancelled, normalOrderTotal)
    },
    buyers: {
      unique: buyerOrderCounts.size,
      repeat: repeatBuyers
    },
    dateRange: Number.isFinite(minOrderMs) ? {
      from: new Date(minOrderMs).toISOString(),
      to: new Date(maxOrderMs).toISOString(),
      fromDay: vnDateKey(minOrderMs),
      toDay: vnDateKey(maxOrderMs),
      days: spanDays
    } : null
  };

  // 2. Mua lại sau hủy (cùng buyerKey + cùng sku, không có sku thì mã máy/tên, đặt đơn không hủy sau đó)
  const latestActiveOrderMs = new Map();
  const itemIdentity = (line) => {
    const sku = line.sku && String(line.sku).trim();
    if (sku) return `sku:${sku.toUpperCase()}`;
    const mc = line.modelCode || modelCodeOf(line.productName);
    if (mc) return `mc:${mc}`;
    const pn = line.productName && String(line.productName).trim();
    return pn ? `pn:${pn.toLowerCase()}` : null;
  };

  for (const o of normalizedActive) {
    if (!o.buyerKey || !Number.isFinite(o.orderedMs)) continue;
    for (const line of o.lines) {
      const idKey = itemIdentity(line);
      if (!idKey) continue;
      const k = `${o.buyerKey}|${idKey}`;
      const prev = latestActiveOrderMs.get(k);
      if (prev === undefined || o.orderedMs > prev) latestActiveOrderMs.set(k, o.orderedMs);
    }
  }

  const groupAgg = new Map(CANCEL_GROUP_ORDER.map((g) => [g, {
    key: g,
    label: CANCEL_GROUP_META[g].label,
    lines: 0,
    repurchasedLines: 0,
    buyerKnownLines: 0
  }]));

  let totalCancelledLines = 0;
  let totalRepurchasedLines = 0;

  // 3. Gom theo mã máy (byModel) và theo nhãn tên sản phẩm (byTag)
  const modelMap = new Map();
  const tagMap = new Map([
    ['kol', { key: 'kol', label: 'Nhãn KOL hợp tác', totalLines: 0, activeLines: 0, cancelledLines: 0 }],
    ['live', { key: 'live', label: 'Nhãn [LIVE]', totalLines: 0, activeLines: 0, cancelledLines: 0 }],
    ['regular', { key: 'regular', label: 'Đơn thường', totalLines: 0, activeLines: 0, cancelledLines: 0 }]
  ]);

  const ensureModel = (line) => {
    const mc = line.modelCode || modelCodeOf(line.productName) || null;
    const rawName = line.productName || 'Sản phẩm chưa rõ tên';
    const key = mc || rawName;
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        key,
        modelCode: mc,
        nameCounts: new Map(),
        totalLines: 0,
        activeLines: 0,
        cancelledLines: 0,
        returnLines: 0,
        soldQty: 0,
        cancelReasons: new Map(),
        unitPrices: [],
        completedOrderAmounts: []
      });
    }
    const entry = modelMap.get(key);
    if (line.productName) {
      const cleaned = cleanProductTitle(line.productName);
      entry.nameCounts.set(cleaned, (entry.nameCounts.get(cleaned) || 0) + 1);
    }
    return entry;
  };

  for (const o of normalizedActive) {
    const seenModelInOrder = new Set();
    for (const line of o.lines) {
      const m = ensureModel(line);
      m.totalLines += 1;
      m.activeLines += 1;
      const qty = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
      m.soldQty += qty;
      if (hasReturn(o.doc, line)) m.returnLines += 1;
      const price = Number(line.unitPrice) > 0 ? Number(line.unitPrice) : (o.amount ? o.amount / qty : null);
      if (price && price > 0) m.unitPrices.push(price);
      if (o.state === 'completed' && o.amount && !seenModelInOrder.has(m.key)) {
        seenModelInOrder.add(m.key);
        m.completedOrderAmounts.push(o.amount);
      }

      const tagKey = line.listingTag === 'kol' ? 'kol' : line.listingTag === 'live' ? 'live' : 'regular';
      const tEntry = tagMap.get(tagKey);
      tEntry.totalLines += 1;
      tEntry.activeLines += 1;
    }
  }

  for (const o of normalizedCancel) {
    const grp = groupAgg.get(o.cancelGroup) || groupAgg.get('other');
    for (const line of o.lines) {
      totalCancelledLines += 1;
      grp.lines += 1;

      const idKey = itemIdentity(line);
      if (o.buyerKey && idKey && Number.isFinite(o.orderedMs)) {
        grp.buyerKnownLines += 1;
        const laterMs = latestActiveOrderMs.get(`${o.buyerKey}|${idKey}`);
        if (laterMs !== undefined && laterMs >= o.orderedMs) {
          grp.repurchasedLines += 1;
          totalRepurchasedLines += 1;
        }
      }

      const m = ensureModel(line);
      m.totalLines += 1;
      m.cancelledLines += 1;
      m.cancelReasons.set(grp.key, (m.cancelReasons.get(grp.key) || 0) + 1);
      const price = Number(line.unitPrice) > 0 ? Number(line.unitPrice) : o.amount;
      if (price && price > 0) m.unitPrices.push(price);

      const tagKey = line.listingTag === 'kol' ? 'kol' : line.listingTag === 'live' ? 'live' : 'regular';
      const tEntry = tagMap.get(tagKey);
      tEntry.totalLines += 1;
      tEntry.cancelledLines += 1;
    }
  }

  const cancelGroups = CANCEL_GROUP_ORDER.map((k) => {
    const g = groupAgg.get(k);
    return {
      key: g.key,
      label: g.label,
      lines: g.lines,
      share: totalCancelledLines ? Number((g.lines / totalCancelledLines).toFixed(4)) : 0,
      wilson: wilsonCI(g.lines, totalCancelledLines),
      repurchasedLines: g.repurchasedLines,
      repurchaseRate: g.lines ? Number((g.repurchasedLines / g.lines).toFixed(4)) : null,
      repurchaseWilson: wilsonCI(g.repurchasedLines, g.lines)
    };
  }).filter((g) => g.lines > 0 || g.key !== 'other');

  const repurchase = {
    repurchasedLines: totalRepurchasedLines,
    totalCancelledLines,
    wilson: wilsonCI(totalRepurchasedLines, totalCancelledLines)
  };

  // Đếm đánh giá hợp lệ và lời chê theo modelCode trong kho phản hồi
  const fbByModel = new Map();
  for (const fb of feedbacks || []) {
    if (!metrics.isCountable(fb)) continue;
    const mc = fb.modelCode || modelCodeOf(fb.productName);
    if (!mc) continue;
    if (!fbByModel.has(mc)) fbByModel.set(mc, { total: 0, complaints: 0 });
    const fEntry = fbByModel.get(mc);
    fEntry.total += 1;
    if (metrics.isComplaint(fb)) fEntry.complaints += 1;
  }

  const totalAllLines = [...modelMap.values()].reduce((s, m) => s + m.totalLines, 0);
  const totalActiveLines = totalAllLines - totalCancelledLines;
  const totalReturnLines = [...modelMap.values()].reduce((s, m) => s + m.returnLines, 0);

  const modelRows = [...modelMap.values()].map((m) => {
    const bestName = [...m.nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || m.key;
    const topCancel = [...m.cancelReasons.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const fb = m.modelCode ? fbByModel.get(m.modelCode) : null;
    const feedbackTotal = fb ? fb.total : 0;
    const complaintCount = fb ? fb.complaints : 0;
    // Ước lượng chéo kênh: chỉ hiện khi đơn >= 50 và đánh giá >= 20
    const crossChannelPer1000 = (m.modelCode && m.totalLines >= 50 && feedbackTotal >= 20 && m.soldQty > 0)
      ? Number(((complaintCount / m.soldQty) * 1000).toFixed(1))
      : null;

    const avgPrice = m.unitPrices.length
      ? Math.round(m.unitPrices.reduce((s, x) => s + x, 0) / m.unitPrices.length)
      : null;
    const avgOrderAmount = m.completedOrderAmounts.length
      ? Math.round(m.completedOrderAmounts.reduce((s, x) => s + x, 0) / m.completedOrderAmounts.length)
      : avgPrice;

    const restTotal = totalAllLines - m.totalLines;
    const restCancelled = totalCancelledLines - m.cancelledLines;
    const cancelZ = (m.totalLines >= 30 && restTotal > 0)
      ? stats.twoProportionZTest(m.cancelledLines, m.totalLines, restCancelled, restTotal)
      : null;

    const restActive = totalActiveLines - m.activeLines;
    const restReturns = totalReturnLines - m.returnLines;
    const returnZ = (m.activeLines >= 30 && restActive > 0)
      ? stats.twoProportionZTest(m.returnLines, m.activeLines, restReturns, restActive)
      : null;

    return {
      key: m.key,
      modelCode: m.modelCode,
      name: bestName,
      totalLines: m.totalLines,
      activeLines: m.activeLines,
      cancelledLines: m.cancelledLines,
      cancelRate: m.totalLines ? Number((m.cancelledLines / m.totalLines).toFixed(4)) : 0,
      cancelWilson: wilsonCI(m.cancelledLines, m.totalLines),
      topCancelGroup: topCancel ? topCancel[0] : null,
      topCancelGroupLabel: topCancel ? CANCEL_GROUP_META[topCancel[0]]?.label || topCancel[0] : null,
      topCancelGroupLines: topCancel ? topCancel[1] : 0,
      returnLines: m.returnLines,
      returnRate: m.activeLines ? Number((m.returnLines / m.activeLines).toFixed(4)) : null,
      returnWilson: wilsonCI(m.returnLines, m.activeLines),
      soldQty: m.soldQty,
      avgPrice,
      avgOrderAmount,
      feedbackTotal,
      complaintCount,
      crossChannelPer1000,
      _cancelZ: cancelZ,
      _returnZ: returnZ,
      cancelFlag: false,
      returnFlag: false,
      flag: null
    };
  });

  // Kiểm định hai tỉ lệ + hiệu chỉnh Benjamini-Hochberg trên mọi mã đủ cỡ mẫu >= 30
  const cancelCandidates = modelRows.filter((r) => r._cancelZ);
  if (cancelCandidates.length > 0) {
    const bhCancel = stats.benjaminiHochberg(
      cancelCandidates.map((r) => ({ p: r._cancelZ.delta > 0 ? r._cancelZ.p : 1 })),
      stats.ALERT_THRESHOLDS.fdrLevel
    );
    cancelCandidates.forEach((r, idx) => {
      if (r._cancelZ.delta > 0 && r._cancelZ.p < 0.01 && bhCancel[idx].significant) {
        r.cancelFlag = true;
      }
      r.cancelTest = {
        z: Number(r._cancelZ.z.toFixed(2)),
        p: r._cancelZ.p,
        qValue: bhCancel[idx].qValue,
        restRate: Number(r._cancelZ.p2.toFixed(4))
      };
    });
  }

  const returnCandidates = modelRows.filter((r) => r._returnZ);
  if (returnCandidates.length > 0) {
    const bhReturn = stats.benjaminiHochberg(
      returnCandidates.map((r) => ({ p: r._returnZ.delta > 0 ? r._returnZ.p : 1 })),
      stats.ALERT_THRESHOLDS.fdrLevel
    );
    returnCandidates.forEach((r, idx) => {
      if (r._returnZ.delta > 0 && r._returnZ.p < 0.01 && bhReturn[idx].significant) {
        r.returnFlag = true;
      }
      r.returnTest = {
        z: Number(r._returnZ.z.toFixed(2)),
        p: r._returnZ.p,
        qValue: bhReturn[idx].qValue,
        restRate: Number(r._returnZ.p2.toFixed(4))
      };
    });
  }

  for (const r of modelRows) {
    r.flag = r.cancelFlag && r.returnFlag ? 'both' : r.cancelFlag ? 'cancel' : r.returnFlag ? 'return' : null;
    delete r._cancelZ;
    delete r._returnZ;
  }
  modelRows.sort((a, b) => b.totalLines - a.totalLines);

  // 4. Theo nhãn trong tên sản phẩm (byTag)
  const byTag = ['kol', 'live', 'regular'].map((k) => {
    const t = tagMap.get(k);
    return {
      key: t.key,
      label: t.label,
      totalLines: t.totalLines,
      activeLines: t.activeLines,
      cancelledLines: t.cancelledLines,
      shareOfLines: totalAllLines ? Number((t.totalLines / totalAllLines).toFixed(4)) : 0,
      cancelRate: t.totalLines ? Number((t.cancelledLines / t.totalLines).toFixed(4)) : null,
      cancelWilson: wilsonCI(t.cancelledLines, t.totalLines)
    };
  });

  // 5. Ngày sale (số đơn >= 3 x trung vị các ngày) & bàn giao vận chuyển (handover)
  const byDay = new Map();
  for (const o of allOrders) {
    if (!Number.isFinite(o.orderedMs)) continue;
    const dKey = vnDateKey(o.orderedMs);
    const hr = vnHour(o.orderedMs);
    if (!byDay.has(dKey)) {
      byDay.set(dKey, {
        date: dKey,
        label: shortDayLabel(dKey),
        orders: 0,
        cancelled: 0,
        unpaidCancelled: 0,
        hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, cancelled: 0, unpaidCancelled: 0 })),
        modelCounts: new Map()
      });
    }
    const day = byDay.get(dKey);
    day.orders += 1;
    day.hours[hr].orders += 1;
    if (o.isCancelled) {
      day.cancelled += 1;
      day.hours[hr].cancelled += 1;
      if (o.cancelGroup === 'unpaid') {
        day.unpaidCancelled += 1;
        day.hours[hr].unpaidCancelled += 1;
      }
    }
    for (const line of o.lines) {
      const mKey = line.modelCode || modelCodeOf(line.productName) || line.productName || 'Khác';
      if (!day.modelCounts.has(mKey)) day.modelCounts.set(mKey, { total: 0, cancelled: 0 });
      const mc = day.modelCounts.get(mKey);
      mc.total += 1;
      if (o.isCancelled) mc.cancelled += 1;
    }
  }

  const dayList = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const dailyCounts = dayList.map((d) => d.orders);
  const medianDailyOrders = dailyCounts.length ? median(dailyCounts) : 0;
  const saleThreshold = medianDailyOrders > 0 ? medianDailyOrders * 3 : Infinity;
  const saleDaySet = new Set(dayList.filter((d) => d.orders >= saleThreshold).map((d) => d.date));

  let normalDayOrders = 0;
  let normalDayCancelled = 0;
  for (const d of dayList) {
    if (!saleDaySet.has(d.date)) {
      normalDayOrders += d.orders;
      normalDayCancelled += d.cancelled;
    }
  }

  const saleDays = dayList
    .filter((d) => saleDaySet.has(d.date))
    .sort((a, b) => b.orders - a.orders)
    .map((d) => ({
      date: d.date,
      label: d.label,
      orders: d.orders,
      cancelled: d.cancelled,
      unpaidCancelled: d.unpaidCancelled,
      cancelWilson: wilsonCI(d.cancelled, d.orders),
      unpaidShare: d.orders ? Number((d.unpaidCancelled / d.orders).toFixed(4)) : 0,
      unpaidWilson: wilsonCI(d.unpaidCancelled, d.orders),
      medianDailyOrders: Math.round(medianDailyOrders),
      normalDayCancelWilson: wilsonCI(normalDayCancelled, normalDayOrders),
      byHour: d.hours.map((h) => ({
        hour: h.hour,
        orders: h.orders,
        sharePct: d.orders ? Number(((h.orders / d.orders) * 100).toFixed(1)) : 0,
        cancelled: h.cancelled,
        unpaidCancelled: h.unpaidCancelled
      })),
      _modelCounts: d.modelCounts
    }));

  // 6. Thời gian đặt -> bàn giao vận chuyển (handover, tính bằng giờ; KHÔNG tính giao trễ)
  const handoverAll = [];
  const handoverSale = [];
  const handoverNormal = [];
  for (const o of allOrders) {
    if (!Number.isFinite(o.orderedMs) || !Number.isFinite(o.shippedMs)) continue;
    if (o.shippedMs < o.orderedMs) continue;
    const hrs = (o.shippedMs - o.orderedMs) / HOUR_MS;
    if (hrs > 24 * 60) continue;
    handoverAll.push(hrs);
    if (saleDaySet.has(vnDateKey(o.orderedMs))) handoverSale.push(hrs);
    else handoverNormal.push(hrs);
  }
  const summarizeHours = (arr) => ({
    count: arr.length,
    medianHours: arr.length ? Number(median(arr).toFixed(1)) : null,
    p90Hours: arr.length ? Number(p90(arr).toFixed(1)) : null
  });
  const handover = {
    overall: summarizeHours(handoverAll),
    normalDays: summarizeHours(handoverNormal),
    saleDays: summarizeHours(handoverSale)
  };

  // B6. Kế hoạch chuẩn bị ngày sale kế tiếp (từ ngày sale lớn nhất đã có, chỉ báo tỉ lệ %, không dự báo số đơn tuyệt đối)
  let nextSalePlan = null;
  if (saleDays.length > 0) {
    const biggest = saleDays[0];
    const modelByKey = new Map(modelRows.map((r) => [r.key, r]));
    const top10Models = [...biggest._modelCounts.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([k, v]) => {
        const info = modelByKey.get(k);
        return {
          key: k,
          modelCode: info?.modelCode || null,
          name: info?.name || k,
          sharePct: biggest.orders ? Number(((v.total / biggest.orders) * 100).toFixed(1)) : 0,
          cancelRate: v.total ? Number((v.cancelled / v.total).toFixed(4)) : 0,
          cancelWilson: wilsonCI(v.cancelled, v.total),
          overallCancelFlag: Boolean(info?.cancelFlag)
        };
      });

    // Tìm khung 3 giờ liên tiếp có nhiều đơn nhất và nhiều hủy chưa thanh toán nhất
    const bestWindow = (field) => {
      let bestStart = 20;
      let bestSum = -1;
      for (let h = 0; h <= 21; h += 1) {
        const sum = biggest.byHour[h][field] + biggest.byHour[h + 1][field] + biggest.byHour[h + 2][field];
        if (sum > bestSum) { bestSum = sum; bestStart = h; }
      }
      const totalField = biggest.byHour.reduce((s, x) => s + x[field], 0);
      return {
        fromHour: bestStart,
        toHour: bestStart + 2,
        label: `${bestStart} đến ${bestStart + 2} giờ`,
        sharePct: totalField > 0 ? Number(((bestSum / totalField) * 100).toFixed(1)) : 0
      };
    };

    const peakOrderWindow = bestWindow('orders');
    const peakUnpaidWindow = bestWindow('unpaidCancelled');
    const highCancelTop = top10Models.filter((m) => m.cancelRate >= 0.5);
    const basisNote = saleDays.length === 1
      ? `Dựa trên một ngày sale (${biggest.label})`
      : `Dựa trên ${saleDays.length} ngày sale (lớn nhất ${biggest.label})`;

    nextSalePlan = {
      basedOnDate: biggest.date,
      basedOnLabel: biggest.label,
      saleDayCount: saleDays.length,
      basisNote,
      hourlyShare: biggest.byHour.map((h) => ({
        hour: h.hour,
        pct: h.sharePct,
        unpaidSharePct: biggest.orders ? Number(((h.unpaidCancelled / biggest.orders) * 100).toFixed(1)) : 0
      })),
      top10Models,
      peakOrderWindow,
      peakUnpaidWindow,
      prepTasks: [
        {
          id: 'staffing',
          title: `Bố trí người trực tin nhắn và nhắc thanh toán khung ${peakOrderWindow.label}`,
          detail: `Khung ${peakOrderWindow.label} chiếm ${String(peakOrderWindow.sharePct).replace('.', ',')}% lượng đơn ngày sale${biggest.unpaidCancelled > 0 ? `; hủy chưa thanh toán dồn mạnh nhất ở khung ${peakUnpaidWindow.label}` : ''}.`
        },
        {
          id: 'inventory',
          title: `Chuẩn bị tồn kho và đóng gói sẵn cho ${top10Models.length} mã bán chạy đầu bảng`,
          detail: `Nhóm đầu gồm ${top10Models.slice(0, 5).map((m) => m.modelCode || m.name).join(', ')} chiếm phần lớn lượng đặt trong ngày sale.`
        },
        {
          id: 'listing',
          title: highCancelTop.length
            ? `Sửa trang sản phẩm các mã tỉ lệ hủy cao trước ngày sale (${highCancelTop.slice(0, 4).map((m) => m.modelCode || m.name).join(', ')})`
            : 'Rà lại voucher hiện sẵn trên trang sản phẩm và phân loại hàng trước giờ mở sale',
          detail: 'Gắn rõ phân loại, hiển thị sẵn mã giảm giá của shop trên trang để giảm khách hủy đơn đặt lại.'
        }
      ]
    };
  }

  for (const s of saleDays) delete s._modelCounts;

  // B7. Mô hình hồi quy logistic dự báo nguy cơ hủy đơn từ đặc trưng lúc đặt đơn (chỉ bật khi qua ngưỡng)
  // Đường cảnh báo / hộp việc không cần mô hình: bỏ bước huấn luyện (vài trăm ms CPU trên luồng chính)
  const cancelModel = skipModel ? null : fitAndEvaluateCancelModel({ transactions: activeDocs, cancellations: cancelDocs });

  // B8. Live kéo đơn
  const liveUplift = computeLiveUplift(allOrders, liveSessions);

  const limitations = [
    'Cột thời gian hoàn thành đơn là lúc người mua bấm xác nhận hoặc sàn tự tất toán, còn ngày giao dự kiến là hạn bàn giao nhà vận chuyển, nên hệ thống không tính chỉ số giao trễ từ file này.',
    'Nối đơn hàng với đánh giá qua mã máy là ước lượng theo dòng sản phẩm chéo kênh, không phải đối soát từng người mua.'
  ];
  if (summary.dateRange && summary.dateRange.days < 30) {
    limitations.push(`Dữ liệu hiện trải trên ${summary.dateRange.days} ngày${saleDays.length ? `, riêng ngày sale lớn nhất chiếm ${Math.round((saleDays[0].orders / totalOrders) * 100)}% tổng đơn` : ''}: chưa đủ dài để dự báo số đơn cụ thể theo ngày.`);
  }
  if (!liveUplift.available && liveSessions.length > 0) {
    limitations.push(liveUplift.reason);
  }

  return {
    hasOrders: true,
    summary,
    cancelGroups,
    repurchase,
    byModel: modelRows,
    byTag,
    saleDays,
    handover,
    nextSalePlan,
    cancelModel,
    liveUplift,
    limitations
  };
}

/**
 * Tính nhanh mức kéo đơn trên sàn cho một phiên live cụ thể (dùng cho báo cáo sau phiên live B8).
 */
function computeSessionOrderUplift({ transactions = [], cancellations = [], session = null } = {}) {
  const hasOrderBook = (transactions?.length || 0) + (cancellations?.length || 0) > 0;
  if (!hasOrderBook) return { available: false, hasOrderBook: false, reason: 'Chưa có dữ liệu đơn hàng', sessionsMatched: 0 };
  if (!session || session.simulated || session.platform === 'simulator') {
    return { available: false, hasOrderBook, reason: 'Phiên mô phỏng không đối chiếu đơn thật', sessionsMatched: 0 };
  }
  const allOrders = [
    ...(transactions || []).map((doc) => ({
      isCancelled: false,
      orderedMs: doc?.orderedAt ? new Date(doc.orderedAt).getTime() : NaN,
      lines: linesOfOrder(doc)
    })),
    ...(cancellations || []).map((doc) => ({
      isCancelled: true,
      orderedMs: doc?.orderedAt ? new Date(doc.orderedAt).getTime() : NaN,
      lines: linesOfOrder(doc)
    }))
  ];
  return { hasOrderBook: true, ...computeLiveUplift(allOrders, [session]) };
}

module.exports = {
  CANCEL_GROUP_META,
  CANCEL_GROUP_ORDER,
  wilsonCI,
  classifyOrderStatus,
  classifyCancelGroup,
  parseCancelReason,
  computeLiveUplift,
  computeSessionOrderUplift,
  analyzeOrders
};
