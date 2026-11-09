import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, CircleSlash, ChevronDown, ShieldCheck } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import { ConfidenceMeter, DismissModal } from '../alerts/AlertParts';
import { useDecisions } from '../../hooks/useDecisions';
import { alertTitle, alertInWords } from '../../lib/format';

/**
 * VIỆC HÔM NAY — một danh sách duy nhất cho câu hỏi "hôm nay tôi cần làm gì"
 * ------------------------------------------------------------------
 * Gộp mọi việc cần người làm, từ mọi nơi trong hệ thống:
 *   Cảnh báo        chờ quyết định (mở ngay tại chỗ để xem đề xuất, Chấp nhận/Bỏ qua)
 *   Livestream      việc khẩn trong phiên đang live, khiếu nại live chưa đưa vào hệ thống
 *   Đơn hàng        lượt chốt từ live chưa lên đơn
 *   Duyệt phản hồi  nghi đánh giá ảo, AI chưa chắc nhãn
 *   Dữ liệu         kho thật lâu chưa cập nhật
 * Việc gấp ở trên. Mỗi dòng nói việc gì, vì sao, và có nút để làm luôn.
 */

export const SEV = {
  critical: { rank: 3, label: 'Khẩn', dot: 'bg-crit', text: 'text-crit' },
  high: { rank: 2, label: 'Gấp', dot: 'bg-high', text: 'text-high' },
  medium: { rank: 1, label: 'Nên làm', dot: 'bg-accent', text: 'text-accent-hi' }
};
const SOURCE = { alert: 'Cảnh báo', live: 'Livestream', orders: 'Đơn hàng', review: 'Duyệt phản hồi', data: 'Dữ liệu' };
const ALERT_SEV = { Critical: 'critical', High: 'high', Medium: 'medium', Low: 'medium' };
const PREVIEW = 6;

/** Gộp cảnh báo chờ quyết và việc từ máy chủ thành một danh sách đã xếp */
export const buildTodo = (alerts = [], items = [], isDecided = (a) => a.decision && a.decision !== 'PROPOSED') => {
  const fromAlerts = alerts.filter((a) => !isDecided(a)).map((a) => ({
    id: `alert|${a.id}`, kind: 'alert', source: 'alert', severity: ALERT_SEV[a.severity] || 'medium',
    title: `${alertTitle(a)}${a.productName ? `, ${a.productName}` : ''}`, why: alertInWords(a), alert: a,
    score: a.severityScore ?? 0
  }));
  return [...fromAlerts, ...items.map((i) => ({ ...i, kind: 'item' }))]
    .sort((x, y) => SEV[y.severity].rank - SEV[x.severity].rank || (x.kind === 'alert' ? -1 : 0) - (y.kind === 'alert' ? -1 : 0) || (y.score || 0) - (x.score || 0));
};

const AlertPlan = ({ alert, state, onAccept, onDismiss }) => {
  const navigate = useNavigate();
  const rec = alert.recommendation;
  const step = rec?.steps?.[0];
  return (
    <div className="mt-3 rounded-lg border border-line-soft bg-canvas p-4">
      {step ? (
        <>
          <p className="text-sm font-semibold text-ink-mid">Hệ thống đề xuất</p>
          <p className="mt-1 text-[0.95rem] leading-snug text-ink-hi">{step.text}</p>
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
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok"><Check size={15} aria-hidden="true" />Đã chấp nhận, hệ thống theo dõi lại sau 7 ngày</span>
        ) : state === 'DISMISSED' ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mid"><CircleSlash size={15} aria-hidden="true" />Đã bỏ qua, lý do đã được ghi lại</span>
        ) : step && (
          <>
            <Button size="sm" icon={Check} onClick={onAccept} loading={state === 'saving'}>Chấp nhận đề xuất</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={state === 'saving'}>Bỏ qua</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => navigate(`/risk?alert=${encodeURIComponent(alert.id)}`)} className="ml-auto">Xem bằng chứng</Button>
        {state === 'error' && <span className="w-full text-sm text-crit">Không lưu được quyết định. Thử lại.</span>}
      </div>
    </div>
  );
};

