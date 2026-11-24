/**
 * ĐỘNG CƠ TRỢ LÝ PHÂN TÍCH
 * ==================================================================
 * KIẾN TRÚC CŨ VÀ VÌ SAO PHẢI THAY:
 *
 *   câu hỏi -> nhét 400 dòng JSON vào prompt -> mô hình tự đếm, tự suy
 *
 * Năm vấn đề của cách đó:
 *   1. `slice(0, 400)` cắt theo THỜI GIAN chứ không theo LIÊN QUAN, nên
 *      hỏi về thanh toán mà tuần này toàn khiếu nại giao hàng thì mô
 *      hình không thấy một câu nào về thanh toán.
 *   2. Prompt vẫn khẳng định "bạn có N phản hồi" trong khi chỉ gửi 400.
 *      Mô hình kết luận trên mẫu thiên lệch nhưng tin rằng mình có đủ.
 *   3. Mô hình ngôn ngữ bị dùng làm máy tính. Nó đếm sai, và sai một
 *      cách tự tin — người đọc không có cách nào phát hiện.
 *   4. Không hề chạm tới tầng phân tích đã có: WCR, kiểm định z, phễu
 *      Trust Layer, cảnh báo, playbook, kết quả thực nghiệm. Trợ lý mù
 *      với chính những phần giá trị nhất của hệ thống.
 *   5. Không có trí nhớ hội thoại, nên "còn tháng trước thì sao?" là vô nghĩa.
 *
 * KIẾN TRÚC MỚI — bốn bước:
 *
 *   1. ĐỊNH TUYẾN Ý ĐỊNH  : luật xác định, chạy được khi không có mô hình
 *   2. GỌI CÔNG CỤ        : JavaScript tính mọi con số trên TOÀN BỘ dữ liệu
 *   3. TRUY XUẤT DẪN CHỨNG: BM25 lấy trích dẫn đúng chủ đề, có id truy vết
 *   4. DIỄN ĐẠT           : mô hình chỉ viết lại các dữ kiện đã tính
 *
 * Nhờ vậy con số trong câu trả lời LUÔN TRÙNG với dashboard, và khi
 * không có khóa API thì trợ lý vẫn trả lời được bằng tầng xác định.
 */

const { TOOLS } = require('./chat_tools');
const { llmAvailability } = require('./ai_analyzer');
const { canonicalize } = require('./normalizer');
const { spanWords } = require('./cadence');

// ==================================================================
// BƯỚC 1 — ĐỊNH TUYẾN Ý ĐỊNH
// ==================================================================

/**
 * Bảng ý định. Mỗi ý định khai báo: từ khóa nhận diện, các công cụ cần
 * gọi, và gợi ý cho câu trả lời.
 *
 * Dùng luật thay vì gọi mô hình để phân loại ý định, vì ba lý do: chạy
 * tức thì (không tốn một vòng gọi mạng), tái lập được, và vẫn hoạt động
 * khi không có khóa API.
 */
