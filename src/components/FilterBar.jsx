import React, { useState, useEffect } from 'react';
import { Calendar, Filter, ChevronDown, Download, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter, productFilter, setProductFilter, hideExportButton = false }) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [productOptions, setProductOptions] = useState(['All']);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await axios.get('/products');
        setProductOptions(['All', ...res.data]);
      } catch (e) {
        console.error('Failed to load products:', e);
      }
    };
    if (setProductFilter) fetchProducts();
  }, [setProductFilter]);

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

        {/* Product Filter - only show if setProductFilter is provided */}
        {setProductFilter && (
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'product' ? null : 'product')}
              style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: productFilter && productFilter !== 'All' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255,255,255,0.05)',
              border: productFilter && productFilter !== 'All' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255,255,255,0.1)',
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem'
            }}>
              <Package size={16} />
              {productFilter === 'All' || !productFilter ? 'All Products' : (productFilter.length > 20 ? productFilter.substring(0, 20) + '...' : productFilter)}
              <ChevronDown size={14} color="var(--text-secondary)" />
            </button>

            {openDropdown === 'product' && (
              <div className="glass-panel animate-fade-in" style={{
                position: 'absolute', top: '110%', left: 0, width: '220px', maxHeight: '250px', overflowY: 'auto',
                padding: '0.5rem', zIndex: 20,
                background: 'rgba(15, 23, 42, 0.95)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {productOptions.map(opt => (
                  <div key={opt} 
                    onClick={() => { setProductFilter(opt); setOpenDropdown(null); }}
                    style={{
                      padding: '0.5rem', borderRadius: 'var(--radius-sm)',
                      background: productFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                      cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.target.style.background = productFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent'}
                  >
                    {opt === 'All' ? 'All Products' : opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
