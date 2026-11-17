/**
 * SỰ CỐ KỸ THUẬT TRONG PHIÊN LIVE (báo Zalo)
 * ==================================================================
 * Khác việc gấp kinh doanh (coach.js), đây là sự cố làm hệ thống không chạy
 * đúng giữa giờ live, chủ shop cần biết ngay:
 *   connection   mất kết nối TikTok / YouTube quá 1 phút, hoặc kết nối lỗi
 *   write        không ghi được bình luận vào kho quá 30 giây, hoặc phải bỏ bớt
 *   overload     máy chủ khựng hoặc gần hết bộ nhớ trong lúc có phiên đang chạy
 *   interrupted  phiên còn đang live nhưng không còn chạy trong máy chủ
 *                (khởi động lại mà không tự nối lại được)
 *
 * Trạng thái giữ trong bộ nhớ tiến trình (cùng tiến trình với hub livestream).
 * Một sự cố chỉ báo một lần cho mỗi đợt (khóa theo thời điểm bắt đầu); hết sự
 * cố thì báo "đã ổn lại" cho đúng những người đã nhận tin báo lỗi.
 */

const SEC = 1000;
const THRESHOLD_MS = {
  connection: 60 * SEC,
  write: 30 * SEC,
  overload: 20 * SEC,
  interrupted: 0
};
const OVERLOAD_LOOP_MS = Number(process.env.LIVE_OVERLOAD_LOOP_MS || 500);
const OVERLOAD_RSS_MB = Number(process.env.LIVE_OVERLOAD_RSS_MB || 450);

const PLATFORM = { tiktok: 'TikTok', youtube: 'YouTube', manual: 'nguồn nhập', simulator: 'mô phỏng' };

/**
 * Sự cố đang có ở một kho, thuần (không đọc Mongo).
 * running: [{ session, runtime }]; orphans: phiên DB còn "đang live" mà không có runtime;
 * errored: phiên lỗi kết nối gần đây; proc: process_health.snapshot().
 */
function detectProblems({ ws, running = [], orphans = [], errored = [], proc = null, now = Date.now(), uptimeSec = Infinity }) {
  const out = [];
  for (const { session, runtime } of running) {
    const sid = String(session._id);
    const h = runtime.healthInfo ? runtime.healthInfo() : {};
    if (runtime.status === 'reconnecting' || runtime.status === 'error') {
      out.push({
        key: `${ws}|${sid}|connection`, kind: 'connection', session,
        since: new Date(h.statusSince || now).getTime(),
        detail: runtime.error || null
      });
    }
    if (h.writeFailures > 0 || h.dropped > 0) {
      out.push({
        key: `${ws}|${sid}|write`, kind: 'write', session,
        since: h.dropped > 0 ? 0 : new Date(h.failingSince || now).getTime(),
        detail: { pending: h.pendingWrites, dropped: h.dropped, error: h.lastWriteError }
      });
    }
  }
  for (const session of errored) {
    out.push({ key: `${ws}|${session._id}|connection`, kind: 'connection', session, since: 0, detail: session.error || null });
  }
  // Vừa khởi động lại thì chờ autoResume chạy xong rồi mới coi là bị ngắt
  if (uptimeSec >= 120) {
    for (const session of orphans) {
      out.push({ key: `${ws}|${session._id}|interrupted`, kind: 'interrupted', session, since: 0, detail: null });
    }
  }
  if (proc && running.length) {
    const loop = proc.loop?.p99Ms || 0;
    if (loop >= OVERLOAD_LOOP_MS || proc.rssMb >= OVERLOAD_RSS_MB) {
      out.push({ key: `${ws}|proc|overload`, kind: 'overload', session: running[0].session, since: now, detail: { loopMs: loop, rssMb: proc.rssMb, sessions: running.length } });
    }
  }
  return out;
}

/** Theo dõi đợt sự cố qua các nhịp canh */
class TechTracker {
  constructor() {
    this.state = new Map(); // key -> { problem, since, notified: Set<userId> }
  }

