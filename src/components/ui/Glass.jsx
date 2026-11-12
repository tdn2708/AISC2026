import React from 'react';
import { Siren, TriangleAlert, CircleAlert, Info } from 'lucide-react';
import { severityOf } from '../../lib/format';

/**
 * Bề mặt kính dùng chung.
 * Panel số liệu (K1, 12.7): cả hai tone dùng `--glass-panel` (mờ một phần, viền 1px, mép sáng),
 * KHÔNG backdrop-filter. Chữ nhỏ dày đặc (bảng, danh sách, sổ) đặt trong khối `paper` đặc.
 *   tone="soft"   — khung và thẻ thưa chữ
 *   tone="strong" — panel nhiều chữ nhỏ
 * `glow` chỉ nhận 'crit' | 'high' — ánh sáng là tín hiệu, không phải trang trí.
 */
export const GlassPanel = ({ as: Tag = 'div', tone = 'soft', glow = null, className = '', children, ...rest }) => {
  const glowClass = glow === 'crit' ? 'glow-crit' : glow === 'high' ? 'glow-high' : '';
  return (
    <Tag className={`${tone === 'strong' ? 'glass-strong' : 'glass'} relative rounded-surf ${glowClass} ${className}`} {...rest}>
      {children}
    </Tag>
  );
};

export const PanelHeader = ({ title, subtitle, right, id, className = '' }) => (
  <header className={`mb-4 flex items-start justify-between gap-x-4 gap-y-2 ${right ? 'flex-wrap sm:flex-nowrap' : ''} ${className}`}>
    <div className="min-w-0 flex-[1_1_12rem]">
      <h2 id={id} className="text-heading font-semibold tracking-tight text-ink-hi">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm leading-relaxed text-ink-mid">{subtitle}</p>}
    </div>
    {right}
  </header>
);

const SEVERITY_ICON = { Critical: Siren, High: TriangleAlert, Medium: CircleAlert, Low: Info };

/** Nhãn mức độ: màu + biểu tượng + chữ, để không bao giờ chỉ dựa vào màu. */
export const SeverityBadge = ({ level, className = '' }) => {
  const meta = severityOf(level);
  const Icon = SEVERITY_ICON[level] || Info;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-ctrl bg-(--sev)/12 px-1.5 py-0.5 tabular-nums text-xs font-medium text-(--sev) ${className}`}
      style={{ '--sev': meta.color }}
    >
      <Icon size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

/** Biểu tượng (i): phương pháp tính không mất đi, chỉ thôi chiếm chỗ của con số. */
export const MethodHint = ({ text }) => (
  <span
    tabIndex={0}
    role="img"
    aria-label={text}
    title={text}
    className="grid size-5 shrink-0 cursor-help place-items-center rounded-ctrl border border-line text-ink-lo transition-colors hover:border-ink-lo hover:text-ink-mid"
  >
    <Info size={11} aria-hidden="true" />
  </span>
);
