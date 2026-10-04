import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, Menu, Moon, Search, Sun, ChevronRight } from 'lucide-react';
import { IconButton } from '../ui';
import { findPage } from '../../lib/nav';
import { useTheme } from '../../hooks/useTheme';
import { alertTitle } from '../../lib/format';

/**
 * THANH TRÊN — dính theo cuộn, kính trong.
 * Chứa đúng bốn thứ dùng ở mọi trang: vị trí hiện tại, ô lệnh Ctrl+K,
 * đổi theme, và thông báo. Mọi thao tác riêng của trang nằm ở tiêu đề trang.
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
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-crit px-1 font-mono text-[0.62rem] leading-[18px] font-semibold text-white ring-2 ring-[var(--canvas)]">
              {unread > 9 ? '9+' : unread}
            </span>
          )
        }
      />
      {open && (
        <div className="glass-strong absolute top-[calc(100%+10px)] right-0 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl animate-pop-in">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-hi">Thông báo</h3>
            {unread > 0 && <span className="rounded-full bg-crit/12 px-2 py-0.5 text-[0.68rem] font-semibold text-crit">{unread} mới</span>}
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
                        <span className="block text-[0.82rem] font-semibold text-ink-hi">{risk.issue}</span>
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
    <div ref={barRef} className="cx sticky top-0 z-[120] -mr-2 pt-3 pr-2 pb-3">
      <div
        className={`flex items-center gap-3 rounded-2xl px-2 py-2 transition-[background-color,box-shadow,backdrop-filter] duration-200 ${
          scrolled ? 'glass' : ''
        }`}
      >
        <IconButton icon={Menu} label="Mở menu" onClick={onOpenMenu} className="md:hidden" />

        <nav aria-label="Vị trí" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
          <span className="text-ink-lo">{page?.group || 'Customer Radar'}</span>
          {page && (
            <>
              <ChevronRight size={14} className="text-ink-lo/70" aria-hidden="true" />
              <span className="truncate font-medium text-ink-hi">{page.label}</span>
            </>
          )}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenCommand}
          className="glass flex h-10 w-full max-w-[300px] items-center gap-2.5 rounded-full pr-2 pl-3.5 text-sm text-ink-lo transition-colors hover:text-ink-mid"
        >
          <Search size={16} aria-hidden="true" />
          <span className="flex-1 truncate text-left">Tìm nhanh…</span>
          <kbd className="hidden rounded-md border border-line bg-surface/70 px-1.5 py-0.5 font-mono text-[0.66rem] text-ink-mid sm:inline">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <Notifications />
      </div>
    </div>
  );
};

export default Topbar;
