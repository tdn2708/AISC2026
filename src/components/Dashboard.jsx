import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import KPICards from './KPICards';
import { TrendChart, CategoryPieChart } from './Charts';
import RiskAlerts from './RiskAlerts';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import axios from 'axios';

const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
  }, [timeFilter, sourceFilter]);
  
  const { stats, categories, sentiments, risks, trend, loading, error } = useDashboardData(timeFilter, sourceFilter);
  const [isScraping, setIsScraping] = useState(false);
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

  const handleScrape = async () => {
    try {
      setIsScraping(true);
      await axios.post('/scrape', {
        url: 'https://shopee.vn/iphone-15-pro-max'
      });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi cào dữ liệu: ' + err.message);
      setIsScraping(false);
    }
  };

  const isInitialLoad = loading && !categories.length;

  if (isScraping || isInitialLoad) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Loader2 className="animate-spin" size={48} color="var(--accent-cyan)" style={{ animation: 'spin 1s linear infinite' }} />
          <h2 className="text-gradient">Đang {isScraping ? 'cào dữ liệu & phân tích AI' : 'tải dữ liệu'}...</h2>
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
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Overview</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>CX Analytics & AI Insights</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error && <span style={{ color: 'var(--risk-critical)', fontSize: '0.875rem' }}>API Error</span>}
          
          <button 
            onClick={handleScrape}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))',
              color: 'white', border: 'none',
              padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)',
              fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
              fontSize: '0.85rem'
            }}
          >
            <RefreshCw size={16} />
            Live Sync (AI)
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
                width: '320px', padding: '0', zIndex: 50,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Notifications</h3>
                  {unreadCount > 0 && <span className="badge badge-critical">{unreadCount} New</span>}
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {risks && risks.length > 0 ? risks.map((risk) => {
                    const isRead = readNotifs.has(risk.id);
                    return (
                      <div key={risk.id || Math.random()} 
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
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>AI Alert: {risk.issue}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {risk.insight.substring(0, 80)}...
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Just now</div>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No new notifications
                    </div>
                  )}
                </div>
                <div onClick={markAllAsRead} style={{ padding: '0.75rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 500 }}>
                  Mark all as read
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
      />
      
      <KPICards stats={stats} />

      <div className="dashboard-grid">
        <div className="col-span-8">
          <TrendChart data={trend} />
        </div>
        <div className="col-span-4">
          <CategoryPieChart data={categories} />
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="col-span-8">
          <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} />
        </div>
        <div className="col-span-4">
          <RiskAlerts risks={risks} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
