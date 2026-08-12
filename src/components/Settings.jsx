import React, { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { Moon, Sun, Monitor, Bell, Shield, Key, User, Database, Cpu, Mail, Hash, Smartphone, Save, Check } from 'lucide-react';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <User size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Monitor size={18} /> },
    { id: 'ai', label: 'AI Configuration', icon: <Cpu size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'data', label: 'Data & Privacy', icon: <Database size={18} /> },
    { id: 'security', label: 'Security', icon: <Shield size={18} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Settings</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Manage your account preferences, system settings, and AI configurations.
          </p>
        </div>
        <button 
          onClick={handleSave}
          style={{
            background: saved ? 'var(--risk-low)' : 'var(--accent-blue)',
            color: 'white', border: 'none', padding: '0.6rem 1.25rem',
            borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
          }}
        >
          {saved ? <Check size={18} /> : <Save size={18} />}
          {saved ? 'Saved Successfully' : 'Save Changes'}
        </button>
      </header>

      <div style={{ display: 'flex', gap: '2rem', flex: 1 }}>
        {/* Sidebar Navigation */}
        <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                background: activeTab === tab.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontWeight: activeTab === tab.id ? 600 : 500,
                transition: 'all 0.2s'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '500px' }}>
          
          {activeTab === 'general' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={20} color="var(--accent-blue)" /> Profile Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Full Name</label>
                  <input type="text" defaultValue="Admin User" style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none'
                  }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email Address</label>
                  <input type="email" defaultValue="admin@company.com" style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none'
                  }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Role / Department</label>
                  <input type="text" defaultValue="CX Director" disabled style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', cursor: 'not-allowed'
                  }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Timezone</label>
                  <select style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none'
                  }}>
                    <option value="Asia/Ho_Chi_Minh">(GMT+07:00) Indochina Time (ICT)</option>
                    <option value="UTC">UTC / GMT</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Monitor size={20} color="var(--accent-purple)" /> Appearance
              </h3>
              <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>Theme Mode</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Switch between Dark and Light mode for the dashboard interface.
                    </p>
                  </div>
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '0.35rem', borderRadius: 'var(--radius-md)' }}>
                    <button 
                      onClick={() => toggleTheme('light')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)',
                        background: theme === 'light' ? 'var(--bg-card)' : 'transparent',
                        color: theme === 'light' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: theme === 'light' ? 'var(--glass-shadow)' : 'none', fontWeight: 500
                      }}
                    >
                      <Sun size={18} /> Light
                    </button>
                    <button 
                      onClick={() => toggleTheme('dark')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-sm)',
                        background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: theme === 'dark' ? 'white' : 'var(--text-secondary)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: theme === 'dark' ? 'var(--glass-shadow)' : 'none', fontWeight: 500
                      }}
                    >
                      <Moon size={18} /> Dark
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={20} color="var(--accent-cyan)" /> AI Configuration
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>AI Model Engine</label>
                  <select style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none', width: '50%'
                  }}>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast & Efficient - Recommended)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Reasoning - Slower)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Custom Gemini API Key</label>
                  <input type="password" placeholder="AIzaSy..." style={{ 
                    padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none'
                  }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leave blank to use the system default API Key.</span>
                </div>

                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked /> 
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Enable Fallback Mode</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Automatically switch to mathematical statistics if AI API limit is reached.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={20} color="#f97316" /> Notification Channels
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Mail size={24} color="var(--text-secondary)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>Email Alerts</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Receive daily executive summaries.</div>
                    </div>
                  </div>
                  <input type="checkbox" className="toggle-switch" defaultChecked style={{ transform: 'scale(1.2)' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Hash size={24} color="var(--text-secondary)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>Slack Integration</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Send critical risk alerts to #cx-urgent.</div>
                    </div>
                  </div>
                  <input type="checkbox" className="toggle-switch" style={{ transform: 'scale(1.2)' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Smartphone size={24} color="var(--text-secondary)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>SMS / Push Notifications</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Only for severe PR crises.</div>
                    </div>
                  </div>
                  <input type="checkbox" className="toggle-switch" style={{ transform: 'scale(1.2)' }} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={20} color="var(--risk-low)" /> Security Settings
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>Change Password</h4>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="password" placeholder="Current Password" style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none' }} />
                    <input type="password" placeholder="New Password" style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none' }} />
                    <button style={{ background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', padding: '0 1.5rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Update</button>
                  </div>
                </div>
                
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>Two-Factor Authentication (2FA)</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Add an extra layer of security to your account.</p>
                    </div>
                    <button style={{ background: 'var(--accent-indigo)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-sm)', fontWeight: 500, cursor: 'pointer' }}>Enable 2FA</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'data' && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} color="var(--risk-medium)" /> Data & Privacy
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Auto-Sync Interval</label>
                  <select style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none', width: '50%' }}>
                    <option value="realtime">Real-time (WebSockets)</option>
                    <option value="5m">Every 5 minutes</option>
                    <option value="1h">Every 1 hour</option>
                    <option value="manual">Manual Sync Only</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Data Retention</label>
                  <select style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', outline: 'none', width: '50%' }}>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                    <option value="forever">Indefinitely</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
                  <button style={{ background: 'transparent', border: '1px solid var(--risk-critical)', color: 'var(--risk-critical)', padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-sm)', fontWeight: 500, cursor: 'pointer' }}>
                    Purge System Cache
                  </button>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>This will force the AI to re-analyze all historical data.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;
