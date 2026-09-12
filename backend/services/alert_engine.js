/**
 * ĐỘNG CƠ CẢNH BÁO CÓ Ý NGHĨA THỐNG KÊ
 * ==================================================================
 * Thay thế cơ chế "khiếu nại tăng 40% thì báo động" bằng quy trình:
 *
 *   1. Sinh các tổ hợp cần theo dõi (danh mục x nguyên nhân x sản phẩm)
 *   2. Với mỗi tổ hợp: kiểm định tỉ lệ hai mẫu, cửa sổ hiện tại vs nền 28 ngày
 *   3. Điều kiện kép: ý nghĩa thống kê VÀ ý nghĩa nghiệp vụ
 *   4. Hiệu chỉnh đa kiểm định Benjamini-Hochberg trên toàn bộ tập kiểm định
 *   5. Biểu đồ kiểm soát EWMA để bắt thêm kiểu suy giảm chậm và đều
 *   6. Điểm nghiêm trọng tổng hợp -> mức -> kênh thông báo -> SLA
 *
 * Mọi con số đều tính trên phản hồi ĐÃ QUA TRUST LAYER, và mỗi cảnh báo
 * ghi rõ đã loại bao nhiêu phản hồi không đạt ngưỡng tin cậy.
 */

const stats = require('./statistics');
const taxonomy = require('./taxonomy');
const { isCountable, isComplaint } = require('./metrics');

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_BASELINE_DAYS = 28;

/** Tỉ lệ tài khoản mới ước tính mỗi khách hàng bị ảnh hưởng đại diện cho bao nhiêu người */
const UNDER_REPORTING_FACTOR = 1;

function splitWindows(feedbacks, now, windowDays, baselineDays) {
  const nowMs = now.getTime();
  const windowStart = nowMs - windowDays * 86400000;
  const baselineStart = nowMs - baselineDays * 86400000;

  const current = [];
  const baseline = [];
  for (const f of feedbacks) {
    const t = new Date(f.timestamp).getTime();
    if (t > nowMs) continue;
    if (t >= windowStart) current.push(f);
    else if (t >= baselineStart) baseline.push(f);
  }
  return { current, baseline };
}

/**
 * Sinh danh sách tổ hợp cần kiểm định. Chỉ giữ tổ hợp có ít nhất
 * `minSupport` phản hồi trong cửa sổ hiện tại — kiểm định trên tổ hợp
 * rỗng chỉ làm phình tập kiểm định và siết oan ngưỡng BH của các tổ
 * hợp thật.
 */
function enumerateCombos(current, minSupport = 3) {
  const combos = new Map();

  const add = (list, entry) => {
    if (!combos.has(entry.key)) combos.set(entry.key, { ...entry, count: 0 });
    combos.get(entry.key).count += 1;
    list.push(entry);
  };

  for (const f of current) {
    if (!isCountable(f)) continue;
    const cat = taxonomy.normalizeCategory(f.category);
    if (cat === 'Other') continue;
    const cause = taxonomy.normalizeCause(cat, f.subCategory);
    const product = f.productName || null;
    const region = f.region || null;

    const list = [];
    add(list, { key: `${cat}|*|*|*`, category: cat, cause: null, product: null, region: null });
    if (product) {
      add(list, { key: `${cat}|*|${product}|*`, category: cat, cause: null, product, region: null });
    }
    if (cause) {
      add(list, { key: `${cat}|${cause}|*|*`, category: cat, cause, product: null, region: null });
      if (product) {
        add(list, { key: `${cat}|${cause}|${product}|*`, category: cat, cause, product, region: null });
      }
      if (region) {
        add(list, { key: `${cat}|${cause}|*|${region}`, category: cat, cause, product: null, region });
      }
    }
  }

  return [...combos.values()].filter((c) => c.count >= minSupport);
}

function matchesCombo(f, combo) {
  const cat = taxonomy.normalizeCategory(f.category);
  if (cat !== combo.category) return false;
  if (combo.cause) {
    const cause = taxonomy.normalizeCause(cat, f.subCategory);
    if (cause !== combo.cause) return false;
  }
  if (combo.product && f.productName !== combo.product) return false;
  if (combo.region && f.region !== combo.region) return false;
  return true;
}

