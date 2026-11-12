import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { PanelLeftClose, PanelLeftOpen, LogOut, Settings, ChevronsUpDown, Cpu, X, Database, Check, ShieldCheck } from 'lucide-react';
import { Popover, MenuItem } from './ui';
import Logo, { LogoMark } from './Logo';
import { NAV } from '../lib/nav';
import { WORKSPACES, getWorkspace, switchWorkspace } from '../lib/workspace';
import { initials } from '../lib/format';
import { useBrowserModelStatus } from '../lib/analyze';
import { useRefreshing, useDataVersion, reportRefreshing } from '../lib/dataVersion';
import { useReducedMotion } from './motion';
import { Skeleton } from './ui/Skeleton';

/**
 * THANH BÊN — áp sát mép trái: kho dữ liệu đang xem, sáu trang chính (kèm
 * số cảnh báo chờ và hàng đợi kiểm duyệt), sức khỏe dữ liệu, bộ phân loại
 * đang chạy bằng gì, và menu người dùng.
 * Số liệu lấy từ /api/nav/status — endpoint nhẹ, chỉ trả số đếm.
 */

const STATUS_POLL_MS = 60000;
// Máy chủ đang tính lại số liệu sau một thao tác ghi: hỏi dày hơn để trang tự tải lại ngay khi xong
const REFRESH_POLL_MS = 4000;

/**
 * CHỌN KHO DỮ LIỆU — đặt ngay dưới logo như ô chọn tổ chức của phần mềm
 * doanh nghiệp: nó đổi nguồn số liệu của MỌI trang. Sau này mỗi doanh
 * nghiệp là một kho. Kho thật có chấm màu nhấn để không ai nhầm hai kho.
 */
