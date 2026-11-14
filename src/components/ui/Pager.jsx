import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtInt } from '../../lib/format';
import { IconButton } from './Button';
import { SELECTED } from './Chips';

/**
 * Phân trang dùng chung cho mọi bảng (F1-05: thay luôn kiểu CSS .fb-pager cũ ở Segments).
 *   "21 đến 40 trên 14.049"          [‹] 1 2 3 … 703 [›]
 * Dưới 640px chỉ còn mũi tên và "2 / 703" để vừa một hàng.
 * Trang đang xem dùng ngôn ngữ chọn chung (accent-dim, viền nhấn), không tô đặc.
 * `unit` (tùy chọn) là chữ sau tổng, ví dụ "khách".
 */

const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
  if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '…', page - 1, page, page + 1, '…', pages];
};

export const Pager = ({ page, pages, total, pageSize, onChange, unit, className = '' }) => {
  const ref = useRef(null);
  // Sang trang khác thì đưa đầu bảng vào tầm nhìn: trước đây người xem đứng nguyên ở đáy trang
  const go = (p) => {
    onChange(p);
    const box = ref.current?.parentElement;
    if (!box) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => { if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' }); });
  };
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav ref={ref} aria-label="Phân trang" className={`flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3 ${className}`}>
      <p className="text-xs text-ink-mid">
        <span className="text-ink-hi tabular-nums">{fmtInt(from)}</span> đến <span className="text-ink-hi tabular-nums">{fmtInt(to)}</span> trên{' '}
        <span className="text-ink-hi tabular-nums">{fmtInt(total)}</span>{unit ? ` ${unit}` : ''}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} variant="ghost" size="sm" label="Trang trước" onClick={() => go(page - 1)} disabled={page <= 1} />
          <span className="px-2 text-xs text-ink-mid tabular-nums sm:hidden">{fmtInt(page)} / {fmtInt(pages)}</span>
          <div className="hidden items-center gap-1 sm:flex">
            {pageList(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-ink-lo" aria-hidden="true">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => go(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-ctrl border px-2 text-xs tabular-nums transition-[background-color,border-color,color] duration-micro ease-out ${
                    p === page ? `${SELECTED} font-semibold` : 'border-transparent text-ink-mid hover:bg-raised hover:text-ink-hi'
                  }`}
                >
                  {fmtInt(p)}
                </button>
              )
            )}
          </div>
          <IconButton icon={ChevronRight} variant="ghost" size="sm" label="Trang sau" onClick={() => go(page + 1)} disabled={page >= pages} />
        </div>
      )}
    </nav>
  );
};