/** Càng nhiều chiều được xác định thì cảnh báo càng cụ thể, càng hành động được */
function specificity(alert) {
  return (alert.cause ? 4 : 0) + (alert.productName ? 2 : 0) + (alert.region ? 1 : 0);
}

/**
 * GỘP CẢNH BÁO TRÙNG SỰ VIỆC.
 * Một sự cố giao hàng duy nhất sẽ khớp đồng thời với tổ hợp cấp danh
 * mục, cấp danh mục+sản phẩm và cấp nguyên nhân — nếu hiển thị cả ba
 * thì người vận hành thấy ba cảnh báo cho cùng một việc, và niềm tin
 * vào hệ thống cảnh báo mất rất nhanh.
 *
 * Giữ lại bản CỤ THỂ NHẤT của mỗi sự việc; các phạm vi còn lại được
 * đính kèm để người dùng vẫn thấy vấn đề trải rộng tới đâu.
 */
function deduplicateAlerts(alerts) {
  const byIncident = new Map();

  for (const a of alerts) {
    // Cảnh báo suy giảm kéo dài là loại khác hẳn, không gộp chung
    const groupKey = a.type === 'SPIKE' ? `${a.type}|${a.category}|${a.cause || '*'}` : a.id;
    if (!byIncident.has(groupKey)) byIncident.set(groupKey, []);
    byIncident.get(groupKey).push(a);
  }

  // Danh mục nào đã có cảnh báo ở cấp nguyên nhân thì bỏ bản tổng hợp
  // cấp danh mục của chính danh mục đó
  const categoriesWithCause = new Set(
    alerts.filter((a) => a.type === 'SPIKE' && a.cause).map((a) => a.category)
  );

  const out = [];
  for (const [groupKey, group] of byIncident) {
    if (groupKey.startsWith('SPIKE|') && !group[0].cause && categoriesWithCause.has(group[0].category)) {
      continue;
    }

    group.sort((x, y) => specificity(y) - specificity(x) || y.severityScore - x.severityScore);
    const primary = group[0];
    const others = group.slice(1);

    out.push({
      ...primary,
      alsoSeenIn: others.map((o) => ({
        productName: o.productName,
        region: o.region,
        severity: o.severity,
        z: o.statistics.z
      })),
      mergedScopes: group.length
    });
  }

  return out.sort((a, b) => b.severityScore - a.severityScore);
}

/**
 * Chạy toàn bộ quy trình cảnh báo.
 *
 * @param {Array} feedbacks phản hồi đã chạy qua Trust Layer (có f.trust)
 * @param {object} options { now, windowDays, baselineDays, transactionCount, thresholds }
 */
