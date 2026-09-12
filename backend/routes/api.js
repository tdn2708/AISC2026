const express = require('express');
const router = express.Router();

const { scrapeShopeeReviews } = require('../services/scraper');
const { analyzeFeedbackBatch, generateRiskAlertsBatch } = require('../services/ai_analyzer');
const { getContext, invalidate, applyFilters } = require('../services/analysis_context');
const trustLayer = require('../services/trust_layer');
const alertEngine = require('../services/alert_engine');
const metrics = require('../services/metrics');
const playbook = require('../services/playbook');
const recommender = require('../services/recommender');
const taxonomy = require('../services/taxonomy');
const normalizer = require('../services/normalizer');

/** Bọc handler async để lỗi không làm treo request */
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[API] ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: err.message });
  });
};

/** Chỉ trả ra phần trust cần cho giao diện, bỏ các trường nội bộ nặng */
function publicItem(f) {
  return {
    _id: f._id,
    source: f.source,
    productName: f.productName,
    region: f.region,
    author: f.author,
    originalText: f.originalText,
    timestamp: f.timestamp,
    rating: f.rating,
    category: f.category,
    categoryLabel: f.categoryLabel || taxonomy.categoryLabel(f.category),
    subCategory: f.subCategory,
    causeLabel: f.causeLabel || taxonomy.causeLabel(f.category, f.subCategory),
    sentiment: f.sentiment,
    aiSummary: f.aiSummary,
    entities: f.entities || null,
    trust: f.trust
      ? {
          tier: f.trust.tier,
          tierWeight: f.trust.tierWeight,
          weight: f.trust.weight,
          band: f.trust.band,
          bandLabelVi: f.trust.bandLabelVi,
          authenticityScore: f.trust.authenticityScore,
          triggeredSignals: f.trust.triggeredSignals || [],
          humanLabel: f.trust.humanLabel || null
        }
      : null
  };
}

// ==================================================================
// PHẢN HỒI
// ==================================================================

router.get('/feedbacks', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  let items = applyFilters(ctx.items, req.query);

  // Mặc định CHỈ trả phản hồi đã qua Trust Layer. Muốn xem cả phần bị
  // loại thì phải hỏi rõ (?include=all) — để không ai vô tình phân tích
  // trên dữ liệu chưa lọc.
  if (req.query.include !== 'all') {
    items = items.filter(metrics.isCountable);
  }

  res.json(items.map(publicItem));
}));

router.get('/products', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const names = [...new Set(ctx.items.map((f) => f.productName).filter((p) => p && p.trim()))];
  res.json(names.sort());
}));

router.get('/regions', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const names = [...new Set(ctx.items.map((f) => f.region).filter(Boolean))];
  res.json(names.sort());
}));

// ==================================================================
// CHỈ SỐ — mỗi thẻ kèm MẪU SỐ và ĐỘ PHỦ
// ==================================================================

router.get('/stats', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);

  const cards = metrics.buildMetricCards(items, ctx.transactionCount);

  res.json({
    ...cards,
    // So sánh hai kỳ liền nhau, để thẻ chỉ số nói được "đang tốt lên hay
    // xấu đi" thay vì chỉ đưa ra một con số trần trụi.
    comparison: metrics.periodComparison(items, ctx.transactionCount),
    dataHealthScore: ctx.funnel.dataHealthScore,
    // Giữ các khóa cũ để giao diện chưa nâng cấp không vỡ
    totalComplaints: items.filter((f) => metrics.isCountable(f) && metrics.isComplaint(f)).length,
    complaintRate: cards.weightedComplaintRate.display,
    computedAt: ctx.computedAt
  });
}));

router.get('/categories', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query).filter(metrics.isCountable);

  const colorMap = {
    Delivery: 'var(--accent-blue)',
    ProductQuality: 'var(--accent-purple)',
    CustomerService: 'var(--accent-cyan)',
    Payment: 'var(--accent-indigo)',
    TechnicalApp: '#f59e0b',
    ReturnRefund: '#ef4444',
    PricePromotion: '#14b8a6',
    Other: '#94a3b8'
  };

  const agg = new Map();
  for (const f of items) {
    const key = f.category || 'Other';
    if (!agg.has(key)) agg.set(key, { count: 0, weight: 0 });
    const e = agg.get(key);
    e.count += 1;
    e.weight += f.trust.weight;
  }

  const data = [...agg.entries()]
    .map(([key, v]) => ({
      key,
      name: taxonomy.categoryLabel(key),
      value: v.count,
      weightedValue: Number(v.weight.toFixed(2)),
      fill: colorMap[key] || colorMap.Other
    }))
    .sort((a, b) => b.value - a.value);

  res.json(data);
}));

