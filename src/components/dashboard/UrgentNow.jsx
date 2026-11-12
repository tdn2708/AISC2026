import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, CircleSlash, RotateCw } from 'lucide-react';
import { Button } from '../ui';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';
import { Pulse, prefersReducedMotion } from '../motion';
import { SEV, upFirst } from './TodayInbox';

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

const SOURCE = { alert: 'Cảnh báo', live: 'Livestream', orders: 'Đơn hàng', review: 'Duyệt phản hồi', data: 'Dữ liệu' };

const scrollToToday = () =>
  document.getElementById('today')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

const Row = ({ t, state, onAccept, onDismiss }) => {
  const navigate = useNavigate();
  const sev = SEV[t.severity];
  const decided = state === 'ACCEPTED' || state === 'DISMISSED';
  const alert = t.alert;
  const step = alert?.recommendation?.steps?.[0];
  // Nút đậm chỉ cho việc khẩn và gấp, như khối "Việc hôm nay"
  const strong = t.severity !== 'medium';

  return (
    <Pulse as="li" trigger={decided ? state : null} className={`border-b border-line-soft px-5 py-4 last:border-b-0 sm:px-8 ${decided ? 'opacity-70' : ''}`}>
      <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className={`font-semibold ${sev.text}`}>{sev.label}</span>
        <span className="text-xs text-ink-mid">{SOURCE[t.source] || 'Việc khác'}</span>
      </p>
      <p className="mt-1 text-base leading-snug font-semibold text-ink-hi">{t.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-mid">{upFirst(t.why)}</p>
      {step && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-hi">Đề xuất: {step.text}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {alert ? (
          state === 'ACCEPTED' ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok"><Check size={15} aria-hidden="true" />Đã chấp nhận, hệ thống theo dõi lại sau 7 ngày</span>
          ) : state === 'DISMISSED' ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mid"><CircleSlash size={15} aria-hidden="true" />Đã bỏ qua, lý do đã được ghi lại</span>
          ) : (
            <>
              {step && (
                <>
                  <Button size="sm" variant={strong ? 'primary' : 'secondary'} icon={Check} onClick={onAccept} loading={state === 'saving'}>Chấp nhận</Button>
                  <Button size="sm" variant="ghost" onClick={onDismiss} disabled={state === 'saving'}>Bỏ qua</Button>
                </>
              )}
              <Button size="sm" variant={step ? 'ghost' : strong ? 'primary' : 'secondary'} onClick={() => navigate(`/risk?alert=${encodeURIComponent(alert.id)}`)}>Xem bằng chứng</Button>
            </>
          )
        ) : (
          (t.actions || []).map((a, i) => (
            <Button key={a.label} as={Link} to={a.to} size="sm" variant={i === 0 && strong ? 'primary' : 'secondary'}>{a.label}</Button>
          ))
        )}
        {state === 'error' && <span className="w-full text-sm text-crit">Không lưu được quyết định. Thử lại.</span>}
      </div>
    </Pulse>
  );
};

/** Khung xương đúng hình hai hàng việc, để nhận dữ liệu không nhảy bố cục */
const UrgentSkeleton = () => (
  <SkeletonBlock as="ol" label="Đang gom việc gấp" className="list-none">
    {[0, 1].map((i) => (
      <li key={i} className="flex flex-col gap-2 border-b border-line-soft px-5 py-4 last:border-b-0 sm:px-8">
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
  return (
    <section aria-labelledby="urgent-title">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 pt-5 pb-3 sm:px-8">
        <h2 id="urgent-title" className="text-heading font-semibold tracking-[-0.01em] text-ink-hi">Việc gấp nhất</h2>
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
        <ol className="list-none">
          {lifted.map((t) => (
            <Row
              key={t.id}
              t={t}
              state={t.kind === 'alert' ? statusOf(t.alert) : undefined}
              onAccept={() => accept(t.alert)}
              onDismiss={() => onDismiss(t.alert)}
            />
          ))}
        </ol>
      )}
    </section>
  );
};

export default UrgentNow;
