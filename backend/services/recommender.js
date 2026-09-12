/**
 * ĐỘNG CƠ KHUYẾN NGHỊ HƯỚNG DỮ LIỆU
 * ==================================================================
 * Thay thế `buildRecommendation` của `playbook.js`, vốn chỉ đọc đúng
 * hai trường của cảnh báo (mã nguyên nhân và mức nghiêm trọng) rồi trả
 * về một mảng chuỗi cố định. Với đầu vào chỉ có hai giá trị rời rạc thì
 * đầu ra không thể khác nhau giữa hai bộ dữ liệu — đó là lý do kỹ thuật
 * khiến tầng khuyến nghị trông như được viết sẵn.
 *
 * ------------------------------------------------------------------
 * LUỒNG THUẬT TOÁN — SÁU BƯỚC
 *
 *   1. TÁI LẬP BẰNG CHỨNG   lấy đúng tập phản hồi đứng sau cảnh báo,
 *                           cùng tập nền để so sánh
 *   2. TRÍCH ĐẶC TRƯNG      evidence_profile: khu vực / sản phẩm / kênh
 *                           / khung giờ nào đang trội, trội có ý nghĩa
 *                           thống kê không, thiệt hại tiền là bao nhiêu,
 *                           chiều dữ liệu nào đang thiếu
 *   3. LỌC ĐIỀU KIỆN        hành động chỉ đủ điều kiện khi dữ liệu điền
 *                           được mọi chỗ trống nó cần, và khi hình thái
 *                           phân bố phù hợp với nó
 *   4. CHẤM ĐIỂM            giá trị kỳ vọng = tác động x độ tin cậy x
 *                           độ nhắm trúng x hiệu quả x hệ số học được,
 *                           trừ đi công sức và rủi ro
 *   5. GỘP LIÊN CẢNH BÁO    nhiều cảnh báo cùng một điểm hỏng thì gộp
 *                           thành một việc, không phải ba việc
 *   6. KẾT XUẤT             điền template, gắn bằng chứng, gắn mức phê
 *                           duyệt, gắn phép đo hiệu quả để kiểm lại sau
 *
 * ------------------------------------------------------------------
 * VÒNG LẶP HỌC
 *
 * Bản cũ ghi quyết định chấp nhận / bỏ qua vào `recommendation_log`
 * nhưng không bao giờ đọc lại. Nghĩa là người dùng bỏ qua cùng một
 * khuyến nghị hai mươi lần và hệ thống vẫn đề xuất y nguyên ở lần thứ
 * hai mươi mốt. Ở đây lịch sử quyết định được đọc vào hai chỗ:
 *
 *   - Hệ số học được: hậu nghiệm Beta trên tỉ lệ chấp nhận của từng mẫu
 *     hành động, tiên nghiệm đặt ở 0.7 với trọng số 4 quan sát. Chọn
 *     tiên nghiệm chứ không dùng tỉ lệ thô vì một lần bỏ qua duy nhất
 *     không nên xoá sổ một hành động.
 *   - Chặn theo thời gian nguội: hành động bị bỏ qua với lý do "đang
 *     làm rồi" hoặc "không áp dụng được" trong cùng phạm vi sẽ bị ẩn
 *     trong `cooldownDays`. Ẩn nhưng vẫn liệt kê ở `suppressed`, vì một
 *     hệ thống âm thầm giấu đề xuất là một hệ thống không giải thích được.
 *
 * ------------------------------------------------------------------
 * NGUYÊN TẮC AN TOÀN GIỮ NGUYÊN TUYỆT ĐỐI: hệ thống không tự thực thi
 * bất kỳ hành động nào phát sinh chi phí hoặc chạm tới khách hàng cuối.
 */

const evidenceProfile = require('./evidence_profile');
const library = require('./playbook_library');
const { ACTION_KIND } = require('./playbook');
const taxonomy = require('./taxonomy');
const { isCountable, isComplaint } = require('./metrics');

/** Trọng số của các thành phần điểm. Đặt tên rõ để còn hiệu chỉnh được. */
const SCORE = {
  effortPenaltyPerDay: 0.035,
  riskPenalty: { FINANCIAL: 0.3, CUSTOMER_CONTACT: 0.15, CONTACT_PARTNER: 0.05, INTERNAL_FIX: 0.03, INVESTIGATE: 0 },
  irreversiblePenalty: 0.12,
  // Tiên nghiệm Beta cho tỉ lệ chấp nhận: trung bình 0.7, trọng số 4 quan sát
  priorAlpha: 2.8,
  priorBeta: 1.2,
  maxActionsPerAlert: 5
};

