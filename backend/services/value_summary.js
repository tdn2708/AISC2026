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

function avgOrderValue(transactions = []) {
  let sum = 0;
  let n = 0;
  for (const t of transactions) {
    const a = Number(t.amount);
    if (Number.isFinite(a) && a > 0) { sum += a; n += 1; }
  }
  return n ? Math.round(sum / n) : null;
}

function computeValue({ recs = [], decisions = [], items = [], transactions = [], liveSessions = [], now = new Date(), windowDays = 30, cadenceDays = 7 } = {}) {
  const nowMs = new Date(now).getTime();
  const since = nowMs - windowDays * DAY;

  // 1. Doanh thu đứng sau các cảnh báo chưa xử lý
  // Cảnh báo cấp nhóm (tăng chậm nhưng đều) chứa cả phản hồi của cảnh báo cụ thể:
  // mỗi phản hồi bằng chứng chỉ được tính tiền một lần, cảnh báo lớn trước
  let atRisk = 0;
  let atRiskAlerts = 0;
  let lowerBound = false;
  const counted = new Set();
  const open = recs
    .filter((r) => (!r.status || r.status === 'PROPOSED') && r.dataProfile?.revenue?.measurable && (r.dataProfile.revenue.extrapolatedVnd || r.dataProfile.revenue.atRiskVnd) > 0)
    .sort((a, b) => (b.dataProfile.revenue.extrapolatedVnd || 0) - (a.dataProfile.revenue.extrapolatedVnd || 0));
  for (const r of open) {
    const rev = r.dataProfile.revenue;
    const v = rev.extrapolatedVnd || rev.atRiskVnd;
    const ids = (r.evidence?.evidenceIds || []).map(String);
    let share = 1;
    if (ids.length) {
      const fresh = ids.filter((id) => !counted.has(id));
      share = fresh.length / ids.length;
      fresh.forEach((id) => counted.add(id));
    }
    if (share <= 0) continue;
    atRisk += v * share;
    atRiskAlerts += 1;
    if (rev.isLowerBound) lowerBound = true;
  }

  // 2. Kế hoạch đã chấp nhận trong kỳ, đo trước / sau
  const insights = require('./insights');
  const aov = avgOrderValue(transactions);
  let avoided = 0;
  let measured = 0;
  let improved = 0;
  let pending = 0;
  for (const d of decisions) {
    if (d.decision !== 'ACCEPTED' || !d.at || new Date(d.at).getTime() < since) continue;
    const eff = insights.decisionEffect(items, d, now, cadenceDays);
    if (!eff) continue;
    if (eff.status !== 'done' || !eff.enough) { pending += 1; continue; }
    measured += 1;
    const drop = (eff.before.rate ?? 0) - (eff.after.rate ?? 0);
    if (drop > 0) {
      improved += 1;
      avoided += drop * eff.after.n;
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
      amount: aov && complaintsAvoided ? complaintsAvoided * aov : null,
      avgOrderValue: aov,
      measured,
      improved,
      pending
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

module.exports = { computeValue, avgOrderValue, valueForContext };
