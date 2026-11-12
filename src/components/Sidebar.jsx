import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PanelLeftClose, PanelLeftOpen, LogOut, Settings, ChevronsUpDown, Cpu, X, Database, Check, ShieldCheck } from 'lucide-react';
import Logo, { LogoMark } from './Logo';
import { NAV } from '../lib/nav';
import { WORKSPACES, getWorkspace, switchWorkspace } from '../lib/workspace';
import { initials } from '../lib/format';
import { useBrowserModelStatus } from '../lib/analyze';
import { useRefreshing, useDataVersion, reportRefreshing } from '../lib/dataVersion';

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
        className={`flex w-full items-center rounded-lg border border-line bg-surface text-left transition-colors hover:border-ink-lo ${collapsed ? 'h-10 justify-center' : 'gap-2.5 px-3 py-2'}`}
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
        <ul
          role="listbox"
          aria-label="Kho dữ liệu"
          className="glass-strong absolute top-[calc(100%-2px)] left-3 z-20 w-[248px] list-none rounded-xl p-1.5 animate-pop-in"
        >
          {Object.entries(WORKSPACES).map(([key, ws]) => (
            <li key={key} role="option" aria-selected={key === current}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  switchWorkspace(key);
                }}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-raised"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-hi">{ws.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-lo">{ws.hint}</span>
                </span>
                {key === current && <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
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
        `group relative flex h-10 items-center rounded-lg text-sm transition-[background-color,color,box-shadow] duration-150 ${
          collapsed ? 'justify-center' : 'gap-3 px-3'
        } ${
          isActive
            ? 'bg-accent-dim font-semibold text-ink-hi before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r before:bg-accent'
            : 'text-ink-mid hover:bg-raised hover:text-ink-hi'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={`shrink-0 ${isActive ? 'text-accent' : 'text-ink-lo group-hover:text-ink-mid'}`} aria-hidden="true" />
          {!collapsed && <span className="flex-1 truncate">{item.short || item.label}</span>}
          {!collapsed && count ? (
            <span
              className={`rounded px-1.5 py-px font-mono text-xs font-semibold ${
                critical ? 'bg-crit text-on-crit' : 'bg-raised text-ink-mid'
              }`}
            >
              {count}
            </span>
          ) : null}
          {collapsed && count ? (
            <span className={`absolute top-1.5 right-3 size-2 rounded-full ${critical ? 'bg-crit' : 'bg-accent'}`} />
          ) : null}
        </>
      )}
    </NavLink>
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
  const healthTone = health == null ? 'bg-ink-lo' : health >= 75 ? 'bg-ok' : health >= 50 ? 'bg-high' : 'bg-crit';
  const healthText = health == null ? 'text-ink-lo' : health >= 75 ? 'text-ok' : health >= 50 ? 'text-high' : 'text-crit';

  // Máy chủ không có mô hình nhưng trình duyệt đã nạp bản ONNX: nói đúng điều đó
  const browserModel = useBrowserModelStatus();
  const nlpView =
    browserModel.phase === 'ready' && !nlp?.canLabel
      ? { dot: 'bg-ok', label: 'ViSoBERT trên trình duyệt', title: 'Mô hình chạy ngay trên máy này, không qua máy chủ mô hình' }
      : nlp === undefined
      ? { dot: 'bg-ink-lo', label: 'Đang kiểm tra…', title: 'Đang hỏi trạng thái dịch vụ mô hình' }
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
            className={`grid place-items-center rounded-lg text-ink-lo transition-colors hover:bg-raised hover:text-ink-hi ${isOpen ? 'size-10' : 'size-8'}`}
          >
            {isOpen ? <X size={16} /> : collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <WorkspacePicker collapsed={collapsed} />

        {/* Điều hướng — sáu mục, không cần nhãn nhóm */}
        <nav aria-label="Trang" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
          {NAV.map((g) => (
            <div key={g.group} className="mt-2">
              <div className="flex flex-col gap-0.5">
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
              </div>
            </div>
          ))}
        </nav>

        {/* Dải trạng thái hệ thống */}
        <div className="shrink-0 px-3 pb-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-2" title={`Sức khoẻ dữ liệu ${health ?? '—'}, ${nlpView.label}`}>
              <span className={`size-2 rounded-full ${healthTone}`} />
              <span className={`size-2 rounded-full ${nlpView.dot}`} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/trust')}
                title={updatedAt ? `Tính lúc ${updatedAt}` : undefined}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-ink-mid hover:bg-raised hover:text-ink-hi"
              >
                <ShieldCheck size={13} className="shrink-0 text-ink-lo" aria-hidden="true" />
                <span className="flex-1">Độ tin số liệu</span>
                <span className={`font-mono font-semibold ${healthText}`}>{health ?? '—'}</span>
              </button>
              {/* Lối vào Phòng thí nghiệm: ai quan tâm mô hình đang chạy bằng gì thì bấm vào đây */}
              <button
                type="button"
                onClick={() => navigate('/lab')}
                title={nlpView.title}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-ink-mid hover:bg-raised hover:text-ink-hi"
              >
                <Cpu size={13} className="shrink-0 text-ink-lo" aria-hidden="true" />
                <span className="flex-1 truncate">{nlpView.label}</span>
              </button>
            </div>
          )}
        </div>

        {/* Người dùng */}
        <div className="relative shrink-0 border-t border-line-soft p-3" ref={menuRef}>
          {showMenu && (
            <div className="glass-strong absolute right-3 bottom-[calc(100%+6px)] left-3 z-10 min-w-[200px] rounded-xl p-1.5 animate-pop-in">
              <div className="border-b border-line-soft px-3 py-2">
                <p className="text-xs text-ink-lo">Đang đăng nhập</p>
                <p className="truncate text-sm font-medium text-ink-hi">{profile.email}</p>
              </div>
              <button
                type="button"
                onClick={() => { navigate('/settings'); setShowMenu(false); }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-hi hover:bg-raised"
              >
                <Settings size={15} className="text-ink-lo" /> Cài đặt
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-crit hover:bg-crit/10"
                >
                  <LogOut size={15} /> Đăng xuất
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-expanded={showMenu}
            title={collapsed ? profile.name : undefined}
            className={`flex w-full items-center rounded-lg p-1.5 transition-colors hover:bg-raised ${collapsed ? 'justify-center' : 'gap-2.5'}`}
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
