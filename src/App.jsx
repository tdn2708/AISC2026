import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Topbar from './components/shell/Topbar';
import CommandPalette from './components/shell/CommandPalette';
import Assistant from './components/shell/Assistant';
import AppAtmosphere from './components/shell/AppAtmosphere';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import AuthShell from './components/auth/AuthShell';
import AuthChoice from './components/auth/AuthChoice';
import Signup from './components/auth/Signup';
import ForcePasswordChange from './components/auth/ForcePasswordChange';
import { applyAuthHeader, currentAccount, getSession, logout, refreshAccount, safeNext } from './lib/auth';
// Bộ giao diện chỉ có ở bản dev: lazy để bản build bỏ hẳn trang này
const UiKit = import.meta.env.DEV ? lazy(() => import('./components/UiKit')) : null;
import { API_URL } from './config';
import { readStorage, writeStorage } from './lib/storage';
import { applyWorkspaceHeader } from './lib/workspace';
import ErrorBoundary from './components/ErrorBoundary';
import { RouteTransition } from './components/motion/RouteTransition';
import { findPage } from './lib/nav';
import { lazyPage, preloadPages } from './lib/lazyPage';
import { Skeleton, SkeletonBlock } from './components/ui/Skeleton';
import { NoDataNotice } from './components/shell/StartGuide';
import './hooks/useTheme';

// Trang giới thiệu công khai (F3): chunk riêng, chỉ tải khi mở `/`
const Landing = lazy(() => import('./components/landing/Landing'));
// Bàn điều khiển máy chủ (/admin/*): chunk riêng, người thường không tải mã quản trị
const AdminApp = lazy(() => import('./components/admin/AdminApp'));

// Tổng quan nằm trong gói chính (trang mở đầu tiên sau đăng nhập). Các trang
// còn lại là gói riêng, tải ngầm khi trình duyệt rảnh (lib/lazyPage.js).
const Butler = lazyPage(() => import('./components/Butler'));
const Insights = lazyPage(() => import('./components/Insights'));
const RiskCenter = lazyPage(() => import('./components/RiskCenter'));
const Feedbacks = lazyPage(() => import('./components/Feedbacks'));
const Live = lazyPage(() => import('./components/Live'));
const Analytics = lazyPage(() => import('./components/Analytics'));
const Cases = lazyPage(() => import('./components/Cases'));
const TrustLayerPage = lazyPage(() => import('./components/TrustLayer'));
const DataSources = lazyPage(() => import('./components/DataSources'));
const Lab = lazyPage(() => import('./components/Lab'));
const Reports = lazyPage(() => import('./components/Reports'));
const SettingsPage = lazyPage(() => import('./components/Settings'));

/** Chỗ giữ trong lúc gói của trang đang về (chỉ thấy khi mạng chậm, trước lượt tải ngầm) */
const PageFallback = () => (
  <SkeletonBlock label="Đang mở trang" className="px-4 pt-6 sm:px-8">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="mt-3 h-4 w-80 max-w-full" />
    <Skeleton className="mt-8 h-48 w-full rounded-surf" />
  </SkeletonBlock>
);

axios.defaults.baseURL = API_URL;
applyWorkspaceHeader();
applyAuthHeader();

/** Chưa đăng nhập: về trang chọn, nhớ trang đang muốn vào để đăng nhập xong quay lại đúng chỗ */
const ProtectedRoute = ({ isAuthenticated, children }) => {
  const location = useLocation();
  if (isAuthenticated) return children;
  const here = location.pathname + location.search;
  return <Navigate to={here === '/dashboard' ? '/auth' : `/auth?next=${encodeURIComponent(here)}`} replace />;
};

