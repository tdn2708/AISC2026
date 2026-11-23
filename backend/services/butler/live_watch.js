/**
 * VÒNG CANH NHANH LIVESTREAM VÀ LỊCH HẸN (live_watch.js)
 * ==================================================================
 * Chạy mỗi BUTLER_LIVE_WATCH_SEC giây (mặc định 60 giây), chỉ đọc MongoDB và
 * bộ nhớ hub (KHÔNG gọi getContext):
 *   1. Báo ngay khi phiên live bắt đầu.
 *   2. Gộp việc gấp trong phiên live gửi Zalo (tối đa 1 tin / 3 phút / phiên,
 *      dùng chung _id sự cố với vòng canh 5 phút để không báo trùng).
 *   3. Gửi báo cáo tóm tắt ngay khi phiên live kết thúc.
 *   4. Nhắc trước giờ hẹn live và nhắc khi quá giờ hẹn 10 phút chưa mở phiên.
 *   5. Báo sự cố kỹ thuật giữa phiên (mất kết nối, không ghi được, quá tải,
 *      bị ngắt) và báo khi đã ổn lại (live_tech.js).
 */

const crypto = require('crypto');
const hub = require('../live/hub');
const { money, pct } = require('../live/brief');
const { withTimeout } = require('../real_collector');
const { severityWord, vnTime, formatDurationWords, stripTitlePrefix } = require('./text');
const { SEV_RANK, shouldNotify } = require('./incidents');
const outbox = require('./outbox');
const { detectProblems, detectSystemProblems, TechTracker, buildTechText, buildTechOkText } = require('./live_tech');
const procHealth = require('../process_health');

const techTracker = new TechTracker();

const STATE_ID = 'butler_live_watch';
const LOCK_TTL_MS = 2 * 60 * 1000;
const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

const SHORT_PLATFORM = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  manual: 'Nhập tay',
  simulator: 'Mô phỏng'
};

function platformShortName(p) {
  return SHORT_PLATFORM[p] || (Object.hasOwn(hub.PLATFORMS, p) ? hub.PLATFORMS[p].label : String(p || 'Livestream'));
}

function appUrl(override) {
  return String(override || process.env.PUBLIC_APP_URL || 'https://aisc-2026.vercel.app').replace(/\/+$/, '');
}

/** Khóa sự cố của một việc gấp trong phiên live (khớp hệt vòng canh 5 phút) */
function liveIncidentKey(sessionId, actionId) {
  return `inbox|live|${sessionId}|${actionId}`;
}

/** _id bản ghi butler_incidents của một việc gấp trong phiên live (khớp hệt vòng canh 5 phút) */
function liveIncidentId(workspace, sessionId, actionId) {
  return `${workspace}|${liveIncidentKey(sessionId, actionId)}`;
}

/**
 * Lọc các lịch `scheduled` đến kỳ nhắc trước giờ (hàm thuần).
 * Điều kiện: remindBeforeMin > 0 và startAt - remindBeforeMin <= now < startAt.
 */
function dueReminders(schedules = [], now = new Date()) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  return (schedules || []).filter((s) => {
    if (!s || (s.status && s.status !== 'scheduled')) return false;
    const remindMin = Number(s.remindBeforeMin);
    if (!Number.isFinite(remindMin) || remindMin <= 0) return false;
    const startMs = new Date(s.startAt).getTime();
    if (Number.isNaN(startMs)) return false;
    const remindAtMs = startMs - remindMin * MIN_MS;
    return nowMs >= remindAtMs && nowMs < startMs;
  });
}

/**
 * Lọc các lịch `scheduled` đã quá giờ hẹn từ 10 đến 30 phút mà chưa mở phiên (hàm thuần).
 * Điều kiện: startAt + 10 phút <= now < startAt + 30 phút, chưa có sessionId,
 * và không có phiên nào trong kho được tạo trong [startAt - 60 phút, now].
 */
