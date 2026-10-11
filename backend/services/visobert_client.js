/**
 * CẦU NỐI TỚI DỊCH VỤ VISOBERT
 * ==================================================================
 * ViSoBERT (Nguyen và cs., EMNLP 2023) là mô hình ngôn ngữ huấn luyện
 * trên văn bản mạng xã hội tiếng Việt — đúng loại văn bản của phản hồi
 * TMĐT: teencode, emoji, viết tắt. Mô hình chạy trong dịch vụ Python
 * riêng (`nlp_service/`), backend gọi sang qua HTTP.
 *
 * NGUYÊN TẮC SUY GIẢM, giống hệt cách xử lý khóa API ở ai_analyzer.js:
 * dịch vụ tắt, lỗi hay chậm thì mọi hàm ở đây trả `null`, và nơi gọi lùi
 * về lớp luật. Không một tính năng thống kê nào phụ thuộc vào dịch vụ này.
 *
 * HAI MỨC SẴN SÀNG:
 *   - reachable + encoderLoaded: dùng được vector nhúng (tầng T2)
 *   - finetuned: có checkpoint tinh chỉnh, mới được lấy nhãn dự đoán
 */

const axios = require('axios');
const taxonomy = require('./taxonomy');
const { normalize, maskPII, stripHtml } = require('./normalizer');

const INPUT_MODES = ['masked', 'normalized'];
const STATUS_TTL_MS = 15 * 1000;
const CHUNK_SIZE = 64;
const CACHE_LIMIT = 20000;

function config() {
  const raw = process.env.VISOBERT_URL;
  const disabled =
    raw !== undefined && ['', 'off', 'false', '0'].includes(raw.trim().toLowerCase());
  const mode = process.env.VISOBERT_INPUT_MODE;
  return {
    enabled: !disabled,
    url: (raw && !disabled ? raw.trim() : 'http://127.0.0.1:8001').replace(/\/+$/, ''),
    timeoutMs: Number(process.env.VISOBERT_TIMEOUT_MS) || 30000,
    // Dịch vụ đặt trên máy chủ từ xa (Hugging Face Spaces) phản hồi chậm hơn
    // localhost; quá ngắn thì cứ bị coi là "không kết nối được"
    healthTimeoutMs: Number(process.env.VISOBERT_HEALTH_TIMEOUT_MS) || 8000,
    // Khóa xác thực khi dịch vụ chạy công khai (VISOBERT_API_KEY ở cả hai phía)
    apiKey: (process.env.VISOBERT_API_KEY || '').trim(),
    configured: Boolean(raw && !disabled),
    inputMode: INPUT_MODES.includes(mode) ? mode : 'masked',
    trustSignals: process.env.VISOBERT_TRUST_SIGNALS === '1'
  };
}

/**
 * TIỀN XỬ LÝ ĐẦU VÀO MÔ HÌNH — dùng chung cho LÚC HUẤN LUYỆN (qua
 * scripts/prepare_nlp_data.js) và LÚC CHẠY THẬT. Hai bên lệch nhau dù
 * chỉ một bước là mô hình nhìn thấy phân phối khác với lúc học.
 *
 *   masked     chỉ che PII và gỡ HTML; GIỮ teencode, emoji, chữ hoa.
 *              Mặc định, vì ViSoBERT được huấn luyện trên chính dạng văn
 *              bản thô này.
 *   normalized đi qua toàn bộ normalizer (dịch teencode, emoji thành chữ).
 *              Giữ lại để chạy ablation: dịch teencode có còn giúp ích
 *              khi mô hình đã hiểu teencode hay không.
 *
 * PII luôn bị che ở cả hai chế độ — văn bản chưa che không bao giờ rời
 * khỏi tiến trình Node.
 */
/** Header gửi kèm mọi lệnh gọi sang dịch vụ */
function authHeaders(cfg = config()) {
  return cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
}

function prepareInput(text, mode = 'masked') {
  if (mode === 'normalized') return normalize(text).normalized;
  return maskPII(stripHtml(text)).text.replace(/\s+/g, ' ').trim();
}

let statusCache = { at: 0, value: null };

function invalidateStatus() {
  statusCache = { at: 0, value: null };
}

