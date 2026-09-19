/**
 * TẦNG MÔ HÌNH NGÔN NGỮ
 * ==================================================================
 * QUYẾT ĐỊNH KIẾN TRÚC (đồng thời là lập luận kinh doanh, không chỉ kỹ
 * thuật): mô hình ngôn ngữ lớn CHỈ được gọi ở tầng tổng hợp — gán nhãn
 * theo lô và diễn đạt cảnh báo — chứ không gọi cho từng phản hồi trong
 * đường chạy nóng. Phần xử lý khối lượng lớn do mô hình ViSoBERT tinh
 * chỉnh (xem visobert_client.js) và lớp luật đảm nhiệm, chạy được trên
 * hạ tầng chi phí thấp.
 * Chênh lệch chi phí giữa hai cách làm này khoảng ba bậc độ lớn, và đó
 * chính là lý do mô hình giá dành cho SME khả thi.
 */

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const taxonomy = require('./taxonomy');
const { normalize } = require('./normalizer');
const visobert = require('./visobert_client');

/**
 * KHỞI TẠO MUỘN (lazy) CÁC CLIENT MÔ HÌNH NGÔN NGỮ.
 *
 * Bản trước khởi tạo client ngay khi nạp module. Hệ quả: thiếu một khóa
 * API là TOÀN BỘ máy chủ sập lúc khởi động — kể cả những phần không hề
 * dùng tới mô hình ngôn ngữ, tức là gần như tất cả: Trust Layer, kiểm
 * định thống kê, chỉ số WCR, động cơ cảnh báo.
 *
 * Điều đó biến một tính năng phụ thành điểm chết của cả hệ thống, và
 * khiến bất kỳ ai clone repo về chạy thử mà chưa có khóa đều thấy sản
 * phẩm "hỏng". Ở đây client chỉ được tạo khi thực sự cần, và thiếu khóa
 * thì phần đó suy giảm chứ không kéo sập phần còn lại.
 */
let _groq = null;
let _genAI = null;

function getGroq() {
  if (!process.env.GROQ_API_KEY) throw new Error('Thiếu GROQ_API_KEY');
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error('Thiếu GEMINI_API_KEY');
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAI;
}