function detectAlerts(feedbacks, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const baselineDays = options.baselineDays ?? DEFAULT_BASELINE_DAYS;
  const thresholds = { ...stats.ALERT_THRESHOLDS, ...(options.thresholds || {}) };

  const { current, baseline } = splitWindows(feedbacks, now, windowDays, baselineDays);
  const combos = enumerateCombos(current, options.minSupport ?? 3);

  const currentValid = current.filter(isCountable);
  const baselineValid = baseline.filter(isCountable);

  const candidates = [];

  for (const combo of combos) {
    const curMatch = currentValid.filter((f) => matchesCombo(f, combo));
    const baseMatch = baselineValid.filter((f) => matchesCombo(f, combo));

    // Mẫu số: TOÀN BỘ phản hồi hợp lệ trong cùng cửa sổ, không phải chỉ
    // phản hồi cùng danh mục — ta đang hỏi "tỉ trọng vấn đề này trong
    // dòng phản hồi có tăng lên không".
    const x1 = curMatch.filter(isComplaint).length;
    const n1 = currentValid.length;
    const x2 = baseMatch.filter(isComplaint).length;
    const n2 = baselineValid.length;

    if (n1 === 0 || n2 === 0) continue;

    const test = stats.twoProportionZTest(x1, n1, x2, n2);

    // Ước tính số khách hàng bị ảnh hưởng: đếm theo tác giả duy nhất
    const affectedCustomers =
      new Set(curMatch.filter(isComplaint).map((f) => f.author || f._id)).size *
      UNDER_REPORTING_FACTOR;

    const dual = stats.passesDualCriteria(test, affectedCustomers, thresholds);

    // QUY TẮC VẬN HÀNH T0: phản hồi hạng P5 dùng để quan sát xu hướng
    // nhưng KHÔNG đủ điều kiện kích hoạt cảnh báo mức High/Critical.
    // Chặn kịch bản một nhóm tài khoản mới lập tạo cảnh báo nghiêm trọng giả.
    const evidence = curMatch.filter(isComplaint);
    const nonP5Evidence = evidence.filter((f) => f.trust.canTriggerHighAlert);
    const p5Only = evidence.length > 0 && nonP5Evidence.length === 0;

    const weightedComplaints = evidence.reduce((s, f) => s + f.trust.weight, 0);
    const wcr = options.transactionCount
      ? weightedComplaints / options.transactionCount
      : n1 > 0
        ? weightedComplaints / n1
        : 0;

    candidates.push({
      combo,
      test,
      dual,
      x1,
      n1,
      x2,
      n2,
      evidence,
      affectedCustomers,
      weightedComplaints,
      wcr,
      p5Only,
      // Số phản hồi bị Trust Layer loại trong cùng phạm vi — dòng này
      // xuất hiện ngay trên thẻ cảnh báo, cho thấy Trust Layer không
      // phải một màn hình riêng để trưng bày mà thật sự chạy trong mọi con số
      excludedByTrust: current.filter((f) => !isCountable(f) && matchesCombo(f, combo)).length
    });
  }

  // --- Hiệu chỉnh đa kiểm định trên TOÀN BỘ tập kiểm định của chu kỳ ---
  const corrected = stats.benjaminiHochberg(
    candidates.map((c) => ({ p: c.test.p })),
    thresholds.fdrLevel
  );

  const alerts = [];

  candidates.forEach((c, i) => {
    const bh = corrected[i];
    const passesAll = c.dual.passed && bh.significant;
    if (!passesAll) return;

    const velocity = stats.velocityRatio(c.x1 / c.n1, c.x2 / c.n2);
    const categoryImpact = taxonomy.categoryImpact(c.combo.category);
    const coverage = c.n1 > 0 ? c.x1 / c.n1 : 0;

    let score = stats.severityScore({
      wcr: c.wcr,
      z: c.test.z,
      velocity,
      categoryImpact,
      coverage
    });

    // Trần mức cảnh báo khi chứng cứ chỉ đến từ nguồn hạng P5
    let band = stats.severityBand(score);
    let capped = false;
    if (c.p5Only && (band.level === 'High' || band.level === 'Critical')) {
      score = Math.min(score, 0.49);
      band = stats.severityBand(score);
      capped = true;
    }

    const causeName = c.combo.cause
      ? taxonomy.causeLabel(c.combo.category, c.combo.cause)
      : null;

    alerts.push({
      id: `${c.combo.key}|${now.toISOString().slice(0, 10)}`,
      type: 'SPIKE',
      typeVi: 'Đột biến',
      category: c.combo.category,
      categoryLabel: taxonomy.categoryLabel(c.combo.category),
      cause: c.combo.cause,
      causeLabel: causeName,
      productName: c.combo.product,
      region: c.combo.region,
      owner: taxonomy.categoryOwner(c.combo.category),

      // --- Bằng chứng thống kê ---
      statistics: {
        z: Number(c.test.z.toFixed(2)),
        pValue: c.test.p,
        pValueDisplay: c.test.p < 0.001 ? 'p < 0.001' : `p = ${c.test.p.toFixed(4)}`,
        qValue: Number(bh.qValue.toFixed(4)),
        currentRate: Number((c.x1 / c.n1).toFixed(4)),
        baselineRate: Number((c.x2 / c.n2).toFixed(4)),
        deltaPP: Number(c.dual.deltaPP.toFixed(2)),
        sampleCurrent: c.n1,
        sampleBaseline: c.n2,
        approximationValid: c.test.valid,
        approximationNote: c.test.reason
      },

      wcr: Number(c.wcr.toFixed(4)),
      affectedCustomers: c.affectedCustomers,
      evidenceCount: c.evidence.length,
      excludedByTrust: c.excludedByTrust,
      evidenceIds: c.evidence.slice(0, 20).map((f) => f._id),

      severityScore: Number(score.toFixed(3)),
      severity: band.level,
      severityVi: band.levelVi,
      notificationChannel: band.channel,
      sla: band.sla,
      cappedByProvenance: capped,

      detectedAt: now.toISOString(),
      windowDays,
      baselineDays
    });
  });

  // --- EWMA: bắt kiểu suy giảm chậm mà kiểm định đột biến bỏ sót ---
  const driftAlerts = detectSustainedDrift(feedbacks, { now, baselineDays: baselineDays * 2 });

  const all = deduplicateAlerts([...alerts, ...driftAlerts]);

  return {
    alerts: all,
    diagnostics: {
      combosTested: candidates.length,
      passedDualCriteria: candidates.filter((c) => c.dual.passed).length,
      survivedFdr: alerts.length,
      afterDeduplication: all.length,
      driftAlerts: driftAlerts.length,
      fdrLevel: thresholds.fdrLevel,
      pThreshold: thresholds.pValue,
      windowSample: currentValid.length,
      baselineSample: baselineValid.length,
      excludedByTrustLayer: feedbacks.length - feedbacks.filter(isCountable).length,
      // Bề mặt kiểm định lý thuyết, để giải thích vì sao cần hiệu chỉnh
      testSurface: taxonomy.TEST_SURFACE
    }
  };
}

