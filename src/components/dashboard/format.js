/**
 * Định dạng số và bảng tra ngữ nghĩa dùng chung cho dashboard.
 * Để riêng khỏi file component: Fast Refresh chỉ giữ state khi file
 * component không export thứ gì khác ngoài component.
 */

const nf = new Intl.NumberFormat('vi-VN');

export const fmtInt = (n) => nf.format(n ?? 0);

/** 0.1234 -> "12,3%". Không có giá trị thì "—": "không biết" khác với "bằng 0". */
export const fmtPct = (v, digits = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')}%`;

/** Chênh lệch tương đối có dấu: 0.42 -> "+42%" */
export const fmtSignedPct = (rel, digits = 0) => {
  if (rel == null || !Number.isFinite(rel)) return '—';
  const body = Math.abs(rel * 100).toFixed(digits).replace('.', ',');
  if (Number(body.replace(',', '.')) === 0) return `${body}%`;
  return `${rel > 0 ? '+' : '−'}${body}%`;
};

/**
 * Màu mức độ là màu TRẠNG THÁI: không bao giờ dùng cho một chuỗi dữ liệu
 * thông thường, và luôn đi kèm biểu tượng + nhãn chữ.
 */
export const SEVERITY = {
  Critical: { label: 'Nghiêm trọng', rank: 4, color: 'var(--sev-crit)' },
  High: { label: 'Cao', rank: 3, color: 'var(--sev-high)' },
  Medium: { label: 'Trung bình', rank: 2, color: 'var(--sev-med)' },
  Low: { label: 'Thấp', rank: 1, color: 'var(--sev-low)' }
};

export const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

export const severityOf = (level) => SEVERITY[level] || SEVERITY.Low;

/** Thứ tự cố định, không theo số lượng: màu đi theo thực thể, không theo thứ hạng. */
export const SENTIMENT = [
  { key: 'Negative', label: 'Tiêu cực', color: 'var(--viz-neg)' },
  { key: 'Neutral', label: 'Trung tính', color: 'var(--viz-neu)' },
  { key: 'Positive', label: 'Tích cực', color: 'var(--viz-pos)' }
];

export const alertTitle = (a) =>
  a.causeLabel ? `${a.categoryLabel} — ${a.causeLabel}` : a.categoryLabel;

/**
 * Mức tăng tương đối của tỉ trọng khiếu nại so với nền.
 * Chỉ cảnh báo loại đột biến mới có hai mốc để so. Nền bằng 0 thì mức
 * tăng là vô hạn — trả Infinity để giao diện ghi "Mới xuất hiện" thay vì
 * bịa ra một phần trăm.
 */
export const growthOf = (alert) => {
  if (alert?.type !== 'SPIKE') return null;
  const { currentRate, baselineRate } = alert.statistics || {};
  if (currentRate == null) return null;
  if (!baselineRate) return currentRate > 0 ? Infinity : null;
  return (currentRate - baselineRate) / baselineRate;
};
