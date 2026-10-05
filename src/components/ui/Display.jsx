import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert } from 'lucide-react';

/* ---------------------------------------------------------------
   Nhóm hiển thị: tiêu đề trang, nhãn khu vực, badge, thanh tiến
   trình, stepper, mặt cảm xúc, toast.
   --------------------------------------------------------------- */

/**
 * Tiêu đề trang: một dòng, một màu. Vị trí trang đã có ở thanh trên, nên
 * không lặp lại nhãn nhóm ở đây; không tô hai màu cho một tiêu đề.
 */
export const PageHeader = ({ title, accent, subtitle, actions, meta }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 animate-fade-up">
    <div className="min-w-0">
      <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.02em] text-ink-hi">
        {accent ? `${title} ${accent}` : title}
      </h1>
      {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-mid">{subtitle}</p>}
      {meta && <div className="mt-2">{meta}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

/** Nhãn khu vực có đường kẻ: "BÁO CÁO MÔ TẢ ───────" */
export const SectionLabel = ({ children, right, className = '' }) => (
  <div className={`mb-4 flex items-center gap-3 ${className}`}>
    <span className="size-2 shrink-0 rounded-[2px] bg-accent" aria-hidden="true" />
    <span className="font-mono text-[0.76rem] font-semibold tracking-[0.04em] whitespace-nowrap text-ink-hi uppercase">{children}</span>
    <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
    {right}
  </div>
);

const BADGE = {
  neutral: 'bg-raised text-ink-mid',
  accent: 'bg-accent-dim text-accent-hi',
  crit: 'bg-crit/12 text-crit',
  high: 'bg-high/12 text-high',
  med: 'bg-med/12 text-med',
  ok: 'bg-ok/12 text-ok',
  blush: 'bg-blush/45 text-ink-hi',
  sky: 'bg-sky/45 text-ink-hi'
};

/** Badge — nhãn chữ nhỏ, góc vuông nhẹ, nền nhạt cùng tông chữ */
export const Badge = ({ tone = 'neutral', icon: Icon, children, mono, className = '' }) => (
  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${BADGE[tone]} ${mono ? 'font-mono' : ''} ${className}`}>
    {Icon && <Icon size={12} aria-hidden="true" />}
    {children}
  </span>
);

/** Thanh tiến trình mảnh — theo nhóm "Полоса прогресса" */
export const ProgressBar = ({ value = 0, tone = 'accent', label, showValue, height = 6, className = '' }) => {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fill = { accent: 'bg-accent', crit: 'bg-crit', high: 'bg-high', ok: 'bg-ok', pos: 'bg-pos', neg: 'bg-neg' }[tone] || 'bg-accent';
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          {label && <span className="text-ink-mid">{label}</span>}
          {showValue && <span className="font-mono text-ink-hi">{pct}%</span>}
        </div>
      )}
      <div
        className="w-full overflow-hidden rounded-full bg-raised"
        style={{ height }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className={`h-full rounded-full ${fill} transition-[width] duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/**
 * Stepper — theo nhóm "Шаги (прогресс)": các bước đánh số nối bằng đường
 * mảnh. Dùng cho phễu dữ liệu và luồng kết nối nguồn.
 */
export const Stepper = ({ steps, className = '' }) => (
  <ol
    className={`grid list-none grid-cols-2 gap-4 sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))] sm:gap-0 ${className}`}
    style={{ '--n': steps.length }}
  >
    {steps.map((s, i) => {
      const toneCls = {
        accent: 'bg-accent text-on-accent',
        crit: 'bg-crit/14 text-crit',
        high: 'bg-high/14 text-high',
        med: 'bg-med/14 text-med',
        ok: 'bg-ok text-white',
        neutral: 'bg-surface text-ink-mid border border-line'
      }[s.tone || 'neutral'];
      return (
        <li key={s.label} className="relative pr-3">
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="absolute top-[15px] right-0 left-10 hidden h-px bg-line sm:block" />
          )}
          <span className={`relative z-10 grid size-[30px] place-items-center rounded-md font-mono text-xs font-semibold ${toneCls}`}>
            {s.marker ?? i + 1}
          </span>
          <p className="mt-3 text-xs leading-snug font-medium text-ink-mid">{s.label}</p>
          <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-ink-hi">{s.value}</p>
          {s.sub && <p className="mt-0.5 text-[0.7rem] leading-snug text-ink-lo">{s.sub}</p>}
        </li>
      );
    })}
  </ol>
);

const MARK = {
  Positive: { label: 'Tích cực', color: 'var(--viz-pos)' },
  Neutral: { label: 'Trung tính', color: 'var(--viz-neu)' },
  Negative: { label: 'Tiêu cực', color: 'var(--viz-neg)' }
};

/**
 * Dấu cảm xúc — một ô vuông màu nhỏ, cùng màu với biểu đồ. Giữ tên cũ để
 * mọi nơi gọi không phải sửa; `size` là kích thước vùng chứa cũ.
 */
export const SentimentFace = ({ sentiment, size = 28 }) => {
  const m = MARK[sentiment] || MARK.Neutral;
  const s = Math.max(8, Math.round(size * 0.34));
  return (
    <span
      className="inline-block shrink-0 rounded-[3px]"
      style={{ width: s, height: s, background: m.color }}
      title={m.label}
      aria-label={m.label}
      role="img"
    />
  );
};

/** Thông báo nổi góc màn hình */
export const Toast = ({ show, tone = 'ok', children }) => {
  if (!show) return null;
  const Icon = tone === 'crit' ? CircleAlert : CheckCircle2;
  // Portal ra body: nếu nằm trong một tổ tiên có transform hoặc
  // backdrop-filter, `position: fixed` sẽ bám theo tổ tiên đó thay vì màn hình
  return createPortal(
    <div role="status" className="cx fixed right-6 bottom-6 z-[2100] animate-pop-in">
      <div className="glass-strong flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-ink-hi">
        <span className={`grid size-7 place-items-center rounded-md ${tone === 'crit' ? 'bg-crit/12 text-crit' : 'bg-ok/12 text-ok'}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
        {children}
      </div>
    </div>,
    document.body
  );
};

/** Ô chỉ số nhỏ trong panel — nhãn trên, số đơn cách dưới */
const STAT_TONE = { crit: 'text-crit', high: 'text-high', ok: 'text-ok', accent: 'text-accent-hi' };

export const Stat = ({ label, value, sub, tone, className = '' }) => (
  <div className={`rounded-lg border border-line-soft bg-surface p-4 ${className}`}>
    <p className="eyebrow">{label}</p>
    <p className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight ${STAT_TONE[tone] || 'text-ink-hi'}`}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-ink-lo">{sub}</p>}
  </div>
);