/** Bóc tách nguyên nhân cốt lõi trong một danh mục (Level 1 -> Level 2) */
router.get('/root-causes', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query).filter(metrics.isCountable);
  const category = req.query.category;

  const scope = category
    ? items.filter((f) => f.category === category)
    : items;

  const agg = new Map();
  for (const f of scope) {
    if (!f.subCategory) continue;
    const key = `${f.category}||${f.subCategory}`;
    if (!agg.has(key)) {
      agg.set(key, {
        category: f.category,
        categoryLabel: f.categoryLabel,
        cause: f.subCategory,
        causeLabel: f.causeLabel,
        count: 0
      });
    }
    agg.get(key).count += 1;
  }

  const total = [...agg.values()].reduce((s, v) => s + v.count, 0);
  const data = [...agg.values()]
    .map((v) => ({ ...v, share: total ? Number(((v.count / total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  res.json({ total, causes: data });
}));

router.get('/sentiment', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query).filter(metrics.isCountable);

  const colorMap = {
    Negative: 'var(--risk-critical)',
    Neutral: 'var(--risk-medium)',
    Positive: 'var(--risk-low)'
  };
  const labelMap = { Negative: 'Tiêu cực', Neutral: 'Trung tính', Positive: 'Tích cực' };

  const agg = new Map();
  for (const f of items) {
    const key = f.sentiment || 'Neutral';
    agg.set(key, (agg.get(key) || 0) + 1);
  }

  res.json(
    [...agg.entries()].map(([key, value]) => ({
      key,
      name: labelMap[key] || key,
      value,
      fill: colorMap[key] || '#94a3b8'
    }))
  );
}));

router.get('/trend', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const spanDays = Number(req.query.spanDays) || 28;
  const buckets = Number(req.query.buckets) || 14;
  res.json(metrics.weightedTimeSeries(items, buckets, new Date(), spanDays));
}));

// ==================================================================
// TRUST LAYER
// ==================================================================

/** Phễu dữ liệu + Chỉ số Sức khỏe Dữ liệu */
router.get('/trust/health', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  res.json({
    ...ctx.funnel,
    provenanceTiers: trustLayer.PROVENANCE_TIERS,
    tierBreakdown: ['P1', 'P2', 'P3', 'P4', 'P5'].map((tier) => ({
      tier,
      label: trustLayer.PROVENANCE_TIERS[tier].label,
      weight: trustLayer.PROVENANCE_TIERS[tier].weight,
      reconciliation: trustLayer.PROVENANCE_TIERS[tier].reconciliation,
      count: ctx.items.filter((f) => f.trust && f.trust.tier === tier).length
    })),
    humanLabelCount: ctx.humanLabelCount,
    dictionarySize: normalizer.DICTIONARY_SIZE,
    computedAt: ctx.computedAt
  });
}));

/** Các cụm trùng lặp gần bị đánh dấu nghi vấn, kèm phản hồi thành viên */
router.get('/trust/clusters', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const byId = new Map(ctx.items.map((f) => [String(f._id), f]));

  res.json(
    ctx.clusters.map((c) => ({
      clusterId: c.clusterId,
      size: c.size,
      avgSimilarity: Number(c.avgSimilarity.toFixed(3)),
      spanMinutes: c.spanMinutes,
      densityPerHour: c.densityPerHour,
      productName: c.productName,
      sampleText: c.sampleText,
      members: c.memberIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map(publicItem)
    }))
  );
}));

/** Các đợt đột biến thời gian đã phát hiện */
router.get('/trust/bursts', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  res.json(ctx.bursts);
}));

/**
 * Hàng đợi kiểm duyệt, sắp theo ĐỘ BẤT ĐỊNH của mô hình (entropy cao
 * nhất lên trước) thay vì theo thời gian — tối đa hóa lượng thông tin
 * thu được trên mỗi thao tác của người dùng.
 */
