import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { alertTitle, fmtInt, SEVERITY } from '../../lib/format';

/**
 * DẢI TRẠNG THÁI
 * ------------------------------------------------------------------
 * Một khối tối duy nhất giữa trang sáng — thứ mắt nhìn vào đầu tiên —
 * trả lời đúng một câu hỏi: "hôm nay có việc gì cần làm không?".
 * Giống thanh trạng thái triển khai của các công cụ kỹ thuật: một câu,
 * vài con số đo, một nút đi tiếp.
 */

// Màu trạng thái trên nền tối: dùng bậc sáng để đạt tương phản
const DOT = { Critical: '#FF8A9B', High: '#F2B866', Medium: '#E6C85A', Low: '#B7C4C4', ok: '#7FD1A3', error: '#FF8A9B', loading: '#B7C4C4' };

const Item = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="font-mono text-[0.66rem] tracking-[0.06em] text-white/66 uppercase">{label}</dt>
    <dd className="mt-0.5 font-mono text-[0.86rem] font-medium text-white">{children}</dd>
  </div>
);

const StatusStrip = ({ stats, alerts = [], loading, error, lastUpdated }) => {
  const navigate = useNavigate();
  const pending = alerts
    .filter((a) => !a.decision || a.decision === 'PROPOSED')
    .sort((a, b) => (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) || (b.severityScore ?? 0) - (a.severityScore ?? 0));
  const top = pending[0];

  let state;
  let headline;
  let sub;
  if (error) {
    state = 'error';
    headline = 'Không kết nối được máy chủ phân tích';
    sub = 'Số liệu bên dưới có thể đã cũ';
  } else if (loading && !stats) {
    state = 'loading';
    headline = 'Đang tải dữ liệu…';
    sub = '';
  } else if (top) {
    state = top.severity;
    headline = `${pending.length} việc cần quyết định · cao nhất mức ${SEVERITY[top.severity]?.label.toLowerCase()}`;
    sub = `${alertTitle(top)}${top.sla ? ` — xử lý trong ${top.sla}` : ''}`;
  } else {
    state = 'ok';
    headline = 'Mọi chỉ số trong ngưỡng an toàn';
    sub = 'Không có biến động nào cần quyết định';
  }

  const health = stats?.dataHealthScore;

  return (
    <section
      aria-label="Trạng thái hệ thống"
      className="mb-6 overflow-hidden rounded-xl bg-strip text-white shadow-[0_10px_30px_-16px_rgb(10_20_25/0.55)]"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <div className="flex min-w-[260px] flex-1 items-center gap-3.5">
          <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-white/8">
            <span className="size-2.5 rounded-[3px]" style={{ background: DOT[state] }} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.98rem] font-semibold">{headline}</p>
            {sub && <p className="truncate text-[0.8rem] text-white/76" title={sub}>{sub}</p>}
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <Item label="Cảnh báo mở">{fmtInt(alerts.length)}</Item>
          <Item label="Phản hồi hợp lệ">{fmtInt(stats?.totalFeedbacks?.valid)}</Item>
          <Item label="Sức khoẻ dữ liệu">{health != null ? `${health}/100` : '—'}</Item>
          <Item label="Cập nhật">{loading ? '…' : lastUpdated}</Item>
        </dl>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/data')}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={14} aria-hidden="true" /> Đồng bộ
          </button>
          <button
            type="button"
            onClick={() => navigate(top ? `/risk?alert=${encodeURIComponent(top.id)}` : '/risk')}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-semibold text-[#10201B] transition-colors hover:bg-white/90"
          >
            {top ? 'Xử lý ngay' : 'Xem cảnh báo'} <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default StatusStrip;
