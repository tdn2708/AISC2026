import React from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, ShieldCheck, Gauge, CheckCircle2 } from 'lucide-react';
import { GlassPanel, SeverityBadge, MethodHint } from './Glass';
import { fmtInt, fmtPct, fmtSignedPct, SEVERITY, SEVERITY_ORDER } from './format';

/**
 * VÙNG CHỈ SỐ
 * ------------------------------------------------------------------
 * Hai thẻ chủ đạo ngang hàng nhau vì chúng trả lời hai câu hỏi khác
 * nhau: "tình hình xấu tới đâu" (tỉ lệ khiếu nại) và "có gì đang cháy
 * không" (mức độ nghiêm trọng). Ba chỉ số phụ rút thành dải gọn bên
 * phải — đọc lướt được, không tranh ánh nhìn.
 */

const Label = ({ children, method }) => (
  <div className="flex items-center justify-between gap-3">
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-lo">{children}</p>
    {method && <MethodHint text={method} />}
  </div>
);

/** Với khiếu nại, GIẢM là tốt — màu phải đảo so với trực giác của mũi tên. */
const Delta = ({ rel, lowerIsBetter, suffix }) => {
  if (rel == null || !Number.isFinite(rel)) {
    return <span className="text-xs text-ink-lo">Chưa đủ dữ liệu kỳ trước</span>;
  }
  const flat = Math.abs(rel) < 0.005;
  const up = rel > 0;
  const good = lowerIsBetter ? !up : up;
  const tone = flat ? 'text-ink-mid' : good ? 'text-ok' : 'text-crit';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      {!flat && <Icon size={14} aria-hidden="true" />}
      <span className="sr-only">{flat ? 'Không đổi' : up ? 'Tăng' : 'Giảm'}</span>
      <span className="tabular-nums">{fmtSignedPct(rel)}</span>
      <span className="font-normal text-ink-lo">{suffix}</span>
    </span>
  );
};

/** Đường xu hướng không trục: chỉ trả lời "đang lên hay đang xuống". */
const Sparkline = ({ series, tone, label }) => {
  const pts = series.filter(Number.isFinite);
  if (pts.length < 2) return <div className="h-10" />;

  const W = 240;
  const H = 40;
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min || 1;
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 8)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-10 w-full" role="img" aria-label={label}>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={tone} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const ComplaintRateCard = ({ stats, trend }) => {
  const wcr = stats?.weightedComplaintRate;
  const delta = stats?.comparison?.deltas?.wcr;
  const available = Boolean(wcr?.available);
  const worsening = delta?.rel != null && delta.rel > 0.005;
  const series = trend.map((t) => Number(t?.weightedComplaints ?? 0));

  return (
    <GlassPanel className="flex h-full flex-col gap-3 p-5">
      <Label
        method={
          available
            ? `Tổng trọng số tin cậy của khiếu nại chia cho ${fmtInt(wcr.denominator)} giao dịch đối soát được. Chỉ tính trên kênh gắn được mã đơn hàng.`
            : 'Chưa kết nối dữ liệu giao dịch nên không tồn tại mẫu số. Hệ thống báo không khả dụng thay vì trả về một con số không có cơ sở.'
        }
      >
        Tỷ lệ khiếu nại có trọng số
      </Label>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span
          className={`font-semibold leading-none tracking-tight proportional-nums ${
            available ? 'text-5xl text-ink-hi' : 'text-xl text-ink-lo'
          }`}
        >
          {available ? wcr.display : 'Không khả dụng'}
        </span>
        {available && <Delta rel={delta?.rel} lowerIsBetter suffix="so với 7 ngày trước" />}
      </div>

      <Sparkline
        series={series}
        tone={worsening ? 'var(--sev-crit)' : 'var(--text-lo)'}
        label="Khiếu nại có trọng số, 14 kỳ trong 28 ngày gần nhất"
      />

      <p className="mt-auto text-xs leading-relaxed text-ink-lo">
        {available ? (
          <>
            Trên <span className="tabular-nums text-ink-mid">{fmtInt(wcr.denominator)}</span> giao dịch · độ phủ đối soát{' '}
            <span className="tabular-nums text-ink-mid">{fmtPct(wcr.coverage, 0)}</span>
          </>
        ) : (
          'Kết nối dữ liệu giao dịch ở màn hình Nguồn dữ liệu để tính chỉ số này'
        )}
      </p>
    </GlassPanel>
  );
};

