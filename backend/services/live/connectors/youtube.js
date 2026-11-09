/**
 * KẾT NỐI YOUTUBE LIVE (API chính thức)
 * ==================================================================
 * YouTube Data API v3: lấy liveChatId của video đang phát, rồi đọc tin nhắn
 * trò chuyện theo đúng nhịp `pollingIntervalMillis` API yêu cầu. Cần biến môi
 * trường YOUTUBE_API_KEY (miễn phí, hạn mức 10.000 đơn vị/ngày; mỗi lượt đọc
 * tin nhắn tốn khoảng 5 đơn vị).
 */

const axios = require('axios');

const API = 'https://www.googleapis.com/youtube/v3';

function videoIdOf(target) {
  const s = String(target || '').trim();
  const m = s.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : /^[\w-]{11}$/.test(s) ? s : null;
}

function createYouTubeConnector({ target }) {
  const key = process.env.YOUTUBE_API_KEY;
  const videoId = videoIdOf(target);
  let stopped = false;
  let timer = null;
  let viewerTimer = null;

  async function liveDetails() {
    const r = await axios.get(`${API}/videos`, { params: { part: 'liveStreamingDetails,snippet', id: videoId, key }, timeout: 15000 });
    const v = r.data.items?.[0];
    if (!v) throw new Error('Không tìm thấy video');
    return v;
  }

  return {
    platform: 'youtube',
    target: videoId,
    async start(emit) {
      if (!key) throw new Error('Máy chủ chưa có YOUTUBE_API_KEY');
      if (!videoId) throw new Error('Liên kết YouTube không hợp lệ');
      const v = await liveDetails();
      const chatId = v.liveStreamingDetails?.activeLiveChatId;
      if (!chatId) throw new Error('Video này không đang phát live hoặc đã tắt trò chuyện');
      emit({ type: 'connected', info: { title: v.snippet?.title || null } });

      let pageToken;
      const poll = async () => {
        if (stopped) return;
        try {
          const r = await axios.get(`${API}/liveChat/messages`, {
            params: { liveChatId: chatId, part: 'snippet,authorDetails', maxResults: 2000, pageToken, key },
            timeout: 15000
          });
          pageToken = r.data.nextPageToken;
          for (const m of r.data.items || []) {
            const text = m.snippet?.displayMessage;
            if (!text) continue;
            emit({
              type: 'comment',
              platformMsgId: m.id,
              author: { handle: m.authorDetails?.channelId || null, nickname: m.authorDetails?.displayName || null, platformUserId: m.authorDetails?.channelId || null },
              text,
              ts: new Date(m.snippet.publishedAt)
            });
          }
          if (r.data.offlineAt) {
            stopped = true;
            emit({ type: 'end', reason: 'Phiên live đã kết thúc' });
            return;
          }
          timer = setTimeout(poll, Math.max(2000, Number(r.data.pollingIntervalMillis) || 5000));
        } catch (e) {
          const reason = e.response?.data?.error?.errors?.[0]?.reason;
          if (reason === 'liveChatEnded') {
            stopped = true;
            emit({ type: 'end', reason: 'Phiên live đã kết thúc' });
            return;
          }
          if (reason === 'quotaExceeded') {
            emit({ type: 'error', message: 'Hết hạn mức YouTube API trong ngày' });
            return;
          }
          timer = setTimeout(poll, 10000);
        }
      };
      poll();

      const viewers = async () => {
        if (stopped) return;
        try {
          const d = await liveDetails();
          const n = Number(d.liveStreamingDetails?.concurrentViewers);
          if (Number.isFinite(n)) emit({ type: 'viewers', count: n });
        } catch { /* bỏ qua một lần đọc lỗi */ }
        viewerTimer = setTimeout(viewers, 60000);
      };
      viewerTimer = setTimeout(viewers, 5000);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(viewerTimer);
    }
  };
}

module.exports = { createYouTubeConnector, videoIdOf };