/** Cho phép các tầng khác biết tính năng nào đang khả dụng */
function llmAvailability() {
  return {
    groq: Boolean(process.env.GROQ_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    anyAvailable: Boolean(
      process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY
    )
  };
}

// llama-3.3-70b-versatile đã bị Groq gỡ (API trả 404), khiến nhánh Groq
// âm thầm lùi về lớp luật. Kiểm tra lại bằng `node list_models.js` khi đổi.
const GROQ_MODEL = 'openai/gpt-oss-120b';
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.5-flash';

/** Gỡ rào markdown mà mô hình hay bọc quanh JSON */
function stripCodeFence(text) {
  let out = String(text || '').trim();
  out = out.replace(/^```(?:json)?\s*/i, '');
  out = out.replace(/```\s*$/i, '');
  return out.trim();
}

/** Mô tả taxonomy đưa vào prompt, để mô hình không tự chế nhãn mới */
function taxonomyPrompt() {
  return taxonomy
    .flatTaxonomy()
    .map(
      (c) =>
        `- ${c.key} (${c.label}): ${c.causes.map((x) => `${x.key} = ${x.label}`).join(' | ')}`
    )
    .join('\n');
}

/**
 * PHÂN LOẠI BẰNG LUẬT — dùng khi mô hình lỗi hoặc trả nhãn ngoài taxonomy.
 *
 * Bản cũ khi lỗi thì sinh nhãn NGẪU NHIÊN (category lấy theo index, cảm
 * xúc theo Math.random). Đó là dữ liệu bịa: nó làm mọi biểu đồ phía sau
 * trông có vẻ hoạt động trong khi thực chất không mang thông tin nào.
 * Ở đây thay bằng phân loại theo luật từ khóa — kém chính xác hơn mô
 * hình, nhưng mọi nhãn đều truy vết được về từ khóa đã khớp.
 */
function classifyByRulesFallback(text) {
  const norm = normalize(text);
  const matches = taxonomy.classifyByRules(norm.normalized);

  const NEGATIVE_MARKERS = /(chậm|hỏng|lỗi|tệ|xấu|kém|mất|thiếu|đắt|vỡ|móp|không|chưa|bực|thất vọng)/;
  const POSITIVE_MARKERS = /(tốt|nhanh|đẹp|hài lòng|tuyệt|ưng|cẩn thận|nhiệt tình|đáng tiền)/;

  let sentiment = 'Neutral';
  if (matches.length > 0 || NEGATIVE_MARKERS.test(norm.normalized)) sentiment = 'Negative';
  if (POSITIVE_MARKERS.test(norm.normalized) && matches.length === 0) sentiment = 'Positive';

  const top = matches[0];
  return {
    category: top ? top.category : 'Other',
    subCategory: top ? top.cause : null,
    sentiment,
    aspects: matches.slice(0, 3).map((m) => ({
      aspect: taxonomy.causeLabel(m.category, m.cause),
      polarity: 'Negative',
      confidence: Number(m.confidence.toFixed(2))
    })),
    entities: {},
    aiSummary: top
      ? `${taxonomy.categoryLabel(top.category)} — ${taxonomy.causeLabel(top.category, top.cause)}`
      : 'Chưa xác định được nguyên nhân cụ thể',
    labelledBy: 'rules'
  };
}

/** Ép kết quả của mô hình về đúng taxonomy và đúng miền giá trị */
function coerceResult(raw, originalText) {
  if (!raw || typeof raw !== 'object') return classifyByRulesFallback(originalText);

  const category = taxonomy.normalizeCategory(raw.category);
  const cause = taxonomy.normalizeCause(category, raw.subCategory);

  const sentiment = ['Positive', 'Negative', 'Neutral'].includes(raw.sentiment)
    ? raw.sentiment
    : 'Neutral';

  // Nhãn ngoài taxonomy => quay về lớp luật, không nhận bừa
  if (category === 'Other' && !cause) {
    const fb = classifyByRulesFallback(originalText);
    return { ...fb, sentiment: sentiment !== 'Neutral' ? sentiment : fb.sentiment };
  }

  return {
    category,
    subCategory: cause,
    sentiment,
    aspects: Array.isArray(raw.aspects)
      ? raw.aspects.slice(0, 5).map((a) => ({
          aspect: String(a.aspect || '').slice(0, 80),
          polarity: ['Positive', 'Negative', 'Neutral'].includes(a.polarity) ? a.polarity : 'Neutral',
          confidence: Number(a.confidence) || null
        }))
      : [],
    // ĐẦU RA NER TÁCH RIÊNG khỏi đầu ra ABSA. "Chi nhánh A" là một THỰC
    // THỂ, không phải một nhãn cảm xúc; trộn hai thứ vào cùng một cột là
    // lỗi mô hình hóa. Tách ra còn mở thêm chiều phân tích: drill-down
    // theo chi nhánh, sản phẩm, đơn vị vận chuyển.
    entities: {
      branch: raw.entities?.branch || null,
      product: raw.entities?.product || null,
      orderId: raw.entities?.orderId || null,
      courier: raw.entities?.courier || null
    },
    aiSummary: String(raw.aiSummary || '').slice(0, 300) || null,
    labelledBy: 'llm'
  };
}

/**
 * Gán nhãn theo lô. Lưu ý: hàm này KHÔNG còn trả về trường `severity`.
 * Mức nghiêm trọng không phải thuộc tính của một câu văn — nó là kết
 * quả của kiểm định thống kê trên cả cụm phản hồi (xem alert_engine),
 * phụ thuộc quy mô, xu hướng và tác động nghiệp vụ. Để mô hình ngôn ngữ
 * tự phán "Critical" cho một câu là gán mức nghiêm trọng bằng cảm tính.
 *
 * Thứ tự ưu tiên: ViSoBERT tinh chỉnh -> mô hình ngôn ngữ lớn -> lớp luật.
 * ViSoBERT đứng đầu vì đây là đường chạy nóng: chạy cục bộ, không tốn phí
 * theo lượt, không gửi văn bản khách hàng ra dịch vụ bên ngoài.
 */
const analyzeFeedbackBatch = async (reviewsArray) => {
  if (!Array.isArray(reviewsArray) || reviewsArray.length === 0) return [];

  const viaModel = await visobert.predictAnalysis(reviewsArray);
  if (viaModel) return viaModel;

  const prompt = `Bạn là hệ thống gán nhãn phản hồi khách hàng tiếng Việt cho sàn thương mại điện tử.

TAXONOMY BẮT BUỘC (chỉ được dùng đúng các mã dưới đây, không tự tạo mã mới):
${taxonomyPrompt()}

QUY TẮC PHÂN NHÁNH QUAN TRỌNG: hư hỏng trong quá trình vận chuyển thuộc
nhánh Delivery (DamagedInTransit), KHÔNG thuộc ProductQuality — vì bộ
phận chịu trách nhiệm khắc phục là khâu vận chuyển.

Với MỖI bình luận trong mảng đầu vào, trả về một đối tượng JSON:
{
  "category": "<một mã Level 1 ở trên, hoặc 'Other'>",
  "subCategory": "<một mã Level 2 thuộc đúng category đó, hoặc null>",
  "sentiment": "Positive" | "Negative" | "Neutral",
  "aspects": [{"aspect": "<khía cạnh được nhắc tới>", "polarity": "Positive|Negative|Neutral"}],
  "entities": {"branch": <chi nhánh hoặc null>, "product": <sản phẩm hoặc null>, "orderId": <mã đơn hoặc null>, "courier": <đơn vị vận chuyển hoặc null>},
  "aiSummary": "<một câu tóm tắt>"
}

Trường "aspects" là đầu ra phân tích cảm xúc theo khía cạnh; trường
"entities" là đầu ra nhận diện thực thể. KHÔNG trộn hai loại này vào nhau.
Một câu có thể chứa nhiều khía cạnh TRÁI DẤU — hãy tách đủ.

Trả về DUY NHẤT một mảng JSON đúng thứ tự đầu vào, không kèm giải thích.

Dữ liệu:
${JSON.stringify(reviewsArray)}`;

  try {
    const completion = await getGroq().chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: GROQ_MODEL
    });

    const parsed = JSON.parse(stripCodeFence(completion.choices[0].message.content));
    const arr = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed).find((v) => Array.isArray(v)) || [];

    return reviewsArray.map((text, i) => coerceResult(arr[i], text));
  } catch (error) {
    console.error('[GROQ] Lỗi analyzeFeedbackBatch, chuyển sang phân loại theo luật:', error.message);
    // Lớp luật, KHÔNG phải nhãn ngẫu nhiên
    return reviewsArray.map((text) => classifyByRulesFallback(text));
  }
};

