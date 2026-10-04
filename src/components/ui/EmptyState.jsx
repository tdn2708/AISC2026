import React, { useId } from 'react';

/**
 * Minh hoạ nét mảnh cho trạng thái rỗng: núi sương nhiều lớp, mặt trời nhạt.
 *   calm  — mọi thứ ổn (không có cảnh báo)
 *   empty — chưa có dữ liệu
 *   error — không tải được
 */
const Illustration = ({ variant }) => {
  // ID gradient phải duy nhất: nhiều trạng thái rỗng trên cùng một trang
  // mà trùng ID thì trình duyệt chỉ nhận định nghĩa đầu tiên
  const gid = `es-${useId().replace(/:/g, '')}`;
  const sun = variant === 'error' ? 'var(--blush)' : variant === 'calm' ? '#F4E3C8' : 'var(--sky)';
  return (
    <svg viewBox="0 0 160 110" className="h-[96px] w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--sky)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="152" height="102" rx="22" fill={`url(#${gid})`} />
      <circle cx="108" cy="38" r="14" fill={sun} opacity="0.9" />
      <path d="M4 86 L44 46 L66 66 L92 40 L156 92 L156 106 L4 106 Z" fill="var(--accent)" opacity="0.18" />
      <path d="M4 96 L36 70 L60 86 L96 60 L156 100 L156 106 L4 106 Z" fill="var(--accent)" opacity="0.32" />
      <path d="M44 46 L66 66 L92 40" fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" />
      {variant === 'error' ? (
        <path d="M74 22 l12 0 M80 16 l0 12" stroke="var(--sev-crit)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(45 80 22)" />
      ) : variant === 'calm' ? (
        <path d="M72 24 l5 5 l10 -11" fill="none" stroke="var(--sev-ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      <path d="M18 104 h124" stroke="var(--accent)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 4" />
    </svg>
  );
};

export const EmptyState = ({ variant = 'empty', title, description, action, compact = false, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} ${className}`}>
    <Illustration variant={variant} />
    <h3 className="mt-4 text-[0.98rem] font-semibold text-ink-hi">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-lo">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
