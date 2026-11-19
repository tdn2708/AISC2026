import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, CircleSlash, ChevronDown, Siren, TriangleAlert, CircleAlert } from 'lucide-react';
import { Button } from '../ui';
import { Pulse, useReducedMotion, MOTION, EASE } from '../motion';
import { ConfidenceMeter } from '../alerts/AlertParts';
import { upFirst } from '../../lib/format';

/**
 * THẺ VIỆC — dùng chung cho "Việc gấp nhất" và "Việc hôm nay"
 * ------------------------------------------------------------------
 * Gập: mức độ (màu + biểu tượng + chữ), nhóm việc, tên vấn đề. Nền cả thẻ nhuộm
 * theo mức độ (khẩn đỏ, gấp cam, nên làm trung tính) để nhìn lướt biết việc nào
 * nóng, không cần đọc chữ. Mở (bấm cả đầu thẻ, mũi tên xuống thành lên): số liệu,
 * đề xuất, nút Chấp nhận / Bỏ qua. Không sọc màu bên trái, không bóng.
 */

export const SOURCE = { alert: 'Cảnh báo', pain: 'Điểm đau', case: 'Hồ sơ', live: 'Livestream', orders: 'Đơn hàng', review: 'Duyệt phản hồi', data: 'Dữ liệu' };

const TONE = {
  critical: { label: 'Khẩn', card: 'bg-crit/12 border-crit/40', pill: 'bg-crit/15 text-crit', Icon: Siren },
  high: { label: 'Gấp', card: 'bg-high/12 border-high/40', pill: 'bg-high/15 text-high', Icon: TriangleAlert },
  medium: { label: 'Nên làm', card: 'bg-raised border-line-soft', pill: 'bg-accent-dim text-accent-hi', Icon: CircleAlert }
};

const HIDDEN = 'inset(0 0 100% 0)';
const SHOWN = 'inset(0 0 0 0)';

/** Phần mở rộng: hiện bằng clip-path, gập chạy ngược rồi mới gỡ khỏi DOM (không animate chiều cao) */
export const Expand = ({ open, children }) => {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || reduced || !el || typeof el.animate !== 'function') return undefined;
    const a = el.animate(
      [{ clipPath: HIDDEN, opacity: 0, transform: 'translateY(-4px)' }, { clipPath: SHOWN, opacity: 1, transform: 'none' }],
      { duration: MOTION.medium, easing: EASE.out }
    );
    return () => a.cancel();
  }, [open, reduced]);

  useEffect(() => {
    if (open || !shown) return undefined;
    const el = ref.current;
    if (reduced || !el || typeof el.animate !== 'function') {
      setShown(false);
      return undefined;
    }
    const a = el.animate(
      [{ clipPath: SHOWN, opacity: 1 }, { clipPath: HIDDEN, opacity: 0 }],
      { duration: Math.round(MOTION.medium * 0.7), easing: EASE.in, fill: 'forwards' }
    );
    let alive = true;
    a.finished.then(() => alive && setShown(false)).catch(() => {});
    return () => {
      alive = false;
      a.cancel();
    };
  }, [open, shown, reduced]);

  return shown ? <div ref={ref}>{children}</div> : null;
};

/** Kế hoạch đề xuất của một cảnh báo, kèm Chấp nhận / Bỏ qua */
export const AlertPlan = ({ alert, state, onAccept, onDismiss }) => {
  const navigate = useNavigate();
  const rec = alert.recommendation;
  const step = rec?.steps?.[0];
  return (
    <div className="mt-3 rounded-ctrl bg-(--surface) p-3.5">
      {step ? (
        <>
          <p className="text-xs font-semibold text-ink-mid">Đề xuất</p>
          <p className="mt-1 text-sm leading-snug text-ink-hi">{step.text}</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mid">
            {step.kindLabel && <span>{step.kindLabel}</span>}
            <span>Khoảng {step.effortDays} ngày công</span>
            {step.requiresApproval && step.approvalRole && <span>Cần {step.approvalRole} duyệt</span>}
            {rec.steps.length > 1 && <span>Còn {rec.steps.length - 1} bước nữa</span>}
          </p>
          <ConfidenceMeter value={rec.confidence} className="mt-3 max-w-xs" />
        </>
      ) : (
        <p className="text-sm text-ink-mid">Chưa có đề xuất cụ thể cho vấn đề này.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === 'ACCEPTED' ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok"><Check size={15} aria-hidden="true" />Đã chấp nhận, theo dõi lại sau 7 ngày</span>
        ) : state === 'DISMISSED' ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mid"><CircleSlash size={15} aria-hidden="true" />Đã bỏ qua, lý do đã được ghi lại</span>
        ) : step && (
          <>
            <Button size="sm" icon={Check} onClick={onAccept} loading={state === 'saving'}>Chấp nhận</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={state === 'saving'}>Bỏ qua</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => navigate(`/risk?alert=${encodeURIComponent(alert.id)}`)} className="ml-auto">Xem bằng chứng</Button>
        {state === 'error' && <span className="w-full text-sm text-crit">Không lưu được quyết định. Thử lại.</span>}
      </div>
    </div>
  );
};

/** Một việc: gập chỉ còn mức độ, nhóm, tên vấn đề; mở ra mới có số liệu và đề xuất */
const TaskCard = ({ t, open, onToggle, state, onAccept, onDismiss, extra, hideSource = false }) => {
  const tone = TONE[t.severity] || TONE.medium;
  const decided = state === 'ACCEPTED' || state === 'DISMISSED';
  const { Icon } = tone;
  const bodyId = `task-${String(t.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <Pulse as="li" trigger={decided ? state : null} className={`min-w-0 rounded-ctrl border ${tone.card} ${decided && !open ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-ctrl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-ctrl px-2 py-0.5 text-xs font-semibold ${tone.pill}`}>
              <Icon size={13} aria-hidden="true" />
              {tone.label}
            </span>
            {!hideSource && <span className="rounded-ctrl border border-line-soft px-1.5 py-0.5 text-xs font-medium text-ink-mid">{SOURCE[t.source] || 'Việc khác'}</span>}
            {decided && <span className="text-xs font-medium text-ok">{state === 'ACCEPTED' ? 'Đã chấp nhận' : 'Đã bỏ qua'}</span>}
          </span>
          <span className="mt-2 line-clamp-2 block text-base leading-snug font-semibold text-ink-hi">{t.title}</span>
        </span>
        <ChevronDown size={20} className={`mt-0.5 shrink-0 text-ink-mid transition-transform duration-short ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        <span className="sr-only">{open ? 'Thu gọn' : 'Xem chi tiết'}</span>
      </button>
      <div id={bodyId} className="px-4">
        <Expand open={open}>
          <div className="pb-4">
            {t.why && <p className="text-sm leading-relaxed text-ink-mid">{upFirst(t.why)}</p>}
            {t.kind === 'alert' && t.alert ? (
              <AlertPlan alert={t.alert} state={state} onAccept={onAccept} onDismiss={onDismiss} />
            ) : (
              (t.actions || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.actions.map((a, i) => (
                    <Button key={a.label} as={Link} to={a.to} size="sm" variant={i === 0 && t.severity !== 'medium' ? 'primary' : 'secondary'}>{a.label}</Button>
                  ))}
                </div>
              )
            )}
            {extra}
          </div>
        </Expand>
      </div>
    </Pulse>
  );
};

export default TaskCard;
