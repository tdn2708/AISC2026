import React from 'react';
import { RotateCw } from 'lucide-react';
import { GlassPanel, PanelHeader, EmptyState, Button } from '../ui';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';
import { fmtInt, fmtPct, SENTIMENT } from '../../lib/format';

/**
 * PHÂN BỔ CẢM XÚC — một thanh ngang chia ba phần.
 * Mắt so độ dài chính xác hơn so góc, nên phần của tổng thể vẽ thành thanh
 * chứ không phải vòng tròn. Con số cần quyết định (phần trăm tiêu cực) đặt
 * to ở trên; bảng bên dưới ghi đủ số lượng, không giá trị nào phải rê chuột.
 */

const SentimentDonut = ({ data = [], loading, failed, onRetry }) => {
  const rows = SENTIMENT.map((s) => ({ ...s, value: data.find((d) => d.key === s.key)?.value ?? 0 }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const negShare = total ? rows[0].value / total : null;

  return (
    <GlassPanel className="flex h-full flex-col p-6">
      <PanelHeader title="Phân bổ cảm xúc" subtitle={loading && total === 0 ? 'Đang đếm phản hồi hợp lệ' : failed && total === 0 ? '— phản hồi hợp lệ' : `${fmtInt(total)} phản hồi hợp lệ`} />

      {total === 0 && loading ? (
        <SkeletonBlock label="Đang tải phân bổ cảm xúc" className="flex flex-col">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-4 h-3 w-full" />
          <span className="mt-5 flex flex-col" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-12" />
              </span>
            ))}
          </span>
        </SkeletonBlock>
      ) : total === 0 && failed ? (
        <EmptyState variant="error" compact className="flex-1" title="Không tải được phân bổ" description="Máy chủ phân tích chưa trả lời." action={onRetry && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>Thử lại</Button>} />
      ) : total === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-center text-sm text-ink-lo">
          Chưa có phản hồi nào đạt ngưỡng tin cậy trong kỳ này
        </div>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="tabular-nums text-metric font-semibold tracking-[-0.02em] text-ink-hi">{fmtPct(negShare, 0)}</span>
            <span className="text-base text-ink-mid">tiêu cực</span>
          </p>
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-ctrl" role="img" aria-label={rows.map((r) => `${r.label} ${fmtPct(r.value / total)}`).join(', ')}>
            {rows.filter((r) => r.value > 0).map((r) => (
              <span key={r.key} className="h-full bg-(--c)" style={{ '--c': r.color, flexGrow: r.value, flexBasis: 0 }} title={`${r.label}: ${fmtPct(r.value / total)}`} />
            ))}
          </div>

          <ul className="mt-5 flex list-none flex-col text-sm">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[auto_1fr_auto_4rem] items-center gap-2 border-b border-line-soft py-2 last:border-b-0">
                <span className="size-2.5 rounded-ctrl bg-(--c)" style={{ '--c': r.color }} aria-hidden="true" />
                <span className="text-ink-mid">{r.label}</span>
                <span className="tabular-nums text-ink-lo">{fmtInt(r.value)}</span>
                <span className="text-right font-medium tabular-nums text-ink-hi">{fmtPct(r.value / total)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-auto border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-mid">
            Cứ 10 phản hồi thì có <span className="font-semibold text-ink-hi">{Math.round((negShare ?? 0) * 10)}</span> phản hồi tiêu cực.
          </p>
        </>
      )}
    </GlassPanel>
  );
};

export default SentimentDonut;
