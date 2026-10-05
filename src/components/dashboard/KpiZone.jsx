import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Activity, ShieldCheck, Gauge, CheckCircle2, Info } from 'lucide-react';
import { GlassPanel, SeverityBadge, MethodHint, AnimatedNumber } from '../ui';
import { fmtInt, fmtPct, fmtSignedPct, SEVERITY, SEVERITY_ORDER } from '../../lib/format';
import { useTheme } from '../../hooks/useTheme';

/**
 * VÙNG CHỈ SỐ — bố cục bento
 * ------------------------------------------------------------------
 *   [ TỶ LỆ KHIẾU NẠI (thẻ tối) 5 ][ MỨC ĐỘ NGHIÊM TRỌNG 4 ][ chỉ số phụ 3 ]
 *   [                             ][                       ][ chỉ số phụ 3 ]
 *   [                             ][                       ][ chỉ số phụ 3 ]
 *
 * Thứ bậc đến từ TƯƠNG PHẢN, không từ cỡ chữ: một thẻ tối duy nhất là chỉ
 * số chủ đạo. Màu trạng thái chỉ xuất hiện trên thẻ nào đang xấu đi — thẻ
 * bình thường giữ trung tính, nên mắt bị kéo đúng vào chỗ cần xử lý.
 */

const LABEL = 'font-mono text-[0.72rem] font-medium uppercase tracking-[0.04em]';

/** Đánh giá chiều thay đổi. Với khiếu nại, GIẢM mới là tốt. */
const judge = (rel, lowerIsBetter = true) => {
  if (rel == null || !Number.isFinite(rel)) return 'none';
  if (Math.abs(rel) < 0.005) return 'flat';
  return rel > 0 === !lowerIsBetter ? 'good' : 'bad';
};

/** Viên so sánh kỳ trước — đặt ngay cạnh con số, không chìm dưới đáy thẻ */
const DeltaPill = ({ rel, lowerIsBetter = true, suffix, onDark = false }) => {
  const j = judge(rel, lowerIsBetter);
  if (j === 'none') {
    return <span className={`text-xs ${onDark ? 'text-white/72' : 'text-ink-lo'}`}>Chưa đủ dữ liệu kỳ trước</span>;
  }
  const Icon = j === 'flat' ? Minus : rel > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = onDark
    ? { good: 'bg-[#7FD1A3]/15 text-[#9BE3BE]', bad: 'bg-[#FF8A9B]/15 text-[#FFB3BF]', flat: 'bg-white/10 text-white/78' }[j]
    // Nền trắng + viền màu: đọc rõ trên mọi nền thẻ (kể cả nền xanh sương), luôn ≥ 4.5:1
    : { good: 'bg-surface text-ok ring-1 ring-ok/30', bad: 'bg-surface text-crit ring-1 ring-crit/30', flat: 'bg-surface text-ink-mid ring-1 ring-line' }[j];
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono font-medium ${tone}`}>
        <Icon size={13} aria-hidden="true" />
        <span className="sr-only">{j === 'flat' ? 'Không đổi' : rel > 0 ? 'Tăng' : 'Giảm'}</span>
        {fmtSignedPct(rel)}
      </span>
      {suffix && <span className={onDark ? 'text-white/72' : 'text-ink-lo'}>{suffix}</span>}
    </span>
  );
};

/** Vạch + nền ngả màu cho thẻ đang có vấn đề. tone = null → thẻ trung tính. */
const ToneFrame = ({ tone }) =>
  tone ? (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-(--tone)/[0.06]" style={{ '--tone': tone }} />
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-(--tone)" style={{ '--tone': tone }} />
    </>
  ) : null;

/** Đường xu hướng lớn trên thẻ tối */
const AreaTrend = ({ series, label }) => {
  const pts = series.filter(Number.isFinite);
  if (pts.length < 2) return <div className="h-20" />;
  const W = 300;
  const H = 80;
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 12)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const [lx, ly] = xy[xy.length - 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-20 w-full" role="img" aria-label={label}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--hero-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line}L${W},${H}L0,${H}Z`} fill="var(--hero-fill)" />
        <path d={line} fill="none" stroke="var(--hero-stroke)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Điểm cuối vẽ bằng HTML để không bị kéo méo theo tỉ lệ SVG */}
      <span
        aria-hidden="true"
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--hero-stroke) ring-4 ring-(--hero-ring)"
        style={{ left: `${(lx / W) * 100}%`, top: `${(ly / H) * 100}%` }}
      />
    </div>
  );
};

