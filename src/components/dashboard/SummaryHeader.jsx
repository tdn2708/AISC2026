import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, RotateCw } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import { Skeleton } from '../ui/Skeleton';
import LedgerSkeleton from './LedgerSkeleton';
import { LedgerRun, prefersReducedMotion } from '../motion';
import { fmtDate, fmtDateTime } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC, CUỐN SỔ ĐỐI CHIẾU ĐỨNG NGAY CẠNH
 * ------------------------------------------------------------------
 * Đầu trang, trên nền giấy. Bên trái: một câu nói hôm nay có mấy việc và
 * việc nào gấp nhất. Bên phải: phép tính từ số phản hồi thu thập được tới số
 * được đưa vào chỉ số — bao nhiêu bị loại vì rác, vì nghi ảo, còn lại bao
 * nhiêu, trong đó bao nhiêu có chứng từ. Đây là thứ các công cụ khác không
 * cho người dùng thấy: con số nào cũng truy được về nguồn.
 *
 * Sổ đọc từ /trust/health (cả kho, không theo bộ lọc) để phép cộng trừ khớp
 * từng đơn vị; phần "có chứng từ" chỉ hiện khi không lọc, vì nó đến từ /stats.
 *
 * F5-01: sổ là "phép trừ chạy" (LedgerRun mode="auto"), màn mở đầu có dàn
 * dựng DUY NHẤT của trang: chạy một lần khi vào khung nhìn, dừng đúng ở
 * countedForMetrics (ledgerSplit: chỉ trừ phần chờ duyệt chưa tính), khớp số
 * "được tính" ở mọi trang. Xong thì gọi onLedgerDone để "Cửa hàng đang thế
 * nào" bắt đầu đếm. Tải lại dữ liệu thì sổ đổi số tại chỗ, không chạy lại.
 * Giảm chuyển động: tờ sổ tĩnh; nút "Xem việc hôm nay" cuộn không mượt.
 */

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const todayLabel = () => {
  const s = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** todo: danh sách việc đã gộp và xếp (TodayInbox.buildTodo) */
const SummaryHeader = ({ stats, todo = [], loading, error, lastUpdated, ledger, ledgerFailed, onRetryLedger, onLedgerDone, evidence }) => {
  const navigate = useNavigate();
  const top = todo[0];
  const urgent = todo.filter((t) => t.severity === 'critical').length;
  const real = stats?.workspace === 'real';

  let sentence;
  if (error && !stats) {
    sentence = 'Không kết nối được máy chủ phân tích, nên chưa có số liệu để hiện.';
  } else if (error) {
    sentence = 'Không kết nối được máy chủ phân tích. Số liệu bên dưới có thể đã cũ.';
  } else if (loading && !stats) {
    sentence = null; // khung xương hai dòng, đúng cỡ câu tóm tắt
  } else if (top) {
    sentence = (
      <>
        Hôm nay có {todo.length} việc cần làm{urgent ? `, ${urgent} việc khẩn` : ''}. Gấp nhất: {lower1(top.title)}.
      </>
    );
  } else {
    sentence = 'Hôm nay không có việc nào cần làm. Mọi chỉ số đang trong ngưỡng bình thường.';
  }

  const asOfLine = real
    ? `Dữ liệu thật thu thập từ sàn, tên người mua đã che. Tính đến đánh giá mới nhất ngày ${fmtDate(stats.asOf)}${stats.ingestedAt ? `, thu thập lần gần nhất ${fmtDateTime(stats.ingestedAt)}` : ''}.`
    : `Dữ liệu mô phỏng, cập nhật lúc ${lastUpdated}.`;

  return (
    <section aria-labelledby="summary-title" className="mb-8 border-b border-line pt-4 pb-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="text-sm text-ink-mid"><time>{todayLabel()}</time></p>
          <h1 id="summary-title" className="mt-3 max-w-[30ch] text-display font-semibold tracking-[-0.02em] text-ink-hi" aria-live="polite">
            {sentence ?? (
              <>
                <span className="sr-only">Đang tải việc hôm nay</span>
                <span className="flex flex-col gap-2.5 py-1" aria-hidden="true">
                  <Skeleton className="h-6 w-[26ch] max-w-full" />
                  <Skeleton className="h-6 w-[17ch] max-w-full" />
                </span>
              </>
            )}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {top && (
              <Button onClick={() => document.getElementById('today')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })}>
                Xem việc hôm nay
              </Button>
            )}
            <Button variant="secondary" icon={RefreshCw} onClick={() => navigate('/data')}>
              Thu thập dữ liệu mới
            </Button>
          </div>
          {!stats && error ? null : loading && !stats ? <Skeleton className="mt-5 h-3.5 w-64 max-w-full" /> : <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-ink-lo">{asOfLine}</p>}
        </div>
        {ledger ? (
          <LedgerRun ledger={ledger} evidence={evidence} mode="auto" onDone={onLedgerDone} />
        ) : ledgerFailed ? (
          <div className="rounded-lg border border-line bg-(--sheet)">
            <EmptyState
              variant="error"
              compact
              title="Không tải được sổ đối chiếu"
              description="Chưa lấy được số thu thập và số được tính từ máy chủ."
              action={<Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetryLedger}>Thử lại</Button>}
            />
          </div>
        ) : (
          <LedgerSkeleton />
        )}
      </div>
    </section>
  );
};

export default SummaryHeader;
