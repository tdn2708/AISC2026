import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Nút — bốn biến thể của UI-kit tham chiếu (primary / secondary / ghost /
 * icon) cộng biến thể "danger" mềm cho thao tác xoá.
 * Trạng thái vô hiệu là kính mờ nhạt, đúng như cột "Неактивна" của bộ kit.
 */
const VARIANT = {
  primary:
    'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
  secondary: 'border border-line bg-surface text-ink-hi hover:bg-raised',
  soft: 'bg-accent-dim text-accent-hi hover:bg-accent/25',
  outline: 'border border-line bg-transparent text-ink-hi hover:bg-raised',
  ghost: 'text-ink-mid hover:bg-raised hover:text-ink-hi',
  danger: 'bg-crit/12 text-crit hover:bg-crit/20'
};

const SIZE = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-12 gap-2 rounded-lg px-5 text-[0.95rem]'
};

export const Button = ({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  ...rest
}) => {
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <Tag
      type={Tag === 'button' ? rest.type || 'button' : undefined}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-[filter,background-color,color,box-shadow] duration-150 disabled:opacity-45 disabled:shadow-none disabled:brightness-100 ${VARIANT[variant]} ${SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" /> : Icon && <Icon size={iconSize} aria-hidden="true" />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden="true" />}
    </Tag>
  );
};

/** Nút tròn chỉ có biểu tượng — luôn có `label` cho trình đọc màn hình */
export const IconButton = ({ icon: Icon, label, variant = 'glass', size = 40, className = '', badge, ...rest }) => {
  const tone = {
    glass: 'border border-line bg-surface text-ink-mid hover:bg-raised hover:text-ink-hi',
    primary: 'bg-accent text-on-accent hover:brightness-110',
    ghost: 'text-ink-lo hover:bg-raised hover:text-ink-hi'
  }[variant];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative grid shrink-0 place-items-center rounded-lg transition-[color,background-color,filter] duration-150 disabled:opacity-45 ${tone} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={Math.round(size * 0.42)} aria-hidden="true" />
      {badge}
    </button>
  );
};
