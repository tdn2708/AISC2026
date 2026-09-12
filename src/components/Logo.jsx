import React, { useId } from 'react';

/**
 * NHẬN DIỆN THƯƠNG HIỆU CUSTOMER RADAR
 * ------------------------------------------------------------------
 * Bản cũ dựng logo bằng cách xếp chồng các thẻ div và đặt chữ "CR" bằng
 * font chữ viết tay (Dancing Script) lên trên. Cách đó có ba vấn đề:
 * chữ viết tay mất nét ở cỡ nhỏ (favicon, header di động), các đường
 * radar bị méo khi đổi kích thước vì dùng phần trăm, và mỗi nơi lại
 * dựng lại từ đầu nên ba màn hình cho ra ba logo hơi khác nhau.
 *
 * Bản này là một hình SVG duy nhất, dùng chung ở mọi nơi: nét sắc ở
 * mọi cỡ, tỉ lệ không đổi, và chỉ cần sửa một chỗ.
 */

/**
 * Dấu hiệu radar. Hình vẽ mang đúng nghĩa của sản phẩm: các vòng quét,
 * tia quét, và một chấm tín hiệu nằm lệch tâm — thứ mà hệ thống tồn tại
 * để phát hiện.
 */
export const LogoMark = ({ size = 40, glow = true, title = 'Customer Radar' }) => {
  return (
    <img 
      src="/logo.png" 
      alt={title}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0, borderRadius: '8px', objectFit: 'cover' }}
    />
  );
};

/**
 * Chữ ký thương hiệu. Dùng chính font Inter của giao diện thay vì font
 * viết tay: đọc được ở mọi cỡ, và trông giống một sản phẩm phần mềm
 * doanh nghiệp thay vì một tấm thiệp.
 */
export const LogoWordmark = ({ size = 'md', showTagline = true, tagline = 'Radar khách hàng' }) => {
  const scale = { sm: 1, md: 1.35, lg: 1.9 }[size] || 1.35;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <div
        style={{
          fontSize: `${0.95 * scale}rem`,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap'
        }}
      >
        Customer
        <span
          style={{
            color: 'var(--accent-hi)'
          }}
        >
          Radar
        </span>
      </div>
      {showTagline && (
        <div
          style={{
            /* Bản cũ đặt letter-spacing .18em kèm white-space: nowrap,
               nên dòng chữ ký luôn dài hơn thanh bên và bị cắt ở mép. */
            fontSize: `${0.48 * scale}rem`,
            color: 'var(--text-lo)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
};

/** Khối logo hoàn chỉnh: dấu hiệu + chữ ký */
export const Logo = ({ size = 'md', showTagline = true, tagline, markSize }) => {
  const defaultMark = { sm: 28, md: 40, lg: 56 }[size] || 40;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? '0.6rem' : '0.85rem', minWidth: 0 }}>
      <LogoMark size={markSize || defaultMark} />
      <LogoWordmark size={size} showTagline={showTagline} tagline={tagline} />
    </div>
  );
};

export default Logo;
