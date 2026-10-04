import React from 'react';

/** Chip — theo hàng "Чипы (теги)": viên thuốc mảnh, đang chọn thì tô sage */
export const Chip = ({ active, onClick, icon: Icon, count, children, className = '', ...rest }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 ${
      active
        ? 'border-transparent bg-accent text-on-accent'
        : 'border-line bg-surface/55 text-ink-mid hover:border-ink-lo hover:text-ink-hi'
    } ${className}`}
    {...rest}
  >
    {Icon && <Icon size={13} aria-hidden="true" />}
    {children}
    {count != null && (
      <span className={`font-mono text-[0.68rem] ${active ? 'opacity-80' : 'text-ink-lo'}`}>{count}</span>
    )}
  </button>
);

/** Nhóm chip chọn một */
export const ChipGroup = ({ options, value, onChange, label, className = '' }) => (
  <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
    {options.map((o) => (
      <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)} icon={o.icon} count={o.count}>
        {o.label}
      </Chip>
    ))}
  </div>
);

/** Điều khiển phân đoạn — chuyển chế độ xem trong cùng một panel */
export const Segmented = ({ options, value, onChange, label, size = 'sm' }) => (
  <div role="group" aria-label={label} className="inline-flex rounded-full bg-raised p-0.5">
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-[background-color,color,box-shadow] duration-150 ${
            size === 'sm' ? 'h-7 px-3 text-[0.72rem]' : 'h-9 px-4 text-sm'
          } ${active ? 'bg-surface text-ink-hi shadow-[0_1px_3px_rgb(31_45_53/0.12)]' : 'text-ink-lo hover:text-ink-mid'}`}
        >
          {o.icon && <o.icon size={13} aria-hidden="true" />}
          {o.label}
        </button>
      );
    })}
  </div>
);

/** Tab gạch chân — theo nhóm "Вкладки" của bộ kit */
export const Tabs = ({ tabs, value, onChange, className = '' }) => (
  <div role="tablist" className={`flex gap-6 overflow-x-auto border-b border-line-soft ${className}`}>
    {tabs.map((t) => {
      const active = t.value === value;
      return (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(t.value)}
          className={`relative inline-flex shrink-0 items-center gap-2 pb-3 text-sm whitespace-nowrap transition-colors ${
            active ? 'font-semibold text-ink-hi' : 'text-ink-lo hover:text-ink-mid'
          }`}
        >
          {t.icon && <t.icon size={15} aria-hidden="true" />}
          {t.label}
          {t.count != null && (
            <span className={`rounded-full px-1.5 font-mono text-[0.68rem] ${active ? 'bg-accent-dim text-accent-hi' : 'bg-raised text-ink-lo'}`}>
              {t.count}
            </span>
          )}
          <span
            aria-hidden="true"
            className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
          />
        </button>
      );
    })}
  </div>
);
