import React from 'react';
import { Siren, TriangleAlert, CircleAlert, Info } from 'lucide-react';
import { severityOf } from './format';

/** Bề mặt kính dùng chung. `glow` chỉ nhận 'crit' | 'high' — ánh sáng là tín hiệu, không phải trang trí. */
export const GlassPanel = ({ as: Tag = 'div', glow = null, className = '', children, ...rest }) => {
  const glowClass = glow === 'crit' ? 'glow-crit' : glow === 'high' ? 'glow-high' : '';
  return (
    <Tag className={`glass relative rounded-2xl ${glowClass} ${className}`} {...rest}>
      {children}
    </Tag>
  );
};

export const PanelHeader = ({ title, subtitle, right, id }) => (
  <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
    <div className="min-w-0">
      <h3 id={id} className="text-[0.98rem] font-semibold text-ink-hi">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-lo">{subtitle}</p>}
    </div>
    {right}
  </header>
);

const SEVERITY_ICON = { Critical: Siren, High: TriangleAlert, Medium: CircleAlert, Low: Info };

/** Nhãn mức độ: màu + biểu tượng + chữ, để không bao giờ chỉ dựa vào màu. */
export const SeverityBadge = ({ level }) => {
  const meta = severityOf(level);
  const Icon = SEVERITY_ICON[level] || Info;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-(--sev)/35 bg-(--sev)/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-(--sev)"
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
    className="grid size-5 shrink-0 cursor-help place-items-center rounded-full border border-line/70 text-ink-lo transition-colors hover:border-ink-lo hover:text-ink-mid"
  >
    <Info size={11} aria-hidden="true" />
  </span>
);
