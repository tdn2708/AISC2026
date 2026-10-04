import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CircleAlert } from 'lucide-react';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { PageHeader, SectionLabel, Button } from './ui';
import KpiZone from './dashboard/KpiZone';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentDonut from './dashboard/SentimentDonut';
import RisingIssues from './dashboard/RisingIssues';
import ActionCenter from './dashboard/ActionCenter';

/**
 * TỔNG QUAN — bố cục lưới 12 cột
 * ------------------------------------------------------------------
 *   [ Tiêu đề trang · đồng bộ                                    12 ]
 *   [ Bộ lọc — một hàng, áp cho mọi thứ bên dưới                 12 ]
 *   [ 01 Tỷ lệ khiếu nại 4 ][ Mức độ nghiêm trọng 4 ][ 3 chỉ số phụ 4 ]
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
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const { stats, sentiments, alerts, trend, loading, error } = useDashboardData(timeFilter, sourceFilter, productFilter);

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
        meta={
          <span className="inline-flex items-center gap-2 text-xs text-ink-lo">
            <span className={`size-1.5 rounded-full ${error ? 'bg-crit' : loading ? 'bg-high animate-pulse' : 'bg-ok'}`} aria-hidden="true" />
            {error ? (
              <span className="inline-flex items-center gap-1 text-crit"><CircleAlert size={12} /> Không kết nối được máy chủ</span>
            ) : (
              <span className="font-mono">{loading ? 'đang cập nhật…' : `cập nhật lúc ${lastUpdated}`}</span>
            )}
          </span>
        }
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => navigate('/data')}>Đồng bộ dữ liệu</Button>}
      />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />

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
