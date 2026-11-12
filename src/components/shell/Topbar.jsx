import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, Menu, Moon, Search, Sun, MessageSquareText, Loader2 } from 'lucide-react';
import { openAssistant } from '../../lib/assistant';
import { IconButton } from '../ui';
import { findPage } from '../../lib/nav';
import { useTheme } from '../../hooks/useTheme';
import { alertTitle } from '../../lib/format';
import { useRefreshing } from '../../lib/dataVersion';

/**
 * THANH TRÊN — dính theo cuộn, kính trong.
 * Chứa đúng ba thứ dùng ở mọi trang: ô lệnh Ctrl+K, đổi giao diện sáng/tối
 * và thông báo. Tên trang không lặp ở đây vì mỗi trang đã có tiêu đề riêng;
 * kho dữ liệu nằm ở thanh bên.
 */

const POLL_MS = 60000;

const loadReadIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('readNotifs') || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const Notifications = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [readIds, setReadIds] = useState(loadReadIds);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    // Chỉ báo những cảnh báo CÒN CHỜ quyết định — việc đã chấp nhận hay bỏ
    // qua không nên tiếp tục nháy chuông
    const load = () =>
      axios
        .get('/recommendations')
        .then((r) => {
          if (!alive) return;
          const recs = r.data?.recommendations || [];
          setRisks(
            recs
              .filter((x) => x.status === 'PROPOSED')
              .map((x) => ({ id: x.alertId, issue: alertTitle(x.alert), insight: x.summary }))
          );
        })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('readNotifs', JSON.stringify([...readIds]));
  }, [readIds]);

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

  const unread = risks.filter((r) => !readIds.has(r.id)).length;

  const openRisk = (id) => {
    setReadIds((prev) => new Set([...prev, id]));
    setOpen(false);
    navigate(`/risk?alert=${encodeURIComponent(id)}`);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={Bell}
        label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        badge={
          unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-crit px-1 font-mono text-xs leading-[18px] font-semibold text-white ring-2 ring-[var(--canvas)]">
              {unread > 9 ? '9+' : unread}
            </span>
          )
        }
      />
      {open && (
        <div className="glass-strong absolute top-[calc(100%+10px)] right-0 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg animate-pop-in">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-hi">Thông báo</h3>
            {unread > 0 && <span className="rounded bg-crit/12 px-1.5 py-0.5 font-mono text-xs font-medium text-crit">{unread} mới</span>}
          </div>
          <ul className="max-h-[340px] list-none overflow-y-auto">
            {risks.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-ink-lo">Không có cảnh báo nào chờ quyết định</li>
            ) : (
              risks.map((risk) => {
                const isRead = readIds.has(risk.id);
                return (
                  <li key={risk.id}>
                    <button
                      type="button"
                      onClick={() => openRisk(risk.id)}
                      className={`flex w-full gap-3 border-b border-line-soft px-4 py-3 text-left transition-colors hover:bg-raised ${isRead ? 'opacity-60' : ''}`}
                    >
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? 'bg-transparent' : 'bg-crit'}`} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-hi">{risk.issue}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-mid">{risk.insight}</span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <button
            type="button"
            onClick={() => setReadIds(new Set([...readIds, ...risks.map((r) => r.id)]))}
            className="w-full py-2.5 text-center text-xs font-semibold text-accent hover:bg-raised"
          >
            Đánh dấu tất cả đã đọc
          </button>
        </div>
      )}
    </div>
  );
};

const Topbar = ({ onOpenMenu, onOpenCommand }) => {
  const refreshing = useRefreshing();
  const { pathname } = useLocation();
  const page = findPage(pathname);
  const { theme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const barRef = useRef(null);

  // Kính chỉ đặc lại khi nội dung đã cuộn qua — ở đầu trang thanh trên trong suốt
  useEffect(() => {
    const scroller = barRef.current?.closest('.main-content');
    if (!scroller) return undefined;
    const onScroll = () => setScrolled(scroller.scrollTop > 8);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <div ref={barRef} className={`cx sticky top-0 z-[120] -mr-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-2 pb-3 ${scrolled ? 'bg-(--canvas)' : ''}`}>
      <div
        className={`flex items-center gap-2 rounded-lg px-1 py-2 sm:gap-3 sm:px-2 transition-[background-color,box-shadow,backdrop-filter] duration-200 ${
          scrolled ? 'glass' : ''
        }`}
      >
        <IconButton icon={Menu} label="Mở menu" onClick={onOpenMenu} className="md:hidden" />

        {/* Điện thoại: tên trang hiện tại, vì thanh bên đã ẩn sau nút menu */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-hi md:hidden">{page?.label}</span>

        <button
          type="button"
          onClick={onOpenCommand}
          aria-label="Tìm nhanh"
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface text-sm text-ink-mid transition-colors hover:border-ink-lo hover:text-ink-hi md:w-full md:max-w-[300px] md:justify-start md:pr-2 md:pl-3"
        >
          <Search size={16} aria-hidden="true" />
          {/* Màn hẹp chỉ còn biểu tượng: ô tìm kiếm từng đẩy thanh trên tràn ngang */}
          <span className="hidden flex-1 truncate text-left md:inline">Tìm nhanh…</span>
          <kbd className="hidden rounded-md border border-line bg-surface/70 px-1.5 py-0.5 font-mono text-xs text-ink-mid md:inline">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        <div className="hidden flex-1 md:block" />

        {/* Sau một thao tác ghi, máy chủ tính lại số liệu ở nền; trang tự tải lại khi xong */}
        {refreshing && (
          <span role="status" className="hidden shrink-0 items-center gap-2 rounded-full bg-accent-dim px-3 py-1.5 text-xs font-medium text-accent-hi md:inline-flex">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Đang cập nhật số liệu
          </span>
        )}


        {/* Trợ lý: nút có chữ trên màn rộng, chỉ biểu tượng trên điện thoại */}
        <button
          type="button"
          onClick={openAssistant}
          aria-label="Hỏi dữ liệu"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hi"
        >
          <MessageSquareText size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Hỏi dữ liệu</span>
        </button>

        {/* Màn điện thoại không đủ chỗ cho năm nút; đổi giao diện vẫn có trong Cài đặt */}
        <span className="hidden sm:contents">
          <IconButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
        </span>
        <Notifications />
      </div>
    </div>
  );
};

export default Topbar;
