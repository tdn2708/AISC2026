import React, { useEffect, useState } from 'react';
import { RotateCw, ListTodo, BellRing, Radio, ShoppingBag, ClipboardCheck, MessageSquareWarning, FolderOpen, Database, CircleAlert } from 'lucide-react';
import { Button, EmptyState, TitleIcon } from '../ui';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';
import { MOTION } from '../motion';
import { DismissModal } from '../alerts/AlertParts';
import TaskCard, { SOURCE } from './TaskCard';
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
 *
 * Chuyển động theo thao tác (F5-03): mở đề xuất thì phần kế hoạch hiện bằng
 * clip-path từ trên xuống + opacity (--motion-medium, ease-out), thu gọn thì
 * chạy ngược nhanh hơn rồi mới gỡ. Chấp nhận hoặc bỏ qua xong: dòng tô một
 * nhịp (Pulse) rồi tự gập. Không animate chiều cao. Giảm chuyển động: mở,
 * gập ngay, không tô.
 */

export const SEV = {
  critical: { rank: 3, label: 'Khẩn', text: 'text-crit' },
  high: { rank: 2, label: 'Gấp', text: 'text-high' },
  medium: { rank: 1, label: 'Nên làm', text: 'text-accent-hi' }
};
// Thứ tự các nhóm trong "Việc hôm nay": cảnh báo và livestream trước
const GROUP_ICON = { alert: BellRing, live: Radio, orders: ShoppingBag, review: ClipboardCheck, pain: MessageSquareWarning, case: FolderOpen, data: Database };
const GROUP_ORDER = ['alert', 'live', 'orders', 'review', 'pain', 'case', 'data'];
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

/** Khung xương đúng hình ba dòng việc: mức độ, nguồn, tiêu đề, lý do, nút */
const InboxSkeleton = () => (
  <SkeletonBlock as="ol" label="Đang gom việc hôm nay" className="list-none">
    {[0, 1, 2].map((i) => (
      <li key={i} className="flex flex-col gap-3 border-b border-line-soft px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-5 sm:px-6">
        <Skeleton className="h-4 w-12 sm:w-[6.5rem] sm:max-w-12" />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </span>
        <Skeleton className="h-8 w-28 shrink-0" />
      </li>
    ))}
  </SkeletonBlock>
);

/** Việc gấp nhất đã được đưa lên đầu trang (UrgentNow): `skip` bỏ bấy nhiêu việc đầu ở đây, `decisions` là useDecisions dùng chung với khối đó */
export const urgentOf = (todo, max = 2) => todo.filter((t) => t.severity !== 'medium').slice(0, max);

const TodayInbox = ({ alerts = [], items = [], loading, failed, onRetry, skip = 0, decisions }) => {
  const own = useDecisions();
  const { states, accept, dismiss } = decisions || own;
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
  const all = buildTodo(alerts, items, decidedBefore);
  const todo = all.slice(skip);
  const remaining = todo.filter((t) => t.kind !== 'alert' || !['ACCEPTED', 'DISMISSED'].includes(statusOf(t.alert))).length;
  const visible = showAll ? todo : todo.slice(0, PREVIEW);

  // Quyết định vừa lưu xong cho dòng đang mở: để nhịp Pulse chạy hết rồi tự gập
  const openState = openId?.startsWith('alert|') ? states[openId.slice(6)] : undefined;
  useEffect(() => {
    if (openState !== 'ACCEPTED' && openState !== 'DISMISSED') return undefined;
    const t = setTimeout(() => setOpenId(null), MOTION.long);
    return () => clearTimeout(t);
  }, [openState]);

  // Mọi việc đã nằm ở đầu trang: không dựng khối trống thứ hai
  if (skip > 0 && todo.length === 0) return null;

  return (
    <section id="today" aria-labelledby="today-title" className="reveal mb-8 overflow-hidden glass-strong rounded-surf">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line-soft px-5 pt-5 pb-4 sm:px-6">
        <div className="flex items-start gap-3">
          <TitleIcon icon={ListTodo} />
          <div>
          <h2 id="today-title" className="text-heading font-bold tracking-[-0.01em] text-ink-hi">Việc hôm nay</h2>
          <p className="mt-0.5 text-sm text-ink-mid">
            {loading && !todo.length ? <Skeleton as="span" className="mt-1 h-3.5 w-44" /> : failed && !todo.length ? 'Chưa gom được việc' : remaining ? (skip ? `Còn ${remaining} việc khác` : `${remaining} việc cần làm`) : 'Đã xử lý hết'}
          </p>
          </div>
        </div>
      </header>

      {todo.length === 0 && loading ? (
        <InboxSkeleton />
      ) : todo.length === 0 && failed ? (
        <EmptyState variant="error" compact title="Không tải được việc hôm nay" description="Chưa lấy được cảnh báo và việc chờ từ máy chủ, nên chưa thể nói là không có việc." action={onRetry && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>Thử lại</Button>} />
      ) : todo.length === 0 ? (
        <EmptyState variant="calm" compact title="Không có việc nào cần làm" description="Chỉ số đang trong ngưỡng bình thường, không có đơn hay phản hồi nào đang chờ." />
      ) : (
        <>
          {/* Từng nhóm việc một khung, thẻ xếp lưới; trong nhóm vẫn theo mức gấp */}
          <div className="flex flex-col divide-y divide-line-soft">
            {[...GROUP_ORDER, ...new Set(visible.map((t) => t.source).filter((x) => !GROUP_ORDER.includes(x)))].map((src) => {
              const list = visible.filter((t) => t.source === src);
              if (!list.length) return null;
              return (
                <div key={src} className="px-5 py-4 sm:px-6">
                  <h3 className="mb-3 inline-flex items-center gap-2 rounded-ctrl bg-raised py-1 pr-1 pl-2.5 text-sm font-bold text-ink-hi">
                    {React.createElement(GROUP_ICON[src] || CircleAlert, { size: 15, strokeWidth: 2.25, className: 'text-accent-hi', 'aria-hidden': true })}
                    {SOURCE[src] || 'Việc khác'}
                    <span className="min-w-6 rounded-ctrl bg-(--surface) px-1.5 text-center tabular-nums text-xs leading-5 font-semibold text-ink-mid">{list.length}</span>
                  </h3>
                  <ol className="grid list-none items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((t) => (
                      <TaskCard
                        key={t.id}
                        t={t}
                        hideSource
                        open={openId === t.id}
                        onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                        state={t.kind === 'alert' ? statusOf(t.alert) : undefined}
                        onAccept={() => accept(t.alert)}
                        onDismiss={() => setDismissing(t.alert)}
                      />
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
          {todo.length > PREVIEW && (
            <div className="border-t border-line-soft">
              <Button variant="ghost" block onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="h-12 justify-start rounded-none px-5 text-accent-hi sm:px-6">
                {showAll ? 'Thu gọn' : `Xem thêm ${todo.length - PREVIEW} việc`}
              </Button>
            </div>
          )}
        </>
      )}

      <DismissModal alert={dismissing} open={Boolean(dismissing)} onClose={() => setDismissing(null)} onConfirm={(reason) => dismiss(dismissing, reason)} />
    </section>
  );
};

export default TodayInbox;
