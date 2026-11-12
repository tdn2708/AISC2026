import React from 'react';

/**
 * Chọn và lọc (F1-05: 7 cách viết gộp còn 3 thành phần, 1 ngôn ngữ "đang chọn").
 *   Chip       lọc nhanh, bật tắt từng cái (ChipGroup: chọn một trong nhóm)
 *   Segmented  đổi chế độ xem trong cùng một panel
 *   Tabs       đổi khu vực của trang, gạch chân
 * Đang chọn ở cả ba: nền accent-dim, viền hoặc gạch nhấn, chữ accent-hi.
 * Tô đặc màu nhấn chỉ dành cho nút chính.
 * Rê: viền và chữ đổi một bước; focus-visible: viền ngoài chung ở index.css.
 */
export const SELECTED = 'border-accent bg-accent-dim text-accent-hi';

export const Chip = ({ active, onClick, icon: Icon, count, children, className = '', ...rest }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-ctrl border px-3 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${
      active ? SELECTED : 'border-line bg-surface text-ink-mid hover:border-ink-lo hover:text-ink-hi'
    } ${className}`}
    {...rest}
  >
    {Icon && <Icon size={14} aria-hidden="true" />}
    {children}
    {count != null && (
      <span className={`text-xs tabular-nums ${active ? 'text-accent-hi' : 'text-ink-lo'}`}>{typeof count === 'number' ? count.toLocaleString('vi-VN') : count}</span>
    )}
  </button>
);

/** Nhóm chip chọn một */
export const ChipGroup = ({ options, value, onChange, label, className = '' }) => (
  <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
    {options.map((o) => (
      <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)} icon={o.icon} count={o.count} disabled={o.disabled}>
        {o.label}
      </Chip>
    ))}
  </div>
);

/** Điều khiển phân đoạn: chuyển chế độ xem trong cùng một panel. Hẹp hơn chỗ thì cuộn ngang. */
export const Segmented = ({ options, value, onChange, label, size = 'sm' }) => (
  <div role="group" aria-label={label} className="inline-flex max-w-full min-w-0 gap-0.5 overflow-x-auto rounded-ctrl border border-line bg-surface p-0.5 [scrollbar-width:none]">
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          disabled={o.disabled}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-[calc(var(--r-ctrl)-2px)] border font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${
            size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm'
          } ${active ? SELECTED : 'border-transparent text-ink-mid hover:bg-raised hover:text-ink-hi'}`}
        >
          {o.icon && <o.icon size={14} aria-hidden="true" />}
          {o.label}
        </button>
      );
    })}
  </div>
);

/** Tab gạch chân. Hẹp hơn chỗ (điện thoại) thì cả hàng cuộn ngang, không bị cắt mép. */
export const Tabs = ({ tabs, value, onChange, className = '' }) => (
  <div role="tablist" className={`flex max-w-full min-w-0 gap-6 overflow-x-auto overscroll-x-contain border-b border-line-soft [scrollbar-width:thin] ${className}`}>
    {tabs.map((t) => {
      const active = t.value === value;
      return (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(t.value)}
          className={`relative inline-flex min-h-8 shrink-0 items-center gap-2 pt-1 pb-3 text-sm whitespace-nowrap transition-colors duration-micro ease-out ${
            active ? 'font-semibold text-accent-hi' : 'text-ink-mid hover:text-ink-hi'
          }`}
        >
          {t.icon && <t.icon size={16} aria-hidden="true" />}
          {t.label}
          {t.count != null && (
            <span className={`rounded-ctrl px-1.5 text-xs tabular-nums ${active ? 'bg-accent-dim text-accent-hi' : 'bg-raised text-ink-mid'}`}>
              {t.count}
            </span>
          )}
          <span
            aria-hidden="true"
            className={`absolute inset-x-0 -bottom-px h-0.5 bg-accent transition-opacity duration-micro ${active ? 'opacity-100' : 'opacity-0'}`}
          />
        </button>
      );
    })}
  </div>
);
