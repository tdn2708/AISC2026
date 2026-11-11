import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDataVersion } from '../lib/dataVersion';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { readStorage, writeStorage } from '../lib/storage';
import SummaryHeader from './dashboard/SummaryHeader';
import StoreHealth from './dashboard/StoreHealth';
import TodayInbox, { buildTodo } from './dashboard/TodayInbox';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentDonut from './dashboard/SentimentDonut';
import RisingIssues from './dashboard/RisingIssues';
import LiveDigest from './dashboard/LiveDigest';

/**
 * TỔNG QUAN — việc cần làm trước, số liệu sau
 * ------------------------------------------------------------------
 *   [ Câu tóm tắt: hôm nay có mấy việc, việc nào gấp nhất            ]
 *   [ Bộ lọc                                                         ]
 *   [ Việc hôm nay: cảnh báo, livestream, đơn hàng, duyệt, dữ liệu   ]
 *   [ Cửa hàng đang thế nào: khiếu nại | không hài lòng | độ tin     ]
 *   [ Diễn biến cảm xúc                    8 ][ Phân bổ cảm xúc    4 ]
 *   [ Vấn đề đang tăng nhanh               6 ][ Livestream         6 ]
 *   [ Phản hồi gần đây                                               ]
 * Trên điện thoại, mọi khối xếp một cột theo đúng thứ tự trên: việc cần
 * làm luôn đứng trước số liệu mô tả.
 */

const nowLabel = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState(readStorage('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(readStorage('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(readStorage('productFilter') || 'All');

  useEffect(() => {
    writeStorage('timeFilter', timeFilter);
    writeStorage('sourceFilter', sourceFilter);
    writeStorage('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const { stats, sentiments, alerts, trend, loading, error } = useDashboardData(timeFilter, sourceFilter, productFilter);

  // Việc ngoài cảnh báo (livestream, đơn hàng, duyệt, dữ liệu); làm mới mỗi phút
  const [inbox, setInbox] = useState([]);
  const dataVersion = useDataVersion();
  useEffect(() => {
    let alive = true;
    const load = () => axios.get('/inbox').then((r) => alive && setInbox(r.data.items || [])).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [dataVersion]);
  const todo = buildTodo(alerts, inbox);

  // Sổ đối chiếu ở đầu trang: phễu của cả kho (thu thập, loại, được tính)
  const [ledger, setLedger] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get('/trust/health').then((r) => alive && setLedger(r.data)).catch(() => {});
    return () => { alive = false; };
  }, [dataVersion]);

  const hasFilter = timeFilter !== 'All' || sourceFilter !== 'All' || productFilter !== 'All';
  const clearFilters = () => {
    setTimeFilter('All');
    setSourceFilter('All');
    setProductFilter('All');
  };

  // Mốc cập nhật đổi khi dữ liệu về xong, không phải mỗi lần render
  const [lastUpdated, setLastUpdated] = useState(nowLabel);
  useEffect(() => {
    if (!loading) setLastUpdated(nowLabel());
  }, [loading]);

  return (
    <div className="cx pt-2">
      <SummaryHeader stats={stats} todo={todo} loading={loading} error={error} lastUpdated={lastUpdated} ledger={ledger} evidence={hasFilter ? null : stats?.evidence?.all} />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />

      {/* Bộ lọc được lưu qua các lần mở trang: lọc trúng một nhóm không có phản hồi
          nào được tính (vd. một sản phẩm vừa cào, toàn đánh giá cũ) thì mọi thẻ về
          0 — phải nói rõ là do bộ lọc */}
      {!loading && hasFilter && stats?.totalFeedbacks?.valid === 0 && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-high/40 bg-high/10 px-4 py-3 text-sm text-ink-hi">
          <span>
            Bộ lọc đang chọn không có phản hồi nào được tính vào chỉ số
            {stats.totalFeedbacks.value > 0 && ` (${stats.totalFeedbacks.value} phản hồi thô đều quá cũ hoặc bị Trust Layer loại)`}
            , nên các con số bên dưới đều trống.
          </span>
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-accent hover:underline">
            Xoá bộ lọc, xem toàn bộ
          </button>
        </div>
      )}

      {/* Tải lại thì giữ khung cũ ở độ mờ thấp: không nháy, không nhảy bố cục */}
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <TodayInbox alerts={alerts} items={inbox} loading={loading} />

        <StoreHealth stats={stats} trend={trend} />

        <div className="mb-8 grid grid-cols-12 items-start gap-6">
          <section aria-label="Diễn biến cảm xúc" className="col-span-12 xl:col-span-8">
            <SentimentTrendChart data={trend} />
          </section>
          <section aria-label="Phân bổ cảm xúc" className="col-span-12 md:col-span-6 xl:col-span-4">
            <SentimentDonut data={sentiments} />
          </section>
          <section aria-label="Vấn đề đang tăng nhanh" className="col-span-12 md:col-span-6 xl:col-span-6 xl:[&:has(+section:empty)]:col-span-12">
            <RisingIssues alerts={alerts} />
          </section>
          <section aria-label="Livestream" className="col-span-12 xl:col-span-6 [&>div]:mt-0">
            <LiveDigest />
          </section>
        </div>

        <section aria-label="Phản hồi gần đây">
          <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} productFilter={productFilter} />
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
