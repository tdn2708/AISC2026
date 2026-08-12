import React, { useState, useEffect } from 'react';
import { Loader2, Brain, CheckCircle, Zap, RefreshCw, AlertTriangle, TrendingUp, HelpCircle } from 'lucide-react';
import axios from 'axios';
import FilterBar from './FilterBar';

const Skeleton = ({ className, style }) => (
  <div className={`skeleton ${className}`} style={{ ...style }} />
);

const Analytics = () => {
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
  }, [timeFilter, sourceFilter]);

  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const handleRefresh = async (isAuto = false) => {
    try {
      if (!isAuto) setRefreshing(true);
      const res = await axios.post('/predict/refresh', {
        time: timeFilter,
        source: sourceFilter
      });
      setPrediction(res.data.data);
    } catch (err) {
      console.error(err);
      if (!isAuto) alert("Lỗi khi Refresh AI: " + err.message);
      else setError("Không thể tự động tạo báo cáo AI: " + err.message);
    } finally {
      if (!isAuto) setRefreshing(false);
      else setLoading(false);
    }
  };

  const fetchPrediction = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      const q = params.toString() ? `?${params.toString()}` : '';

      const res = await axios.get(`/predict${q}`);
      if (res.data.data) {
        setPrediction(res.data.data);
        setLoading(false);
      } else {
        // Auto-generate if no cache
        await handleRefresh(true);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrediction();
  }, [timeFilter, sourceFilter]);

  const renderSkeleton = () => (
    <div className="dashboard-grid">
      <div className="col-span-8 glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="flex-wrap-mobile" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Skeleton style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
          <Skeleton style={{ width: '200px', height: '28px', borderRadius: '4px' }} />
        </div>
        <Skeleton style={{ width: '100%', height: '120px', borderRadius: '8px' }} />
        <Skeleton style={{ width: '150px', height: '24px', borderRadius: '4px', marginTop: '1rem' }} />
        <Skeleton style={{ width: '100%', height: '60px', borderRadius: '8px' }} />
        <Skeleton style={{ width: '100%', height: '60px', borderRadius: '8px' }} />
      </div>
      <div className="col-span-4 glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Skeleton style={{ width: '150px', height: '24px', borderRadius: '4px' }} />
        <Skeleton style={{ width: '100%', height: '40px', borderRadius: '8px' }} />
        <Skeleton style={{ width: '100%', height: '40px', borderRadius: '8px' }} />
        <Skeleton style={{ width: '100%', height: '40px', borderRadius: '8px' }} />
      </div>
    </div>
  );

  return (
    <>
      <header className="flex-wrap-mobile" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Strategic Analytics</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {sourceFilter !== 'All' && <span className="badge badge-medium">{sourceFilter}</span>}
              {timeFilter !== 'All' && <span className="badge badge-medium">{timeFilter}</span>}
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            AI-Powered Forecasts & Recommendations {sourceFilter !== 'All' || timeFilter !== 'All' ? 'based on current dashboard filters' : ''}
          </p>
        </div>
        
        <button 
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(139, 92, 246, 0.1)',
            color: 'var(--accent-purple)', border: '1px solid rgba(139, 92, 246, 0.3)',
            padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)',
            fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            transition: 'all 0.2s ease'
          }}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? 'AI is analyzing...' : 'Refresh Forecast'}
        </button>
      </header>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
      />

      {error ? (
        <div style={{ color: 'var(--risk-critical)' }}>Lỗi: {error}</div>
      ) : loading ? (
        renderSkeleton()
      ) : !prediction ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)' }}>
          <HelpCircle size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Chưa có Báo cáo AI</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Vui lòng nhấn "Refresh Forecast" để AI bắt đầu phân tích dữ liệu.</p>
        </div>
      ) : (
        <div className="dashboard-grid animate-fade-in">
          
          <div className="col-span-8 glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="flex-wrap-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '40px', height: '40px', borderRadius: '10px', 
                  background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-indigo))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  <Brain size={20} color="white" />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Executive Summary</h3>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--risk-low)', lineHeight: 1 }}>92%</div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Confidence Score</div>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.02)', 
              border: '1px solid rgba(255, 255, 255, 0.05)', 
              padding: '1.5rem', 
              borderRadius: 'var(--radius-md)',
              lineHeight: 1.6,
              fontSize: '0.95rem',
              color: 'var(--text-primary)'
            }}>
              {prediction.aiReport.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: '0.5rem' }}>{line}</p>
              ))}
            </div>

            <h4 style={{ margin: '1rem 0 0 0', fontSize: '1.1rem', fontWeight: 600 }}>Recommended Action Plan</h4>
            <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
              <div style={{ position: 'absolute', top: '10px', bottom: '10px', left: '7px', width: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {prediction.actionableSteps.map((step, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', top: '4px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--bg-dark)', border: '2px solid var(--accent-cyan)', zIndex: 2 }}></div>
                    <div style={{ 
                      background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.15)',
                      padding: '1rem', borderRadius: 'var(--radius-sm)'
                    }}>
                      <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--accent-cyan)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Phase {idx + 1}</strong>
                      <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{step}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <AlertTriangle size={24} color="var(--risk-high)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Risk Matrix ({timeFilter === 'Today' ? '7 Days' : timeFilter === 'This Week' ? '4 Weeks' : timeFilter === 'This Month' ? '1 Quarter' : '30 Days'})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {prediction.topRisks.map((risk, idx) => {
                  let progress = 50;
                  let color = 'var(--risk-medium)';
                  if (risk.probability.toLowerCase().includes('cao')) { progress = 90; color = 'var(--risk-critical)'; }
                  else if (risk.probability.toLowerCase().includes('trung bình')) { progress = 50; color = 'var(--risk-high)'; }
                  else if (risk.probability.toLowerCase().includes('thấp')) { progress = 20; color = 'var(--risk-low)'; }

                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                        <span>{risk.name}</span>
                        <span style={{ color }}>{risk.probability}</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '99px' }}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

        </div>
      )}
    </>
  );
};

export default Analytics;