async function status({ fresh = false } = {}) {
  const cfg = config();
  if (!cfg.enabled) {
    return {
      enabled: false, reachable: false, encoderLoaded: false, finetuned: false,
      reason: 'Đã tắt bằng VISOBERT_URL=off'
    };
  }
  if (!fresh && statusCache.value && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return statusCache.value;
  }

  let value;
  try {
    const { data } = await axios.get(`${cfg.url}/health`, { timeout: cfg.healthTimeoutMs, headers: authHeaders(cfg) });
    const checkpoint = data.checkpoint || null;
    const tasks = checkpoint?.trainedTasks || {};
    // Chỉ coi là "đã tinh chỉnh" cho mục đích gán nhãn khi hai đầu ra cốt
    // lõi đều đã được huấn luyện; checkpoint chỉ học spam thì không gán nhãn ABSA được
    const canLabel = Boolean(data.finetuned && tasks.sentiment && tasks.category);
    value = {
      enabled: true,
      reachable: true,
      url: cfg.url,
      encoderLoaded: Boolean(data.encoderLoaded),
      finetuned: Boolean(data.finetuned),
      canLabel,
      canScoreSpam: Boolean(data.finetuned && tasks.spam),
      checkpoint,
      // Mô hình phải nhận đầu vào đúng kiểu nó đã học, bất kể cấu hình hiện tại
      inputMode: checkpoint?.inputMode || cfg.inputMode,
      reason: data.finetuned
        ? (canLabel ? null : 'Checkpoint chưa huấn luyện đủ hai đầu ra cảm xúc và danh mục')
        : 'Dịch vụ đang chạy nhưng chưa có checkpoint tinh chỉnh — mới dùng được vector nhúng'
    };
  } catch (e) {
    value = {
      enabled: true, reachable: false, encoderLoaded: false, finetuned: false,
      canLabel: false, canScoreSpam: false, url: cfg.url,
      // Câu này hiện ra cho người xem web (màn Lab): nói điều họ cần biết, không
      // lộ địa chỉ nội bộ. Chi tiết kỹ thuật để ở `detail` và trong log.
      reason: cfg.configured
        ? 'Dịch vụ mô hình ViSoBERT đang khởi động hoặc tạm thời không truy cập được.'
        : 'Máy chủ này chưa được nối với dịch vụ mô hình ViSoBERT.',
      detail: e.code || e.message
    };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

/** Bộ nhớ đệm có giới hạn: phản hồi cũ không đổi nội dung nên không cần tính lại */
function makeCache() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    has: (k) => map.has(k),
    set(k, v) {
      if (map.size >= CACHE_LIMIT) map.delete(map.keys().next().value);
      map.set(k, v);
    },
    clear: () => map.clear()
  };
}

const embedCache = makeCache();
const predictCache = makeCache();

async function postChunked(path, inputs, key) {
  const cfg = config();
  const out = [];
  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    const { data } = await axios.post(
      `${cfg.url}${path}`,
      { texts: inputs.slice(i, i + CHUNK_SIZE) },
      { timeout: cfg.timeoutMs, headers: authHeaders(cfg) }
    );
    out.push(...data[key]);
  }
  return out;
}

/** Gọi dịch vụ chỉ cho phần chưa có trong bộ đệm, rồi trả đủ theo thứ tự đầu vào */
async function cachedCall(cache, cacheKeyPrefix, path, key, inputs, transform = (x) => x) {
  const missing = [...new Set(inputs)].filter((x) => !cache.has(cacheKeyPrefix + x));
  if (missing.length) {
    const results = await postChunked(path, missing, key);
    missing.forEach((input, i) => cache.set(cacheKeyPrefix + input, transform(results[i])));
  }
  return inputs.map((input) => cache.get(cacheKeyPrefix + input) ?? null);
}

/** Vector nhúng từ trọng số gốc (không cần tinh chỉnh). Lỗi -> null */
async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const s = await status();
  if (!s.reachable || !s.encoderLoaded) return null;
  const mode = config().inputMode;
  try {
    const inputs = texts.map((t) => prepareInput(t, mode));
    return await cachedCall(embedCache, `${mode}|`, '/embed', 'vectors', inputs, (v) => Float32Array.from(v));
  } catch (e) {
    console.warn('[VISOBERT] Lỗi /embed, bỏ qua vector nhúng:', e.message);
    invalidateStatus();
    return null;
  }
}

/**
 * LỚP AN TOÀN SAU MÔ HÌNH.
 * Mô hình học lối tắt "nhắc tới shipper = khiếu nại thái độ shipper" (dữ liệu
 * huấn luyện chỉ có shipper trong lời chê). Khi câu là lời khen người giao
 * hàng và không có từ chê thái độ nào, khía cạnh đó bị gỡ và ghi lại lý do —
 * không im lặng sửa kết quả. Xem taxonomy.isCourierPraise.
 */
