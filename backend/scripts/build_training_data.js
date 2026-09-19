/**
 * DỰNG TẬP HUẤN LUYỆN CHUYÊN NGÀNH CHO VISOBERT
 * ==================================================================
 * Chạy trong backend/:
 *   npm run nlp:build                       (có diễn đạt lại bằng LLM nếu có GROQ_API_KEY)
 *   npm run nlp:build -- --no-paraphrase    (chỉ dùng khung câu)
 *
 * NGUỒN GỐC NHÃN — ghi thẳng vào manifest và phải nêu khi báo cáo:
 *   Nhãn của tập này KHÔNG do người gán trên phản hồi thật. Câu được sinh
 *   từ khung câu trong data/corpus.js, nên nhãn đúng theo cấu trúc sinh;
 *   một phần được mô hình ngôn ngữ lớn diễn đạt lại để tăng độ đa dạng.
 *   Nhãn cảm xúc do người gán lấy từ UIT-ViSFD (tệp riêng).
 *
 * CHỐNG RÒ RỈ, hai lớp:
 *   1. Khung câu nào sinh ra được câu trùng mặt chữ với BẤT KỲ câu nào
 *      trong tập chuẩn (Jaccard token >= 0.4) bị loại cả khung. Nhiều câu
 *      trong tập chuẩn được viết gần giống khung câu, nên lọc từng câu sinh
 *      ra là không đủ — biến thể khác của cùng khung vẫn mang đáp án.
 *   2. Từng câu sinh ra (kể cả câu LLM viết lại) bị lọc lại với cùng ngưỡng.
 *   LLM chỉ nhận khung câu huấn luyện đã qua lớp 1, không bao giờ nhận câu
 *   của tập chuẩn. Không loại trừ được trùng Ý NGHĨA ngẫu nhiên; con số đo
 *   trên tập kiểm tra vì vậy vẫn phải được đọc kèm giới hạn này.
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const corpus = require('../data/corpus');
const taxonomy = require('../services/taxonomy');
const { ASPECT_GOLD, TRUST_GOLD } = require('../evaluation/gold_dataset');
const { toRow, writeJsonl, DATA_DIR } = require('./prepare_nlp_data');
const { INPUT_MODES } = require('../services/visobert_client');

const LEAK_JACCARD = 0.4;
const CACHE_PATH = path.join(DATA_DIR, 'paraphrase_cache.json');
// Groq gỡ llama-3.3-70b-versatile khỏi danh sách model; đổi bằng --model nếu cần
let PARAPHRASE_MODEL = 'openai/gpt-oss-120b';
const PARAPHRASES_PER_TEMPLATE = 12;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return args;
}

// ------------------------------------------------------------------
// Đo trùng lặp với tập chuẩn
// ------------------------------------------------------------------

const tokens = (s) => String(s).toLowerCase().replace(/[.,!?;:()"'…]/g, ' ').split(/\s+/).filter(Boolean);

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/**
 * Câu trình diễn trên màn hình Phòng thí nghiệm (src/components/lab/PipelineDemo.jsx).
 * Được lọc như tập chuẩn: nếu mô hình học trúng câu demo thì màn hình demo
 * chứng minh được việc học thuộc, không chứng minh được việc hiểu.
 * Sửa câu demo ở giao diện thì phải sửa cả danh sách này.
 */
const DEMO_SENTENCES = [
  'mua cục sạc dự phòng xài chưa tới tuần đã phồng lên, cầm nóng ran',
  'shipper dth thương mà hàng móp méo quá sốp ơi, app thì lag, thanh toán toàn báo lỗi',
  'Không hề bị móp méo gì như mọi người nói, hàng về nguyên vẹn',
  'Cần tuyển CTV bán hàng sỉ lẻ toàn quốc, hoa hồng cao, ib mình 0912345678 nhé',
  'đặt hàng 2 tuần r mà vẫn chưa thấy đâu, nhắn shop k ai rep',
  'Giao nhanh ghê, đặt có nửa tháng là tới rồi, cảm ơn shop nha'
];

const GOLD_TOKENS = [...ASPECT_GOLD.map((g) => g.text), ...TRUST_GOLD.map((g) => g.text), ...DEMO_SENTENCES].map(tokens);

