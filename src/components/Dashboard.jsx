import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import DashboardHeader from './dashboard/DashboardHeader';
import KpiZone from './dashboard/KpiZone';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentDonut from './dashboard/SentimentDonut';
import RisingIssues from './dashboard/RisingIssues';
import ActionCenter from './dashboard/ActionCenter';

/**
 * TỔNG QUAN — bố cục lưới 12 cột
 * ------------------------------------------------------------------
 *   [ Tiêu đề · đồng bộ · thông báo                              12 ]
 *   [ Bộ lọc — một hàng, áp cho mọi thứ bên dưới                 12 ]
 *   [ Tỷ lệ khiếu nại 4 ][ Mức độ nghiêm trọng 4 ][ 3 chỉ số phụ  4 ]
 *   [ Diễn biến cảm xúc (line)               8 ][ TRUNG TÂM      4 ]
 *   [ Phân bổ cảm xúc (donut) ][ Top tăng nhanh ][ HÀNH ĐỘNG       ]
 *   [ Bảng phản hồi chi tiết                                     12 ]
 *
 * Dưới 1280px, Trung tâm hành động nhảy lên ngay sau hàng chỉ số: trên
 * màn hình hẹp không có cột bên cạnh, và việc cần quyết phải đứng trước
 * số liệu mô tả.
 */

const nowLabel = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const { stats, sentiments, risks, alerts, trend, loading, error } = useDashboardData(timeFilter, sourceFilter, productFilter);

  // Mốc cập nhật đổi khi dữ liệu về xong, không phải mỗi lần render
  const [lastUpdated, setLastUpdated] = useState(nowLabel);
  useEffect(() => {
    if (!loading) setLastUpdated(nowLabel());
  }, [loading]);

  if (loading && !trend.length && !alerts.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={34} className="animate-spin text-accent" aria-hidden="true" />
          <h2 className="text-[1.05rem] font-semibold text-ink-mid">Đang tải dữ liệu…</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate">
      {/* Ánh sáng môi trường: thứ để lớp kính phía trên có cái mà làm mờ.
          Không có lớp này thì backdrop-filter trên nền đặc là vô hình. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-48 h-[30rem] w-[30rem] rounded-full bg-accent/15 blur-[120px]" />
        <div className="absolute -right-32 top-80 h-[28rem] w-[28rem] rounded-full bg-crit/10 blur-[140px]" />
        <div className="absolute bottom-40 left-1/4 h-[24rem] w-[24rem] rounded-full bg-pos/10 blur-[130px]" />
      </div>

      {/* Tải lại thì giữ khung cũ ở độ mờ thấp: không nháy, không nhảy bố cục */}
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <DashboardHeader risks={risks} loading={loading} error={error} lastUpdated={lastUpdated} />

        <FilterBar
          timeFilter={timeFilter} setTimeFilter={setTimeFilter}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          productFilter={productFilter} setProductFilter={setProductFilter}
        />

        <section aria-label="Chỉ số chính" className="cx mb-6">
          <KpiZone stats={stats} trend={trend} alerts={alerts} />
        </section>

        <div className="cx mb-6 grid grid-cols-12 items-start gap-6">
          <section aria-label="Hành động đề xuất" className="col-span-12 xl:order-2 xl:col-span-4">
            <ActionCenter alerts={alerts} />
          </section>

          <section aria-label="Báo cáo mô tả" className="col-span-12 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr] xl:order-1 xl:col-span-8">
            <div className="lg:col-[1/-1]">
              <SentimentTrendChart data={trend} />
            </div>
            <SentimentDonut data={sentiments} />
            <RisingIssues alerts={alerts} />
          </section>
        </div>

        <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} productFilter={productFilter} />
      </div>
    </div>
  );
};

export default Dashboard;
