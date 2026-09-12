import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Home, BarChart2, MessageSquare, AlertTriangle, Settings, Users, Database,
  FileText, LogOut, User, ChevronUp, ShieldCheck, FlaskConical,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import Logo, { LogoMark } from './Logo';

/**
 * THANH ĐIỀU HƯỚNG
 * ==================================================================
 * Bản cũ hỏng ở hai chỗ, và chỗ thứ hai mới là chỗ đáng nói.
 *
 * ------------------------------------------------------------------
 * 1. NÓ TRÀN KHỎI MÀN HÌNH TRÊN PHẦN LỚN LAPTOP.
 *
 * Đo trên chính bản cũ: phần điều hướng cần 669px chiều cao, trong khi
 * màn hình 800px chỉ chừa cho nó 596px. Tràn 73px. Ở màn 720px thì tràn
 * 153px, tức khoảng ba mục cuối bị cắt mất — đúng hiện tượng "Báo cáo"
 * bị che trong ảnh chụp.
 *
 * Nguyên nhân: mỗi mục cao 52px (padding 0.875rem trên dưới, chữ
 * 0.95rem, icon 20px), nhân 10 mục là 520px, cộng 97px khối logo và
 * 91px khối người dùng. Gần 190px chiều cao chỉ để trang trí hai đầu.
 *
 * Bản này hạ mục xuống 34px và nén hai đầu, tổng còn khoảng 570px —
 * vừa mọi laptop mà không cần cuộn.
 *
 * ------------------------------------------------------------------
 * 2. 260px CHIỀU RỘNG KHÔNG MANG MỘT THÔNG TIN NÀO.
 *
 * Đây mới là vấn đề kiến trúc. Thanh bên cũ chỉ là một danh sách liên
 * kết: nó chiếm một phần năm màn hình và nói với người dùng đúng bằng
 * không. Trong một sản phẩm giám sát, thanh điều hướng nên đồng thời là
 * MỘT MẶT ĐỒNG HỒ — mở máy lên là biết ngay có bao nhiêu cảnh báo đang
 * chờ, hàng đợi kiểm duyệt còn bao nhiêu, dữ liệu tươi tới đâu.
 *
 * Cảm giác "tech" đến từ chỗ đó, không đến từ hiệu ứng phát sáng.
 *
 * Số liệu lấy từ /api/nav/status — một endpoint riêng rất nhẹ, cố ý
 * không gọi thẳng /alerts hay /trust/queue vì hai endpoint đó trả về
 * toàn bộ nội dung kèm bằng chứng, trong khi ở đây chỉ cần con số đếm.
 */

/** Chu kỳ làm tươi trạng thái. Đủ chậm để không tạo tải, đủ nhanh để không nói dối. */
const STATUS_POLL_MS = 60000;

const SidebarItem = ({ icon, label, to, collapsed, badge, badgeTone = 'accent' }) => {
  const tones = {
    accent: { bg: 'var(--accent-dim)', fg: 'var(--accent-hi)' },
    crit: { bg: 'var(--sev-crit-dim)', fg: 'var(--sev-crit)' },
    muted: { bg: 'var(--raised)', fg: 'var(--text-lo)' }
  }[badgeTone];

  return (
    <NavLink
      to={to}
      title={collapsed ? label + (badge ? ` (${badge})` : '') : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? '0' : '0.7rem',
        /* 52px -> 34px. Đây là thay đổi gỡ được toàn bộ hiện tượng tràn. */
        padding: collapsed ? '0.5rem 0' : '0.45rem 0.75rem',
        justifyContent: collapsed ? 'center' : 'flex-start',
        cursor: 'pointer',
        color: isActive ? 'var(--accent-hi)' : 'var(--text-mid)',
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent-hi)' : '2px solid transparent',
        borderRadius: collapsed ? '0' : '0 var(--r-ctrl) var(--r-ctrl) 0',
        marginRight: collapsed ? 0 : '0.6rem',
        fontSize: '0.85rem',
        fontWeight: isActive ? 600 : 450,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transition:
          'background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)'
      })}
    >
      <span style={{ color: 'inherit', flexShrink: 0, display: 'flex' }}>{icon}</span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {/* Con số ngay trên mục điều hướng: người dùng biết có việc cần
              làm mà không phải bấm vào mới thấy. */}
          {badge ? (
            <span
              className="data-num"
              style={{
                flexShrink: 0, fontSize: '0.68rem', fontWeight: 600,
                padding: '1px 6px', borderRadius: 99,
                background: tones.bg, color: tones.fg, lineHeight: 1.6
              }}
            >
              {badge}
            </span>
          ) : null}
        </>
      )}
      {/* Ở trạng thái thu gọn, badge rút thành một chấm để không mất tín hiệu */}
      {collapsed && badge ? (
        <span style={{
          position: 'absolute', marginLeft: 18, marginTop: -14,
          width: 6, height: 6, borderRadius: 99, background: tones.fg
        }} />
      ) : null}
    </NavLink>
  );
};

