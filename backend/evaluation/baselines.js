/**
 * CÁC MÔ HÌNH ĐỐI CHỨNG
 * ==================================================================
 * Bảng so sánh trong thuyết minh tuyên bố rằng các CRM hiện tại "chỉ
 * chấm cảm xúc toàn câu, không tách được nhiều vấn đề trong cùng một
 * feedback". Đó là một tuyên bố định lượng được — và chừng nào chưa đo
 * thì nó vẫn chỉ là lời tuyên bố.
 *
 * Phép so sánh quan trọng nhất là với B2: nó chính là bằng chứng định
 * lượng cho luận điểm "tính mới" của đề tài.
 *
 *   B1  Từ điển cảm xúc + luật          — nền cơ sở thấp nhất
 *   B2  Phân loại cảm xúc toàn câu      — đại diện cách làm của CRM hiện tại
 *   B3  Mô hình ngôn ngữ lớn, zero-shot — đại diện phương án "chỉ cần gọi API"
 *   M   PhoBERT tinh chỉnh + phân cấp   — mô hình đề xuất
 */

const taxonomy = require('../services/taxonomy');
const { normalize } = require('../services/normalizer');

const NEGATIVE_LEXICON = [
  'chậm', 'trễ', 'lâu', 'hỏng', 'lỗi', 'tệ', 'xấu', 'kém', 'mất', 'thiếu',
  'đắt', 'vỡ', 'bể', 'móp', 'bẹp', 'nát', 'rách', 'thất vọng', 'bực', 'chán',
  'không', 'chưa', 'đừng', 'nản', 'khó chịu', 'phí', 'lừa', 'sai', 'nhầm',
  'giả', 'nhái', 'héo', 'úa', 'quá date', 'hết hạn', 'liệt', 'đơ', 'treo'
];

const POSITIVE_LEXICON = [
  'tốt', 'đẹp', 'nhanh', 'ưng', 'hài lòng', 'tuyệt', 'ổn', 'chuẩn', 'mượt',
  'cẩn thận', 'nhiệt tình', 'chu đáo', 'đáng tiền', 'rẻ', 'thích', 'xịn',
  'chắc chắn', 'êm', 'trâu', 'mát', 'vừa', 'sớm', 'ủng hộ', 'cảm ơn'
];

/**
 * B1 — TỪ ĐIỂN CẢM XÚC + LUẬT.
 * Nền cơ sở thấp nhất: đếm từ tích cực/tiêu cực để ra cực tính, và khớp
 * từ khóa taxonomy để ra khía cạnh. Không hiểu phủ định, không hiểu mỉa mai.
 */
function B1_lexiconRules(text) {
  const norm = normalize(text);
  const t = norm.normalized;

  let neg = 0;
  let pos = 0;
  for (const w of NEGATIVE_LEXICON) if (t.includes(w)) neg += 1;
  for (const w of POSITIVE_LEXICON) if (t.includes(w)) pos += 1;

  const sentiment = neg > pos ? 'Negative' : pos > neg ? 'Positive' : 'Neutral';
  const matches = taxonomy.classifyByRules(t);
  const top = matches[0] || null;

  return {
    category: top ? top.category : null,
    cause: top ? top.cause : null,
    sentiment
  };
}

/**
 * B2 — PHÂN LOẠI CẢM XÚC TOÀN CÂU.
 * Đại diện cho cách làm của các nền tảng helpdesk/CRM hiện tại: gán MỘT
 * nhãn cảm xúc cho cả câu, KHÔNG bóc tách khía cạnh.
 *
 * Điểm mấu chốt của phép đo: B2 luôn trả `category = null`. Nó không
 * "đoán sai" khía cạnh — nó KHÔNG TRẢ LỜI được câu hỏi khía cạnh. Đó
 * chính xác là khoảng trống mà đề tài nhắm tới, và bảng kết quả sẽ cho
 * thấy khoảng trống đó lớn bao nhiêu bằng con số.
 */
function B2_sentenceSentiment(text) {
  const norm = normalize(text);
  const t = norm.normalized;

  let neg = 0;
  let pos = 0;
  for (const w of NEGATIVE_LEXICON) if (t.includes(w)) neg += 1;
  for (const w of POSITIVE_LEXICON) if (t.includes(w)) pos += 1;

  return {
    category: null, // không có khả năng bóc tách khía cạnh
    cause: null,
    sentiment: neg > pos ? 'Negative' : pos > neg ? 'Positive' : 'Neutral'
  };
}

/**
 * B3 — MÔ HÌNH NGÔN NGỮ LỚN, KHÔNG TINH CHỈNH.
 * Đại diện cho phương án "chỉ cần gọi API là xong".
 *
 * Bất đồng bộ và cần khóa API. Khi không có khóa, hàm điều phối sẽ bỏ
 * qua B3 và ghi rõ lý do trong báo cáo, thay vì điền một con số giả.
 */
async function B3_zeroShotLLM(texts) {
  const { analyzeFeedbackBatch } = require('../services/ai_analyzer');
  const results = await analyzeFeedbackBatch(texts);
  return results.map((r) => ({
    category: r.category === 'Other' ? null : r.category,
    cause: r.subCategory || null,
    sentiment: r.sentiment,
    labelledBy: r.labelledBy
  }));
}

/**
 * M — MÔ HÌNH ĐỀ XUẤT: PhoBERT tinh chỉnh cho ABSA + phân loại phân cấp.
 *
 * ============ TRẠNG THÁI THẬT: CHƯA ĐƯỢC HUẤN LUYỆN ============
 *
 * Không có trọng số mô hình nào trong kho mã này. Báo cáo một con số F1
 * cho M lúc này là bịa số — nên hàm trả về `available: false`, và bảng
 * kết quả sẽ ghi rõ "chưa huấn luyện" ở dòng M thay vì để trống hoặc
 * điền đại.
 *
 * Việc cần làm để dòng M có số thật (mục A.1–A.3 của kế hoạch thực nghiệm):
 *   1. Tải UIT-ViSFD (11.122 bình luận có nhãn ABSA, 10 khía cạnh)
 *   2. Gán nhãn tập chuyên ngành 3.000 đánh giá theo taxonomy 7x27
 *   3. Tinh chỉnh PhoBERT, xuất trọng số
 *   4. Cài `predict()` ở đây rồi chạy lại `npm run eval`
 */
const M_proposed = {
  available: false,
  reason: 'Chưa có trọng số mô hình PhoBERT đã tinh chỉnh trong kho mã',
  nextSteps: [
    'Tải bộ dữ liệu chuẩn UIT-ViSFD để đối chuẩn ABSA',
    'Gán nhãn tập chuyên ngành theo taxonomy 7 danh mục x 27 nguyên nhân',
    'Tinh chỉnh PhoBERT cho bài toán ABSA và phân loại phân cấp',
    'Cài hàm predict() trong baselines.js rồi chạy lại npm run eval'
  ],
  predict: null
};

const SYNC_BASELINES = [
  {
    id: 'B1',
    name: 'Từ điển cảm xúc + luật',
    role: 'Nền cơ sở thấp nhất',
    predict: B1_lexiconRules,
    canDetectAspect: true
  },
  {
    id: 'B2',
    name: 'Phân loại cảm xúc toàn câu',
    role: 'Đại diện cách làm của CRM hiện tại',
    predict: B2_sentenceSentiment,
    canDetectAspect: false
  }
];

module.exports = {
  B1_lexiconRules,
  B2_sentenceSentiment,
  B3_zeroShotLLM,
  M_proposed,
  SYNC_BASELINES,
  NEGATIVE_LEXICON,
  POSITIVE_LEXICON
};
