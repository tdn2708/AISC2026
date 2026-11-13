/**
 * Định dạng số, ngày giờ và bảng tra ngữ nghĩa dùng chung toàn ứng dụng.
 * Để riêng khỏi file component: Fast Refresh chỉ giữ state khi file
 * component không export thứ gì khác ngoài component.
 */

/** Chuỗi truy vấn cho bộ lọc chung — trước đây đoạn này bị chép tay ở năm nơi. */
export const buildQuery = ({ time, source, product } = {}, extra = {}) => {
  const params = new URLSearchParams();
  if (time && time !== 'All') params.append('time', time);
  if (source && source !== 'All') params.append('source', source);
  if (product && product !== 'All') params.append('product', product);
  Object.entries(extra).forEach(([k, v]) => v != null && v !== '' && params.append(k, v));
  const q = params.toString();
  return q ? `?${q}` : '';
};

export const fmtDate = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateTime = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "3 phút trước", "2 ngày trước" — dùng cho mốc cập nhật và lịch sử */
export const fmtRelative = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'vừa xong';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.round(h / 24);
  return day < 30 ? `${day} ngày trước` : fmtDate(d);
};

const nf = new Intl.NumberFormat('vi-VN');

export const fmtInt = (n) => nf.format(n ?? 0);

const nfDec = {};
/** Số thập phân kiểu Việt có dấu chấm nghìn: (1322.5, 1) -> "1.322,5" */
export const fmtDec = (n, digits = 1) => {
  nfDec[digits] ??= new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return nfDec[digits].format(n ?? 0);
};

