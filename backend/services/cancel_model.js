/**
 * MÔ HÌNH HỒI QUY LOGISTIC DỰ BÁO NGUY CƠ HỦY ĐƠN (B7 — JS THUẦN)
 * ==================================================================
 * Chỉ dùng đặc trưng biết được NGAY LÚC ĐẶT ĐƠN (pre-order features):
 *   - Mã máy: one-hot 20 mã nhiều đơn nhất trên tập huấn luyện, phần còn lại gộp
 *   - Nhãn đăng bán: KOL hợp tác, [LIVE]
 *   - Khung giờ đặt theo giờ Việt Nam (6 khung 4 giờ)
 *   - Ngày sale lớn (ngưỡng 3x trung vị đơn ngày tính riêng trên tập huấn luyện)
 *   - Hàng đặt trước (preOrder)
 *   - Có dùng mã giảm giá của shop (hasShopVoucher)
 *   - Log giá trị đơn hàng (chuẩn hóa theo trung bình & độ lệch chuẩn tập huấn luyện)
 *   - Tỉnh / thành nhận hàng: one-hot 10 tỉnh nhiều nhất trên tập huấn luyện + khác
 *
 * TUYỆT ĐỐI KHÔNG ĐỌC các trường phát sinh sau khi đặt đơn (chống rò rỉ nhãn):
 *   `cancelReason`, `cancelGroup`, `cancelledBy`, `cancelledAt`, `carrier`
 *   (đơn hủy trước khi gán hãng có `carrier = "Nhanh"`), `shippedAt`, `deliveredAt`,
 *   `completedAt`, `returnStatus`, `returnQty`.
 *
 * Quy tắc hiển thị:
 *   - Kiểm định tách theo thời gian: mặc định học trên đơn trước 12/11 00:00 giờ VN,
 *     kiểm trên đơn từ 12/11 00:00 giờ VN.
 *   - Chỉ bật `passedThreshold = true` khi `testCount >= 300` VÀ `auc >= 0,65`.
 *   - Chỉ trích xuất tối đa 5 yếu tố làm tăng nguy cơ hủy (hệ số chuẩn hóa dương lớn nhất),
 *     không chấm điểm từng người mua.
 */

const { modelCodeOf, listingTagOf } = require('./product_group');

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const HOUR_BUCKETS = [
  { key: 'hour_0_3', from: 0, to: 3, label: 'Đặt khung 0 đến 3 giờ' },
  { key: 'hour_4_7', from: 4, to: 7, label: 'Đặt khung 4 đến 7 giờ' },
  { key: 'hour_8_11', from: 8, to: 11, label: 'Đặt khung 8 đến 11 giờ' },
  { key: 'hour_12_15', from: 12, to: 15, label: 'Đặt khung 12 đến 15 giờ' },
  { key: 'hour_16_19', from: 16, to: 19, label: 'Đặt khung 16 đến 19 giờ' },
  { key: 'hour_20_23', from: 20, to: 23, label: 'Đặt khung 20 đến 23 giờ' }
];

const FORBIDDEN_POST_ORDER_FIELDS = Object.freeze([
  'cancelReason',
  'cancelGroup',
  'cancelledBy',
  'cancelledAt',
  'carrier',
  'shippedAt',
  'deliveredAt',
  'completedAt',
  'returnStatus',
  'returnQty'
]);