/**
 * CẢNH BÁO SUY GIẢM KÉO DÀI (EWMA).
 * Kiểu nguy hiểm nhất trong thực tế: không có ngày nào đủ xấu để gây
 * chú ý, nhưng sau ba tháng thì tình hình đã khác hẳn. Tách bạch rõ với
 * cảnh báo "đột biến" vì hai loại này đòi hỏi hai kiểu phản ứng khác nhau.
 */
function detectSustainedDrift(feedbacks, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const spanDays = options.baselineDays ?? 56;
  const buckets = options.buckets ?? 14;

  const nowMs = now.getTime();
  const startMs = nowMs - spanDays * 86400000;
  const bucketMs = (nowMs - startMs) / buckets;

  const byCategory = new Map();
  for (const f of feedbacks) {
    if (!isCountable(f) || !isComplaint(f)) continue;
    const t = new Date(f.timestamp).getTime();
    if (t < startMs || t > nowMs) continue;

    const cat = taxonomy.normalizeCategory(f.category);
    if (cat === 'Other') continue;

    if (!byCategory.has(cat)) byCategory.set(cat, new Array(buckets).fill(0));
    let idx = Math.floor((t - startMs) / bucketMs);
    if (idx >= buckets) idx = buckets - 1;
    byCategory.get(cat)[idx] += f.trust.weight;
  }

  const out = [];
  for (const [cat, series] of byCategory) {
    const totalPoints = series.reduce((a, b) => a + b, 0);
    if (totalPoints < 10) continue; // quá thưa để nói về xu hướng

    const chart = stats.ewmaControlChart(series, { lambda: 0.2, L: 3, runLength: 3 });
    // Đường nền không lập được thì không kết luận gì — xem ghi chú
    // trong ewmaControlChart về trường hợp lịch sử ngắn hơn cửa sổ
    if (!chart.valid || !chart.breached) continue;

    const last = chart.points[chart.points.length - 1];
    const velocity = chart.mu0 > 0 ? (last.ewma - chart.mu0) / chart.mu0 : 1;
    const score = stats.severityScore({
      wcr: 0,
      z: 3,
      velocity,
      categoryImpact: taxonomy.categoryImpact(cat),
      coverage: 0.5
    });
    const band = stats.severityBand(score);

    out.push({
      id: `drift|${cat}|${now.toISOString().slice(0, 10)}`,
      type: 'SUSTAINED_DRIFT',
      typeVi: 'Suy giảm kéo dài',
      category: cat,
      categoryLabel: taxonomy.categoryLabel(cat),
      cause: null,
      causeLabel: null,
      productName: null,
      owner: taxonomy.categoryOwner(cat),
      statistics: {
        ewmaCurrent: Number(last.ewma.toFixed(3)),
        controlLimit: Number(chart.ucl.toFixed(3)),
        baselineMean: Number(chart.mu0.toFixed(3)),
        consecutiveBreaches: chart.consecutiveBreaches,
        lambda: chart.lambda,
        L: chart.L
      },
      wcr: null,
      affectedCustomers: null,
      evidenceCount: Math.round(totalPoints),
      excludedByTrust: 0,
      evidenceIds: [],
      severityScore: Number(score.toFixed(3)),
      severity: band.level,
      severityVi: band.levelVi,
      notificationChannel: band.channel,
      sla: band.sla,
      cappedByProvenance: false,
      detectedAt: now.toISOString()
    });
  }

  return out;
}

