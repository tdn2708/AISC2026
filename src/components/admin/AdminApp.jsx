import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ExternalLink, LogOut, Moon, Sun } from 'lucide-react';
import { LogoMark } from '../Logo';
import AppAtmosphere from '../shell/AppAtmosphere';
import ErrorBoundary from '../ErrorBoundary';
import { Button, IconButton, MenuItem, Popover, Tabs } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { getSession, isAdmin, logout, refreshAccount, safeNext } from '../../lib/auth';
import ForcePasswordChange from '../auth/ForcePasswordChange';
import AdminLogin from './AdminLogin';
import AdminForbidden from './AdminForbidden';
import Overview from './Overview';
import Accounts from './Accounts';
import AuditLog from './AuditLog';
import Billing from './Billing';

/**
 * PHẦN QUẢN TRỊ MÁY CHỦ (/admin/*) — tải tách riêng (lazy) khỏi ứng dụng thường.
 * Gồm trang đăng nhập riêng (/admin/login), cổng kiểm quyền (AdminRoute) và
 * khung thanh trên (AdminLayout, mục 5.4).
 */

const ADMIN_TABS = [
  { value: 'overview', label: 'Tổng quan', path: '/admin', title: 'Máy chủ | Customer Radar' },
  { value: 'users', label: 'Tài khoản', path: '/admin/users', title: 'Tài khoản | Customer Radar' },
  { value: 'billing', label: 'Thanh toán', path: '/admin/billing', title: 'Thanh toán | Customer Radar' },
  { value: 'audit', label: 'Nhật ký', path: '/admin/audit', title: 'Nhật ký | Customer Radar' }
];

const tabFromPath = (pathname) => {
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname.startsWith('/admin/billing')) return 'billing';
  return 'overview';
};

const useAuthSession = () => {
  const [session, setSession] = useState(() => getSession());
  useEffect(() => {
    const sync = () => setSession(getSession());
    window.addEventListener('cr-auth', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cr-auth', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return session;
};

const AccountMenu = ({ user, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 pointer-coarse:h-10 items-center gap-1.5 rounded-ctrl border border-line bg-surface px-2.5 text-xs font-medium text-ink-hi transition-[background-color,border-color,color] duration-micro ease-out hover:border-accent hover:text-accent-hi"
      >
        <span className="hidden max-w-[140px] truncate sm:inline">{user?.name || 'Quản trị máy chủ'}</span>
        <span className="sm:hidden">Quản trị</span>
        <ChevronDown size={14} className="shrink-0 text-ink-lo" aria-hidden="true" />
      </button>
      {open && (
        <Popover role="menu" className="absolute top-[calc(100%+8px)] right-0 w-[240px] max-w-[calc(100vw-2rem)]">
          <div className="border-b border-line-soft px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-hi">{user?.name || 'Quản trị máy chủ'}</p>
            <p className="truncate text-xs text-ink-lo">{user?.email}</p>
          </div>
          <MenuItem
            icon={LogOut}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="mt-1 text-crit! hover:bg-crit/10!"
          >
            Đăng xuất
          </MenuItem>
        </Popover>
      )}
    </div>
  );
};

const AdminLayout = ({ user, children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const activeTab = tabFromPath(location.pathname);

  useEffect(() => {
    const tab = ADMIN_TABS.find((t) => t.value === activeTab) || ADMIN_TABS[0];
    document.title = tab.title;
  }, [activeTab]);

  const onTabChange = (val) => {
    const tab = ADMIN_TABS.find((t) => t.value === val);
    if (tab) navigate(tab.path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="cx min-h-screen min-h-dvh bg-canvas text-ink-hi">
      <AppAtmosphere />
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-ctrl focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-hi"
      >
        Bỏ qua tới nội dung
      </a>

      <header className="glass-chrome sticky top-0 z-[120] border-x-0 border-t-0">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-6">
              <Link to="/admin" className="flex min-w-0 items-center gap-2.5 rounded-ctrl">
                <LogoMark size={24} />
                <span className="truncate text-sm font-semibold text-ink-hi">Máy chủ Customer Radar</span>
              </Link>
              <div className="hidden min-[60rem]:block">
                <Tabs tabs={ADMIN_TABS} value={activeTab} onChange={onTabChange} className="border-b-0 pb-px" />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden min-[60rem]:contents">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => navigate('/dashboard')}
                >
                  Mở ứng dụng
                </Button>
              </span>
              <span className="min-[60rem]:hidden">
                <IconButton
                  icon={ExternalLink}
                  size="sm"
                  label="Mở ứng dụng"
                  onClick={() => navigate('/dashboard')}
                />
              </span>
              <IconButton
                icon={theme === 'dark' ? Sun : Moon}
                size="sm"
                label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              />
              <AccountMenu user={user} onLogout={handleLogout} />
            </div>
          </div>

          <div className="min-[60rem]:hidden">
            <Tabs tabs={ADMIN_TABS} value={activeTab} onChange={onTabChange} className="border-b-0 pt-0.5 pb-px" />
          </div>
        </div>
      </header>

      <main id="noi-dung" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 outline-none sm:px-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <ForcePasswordChange />
    </div>
  );
};

const AdminLoginGate = () => {
  const session = useAuthSession();
  const location = useLocation();
  if (session && isAdmin(session.user)) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={safeNext(next, session.user)} replace />;
  }
  return <AdminLogin />;
};

const AdminRoute = () => {
  const session = useAuthSession();
  const location = useLocation();

  useEffect(() => {
    if (getSession()) refreshAccount();
  }, []);

  if (!session) {
    const here = location.pathname + location.search;
    return <Navigate to={`/admin/login?next=${encodeURIComponent(here)}`} replace />;
  }
  if (!isAdmin(session.user)) {
    return <AdminForbidden />;
  }
  return (
    <AdminLayout user={session.user}>
      <Outlet />
    </AdminLayout>
  );
};

const AdminApp = () => (
  <Routes>
    <Route path="login" element={<AdminLoginGate />} />
    <Route element={<AdminRoute />}>
      <Route index element={<Overview />} />
      <Route path="users" element={<Accounts />}>
        <Route path=":id" element={null} />
      </Route>
      <Route path="billing" element={<Billing />} />
      <Route path="audit" element={<AuditLog />} />
    </Route>
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>
);

export default AdminApp;