const SeverityCard = ({ alerts }) => {
  const counts = SEVERITY_ORDER.map((key) => ({
    key,
    ...SEVERITY[key],
    n: alerts.filter((a) => a.severity === key).length
  }));
  const total = alerts.length;
  const top = counts.find((c) => c.n > 0);
  const maxScore = total ? Math.max(...alerts.map((a) => a.severityScore ?? 0)) : null;
  const glow = top?.key === 'Critical' ? 'crit' : top?.key === 'High' ? 'high' : null;

  return (
    <GlassPanel glow={glow} className="flex h-full flex-col gap-3 p-5">
      <Label method="Điểm nghiêm trọng tổng hợp mức tăng, số khách bị ảnh hưởng và hạng tin cậy của nguồn. Chỉ tính cảnh báo đã qua kiểm định thống kê và hiệu chỉnh đa kiểm định (FDR 5%).">
        Mức độ nghiêm trọng
      </Label>

      {top ? (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <span className="text-5xl font-semibold leading-none tracking-tight text-ink-hi proportional-nums">{top.n}</span>
          <span className="flex flex-col items-start gap-1 pb-0.5">
            <SeverityBadge level={top.key} />
            <span className="text-xs text-ink-lo">
              trên <span className="tabular-nums">{total}</span> cảnh báo đang mở
            </span>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <CheckCircle2 size={22} className="text-ok" aria-hidden="true" />
          <span className="text-2xl font-semibold text-ink-hi">Ổn định</span>
        </div>
      )}

      {/* Phân bố theo mức: một thanh xếp chồng, khe 2px giữa các đoạn. */}
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-raised/60"
        role="img"
        aria-label={counts.map((c) => `${c.label}: ${c.n}`).join(', ')}
      >
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <span
              key={c.key}
              title={`${c.label}: ${c.n}`}
              className="h-full bg-(--sev)"
              style={{ '--sev': c.color, flexGrow: c.n }}
            />
          ))}
      </div>

      <ul className="grid list-none grid-cols-2 gap-x-5 gap-y-1 text-xs">
        {counts.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-ink-mid">
              <span className="size-2 rounded-full bg-(--sev)" style={{ '--sev': c.color }} aria-hidden="true" />
              {c.label}
            </span>
            <span className={`tabular-nums ${c.n ? 'text-ink-hi' : 'text-ink-lo'}`}>{c.n}</span>
          </li>
        ))}
      </ul>

      <p className="mt-auto text-xs text-ink-lo">
        {maxScore != null ? (
          <>
            Điểm cao nhất <span className="tabular-nums text-ink-mid">{maxScore.toFixed(2).replace('.', ',')}</span> / 1
          </>
        ) : (
          'Không có biến động đạt ngưỡng ý nghĩa thống kê'
        )}
      </p>
    </GlassPanel>
  );
};

const CompactMetric = ({ icon: Icon, title, value, method, children }) => (
  <GlassPanel className="flex items-center gap-3 px-4 py-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised/70 text-ink-lo">
      <Icon size={16} aria-hidden="true" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-lo" title={method}>
        {title}
      </p>
      <div className="mt-0.5 truncate text-xs" title={method}>{children}</div>
    </div>
    <span className="shrink-0 text-xl font-semibold text-ink-hi proportional-nums">{value}</span>
  </GlassPanel>
);

const KpiZone = ({ stats, trend = [], alerts = [] }) => {
  const son = stats?.shareOfNegative;
  const vel = stats?.negativeVelocity;
  const health = stats?.dataHealthScore;
  const total = stats?.totalFeedbacks;

  const velTone = vel?.velocity == null ? 'text-ink-lo' : vel.velocity > 0.2 ? 'text-crit' : vel.velocity > 0 ? 'text-high' : 'text-ok';
  const [healthTone, healthLabel] =
    health == null ? ['text-ink-lo', 'Chưa có dữ liệu'] : health >= 75 ? ['text-ok', 'Tốt'] : health >= 50 ? ['text-high', 'Cần chú ý'] : ['text-crit', 'Kém'];

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-6 xl:col-span-4">
        <ComplaintRateCard stats={stats} trend={trend} />
      </div>
      <div className="col-span-12 md:col-span-6 xl:col-span-4">
        <SeverityCard alerts={alerts} />
      </div>
      <div className="col-span-12 grid grid-cols-12 gap-3 xl:col-span-4">
        <div className="col-span-12 sm:col-span-4 xl:col-span-12">
          <CompactMetric
            icon={Activity}
            title="Tỉ trọng tiêu cực"
            value={son?.available ? son.display : '—'}
            method="Tổng trọng số phản hồi tiêu cực chia cho tổng trọng số phản hồi hợp lệ. Dùng được cho cả kênh không đối soát giao dịch."
          >
            <Delta rel={stats?.comparison?.deltas?.shareOfNegative?.rel} lowerIsBetter suffix="7 ngày" />
          </CompactMetric>
        </div>
        <div className="col-span-12 sm:col-span-4 xl:col-span-12">
          <CompactMetric
            icon={Gauge}
            title="Tốc độ tăng tiêu cực"
            value={vel?.display ?? '—'}
            method="Số phản hồi tiêu cực mỗi ngày trong 7 ngày gần nhất so với nền 28 ngày trước đó."
          >
            <span className={velTone}>{vel?.velocity > 0.2 ? 'Tăng nhanh' : vel?.velocity > 0 ? 'Đang tăng' : 'Ổn định'}</span>
            <span className="text-ink-lo"> · 7 ngày so với nền 28 ngày</span>
          </CompactMetric>
        </div>
        <div className="col-span-12 sm:col-span-4 xl:col-span-12">
          <CompactMetric
            icon={ShieldCheck}
            title="Sức khỏe dữ liệu"
            value={health != null ? `${health}/100` : '—'}
            method="Điểm tổng hợp: tỉ lệ phản hồi qua Trust Layer, độ phủ kênh, độ tươi của dữ liệu và tỉ lệ đối soát được với giao dịch."
          >
            <span className={healthTone}>{healthLabel}</span>
            <span className="text-ink-lo">
              {' '}· <span className="tabular-nums">{fmtInt(total?.valid)}</span> phản hồi hợp lệ
            </span>
          </CompactMetric>
        </div>
      </div>
    </div>
  );
};

export default KpiZone;