/**
 * SO SÁNH CÓ / KHÔNG CÓ TRUST LAYER trên cùng một tập dữ liệu.
 * Đây là con số trả lời trực tiếp câu hỏi của ban giám khảo: nếu không
 * lọc thì hệ thống sinh ra bao nhiêu cảnh báo, và bao nhiêu trong số đó
 * biến mất sau khi lọc. Cũng chính là công tắc "Tắt Trust Layer" trên demo.
 */
function trustLayerImpact(feedbacks, options = {}) {
  const withTrust = detectAlerts(feedbacks, options);

  // Bản đối chứng: mọi phản hồi đều được tính đủ 1 điểm, đúng như cách
  // một hệ thống không có tầng kiểm soát tin cậy sẽ làm
  const naive = feedbacks.map((f) => ({
    ...f,
    trust: {
      ...(f.trust || {}),
      weight: 1,
      tier: f.trust ? f.trust.tier : 'P3',
      canTriggerHighAlert: true,
      band: 'ACCEPTED'
    }
  }));
  const withoutTrust = detectAlerts(naive, options);

  const kept = new Set(withTrust.alerts.map((a) => a.id));
  const phantom = withoutTrust.alerts.filter((a) => !kept.has(a.id));

  /**
   * WCR của hai kịch bản được tính NGAY TẠI ĐÂY.
   *
   * Trước đây chỉ route `/trust/impact` tính hai con số này, nên bất kỳ
   * chỗ nào khác gọi thẳng hàm đều nhận về `undefined` — và in ra màn
   * hình thành "WCR undefined". Đưa vào đây để mọi nơi dùng chung một
   * nguồn, thay vì mỗi chỗ tự tính lại một kiểu.
   */
  const metricsSvc = require('./metrics');
  const cardsWith = metricsSvc.buildMetricCards(feedbacks, options.transactionCount);
  const cardsWithout = metricsSvc.buildMetricCards(naive, options.transactionCount);

  return {
    wcrWithTrustLayer: cardsWith.weightedComplaintRate.display,
    wcrWithoutTrustLayer: cardsWithout.weightedComplaintRate.display,
    withTrustLayer: {
      alertCount: withTrust.alerts.length,
      criticalCount: withTrust.alerts.filter((a) => a.severity === 'Critical').length,
      alerts: withTrust.alerts
    },
    withoutTrustLayer: {
      alertCount: withoutTrust.alerts.length,
      criticalCount: withoutTrust.alerts.filter((a) => a.severity === 'Critical').length
    },
    phantomAlerts: phantom.length,
    phantomExamples: phantom.slice(0, 5).map((a) => ({
      category: a.categoryLabel,
      cause: a.causeLabel,
      severity: a.severity
    })),
    excludedFeedbacks: feedbacks.length - feedbacks.filter(isCountable).length,
    diagnostics: withTrust.diagnostics
  };
}

module.exports = {
  detectAlerts,
  detectSustainedDrift,
  trustLayerImpact,
  deduplicateAlerts,
  enumerateCombos,
  splitWindows,
  DEFAULT_WINDOW_DAYS,
  DEFAULT_BASELINE_DAYS
};
