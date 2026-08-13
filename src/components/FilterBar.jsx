import React, { useState } from 'react';
import { Calendar, Filter, ChevronDown, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter, hideExportButton = false }) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const navigate = useNavigate();

  const timeOptions = ['All', 'Today', 'This Week', 'This Month', 'Custom Date...'];
  const sourceOptions = ['All', 'Shopee', 'Facebook', 'TikTok', 'Web'];

  const getDisplayTimeFilter = () => {
    if (timeFilter.startsWith('Custom:')) {
      const parts = timeFilter.split(':');
      if (parts.length === 3) {
        return `${new Date(parts[1]).toLocaleDateString('vi-VN')} - ${new Date(parts[2]).toLocaleDateString('vi-VN')}`;
      }
    }
    return timeFilter === 'All' ? 'All Time' : timeFilter;
  };

  const handleApplyCustomDate = () => {
    if (customStart && customEnd) {
      setTimeFilter(`Custom:${customStart}:${customEnd}`);
      setOpenDropdown(null);
    } else {
      alert("Vui lòng chọn đầy đủ Ngày Bắt Đầu và Ngày Kết Thúc!");
    }
  };

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
            {getDisplayTimeFilter()}
            <ChevronDown size={14} color="var(--text-secondary)" />
          </button>
          
          {openDropdown === 'time' && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'absolute', top: '110%', left: 0, width: '220px',
              padding: '0.5rem', zIndex: 20,
              background: 'rgba(15, 23, 42, 0.95)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {timeOptions.map(opt => (
                <div key={opt} 
                  onClick={() => { 
                    if (opt !== 'Custom Date...') {
                      setTimeFilter(opt); setOpenDropdown(null); 
                    }
                  }}
                  style={{
                    padding: '0.5rem', borderRadius: 'var(--radius-sm)',
                    background: timeFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                    cursor: opt === 'Custom Date...' ? 'default' : 'pointer', 
                    fontSize: '0.85rem', color: 'var(--text-primary)'
                  }}
                  onMouseEnter={(e) => { if (opt !== 'Custom Date...') e.target.style.background = 'rgba(255,255,255,0.1)'}}
                  onMouseLeave={(e) => { if (opt !== 'Custom Date...') e.target.style.background = timeFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent'}}
                >
                  {opt === 'All' ? 'All Time' : opt}
                  
                  {opt === 'Custom Date...' && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        style={{
                          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '4px',
                          fontSize: '0.8rem', width: '100%', colorScheme: 'dark'
                        }}
                      />
                      <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        style={{
                          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '4px',
                          fontSize: '0.8rem', width: '100%', colorScheme: 'dark'
                        }}
                      />
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleApplyCustomDate(); }}
                        style={{
                          background: 'var(--accent-purple)', color: 'white', border: 'none',
                          padding: '0.4rem', borderRadius: '4px', cursor: 'pointer',
                          fontWeight: 600, fontSize: '0.85rem'
                        }}
                      >
                        Apply Filter
                      </button>
                    </div>
                  )}
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
              padding: '0.5rem', zIndex: 20,
              background: 'rgba(15, 23, 42, 0.95)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255,255,255,0.1)'
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
      
      {!hideExportButton && (
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
      )}
    </div>
  );
};

export default FilterBar;
