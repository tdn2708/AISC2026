import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, BarChart2, MessageSquare, AlertTriangle, Settings, Users, Database, FileText, LogOut, User, ChevronUp } from 'lucide-react';

const SidebarItem = ({ icon, label, to, collapsed }) => (
  <NavLink 
    to={to} 
    title={collapsed ? label : undefined}
    style={({ isActive }) => ({
      display: 'flex',
      alignItems: 'center',
      gap: collapsed ? '0' : '1rem',
      padding: collapsed ? '0.875rem 0' : '0.875rem 1.25rem',
      justifyContent: collapsed ? 'center' : 'flex-start',
      cursor: 'pointer',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: isActive ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.15), transparent)' : 'transparent',
      borderLeft: isActive ? '3px solid var(--accent-blue)' : '3px solid transparent',
      transition: 'all 0.2s ease',
      fontSize: '0.95rem',
      fontWeight: isActive ? 600 : 400,
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    })}
  >
    {({ isActive }) => (
      <>
        <div style={{ color: isActive ? 'var(--accent-blue)' : 'inherit', flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s', overflow: 'hidden' }}>{label}</span>
      </>
    )}
  </NavLink>
);

const Sidebar = ({ onLogout, isOpen, onClose, collapsed = false, onToggleCollapse }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [edgeHover, setEdgeHover] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div 
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`} 
        onClick={onClose}
      />
      <aside 
        className={`sidebar-container ${isOpen ? 'open' : ''}`} 
        style={{ width: collapsed ? '72px' : '260px' }}
      >
        {/* Full-height edge drag strip */}
        <div
          onClick={onToggleCollapse}
          onMouseEnter={() => setEdgeHover(true)}
          onMouseLeave={() => setEdgeHover(false)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
            zIndex: 1002,
            background: edgeHover ? 'rgba(128, 128, 128, 0.35)' : 'transparent',
            transition: 'background 0.2s ease',
            boxShadow: edgeHover ? '0 0 6px rgba(128, 128, 128, 0.2)' : 'none',
          }}
        />

        {/* Logo */}
        <div style={{ padding: collapsed ? '2rem 0' : '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '36px', minWidth: '36px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '1.2rem',
          }}>
            CX
          </div>
          {!collapsed && (
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
                Customer<span className="text-gradient">Radar</span>
              </h1>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
                Enterprise Edition
              </div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div style={{ padding: '0 0.5rem', marginTop: '1rem', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {!collapsed && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem' }}>
              Overview
            </div>
          )}
          {collapsed && <div style={{ margin: '0.5rem 0' }} />}
          <SidebarItem to="/dashboard" icon={<Home size={20} />} label="Dashboard" collapsed={collapsed} />
          <SidebarItem to="/analytics" icon={<BarChart2 size={20} />} label="Analytics" collapsed={collapsed} />
          
          {!collapsed ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem', marginTop: '2rem' }}>
              Customer Data
            </div>
          ) : (
            <div style={{ margin: '1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
          )}
          <SidebarItem to="/feedbacks" icon={<MessageSquare size={20} />} label="Feedbacks" collapsed={collapsed} />
          <SidebarItem to="/segments" icon={<Users size={20} />} label="Segments" collapsed={collapsed} />
          <SidebarItem to="/risk" icon={<AlertTriangle size={20} />} label="Risk Center" collapsed={collapsed} />
          
          {!collapsed ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem', marginTop: '2rem' }}>
              System
            </div>
          ) : (
            <div style={{ margin: '1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
          )}
          <SidebarItem to="/data" icon={<Database size={20} />} label="Data Sources" collapsed={collapsed} />
          <SidebarItem to="/reports" icon={<FileText size={20} />} label="Reports & Exports" collapsed={collapsed} />
          <SidebarItem to="/settings" icon={<Settings size={20} />} label="Settings" collapsed={collapsed} />
        </div>
      
        {/* User Profile Section */}
        <div style={{ padding: collapsed ? '1rem 0' : '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', flexShrink: 0 }} ref={menuRef}>
          
          {/* Popup Menu - positioned to the right when collapsed */}
          {showUserMenu && (
            <div className="glass-panel animate-fade-in" style={{
              position: 'fixed', 
              bottom: '16px',
              left: collapsed ? '80px' : '16px',
              width: '220px',
              padding: '0.5rem', zIndex: 9999,
              boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Signed in as</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>admin@company.com</div>
              </div>
              
              <button 
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', color: 'var(--text-primary)',
                  border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <User size={16} color="var(--text-secondary)" /> Profile
              </button>
              
              <button 
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', color: 'var(--text-primary)',
                  border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Settings size={16} color="var(--text-secondary)" /> Settings
              </button>

              {onLogout && (
                <button 
                  onClick={onLogout}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginTop: '0.5rem',
                    background: 'rgba(239, 68, 68, 0.05)', color: 'var(--risk-critical)',
                    border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                    transition: 'background 0.2s', fontWeight: 500
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                >
                  <LogOut size={16} /> Sign out
                </button>
              )}
            </div>
          )}

          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={collapsed ? 'Admin User' : undefined}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0.5rem', margin: collapsed ? '0' : '-0.5rem', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', transition: 'background 0.2s',
              background: showUserMenu ? 'rgba(255,255,255,0.05)' : 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = showUserMenu ? 'rgba(255,255,255,0.05)' : 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1, justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <div style={{ width: '36px', height: '36px', minWidth: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} color="var(--text-secondary)" />
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>Admin User</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>admin@company.com</div>
                </div>
              )}
            </div>
            {!collapsed && <ChevronUp size={16} color="var(--text-secondary)" style={{ flexShrink: 0, transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
