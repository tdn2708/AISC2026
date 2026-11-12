import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, TriangleAlert } from 'lucide-react';
import { AnimatedNumber, EvidenceBar } from '../ui';
import { fmtInt, fmtPct, fmtSignedPct } from '../../lib/format';
import EvidenceDrawer from './EvidenceDrawer';

/**
 * CỬA HÀNG ĐANG THẾ NÀO — ba con số, nói bằng lời của chủ shop
 * ------------------------------------------------------------------
 *   Khiếu nại trên đơn hàng   bao nhiêu phần trăm đơn bị khiếu nại, so với tuần trước
 *   Khách không hài lòng      bao nhiêu trên 100 phản hồi, và xu hướng 7 ngày
 *   Độ tin số liệu            có đáng tin để ra quyết định không
 * Một khối duy nhất (không phải bốn thẻ rời), một dòng bằng chứng chung cho
 * cả khối. Bấm vào con số nào thì mở phần giải thích cách tính của con số đó.
 */

const judge = (rel, lowerIsBetter = true) => {
  if (rel == null || !Number.isFinite(rel)) return 'none';
  if (Math.abs(rel) < 0.005) return 'flat';
  return rel > 0 === !lowerIsBetter ? 'good' : 'bad';
};

const Delta = ({ rel }) => {
  const j = judge(rel);
  if (j === 'none') return <span className="text-sm text-ink-mid">Chưa đủ dữ liệu tuần trước để so</span>;
  const Icon = j === 'flat' ? Minus : rel > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = { good: 'text-ok', bad: 'text-crit', flat: 'text-ink-mid' }[j];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon size={15} aria-hidden="true" />
        {j === 'flat' ? 'Không đổi' : `${rel > 0 ? 'Tăng' : 'Giảm'} ${fmtSignedPct(Math.abs(rel)).replace('+', '')}`}
      </span>
      <span className="text-ink-mid">so với tuần trước</span>
    </span>
  );
};

/**
 * Đường nhỏ dưới con số: số phản hồi tiêu cực từng kỳ, lấy đúng dữ liệu của
 * biểu đồ diễn biến bên dưới. Không trục, không lưới; chỉ đánh dấu kỳ cuối.
 */
const Sparkline = ({ points }) => {
  if (!points || points.length < 3) return null;
  const W = 240, H = 40, P = 4;
  const max = Math.max(...points.map((p) => p.v), 1);
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <span className="mt-3 block">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-10 w-full max-w-[240px] overflow-visible"
        role="img"
        aria-label={`Số phản hồi tiêu cực theo ${points.length} kỳ gần nhất, kỳ cuối ${fmtInt(last.v)}`}
      >
        <path d={d} fill="none" stroke="var(--viz-neg)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.v)} r="3.5" fill="var(--viz-neg)" />
      </svg>
      <span className="mt-1 block text-xs text-ink-lo">Tiêu cực {points.length} kỳ gần nhất, kỳ {last.name}: {fmtInt(last.v)}</span>
    </span>
  );
};

