/**
 * CUSTOMER RADAR GIÚP SHOP ĐƯỢC BAO NHIÊU (hàm thuần, không đọc Mongo)
 * ==================================================================
 * Ba con số, mỗi số chỉ lấy từ dữ liệu có thật và nói rõ đâu là ước tính:
 *   1. Đang có rủi ro: doanh thu đứng sau các cảnh báo chưa xử lý
 *      (evidence_profile.estimateRevenueAtRisk, có cờ cận dưới).
 *   2. Đã giữ lại, đo được: kế hoạch đã chấp nhận trong kỳ và đã đủ ngày đo
 *      (insights.decisionEffect, đủ 30 phản hồi mỗi bên). Khiếu nại tránh được
 *      = (tỉ lệ trước - tỉ lệ sau) x số phản hồi sau; quy ra tiền bằng giá trị
 *      đơn trung bình của shop. So trước / sau, chưa loại trừ mùa vụ.
 *   3. Livestream: doanh thu ước tính từ lượt chốt, doanh thu lỡ vì hết hàng đã
 *      được báo, số việc gấp đã làm trong phiên.
 */
const DAY = 86400000;
const { modelCodeOf } = require('./product_group');

function avgOrderValue(transactions = []) {
  let sum = 0;
  let n = 0;
  for (const t of transactions) {
    const a = Number(t.amount);
    if (Number.isFinite(a) && a > 0) { sum += a; n += 1; }
  }
  return n ? Math.round(sum / n) : null;
}

/**
 * Giá trị đơn trung bình THEO MÃ MÁY từ sổ giao dịch (B4):
 * khi shop có đơn hàng gắn mã máy, tiền rủi ro của từng cảnh báo dùng đơn giá thật
 * của đúng mã máy đó thay vì lấy bình quân cả shop (vốn lệch lớn giữa máy sấy và bếp từ đôi).
 */
function avgOrderValueByModel(transactions = []) {
  const agg = new Map();
  for (const t of transactions || []) {
    const a = Number(t?.amount);
    if (!Number.isFinite(a) || a <= 0) continue;
    const codes = new Set();
    const topMc = t.modelCode || modelCodeOf(t.productName);
    if (topMc) codes.add(topMc);
    if (Array.isArray(t.lines)) {
      for (const l of t.lines) {
        const lmc = l?.modelCode || modelCodeOf(l?.productName);
        if (lmc) codes.add(lmc);
      }
    }
    for (const mc of codes) {
      const cur = agg.get(mc) || { sum: 0, n: 0 };
      cur.sum += a;
      cur.n += 1;
      agg.set(mc, cur);
    }
  }
  const out = new Map();
  for (const [mc, { sum, n }] of agg.entries()) {
    if (n > 0) out.set(mc, Math.round(sum / n));
  }
  return out;
}

