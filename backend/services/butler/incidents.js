/**
 * SỰ CỐ VÀ BẢN TIN QUẢN GIA
 * ==================================================================
 * Gom các việc khẩn từ cảnh báo, hộp việc và trình tự thu thập; quyết định có
 * báo qua Zalo cho chủ shop không và dựng nội dung tin nhắn chữ thường.
 */

const { pendingAlerts, buildInboxItems } = require('../work_items');
const { healthNow } = require('../analysis_context');
const metrics = require('../metrics');
const { vnParts, inQuiet, severityWord, fromAlertSeverity, ago, viDate, viTime, stripTitlePrefix } = require('./text');

const SEV_RANK = { critical: 3, high: 2, medium: 1 };

/** Gom sự cố đang mở của một kho dữ liệu */
async function collectIncidents(db, workspace, ctx, { collectorStatus } = {}) {
  const out = [];
  let partial = false;

  // 1. Cảnh báo chưa ai quyết
  try {
    const alerts = await pendingAlerts(db, ctx);
    for (const a of alerts) {
      const title = a.title + (a.productName ? ` trên ${a.productName}` : '');
      out.push({
        key: `alert|${a.id}`,
        kind: 'alert',
        severity: fromAlertSeverity(a.severity),
        title,
        why: stripTitlePrefix(title, a.summary || ''),
        to: '/risk'
      });
    }
  } catch (e) {
    partial = true;
    console.warn('[QUẢN GIA] Bỏ qua phần cảnh báo khi gom sự cố:', e.message);
  }

  // 2. Việc mức cao và nghiêm trọng trong Hộp việc hôm nay
  try {
    const inbox = await buildInboxItems(db, workspace, ctx);
    for (const item of inbox) {
      if (item.severity !== 'critical' && item.severity !== 'high') continue;
      const isOrderAlert = Boolean(item.alertId && String(item.alertId).startsWith('Orders|'));
      out.push({
        key: isOrderAlert ? `alert|${item.alertId}` : `inbox|${item.id}`,
        kind: isOrderAlert ? 'alert' : (item.source || 'inbox'),
        severity: item.severity,
        title: item.title,
        why: stripTitlePrefix(item.title, item.why || ''),
        to: item.actions?.[0]?.to || '/dashboard'
      });
    }
  } catch (e) {
    partial = true;
    console.warn('[QUẢN GIA] Bỏ qua phần hộp việc khi gom sự cố:', e.message);
  }

  // 3. Lỗi tự thu thập của kho dữ liệu thật trong 24 giờ qua
  if (require('../tenants').isRealKey(workspace)) {
    try {
      const st = collectorStatus !== undefined
        ? collectorStatus
        : await require('../real_collector').collectorStatus(db);
      if (st && st.lastError && st.lastFinishedAt) {
        const finishedMs = new Date(st.lastFinishedAt).getTime();
        if (Number.isFinite(finishedMs) && Date.now() - finishedMs <= 24 * 3600 * 1000) {
          const { ymd } = vnParts(new Date(finishedMs));
          out.push({
            key: `collector|${ymd}`,
            kind: 'collector',
            severity: 'high',
            title: 'Lượt tự thu thập gần nhất bị lỗi',
            why: String(st.lastError).slice(0, 300),
            to: '/data'
          });
        }
      }
    } catch (e) {
      partial = true;
      console.warn('[QUẢN GIA] Bỏ qua phần trạng thái thu thập:', e.message);
    }
  }

  if (partial) out.partial = true;
  return out;
}

/**
 * Quyết định có gửi báo sự cố này cho tài khoản `link` lúc `now` hay không (hàm thuần).
 */
function shouldNotify(incident, link, now = new Date(), { ignoreQuiet = false } = {}) {
  if (!incident || !link || !link.chatId) return false;
  const nowDate = now instanceof Date ? now : new Date(now);
  const settings = link.settings || {};

  if (settings.muteUntil) {
    const muteMs = new Date(settings.muteUntil).getTime();
    if (Number.isFinite(muteMs) && muteMs > nowDate.getTime()) return false;
  }

  const incRank = SEV_RANK[incident.severity] || 1;
  const level = settings.notifyLevel || 'high';
  const minRank = level === 'critical' ? 3 : level === 'all' ? 1 : 2;
  if (incRank < minRank) return false;

  if (!ignoreQuiet) {
    const quietFrom = settings.quietFrom ?? 22;
    const quietTo = settings.quietTo ?? 7;
    const { hour } = vnParts(nowDate);
    if (inQuiet(hour, quietFrom, quietTo) && incident.severity !== 'critical') {
      return false;
    }
  }

  const notified = Array.isArray(incident.notified) ? incident.notified : [];
  const uid = String(link.userId || '');
  const already = notified.some(
    (n) => String(n.userId) === uid && (SEV_RANK[n.severity] || 1) >= incRank
  );
  if (already) return false;

  return true;
}

