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
const { normalize, maskPII, stripHtml } = require('./normalizer');
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

/**
 * Trần thời gian cho MỌI lần gọi mô hình ngôn ngữ. Mặc định của Groq SDK là
 * 10 phút và tự thử lại 2 lần; axios và Gemini SDK không có trần nào. Một nhà
 * cung cấp treo là request /scrape, /chat, /predict/refresh treo theo.
 */
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 45000;

function getGroq() {
  if (!process.env.GROQ_API_KEY) throw new Error('Thiếu GROQ_API_KEY');
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: LLM_TIMEOUT_MS, maxRetries: 1 });
  return _groq;
}

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error('Thiếu GEMINI_API_KEY');
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAI;
}

/** Mô hình Gemini có trần thời gian */
function getGeminiModel() {
  return getGenAI().getGenerativeModel({ model: GEMINI_MODEL }, { timeout: LLM_TIMEOUT_MS });
}

/** Gọi OpenRouter có trần thời gian; thiếu khóa thì báo lỗi ngay thay vì gửi "Bearer undefined" */
async function openRouterChat(body) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Thiếu OPENROUTER_API_KEY');
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', body, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: LLM_TIMEOUT_MS
  });
  return response.data.choices[0].message.content;
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
// Gán nhãn theo lô dùng mô hình nhẹ: nhanh hơn nhiều (~1 giây/lượt so với ~4 giây)
// và có hạn mức miễn phí riêng — gemini-2.5-flash từng hết hạn mức giữa ngày làm
// mọi lô rơi về lớp luật. Đổi bằng GEMINI_LABEL_MODEL nếu Google gỡ mô hình này.
const GEMINI_LABEL_MODEL = process.env.GEMINI_LABEL_MODEL || 'gemini-3.5-flash-lite';
// Một lô treo không được kéo cả lần thu thập: gán nhãn có trần riêng, ngắn hơn
const LABEL_TIMEOUT_MS = Number(process.env.LABEL_TIMEOUT_MS) || 20000;

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

  const NEGATIVE_MARKERS = /(chậm|hỏng|lỗi|tệ|xấu|kém|mất|thiếu|đắt|vỡ|móp|không|chưa|bực|thất vọng|tiêu cực|lag)/;
  const POSITIVE_MARKERS = /(tốt|nhanh|đẹp|hài lòng|tuyệt|ưng|cẩn thận|nhiệt tình|đáng tiền|tích cực|ổn|ngon|xịn|thân thiện|dễ thương|(?<!mất |bất )lịch sự|chuyên nghiệp|chu đáo|chắc chắn)/;
  // Lời chê bị phủ định là lời khen: "hàng không lỗi", "chẳng bị móp gì".
  // Thay cụm đó bằng "ổn" trước khi chấm, để chữ "lỗi"/"không" trong cụm
  // không kéo cả câu thành Tiêu cực.
  const NEGATED_NEGATIVE = /(?:không|chẳng|chả|đâu có)\s+(?:(?:bị|có|hề|thấy)\s+)*(?:chậm|hỏng|lỗi|tệ|xấu|kém|mất|thiếu|đắt|vỡ|móp|bực|thất vọng|lag|treo|đơ|trễ|sai|nhầm|rách|ướt)(?:\s+(?:gì|nào|cả|đâu|chút nào|tí nào))*/g;
  // Từ khen bị phủ định là lời chê: "không tốt", "chẳng đẹp", "chưa hài lòng".
  // Bản cũ thấy chữ "tốt" là gán Tích cực, kể cả trong "sản phẩm không tốt".
  const NEGATED_POSITIVE = /(?:không|chẳng|chả|chưa|hổng|đâu có)\s+(?:(?:được|có|hề|quá|lắm|thấy|mấy)\s+)?(?:tốt|nhanh|đẹp|hài lòng|tuyệt|ưng|cẩn thận|nhiệt tình|đáng tiền|ổn|ngon|xịn|thân thiện)/;

  const normText = norm.normalized.replace(NEGATED_NEGATIVE, ' ổn ');
  let sentiment = 'Neutral';
  if (matches.length > 0 || NEGATIVE_MARKERS.test(normText) || NEGATED_POSITIVE.test(normText)) sentiment = 'Negative';
  if (POSITIVE_MARKERS.test(normText) && matches.length === 0 && !NEGATED_POSITIVE.test(normText)) sentiment = 'Positive';

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

  // Nhãn ngoài taxonomy => quay về lớp luật, không nhận bừa. Nhưng mô hình
  // trả ĐÚNG "Other" nghĩa là nó đã đọc và kết luận "không có khiếu nại" —
  // đó là câu trả lời hợp lệ, không được thay bằng lớp luật
  const explicitOther = String(raw.category || '').trim().toLowerCase() === 'other';
  if (category === 'Other' && !cause && !explicitOther) {
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
/** Đầu vào nhận chuỗi (kiểu cũ) hoặc {text, rating}: số sao là tín hiệu mạnh nhất để nhận ra mỉa mai */
const toItem = (r) =>
  typeof r === 'string'
    ? { text: r, rating: null }
    : { text: String(r?.text ?? r?.rawText ?? ''), rating: Number.isFinite(Number(r?.rating)) && r?.rating != null ? Number(r.rating) : null };

const analyzeFeedbackBatch = async (reviewsInput) => {
  if (!Array.isArray(reviewsInput) || reviewsInput.length === 0) return [];
  const reviewsArray = reviewsInput.map(toItem);

  const viaModel = await visobert.predictAnalysis(reviewsArray.map((r) => r.text), reviewsArray.map((r) => r.rating));
  if (viaModel) return viaModel;

  // Chia lô: một prompt chứa vài trăm bình luận dễ vượt giới hạn token, và
  // khi đó CẢ lô rơi về lớp luật. Lô nhỏ thì lỗi chỉ ảnh hưởng một phần.
  // Các lô chạy song song (tối đa LLM_CONCURRENCY cùng lúc): chạy lần lượt
  // thì 50 bình luận mất gần 2 phút, quá lâu cho một lần đồng bộ
  const chunks = [];
  for (let i = 0; i < reviewsArray.length; i += LLM_BATCH_SIZE) chunks.push(reviewsArray.slice(i, i + LLM_BATCH_SIZE));
  const results = new Array(chunks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, chunks.length) }, async () => {
    while (next < chunks.length) {
      const k = next++;
      results[k] = await analyzeChunkWithLLM(chunks[k]);
    }
  }));
  return results.flat();
};

