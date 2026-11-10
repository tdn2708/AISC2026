import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { fmtDate, fmtDateTime, fmtInt } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC — VÀ CUỐN SỔ ĐỐI CHIẾU ĐỨNG NGAY CẠNH
 * ------------------------------------------------------------------
 * Khối mực duy nhất trên trang. Bên trái: một câu nói hôm nay có mấy việc và
 * việc nào gấp nhất. Bên phải: phép tính từ số phản hồi thu thập được tới số
 * được đưa vào chỉ số — bao nhiêu bị loại vì rác, vì nghi ảo, còn lại bao
 * nhiêu, trong đó bao nhiêu có chứng từ. Đây là thứ các công cụ khác không
 * cho người dùng thấy: con số nào cũng truy được về nguồn.
 *
 * Sổ đọc từ /trust/health (cả kho, không theo bộ lọc) để phép cộng trừ khớp
 * từng đơn vị; phần "có chứng từ" chỉ hiện khi không lọc, vì nó đến từ /stats.
 */

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const LedgerRow = ({ label, value, sign, strong, hint }) => (
  <div className={`flex items-baseline justify-between gap-4 ${strong ? 'pt-2.5' : 'py-1'}`}>
    <dt className={`min-w-0 ${strong ? 'font-semibold text-white' : 'text-white/75'}`}>
      {label}
      {hint && <span className="block text-xs text-white/55">{hint}</span>}
    </dt>
    <dd className={`shrink-0 font-mono tabular-nums ${strong ? 'text-[1.35rem] font-semibold text-white' : 'text-white/90'}`}>
      {sign && <span className="mr-1 text-white/50" aria-hidden="true">{sign}</span>}
      {fmtInt(value)}
    </dd>
  </div>
);

/** Sổ đối chiếu: thu thập → loại → được tính → trong đó có chứng từ */
const Ledger = ({ ledger, evidence }) => {
  if (!ledger) {
    return <div className="h-48 animate-pulse rounded-lg bg-white/[0.06]" aria-hidden="true" />;
  }
  const { rawCollected, spamRemoved, inauthenticFlagged, pendingReview, validForAnalysis, countedForMetrics } = ledger;
  // Con số cuối là số phản hồi góp vào chỉ số, khớp với mọi trang khác. Phần
  // chênh với số qua bộ lọc là phản hồi quá cũ, trọng số đã giảm về 0.
  const counted = countedForMetrics ?? validForAnalysis;
  const aged = Math.max(0, validForAnalysis - counted);
  const verifiedShare = evidence?.total ? (evidence.verified + evidence.human) / evidence.total : null;
  return (
    <figure className="rounded-lg border border-white/12 bg-white/[0.04] px-5 py-4">
      <figcaption className="text-sm font-semibold text-white">Số liệu này đứng trên gì</figcaption>
      <dl className="mt-2 text-sm">
        <LedgerRow label="Phản hồi thu thập được" value={rawCollected} />
        <LedgerRow label="Rác, quảng cáo" value={spamRemoved?.count ?? 0} sign="−" />
        <LedgerRow label="Nghi đánh giá ảo" value={inauthenticFlagged?.count ?? 0} sign="−" />
        {(pendingReview?.count ?? 0) > 0 && <LedgerRow label="Chờ người duyệt" value={pendingReview.count} sign="−" />}
        {aged > 0 && <LedgerRow label="Quá cũ, không còn trọng số" value={aged} sign="−" />}
        <div className="mt-1.5 border-t border-white/20">
          <LedgerRow label="Được tính vào chỉ số" value={counted} strong />
        </div>
      </dl>
      {verifiedShare != null && (
        <div className="mt-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="h-full bg-[#6CC2AF]" style={{ width: `${verifiedShare * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-white/70">
            <span className="font-semibold text-white">{Math.round(verifiedShare * 100)}%</span> có chứng từ hoặc người đã duyệt, phần còn lại do AI đoán
          </p>
        </div>
      )}
    </figure>
  );
};

/** todo: danh sách việc đã gộp và xếp (TodayInbox.buildTodo) */
const SummaryHeader = ({ stats, todo = [], loading, error, lastUpdated, ledger, evidence }) => {
  const navigate = useNavigate();
  const top = todo[0];
  const urgent = todo.filter((t) => t.severity === 'critical').length;
  const real = stats?.workspace === 'real';

  let sentence;
  if (error) {
    sentence = 'Không kết nối được máy chủ phân tích. Số liệu bên dưới có thể đã cũ.';
  } else if (loading && !stats) {
    sentence = 'Đang tải dữ liệu…';
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
    : loading ? 'Dữ liệu mô phỏng, đang tải.' : `Dữ liệu mô phỏng, cập nhật lúc ${lastUpdated}.`;

  return (
    <section aria-labelledby="summary-title" className="mb-6 rounded-xl bg-strip px-6 py-6 text-white sm:px-8 sm:py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-center">
        <div className="min-w-0">
          <h1 id="summary-title" className="text-sm font-medium text-white/70">Tổng quan</h1>
          <p className="mt-2 max-w-[38ch] text-display font-semibold tracking-[-0.015em] text-balance" aria-live="polite">
            {sentence}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {top && (
              <button
                type="button"
                onClick={() => document.getElementById('today')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#13232B] transition-colors hover:bg-white/90"
              >
                Xem việc hôm nay <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/data')}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            >
              <RefreshCw size={14} aria-hidden="true" /> Thu thập dữ liệu mới
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-white/60">{asOfLine}</p>
        </div>
        <Ledger ledger={ledger} evidence={evidence} />
      </div>
    </section>
  );
};

export default SummaryHeader;
