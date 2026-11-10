import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useDataVersion } from '../lib/dataVersion';

/**
 * Một trang phản hồi, tìm và lọc ở máy chủ (GET /feedbacks?page&limit…).
 * Trước đây trình duyệt tải cả kho (11 MB với 14 nghìn phản hồi) rồi tự cắt.
 *
 * Giữ trang cũ trên màn hình trong lúc trang mới đang tải (không nháy trắng),
 * và bỏ kết quả của request đã lỗi thời khi người dùng gõ tìm nhanh.
 *
 * @param {{ time, source, product, q, sentiment, evidence, includeAll, page, limit }} query
 */
export default function useFeedbackPage({ time, source, product, q = '', sentiment, evidence, includeAll = false, page = 1, limit = 20 }) {
  const version = useDataVersion();
  const [data, setData] = useState({ items: [], total: 0, pages: 1, page: 1, counts: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const ctrl = new AbortController();
    setLoading(true);
    const params = { page, limit };
    if (time && time !== 'All') params.time = time;
    if (source && source !== 'All') params.source = source;
    if (product && product !== 'All') params.product = product;
    if (q) params.q = q;
    if (sentiment && sentiment !== 'All') params.sentiment = sentiment;
    if (evidence && evidence !== 'All') params.evidence = evidence;
    if (includeAll) params.include = 'all';

    axios
      .get('/feedbacks', { params, signal: ctrl.signal })
      .then((res) => {
        if (id !== seq.current) return;
        setData(res.data);
        setError(null);
      })
      .catch((e) => {
        if (id !== seq.current || axios.isCancel(e)) return;
        setError('Không tải được phản hồi. Kiểm tra kết nối rồi thử lại.');
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    return () => ctrl.abort();
  }, [time, source, product, q, sentiment, evidence, includeAll, page, limit, version]);

  return { ...data, loading, error };
}
