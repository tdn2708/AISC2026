import React from 'react';
import { Check } from 'lucide-react';

/**
 * Lớp nổi (F1-05: 5 popover tự viết với 2 diện mạo và 4 tooltip biểu đồ với 4 diện mạo
 * gộp còn 2 thành phần).
 *   Popover     khung cho menu, bộ lọc thả xuống, danh sách chọn; chỗ đặt (absolute, top,
 *               right...) và cách đóng (bấm ra ngoài, Esc) do nơi gọi giữ như cũ.
 *   MenuItem    một dòng trong Popover; `active` là dòng đang chọn (nền accent-dim, dấu tích).
 *   ChartTooltip  hộp chú giải khi rê lên biểu đồ (truyền vào `content` của Recharts Tooltip).
 * Cùng một bề mặt: nền bề mặt, viền 1px, bo --r-surf, một bóng --shadow-overlay.
 * Mở bằng pop-in (transform, opacity, --motion-short); giảm chuyển động thì hiện ngay.
 */
export const OVERLAY_SURFACE = 'glass-strong rounded-surf shadow-(--shadow-overlay)';

export const Popover = ({ as: Tag = 'div', className = '', children, ...rest }) => (
  <Tag className={`${OVERLAY_SURFACE} z-[150] p-1.5 animate-pop-in ${className}`} {...rest}>
    {children}
  </Tag>
);

export const MenuItem = ({ active, icon: Icon, hint, children, className = '', ...rest }) => (
  <button
    type="button"
    className={`flex w-full items-center gap-2 rounded-ctrl px-3 py-2 text-left text-sm transition-colors duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${
      active ? 'bg-accent-dim font-medium text-accent-hi' : 'text-ink-hi hover:bg-raised'
    } ${className}`}
    {...rest}
  >
    {Icon && <Icon size={16} className="shrink-0" aria-hidden="true" />}
    <span className="min-w-0 flex-1">
      <span className="block truncate">{children}</span>
      {hint && <span className="block text-xs font-normal text-ink-lo">{hint}</span>}
    </span>
    {active && <Check size={14} className="shrink-0" aria-hidden="true" />}
  </button>
);

/** Hộp tooltip của biểu đồ: tiêu đề một dòng, các dòng số thẳng cột (tabular-nums) */
export const ChartTooltip = ({ title, children, className = '' }) => (
  <div className={`${OVERLAY_SURFACE} max-w-[18rem] px-3 py-2 text-xs ${className}`}>
    {title && <p className="mb-1 font-semibold text-ink-hi">{title}</p>}
    <div className="tabular-nums text-ink-mid">{children}</div>
  </div>
);
