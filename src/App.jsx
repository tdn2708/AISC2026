import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import Feedbacks from './components/Feedbacks';
import Segments from './components/Segments';
import RiskCenter from './components/RiskCenter';
import DataSources from './components/DataSources';
import Reports from './components/Reports';
import AiChatWidget from './components/AiChatWidget';
import SettingsPage from './components/Settings';
import Login from './components/Login';
import { useTheme } from './hooks/useTheme';
import axios from 'axios';
import { API_URL } from './config';
import './index.css';

axios.defaults.baseURL = API_URL;

const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const MainLayout = ({ children, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const location = useLocation();

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Mobile Header */}
      <div className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            position: 'relative',
            width: '32px', height: '32px', minWidth: '32px',
            borderRadius: '50%',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, rgba(6,182,212,0.05) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 10px rgba(6,182,212,0.2)',
            overflow: 'hidden'
          }}>
            {/* Radar Lines */}
            <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}></div>
            <div style={{ position: 'absolute', width: '60%', height: '60%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}></div>
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)' }}></div>
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            
            <span style={{ 
              fontFamily: "'Dancing Script', cursive", 
              fontSize: '1.2rem', 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #22d3ee, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              position: 'relative',
              zIndex: 2,
              lineHeight: 1,
              marginLeft: '1px'
            }}>
              CR
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ 
              fontFamily: "'Dancing Script', cursive", 
              fontSize: '1.5rem', 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #22d3ee, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1,
              margin: '0 0 -2px 0'
            }}>
              CustomerRadar
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}
        >
          <Menu size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <Sidebar 
          onLogout={onLogout} 
          isOpen={isMobileMenuOpen} 
          onClose={() => setIsMobileMenuOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className="main-content" style={{ marginLeft: sidebarCollapsed ? '72px' : undefined, transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          {children}
        </main>
      </div>
      <AiChatWidget />
    </div>
  );
};

function App() {
  useTheme(); // Initialize theme
  
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('isAuthenticated', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />
        } />
        
        {/* Protected Routes wrapped in MainLayout */}
        <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Navigate to="/dashboard" replace /></MainLayout></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Dashboard /></MainLayout></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Analytics /></MainLayout></ProtectedRoute>} />
        <Route path="/feedbacks" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Feedbacks /></MainLayout></ProtectedRoute>} />
        <Route path="/segments" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Segments /></MainLayout></ProtectedRoute>} />
        <Route path="/risk" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><RiskCenter /></MainLayout></ProtectedRoute>} />
        <Route path="/data" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><DataSources /></MainLayout></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><Reports /></MainLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout}><SettingsPage /></MainLayout></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
