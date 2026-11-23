/**
 * VIỆC CẦN LÀM, DÙNG CHUNG CHO WEB VÀ QUẢN GIA
 * ==================================================================
 * Trước đây các hàm này nằm trong routes/api.js. Quản gia (services/butler)
 * cần đúng những con số đó để báo qua Zalo và nhận lệnh "duyệt", nên tách ra
 * đây: web và Zalo đọc cùng một bộ nhớ đệm, ra cùng một danh sách, ghi quyết
 * định qua cùng một đường.
 *
 *   detectAlertsCached          cảnh báo (có ghi nhớ theo phiên bản ngữ cảnh)
 *   buildRecommendationsCached  kế hoạch hành động cho từng cảnh báo
 *   pendingAlerts               cảnh báo chưa ai quyết, kèm kế hoạch
 *   painPointsFor               điểm đau (chuyện khách lặp lại)
 *   buildInboxItems             hộp việc hôm nay (trừ cảnh báo)
 *   recordDecision              chấp nhận / bỏ qua một đề xuất
 */

const alertEngine = require('./alert_engine');
const recommender = require('./recommender');
const playbook = require('./playbook');
const trustLayer = require('./trust_layer');
const painPoints = require('./pain_points');
const caseFile = require('./case_file');
const { findDecision } = require('./decision_match');
const { issueTitle } = require('./wording');
const { spanWords } = require('./cadence');
const { applyFilters, scopeTransactions, ctxNow, cadenceOf } = require('./analysis_context');

/**
 * BỘ NHỚ ĐỆM CẢNH BÁO + ĐỀ XUẤT
 * Phát hiện cảnh báo và dựng kế hoạch hành động tốn ~150ms trên máy dev
 * nhưng ~2,2 giây trên CPU của Render, và trang Tổng quan gọi /alerts,
 * /recommendations, /nav/status cùng lúc — cả ba tính lại y hệt nhau.
 * Kết quả chỉ đổi khi dữ liệu (ctx.computedAt), bộ lọc hay quyết định đã lưu
 * đổi, nên ghi nhớ theo đúng ba thứ đó. Hết hạn sau 5 phút để cửa sổ thời
 * gian của kiểm định vẫn trượt theo giờ thật.
 */
const ALERT_MEMO_TTL_MS = 5 * 60 * 1000;
const alertMemo = new Map();

function memo(key, compute) {
  const hit = alertMemo.get(key);
  if (hit && Date.now() - hit.at < ALERT_MEMO_TTL_MS) return hit.value;
  const value = compute();
  if (alertMemo.size > 200) alertMemo.clear();
  alertMemo.set(key, { at: Date.now(), value });
  return value;
}

const filterKey = (q = {}) => ['source', 'time', 'product', 'region'].map((k) => String(q[k] ?? '')).join('|');

/** detectAlerts có ghi nhớ; `opts` là tùy chọn cửa sổ của kiểm định */
function detectAlertsCached(ctx, query, opts = {}) {
  const key = `detect|${ctx.dbName}|${ctx.computedAt}|${filterKey(query)}|${JSON.stringify(opts)}`;
  return memo(key, () =>
    alertEngine.detectAlerts(applyFilters(ctx.items, query, ctx.asOf), {
      transactionCount: ctx.transactionCount,
      // mẫu số WCR: giao dịch cùng phạm vi lọc, đếm trong đúng cửa sổ của từng cảnh báo
      transactions: scopeTransactions(ctx.transactions, { ...query, time: undefined }, ctx.asOf),
      now: ctx.asOf || undefined,
      ...opts,
      // Cửa sổ theo nhịp của kho (services/cadence.js), trừ khi gọi chỉ định rõ
      windowDays: opts.windowDays ?? cadenceOf(ctx).windowDays,
      baselineDays: opts.baselineDays ?? cadenceOf(ctx).baselineDays
    })
  );
}