/** Dựng tin nhắn báo sự cố qua Zalo (hàm thuần) */
function buildAlertMessage(items, { workspaceLabel = 'Dữ liệu thật', appUrl = 'https://aisc-2026.vercel.app' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const baseUrl = String(appUrl || 'https://aisc-2026.vercel.app').replace(/\/+$/, '');

  if (items.length === 1) {
    const it = items[0];
    const sev = severityWord(it.severity);
    const why = String(it.why || '').trim().slice(0, 400);
    const to = String(it.to || '/risk');
    const url = `${baseUrl}${to.startsWith('/') ? to : '/' + to}`;
    return [
      `Quản gia Customer Radar, kho ${workspaceLabel}.`,
      `[${sev}] ${it.title}`,
      ...(why ? [why] : []),
      'Nhắn "xem 1" để xem kế hoạch, "duyệt 1" để chấp nhận.',
      url
    ].join('\n');
  }

  const shown = items.slice(0, 6);
  const rest = items.length - shown.length;
  const lines = [
    `Quản gia Customer Radar, kho ${workspaceLabel}: có ${items.length.toLocaleString('vi-VN')} việc mới.`,
    ...shown.map((it, idx) => `${idx + 1}. [${severityWord(it.severity)}] ${it.title}`),
    'Nhắn "xem <số>" để xem chi tiết, "việc" để xem cả danh sách.'
  ];
  if (rest > 0) {
    lines.push(`Còn ${rest.toLocaleString('vi-VN')} việc nữa, nhắn "việc" để xem.`);
  }
  return lines.join('\n');
}

/** Tóm tắt ngữ cảnh phân tích cho bản tin sáng / lệnh tình hình */
function summarizeContext(ctx) {
  if (!ctx) return {};
  const counted = Array.isArray(ctx.items) ? ctx.items.filter(metrics.isCountable).length : undefined;
  const h = healthNow(ctx);
  const health = Number.isFinite(h?.dataHealthScore) ? h.dataHealthScore : undefined;
  const freshAt = h?.lastSyncAt || ctx.lastSyncAt || ctx.ingestedAt || ctx.asOf || undefined;
  return { counted, health, freshAt };
}

const SHORT_PLATFORM_DIGEST = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  manual: 'Nhập tay',
  simulator: 'Mô phỏng'
};