/**
 * Dự báo xu hướng. Dữ liệu đưa vào ĐÃ qua Trust Layer (xem route
 * /predict/refresh), nên mô hình không suy luận trên đánh giá ảo.
 */
async function generatePrediction(feedbacks, timeFilter = 'All', productFilter = 'All') {
  let horizon = '30 ngày tới';
  if (timeFilter === 'Today') horizon = '7 ngày tới';
  else if (timeFilter === 'This Week') horizon = '4 tuần tới';
  else if (timeFilter === 'This Month') horizon = 'quý tới';

  const scope = productFilter !== 'All' ? `sản phẩm ${productFilter}` : 'toàn bộ sản phẩm';

  const compact = feedbacks.slice(0, 300).map((f) => ({
    text: String(f.originalText || '').slice(0, 200),
    sentiment: f.sentiment,
    category: f.categoryLabel || f.category,
    cause: f.causeLabel || f.subCategory,
    weight: f.trust ? f.trust.weight : 1
  }));

  const prompt = `Bạn là chuyên gia phân tích trải nghiệm khách hàng.

Phạm vi: ${scope}. Dự báo cho ${horizon}.

LƯU Ý: mỗi phản hồi kèm một "weight" là trọng số tin cậy do tầng kiểm
soát dữ liệu gán (đánh giá nghi ngờ không xác thực đã bị loại từ trước).
Hãy ưu tiên các phản hồi có trọng số cao khi kết luận.

Trả về JSON:
{
  "aiReport": "<3-4 câu phân tích tình hình và rủi ro, dựa trên dữ liệu>",
  "actionableSteps": ["<bước 1>", "<bước 2>", "<bước 3>"],
  "topRisks": [{"name": "<tên rủi ro>", "probability": "Cao|Trung bình|Thấp"}]
}

Dữ liệu (${compact.length} phản hồi hợp lệ):
${JSON.stringify(compact)}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return JSON.parse(stripCodeFence(response.data.choices[0].message.content));
  } catch (error) {
    console.warn('[OPENROUTER] Lỗi generatePrediction, thử GROQ:', error.message);
    try {
      const completion = await getGroq().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: GROQ_MODEL,
        response_format: { type: 'json_object' }
      });
      return JSON.parse(stripCodeFence(completion.choices[0].message.content));
    } catch (fallbackError) {
      console.error('[GROQ] Lỗi fallback generatePrediction:', fallbackError.message);

      // Dự phòng bằng THỐNG KÊ MÔ TẢ trên dữ liệu thật, không bịa câu chữ
      const total = feedbacks.length;
      const negative = feedbacks.filter((f) => f.sentiment === 'Negative');
      const byCause = new Map();
      for (const f of negative) {
        const key = f.causeLabel || f.categoryLabel || 'Chưa phân loại';
        byCause.set(key, (byCause.get(key) || 0) + 1);
      }
      const ranked = [...byCause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

      return {
        aiReport: `(Chế độ dự phòng — thống kê mô tả, không có suy luận của mô hình) Trên ${total} phản hồi hợp lệ, có ${negative.length} phản hồi tiêu cực (${total ? ((negative.length / total) * 100).toFixed(1) : 0}%). Nhóm vấn đề nổi bật nhất: ${ranked.map(([k, v]) => `${k} (${v})`).join(', ') || 'chưa đủ dữ liệu'}.`,
        actionableSteps: ranked.map(([k, v]) => `Rà soát nhóm vấn đề "${k}" — ${v} phản hồi trong kỳ`),
        topRisks: ranked.map(([k, v]) => ({
          name: k,
          probability: v >= 10 ? 'Cao' : v >= 4 ? 'Trung bình' : 'Thấp'
        })),
        degraded: true
      };
    }
  }
}

/** Trợ lý hội thoại trên dữ liệu đã qua Trust Layer */
async function chatWithData(userMessage, feedbacks, context = {}) {
  const funnelNote = context.funnel
    ? `Bối cảnh chất lượng dữ liệu: ${context.funnel.rawCollected} phản hồi thô, ${context.funnel.validForAnalysis} hợp lệ sau khi lọc, điểm sức khỏe dữ liệu ${context.funnel.dataHealthScore}/100.`
    : '';

  const compact = feedbacks.slice(0, 400).map((f) => ({
    text: String(f.originalText || '').slice(0, 160),
    sentiment: f.sentiment,
    category: f.categoryLabel || f.category,
    cause: f.causeLabel || f.subCategory
  }));

  const prompt = `Bạn là trợ lý phân tích của hệ thống Customer Radar.
Xưng "tôi" với người dùng. Trả lời NGẮN GỌN bằng Markdown tiếng Việt.

Bạn đang được cung cấp ${feedbacks.length} phản hồi ĐÃ QUA tầng kiểm soát
tin cậy dữ liệu. Nếu người dùng hỏi có bao nhiêu phản hồi hợp lệ, câu trả
lời là ${feedbacks.length}. ${funnelNote}

Chỉ kết luận dựa trên dữ liệu được cung cấp. Nếu dữ liệu không đủ để trả
lời, hãy nói thẳng là không đủ dữ liệu thay vì suy đoán.

Câu hỏi: "${userMessage}"

Dữ liệu (${compact.length} phản hồi đầu):
${JSON.stringify(compact)}`;

  try {
    const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.warn('[GEMINI] Lỗi chatWithData, thử OPENROUTER:', error.message);
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: OPENROUTER_MODEL, messages: [{ role: 'user', content: prompt }] },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.choices[0].message.content.trim();
    } catch (fallbackError) {
      console.error('[OPENROUTER] Lỗi fallback chatWithData:', fallbackError.message);
      return 'Hiện tôi không kết nối được tới mô hình ngôn ngữ. Các số liệu trên dashboard vẫn chính xác vì chúng được tính bằng thống kê, không phụ thuộc vào mô hình này.';
    }
  }
}

/**
 * Diễn đạt lại cảnh báo thành văn bản tự nhiên.
 * Tầng LLM CHỈ được diễn đạt lại nội dung playbook đã sinh ra — không
 * được thêm dữ kiện hay hành động mới. Nhờ vậy mọi khuyến nghị vẫn truy
 * vết được về quy tắc và bằng chứng đã sinh ra nó.
 */
const generateRiskAlertsBatch = async (alerts) => {
  if (!alerts || alerts.length === 0) return [];

  const playbook = require('./playbook');
  return alerts.map((a) => {
    const rec = playbook.buildRecommendation(a);
    return {
      id: a.id,
      issue: a.causeLabel ? `${a.categoryLabel} — ${a.causeLabel}` : a.categoryLabel,
      riskLevel: (a.severity || 'Medium').toUpperCase(),
      insight: playbook.summarize(a),
      recommendations: rec.steps.map((s) => s.text)
    };
  });
};

module.exports = {
  llmAvailability,
  analyzeFeedbackBatch,
  generatePrediction,
  chatWithData,
  generateRiskAlertsBatch,
  classifyByRulesFallback,
  coerceResult,
  GEMINI_MODEL,
  GROQ_MODEL,
  OPENROUTER_MODEL
};