function lateSchedules(schedules = [], sessions = [], now = new Date()) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const sessionTimes = (sessions || [])
    .map((sess) => new Date(sess?.createdAt || sess?.startedAt).getTime())
    .filter((ms) => Number.isFinite(ms));

  return (schedules || []).filter((s) => {
    if (!s || (s.status && s.status !== 'scheduled')) return false;
    if (s.sessionId) return false;
    const startMs = new Date(s.startAt).getTime();
    if (Number.isNaN(startMs)) return false;
    if (nowMs < startMs + 10 * MIN_MS || nowMs >= startMs + 30 * MIN_MS) return false;
    const windowFrom = startMs - 60 * MIN_MS;
    const hasSession = sessionTimes.some((t) => t >= windowFrom && t <= nowMs);
    return !hasSession;
  });
}

/** Mẫu tin báo phiên live vừa bắt đầu (hàm thuần) */
function buildLiveStartText(session) {
  const title = String(session?.title || 'Livestream').trim();
  const plat = platformShortName(session?.platform);
  return `Phiên live "${title}" đã bắt đầu trên ${plat}. Quản gia canh mỗi phút, có việc gấp sẽ nhắn ngay. Nhắn "live" để xem tình hình.`;
}

/** Mẫu tin gộp các việc gấp trong phiên live đang chạy (hàm thuần) */
function buildLiveAlertText(session, items = [], { appUrl: customUrl } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const title = String(session?.title || 'Livestream').trim();
  const sid = String(session?._id || session?.id || '');
  const base = appUrl(customUrl);
  const shown = items.slice(0, 6);
  const lines = [
    `Việc gấp trong phiên "${title}":`,
    ...shown.map((it, idx) => {
      const t = String(it.title || '').trim().replace(/[.:]+$/, '');
      // Vòng canh 5 phút ghi lý do dạng 'Đang live "<tên>". ...'; tên phiên đã ở dòng đầu nên bỏ đoạn này.
      const rawWhy = String(it.why || '').trim().replace(/^Đang live "[^"]*"\.\s*/, '');
      const why = stripTitlePrefix(t, rawWhy).replace(/^[\s:.,;-]+/, '');
      const body = why ? `${t}: ${why}` : t;
      const dot = /[.!?]$/.test(body) ? '' : '.';
      return `${idx + 1}. [${severityWord(it.severity)}] ${body}${dot}`;
    }),
    `Mở phiên: ${base}/live${sid ? `?session=${sid}` : ''}`
  ];
  return lines.join('\n');
}

