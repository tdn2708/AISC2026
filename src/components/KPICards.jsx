import React from 'react';
import { MessageSquare, AlertTriangle, Clock, TrendingUp, TrendingDown, Star } from 'lucide-react';

const KPICard = ({ title, value, icon, color, trend, trendUp }) => (
  <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</p>
      <div style={{
        background: `rgba(${color}, 0.1)`,
        padding: '0.5rem',
        borderRadius: '8px',
        color: `rgb(${color})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {icon}
      </div>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
      <h3 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, lineHeight: 1 }}>{value}</h3>
      
      {trend && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '4px', 
          fontSize: '0.75rem', fontWeight: 600,
          color: trendUp ? 'var(--risk-low)' : 'var(--risk-critical)',
          marginBottom: '4px'
        }}>
          {trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trend}
        </div>
      )}
    </div>
  </div>
);

const KPICards = ({ stats }) => {
  return (
    <div className="dashboard-grid">
      <div className="col-span-3">
        <KPICard 
          title="Total Feedbacks" 
          value={stats?.totalComplaints || 0} 
          icon={<MessageSquare size={20} />}
          color="59, 130, 246" // accent-blue
          trend="+12%"
          trendUp={true}
        />
      </div>
      <div className="col-span-3">
        <KPICard 
          title="NPS Score" 
          value="42" 
          icon={<Star size={20} />}
          color="139, 92, 246" // purple
          trend="+5 pts"
          trendUp={true}
        />
      </div>
      <div className="col-span-3">
        <KPICard 
          title="Complaint Rate" 
          value={stats?.complaintRate || "0%"} 
          icon={<AlertTriangle size={20} />}
          color="239, 68, 68" // risk-critical
          trend="-2.1%"
          trendUp={true}
        />
      </div>
      <div className="col-span-3">
        <KPICard 
          title="Avg. Resolution" 
          value={stats?.avgResolutionTime || "0h"} 
          icon={<Clock size={20} />}
          color="6, 182, 212" // cyan
          trend="+1.5h"
          trendUp={false}
        />
      </div>
    </div>
  );
};

export default KPICards;
