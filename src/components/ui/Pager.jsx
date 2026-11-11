import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtInt } from '../../lib/format';

/**
 * Phân trang dùng chung cho mọi bảng.
 *   "21–40 trên 14.049"          [‹] 1 2 3 … 703 [›]
 * Dưới 640px chỉ còn mũi tên và "2 / 703" để vừa một hàng.
 */

const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
  if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '…', page - 1, page, page + 1, '…', pages];
};

const arrow = 'grid size-8 place-items-center rounded-md text-ink-mid transition-colors hover:bg-raised hover:text-ink-hi disabled:opacity-40 disabled:hover:bg-transparent';

export const Pager = ({ page, pages, total, pageSize, onChange, className = '' }) => {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Phân trang" className={`flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3 ${className}`}>
      <p className="text-xs text-ink-mid">
        <span className="font-mono text-ink-hi">{fmtInt(from)} đến {fmtInt(to)}</span> trên <span className="font-mono text-ink-hi">{fmtInt(total)}</span>
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={arrow} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Trang trước">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-xs text-ink-mid sm:hidden">{fmtInt(page)} / {fmtInt(pages)}</span>
          <div className="hidden items-center gap-1 sm:flex">
            {pageList(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-ink-lo" aria-hidden="true">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-md px-2 font-mono text-xs transition-colors ${p === page ? 'bg-accent font-semibold text-on-accent' : 'text-ink-mid hover:bg-raised hover:text-ink-hi'}`}
                >
                  {fmtInt(p)}
                </button>
              )
            )}
          </div>
          <button type="button" className={arrow} onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Trang sau">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
};