/** Mẫu tin báo cáo tóm tắt ngay sau khi phiên live kết thúc (hàm thuần) */
function buildLiveReportText(session, report, { appUrl: customUrl, durationMs } = {}) {
  const title = String(session?.title || report?.session?.title || 'Livestream').trim();
  const durMs = durationMs !== undefined ? durationMs : hub.liveDurationMs(session, null);
  const durWords = formatDurationWords(durMs);

  const lines = [
    durWords ? `Phiên "${title}" đã kết thúc sau ${durWords}.` : `Phiên "${title}" đã kết thúc.`
  ];

  const comments = report?.totals?.comments ?? session?.summary?.comments;
  const orders = report?.totals?.byIntent?.order ?? session?.summary?.byIntent?.order;
  const orderQty = report?.totals?.orderQuantity ?? session?.summary?.orderQuantity;
  const countParts = [];
  if (comments != null && Number.isFinite(Number(comments))) {
    countParts.push(`Bình luận: ${Math.round(Number(comments)).toLocaleString('vi-VN')}.`);
  }
  if (orders != null && Number.isFinite(Number(orders))) {
    const qtyPart =
      orderQty != null && Number.isFinite(Number(orderQty))
        ? ` (${Math.round(Number(orderQty)).toLocaleString('vi-VN')} sản phẩm)`
        : '';
    countParts.push(`Lượt chốt: ${Math.round(Number(orders)).toLocaleString('vi-VN')}${qtyPart}.`);
  }
  if (countParts.length > 0) {
    lines.push(countParts.join(' '));
  }

  const estRev = report?.revenue?.estimated ?? session?.summary?.revenue;
  const lostRev = report?.revenue?.lostTotal ?? session?.summary?.lostRevenue;
  // Phiên không khai giá (đọc TikTok/YouTube mà chưa nhập danh mục): doanh thu 0 là sai, nói rõ là chưa tính được
  const priced = (session?.products || []).some((p) => Number(p.salePrice ?? p.price) > 0);
  if (!priced && Number(estRev || 0) === 0 && Number(lostRev || 0) === 0) {
    lines.push('Doanh thu: chưa tính được vì danh mục phiên chưa có giá.');
  } else if (estRev != null && Number.isFinite(Number(estRev))) {
    const revParts = [`Doanh thu ước tính: ${money(Number(estRev))}.`];
    if (lostRev != null && Number.isFinite(Number(lostRev))) {
      revParts.push(`Lỡ vì hết hàng: ${money(Number(lostRev))}.`);
    }
    lines.push(revParts.join(' '));
  }

  // Phiên sau có thể giữ thêm bao nhiêu (report.opportunity)
  const opp = report?.opportunity;
  if (opp?.total > 0) {
    const parts = [];
    if (opp.stockout > 0) parts.push(`${money(opp.stockout)} lỡ vì hết hàng`);
    if (opp.missedQuestions?.value > 0) parts.push(`${money(opp.missedQuestions.value)} từ ${Math.round(opp.missedQuestions.people).toLocaleString('vi-VN')} người hỏi chưa được trả lời`);
    lines.push(`Phiên sau có thể giữ thêm khoảng ${money(opp.total)}: ${parts.join(', ')}.`);
  }

  const answeredShare = report?.response?.answeredShare ?? session?.summary?.answeredShare;
  const complaintsTotal = report?.complaints?.total ?? session?.summary?.byIntent?.complaint;
  const complaintsPushed = report?.complaints?.pushed;
  const qaParts = [];
  if (answeredShare != null && Number.isFinite(Number(answeredShare))) {
    qaParts.push(`Khách hỏi được trả lời: ${pct(Number(answeredShare))}.`);
  }
  if (complaintsTotal != null && Number.isFinite(Number(complaintsTotal))) {
    const pushedPart =
      complaintsPushed != null && Number.isFinite(Number(complaintsPushed))
        ? `, đã đưa vào hệ thống ${Math.round(Number(complaintsPushed)).toLocaleString('vi-VN')}`
        : '';
    qaParts.push(`Khiếu nại: ${Math.round(Number(complaintsTotal)).toLocaleString('vi-VN')}${pushedPart}.`);
  }
  if (qaParts.length > 0) {
    lines.push(qaParts.join(' '));
  }

  const products = Array.isArray(report?.products) ? report.products : [];
  const best = products.slice().sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0))[0];
  if (best && best.name && Number.isFinite(Number(best.quantity)) && Number(best.quantity) > 0) {
    lines.push(`Chốt nhiều nhất: ${best.name} (${Math.round(Number(best.quantity)).toLocaleString('vi-VN')} sản phẩm).`);
  }

  // Từ số liệu tới việc làm: ba việc ưu tiên nhất cho phiên sau (report.js đã xếp theo mức ưu tiên)
  const todo = Array.isArray(report?.todo) ? report.todo.filter((t) => t && t.title).slice(0, 3) : [];
  if (todo.length) {
    lines.push('Việc cho phiên sau:');
    todo.forEach((t, i) => lines.push(`${i + 1}. ${t.title}.`));
  }

  const sid = String(session?._id || session?.id || report?.session?.id || '');
  const base = appUrl(customUrl);
  lines.push(`Báo cáo đầy đủ: ${base}/live${sid ? `?session=${sid}` : ''}`);

  return lines.join('\n').slice(0, 1950);
}

