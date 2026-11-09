/**
 * MỈA MAI: PHÁT HIỆN NGHI VẤN VÀ BỎ PHIẾU NHÃN
 * ==================================================================
 * Câu mỉa mai dùng từ khen để chê: "Giao nhanh ghê, đặt mùng 1 mà 15 mới
 * tới 👍" (1 sao). Bộ phân loại đọc chữ sẽ gán "khen giao hàng". Trên sàn,
 * phần lớn câu mỉa mai lộ ra ở một trong ba chỗ:
 *
 *   1. LỆCH SAO: sao thấp mà chữ khen, hoặc mô hình đọc ra Tích cực.
 *   2. KHEN + SỰ VIỆC TIÊU CỰC trong cùng câu: "tuyệt vời", "nhanh ghê"
 *      đi cùng "15 ngày mới tới", "hỏng", "không ai trả lời".
 *   3. DẤU HIỆU GIỌNG MỈA: "ghê", "quá trời", "đúng là", "cảm ơn shop vì",
 *      "=))", "🙂", câu hỏi tu từ ("5 sao ư?").
 *
 * Luật ở đây KHÔNG tự quyết nhãn — nó chỉ đánh dấu "nghi mỉa mai" để câu đó
 * được hỏi thêm một mô hình thứ hai, rồi các nguồn cùng bỏ phiếu. Bất đồng
 * thì đưa người duyệt (xem label_cascade.js).
 */

const { normalize } = require('./normalizer');

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Từ khen hay bị dùng ngược nghĩa trong đánh giá sàn
const PRAISE = /(?<!\p{L})(tuyệt vời|xuất sắc|tuyệt|đỉnh|xịn|nhanh ghê|nhanh quá|nhanh thật|giỏi|hay ghê|hay quá|chuyên nghiệp|chu đáo|đáng tiền|cảm ơn shop|cám ơn shop|cảm ơn|10 điểm|mười điểm|5 sao|năm sao|hài lòng|ưng|quá ổn|tốt ghê|tốt thật|hay thật|đẹp ghê|siêu|nhất quả đất|nhất thế giới)(?!\p{L})/u;

// Sự việc tiêu cực cụ thể — thứ khiến lời khen ở trên thành ngược nghĩa
const NEGATIVE_FACT = /(trễ|muộn|chậm|mãi|chưa (nhận|thấy|giao|tới|đến)|không (nhận|thấy|ai|giao|tới|đến|trả lời|phản hồi|dùng được|chạy|lên)|hỏng|vỡ|móp|rách|bể|lỗi|hư|giả|nhái|thiếu|mất|sai|lừa|chờ|đợi|tuần|tháng|\d+\s*ngày|hết hạn|hôi|ẩm|bẩn|cũ|trả hàng|hoàn tiền|bùng|ăn cắp|tệ|kém|chán)/;

// Dấu hiệu giọng mỉa
const MARKERS = /(ghê|quá trời|đúng là|thật là|thiệt là|thật sự là|cảm ơn .{0,20}vì|cám ơn .{0,20}vì|chúc mừng|hay thật|giỏi thật|nể thật|bái phục|ủa|haha|hihi|kkk|=\)\)|:\)\)|\)\)\)|🙂|🙃|👏|😊|😏|🤡|🙄|ư\?|à\?|sao\?)/;

/**
 * @param {{ text: string, rating?: number|null, sentiment?: string|null }} item
 * @returns {{ suspected: boolean, score: number, signals: string[], ratingConflict: boolean }}
 */