/** 0.1234 -> "12,3%". Không có giá trị thì "—": "không biết" khác với "bằng 0". */
export const fmtPct = (v, digits = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')}%`;

/** Viết hoa chữ đầu khi một câu chữ thường (alertInWords) đứng riêng một dòng */
export const upFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Tăng trên 100% thì nói bằng bội số cho dễ đọc: 12.75 -> "gần 14 lần" (x = 1 + rel = 13,75), thay cho "+1.275%".
 * "khoảng" khi lệch không quá 0,1 lần, "gần" khi bội thật nhỏ hơn số nguyên gần nhất, "hơn" khi lớn hơn.
 */
export const timesWords = (rel) => {
  const x = 1 + rel;
  const n = Math.round(x);
  const d = x - n;
  const pre = Math.abs(d) <= 0.1 ? 'khoảng' : d < 0 ? 'gần' : 'hơn';
  return `${pre} ${fmtInt(n)} lần`;
};

/**
 * Mức tăng có dấu: đến 100% giữ phần trăm ("+42%"), trên 100% nói bội số ("tăng gần 14 lần").
 */
export const fmtGrowth = (rel, digits = 0) =>
  rel != null && Number.isFinite(rel) && rel > 1 ? `tăng ${timesWords(rel)}` : fmtSignedPct(rel, digits);

/**
 * Tỉ lệ có luật "dưới 1% giữ 2 chữ số": 0.0011 -> "0,11%" (không để thành "0%"); từ 1% trở lên dùng `digits`.
 * Số 0 đúng nghĩa vẫn hiện theo `digits` ("0%"), vì 0 thật khác với số nhỏ bị làm tròn mất.
 */
export const fmtRate = (v, digits = 1) =>
  fmtPct(v, v != null && v > 0 && v < 0.01 ? 2 : digits);

/** Chênh lệch tương đối có dấu: 0.42 -> "+42%" */
export const fmtSignedPct = (rel, digits = 0) => {
  if (rel == null || !Number.isFinite(rel)) return '—';
  const body = fmtDec(Math.abs(rel * 100), digits);
  if (Number(body.replace(/\./g, '').replace(',', '.')) === 0) return `${body}%`;
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

export const SENTIMENT_MAP = Object.fromEntries(SENTIMENT.map((s) => [s.key, s]));

export const alertTitle = (a) =>
  a.causeLabel ? `${a.categoryLabel}: ${a.causeLabel}` : a.categoryLabel;

/**
 * Mức tăng tương đối của tỉ trọng khiếu nại so với nền.
 * Chỉ cảnh báo loại đột biến mới có hai mốc để so. Nền bằng 0 thì mức
 * tăng là vô hạn — trả Infinity để giao diện ghi "Mới xuất hiện" thay vì
 * bịa ra một phần trăm.
 */
/**
 * Một phản hồi đứng trên bằng chứng gì — cùng ba nhóm với thanh bằng chứng:
 *   human    — người kiểm duyệt đã xác nhận
 *   verified — có chứng từ: sàn xác nhận đã mua, có mã đơn, tài khoản định danh
 *   inferred — chỉ dựa trên phán đoán của Trust Layer
 * `counted` = phản hồi có được tính vào chỉ số hay không.
 */
export const evidenceOf = (f) => {
  const t = f?.trust || {};
  const counted = t.weight > 0;
  if (t.humanLabel) return { kind: 'human', label: 'Người đã duyệt', counted };
  if (f?.verifiedPurchase) return { kind: 'verified', label: 'Sàn xác nhận đã mua', counted };
  if (f?.hasOrder || t.tier === 'P1') return { kind: 'verified', label: 'Đã mua thật', counted };
  if (t.tier === 'P2') return { kind: 'verified', label: 'Tài khoản đã định danh', counted };
  return { kind: 'inferred', label: 'AI đoán', counted };
};

/** Ai đã gán nhãn nội dung (nhóm vấn đề, cảm xúc) cho phản hồi */
export const LABELLER_LABEL = {
  llm: 'Mô hình ngôn ngữ lớn (Gemini, dự phòng Groq)',
  visobert: 'ViSoBERT tinh chỉnh cho tiếng Việt',
  rules: 'Bộ luật từ khoá',
  synthetic: 'Nhãn có sẵn của bộ dữ liệu mô phỏng',
  human: 'Người duyệt',
  cascade: 'Nhiều mô hình bỏ phiếu (mô hình chính, mô hình thứ hai, số sao)'
};

/** Nhãn mỉa mai ngắn cho bảng: đã kết luận, đang nghi, hay không có gì */
export const sarcasmTag = (f) => {
  const s = f?.sarcasm;
  if (!s) return null;
  if (s.verdict === 'sarcastic') return { label: s.by === 'human' ? 'Mỉa mai (người xác nhận)' : 'Mỉa mai', tone: 'high' };
  if (s.suspected && s.verdict !== 'literal') return { label: 'Nghi mỉa mai', tone: 'med' };
  return null;
};

/** Nhãn ngắn cho phản hồi KHÔNG được tính vào chỉ số */
export const exclusionLabel = (t = {}) =>
  t.band === 'SPAM' ? 'Rác, quảng cáo' : t.band === 'LIKELY_INAUTHENTIC' ? 'Nghi đánh giá ảo' : 'Quá cũ, không tính';

/** Diễn biến của một cảnh báo bằng lời thường — không z, không p — cho người quản lý */
export const alertInWords = (a) => {
  const st = a.statistics || {};
  if (a.type === 'SUSTAINED_DRIFT') {
    return `tăng chậm nhưng đều, vượt ngưỡng kiểm soát${st.consecutiveBreaches ? ` ${st.consecutiveBreaches} kỳ liên tiếp` : ''}`;
  }
  if (st.baselineRate != null && st.currentRate != null) {
    // Tỉ lệ dưới 1% cần thêm một chữ số, nếu không 0,04% hiện thành "0,0%"
    const p = (v) => fmtRate(v);
    return st.baselineRate > 0
      ? `tỉ lệ khiếu nại tăng từ ${p(st.baselineRate)} lên ${p(st.currentRate)}`
      : `mới xuất hiện, chiếm ${p(st.currentRate)} phản hồi`;
  }
  const t = a.typeVi || 'biến động bất thường';
  return t.charAt(0).toLowerCase() + t.slice(1);
};

export const growthOf = (alert) => {
  if (alert?.type !== 'SPIKE') return null;
  const { currentRate, baselineRate } = alert.statistics || {};
  if (currentRate == null) return null;
  if (!baselineRate) return currentRate > 0 ? Infinity : null;
  return (currentRate - baselineRate) / baselineRate;
};

/**
 * Gấp chuỗi tiếng Việt về dạng không dấu, chữ thường, để tìm kiếm không phân
 * biệt dấu ("don hang" khớp "Đơn hàng"). Hạ chữ thường TRƯỚC khi đổi "đ": "Đ"
 * không tách được bằng NFD, nên làm ngược thứ tự thì "Đơn" thành "đon" và
 * không khớp với "don".
 */
export const foldVi = (s = '') =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
