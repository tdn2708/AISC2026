import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, Flame } from 'lucide-react';
import { Button, TitleIcon } from '../ui';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';
import { prefersReducedMotion } from '../motion';
import TaskCard from './TaskCard';

/**
 * VIỆC GẤP NHẤT — hai việc đầu của "Việc hôm nay", ngay dưới câu tóm tắt
 * ------------------------------------------------------------------
 * Cùng danh sách (TodayInbox.buildTodo) và cùng hành động (useDecisions,
 * dùng chung với TodayInbox qua Dashboard) với khối "Việc hôm nay" bên dưới.
 * Để người xem không thấy một việc hai lần, khối bên dưới BỎ các việc đã đưa
 * lên đây và ghi "còn N việc khác"; khối này có nút cuộn xuống danh sách đó.
 * Chỉ việc khẩn và gấp được đưa lên; không có thì ghi rõ là chưa có việc gấp.
 *
 * Hàng kẻ như các danh sách khác, không thẻ lồng thẻ. Chuyển động chỉ là
 * nhịp Pulse khi một việc vừa được chấp nhận hay bỏ qua (giảm chuyển động:
 * không tô). Màn mở đầu của trang vẫn là phép trừ ở sổ đối chiếu.
 */

/** Mã cảnh báo có dạng Nhóm|Nguyên nhân|Sản phẩm|Khu vực|ngày; lấy tên sản phẩm (nếu có) để mở đúng mảng ở tab điểm đau */
const painLink = (alertId) => {
  const product = String(alertId || '').split('|')[2];
  const named = product && !/^(all|tất cả|—|-)$/i.test(product.trim());
  return `/analytics?tab=pain${named ? `&group=${encodeURIComponent(product.trim())}` : ''}`;
};

const scrollToToday = () =>
  document.getElementById('today')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

/** Khung xương đúng hình MỘT hàng việc (trường hợp thường gặp, K7-02 lỗi 15: hai hàng làm khối co lại ~120 px khi dữ liệu về chỉ có một việc), để nhận dữ liệu không nhảy bố cục */
const UrgentSkeleton = () => (
  <SkeletonBlock as="ol" label="Đang gom việc gấp" className="list-none">
    {[0].map((i) => (
      <li key={i} className="flex min-h-[11.75rem] flex-col gap-2 border-b border-line-soft px-5 py-4 last:border-b-0 sm:min-h-0 sm:px-8">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="mt-1 h-8 w-40" />
      </li>
    ))}
  </SkeletonBlock>
);

/**
 * lifted: các việc gấp được đưa lên (đã xếp), rest: số việc còn lại ở khối bên dưới
 * statusOf(alert): trạng thái quyết định; ready: đã đủ nguồn để nói có hay không có việc
 */
const UrgentNow = ({ lifted = [], rest = 0, ready, failed, onRetry, statusOf, accept, onDismiss }) => {
  const empty = ready && lifted.length === 0;
  const [openId, setOpenId] = useState(null);
  return (
    <section aria-labelledby="urgent-title">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 pt-5 pb-3 sm:px-8">
        <h2 id="urgent-title" className="inline-flex items-center gap-3 text-heading font-bold tracking-[-0.01em] text-ink-hi"><TitleIcon icon={Flame} tone="crit" />Việc gấp nhất</h2>
        {rest > 0 && (
          <Button variant="link" size="sm" onClick={scrollToToday}>Xem {rest} việc khác</Button>
        )}
      </header>

      {!ready ? (
        <UrgentSkeleton />
      ) : failed && lifted.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="text-sm text-ink-mid">Chưa gom được việc gấp, nên chưa thể nói là không có.</p>
          {onRetry && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>Thử lại</Button>}
        </div>
      ) : empty ? (
        <div className="px-5 py-4 sm:px-8">
          <p className="text-base font-semibold text-ink-hi">Hôm nay chưa có việc gấp</p>
          {rest > 0 && <p className="mt-1 text-sm text-ink-mid">{`Có ${rest} việc nên làm, nằm ở danh sách bên dưới.`}</p>}
        </div>
      ) : (
        <ol className="grid list-none items-start gap-3 px-5 py-4 sm:grid-cols-2 sm:px-8">
          {lifted.map((t) => (
            <TaskCard
              key={t.id}
              t={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              state={t.kind === 'alert' ? statusOf(t.alert) : undefined}
              onAccept={() => accept(t.alert)}
              onDismiss={() => onDismiss(t.alert)}
              extra={t.kind === 'alert' && t.alert ? (
                <Button size="sm" variant="link" as={Link} to={painLink(t.alert.id)} className="mt-2">Khách đang than chuyện gì</Button>
              ) : null}
            />
          ))}
        </ol>
      )}
    </section>
  );
};

export default UrgentNow;