/** Mẫu tin nhắc trước giờ hẹn live (hàm thuần) */
function buildReminderText(schedule, { appUrl: customUrl, now = new Date() } = {}) {
  const title = String(schedule?.title || 'Livestream').trim();
  const plat = platformShortName(schedule?.platform);
  const target = String(schedule?.target || '').trim();
  const targetPart =
    target && schedule?.platform !== 'simulator' && schedule?.platform !== 'manual'
      ? ` (${target})`
      : '';
  const nowDate = now instanceof Date ? now : new Date(now);
  const startDate = new Date(schedule?.startAt);
  const diffMin = Number.isFinite(startDate.getTime())
    ? Math.max(1, Math.round((startDate.getTime() - nowDate.getTime()) / MIN_MS))
    : Number(schedule?.remindBeforeMin) || 30;
  const base = appUrl(customUrl);
  return `Còn ${formatDurationWords(Math.max(1, diffMin) * 60000)} nữa tới phiên live "${title}" lúc ${vnTime(startDate, nowDate)} trên ${plat}${targetPart}. Mở trang Livestream để bắt đầu canh: ${base}/live`;
}

/** Mẫu tin nhắc khi quá giờ hẹn mà chưa mở phiên (hàm thuần) */
function buildLateText(schedule, { appUrl: customUrl } = {}) {
  const title = String(schedule?.title || 'Livestream').trim();
  const base = appUrl(customUrl);
  return `Đã quá giờ hẹn 10 phút mà phiên "${title}" chưa mở trên Customer Radar. Mở phiên để quản gia canh bình luận: ${base}/live`;
}

/** Mẫu tin trả lời lệnh `lịch` (hàm thuần) */
function buildScheduleListText(schedules = [], { workspaceLabel = 'Dữ liệu thật', appUrl: customUrl, now = new Date() } = {}) {
  const base = appUrl(customUrl);
  const list = (schedules || []).slice(0, 5);
  if (list.length === 0) {
    return `Chưa có phiên live nào được hẹn. Thêm lịch ở trang Livestream: ${base}/live`;
  }
  const lines = [
    `Lịch live sắp tới ở kho ${workspaceLabel}, ${list.length.toLocaleString('vi-VN')} phiên:`,
    ...list.map((s, idx) => {
      const plat = platformShortName(s.platform);
      const target = String(s.target || '').trim();
      const targetPart =
        target && s.platform !== 'simulator' && s.platform !== 'manual' ? ` (${target})` : '';
      return `${idx + 1}. ${vnTime(s.startAt, now)}: "${s.title}" trên ${plat}${targetPart}`;
    }),
    `Quản lý lịch: ${base}/live`
  ];
  return lines.join('\n');
}

const lockDocReady = new WeakSet();

