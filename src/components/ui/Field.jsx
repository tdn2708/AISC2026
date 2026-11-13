import React, { useId } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import { fieldClass } from './fieldClass';

/**
 * Ô nhập (F1-05: 13 ô tự viết, 5 chiều cao, 4 kiểu focus gộp còn 1 họ, 2 cỡ, 1 kiểu focus).
 *   cỡ md 40px cho biểu mẫu, sm 32px cho bộ lọc và ô trong bảng; ô nhiều dòng không có chiều cao cố định.
 *   mặc định: viền --border-field (3,83:1, đủ thấy chỗ gõ); rê: viền đậm một bước (ink-lo);
 *   focus-visible: viền ngoài 2px màu nhấn, lõm vào trong (index.css), viền không đổi bề dày;
 *   tắt: mờ 55%, con trỏ cấm; lỗi: viền đỏ + dòng chữ lỗi thay chỗ dòng gợi ý + aria-invalid.
 *   Lỗi luôn có CHỮ, không chỉ đổi màu viền.
 * `fieldClass()` cho ô tự dựng (ô tìm trong popover, ô trong bảng) dùng chung đúng diện mạo này.
 */
const Shell = ({ id, label, hint, error, children, className = '', aside }) => (
  <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
    {(label || aside) && (
      <div className="flex items-center justify-between gap-3">
        {label && <label htmlFor={id} className="text-xs font-medium text-ink-mid">{label}</label>}
        {aside}
      </div>
    )}
    {children}
    {error ? (
      <p id={`${id}-err`} className="flex items-center gap-1 text-xs text-crit">
        <CircleAlert size={14} aria-hidden="true" /> {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-xs text-ink-lo">{hint}</p>
    ) : null}
  </div>
);

/** `size`: 'md' (mặc định) hoặc 'sm'. Số thì coi như thuộc tính size gốc của <input>. */
const splitSize = (size) => (typeof size === 'number' ? ['md', size] : [size || 'md', undefined]);

export const TextField = ({ label, icon: Icon, trailing, hint, error, aside, size, className = '', inputClassName = '', id, ...props }) => {
  const auto = useId();
  const fid = id || auto;
  const [fs, nativeSize] = splitSize(size);
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className} aside={aside}>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-lo" aria-hidden="true" />}
        <input
          id={fid}
          size={nativeSize}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={`${fieldClass({ size: fs, error })} ${Icon ? 'pl-9' : 'pl-3'} ${trailing ? 'pr-11' : 'pr-3'} ${inputClassName}`}
          {...props}
        />
        {trailing && <span className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</span>}
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
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={`${fieldClass({ error, multiline: true })} block resize-y px-3 py-2.5 leading-relaxed ${maxLength ? 'pb-7' : ''}`}
          {...props}
        />
        {maxLength && (
          <span className="pointer-events-none absolute right-3 bottom-2 text-xs text-ink-lo tabular-nums">
            {String(value).length.toLocaleString('vi-VN')}/{maxLength.toLocaleString('vi-VN')}
          </span>
        )}
      </div>
    </Shell>
  );
};

export const Select = ({ label, hint, error, options = [], icon: Icon, size, className = '', id, ...props }) => {
  const auto = useId();
  const fid = id || auto;
  const [fs] = splitSize(size);
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-lo" aria-hidden="true" />}
        <select
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={`${fieldClass({ size: fs, error })} cursor-pointer appearance-none ${Icon ? 'pl-9' : 'pl-3'} pr-9`}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
      </div>
    </Shell>
  );
};