// 10 bình luận mỗi lượt: lô 40 làm đầu ra JSON dài vượt giới hạn và bị cắt
// cụt giữa chừng ("Unterminated string in JSON") — cả lô rơi về lớp luật
const LLM_BATCH_SIZE = 10;

// Ranh giới mỉa mai, dùng chung cho mô hình gán nhãn chính và mô hình thứ hai.
// Trên dữ liệu thật, câu "khen nhưng chê" và câu 5 sao mà chê thẳng nhiều hơn
// mỉa mai thật rất nhiều; gộp chúng vào làm cờ mỉa mai mất nghĩa.
const SARCASM_NOT = `KHÔNG phải mỉa mai (vẫn gán sentiment/category theo nội dung, nhưng "sarcasm": false):
- câu vừa khen thật vừa chê thật, thường có "nhưng", "mỗi tội", "có điều": "đẹp nhưng bị xước";
- câu chê thẳng mà vẫn cho 4-5 sao (nhiều người quen cho sao cao);
- câu chỉ chê hoặc chỉ hỏi, không có lời khen nào.
Chỉ là mỉa mai khi lời khen KHÔNG thật lòng: người viết nói ngược ý mình.`;
// Trang web cần nhanh (5 lô song song, không chờ); bộ thu thập hàng loạt chạy
// hàng trăm lô nên đặt LLM_CONCURRENCY=1, LLM_MIN_INTERVAL_MS và LLM_RETRY_429
// để nằm trong hạn mức miễn phí (Gemini 15 lượt/phút, Groq 8.000 token/phút)
const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY) || 5;
const LLM_MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS) || 0;
const LLM_RETRY_429 = Number(process.env.LLM_RETRY_429) || 0;

