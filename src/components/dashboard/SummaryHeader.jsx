import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, RotateCw } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import { GlassPanel } from '../ui/Glass';
import { Skeleton } from '../ui/Skeleton';
import LedgerSkeleton from './LedgerSkeleton';
import { LedgerRun, prefersReducedMotion } from '../motion';
import { fmtDate, fmtDateTime } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC, CUỐN SỔ ĐỐI CHIẾU ĐỨNG NGAY CẠNH
 * ------------------------------------------------------------------
 * Đầu trang là MỘT khối kính (K4-01). Bên trái: một câu nói hôm nay có mấy việc và
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

/** Tờ sổ là giấy đặc, không viền: nằm trên kính mà không thành thẻ lồng thẻ */
const SHEET = 'rounded-ctrl bg-(--sheet) px-5 pt-4 pb-5';

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const todayLabel = () => {
  const s = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** todo: danh sách việc đã gộp và xếp (TodayInbox.buildTodo) */
const SummaryHeader = ({ stats, todo = [], todoReady = true, loading, error, lastUpdated, ledger, ledgerFailed, onRetryLedger, onLedgerDone, playRun = true, evidence, urgent = null, hasUrgent = false, asOfRight = false }) => {
  const navigate = useNavigate();
  const top = todo[0];
  const urgentCount = todo.filter((t) => t.severity === 'critical').length;
  const real = stats?.workspace === 'real';

  let sentence;
  if (error && !stats) {
    sentence = 'Không kết nối được máy chủ phân tích, nên chưa có số liệu để hiện.';
  } else if (error) {
    sentence = 'Không kết nối được máy chủ phân tích. Số liệu bên dưới có thể đã cũ.';
  } else if ((loading && !stats) || !todoReady) {
    sentence = null; // khung xương hai dòng, đúng cỡ câu tóm tắt; giữ tới khi đủ nguồn của danh sách việc
  } else if (top) {
    sentence = (
      <>
        Hôm nay có {todo.length} việc cần làm{urgentCount ? `, ${urgentCount} việc khẩn` : ''}.{' '}
        {hasUrgent ? 'Việc gấp nhất ở ngay bên dưới.' : <>Gấp nhất: {lower1(top.title)}.</>}
      </>
    );
  } else {
    sentence = 'Hôm nay không có việc nào cần làm. Mọi chỉ số đang trong ngưỡng bình thường.';
  }

  const asOfLine = real
    ? `Dữ liệu thật thu thập từ sàn, tên người mua đã che. Tính đến đánh giá mới nhất ngày ${fmtDate(stats.asOf)}${stats.ingestedAt ? `, thu thập lần gần nhất ${fmtDateTime(stats.ingestedAt)}` : ''}.`
    : `Dữ liệu mô phỏng, cập nhật lúc ${lastUpdated}.`;

  const asOf = !stats && error ? null : loading && !stats
    ? <Skeleton className="mt-5 h-3.5 w-64 max-w-full" />
    : <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-ink-mid">{asOfLine}</p>;

  return (
    <GlassPanel as="section" tone="strong" aria-labelledby="summary-title" className="mt-2 mb-8 overflow-hidden">
      {/* Một khối kính: bên trái câu tóm tắt, nút và "Việc gấp nhất" (hàng kẻ, không thẻ); bên phải sổ đối chiếu
          là giấy đặc không viền. Điện thoại xếp một cột: câu, việc gấp, rồi sổ. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start">
        <div className="min-w-0">
          <div className="px-5 pt-6 pb-6 sm:px-8 sm:pt-8">
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
              {top && !hasUrgent && (
                <Button onClick={() => document.getElementById('today')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })}>
                  Xem việc hôm nay
                </Button>
              )}
              <Button variant="secondary" icon={RefreshCw} onClick={() => navigate('/data')}>
                Thu thập dữ liệu mới
              </Button>
            </div>
            {!asOfRight && asOf}
          </div>
          {urgent && <div className="border-t border-line-soft">{urgent}</div>}
        </div>
        <div className="min-w-0 px-5 pt-0 pb-6 sm:px-8 lg:py-8 lg:pr-8 lg:pl-0">
          {ledger ? (
            <LedgerRun ledger={ledger} evidence={evidence} mode="auto" play={playRun} onDone={onLedgerDone} bare className={SHEET} />
          ) : ledgerFailed ? (
            <div className="rounded-ctrl bg-(--sheet)">
              <EmptyState
                variant="error"
                compact
                title="Không tải được sổ đối chiếu"
                description="Chưa lấy được số thu thập và số được tính từ máy chủ."
                action={<Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetryLedger}>Thử lại</Button>}
              />
            </div>
          ) : (
            <LedgerSkeleton flat />
          )}
          {asOfRight && <div className="lg:px-5">{asOf}</div>}
        </div>
      </div>
    </GlassPanel>
  );
};

export default SummaryHeader;
