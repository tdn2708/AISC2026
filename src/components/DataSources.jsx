import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Link as LinkIcon, RefreshCw, CheckCircle, XCircle, Clock, Search, Smartphone, ShoppingBag } from 'lucide-react';

const DataSources = () => {
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
    
    // Thêm bản ghi tạm vào history (đang chạy)
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
      // Gọi API cào dữ liệu đã tạo sẵn
      const res = await axios.post('/scrape', { url });
      
      // Thành công, cập nhật bản ghi
      setSyncHistory(prev => prev.map(record => 
        record.id === newRecordId 
          ? { ...record, status: 'Success', items: res.data.data?.length || 15 } 
          : record
      ));
      setUrl('');
    } catch (err) {
      // Thất bại
      setSyncHistory(prev => prev.map(record => 
        record.id === newRecordId 
          ? { ...record, status: 'Failed', error: 'API Error or Timeout' } 
          : record
      ));
    } finally {
      setIsSyncing(false);
    }
  };

  const PlatformCard = ({ name, icon, status, color }) => (
    <div className="glass-panel" style={{ flex: '1 1 200px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', opacity: status === 'Coming Soon' ? 0.6 : 1 }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `rgba(${color}, 0.1)`, color: `rgb(${color})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 600 }}>{name}</h3>
        {status === 'Connected' ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--risk-low)', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Connected</span>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{status}</span>
        )}
      </div>
    </div>
  );

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
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={28} color="var(--accent-cyan)" />
          Integration Hub
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage data sources, run manual syncs, and monitor ingestion pipelines.</p>
      </div>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem' }}>Available Platforms</h2>
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        <PlatformCard name="Shopee API" icon={<ShoppingBag size={24} />} status="Connected" color="249, 115, 22" />
        <PlatformCard name="Web Scraper" icon={<Search size={24} />} status="Connected" color="6, 182, 212" />
        <PlatformCard name="App Store" icon={<Smartphone size={24} />} status="Coming Soon" color="59, 130, 246" />
        <PlatformCard name="TikTok Shop" icon={<ShoppingBag size={24} />} status="Coming Soon" color="236, 72, 153" />
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        {/* Sync Panel */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Manual Data Sync</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem 0', fontSize: '0.9rem' }}>
            Paste a product URL to scrape feedbacks and send them directly to Gemini 3.5 AI for analysis.
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
              <strong>Note on Rate Limits:</strong> Synchronizing data requires calling Gemini API to analyze 15-20 feedbacks simultaneously. Ensure your API Key has enough quota.
            </div>
          </div>
        </div>

        {/* Sync History Table */}
        <div className="glass-panel" style={{ flex: 1.2, padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Sync History</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      </div>
    </div>
  );
};

export default DataSources;
