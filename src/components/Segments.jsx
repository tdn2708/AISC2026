import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Users, TrendingUp, AlertTriangle, MessageSquare } from 'lucide-react';

const Segments = () => {
  const [data, setData] = useState({ promoters: [], atRisk: [], passives: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState('atRisk');

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

  const getActiveList = () => {
    return data[selectedSegment] || [];
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
          background: isActive ? bgColor : 'rgba(15, 23, 42, 0.5)',
          transition: 'all 0.3s ease',
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
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Automatically categorize your customers based on AI sentiment analysis.</p>
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
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                {selectedSegment === 'atRisk' && 'At-Risk Customers'}
                {selectedSegment === 'promoters' && 'Loyal Promoters'}
                {selectedSegment === 'passives' && 'Passive Users'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, marginTop: '0.25rem' }}>
                List of customers categorized into this segment.
              </p>
            </div>
            
            <div style={{ overflowX: 'auto', flex: 1 }}>
              {getActiveList().length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>No customers in this segment.</div>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Segments;
