import React from 'react';

/**
 * NHẬN DIỆN THƯƠNG HIỆU CUSTOMER RADAR
 * ------------------------------------------------------------------
 * Dấu "khung ngắm" (phương án A2, người dùng chọn 12/11/2026): một chữ L
 * đứng ở góc dưới trái và chính nó xoay ngược ở góc trên phải, lấy từ ký
 * hiệu tay chữ L của hai bạn trong ảnh nhóm. Hai chữ L tạo thành khung
 * ngắm; chấm san hô ở giữa là khách hàng được nhìn thấy, được xác nhận.
 *
 * Vẽ trên lưới 16 nên ở 16 px (favicon) mỗi nét rơi đúng điểm ảnh. Không
 * nền, không vòng tròn, không gradient. Nét theo var(--text-hi) của nền
 * đang đứng (khối mực đổi token cục bộ là đủ); chấm đọc --logo-dot.
 * Bản in PDF truyền `colors` bằng hex (REPORT trong report_kit.jsx) vì
 * html2canvas chụp SVG không kèm biến CSS. Bản SVG gốc và bản một màu:
 * .hallmark/logo/vong-2/A2-*.svg.
 */
const TOKEN_COLORS = { ink: 'var(--text-hi)', dot: 'var(--logo-dot)' };

export const LogoMark = ({ size = 28, title = 'Customer Radar', colors = TOKEN_COLORS }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={title} className="block shrink-0">
    <path
      d="M2.5 6.5V13.5H6.5 M13.5 9.5V2.5H9.5"
      fill="none"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="miter"
      style={{ stroke: colors.ink }}
    />
    <circle cx="8" cy="8" r="2" style={{ fill: colors.dot }} />
  </svg>
);

/** Chữ ký: "Customer Radar" một màu, cùng màu nét của dấu */
export const LogoWordmark = ({ size = 'md', showTagline = true, tagline = 'Radar khách hàng' }) => {
  const scale = { sm: 1, md: 1.3, lg: 1.9 }[size] || 1.3;
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 1 }}>
      <div className="whitespace-nowrap font-semibold text-ink-hi" style={{ fontSize: `${1 * scale}rem`, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        Customer Radar
      </div>
      {showTagline && (
        <div
          className="truncate font-semibold text-ink-lo"
          style={{ fontSize: `${0.62 * scale}rem` }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
};

export const Logo = ({ size = 'md', showTagline = true, tagline, markSize }) => {
  const defaultMark = { sm: 24, md: 30, lg: 44 }[size] || 30;
  return (
    <div className="flex min-w-0 items-center" style={{ gap: size === 'sm' ? '0.55rem' : '0.7rem' }}>
      <LogoMark size={markSize || defaultMark} />
      <LogoWordmark size={size} showTagline={showTagline} tagline={tagline} />
    </div>
  );
};

export default Logo;