/** Lý do bỏ qua khiến hành động bị chặn trong thời gian nguội */
const SUPPRESSING_REASONS = new Set(['ALREADY_DOING', 'NOT_APPLICABLE', 'đang làm rồi', 'không áp dụng']);

// ==================================================================
// ĐỊNH DẠNG
// ==================================================================

function formatVnd(n) {
  if (!n || n <= 0) return 'chưa đối soát được';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}

function formatPct(fraction, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

// ==================================================================
// BƯỚC 1 — TÁI LẬP BẰNG CHỨNG
// ==================================================================

/**
 * Lấy lại tập phản hồi đứng sau một cảnh báo. Cảnh báo chỉ mang theo 20
 * mã bằng chứng đầu tiên, không đủ để phân tích phân bố, nên ở đây ta
 * dựng lại tập đầy đủ từ chính các chiều đã định nghĩa ra cảnh báo.
 */
function reconstructEvidence(alert, items, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const windowDays = alert.windowDays ?? 7;
  const baselineDays = alert.baselineDays ?? 28;
  const windowStart = nowMs - windowDays * 86400000;
  const baselineStart = nowMs - baselineDays * 86400000;

  const matches = (f) => {
    const cat = taxonomy.normalizeCategory(f.category);
    if (cat !== alert.category) return false;
    if (alert.cause && taxonomy.normalizeCause(cat, f.subCategory) !== alert.cause) return false;
    if (alert.productName && f.productName !== alert.productName) return false;
    if (alert.region && f.region !== alert.region) return false;
    return true;
  };

  const evidence = [];
  const baseline = [];

  for (const f of items) {
    if (!isCountable(f)) continue;
    const t = new Date(f.timestamp).getTime();
    if (t > nowMs) continue;
    if (t >= windowStart) {
      if (matches(f) && isComplaint(f)) evidence.push(f);
    } else if (t >= baselineStart) {
      // Nền là TOÀN BỘ phản hồi hợp lệ của kỳ trước, không chỉ phản hồi
      // cùng nguyên nhân. Ta đang hỏi "khu vực này có bị trội hơn mức
      // bình thường của nó không", nên mẫu so sánh phải là dòng phản hồi
      // chung, nếu không mọi chiều đều trông như đang tập trung.
      baseline.push(f);
    }
  }

  return { evidence, baseline, windowDays, baselineDays };
}

// ==================================================================
// BƯỚC 3 — CHỖ TRỐNG VÀ ĐIỀU KIỆN
// ==================================================================

/**
 * Gộp chỗ trống từ ba nguồn: chiều đã qua kiểm định tập trung, chiều đã
 * được chính cảnh báo cố định, và các đại lượng tính được.
 */
function buildSlots(alert, profile, ctx) {
  const slots = { ...profile.slots };

  // Cảnh báo đã khoanh sẵn sản phẩm hoặc khu vực thì đó là sự thật chắc
  // chắn, không cần kiểm định lại
  if (alert.productName) slots.product = alert.productName;
  if (alert.region) slots.region = alert.region;

  const st = alert.statistics || {};
  slots.affected = String(alert.affectedCustomers ?? 0);
  slots.evidenceCount = String(profile.evidenceCount);
  slots.windowDays = String(ctx.windowDays);
  slots.currentRate = st.currentRate != null ? formatPct(st.currentRate) : null;
  slots.baselineRate = st.baselineRate != null ? formatPct(st.baselineRate) : null;
  slots.deltaPP = st.deltaPP != null ? `${st.deltaPP} điểm phần trăm` : null;

  const rev = profile.revenue;
  slots.revenue = rev.measurable
    ? `${formatVnd(rev.extrapolatedVnd || rev.atRiskVnd)}${rev.isLowerBound ? ' (cận dưới, đối soát được ' + formatPct(rev.coverage, 0) + ' bằng chứng)' : ''}`
    : null;

  // Tỉ trọng của chiều trội nhất, dùng trong các câu dẫn chứng
  const focused = Object.values(profile.dimensions).filter((d) => d.concentrated);
  if (focused.length) {
    const top = focused.sort((a, b) => b.lift - a.lift)[0];
    slots.topShare = formatPct(top.share, 0);
    slots.topBaselineShare = formatPct(top.baselineShare, 0);
    slots.topLift = `${top.lift.toFixed(1)} lần`;
  }

  for (const k of Object.keys(slots)) if (slots[k] == null) delete slots[k];
  return slots;
}

/** Điền chỗ trống. Còn sót chỗ trống nào thì hành động bị loại, không bao giờ hiển thị `{region}` cho người dùng. */
function fillTemplate(template, slots) {
  const missing = [];
  const text = template.replace(/\{(\w+)\}/g, (_, key) => {
    if (slots[key] == null) {
      missing.push(key);
      return `{${key}}`;
    }
    return slots[key];
  });
  return { text, missing, complete: missing.length === 0 };
}

/**
 * Lọc hành động đủ điều kiện. Đây là bước biến động cơ thành hướng dữ liệu:
 * cùng một nguyên nhân, dữ liệu khác nhau cho ra bộ hành động khác nhau.
 */
function eligibleActions(alert, profile, slots) {
  const escalate = alert.severity === 'High' || alert.severity === 'Critical';
  const entry = alert.cause ? library.LIBRARY[alert.cause] : null;

  let pool;
  let source;
  if (entry) {
    pool = entry.actions;
    source = `PB:${alert.cause}`;
  } else if (library.CATEGORY_FALLBACK[alert.category]) {
    pool = library.CATEGORY_FALLBACK[alert.category];
    source = `PB:${alert.category}:FALLBACK`;
  } else {
    pool = [library.GENERIC_FALLBACK];
    source = 'PB:GENERIC:FALLBACK';
  }

  const eligible = [];
  const rejected = [];

  for (const action of pool) {
    if (action.tier === 'escalated' && !escalate) {
      rejected.push({ id: action.id, reason: 'chỉ áp dụng ở mức Cao trở lên' });
      continue;
    }
    if (action.worksWhen && !action.worksWhen.includes(profile.concentration)) {
      rejected.push({ id: action.id, reason: `phân bố ${profile.concentration} không phù hợp với hành động này` });
      continue;
    }
    const missingRequired = (action.requires || []).filter((s) => slots[s] == null);
    if (missingRequired.length) {
      rejected.push({ id: action.id, reason: `thiếu dữ liệu: ${missingRequired.join(', ')}` });
      continue;
    }
    const filled = fillTemplate(action.template, slots);
    if (!filled.complete) {
      rejected.push({ id: action.id, reason: `không điền được: ${filled.missing.join(', ')}` });
      continue;
    }
    eligible.push({ ...action, text: filled.text, source });
  }

  // Chiều dữ liệu còn thiếu thì đề xuất bổ sung đo đạc. Đây là khuyến
  // nghị mà bản cũ không có, và thường là việc đáng làm nhất khi hệ
  // thống liên tục chỉ đưa ra được lời khuyên chung chung.
  const gapSlot = entry?.gapSlot;
  if (gapSlot && slots[gapSlot] == null && library.INSTRUMENTATION_ACTIONS[gapSlot]) {
    const ins = library.INSTRUMENTATION_ACTIONS[gapSlot];
    const filled = fillTemplate(ins.template, slots);
    if (filled.complete) {
      eligible.push({ ...ins, text: filled.text, source: `INS:${gapSlot}`, isInstrumentation: true });
    }
  }

  // LƯỚI AN TOÀN: sau khi lọc, phải còn ít nhất một việc làm được ngay.
  // Nếu mọi hành động chuyên biệt đều thiếu dữ liệu, người vận hành
  // không thể nhận về một màn hình trống — họ vẫn cần biết phải bắt đầu
  // từ đâu, kể cả khi lời khuyên buộc phải chung chung hơn.
  const hasActionable = eligible.some((a) => !a.isInstrumentation);
  if (!hasActionable) {
    const generic = (library.CATEGORY_FALLBACK[alert.category] || [library.GENERIC_FALLBACK])[0];
    const filled = fillTemplate(generic.template, slots);
    if (filled.complete) {
      eligible.push({ ...generic, text: filled.text, source: `${source}:SAFETY_NET`, isSafetyNet: true });
    }
  }

  return { eligible, rejected, source };
}

// ==================================================================
// BƯỚC 4 — CHẤM ĐIỂM
// ==================================================================

/** Hậu nghiệm Beta trên tỉ lệ chấp nhận của một mẫu hành động */
function learnedPrior(actionId, learning) {
  const h = learning.byAction.get(actionId);
  const a = SCORE.priorAlpha + (h?.accepted ?? 0);
  const b = SCORE.priorBeta + (h?.dismissed ?? 0);
  return { value: a / (a + b), observations: (h?.accepted ?? 0) + (h?.dismissed ?? 0) };
}

/**
 * Tác động chuẩn hoá. Ưu tiên tiền khi đối soát được, vì đó là đại lượng
 * doanh nghiệp thật sự ra quyết định trên đó; không đối soát được thì
 * lùi về số khách bị ảnh hưởng.
 */
function impactScore(alert, profile) {
  const rev = profile.revenue;
  if (rev.measurable && rev.extrapolatedVnd > 0) {
    // Thang log: 1 triệu ~ 0.25, 10 triệu ~ 0.5, 100 triệu ~ 0.75
    const scaled = Math.log10(Math.max(rev.extrapolatedVnd, 1)) / 8;
    return Math.min(1, Math.max(0, scaled));
  }
  const affected = alert.affectedCustomers || 0;
  return Math.min(1, affected / 50);
}

/** Độ tin cậy của chính cảnh báo, tách khỏi mức nghiêm trọng */
function confidenceScore(alert, profile) {
  const st = alert.statistics || {};
  const q = st.qValue ?? 0.05;
  const fromStats = Math.min(1, Math.max(0, 1 - q / 0.05)) * 0.5;
  const fromSample = Math.min(1, profile.evidenceCount / 25) * 0.3;
  // Tỉ lệ trọng số tin cậy trên số lượng thô: bằng chứng toàn nguồn yếu
  // thì độ tin cậy phải giảm, kể cả khi đông
  const trustRatio = profile.evidenceCount ? profile.weightedCount / profile.evidenceCount : 0;
  return Math.min(1, fromStats + fromSample + trustRatio * 0.2);
}

/** Độ nhắm trúng: hành động dùng chỗ trống đã qua kiểm định thì nhắm trúng hơn */
function targetingScore(action, profile) {
  const required = action.requires || [];
  if (!required.length) return profile.concentration === 'DIFFUSE' ? 0.7 : 0.55;
  const dims = Object.values(profile.dimensions).filter((d) => d.concentrated);
  if (!dims.length) return 0.5;
  const avgLift = dims.reduce((s, d) => s + Math.min(d.lift, 5), 0) / dims.length;
  return Math.min(1, 0.5 + (avgLift - 1) * 0.125);
}

function scoreAction(action, alert, profile, learning) {
  const impact = impactScore(alert, profile);
  const confidence = confidenceScore(alert, profile);
  const targeting = targetingScore(action, profile);
  const effect = action.isInstrumentation
    ? (action.strategicValue ?? 0.5)
    : (action.observedReduction ?? action.expectedReduction ?? 0.1);
  const prior = learnedPrior(action.id, learning);

  const effortPenalty = (action.effortDays ?? 1) * SCORE.effortPenaltyPerDay;
  const kindPenalty = SCORE.riskPenalty[action.kind] ?? 0;
  const reversePenalty = action.reversible === false ? SCORE.irreversiblePenalty : 0;

  // Trung bình nhân của năm yếu tố, không phải tích trực tiếp. Tích của
  // năm số nhỏ hơn 1 tụt xuống gần 0 và mọi hành động đều thua phần trừ
  // chi phí, khiến thứ hạng mất ý nghĩa. Trung bình nhân giữ đúng tính
  // chất cần có — một yếu tố gần 0 vẫn kéo sập cả điểm — nhưng nằm cùng
  // thang đo với các khoản trừ.
  const factors = [impact, confidence, targeting, effect, prior.value];
  const gross = factors.some((f) => f <= 0)
    ? 0
    : Math.exp(factors.reduce((s, f) => s + Math.log(f), 0) / factors.length);
  const total = gross - effortPenalty - kindPenalty - reversePenalty;

  return {
    total: Number(total.toFixed(4)),
    // Công khai từng thành phần: một điểm số không giải thích được thì
    // người vận hành không có cơ sở phản biện, và sẽ ngừng tin nó
    components: {
      impact: Number(impact.toFixed(3)),
      confidence: Number(confidence.toFixed(3)),
      targeting: Number(targeting.toFixed(3)),
      expectedEffect: Number(effect.toFixed(3)),
      learnedAcceptance: Number(prior.value.toFixed(3)),
      learnedFrom: prior.observations,
      effortPenalty: Number(effortPenalty.toFixed(3)),
      riskPenalty: Number((kindPenalty + reversePenalty).toFixed(3))
    }
  };
}

// ==================================================================
// VÒNG LẶP HỌC
// ==================================================================

/**
 * Đọc lịch sử quyết định. Chấp nhận cả lược đồ cũ (ghi theo alertId) lẫn
 * lược đồ mở rộng (ghi thêm actionId). Với bản ghi cũ, quyết định được
 * quy cho toàn bộ hành động của cảnh báo đó, kém chính xác nhưng còn hơn
 * bỏ qua hoàn toàn như hiện nay.
 */
function learnFromDecisions(decisions = []) {
  const byAction = new Map();
  const suppressed = [];

  for (const d of decisions) {
    const ids = d.actionIds || (d.actionId ? [d.actionId] : []);
    for (const id of ids) {
      if (!byAction.has(id)) byAction.set(id, { accepted: 0, dismissed: 0, lastAt: null });
      const rec = byAction.get(id);
      if (d.decision === 'ACCEPTED') rec.accepted += 1;
      else if (d.decision === 'DISMISSED') rec.dismissed += 1;
      const at = d.at ? new Date(d.at).getTime() : 0;
      if (at > (rec.lastAt || 0)) rec.lastAt = at;

      if (d.decision === 'DISMISSED' && d.reason && SUPPRESSING_REASONS.has(String(d.reason).trim())) {
        suppressed.push({ actionId: id, scopeKey: d.scopeKey || d.alertId, at, reason: d.reason });
      }
    }
  }

  return { byAction, suppressed, totalDecisions: decisions.length };
}

function isSuppressed(actionId, scopeKey, action, learning, now) {
  const cooldownMs = (action.cooldownDays ?? 14) * 86400000;
  return learning.suppressed.find(
    (s) => s.actionId === actionId && s.scopeKey === scopeKey && now - s.at < cooldownMs
  );
}

// ==================================================================
// BƯỚC 6 — PHÉP ĐO HIỆU QUẢ
// ==================================================================

/**
 * Mô tả phép đo sẽ chạy lại sau khi hành động được chấp nhận. Đây là thứ
 * đóng vòng lặp: không có nó thì "hiệu quả kỳ vọng" mãi mãi là giả định.
 */
function buildEffectCheck(alert, action, now) {
  const st = alert.statistics || {};
  const current = st.currentRate ?? 0;
  const target = current * (1 - (action.expectedReduction ?? 0.1));
  const days = action.tier === 'escalated' ? 7 : 14;

  return {
    metric: 'complaintShare',
    scope: {
      category: alert.category,
      cause: alert.cause || null,
      productName: alert.productName || null,
      region: alert.region || null
    },
    rateBefore: Number(current.toFixed(4)),
    targetRate: Number(target.toFixed(4)),
    windowDays: alert.windowDays ?? 7,
    dueAt: new Date(new Date(now).getTime() + days * 86400000).toISOString(),
    followUpDays: days
  };
}

/**
 * Đo lại hiệu quả thật sau thời gian theo dõi. Kết quả ghi ngược vào
 * lịch sử để lần sau `expectedReduction` không còn là giả định.
 */
function measureEffect(effectCheck, items, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const windowMs = effectCheck.windowDays * 86400000;
  const scope = effectCheck.scope;

  const inScope = (f) => {
    const cat = taxonomy.normalizeCategory(f.category);
    if (cat !== scope.category) return false;
    if (scope.cause && taxonomy.normalizeCause(cat, f.subCategory) !== scope.cause) return false;
    if (scope.productName && f.productName !== scope.productName) return false;
    if (scope.region && f.region !== scope.region) return false;
    return true;
  };

  let hits = 0;
  let total = 0;
  for (const f of items) {
    if (!isCountable(f)) continue;
    const t = new Date(f.timestamp).getTime();
    if (t > nowMs || t < nowMs - windowMs) continue;
    total += 1;
    if (inScope(f) && isComplaint(f)) hits += 1;
  }

  const rateAfter = total ? hits / total : 0;
  const before = effectCheck.rateBefore || 0;
  const relativeChange = before > 0 ? (rateAfter - before) / before : 0;

  return {
    rateBefore: before,
    rateAfter: Number(rateAfter.toFixed(4)),
    relativeChange: Number(relativeChange.toFixed(3)),
    reachedTarget: rateAfter <= effectCheck.targetRate,
    sample: total,
    // Mẫu quá nhỏ thì kết luận về hiệu quả không đáng tin, phải nói rõ
    conclusive: total >= 30,
    measuredAt: new Date(nowMs).toISOString()
  };
}

// ==================================================================
// KẾT XUẤT MỘT KHUYẾN NGHỊ
// ==================================================================

function buildRecommendation(alert, options = {}) {
  const { items = [], transactions = [], decisions = [], now = new Date() } = options;
  const learning = options.learning || learnFromDecisions(decisions);
  const nowMs = new Date(now).getTime();

  const { evidence, baseline, windowDays, baselineDays } = reconstructEvidence(alert, items, now);
  const profile = evidenceProfile.profileEvidence(evidence, baseline, {
    transactions,
    category: alert.category
  });

  const slots = buildSlots(alert, profile, { windowDays, baselineDays });
  const { eligible, rejected, source } = eligibleActions(alert, profile, slots);

  const scopeKey = `${alert.category}|${alert.cause || '*'}|${alert.productName || '*'}|${alert.region || '*'}`;

  const kept = [];
  const held = [];

  for (const action of eligible) {
    const blocked = isSuppressed(action.id, scopeKey, action, learning, nowMs);
    if (blocked) {
      held.push({ actionId: action.id, text: action.text, until: new Date(blocked.at + (action.cooldownDays ?? 14) * 86400000).toISOString(), reason: blocked.reason });
      continue;
    }
    const score = scoreAction(action, alert, profile, learning);
    kept.push({ action, score });
  }

  kept.sort((a, b) => b.score.total - a.score.total);
  const top = kept.slice(0, SCORE.maxActionsPerAlert);

  const steps = top.map(({ action, score }, i) => {
    const kind = ACTION_KIND[action.kind] || ACTION_KIND.INVESTIGATE;
    return {
      order: i + 1,
      actionId: action.id,
      text: action.text,
      kind: kind.key,
      kindLabel: kind.label,
      incursCost: kind.cost,
      touchesCustomer: kind.touchesCustomer,
      requiresApproval: kind.cost || kind.touchesCustomer,
      approvalRole: kind.cost ? 'Quản lý có thẩm quyền chi' : kind.touchesCustomer ? 'Trưởng bộ phận CSKH' : null,
      effortDays: action.effortDays ?? 1,
      reversible: action.reversible !== false,
      isInstrumentation: Boolean(action.isInstrumentation),
      score: score.total,
      scoreComponents: score.components,
      effectCheck: buildEffectCheck(alert, action, now)
    };
  });

  return {
    alertId: alert.id,
    ruleId: `${source}:${alert.severity === 'High' || alert.severity === 'Critical' ? 'ESCALATED' : 'BASELINE'}`,
    scopeKey,
    owner: alert.owner,
    status: 'PROPOSED',
    autoExecuted: false,

    // Hồ sơ dữ liệu đứng sau khuyến nghị: đây là phần làm cho hai bộ dữ
    // liệu khác nhau sinh ra hai khuyến nghị khác nhau
    dataProfile: {
      concentration: profile.concentration,
      focusedDimensions: profile.focusedDimensions,
      facts: profile.facts,
      revenue: profile.revenue,
      slots,
      gaps: profile.gaps
    },

    evidence: {
      statistics: alert.statistics,
      evidenceCount: profile.evidenceCount,
      weightedCount: profile.weightedCount,
      excludedByTrust: alert.excludedByTrust,
      affectedCustomers: alert.affectedCustomers,
      evidenceIds: alert.evidenceIds
    },

    confidence: Number(confidenceScore(alert, profile).toFixed(3)),
    severityScore: alert.severityScore,
    steps,
    requiresApproval: steps.some((s) => s.requiresApproval),

    // Minh bạch về những gì đã bị loại, để người vận hành phản biện được
    diagnostics: {
      actionsConsidered: eligible.length + rejected.length,
      rejected,
      suppressed: held,
      learnedFromDecisions: learning.totalDecisions
    },

    safetyNote:
      'Hệ thống không tự thực thi bất kỳ hành động nào phát sinh chi phí hoặc tác động tới khách hàng cuối. Mọi hành động ở đây là đề xuất; người có thẩm quyền quyết định.',
    followUpDays: steps.length ? steps[0].effectCheck.followUpDays : 14
  };
}

// ==================================================================
// BƯỚC 5 — GỘP LIÊN CẢNH BÁO
// ==================================================================

/**
 * Ba cảnh báo cùng chỉ về một khu vực và cùng đề xuất một hành động thì
 * với người vận hành đó là MỘT việc phải làm, không phải ba. Gộp lại và
 * cộng dồn tác động, vì việc đó đáng ưu tiên hơn ba việc rời rạc.
 */
function bundle(recommendations) {
  const groups = new Map();

  for (const rec of recommendations) {
    for (const step of rec.steps) {
      const dimValue = rec.dataProfile.slots.region || rec.dataProfile.slots.product || '*';
      const key = `${step.actionId}|${dimValue}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ rec, step });
    }
  }

  const bundles = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    bundles.push({
      key,
      actionId: members[0].step.actionId,
      text: members[0].step.text,
      alertIds: members.map((m) => m.rec.alertId),
      combinedAffected: members.reduce((s, m) => s + (m.rec.evidence.affectedCustomers || 0), 0),
      combinedRevenueVnd: members.reduce((s, m) => s + (m.rec.dataProfile.revenue.extrapolatedVnd || 0), 0),
      maxScore: Math.max(...members.map((m) => m.step.score)),
      note: `${members.length} cảnh báo khác nhau cùng dẫn tới hành động này. Xử lý một lần giải quyết được cả ${members.length} cảnh báo.`
    });
  }

  return bundles.sort((a, b) => b.maxScore - a.maxScore);
}

// ==================================================================
// ĐIỂM VÀO CHÍNH
// ==================================================================

/**
 * @param {Array}  alerts        cảnh báo từ alert_engine.detectAlerts
 * @param {object} options       { items, transactions, decisions, now }
 * @returns {{ recommendations, bundles, meta }}
 */
function buildAll(alerts, options = {}) {
  const learning = learnFromDecisions(options.decisions || []);
  const recommendations = alerts.map((a) => buildRecommendation(a, { ...options, learning }));

  // Thứ tự trình bày là thứ tự giá trị kỳ vọng của hành động tốt nhất
  // trong mỗi khuyến nghị, không phải thứ tự điểm nghiêm trọng. Cảnh báo
  // nghiêm trọng nhất chưa chắc là cảnh báo làm được gì nhất.
  recommendations.sort((a, b) => (b.steps[0]?.score ?? -1) - (a.steps[0]?.score ?? -1));

  return {
    recommendations,
    bundles: bundle(recommendations),
    meta: {
      actionLibrarySize: library.ACTION_COUNT,
      causesCovered: Object.keys(library.LIBRARY).length,
      decisionsLearnedFrom: learning.totalDecisions,
      generatedAt: new Date(options.now || Date.now()).toISOString()
    }
  };
}

// ==================================================================
// HÀNG RÀO CHO TẦNG SINH NGÔN NGỮ
// ==================================================================

/**
 * Tầng LLM chỉ được diễn đạt lại, không được thêm dữ kiện. Quy tắc đó
 * chỉ có giá trị nếu kiểm tra được. Hàm này soát mọi con số trong văn
 * bản do mô hình sinh ra và đối chiếu với tập số hợp lệ của khuyến nghị;
 * xuất hiện một con số lạ nghĩa là mô hình đã bịa, và bản văn đó phải bị
 * loại, trả về câu tổng hợp bằng quy tắc.
 */
function verifyNumericGrounding(text, allowedNumbers) {
  const allowed = new Set(allowedNumbers.map((n) => String(n).replace(/[.,\s]/g, '')));
  const found = String(text).match(/\d[\d.,]*/g) || [];
  const ungrounded = found
    .map((n) => n.replace(/[.,\s]/g, ''))
    .filter((n) => n.length > 1 && !allowed.has(n));
  return { grounded: ungrounded.length === 0, ungrounded };
}

module.exports = {
  buildAll,
  buildRecommendation,
  reconstructEvidence,
  buildSlots,
  fillTemplate,
  eligibleActions,
  scoreAction,
  learnFromDecisions,
  buildEffectCheck,
  measureEffect,
  bundle,
  verifyNumericGrounding,
  SCORE
};