function maxGoldSimilarity(text) {
  const t = tokens(text);
  let best = 0;
  for (const g of GOLD_TOKENS) best = Math.max(best, jaccard(t, g));
  return best;
}

// ------------------------------------------------------------------
// Sinh câu (cùng quy tắc với data/generator.js)
// ------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1))
  };
}

/**
 * Ô trống riêng cho câu MỈA MAI và câu khen đối chứng. Mỉa mai tiếng Việt
 * trên sàn TMĐT thường là: chữ khen + một sự thật trái ngược ("giao nhanh
 * ghê, 2 tuần mới tới"). Thứ phân biệt nó với lời khen thật là SỰ THẬT đi
 * kèm (thời gian chờ dài / ngắn), không phải từ cảm thán — nên cả hai loại
 * câu dùng CHUNG các từ cảm thán `wow`, để mô hình không học được lối tắt
 * "thấy 'ghê' là chê".
 */
const SARCASM_SLOTS = {
  longWait: ['nửa tháng', 'hai tuần', '2 tuần', 'mười mấy ngày', 'gần một tháng', 'đúng 13 ngày', 'hơn 10 ngày'],
  shortLife: ['hai hôm', '3 ngày', 'chưa được một tuần', 'đúng một buổi', 'mới vài lần'],
  shortWait: ['hôm qua', 'sáng nay', 'chưa tới 24 tiếng', 'đúng một ngày', 'tối qua'],
  wow: ['ghê', 'dữ thần', 'quá trời', 'thật sự', 'luôn á', 'hết nấc'],
  thanks: ['', ', cảm ơn shop nha', ', tuyệt vời', ' 👏👏', ', ưng dữ chưa', ', 10 điểm']
};