/** Nhãn nhóm, kèm một đường kẻ mảnh để mắt bám vào cấu trúc */
const GroupLabel = ({ children, collapsed, first }) => {
  if (collapsed) {
    return <div style={{ margin: '0.6rem 0.9rem', borderTop: '1px solid var(--border-soft)' }} />;
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0 0.9rem', marginTop: first ? '0.25rem' : '1.1rem', marginBottom: '0.35rem'
    }}>
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.13em', color: 'var(--text-lo)', whiteSpace: 'nowrap'
      }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
    </div>
  );
};

const Sidebar = ({ onLogout, isOpen, onClose, collapsed = false, onToggleCollapse }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [status, setStatus] = useState(null);
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

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await axios.get('/nav/status');
        if (alive) setStatus(res.data);
      } catch {
        // Không lấy được trạng thái thì thanh bên vẫn phải điều hướng
        // được. Im lặng bỏ qua, và dải trạng thái tự chuyển sang "không
        // rõ" thay vì hiển thị một con số cũ như thể nó còn đúng.
        if (alive) setStatus(null);
      }
    };
    load();
    const id = setInterval(load, STATUS_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const health = status?.dataHealth;
  const healthTone =
    health == null ? 'var(--text-lo)'
      : health >= 75 ? 'var(--sev-ok)'
        : health >= 50 ? 'var(--sev-high)'
          : 'var(--sev-crit)';

  const updatedAt = status?.computedAt
    ? new Date(status.computedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null;

  const menuBtn = {
    width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '0.55rem 0.75rem', borderRadius: 'var(--r-ctrl)',
    background: 'transparent', color: 'var(--text-hi)', fontFamily: 'inherit',
    border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.84rem',
    transition: 'background-color var(--dur-fast) var(--ease)'
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'visible' : ''}`} onClick={onClose} />

      <aside
        className={`sidebar-container ${isOpen ? 'open' : ''}`}
        style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
      >
        {/* Khối thương hiệu, kèm nút thu gọn NHÌN THẤY ĐƯỢC.
            Bản cũ giấu chức năng này sau một dải kéo rộng 6px trong suốt
            ở mép phải — không ai tìm ra một điều khiển vô hình. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: collapsed ? '0.9rem 0' : '0.9rem 0.75rem 0.9rem 1rem',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border-soft)',
          flexShrink: 0, overflow: 'hidden'
        }}>
          {collapsed ? <LogoMark size={30} /> : <Logo size="sm" />}
          {!collapsed && (
            <button
              onClick={onToggleCollapse}
              title="Thu gọn thanh bên"
              aria-label="Thu gọn thanh bên"
              style={{
                display: 'grid', placeItems: 'center', width: 26, height: 26, flexShrink: 0,
                background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--r-ctrl)',
                color: 'var(--text-lo)', cursor: 'pointer',
                transition: 'background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--raised)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-lo)';
              }}
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Mở rộng thanh bên"
            aria-label="Mở rộng thanh bên"
            style={{
              margin: '0.6rem auto 0', display: 'grid', placeItems: 'center',
              width: 28, height: 28, background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)',
              color: 'var(--text-lo)', cursor: 'pointer', flexShrink: 0
            }}
          >
            <PanelLeftOpen size={15} />
          </button>
        )}

        {/* Điều hướng */}
        <nav style={{ padding: '0.6rem 0 0.6rem', flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
          <GroupLabel collapsed={collapsed} first>Tổng quan</GroupLabel>
          <SidebarItem to="/dashboard" icon={<Home size={16} />} label="Tổng quan" collapsed={collapsed} />
          <SidebarItem to="/analytics" icon={<BarChart2 size={16} />} label="Phân tích" collapsed={collapsed} />
          <SidebarItem to="/lab" icon={<FlaskConical size={16} />} label="Phòng thí nghiệm" collapsed={collapsed} />

          <GroupLabel collapsed={collapsed}>Dữ liệu khách hàng</GroupLabel>
          <SidebarItem to="/feedbacks" icon={<MessageSquare size={16} />} label="Phản hồi" collapsed={collapsed} />
          <SidebarItem
            to="/trust" icon={<ShieldCheck size={16} />} label="Tin cậy dữ liệu" collapsed={collapsed}
            badge={status?.reviewQueue || null} badgeTone="muted"
          />
          <SidebarItem to="/segments" icon={<Users size={16} />} label="Phân khúc" collapsed={collapsed} />
          <SidebarItem
            to="/risk" icon={<AlertTriangle size={16} />} label="Trung tâm cảnh báo" collapsed={collapsed}
            badge={status?.openAlerts || null}
            badgeTone={status?.criticalAlerts > 0 ? 'crit' : 'accent'}
          />

          <GroupLabel collapsed={collapsed}>Hệ thống</GroupLabel>
          <SidebarItem to="/data" icon={<Database size={16} />} label="Nguồn dữ liệu" collapsed={collapsed} />
          <SidebarItem to="/reports" icon={<FileText size={16} />} label="Báo cáo" collapsed={collapsed} />
          <SidebarItem to="/settings" icon={<Settings size={16} />} label="Cài đặt" collapsed={collapsed} />
        </nav>

        {/* DẢI TRẠNG THÁI HỆ THỐNG.
            Giống thanh trạng thái của một IDE hay một terminal: luôn ở
            đó, chiếm rất ít chỗ, và trả lời câu hỏi "hệ thống có đang
            khoẻ không" mà không cần rời màn hình đang xem. */}
        <div
          title={
            health != null
              ? `Sức khoẻ dữ liệu ${health}/100 · ${status?.validFeedbacks?.toLocaleString('vi-VN')} phản hồi hợp lệ${updatedAt ? ' · cập nhật ' + updatedAt : ''}`
              : 'Chưa lấy được trạng thái hệ thống'
          }
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: '0.5rem', flexShrink: 0,
            padding: collapsed ? '0.5rem 0' : '0.5rem 0.9rem',
            borderTop: '1px solid var(--border-soft)',
            fontSize: '0.7rem', color: 'var(--text-lo)'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 99, background: healthTone, flexShrink: 0,
              transition: 'background-color var(--dur-base) var(--ease)'
            }} />
            {!collapsed && (
              <span style={{ whiteSpace: 'nowrap' }}>
                Sức khoẻ <span className="data-num" style={{ color: healthTone }}>{health != null ? health : '—'}</span>
              </span>
            )}
          </span>
          {!collapsed && updatedAt && (
            <span className="data-num" style={{ whiteSpace: 'nowrap' }}>{updatedAt}</span>
          )}
        </div>

        {/* Khối người dùng — nén còn một hàng */}
        <div
          style={{
            padding: collapsed ? '0.6rem 0' : '0.6rem 0.75rem',
            borderTop: '1px solid var(--border-soft)', position: 'relative', flexShrink: 0
          }}
          ref={menuRef}
        >
          {showUserMenu && (
            <div className="glass-panel" style={{
              position: 'fixed', bottom: '14px', left: collapsed ? '72px' : '14px',
              width: '216px', padding: '0.4rem', zIndex: 9999
            }}>
              <div style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--border-soft)', marginBottom: '0.35rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-lo)' }}>Đang đăng nhập</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>admin@company.com</div>
              </div>

              <button
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                style={menuBtn}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--raised)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <User size={15} color="var(--text-lo)" /> Hồ sơ
              </button>

              <button
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                style={menuBtn}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--raised)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Settings size={15} color="var(--text-lo)" /> Cài đặt
              </button>

              {onLogout && (
                <button
                  onClick={onLogout}
                  style={{ ...menuBtn, color: 'var(--sev-crit)', marginTop: '0.25rem', fontWeight: 500 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sev-crit-dim)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={15} /> Đăng xuất
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={collapsed ? 'Admin User' : undefined}
            aria-expanded={showUserMenu}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.35rem 0.4rem', borderRadius: 'var(--r-ctrl)',
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: showUserMenu ? 'var(--raised)' : 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background-color var(--dur-fast) var(--ease)'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--raised)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = showUserMenu ? 'var(--raised)' : 'transparent')}
          >
            <span style={{
              width: 28, height: 28, minWidth: 28, borderRadius: 99, display: 'grid', placeItems: 'center',
              background: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--text-lo)'
            }}>
              <User size={14} />
            </span>
            {!collapsed && (
              <>
                <span style={{
                  flex: 1, minWidth: 0, textAlign: 'left', fontSize: '0.82rem', fontWeight: 500,
                  color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  Admin User
                </span>
                <ChevronUp
                  size={14}
                  color="var(--text-lo)"
                  style={{
                    flexShrink: 0,
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform var(--dur-base) var(--ease)'
                  }}
                />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