  /**
   * Cập nhật bằng danh sách sự cố của nhịp này.
   * @returns {{ due: object[], recovered: object[] }} due: đã quá ngưỡng; recovered: đã hết và từng báo
   */
  update(problems, now = Date.now()) {
    const seen = new Set();
    const due = [];
    for (const p of problems) {
      seen.add(p.key);
      let st = this.state.get(p.key);
      if (!st) {
        st = { since: p.since && p.since <= now ? p.since : now, notified: new Set() };
        this.state.set(p.key, st);
      }
      st.problem = p;
      if (now - st.since >= (THRESHOLD_MS[p.kind] ?? 0)) due.push({ ...p, since: st.since, notified: st.notified });
    }
    const recovered = [];
    for (const [key, st] of this.state) {
      if (seen.has(key)) continue;
      this.state.delete(key);
      if (st.notified.size) recovered.push({ ...st.problem, since: st.since, notified: st.notified });
    }
    return { due, recovered };
  }

  markNotified(key, userId) {
    this.state.get(key)?.notified.add(String(userId));
  }
}

const durWords = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} giây`;
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
};

function buildTechText(p, { appUrl, now = Date.now() } = {}) {
  const title = p.session?.title || 'phiên live';
  const link = p.session?._id ? `${appUrl}/live?session=${p.session._id}` : `${appUrl}/live`;
  const plat = PLATFORM[p.session?.platform] || 'nền tảng';
  const lasted = p.since ? durWords(now - p.since) : null;
  switch (p.kind) {
    case 'connection':
      return [
        `Sự cố phiên live "${title}": mất kết nối với ${plat}${lasted ? ` ${lasted} nay` : ''}.`,
        p.detail ? `Lỗi: ${String(p.detail).slice(0, 160)}.` : null,
        'Hệ thống đang tự nối lại; bình luận trong lúc mất kết nối có thể không về.',
        `Mở phiên: ${link}`
      ].filter(Boolean).join('\n');
    case 'write':
      return [
        `Sự cố phiên live "${title}": chưa ghi được bình luận vào kho${lasted && p.since ? ` ${lasted} nay` : ''}.`,
        p.detail?.pending ? `${Number(p.detail.pending).toLocaleString('vi-VN')} bình luận đang chờ ghi, hệ thống tự thử lại.` : null,
        p.detail?.dropped ? `Đã phải bỏ ${Number(p.detail.dropped).toLocaleString('vi-VN')} bình luận cũ nhất để máy chủ không hết bộ nhớ.` : null,
        'Bình luận mới vẫn hiện trên màn hình và vẫn được tính vào số liệu.',
        `Mở phiên: ${link}`
      ].filter(Boolean).join('\n');
    case 'overload':
      return [
        `Máy chủ đang quá tải khi có ${p.detail?.sessions || 1} phiên live chạy (khựng ${p.detail?.loopMs ?? '—'} ms, bộ nhớ ${p.detail?.rssMb ?? '—'} MB).`,
        'Màn hình live có thể chậm. Nên dừng các phiên mô phỏng hoặc phiên không cần.',
        `Mở trang Livestream: ${appUrl}/live`
      ].join('\n');
    case 'interrupted':
      return [
        `Phiên live "${title}" bị ngắt vì máy chủ khởi động lại và chưa tự nối lại được.`,
        `Mở phiên và bấm Kết nối lại: ${link}`
      ].join('\n');
    default:
      return `Sự cố phiên live "${title}". Mở phiên: ${link}`;
  }
}

function buildTechOkText(p, { now = Date.now() } = {}) {
  const title = p.session?.title || 'phiên live';
  const lasted = p.since ? ` sau ${durWords(now - p.since)}` : '';
  const what = {
    connection: `phiên "${title}" đã nối lại`,
    write: `phiên "${title}" đã ghi lại được bình luận`,
    overload: 'máy chủ đã hết quá tải',
    interrupted: `phiên "${title}" đã chạy lại`
  }[p.kind] || `phiên "${title}" đã bình thường`;
  return `Đã ổn lại: ${what}${lasted}.`;
}

module.exports = { detectProblems, TechTracker, buildTechText, buildTechOkText, THRESHOLD_MS };