function fillTemplate(rng, template) {
  return template
    .replace(/\{(\w+)\}/g, (whole, k) => {
      if (k === 'phone') return '0' + rng.int(300000000, 989999999);
      const pool = corpus.SLOTS[k] || SARCASM_SLOTS[k];
      return pool ? rng.pick(pool) : whole;
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

/** Câu mỉa mai: bề mặt là lời khen, nghĩa thật là khiếu nại thuộc nguyên nhân tương ứng */
const SARCASM_TEMPLATES = {
  LateDelivery: [
    'Tốc độ giao {wow}, {longWait} mới cầm được hàng{thanks}',
    'Shop giao hỏa tốc thật, chờ có {longWait} thôi à{thanks}',
    'Nhanh như tên lửa, {longWait} shipper mới gọi{thanks}',
    'Đặt đầu tháng, cuối tháng nhận, nhanh {wow}{thanks}'
  ],
  TechnicalDefect: [
    'Bền {wow}, xài {shortLife} là tèo luôn{thanks}',
    'Hàng xịn thật sự, dùng {shortLife} đã không lên nguồn{thanks}',
    'Ổn áp {wow}, mới {shortLife} đã chập chờn{thanks}'
  ],
  DamagedInTransit: [
    'Đóng gói cẩn thận {wow}, mở ra hộp méo như lon bia{thanks}',
    'Shipper nâng niu hàng lắm, tới tay thì vỡ làm đôi{thanks}'
  ],
  SlowResponse: [
    'Shop phản hồi nhanh {wow}, nhắn {longWait} vẫn im re{thanks}',
    'Chăm sóc chu đáo {wow}, gọi hoài không ai bắt máy{thanks}'
  ],
  BadAttitude: ['Nhân viên dễ thương {wow}, hỏi câu nào gắt câu đó{thanks}'],
  NotAsDescribed: ['Giống hình y chang {wow}, chỉ khác màu với khác size thôi{thanks}'],
  MissingAccessory: ['Quà tặng kèm đầy đủ {wow}, mở hộp ra trống trơn{thanks}'],
  SlowRefund: [
    'Hoàn tiền thần kỳ {wow}, {longWait} rồi chưa thấy đồng nào{thanks}',
    'Tiền hoàn về lẹ {wow}, chờ {longWait} tài khoản vẫn y nguyên số cũ{thanks}'
  ],
  HigherThanExpected: ['Giá mềm {wow}, đắt gấp đôi chỗ khác thôi{thanks}'],
  AppSlowOrCrash: ['App mượt {wow}, bấm một cái đứng hình nguyên phút{thanks}'],
  WrongPromotion: ['Mã giảm giá xịn {wow}, nhập vào giảm được đúng 0 đồng{thanks}'],
  CourierAttitude: ['Shipper nhiệt tình {wow}, quăng hàng qua cổng rồi chạy mất{thanks}']
};

/** Đối chứng: lời khen THẬT dùng cùng từ cảm thán, kèm sự thật khớp với lời khen */
const POSITIVE_SLANG_TEMPLATES = [
  'Giao nhanh {wow}, đặt {shortWait} mà giờ có hàng rồi{thanks}',
  // Đối chứng trực tiếp cho câu mỉa mai về tốc độ giao: cùng lời khen, nhưng thời gian THẬT SỰ ngắn
  'Ship lẹ {wow}, mới {shortWait} mà hàng đã nằm trên tay{thanks}',
  'Vận chuyển siêu tốc {wow}, {shortWait} là nhận được luôn{thanks}',
  'Đẹp {wow}, y hình luôn{thanks}',
  'Xài {longWait} rồi vẫn ngon lành, bền {wow}{thanks}',
  'Shop rep nhanh {wow}, hỏi cái trả lời liền{thanks}',
  'Đóng gói kỹ {wow}, hộp không móp tí nào{thanks}',
  'Giá hời {wow}, rẻ hơn chỗ khác mà chất lượng y chang{thanks}'
];

function toTeencode(rng, text) {
  let out = text.toLowerCase();
  for (const [re, rep] of corpus.TEENCODE_MAP) {
    if (rng.bool(0.6)) out = out.replace(re, rep);
  }
  return out;
}

/** Khung câu có sinh ra được câu trùng tập chuẩn không (thử nhiều cách điền ô trống) */
function templateMaxLeak(template, seed) {
  const rng = makeRng(seed);
  let best = 0;
  for (let n = 0; n < 40; n++) best = Math.max(best, maxGoldSimilarity(fillTemplate(rng, template)));
  return best;
}

// ------------------------------------------------------------------
// Các nhóm câu và nhãn tương ứng
// ------------------------------------------------------------------

function causeCategory(cause) {
  return taxonomy.CATEGORY_KEYS.find((c) => taxonomy.TAXONOMY[c].causes[cause]);
}

function buildGroups() {
  const groups = Object.entries(corpus.COMPLAINT_TEMPLATES).map(([cause, templates]) => {
    const category = causeCategory(cause);
    return {
      id: cause,
      templates,
      labels: { sentiment: 'Negative', category, cause, spam: false },
      meaning: `khiếu nại thuộc nhóm "${taxonomy.categoryLabel(category)}", nguyên nhân cụ thể là "${taxonomy.causeLabel(category, cause)}"`
    };
  });
  groups.push({
    id: '__POSITIVE', templates: corpus.POSITIVE_TEMPLATES,
    labels: { sentiment: 'Positive', category: null, cause: null, spam: false },
    meaning: 'lời khen, khách hài lòng, không phàn nàn điều gì'
  });
  groups.push({
    id: '__NEUTRAL', templates: corpus.NEUTRAL_TEMPLATES,
    labels: { sentiment: 'Neutral', category: null, cause: null, spam: false },
    meaning: 'nhận xét trung tính, không khen cũng không chê rõ ràng, không nêu vấn đề nào'
  });
  for (const [cause, templates] of Object.entries(SARCASM_TEMPLATES)) {
    const category = causeCategory(cause);
    groups.push({
      id: `__SARCASM_${cause}`,
      templates,
      target: 'sarcasm',
      labels: { sentiment: 'Negative', category, cause, spam: false },
      meaning: `câu MỈA MAI: bề mặt dùng lời khen nhưng nghĩa thật là khiếu nại "${taxonomy.categoryLabel(category)}", nguyên nhân "${taxonomy.causeLabel(category, cause)}". BẮT BUỘC giữ giọng mỉa mai (khen ngoài miệng, sự thật đi kèm thì tệ); không được viết thành lời chê thẳng`
    });
  }
  groups.push({
    id: '__POSITIVE_SLANG', templates: POSITIVE_SLANG_TEMPLATES, target: 'positiveSlang',
    labels: { sentiment: 'Positive', category: null, cause: null, spam: false },
    meaning: 'lời khen THẬT LÒNG bằng văn nói mạng xã hội (ghê, dữ thần, quá trời…); sự thật đi kèm phải KHỚP với lời khen, không được mỉa mai'
  });
  groups.push({
    id: '__AD', templates: corpus.AD_TEMPLATES,
    labels: { category: null, cause: null, spam: true },
    meaning: 'bình luận rác quảng cáo hoặc rao vặt, có lời mời nhắn tin hoặc liên hệ; giữ nguyên chuỗi {phone} nếu câu gốc có'
  });
  return groups;
}

/**
 * CÂU NHIỀU VẤN ĐỀ — phần quan trọng nhất của tập này.
 *
 * Luận điểm của đề tài là "một phản hồi thường chứa nhiều vấn đề, CRM hiện
 * tại chỉ chấm cảm xúc toàn câu". Nếu mọi câu huấn luyện chỉ mang một nhãn
 * thì mô hình không bao giờ học được cách nêu hai vấn đề — và luận điểm đó
 * tự sụp. Vì vậy một phần tập được ghép từ hai tới ba khung câu thuộc các
 * DANH MỤC KHÁC NHAU, giữ đủ nhãn của từng phần.
 */
const CONNECTORS = [', ', ', với lại ', ', thêm nữa ', ', ngoài ra ', ', rồi ', '. ', ', mà ', ' và '];
const CONTRAST = [' nhưng ', ' mà ', ', tiếc là ', ', chỉ tội ', ' nhưng mà '];

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Một câu bất kỳ của nhóm: khung câu gốc hoặc bản LLM diễn đạt lại */
function sampleSentence(rng, group, keptByGroup, cache) {
  const templates = keptByGroup[group.id];
  const paraphrases = templates.flatMap((t) => cache[t] || []);
  const useLLM = paraphrases.length && (!templates.length || rng.bool(0.5));
  return fillTemplate(rng, useLLM ? rng.pick(paraphrases) : rng.pick(templates));
}

function joinParts(rng, parts) {
  return parts.reduce((acc, part, i) => (i === 0 ? part : acc + rng.pick(CONNECTORS) + lowerFirst(part)));
}

// ------------------------------------------------------------------
// Diễn đạt lại bằng LLM, có bộ đệm để chạy lại không tốn lượt gọi
// ------------------------------------------------------------------

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function paraphraseTemplate(groq, rng, group, template) {
  const examples = [0, 1, 2].map(() => fillTemplate(rng, template));
  const prompt = `Bạn tạo dữ liệu huấn luyện cho bộ phân loại phản hồi khách hàng thương mại điện tử tiếng Việt.

Ý nghĩa bắt buộc giữ nguyên: ${group.meaning}.

Ba câu mẫu cùng ý:
${examples.map((e) => '- ' + e).join('\n')}

Hãy viết ${PARAPHRASES_PER_TEMPLATE} câu KHÁC NHAU cùng ý nghĩa trên. Yêu cầu:
- Đổi từ ngữ và cấu trúc câu thật sự, không chỉ thay một hai từ.
- Văn phong tự nhiên như bình luận trên sàn TMĐT; khoảng 1/3 số câu viết tắt hoặc teencode.
- Độ dài đa dạng, từ 5 đến 35 từ.
- Không nhắc thêm vấn đề thuộc nhóm khác.
Trả về DUY NHẤT một mảng JSON các chuỗi, không giải thích.`;

  const completion = await groq.chat.completions.create({
    model: PARAPHRASE_MODEL,
    temperature: 0.9,
    messages: [{ role: 'user', content: prompt }]
  });
  const raw = completion.choices[0].message.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const arr = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  return arr.filter((s) => typeof s === 'string' && s.trim().length >= 8 && s.length <= 300).map((s) => s.trim());
}

async function collectParaphrases(groups, keptByGroup, enabled, seed) {
  const cache = loadCache();
  const stats = { enabled, model: PARAPHRASE_MODEL, called: 0, fromCache: 0, failed: 0 };
  if (!enabled) return { cache: {}, stats };

  let groq = null;
  if (process.env.GROQ_API_KEY) {
    const Groq = require('groq-sdk');
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  const rng = makeRng(seed + 1);
  for (const group of groups) {
    for (const template of keptByGroup[group.id]) {
      if (Array.isArray(cache[template]) && cache[template].length) {
        stats.fromCache++;
        continue;
      }
      if (!groq) {
        stats.failed++;
        continue;
      }
      try {
        cache[template] = await paraphraseTemplate(groq, rng, group, template);
        stats.called++;
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
        process.stdout.write(`  diễn đạt lại ${stats.called + stats.fromCache}: ${group.id} (+${cache[template].length})\n`);
      } catch (e) {
        stats.failed++;
        console.warn(`  [LLM] bỏ qua một khung của ${group.id}: ${e.message.slice(0, 120)}`);
      }
    }
  }
  if (!groq) stats.note = 'Thiếu GROQ_API_KEY — chỉ dùng được phần đã có trong bộ đệm';
  return { cache, stats };
}

// ------------------------------------------------------------------
// Điều phối
// ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.model === 'string') PARAPHRASE_MODEL = args.model;
  const seed = Number(args.seed) || 2026;
  const envMode = process.env.VISOBERT_INPUT_MODE;
  const mode = args['input-mode'] || (INPUT_MODES.includes(envMode) ? envMode : 'masked');
  const targets = {
    complaint: Number(args['per-cause']) || 140,
    __POSITIVE: Number(args.positive) || 900,
    // Trung tính cần nhiều hơn trước: 2.000 câu ghép/khen-chê thêm vào đều là
    // Tiêu cực, làm lớp Trung tính bị nhấn chìm (đo được F1 = 0 trên tập kiểm tra)
    __NEUTRAL: Number(args.neutral) || 1100,
    __AD: Number(args.ads) || 300,
    // Cho phép truyền 0 để tắt hẳn nhóm này (dựng lại dữ liệu của checkpoint v2)
    sarcasm: args.sarcasm !== undefined ? Number(args.sarcasm) : 70,
    positiveSlang: args['positive-slang'] !== undefined ? Number(args['positive-slang']) : 450
  };

  const groups = buildGroups();

  // Lớp chống rò rỉ 1: loại cả khung câu
  const keptByGroup = {};
  const droppedTemplates = [];
  let seedOffset = 0;
  for (const g of groups) {
    keptByGroup[g.id] = [];
    for (const t of g.templates) {
      const leak = templateMaxLeak(t, seed + ++seedOffset);
      if (leak >= LEAK_JACCARD) droppedTemplates.push({ group: g.id, template: t, maxGoldJaccard: Number(leak.toFixed(2)) });
      else keptByGroup[g.id].push(t);
    }
  }
  const totalTemplates = groups.reduce((s, g) => s + g.templates.length, 0);
  console.log(`Khung câu: giữ ${totalTemplates - droppedTemplates.length}/${totalTemplates}, loại ${droppedTemplates.length} vì trùng tập chuẩn`);

  const { cache, stats } = await collectParaphrases(groups, keptByGroup, !args['no-paraphrase'], seed);

  // Sinh câu và lớp chống rò rỉ 2
  const rng = makeRng(seed + 99);
  const seen = new Set();
  const rows = [];
  const counts = {};
  let droppedForLeak = 0;

  for (const g of groups) {
    const target = g.target ? targets[g.target] : g.id.startsWith('__') ? targets[g.id] : targets.complaint;
    const templates = keptByGroup[g.id];
    const paraphrases = templates.flatMap((t) => cache[t] || []);
    let made = 0;
    let fromLLM = 0;
    let attempts = 0;
    while (made < target && attempts < target * 25 && (templates.length || paraphrases.length)) {
      attempts++;
      const useLLM = paraphrases.length && (!templates.length || rng.bool(0.5));
      let text = fillTemplate(rng, useLLM ? rng.pick(paraphrases) : rng.pick(templates));
      if (rng.bool(0.18)) text = toTeencode(rng, text);
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      if (maxGoldSimilarity(text) >= LEAK_JACCARD) {
        droppedForLeak++;
        continue;
      }
      seen.add(key);
      rows.push(toRow({ text, ...g.labels }, mode));
      made++;
      if (useLLM) fromLLM++;
    }
    counts[g.id] = { rows: made, fromLLM, templatesKept: templates.length, paraphrasesAvailable: paraphrases.length };
  }

  // --- Câu nhiều vấn đề: ghép 2-3 danh mục khác nhau ---
  const complaintGroups = groups.filter((g) => !g.id.startsWith('__') && keptByGroup[g.id].length);
  const addRow = (text, labels) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    if (maxGoldSimilarity(text) >= LEAK_JACCARD) {
      droppedForLeak++;
      return false;
    }
    seen.add(key);
    rows.push(toRow({ text, ...labels }, mode));
    return true;
  };

  const targetMulti = Number(args.multi) || 1600;
  let multiMade = 0;
  for (let attempt = 0; multiMade < targetMulti && attempt < targetMulti * 25; attempt++) {
    const want = rng.bool(0.15) ? 3 : 2;
    const chosen = [];
    for (let guard = 0; chosen.length < want && guard < 40; guard++) {
      const g = rng.pick(complaintGroups);
      if (!chosen.some((c) => c.labels.category === g.labels.category)) chosen.push(g);
    }
    if (chosen.length < 2) continue;
    let text = joinParts(rng, chosen.map((g) => sampleSentence(rng, g, keptByGroup, cache)));
    if (rng.bool(0.18)) text = toTeencode(rng, text);
    if (addRow(text, {
      sentiment: 'Negative',
      categories: chosen.map((g) => g.labels.category),
      causes: chosen.map((g) => g.labels.cause),
      spam: false
    })) multiMade++;
  }

  // --- Câu khen một phần, chê một phần: "shipper dễ thương mà hàng móp" ---
  const targetMixed = Number(args.mixed) || 400;
  let mixedMade = 0;
  const praiseTemplates = keptByGroup.__POSITIVE;
  for (let attempt = 0; mixedMade < targetMixed && attempt < targetMixed * 25 && praiseTemplates.length; attempt++) {
    const g = rng.pick(complaintGroups);
    let text = fillTemplate(rng, rng.pick(praiseTemplates)) + rng.pick(CONTRAST) +
      lowerFirst(sampleSentence(rng, g, keptByGroup, cache));
    if (rng.bool(0.18)) text = toTeencode(rng, text);
    // Cực tính chung là tiêu cực: có một vấn đề cần xử lý, dù câu có lời khen
    if (addRow(text, {
      sentiment: 'Negative',
      categories: [g.labels.category],
      causes: [g.labels.cause],
      spam: false
    })) mixedMade++;
  }
  counts.__MULTI_ISSUE = { rows: multiMade, target: targetMulti };
  counts.__PRAISE_PLUS_COMPLAINT = { rows: mixedMade, target: targetMixed };
  console.log(`Câu nhiều vấn đề: ${multiMade} | câu khen kèm chê: ${mixedMade}`);

  // Trộn thứ tự để lô huấn luyện không bị dồn theo nhóm
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const outPath = path.join(DATA_DIR, 'domain_train.jsonl');
  writeJsonl(outPath, rows);

  const manifest = {
    generatedAt: new Date().toISOString(),
    seed,
    inputMode: mode,
    total: rows.length,
    labelProvenance:
      'Nhãn theo cấu trúc sinh từ khung câu data/corpus.js, một phần câu do LLM diễn đạt lại; KHÔNG phải nhãn người gán trên phản hồi thật.',
    leakageGuard: {
      jaccardThreshold: LEAK_JACCARD,
      goldSentencesCompared: GOLD_TOKENS.length,
      templatesTotal: totalTemplates,
      templatesDropped: droppedTemplates.length,
      generatedSentencesDropped: droppedForLeak,
      llmSawGoldSentences: false,
      limitation: 'Chỉ lọc trùng mặt chữ; không loại trừ được trùng ý nghĩa ngẫu nhiên.'
    },
    paraphrase: stats,
    counts,
    droppedTemplates
  };
  fs.writeFileSync(path.join(DATA_DIR, 'domain_train.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Đã ghi ${rows.length} mẫu vào ${outPath}`);
  console.log(`LLM: gọi ${stats.called}, từ bộ đệm ${stats.fromCache}, lỗi ${stats.failed}`);
  console.log(`Câu sinh ra bị loại vì trùng tập chuẩn: ${droppedForLeak}`);
  const thin = Object.entries(counts).filter(([, c]) => c.rows < (targets.complaint * 0.5));
  if (thin.length) console.log('Nhóm thiếu mẫu: ' + thin.map(([k, c]) => `${k}=${c.rows}`).join(', '));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Lỗi:', e.message);
    process.exit(1);
  });
}

module.exports = { maxGoldSimilarity, templateMaxLeak, LEAK_JACCARD };
