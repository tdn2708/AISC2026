/**
 * KẾT NỐI YOUTUBE LIVE KHÔNG CẦN KHÓA API
 * ==================================================================
 * Đọc khung trò chuyện công khai giống trình duyệt của một người xem:
 *   1. Tải trang https://www.youtube.com/live_chat?v=<id> để lấy khóa và phiên
 *      bản ứng dụng web, mấy chục tin nhắn gần nhất và mã đọc tiếp
 *      (continuation) của chế độ "Trò chuyện trực tiếp" (mọi tin nhắn, không
 *      chỉ "Tin nhắn hàng đầu" đã lọc).
 *   2. Gọi youtubei/v1/live_chat/get_live_chat với mã đó, nhận tin mới và mã
 *      kế tiếp, chờ đúng `timeoutMs` YouTube trả về rồi gọi lại.
 *   3. Mỗi 60 giây gọi youtubei/v1/updated_metadata để lấy số người đang xem
 *      và biết phiên còn phát hay không.
 *
 * Chỉ đọc dữ liệu ai mở video cũng thấy; không đăng nhập, không gửi tin.
 * Lỗi mạng thì thử lại giãn dần; 3 lần lỗi liền báo "đang nối lại", tin đầu
 * tiên đọc được sau đó báo "đã nối" lại. Mã đọc tiếp hỏng thì tải lại trang
 * live_chat để lấy mã mới (tin trùng bị hub bỏ qua theo id tin nhắn).
 */

const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.5', Cookie: 'CONSENT=YES+1' };
const VIEWER_EVERY_MS = 60000;
const FAIL_REPORT_AT = 3;
const FAIL_GIVE_UP = 30;
const POLL_MAX_MS = Math.max(1000, Number(process.env.YOUTUBE_POLL_MAX_MS) || 3000);

/** Chữ của một tin nhắn: ghép các đoạn chữ, biểu tượng cảm xúc lấy mã ngắn hoặc ký tự */
function runsText(message) {
  const runs = message?.runs;
  if (!Array.isArray(runs)) return message?.simpleText || '';
  return runs.map((r) => {
    if (typeof r.text === 'string') return r.text;
    const e = r.emoji;
    if (!e) return '';
    if (e.isCustomEmoji) return e.shortcuts?.[0] || '';
    return e.emojiId || e.shortcuts?.[0] || '';
  }).join('');
}

/**
 * Các tin nhắn có chữ trong một mảng `actions` của YouTube (tin thường và tin
 * Super Chat). Bỏ thông báo hệ thống, thành viên mới, sự kiện ghim.
 */
function parseChatActions(actions) {
  const out = [];
  for (const a of actions || []) {
    const item = a?.addChatItemAction?.item || a?.replayChatItemAction?.actions?.[0]?.addChatItemAction?.item;
    if (!item) continue;
    const r = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer;
    if (!r || !r.id) continue;
    const text = runsText(r.message).trim();
    if (!text) continue;
    const usec = Number(r.timestampUsec);
    const name = r.authorName?.simpleText || null;
    out.push({
      type: 'comment',
      platformMsgId: String(r.id),
      // Tên hiển thị kiểu mới của YouTube đã có "@" ở đầu; câu trả lời tự thêm "@" nên bỏ ở đây
      author: {
        handle: name ? name.replace(/^@+/, '') : null,
        nickname: name,
        platformUserId: r.authorExternalChannelId || null
      },
      text,
      ts: Number.isFinite(usec) && usec > 0 ? new Date(Math.floor(usec / 1000)) : new Date(),
      paid: Boolean(item.liveChatPaidMessageRenderer)
    });
  }
  return out;
}

/** Mã đọc tiếp và thời gian chờ trong `continuations[0]` */
function nextContinuation(continuations) {
  const c0 = continuations?.[0] || {};
  const d = c0.invalidationContinuationData || c0.timedContinuationData || c0.reloadContinuationData || c0.liveChatReplayContinuationData;
  if (!d?.continuation) return null;
  return { continuation: d.continuation, timeoutMs: Number(d.timeoutMs) || null };
}

/**
 * Đọc trang live_chat: khóa, phiên bản, tin gần nhất, mã đọc tiếp của chế độ
 * mọi tin nhắn. Trang không có khung trò chuyện thì trả `{ offline: lý do }`.
 */
