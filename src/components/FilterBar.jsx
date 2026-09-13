import React, { useState, useEffect } from 'react';
import { Calendar, Filter, ChevronDown, Download, Package, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter, productFilter, setProductFilter, hideExportButton = false }) => {
  const [openDropdown, setOpenDropdown] = useState(null);

  const activeCount =
    (timeFilter && timeFilter !== 'All' ? 1 : 0) +
    (sourceFilter && sourceFilter !== 'All' ? 1 : 0) +
    (productFilter && productFilter !== 'All' ? 1 : 0);

  const clearAll = () => {
    setTimeFilter('All');
    setSourceFilter('All');
    if (setProductFilter) setProductFilter('All');
    setOpenDropdown(null);
  };
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [productOptions, setProductOptions] = useState(['All']);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await axios.get('/products');
        const availableProducts = ['All', ...res.data];
        setProductOptions(availableProducts);
        
        if (productFilter && !availableProducts.includes(productFilter)) {
          setProductFilter('All');
        }
      } catch (e) {
        console.error('Failed to load products:', e);
      }
    };
    if (setProductFilter) fetchProducts();
  }, [setProductFilter, productFilter]);

  const timeOptions = ['All', 'Today', 'This Week', 'This Month', 'Custom Date...'];
  const sourceOptions = ['All', 'Shopee', 'Facebook', 'TikTok', 'Web'];

  const getDisplayTimeFilter = () => {
    if (timeFilter.startsWith('Custom:')) {
      const parts = timeFilter.split(':');
      if (parts.length === 3) {
        return `${new Date(parts[1]).toLocaleDateString('vi-VN')} - ${new Date(parts[2]).toLocaleDateString('vi-VN')}`;
      }
    }
    return timeFilter === 'All' ? 'Toàn thời gian' : timeFilter;
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
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      marginBottom: '1.5rem',
      borderRadius: 'var(--r-surf)',
      flexWrap: 'wrap',
      gap: '0.75rem',
      position: 'relative',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1rem' }}>
        {/* Time Filter */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
            style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--raised)',
            border: '1px solid var(--border)',
            padding: '0.5rem 0.9rem', borderRadius: 'var(--r-ctrl)',
            color: 'var(--text-hi)', cursor: 'pointer', fontSize: '0.84rem',
            transition: 'border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease)'
          }}>
            <Calendar size={16} />
            {getDisplayTimeFilter()}
            <ChevronDown size={14} color="var(--text-secondary)" />
          </button>
          
          {openDropdown === 'time' && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'absolute', top: '110%', left: 0, width: '220px',
              padding: '0.5rem', zIndex: 20,
              background: 'var(--bg-dark)',
              boxShadow: 'var(--glass-shadow)',
              border: 'var(--glass-border)'
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
                  {opt === 'All' ? 'Toàn thời gian' : opt}
                  
                  {opt === 'Custom Date...' && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        style={{
                          background: 'var(--bg-dark)', border: 'var(--glass-border)',
                          color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '4px',
                          fontSize: '0.8rem', width: '100%', colorScheme: 'dark'
                        }}
                      />
                      <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        style={{
                          background: 'var(--bg-dark)', border: 'var(--glass-border)',
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
            background: 'var(--raised)',
            border: '1px solid var(--border)',
            padding: '0.5rem 0.9rem', borderRadius: 'var(--r-ctrl)',
            color: 'var(--text-hi)', cursor: 'pointer', fontSize: '0.84rem',
            transition: 'border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease)'
          }}>
            <Filter size={16} />
            Nguồn: {sourceFilter === 'All' ? 'Tất cả' : sourceFilter}
            <ChevronDown size={14} color="var(--text-secondary)" />
          </button>

          {openDropdown === 'source' && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'absolute', top: '110%', left: 0, width: '150px',
              padding: '0.5rem', zIndex: 20,
              background: 'var(--bg-dark)',
              boxShadow: 'var(--glass-shadow)',
              border: 'var(--glass-border)'
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
              /* Bản cũ tô tím riêng cho bộ lọc sản phẩm trong khi hai
                 bộ lọc còn lại màu tối — ba điều khiển cùng loại mà ba
                 kiểu trạng thái khác nhau. Nay dùng chung một quy ước. */
              background: productFilter && productFilter !== 'All' ? 'var(--accent-dim)' : 'var(--raised)',
              border: productFilter && productFilter !== 'All' ? '1px solid var(--accent)' : '1px solid var(--border)',
              padding: '0.5rem 0.9rem', borderRadius: 'var(--r-ctrl)',
              color: productFilter && productFilter !== 'All' ? 'var(--accent-hi)' : 'var(--text-hi)',
              cursor: 'pointer', fontSize: '0.84rem', maxWidth: '260px',
              transition: 'border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease)'
            }}>
              <Package size={16} style={{ flexShrink: 0 }} />
              {/* Mọi chỗ cắt chữ đều phải kèm title, nếu không người dùng
                  không có cách nào biết giá trị đầy đủ là gì. */}
              <span
                title={productFilter === 'All' || !productFilter ? 'Tất cả sản phẩm' : productFilter}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {productFilter === 'All' || !productFilter ? 'Tất cả sản phẩm' : productFilter}
              </span>
              <ChevronDown size={14} color="var(--text-secondary)" />
            </button>

            {openDropdown === 'product' && (
              <div className="glass-panel animate-fade-in" style={{
                position: 'absolute', top: '110%', left: 0, width: '220px', maxHeight: '250px', overflowY: 'auto',
                padding: '0.5rem', zIndex: 20,
                background: 'var(--bg-dark)',
                boxShadow: 'var(--glass-shadow)',
                border: 'var(--glass-border)'
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
                    {opt === 'All' ? 'Tất cả sản phẩm' : opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BỘ ĐẾM ĐIỀU KIỆN VÀ NÚT XOÁ TẤT CẢ.
            Ba hộp thả xuống của bản cũ không cho biết đang lọc mấy điều
            kiện, cũng không có cách nào gỡ nhanh. Người dùng nhìn một
            con số nhỏ bất thường mà không biết là do dữ liệu hay do bộ
            lọc còn sót từ phiên trước — bộ lọc lại được lưu vào
            localStorage nên nó SỐNG QUA CẢ LẦN TẢI TRANG. */}
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            title="Gỡ toàn bộ điều kiện lọc"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-lo)', fontSize: '0.8rem', padding: '0.5rem 0.25rem',
              transition: 'color 120ms ease-out'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--sev-crit)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-lo)'}
          >
            <X size={13} />
            <span className="data-num">{activeCount}</span> điều kiện · xoá tất cả
          </button>
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
              transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Download size={16} />
            Xuất báo cáo
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterBar;
