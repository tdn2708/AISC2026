import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Topbar from './components/shell/Topbar';
import CommandPalette from './components/shell/CommandPalette';
import Assistant from './components/shell/Assistant';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import Insights from './components/Insights';
import Feedbacks from './components/Feedbacks';
import Live from './components/Live';
import RiskCenter from './components/RiskCenter';
import DataSources from './components/DataSources';
import Reports from './components/Reports';
import SettingsPage from './components/Settings';
import Login from './components/Login';
import TrustLayerPage from './components/TrustLayer';
import Lab from './components/Lab';
import UiKit from './components/UiKit';
import { API_URL } from './config';
import { readStorage, writeStorage } from './lib/storage';
import { applyWorkspaceHeader } from './lib/workspace';
import ErrorBoundary from './components/ErrorBoundary';
import { RouteTransition } from './components/motion/RouteTransition';
import './hooks/useTheme';

// Trang giới thiệu công khai (F3): chunk riêng, chỉ tải khi mở `/`
const Landing = lazy(() => import('./components/landing/Landing'));

axios.defaults.baseURL = API_URL;
applyWorkspaceHeader();

const ProtectedRoute = ({ isAuthenticated, children }) =>
  isAuthenticated ? children : <Navigate to="/login" replace />;

/**
 * KHUNG ỨNG DỤNG
 * Thanh bên áp sát mép trái; vùng nội dung cuộn riêng với thanh trên dính.
 * Ctrl+K mở bảng lệnh ở mọi trang.
 */
const MainLayout = ({ children, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readStorage('sidebarCollapsed') === 'true');
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => writeStorage('sidebarCollapsed', collapsed), [collapsed]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeCommand = useCallback(() => setCommandOpen(false), []);

  return (
    <>
      <div className="flex min-h-screen">
        <Sidebar
          onLogout={onLogout}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
        <main className={`main-content ${collapsed ? 'is-collapsed' : ''}`}>
          <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenCommand={() => setCommandOpen(true)} />
          {/* Chuyển trang: View Transitions khi trình duyệt có, không thì mờ dần như cũ */}
          <RouteTransition>
            <ErrorBoundary>{children}</ErrorBoundary>
          </RouteTransition>
        </main>
      </div>
      <CommandPalette open={commandOpen} onClose={closeCommand} onLogout={onLogout} />
      <Assistant />
    </>
  );
};

function App() {
  // Lần đầu mở vẫn vào thẳng bảng điều khiển (bản demo cho giám khảo), nhưng
  // đã đăng xuất thì phải nhớ — trước đây tải lại trang là tự đăng nhập lại.
  const [isAuthenticated, setIsAuthenticated] = useState(() => readStorage('isAuthenticated') !== 'false');

  const handleLogin = () => {
    setIsAuthenticated(true);
    writeStorage('isAuthenticated', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    writeStorage('isAuthenticated', 'false');
  };

  const page = (el) => (
    <ProtectedRoute isAuthenticated={isAuthenticated}>
      <MainLayout onLogout={handleLogout}>{el}</MainLayout>
    </ProtectedRoute>
  );

  return (
    <Router>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />} />
        <Route
          path="/"
          element={
            <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
              <Landing isAuthenticated={isAuthenticated} />
            </Suspense>
          }
        />
        <Route path="/dashboard" element={page(<Dashboard />)} />
        <Route path="/insights" element={page(<Insights />)} />
        <Route path="/risk" element={page(<RiskCenter />)} />
        <Route path="/feedbacks" element={page(<Feedbacks />)} />
        <Route path="/live" element={page(<Live />)} />
        <Route path="/analytics" element={page(<Analytics />)} />
        <Route path="/alerts" element={<Navigate to="/risk" replace />} />
        <Route path="/segments" element={<Navigate to="/analytics?tab=segments" replace />} />
        <Route path="/trust" element={page(<TrustLayerPage />)} />
        <Route path="/lab" element={page(<Lab />)} />
        <Route path="/data" element={page(<DataSources />)} />
        <Route path="/reports" element={page(<Reports />)} />
        <Route path="/settings" element={page(<SettingsPage />)} />
        <Route path="/ui-kit" element={page(<UiKit />)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
