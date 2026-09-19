import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, AlertTriangle, ShieldAlert, CheckCircle, Bell, ArrowRight } from 'lucide-react';

const RiskCenter = () => {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvedIds, setResolvedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('riskResolvedIds');
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error(e);
    }
    return new Set();
  });
  const [escalatedIds, setEscalatedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('riskEscalatedIds');
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error(e);
    }
    return new Set();
  });
  const [filterSeverity, setFilterSeverity] = useState(() => {
    return localStorage.getItem('riskFilter') || 'All';
  });

  useEffect(() => {
    localStorage.setItem('riskResolvedIds', JSON.stringify([...resolvedIds]));
    localStorage.setItem('riskEscalatedIds', JSON.stringify([...escalatedIds]));
    localStorage.setItem('riskFilter', filterSeverity);
  }, [resolvedIds, escalatedIds, filterSeverity]);

  useEffect(() => {
    const fetchRisks = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/risks');
        setRisks(res.data);
      } catch (err) {
        setError('Failed to fetch risk data. Ensure backend is running.');
      } finally {
        setLoading(false);
      }
    };
    fetchRisks();
  }, []);

  const handleResolve = (idx) => {
    setResolvedIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(idx);
      return newSet;
    });
  };

  const handleEscalate = (idx) => {
    setEscalatedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
  };

  const activeRisks = risks.filter((r, idx) => !resolvedIds.has(idx) && (filterSeverity === 'All' || r.riskLevel === filterSeverity));
  const resolvedCount = resolvedIds.size;
  const totalActive = risks.filter((_, idx) => !resolvedIds.has(idx));
  const criticalCount = totalActive.filter(r => r.riskLevel === 'CRITICAL').length;
  const highCount = totalActive.filter(r => r.riskLevel === 'HIGH').length;

  const MetricCard = ({ title, value, icon, color }) => (
    <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
          <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</h2>
        </div>
        <div style={{ padding: '0.75rem', background: `rgba(${color === 'var(--risk-critical)' ? '239,68,68' : color === 'var(--risk-high)' ? '249,115,22' : '16,185,129'}, 0.1)`, borderRadius: '12px', color: color }}>
          {icon}
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShieldAlert size={28} color="var(--risk-critical)" />
            Crisis Control Center
          </h1>

        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: '99px', color: 'var(--risk-critical)', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--risk-critical)', display: 'inline-block', boxShadow: '0 0 8px var(--risk-critical)', animation: 'pulse 2s infinite' }}></span>
          {activeRisks.length} Active Alerts
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <MetricCard title="Critical Incidents" value={criticalCount} color="var(--risk-critical)" icon={<AlertTriangle size={24} />} />
        <MetricCard title="High Risks" value={highCount} color="var(--risk-high)" icon={<Bell size={24} />} />
        <MetricCard title="Resolved Today" value={resolvedCount} color="var(--risk-low)" icon={<CheckCircle size={24} />} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Actionable Alerts</h2>
        
        {/* Filter Toggle Group */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            onClick={() => setFilterSeverity('All')}
            style={{ padding: '0.5rem 1rem', background: filterSeverity === 'All' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '6px', color: filterSeverity === 'All' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
          >All</button>
          <button 
            onClick={() => setFilterSeverity('CRITICAL')}
            style={{ padding: '0.5rem 1rem', background: filterSeverity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', border: 'none', borderRadius: '6px', color: filterSeverity === 'CRITICAL' ? '#ef4444' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
          >Critical Only</button>
          <button 
            onClick={() => setFilterSeverity('HIGH')}
            style={{ padding: '0.5rem 1rem', background: filterSeverity === 'HIGH' ? 'rgba(249, 115, 22, 0.2)' : 'transparent', border: 'none', borderRadius: '6px', color: filterSeverity === 'HIGH' ? '#f97316' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
          >High Only</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--risk-critical)' }} />
          <p>Scanning for risks...</p>
        </div>
      ) : error ? (
        <div style={{ color: 'var(--risk-critical)', textAlign: 'center', padding: '3rem', background: 'rgba(239,68,68,0.05)', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
      ) : activeRisks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'rgba(16,185,129,0.05)', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--risk-low)' }}>
          <CheckCircle size={48} style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>All Clear!</h3>
          <p style={{ margin: 0, opacity: 0.8 }}>No active critical or high risks at the moment.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {risks.map((risk, idx) => {
            if (resolvedIds.has(idx)) return null;
            if (filterSeverity !== 'All' && risk.riskLevel !== filterSeverity) return null;
            
            const isCritical = risk.riskLevel === 'CRITICAL';
            const isEscalated = escalatedIds.has(idx);
            
            return (
              <div key={idx} className="glass-panel" style={{ padding: '1.5rem', borderLeft: `4px solid ${isCritical ? 'var(--risk-critical)' : 'var(--risk-high)'}`, border: isEscalated ? '1px solid var(--accent-purple)' : undefined, background: isEscalated ? 'var(--accent-dim)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <span className="cat-badge" style={{ 
                        color: isCritical ? '#ef4444' : '#f97316', 
                        borderColor: isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)',
                        background: isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)'
                      }}>
                        {risk.riskLevel}
                      </span>
                      {isEscalated && (
                        <span className="cat-badge" style={{ color: '#a855f7', borderColor: 'var(--accent-dim)', background: 'var(--accent-dim)' }}>
                          ESCALATED TO MANAGEMENT
                        </span>
                      )}
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{risk.issue}</h3>
                    </div>
                    
                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', fontSize: '0.95rem', lineHeight: '1.5' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>AI Insight:</strong> {risk.insight}
                    </p>
                    
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ArrowRight size={14} color="var(--accent-blue)" /> Recommended Action
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                        {risk.recommendations && risk.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '140px' }}>
                    <button 
                      onClick={() => handleResolve(idx)}
                      style={{ 
                        background: 'var(--accent-blue)', 
                        color: 'white', 
                        border: 'none', 
                        padding: '0.75rem 1rem', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.opacity = '0.9'}
                      onMouseOut={(e) => e.target.style.opacity = '1'}
                    >
                      Resolve Issue
                    </button>
                    <button 
                      onClick={() => handleEscalate(idx)}
                      style={{ 
                        background: isEscalated ? 'var(--accent-dim)' : 'transparent', 
                        color: isEscalated ? '#c084fc' : 'var(--text-secondary)', 
                        border: isEscalated ? '1px solid var(--accent-dim)' : '1px solid rgba(255,255,255,0.1)', 
                        padding: '0.75rem 1rem', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out'
                      }}
                      onMouseOver={(e) => { if (!isEscalated) e.target.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseOut={(e) => { if (!isEscalated) e.target.style.background = 'transparent' }}
                    >
                      {isEscalated ? 'Cancel Escalate' : 'Escalate'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RiskCenter;