const WorkspacePicker = ({ collapsed }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = getWorkspace();

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
    <div ref={ref} className={`relative shrink-0 ${collapsed ? 'px-3' : 'px-3'} pb-2`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={collapsed ? `Kho dữ liệu: ${WORKSPACES[current].label}` : undefined}
        className={`flex w-full items-center rounded-ctrl border border-line bg-surface text-left transition-colors hover:border-ink-lo ${collapsed ? 'h-10 justify-center' : 'gap-2.5 px-3 py-1.5'}`}
      >
        <Database size={15} className="shrink-0 text-ink-lo" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-lo">Kho dữ liệu</span>
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-hi">
                {WORKSPACES[current].label}
              </span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-ink-lo" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <Popover
          as="ul"
          role="listbox"
          aria-label="Kho dữ liệu"
          className="absolute top-[calc(100%-2px)] left-3 w-[248px] list-none"
        >
          {Object.entries(WORKSPACES).map(([key, ws]) => (
            <li key={key} role="option" aria-selected={key === current}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  switchWorkspace(key);
                }}
                className={`flex w-full items-start gap-2.5 rounded-ctrl px-2.5 py-2 text-left transition-colors duration-micro ease-out ${key === current ? 'bg-accent-dim' : 'hover:bg-raised'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-hi">{ws.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-lo">{ws.hint}</span>
                </span>
                {key === current && <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </Popover>
      )}
    </div>
  );
};

const NavItem = ({ item, collapsed, count, critical, onNavigate }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? `${item.label}${count ? ` (${count})` : ''}` : undefined}
      className={({ isActive }) =>
        // Nền "đang ở trang này" là dấu trượt chung của cả danh sách (NavList), không vẽ ở từng mục
        `group relative z-[1] flex h-10 items-center rounded-ctrl text-sm transition-colors duration-micro ease-out ${
          collapsed ? 'justify-center' : 'gap-3 px-3'
        } ${isActive ? 'font-semibold text-ink-hi' : 'text-ink-mid hover:bg-raised hover:text-ink-hi'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={`shrink-0 ${isActive ? 'text-accent' : 'text-ink-lo group-hover:text-ink-mid'}`} aria-hidden="true" />
          {!collapsed && <span className="flex-1 truncate">{item.short || item.label}</span>}
          {!collapsed && count ? (
            <span
              className={`rounded-ctrl px-1.5 py-px text-xs font-semibold tabular-nums ${
                critical ? 'bg-crit text-on-crit' : 'bg-raised text-ink-mid'
              }`}
            >
              {count}
            </span>
          ) : null}
          {collapsed && count ? (
            <span className={`absolute top-0.5 right-0.5 min-w-4 rounded-ctrl px-1 text-center text-xs leading-4 font-semibold tabular-nums ${critical ? 'bg-crit text-on-crit' : 'bg-raised text-ink-mid'}`} aria-hidden="true">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
};

/*
 * DẤU "ĐANG Ở TRANG NÀY" (F4-01): một khối nền nhấn nhạt + vạch nhấn 3px,
 * dùng chung cho cả danh sách, trượt dọc (transform: translateY) tới mục
 * mới thay vì nhảy. Xa hơn hai mục thì chạy --motion-medium, gần thì
 * --motion-short, ease-out. Giảm chuyển động: nhảy thẳng, không trượt.
 * Khung trang có thể dựng lại thanh bên khi đổi trang, nên vị trí cũ giữ ở
 * biến cấp module: thanh bên mới đặt dấu ở chỗ cũ rồi mới trượt tới chỗ mới.
 * Trang không nằm trên thanh bên (Báo cáo, Cài đặt...) thì dấu ẩn.
 */
const ROW = 42; // h-10 + gap-0.5
let lastMarkY = null;

const NavList = ({ items, children }) => {
  const { pathname } = useLocation();
  const listRef = useRef(null);
  const markRef = useRef(null);
  const reduced = useReducedMotion();

  // animate=false: đặt thẳng (lần đầu, giảm chuyển động, thanh bên vừa hiện lại)
  const place = (animate) => {
    const list = listRef.current;
    const mark = markRef.current;
    if (!list || !mark) return;
    const active = list.querySelector('a[aria-current="page"]');
    // Thanh bên đang ẩn (điện thoại, menu đóng): chưa đo được, đợi nó hiện
    if (!list.offsetParent) return;
    if (!active) {
      mark.style.transition = 'none';
      mark.style.opacity = '0';
      mark.dataset.hidden = '1';
      lastMarkY = null;
      return;
    }
    const y = active.offsetTop;
    const from = mark.dataset.y != null ? Number(mark.dataset.y) : lastMarkY;
    const wasHidden = mark.dataset.hidden === '1';
    // Đo lại mà dấu đã đúng chỗ (hoặc đang trượt tới đó): để yên
    if (!animate && !wasHidden && mark.dataset.y === String(y)) return;
    mark.dataset.y = String(y);
    delete mark.dataset.hidden;
    lastMarkY = y;
    mark.style.opacity = '1';
    if (!animate || reduced || from == null || from === y || wasHidden) {
      mark.style.transition = 'none';
      mark.style.transform = `translateY(${y}px)`;
      return;
    }
    // Đặt ở chỗ cũ (không chuyển tiếp), ép trình duyệt ghi nhận, rồi trượt
    mark.style.transition = 'none';
    mark.style.transform = `translateY(${from}px)`;
    mark.getBoundingClientRect();
    const far = Math.abs(y - from) > ROW * 2;
    mark.style.transition = `transform var(${far ? '--motion-medium' : '--motion-short'}) var(--ease-out)`;
    mark.style.transform = `translateY(${y}px)`;
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  useLayoutEffect(() => {
    placeRef.current(true);
  }, [pathname, reduced, items]);

  // Menu điện thoại mở ra (display: none sang hiện) thì đo lại, không trượt
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => placeRef.current(false));
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={listRef} className="relative flex flex-col gap-0.5">
      <span
        ref={markRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 left-0 h-10 rounded-ctrl bg-accent-dim before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r-ctrl before:bg-accent"
        style={{ opacity: 0 }}
      />
      {children}
    </div>
  );
};

const Sidebar = ({ onLogout, isOpen, onClose, collapsed: collapsedPref = false, onToggleCollapse }) => {
  // Trạng thái "thu gọn" là lựa chọn trên màn rộng. Menu trượt trên điện thoại
  // (isOpen) luôn hiện đầy đủ chữ — nếu không, ai đã thu gọn trên máy tính
  // sẽ thấy menu điện thoại chỉ còn biểu tượng trong một khung rộng 248px.
  const collapsed = collapsedPref && !isOpen;
  const [showMenu, setShowMenu] = useState(false);
  const [status, setStatus] = useState(null);
  // undefined = đang kiểm tra lần đầu; null = không lấy được trạng thái
  const [nlp, setNlp] = useState(undefined);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Tên và email lấy từ Cài đặt → Hồ sơ; cập nhật ngay khi người dùng lưu
  const readProfile = () => {
    try {
      const s = JSON.parse(localStorage.getItem('crSettings') || '{}');
      return { name: s.name || 'Admin User', email: s.email || 'admin@company.com' };
    } catch {
      return { name: 'Admin User', email: 'admin@company.com' };
    }
  };
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => {
    const onChange = () => setProfile(readProfile());
    window.addEventListener('cr-settings', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('cr-settings', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setShowMenu(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const refreshing = useRefreshing();
  const dataVersion = useDataVersion();

  useEffect(() => {
    let alive = true;
    const load = () => {
      // Hai yêu cầu song song: /nav/status chạy Trust Layer trên cả kho nên
      // chậm, không được bắt trạng thái mô hình chờ theo nó
      axios.get('/nav/status').then((r) => {
        if (!alive) return;
        setStatus(r.data);
        reportRefreshing(r.data?.refreshing);
      }).catch(() => alive && setStatus(null));
      axios.get('/nlp/status').then((r) => alive && setNlp(r.data)).catch(() => alive && setNlp(null));
    };
    load();
    const id = setInterval(load, refreshing ? REFRESH_POLL_MS : STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshing, dataVersion]);

  const counts = { alerts: status?.openAlerts || null, queue: status?.reviewQueue || null };
  const health = status?.dataHealth;
  const healthText = health == null ? 'text-ink-lo' : health >= 75 ? 'text-ok' : health >= 50 ? 'text-high' : 'text-crit';

  // Máy chủ không có mô hình nhưng trình duyệt đã nạp bản ONNX: nói đúng điều đó
  const browserModel = useBrowserModelStatus();
  const nlpView =
    browserModel.phase === 'ready' && !nlp?.canLabel
      ? { dot: 'bg-ok', label: 'ViSoBERT trên trình duyệt', title: 'Mô hình chạy ngay trên máy này, không qua máy chủ mô hình' }
      : nlp === undefined
      ? { dot: 'bg-ink-lo', label: 'Đang hỏi trạng thái mô hình', title: 'Đang hỏi trạng thái dịch vụ mô hình', pending: true }
      : !nlp || !nlp.reachable
        ? { dot: 'bg-ink-lo', label: 'AI chế độ cơ bản', title: nlp?.reason || 'Chưa kết nối dịch vụ ViSoBERT' }
        : nlp.canLabel
          ? { dot: 'bg-ok', label: 'ViSoBERT đang chạy', title: `Đầu vào ${nlp.inputMode}` }
          : { dot: 'bg-high', label: 'ViSoBERT chưa tinh chỉnh', title: nlp.reason };

  const updatedAt = status?.computedAt
    ? new Date(status.computedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'visible' : ''}`} onClick={onClose} />

      <aside
        className={`sidebar-container cx ${isOpen ? 'open' : ''}`}
        style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
        aria-label="Điều hướng chính"
      >
        {/* Thương hiệu + thu gọn */}
        <div className={`flex shrink-0 items-center pt-4 pb-3 ${collapsed ? 'flex-col gap-3 px-0' : 'justify-between pr-3 pl-4'}`}>
          {collapsed ? <LogoMark size={28} /> : <Logo size="sm" showTagline={false} />}
          <button
            type="button"
            onClick={isOpen ? onClose : onToggleCollapse}
            aria-label={isOpen ? 'Đóng menu' : collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className={`grid place-items-center rounded-ctrl text-ink-lo transition-colors hover:bg-raised hover:text-ink-hi ${isOpen ? 'size-10' : 'size-8'}`}
          >
            {isOpen ? <X size={16} /> : collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <WorkspacePicker collapsed={collapsed} />

        {/* Điều hướng — sáu mục, không cần nhãn nhóm */}
        <nav aria-label="Trang" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
          {NAV.map((g) => (
            <div key={g.group} className="mt-2">
              <NavList items={g.items}>
                {g.items.map((item) => (
                  <NavItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    count={item.badge ? counts[item.badge] : null}
                    critical={item.badge === 'alerts' && status?.criticalAlerts > 0}
                    onNavigate={onClose}
                  />
                ))}
              </NavList>
            </div>
          ))}
        </nav>

        {/* Dải trạng thái hệ thống */}
        <div className="shrink-0 px-3 pb-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-2" title={`Sức khoẻ dữ liệu ${health ?? '—'}, ${nlpView.label}`}>
              <ShieldCheck size={16} className={healthText} aria-hidden="true" />
              <Cpu size={16} className={nlpView.dot.replace('bg-', 'text-')} aria-hidden="true" />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/trust')}
                title={updatedAt ? `Tính lúc ${updatedAt}` : undefined}
                className="flex w-full items-center gap-2 rounded-ctrl px-3 py-1.5 text-left text-xs text-ink-mid hover:bg-raised hover:text-ink-hi"
              >
                <ShieldCheck size={13} className="shrink-0 text-ink-lo" aria-hidden="true" />
                <span className="flex-1">Độ tin số liệu</span>
                <span className={`font-semibold tabular-nums ${healthText}`}>{health ?? '—'}</span>
              </button>
              {/* Lối vào Phòng thí nghiệm: ai quan tâm mô hình đang chạy bằng gì thì bấm vào đây */}
              <button
                type="button"
                onClick={() => navigate('/lab')}
                title={nlpView.title}
                className="flex w-full items-center gap-2 rounded-ctrl px-3 py-1.5 text-left text-xs text-ink-mid hover:bg-raised hover:text-ink-hi"
              >
                <Cpu size={13} className="shrink-0 text-ink-lo" aria-hidden="true" />
                {nlpView.pending ? (
                  <span className="flex-1"><span className="sr-only">{nlpView.label}</span><Skeleton className="h-3 w-28" /></span>
                ) : (
                  <span className="flex-1 truncate">{nlpView.label}</span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Người dùng */}
        <div className="relative shrink-0 border-t border-line-soft p-3" ref={menuRef}>
          {showMenu && (
            <Popover className="absolute right-3 bottom-[calc(100%+6px)] left-3 min-w-[200px]">
              <div className="border-b border-line-soft px-3 py-2">
                <p className="text-xs text-ink-lo">Đang đăng nhập</p>
                <p className="truncate text-sm font-medium text-ink-hi">{profile.email}</p>
              </div>
              <MenuItem icon={Settings} onClick={() => { navigate('/settings'); setShowMenu(false); }} className="mt-1">
                Cài đặt
              </MenuItem>
              {onLogout && (
                <MenuItem icon={LogOut} onClick={onLogout} className="text-crit! hover:bg-crit/10!">
                  Đăng xuất
                </MenuItem>
              )}
            </Popover>
          )}
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-expanded={showMenu}
            title={collapsed ? profile.name : undefined}
            className={`flex w-full items-center rounded-ctrl p-1.5 transition-colors hover:bg-raised ${collapsed ? 'justify-center' : 'gap-2.5'}`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-dim text-xs font-semibold text-accent-hi">
              {initials(profile.name)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-ink-hi">{profile.name}</span>
                  <span className="block truncate text-xs text-ink-lo">Quản lý trải nghiệm KH</span>
                </span>
                <ChevronsUpDown size={14} className="shrink-0 text-ink-lo" />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
