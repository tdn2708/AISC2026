import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from 'lucide-react';
import { AnimatedNumber, EvidenceBar } from '../ui';
import { fmtInt, fmtPct, fmtSignedPct } from '../../lib/format';
import EvidenceDrawer from './EvidenceDrawer';

/**
 * VÙNG CHỈ SỐ — bốn thẻ rộng bằng nhau
 * ------------------------------------------------------------------
 * Mỗi thẻ: tên chỉ số → con số → so với kỳ trước → thanh bằng chứng.
 * Cả thẻ là một nút: bấm vào là mở ngăn kéo "Vì sao tin được?", nơi có
 * công thức bằng lời, thành phần bằng chứng và phản hồi gốc.
 *
 * Màu trạng thái chỉ xuất hiện khi chỉ số đang xấu đi (vạch mảnh trên
 * đầu thẻ + màu của viên so sánh); thẻ bình thường giữ trung tính.
 */

/** Đánh giá chiều thay đổi. Với khiếu nại, GIẢM mới là tốt. */
const judge = (rel, lowerIsBetter = true) => {
  if (rel == null || !Number.isFinite(rel)) return 'none';
  if (Math.abs(rel) < 0.005) return 'flat';
  return rel > 0 === !lowerIsBetter ? 'good' : 'bad';
};

const Delta = ({ rel, lowerIsBetter = true, suffix = 'so với 7 ngày trước' }) => {
  const j = judge(rel, lowerIsBetter);
  if (j === 'none') return <span className="text-xs text-ink-lo">Chưa đủ dữ liệu kỳ trước để so</span>;
  const Icon = j === 'flat' ? Minus : rel > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = { good: 'text-ok', bad: 'text-crit', flat: 'text-ink-mid' }[j];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-mono font-semibold ${tone}`}>
        <Icon size={14} aria-hidden="true" />
        <span className="sr-only">{j === 'flat' ? 'Không đổi' : rel > 0 ? 'Tăng' : 'Giảm'}</span>
        {fmtSignedPct(rel)}
      </span>
      <span className="text-ink-lo">{suffix}</span>
    </span>
  );
};

/** Đường xu hướng nhỏ, không trục — chỉ để thấy hình dáng 28 ngày */
const Spark = ({ series, label }) => {
  const pts = series.filter(Number.isFinite);
  if (pts.length < 2) return null;
  const W = 120;
  const H = 28;
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min || 1;
  const d = pts
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`)
    .join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-24 shrink-0" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MetricCard = ({ label, value, unavailable, delta, context, spark, mix, alarm, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-haspopup="dialog"
    className="group relative flex h-full flex-col rounded-[10px] border border-line bg-surface p-5 text-left transition-colors hover:border-ink-lo focus-visible:border-accent"
  >
    {alarm && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] rounded-t-[10px] bg-(--alarm)" style={{ '--alarm': alarm }} />}
    <span className="text-sm font-medium text-ink-mid">{label}</span>

    <span className="mt-3 flex items-end justify-between gap-3">
      {unavailable ? (
        <span className="text-lg font-medium text-ink-lo">{unavailable}</span>
      ) : (
        <span className="text-[2.15rem] leading-none font-semibold tracking-[-0.02em] text-ink-hi">{value}</span>
      )}
      {spark}
    </span>

    <span className="mt-2.5 min-h-[1.25rem]">{delta}</span>
    {context && <span className="mt-1 text-xs text-ink-lo">{context}</span>}

    <span className="mt-auto block pt-5">
      <EvidenceBar mix={mix} />
      <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-accent group-hover:underline">
        Vì sao tin được? <ChevronRight size={13} aria-hidden="true" />
      </span>
    </span>
  </button>
);

