import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import KPICards from './KPICards';
import { TrendChart, CategoryPieChart } from './Charts';
import RiskAlerts from './RiskAlerts';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';

const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);
  
  const { stats, categories, risks, trend, loading, error } = useDashboardData(timeFilter, sourceFilter, productFilter);
  const [isScraping] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();

  const [readNotifs, setReadNotifs] = useState(() => {
    try {
      const saved = localStorage.getItem('readNotifs');
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error(e);
    }
    return new Set();
  });

  useEffect(() => {
    localStorage.setItem('readNotifs', JSON.stringify([...readNotifs]));
  }, [readNotifs]);

  const unreadCount = risks ? risks.filter(r => !readNotifs.has(r.id)).length : 0;

  const handleNotificationClick = (id) => {
    setReadNotifs(prev => new Set([...prev, id]));
    setShowNotifications(false);
    navigate('/risk');
  };

  const markAllAsRead = () => {
    if (risks) {
      const allIds = risks.map(r => r.id);
      setReadNotifs(new Set([...readNotifs, ...allIds]));
    }
  };

  /**
   * Nút đồng bộ trước đây gọi thẳng một đường dẫn Shopee viết cứng.
   * Việc chọn nguồn nào để thu thập thuộc về màn hình Nguồn dữ liệu,
   * nơi doanh nghiệp đã kết nối gian hàng của chính họ — đó mới là mô
   * hình first-party mà hệ thống dựa vào.
   */
  const handleSync = () => navigate('/data');

  // Mốc cập nhật: đổi mỗi khi dữ liệu về xong, không phải mỗi lần render
  const [lastUpdated, setLastUpdated] = useState(
    () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  );
  useEffect(() => {
    if (!loading) {
      setLastUpdated(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [loading]);

  const isInitialLoad = loading && !categories.length;

  if (isScraping || isInitialLoad) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Loader2 size={34} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-mid)' }}>Đang {isScraping ? 'thu thập và phân tích' : 'tải dữ liệu'}…</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Tổng quan</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--text-mid)', margin: 0, fontSize: '0.85rem' }}>
              Mọi con số được tính trên phản hồi đã qua tầng kiểm soát tin cậy dữ liệu
            </p>
            {/* Có nút đồng bộ tức là dữ liệu CÓ THỂ cũ, nhưng bản cũ
                không chỗ nào nói cũ bao lâu. Trên một sản phẩm phân
                tích, mốc thời gian là thông tin bắt buộc. */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.75rem', color: 'var(--text-lo)', whiteSpace: 'nowrap'
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: loading ? 'var(--sev-high)' : 'var(--sev-ok)'
              }} />
              <span className="data-num">
                {loading ? 'đang cập nhật…' : `cập nhật lúc ${lastUpdated}`}
              </span>
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error && <span style={{ color: 'var(--risk-critical)', fontSize: '0.875rem' }}>Lỗi kết nối API</span>}
          
          <button 
            onClick={handleSync}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'transparent',
              color: 'var(--text-mid)',
              border: '1px solid var(--border)',
              padding: '0.55rem 1rem', borderRadius: 'var(--r-ctrl)',
              fontWeight: 600, cursor: 'pointer',
              fontSize: '0.82rem',
              transition: 'background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)'
            }}
          >
            <RefreshCw size={15} />
            Đồng bộ dữ liệu
          </button>

          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ 
                background: showNotifications ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '50%', width: '40px', height: '40px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'var(--glass-border)', cursor: 'pointer',
                transition: 'background 0.2s'
              }}>
              <Bell size={18} color={showNotifications ? "white" : "var(--text-secondary)"} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '0', right: '0',
                  width: '10px', height: '10px',
                  background: 'var(--risk-critical)',
                  borderRadius: '50%',
                  border: '2px solid var(--bg-dark)'
                }}></span>
              )}
            </div>

            {showNotifications && (
              <div className="glass-panel animate-fade-in" style={{
                position: 'absolute', top: '120%', right: '0',
                width: '320px', padding: '0', zIndex: 200,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Thông báo</h3>
                  {unreadCount > 0 && <span className="badge badge-critical">{unreadCount} mới</span>}
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {risks && risks.length > 0 ? risks.map((risk, idx) => {
                    const isRead = readNotifs.has(risk.id);
                    return (
                      <div key={risk.id || `risk-${idx}`} 
                        onClick={() => handleNotificationClick(risk.id)}
                        style={{ 
                          padding: '1rem', 
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                          background: isRead ? 'transparent' : 'rgba(239, 68, 68, 0.08)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isRead ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = isRead ? 'transparent' : 'rgba(239, 68, 68, 0.08)'}
                      >
                        <div style={{ display: 'flex', gap: '0.75rem', opacity: isRead ? 0.6 : 1 }}>
                          {!isRead && <div style={{ width: '8px', height: '8px', background: 'var(--risk-critical)', borderRadius: '50%', marginTop: '6px' }}></div>}
                          <div style={{ paddingLeft: isRead ? '14px' : '0' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>Cảnh báo: {risk.issue}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {risk.insight.substring(0, 80)}...
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Vừa xong</div>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Không có thông báo mới
                    </div>
                  )}
                </div>
                <div onClick={markAllAsRead} style={{ padding: '0.75rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 500 }}>
                  Đánh dấu tất cả đã đọc
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />
      
      {/* ĐẢO TRỤC ƯU TIÊN.
          Bản cũ mở đầu bằng bốn thẻ chỉ số rồi chôn cảnh báo xuống tận
          đáy trang. Nhưng người mở dashboard mỗi sáng không hỏi "số của
          tôi là bao nhiêu", họ hỏi "hôm nay tôi có phải làm gì không".
          Việc cần quyết lên trước, số liệu theo sau. */}
      <div className="dashboard-grid">
        <div className="col-span-12">
          <RiskAlerts risks={risks} />
        </div>
      </div>

      <KPICards stats={stats} trend={trend} />

      <div className="dashboard-grid">
        <div className="col-span-8">
          <TrendChart data={trend} />
        </div>
        <div className="col-span-4">
          <CategoryPieChart data={categories} />
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="col-span-12">
          <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} productFilter={productFilter} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