router.get('/trust/queue', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const limit = Number(req.query.limit) || 50;
  res.json(trustLayer.buildReviewQueue(ctx.items, limit));
}));

/**
 * TRẠNG THÁI CHO THANH ĐIỀU HƯỚNG
 * ------------------------------------------------------------------
 * Thanh bên hiện là 260px chiều rộng không mang một thông tin nào — nó
 * chỉ là một danh sách liên kết. Trong một sản phẩm giám sát, thanh
 * điều hướng nên đồng thời là một mặt đồng hồ: bao nhiêu cảnh báo đang
 * mở, hàng đợi kiểm duyệt còn bao nhiêu, dữ liệu tươi tới đâu.
 *
 * Đây là một endpoint riêng và rất nhẹ, cố ý KHÔNG để thanh bên gọi
 * thẳng /alerts hay /trust/queue — hai endpoint đó trả về toàn bộ nội
 * dung kèm bằng chứng, tốn băng thông gấp nhiều lần, mà thanh bên chỉ
 * cần đúng mấy con số đếm.
 */
router.get('/nav/status', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const { alerts } = alertEngine.detectAlerts(ctx.items, {
    transactionCount: ctx.transactionCount
  });

  const queue = trustLayer.buildReviewQueue(ctx.items, 500);
  const queueCount = Array.isArray(queue) ? queue.length : (queue?.items?.length ?? 0);

  res.json({
    openAlerts: alerts.length,
    criticalAlerts: alerts.filter((a) => a.severity === 'Critical' || a.severity === 'High').length,
    reviewQueue: queueCount,
    dataHealth: ctx.funnel.dataHealthScore ?? null,
    validFeedbacks: ctx.items.filter((f) => f.trust && f.trust.weight > 0).length,
    computedAt: ctx.computedAt
  });
}));

/**
 * Người dùng xác nhận hoặc sửa nhãn. Mỗi nhãn được nạp vào tập huấn
 * luyện — đây là vòng lặp học chủ động, không phải một nút bấm trang trí.
 */
router.post('/trust/label', wrap(async (req, res) => {
  const { feedbackId, label, by } = req.body;
  const allowed = ['valid', 'spam', 'inauthentic'];
  if (!feedbackId || !allowed.includes(label)) {
    return res.status(400).json({
      error: `Cần feedbackId và label thuộc: ${allowed.join(', ')}`
    });
  }

  await req.db.collection('review_labels').updateOne(
    { feedbackId: String(feedbackId) },
    { $set: { feedbackId: String(feedbackId), label, by: by || 'admin', at: new Date() } },
    { upsert: true }
  );

  invalidate();
  const total = await req.db.collection('review_labels').countDocuments();
  res.json({
    success: true,
    label,
    totalLabels: total,
    note: 'Nhãn đã được nạp vào tập huấn luyện cho lần tái huấn luyện định kỳ tiếp theo'
  });
}));

/**
 * CÔNG TẮC "TẮT TRUST LAYER".
 * Trả về số cảnh báo sinh ra khi CÓ và khi KHÔNG có tầng kiểm soát tin
 * cậy, trên cùng một tập dữ liệu. Đây là bằng chứng nhìn thấy được cho
 * câu hỏi "nếu không lọc thì sao".
 */
router.get('/trust/impact', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const impact = alertEngine.trustLayerImpact(items, {
    transactionCount: ctx.transactionCount
  });

  // WCR hai kịch bản nay do chính trustLayerImpact tính, để route và các
  // nơi gọi trực tiếp cùng dùng một nguồn số liệu
  res.json(impact);
}));

/** Cây taxonomy nhãn (7 danh mục x các nguyên nhân cốt lõi) */
router.get('/taxonomy', wrap(async (req, res) => {
  res.json({
    categories: taxonomy.flatTaxonomy(),
    categoryCount: taxonomy.CATEGORY_KEYS.length,
    causeCount: taxonomy.CAUSE_COUNT
  });
}));