let nextLlmSlotAt = 0;
/** Giãn cách tối thiểu giữa hai lượt gọi mô hình (dùng chung cho mọi lô) */
async function waitForLlmSlot() {
  if (!LLM_MIN_INTERVAL_MS) return;
  const now = Date.now();
  const at = Math.max(now, nextLlmSlotAt);
  nextLlmSlotAt = at + LLM_MIN_INTERVAL_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** Lỗi 429 -> số mili giây nên chờ (đọc "retry in 31.1s" / "try again in 13.2s"); lỗi khác -> null */
function rateLimitDelayMs(error) {
  const msg = String(error?.message || '');
  if (!/429|quota|rate limit/i.test(msg)) return null;
  const m = msg.match(/(?:retry in|try again in)\s*([\d.]+)\s*s/i);
  return Math.min(90000, Math.ceil((m ? Number(m[1]) : 20) * 1000) + 1000);
}

async function analyzeChunkWithLLM(items) {
  const reviewsArray = items.map((r) => r.text);
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    return reviewsArray.map((text) => classifyByRulesFallback(text));
  }

  // Che PII TRƯỚC khi văn bản rời khỏi tiến trình. Bản cũ gửi nguyên văn
  // (kèm số điện thoại, email, mã đơn) sang Groq — trái với chính nguyên tắc
  // "PII không bao giờ chạm tới mô hình" ở normalizer.js.
  const maskedReviews = items.map((r) => ({ text: maskPII(stripHtml(r.text)).text, rating: r.rating }));

  const prompt = `Bạn là hệ thống gán nhãn phản hồi khách hàng tiếng Việt cho sàn thương mại điện tử.

TAXONOMY BẮT BUỘC (chỉ được dùng đúng các mã dưới đây, không tự tạo mã mới):
${taxonomyPrompt()}

QUY TẮC PHÂN NHÁNH QUAN TRỌNG: hư hỏng trong quá trình vận chuyển thuộc
nhánh Delivery (DamagedInTransit), KHÔNG thuộc ProductQuality — vì bộ
phận chịu trách nhiệm khắc phục là khâu vận chuyển.

TAXONOMY CHỈ GỒM NGUYÊN NHÂN KHIẾU NẠI. Chỉ ghi category/subCategory khi
bình luận PHÀN NÀN về vấn đề đó. Bình luận chỉ khen, không chê điều gì thì
category = "Other" và subCategory = null. Bình luận vừa khen vừa chê thì
ghi vấn đề bị chê.

MỈA MAI: mỗi bình luận đi kèm "rating" (số sao 1-5, hoặc null). Người Việt
hay dùng lời khen để chê: "giao nhanh ghê, đặt mùng 1 mà 15 mới tới",
"chất lượng tuyệt vời, dùng 2 hôm là hỏng", "cảm ơn shop đã gửi nhầm màu".
Dấu hiệu: lời khen đi cùng một sự việc tiêu cực cụ thể, số sao thấp mà chữ
khen, từ "ghê", "quá trời", "đúng là", biểu tượng 🙂👏, câu hỏi tu từ.
Khi là mỉa mai: sentiment theo Ý THẬT (thường là "Negative"), category và
subCategory theo vấn đề THẬT bị chê, và đặt "sarcasm": true. Không phải mỉa
mai thì "sarcasm": false.
${SARCASM_NOT} Số sao chỉ là gợi ý, không tự quyết: 1 sao mà nội
dung khen thật lòng (ví dụ chọn nhầm sao) thì vẫn là "Positive".

Với MỖI bình luận trong mảng đầu vào, trả về một đối tượng JSON:
{
  "category": "<một mã Level 1 ở trên, hoặc 'Other'>",
  "subCategory": "<một mã Level 2 thuộc đúng category đó, hoặc null>",
  "sentiment": "Positive" | "Negative" | "Neutral",
  "sarcasm": true | false,
  "aspects": [{"aspect": "<khía cạnh được nhắc tới>", "polarity": "Positive|Negative|Neutral"}],
  "entities": {"branch": <chi nhánh hoặc null>, "product": <sản phẩm hoặc null>, "orderId": <mã đơn hoặc null>, "courier": <đơn vị vận chuyển hoặc null>},
  "aiSummary": "<một câu tóm tắt>"
}

Trường "aspects" là đầu ra phân tích cảm xúc theo khía cạnh; trường
"entities" là đầu ra nhận diện thực thể. KHÔNG trộn hai loại này vào nhau.
Một câu có thể chứa nhiều khía cạnh TRÁI DẤU — hãy tách đủ.

Trả về DUY NHẤT một đối tượng JSON dạng {"results": [ ... ]}, mảng results có
đúng ${maskedReviews.length} phần tử theo đúng thứ tự đầu vào, không kèm giải thích.

Dữ liệu:
${JSON.stringify(maskedReviews)}`;

  // Thử lần lượt từng nhà cung cấp có khóa; cả hai lỗi mới lùi về lớp luật.
  // Gemini đứng trước: Groq gói miễn phí giới hạn 8.000 token/phút, các lô
  // chạy song song bị chặn (429) và phải chờ — một lần đồng bộ mất gần 1 phút
  const attempts = [];
  if (process.env.GEMINI_API_KEY) {
    attempts.push(['GEMINI', async () => (await getGenAI()
      .getGenerativeModel({ model: GEMINI_LABEL_MODEL, generationConfig: { responseMimeType: 'application/json' } }, { timeout: LABEL_TIMEOUT_MS })
      .generateContent(prompt)).response.text()]);
  }

  if (process.env.GROQ_API_KEY) {
    attempts.push(['GROQ', async () => (await getGroq().chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 8192
    })).choices[0].message.content]);
  }
  for (const [name, call] of attempts) {
    for (let retry = 0; ; retry++) {
      try {
        await waitForLlmSlot();
        const parsed = JSON.parse(stripCodeFence(await call()));
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.results) ? parsed.results : Object.values(parsed || {}).find((v) => Array.isArray(v)) || [];
        if (arr.length === 0) throw new Error('mô hình trả về mảng rỗng');
        return reviewsArray.map((text, i) => {
          const r = coerceResult(arr[i], text);
          // Mô hình đã thấy số sao và tự kết luận có mỉa mai hay không
          if (r.labelledBy === 'llm') r.sarcasm = arr[i]?.sarcasm === true;
          return r;
        });
      } catch (error) {
        // Bị giới hạn tốc độ (429): khi thu thập hàng loạt thì chờ đúng thời gian
        // nhà cung cấp yêu cầu rồi thử lại, thay vì để cả lô rơi về lớp luật
        const wait = rateLimitDelayMs(error);
        if (wait !== null && retry < LLM_RETRY_429) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        console.error(`[${name}] Lỗi gán nhãn lô ${reviewsArray.length} bình luận:`, error.message);
        break;
      }
    }
  }
  // Lớp luật, KHÔNG phải nhãn ngẫu nhiên
  return reviewsArray.map((text) => classifyByRulesFallback(text));
}