const INTENTS = [
  {
    id: 'data_quality',
    keywords: ['tin cậy', 'tin được', 'đáng tin', 'có tin', 'chất lượng dữ liệu',
      'sức khỏe dữ liệu', 'review ảo', 'đánh giá ảo', 'hàng giả', 'spam', 'lọc dữ liệu',
      'trust layer', 'seeding', 'trùng lặp', 'dữ liệu sạch', 'chính xác không',
      'bao nhiêu bị loại', 'cụm nghi vấn'],
    tools: ['trust_health', 'metrics_overview'],
    focus: 'Giải thích dữ liệu đã được lọc thế nào và có đáng tin không'
  },
  {
    id: 'alerts',
    keywords: ['cảnh báo', 'rủi ro', 'nghiêm trọng', 'khẩn', 'vấn đề gì', 'đang xảy ra',
      'bất thường', 'tăng đột biến', 'cần xử lý', 'ưu tiên'],
    tools: ['alerts_list', 'recommendations', 'search_feedbacks'],
    focus: 'Nêu các cảnh báo đang mở kèm bằng chứng thống kê và hành động đề xuất'
  },
  {
    id: 'root_cause',
    keywords: ['nguyên nhân', 'vì sao', 'tại sao', 'do đâu', 'phàn nàn gì', 'khiếu nại gì',
      'vấn đề chính', 'nhiều nhất', 'top', 'xếp hạng', 'phổ biến'],
    tools: ['root_causes', 'search_feedbacks'],
    focus: 'Xếp hạng nguyên nhân và trích dẫn phản hồi thật minh họa'
  },
  {
    id: 'trend',
    keywords: ['xu hướng', 'diễn biến', 'theo thời gian', 'tăng hay giảm', 'so với tuần',
      'so với tháng', 'gần đây', 'thay đổi', 'tuần này', 'tháng này'],
    tools: ['time_trend', 'metrics_overview', 'alerts_list'],
    focus: 'Mô tả diễn biến theo thời gian và chỉ ra hướng thay đổi'
  },
  {
    id: 'live',
    keywords: ['livestream', 'live stream', 'phiên live', 'buổi live', 'megalive', 'đi live', 'lên live', 'live vừa', 'live hôm',
      'người xem', 'lượt chốt', 'chốt đơn', 'hết hàng', 'doanh thu lỡ', 'người đứng live'],
    tools: ['live_sessions'],
    focus: 'Tóm tắt phiên livestream: kết quả, việc nên làm, so với phiên trước'
  },
  {
    id: 'channel',
    keywords: ['kênh', 'nguồn', 'shopee', 'facebook', 'tiktok', 'lazada', 'cskh', 'so sánh kênh'],
    tools: ['channel_breakdown', 'metrics_overview'],
    focus: 'So sánh giữa các kênh thu thập'
  },
  {
    id: 'customer',
    keywords: ['khách hàng', 'phân khúc', 'rời bỏ', 'trung thành', 'lặp lại', 'ai đang'],
    tools: ['segments', 'search_feedbacks'],
    focus: 'Phân tích nhóm khách hàng'
  },
  {
    id: 'action',
    keywords: ['nên làm gì', 'hành động', 'khuyến nghị', 'đề xuất', 'giải pháp', 'khắc phục',
      'xử lý thế nào', 'cải thiện'],
    tools: ['recommendations', 'alerts_list', 'root_causes'],
    focus: 'Đưa ra các bước hành động cụ thể, nói rõ bước nào cần phê duyệt'
  },
  {
    id: 'model_performance',
    keywords: ['f1', 'độ chính xác', 'chính xác bao nhiêu', 'mô hình', 'đánh giá mô hình',
      'thực nghiệm', 'baseline', 'phobert', 'visobert', 'accuracy', 'precision', 'recall'],
    tools: ['evaluation_results'],
    focus: 'Báo cáo kết quả đo được, kèm giới hạn của phép đo'
  },
  {
    id: 'business',
    keywords: ['giá', 'doanh thu', 'chi phí', 'lợi nhuận', 'gói', 'kinh doanh', 'ltv', 'cac',
      'bao nhiêu tiền', 'bảng giá'],
    tools: ['business_model'],
    focus: 'Trình bày mô hình kinh doanh, nói rõ đâu là giả định'
  },
  {
    id: 'taxonomy',
    keywords: ['phân loại', 'taxonomy', 'danh mục', 'nhãn', 'bao nhiêu loại', 'cây nhãn'],
    tools: ['taxonomy_info'],
    focus: 'Giải thích hệ thống nhãn'
  },
  {
    id: 'overview',
    keywords: ['tổng quan', 'tình hình', 'báo cáo', 'tóm tắt', 'thế nào', 'ra sao', 'bao nhiêu'],
    tools: ['metrics_overview', 'root_causes', 'alerts_list'],
    focus: 'Bức tranh tổng thể'
  }
];

/** Ý định mặc định khi không câu nào khớp rõ */
const FALLBACK_INTENT = {
  id: 'general',
  tools: ['metrics_overview', 'root_causes', 'search_feedbacks'],
  focus: 'Trả lời dựa trên chỉ số tổng quan và dẫn chứng liên quan'
};