/** recommender.buildAll có ghi nhớ, khóa gồm cả các quyết định đã lưu */
function buildRecommendationsCached(ctx, query, opts, result, decisions) {
  const decisionSig = decisions
    .map((d) => `${d.alertId}:${d.decision}:${d.at ? new Date(d.at).getTime() : ''}`)
    .sort()
    .join(',');
  const key = `build|${ctx.dbName}|${ctx.computedAt}|${filterKey(query)}|${JSON.stringify(opts)}|${decisionSig}`;
  return memo(key, () =>
    recommender.buildAll(result.alerts, { items: ctx.items, transactions: ctx.transactions, decisions, now: ctxNow(ctx), windowDays: cadenceOf(ctx).windowDays })
  );
}

const SEVERITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Cảnh báo chưa ai chấp nhận hay bỏ qua, nặng nhất trước, kèm kế hoạch.
 * Cùng định nghĩa "đang chờ" với huy hiệu thanh bên (/nav/status).
 */
async function pendingAlerts(db, ctx) {
  const result = detectAlertsCached(ctx, {});
  const decisions = await db.collection('recommendation_log').find({}).toArray();
  const built = buildRecommendationsCached(ctx, {}, {}, result, decisions);
  const recByAlert = new Map(built.recommendations.map((r) => [r.alertId, r]));
  const nowMs = Date.now();
  return result.alerts
    .filter((a) => !findDecision(a.id, decisions, nowMs))
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      severityVi: a.severityVi,
      title: issueTitle(a.categoryLabel, a.causeLabel),
      productName: a.productName || null,
      region: a.region || null,
      summary: playbook.summarize(a),
      recommendation: recByAlert.get(a.id) || null
    }))
    .sort((x, y) => (SEVERITY_RANK[x.severity] ?? 9) - (SEVERITY_RANK[y.severity] ?? 9));
}

// Tách cụm từ cả kho tốn vài giây lần đầu (chuẩn hóa từng câu); kết quả chỉ đổi
// khi dữ liệu hoặc bộ lọc đổi, nên nhớ theo đúng hai thứ đó
const painMemo = new Map();
function painPointsFor(ctx, query) {
  const filters = { time: query.time, source: query.source, product: query.product, region: query.region };
  const key = `${ctx.dbName}|${ctx.computedAt}|${JSON.stringify(filters)}`;
  const hit = painMemo.get(key);
  if (hit) return hit;
  // Không lọc gì: dùng bản worker đã tính sẵn cùng ngữ cảnh
  if (ctx.painDefault && !Object.values(filters).some((v) => v && v !== 'All')) return ctx.painDefault;
  const items = applyFilters(ctx.items, filters, ctx.asOf);
  const result = painPoints.findPainPoints(items, { now: ctxNow(ctx), trendDays: cadenceOf(ctx).windowDays });
  painMemo.set(key, result);
  if (painMemo.size > 12) painMemo.delete(painMemo.keys().next().value);
  return result;
}

/**
 * HỘP VIỆC HÔM NAY — các việc cần người làm, gộp từ mọi nguồn trừ cảnh báo
 * (trang Tổng quan đã có cảnh báo kèm trạng thái quyết định, tự ghép vào).
 * Mỗi việc: mức độ, việc gì, vì sao, và chỗ để làm.
 *   - Phiên đang live: việc khẩn trợ lý đang gợi ý
 *   - Đơn chốt từ live chưa lên đơn, khiếu nại từ live chưa đưa vào hệ thống
 *   - Phản hồi chờ người duyệt (nghi ngờ ảo, AI chưa chắc nhãn)
 *   - Điểm đau chưa có hồ sơ, hồ sơ đã đủ ngày theo dõi
 *   - Kho thật lâu chưa thu thập thêm
 */
