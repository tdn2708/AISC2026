import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Lớp phủ dùng chung cho Modal và Drawer: khoá cuộn nền, đóng bằng Esc,
 * đưa tiêu điểm vào hộp thoại khi mở và trả về chỗ cũ khi đóng.
 */
const useOverlay = (open, onClose, panelRef) => {
  // onClose thường là hàm tạo mới mỗi lần render. Nếu đưa thẳng vào mảng
  // phụ thuộc, effect chạy lại sau MỖI phím gõ và kéo tiêu điểm về ô đầu
  // tiên — gõ vào ô thứ hai là không thể. Giữ nó trong ref.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus], input, textarea, select, button:not([data-close])');
      (target || panelRef.current)?.focus();
    }, 20);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, panelRef]);
};

const Backdrop = ({ onClose }) => (
  <div className="absolute inset-0 bg-[rgb(31_45_53/0.28)] backdrop-blur-[3px] animate-fade-up" onClick={onClose} aria-hidden="true" />
);

/** Hộp thoại — theo nhóm "Модальные окна": biểu tượng tròn, tiêu đề, mô tả, hai nút */
export const Modal = ({ open, onClose, title, description, icon: Icon, tone = 'accent', children, footer, size = 'md' }) => {
  const panelRef = useRef(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open) return null;

  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }[size];
  const toneCls = { accent: 'bg-accent-dim text-accent-hi', crit: 'bg-crit/12 text-crit', ok: 'bg-ok/12 text-ok' }[tone];

  return createPortal(
    <div className="cx fixed inset-0 z-[2000] grid place-items-center p-4">
      <Backdrop onClose={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass-strong relative w-full ${width} rounded-[26px] p-6 outline-none animate-pop-in`}
      >
        <button
          type="button"
          data-close
          onClick={onClose}
          aria-label="Đóng"
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-ink-lo transition-colors hover:bg-raised hover:text-ink-hi"
        >
          <X size={16} aria-hidden="true" />
        </button>
        {Icon && (
          <span className={`mb-4 grid size-12 place-items-center rounded-full ${toneCls}`}>
            <Icon size={22} aria-hidden="true" />
          </span>
        )}
        <h2 id={titleId} className="pr-8 text-lg font-semibold text-ink-hi">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

/** Ngăn kéo bên phải — xem chi tiết mà không rời danh sách */
export const Drawer = ({ open, onClose, title, subtitle, children, footer, width = 520 }) => {
  const panelRef = useRef(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open) return null;

  return createPortal(
    <div className="cx fixed inset-0 z-[2000]">
      <Backdrop onClose={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-strong absolute top-3 right-3 bottom-3 flex flex-col overflow-hidden rounded-[24px] outline-none animate-pop-in"
        style={{ width: `min(${width}px, calc(100vw - 24px))` }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink-hi">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-lo">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Đóng"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-lo transition-colors hover:bg-raised hover:text-ink-hi"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-6 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body
  );
};