/**
 * Phân tích trực tiếp một câu — màn hình mở đầu của kịch bản demo.
 * Cho thấy trong 30 giây: pipeline chạy thật, xử lý được teencode, và
 * tách được nhiều khía cạnh trái dấu trong cùng một câu.
 */
router.post('/analyze', wrap(async (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Cần trường text' });
  }

  const normalized = normalizer.normalize(text);
  const withoutSlang = normalizer.normalize(text, { skipSlang: true });
  const matches = taxonomy.classifyByRules(normalized.normalized);
  const spam = trustLayer.runSpamFilter({ originalText: text }, normalized);

  const aspects = matches.slice(0, 5).map((m) => ({
    category: m.category,
    categoryLabel: taxonomy.categoryLabel(m.category),
    cause: m.cause,
    causeLabel: taxonomy.causeLabel(m.category, m.cause),
    confidence: Number(m.confidence.toFixed(2)),
    owner: taxonomy.categoryOwner(m.category),
    // Mọi nguyên nhân được bóc tách ở đây đều là khía cạnh TIÊU CỰC theo
    // định nghĩa taxonomy (taxonomy chỉ liệt kê nguyên nhân khiếu nại)
    polarity: 'Negative'
  }));

  res.json({
    original: text,
    masked: normalized.masked,
    normalized: normalized.normalized,
    normalizedWithoutSlang: withoutSlang.normalized,
    slangHits: normalized.slangHits,
    piiMasked: normalized.piiMasked,
    piiTypes: normalized.piiTypes,
    syllables: normalized.syllables,
    aspects,
    spam: { isSpam: spam.isSpam, reasons: spam.reasons },
    note:
      'Phân loại theo luật từ khóa (baseline B1). Mô hình PhoBERT tinh chỉnh thay thế lớp này ở bản chính; luật được giữ để đối chứng baseline.'
  });
}));

// ==================================================================
// CẢNH BÁO CÓ KIỂM ĐỊNH THỐNG KÊ
// ==================================================================

router.get('/alerts', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);

  const result = alertEngine.detectAlerts(items, {
    transactionCount: ctx.transactionCount,
    windowDays: Number(req.query.windowDays) || undefined,
    baselineDays: Number(req.query.baselineDays) || undefined
  });

  const decisions = await req.db.collection('recommendation_log').find({}).toArray();
  const built = recommender.buildAll(result.alerts, {
    items: ctx.items,
    transactions: ctx.transactions,
    decisions
  });
  const recByAlert = new Map(built.recommendations.map((r) => [r.alertId, r]));

  const withRecommendations = result.alerts.map((a) => ({
    ...a,
    summary: playbook.summarize(a),
    recommendation: recByAlert.get(a.id)
  }));

  res.json({ alerts: withRecommendations, diagnostics: result.diagnostics, bundles: built.bundles });
}));

/**
 * Endpoint cũ /risks — giữ nguyên hình dạng dữ liệu để giao diện hiện
 * tại không vỡ, nhưng nội dung bên dưới đã là cảnh báo có kiểm định.
 */
router.get('/risks', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const result = alertEngine.detectAlerts(items, { transactionCount: ctx.transactionCount });

  const decisions = await req.db.collection('recommendation_log').find({}).toArray();
  const built = recommender.buildAll(result.alerts, {
    items: ctx.items,
    transactions: ctx.transactions,
    decisions
  });
  const recByAlert = new Map(built.recommendations.map((r) => [r.alertId, r]));

  res.json(
    result.alerts.map((a) => {
      const rec = recByAlert.get(a.id);
      return {
        id: a.id,
        issue: a.causeLabel ? `${a.categoryLabel} — ${a.causeLabel}` : a.categoryLabel,
        riskLevel: a.severity === 'Critical' ? 'CRITICAL' : a.severity === 'High' ? 'HIGH' : a.severity.toUpperCase(),
        insight: playbook.summarize(a),
        recommendations: rec.steps.map((s) => s.text),
        increase:
          a.type === 'SPIKE' && a.statistics.baselineRate > 0
            ? `+${Math.round(((a.statistics.currentRate - a.statistics.baselineRate) / a.statistics.baselineRate) * 100)}%`
            : a.typeVi,
        severity: a.severity,
        severityScore: a.severityScore,
        statistics: a.statistics,
        evidenceCount: a.evidenceCount,
        excludedByTrust: a.excludedByTrust,
        sla: a.sla,
        owner: a.owner,
        type: a.type,
        typeVi: a.typeVi
      };
    })
  );
}));

