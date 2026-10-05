import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Lightbulb, ShieldCheck, Check, ArrowUpRight, CircleSlash } from 'lucide-react';
import { GlassPanel, SeverityBadge, Button, EmptyState } from '../ui';
import { Evidence, ConfidenceMeter, DismissModal } from '../alerts/AlertParts';
import { useDecisions } from '../../hooks/useDecisions';
import { alertTitle, SEVERITY } from '../../lib/format';

/**
 * VÙNG HÀNH ĐỘNG (Prescriptive)
 * ------------------------------------------------------------------
 * Mỗi thẻ đọc theo đúng thứ tự một người ra quyết định cần:
 *   1. Mức độ + hạn xử lý     → có phải làm ngay không
 *   2. Vấn đề + bằng chứng    → con số này có đáng tin không
 *   3. Đề xuất hành động      → làm gì, tốn bao nhiêu, ai duyệt
 *   4. Nút quyết định         → chấp nhận, bỏ qua (kèm lý do), hoặc mở bằng chứng
 *
 * "Chấp nhận" chỉ GHI NHẬN quyết định — hệ thống không tự thực thi hành
 * động phát sinh chi phí hay chạm tới khách hàng.
 */

const PREVIEW = 4;

const ActionCard = ({ alert, state, onAccept, onDismiss, onEvidence }) => {
  const rec = alert.recommendation;
  const step = rec?.steps?.[0];
  const urgent = alert.severity === 'Critical';
  const tone = urgent ? 'border-crit/40 glow-crit' : alert.severity === 'High' ? 'border-high/30' : 'border-line-soft';
  const decided = state === 'ACCEPTED' || state === 'DISMISSED';

  return (
    <li
      className={`relative shrink-0 overflow-hidden rounded-lg border bg-surface/70 p-4 pl-5 transition-opacity ${tone} ${decided ? 'opacity-70' : ''}`}
      style={{ '--sev': SEVERITY[alert.severity]?.color || 'var(--sev-low)' }}
    >
      {/* Vạch mức độ ở mép trái: nhận ra mức độ ngay cả khi chỉ liếc qua cột */}
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-(--sev)" />

      <div className="flex items-center justify-between gap-2">
        <SeverityBadge level={alert.severity} />
        {alert.sla && (
          <span className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-ink-lo">
            <Clock size={12} aria-hidden="true" /> {alert.sla}
          </span>
        )}
      </div>

      <h4 className="mt-2.5 text-sm leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</h4>
      {alert.productName && <p className="mt-0.5 truncate text-xs text-ink-lo">{alert.productName}</p>}
      <Evidence alert={alert} className="mt-2" />

      {step && (
        <div className="mt-3 rounded-lg bg-accent-dim p-3">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold tracking-[0.12em] text-accent-hi uppercase">
            <Lightbulb size={12} aria-hidden="true" /> Đề xuất hành động
          </p>
          <p className="mt-1.5 text-[0.84rem] leading-snug text-ink-hi">{step.text}</p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-ink-mid">
            {step.kindLabel && <span>{step.kindLabel}</span>}
            <span>~{step.effortDays} ngày công</span>
            {step.requiresApproval && step.approvalRole && <span>Duyệt: {step.approvalRole}</span>}
            {rec.steps.length > 1 && <span>+{rec.steps.length - 1} bước</span>}
          </p>
          <ConfidenceMeter value={rec.confidence} className="mt-2.5" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === 'ACCEPTED' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
            <Check size={14} aria-hidden="true" /> Đã chấp nhận · theo dõi lại sau 7 ngày
          </span>
        ) : state === 'DISMISSED' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-mid">
            <CircleSlash size={14} aria-hidden="true" /> Đã bỏ qua, lý do đã được ghi lại
          </span>
        ) : (
          step && (
            <>
              <Button size="sm" icon={Check} onClick={onAccept} loading={state === 'saving'}>Chấp nhận</Button>
              <Button size="sm" variant="ghost" onClick={onDismiss} disabled={state === 'saving'}>Bỏ qua</Button>
            </>
          )
        )}
        <Button size="sm" variant="ghost" iconRight={ArrowUpRight} onClick={onEvidence} className="ml-auto">
          Bằng chứng
        </Button>
        {state === 'error' && <span className="w-full text-xs text-crit">Không lưu được quyết định, thử lại</span>}
      </div>
    </li>
  );
};