const ComplaintRateHero = ({ stats, trend }) => {
  const wcr = stats?.weightedComplaintRate;
  const cmp = stats?.comparison;
  const available = Boolean(wcr?.available);
  const series = trend.map((t) => Number(t?.weightedComplaints ?? 0));
  // Thẻ chỉ tối ở theme tối — viên so sánh phải đổi bảng màu theo
  const onDark = useTheme().theme === 'dark';
  const method = available
    ? `Tổng trọng số tin cậy của khiếu nại chia cho ${fmtInt(wcr.denominator)} giao dịch đối soát được. Chỉ tính trên kênh gắn được mã đơn hàng.`
    : 'Chưa kết nối dữ liệu giao dịch nên không tồn tại mẫu số. Hệ thống báo không khả dụng thay vì trả về một con số không có cơ sở.';

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-(--hero-line) bg-hero p-6 text-(--hero-fg) shadow-(--hero-shadow)">
      {/* Lưới mảnh trên nền tối — chất bảng đo, không phải trang trí phát sáng */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--hero-grid) 1px, transparent 1px), linear-gradient(90deg, var(--hero-grid) 1px, transparent 1px)',
          backgroundSize: '28px 28px'
        }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <p className={`${LABEL} text-(--hero-mid)`}>Tỷ lệ khiếu nại có trọng số</p>
        <span title={method} aria-label={method} role="img" tabIndex={0} className="grid size-5 cursor-help place-items-center rounded border border-(--hero-line) text-(--hero-lo)">
          <Info size={11} aria-hidden="true" />
        </span>
      </div>

      <div className="relative mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
        {available ? (
          <AnimatedNumber value={wcr.value * 100} decimals={2} unit="%" className="text-[3.25rem] leading-none font-semibold tracking-[-0.03em]" />
        ) : (
          <span className="text-xl font-medium text-(--hero-lo)">Không khả dụng</span>
        )}
        {available && <DeltaPill rel={cmp?.deltas?.wcr?.rel} suffix="so với 7 ngày trước" onDark={onDark} />}
      </div>

      {/* Chỉ so khi kỳ trước có dữ liệu thật — 0% và 0% nghĩa là KHÔNG CÓ dữ liệu, không phải tỷ lệ bằng 0 */}
      {available && cmp?.deltas?.wcr?.rel != null && Number.isFinite(cmp.deltas.wcr.rel) && (
        <p className="relative mt-3 font-mono text-xs text-(--hero-lo)">
          7 ngày qua <span className="text-(--hero-fg)">{fmtPct(cmp?.current?.wcr, 2)}</span>
          <span className="mx-2 text-(--hero-lo) opacity-50">/</span>
          7 ngày trước <span className="text-(--hero-fg)">{fmtPct(cmp?.previous?.wcr, 2)}</span>
        </p>
      )}

      <div className="relative mt-auto pt-5">
        <AreaTrend series={series} label="Khiếu nại có trọng số, 14 kỳ trong 28 ngày gần nhất" />
        <div className="mt-2 flex justify-between font-mono text-[0.66rem] text-(--hero-lo)">
          <span>{trend[0]?.name}</span>
          <span>28 ngày gần nhất</span>
          <span>{trend[trend.length - 1]?.name}</span>
        </div>
        <p className="mt-3 border-t border-(--hero-line) pt-3 text-xs text-(--hero-mid)">
          {available ? (
            <>
              Trên <span className="font-mono text-(--hero-fg)">{fmtInt(wcr.denominator)}</span> giao dịch · độ phủ đối soát{' '}
              <span className="font-mono text-(--hero-fg)">{fmtPct(wcr.coverage, 0)}</span>
            </>
          ) : (
            'Kết nối dữ liệu giao dịch ở màn hình Nguồn dữ liệu để tính chỉ số này'
          )}
        </p>
      </div>
    </div>
  );
};