/** Bằng chứng gốc của một cảnh báo — nhấp để mở xuống tận phản hồi thô */
router.get('/alerts/:id/evidence', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const result = alertEngine.detectAlerts(items, { transactionCount: ctx.transactionCount });

  const alert = result.alerts.find((a) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Không tìm thấy cảnh báo' });

  const ids = new Set(alert.evidenceIds.map(String));
  res.json({
    alert: { id: alert.id, categoryLabel: alert.categoryLabel, causeLabel: alert.causeLabel },
    evidence: ctx.items.filter((f) => ids.has(String(f._id))).map(publicItem),
    excludedByTrust: alert.excludedByTrust
  });
}));

// ==================================================================
// KHUYẾN NGHỊ — LUÔN LÀ ĐỀ XUẤT, KHÔNG BAO GIỜ TỰ THỰC THI
// ==================================================================

router.get('/recommendations', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const result = alertEngine.detectAlerts(items, { transactionCount: ctx.transactionCount });

  const decisions = await req.db.collection('recommendation_log').find({}).toArray();
  const decisionMap = new Map(decisions.map((d) => [d.alertId, d]));

  const built = recommender.buildAll(result.alerts, {
    items: ctx.items,
    transactions: ctx.transactions,
    decisions
  });
  const alertById = new Map(result.alerts.map((a) => [a.id, a]));

  res.json({
    safetyPolicy:
      'Hệ thống không tự thực thi bất kỳ hành động nào phát sinh chi phí hoặc tác động tới khách hàng cuối. Mọi hành động đều ở dạng đề xuất kèm bằng chứng và độ tin cậy, và phải được người có thẩm quyền phê duyệt.',
    playbookCount: playbook.PLAYBOOK_COUNT,
    engine: built.meta,
    bundles: built.bundles,
    recommendations: built.recommendations.map((rec) => {
      const a = alertById.get(rec.alertId);
      const decision = decisionMap.get(rec.alertId);
      return {
        ...rec,
        summary: playbook.summarize(a),
        alert: {
          id: a.id,
          categoryLabel: a.categoryLabel,
          causeLabel: a.causeLabel,
          productName: a.productName,
          severity: a.severity,
          severityVi: a.severityVi,
          sla: a.sla
        },
        status: decision ? decision.decision : 'PROPOSED',
        decidedBy: decision ? decision.by : null,
        decidedAt: decision ? decision.at : null,
        dismissReason: decision ? decision.reason : null
      };
    })
  });
}));

/**
 * Chấp nhận / Bỏ qua một khuyến nghị. Bỏ qua thì BẮT BUỘC chọn lý do —
 * lý do bỏ qua chính là dữ liệu để cải thiện playbook.
 */
router.post('/recommendations/decision', wrap(async (req, res) => {
  const { alertId, decision, by, reason, actionIds, scopeKey } = req.body;
  const allowed = ['ACCEPTED', 'DISMISSED'];
  if (!alertId || !allowed.includes(decision)) {
    return res.status(400).json({ error: `Cần alertId và decision thuộc: ${allowed.join(', ')}` });
  }
  if (decision === 'DISMISSED' && !reason) {
    return res.status(400).json({ error: 'Bỏ qua khuyến nghị thì phải nêu lý do' });
  }

  const now = new Date();
  await req.db.collection('recommendation_log').updateOne(
    { alertId },
    {
      $set: {
        alertId,
        decision,
        by: by || 'admin',
        reason: reason || null,
        // Ghi ở mức HÀNH ĐỘNG, không chỉ mức cảnh báo. Không có hai
        // trường này thì không quy được quyết định về mẫu hành động nào,
        // và vòng lặp học không có gì để học.
        actionIds: Array.isArray(actionIds) ? actionIds : [],
        scopeKey: scopeKey || null,
        at: now,
        // Chấp nhận thì hệ thống tạo việc cần làm và đặt lịch theo dõi lại
        followUpAt: decision === 'ACCEPTED' ? new Date(now.getTime() + 7 * 86400000) : null
      }
    },
    { upsert: true }
  );

  const all = await req.db.collection('recommendation_log').find({}).toArray();
  const accepted = all.filter((d) => d.decision === 'ACCEPTED').length;

  res.json({
    success: true,
    decision,
    acceptanceRate: all.length ? Number(((accepted / all.length) * 100).toFixed(1)) : 0,
    totalDecisions: all.length,
    followUpAt: decision === 'ACCEPTED' ? new Date(now.getTime() + 7 * 86400000) : null
  });
}));

