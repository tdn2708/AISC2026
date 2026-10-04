import React, { useId } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';

/**
 * Ô nhập — theo cột "Поля ввода" của UI-kit: biểu tượng bên trái, viền
 * chuyển sang sage khi đang nhập, viền đỏ kèm dòng giải thích khi lỗi.
 * Lỗi luôn có CHỮ, không chỉ đổi màu viền.
 */
const base =
  'w-full rounded-xl border bg-surface/70 text-sm text-ink-hi placeholder:text-ink-lo/80 outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:bg-surface focus:ring-4 disabled:cursor-not-allowed disabled:opacity-55';
const tone = (error) =>
  error ? 'border-crit/60 focus:border-crit focus:ring-crit/12' : 'border-line focus:border-accent focus:ring-accent-dim';

const Shell = ({ id, label, hint, error, children, className = '', aside }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {(label || aside) && (
      <div className="flex items-center justify-between gap-3">
        {label && <label htmlFor={id} className="text-xs font-medium text-ink-mid">{label}</label>}
        {aside}
      </div>
    )}
    {children}
    {error ? (
      <p id={`${id}-err`} className="flex items-center gap-1 text-xs text-crit">
        <CircleAlert size={12} aria-hidden="true" /> {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-xs text-ink-lo">{hint}</p>
    ) : null}
  </div>
);

export const TextField = ({ label, icon: Icon, trailing, hint, error, aside, className = '', inputClassName = '', id, ...props }) => {
  const auto = useId();
  const fid = id || auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className} aside={aside}>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-lo" aria-hidden="true" />}
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={`${base} ${tone(error)} h-11 ${Icon ? 'pl-10' : 'pl-3.5'} ${trailing ? 'pr-11' : 'pr-3.5'} ${inputClassName}`}
          {...props}
        />
        {trailing && <span className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</span>}
      </div>
    </Shell>
  );
};

export const TextArea = ({ label, hint, error, maxLength, value = '', className = '', id, rows = 3, ...props }) => {
  const auto = useId();
  const fid = id || auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <textarea
          id={fid}
          rows={rows}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          className={`${base} ${tone(error)} resize-none px-3.5 py-3 leading-relaxed`}
          {...props}
        />
        {maxLength && (
          <span className="pointer-events-none absolute right-3 bottom-2.5 font-mono text-[0.68rem] text-ink-lo">
            {String(value).length}/{maxLength}
          </span>
        )}
      </div>
    </Shell>
  );
};

export const Select = ({ label, hint, error, options = [], icon: Icon, className = '', id, ...props }) => {
  const auto = useId();
  const fid = id || auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-lo" aria-hidden="true" />}
        <select
          id={fid}
          className={`${base} ${tone(error)} h-11 cursor-pointer appearance-none ${Icon ? 'pl-10' : 'pl-3.5'} pr-10`}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
      </div>
    </Shell>
  );
};
