import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { fmtDate, fmtDateTime, alertInWords, SEVERITY } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC, SỐ LIỆU ĐỨNG SAU
 * ------------------------------------------------------------------
 * Khối mực duy nhất trên trang. Một quản lý mở dashboard lúc 7 giờ sáng
 * cần một câu: hôm nay có gì phải quyết, việc nặng nhất là gì, nặng cỡ nào.
 * Nó thay cho dải trạng thái, thẻ "Mức độ nghiêm trọng" và băng rôn kho
 * thật cũ — ba chỗ từng nói cùng một điều.
 */

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const bySeverity = (a, b) =>
  (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) || (b.severityScore ?? 0) - (a.severityScore ?? 0);

const SummaryHeader = ({ stats, alerts = [], loading, error, lastUpdated }) => {
  const navigate = useNavigate();
  const pending = alerts.filter((a) => !a.decision || a.decision === 'PROPOSED').sort(bySeverity);
  const top = pending[0];
  const real = stats?.workspace === 'real';

  let sentence;
  if (error) {
    sentence = 'Không kết nối được máy chủ phân tích. Số liệu bên dưới có thể đã cũ.';
  } else if (loading && !stats) {
    sentence = 'Đang tải dữ liệu…';
  } else if (top) {
    const what = top.causeLabel ? `${top.categoryLabel.toLowerCase()} (${lower1(top.causeLabel)})` : top.categoryLabel.toLowerCase();
    sentence = (
      <>
        {pending.length} vấn đề cần quyết định. Nặng nhất là {what}
        {top.productName ? <> ở {top.productName}</> : null}: {alertInWords(top)}.
      </>
    );
  } else if (alerts.length) {
    sentence = 'Mọi vấn đề đã được quyết định. Hệ thống sẽ theo dõi lại sau 7 ngày.';
  } else {
    sentence = 'Không có vấn đề nào cần quyết định. Mọi chỉ số đang trong ngưỡng bình thường.';
  }

  const asOfLine = real
    ? `Dữ liệu thật thu thập từ sàn, tên người mua đã che. Tính đến đánh giá mới nhất ngày ${fmtDate(stats.asOf)}${stats.ingestedAt ? `, thu thập lần gần nhất ${fmtDateTime(stats.ingestedAt)}` : ''}.`
    : `Dữ liệu mô phỏng, cập nhật lúc ${loading ? '…' : lastUpdated}.`;

  return (
    <section aria-labelledby="summary-title" className="mb-6 rounded-[10px] bg-strip px-6 py-6 text-white sm:px-8 sm:py-7">
      <h1 id="summary-title" className="text-sm font-medium text-white/70">Tổng quan</h1>
      <p
        className="mt-2 max-w-[62ch] text-[1.35rem] leading-snug font-semibold tracking-[-0.01em] sm:text-[1.6rem]"
        aria-live="polite"
      >
        {sentence}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex flex-wrap gap-2">
          {top && (
            <button
              type="button"
              onClick={() => navigate(`/risk?alert=${encodeURIComponent(top.id)}`)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#13232B] transition-colors hover:bg-white/90"
            >
              Xem {pending.length} vấn đề <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/data')}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
          >
            <RefreshCw size={14} aria-hidden="true" /> Đồng bộ dữ liệu
          </button>
        </div>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-white/70 sm:text-right">{asOfLine}</p>
      </div>
    </section>
  );
};

export default SummaryHeader;
