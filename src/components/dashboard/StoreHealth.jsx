import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from 'lucide-react';
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

const Metric = ({ label, children, sub, note, bad, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-haspopup="dialog"
    className="group relative flex min-w-0 flex-col px-5 py-5 text-left transition-colors hover:bg-raised focus-visible:bg-raised sm:px-6"
  >
    {bad && <span aria-hidden="true" className="absolute top-5 bottom-5 left-0 w-[3px] rounded-r bg-crit" />}
    <span className="text-base font-medium text-ink-mid">{label}</span>
    <span className="mt-2 text-metric leading-none font-semibold tracking-[-0.02em] text-ink-hi">{children}</span>
    {sub && <span className="mt-2.5">{sub}</span>}
    {note && <span className="mt-1 text-sm text-ink-mid">{note}</span>}
    <span className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-accent-hi opacity-80 group-hover:underline group-hover:opacity-100">
      Cách tính <ChevronRight size={14} aria-hidden="true" />
    </span>
  </button>
);

const StoreHealth = ({ stats }) => {
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
  const trend = v == null ? null : v > 0.2 ? ['text-crit', 'tăng nhanh'] : v > 0.05 ? ['text-high', 'đang tăng'] : v < -0.05 ? ['text-ok', 'đang giảm'] : ['text-ink-mid', 'ổn định'];
  const trust = health == null ? null : health >= 75 ? ['text-ok', 'Đáng tin'] : health >= 50 ? ['text-high', 'Cần chú ý'] : ['text-crit', 'Chưa đáng tin'];

  return (
    <section aria-labelledby="health-title" className="mb-8 overflow-hidden glass-strong rounded-xl">
      <h2 id="health-title" className="px-5 pt-5 text-heading font-semibold tracking-[-0.01em] text-ink-hi sm:px-6">Cửa hàng đang thế nào</h2>
      <div className="mt-1 grid grid-cols-1 divide-y divide-line-soft md:grid-cols-3 md:divide-x md:divide-y-0">
        <Metric
          label="Khiếu nại trên đơn hàng"
          bad={judge(wcrRel) === 'bad'}
          sub={wcr?.available && <Delta rel={wcrRel} />}
          note={wcr?.available && (hasPrev ? `7 ngày qua ${fmtPct(cmp?.current?.wcr, 2)}, tuần trước ${fmtPct(cmp?.previous?.wcr, 2)}` : `Trên ${fmtInt(wcr.denominator)} đơn hàng`)}
          onOpen={() => setOpen('wcr')}
        >
          {wcr?.available ? <AnimatedNumber value={wcr.value * 100} decimals={2} unit="%" /> : <span className="text-lg font-medium text-ink-mid">Chưa nối dữ liệu đơn hàng</span>}
        </Metric>
        <Metric
          label="Khách không hài lòng"
          bad={judge(sonRel) === 'bad'}
          sub={son?.available && <Delta rel={sonRel} />}
          note={trend && <>Phản hồi tiêu cực 7 ngày gần đây <span className={`font-semibold ${trend[0]}`}>{trend[1]}</span></>}
          onOpen={() => setOpen('negative')}
        >
          {son?.available ? (
            <>
              <AnimatedNumber value={Math.round(son.value * 100)} />
              <span className="ml-1.5 text-base font-medium text-ink-mid">trên 100 phản hồi</span>
            </>
          ) : <span className="text-lg font-medium text-ink-mid">Chưa có dữ liệu</span>}
        </Metric>
        <Metric
          label="Độ tin số liệu"
          bad={health != null && health < 50}
          sub={health != null && <span className="text-sm text-ink-mid">Điểm <span className="font-semibold text-ink-hi">{health}</span>/100</span>}
          note={`${fmtInt(stats?.totalFeedbacks?.valid)} trên ${fmtInt(stats?.totalFeedbacks?.value)} phản hồi được tính, phần còn lại là rác hoặc nghi ảo`}
          onOpen={() => setOpen('health')}
        >
          {trust ? <span className={trust[0]}>{trust[1]}</span> : <span className="text-lg font-medium text-ink-mid">Chưa có dữ liệu</span>}
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
