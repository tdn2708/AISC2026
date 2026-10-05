import React from 'react';
import { Check } from 'lucide-react';

/** Công tắc — vai trò switch thật, không phải checkbox đội lốt */
export const Switch = ({ checked, onChange, label, disabled, size = 'md' }) => {
  const dims = size === 'sm' ? { track: 'h-5 w-9', knob: 'size-4', on: 'translate-x-4' } : { track: 'h-6 w-11', knob: 'size-5', on: 'translate-x-5' };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-45 ${dims.track} ${
        checked ? 'bg-accent' : 'bg-ink-lo/25'
      }`}
    >
      <span
        className={`${dims.knob} rounded-full bg-white shadow-[0_1px_3px_rgb(31_45_53/0.3)] transition-transform duration-200 ${checked ? dims.on : 'translate-x-0'}`}
      />
    </button>
  );
};

/** Hộp kiểm có nhãn — cả hàng bấm được */
export const Checkbox = ({ checked, onChange, label, description, disabled }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
    className="group flex w-full items-start gap-3 text-left disabled:opacity-45"
  >
    <span
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
        checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface/70 group-hover:border-ink-lo'
      }`}
    >
      {checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
    </span>
    <span className="min-w-0">
      <span className="block text-sm text-ink-hi">{label}</span>
      {description && <span className="mt-0.5 block text-xs text-ink-lo">{description}</span>}
    </span>
  </button>
);

/** Nhóm nút chọn một — dùng cho lựa chọn có 2–5 phương án loại trừ nhau */
export const RadioCards = ({ value, onChange, options, name }) => (
  <div role="radiogroup" aria-label={name} className="grid gap-3 sm:grid-cols-2">
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(o.value)}
          className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow] ${
            active ? 'border-accent bg-accent-dim shadow-[0_0_0_3px_var(--accent-dim)]' : 'border-line bg-surface/50 hover:border-ink-lo'
          }`}
        >
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-accent' : 'border-line'}`}>
            {active && <span className="size-2.5 rounded-full bg-accent" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-hi">{o.label}</span>
            {o.description && <span className="mt-0.5 block text-xs text-ink-lo">{o.description}</span>}
            {o.preview}
          </span>
        </button>
      );
    })}
  </div>
);