const Metric = ({ label, children, sub, note, extra, bad, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-haspopup="dialog"
    className="group relative flex min-w-0 flex-col px-5 py-5 text-left transition-colors hover:bg-raised focus-visible:bg-raised sm:px-6"
  >
    {/* Chỉ số xấu: biểu tượng cảnh báo cạnh nhãn (thay sọc đỏ bên trái, F1-05) */}
    <span className="inline-flex items-center gap-1.5 text-base font-medium text-ink-mid">
      {bad && <TriangleAlert size={16} className="shrink-0 text-crit" aria-hidden="true" />}
      {bad && <span className="sr-only">Cần chú ý:</span>}
      {label}
    </span>
    <span className="mt-2 text-metric leading-none font-semibold tracking-[-0.02em] text-ink-hi">{children}</span>
    {sub && <span className="mt-2.5">{sub}</span>}
    {note && <span className="mt-1 text-sm text-ink-mid">{note}</span>}
    {extra}
    <span className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-accent-hi opacity-80 group-hover:underline group-hover:opacity-100">
      Cách tính
    </span>
  </button>
);

const StoreHealth = ({ stats, trend = [] }) => {
  const spark = trend.slice(-14).map((t) => ({ name: t.name, v: t.complaints || 0 }));
  const [open, setOpen] = useState(null);
  const ev = stats?.evidence;
  const wcr = stats?.weightedComplaintRate;
  const cmp = stats?.comparison;
  const son = stats?.shareOfNegative;
  const v = stats?.negativeVelocity?.velocity;
  const health = stats?.dataHealthScore;

  const wcrRel = cmp?.deltas?.wcr?.rel;
  const sonRel = cmp?.deltas?.shareOfNegative?.rel;
  const hasPrev = wcrRel != null && Number.isFinite(wcrRel);
  const velocity = v == null ? null : v > 0.2 ? ['text-crit', 'tăng nhanh'] : v > 0.05 ? ['text-high', 'đang tăng'] : v < -0.05 ? ['text-ok', 'đang giảm'] : ['text-ink-mid', 'ổn định'];
  const trust = health == null ? null : health >= 75 ? ['text-ok', 'Đáng tin'] : health >= 50 ? ['text-high', 'Cần chú ý'] : ['text-crit', 'Chưa đáng tin'];

  return (
    <section aria-labelledby="health-title" className="mb-8 overflow-hidden glass-strong rounded-surf">
      <h2 id="health-title" className="px-5 pt-5 text-heading font-semibold tracking-[-0.01em] text-ink-hi sm:px-6">Cửa hàng đang thế nào</h2>
      <div className="mt-1 grid grid-cols-1 divide-y divide-line-soft md:grid-cols-3 md:divide-x md:divide-y-0">
        <Metric
          label="Khiếu nại trên đơn hàng"
          bad={judge(wcrRel) === 'bad'}
          sub={wcr?.available && <Delta rel={wcrRel} />}
          note={wcr?.available && (hasPrev ? `7 ngày qua ${fmtPct(cmp?.current?.wcr, 2)}, tuần trước ${fmtPct(cmp?.previous?.wcr, 2)}` : `Trên ${fmtInt(wcr.denominator)} đơn hàng`)}
          onOpen={() => setOpen('wcr')}
        >
          {wcr?.available ? <AnimatedNumber value={wcr.value * 100} decimals={2} unit="%" /> : <span className="text-heading font-medium text-ink-mid">Chưa nối dữ liệu đơn hàng</span>}
        </Metric>
        <Metric
          label="Khách không hài lòng"
          bad={judge(sonRel) === 'bad'}
          sub={son?.available && <Delta rel={sonRel} />}
          note={velocity && <>Phản hồi tiêu cực 7 ngày gần đây <span className={`font-semibold ${velocity[0]}`}>{velocity[1]}</span></>}
          extra={son?.available && <Sparkline points={spark} />}
          onOpen={() => setOpen('negative')}
        >
          {son?.available ? (
            <>
              <AnimatedNumber value={Math.round(son.value * 100)} />
              <span className="ml-1.5 text-base font-medium text-ink-mid">trên 100 phản hồi</span>
            </>
          ) : <span className="text-heading font-medium text-ink-mid">Chưa có dữ liệu</span>}
        </Metric>
        <Metric
          label="Độ tin số liệu"
          bad={health != null && health < 50}
          sub={health != null && <span className="text-sm text-ink-mid">Điểm <span className="font-semibold text-ink-hi">{health}</span>/100</span>}
          note={`${fmtInt(stats?.totalFeedbacks?.valid)} trên ${fmtInt(stats?.totalFeedbacks?.value)} phản hồi được tính, phần còn lại là rác hoặc nghi ảo`}
          onOpen={() => setOpen('health')}
        >
          {trust ? <span className={trust[0]}>{trust[1]}</span> : <span className="text-heading font-medium text-ink-mid">Chưa có dữ liệu</span>}
        </Metric>
      </div>
      {ev?.all && (
        <div className="border-t border-line-soft px-5 py-3.5 sm:px-6">
          <EvidenceBar mix={ev.all} />
        </div>
      )}
      <EvidenceDrawer metric={open} stats={stats} onClose={() => setOpen(null)} />
    </section>
  );
};

export default StoreHealth;