/**
 * GIÁM KHẢO MỈA MAI — ý kiến THỨ HAI cho những câu bị nghi mỉa mai.
 * Chạy bằng mô hình KHÁC mô hình gán nhãn chính (ưu tiên Groq, rồi mới tới
 * Gemini), để hai phiếu không cùng một điểm mù. Prompt chỉ làm một việc: đọc
 * câu + số sao + nhãn đang có, quyết định có mỉa mai không và ý thật là gì.
 *
 * @param {Array<{text, rating, primary: {sentiment, category, subCategory}}>} items
 * @returns {Promise<Array<{sarcastic, sentiment, category, subCategory, reason, by}>|null>}
 */
async function judgeSarcasm(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return null;
  const out = [];
  for (let i = 0; i < items.length; i += LLM_BATCH_SIZE) {
    const chunk = items.slice(i, i + LLM_BATCH_SIZE);
    const data = chunk.map((it) => ({
      text: maskPII(stripHtml(it.text)).text,
      rating: Number.isFinite(it.rating) ? it.rating : null,
      currentLabel: { sentiment: it.primary?.sentiment, category: it.primary?.category, subCategory: it.primary?.subCategory }
    }));
    const prompt = `Bạn là người kiểm tra lại nhãn cho đánh giá khách hàng tiếng Việt trên sàn thương mại điện tử.
Các câu dưới đây bị NGHI là mỉa mai (dùng lời khen để chê). Với mỗi câu, đọc nội dung,
số sao ("rating", 1-5 hoặc null) và nhãn hiện tại, rồi quyết định:
- "sarcastic": true nếu người viết đang mỉa mai, false nếu khen/chê thật lòng.
- "sentiment": cảm xúc THẬT của người viết: "Positive" | "Negative" | "Neutral".
- "category" và "subCategory": vấn đề THẬT bị chê theo taxonomy, hoặc "Other"/null nếu không chê gì.
- "reason": một câu ngắn giải thích.
Số sao chỉ là gợi ý: 1 sao mà nội dung khen thật lòng thì vẫn là "Positive".
${SARCASM_NOT}

TAXONOMY:
${taxonomyPrompt()}

Trả về DUY NHẤT một đối tượng JSON dạng {"results": [...]}, mảng results có đúng ${data.length} phần tử theo đúng thứ tự.

Dữ liệu:
${JSON.stringify(data)}`;

    const attempts = [];
    if (process.env.GROQ_API_KEY) {
      attempts.push(['groq', async () => (await getGroq().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 4096
      })).choices[0].message.content]);
    }
    if (process.env.GEMINI_API_KEY) {
      attempts.push(['gemini', async () => (await getGenAI()
        .getGenerativeModel({ model: GEMINI_LABEL_MODEL, generationConfig: { responseMimeType: 'application/json' } }, { timeout: LABEL_TIMEOUT_MS })
        .generateContent(prompt)).response.text()]);
    }

    let got = null;
    for (const [by, call] of attempts) {
      for (let retry = 0; ; retry++) {
        try {
          await waitForLlmSlot();
          const parsed = JSON.parse(stripCodeFence(await call()));
          const arr = Array.isArray(parsed) ? parsed : parsed?.results;
          if (!Array.isArray(arr) || arr.length !== chunk.length) throw new Error('số kết quả không khớp');
          got = arr.map((r) => {
            const category = taxonomy.normalizeCategory(r?.category);
            return {
              sarcastic: r?.sarcastic === true,
              sentiment: ['Positive', 'Negative', 'Neutral'].includes(r?.sentiment) ? r.sentiment : null,
              category,
              subCategory: taxonomy.normalizeCause(category, r?.subCategory),
              reason: String(r?.reason || '').slice(0, 200) || null,
              by
            };
          });
          break;
        } catch (error) {
          const wait = rateLimitDelayMs(error);
          if (wait !== null && retry < LLM_RETRY_429) {
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          console.warn(`[JUDGE/${by}] Lỗi kiểm tra mỉa mai:`, error.message);
          break;
        }
      }
      if (got) break;
    }
    // Lô nào hỏng thì để trống phiếu thứ hai cho lô đó — tầng trên đẩy sang người duyệt
    out.push(...(got || chunk.map(() => null)));
  }
  return out;
}

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
    // PII không rời tiến trình, kể cả khi gửi đi để dự báo
    text: maskPII(f.originalText).text.slice(0, 200),
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
    const content = await openRouterChat({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });
    return JSON.parse(stripCodeFence(content));
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
    text: maskPII(f.originalText).text.slice(0, 160),
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
    const result = await getGeminiModel().generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.warn('[GEMINI] Lỗi chatWithData, thử OPENROUTER:', error.message);
    try {
      const content = await openRouterChat({ model: OPENROUTER_MODEL, messages: [{ role: 'user', content: prompt }] });
      return content.trim();
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
      issue: require('./wording').issueTitle(a.categoryLabel, a.causeLabel),
      riskLevel: (a.severity || 'Medium').toUpperCase(),
      insight: playbook.summarize(a),
      recommendations: rec.steps.map((s) => s.text)
    };
  });
};

module.exports = {
  llmAvailability,
  analyzeFeedbackBatch,
  judgeSarcasm,
  generatePrediction,
  chatWithData,
  generateRiskAlertsBatch,
  classifyByRulesFallback,
  coerceResult,
  GEMINI_MODEL,
  GROQ_MODEL,
  OPENROUTER_MODEL,
  LLM_TIMEOUT_MS,
  getGeminiModel,
  openRouterChat
};