async function buildInboxItems(db, workspace, ctx) {
  const items = [];
  const DAY = 24 * 60 * 60 * 1000;

  // ---------- Livestream ----------
  try {
    const hub = require('./live/hub');
    const sessions = await db.collection('live_sessions').find({ createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }).sort({ createdAt: -1 }).limit(10).toArray();
    for (const s of sessions) {
      const r = hub.runtimeFor(s._id, workspace);
      if (!r || r.status === 'ended') continue;
      for (const a of r.snapshot().actions.active.filter((x) => x.severity !== 'medium').slice(0, 2)) {
        items.push({
          id: `live|${s._id}|${a.id}`, source: 'live', severity: a.severity === 'critical' ? 'critical' : 'high',
          title: a.title, why: `Đang live "${s.title}". ${a.why}`,
          actions: [{ label: 'Mở phiên live', to: `/live?session=${s._id}` }]
        });
      }
    }
    const ids = sessions.map((s) => s._id);
    if (ids.length) {
      const col = db.collection('live_comments');
      const [newOrders, unpushed] = await Promise.all([
        col.aggregate([{ $match: { sessionId: { $in: ids }, intent: 'order', orderStatus: 'new' } }, { $group: { _id: '$sessionId', n: { $sum: 1 } } }]).toArray(),
        col.aggregate([{ $match: { sessionId: { $in: ids }, intent: 'complaint', pushedToFeedback: { $ne: true } } }, { $group: { _id: '$sessionId', n: { $sum: 1 } } }]).toArray()
      ]);
      const title = new Map(sessions.map((s) => [String(s._id), s.title]));
      // Tên phiên nằm ngay trong tiêu đề: bản tin Zalo chỉ in tiêu đề, hai phiên cùng 5 đơn
      // chờ trước đây hiện thành hai dòng giống hệt nhau
      const short = (id) => { const t = String(title.get(String(id)) || 'không tên'); return t.length > 40 ? `${t.slice(0, 39)}…` : t; };
      for (const o of newOrders) {
        items.push({
          id: `orders|${o._id}`, source: 'orders', severity: o.n >= 20 ? 'high' : 'medium',
          title: `${o.n.toLocaleString('vi-VN')} lượt chốt từ live chưa lên đơn (phiên "${short(o._id)}")`, why: 'Khách chờ lâu thì dễ đổi ý.',
          actions: [{ label: 'Xem danh sách', to: `/live?session=${o._id}` }]
        });
      }
      for (const u of unpushed) {
        items.push({
          id: `livecomplaints|${u._id}`, source: 'live', severity: 'medium',
          title: `${u.n.toLocaleString('vi-VN')} khiếu nại từ live chưa đưa vào hệ thống (phiên "${short(u._id)}")`, why: 'Đưa vào để cảnh báo tính chung với các kênh khác.',
          actions: [{ label: 'Mở báo cáo phiên', to: `/live?session=${u._id}` }]
        });
      }
    }
  } catch (e) {
    console.warn('[INBOX] Bỏ qua phần livestream:', e.message);
  }

  // ---------- Duyệt phản hồi ----------
  const queue = trustLayer.buildReviewQueue(ctx.items, 500);
  const suspicious = Array.isArray(queue) ? queue.length : (queue?.items?.length ?? 0);
  if (suspicious) {
    items.push({
      id: 'review|trust', source: 'review', severity: 'medium',
      title: `${suspicious.toLocaleString('vi-VN')} phản hồi nghi là đánh giá ảo chờ duyệt`,
      why: 'Đang bị giảm trọng số trong mọi chỉ số. Duyệt để giữ lại phản hồi thật, loại phản hồi ảo.',
      actions: [{ label: 'Duyệt', to: '/trust' }]
    });
  }
  const unsure = ctx.items.filter((f) => f.needsReview && f.labelledBy !== 'human').length;
  if (unsure) {
    items.push({
      id: 'review|labels', source: 'review', severity: 'medium',
      title: `${unsure.toLocaleString('vi-VN')} phản hồi AI chưa chắc nhãn`,
      why: 'Hai mô hình bất đồng, thường là câu mỉa mai. Nhãn của người sẽ thay nhãn máy ngay.',
      actions: [{ label: 'Duyệt nhãn', to: '/trust?tab=audit' }]
    });
  }

  // ---------- Điểm đau chưa có hồ sơ ----------
  // Chuyện khách lặp lại (services/pain_points.js) là việc làm được ngay cả khi
  // không có đột biến nào: kho thật lấy từ sàn thường không có cảnh báo mà vẫn có
  // hàng chục khách than cùng một lỗi. Đưa tối đa 3 chuyện nhiều khách nhất chưa
  // có hồ sơ đang mở; đang tăng (kỳ gần nhất hơn hẳn kỳ trước) thì mức gấp.
  // Chỉ kho thật: câu của kho mô phỏng ghép từ mẫu nên điểm đau ra mẩu câu mẫu ("quảng cáo"),
  // đưa lên hộp việc thì chen trước các cảnh báo vốn là câu chuyện của kho demo
  if (workspace === 'real') try {
    const pain = painPointsFor(ctx, {});
    const open = new Set((await db.collection('cases').find({ status: 'open' }, { projection: { key: 1 } }).toArray()).map((c) => c.key));
    const list = [...pain.groups, ...(pain.shop ? [pain.shop] : [])]
      .flatMap((g) => g.painPoints.map((p) => ({ g, p })))
      .filter(({ p }) => !open.has(p.key))
      .sort((a, b) => b.p.customers - a.p.customers || b.p.weight - a.p.weight)
      .slice(0, 3);
    const span = spanWords(cadenceOf(ctx).windowDays);
    for (const { g, p } of list) {
      const { recent = 0, previous = 0 } = p.trend || {};
      const rising = recent >= 3 && recent >= previous * 1.5 + 1;
      const where = g.scope === 'shop' ? 'nhiều mảng hàng' : g.label;
      items.push({
        id: `pain|${p.key}`, source: 'pain', severity: rising ? 'high' : 'medium', score: p.customers,
        title: `${p.customers.toLocaleString('vi-VN')} khách than "${p.phrase}" ở ${where}`,
        why: `${p.causeLabel ? `Phần lớn là ${p.causeLabel.toLowerCase()}. ` : ''}${rising ? `Đang tăng: ${recent} câu trong ${span} gần nhất, kỳ trước ${previous}. ` : ''}Chưa có hồ sơ xử lý.`,
        actions: [{ label: 'Mở hồ sơ', to: `/cases?key=${encodeURIComponent(p.key)}` }]
      });
    }
  } catch (e) {
    console.warn('[INBOX] Bỏ qua phần điểm đau:', e.message);
  }

  // ---------- Hồ sơ đã đủ ngày theo dõi ----------
  // Khép vòng "từ dữ liệu tới hành động": mở hồ sơ xong, 7 ngày sau hệ thống nhắc
  // người mở quay lại xem điểm đau đã giảm chưa (đủ câu thì có số, không thì nói chưa đủ)
  try {
    const openCases = await db.collection('cases').find({ status: 'open' }).sort({ openedAt: 1 }).limit(20).toArray();
    for (const c of openCases) {
      const e = caseFile.caseEffect(ctx.items, c, new Date(), 7, cadenceOf(ctx).windowDays);
      if (e.status !== 'done') continue;
      const result = e.enough && e.change != null
        ? `Tỉ lệ câu nhắc chuyện này ${e.change < 0 ? 'đã giảm' : e.change > 0 ? 'đang tăng' : 'không đổi'}.`
        : 'Chưa đủ phản hồi mới để so, xem việc nào còn dở.';
      items.push({
        id: `case|${c._id}`, source: 'case', severity: e.enough && e.change > 0 ? 'high' : 'medium', score: 1,
        title: `Hồ sơ "${c.phrase}" ở ${c.groupLabel} đã đủ 7 ngày theo dõi`,
        why: result,
        actions: [{ label: 'Xem kết quả', to: `/cases?key=${encodeURIComponent(c.key)}` }]
      });
    }
  } catch (e) {
    console.warn('[INBOX] Bỏ qua phần hồ sơ:', e.message);
  }

  // ---------- Độ tươi của dữ liệu thật ----------
  if (workspace === 'real' && ctx.ingestedAt) {
    const days = Math.floor((Date.now() - new Date(ctx.ingestedAt).getTime()) / DAY);
    if (days >= 2) {
      items.push({
        id: 'data|stale', source: 'data', severity: days >= 7 ? 'high' : 'medium',
        title: `Dữ liệu chưa cập nhật ${days} ngày`,
        why: 'Số liệu và cảnh báo đang dựa trên phản hồi cũ.',
        actions: [{ label: 'Thu thập dữ liệu mới', to: '/data' }]
      });
    }
  }

  return items;
}

