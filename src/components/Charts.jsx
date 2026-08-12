import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export const TrendChart = ({ data = [] }) => {
  return (
    <div className="glass-panel" style={{ height: '100%' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Trend Analytics</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Timeline of Negative vs Positive feedback</p>
      </div>
      <div style={{ height: 300, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorComplaints" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--risk-critical)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--risk-critical)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSatisfaction" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
            <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} />
            <Area name="Complaints" type="monotone" dataKey="complaints" stroke="var(--risk-critical)" strokeWidth={2} fillOpacity={1} fill="url(#colorComplaints)" />
            <Area name="Satisfaction" type="monotone" dataKey="satisfaction" stroke="var(--accent-blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorSatisfaction)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const CategoryPieChart = ({ data }) => {
  return (
    <div className="glass-panel" style={{ height: '100%' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Issue Categories</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Distribution by topic</p>
      </div>
      <div style={{ height: 300, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.length > 0 ? data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              )) : (
                <Cell fill="rgba(255,255,255,0.05)" />
              )}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
