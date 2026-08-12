import React, { useState } from 'react';
import { AlertTriangle, TrendingUp, ShieldAlert } from 'lucide-react';

const RiskAlerts = ({ risks = [] }) => {
  const [showAll, setShowAll] = useState(false);
  
  return (
    <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <ShieldAlert size={24} color="var(--risk-critical)" />
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Top Rising Issues</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Critical risk indicators</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto' }}>
        {risks.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No critical issues detected.
          </div>
        ) : (
          (showAll ? risks : risks.slice(0, 3)).map((alert, index) => (
            <div key={index} style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ 
                position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', 
                background: alert.riskLevel === 'CRITICAL' ? 'var(--risk-critical)' : 'var(--risk-high)'
              }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{alert.issue}</h4>
                <span className={`badge ${alert.riskLevel === 'CRITICAL' ? 'badge-critical' : 'badge-high'}`}>
                  {alert.riskLevel}
                </span>
              </div>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                {alert.insight}
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--risk-critical)', fontSize: '0.8rem', fontWeight: 500 }}>
                <TrendingUp size={14} />
                <span>{alert.increase}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {risks.length > 3 && (
        <div style={{ paddingTop: '1rem', textAlign: 'center', marginTop: 'auto' }}>
          <button 
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-secondary)',
              padding: '0.4rem 1.25rem',
              borderRadius: '99px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'white'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {showAll ? 'Show Less' : `View All (${risks.length})`}
          </button>
        </div>
      )}
    </div>
  );
};

export default RiskAlerts;