function vnDateKey(ms) {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function vnHour(ms) {
  return new Date(ms + VN_OFFSET_MS).getUTCHours();
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sigmoid(z) {
  if (z >= 35) return 1 - 1e-15;
  if (z <= -35) return 1e-15;
  return 1 / (1 + Math.exp(-z));
}

function isPreOrderType(orderType) {
  const s = String(orderType || '').toLowerCase();
  return s.includes('đặt trước') || s.includes('dat truoc') || s.includes('pre-order') || s.includes('preorder');
}

function hasVoucherValue(v) {
  if (!v) return false;
  const s = String(v).trim();
  return Boolean(s && s !== '0' && s !== '0.00' && s.toLowerCase() !== 'không' && s.toLowerCase() !== 'none');
}

/**
 * Chỉ đọc đúng các trường biết được tại thời điểm khách bấm đặt đơn.
 */
function extractPreOrderSample(doc, isCancelled) {
  const orderedMs = doc?.orderedAt ? new Date(doc.orderedAt).getTime() : NaN;
  if (!Number.isFinite(orderedMs)) return null;

  const lines = Array.isArray(doc?.lines) && doc.lines.length > 0 ? doc.lines : null;
  let modelCode = doc?.modelCode || modelCodeOf(doc?.productName) || null;
  let hasKol = (doc?.listingTag || listingTagOf(doc?.productName)) === 'kol';
  let hasLive = (doc?.listingTag || listingTagOf(doc?.productName)) === 'live';

  if (lines) {
    for (const l of lines) {
      if (!modelCode) modelCode = l?.modelCode || modelCodeOf(l?.productName) || null;
      const tag = l?.listingTag || listingTagOf(l?.productName);
      if (tag === 'kol') hasKol = true;
      if (tag === 'live') hasLive = true;
    }
  }

  const rawAmt = Number(doc?.amount);
  const amount = Number.isFinite(rawAmt) && rawAmt > 0 ? rawAmt : null;
  const region = doc?.region && String(doc.region).trim() ? String(doc.region).trim() : 'Khác';

  return {
    orderedMs,
    dayKey: vnDateKey(orderedMs),
    hour: vnHour(orderedMs),
    modelCode: modelCode || '__NO_MODEL__',
    hasKol: hasKol ? 1 : 0,
    hasLive: hasLive ? 1 : 0,
    preOrder: isPreOrderType(doc?.orderType) ? 1 : 0,
    hasShopVoucher: hasVoucherValue(doc?.shopVoucher) ? 1 : 0,
    logAmount: amount != null ? Math.log1p(amount) : null,
    region,
    y: isCancelled ? 1 : 0
  };
}

/**
 * Tính ROC AUC bằng thống kê Mann–Whitney U (xử lý đồng hạng chính xác, O(n log n)).
 */
function computeRocAuc(yTrue, yProb) {
  const n = yTrue.length;
  if (n === 0) return null;
  let nPos = 0;
  let nNeg = 0;
  const pairs = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (yTrue[i] === 1) nPos += 1;
    else nNeg += 1;
    pairs[i] = { p: yProb[i], y: yTrue[i] };
  }
  if (nPos === 0 || nNeg === 0) return null;

  pairs.sort((a, b) => a.p - b.p);
  let rankSumPos = 0;
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && Math.abs(pairs[j].p - pairs[i].p) <= 1e-12) j += 1;
    // Hạng trung bình cho nhóm đồng điểm (bắt đầu từ 1)
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) {
      if (pairs[k].y === 1) rankSumPos += avgRank;
    }
    i = j;
  }

  const uStat = rankSumPos - (nPos * (nPos + 1)) / 2;
  return uStat / (nPos * nNeg);
}

function computeBrier(yTrue, yProb) {
  if (!yTrue.length) return null;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i += 1) {
    const d = yProb[i] - yTrue[i];
    sum += d * d;
  }
  return sum / yTrue.length;
}

