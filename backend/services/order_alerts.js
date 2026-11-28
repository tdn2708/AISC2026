/**
 * CẢNH BÁO ĐƠN HÀNG & KẾ HOẠCH XỬ LÝ THEO PLAYBOOK (B4)
 * ==================================================================
 * Quy ước mã cảnh báo: `Orders|<nhóm>|<mã máy hoặc ngày sale>|<ngày>`
 * để `decision_match.findDecision` khớp phạm vi (bỏ hậu tố ngày) trong 7 ngày như mọi cảnh báo khác.
 *
 * Ba quy tắc kích hoạt (dựa trên kết quả kiểm định của order_insights.js):
 *   1. Mã máy có `cancelFlag` (tỉ lệ hủy cao hơn phần còn lại của shop, p < 0,01 sau BH, cỡ mẫu >= 30)
 *   2. Mã máy có `returnFlag` (tỉ lệ hoàn trả cao hơn phần còn lại của shop, p < 0,01 sau BH, cỡ mẫu >= 30)
 *   3. Ngày sale có đơn hủy chưa thanh toán từ 15% tổng đơn trong ngày đó
 */

const { ORDER_PLAYBOOKS } = require('./playbook_library');
const { analyzeOrders } = require('./order_insights');
const { findDecision } = require('./decision_match');

const fmtInt = (n) => Number(n ?? 0).toLocaleString('vi-VN');
const fmtPct = (r) => {
  if (r == null || !Number.isFinite(r)) return '—';
  const v = r * 100;
  const d = v > 0 && v < 1 ? 2 : 1;
  return `${v.toFixed(d).replace('.', ',')}%`;
};

const GROUP_TO_PLAYBOOK = {
  edit: 'CANCEL_EDIT',
  unpaid: 'CANCEL_UNPAID',
  lost: 'CANCEL_LOST',
  service: 'CANCEL_SERVICE',
  delivery: 'CANCEL_EDIT',
  other: 'CANCEL_EDIT'
};

function fillOrderTemplate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '—'));
}

/**
 * Sinh danh sách cảnh báo loại `orders` từ kết quả `analyzeOrders` (hàm thuần).
 */
function buildOrderAlerts(insights, { asOfDate = null } = {}) {
  if (!insights || !insights.hasOrders) return [];
  const dateTail = asOfDate || insights.summary?.dateRange?.toDay || new Date().toISOString().slice(0, 10);
  const out = [];

  for (const m of insights.byModel || []) {
    const codeLabel = m.modelCode ? `${m.modelCode} (${m.name})` : m.name;

    // 1. Mã máy hủy cao bất thường
    if (m.cancelFlag) {
      const pbKey = GROUP_TO_PLAYBOOK[m.topCancelGroup] || 'CANCEL_EDIT';
      const pb = ORDER_PLAYBOOKS[pbKey] || ORDER_PLAYBOOKS.CANCEL_EDIT;
      const cancelRateStr = fmtPct(m.cancelRate);
      const stepText = pbKey === 'CANCEL_UNPAID'
        ? fillOrderTemplate(pb.template, {
            scope: codeLabel,
            unpaidCount: fmtInt(m.topCancelGroupLines || m.cancelledLines),
            orderCount: fmtInt(m.totalLines),
            unpaidRate: cancelRateStr
          })
        : fillOrderTemplate(pb.template, {
            model: codeLabel,
            cancelledLines: fmtInt(m.cancelledLines),
            totalLines: fmtInt(m.totalLines),
            cancelRate: cancelRateStr
          });

      const severity = m.cancelRate >= 0.7 && m.totalLines >= 80 ? 'Critical' : 'High';
      out.push({
        id: `Orders|${pbKey}|${m.key}|${dateTail}`,
        type: 'orders',
        kind: 'cancel_high',
        playbookKey: pbKey,
        severity,
        severityScore: Number(Math.min(0.98, 0.55 + m.cancelRate * 0.4).toFixed(3)),
        modelKey: m.key,
        modelCode: m.modelCode || null,
        productName: m.name,
        owner: pb.owner,
        title: `Mã ${m.modelCode || m.name} bị hủy ${cancelRateStr} (${fmtInt(m.cancelledLines)}/${fmtInt(m.totalLines)} dòng)`,
        why: m.topCancelGroupLabel
          ? `Nhóm lý do lớn nhất: ${m.topCancelGroupLabel.toLowerCase()}. ${stepText}`
          : stepText,
        steps: [{ actionId: pb.id, kind: pb.kind, owner: pb.owner, effortDays: pb.effortDays, text: stepText }],
        statistics: {
          sampleSize: m.totalLines,
          cancelledLines: m.cancelledLines,
          wilson: m.cancelWilson,
          ...(m.cancelTest || {})
        },
        actions: [{ label: 'Xem phân tích đơn', to: '/analytics?tab=orders' }]
      });
    }

    // 2. Mã máy hoàn trả cao bất thường
    if (m.returnFlag) {
      const pb = ORDER_PLAYBOOKS.RETURN_HIGH;
      const returnRateStr = fmtPct(m.returnRate);
      const complaintNote = m.complaintCount > 0
        ? `${fmtInt(m.complaintCount)} lời chê cùng mã ${m.modelCode || m.name} trong kho phản hồi`
        : 'phản hồi của khách cùng dòng hàng';
      const stepText = fillOrderTemplate(pb.template, {
        model: codeLabel,
        returnLines: fmtInt(m.returnLines),
        activeLines: fmtInt(m.activeLines),
        returnRate: returnRateStr,
        complaintNote
      });

      const actions = [{ label: 'Xem phân tích đơn', to: '/analytics?tab=orders' }];
      if (m.complaintCount > 0) {
        actions.push({ label: 'Xem nguyên nhân cấp 3', to: '/analytics?tab=causes' });
      }

      out.push({
        id: `Orders|RETURN_HIGH|${m.key}|${dateTail}`,
        type: 'orders',
        kind: 'return_high',
        playbookKey: 'RETURN_HIGH',
        severity: 'High',
        severityScore: Number(Math.min(0.95, 0.6 + (m.returnRate || 0) * 1.5).toFixed(3)),
        modelKey: m.key,
        modelCode: m.modelCode || null,
        productName: m.name,
        owner: pb.owner,
        title: `Mã ${m.modelCode || m.name} có tỉ lệ trả hàng ${returnRateStr} (${fmtInt(m.returnLines)}/${fmtInt(m.activeLines)} đơn)`,
        why: stepText,
        steps: [{ actionId: pb.id, kind: pb.kind, owner: pb.owner, effortDays: pb.effortDays, text: stepText }],
        statistics: {
          sampleSize: m.activeLines,
          returnLines: m.returnLines,
          wilson: m.returnWilson,
          ...(m.returnTest || {})
        },
        actions
      });
    }
  }

  // 3. Ngày sale có hủy chưa thanh toán >= 15% tổng đơn trong ngày
  for (const s of insights.saleDays || []) {
    if ((s.unpaidShare || 0) < 0.15 || s.orders < 20) continue;
    const pb = ORDER_PLAYBOOKS.CANCEL_UNPAID;
    const unpaidRateStr = fmtPct(s.unpaidShare);
    const stepText = fillOrderTemplate(pb.template, {
      scope: `ngày sale ${s.label}`,
      unpaidCount: fmtInt(s.unpaidCancelled),
      orderCount: fmtInt(s.orders),
      unpaidRate: unpaidRateStr
    });
    const severity = s.unpaidShare >= 0.25 ? 'Critical' : 'High';
    out.push({
      id: `Orders|CANCEL_UNPAID|SALE_${s.date}|${s.date}`,
      type: 'orders',
      kind: 'sale_unpaid',
      playbookKey: 'CANCEL_UNPAID',
      severity,
      severityScore: Number(Math.min(0.96, 0.55 + s.unpaidShare).toFixed(3)),
      saleDate: s.date,
      owner: pb.owner,
      title: `Ngày sale ${s.label} có ${unpaidRateStr} đơn hủy chưa thanh toán (${fmtInt(s.unpaidCancelled)}/${fmtInt(s.orders)} đơn)`,
      why: stepText,
      steps: [{ actionId: pb.id, kind: pb.kind, owner: pb.owner, effortDays: pb.effortDays, text: stepText }],
      statistics: {
        sampleSize: s.orders,
        unpaidCancelled: s.unpaidCancelled,
        wilson: s.unpaidWilson
      },
      actions: [{ label: 'Xem kế hoạch ngày sale', to: '/analytics?tab=orders' }]
    });
  }

  return out.sort((a, b) => b.severityScore - a.severityScore);
}

