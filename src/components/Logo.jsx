import React, { useId } from 'react';

/**
 * NHẬN DIỆN THƯƠNG HIỆU CUSTOMER RADAR
 * ------------------------------------------------------------------
 * Dấu hiệu là một ô vuông bo tròn màu sage — cùng ngữ pháp với ô logo
 * của bộ kit tham chiếu — bên trong là các vòng quét radar, một tia quét
 * và một chấm tín hiệu màu blush: thứ hệ thống tồn tại để phát hiện.
 * Vẽ bằng SVG nên sắc nét ở mọi cỡ, từ favicon tới màn đăng nhập.
 */
export const LogoMark = ({ size = 40, title = 'Customer Radar' }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title} className="block shrink-0">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6E9D8F" />
          <stop offset="1" stopColor="#3D6B5F" />
        </linearGradient>
        <radialGradient id={`sweep-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.32" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#lg-${id})`} />
      <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.28" />
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
        <circle cx="24" cy="25" r="14" strokeOpacity="0.45" strokeWidth="1.6" />
        <circle cx="24" cy="25" r="9" strokeOpacity="0.7" strokeWidth="1.6" />
        <circle cx="24" cy="25" r="4" strokeWidth="1.8" />
      </g>
      <path d="M24 25 L24 11 A14 14 0 0 1 36.1 18 Z" fill={`url(#sweep-${id})`} />
      <path d="M24 25 L34.5 15" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="31.5" cy="31" r="2.6" fill="#F4C3CB" stroke="#FFFFFF" strokeWidth="1.2" />
    </svg>
  );
};

/** Chữ ký: "Customer" + "Radar" màu nhấn, cùng một font */
export const LogoWordmark = ({ size = 'md', showTagline = true, tagline = 'Radar khách hàng' }) => {
  const scale = { sm: 1, md: 1.3, lg: 1.9 }[size] || 1.3;
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 1 }}>
      <div className="whitespace-nowrap text-ink-hi" style={{ fontSize: `${1 * scale}rem`, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        <span className="font-semibold">Customer</span>
        <span className="ml-1 font-semibold text-accent">Radar</span>
      </div>
      {showTagline && (
        <div
          className="truncate font-semibold text-ink-lo uppercase"
          style={{ fontSize: `${0.5 * scale}rem`, letterSpacing: '0.14em' }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
};

export const Logo = ({ size = 'md', showTagline = true, tagline, markSize }) => {
  const defaultMark = { sm: 34, md: 42, lg: 58 }[size] || 42;
  return (
    <div className="flex min-w-0 items-center" style={{ gap: size === 'sm' ? '0.65rem' : '0.85rem' }}>
      <LogoMark size={markSize || defaultMark} />
      <LogoWordmark size={size} showTagline={showTagline} tagline={tagline} />
    </div>
  );
};

export default Logo;