// ==================================================================
// PHÂN KHÚC KHÁCH HÀNG
// ==================================================================

router.get('/segments', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query).filter(metrics.isCountable);

  const userMap = new Map();
  for (const fb of items) {
    const author = fb.author || 'Ẩn danh';
    if (!userMap.has(author)) {
      userMap.set(author, {
        author,
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        critical: 0,
        weight: 0,
        latestFeedback: fb.timestamp
      });
    }
    const u = userMap.get(author);
    u.total += 1;
    u.weight += fb.trust.weight;
    if (fb.sentiment === 'Positive') u.positive += 1;
    else if (fb.sentiment === 'Negative') u.negative += 1;
    else u.neutral += 1;
    if (new Date(fb.timestamp) > new Date(u.latestFeedback)) u.latestFeedback = fb.timestamp;
  }

  const segments = { promoters: [], atRisk: [], passives: [] };
  for (const user of userMap.values()) {
    user.weight = Number(user.weight.toFixed(2));
    if (user.negative > 0) {
      user.segment = 'At-Risk';
      segments.atRisk.push(user);
    } else if (user.positive >= user.neutral) {
      user.segment = 'Promoter';
      segments.promoters.push(user);
    } else {
      user.segment = 'Passive';
      segments.passives.push(user);
    }
  }

  res.json(segments);
}));

// ==================================================================
// THU THẬP DỮ LIỆU
// ==================================================================

router.post('/scrape', wrap(async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Cần trường url' });

  const rawReviews = await scrapeShopeeReviews(url);

  // Trình thu thập trả về rỗng khi trang chặn truy cập hoặc không có
  // bình luận nào. Đó là kết quả hợp lệ, không phải lỗi — nhưng phải
  // dừng ở đây, vì insertMany với mảng rỗng sẽ ném lỗi.
  if (rawReviews.length === 0) {
    return res.status(422).json({
      error: 'Không lấy được bình luận nào từ đường dẫn này',
      hint: 'Trang có thể đã chặn truy cập tự động, hoặc không chứa đánh giá công khai. Hệ thống không sinh dữ liệu giả để lấp chỗ trống.',
      count: 0
    });
  }

  const rawTexts = rawReviews.map((r) => r.rawText);
  const aiResults = await analyzeFeedbackBatch(rawTexts);

  const fallbackProduct =
    url.split('/').pop()?.split('?')[0]?.replace(/-/g, ' ') || 'Sản phẩm chưa xác định';

  const analyzed = rawReviews.map((review, index) => {
    const ai = aiResults[index] || {};
    const category = taxonomy.normalizeCategory(ai.category);
    return {
      source: review.source,
      originalText: review.rawText,
      author: review.author,
      timestamp: review.timestamp,
      productName: review.productName || fallbackProduct,
      accountAgeDays: review.accountAgeDays ?? null,
      rating: review.rating ?? null,
      orderId: review.orderId ?? null,
      category,
      subCategory: taxonomy.normalizeCause(category, ai.subCategory),
      sentiment: ai.sentiment || 'Neutral',
      aiSummary: ai.aiSummary || null,
      entities: ai.entities || null
    };
  });

  await req.db.collection('feedbacks').insertMany(analyzed);
  await req.db.collection('predictions').deleteMany({});
  invalidate();

  // Chạy lại Trust Layer để báo ngay lô mới ảnh hưởng thế nào tới chất lượng dữ liệu
  const ctx = await getContext(req.db, { force: true });

  res.json({
    message: 'Đã thu thập và phân tích xong',
    count: analyzed.length,
    dataHealthScore: ctx.funnel.dataHealthScore,
    funnel: ctx.funnel,
    data: analyzed.slice(0, 20)
  });
}));

