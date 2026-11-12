import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Moon, Sun, LogOut, MessageSquareText, ArrowRight, Sparkles } from 'lucide-react';
import { askAssistant } from '../../lib/assistant';
import { NAV, HIDDEN_PAGES } from '../../lib/nav';
import { useTheme } from '../../hooks/useTheme';
import { foldVi } from '../../lib/format';
import { Backdrop } from '../ui';
import { Stagger, useReducedMotion, MOTION, EASE } from '../motion';

/**
 * BẢNG LỆNH Ctrl+K
 * ------------------------------------------------------------------
 * Gõ vài chữ là tới trang cần đến, tìm thẳng trong phản hồi, hoặc gửi
 * nguyên câu gõ cho trợ lý "Hỏi dữ liệu". Bàn phím đi được hết: ↑ ↓ để
 * chọn, Enter để mở.
 *
 * Chuyển động (F4-02): mở bằng pop-in (opacity + dịch 4px + scale 0,98,
 * --motion-short, ease-out); đóng chạy ngược nhanh hơn (70%, ease-in) rồi
 * mới gỡ khỏi DOM. Kết quả lệch nhịp nhẹ (Stagger) CHỈ khi người dùng gõ,
 * không khi vừa mở. Giảm chuyển động: hiện và tắt ngay.
 */

const strip = foldVi;

const CommandPalette = ({ open, onClose, onLogout }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const reduced = useReducedMotion();
  // Còn hiện trên màn hình (kể cả lúc đang chạy hiệu ứng đóng)
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useEffect(() => {
    if (open || !shown) return undefined;
    const panel = panelRef.current;
    if (reduced || !panel || typeof panel.animate !== 'function') {
      setShown(false);
      return undefined;
    }
    const opts = { duration: Math.round(MOTION.short * 0.7), easing: EASE.in, fill: 'forwards' };
    const anims = [
      panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px) scale(0.98)' }], opts),
      panel.previousElementSibling?.animate([{ opacity: 1 }, { opacity: 0 }], opts)
    ].filter(Boolean);
    let alive = true;
    anims[0].finished.then(() => alive && setShown(false)).catch(() => {});
    return () => {
      alive = false;
      anims.forEach((a) => a.cancel());
    };
  }, [open, shown, reduced]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo(() => {
    const pages = [...NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))), ...HIDDEN_PAGES].map((p) => ({
      id: `page:${p.to}`,
      section: 'Đi tới trang',
      label: p.label,
      hint: p.group,
      icon: p.icon,
      run: () => navigate(p.to)
    }));
    const actions = [
      {
        id: 'theme',
        section: 'Thao tác',
        label: theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark')
      },
      ...(onLogout ? [{ id: 'logout', section: 'Thao tác', label: 'Đăng xuất', icon: LogOut, run: onLogout }] : [])
    ];

    const q = strip(query.trim());
    const match = (it) => !q || strip(`${it.label} ${it.hint || ''}`).includes(q);
    const list = [...pages.filter(match), ...actions.filter(match)];
    if (query.trim()) {
      list.push({
        id: 'ask',
        section: 'Hỏi dữ liệu',
        label: `Hỏi trợ lý: “${query.trim()}”`,
        icon: Sparkles,
        run: () => askAssistant(query.trim())
      });
      list.push({
        id: 'search',
        section: 'Tìm trong phản hồi',
        label: `Tìm “${query.trim()}” trong kho phản hồi`,
        icon: MessageSquareText,
        run: () => navigate(`/feedbacks?q=${encodeURIComponent(query.trim())}`)
      });
    }
    return list;
  }, [query, navigate, theme, setTheme, onLogout]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!shown) return null;

  const runAt = (i) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      // Bộ gõ tiếng Việt (Telex/VNI qua IME của hệ điều hành) dùng Enter để
      // chốt chữ đang soạn; chạy lệnh lúc đó là tìm với từ cuối còn dở dang
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      runAt(active);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastSection = null;

  return createPortal(
    <div className="cx fixed inset-0 z-[2200] flex items-start justify-center p-4 pt-[12vh]">
      <Backdrop onClose={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh"
        className="glass-strong relative w-full max-w-xl overflow-hidden rounded-surf shadow-(--shadow-overlay) animate-pop-in"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-5">
          <Search size={18} className="shrink-0 text-ink-lo" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gõ tên trang, nội dung phản hồi, hoặc một câu hỏi…"
            aria-label="Tìm lệnh"
            aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
            className="h-14 w-full min-w-0 border-0 bg-transparent text-base text-ink-hi outline-none placeholder:text-ink-lo"
          />
          <kbd className="rounded-ctrl border border-line px-1.5 py-0.5 tabular-nums text-xs text-ink-lo">Esc</kbd>
        </div>

        {/* Lệch nhịp chỉ khi ô tìm có chữ (người dùng đang gõ); lúc vừa mở thì không */}
        <div ref={listRef}>
        <Stagger as="ul" role="listbox" active={query.trim() !== ''} runKey={query} step={30} className="max-h-[52vh] list-none overflow-y-auto p-2">
          {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-lo">Không có kết quả phù hợp</li>}
          {items.map((it, i) => {
            const header = it.section !== lastSection ? it.section : null;
            lastSection = it.section;
            const Icon = it.icon || ArrowRight;
            const isActive = i === active;
            return (
              <React.Fragment key={it.id}>
                {header && <li className="eyebrow px-3 pt-3 pb-1.5" role="presentation">{header}</li>}
                <li
                  id={`cmd-${it.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-ctrl px-3 py-2.5 text-sm transition-colors duration-micro ease-out ${
                    isActive ? 'bg-accent-dim text-accent-hi' : 'text-ink-hi'
                  }`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-ctrl ${isActive ? 'bg-surface text-accent-hi' : 'bg-raised text-ink-mid'}`}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className={`text-xs ${isActive ? 'text-accent-hi' : 'text-ink-lo'}`}>{it.hint}</span>}
                  {isActive && <CornerDownLeft size={14} aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}
        </Stagger>
        </div>

        <div className="flex items-center gap-4 border-t border-line-soft px-5 py-2.5 text-xs text-ink-lo">
          <span><kbd className="tabular-nums">↑ ↓</kbd> chọn</span>
          <span><kbd className="tabular-nums">Enter</kbd> mở</span>
          <span><kbd className="tabular-nums">Esc</kbd> đóng</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