/** Dựng bản tin sáng và câu trả lời cho lệnh "tình hình" (hàm thuần) */
function buildDigest({ workspaceLabel = 'Dữ liệu thật', ctxSummary = {}, incidents, tasks, todaySchedules, appUrl: _appUrl, now = new Date() } = {}) {
  // Bản tin gửi bù khi máy chủ ngủ qua giờ hẹn (Render) có thể tới lúc tối: gọi đúng buổi
  const vnHour = (now.getUTCHours() + 7) % 24;
  const part = vnHour < 11 ? 'sáng' : vnHour < 14 ? 'trưa' : vnHour < 18 ? 'chiều' : 'tối';
  const lines = [`Bản tin ${part} ${viDate(now)}, kho ${workspaceLabel}.`];

  const metricParts = [];
  if (Number.isFinite(ctxSummary?.counted)) {
    metricParts.push(`Phản hồi được tính: ${Number(ctxSummary.counted).toLocaleString('vi-VN')}.`);
  }
  if (Number.isFinite(ctxSummary?.health)) {
    metricParts.push(`Độ tin số liệu: ${Math.round(Number(ctxSummary.health)).toLocaleString('vi-VN')}/100.`);
  }
  if (metricParts.length > 0) {
    lines.push(metricParts.join(' '));
  }

  // Customer Radar giúp shop được bao nhiêu (value_summary.js)
  const v = ctxSummary?.value;
  if (v) {
    const vnd = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu đ` : `${Math.round(n / 1000).toLocaleString('vi-VN')} nghìn đ`);
    const parts = [];
    if (v.saved?.complaintsAvoided > 0) parts.push(`tránh được ${v.saved.complaintsAvoided.toLocaleString('vi-VN')} khiếu nại${v.saved.amount ? ` (khoảng ${vnd(v.saved.amount)})` : ''}`);
    if (v.live?.lostFlagged > 0) parts.push(`báo kịp ${vnd(v.live.lostFlagged)} lỡ vì hết hàng khi live`);
    if (v.atRisk?.amount > 0) parts.push(`doanh thu đang có rủi ro ${vnd(v.atRisk.amount)}`);
    if (parts.length) lines.push(`${v.windowDays || 30} ngày qua: ${parts.join(', ')}.`);
  }

  // Cảnh báo đơn hàng mới (B4: bản tin sáng Zalo thêm 1 dòng khi có cảnh báo đơn mới)
  const explicitOrderAlerts = Array.isArray(ctxSummary?.newOrderAlerts) ? ctxSummary.newOrderAlerts : null;
  const incidentOrderAlerts = explicitOrderAlerts || [
    ...(Array.isArray(incidents) ? incidents.filter((i) => String(i?.key || i?.id || '').includes('Orders|')) : []),
    ...(Array.isArray(tasks) ? tasks.filter((t) => String(t?.id || '').includes('Orders|')) : [])
  ];
  const uniqueOrderTitles = [...new Set(incidentOrderAlerts.map((x) => x.title).filter(Boolean))];
  if (uniqueOrderTitles.length === 1) {
    lines.push(`Đơn hàng có 1 cảnh báo mới: ${uniqueOrderTitles[0]}.`);
  } else if (uniqueOrderTitles.length > 1) {
    lines.push(`Đơn hàng có ${uniqueOrderTitles.length.toLocaleString('vi-VN')} cảnh báo mới, nổi bật: ${uniqueOrderTitles[0]}.`);
  }

  const taskVnd = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} tỉ đ` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu đ` : `${Math.round(n / 1000).toLocaleString('vi-VN')} nghìn đ`);
  if (Array.isArray(tasks) && tasks.length) {
    // Danh sách việc đánh số (engine.buildTaskItems, đã lưu cho lệnh "duyệt <số>")
    const top = tasks.slice(0, 3);
    lines.push(tasks.length > 3 ? `Việc hôm nay, ${tasks.length.toLocaleString('vi-VN')} việc, 3 việc gấp nhất:` : `Việc hôm nay, ${tasks.length.toLocaleString('vi-VN')} việc:`);
    for (const t of top) lines.push(`${t.n}. [${severityWord(t.severity)}] ${t.title}${t.riskVnd ? `, rủi ro ${taskVnd(t.riskVnd)}` : ''}`);
    const firstAlert = top.find((t) => t.kind === 'alert');
    lines.push(firstAlert
      ? `Nhắn "duyệt ${firstAlert.n}" để chấp nhận kế hoạch, "xem ${firstAlert.n}" để xem kế hoạch${tasks.length > 3 ? ', "việc" để xem đủ danh sách' : ''}.`
      : `Nhắn "việc" để xem đủ danh sách.`);
  } else if (Array.isArray(incidents)) {
    if (incidents.length === 0) {
      lines.push('Việc đang chờ: không có việc gấp.');
    } else {
      const crit = incidents.filter((i) => i.severity === 'critical').length;
      const high = incidents.filter((i) => i.severity === 'high').length;
      const med = incidents.filter((i) => i.severity === 'medium').length;
      const parts = [];
      if (crit > 0) parts.push(`${crit.toLocaleString('vi-VN')} nghiêm trọng`);
      if (high > 0) parts.push(`${high.toLocaleString('vi-VN')} cao`);
      if (med > 0) parts.push(`${med.toLocaleString('vi-VN')} chú ý`);
      if (parts.length > 0) {
        lines.push(`Việc đang chờ: ${parts.join(', ')}.`);
      }
    }
  }

  if (Array.isArray(todaySchedules) && todaySchedules.length > 0) {
    const todayYmd = vnParts(now).ymd;
    const sameDay = todaySchedules
      .filter((s) => s && (!s.status || s.status === 'scheduled') && s.startAt && vnParts(new Date(s.startAt)).ymd === todayYmd)
      .slice(0, 3);
    if (sameDay.length > 0) {
      const itemsText = sameDay
        .map((s) => {
          const plat = SHORT_PLATFORM_DIGEST[s.platform] || s.platformLabel || s.platform || 'Livestream';
          return `${viTime(s.startAt)} "${s.title}" trên ${plat}`;
        })
        .join('; ');
      lines.push(`Lịch live hôm nay: ${itemsText}.`);
    }
  }

  if (ctxSummary?.freshAt) {
    const d = new Date(ctxSummary.freshAt);
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Dữ liệu mới nhất: ${ago(d, now)}.`);
    }
  }

  if (!(Array.isArray(tasks) && tasks.length)) lines.push('Nhắn "việc" để xem danh sách.');
  return lines.join('\n');
}

module.exports = {
  SEV_RANK,
  collectIncidents,
  shouldNotify,
  buildAlertMessage,
  summarizeContext,
  buildDigest
};
