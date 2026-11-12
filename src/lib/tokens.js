/**
 * Đọc token màu từ CSS (src/index.css) cho những chỗ không nhận var(),
 * ví dụ thẻ <meta name="theme-color"> hay một thư viện đòi chuỗi hex.
 *
 * Biểu đồ Recharts và thuộc tính SVG trong app nhận được 'var(--viz-1)' trực
 * tiếp, không cần đọc qua đây. Ngoại lệ là SVG bị html2canvas chụp lại (bản
 * in PDF): ở đó dùng hằng số REPORT trong components/report_kit.jsx.
 */

/** Giá trị đã tính của một biến CSS, ví dụ readToken('--canvas') ra mã màu nền trang. Rỗng nếu CSS chưa nạp. */
export const readToken = (name, el = typeof document !== 'undefined' ? document.documentElement : null) => {
  if (!el || typeof getComputedStyle !== 'function') return '';
  return getComputedStyle(el).getPropertyValue(name).trim();
};

/**
 * Chữ trục biểu đồ Recharts (F1-05): 13px, bằng --text-xs, chữ nhỏ nhất của giao diện.
 * Recharts nhận fontSize dạng số chứ không nhận lớp Tailwind, nên giữ một hằng ở đây
 * cho mọi biểu đồ; màu qua token.
 */
export const CHART_FONT = 13;
export const AXIS_TICK = { fontSize: CHART_FONT, fill: 'var(--text-lo)' };
