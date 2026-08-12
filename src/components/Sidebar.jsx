import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, BarChart2, MessageSquare, AlertTriangle, Settings, Users, Database, FileText, LogOut, User, ChevronUp } from 'lucide-react';

const SidebarItem = ({ icon, label, to }) => (
  <NavLink 
    to={to} 
    style={({ isActive }) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.875rem 1.25rem',
      cursor: 'pointer',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: isActive ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.15), transparent)' : 'transparent',
      borderLeft: isActive ? '3px solid var(--accent-blue)' : '3px solid transparent',
      transition: 'all 0.2s ease',
      fontSize: '0.95rem',
      fontWeight: isActive ? 600 : 400,
      textDecoration: 'none'
    })}
  >
    {({ isActive }) => (
      <>
        <div style={{ color: isActive ? 'var(--accent-blue)' : 'inherit' }}>
          {icon}
        </div>
        {label}
      </>
    )}
  </NavLink>
);

const Sidebar = ({ onLogout, isOpen, onClose }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
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
      <aside className={`sidebar-container ${isOpen ? 'open' : ''}`}>
      <div style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '36px', height: '36px',
          background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 'bold', fontSize: '1.2rem'
        }}>
          CX
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
            Customer<span className="text-gradient">Radar</span>
          </h1>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
            Enterprise Edition
          </div>
        </div>
      </div>

      <div style={{ padding: '0 0.5rem', marginTop: '1rem', flex: 1 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem' }}>
          Overview
        </div>
        <SidebarItem to="/dashboard" icon={<Home size={20} />} label="Dashboard" />
        <SidebarItem to="/analytics" icon={<BarChart2 size={20} />} label="Analytics" />
        
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem', marginTop: '2rem' }}>
          Customer Data
        </div>
        <SidebarItem to="/feedbacks" icon={<MessageSquare size={20} />} label="Feedbacks" />
        <SidebarItem to="/segments" icon={<Users size={20} />} label="Segments" />
        <SidebarItem to="/risk" icon={<AlertTriangle size={20} />} label="Risk Center" />
        
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 1.25rem', marginBottom: '0.5rem', marginTop: '2rem' }}>
          System
        </div>
        <SidebarItem to="/data" icon={<Database size={20} />} label="Data Sources" />
        <SidebarItem to="/reports" icon={<FileText size={20} />} label="Reports & Exports" />
        <SidebarItem to="/settings" icon={<Settings size={20} />} label="Settings" />
      </div>
      
      <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative' }} ref={menuRef}>
        
        {/* Popup Menu */}
        {showUserMenu && (
          <div className="glass-panel animate-fade-in" style={{
            position: 'absolute', bottom: 'calc(100% + 10px)', left: '1rem', right: '1rem',
            padding: '0.5rem', zIndex: 110,
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
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem', margin: '-0.5rem', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', transition: 'background 0.2s',
            background: showUserMenu ? 'rgba(255,255,255,0.05)' : 'transparent'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = showUserMenu ? 'rgba(255,255,255,0.05)' : 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="var(--text-secondary)" />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>Admin User</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>admin@company.com</div>
            </div>
          </div>
          <ChevronUp size={16} color="var(--text-secondary)" style={{ transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
        </div>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
