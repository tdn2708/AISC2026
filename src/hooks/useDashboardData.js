import { useState, useEffect } from 'react';
import axios from 'axios';
import { buildQuery } from '../lib/format';

/**
 * Dữ liệu trang Tổng quan.
 * - Cảnh báo được gắn kèm trạng thái quyết định (từ /recommendations), để
 *   Trung tâm hành động không mời "Chấp nhận" lại một việc đã quyết.
 * - Đổi bộ lọc nhanh liên tiếp thì phản hồi về muộn của lần trước bị bỏ,
 *   không ghi đè lên kết quả của lần mới nhất.
 */
export const useDashboardData = (timeFilter = 'All', sourceFilter = 'All', productFilter = 'All') => {
  const [stats, setStats] = useState(null);
  const [sentiments, setSentiments] = useState([]);
  const [trend, setTrend] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const q = buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter });

    setLoading(true);
    Promise.all([
      axios.get(`/stats${q}`),
      axios.get(`/sentiment${q}`),
      axios.get(`/trend${q}`),
      axios.get(`/alerts${q}`),
      axios.get(`/recommendations${q}`).catch(() => ({ data: null }))
    ])
      .then(([statsRes, sentRes, trendRes, alertsRes, recRes]) => {
        if (!alive) return;
        const status = new Map((recRes.data?.recommendations || []).map((r) => [r.alertId, r.status]));
        setStats(statsRes.data);
        setSentiments(sentRes.data);
        setTrend(trendRes.data);
        setAlerts((alertsRes.data?.alerts || []).map((a) => ({ ...a, decision: status.get(a.id) || 'PROPOSED' })));
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('Không tải được dữ liệu tổng quan:', err);
        setError(err.message);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [timeFilter, sourceFilter, productFilter]);

  return { stats, sentiments, alerts, trend, loading, error };
};
