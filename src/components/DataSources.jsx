import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Link as LinkIcon, RefreshCw, CheckCircle, Clock, Search, Smartphone, ShoppingBag, Store, Activity, Box, Settings2, Plus, Trash2, X, Globe } from 'lucide-react';

const DataSources = () => {
  const [activeTab, setActiveTab] = useState('shops'); // 'shops', 'products', 'history'
  const [url, setUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Sync History State
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
      { id: 2, source: 'Demo Source', url: 'dummy', status: 'Success', items: 15, time: '1 hour ago' }
    ];
  });

  // Connected Shops State
  const [connectedShops, setConnectedShops] = useState(() => {
    try {
      const saved = localStorage.getItem('connectedShops');
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error parsing connectedShops', e);
    }
    return [
      { id: 'shp1', name: 'Shopee Official Flagship', platform: 'Shopee', shopId: 'SHP-982341', productsCount: 120, autoSync: true, status: 'Active' },
      { id: 'tik1', name: 'TikTok Shop Global', platform: 'TikTok', shopId: 'TIK-44122', productsCount: 22, autoSync: false, status: 'Active' }
    ];
  });

  // Modal State
  const [showAddShopModal, setShowAddShopModal] = useState(false);
  const [newShopForm, setNewShopForm] = useState({ platform: 'Shopee', name: '', shopId: '' });

  // Effects for Persistence
  useEffect(() => {
    localStorage.setItem('syncHistory', JSON.stringify(syncHistory));
  }, [syncHistory]);

  useEffect(() => {
    localStorage.setItem('connectedShops', JSON.stringify(connectedShops));
  }, [connectedShops]);

  // Derived Metrics
  const totalProducts = connectedShops.reduce((sum, shop) => sum + shop.productsCount, 0);

  // Handlers
  const handleAddShop = (e) => {
    e.preventDefault();
    if (!newShopForm.name || !newShopForm.shopId) return;
    
    const newShop = {
      id: Date.now().toString(),
      name: newShopForm.name,
      platform: newShopForm.platform,
      shopId: newShopForm.shopId,
      productsCount: Math.floor(Math.random() * 50) + 10, // Mock random product count
      autoSync: true,
      status: 'Active'
    };
    
    setConnectedShops(prev => [newShop, ...prev]);
    setShowAddShopModal(false);
    setNewShopForm({ platform: 'Shopee', name: '', shopId: '' });
  };

  const handleDeleteShop = (id) => {
    if(window.confirm('Are you sure you want to disconnect this shop?')) {
      setConnectedShops(prev => prev.filter(shop => shop.id !== id));
    }
  };

  const handleToggleSync = (id) => {
    setConnectedShops(prev => prev.map(shop => 
      shop.id === id ? { ...shop, autoSync: !shop.autoSync } : shop
    ));
  };

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
        record.id === newRecordId ? { ...record, status: 'Success', items: res.data.data?.length || 15 } : record
      ));
      setUrl('');
    } catch (err) {
      setSyncHistory(prev => prev.map(record => 
        record.id === newRecordId ? { ...record, status: 'Failed', error: 'API Error or Timeout' } : record
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

  const getPlatformIcon = (platform, size = 28) => {
    switch(platform) {
      case 'Shopee': return <ShoppingBag size={size} />;
      case 'TikTok': return <Smartphone size={size} />;
      default: return <Globe size={size} />;
    }
  };

  const getPlatformColor = (platform) => {
    switch(platform) {
      case 'Shopee': return '249, 115, 22'; // Orange
      case 'TikTok': return '236, 72, 153'; // Pink
      default: return '6, 182, 212'; // Cyan
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem', position: 'relative' }}>
      
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
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{connectedShops.length} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ 10 allowed</span></div>
          </div>
        </div>
        <div className="col-span-4 glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products Tracked</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalProducts}</div>
          </div>
        </div>
        <div className="col-span-4 glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--risk-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Pipelines</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {connectedShops.filter(s => s.autoSync).length} <span className="badge badge-low" style={{ fontSize: '0.7rem' }}>Healthy</span>
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
              <button 
                onClick={() => setShowAddShopModal(true)}
                style={{ 
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                  padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
              >
                <Plus size={18} /> Connect New Shop
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {connectedShops.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Store size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                  <p>No shops connected yet.</p>
                </div>
              ) : (
                connectedShops.map((shop) => (
                  <div key={shop.id} className="animate-fade-in" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: `rgba(${getPlatformColor(shop.platform)}, 0.1)`, color: `rgb(${getPlatformColor(shop.platform)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getPlatformIcon(shop.platform)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{shop.name}</h3>
                          <span className="badge badge-low" style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}>{shop.status}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: {shop.shopId} • {shop.productsCount} Products Tracked</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Auto-Sync</div>
                        <button 
                          onClick={() => handleToggleSync(shop.id)}
                          style={{ 
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                            color: shop.autoSync ? 'var(--accent-cyan)' : 'var(--text-secondary)', padding: 0
                          }}
                        >
                          {shop.autoSync ? <CheckCircle size={14} /> : <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>}
                          {shop.autoSync ? 'Enabled (Daily)' : 'Paused'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          title="Delete Shop"
                          onClick={() => handleDeleteShop(shop.id)}
                          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.5rem', color: 'var(--risk-critical)', cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        ><Trash2 size={18} /></button>
                      </div>
                    </div>
                  </div>
                ))
              )}
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

      {/* Add Shop Modal */}
      {showAddShopModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative' }}>
            <button 
              onClick={() => setShowAddShopModal(false)}
              style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>
            
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 1.5rem 0' }}>Connect New Shop</h2>
            
            <form onSubmit={handleAddShop} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Platform</label>
                <select 
                  value={newShopForm.platform}
                  onChange={(e) => setNewShopForm({...newShopForm, platform: e.target.value})}
                  style={{
                    width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: 'white', fontSize: '1rem', outline: 'none'
                  }}
                >
                  <option value="Shopee">Shopee</option>
                  <option value="TikTok">TikTok Shop</option>
                  <option value="Web">Custom Website</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Shop Name</label>
                <input 
                  type="text" 
                  value={newShopForm.name}
                  onChange={(e) => setNewShopForm({...newShopForm, name: e.target.value})}
                  placeholder="e.g. Apple Official Store"
                  required
                  style={{
                    width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Shop ID / URL</label>
                <input 
                  type="text" 
                  value={newShopForm.shopId}
                  onChange={(e) => setNewShopForm({...newShopForm, shopId: e.target.value})}
                  placeholder="e.g. SHP-12345 or https://..."
                  required
                  style={{
                    width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddShopModal(false)}
                  style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-cyan)', border: 'none', color: '#000', fontWeight: 600, borderRadius: '8px', cursor: 'pointer' }}
                >
                  Connect Shop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DataSources;
