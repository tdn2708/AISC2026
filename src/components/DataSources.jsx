import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Link as LinkIcon, RefreshCw, CheckCircle, Clock, Search, Smartphone, ShoppingBag, Store, Activity, Box, Settings2, Plus } from 'lucide-react';

const DataSources = () => {
  const [activeTab, setActiveTab] = useState('shops'); // 'shops', 'products', 'history'
  const [url, setUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncHistory, setSyncHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('syncHistory');
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error parsing syncHistory', e);
    }
    return [
      { id: 1, source: 'Shopee URL', url: 'https://shopee.vn/iphone-15-pro-max', status: 'Success', items: 15, time: '2 mins ago' },
      { id: 2, source: 'Demo Source', url: 'dummy', status: 'Success', items: 15, time: '1 hour ago' },
      { id: 3, source: 'Facebook Page', url: 'https://facebook.com/apple', status: 'Failed', items: 0, time: '5 hours ago', error: 'Rate limit exceeded' },
    ];
  });

  useEffect(() => {
    localStorage.setItem('syncHistory', JSON.stringify(syncHistory));
  }, [syncHistory]);

  const handleSync = async (e) => {
    e.preventDefault();
    if (!url) return;

    setIsSyncing(true);
    
    const newRecordId = Date.now();
    setSyncHistory(prev => [{
      id: newRecordId,
      source: url.includes('shopee') ? 'Shopee' : url.includes('facebook') ? 'Facebook' : 'Web URL',
      url: url,
      status: 'Syncing...',
      items: 0,
      time: new Date().toLocaleTimeString()
    }, ...prev]);

    try {
      const res = await axios.post('/scrape', { url });
      setSyncHistory(prev => prev.map(record => 
        record.id === newRecordId 
          ? { ...record, status: 'Success', items: res.data.data?.length || 15 } 
          : record
      ));
      setUrl('');
    } catch (err) {
      setSyncHistory(prev => prev.map(record => 
        record.id === newRecordId 
          ? { ...record, status: 'Failed', error: 'API Error or Timeout' } 
          : record
      ));
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Success': return <span className="badge badge-low">{status}</span>;
      case 'Failed': return <span className="badge badge-critical">{status}</span>;
      case 'Syncing...': return <span className="badge" style={{ color: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)' }}><RefreshCw size={12} className="animate-spin" style={{ marginRight: '4px' }}/> {status}</span>;
      default: return <span className="badge badge-medium">{status}</span>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={28} color="var(--accent-cyan)" />
          Integration Hub
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage enterprise data sources, workspaces, and monitor ingestion pipelines.</p>
      </div>

      {/* Top Metrics */}
      <div className="dashboard-grid" style={{ marginBottom: '2.5rem' }}>
        <div className="col-span-4 glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected Shops</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>2 <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ 5 allowed</span></div>
          </div>
        </div>
        <div className="col-span-4 glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products Tracked</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>142</div>
          </div>
        </div>
        <div className="col-span-4 glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--risk-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Pipelines</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              3 <span className="badge badge-low" style={{ fontSize: '0.7rem' }}>Healthy</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '2rem', overflowX: 'auto' }}>
        <button 
          onClick={() => setActiveTab('shops')}
          style={{ 
            background: 'transparent', border: 'none', padding: '1rem 0', cursor: 'pointer', fontSize: '1rem', fontWeight: 500,
            color: activeTab === 'shops' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'shops' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            marginRight: '1.5rem', transition: 'all 0.2s', whiteSpace: 'nowrap'
          }}
        >
          Workspaces & Shops
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          style={{ 
            background: 'transparent', border: 'none', padding: '1rem 0', cursor: 'pointer', fontSize: '1rem', fontWeight: 500,
            color: activeTab === 'products' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'products' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            marginRight: '1.5rem', transition: 'all 0.2s', whiteSpace: 'nowrap'
          }}
        >
          Individual Products
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          style={{ 
            background: 'transparent', border: 'none', padding: '1rem 0', cursor: 'pointer', fontSize: '1rem', fontWeight: 500,
            color: activeTab === 'history' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'history' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            transition: 'all 0.2s', whiteSpace: 'nowrap'
          }}
        >
          Sync History
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content animate-fade-in">
        
        {/* TAB 1: Workspaces & Shops */}
        {activeTab === 'shops' && (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Connected Workspaces</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Connect entire stores to auto-sync reviews for all products daily.</p>
              </div>
              <button style={{ 
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
              }}>
                <Plus size={18} /> Connect New Shop
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Mockup Shop 1 */}
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(249, 115, 22, 0.1)', color: 'rgb(249, 115, 22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag size={28} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Shopee Official Flagship</h3>
                      <span className="badge badge-low" style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}>Active</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: SHP-982341 • 120 Products Tracked</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Auto-Sync</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                      <CheckCircle size={14} /> Enabled (Daily)
                    </div>
                  </div>
                  <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer' }}><Settings2 size={18} /></button>
                </div>
              </div>

              {/* Mockup Shop 2 */}
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(236, 72, 153, 0.1)', color: 'rgb(236, 72, 153)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smartphone size={28} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>TikTok Shop Global</h3>
                      <span className="badge badge-low" style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}>Active</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: TIK-44122 • 22 Products Tracked</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Auto-Sync</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></span> Paused
                    </div>
                  </div>
                  <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer' }}><Settings2 size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Individual Products */}
        {activeTab === 'products' && (
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Manual Product Sync</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem 0', fontSize: '0.9rem' }}>
              Paste a specific product URL (e.g., from a competitor) to scrape feedbacks and send them directly to Gemini AI for ad-hoc analysis.
            </p>

            <form onSubmit={handleSync}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ position: 'relative' }}>
                  <LinkIcon size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="url" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://shopee.vn/..." 
                    required
                    disabled={isSyncing}
                    style={{
                      width: '100%',
                      padding: '1rem 1rem 1rem 3rem',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid var(--accent-cyan)'}
                    onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSyncing || !url}
                  style={{
                    padding: '1rem',
                    background: isSyncing ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                    color: isSyncing ? 'var(--text-muted)' : 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '1rem',
                    cursor: isSyncing || !url ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'opacity 0.2s'
                  }}
                >
                  {isSyncing ? (
                    <><RefreshCw size={20} className="animate-spin" /> Synchronizing & Analyzing Data... (Takes ~15s)</>
                  ) : (
                    <><RefreshCw size={20} /> Run AI Sync Pipeline</>
                  )}
                </button>
              </div>
            </form>
            
            <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem' }}>
              <Clock size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              <div>
                <strong>Note on Rate Limits:</strong> Ad-hoc syncs consume AI credits rapidly. For stable tracking, consider adding the shop in the "Workspaces & Shops" tab for scheduled nightly syncs.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Sync History */}
        {activeTab === 'history' && (
          <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Sync & Pipeline History</h3>
            </div>
            <div className="table-responsive">
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase' }}>Source</th>
                    <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase' }}>Items Extracted</th>
                    <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(syncHistory) && syncHistory.map((record) => (
                    <tr key={record?.id || Math.random()} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{record?.source || 'Unknown'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {record?.url || ''}
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        {getStatusBadge(record?.status)}
                        {record?.error && <div style={{ fontSize: '0.7rem', color: 'var(--risk-critical)', marginTop: '4px' }}>{record.error}</div>}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ fontWeight: 600 }}>{record?.items || 0}</span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {record?.time || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default DataSources;
