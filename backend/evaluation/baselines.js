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
 *   M   ViSoBERT tinh chỉnh + phân cấp  — mô hình đề xuất
 */

const taxonomy = require('../services/taxonomy');
const { normalize } = require('../services/normalizer');
const visobert = require('../services/visobert_client');

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
 * M — MÔ HÌNH ĐỀ XUẤT: ViSoBERT tinh chỉnh cho ABSA + phân loại phân cấp.
 *
 * Mô hình chạy trong dịch vụ `nlp_service/`. Dòng M CHỈ có số khi dịch vụ
 * đang chạy VÀ đã nạp một checkpoint tinh chỉnh có học cả đầu ra cảm xúc
 * lẫn danh mục. Trọng số gốc uitnlp/visobert là mô hình điền từ bị che,
 * chưa hề học nhãn nào; báo F1 cho nó là bịa số.
 *
 * Việc cần làm để dòng M có số thật:
 *   1. npm run nlp:prepare  (sinh labels.json và tập gold đã tiền xử lý)
 *   2. Chuẩn bị tập huấn luyện: UIT-ViSFD cho cảm xúc + tập tự gán nhãn
 *      theo taxonomy 7x27 cho danh mục/nguyên nhân
 *   3. python train.py --train ...   (tự loại câu trùng tập kiểm tra)
 *   4. python service.py, rồi npm run eval
 */
const M_proposed = {
  id: 'M',
  name: 'ViSoBERT tinh chỉnh cho ABSA + phân loại phân cấp',
  nextSteps: [
    'Chạy npm run nlp:prepare để sinh nhãn và tập chuẩn đã tiền xử lý',
    'Chuẩn bị tập huấn luyện: UIT-ViSFD (cảm xúc) + tập tự gán nhãn theo taxonomy 7 danh mục x 27 nguyên nhân',
    'Tinh chỉnh ViSoBERT bằng nlp_service/train.py',
    'Khởi động nlp_service/service.py rồi chạy lại npm run eval'
  ],

  /** Kiểm tra trạng thái thật của dịch vụ, không giả định */
  async availability() {
    const s = await visobert.status({ fresh: true });
    if (!s.reachable || !s.finetuned) {
      return { available: false, reason: s.reason };
    }
    if (!s.canLabel) {
      return { available: false, reason: s.reason, checkpoint: s.checkpoint };
    }
    if (!s.checkpoint?.leakageGuard) {
      return {
        available: false,
        reason: 'Checkpoint không ghi nhận đã chạy kiểm tra rò rỉ tập kiểm tra — không báo số cho nó',
        checkpoint: s.checkpoint
      };
    }
    return { available: true, checkpoint: s.checkpoint };
  },

  async predictBatch(texts) {
    const preds = await visobert.predict(texts);
    if (!preds) throw new Error('Dịch vụ ViSoBERT không trả kết quả dự đoán');
    return preds.map(visobert.toBaselinePrediction);
  }
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
