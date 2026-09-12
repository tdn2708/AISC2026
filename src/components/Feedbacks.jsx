import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Filter, Loader2, AlertCircle } from 'lucide-react';
import FilterBar from './FilterBar';

const Feedbacks = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters and Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSentiment, setFilterSentiment] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');

  // Global Filters
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (timeFilter !== 'All') params.append('time', timeFilter);
        if (sourceFilter !== 'All') params.append('source', sourceFilter);
        if (productFilter !== 'All') params.append('product', productFilter);
        
        const q = params.toString() ? `?${params.toString()}` : '';
        const res = await axios.get(`/feedbacks${q}`);
        setFeedbacks(res.data);
      } catch (err) {
        setError('Failed to fetch feedbacks. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchFeedbacks();
  }, [timeFilter, sourceFilter, productFilter]);

  const getSentimentBadge = (sentiment) => {
    switch (sentiment) {
      case 'Positive': return <span className="badge badge-low">Positive</span>;
      case 'Negative': return <span className="badge badge-critical">Negative</span>;
      default: return <span className="badge badge-medium">Neutral</span>;
    }
  };

  /** Hạng nguồn thay cho "severity" — xem ghi chú trong FeedbackTable.jsx */
  const getSeverityBadge = (trust) => {
    if (!trust) return <span className="cat-badge">—</span>;
    const color =
      trust.tierWeight >= 0.9 ? '#10b981' :
      trust.tierWeight >= 0.6 ? '#eab308' :
      trust.tierWeight >= 0.4 ? '#f97316' : '#ef4444';
    return (
      <span className="cat-badge" style={{ color, borderColor: color + '4d' }}
            title={`Trọng số tin cậy ${trust.weight}`}>
        {trust.tier}
      </span>
    );
  };

  const filteredFeedbacks = feedbacks.filter((fb) => {
    const matchesSearch = (fb.originalText && fb.originalText.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (fb.author && fb.author.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSentiment = filterSentiment === 'All' || fb.sentiment === filterSentiment;
    const matchesSeverity = filterSeverity === 'All' || (fb.trust && fb.trust.tier === filterSeverity);

    return matchesSearch && matchesSentiment && matchesSeverity;
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600 }}>Quản lý phản hồi</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>View, search, and filter all customer feedbacks analyzed by AI.</p>
      </div>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton={true}
      />

      <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)' }}>
        {/* Toolbar */}
        <div style={{ 
          padding: '1.25rem 1.5rem', 
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {/* Search Box */}
          <div style={{ 
            display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', 
            borderRadius: 'var(--radius-md)', padding: '0.5rem 1rem', border: '1px solid rgba(255,255,255,0.1)', flex: 1, minWidth: '250px' 
          }}>
            <Search size={18} color="var(--text-muted)" style={{ marginRight: '0.75rem' }} />
            <input 
              type="text" 
              placeholder="Search by keyword or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '0.9rem'
              }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: '0.25rem 0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Filter size={14} color="var(--text-muted)" />
              <select 
                value={filterSentiment} 
                onChange={(e) => setFilterSentiment(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem', padding: '0.25rem', cursor: 'pointer' }}
              >
                <option value="All" style={{ background: 'var(--bg-dark)' }}>Mọi sắc thái</option>
                <option value="Positive" style={{ background: 'var(--bg-dark)' }}>Positive</option>
                <option value="Neutral" style={{ background: 'var(--bg-dark)' }}>Neutral</option>
                <option value="Negative" style={{ background: 'var(--bg-dark)' }}>Negative</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: '0.25rem 0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <AlertCircle size={14} color="var(--text-muted)" />
              <select 
                value={filterSeverity} 
                onChange={(e) => setFilterSeverity(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem', padding: '0.25rem', cursor: 'pointer' }}
              >
                <option value="All" style={{ background: 'var(--bg-dark)' }}>Mọi mức độ</option>
                <option value="Critical" style={{ background: 'var(--bg-dark)' }}>Critical</option>
                <option value="High" style={{ background: 'var(--bg-dark)' }}>High</option>
                <option value="Medium" style={{ background: 'var(--bg-dark)' }}>Medium</option>
                <option value="Low" style={{ background: 'var(--bg-dark)' }}>Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--accent-purple)' }} />
              <p>Loading feedbacks...</p>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--risk-critical)', textAlign: 'center', padding: '3rem' }}>{error}</div>
          ) : filteredFeedbacks.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>No feedbacks found matching your filters.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '35%' }}>Feedback</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sentiment</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Độ tin cậy</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedbacks.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>@{item.author || `user_${idx}`}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{new Date(item.timestamp).toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>{item.originalText}</div>
                        {item.aiSummary && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                            ↳ AI Note: {item.aiSummary}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}><span className="cat-badge">{item.category}</span></td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>{getSentimentBadge(item.sentiment)}</td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>{getSeverityBadge(item.trust)}</td>
                      <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Footer */}
        {!loading && !error && filteredFeedbacks.length > 0 && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>{filteredFeedbacks.length} / {feedbacks.length}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Feedbacks;