function sarcasmSignals({ text, rating = null, sentiment = null }) {
  const raw = String(text || '');
  const t = normalize(raw).normalized.toLowerCase();
  const signals = [];

  const praise = PRAISE.test(t);
  const negFact = NEGATIVE_FACT.test(t) || NEGATIVE_FACT.test(fold(t));
  const marker = MARKERS.test(t) || MARKERS.test(raw.toLowerCase());
  const hasRating = Number.isFinite(rating);
  const low = hasRating && rating <= 2;
  const high = hasRating && rating >= 4;

  if (low && praise) signals.push('Sao thấp nhưng chữ khen');
  if (low && sentiment === 'Positive') signals.push('Sao thấp nhưng nhãn đang là Tích cực');
  if (praise && negFact) signals.push('Lời khen đi cùng sự việc tiêu cực');
  if (marker && (negFact || low)) signals.push('Có dấu hiệu giọng mỉa');

  // Sao cao mà nhãn Tiêu cực: thường là đánh giá vừa khen vừa chê, hoặc nhãn
  // sai — không phải mỉa mai, nhưng cũng cần mô hình thứ hai xem lại
  const ratingConflict = Boolean(high && sentiment === 'Negative');

  // Nghi mỉa mai khi: lệch sao rõ, hoặc khen + sự việc tiêu cực + giọng mỉa
  const suspected =
    signals.includes('Sao thấp nhưng chữ khen') ||
    signals.includes('Sao thấp nhưng nhãn đang là Tích cực') ||
    (praise && negFact && (marker || low));

  const score = Math.min(1, signals.length * 0.3 + (suspected ? 0.1 : 0));
  return { suspected, score: Number(score.toFixed(2)), signals, ratingConflict };
}

/** Phiếu của số sao: chỉ là một phiếu, không bao giờ tự quyết */
function ratingVote(rating) {
  if (!Number.isFinite(rating)) return null;
  if (rating <= 2) return 'Negative';
  if (rating >= 4) return 'Positive';
  return null; // 3 sao: không bỏ phiếu
}

/**
 * BỎ PHIẾU NHÃN CUỐI.
 * Cảm xúc: đa số giữa mô hình chính, mô hình thứ hai (nếu đã hỏi) và số sao.
 * Danh mục: mô hình thứ hai thắng khi nó kết luận MỈA MAI và chỉ ra vấn đề thật
 * mà mô hình chính bỏ sót ("Other"); còn lại giữ của mô hình chính.
 * Cần người duyệt khi hai mô hình bất đồng về cảm xúc hoặc danh mục, hoặc
 * không có đa số.
 *
 * @param {{sentiment, category, subCategory}} primary
 * @param {{sentiment, category, subCategory, sarcastic}|null} judge
 * @param {number|null} rating
 */
function resolveVotes(primary, judge, rating) {
  const votes = [primary?.sentiment, judge?.sentiment, ratingVote(rating)].filter(Boolean);
  const tally = {};
  for (const v of votes) tally[v] = (tally[v] || 0) + 1;
  const [topSentiment, topCount] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [primary?.sentiment || 'Neutral', 0];
  const majority = topCount >= 2 || votes.length === 1;

  let category = primary?.category || 'Other';
  let subCategory = primary?.subCategory || null;
  if (judge && judge.sarcastic && judge.category && judge.category !== 'Other' && category === 'Other') {
    category = judge.category;
    subCategory = judge.subCategory || null;
  }

  // Hai mô hình cùng thấy vấn đề nhưng chỉ ra hai nhóm KHÁC nhau: không phiếu
  // nào phân xử được, phải hỏi người. Bất đồng cảm xúc thì đa số (kèm số sao)
  // phân xử; chỉ khi không có đa số mới cần người.
  const catConflict = Boolean(
    judge &&
    (judge.category || 'Other') !== 'Other' &&
    (primary?.category || 'Other') !== 'Other' &&
    judge.category !== primary.category
  );

  return {
    sentiment: majority ? topSentiment : primary?.sentiment || 'Neutral',
    category,
    subCategory,
    needsReview: !majority || catConflict,
    tally
  };
}

// Có lời khen nào không, kể cả lời khen ngắn ("tốt", "ok", "đẹp").
// Mỉa mai là dùng lời khen để chê, nên câu không có lời khen nào thì không
// thể là mỉa mai, dù mô hình nói gì.
const PRAISE_SHORT = /(?<!\p{L})(tốt|ok|oke|okela|ổn|đẹp|xinh|ngon|thích|ưng|hay|nhanh|rẻ|chất|xịn|đỉnh|tuyệt|hài lòng|cảm ơn|cám ơn|uy tín|đáng|5\s*\*|5\s*sao)(?!\p{L})/u;
function hasPraise(text) {
  const t = normalize(String(text || '')).normalized.toLowerCase();
  return PRAISE.test(t) || PRAISE_SHORT.test(t);
}

module.exports = { sarcasmSignals, resolveVotes, ratingVote, hasPraise };
