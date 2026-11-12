import React from 'react';
import { TrendingUp, RotateCw } from 'lucide-react';
import { GlassPanel, PanelHeader, SeverityBadge, EmptyState, Button } from '../ui';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';
import { alertTitle, fmtPct, fmtSignedPct, growthOf } from '../../lib/format';

/**
 * HORIZONTAL BAR — Top vấn đề tăng nhanh.
 * Thanh ngang xếp hạng: mắt so độ dài tốt hơn so góc, và tên vấn đề
 * tiếng Việt thường dài nên cần chỗ nằm ngang. Mọi thanh CÙNG một màu
 * (màu của khiếu nại) — thứ hạng đã do độ dài truyền tải; mức độ nghiêm
 * trọng đi riêng bằng nhãn có biểu tượng.
 */

const MAX_ROWS = 5;

const RisingIssues = ({ alerts = [], loading, failed, onRetry }) => {
  const spikes = alerts
    .map((a) => ({ alert: a, growth: growthOf(a) }))
    .filter((r) => r.growth != null && r.growth > 0)
    .sort((x, y) => y.growth - x.growth);

  const rows = spikes.slice(0, MAX_ROWS);
  const finiteMax = Math.max(...rows.map((r) => r.growth).filter(Number.isFinite), 0);
  const driftCount = alerts.filter((a) => a.type === 'SUSTAINED_DRIFT').length;

  return (
    <GlassPanel className="flex h-full flex-col p-6">
      <PanelHeader
        title="Vấn đề đang tăng nhanh"
        subtitle="Mức tăng tỉ lệ khiếu nại so với 28 ngày trước đó"
        right={
          spikes.length > MAX_ROWS && (
            <span className="text-xs text-ink-lo">
              {MAX_ROWS}/{spikes.length}
            </span>
          )
        }
      />

      {rows.length === 0 && loading ? (
        <SkeletonBlock as="ol" label="Đang tải vấn đề đang tăng" className="flex list-none flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex flex-col gap-2">
              <span className="flex justify-between gap-3"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3.5 w-12" /></span>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </li>
          ))}
        </SkeletonBlock>
      ) : rows.length === 0 && failed ? (
        <EmptyState variant="error" compact className="flex-1" title="Không tải được vấn đề đang tăng" description="Máy chủ phân tích chưa trả lời." action={onRetry && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>Thử lại</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          variant="calm"
          className="flex-1"
          title="Không có vấn đề nào đang tăng"
          description="Chưa có biến động nào đủ lớn để chắc chắn không phải ngẫu nhiên."
        />
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
                title={`${title}: ${isNew ? 'mới xuất hiện' : fmtSignedPct(growth)}, từ ${fmtPct(st.baselineRate)} lên ${fmtPct(st.currentRate)}`}
                className="group rounded-ctrl outline-offset-4"
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

                {/* Rê chuột hoặc focus: rãnh đổi sang nền đỏ nhạt (màu token, chỉ đổi màu, --motion-micro) */}
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-ctrl bg-raised transition-colors duration-micro ease-out group-hover:bg-crit/12 group-focus-visible:bg-crit/12">
                  <div className="h-full w-full origin-left rounded-ctrl bg-neg" style={{ transform: `scaleX(${width / 100})` }} />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo">
                  <SeverityBadge level={alert.severity} />
                  <span className="tabular-nums">
                    từ {fmtPct(st.baselineRate, st.baselineRate > 0 && st.baselineRate < 0.01 ? 2 : 1)} lên <span className="text-ink-mid">{fmtPct(st.currentRate, st.currentRate < 0.01 ? 2 : 1)}</span>
                  </span>
                  {alert.productName && <span className="truncate">{alert.productName}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {driftCount > 0 && (
        <p className="mt-auto border-t border-line-soft pt-3 text-xs text-ink-lo">
          Thêm <span className="tabular-nums text-ink-mid">{driftCount}</span> vấn đề đang tăng chậm nhưng đều, xem ở trang Cảnh báo.
        </p>
      )}
    </GlassPanel>
  );
};

export default RisingIssues;