async function runLiveTickInner({ authDb, workspaces, now = new Date(), onScheduleUpcoming }) {
  const t0 = Date.now();
  const meta = authDb.collection('meta');
  // Tạo bản ghi khóa một lần cho mỗi kết nối, không tốn thêm một lượt gọi Mongo ở mọi nhịp.
  if (!lockDocReady.has(authDb)) {
    await meta.updateOne({ _id: STATE_ID }, { $setOnInsert: { running: false } }, { upsert: true });
    lockDocReady.add(authDb);
  }

  const lock = await meta.findOneAndUpdate(
    {
      _id: STATE_ID,
      $or: [
        { running: { $ne: true } },
        { lockedAt: { $lt: new Date(now.getTime() - LOCK_TTL_MS) } }
      ]
    },
    { $set: { running: true, lockedAt: now } },
    { returnDocument: 'after' }
  );
  if (!lock) return { skipped: true, reason: 'locked' };

  let lastError = null;
  let hasUpcoming2h = false;

  try {
    const links = await authDb
      .collection('butler_links')
      .find({
        chatId: { $type: 'string' },
        'settings.live': { $ne: false }
      })
      .toArray();

    if (links.length === 0) {
      const elapsed = Date.now() - t0;
      await meta.updateOne(
        { _id: STATE_ID },
        {
          $set: {
            running: false,
            lastRunAt: now,
            lastMs: elapsed,
            lastError: null
          }
        }
      );
      if (typeof onScheduleUpcoming === 'function') onScheduleUpcoming(false);
      return { skipped: true, reason: 'no_links', lastMs: elapsed };
    }

    const neededWorkspaces = new Set(
      links.map((l) => (l.settings?.workspace === 'demo' ? 'demo' : 'real'))
    );

    const incCol = authDb.collection('butler_incidents');
    const wsData = {};
    const proc = procHealth.snapshot({ reset: true });
    const techProblems = [];

    for (const ws of neededWorkspaces) {
      const db = workspaces[ws];
      if (!db) continue;
      try {
        const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);
        const sixHoursAgo = new Date(now.getTime() - 6 * HOUR_MS);
        const schedFrom = new Date(now.getTime() - 30 * MIN_MS);
        const schedTo = new Date(now.getTime() + 125 * MIN_MS);

        const [recentSessions, endedSessions, schedules] = await Promise.all([
          db
            .collection('live_sessions')
            .find({
              status: { $in: ['connecting', 'live', 'reconnecting'] },
              createdAt: { $gte: twoDaysAgo }
            })
            .sort({ createdAt: -1 })
            .limit(15)
            .toArray(),
          db
            .collection('live_sessions')
            .find({
              status: 'ended',
              endedAt: { $gte: sixHoursAgo }
            })
            .sort({ endedAt: -1 })
            .limit(5)
            .toArray(),
          db
            .collection('live_schedule')
            .find({
              status: 'scheduled',
              startAt: { $gte: schedFrom, $lte: schedTo }
            })
            .sort({ startAt: 1 })
            .limit(30)
            .toArray()
        ]);

        // Sự cố kỹ thuật: phiên còn "đang live" mà không chạy trong tiến trình này, phiên lỗi kết nối gần đây
        const recentCut = now.getTime() - 30 * MIN_MS;
        const activeRef = (s) => new Date(s.lastActiveAt || s.createdAt || 0).getTime();
        const errored = (await db.collection('live_sessions')
          .find({ status: 'error', createdAt: { $gte: twoDaysAgo } })
          .sort({ createdAt: -1 }).limit(5).toArray())
          .filter((s) => activeRef(s) >= recentCut);

        if (schedules.some((s) => new Date(s.startAt).getTime() >= now.getTime())) {
          hasUpcoming2h = true;
        }

        const running = [];
        const orphans = [];
        for (const s of recentSessions) {
          const r = hub.runtimeFor(s._id, ws);
          if (r && r.status !== 'ended') {
            running.push({ session: s, runtime: r, snapshot: r.snapshot() });
          } else if (!r && activeRef(s) >= recentCut) {
            orphans.push(s);
          }
        }
        techProblems.push(...detectProblems({
          ws, running, orphans, errored, proc, now: now.getTime(), uptimeSec: process.uptime()
        }));

        // Upsert các việc gấp đang mở trong phiên live vào butler_incidents (cùng _id với vòng canh 5 phút)
        const activeIncidentIdsBySession = new Map();
        const bulkOps = [];

        for (const { session, snapshot } of running) {
          const sid = String(session._id);
          const urgent = (snapshot?.actions?.active || []).filter((a) => a.severity !== 'medium');
          const ids = [];
          for (const a of urgent) {
            const actionId = a.id || `${a.type}:${a.key || 'all'}`;
            const key = liveIncidentKey(sid, actionId);
            const docId = liveIncidentId(ws, sid, actionId);
            ids.push(docId);
            bulkOps.push({
              updateOne: {
                filter: { _id: docId },
                update: {
                  $set: {
                    workspace: ws,
                    key,
                    kind: 'live',
                    severity: a.severity === 'critical' ? 'critical' : 'high',
                    title: a.title,
                    why: a.why || '',
                    to: `/live?session=${sid}`,
                    lastSeenAt: now,
                    resolvedAt: null
                  },
                  $setOnInsert: {
                    firstSeenAt: now,
                    notified: []
                  }
                },
                upsert: true
              }
            });
          }
          activeIncidentIdsBySession.set(sid, ids);
        }

        if (bulkOps.length > 0) {
          await incCol.bulkWrite(bulkOps, { ordered: false });
        }

        const allIds = [...activeIncidentIdsBySession.values()].flat();
        const incDocs = allIds.length
          ? await incCol.find({ _id: { $in: allIds } }).toArray()
          : [];
        const incById = new Map(incDocs.map((d) => [String(d._id), d]));

        // Lịch quá giờ cần biết có phiên nào mở trong [startAt - 60 phút, now]
        const allRecentForLate = [
          ...recentSessions,
          ...endedSessions
        ];

        wsData[ws] = {
          running,
          ended: endedSessions,
          schedules,
          incById,
          activeIncidentIdsBySession,
          allRecentForLate
        };
      } catch (wsErr) {
        lastError = wsErr.message;
        console.warn(`[QUẢN GIA LIVE] Lỗi canh kho ${ws}:`, wsErr.message);
      }
    }

    const baseAppUrl = appUrl();
    techProblems.push(...detectSystemProblems({ errors: procHealth.recentErrors(5 * MIN_MS), proc, now: now.getTime() }));
    const tech = techTracker.update(techProblems, now.getTime());

    for (const link of links) {
      const ws = link.settings?.workspace === 'demo' ? 'demo' : 'real';
      const data = wsData[ws];
      if (!data) continue;

      if (link.settings?.muteUntil) {
        const muteMs = new Date(link.settings.muteUntil).getTime();
        if (Number.isFinite(muteMs) && muteMs > now.getTime()) continue;
      }

      const db = workspaces[ws];

      // Một truy vấn cho cả nhịp: tin nào trong các tin có thể gửi đã nằm trong outbox.
      // Không có bước này thì mỗi nhịp gọi Mongo 2 lượt cho mỗi tin đã gửi rồi.
      const candidateKeys = [];
      for (const { session } of data.running) candidateKeys.push(`live_start|${link.userId}|${session._id}`);
      for (const session of data.ended) candidateKeys.push(`live_end|${link.userId}|${session._id}`);
      for (const sched of data.schedules) {
        const iso = new Date(sched.startAt).toISOString();
        candidateKeys.push(`live_remind|${link.userId}|${sched._id}|${iso}`, `live_late|${link.userId}|${sched._id}|${iso}`);
      }
      const techFor = (list) => list.filter((p) => p.key.startsWith(`${ws}|`) || p.key.startsWith('sys|'));
      const techKey = (p, ok) => `${ok ? 'live_tech_ok' : 'live_tech'}|${link.userId}|${p.key}|${p.since}`;
      for (const p of techFor(tech.due)) candidateKeys.push(techKey(p, false));
      for (const p of techFor(tech.recovered)) candidateKeys.push(techKey(p, true));
      const sentKeys = candidateKeys.length
        ? new Set(
          (await authDb
            .collection('butler_outbox')
            .find({ dedupKey: { $in: candidateKeys } }, { projection: { dedupKey: 1 } })
            .toArray()).map((d) => d.dedupKey)
        )
        : new Set();

      // 0. Sự cố kỹ thuật giữa phiên: báo ngay, bỏ qua giờ yên lặng và nhịp 3 phút
      for (const p of techFor(tech.due)) {
        const key = techKey(p, false);
        if (sentKeys.has(key) || p.notified.has(String(link.userId))) {
          techTracker.markNotified(p.key, link.userId);
          continue;
        }
        await outbox.enqueue(authDb, { dedupKey: key, userId: link.userId, chatId: link.chatId, kind: 'live', text: buildTechText(p, { appUrl: baseAppUrl, now: now.getTime() }) });
        techTracker.markNotified(p.key, link.userId);
      }
      for (const p of techFor(tech.recovered)) {
        const key = techKey(p, true);
        if (!p.notified.has(String(link.userId)) || sentKeys.has(key)) continue;
        await outbox.enqueue(authDb, { dedupKey: key, userId: link.userId, chatId: link.chatId, kind: 'live', text: buildTechOkText(p, { now: now.getTime() }) });
      }

      // 1. Phiên bắt đầu trong 30 phút gần nhất (các phiên ghi song song, mỗi phiên một tin riêng)
      await Promise.all(data.running.map(async ({ session }) => {
        const startRef = session.startedAt || session.createdAt;
        const startMs = startRef ? new Date(startRef).getTime() : 0;
        if (sentKeys.has(`live_start|${link.userId}|${session._id}`)) return;
        if (startMs > 0 && now.getTime() - startMs <= 30 * MIN_MS) {
          const text = buildLiveStartText(session);
          await outbox.enqueue(authDb, {
            dedupKey: `live_start|${link.userId}|${session._id}`,
            userId: link.userId,
            chatId: link.chatId,
            kind: 'live',
            text
          });
        }
      }));

      // 2. Việc gấp trong phiên đang chạy (bỏ qua giờ yên lặng, tối đa 1 tin / 3 phút / phiên).
      // Các phiên độc lập nhau nên chạy song song; ba lượt ghi của một phiên cũng chạy song song.
      await Promise.all(data.running.map(async ({ session }) => {
        const sid = String(session._id);
        const lastAlertAt = link.liveLastAlertAt?.[sid]
          ? new Date(link.liveLastAlertAt[sid]).getTime()
          : 0;
        if (lastAlertAt > 0 && now.getTime() - lastAlertAt < 3 * MIN_MS) {
          return;
        }

        const docIds = data.activeIncidentIdsBySession.get(sid) || [];
        const candidates = docIds
          .map((id) => data.incById.get(id))
          .filter((inc) => inc && shouldNotify(inc, link, now, { ignoreQuiet: true }))
          .sort((a, b) => (SEV_RANK[b.severity] || 1) - (SEV_RANK[a.severity] || 1));

        if (candidates.length > 0) {
          const text = buildLiveAlertText(session, candidates, { appUrl: baseAppUrl });
          const sig = crypto
            .createHash('sha1')
            .update(candidates.map((i) => `${i._id}:${i.severity}:${i.cycle || 0}`).sort().join(','))
            .digest('hex');

          const notifyOps = candidates.map((inc) => ({
            updateOne: {
              filter: { _id: inc._id },
              update: {
                $push: {
                  notified: { userId: link.userId, severity: inc.severity, at: now }
                }
              }
            }
          }));
          await Promise.all([
            outbox.enqueue(authDb, {
              dedupKey: `live_alert|${link.userId}|${sig}`,
              userId: link.userId,
              chatId: link.chatId,
              kind: 'live',
              text
            }),
            authDb.collection('butler_links').updateOne(
              { _id: link._id },
              {
                $set: {
                  [`liveLastAlertAt.${sid}`]: now,
                  updatedAt: now
                }
              }
            ),
            incCol.bulkWrite(notifyOps, { ordered: false })
          ]);
        }
      }));

      // 3. Báo cáo cuối phiên (chỉ cho phiên kết thúc sau thời điểm tài khoản nối Zalo)
      const linkedAtMs = link.linkedAt ? new Date(link.linkedAt).getTime() : 0;
      for (const session of data.ended) {
        const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : 0;
        if (!endedAtMs || (linkedAtMs > 0 && endedAtMs <= linkedAtMs)) continue;

        const dedupKey = `live_end|${link.userId}|${session._id}`;
        if (sentKeys.has(dedupKey)) continue;

        try {
          const rep = await withTimeout(hub.reportFor(db, session, null), 15000, 'Báo cáo cuối phiên live');
          const text = buildLiveReportText(session, rep, { appUrl: baseAppUrl });
          await outbox.enqueue(authDb, {
            dedupKey,
            userId: link.userId,
            chatId: link.chatId,
            kind: 'live',
            text
          });
        } catch (repErr) {
          console.warn('[QUẢN GIA LIVE] Không tạo được báo cáo cuối phiên:', repErr.message);
        }
      }

      // 4. Nhắc trước giờ hẹn (bỏ qua giờ yên lặng)
      const reminders = dueReminders(data.schedules, now);
      for (const sched of reminders) {
        const startIso = new Date(sched.startAt).toISOString();
        if (sentKeys.has(`live_remind|${link.userId}|${sched._id}|${startIso}`)) continue;
        const text = buildReminderText(sched, { appUrl: baseAppUrl, now });
        await outbox.enqueue(authDb, {
          dedupKey: `live_remind|${link.userId}|${sched._id}|${startIso}`,
          userId: link.userId,
          chatId: link.chatId,
          kind: 'live',
          text
        });
      }

      // 5. Quá giờ hẹn 10 phút chưa mở phiên (bỏ qua giờ yên lặng)
      const lateList = lateSchedules(data.schedules, data.allRecentForLate, now);
      for (const sched of lateList) {
        const startIso = new Date(sched.startAt).toISOString();
        if (sentKeys.has(`live_late|${link.userId}|${sched._id}|${startIso}`)) continue;
        const text = buildLateText(sched, { appUrl: baseAppUrl });
        await outbox.enqueue(authDb, {
          dedupKey: `live_late|${link.userId}|${sched._id}|${startIso}`,
          userId: link.userId,
          chatId: link.chatId,
          kind: 'live',
          text
        });
      }
    }

    if (typeof onScheduleUpcoming === 'function') {
      onScheduleUpcoming(hasUpcoming2h);
    }

    const elapsed = Date.now() - t0;
    await meta.updateOne(
      { _id: STATE_ID },
      {
        $set: {
          running: false,
          lastRunAt: now,
          lastMs: elapsed,
          lastError
        }
      }
    );
    return { skipped: false, lastMs: elapsed, lastError, hasUpcoming2h };
  } catch (err) {
    const elapsed = Date.now() - t0;
    await meta
      .updateOne(
        { _id: STATE_ID },
        {
          $set: {
            running: false,
            lastRunAt: now,
            lastMs: elapsed,
            lastError: err.message
          }
        }
      )
      .catch(() => {});
    return { skipped: false, error: err.message, lastMs: elapsed };
  }
}

