import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { getWorkspace } from '../lib/workspace';

/**
 * Theo dõi một phiên live qua luồng sự kiện (SSE).
 *   session  trạng thái phiên (đang live, đã kết thúc…), danh mục, chính sách
 *   stats    số liệu tổng hợp, hàng đợi cần trả lời, đơn chốt (máy chủ gửi lại ~1,5 giây/lần)
 *   feed     các bình luận mới nhất, mới nhất ở đầu, giữ tối đa FEED_MAX câu
 *
 * EventSource không gửi được header, nên kho dữ liệu đi bằng ?workspace=.
 * Mất kết nối thì EventSource tự nối lại; phiên đã kết thúc thì máy chủ gửi
 * trạng thái cuối rồi đóng luồng, hook không nối lại nữa.
 */

const FEED_MAX = 300;

export const liveUrl = (path, params = {}) => {
  const base = API_URL.replace(/\/$/, '');
  const qs = new URLSearchParams({ workspace: getWorkspace(), ...params }).toString();
  return `${base}/live${path}?${qs}`;
};

export default function useLiveSession(id, epoch = 0) {
  const [session, setSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [feed, setFeed] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (!id) return undefined;
    let closed = false;
    setSession(null);
    setStats(null);
    setFeed([]);
    setError(null);
    setConnection('connecting');

    // Lần đầu lấy bằng HTTP thường: hiện được ngay cả khi mạng chặn SSE
    axios.get(`/live/sessions/${id}`).then((r) => {
      if (closed) return;
      setSession((s) => s || r.data.session);
      setStats((s) => s || r.data.snapshot);
    }).catch((e) => {
      if (!closed) setError(e.response?.data?.error || 'Không tải được phiên live');
    });

    const es = new EventSource(liveUrl(`/sessions/${id}/stream`));
    esRef.current = es;
    es.onopen = () => setConnection('open');
    es.onerror = () => {
      if (closed) return;
      setConnection(es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
    };
    es.addEventListener('session', (e) => setSession(JSON.parse(e.data)));
    es.addEventListener('stats', (e) => setStats(JSON.parse(e.data)));
    es.addEventListener('backlog', (e) => {
      const items = JSON.parse(e.data);
      setFeed(items.slice().reverse().slice(0, FEED_MAX));
    });
    es.addEventListener('comment', (e) => {
      const c = JSON.parse(e.data);
      setFeed((f) => (f.length >= FEED_MAX ? [c, ...f.slice(0, FEED_MAX - 1)] : [c, ...f]));
    });
    es.addEventListener('closed', () => {
      setConnection('closed');
      es.close();
    });

    return () => {
      closed = true;
      es.close();
    };
  }, [id, epoch]);

  /** Phiên đã kết thúc không có luồng: nạp danh sách bình luận một lần */
  useEffect(() => {
    if (!id || connection !== 'closed' || feed.length) return;
    axios.get(`/live/sessions/${id}/comments`, { params: { limit: 200 } }).then((r) => setFeed(r.data.comments || [])).catch(() => {});
  }, [id, connection, feed.length]);

  const refresh = useCallback(async () => {
    if (!id) return;
    const r = await axios.get(`/live/sessions/${id}`);
    setSession(r.data.session);
    setStats(r.data.snapshot);
  }, [id]);

  /** Cập nhật một bình luận trong dòng (sau khi sửa nhãn) */
  const patchComment = useCallback((c) => {
    setFeed((f) => f.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
  }, []);

  return { session, setSession, stats, setStats, feed, connection, error, refresh, patchComment };
}
