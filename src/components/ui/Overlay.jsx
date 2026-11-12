import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { useReducedMotion } from '../motion/useReducedMotion';

/**
 * Hộp thoại (F1-05: Modal, Drawer, hộp riêng của CommandPalette, window.confirm, window.alert
 * gộp còn 2): Modal cho câu hỏi ngắn và xác nhận (tone="crit" cho thao tác không hoàn tác),
 * Drawer cho xem chi tiết bên phải. Lỗi không mở hộp thoại, mà hiện bằng Toast tone="crit".
 * Cả hai: một bề mặt kính nổi `glass-float` bo --r-surf, nút đóng là IconButton trơn 32px (vùng bấm nới ra 44px),
 * mở bằng pop-in (transform, opacity), giảm chuyển động thì hiện ngay.
 *
 * Lớp phủ dùng chung: khoá cuộn nền, đóng bằng Esc,
 * đưa tiêu điểm vào hộp thoại khi mở và trả về chỗ cũ khi đóng.
 */
const DRAWER_MS = 420; // = --motion-medium
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

export const Backdrop = ({ onClose, leaving = false }) => (
  <div className={`absolute inset-0 bg-(--scrim) backdrop-blur-[3px] ${leaving ? 'animate-fade-out pointer-events-none' : 'animate-fade-up'}`} onClick={onClose} aria-hidden="true" />
);

/** Hộp thoại: ô biểu tượng, tiêu đề, mô tả, hai nút */
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
        className={`glass-float relative max-h-[calc(100dvh-2rem)] w-full ${width} overflow-y-auto overscroll-contain rounded-surf p-5 outline-none animate-pop-in sm:p-6`}
      >
        <IconButton icon={X} label="Đóng" variant="ghost" size="sm" data-close onClick={onClose} className="absolute! top-3 right-3 before:absolute before:-inset-1.5 before:content-[''] sm:top-4 sm:right-4" />
        {Icon && (
          <span className={`mb-4 grid size-10 place-items-center rounded-ctrl ${toneCls}`}>
            <Icon size={20} aria-hidden="true" />
          </span>
        )}
        <h2 id={titleId} className="pr-8 text-heading font-semibold text-ink-hi">{title}</h2>
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
  const reduced = useReducedMotion();
  // Mở: trượt vào từ phải. Đóng: trượt ra rồi mới gỡ khỏi DOM. Chỉ transform và opacity;
  // giảm chuyển động thì hiện và tắt ngay.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    if (reduced) { setMounted(false); return undefined; }
    const t = setTimeout(() => setMounted(false), Math.round(DRAWER_MS * 0.7));
    return () => clearTimeout(t);
  }, [open, reduced]);
  useOverlay(open, onClose, panelRef);
  if (!open && !mounted) return null;
  const leaving = !open;

  return createPortal(
    <div className="cx fixed inset-0 z-[2000]">
      <Backdrop onClose={onClose} leaving={leaving} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass-float absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col overflow-hidden rounded-surf outline-none ${leaving ? 'animate-drawer-out' : 'animate-drawer-in'}`}
        style={{ width: `min(${width}px, calc(100vw - 24px))` }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink-hi">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-lo">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Đóng" variant="ghost" size="sm" data-close onClick={onClose} className="before:absolute before:-inset-1.5 before:content-['']" />
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-6 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body
  );
};