router.post('/seed', wrap(async (req, res) => {
  const { buildDataset } = require('../seed_realistic_data');
  const { feedbacks, orders } = buildDataset();

  await req.db.collection('feedbacks').deleteMany({});
  await req.db.collection('transactions').deleteMany({});
  await req.db.collection('predictions').deleteMany({});
  await req.db.collection('review_labels').deleteMany({});
  await req.db.collection('recommendation_log').deleteMany({});

  await req.db.collection('feedbacks').insertMany(feedbacks);
  await req.db.collection('transactions').insertMany(orders);
  invalidate();

  const ctx = await getContext(req.db, { force: true });
  res.json({
    message: 'Đã nạp dữ liệu thử nghiệm',
    feedbacks: feedbacks.length,
    transactions: orders.length,
    funnel: ctx.funnel
  });
}));

/** Nạp dữ liệu giao dịch — nguồn dữ liệu thứ 5, mẫu số của WCR */
router.post('/transactions', wrap(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.transactions;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Cần một mảng giao dịch' });
  }

  const ops = rows
    .filter((r) => r.orderId)
    .map((r) => ({
      updateOne: {
        filter: { orderId: String(r.orderId) },
        update: {
          $set: {
            orderId: String(r.orderId),
            productName: r.productName || null,
            region: r.region || null,
            orderedAt: r.orderedAt ? new Date(r.orderedAt) : null,
            deliveredAt: r.deliveredAt ? new Date(r.deliveredAt) : null,
            amount: Number(r.amount) || 0
          }
        },
        upsert: true
      }
    }));

  if (ops.length === 0) return res.status(400).json({ error: 'Không có bản ghi nào có orderId' });

  const result = await req.db.collection('transactions').bulkWrite(ops);
  invalidate();

  res.json({
    success: true,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    total: await req.db.collection('transactions').countDocuments()
  });
}));

router.get('/transactions/summary', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  res.json({
    total: ctx.transactionCount,
    connected: ctx.transactionCount > 0,
    note:
      ctx.transactionCount > 0
        ? 'WCR được tính trên mẫu số giao dịch thật'
        : 'Chưa kết nối dữ liệu giao dịch — hệ thống chạy ở chế độ suy giảm, dùng chỉ số thay thế trong cùng kênh'
  });
}));

// ==================================================================
// AI: DỰ BÁO VÀ TRỢ LÝ HỘI THOẠI
// ==================================================================

router.get('/predict', wrap(async (req, res) => {
  const { source = 'All', time = 'All', product = 'All' } = req.query;
  const cached = await req.db
    .collection('predictions')
    .findOne({ source, time, product }, { sort: { timestamp: -1 } });

  // Trả kèm cả cỡ mẫu đã dùng lúc sinh dự báo. Không có nó thì giao diện
  // không nói được dự báo này dựa trên bao nhiêu phản hồi, và người đọc
  // mất đúng thứ giúp họ cân nhắc nên tin đến mức nào.
  if (cached) {
    return res.json({
      success: true,
      data: cached.data,
      cached: true,
      basedOnValidFeedbacks: cached.basedOnValidFeedbacks ?? null,
      generatedAt: cached.timestamp
    });
  }
  res.json({ success: true, data: null, message: 'Chưa có dự báo trong bộ nhớ đệm' });
}));

router.post('/predict/refresh', wrap(async (req, res) => {
  const { source = 'All', time = 'All', product = 'All' } = req.body;
  const ctx = await getContext(req.db);

  // CHỈ đưa phản hồi đã qua Trust Layer vào mô hình dự báo. Dự báo trên
  // dữ liệu chưa lọc là tái lập đúng cái sai mà cả hệ thống này sinh ra
  // để tránh.
  const items = applyFilters(ctx.items, { source, time, product })
    .filter(metrics.isCountable)
    .slice(0, 500);

  if (items.length === 0) {
    return res.status(400).json({ success: false, message: 'Chưa có dữ liệu hợp lệ cho bộ lọc này' });
  }

  const { generatePrediction } = require('../services/ai_analyzer');
  const prediction = await generatePrediction(items, time, product);

  await req.db.collection('predictions').deleteMany({ source, time, product });
  await req.db.collection('predictions').insertOne({
    source,
    time,
    product,
    timestamp: new Date(),
    basedOnValidFeedbacks: items.length,
    data: prediction
  });

  res.json({ success: true, data: prediction, cached: false, basedOnValidFeedbacks: items.length });
}));

