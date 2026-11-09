import React, { useState, useEffect } from 'react';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { readStorage, writeStorage } from '../lib/storage';
import SummaryHeader from './dashboard/SummaryHeader';
import KpiZone from './dashboard/KpiZone';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentDonut from './dashboard/SentimentDonut';
import RisingIssues from './dashboard/RisingIssues';
import ActionCenter from './dashboard/ActionCenter';
import LiveDigest from './dashboard/LiveDigest';

/**
 * TỔNG QUAN — câu trả lời trước, số liệu sau
 * ------------------------------------------------------------------
 *   [ Câu tóm tắt: hôm nay có gì phải quyết (khối mực duy nhất)   12 ]
 *   [ Bộ lọc                                                      12 ]
 *   [ Khiếu nại ][ Tiêu cực ][ Tốc độ tăng ][ Sức khỏe dữ liệu       ]  mỗi thẻ có thanh bằng chứng
 *   [ Diễn biến cảm xúc                          8 ][ Việc cần quyết 4 ]
 *   [ Phân bổ cảm xúc ][ Vấn đề tăng nhanh         ][                 ]
 *   [ Phản hồi gần đây                                            12 ]
 *
 * Dưới 1280px, "Việc cần quyết" nhảy lên ngay sau hàng chỉ số: trên màn
 * hẹp không có cột bên cạnh, và việc cần quyết phải đứng trước số liệu mô tả.
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
      <SummaryHeader stats={stats} alerts={alerts} loading={loading} error={error} lastUpdated={lastUpdated} />

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
        <section aria-label="Chỉ số chính" className="mb-8">
          <KpiZone stats={stats} trend={trend} />
        </section>

        <div className="mb-8 grid grid-cols-12 items-start gap-6">
          <section aria-label="Việc cần quyết" className="col-span-12 xl:sticky xl:top-20 xl:order-2 xl:col-span-4">
            <ActionCenter alerts={alerts} />
            <LiveDigest />
          </section>

          <section aria-label="Diễn biến và phân bổ" className="col-span-12 xl:order-1 xl:col-span-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
              <div className="lg:col-[1/-1]">
                <SentimentTrendChart data={trend} />
              </div>
              <SentimentDonut data={sentiments} />
              <RisingIssues alerts={alerts} />
            </div>
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
