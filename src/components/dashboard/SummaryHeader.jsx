import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC, SỐ LIỆU ĐỨNG SAU
 * ------------------------------------------------------------------
 * Khối mực duy nhất trên trang. Một quản lý mở dashboard lúc 7 giờ sáng
 * cần một câu: hôm nay có gì phải quyết, việc nặng nhất là gì, nặng cỡ nào.
 * Nó thay cho dải trạng thái, thẻ "Mức độ nghiêm trọng" và băng rôn kho
 * thật cũ — ba chỗ từng nói cùng một điều.
 */

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** todo: danh sách việc đã gộp và xếp (TodayInbox.buildTodo) */
const SummaryHeader = ({ stats, todo = [], loading, error, lastUpdated }) => {
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
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-white/70 sm:text-right">{asOfLine}</p>
      </div>
    </section>
  );
};

export default SummaryHeader;