function guardPrediction(pred, rawText) {
  if (!pred) return pred;
  const flagged = pred.cause === 'CourierAttitude' ||
    (Array.isArray(pred.categories) && pred.categories.some((c) => c.cause === 'CourierAttitude'));
  if (!flagged || !taxonomy.isCourierPraise(normalize(rawText).normalized)) return pred;

  const categories = (pred.categories || []).filter((c) => c.cause !== 'CourierAttitude');
  const out = {
    ...pred,
    categories,
    guard: {
      removed: 'Delivery.CourierAttitude',
      reason: 'Câu khen người giao hàng, không có từ chê thái độ nào — gỡ khía cạnh khiếu nại mà mô hình gán do lối tắt học từ dữ liệu huấn luyện'
    }
  };
  if (pred.cause === 'CourierAttitude') {
    const top = categories[0] || null;
    out.category = top ? top.category : null;
    out.categoryConfidence = top ? top.p : pred.noneProbability ?? null;
    out.cause = top ? top.cause : null;
    out.causeConfidence = top ? top.causeConfidence : null;
  }
  return out;
}

/**
 * Dự đoán thô từ checkpoint tinh chỉnh. Chưa tinh chỉnh hoặc lỗi -> null.
 * `cache: false` chạy thẳng, không dùng bộ đệm — dùng khi cần ĐO tốc độ thật,
 * vì đọc từ đệm sẽ cho ra một con số throughput không có thật.
 */
async function predict(texts, { cache = true } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const s = await status();
  if (!s.finetuned) return null;
  try {
    const inputs = texts.map((t) => prepareInput(t, s.inputMode));
    const guard = (preds) => preds.map((p, i) => guardPrediction(p, texts[i]));
    if (!cache) return guard(await postChunked('/predict', inputs, 'predictions'));
    // Khóa đệm gắn với thời điểm train: đổi checkpoint thì kết quả cũ tự vô hiệu
    const prefix = `${s.checkpoint?.trainedAt || 'ckpt'}|${s.inputMode}|`;
    return guard(await cachedCall(predictCache, prefix, '/predict', 'predictions', inputs));
  } catch (e) {
    console.warn('[VISOBERT] Lỗi /predict, lùi về tầng dự phòng:', e.message);
    invalidateStatus();
    return null;
  }
}

/**
 * Phơi quá trình suy luận của một câu (token, phân bố xác suất, mức ảnh
 * hưởng từng từ) cho màn hình trình diễn. Không dùng bộ đệm: mỗi lần gọi là
 * một lần chạy thật, để thời gian đo hiển thị ra là thời gian thật.
 */
async function explain(text) {
  const s = await status();
  if (!s.finetuned) return null;
  const cfg = config();
  try {
    const input = prepareInput(text, s.inputMode);
    const { data } = await axios.post(`${cfg.url}/explain`, { text: input }, { timeout: cfg.timeoutMs, headers: authHeaders(cfg) });
    return { ...data, prediction: guardPrediction(data.prediction, text), inputMode: s.inputMode, checkpoint: s.checkpoint };
  } catch (e) {
    console.warn('[VISOBERT] Lỗi /explain:', e.message);
    invalidateStatus();
    return null;
  }
}

const round2 = (x) => (Number.isFinite(x) ? Number(x.toFixed(2)) : null);

/** Nhãn danh mục của mô hình chỉ được nhận khi nằm trong taxonomy hiện hành */
function taxonomyLabels(pred) {
  const category = pred && pred.category && taxonomy.TAXONOMY[pred.category] ? pred.category : null;
  const cause = category ? taxonomy.normalizeCause(category, pred.cause) : null;
  const sentiment = ['Positive', 'Negative', 'Neutral'].includes(pred?.sentiment)
    ? pred.sentiment
    : 'Neutral';
  return { category, cause, sentiment };
}

/**
 * Mọi khía cạnh mô hình phát hiện, đã ép về taxonomy.
 * Mô hình đa nhãn trả `categories`; checkpoint một nhãn đời cũ chỉ có nhãn
 * chính, nên hàm này dựng lại danh sách một phần tử cho nó.
 */