function parseChatPage(html) {
  const s = String(html || '');
  const apiKey = s.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null;
  const clientVersion = s.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || s.match(/"clientVersion":"([^"]+)"/)?.[1] || null;
  const m = s.match(/(?:window\["ytInitialData"\]|var ytInitialData)\s*=\s*(\{.+?\});\s*<\/script>/s);
  // Không đọc được (trang lỗi, video bị gỡ, YouTube đổi giao diện): CHƯA chắc là hết live,
  // bộ kết nối hỏi lại updated_metadata rồi mới quyết định (parseError)
  const unreadable = { offline: 'Không đọc được trang trò chuyện của video này', parseError: true };
  if (!m) return unreadable;
  let data;
  try { data = JSON.parse(m[1]); } catch { return unreadable; }
  const lcr = data?.contents?.liveChatRenderer;
  if (!lcr) {
    const msg = runsText(data?.contents?.messageRenderer?.text);
    return { offline: msg ? `YouTube báo: ${msg}` : 'Video này không đang phát live hoặc đã tắt trò chuyện' };
  }
  if (lcr.isReplay) return { offline: 'Video này là bản phát lại, không còn phát live' };
  // Chế độ "Trò chuyện trực tiếp" là mục thứ hai của bộ chọn; không có thì dùng mã mặc định
  const items = lcr.header?.liveChatHeaderRenderer?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems || [];
  const all = items.find((it) => !it.selected && it.continuation?.reloadContinuationData?.continuation) || items[1];
  const allCont = all?.continuation?.reloadContinuationData?.continuation || null;
  const def = nextContinuation(lcr.continuations);
  return {
    apiKey,
    clientVersion,
    comments: parseChatActions(lcr.actions),
    continuation: allCont || def?.continuation || null,
    allMessages: Boolean(allCont),
    timeoutMs: def?.timeoutMs || null
  };
}

/** Số người đang xem và còn phát hay không, từ kết quả updated_metadata */
function parseViewers(data) {
  for (const a of data?.actions || []) {
    const r = a?.updateViewershipAction?.viewCount?.videoViewCountRenderer;
    if (!r) continue;
    const raw = r.originalViewCount ?? r.unlabeledViewCountValue?.simpleText ?? r.viewCount?.simpleText;
    const n = Number(String(raw ?? '').replace(/[^\d]/g, ''));
    // Hết live thì YouTube bỏ cờ isLive và trả tổng lượt xem thay cho số người đang xem
    const isLive = r.isLive === true;
    return { count: isLive && Number.isFinite(n) && /\d/.test(String(raw ?? '')) ? n : null, isLive };
  }
  return null;
}

