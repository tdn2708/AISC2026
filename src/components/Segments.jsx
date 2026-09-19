import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Loader2, Users, TrendingUp, AlertTriangle, MessageSquare, Search, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const Segments = () => {
  const [data, setData] = useState({ promoters: [], atRisk: [], passives: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState('atRisk');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchSegments = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/segments');
        setData(res.data);
      } catch (err) {
        setError('Failed to fetch segment data.');
      } finally {
        setLoading(false);
      }
    };
    fetchSegments();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSegment, searchTerm, dateRange, customStartDate, customEndDate]);

  const filteredList = useMemo(() => {
    let list = data[selectedSegment] || [];
    
    if (searchTerm) {
      list = list.filter(user => user.author.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    if (dateRange === 'custom') {
      const start = customStartDate ? new Date(customStartDate) : null;
      const end = customEndDate ? new Date(customEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      
      list = list.filter(user => {
        const d = new Date(user.latestFeedback);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    } else if (dateRange !== 'all') {
      const now = new Date();
      let days = 0;
      if (dateRange === '7days') days = 7;
      if (dateRange === '30days') days = 30;
      if (dateRange === '90days') days = 90;
      
      const cutoffDate = new Date(now.setDate(now.getDate() - days));
      list = list.filter(user => new Date(user.latestFeedback) >= cutoffDate);
    }
    
    return list;
  }, [data, selectedSegment, searchTerm, dateRange, customStartDate, customEndDate]);

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);
  
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage]);

  const getActiveList = () => paginatedList;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  const SegmentCard = ({ title, count, icon, type, isActive, onClick, description }) => {
    let colorClass = '';
    let bgColor = '';
    if (type === 'promoter') { colorClass = 'var(--accent-cyan)'; bgColor = 'rgba(6, 182, 212, 0.1)'; }
    if (type === 'risk') { colorClass = '#ef4444'; bgColor = 'rgba(239, 68, 68, 0.1)'; }
    if (type === 'passive') { colorClass = '#eab308'; bgColor = 'rgba(234, 179, 8, 0.1)'; }

    return (
      <div 
        className="glass-panel" 
        onClick={onClick}
        style={{ 
          cursor: 'pointer', 
          border: isActive ? `1px solid ${colorClass}` : '1px solid rgba(255,255,255,0.05)',
          background: isActive ? bgColor : 'var(--bg-card)',
          transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
          flex: 1
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>{title}</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{count}</div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colorClass }}>
            {icon}
          </div>
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {description}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600 }}>Customer Segments</h1>

      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--accent-purple)' }} />
          <p>Analyzing customer segments...</p>
        </div>
      ) : error ? (
        <div style={{ color: 'var(--risk-critical)', textAlign: 'center', padding: '3rem' }}>{error}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <SegmentCard 
              title="At-Risk Customers" 
              count={data.atRisk.length} 
              icon={<AlertTriangle size={20} />} 
              type="risk"
              isActive={selectedSegment === 'atRisk'}
              onClick={() => setSelectedSegment('atRisk')}
              description="Customers who submitted critical or negative feedbacks. Needs immediate action."
            />
            <SegmentCard 
              title="Loyal Promoters" 
              count={data.promoters.length} 
              icon={<TrendingUp size={20} />} 
              type="promoter"
              isActive={selectedSegment === 'promoters'}
              onClick={() => setSelectedSegment('promoters')}
              description="Highly satisfied customers with mostly positive sentiments."
            />
            <SegmentCard 
              title="Passive Users" 
              count={data.passives.length} 
              icon={<Users size={20} />} 
              type="passive"
              isActive={selectedSegment === 'passives'}
              onClick={() => setSelectedSegment('passives')}
              description="Neutral or mixed sentiments. Potential for upselling or churn."
            />
          </div>

          <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                    {selectedSegment === 'atRisk' && 'At-Risk Customers'}
                    {selectedSegment === 'promoters' && 'Loyal Promoters'}
                    {selectedSegment === 'passives' && 'Passive Users'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, marginTop: '0.25rem' }}>
                    List of customers categorized into this segment.
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm tên..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ 
                        background: 'rgba(0,0,0,0.2)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        padding: '0.5rem 1rem 0.5rem 2.2rem', 
                        borderRadius: '6px', 
                        color: 'var(--text-primary)',
                        outline: 'none',
                        fontSize: '0.9rem'
                      }} 
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Calendar size={16} color="var(--text-muted)" style={{ marginLeft: '0.5rem' }} />
                    <select 
                      value={dateRange} 
                      onChange={(e) => setDateRange(e.target.value)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--text-primary)',
                        padding: '0.25rem 0.5rem',
                        outline: 'none',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all" style={{ background: '#1a1a2e' }}>Tất cả thời gian</option>
                      <option value="7days" style={{ background: '#1a1a2e' }}>7 ngày qua</option>
                      <option value="30days" style={{ background: '#1a1a2e' }}>30 ngày qua</option>
                      <option value="90days" style={{ background: '#1a1a2e' }}>90 ngày qua</option>
                      <option value="custom" style={{ background: '#1a1a2e' }}>Tùy chọn...</option>
                    </select>
                  </div>
                  {dateRange === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <input 
                        type="date" 
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem', colorScheme: 'dark' }} 
                        title="Từ ngày"
                      />
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                      <input 
                        type="date" 
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem', colorScheme: 'dark' }} 
                        title="Đến ngày"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto', flex: 1 }}>
              {getActiveList().length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>No customers match the criteria.</div>
              ) : (
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Profile</th>
                      <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Feedbacks</th>
                      <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sentiment Split</th>
                      <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getActiveList().map((user, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>
                              {user.author.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>@{user.author}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {user.critical > 0 && <span style={{ color: '#ef4444' }}>Critical History</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MessageSquare size={16} color="var(--text-secondary)" />
                            <span style={{ fontWeight: 500 }}>{user.total}</span>
                          </div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {user.positive > 0 && <span className="badge badge-low" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{user.positive} Pos</span>}
                            {user.neutral > 0 && <span className="badge badge-medium" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{user.neutral} Neu</span>}
                            {user.negative > 0 && <span className="badge badge-critical" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{user.negative} Neg</span>}
                          </div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {new Date(user.latestFeedback).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {getActiveList().length > 0 && totalPages > 1 && (
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Hiển thị {(currentPage - 1) * itemsPerPage + 1} đến {Math.min(currentPage * itemsPerPage, filteredList.length)} trong số {filteredList.length} khách hàng
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ 
                        background: currentPage === 1 ? 'transparent' : 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        padding: '0.4rem', 
                        borderRadius: '4px', 
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {getPageNumbers().map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => p !== '...' && setCurrentPage(p)}
                        disabled={p === '...'}
                        style={{
                          background: currentPage === p ? 'var(--accent-purple)' : (p === '...' ? 'transparent' : 'rgba(255,255,255,0.02)'),
                          border: p === '...' ? 'none' : (currentPage === p ? '1px solid var(--accent-purple)' : '1px solid rgba(255,255,255,0.1)'),
                          padding: '0.2rem',
                          minWidth: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          cursor: p === '...' ? 'default' : 'pointer',
                          color: currentPage === p ? 'white' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem'
                        }}
                      >
                        {p}
                      </button>
                    ))}

                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{ 
                        background: currentPage === totalPages ? 'transparent' : 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        padding: '0.4rem', 
                        borderRadius: '4px', 
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Segments;
