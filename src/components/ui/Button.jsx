import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Nút (F1-05: gộp khoảng 20 kiểu nút trong app về 7).
 *
 *   Button variant  primary    nút chính, tô đặc nhấn; một nút chính mỗi vùng thao tác
 *                   secondary  nút phụ, viền + nền bề mặt
 *                   ghost      nút trơn, không viền (thao tác phụ trong hàng, thanh công cụ)
 *                   danger     nút nguy hiểm (xóa, bỏ), nền đỏ nhạt
 *                   link       nút chữ, trông như liên kết (mở trang khác, xem thêm, xóa lọc)
 *          size     sm 32px, md 40px (lg 48px chỉ cho trang giới thiệu công khai)
 *   IconButton      nút chỉ có biểu tượng, luôn có `label`; tông `glass` (viền) hoặc `ghost` (trơn),
 *                   `danger` cho xóa; cỡ 32 hoặc 40
 *
 * Tên cũ vẫn nhận để không vỡ chỗ gọi: `outline` và `soft` ra `secondary`; IconButton `primary` giữ.
 *
 * Tám trạng thái (xem /ui-kit):
 *   mặc định; rê: đổi màu một bước, chữ và viền về accent-hi; nhấn: lún 1px (index.css, tức thì);
 *   focus-visible: viền ngoài 2px màu nhấn (index.css, hiện ngay, không chuyển động);
 *   tắt: mờ 55%, con trỏ cấm, thuộc tính disabled thật;
 *   đang tải: vòng xoay thay biểu tượng, chữ giữ nguyên nên nút không đổi bề rộng, aria-busy;
 *   lỗi: nút không tự đổi màu, lỗi hiện bằng chữ ở biểu mẫu (`Field`), nút đổi sang "Thử lại";
 *   đã chọn (nút bật tắt): `pressed`, nền accent-dim, viền và chữ nhấn, aria-pressed.
 *
 * Chỉ chuyển màu (background-color, color, border-color) trong --motion-micro; không transition-all.
 */
const VARIANT = {
  primary: 'border border-transparent bg-accent text-on-accent hover:bg-accent-hi disabled:hover:bg-accent',
  secondary: 'border border-line bg-surface text-ink-hi hover:border-accent hover:text-accent-hi disabled:hover:border-line disabled:hover:text-ink-hi',
  ghost: 'border border-transparent text-ink-mid hover:bg-raised hover:text-accent-hi disabled:hover:bg-transparent',
  danger: 'border border-transparent bg-crit/12 text-crit hover:bg-crit/20 disabled:hover:bg-crit/12',
  link: 'text-accent hover:text-accent-hi hover:underline underline-offset-2 disabled:hover:no-underline'
};
const ALIAS = { outline: 'secondary', soft: 'secondary' };

/** Đã chọn (nút bật tắt): một ngôn ngữ chọn chung với Chip, Segmented, RadioCards */
const PRESSED = 'border border-accent bg-accent-dim text-accent-hi';

const SIZE = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base'
};
/** Nút chữ không có chiều cao cố định: nó nằm trong dòng chữ */
const LINK_SIZE = { sm: 'gap-1 text-xs', md: 'gap-1 text-sm', lg: 'gap-1.5 text-base' };

export const Button = ({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  pressed,
  className = '',
  children,
  disabled,
  ...rest
}) => {
  const v = ALIAS[variant] || variant;
  const isLink = v === 'link';
  const iconSize = size === 'sm' ? 14 : 16;
  const look = pressed ? PRESSED : VARIANT[v] || VARIANT.primary;
  const box = isLink ? `${LINK_SIZE[size] || LINK_SIZE.md} rounded-ctrl` : `${SIZE[size] || SIZE.md} rounded-ctrl`;
  return (
    <Tag
      type={Tag === 'button' ? rest.type || 'button' : undefined}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${look} ${box} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="keep-motion animate-spin" aria-hidden="true" /> : Icon && <Icon size={iconSize} aria-hidden="true" />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden="true" />}
    </Tag>
  );
};

const ICON_TONE = {
  glass: 'border border-line bg-surface text-ink-mid hover:border-accent hover:text-accent-hi',
  ghost: 'text-ink-lo hover:bg-raised hover:text-accent-hi',
  danger: 'text-ink-lo hover:bg-crit/12 hover:text-crit',
  primary: 'bg-accent text-on-accent hover:bg-accent-hi'
};
const ICON_PX = { sm: 32, md: 40 };

/** Nút chỉ có biểu tượng: luôn có `label` cho trình đọc màn hình. `size` nhận 'sm' | 'md' hoặc số px. */
export const IconButton = ({ icon: Icon, label, variant = 'glass', size = 40, className = '', badge, pressed, loading = false, disabled, ...rest }) => {
  const px = typeof size === 'number' ? size : ICON_PX[size] || 40;
  const iconPx = px <= 32 ? 16 : Math.round(px * 0.42);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`relative grid shrink-0 place-items-center rounded-ctrl transition-[color,background-color,border-color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${pressed ? PRESSED : ICON_TONE[variant] || ICON_TONE.glass} ${className}`}
      style={{ width: px, height: px }}
      {...rest}
    >
      {loading ? <Loader2 size={iconPx} className="keep-motion animate-spin" aria-hidden="true" /> : <Icon size={iconPx} aria-hidden="true" />}
      {badge}
    </button>
  );
};