function createYouTubePublicConnector({ videoId, http = axios }) {
  let stopped = false;
  let timer = null;
  let viewerTimer = null;
  let cfg = null;
  let continuation = null;
  let fails = 0;
  let reported = false;
  let notLive = 0;

  const context = () => ({ client: { clientName: 'WEB', clientVersion: cfg?.clientVersion || '2.20260101.00.00', hl: 'vi', gl: 'VN' } });
  const keyParam = () => (cfg?.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '');

  async function loadPage() {
    const r = await http.get(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, { headers: HEADERS, timeout: 20000, responseType: 'text' });
    const page = parseChatPage(r.data);
    if (page.offline && page.parseError) {
      // Trang đọc không được: video còn phát thì là lỗi tạm (thử lại), không thì phiên đã hết
      const v = await viewersOnce();
      if (v?.isLive) throw new Error(page.offline);
      const e = new Error(v ? 'Phiên live đã kết thúc' : 'Video không còn xem được (đã kết thúc, bị gỡ hoặc chuyển riêng tư)');
      e.offline = true;
      throw e;
    }
    if (page.offline) {
      const e = new Error(page.offline);
      e.offline = true;
      throw e;
    }
    if (!page.continuation) {
      const e = new Error('Video này không đang phát live hoặc đã tắt trò chuyện');
      e.offline = true;
      throw e;
    }
    cfg = { apiKey: page.apiKey, clientVersion: page.clientVersion };
    continuation = page.continuation;
    return page;
  }

  /** Số người xem và còn phát không; YouTube không trả gì là không còn phát; lỗi mạng thì null */
  async function viewersOnce() {
    try {
      const r = await http.post(
        `https://www.youtube.com/youtubei/v1/updated_metadata?prettyPrint=false${keyParam()}`,
        { context: context(), videoId },
        { headers: { ...HEADERS, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      return parseViewers(r.data) || { count: null, isLive: false };
    } catch {
      return null;
    }
  }

  async function title() {
    try {
      const r = await http.get('https://www.youtube.com/oembed', {
        params: { format: 'json', url: `https://www.youtube.com/watch?v=${videoId}` }, headers: HEADERS, timeout: 10000
      });
      return { title: r.data?.title || null, channel: r.data?.author_name || null };
    } catch {
      return { title: null, channel: null };
    }
  }

  return {
    platform: 'youtube',
    target: videoId,
    mode: 'public',
    async start(emit) {
      const page = await loadPage();
      const info = await title();
      emit({ type: 'connected', info: { ...info, source: 'public_chat', allMessages: page.allMessages } });
      for (const c of page.comments) emit(c);

      const poll = async () => {
        if (stopped) return;
        let wait = 5000;
        try {
          if (!continuation) await loadPage();
          const r = await http.post(
            `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false${keyParam()}`,
            { context: context(), continuation },
            { headers: { ...HEADERS, 'Content-Type': 'application/json' }, timeout: 20000 }
          );
          if (stopped) return;
          const lc = r.data?.continuationContents?.liveChatContinuation;
          if (!lc) {
            // Không còn khung trò chuyện: phiên đã tắt. Kiểm lại bằng số người xem cho chắc.
            const v = await viewersOnce();
            if (v && !v.isLive) {
              stopped = true;
              emit({ type: 'end', reason: 'Phiên live đã kết thúc' });
              return;
            }
            continuation = null;
            throw new Error('Mã đọc tiếp hết hạn');
          }
          for (const c of parseChatActions(lc.actions)) emit(c);
          const next = nextContinuation(lc.continuations);
          continuation = next?.continuation || null;
          if (reported) emit({ type: 'connected', info: null });
          fails = 0;
          reported = false;
          // YouTube gợi ý chờ tới 10 giây (trình duyệt còn được đẩy tin qua kênh riêng); đọc tối đa
          // POLL_MAX_MS một lần để tin tới trong vài giây (đo 23/11: chờ theo gợi ý thì trễ p95 10 giây)
          wait = Math.min(POLL_MAX_MS, Math.max(1000, next?.timeoutMs || POLL_MAX_MS));
        } catch (e) {
          if (stopped) return;
          if (e.offline) {
            // Đang đọc mà trang trò chuyện biến mất: chủ kênh đã tắt live (hoặc tắt trò chuyện)
            stopped = true;
            emit({ type: 'end', reason: `Phiên live đã kết thúc hoặc chủ kênh tắt trò chuyện (${e.message.replace(/^YouTube báo: /, '')})` });
            return;
          }
          fails += 1;
          if (e.response?.status === 400 || e.response?.status === 404) continuation = null;
          if (fails >= FAIL_GIVE_UP) {
            stopped = true;
            emit({ type: 'error', message: `Không đọc được trò chuyện YouTube sau ${fails} lần thử: ${String(e.message).slice(0, 120)}` });
            return;
          }
          if (fails === FAIL_REPORT_AT && !reported) {
            reported = true;
            emit({ type: 'reconnecting', attempt: fails, waitMs: 10000 });
          }
          wait = Math.min(30000, 2000 * 2 ** Math.min(fails - 1, 4));
        }
        timer = setTimeout(poll, wait);
      };


      const viewers = async () => {
        if (stopped) return;
        const v = await viewersOnce();
        if (stopped) return;
        if (v?.count != null) emit({ type: 'viewers', count: v.count });
        // Hai lần liền YouTube báo không còn phát: kết thúc, kể cả khi khung trò chuyện còn mở
        notLive = v && !v.isLive ? notLive + 1 : 0;
        if (notLive >= 2) {
          stopped = true;
          clearTimeout(timer);
          emit({ type: 'end', reason: 'Phiên live đã kết thúc' });
          return;
        }
        viewerTimer = setTimeout(viewers, VIEWER_EVERY_MS);
      };

      timer = setTimeout(poll, 1000);
      viewerTimer = setTimeout(viewers, 3000);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(viewerTimer);
    }
  };
}

module.exports = { createYouTubePublicConnector, parseChatActions, parseChatPage, parseViewers, nextContinuation, runsText };