/** Một nhịp canh live bọc giới hạn thời gian 45 giây, không ném lỗi ra ngoài */
async function liveTick(args) {
  try {
    return await withTimeout(runLiveTickInner(args), 45000, 'Nhịp canh livestream');
  } catch (e) {
    console.warn('[QUẢN GIA LIVE] Nhịp canh quá hạn hoặc lỗi:', e.message);
    if (args?.authDb) {
      await args.authDb
        .collection('meta')
        .updateOne({ _id: STATE_ID }, { $set: { running: false, lastError: e.message } })
        .catch(() => {});
    }
    return { error: e.message };
  }
}

/** Đọc trạng thái vòng canh live cho /api/butler/status */
async function liveWatchStatus(authDb) {
  const m = (await authDb.collection('meta').findOne({ _id: STATE_ID })) || {};
  const secRaw = Number(process.env.BUTLER_LIVE_WATCH_SEC);
  const everySec = Number.isFinite(secRaw) ? Math.min(600, Math.max(5, Math.trunc(secRaw))) : 60;
  return {
    everySec,
    lastRunAt: m.lastRunAt || null,
    lastMs: m.lastMs ?? null,
    lastError: m.lastError || null
  };
}

/** Bật bộ hẹn giờ canh livestream định kỳ */
function startLiveWatch({ authDb, workspaces, onScheduleUpcoming }) {
  const secRaw = Number(process.env.BUTLER_LIVE_WATCH_SEC);
  const everySec = Number.isFinite(secRaw) ? Math.min(600, Math.max(5, Math.trunc(secRaw))) : 60;
  const firstDelayMs = Math.min(20000, everySec * 1000);

  const firstTimer = setTimeout(() => {
    liveTick({ authDb, workspaces, onScheduleUpcoming });
  }, firstDelayMs);
  if (firstTimer.unref) firstTimer.unref();

  const intervalTimer = setInterval(() => {
    liveTick({ authDb, workspaces, onScheduleUpcoming });
  }, everySec * 1000);
  if (intervalTimer.unref) intervalTimer.unref();

  return () => {
    clearTimeout(firstTimer);
    clearInterval(intervalTimer);
  };
}

module.exports = {
  liveTick,
  liveWatchStatus,
  startLiveWatch,
  liveIncidentKey,
  liveIncidentId,
  dueReminders,
  lateSchedules,
  buildLiveStartText,
  buildLiveAlertText,
  buildLiveReportText,
  buildReminderText,
  buildLateText,
  buildScheduleListText
};
