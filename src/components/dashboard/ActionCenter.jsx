import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ShieldCheck, Check, ArrowUpRight, CircleSlash, ChevronDown } from 'lucide-react';
import { SeverityBadge, Button, EmptyState } from '../ui';
import { ConfidenceMeter, DismissModal } from '../alerts/AlertParts';
import { useDecisions } from '../../hooks/useDecisions';
import { alertTitle, alertInWords, SEVERITY } from '../../lib/format';

/**
 * VIỆC CẦN QUYẾT
 * ------------------------------------------------------------------
 * Danh sách gọn: mỗi việc một dòng (mức độ, hạn, vấn đề, diễn biến bằng
 * lời thường). Bấm vào một dòng mới mở kế hoạch đề xuất và nút quyết định,
 * để cột này không dài gấp đôi cột số liệu bên cạnh. Việc nặng nhất mở sẵn.
 *
 * "Chấp nhận" chỉ GHI NHẬN quyết định — hệ thống không tự thực thi hành
 * động phát sinh chi phí hay chạm tới khách hàng.
 */

const PREVIEW = 5;

const ActionRow = ({ alert, state, expanded, onToggle, onAccept, onDismiss, onEvidence }) => {
  const rec = alert.recommendation;
  const step = rec?.steps?.[0];
  const decided = state === 'ACCEPTED' || state === 'DISMISSED';
  const panelId = `action-${alert.id}`;

  return (
    <li className={`border-b border-line-soft last:border-b-0 ${decided ? 'opacity-65' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-raised"
      >
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-(--sev)" style={{ '--sev': SEVERITY[alert.severity]?.color || 'var(--sev-low)' }} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</span>
          {alert.productName && <span className="mt-0.5 block truncate text-xs text-ink-lo">{alert.productName}</span>}
          <span className="mt-1 block text-xs text-ink-mid">{alertInWords(alert)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <SeverityBadge level={alert.severity} />
          {decided ? (
            <span className="text-[0.7rem] text-ink-lo">{state === 'ACCEPTED' ? 'Đã chấp nhận' : 'Đã bỏ qua'}</span>
          ) : (
            alert.sla && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-lo">
                <Clock size={11} aria-hidden="true" /> {alert.sla}
              </span>
            )
          )}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`mt-0.5 shrink-0 text-ink-lo transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div id={panelId} className="px-5 pb-4 pl-10">
          {step && (
            <div className="rounded-lg border border-line-soft bg-canvas p-3.5">
              <p className="text-xs font-semibold text-ink-mid">Đề xuất</p>
              <p className="mt-1 text-sm leading-snug text-ink-hi">{step.text}</p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-lo">
                {step.kindLabel && <span>{step.kindLabel}</span>}
                <span>Khoảng {step.effortDays} ngày công</span>
                {step.requiresApproval && step.approvalRole && <span>Cần {step.approvalRole} duyệt</span>}
                {rec.steps.length > 1 && <span>và {rec.steps.length - 1} bước nữa</span>}
              </p>
              <ConfidenceMeter value={rec.confidence} className="mt-2.5" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state === 'ACCEPTED' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
                <Check size={14} aria-hidden="true" /> Đã chấp nhận, hệ thống theo dõi lại sau 7 ngày
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
              Xem bằng chứng
            </Button>
            {state === 'error' && <span className="w-full text-xs text-crit">Không lưu được quyết định. Thử lại.</span>}
          </div>
        </div>
      )}
    </li>
  );
};

const ActionCenter = ({ alerts = [] }) => {
  const navigate = useNavigate();
  const { states, accept, dismiss } = useDecisions();
  const [showAll, setShowAll] = useState(false);
  const [dismissing, setDismissing] = useState(null);
  const [expandedId, setExpandedId] = useState(undefined);

  // Quyết định vừa bấm trên máy này thắng trạng thái máy chủ gửi về lúc tải trang
  const statusOf = (a) => {
    const local = states[a.id];
    if (local === 'ACCEPTED' || local === 'DISMISSED' || local === 'saving' || local === 'error') return local;
    return a.decision && a.decision !== 'PROPOSED' ? a.decision : undefined;
  };
  const isDecided = (a) => statusOf(a) === 'ACCEPTED' || statusOf(a) === 'DISMISSED';

  const bySeverity = (a, b) =>
    (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) || (b.severityScore ?? 0) - (a.severityScore ?? 0);
  const pending = alerts.filter((a) => !isDecided(a)).sort(bySeverity);
  const sorted = [...pending, ...alerts.filter(isDecided).sort(bySeverity)];
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);
  const needApproval = pending.filter((a) => a.recommendation?.requiresApproval).length;
  // Chưa ai bấm thì việc nặng nhất đang chờ được mở sẵn
  const openId = expandedId === undefined ? pending[0]?.id : expandedId;

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="border-b border-line-soft px-5 pt-5 pb-4">
        <h2 className="text-[1.05rem] font-semibold text-ink-hi">Việc cần quyết</h2>
        <p className="mt-0.5 text-xs text-ink-lo">
          {pending.length
            ? `${pending.length} việc đang chờ${needApproval ? `, ${needApproval} việc cần cấp trên duyệt` : ''}`
            : alerts.length
              ? 'Đã quyết định hết'
              : 'Không có việc nào'}
        </p>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          variant="calm"
          compact
          title="Không có việc cần quyết"
          description="Chưa có biến động nào đủ lớn để chắc chắn không phải ngẫu nhiên trong phạm vi đang lọc."
        />
      ) : (
        <>
          <ol className="list-none">
            {visible.map((a) => (
              <ActionRow
                key={a.id}
                alert={a}
                state={statusOf(a)}
                expanded={openId === a.id}
                onToggle={() => setExpandedId(openId === a.id ? null : a.id)}
                onAccept={() => accept(a)}
                onDismiss={() => setDismissing(a)}
                onEvidence={() => navigate(`/risk?alert=${encodeURIComponent(a.id)}`)}
              />
            ))}
          </ol>
          {sorted.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="border-t border-line-soft px-5 py-2.5 text-left text-xs font-semibold text-accent hover:underline"
            >
              {showAll ? 'Thu gọn' : `Xem thêm ${sorted.length - PREVIEW} việc`}
            </button>
          )}
          <p className="flex gap-2 border-t border-line-soft px-5 py-3 text-[0.72rem] leading-relaxed text-ink-lo">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Hệ thống chỉ đề xuất. Việc tốn chi phí hoặc chạm tới khách hàng luôn cần người có thẩm quyền duyệt.
          </p>
        </>
      )}

      <DismissModal
        alert={dismissing}
        open={Boolean(dismissing)}
        onClose={() => setDismissing(null)}
        onConfirm={(reason) => dismiss(dismissing, reason)}
      />
    </div>
  );
};

export default ActionCenter;
