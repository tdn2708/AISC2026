import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Clock, Lightbulb, ShieldCheck, Check, ArrowRight, Activity, Loader2 } from 'lucide-react';
import { GlassPanel, SeverityBadge } from './Glass';
import { alertTitle, fmtInt, fmtPct, fmtSignedPct, growthOf, SEVERITY } from './format';

/**
 * VÙNG HÀNH ĐỘNG (Prescriptive)
 * ------------------------------------------------------------------
 * Mỗi thẻ đọc theo đúng thứ tự một người ra quyết định cần:
 *   1. Mức độ + hạn xử lý     → có phải làm ngay không
 *   2. Vấn đề + bằng chứng    → con số này có đáng tin không
 *   3. Đề xuất hành động      → làm gì, tốn bao nhiêu, ai duyệt
 *   4. Nút quyết định         → chấp nhận, hoặc mở bằng chứng
 *
 * "Chấp nhận" chỉ GHI NHẬN quyết định. Hệ thống không tự thực thi hành
 * động phát sinh chi phí hay chạm tới khách hàng. Bỏ qua bắt buộc nêu lý
 * do, nên việc đó để ở Trung tâm rủi ro, nơi có ô nhập lý do.
 */

const PREVIEW = 4;

const ConfidenceMeter = ({ value }) => {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="mt-2.5 flex items-center gap-2 text-[0.7rem] text-ink-lo">
      <span className="shrink-0">Độ tin cậy</span>
      <span className="h-1.5 flex-1 rounded-full bg-raised/70">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums text-ink-mid">{pct}%</span>
    </div>
  );
};

const Evidence = ({ alert }) => {
  const st = alert.statistics || {};
  if (alert.type === 'SUSTAINED_DRIFT') {
    return (
      <span className="inline-flex items-center gap-1">
        <Activity size={11} aria-hidden="true" /> EWMA {st.ewmaCurrent} vượt giới hạn {st.controlLimit}
      </span>
    );
  }
  const g = growthOf(alert);
  return (
    <>
      <span className="text-ink-mid">{g == null ? alert.typeVi : Number.isFinite(g) ? fmtSignedPct(g) : 'Mới xuất hiện'}</span>
      <span>
        {fmtPct(st.baselineRate)} → {fmtPct(st.currentRate)}
      </span>
      {st.z != null && <span>z = {st.z}</span>}
      {st.pValueDisplay && <span>{st.pValueDisplay}</span>}
      {st.sampleCurrent != null && <span>n = {fmtInt(st.sampleCurrent)}</span>}
    </>
  );
};

