/**
 * TRUY XUẤT PHẢN HỒI LIÊN QUAN (BM25)
 * ==================================================================
 * Vì sao cần tầng này thay vì đổ thẳng dữ liệu vào mô hình:
 *
 * Bản trợ lý cũ cắt `feedbacks.slice(0, 400)` rồi nhét nguyên vào prompt.
 * Ba vấn đề:
 *   1. Dữ liệu được sắp theo thời gian giảm dần, nên 400 phản hồi đó là
 *      400 phản hồi MỚI NHẤT — không phải 400 phản hồi LIÊN QUAN NHẤT.
 *      Hỏi về "lỗi thanh toán" mà tuần này toàn khiếu nại giao hàng thì
 *      mô hình không nhìn thấy một câu nào về thanh toán.
 *   2. Prompt vẫn nói "bạn có N phản hồi" trong khi chỉ gửi 400. Mô hình
 *      kết luận trên một mẫu thiên lệch nhưng tin rằng mình có đủ dữ liệu.
 *   3. Tốn token vô ích, đi ngược chính lập luận chi phí của kiến trúc.
 *
 * BM25 xếp hạng theo mức liên quan tới câu hỏi, nên ta gửi 15 trích dẫn
 * ĐÚNG CHỦ ĐỀ thay vì 400 trích dẫn ngẫu nhiên về chủ đề.
 */

const { normalize } = require('./normalizer');

/** Tham số BM25 chuẩn */
const K1 = 1.5;
const B = 0.75;

/**
 * Từ dừng tiếng Việt. Những từ này xuất hiện ở gần như mọi câu nên
 * không mang thông tin phân biệt, mà lại làm nhiễu điểm số.
 */
const STOPWORDS = new Set([
  'là', 'và', 'của', 'có', 'được', 'cho', 'với', 'các', 'những', 'một',
  'này', 'đó', 'thì', 'mà', 'ở', 'khi', 'nếu', 'đã', 'sẽ', 'đang', 'rất',
  'quá', 'lắm', 'cũng', 'nữa', 'lại', 'về', 'từ', 'ra', 'vào', 'lên',
  'xuống', 'tôi', 'mình', 'bạn', 'shop', 'em', 'anh', 'chị', 'ạ', 'nhé',
  'ơi', 'à', 'ừ', 'vậy', 'sao', 'gì', 'bị', 'người', 'trong', 'trên'
]);

function tokenize(text) {
  return normalize(String(text || '')).normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Dựng chỉ mục BM25 trên tập phản hồi.
 * Chỉ mục được dựng lại khi dữ liệu đổi; với vài nghìn phản hồi thì chi
 * phí không đáng kể so với một lần gọi mô hình ngôn ngữ.
 */
function buildIndex(items) {
  const docs = items.map((item, i) => {
    // Ghép cả nhãn danh mục vào văn bản chỉ mục: hỏi "vấn đề giao hàng"
    // phải tìm được cả những câu không chứa chữ "giao hàng" nhưng đã
    // được phân loại vào danh mục đó.
    const enriched = [
      item.originalText,
      item.categoryLabel || '',
      item.causeLabel || '',
      item.productName || '',
      item.region || ''
    ].join(' ');

    const tokens = tokenize(enriched);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { i, item, tokens, tf, length: tokens.length };
  });

  const df = new Map();
  for (const d of docs) {
    for (const term of d.tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  }

  const avgLength = docs.length
    ? docs.reduce((s, d) => s + d.length, 0) / docs.length
    : 0;

  return { docs, df, avgLength, N: docs.length };
}

/** Nghịch đảo tần suất tài liệu, dạng trơn của BM25 */
function idf(term, index) {
  const n = index.df.get(term) || 0;
  return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
}

/**
 * Tìm các phản hồi liên quan nhất tới truy vấn.
 *
 * @param {string} query câu hỏi của người dùng
 * @param {object} index chỉ mục từ buildIndex()
 * @param {{limit?: number, filter?: Function}} opts
 */
function search(query, index, opts = {}) {
  const limit = opts.limit ?? 15;
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || index.N === 0) return [];

  const scored = [];
  for (const d of index.docs) {
    if (opts.filter && !opts.filter(d.item)) continue;

    let score = 0;
    for (const term of queryTerms) {
      const f = d.tf.get(term);
      if (!f) continue;
      const denom = f + K1 * (1 - B + (B * d.length) / (index.avgLength || 1));
      score += idf(term, index) * ((f * (K1 + 1)) / denom);
    }

    if (score > 0) {
      // Ưu tiên nhẹ phản hồi có trọng số tin cậy cao: khi hai phản hồi
      // liên quan ngang nhau, trích dẫn cái đáng tin hơn
      const trustBoost = d.item.trust ? 0.85 + 0.3 * d.item.trust.weight : 1;
      scored.push({ item: d.item, score: score * trustBoost });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Các chủ đề nổi bật trong một tập phản hồi, đo bằng tần suất tương đối
 * so với toàn bộ dữ liệu. Dùng khi người dùng hỏi chung chung kiểu
 * "khách hàng đang phàn nàn gì nhiều nhất".
 */
function salientTerms(subsetItems, index, limit = 12) {
  if (!subsetItems.length) return [];

  const subsetTf = new Map();
  let total = 0;
  for (const item of subsetItems) {
    for (const t of tokenize(item.originalText)) {
      subsetTf.set(t, (subsetTf.get(t) || 0) + 1);
      total += 1;
    }
  }

  const scored = [];
  for (const [term, count] of subsetTf) {
    if (count < 2) continue;
    // Tần suất trong tập con, có trọng số theo độ hiếm toàn cục
    scored.push({ term, count, score: (count / total) * idf(term, index) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { buildIndex, search, salientTerms, tokenize, STOPWORDS };