/** Ba trang tài khoản: đã đăng nhập thì đi tiếp tới trang đang chờ (?next=) hoặc trang nhà theo vai trò */
const AuthGate = ({ isAuthenticated }) => {
  const location = useLocation();
  if (!isAuthenticated) return <AuthShell />;
  return <Navigate to={safeNext(new URLSearchParams(location.search).get('next'), currentAccount())} replace />;
};

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
  // Tiêu đề tab theo trang: nhiều tab đang mở không còn cùng một chữ "Customer Radar"
  useEffect(() => {
    const page = findPage(location.pathname);
    document.title = page ? `${page.label} | Customer Radar` : 'Customer Radar';
  }, [location.pathname]);
  useEffect(() => writeStorage('sidebarCollapsed', collapsed), [collapsed]);
  // Đã vào app: tải ngầm các trang còn lại để lúc bấm sang không phải chờ
  useEffect(() => preloadPages(), []);

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
      <AppAtmosphere />
      {/* Lối tắt bàn phím: phím Tab đầu tiên nhảy qua thanh bên vào thẳng nội dung */}
      <a href="#noi-dung" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-ctrl focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-hi focus:shadow-lg">Bỏ qua tới nội dung</a>
      <div className="flex min-h-screen">
        <Sidebar
          onLogout={onLogout}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
        <main id="noi-dung" tabIndex={-1} className={`main-content outline-none ${collapsed ? 'is-collapsed' : ''}`}>
          <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenCommand={() => setCommandOpen(true)} />
          {/* Chuyển trang: View Transitions khi trình duyệt có, không thì mờ dần như cũ */}
          <RouteTransition>
            <ErrorBoundary>
              {/* Kho chưa có phản hồi nào: nói rõ số 0 là vì chưa có dữ liệu (đánh giá 16/11) */}
              <NoDataNotice />
              <Suspense fallback={<PageFallback />}>{children}</Suspense>
            </ErrorBoundary>
          </RouteTransition>
        </main>
      </div>
      <CommandPalette open={commandOpen} onClose={closeCommand} onLogout={onLogout} />
      <Assistant />
      <ForcePasswordChange />
    </>
  );
};

function App() {
  // Đăng nhập thật (lib/auth.js, backend/routes/auth.js): có phiên thì vào app,
  // không có thì về /auth. Người chỉ muốn xem bấm "Vào bằng tài khoản mẫu".
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getSession()));

  useEffect(() => {
    const onAuth = () => setIsAuthenticated(Boolean(getSession()));
    window.addEventListener('cr-auth', onAuth);
    // Phiên đã bị xóa ở máy chủ (đăng xuất ở máy khác, hết hạn): refreshAccount tự đăng xuất
    refreshAccount();
    return () => window.removeEventListener('cr-auth', onAuth);
  }, []);

  const handleLogout = () => {
    logout();
  };

  const page = (el) => (
    <ProtectedRoute isAuthenticated={isAuthenticated}>
      <MainLayout onLogout={handleLogout}>{el}</MainLayout>
    </ProtectedRoute>
  );

  return (
    <Router>
      <Routes>
        <Route element={<AuthGate isAuthenticated={isAuthenticated} />}>
          <Route path="/auth" element={<AuthChoice />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route
          path="/"
          element={
            <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
              {/* Có phiên đăng nhập: "Vào ứng dụng"; chưa có: "Đăng nhập" và "Xem bản dùng thử" (trang chọn) */}
              <Landing isAuthenticated={isAuthenticated} />
            </Suspense>
          }
        />
        <Route path="/dashboard" element={page(<Dashboard />)} />
        <Route path="/butler" element={page(<Butler />)} />
        <Route path="/insights" element={page(<Insights />)} />
        <Route path="/risk" element={page(<RiskCenter />)} />
        <Route path="/feedbacks" element={page(<Feedbacks />)} />
        <Route path="/live" element={page(<Live />)} />
        <Route path="/analytics" element={page(<Analytics />)} />
        <Route path="/cases" element={page(<Cases />)} />
        <Route path="/alerts" element={<Navigate to="/risk" replace />} />
        <Route path="/segments" element={<Navigate to="/analytics?tab=segments" replace />} />
        <Route path="/trust" element={page(<TrustLayerPage />)} />
        <Route path="/lab" element={page(<Lab />)} />
        <Route path="/data" element={page(<DataSources />)} />
        <Route path="/reports" element={page(<Reports />)} />
        <Route path="/settings" element={page(<SettingsPage />)} />
        {UiKit && <Route path="/ui-kit" element={page(<Suspense fallback={null}><UiKit /></Suspense>)} />}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