function detectedAspects(pred) {
  const list = Array.isArray(pred?.categories) && pred.categories.length
    ? pred.categories
    : [{ category: pred?.category, p: pred?.categoryConfidence, cause: pred?.cause, causeConfidence: pred?.causeConfidence }];

  return list
    .map((d) => {
      const category = d.category && taxonomy.TAXONOMY[d.category] ? d.category : null;
      if (!category) return null;
      const cause = taxonomy.normalizeCause(category, d.cause);
      return {
        category,
        categoryLabel: taxonomy.categoryLabel(category),
        cause,
        causeLabel: taxonomy.causeLabel(category, cause),
        owner: taxonomy.categoryOwner(category),
        confidence: round2(d.p),
        causeConfidence: round2(d.causeConfidence),
        // Nguyên nhân dưới ngưỡng vẫn được nêu, nhưng phải hiện rõ là chưa chắc
        causeUncertain: Boolean(d.causeUncertain)
      };
    })
    .filter(Boolean);
}

/** Dạng kết quả của analyzeFeedbackBatch, để các tầng sau không phải biết nguồn nhãn */
function toAnalysis(pred) {
  const { category, cause, sentiment } = taxonomyLabels(pred);
  const catLabel = category ? taxonomy.categoryLabel(category) : null;
  const causeLbl = category ? taxonomy.causeLabel(category, cause) : null;
  const aspects = detectedAspects(pred);
  return {
    // Danh mục CHÍNH dùng cho bản ghi và cho mọi chỉ số đếm theo danh mục
    category: category || 'Other',
    subCategory: cause,
    sentiment,
    // Toàn bộ khía cạnh: một phản hồi thật thường nêu nhiều vấn đề cùng lúc
    aspects: aspects.map((a) => ({
      aspect: a.causeLabel || a.categoryLabel,
      category: a.category,
      cause: a.cause,
      owner: a.owner,
      // Taxonomy chỉ liệt kê nguyên nhân khiếu nại, nên khía cạnh bóc được luôn tiêu cực
      polarity: 'Negative',
      confidence: a.causeConfidence ?? a.confidence
    })),
    // ViSoBERT ở đây không làm nhận diện thực thể; để trống thay vì đoán
    entities: {},
    aiSummary: aspects.length
      ? aspects.map((a) => `${a.categoryLabel} — ${a.causeLabel || 'chưa rõ nguyên nhân'}`).join(' · ')
      : (category ? `${catLabel} — ${causeLbl || 'chưa rõ nguyên nhân'}` : 'Không thuộc nhóm khiếu nại nào trong taxonomy'),
    labelledBy: 'visobert',
    modelConfidence: {
      sentiment: round2(pred.sentimentConfidence),
      category: round2(pred.categoryConfidence),
      cause: round2(pred.causeConfidence)
    }
  };
}

/** Dạng dự đoán mà khung đánh giá (evaluation/) dùng */
function toBaselinePrediction(pred) {
  const { category, cause, sentiment } = taxonomyLabels(pred);
  return { category, cause, sentiment, labelledBy: 'visobert' };
}

/** Gán nhãn theo lô bằng ViSoBERT; trả null nếu checkpoint chưa gán nhãn được */
async function predictAnalysis(texts) {
  const s = await status();
  if (!s.canLabel) return null;
  const preds = await predict(texts);
  return preds ? preds.map(toAnalysis) : null;
}

/**
 * Tín hiệu mô hình cho Trust Layer, căn thẳng hàng với mảng feedbacks.
 * Bật bằng VISOBERT_TRUST_SIGNALS=1 — mặc định tắt, vì lần chạy đầu phải
 * nhúng toàn bộ kho phản hồi (các lần sau dùng bộ đệm).
 */
async function trustSignals(feedbacks) {
  const cfg = config();
  if (!cfg.trustSignals || !Array.isArray(feedbacks) || feedbacks.length === 0) return null;

  const s = await status();
  if (!s.reachable) return null;

  const texts = feedbacks.map((f) => String(f.originalText || ''));
  const [vectors, preds] = await Promise.all([
    embed(texts),
    s.canScoreSpam ? predict(texts) : Promise.resolve(null)
  ]);
  if (!vectors && !preds) return null;

  return {
    signals: feedbacks.map((_, i) => ({
      embedding: vectors ? vectors[i] : null,
      spamScore: preds && Number.isFinite(preds[i]?.spamProbability) ? preds[i].spamProbability : null
    })),
    meta: {
      embeddings: vectors ? vectors.filter(Boolean).length : 0,
      spamScores: preds ? preds.length : 0,
      checkpointTrainedAt: s.checkpoint?.trainedAt || null
    }
  };
}

module.exports = {
  INPUT_MODES,
  config,
  prepareInput,
  status,
  invalidateStatus,
  embed,
  predict,
  explain,
  predictAnalysis,
  trustSignals,
  toAnalysis,
  toBaselinePrediction,
  detectedAspects,
  guardPrediction,
  _clearCaches: () => { embedCache.clear(); predictCache.clear(); }
};