const ActionCenter = ({ alerts = [] }) => {
  const navigate = useNavigate();
  const { states, accept, dismiss } = useDecisions();
  const [showAll, setShowAll] = useState(false);
  const [dismissing, setDismissing] = useState(null);

  // Quyết định vừa bấm trên máy này thắng trạng thái máy chủ gửi về lúc tải trang
  const statusOf = (a) => {
    const local = states[a.id];
    if (local === 'ACCEPTED' || local === 'DISMISSED' || local === 'saving' || local === 'error') return local;
    return a.decision && a.decision !== 'PROPOSED' ? a.decision : undefined;
  };
  const isDecided = (a) => statusOf(a) === 'ACCEPTED' || statusOf(a) === 'DISMISSED';

  const bySeverity = (a, b) =>
    (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) || (b.severityScore ?? 0) - (a.severityScore ?? 0);
  // Việc còn chờ lên trước, việc đã quyết xuống cuối (mờ đi)
  const pending = alerts.filter((a) => !isDecided(a)).sort(bySeverity);
  const sorted = [...pending, ...alerts.filter(isDecided).sort(bySeverity)];
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);
  const critical = pending.filter((a) => a.severity === 'Critical').length;
  const needApproval = pending.filter((a) => a.recommendation?.requiresApproval).length;
  const dot = critical ? 'bg-crit' : pending.length ? 'bg-high' : 'bg-ok';

  return (
    <GlassPanel tone="strong" glow={critical ? 'crit' : null} className="flex flex-col overflow-hidden xl:max-h-[calc(100vh-6rem)]">
      <div className="border-b border-line-soft px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className={`relative inline-flex size-2.5 rounded-full ${dot}`} />
          </span>
          <p className="eyebrow">Trung tâm hành động</p>
        </div>
        <h3 className="mt-2 text-[1.2rem] font-semibold tracking-tight text-ink-hi">
          {pending.length ? (
            <>
              <span className="font-mono">{pending.length}</span> việc cần quyết định
            </>
          ) : alerts.length ? (
            'Đã quyết định hết'
          ) : (
            'Không có việc cần xử lý'
          )}
        </h3>
        {alerts.length > 0 && (
          <p className="mt-0.5 text-xs text-ink-lo">
            <span className="font-mono">{critical}</span> nghiêm trọng · <span className="font-mono">{needApproval}</span> cần phê duyệt
            {alerts.length > pending.length && (
              <> · <span className="font-mono">{alerts.length - pending.length}</span> đã quyết định</>
            )}
          </p>
        )}
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          variant="calm"
          compact
          title="Mọi thứ đang ổn định"
          description="Không có biến động nào đạt ngưỡng ý nghĩa thống kê trong phạm vi đang lọc."
        />
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <ol className="flex list-none flex-col gap-3 p-4">
            {visible.map((a) => (
              <ActionCard
                key={a.id}
                alert={a}
                state={statusOf(a)}
                onAccept={() => accept(a)}
                onDismiss={() => setDismissing(a)}
                onEvidence={() => navigate(`/risk?alert=${encodeURIComponent(a.id)}`)}
              />
            ))}
            {sorted.length > PREVIEW && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full rounded-lg border border-dashed border-line py-2 text-xs text-ink-mid transition-colors hover:border-ink-lo hover:text-ink-hi"
                >
                  {showAll ? 'Thu gọn' : `Xem thêm ${sorted.length - PREVIEW} cảnh báo`}
                </button>
              </li>
            )}
          </ol>

          <p className="mt-auto flex gap-2 border-t border-line-soft px-5 py-3 text-[0.7rem] leading-relaxed text-ink-lo">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Hệ thống chỉ đề xuất. Hành động phát sinh chi phí hoặc chạm tới khách hàng đều cần người có thẩm quyền duyệt.
          </p>
        </div>
      )}

      <DismissModal
        alert={dismissing}
        open={Boolean(dismissing)}
        onClose={() => setDismissing(null)}
        onConfirm={(reason) => dismiss(dismissing, reason)}
      />
    </GlassPanel>
  );
};

export default ActionCenter;
