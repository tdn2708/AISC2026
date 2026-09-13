import React from 'react';
import { TrendingUp } from 'lucide-react';
import { GlassPanel, PanelHeader, SeverityBadge } from './Glass';
import { alertTitle, fmtInt, fmtPct, fmtSignedPct, growthOf } from './format';

/**
 * HORIZONTAL BAR — Top vấn đề tăng nhanh.
 * Thanh ngang xếp hạng: mắt so độ dài tốt hơn so góc, và tên vấn đề
 * tiếng Việt thường dài nên cần chỗ nằm ngang. Mọi thanh CÙNG một màu
 * (màu của khiếu nại) — thứ hạng đã do độ dài truyền tải; mức độ nghiêm
 * trọng đi riêng bằng nhãn có biểu tượng.
 */

const MAX_ROWS = 5;

const RisingIssues = ({ alerts = [] }) => {
  const spikes = alerts
    .map((a) => ({ alert: a, growth: growthOf(a) }))
    .filter((r) => r.growth != null && r.growth > 0)
    .sort((x, y) => y.growth - x.growth);

  const rows = spikes.slice(0, MAX_ROWS);
  const finiteMax = Math.max(...rows.map((r) => r.growth).filter(Number.isFinite), 0);
  const driftCount = alerts.filter((a) => a.type === 'SUSTAINED_DRIFT').length;

  return (
    <GlassPanel className="flex h-full flex-col p-5">
      <PanelHeader
        title="Top vấn đề đang tăng nhanh"
        subtitle="Mức tăng tỉ trọng khiếu nại so với nền 28 ngày · chỉ gồm biến động đã qua kiểm định"
        right={
          spikes.length > MAX_ROWS && (
            <span className="text-xs text-ink-lo">
              {MAX_ROWS}/{spikes.length}
            </span>
          )
        }
      />

      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-center text-sm text-ink-lo">
          Không có vấn đề nào tăng có ý nghĩa thống kê trong kỳ này
        </div>
      ) : (
        <ol className="flex list-none flex-col gap-4">
          {rows.map(({ alert, growth }, i) => {
            const st = alert.statistics || {};
            const isNew = !Number.isFinite(growth);
            const width = isNew || !finiteMax ? 100 : Math.max(4, (growth / finiteMax) * 100);
            const title = alertTitle(alert);

            return (
              <li
                key={alert.id}
                tabIndex={0}
                title={`${title}: ${isNew ? 'mới xuất hiện' : fmtSignedPct(growth)} (${fmtPct(st.baselineRate)} → ${fmtPct(st.currentRate)})`}
                className="group rounded-lg outline-offset-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm text-ink-hi">
                    <span className="mr-2 tabular-nums text-ink-lo">{i + 1}</span>
                    {title}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-ink-hi">
                    <TrendingUp size={14} className="text-ink-lo" aria-hidden="true" />
                    {isNew ? 'Mới' : fmtSignedPct(growth)}
                  </span>
                </div>

                <div className="mt-1.5 h-2 w-full rounded-full bg-raised/50">
                  <div
                    className="h-full rounded-full bg-neg transition-[width,filter] duration-500 group-hover:brightness-125 group-focus-visible:brightness-125"
                    style={{ width: `${width}%` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-ink-lo">
                  <SeverityBadge level={alert.severity} />
                  <span className="tabular-nums">
                    {fmtPct(st.baselineRate)} → <span className="text-ink-mid">{fmtPct(st.currentRate)}</span>
                  </span>
                  <span className="tabular-nums">n = {fmtInt(st.sampleCurrent)}</span>
                  {alert.productName && <span className="truncate">{alert.productName}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {driftCount > 0 && (
        <p className="mt-auto border-t border-line/40 pt-3 text-xs text-ink-lo">
          Thêm <span className="tabular-nums text-ink-mid">{driftCount}</span> vấn đề suy giảm kéo dài — theo dõi bằng biểu đồ kiểm soát, không quy ra được phần trăm tăng.
        </p>
      )}
    </GlassPanel>
  );
};

export default RisingIssues;