function computeValue({ recs = [], decisions = [], items = [], transactions = [], liveSessions = [], now = new Date(), windowDays = 30, cadenceDays = 7 } = {}) {
  const nowMs = new Date(now).getTime();
  const since = nowMs - windowDays * DAY;
  const aov = avgOrderValue(transactions);
  const byModelAov = avgOrderValueByModel(transactions);
  const hasOrders = Boolean(transactions && transactions.length > 0 && aov);
  const itemById = new Map((items || []).map((f) => [String(f._id), f]));
  const txnByOrder = new Map((transactions || []).filter((t) => t?.orderId).map((t) => [String(t.orderId), t]));

  // 1. Doanh thu đứng sau các cảnh báo chưa xử lý
  // Cảnh báo cấp nhóm (tăng chậm nhưng đều) chứa cả phản hồi của cảnh báo cụ thể:
  // mỗi phản hồi bằng chứng chỉ được tính tiền một lần, cảnh báo lớn trước
  let atRisk = 0;
  let atRiskAlerts = 0;
  let lowerBound = false;
  const counted = new Set();

  const estimateAlertRisk = (r) => {
    const rev = r.dataProfile?.revenue;
    const ids = (r.evidence?.evidenceIds || []).map(String);
    // Khi kho có đơn gắn mã máy: ưu tiên đơn thật theo orderId, không có thì lấy AOV theo mã máy của từng phản hồi
    if (hasOrders && byModelAov.size > 0) {
      if (ids.length > 0) {
        let total = 0;
        let inferred = false;
        for (const id of ids) {
          const fb = itemById.get(id);
          const matchedTxn = fb?.orderId ? txnByOrder.get(String(fb.orderId)) : null;
          if (matchedTxn && Number(matchedTxn.amount) > 0) {
            total += Number(matchedTxn.amount);
          } else {
            const mc = fb?.modelCode || modelCodeOf(fb?.productName) || modelCodeOf(r.productName || r.scope?.product);
            total += (mc && byModelAov.get(mc)) || aov;
            inferred = true;
          }
        }
        return { value: total, ids, isLowerBound: inferred || Boolean(rev?.isLowerBound) };
      }
      const alertMc = modelCodeOf(r.productName || r.scope?.product);
      const countEst = Number(r.evidence?.count || r.affectedCustomers || 0);
      if (countEst > 0) {
        return { value: countEst * ((alertMc && byModelAov.get(alertMc)) || aov), ids: [], isLowerBound: true };
      }
    }
    if (rev?.measurable && (rev.extrapolatedVnd || rev.atRiskVnd) > 0) {
      return { value: rev.extrapolatedVnd || rev.atRiskVnd, ids, isLowerBound: Boolean(rev.isLowerBound) };
    }
    return null;
  };

  const open = recs
    .filter((r) => !r.status || r.status === 'PROPOSED')
    .map((r) => ({ r, est: estimateAlertRisk(r) }))
    .filter((x) => x.est && x.est.value > 0)
    .sort((a, b) => b.est.value - a.est.value);

  for (const { r, est } of open) {
    let partValue = est.value;
    if (est.ids.length > 0) {
      const fresh = est.ids.filter((id) => !counted.has(id));
      if (!fresh.length) continue;
      if (hasOrders && byModelAov.size > 0) {
        partValue = 0;
        for (const id of fresh) {
          const fb = itemById.get(id);
          const matchedTxn = fb?.orderId ? txnByOrder.get(String(fb.orderId)) : null;
          if (matchedTxn && Number(matchedTxn.amount) > 0) {
            partValue += Number(matchedTxn.amount);
          } else {
            const mc = fb?.modelCode || modelCodeOf(fb?.productName) || modelCodeOf(r.productName || r.scope?.product);
            partValue += (mc && byModelAov.get(mc)) || aov;
          }
        }
      } else {
        partValue = est.value * (fresh.length / est.ids.length);
      }
      fresh.forEach((id) => counted.add(id));
    }
    if (partValue <= 0) continue;
    atRisk += partValue;
    atRiskAlerts += 1;
    if (est.isLowerBound) lowerBound = true;
  }

  // 2. Kế hoạch đã chấp nhận trong kỳ, đo trước / sau
  const insights = require('./insights');
  let avoided = 0;
  let savedMoney = 0;
  let measured = 0;
  let improved = 0;
  let pending = 0;
  let controlled = 0;
  for (const d of decisions) {
    if (d.decision !== 'ACCEPTED' || !d.at || new Date(d.at).getTime() < since) continue;
    const eff = insights.decisionEffect(items, d, now, cadenceDays);
    if (!eff) continue;
    if (eff.status !== 'done' || !eff.enough) { pending += 1; continue; }
    measured += 1;
    // Có đối chứng (sản phẩm khác cùng kỳ) thì chỉ tính phần giảm vượt nhịp chung
    const drop = -(eff.adjustedChange ?? ((eff.after.rate ?? 0) - (eff.before.rate ?? 0)));
    if (eff.control) controlled += 1;
    if (drop > 0) {
      improved += 1;
      const avoidedHere = drop * eff.after.n;
      avoided += avoidedHere;
      if (aov) {
        const [, , prodScope] = String(d.alertId || '').split('|');
        const scopeMc = prodScope && prodScope !== '*' ? modelCodeOf(prodScope) : null;
        const unitVnd = (scopeMc && byModelAov.get(scopeMc)) || aov;
        savedMoney += avoidedHere * unitVnd;
      }
    }
  }
  const complaintsAvoided = Math.round(avoided);

  // 3. Livestream trong kỳ
  let sessions = 0;
  let liveRevenue = 0;
  let lostFlagged = 0;
  let actionsDone = 0;
  for (const s of liveSessions) {
    const ref = new Date(s.endedAt || s.startedAt || s.createdAt || 0).getTime();
    if (!ref || ref < since) continue;
    sessions += 1;
    liveRevenue += Number(s.summary?.revenue) || 0;
    lostFlagged += Number(s.summary?.lostRevenue) || 0;
    actionsDone += (s.actions || []).filter((a) => a.status === 'done').length;
  }

  return {
    windowDays,
    atRisk: { amount: Math.round(atRisk), alerts: atRiskAlerts, lowerBound },
    saved: {
      complaintsAvoided,
      amount: aov && complaintsAvoided ? Math.round(savedMoney) : null,
      avgOrderValue: aov,
      measured,
      improved,
      pending,
      controlled
    },
    live: { sessions, revenue: Math.round(liveRevenue), lostFlagged: Math.round(lostFlagged), actionsDone }
  };
}

/** Đọc đủ dữ liệu của một kho rồi tính (dùng chung cho GET /api/value và bản tin Zalo sáng) */
async function valueForContext(db, ctx, { windowDays = 30, now = new Date() } = {}) {
  const { detectAlertsCached, buildRecommendationsCached } = require('./work_items');
  const { findDecision } = require('./decision_match');
  const { cadenceOf } = require('./analysis_context');
  const result = detectAlertsCached(ctx, {});
  const decisions = await db.collection('recommendation_log').find({}).toArray();
  const built = buildRecommendationsCached(ctx, {}, {}, result, decisions);
  const nowMs = new Date(now).getTime();
  const recs = built.recommendations.map((r) => ({ ...r, status: findDecision(r.alertId, decisions, nowMs)?.decision || 'PROPOSED' }));
  const since = new Date(nowMs - windowDays * DAY);
  const liveSessions = await db.collection('live_sessions')
    .find({ $or: [{ endedAt: { $gte: since } }, { startedAt: { $gte: since } }] }, { projection: { summary: 1, actions: 1, startedAt: 1, endedAt: 1, createdAt: 1 } })
    .limit(200).toArray();
  return computeValue({ recs, decisions, items: ctx.items, transactions: ctx.transactions, liveSessions, now, windowDays, cadenceDays: cadenceOf(ctx).windowDays });
}

module.exports = { computeValue, avgOrderValue, avgOrderValueByModel, valueForContext };