const SeverityCard = ({ alerts }) => {
  const counts = SEVERITY_ORDER.map((key) => ({ key, ...SEVERITY[key], n: alerts.filter((a) => a.severity === key).length }));
  const total = alerts.length;
  const top = counts.find((c) => c.n > 0);
  const maxScore = total ? Math.max(...alerts.map((a) => a.severityScore ?? 0)) : null;
  // Thẻ chỉ mang màu khi có cảnh báo từ mức Trung bình trở lên
  const tone = top && top.key !== 'Low' ? top.color : null;

  return (
    <GlassPanel tone="strong" className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <ToneFrame tone={tone} />
      <div className="relative flex items-center justify-between gap-3">
        <p className={`${LABEL} text-ink-mid`}>Mức độ nghiêm trọng</p>
        <MethodHint text="Điểm nghiêm trọng tổng hợp mức tăng, số khách bị ảnh hưởng và hạng tin cậy của nguồn. Chỉ tính cảnh báo đã qua kiểm định thống kê và hiệu chỉnh đa kiểm định (FDR 5%)." />
      </div>

      {top ? (
        <div className="relative flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <AnimatedNumber value={top.n} className="text-[2.75rem] leading-none font-semibold tracking-tight text-ink-hi" />
          <span className="flex flex-col items-start gap-1 pb-0.5">
            <SeverityBadge level={top.key} />
            <span className="text-xs text-ink-mid">trên <span className="font-mono">{total}</span> cảnh báo đang mở</span>
          </span>
        </div>
      ) : (
        <div className="relative flex items-center gap-2">
          <CheckCircle2 size={22} className="text-ok" aria-hidden="true" />
          <span className="text-2xl font-semibold text-ink-hi">Ổn định</span>
        </div>
      )}

      <div
        className="relative flex h-2.5 w-full origin-left gap-0.5 overflow-hidden rounded-full bg-raised animate-grow-x"
        role="img"
        aria-label={counts.map((c) => `${c.label}: ${c.n}`).join(', ')}
      >
        {counts.filter((c) => c.n > 0).map((c) => (
          <span key={c.key} title={`${c.label}: ${c.n}`} className="h-full bg-(--sev)" style={{ '--sev': c.color, flexGrow: c.n }} />
        ))}
      </div>

      <ul className="relative grid list-none grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {counts.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-ink-mid">
              <span className="size-2 rounded-[2px] bg-(--sev)" style={{ '--sev': c.color }} aria-hidden="true" />
              {c.label}
            </span>
            <span className={`font-mono ${c.n ? 'font-semibold text-ink-hi' : 'text-ink-lo'}`}>{c.n}</span>
          </li>
        ))}
      </ul>

      <p className="relative mt-auto border-t border-line-soft pt-3 text-xs text-ink-mid">
        {maxScore != null ? (
          <>Điểm nghiêm trọng cao nhất <span className="font-mono font-semibold text-ink-hi">{maxScore.toFixed(2).replace('.', ',')}</span> / 1</>
        ) : (
          'Không có biến động đạt ngưỡng ý nghĩa thống kê'
        )}
      </p>
    </GlassPanel>
  );
};

const CompactMetric = ({ icon: Icon, title, method, tone, children, number }) => (
  <GlassPanel tone="strong" className="flex h-full items-center gap-4 overflow-hidden px-5 py-4">
    <ToneFrame tone={tone} />
    <span className={`relative grid size-9 shrink-0 place-items-center rounded-lg ${tone ? 'bg-(--tone)/12 text-(--tone)' : 'bg-accent-dim text-accent'}`} style={tone ? { '--tone': tone } : undefined}>
      <Icon size={16} aria-hidden="true" />
    </span>
    <div className="relative min-w-0 flex-1">
      <p className={`truncate ${LABEL} text-ink-mid`} title={method}>{title}</p>
      <div className="mt-1 truncate text-xs" title={method}>{children}</div>
    </div>
    <span className="relative shrink-0 text-[1.5rem] leading-none font-semibold tracking-tight text-ink-hi">{number}</span>
  </GlassPanel>
);

