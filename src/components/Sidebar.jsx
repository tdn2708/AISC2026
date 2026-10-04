import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PanelLeftClose, PanelLeftOpen, LogOut, Settings, ChevronsUpDown, Cpu, X } from 'lucide-react';
import Logo, { LogoMark } from './Logo';
import { NAV } from '../lib/nav';
import { initials } from '../lib/format';

/**
 * THANH BÊN — kính nổi cách mép, đồng thời là MỘT MẶT ĐỒNG HỒ: mở máy lên
 * là thấy ngay bao nhiêu cảnh báo đang chờ, hàng đợi kiểm duyệt còn bao
 * nhiêu, dữ liệu khoẻ tới đâu và bộ phân loại đang chạy bằng gì.
 * Số liệu lấy từ /api/nav/status — endpoint nhẹ, chỉ trả số đếm.
 */

const STATUS_POLL_MS = 60000;

const NavItem = ({ item, collapsed, count, critical, onNavigate }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? `${item.label}${count ? ` (${count})` : ''}` : undefined}
      className={({ isActive }) =>
        `group relative flex h-10 items-center rounded-xl text-[0.86rem] transition-[background-color,color,box-shadow] duration-150 ${
          collapsed ? 'justify-center' : 'gap-3 px-3'
        } ${
          isActive
            ? 'bg-surface/90 font-semibold text-ink-hi shadow-[0_1px_2px_rgb(31_45_53/0.06),0_6px_16px_-10px_rgb(31_45_53/0.35)]'
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
              className={`rounded-full px-1.5 py-px font-mono text-[0.66rem] font-semibold ${
                critical ? 'bg-crit text-white' : 'bg-raised text-ink-mid'
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

const Sidebar = ({ onLogout, isOpen, onClose, collapsed = false, onToggleCollapse }) => {
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

  useEffect(() => {
    let alive = true;
    const load = () => {
      // Hai yêu cầu song song: /nav/status chạy Trust Layer trên cả kho nên
      // chậm, không được bắt trạng thái mô hình chờ theo nó
      axios.get('/nav/status').then((r) => alive && setStatus(r.data)).catch(() => alive && setStatus(null));
      axios.get('/nlp/status').then((r) => alive && setNlp(r.data)).catch(() => alive && setNlp(null));
    };
    load();
    const id = setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const counts = { alerts: status?.openAlerts || null, queue: status?.reviewQueue || null };
  const health = status?.dataHealth;
  const healthTone = health == null ? 'bg-ink-lo' : health >= 75 ? 'bg-ok' : health >= 50 ? 'bg-high' : 'bg-crit';
  const healthText = health == null ? 'text-ink-lo' : health >= 75 ? 'text-ok' : health >= 50 ? 'text-high' : 'text-crit';

  const nlpView =
    nlp === undefined
      ? { dot: 'bg-ink-lo', label: 'Đang kiểm tra…', title: 'Đang hỏi trạng thái dịch vụ mô hình' }
      : !nlp || !nlp.reachable
        ? { dot: 'bg-ink-lo', label: 'Đang dùng bộ luật', title: nlp?.reason || 'Chưa kết nối dịch vụ ViSoBERT' }
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
          {collapsed ? <LogoMark size={36} /> : <Logo size="sm" />}
          <button
            type="button"
            onClick={isOpen ? onClose : onToggleCollapse}
            aria-label={isOpen ? 'Đóng menu' : collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="grid size-8 place-items-center rounded-lg text-ink-lo transition-colors hover:bg-raised hover:text-ink-hi"
          >
            {isOpen ? <X size={16} /> : collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Điều hướng */}
        <nav className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-3 ${collapsed ? 'px-3' : 'px-3'}`}>
          {NAV.map((g, gi) => (
            <div key={g.group} className={gi === 0 ? 'mt-1' : 'mt-5'}>
              {collapsed ? (
                gi > 0 && <div className="mx-2 mb-3 h-px bg-line-soft" />
              ) : (
                <p className="eyebrow mb-1.5 px-3">{g.group}</p>
              )}
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
            <div className="flex flex-col items-center gap-2 py-2" title={`Sức khoẻ dữ liệu ${health ?? '—'} · ${nlpView.label}`}>
              <span className={`size-2 rounded-full ${healthTone}`} />
              <span className={`size-2 rounded-full ${nlpView.dot}`} />
            </div>
          ) : (
            <div className="rounded-2xl border border-line-soft bg-surface/55 p-3">
              <div className="flex items-center justify-between text-[0.72rem]">
                <span className="text-ink-mid">Sức khoẻ dữ liệu</span>
                <span className={`font-mono font-semibold ${healthText}`}>{health ?? '—'}<span className="text-ink-lo">/100</span></span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised">
                <div className={`h-full rounded-full ${healthTone} transition-[width] duration-700`} style={{ width: `${health ?? 0}%` }} />
              </div>
              <button
                type="button"
                onClick={() => navigate('/lab')}
                title={nlpView.title}
                className="mt-2.5 flex w-full items-center gap-2 text-left text-[0.72rem] text-ink-mid hover:text-ink-hi"
              >
                <Cpu size={12} className="shrink-0 text-ink-lo" aria-hidden="true" />
                <span className="flex-1 truncate">{nlpView.label}</span>
                <span className={`size-1.5 shrink-0 rounded-full ${nlpView.dot}`} />
              </button>
              {updatedAt && <p className="mt-1 font-mono text-[0.66rem] text-ink-lo">cập nhật {updatedAt}</p>}
            </div>
          )}
        </div>

        {/* Người dùng */}
        <div className="relative shrink-0 border-t border-line-soft p-3" ref={menuRef}>
          {showMenu && (
            <div className="glass-strong absolute right-3 bottom-[calc(100%+6px)] left-3 z-10 min-w-[200px] rounded-2xl p-1.5 animate-pop-in">
              <div className="border-b border-line-soft px-3 py-2">
                <p className="text-[0.7rem] text-ink-lo">Đang đăng nhập</p>
                <p className="truncate text-sm font-medium text-ink-hi">{profile.email}</p>
              </div>
              <button
                type="button"
                onClick={() => { navigate('/settings'); setShowMenu(false); }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-hi hover:bg-raised"
              >
                <Settings size={15} className="text-ink-lo" /> Cài đặt
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-crit hover:bg-crit/10"
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
            className={`flex w-full items-center rounded-xl p-1.5 transition-colors hover:bg-raised ${collapsed ? 'justify-center' : 'gap-2.5'}`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-blush to-sky text-[0.7rem] font-semibold text-ink-hi">
              {initials(profile.name)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[0.82rem] font-medium text-ink-hi">{profile.name}</span>
                  <span className="block truncate text-[0.7rem] text-ink-lo">Quản lý trải nghiệm KH</span>
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