const Row = ({ t, open, onToggle, state, onAccept, onDismiss }) => {
  const sev = SEV[t.severity];
  const decided = state === 'ACCEPTED' || state === 'DISMISSED';
  return (
    <li className={`border-b border-line-soft px-5 py-4 last:border-b-0 sm:px-6 ${decided ? 'opacity-70' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
        <div className="flex shrink-0 items-center gap-2 sm:w-[6.5rem] sm:pt-0.5">
          <span className={`size-2.5 rounded-full ${sev.dot}`} aria-hidden="true" />
          <span className={`text-sm font-semibold ${sev.text}`}>{sev.label}</span>
          <span className="text-sm text-ink-mid sm:hidden">{SOURCE[t.source] || 'Việc khác'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-ink-mid sm:block">{SOURCE[t.source] || 'Việc khác'}</p>
          <p className="text-[0.98rem] sm:mt-0.5 leading-snug font-semibold text-ink-hi">{t.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-mid">{t.why}</p>
          {t.kind === 'alert' && open && <AlertPlan alert={t.alert} state={state} onAccept={onAccept} onDismiss={onDismiss} />}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {t.kind === 'alert' ? (
            <Button size="sm" variant={open || t.severity === 'medium' ? 'secondary' : 'primary'} iconRight={ChevronDown} onClick={onToggle} aria-expanded={open} className={open ? '[&>svg]:rotate-180' : ''}>
              {decided ? 'Đã quyết định' : open ? 'Thu gọn' : 'Xem đề xuất'}
            </Button>
          ) : (
            (t.actions || []).map((a, i) => (
              // Nút đậm chỉ cho việc khẩn và gấp, để mắt dừng đúng chỗ
              <Button key={a.label} as={Link} to={a.to} size="sm" variant={i === 0 && t.severity !== 'medium' ? 'primary' : 'secondary'}>{a.label}</Button>
            ))
          )}
        </div>
      </div>
    </li>
  );
};

const TodayInbox = ({ alerts = [], items = [], loading }) => {
  const { states, accept, dismiss } = useDecisions();
  const [openId, setOpenId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [dismissing, setDismissing] = useState(null);

  // Quyết định vừa bấm trên máy này vẫn hiện tới khi tải lại trang, để thấy kết quả
  const statusOf = (a) => {
    const local = states[a.id];
    if (local) return local;
    return a.decision && a.decision !== 'PROPOSED' ? a.decision : undefined;
  };
  const decidedBefore = (a) => !states[a.id] && a.decision && a.decision !== 'PROPOSED';
  const todo = buildTodo(alerts, items, decidedBefore);
  const remaining = todo.filter((t) => t.kind !== 'alert' || !['ACCEPTED', 'DISMISSED'].includes(statusOf(t.alert))).length;
  const visible = showAll ? todo : todo.slice(0, PREVIEW);

  return (
    <section id="today" aria-labelledby="today-title" className="mb-8 scroll-mt-24 overflow-hidden rounded-[12px] border border-line bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line-soft px-5 pt-5 pb-4 sm:px-6">
        <div>
          <h2 id="today-title" className="text-[1.2rem] font-semibold tracking-[-0.01em] text-ink-hi">Việc hôm nay</h2>
          <p className="mt-0.5 text-sm text-ink-mid">
            {loading && !todo.length ? 'Đang gom việc…' : remaining ? `${remaining} việc cần làm, việc gấp ở trên` : 'Đã xử lý hết'}
          </p>
        </div>
        <p className="hidden text-xs text-ink-mid sm:block">Gộp từ cảnh báo, livestream, đơn hàng và hàng đợi duyệt</p>
      </header>

      {todo.length === 0 ? (
        <EmptyState variant="calm" compact title={loading ? 'Đang tải' : 'Không có việc nào cần làm'} description={loading ? undefined : 'Chỉ số đang trong ngưỡng bình thường, không có đơn hay phản hồi nào đang chờ.'} />
      ) : (
        <>
          <ol className="list-none">
            {visible.map((t) => (
              <Row
                key={t.id}
                t={t}
                open={openId === t.id}
                onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                state={t.kind === 'alert' ? statusOf(t.alert) : undefined}
                onAccept={() => accept(t.alert)}
                onDismiss={() => setDismissing(t.alert)}
              />
            ))}
          </ol>
          {todo.length > PREVIEW && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-line-soft px-6 py-3 text-left text-sm font-semibold text-accent-hi hover:bg-raised">
              {showAll ? 'Thu gọn' : `Xem thêm ${todo.length - PREVIEW} việc`}
            </button>
          )}
          <p className="flex gap-2 border-t border-line-soft px-5 py-3 text-xs leading-relaxed text-ink-mid sm:px-6">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            Hệ thống chỉ đề xuất. Việc tốn chi phí hoặc chạm tới khách hàng luôn cần người có thẩm quyền duyệt.
          </p>
        </>
      )}

      <DismissModal alert={dismissing} open={Boolean(dismissing)} onClose={() => setDismissing(null)} onConfirm={(reason) => dismiss(dismissing, reason)} />
    </section>
  );
};

export default TodayInbox;