const ActionCard = ({ alert, state, onAccept, onEvidence }) => {
  const rec = alert.recommendation;
  const step = rec?.steps?.[0];
  const urgent = alert.severity === 'Critical';
  const tone =
    urgent ? 'border-crit/45 glow-crit' : alert.severity === 'High' ? 'border-high/30' : 'border-line/50';

  return (
    <li
      className={`relative shrink-0 overflow-hidden rounded-xl border bg-canvas/35 p-4 pl-5 ${tone}`}
      style={{ '--sev': SEVERITY[alert.severity]?.color || 'var(--sev-low)' }}
    >
      {/* Vạch mức độ phát sáng ở mép trái: nhận ra mức độ ngay cả khi chỉ liếc qua cột */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-(--sev) shadow-[0_0_14px_1px_var(--sev)]" />

      <div className="flex items-center justify-between gap-2">
        <SeverityBadge level={alert.severity} />
        {alert.sla && (
          <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-lo">
            <Clock size={12} aria-hidden="true" /> Xử lý trong {alert.sla}
          </span>
        )}
      </div>

      <h4 className="mt-2 text-sm font-semibold text-ink-hi">{alertTitle(alert)}</h4>
      {alert.summary && (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-mid" title={alert.summary}>
          {alert.summary}
        </p>
      )}

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] tabular-nums text-ink-lo">
        <Evidence alert={alert} />
      </p>

      {step && (
        <div className="mt-3 rounded-lg border border-accent/25 bg-accent/[0.07] p-3">
          <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent-hi">
            <Lightbulb size={12} aria-hidden="true" /> Đề xuất hành động
          </p>
          <p className="mt-1.5 text-sm leading-snug text-ink-hi">{step.text}</p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-ink-lo">
            {step.kindLabel && <span>{step.kindLabel}</span>}
            <span>~{step.effortDays} ngày công</span>
            {step.requiresApproval && step.approvalRole && <span className="text-ink-mid">Cần duyệt: {step.approvalRole}</span>}
            {rec.steps.length > 1 && <span>+{rec.steps.length - 1} bước tiếp theo</span>}
          </p>
          <ConfidenceMeter value={rec.confidence} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === 'accepted' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-ok">
            <Check size={14} aria-hidden="true" /> Đã ghi nhận · hệ thống theo dõi lại sau 7 ngày
          </span>
        ) : (
          step && (
            <button
              type="button"
              onClick={onAccept}
              disabled={state === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-canvas transition-colors hover:bg-accent-hi disabled:opacity-60"
            >
              {state === 'saving' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
              Chấp nhận đề xuất
            </button>
          )
        )}
        <button
          type="button"
          onClick={onEvidence}
          className="inline-flex items-center gap-1 rounded-md border border-line/70 px-3 py-1.5 text-xs text-ink-mid transition-colors hover:border-ink-lo hover:text-ink-hi"
        >
          Xem bằng chứng <ArrowRight size={13} aria-hidden="true" />
        </button>
        {state === 'error' && <span className="text-xs text-crit">Không lưu được quyết định, thử lại</span>}
      </div>
    </li>
  );
};

const ActionCenter = ({ alerts = [] }) => {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState({});
  const [showAll, setShowAll] = useState(false);

  const sorted = [...alerts].sort(
    (a, b) =>
      (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) ||
      (b.severityScore ?? 0) - (a.severityScore ?? 0)
  );
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);
  const critical = alerts.filter((a) => a.severity === 'Critical').length;
  const needApproval = alerts.filter((a) => a.recommendation?.requiresApproval).length;

  const accept = async (alert) => {
    const rec = alert.recommendation;
    setDecisions((d) => ({ ...d, [alert.id]: 'saving' }));
    try {
      await axios.post('/recommendations/decision', {
        alertId: alert.id,
        decision: 'ACCEPTED',
        actionIds: rec?.steps?.map((s) => s.actionId) ?? [],
        scopeKey: rec?.scopeKey
      });
      setDecisions((d) => ({ ...d, [alert.id]: 'accepted' }));
    } catch (err) {
      console.error('Không lưu được quyết định:', err);
      setDecisions((d) => ({ ...d, [alert.id]: 'error' }));
    }
  };

  const dot = critical ? 'bg-crit' : alerts.length ? 'bg-high' : 'bg-ok';

  return (
    <GlassPanel glow={critical ? 'crit' : null} className="flex flex-col overflow-hidden xl:max-h-[calc(100vh-4rem)]">
      <div className="z-10 bg-surface/40 backdrop-blur-sm border-b border-line/50 px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            {critical > 0 && <span className="absolute inline-flex size-full rounded-full bg-crit opacity-70 motion-safe:animate-ping" />}
            <span className={`relative inline-flex size-2.5 rounded-full ${dot}`} />
          </span>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-lo">Trung tâm hành động</p>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-ink-hi">
          {alerts.length ? `${alerts.length} việc cần quyết định` : 'Không có việc cần xử lý'}
        </h3>
        <p className="mt-0.5 text-xs text-ink-lo">
          {alerts.length
            ? `${critical} nghiêm trọng · ${needApproval} cần phê duyệt · xếp theo mức độ nghiêm trọng`
            : 'Không có biến động nào đạt ngưỡng ý nghĩa thống kê trong phạm vi đang lọc'}
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <ol className="flex list-none flex-col gap-3 p-4">
            {visible.map((a) => (
              <ActionCard
                key={a.id}
                alert={a}
                state={decisions[a.id]}
                onAccept={() => accept(a)}
                onEvidence={() => navigate('/risk')}
              />
            ))}
            {sorted.length > PREVIEW && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full rounded-lg border border-dashed border-line/70 py-2 text-xs text-ink-mid transition-colors hover:border-ink-lo hover:text-ink-hi"
                >
                  {showAll ? 'Thu gọn' : `Xem thêm ${sorted.length - PREVIEW} cảnh báo`}
                </button>
              </li>
            )}
          </ol>

          <p className="mt-auto flex gap-2 border-t border-line/50 px-5 py-3 text-[0.7rem] leading-relaxed text-ink-lo">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Hệ thống chỉ đề xuất. Mọi hành động phát sinh chi phí hoặc chạm tới khách hàng đều cần người có thẩm quyền duyệt.
          </p>
        </div>
      )}
    </GlassPanel>
  );
};

export default ActionCenter;