function chooseSplitMs(samples, explicitSplitAt) {
  if (explicitSplitAt) {
    const t = new Date(explicitSplitAt).getTime();
    if (Number.isFinite(t)) return { splitMs: t, splitRule: 'explicit' };
  }
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const s of samples) {
    if (s.orderedMs < minMs) minMs = s.orderedMs;
    if (s.orderedMs > maxMs) maxMs = s.orderedMs;
  }
  // Ưu tiên mốc cố định 12/11 00:00 giờ VN theo đúng kế hoạch B7 nếu dữ liệu phủ qua mốc này
  const minYear = new Date(minMs + VN_OFFSET_MS).getUTCFullYear();
  const maxYear = new Date(maxMs + VN_OFFSET_MS).getUTCFullYear();
  for (let yr = minYear; yr <= maxYear; yr += 1) {
    const nov12VnMs = new Date(`${yr}-11-12T00:00:00+07:00`).getTime();
    if (minMs < nov12VnMs && maxMs >= nov12VnMs) {
      return { splitMs: nov12VnMs, splitRule: 'nov12_00h_vn' };
    }
  }
  // Dự phòng cho dữ liệu tháng khác: tách 70% đầu làm tập học, 30% sau làm tập kiểm theo thời gian
  const sortedMs = samples.map((s) => s.orderedMs).sort((a, b) => a - b);
  const rawSplit = sortedMs[Math.floor(sortedMs.length * 0.7)];
  const dayStartVnMs = Math.floor((rawSplit + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  const splitMs = dayStartVnMs > minMs ? dayStartVnMs : rawSplit;
  return { splitMs, splitRule: 'temporal_70_30' };
}

function formatEffectWords(stdCoef) {
  const numStr = `+${stdCoef.toFixed(2).replace('.', ',')}`;
  if (stdCoef >= 0.25) return `Tác động mạnh (hệ số chuẩn hóa ${numStr})`;
  if (stdCoef >= 0.1) return `Tác động vừa (hệ số chuẩn hóa ${numStr})`;
  return `Tác động nhẹ (hệ số chuẩn hóa ${numStr})`;
}

/**
 * Huấn luyện hồi quy logistic chuẩn hóa L2 bằng Gradient Descent + bước Nesterov trên tập học,
 * sau đó đánh giá độc lập trên tập kiểm theo thời gian.
 */
function fitAndEvaluateCancelModel({
  transactions = [],
  cancellations = [],
  splitAt = null,
  l2Lambda = 5.0,
  minTestCount = 300,
  minAuc = 0.65
} = {}) {
  const samples = [];
  for (const doc of transactions || []) {
    const s = extractPreOrderSample(doc, false);
    if (s) samples.push(s);
  }
  for (const doc of cancellations || []) {
    const s = extractPreOrderSample(doc, true);
    if (s) samples.push(s);
  }

  if (samples.length < 80) {
    return {
      available: false,
      passedThreshold: false,
      reason: 'Chưa đủ số đơn có ngày đặt hợp lệ để huấn luyện và kiểm định mô hình',
      totalCount: samples.length,
      trainCount: 0,
      testCount: 0,
      auc: null,
      brier: null,
      baselineBrier: null,
      topFactors: []
    };
  }

  const { splitMs, splitRule } = chooseSplitMs(samples, splitAt);
  const train = [];
  const test = [];
  for (const s of samples) {
    if (s.orderedMs < splitMs) train.push(s);
    else test.push(s);
  }

  if (train.length < 50 || test.length < 20) {
    return {
      available: false,
      passedThreshold: false,
      splitAt: new Date(splitMs).toISOString(),
      splitRule,
      reason: `Tập học (${train.length}) hoặc tập kiểm (${test.length}) sau mốc tách thời gian quá nhỏ`,
      totalCount: samples.length,
      trainCount: train.length,
      testCount: test.length,
      auc: null,
      brier: null,
      baselineBrier: null,
      topFactors: []
    };
  }

  // 1. Thống kê chỉ tính TRÊN TẬP HỌC (tránh rò rỉ từ tập kiểm):
  //    - Top 20 mã máy
  //    - Top 10 tỉnh/thành
  //    - Trung bình log(amount) để điền khuyết
  //    - Ngưỡng ngày sale (3x trung vị đơn/ngày của tập học)
  const modelCounts = new Map();
  const regionCounts = new Map();
  const trainDayCounts = new Map();
  let logAmtSum = 0;
  let logAmtN = 0;

  for (const s of train) {
    if (s.modelCode && s.modelCode !== '__NO_MODEL__') {
      modelCounts.set(s.modelCode, (modelCounts.get(s.modelCode) || 0) + 1);
    }
    if (s.region && s.region !== 'Khác') {
      regionCounts.set(s.region, (regionCounts.get(s.region) || 0) + 1);
    }
    trainDayCounts.set(s.dayKey, (trainDayCounts.get(s.dayKey) || 0) + 1);
    if (s.logAmount != null) {
      logAmtSum += s.logAmount;
      logAmtN += 1;
    }
  }

  const topModels = [...modelCounts.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([k]) => k);
  const topModelSet = new Set(topModels);

  const topRegions = [...regionCounts.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([k]) => k);
  const topRegionSet = new Set(topRegions);

  const meanLogAmt = logAmtN > 0 ? logAmtSum / logAmtN : Math.log1p(500000);
  const trainMedianDaily = median([...trainDayCounts.values()]);
  const saleOrderThreshold = trainMedianDaily > 0 ? trainMedianDaily * 3 : Infinity;

  // Đếm tổng đơn mỗi ngày để gắn cờ ngày sale theo ngưỡng rút từ tập học (không chạm nhãn hủy)
  const allDayCounts = new Map();
  for (const s of samples) {
    allDayCounts.set(s.dayKey, (allDayCounts.get(s.dayKey) || 0) + 1);
  }

  // 2. Định nghĩa danh sách đặc trưng (không tính hệ số chặn)
  const featureDefs = [
    ...topModels.map((mc) => ({ key: `model:${mc}`, label: `Mã sản phẩm ${mc}` })),
    { key: 'model:__OTHER__', label: 'Nhóm mã sản phẩm nhỏ lẻ khác' },
    { key: 'tag:kol', label: 'Sản phẩm gắn nhãn KOL hợp tác' },
    { key: 'tag:live', label: 'Sản phẩm gắn nhãn [LIVE]' },
    ...HOUR_BUCKETS.map((b) => ({ key: b.key, label: b.label })),
    { key: 'is_sale_day', label: 'Đặt trong ngày sale lớn' },
    { key: 'pre_order', label: 'Đơn hàng đặt trước' },
    { key: 'shop_voucher', label: 'Dùng mã giảm giá của shop' },
    { key: 'log_amount', label: 'Giá trị đơn hàng cao' },
    ...topRegions.map((rg) => ({ key: `region:${rg}`, label: `Giao tới ${rg}` })),
    { key: 'region:__OTHER__', label: 'Giao tới tỉnh thành khác' }
  ];

  const P = featureDefs.length;
  const modelIdx = new Map(topModels.map((mc, idx) => [mc, idx]));
  const otherModelCol = topModels.length;
  const kolCol = otherModelCol + 1;
  const liveCol = otherModelCol + 2;
  const hourBaseCol = otherModelCol + 3;
  const saleDayCol = hourBaseCol + 6;
  const preOrderCol = saleDayCol + 1;
  const voucherCol = saleDayCol + 2;
  const logAmtCol = saleDayCol + 3;
  const regionBaseCol = logAmtCol + 1;
  const regionIdx = new Map(topRegions.map((rg, idx) => [rg, regionBaseCol + idx]));
  const otherRegionCol = regionBaseCol + topRegions.length;

  const vectorize = (s) => {
    const x = new Float64Array(P);
    if (topModelSet.has(s.modelCode)) x[modelIdx.get(s.modelCode)] = 1;
    else x[otherModelCol] = 1;

    x[kolCol] = s.hasKol;
    x[liveCol] = s.hasLive;

    const bucket = Math.min(5, Math.max(0, Math.floor(s.hour / 4)));
    x[hourBaseCol + bucket] = 1;

    x[saleDayCol] = (allDayCounts.get(s.dayKey) || 0) >= saleOrderThreshold ? 1 : 0;
    x[preOrderCol] = s.preOrder;
    x[voucherCol] = s.hasShopVoucher;
    x[logAmtCol] = s.logAmount != null ? s.logAmount : meanLogAmt;

    if (topRegionSet.has(s.region)) x[regionIdx.get(s.region)] = 1;
    else x[otherRegionCol] = 1;

    return x;
  };

  // 3. Chuẩn hóa đặc trưng theo trung bình & độ lệch chuẩn của TẬP HỌC
  const nTrain = train.length;
  const XTrain = train.map(vectorize);
  const yTrain = new Float64Array(nTrain);
  let trainPos = 0;
  for (let i = 0; i < nTrain; i += 1) {
    yTrain[i] = train[i].y;
    trainPos += train[i].y;
  }

  const trainCancelRate = trainPos / nTrain;
  if (trainPos === 0 || trainPos === nTrain) {
    return {
      available: false,
      passedThreshold: false,
      splitAt: new Date(splitMs).toISOString(),
      splitRule,
      reason: 'Tập học chỉ có một lớp nhãn nên không thể khớp hồi quy logistic',
      totalCount: samples.length,
      trainCount: nTrain,
      testCount: test.length,
      auc: null,
      brier: null,
      baselineBrier: null,
      topFactors: []
    };
  }

  const means = new Float64Array(P);
  const stds = new Float64Array(P);
  for (let i = 0; i < nTrain; i += 1) {
    const row = XTrain[i];
    for (let j = 0; j < P; j += 1) means[j] += row[j];
  }
  for (let j = 0; j < P; j += 1) means[j] /= nTrain;

  for (let i = 0; i < nTrain; i += 1) {
    const row = XTrain[i];
    for (let j = 0; j < P; j += 1) {
      const d = row[j] - means[j];
      stds[j] += d * d;
    }
  }
  for (let j = 0; j < P; j += 1) {
    stds[j] = Math.sqrt(stds[j] / nTrain);
  }

  for (let i = 0; i < nTrain; i += 1) {
    const row = XTrain[i];
    for (let j = 0; j < P; j += 1) {
      row[j] = stds[j] > 1e-8 ? (row[j] - means[j]) / stds[j] : 0;
    }
  }

  // 4. Tối ưu L2-regularized Logistic Regression bằng Nesterov Accelerated Gradient
  let b0 = Math.log(Math.max(1e-6, trainCancelRate) / Math.max(1e-6, 1 - trainCancelRate));
  let vb0 = 0;
  const w = new Float64Array(P);
  const vw = new Float64Array(P);
  const grad = new Float64Array(P);
  const lr = 0.25;
  const momentum = 0.85;
  const reg = Math.max(0.1, Number(l2Lambda) || 5.0) / nTrain;

  for (let iter = 0; iter < 220; iter += 1) {
    const b0Look = b0 + momentum * vb0;
    let gradB0 = 0;
    grad.fill(0);

    for (let i = 0; i < nTrain; i += 1) {
      const row = XTrain[i];
      let z = b0Look;
      for (let j = 0; j < P; j += 1) {
        z += (w[j] + momentum * vw[j]) * row[j];
      }
      const err = sigmoid(z) - yTrain[i];
      gradB0 += err;
      for (let j = 0; j < P; j += 1) {
        grad[j] += err * row[j];
      }
    }

    gradB0 /= nTrain;
    vb0 = momentum * vb0 - lr * gradB0;
    b0 += vb0;

    let maxStep = Math.abs(vb0);
    for (let j = 0; j < P; j += 1) {
      if (stds[j] <= 1e-8) continue;
      const gj = grad[j] / nTrain + reg * (w[j] + momentum * vw[j]);
      vw[j] = momentum * vw[j] - lr * gj;
      w[j] += vw[j];
      if (Math.abs(vw[j]) > maxStep) maxStep = Math.abs(vw[j]);
    }
    if (maxStep < 1e-6) break;
  }

  // 5. Dự báo trên TẬP KIỂM (chỉ dùng tham số rút từ tập học)
  const nTest = test.length;
  const yTest = new Array(nTest);
  const pTest = new Array(nTest);
  const pBaseline = new Array(nTest).fill(trainCancelRate);
  let testPos = 0;

  for (let i = 0; i < nTest; i += 1) {
    const rawRow = vectorize(test[i]);
    let z = b0;
    for (let j = 0; j < P; j += 1) {
      if (stds[j] > 1e-8) {
        z += w[j] * ((rawRow[j] - means[j]) / stds[j]);
      }
    }
    yTest[i] = test[i].y;
    testPos += test[i].y;
    pTest[i] = sigmoid(z);
  }

  const testCancelRate = testPos / nTest;
  const pTestMean = new Array(nTest).fill(testCancelRate);
  const aucRaw = computeRocAuc(yTest, pTest);
  const brierRaw = computeBrier(yTest, pTest);
  const baselineBrierRaw = computeBrier(yTest, pBaseline);
  const testMeanBrierRaw = computeBrier(yTest, pTestMean);

  const auc = aucRaw != null ? Number(aucRaw.toFixed(4)) : null;
  const brier = brierRaw != null ? Number(brierRaw.toFixed(4)) : null;
  const baselineBrier = baselineBrierRaw != null ? Number(baselineBrierRaw.toFixed(4)) : null;
  const testMeanBrier = testMeanBrierRaw != null ? Number(testMeanBrierRaw.toFixed(4)) : null;

  const passedThreshold = Boolean(
    nTest >= minTestCount &&
    auc != null &&
    auc >= minAuc
  );

  // 6. Rút tối đa 5 yếu tố làm tăng nguy cơ hủy (hệ số chuẩn hóa dương lớn nhất, bỏ các nhóm gộp __OTHER__)
  const positiveCoefs = [];
  for (let j = 0; j < P; j += 1) {
    if (stds[j] <= 1e-8) continue;
    const def = featureDefs[j];
    if (def.key.endsWith(':__OTHER__')) continue;
    const stdCoef = w[j];
    if (stdCoef <= 0.03) continue;
    positiveCoefs.push({
      key: def.key,
      label: def.label,
      stdCoef: Number(stdCoef.toFixed(4)),
      effectWords: formatEffectWords(stdCoef)
    });
  }
  positiveCoefs.sort((a, b) => b.stdCoef - a.stdCoef);
  const topFactors = passedThreshold ? positiveCoefs.slice(0, 5) : [];

  return {
    available: auc != null,
    passedThreshold,
    splitAt: new Date(splitMs).toISOString(),
    splitRule,
    thresholds: { minTestCount, minAuc },
    totalCount: samples.length,
    trainCount: nTrain,
    testCount: nTest,
    trainCancelRate: Number(trainCancelRate.toFixed(4)),
    testCancelRate: Number(testCancelRate.toFixed(4)),
    auc,
    brier,
    baselineBrier,
    testMeanBrier,
    featureCount: P,
    topFactors,
    candidateFactorsCount: positiveCoefs.length
  };
}

module.exports = {
  FORBIDDEN_POST_ORDER_FIELDS,
  HOUR_BUCKETS,
  extractPreOrderSample,
  computeRocAuc,
  computeBrier,
  fitAndEvaluateCancelModel
};
