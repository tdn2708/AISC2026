import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Moon, Sun, LogOut, MessageSquareText, ArrowRight } from 'lucide-react';
import { NAV, HIDDEN_PAGES } from '../../lib/nav';
import { useTheme } from '../../hooks/useTheme';

/**
 * BẢNG LỆNH Ctrl+K
 * ------------------------------------------------------------------
 * Thay cho khung chat nổi cũ: thuần điều hướng và thao tác, không có
 * văn bản sinh tự do. Gõ vài chữ là tới trang cần đến, hoặc tìm thẳng
 * trong kho phản hồi. Bàn phím đi được hết: ↑ ↓ để chọn, Enter để mở.
 */

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const CommandPalette = ({ open, onClose, onLogout }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

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
        label: theme === 'dark' ? 'Chuyển sang giao diện sáng (Mist)' : 'Chuyển sang giao diện tối (Dusk)',
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

  if (!open) return null;

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
      e.preventDefault();
      runAt(active);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastSection = null;

  return createPortal(
    <div className="cx fixed inset-0 z-[2200] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-[rgb(31_45_53/0.3)] backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh"
        className="glass-strong relative w-full max-w-xl overflow-hidden rounded-[24px] animate-pop-in"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-5">
          <Search size={18} className="shrink-0 text-ink-lo" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gõ tên trang, thao tác, hoặc nội dung phản hồi…"
            aria-label="Tìm lệnh"
            aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
            className="h-14 w-full bg-transparent text-[0.95rem] text-ink-hi outline-none placeholder:text-ink-lo"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[0.66rem] text-ink-lo">Esc</kbd>
        </div>

        <ul ref={listRef} role="listbox" className="max-h-[52vh] list-none overflow-y-auto p-2">
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
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? 'bg-accent text-on-accent' : 'text-ink-hi'
                  }`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${isActive ? 'bg-white/20' : 'bg-raised text-ink-mid'}`}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className={`text-xs ${isActive ? 'opacity-80' : 'text-ink-lo'}`}>{it.hint}</span>}
                  {isActive && <CornerDownLeft size={14} className="opacity-80" aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-line-soft px-5 py-2.5 text-[0.7rem] text-ink-lo">
          <span><kbd className="font-mono">↑ ↓</kbd> chọn</span>
          <span><kbd className="font-mono">Enter</kbd> mở</span>
          <span><kbd className="font-mono">Esc</kbd> đóng</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
