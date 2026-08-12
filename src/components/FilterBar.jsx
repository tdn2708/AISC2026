import React, { useState } from 'react';
import { Calendar, Filter, ChevronDown, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter }) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const navigate = useNavigate();

  const timeOptions = ['All', 'Today', 'This Week', 'This Month'];
  const sourceOptions = ['All', 'Shopee', 'Facebook', 'TikTok', 'Web'];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 1.5rem',
      background: 'var(--bg-card)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      marginBottom: '1.5rem',
      borderRadius: 'var(--radius-lg)',
      position: 'relative',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* Time Filter */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
            style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem'
          }}>
            <Calendar size={16} />
            {timeFilter === 'All' ? 'All Time' : timeFilter}
            <ChevronDown size={14} color="var(--text-secondary)" />
          </button>
          
          {openDropdown === 'time' && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'absolute', top: '110%', left: 0, width: '150px',
              padding: '0.5rem', zIndex: 20
            }}>
              {timeOptions.map(opt => (
                <div key={opt} 
                  onClick={() => { setTimeFilter(opt); setOpenDropdown(null); }}
                  style={{
                    padding: '0.5rem', borderRadius: 'var(--radius-sm)',
                    background: timeFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                    cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.target.style.background = timeFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent'}
                >
                  {opt === 'All' ? 'All Time' : opt}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Source Filter */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'source' ? null : 'source')}
            style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem'
          }}>
            <Filter size={16} />
            Source: {sourceFilter}
            <ChevronDown size={14} color="var(--text-secondary)" />
          </button>

          {openDropdown === 'source' && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'absolute', top: '110%', left: 0, width: '150px',
              padding: '0.5rem', zIndex: 20
            }}>
              {sourceOptions.map(opt => (
                <div key={opt} 
                  onClick={() => { setSourceFilter(opt); setOpenDropdown(null); }}
                  style={{
                    padding: '0.5rem', borderRadius: 'var(--radius-sm)',
                    background: sourceFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                    cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.target.style.background = sourceFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent'}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div>
        <button 
          onClick={() => navigate('/reports')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Download size={16} />
          Export Report
        </button>
      </div>
    </div>
  );
};

export default FilterBar;