/**
 * Trợ lý phân tích.
 *
 * Khác biệt so với bản cũ: KHÔNG đổ dữ liệu thô vào mô hình ngôn ngữ.
 * Động cơ định tuyến ý định, gọi các công cụ tính toán xác định trên
 * TOÀN BỘ dữ liệu, truy xuất dẫn chứng bằng BM25, rồi mới nhờ mô hình
 * diễn đạt. Xem `services/chat_engine.js`.
 */
router.post('/chat', wrap(async (req, res) => {
  const { message, history, filters } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ success: false, message: 'Cần trường message' });
  }

  const ctx = await getContext(req.db);
  const chatEngine = require('../services/chat_engine');

  const result = await chatEngine.ask(
    ctx,
    String(message).trim(),
    Array.isArray(history) ? history : [],
    filters || {}
  );

  res.json({
    success: true,
    text: result.text,
    evidence: result.evidence,
    meta: result.meta,
    // Bản trả lời tính bằng JavaScript, để người dùng đối chiếu khi nghi
    // ngờ mô hình nói khác dữ liệu
    deterministicAnswer: result.deterministicAnswer
  });
}));

/** Câu hỏi gợi ý, sinh theo tình hình dữ liệu thật */
router.get('/chat/suggestions', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const chatEngine = require('../services/chat_engine');
  res.json({
    suggestions: chatEngine.suggestedQuestions(ctx),
    dataHealthScore: ctx.funnel.dataHealthScore,
    validFeedbacks: ctx.funnel.validForAnalysis
  });
}));

// ==================================================================
// MÔ HÌNH KINH DOANH
// ==================================================================

/**
 * Bảng giá, kinh tế đơn vị và rủi ro kinh doanh.
 * Mọi con số đều kèm căn cứ và mức độ chắc chắn — đây là giả định có
 * cơ sở, không phải số liệu đo được từ vận hành thật.
 */
router.get('/business', wrap(async (req, res) => {
  const business = require('../services/business');
  const volume = Number(req.query.volume) || 5000;

  res.json({
    disclaimer:
      'Các con số dưới đây là GIẢ ĐỊNH CÓ CƠ SỞ, không phải số liệu đo được từ vận hành thật. ' +
      'Hệ thống chưa có khách hàng trả tiền. Mỗi giả định đều ghi rõ căn cứ và độ tin cậy.',
    pricing: business.PRICING_TIERS,
    assumptions: business.COST_ASSUMPTIONS,
    architectureCostComparison: business.compareArchitectureCost(volume),
    costPer1000Feedbacks: business.costPer1000Feedbacks(),
    unitEconomics: business.PRICING_TIERS
      .filter((t) => t.priceVnd > 0)
      .map((t) => business.unitEconomics(t.id)),
    risks: business.BUSINESS_RISKS
  });
}));

// ==================================================================
// KẾT QUẢ THỰC NGHIỆM
// ==================================================================

/**
 * Trả về kết quả đánh giá mô hình đã chạy gần nhất.
 * Số liệu sinh ra từ `npm run eval`, không tính lại trong request —
 * để con số hiển thị trên giao diện luôn TRÙNG KHỚP với con số in ra
 * lúc chạy đánh giá, thay vì hai nơi cho hai kết quả khác nhau.
 */
router.get('/evaluation', wrap(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'evaluation', 'results.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({
      error: 'Chưa có kết quả đánh giá',
      hint: 'Chạy `npm run eval` trong thư mục backend để sinh kết quả'
    });
  }

  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
}));

/** Diễn đạt lại cảnh báo thành văn bản tự nhiên (tầng LLM tùy chọn) */
router.post('/alerts/narrate', wrap(async (req, res) => {
  const ctx = await getContext(req.db);
  const items = applyFilters(ctx.items, req.query);
  const result = alertEngine.detectAlerts(items, { transactionCount: ctx.transactionCount });
  res.json(await generateRiskAlertsBatch(result.alerts.slice(0, 5)));
}));

module.exports = router;