const KpiZone = ({ stats, trend = [], alerts = [] }) => {
  const son = stats?.shareOfNegative;
  const vel = stats?.negativeVelocity;
  const health = stats?.dataHealthScore;
  const total = stats?.totalFeedbacks;
  const sonRel = stats?.comparison?.deltas?.shareOfNegative?.rel;

  // Ngưỡng ±5% để dao động nhỏ không bị gọi là "tăng" hay "giảm"
  const v = vel?.velocity;
  const [velTone, velLabel, velFrame] =
    v == null ? ['text-ink-lo', 'Chưa đủ dữ liệu', null]
      : v > 0.2 ? ['text-crit', 'Tăng nhanh', 'var(--sev-crit)']
        : v > 0.05 ? ['text-high', 'Đang tăng', 'var(--sev-high)']
          : v < -0.05 ? ['text-ok', 'Đang giảm', null]
            : ['text-ink-mid', 'Ổn định', null];
  const [healthTone, healthLabel, healthFrame] =
    health == null ? ['text-ink-lo', 'Chưa có dữ liệu', null]
      : health >= 75 ? ['text-ok', 'Tốt', null]
        : health >= 50 ? ['text-high', 'Cần chú ý', 'var(--sev-high)']
          : ['text-crit', 'Kém', 'var(--sev-crit)'];
  const sonFrame = judge(sonRel) === 'bad' ? 'var(--sev-crit)' : null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-7 xl:col-span-5 xl:row-span-3">
        <ComplaintRateHero stats={stats} trend={trend} />
      </div>
      <div className="col-span-12 md:col-span-5 xl:col-span-4 xl:row-span-3">
        <SeverityCard alerts={alerts} />
      </div>
      <div className="col-span-12 sm:col-span-4 xl:col-span-3">
        <CompactMetric
          icon={Activity}
          title="Tỉ trọng tiêu cực"
          tone={sonFrame}
          method="Tổng trọng số phản hồi tiêu cực chia cho tổng trọng số phản hồi hợp lệ. Dùng được cho cả kênh không đối soát giao dịch."
          number={son?.available ? <AnimatedNumber value={son.value * 100} decimals={1} unit="%" /> : '—'}
        >
          <DeltaPill rel={sonRel} suffix="7 ngày" />
        </CompactMetric>
      </div>
      <div className="col-span-12 sm:col-span-4 xl:col-span-3">
        <CompactMetric
          icon={Gauge}
          title="Tốc độ tăng tiêu cực"
          tone={velFrame}
          method="Số phản hồi tiêu cực mỗi ngày trong 7 ngày gần nhất so với nền 28 ngày trước đó."
          number={v != null ? <AnimatedNumber value={v * 100} signed unit="%" /> : '—'}
        >
          <span className={`font-medium ${velTone}`}>{velLabel}</span>
          <span className="text-ink-lo"> · 7 ngày so với nền 28 ngày</span>
        </CompactMetric>
      </div>
      <div className="col-span-12 sm:col-span-4 xl:col-span-3">
        <CompactMetric
          icon={ShieldCheck}
          title="Sức khỏe dữ liệu"
          tone={healthFrame}
          method="Điểm tổng hợp: tỉ lệ phản hồi qua Trust Layer, độ phủ kênh, độ tươi của dữ liệu và tỉ lệ đối soát được với giao dịch."
          number={health != null ? <AnimatedNumber value={health} unit="/100" /> : '—'}
        >
          <span className={`font-medium ${healthTone}`}>{healthLabel}</span>
          <span className="text-ink-lo"> · <span className="font-mono">{fmtInt(total?.valid)}</span> phản hồi hợp lệ</span>
        </CompactMetric>
      </div>
    </div>
  );
};

export default KpiZone;