const clip = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);

/**
 * Chấp nhận / Bỏ qua một khuyến nghị. Bỏ qua thì BẮT BUỘC có lý do (lý do bỏ
 * qua chính là dữ liệu để cải thiện playbook). Ném lỗi có `status` 400 khi
 * thiếu dữ kiện. Trả về bản ghi đã lưu cùng tỉ lệ chấp nhận.
 */
async function recordDecision(db, { alertId, decision, by, reason, actionIds, scopeKey, snapshot, via = 'web' }) {
  const allowed = ['ACCEPTED', 'DISMISSED'];
  if (!alertId || !allowed.includes(decision)) {
    throw Object.assign(new Error(`Cần alertId và decision thuộc: ${allowed.join(', ')}`), { status: 400 });
  }
  if (decision === 'DISMISSED' && !reason) {
    throw Object.assign(new Error('Bỏ qua khuyến nghị thì phải nêu lý do'), { status: 400 });
  }
  // Ảnh chụp vấn đề lúc quyết định: cảnh báo có thể biến mất khỏi danh sách
  // sau vài ngày, nhưng nhật ký quyết định vẫn phải đọc được "đã quyết về cái gì"
  const snap = snapshot && typeof snapshot === 'object'
    ? { title: clip(snapshot.title), productName: clip(snapshot.productName), severity: clip(snapshot.severity, 20) }
    : null;
  const now = new Date();
  const followUpAt = decision === 'ACCEPTED' ? new Date(now.getTime() + 7 * 86400000) : null;
  await db.collection('recommendation_log').updateOne(
    { alertId },
    {
      $set: {
        alertId,
        decision,
        by: clip(by, 80) || 'admin',
        reason: clip(reason, 500) || null,
        ...(snap ? { snapshot: snap } : {}),
        // Ghi ở mức HÀNH ĐỘNG, không chỉ mức cảnh báo. Không có hai
        // trường này thì không quy được quyết định về mẫu hành động nào,
        // và vòng lặp học không có gì để học.
        actionIds: Array.isArray(actionIds) ? actionIds.filter((x) => typeof x === 'string').slice(0, 20) : [],
        scopeKey: typeof scopeKey === 'string' ? scopeKey : null,
        // Quyết từ đâu: trang web hay tin nhắn Zalo (quản gia)
        via: via === 'zalo' ? 'zalo' : 'web',
        at: now,
        // Chấp nhận thì hệ thống tạo việc cần làm và đặt lịch theo dõi lại
        followUpAt
      }
    },
    { upsert: true }
  );
  const all = await db.collection('recommendation_log').find({}, { projection: { decision: 1 } }).toArray();
  const accepted = all.filter((d) => d.decision === 'ACCEPTED').length;
  return {
    decision,
    acceptanceRate: all.length ? Number(((accepted / all.length) * 100).toFixed(1)) : 0,
    totalDecisions: all.length,
    followUpAt
  };
}

module.exports = {
  detectAlertsCached,
  buildRecommendationsCached,
  pendingAlerts,
  painPointsFor,
  buildInboxItems,
  recordDecision,
  SEVERITY_RANK
};
