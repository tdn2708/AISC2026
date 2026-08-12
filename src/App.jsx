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
  const location = useLocation();

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Mobile Header */}
      <div className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>
            CX
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Customer<span className="text-gradient">Radar</span></div>
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
        />
        <main className="main-content">
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