/**
 * Đọc đơn hàng từ database của shop, sinh cảnh báo đơn và lọc bỏ các cảnh báo đã có quyết định còn hiệu lực.
 */
// Hộp việc và Quản gia gọi hàm này mỗi lần mở trang / mỗi nhịp: giữ danh sách cảnh báo theo
// số đơn + phiên bản ngữ cảnh, chỉ đọc lại cả sổ đơn khi một trong hai đổi
const alertMemo = new Map();
const ALERT_MEMO_TTL_MS = 10 * 60 * 1000;

async function pendingOrderAlerts(db, ctx, { nowMs = Date.now() } = {}) {
  try {
    const [txnCount, cancelCount, decisions] = await Promise.all([
      db.collection('transactions').estimatedDocumentCount(),
      db.collection('order_cancellations').estimatedDocumentCount().catch(() => 0),
      db.collection('recommendation_log').find({}, { projection: { alertId: 1, at: 1 } }).toArray().catch(() => [])
    ]);
    if (!txnCount && !cancelCount) return [];
    const key = `${txnCount}|${cancelCount}|${ctx?.computedAt || ''}`;
    const hit = alertMemo.get(db.databaseName);
    let alerts;
    if (hit && hit.key === key && nowMs - hit.at < ALERT_MEMO_TTL_MS) {
      alerts = hit.alerts;
    } else {
      const [txns, cancellations] = await Promise.all([
        db.collection('transactions').find({}, { projection: { _id: 0 } }).batchSize(5000).toArray(),
        db.collection('order_cancellations').find({}, { projection: { _id: 0 } }).batchSize(5000).toArray().catch(() => [])
      ]);
      if (!txns.length && !cancellations.length) return [];
      const insights = analyzeOrders({ transactions: txns, cancellations, feedbacks: ctx?.items || [], skipModel: true });
      alerts = buildOrderAlerts(insights);
      if (alertMemo.size > 20) alertMemo.clear();
      alertMemo.set(db.databaseName, { key, at: nowMs, alerts });
    }
    return alerts.filter((a) => !findDecision(a.id, decisions, nowMs));
  } catch {
    return [];
  }
}

module.exports = {
  buildOrderAlerts,
  pendingOrderAlerts
};