function normalizeQuestion(q) {
  // NFC: câu hỏi gõ bằng bàn phím tổ hợp dấu (macOS/iOS) không khớp được từ
  // khóa ý định nào nếu để nguyên dạng NFD
  return canonicalize(q).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Chấm điểm từng ý định theo số từ khóa khớp, có tính độ dài từ khóa —
 * khớp cụm dài mang nhiều thông tin hơn khớp một từ chung chung.
 */
function routeIntent(question) {
  const q = normalizeQuestion(question);
  const scored = INTENTS.map((intent) => {
    let score = 0;
    const matched = [];
    for (const kw of intent.keywords) {
      if (q.includes(kw)) {
        score += 1 + kw.length / 20;
        matched.push(kw);
      }
    }
    return { intent, score, matched };
  }).filter((s) => s.score > 0);

  if (!scored.length) return { intent: FALLBACK_INTENT, score: 0, matched: [] };
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ==================================================================
// BƯỚC 2 + 3 — GỌI CÔNG CỤ VÀ TRUY XUẤT DẪN CHỨNG
// ==================================================================

/**
 * Suy ra bộ lọc thời gian từ chính câu hỏi.
 * "tuần này có vấn đề gì" phải được hiểu là lọc 7 ngày, không phải toàn
 * bộ lịch sử — nếu không thì câu trả lời đúng số nhưng sai phạm vi.
 */
/** Mã khoảng thời gian của bộ lọc thành chữ cho người đọc */
function timeWords(time) {
  if (time === 'Today') return 'hôm nay';
  if (time === 'This Week') return '7 ngày gần nhất';
  if (time === 'This Month') return '30 ngày gần nhất';
  const d = /^Days:(\d+)$/.exec(time || '');
  if (d) return `${spanWords(Number(d[1]))} gần nhất`;
  if ((time || '').startsWith('Custom:')) return `từ ${time.split(':')[1]} đến ${time.split(':')[2]}`;
  return time;
}

function inferFilters(question, baseFilters = {}) {
  const q = normalizeQuestion(question);
  const filters = { ...baseFilters };

  if (!filters.time || filters.time === 'All') {
    // "6 tháng qua", "2 tuần gần đây", "1 năm": có số thì lấy đúng độ dài đó. Bản
    // trước để "6 tháng qua" khớp "tháng qua" thành 30 ngày; kho thật thưa (nhịp
    // 6 tháng) thì 30 ngày có 0 khiếu nại và trợ lý trả lời "không xác định được".
    const n = q.match(/(\d{1,3})\s*(ngày|ngay|tuần|tuan|tháng|thang|quý|quy|năm|nam)(?![a-zà-ỹ])/);
    const unit = n && { ngày: 1, ngay: 1, tuần: 7, tuan: 7, tháng: 30, thang: 30, quý: 91, quy: 91, năm: 365, nam: 365 }[n[2]];
    const days = unit ? Math.min(3650, Number(n[1]) * unit) : null;
    if (days === 7) filters.time = 'This Week';
    else if (days === 30) filters.time = 'This Month';
    else if (days) filters.time = `Days:${days}`;
    else if (/hôm nay|hom nay/.test(q)) filters.time = 'Today';
    else if (/tuần này|tuan nay|7 ngày|7 ngay|tuần qua/.test(q)) filters.time = 'This Week';
    else if (/tháng này|thang nay|30 ngày|30 ngay|tháng qua/.test(q)) filters.time = 'This Month';
    else if (/năm nay|nam nay|năm qua|nam qua/.test(q)) filters.time = 'Days:365';
  }

  const channels = ['Shopee', 'Facebook', 'TikTok', 'Lazada', 'CSKH'];
  if (!filters.source || filters.source === 'All') {
    for (const c of channels) {
      if (q.includes(c.toLowerCase())) {
        filters.source = c;
        break;
      }
    }
  }

  return filters;
}

// Từ của câu hỏi và từ có trong gần như mọi tên hàng: không dùng để nhận ra sản phẩm
const PRODUCT_STOP = new Set(('sản phẩm nào bị chê khen nhiều nhất ít khách than phiền gì của có không là và thế '
  + 'sao vì hàng chính hãng mới tháng ngày tuần năm qua nay này gần đây đang hay hỏi về cho shop mình tôi bên '
  + 'được với những các một hai ba so sánh tốt xấu lỗi vấn đề nguyên nhân phản hồi đánh giá').split(' '));
const foldVi = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const wordsOf = (s) => foldVi(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Sản phẩm được nhắc trong câu hỏi ("máy xay sinh tố Philips bị than gì"). Khớp
 * theo số từ của câu hỏi nằm trong tên hàng; lấy các tên khớp nhiều từ nhất (ít
 * nhất 2 từ), nên một câu nêu dòng hàng ra đủ mọi mẫu của dòng đó. Bản trước không
 * lọc sản phẩm: trợ lý tìm theo từ khoá, vớ vài lời khen và trả lời "chủ yếu tích
 * cực" trong khi ba mẫu máy xay Philips có 48 đánh giá tiêu cực (kho thật 24/11).
 */
function productsInQuestion(question, productNames, max = 6) {
  // Lọc từ bỏ qua khi CÒN dấu ("đây" khác "dây", "tố" khác "tổ"), chỉ bỏ dấu lúc so với tên hàng
  const accented = canonicalize(String(question || '')).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const content = [...new Set(accented.filter((w) => !PRODUCT_STOP.has(w) && (w.length >= 2 || /\d/.test(w))).map(foldVi))];
  if (content.length < 2) return [];
  let best = 0;
  const scored = [];
  for (const name of productNames) {
    const set = new Set(wordsOf(name));
    const score = content.filter((w) => set.has(w)).length;
    if (score >= 2) scored.push({ name, score });
    if (score > best) best = score;
  }
  if (best < 2) return [];
  const top = scored.filter((s) => s.score === best).map((s) => s.name);
  return top.length <= max ? top : [];
}

/** Số liệu và khiếu nại gần nhất của các sản phẩm được hỏi, dựng từ dữ liệu đã tính */
function productFocus(ctx, question, filters) {
  const { applyFilters } = require('./analysis_context');
  const metrics = require('./metrics');
  const items = applyFilters(ctx.items, { ...(filters || {}), product: undefined }, ctx.asOf).filter(metrics.isCountable);
  const names = productsInQuestion(question, new Set(items.map((f) => f.productName).filter(Boolean)));
  if (!names.length) return null;
  const facts = [];
  const evidence = [];
  for (const name of names) {
    const list = items.filter((f) => f.productName === name);
    const neg = list.filter(metrics.isComplaint);
    const causes = {};
    for (const f of neg) {
      const k = f.causeLabel || f.categoryLabel;
      if (k && f.category !== 'Other') causes[k] = (causes[k] || 0) + 1;
    }
    const topCauses = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`);
    facts.push(`${name}: ${list.length} phản hồi được tính, ${neg.length} tiêu cực`
      + (list.length ? ` (${((neg.length / list.length) * 100).toFixed(1).replace('.', ',')}%)` : '')
      + (topCauses.length ? `; bị chê nhiều nhất: ${topCauses.join(', ')}` : '') + '.');
    evidence.push(...neg
      .filter((f) => f.originalText)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Math.max(2, Math.ceil(8 / names.length)))
      .map((f) => ({
        id: String(f._id), text: f.originalText, category: f.categoryLabel || null, cause: f.causeLabel || null,
        sentiment: f.sentiment, source: f.source, product: f.productName, date: f.timestamp,
        trustTier: f.trust ? f.trust.tier : null, relevance: null
      })));
  }
  return {
    section: { title: 'Sản phẩm được hỏi', facts: [`Câu hỏi khớp ${names.length} sản phẩm trong kho.`, ...facts] },
    evidence: evidence.slice(0, 10)
  };
}

/** Chạy các công cụ mà ý định yêu cầu, gom thành một bản tóm lược dữ kiện */
function gatherBriefing(ctx, question, intent, filters) {
  const sections = [];
  const evidence = [];
  const toolsUsed = [];

  // Hỏi về một sản phẩm hay dòng hàng cụ thể: số liệu và khiếu nại của đúng nó đứng đầu
  if (!['model_performance', 'taxonomy', 'live'].includes(intent.id)) {
    const focus = productFocus(ctx, question, filters);
    if (focus) {
      sections.push(focus.section);
      evidence.push(...focus.evidence);
      toolsUsed.push('product_focus');
    }
  }

  for (const toolName of intent.tools) {
    const tool = TOOLS[toolName];
    if (!tool) continue;
    try {
      const args = toolName === 'search_feedbacks'
        ? { query: question, filters, limit: 10 }
        : { filters };
      const out = tool.run(ctx, args);
      sections.push(out);
      toolsUsed.push(toolName);
      if (out.evidence) evidence.push(...out.evidence);
    } catch (e) {
      console.error(`[CHAT] Công cụ ${toolName} lỗi:`, e.message);
    }
  }

  // Câu hỏi kiểu "khách chê gì nhiều nhất" không chứa từ khoá nào trùng nội
  // dung phản hồi, nên tìm BM25 trả rỗng. Khi đó lấy các khiếu nại mới nhất
  // thuộc nhóm bị chê nhiều nhất làm dẫn chứng, và nói rõ đó là cách chọn.
  // Câu hỏi về livestream: dẫn chứng là khiếu nại trên sàn thì lạc đề
  if (!evidence.length && !['model_performance', 'business', 'taxonomy', 'live'].includes(intent.id)) {
    const { applyFilters } = require('./analysis_context');
    const metrics = require('./metrics');
    const complaints = applyFilters(ctx.items, filters || {}, ctx.asOf)
      .filter((f) => metrics.isCountable(f) && metrics.isComplaint(f) && f.category && f.category !== 'Other');
    const counts = {};
    for (const f of complaints) counts[f.category] = (counts[f.category] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const picked = complaints
      .filter((f) => f.category === top)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);
    if (picked.length) {
      sections.push({
        title: 'Dẫn chứng',
        facts: [`Không có phản hồi trùng từ khoá câu hỏi; dẫn chứng là ${picked.length} khiếu nại mới nhất của nhóm bị chê nhiều nhất.`]
      });
      evidence.push(...picked.map((f) => ({
        id: String(f._id),
        text: f.originalText,
        category: f.categoryLabel || null,
        cause: f.causeLabel || null,
        sentiment: f.sentiment,
        source: f.source,
        product: f.productName,
        date: f.timestamp,
        trustTier: f.trust ? f.trust.tier : null,
        relevance: null
      })));
    }
  }

  return { sections, evidence, toolsUsed };
}

// ==================================================================
// BƯỚC 4A — TRẢ LỜI XÁC ĐỊNH (không cần mô hình ngôn ngữ)
// ==================================================================

/**
 * Soạn câu trả lời hoàn toàn bằng JavaScript từ các dữ kiện đã tính.
 *
 * Đây KHÔNG phải phương án chữa cháy tạm bợ. Nó có ba vai trò thật:
 *   - Trợ lý vẫn dùng được khi chưa cấu hình khóa API, hoặc khi nhà
 *     cung cấp mô hình gặp sự cố — người dùng không thấy sản phẩm "hỏng".
 *   - Là mốc đối chiếu: nếu câu trả lời của mô hình mâu thuẫn với bản
 *     xác định này thì mô hình đang bịa.
 *   - Không tốn một đồng chi phí suy luận nào.
 */
function deterministicAnswer(question, intent, briefing) {
  const lines = [];

  for (const section of briefing.sections) {
    if (!section.facts || !section.facts.length) continue;
    lines.push(`**${section.title}**`);
    for (const f of section.facts.slice(0, 6)) lines.push(`- ${f}`);
    lines.push('');
  }

  if (briefing.evidence.length) {
    lines.push('**Dẫn chứng từ phản hồi thật**');
    for (const e of briefing.evidence.slice(0, 3)) {
      const meta = [e.category, e.source, e.product].filter(Boolean).join(' · ');
      lines.push(`- "${String(e.text).slice(0, 150)}"${meta ? ` — ${meta}` : ''}`);
    }
    lines.push('');
  }

  if (!lines.length) {
    return 'Tôi chưa tìm được dữ liệu phù hợp với câu hỏi này trong phạm vi đang xét.';
  }

  // Nguồn của câu trả lời (tính trực tiếp hay qua mô hình) đi trong meta.provider,
  // giao diện tự ghi rõ — không chèn vào nội dung
  return lines.join('\n').trim();
}

// ==================================================================
// BƯỚC 4B — DIỄN ĐẠT BẰNG MÔ HÌNH NGÔN NGỮ
// ==================================================================

/**
 * Dựng prompt. Điểm khác biệt cốt lõi so với bản cũ: mô hình KHÔNG nhận
 * dữ liệu thô để tự tính, mà nhận các DỮ KIỆN ĐÃ TÍNH SẴN kèm dẫn chứng.
 * Việc của nó chỉ là viết lại cho mạch lạc.
 */
function buildPrompt(question, intent, briefing, history, ctx, filters) {
  const factBlock = briefing.sections
    .map((s) => `### ${s.title}\n${s.facts.map((f) => `- ${f}`).join('\n')}`)
    .join('\n\n');

  const evidenceBlock = briefing.evidence.length
    ? briefing.evidence
        .slice(0, 10)
        .map((e, i) => `[${i + 1}] "${e.text}" (${[e.category, e.source, e.product].filter(Boolean).join(' · ')})`)
        .join('\n')
    : '(không có trích dẫn nào khớp chủ đề)';

  const historyBlock = history.length
    ? history.slice(-6).map((m) => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}`).join('\n')
    : '(đây là câu hỏi đầu tiên)';

  const scope = [];
  // Nhãn tiếng Việt: đưa mã "This Month" vào lời nhắc thì mô hình chép nguyên chữ tiếng Anh ra câu trả lời
  if (filters.time && filters.time !== 'All') scope.push(`thời gian: ${timeWords(filters.time)}`);
  if (filters.source && filters.source !== 'All') scope.push(`kênh: ${filters.source}`);
  if (filters.product && filters.product !== 'All') scope.push(`sản phẩm: ${filters.product}`);

  return `Bạn là trợ lý phân tích của hệ thống Customer Radar. Xưng "tôi" với người dùng.

## Quy tắc bắt buộc

1. CHỈ dùng các dữ kiện được cung cấp bên dưới. Tuyệt đối không bịa thêm số.
2. Các con số đã được hệ thống tính sẵn trên TOÀN BỘ dữ liệu. Hãy dùng lại
   nguyên văn, KHÔNG tự cộng trừ hay ước lượng lại.
3. ${briefing.evidence.length
    ? 'Khi nêu một phát hiện có phản hồi minh hoạ, trích dẫn bằng [số] tương ứng với danh sách dẫn chứng. KHÔNG dùng [số] để chỉ dữ kiện đã tính.'
    : 'KHÔNG có dẫn chứng nào, nên KHÔNG được dùng ký hiệu [số] trong câu trả lời.'}
4. Nếu dữ kiện không đủ để trả lời, nói thẳng là không đủ dữ liệu và chỉ ra
   cần thêm gì. Không suy đoán.
5. Nếu một chỉ số được ghi là KHÔNG tính được (ví dụ WCR khi chưa có dữ liệu
   giao dịch), phải nói rõ điều đó thay vì đưa ra con số thay thế như thể là nó.
6. Trả lời bằng tiếng Việt, Markdown, NGẮN GỌN. Mở đầu bằng câu trả lời trực
   tiếp, rồi mới tới số liệu. Tối đa khoảng 200 từ trừ khi được hỏi chi tiết.
7. Không tự đề xuất hành động phát sinh chi phí hoặc chạm tới khách hàng cuối
   như thể hệ thống sẽ tự làm. Mọi hành động đều là đề xuất chờ người duyệt.
8. Người đọc là quản lý, không phải nhà thống kê: viết số thập phân kiểu Việt
   (5,5% chứ không phải 5.5%), KHÔNG nêu z, p, EWMA trừ khi được hỏi; thay bằng
   lời thường như "tăng rõ so với trước".

## Phạm vi đang xét
${scope.length ? scope.join(', ') : 'toàn bộ dữ liệu'}

## Lịch sử hội thoại
${historyBlock}

## Dữ kiện đã tính sẵn
${factBlock}

## Dẫn chứng từ phản hồi thật
${evidenceBlock}

## Câu hỏi
${question}`;
}

async function synthesize(prompt) {
  const analyzer = require('./ai_analyzer');
  const avail = llmAvailability();

  // Mọi nhà cung cấp đều có trần thời gian (analyzer.LLM_TIMEOUT_MS): bản cũ
  // gọi không trần, một nhà cung cấp treo là ô trò chuyện treo theo
  if (avail.gemini) {
    try {
      const result = await analyzer.getGeminiModel().generateContent(prompt);
      return { text: result.response.text().trim(), provider: 'gemini' };
    } catch (e) {
      console.warn('[CHAT] Gemini lỗi:', e.message);
    }
  }

  if (avail.openrouter) {
    try {
      const content = await analyzer.openRouterChat({
        model: analyzer.OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }]
      });
      return { text: content.trim(), provider: 'openrouter' };
    } catch (e) {
      console.warn('[CHAT] OpenRouter lỗi:', e.message);
    }
  }

  if (avail.groq) {
    try {
      const Groq = require('groq-sdk');
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: analyzer.LLM_TIMEOUT_MS, maxRetries: 1 });
      const c = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: analyzer.GROQ_MODEL
      });
      return { text: c.choices[0].message.content.trim(), provider: 'groq' };
    } catch (e) {
      console.warn('[CHAT] Groq lỗi:', e.message);
    }
  }

  return null;
}

// ==================================================================
// ĐIỀU PHỐI
// ==================================================================

/**
 * @param {object} ctx  ngữ cảnh phân tích dùng chung (đã chạy Trust Layer)
 * @param {string} question câu hỏi của người dùng
 * @param {Array} history lịch sử hội thoại [{role, content}]
 * @param {object} baseFilters bộ lọc hiện hành trên dashboard
 */
async function ask(ctx, question, history = [], baseFilters = {}) {
  const started = Date.now();

  // Lịch sử đến từ trình duyệt: phần tử null hay content không phải chuỗi từng
  // làm buildPrompt ném TypeError; tin nhắn dài bất thường bị cắt bớt
  history = (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: canonicalize(m.content).slice(0, 1000) }));

  const routed = routeIntent(question);
  const filters = inferFilters(question, baseFilters);
  const briefing = gatherBriefing(ctx, question, routed.intent, filters);

  const deterministic = deterministicAnswer(question, routed.intent, briefing);

  const prompt = buildPrompt(question, routed.intent, briefing, history, ctx, filters);
  const llm = await synthesize(prompt);

  return {
    text: llm ? llm.text : deterministic,
    // Bản xác định luôn được trả kèm: người dùng có thể đối chiếu, và
    // đây cũng là cách phát hiện khi mô hình nói khác dữ liệu
    deterministicAnswer: deterministic,
    meta: {
      intent: routed.intent.id,
      matchedKeywords: routed.matched,
      toolsUsed: briefing.toolsUsed,
      filtersApplied: filters,
      evidenceCount: briefing.evidence.length,
      provider: llm ? llm.provider : 'deterministic',
      llmUsed: Boolean(llm),
      basedOnFeedbacks: ctx.items.length,
      // Số ĐƯỢC TÍNH (trọng số > 0) trong đúng phạm vi câu hỏi, cùng định nghĩa với mọi trang.
      // Trước đây là validForAnalysis (chưa trừ phản hồi quá cũ): giao diện ghi "cùng số
      // liệu với Tổng quan" nhưng ra 4.510 trong khi Tổng quan ghi 4.557.
      validFeedbacks: require('./analysis_context').applyFilters(ctx.items, filters || {}, ctx.asOf).filter(require('./metrics').isCountable).length,
      dataHealthScore: ctx.funnel.dataHealthScore,
      elapsedMs: Date.now() - started
    },
    // Dữ kiện đã tính: giao diện hiện riêng để người đọc đối chiếu với câu trả lời
    facts: briefing.sections
      .filter((s) => s.facts && s.facts.length && s.title !== 'Dẫn chứng')
      .map((s) => ({ title: s.title, facts: s.facts.slice(0, 8) })),
    evidence: briefing.evidence.slice(0, 10)
  };
}

/** Câu hỏi gợi ý, sinh theo tình hình dữ liệu thật chứ không cố định */
function suggestedQuestions(ctx) {
  const suggestions = [];
  const alertEngine = require('./alert_engine');

  try {
    const result = alertEngine.detectAlerts(ctx.items, { transactionCount: ctx.transactionCount, transactions: ctx.transactions, now: ctx.asOf || undefined, windowDays: ctx.cadence?.windowDays, baselineDays: ctx.cadence?.baselineDays });
    if (result.alerts.length > 0) {
      const top = result.alerts[0];
      suggestions.push(`Vì sao ${require('./wording').issueTitle(top.categoryLabel, top.causeLabel)} lại bị cảnh báo?`);
      suggestions.push('Tôi nên làm gì với các cảnh báo đang mở?');
    } else {
      suggestions.push('Tuần này có vấn đề gì đáng chú ý không?');
    }
  } catch {
    suggestions.push('Tuần này có vấn đề gì đáng chú ý không?');
  }

  if (ctx.clusters.length > 0) {
    suggestions.push(`Có ${ctx.clusters.length} cụm đánh giá nghi vấn, chúng là gì?`);
  } else {
    suggestions.push('Dữ liệu hiện tại có đáng tin không?');
  }

  suggestions.push('Khách hàng đang phàn nàn nhiều nhất về điều gì?');
  suggestions.push('Mô hình đang đạt độ chính xác bao nhiêu?');

  return suggestions.slice(0, 5);
}

module.exports = {
  ask,
  synthesize,
  routeIntent,
  inferFilters,
  productsInQuestion,
  gatherBriefing,
  deterministicAnswer,
  suggestedQuestions,
  INTENTS,
  TOOLS
};
