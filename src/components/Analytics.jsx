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
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const [prediction, setPrediction] = useState(null);
  // So phan hoi hop le ma du bao dua tren. Day la con so THAT do API
  // tra ve, dung de thay cho "92% diem tin cay" von duoc viet cung.
  const [basedOn, setBasedOn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const handleRefresh = async (isAuto = false) => {
    try {
      if (!isAuto) setRefreshing(true);
      const res = await axios.post('/predict/refresh', {
        time: timeFilter,
        source: sourceFilter,
        product: productFilter
      });
      setPrediction(res.data.data);
      setBasedOn(res.data.basedOnValidFeedbacks ?? null);
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
      if (productFilter !== 'All') params.append('product', productFilter);
      const q = params.toString() ? `?${params.toString()}` : '';

      const res = await axios.get(`/predict${q}`);
      if (res.data.data) {
        setPrediction(res.data.data);
        setBasedOn(res.data.basedOnValidFeedbacks ?? null);
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
  }, [timeFilter, sourceFilter, productFilter]);

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
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Phân tích chiến lược</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {sourceFilter !== 'All' && <span className="badge badge-medium">{sourceFilter}</span>}
              {timeFilter !== 'All' && <span className="badge badge-medium">{timeFilter}</span>}
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Dự báo và khuyến nghị do mô hình sinh{sourceFilter !== 'All' || timeFilter !== 'All' ? ', theo đúng bộ lọc đang áp dụng' : ''}
          </p>
        </div>
        
        <button 
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--accent-dim)',
            color: 'var(--accent-purple)', border: '1px solid var(--accent-dim)',
            padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)',
            fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out'
          }}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? 'Đang phân tích…' : 'Chạy lại dự báo'}
        </button>
      </header>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
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
                  width: '36px', height: '36px', borderRadius: 'var(--r-ctrl)',
                  background: 'var(--raised)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Brain size={17} color="var(--accent-hi)" />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tóm tắt điều hành</h3>
              </div>
              {/* Bản cũ hiển thị "92% Điểm tin cậy" viết cứng trong mã —
                  không có nguồn dữ liệu nào phía sau. Số minh hoạ trình bày
                  như số đo là kiểu sai nguy hiểm nhất trên một dashboard phân
                  tích. Thay bằng số phản hồi thật mà dự báo dựa trên. */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="data-num" style={{
                  fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-hi)', lineHeight: 1
                }}>
                  {basedOn != null ? basedOn.toLocaleString('vi-VN') : '—'}
                </div>
                <div style={{
                  fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'var(--text-lo)', marginTop: '3px'
                }}>
                  Phản hồi hợp lệ làm cơ sở
                </div>
              </div>
            </div>
            
            <div style={{
              background: 'var(--canvas)',
              border: '1px solid var(--border)',
              borderLeft: '2px solid var(--accent)',
              padding: '1.25rem 1.35rem',
              borderRadius: '0 var(--r-ctrl) var(--r-ctrl) 0',
              lineHeight: 1.7,
              fontSize: '0.92rem',
              color: 'var(--text-mid)'
            }}>
              {prediction.aiReport.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: '0.5rem' }}>{line}</p>
              ))}
            </div>

            <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 600 }}>Kế hoạch hành động đề xuất</h4>
            <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
              <div style={{ position: 'absolute', top: '10px', bottom: '10px', left: '7px', width: '1px', background: 'var(--border)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {prediction.actionableSteps.map((step, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', top: '5px', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--canvas)', border: '2px solid var(--accent)', zIndex: 2 }}></div>
                    <div style={{ 
                      background: 'var(--raised)', border: '1px solid var(--border)',
                      padding: '0.85rem 1rem', borderRadius: 'var(--r-ctrl)'
                    }}>
                      <strong className="data-num" style={{ display: 'block', marginBottom: '5px', color: 'var(--accent-hi)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Bước {idx + 1}</strong>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-hi)', lineHeight: 1.6 }}>{step}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Bản cũ đặt flex:1 lên panel này nên nó bị kéo cao bằng cột
                trái và để lại một khoảng trống lớn phía dưới. Nay panel ôm
                đúng nội dung của nó. */}
            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.25rem' }}>
                <AlertTriangle size={18} color="var(--sev-high)" style={{ flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Ma trận rủi ro · {timeFilter === 'Today' ? '7 ngày' : timeFilter === 'This Week' ? '4 tuần' : timeFilter === 'This Month' ? '1 quý' : '30 ngày'}
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
                      <div style={{ width: '100%', height: '6px', background: 'var(--raised)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 420ms var(--ease)' }}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Ranh giới giữa "số đo" và "dự báo" phải nói thành lời.
                Người đọc cần biết phần nào là dữ liệu và phần nào là suy
                đoán của mô hình, nếu không họ sẽ ra quyết định trên một
                câu văn được sinh ra. */}
            <div className="glass-panel">
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>Đọc trang này thế nào</h3>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-mid)', fontSize: '0.82rem', lineHeight: 1.65 }}>
                <li style={{ marginBottom: '0.5rem' }}>
                  Toàn bộ nội dung ở đây là <strong style={{ color: 'var(--text-hi)' }}>dự báo do mô hình sinh</strong>,
                  không phải số đo. Số đo nằm ở màn hình Tổng quan và Trung tâm cảnh báo.
                </li>
                <li style={{ marginBottom: '0.5rem' }}>
                  Dự báo dựa trên{' '}
                  <span className="data-num" style={{ color: 'var(--text-hi)' }}>
                    {basedOn != null ? basedOn.toLocaleString('vi-VN') : '—'}
                  </span>{' '}
                  phản hồi đã qua tầng kiểm soát tin cậy, theo đúng bộ lọc đang áp dụng.
                </li>
                <li>
                  Hệ thống không tự thực thi bất kỳ bước nào trong kế hoạch. Mọi hành động
                  đều cần người có thẩm quyền phê duyệt.
                </li>
              </ul>
            </div>
          </div>

        </div>
      )}
    </>
  );
};

export default Analytics;
