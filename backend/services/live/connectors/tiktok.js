/**
 * KẾT NỐI TIKTOK LIVE
 * ==================================================================
 * Dùng thư viện tiktok-live-connector (không chính thức): kết nối vào phiên
 * live đang phát của một tài khoản qua tên người dùng, nhận bình luận, số
 * người xem, lượt thích. Chỉ ĐỌC dữ liệu công khai mà bất kỳ người xem nào
 * cũng thấy; không đăng nhập, không gửi bình luận thay shop.
 *
 * Việc ký yêu cầu đi qua máy chủ ký của Euler Stream. Không có khóa thì vẫn
 * chạy với hạn mức miễn phí; đặt TIKTOK_SIGN_API_KEY để có hạn mức cao hơn.
 *
 * Mất kết nối giữa chừng (mạng chập chờn, TikTok ngắt) thì tự nối lại tối đa
 * 5 lần, giãn dần thời gian chờ. Phiên kết thúc khi chủ live tắt live.
 */

const MAX_RETRIES = 5;

function cleanTarget(target) {
  const s = String(target || '').trim();
  const m = s.match(/tiktok\.com\/@([\w.]+)/i);
  return (m ? m[1] : s.replace(/^@/, '')).trim();
}

function createTikTokConnector({ target }) {
  const uniqueId = cleanTarget(target);
  let conn = null;
  let stopped = false;
  let retries = 0;
  let timer = null;

  async function open(emit) {
    const lib = await import('tiktok-live-connector');
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    conn = new TikTokLiveConnection(uniqueId, {
      signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined,
      processInitialData: true,
      enableExtendedGiftInfo: false
    });

    // Tên trường đổi theo phiên bản giao thức của TikTok (đo thực tế 11/2026,
    // proto v3): nội dung ở `content` (tài liệu cũ ghi `comment`), tên tài
    // khoản ở `displayId`, số người xem ở `total` dạng chuỗi. Đọc cả hai đời.
    conn.on(WebcastEvent.CHAT, (d) => {
      const text = d?.content ?? d?.comment;
      if (!text) return;
      const u = d.user || {};
      const uid = u.userId ?? u.id;
      const created = Number(d.common?.createTime);
      emit({
        type: 'comment',
        platformMsgId: String(d.common?.msgId ?? d.msgId ?? `${uid}-${d.common?.createTime}-${text}`),
        author: { handle: u.uniqueId || u.displayId || null, nickname: u.nickname || null, platformUserId: uid ? String(uid) : null },
        text,
        ts: Number.isFinite(created) && created > 0 ? new Date(created) : new Date()
      });
    });
    conn.on(WebcastEvent.ROOM_USER, (d) => {
      const n = Number(d?.viewerCount ?? d?.total ?? d?.totalUser);
      if (Number.isFinite(n) && n > 0) emit({ type: 'viewers', count: n });
    });
    conn.on(WebcastEvent.LIKE, (d) => {
      const n = Number(d?.totalLikeCount ?? d?.total);
      if (Number.isFinite(n) && n > 0) emit({ type: 'likes', total: n });
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      stopped = true;
      emit({ type: 'end', reason: 'Chủ phiên đã tắt live' });
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (stopped) return;
      scheduleReconnect(emit, 'Mất kết nối với TikTok');
    });
    conn.on(ControlEvent.ERROR, (e) => {
      console.warn('[LIVE/TikTok]', e?.info || e?.message || e);
    });

    const state = await conn.connect();
    retries = 0;
    emit({ type: 'connected', info: { roomId: state?.roomId || null, title: state?.roomInfo?.title || null } });
  }

  function scheduleReconnect(emit, why) {
    if (stopped) return;
    if (retries >= MAX_RETRIES) {
      emit({ type: 'error', message: `${why}. Đã thử nối lại ${MAX_RETRIES} lần không được.` });
      return;
    }
    retries += 1;
    const wait = Math.min(30000, 2000 * 2 ** (retries - 1));
    emit({ type: 'reconnecting', attempt: retries, waitMs: wait });
    timer = setTimeout(() => {
      open(emit).catch((e) => scheduleReconnect(emit, explain(e)));
    }, wait);
  }

  return {
    platform: 'tiktok',
    target: uniqueId,
    async start(emit) {
      if (!uniqueId) throw new Error('Thiếu tên tài khoản TikTok');
      try {
        await open(emit);
      } catch (e) {
        throw new Error(explain(e));
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      try { conn?.disconnect(); } catch { /* đã đóng */ }
    }
  };
}

/** Lỗi thư viện ra tiếng Việt cho người dùng */
function explain(e) {
  const name = e?.constructor?.name || e?.name || '';
  const msg = String(e?.message || e || '');
  if (/UserOffline|offline|isn't online|not.*live/i.test(name + msg)) return 'Tài khoản này đang không phát live';
  if (/DEVICE_BLOCKED/i.test(msg)) return 'TikTok đang tạm chặn máy chủ này vì kết nối quá nhiều lần; đợi 15-30 phút hoặc đặt TIKTOK_SIGN_API_KEY';
  if (/rate.?limit|429/i.test(msg)) return 'Máy chủ ký của TikTok đang giới hạn lượt; đặt TIKTOK_SIGN_API_KEY hoặc thử lại sau ít phút';
  if (/not found|404|user.*not.*exist/i.test(msg)) return 'Không tìm thấy tài khoản TikTok này';
  return `Không kết nối được TikTok: ${msg.slice(0, 160)}`;
}

module.exports = { createTikTokConnector, cleanTarget };