const KpiZone = ({ stats, trend = [] }) => {
  const [open, setOpen] = useState(null);
  const ev = stats?.evidence;
  const wcr = stats?.weightedComplaintRate;
  const cmp = stats?.comparison;
  const son = stats?.shareOfNegative;
  const vel = stats?.negativeVelocity;
  const health = stats?.dataHealthScore;

  const wcrRel = cmp?.deltas?.wcr?.rel;
  const sonRel = cmp?.deltas?.shareOfNegative?.rel;
  const v = vel?.velocity;
  const hasPrev = wcrRel != null && Number.isFinite(wcrRel);

  // Ngưỡng ±5% để dao động nhỏ không bị gọi là "tăng" hay "giảm"
  const velText = v == null ? null : v > 0.2 ? ['text-crit', 'Tăng nhanh'] : v > 0.05 ? ['text-high', 'Đang tăng'] : v < -0.05 ? ['text-ok', 'Đang giảm'] : ['text-ink-mid', 'Ổn định'];
  const healthText = health == null ? null : health >= 75 ? ['text-ok', 'Đáng tin cậy'] : health >= 50 ? ['text-high', 'Cần chú ý'] : ['text-crit', 'Kém'];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Tỉ lệ khiếu nại"
          value={wcr?.available && <AnimatedNumber value={wcr.value * 100} decimals={2} unit="%" />}
          unavailable={!wcr?.available && 'Chưa có dữ liệu đơn hàng'}
          delta={wcr?.available && <Delta rel={wcrRel} />}
          context={
            wcr?.available &&
            (hasPrev
              ? `7 ngày qua ${fmtPct(cmp?.current?.wcr, 2)}, 7 ngày trước ${fmtPct(cmp?.previous?.wcr, 2)}`
              : `Trên ${fmtInt(wcr.denominator)} giao dịch`)
          }
          spark={<Spark series={trend.map((t) => Number(t?.weightedComplaints ?? 0))} label="Khiếu nại theo trọng số, 28 ngày gần nhất" />}
          mix={ev?.reconcilableComplaints}
          alarm={judge(wcrRel) === 'bad' ? 'var(--sev-crit)' : null}
          onOpen={() => setOpen('wcr')}
        />
        <MetricCard
          label="Tỉ trọng phản hồi tiêu cực"
          value={son?.available && <AnimatedNumber value={son.value * 100} decimals={1} unit="%" />}
          unavailable={!son?.available && 'Chưa có dữ liệu'}
          delta={son?.available && <Delta rel={sonRel} />}
          context={son?.available && `Tính cả kênh không gắn đơn hàng`}
          mix={ev?.complaints}
          alarm={judge(sonRel) === 'bad' ? 'var(--sev-crit)' : null}
          onOpen={() => setOpen('negative')}
        />
        <MetricCard
          label="Tốc độ tăng phản hồi tiêu cực"
          value={v != null && <AnimatedNumber value={v * 100} signed unit="%" />}
          unavailable={v == null && 'Chưa đủ dữ liệu'}
          delta={velText && <span className={`text-xs font-semibold ${velText[0]}`}>{velText[1]}</span>}
          context="7 ngày gần nhất so với 21 ngày trước đó"
          mix={ev?.recentComplaints}
          alarm={v > 0.2 ? 'var(--sev-crit)' : v > 0.05 ? 'var(--sev-high)' : null}
          onOpen={() => setOpen('velocity')}
        />
        <MetricCard
          label="Sức khỏe dữ liệu"
          value={health != null && <AnimatedNumber value={health} unit="/100" />}
          unavailable={health == null && 'Chưa có dữ liệu'}
          delta={healthText && <span className={`text-xs font-semibold ${healthText[0]}`}>{healthText[1]}</span>}
          context={`${fmtInt(stats?.totalFeedbacks?.valid)} phản hồi hợp lệ trên ${fmtInt(stats?.totalFeedbacks?.value)} thu thập được`}
          mix={ev?.all}
          alarm={health != null && health < 50 ? 'var(--sev-crit)' : health != null && health < 75 ? 'var(--sev-high)' : null}
          onOpen={() => setOpen('health')}
        />
      </div>
      <EvidenceDrawer metric={open} stats={stats} onClose={() => setOpen(null)} />
    </>
  );
};

export default KpiZone;
