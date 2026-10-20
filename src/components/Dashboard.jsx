import React, { useState, useEffect } from 'react';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { readStorage, writeStorage } from '../lib/storage';
import { PageHeader, SectionLabel } from './ui';
import StatusStrip from './dashboard/StatusStrip';
import KpiZone from './dashboard/KpiZone';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentDonut from './dashboard/SentimentDonut';
import RisingIssues from './dashboard/RisingIssues';
import ActionCenter from './dashboard/ActionCenter';

/**
 * TỔNG QUAN — bố cục lưới 12 cột
 * ------------------------------------------------------------------
 *   [ Tiêu đề trang                                              12 ]
 *   [ DẢI TRẠNG THÁI (khối tối) — có việc gì cần làm không?      12 ]
 *   [ Bộ lọc — một hàng, áp cho mọi thứ bên dưới                 12 ]
 *   [ Tỷ lệ khiếu nại (tối) 5 ][ Mức độ nghiêm trọng 4 ][ 3 chỉ số phụ 3 ]
 *   [ 02 Diễn biến cảm xúc (line)             8 ][ 03 HÀNH ĐỘNG  4 ]
 *   [ Phân bổ cảm xúc (donut) ][ Top tăng nhanh ][                 ]
 *   [ 04 Bảng phản hồi gần đây                                   12 ]
 *
 * Dưới 1280px, Trung tâm hành động nhảy lên ngay sau hàng chỉ số: trên
 * màn hình hẹp không có cột bên cạnh, và việc cần quyết phải đứng trước
 * số liệu mô tả.
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
    <div className="cx">
      <PageHeader
        section="Giám sát"
        title="Tổng quan"
        accent="vận hành"
        subtitle="Mọi con số được tính trên phản hồi đã qua tầng kiểm soát tin cậy dữ liệu."
      />

      <StatusStrip stats={stats} alerts={alerts} loading={loading} error={error} lastUpdated={lastUpdated} />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />

      {/* Bộ lọc được lưu qua các lần mở trang: lọc trúng một nhóm không có phản hồi
          nào được tính (vd. một sản phẩm vừa cào, toàn đánh giá cũ) thì mọi thẻ về
          0 và dải trạng thái báo "an toàn" — phải nói rõ là do bộ lọc */}
      {!loading && hasFilter && stats?.totalFeedbacks?.valid === 0 && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-high/40 bg-high/10 px-4 py-3 text-sm text-ink-hi">
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
          <SectionLabel>Chỉ số thời gian thực</SectionLabel>
          <KpiZone stats={stats} trend={trend} alerts={alerts} />
        </section>

        <div className="mb-8 grid grid-cols-12 items-start gap-6">
          <section aria-label="Hành động đề xuất" className="col-span-12 xl:sticky xl:top-20 xl:order-2 xl:col-span-4">
            <ActionCenter alerts={alerts} />
          </section>

          <section aria-label="Báo cáo mô tả" className="col-span-12 xl:order-1 xl:col-span-8">
            <SectionLabel>Báo cáo mô tả</SectionLabel>
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
          <SectionLabel>Phản hồi gần đây</SectionLabel>
          <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} productFilter={productFilter} />
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
