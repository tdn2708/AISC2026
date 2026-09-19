/**
 * TẦNG KIỂM SOÁT TIN CẬY DỮ LIỆU ĐẦU VÀO (DATA TRUST LAYER)
 * ==================================================================
 * Thành phần kiến trúc độc lập, đặt GIỮA tầng thu thập và tầng phân
 * tích. Lý do tồn tại: mọi chỉ số và khuyến nghị của hệ thống đều suy
 * ra từ một giả định nền — mỗi phản hồi tương ứng với một trải nghiệm
 * có thật của một khách hàng có thật. Trên sàn TMĐT Việt Nam giả định
 * này sai một cách hệ thống (đánh giá tăng cường, đánh giá hạ uy tín,
 * quảng cáo/bot, đánh giá rỗng nghĩa để nhận xu).
 *
 * Nguyên tắc thiết kế then chốt: tầng này KHÔNG loại bỏ dữ liệu một
 * cách nhị phân, mà GÁN CHO MỖI PHẢN HỒI MỘT TRỌNG SỐ TIN CẬY; toàn bộ
 * chỉ số phía sau tính trên tổng trọng số thay vì đếm thô.
 *
 * Các tầng:
 *   T0  Phân hạng nguồn gốc (Provenance Tiering)
 *   T1  Lọc nội dung rác và quảng cáo
 *   T2  Phát hiện đánh giá không xác thực (5 nhóm tín hiệu độc lập)
 *   T3  Trọng số hợp nhất và chỉ số có trọng số
 *   T4  Hàng đợi kiểm duyệt + học chủ động
 *   T5  Chỉ số Sức khỏe Dữ liệu
 */

const { normalize, spamSignals } = require('./normalizer');
const { isolationForestScores, variance } = require('./anomaly');

// ==================================================================
// T0 — PHÂN HẠNG NGUỒN GỐC
// ==================================================================

/**
 * Trọng số theo hạng nguồn. Càng đối soát được với giao dịch thật thì
 * trọng số càng cao — đây chính là lý do kiến trúc chọn mô hình dữ
 * liệu first-party (doanh nghiệp cấp quyền cho gian hàng của chính họ)
 * thay vì scraping diện rộng.
 */
const PROVENANCE_TIERS = {
  P1: { weight: 1.0,  reconciliation: 'Đầy đủ',  label: 'Đánh giá trên sàn gắn mã đơn hàng, đối soát được' },
  P2: { weight: 0.9,  reconciliation: 'Đầy đủ',  label: 'Ticket CSKH / email / biểu mẫu gắn tài khoản đã định danh' },
  P3: { weight: 0.6,  reconciliation: 'Một phần', label: 'Đánh giá trên sàn không đối soát được mã đơn' },
  P4: { weight: 0.4,  reconciliation: 'Không',   label: 'Bình luận mạng xã hội từ tài khoản có lịch sử bình thường' },
  P5: { weight: 0.15, reconciliation: 'Không',   label: 'Bình luận ẩn danh hoặc tài khoản tạo dưới 7 ngày' }
};

/** Kênh có khả năng đối soát giao dịch (có order_id) */
const RECONCILABLE_SOURCES = ['Shopee', 'Lazada', 'TikTok', 'TikTokShop', 'CSKH', 'Email', 'Hotline', 'Form'];
const IDENTIFIED_SOURCES = ['CSKH', 'Email', 'Hotline', 'Form', 'Ticket'];

const NEW_ACCOUNT_DAYS = 7;

/**
 * Gán hạng nguồn cho một phản hồi.
 * Quy tắc vận hành đi kèm: phản hồi hạng P5 dùng để quan sát xu hướng
 * nhưng KHÔNG đủ điều kiện kích hoạt cảnh báo mức High/Critical — điều
 * này chặn kịch bản một nhóm tài khoản mới lập tạo ra cảnh báo giả.
 */
function assignProvenanceTier(fb) {
  const source = fb.source || 'Other';
  const isAnonymous =
    !fb.author || /^(anonymous|ẩn danh|user\d*|khach_\d+)$/i.test(String(fb.author).trim());
  const accountAgeDays = Number.isFinite(fb.accountAgeDays) ? fb.accountAgeDays : null;
  const isNewAccount = accountAgeDays !== null && accountAgeDays < NEW_ACCOUNT_DAYS;

  let tier;
  if (isAnonymous || isNewAccount) {
    tier = 'P5';
  } else if (fb.orderId && RECONCILABLE_SOURCES.includes(source)) {
    tier = 'P1';
  } else if (IDENTIFIED_SOURCES.includes(source) && fb.customerId) {
    tier = 'P2';
  } else if (RECONCILABLE_SOURCES.includes(source)) {
    tier = 'P3';
  } else {
    tier = 'P4';
  }

  return {
    tier,
    tierWeight: PROVENANCE_TIERS[tier].weight,
    reconciliation: PROVENANCE_TIERS[tier].reconciliation,
    canTriggerHighAlert: tier !== 'P5'
  };
}

// ==================================================================
// T1 — LỌC NỘI DUNG RÁC VÀ QUẢNG CÁO
// ==================================================================

/**
 * Bộ lọc hai lớp. Lớp quy tắc ở đây; lớp mô hình (đầu ra spam của
 * ViSoBERT tinh chỉnh) cắm vào qua tham số `modelScore` — xác suất rác
 * trong [0,1], hoặc null khi mô hình chưa sẵn sàng.
 *
 * Tiêu chí tối ưu: ưu tiên Precision >= 0.95 thay vì Recall.
 * Nguyên tắc thiết kế: bỏ sót một phản hồi rác chỉ gây nhiễu nhẹ,
 * nhưng loại nhầm một khiếu nại thật là đánh mất đúng thứ khách hàng
 * trả tiền để nghe. Vì vậy chỉ loại khi có bằng chứng mạnh — dấu hiệu
 * chào mời kèm phương thức liên hệ, hoặc nội dung rỗng nghĩa.
 */
const MIN_MEANINGFUL_SYLLABLES = 5;

/**
 * Mô hình KHÔNG được một mình loại phản hồi. Nó chỉ nâng một dấu hiệu
 * yếu (có liên hệ, có link, có mã, có lời chào mời — từng cái riêng lẻ
 * lớp luật chưa đủ tin để chặn) thành bằng chứng đủ mạnh. Một khiếu nại
 * thật viết gay gắt, không kèm dấu hiệu thương mại nào, không bao giờ bị
 * chặn chỉ vì mô hình chấm điểm cao.
 */
const SPAM_MODEL_THRESHOLD = 0.95;

function runSpamFilter(fb, normalized, modelScore = null) {
  const raw = fb.originalText || '';
  const sig = spamSignals(raw);
  const reasons = [];

  // Chào mời + phương thức liên hệ: chữ ký rõ nhất của quảng cáo
  if ((sig.hasContact || sig.hasPhone) && sig.hasCommerce) {
    reasons.push('Nội dung chào mời kèm phương thức liên hệ');
  }
  if (sig.hasUrl && sig.hasCommerce) {
    reasons.push('Đường dẫn kèm nội dung chào mời');
  }
  if (sig.hasPromoCode && sig.hasContact) {
    reasons.push('Mã giảm giá lạ kèm lời mời chào');
  }

  // Đánh giá rỗng nghĩa: phát sinh từ cơ chế thưởng xu của sàn
  const onlyEmojiOrPunct = raw.trim().length > 0 && !/\p{L}/u.test(raw);
  if (onlyEmojiOrPunct) {
    reasons.push('Nội dung chỉ gồm biểu tượng cảm xúc');
  }
  const isEmptyMeaning =
    normalized.syllables > 0 &&
    normalized.syllables < MIN_MEANINGFUL_SYLLABLES &&
    !/(chậm|hỏng|lỗi|tệ|xấu|kém|mất|thiếu|đắt|vỡ|móp)/.test(normalized.normalized);
  if (isEmptyMeaning) {
    reasons.push(`Văn bản dưới ${MIN_MEANINGFUL_SYLLABLES} âm tiết, không chứa khía cạnh nào`);
  }

  // Ký tự lặp bất thường (spam bàn phím)
  if (/(\p{L})\1{5,}/u.test(raw)) {
    reasons.push('Tỉ lệ ký tự lặp bất thường');
  }

  const hasModelScore = Number.isFinite(modelScore);
  if (hasModelScore && modelScore >= SPAM_MODEL_THRESHOLD && reasons.length === 0) {
    const weakSignal = sig.hasContact || sig.hasPhone || sig.hasCommerce || sig.hasUrl || sig.hasPromoCode;
    if (weakSignal) {
      reasons.push(
        `Mô hình ViSoBERT chấm xác suất rác ${modelScore.toFixed(2)}, kèm dấu hiệu liên hệ hoặc chào mời`
      );
    }
  }

  return {
    isSpam: reasons.length > 0,
    reasons,
    signals: sig,
    modelScore: hasModelScore ? Number(modelScore.toFixed(4)) : null
  };
}

// ==================================================================
// T2 — PHÁT HIỆN ĐÁNH GIÁ KHÔNG XÁC THỰC
// Năm nhóm tín hiệu độc lập, mỗi nhóm khai thác một dấu vết khác nhau
// ==================================================================

const DUPLICATE_CONFIG = {
  similarityThreshold: 0.9,  // độ tương đồng trung bình trong cụm
  minClusterSize: 5,         // số phản hồi tối thiểu để coi là cụm nghi vấn
  windowHours: 48,           // TOÀN BỘ cụm phải nằm gọn trong cửa sổ này
  // Mật độ tối thiểu (phản hồi/giờ). Nội dung giống nhau rải đều nhiều
  // ngày KHÔNG phải chiến dịch — câu ngắn kiểu "giao hàng nhanh" trùng
  // nhau là chuyện bình thường. Thứ đáng ngờ là giống nhau VÀ dồn cục.
  minDensityPerHour: 1.0,
  // Ngưỡng riêng cho vector nhúng ViSoBERT gốc. Đo trên 3.160 cặp câu khác
  // nhau của ASPECT_GOLD: cosine cao nhất 0.756; bản chép gần nguyên văn
  // cho 0.86–0.97. Đặt 0.90 để giữ khoảng cách an toàn với câu không liên
  // quan. Chi tiết và giới hạn: nlp_service/README.md, mục hiệu chỉnh.
  embeddingSimilarityThreshold: 0.9
};

/** Tích vô hướng của hai vector đã chuẩn hóa L2 = độ tương đồng cosine */
function dotProduct(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Vector tần suất token, dùng cho độ tương đồng cosine */
function termVector(text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const v = new Map();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, va] of a) na += va * va;
  for (const [, vb] of b) nb += vb * vb;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const [k, v] of smaller) {
    const other = larger.get(k);
    if (other) dot += v * other;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** SimHash 64-bit để lọc thô trước khi tính cosine — giảm số cặp phải so */
function simHash(text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const bits = new Array(32).fill(0);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let b = 0; b < 32; b++) {
      bits[b] += (h >>> b) & 1 ? 1 : -1;
    }
  }
  let out = 0;
  for (let b = 0; b < 32; b++) if (bits[b] > 0) out |= 1 << b;
  return out >>> 0;
}

function hammingDistance(a, b) {
  let x = (a ^ b) >>> 0;
  let count = 0;
  while (x) {
    x &= x - 1;
    count += 1;
  }
  return count;
}

/**
 * TÍN HIỆU (1): TRÙNG LẶP GẦN VỀ NỘI DUNG.
 * Đánh giá thuê thường được sinh từ vài mẫu câu. Biểu diễn mỗi phản
 * hồi bằng vector token, lọc thô bằng SimHash, sau đó gom cụm theo độ
 * tương đồng cosine trong cửa sổ thời gian. Cụm >= 5 phản hồi, tương
 * đồng TB > 0.90, trong 48 giờ được đánh dấu là cụm nghi vấn.
 *
 * Khi có vector nhúng ViSoBERT (`it._embedding`), nó là kênh BỔ SUNG, không
 * thay thế: một cặp được tính là trùng lặp nếu vector token HOẶC vector nhúng
 * vượt ngưỡng. Nhờ vậy bật mô hình không bao giờ làm mất một cụm mà vector
 * token đã bắt được. Mọi ràng buộc thời gian và mật độ giữ nguyên.
 *
 * GIỚI HẠN ĐÃ ĐO: vector nhúng của trọng số gốc KHÔNG tách được câu viết lại
 * bằng từ khác khỏi câu không liên quan (hai nhóm chồng lấn hoàn toàn ở vùng
 * cosine 0.3–0.6). Ở ngưỡng an toàn nó chỉ bổ sung các bản chép gần nguyên
 * văn mà vector token bỏ sót, ví dụ khi có chèn ký tự. Muốn bắt câu viết lại
 * phải tinh chỉnh bộ mã hóa theo kiểu học tương phản trên cặp câu đồng nghĩa.
 */
function detectNearDuplicateClusters(items, config = DUPLICATE_CONFIG) {
  const windowMs = config.windowHours * 3600 * 1000;
  const embeddingThreshold = config.embeddingSimilarityThreshold ?? DUPLICATE_CONFIG.embeddingSimilarityThreshold;
  const prepared = items.map((it, idx) => ({
    idx,
    time: new Date(it.timestamp || Date.now()).getTime(),
    hash: simHash(it._normalized),
    vector: termVector(it._normalized),
    embedding: it._embedding || null,
    productName: it.productName || 'unknown'
  }));

  const assigned = new Array(items.length).fill(-1);
  const clusters = [];

  for (let i = 0; i < prepared.length; i++) {
    if (assigned[i] !== -1) continue;

    const seed = prepared[i];
    const members = [i];
    const sims = [];

    for (let j = i + 1; j < prepared.length; j++) {
      if (assigned[j] !== -1) continue;
      const cand = prepared[j];
      if (Math.abs(cand.time - seed.time) > windowMs) continue;

      // Lọc thô: SimHash cách nhau quá xa thì bỏ qua cosine của vector token
      const tokenSim = hammingDistance(seed.hash, cand.hash) > 12
        ? 0
        : cosineSimilarity(seed.vector, cand.vector);
      const embeddingSim = seed.embedding && cand.embedding
        ? dotProduct(seed.embedding, cand.embedding)
        : null;
      const tokenHit = tokenSim >= config.similarityThreshold;
      const embeddingHit = embeddingSim !== null && embeddingSim >= embeddingThreshold;

      if (tokenHit || embeddingHit) {
        members.push(j);
        sims.push(tokenHit ? tokenSim : embeddingSim);
      }
    }

    if (members.length < config.minClusterSize) continue;

    const times = members.map((m) => prepared[m].time);
    const spanMs = Math.max(...times) - Math.min(...times);

    // Ràng buộc trên TOÀN CỤM, không chỉ so với phần tử hạt giống: một
    // cụm trải 4 ngày không phải chiến dịch, dù từng cặp có cách nhau
    // dưới 48 giờ.
    if (spanMs > windowMs) continue;

    const spanHours = Math.max(spanMs / 3600000, 1 / 60);
    const density = members.length / spanHours;
    if (density < config.minDensityPerHour) continue;

    const clusterId = clusters.length;
    members.forEach((m) => {
      assigned[m] = clusterId;
    });
    clusters.push({
      clusterId,
      size: members.length,
      memberIndexes: members,
      avgSimilarity: sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 1,
      spanMinutes: Math.round(spanMs / 60000),
      densityPerHour: Number(density.toFixed(2)),
      productName: seed.productName,
      sampleText: items[i].originalText
    });
  }

  return { clusters, assignment: assigned };
}

/**
 * TÍN HIỆU (2): ĐỘT BIẾN THỜI GIAN (burst detection).
 * Xây chuỗi số phản hồi theo giờ cho từng sản phẩm/gian hàng, làm trơn
 * bằng EWMA và tính điểm z so với nền. Đột biến |z| > 3 kết hợp tỉ lệ
 * tài khoản mới cao bất thường là dấu hiệu của chiến dịch có tổ chức.
 */
const BURST_Z_THRESHOLD = 3;

function detectBursts(items) {
  const byProduct = new Map();
  items.forEach((it, idx) => {
    const key = it.productName || 'unknown';
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push({ idx, time: new Date(it.timestamp || Date.now()).getTime(), item: it });
  });

  const burstScore = new Array(items.length).fill(0);
  const bursts = [];

  const WINDOW_MS = 3600 * 1000; // cửa sổ 1 giờ, trượt theo từng phản hồi

  for (const [product, entries] of byProduct) {
    if (entries.length < 8) continue;
    entries.sort((a, b) => a.time - b.time);

    // Cửa sổ TRƯỢT thay vì khung giờ cố định: một chiến dịch rải qua
    // ranh giới 08:59-09:01 vẫn phải bị bắt, không được lọt vì rơi vào
    // hai ô khác nhau.
    const windowCounts = entries.map((e) => {
      let c = 0;
      for (const other of entries) {
        if (Math.abs(other.time - e.time) <= WINDOW_MS / 2) c += 1;
      }
      return c;
    });

    // Nền phải được ước lượng BỀN VỮNG (robust). Nếu dùng trung bình và
    // độ lệch chuẩn thường, chính đợt đột biến sẽ thổi phồng độ lệch
    // chuẩn của cái nền mà nó đang bị đem ra so — càng nhiều đánh giá
    // thuê thì z càng nhỏ, đúng ngược với điều ta cần. Vì vậy dùng
    // trung vị và MAD, hai đại lượng không bị ngoại lệ kéo đi.
    const sorted = windowCounts.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviations = windowCounts.map((c) => Math.abs(c - median)).sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)];
    // 1.4826 đưa MAD về cùng thang với độ lệch chuẩn dưới phân phối chuẩn
    const robustSd = mad * 1.4826 || 1;

    const reported = new Set();
    entries.forEach((e, i) => {
      const z = (windowCounts[i] - median) / robustSd;
      if (z <= BURST_Z_THRESHOLD) return;

      const neighbours = entries.filter((o) => Math.abs(o.time - e.time) <= WINDOW_MS / 2);
      const newAccounts = neighbours.filter((o) => {
        const age = o.item.accountAgeDays;
        return Number.isFinite(age) && age < NEW_ACCOUNT_DAYS;
      }).length;
      const newAccountRatio = neighbours.length ? newAccounts / neighbours.length : 0;

      // z cao là điều kiện cần; tỉ lệ tài khoản mới cao bất thường là
      // thứ nâng nó thành dấu hiệu của chiến dịch có tổ chức
      const score = Math.min(1, (z / 6) * (0.5 + newAccountRatio));
      burstScore[e.idx] = Math.max(burstScore[e.idx], score);

      const bucketKey = Math.floor(e.time / WINDOW_MS);
      if (!reported.has(bucketKey)) {
        reported.add(bucketKey);
        bursts.push({
          productName: product,
          windowStart: new Date(e.time - WINDOW_MS / 2).toISOString(),
          count: neighbours.length,
          z: Number(z.toFixed(2)),
          newAccountRatio: Number(newAccountRatio.toFixed(2))
        });
      }
    });
  }

  return { burstScore, bursts };
}

/**
 * TÍN HIỆU (3): BẤT THƯỜNG HÀNH VI TÀI KHOẢN.
 * Đặc trưng: tuổi tài khoản, số đánh giá trung bình mỗi ngày, tỉ lệ
 * đánh giá cực trị (chỉ 1 sao hoặc chỉ 5 sao), và phương sai khoảng
 * cách thời gian giữa các đánh giá — phương sai thấp bất thường là dấu
 * vết của hành vi tự động. Phát hiện bằng Isolation Forest, không cần
 * nhãn (vì ta không có nhãn "tài khoản ảo" đã được xác minh).
 */
function detectAccountAnomalies(items) {
  const byAuthor = new Map();
  items.forEach((it, idx) => {
    const key = (it.author || 'Anonymous').trim();
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push({ idx, item: it });
  });

  const authors = [...byAuthor.keys()];
  const features = authors.map((a) => {
    const entries = byAuthor.get(a);
    const times = entries
      .map((e) => new Date(e.item.timestamp || Date.now()).getTime())
      .sort((x, y) => x - y);

    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 60000);

    const spanDays = Math.max(1, (times[times.length - 1] - times[0]) / 86400000);
    const reviewsPerDay = entries.length / spanDays;

    const rated = entries.filter((e) => Number.isFinite(e.item.rating));
    const extreme = rated.filter((e) => e.item.rating === 1 || e.item.rating === 5).length;
    const extremeRatio = rated.length ? extreme / rated.length : 0.5;

    const ages = entries
      .map((e) => e.item.accountAgeDays)
      .filter((v) => Number.isFinite(v));
    const accountAge = ages.length ? Math.min(...ages) : 365;

    // Phương sai thấp bất thường của khoảng cách thời gian = hành vi tự
    // động. Dùng log để nén thang đo, và đảo dấu để "đều đặn bất
    // thường" trở thành giá trị lớn.
    const gapVar = variance(gaps);
    const regularity = gaps.length >= 2 ? 1 / (1 + Math.log1p(gapVar)) : 0;

    return [
      Math.log1p(accountAge),
      reviewsPerDay,
      extremeRatio,
      regularity,
      entries.length
    ];
  });

  const scores = isolationForestScores(features, { trees: 100, sampleSize: 256, seed: 2026 });

  /**
   * Isolation Forest cô lập điểm HIẾM. Nhưng khi một chiến dịch thuê
   * chiếm tỉ trọng lớn trong lô dữ liệu, các tài khoản ảo không còn
   * hiếm nữa và rừng sẽ không cô lập được chúng — đúng lúc ta cần nó
   * nhất. Vì vậy bổ sung một lớp luật cho các dấu hiệu xác minh được
   * trực tiếp, rồi lấy giá trị lớn hơn giữa hai lớp.
   */
  function ruleBasedAccountRisk(f) {
    const [logAge, reviewsPerDay, extremeRatio, regularity, count] = f;
    const ageDays = Math.expm1(logAge);
    let risk = 0;
    // Tài khoản mới lập chỉ để đăng đúng một đánh giá cực trị
    if (ageDays < NEW_ACCOUNT_DAYS && count <= 2 && extremeRatio >= 0.99) risk = Math.max(risk, 0.75);
    else if (ageDays < NEW_ACCOUNT_DAYS) risk = Math.max(risk, 0.45);
    // Tần suất đăng bất khả thi với người thật
    if (reviewsPerDay > 5) risk = Math.max(risk, 0.6);
    // Khoảng cách giữa các đánh giá đều đặn bất thường = hành vi tự động
    if (regularity > 0.85 && count >= 4) risk = Math.max(risk, 0.65);
    return risk;
  }

  const perItem = new Array(items.length).fill(0.5);
  const perAuthor = {};
  authors.forEach((a, i) => {
    const forestExcess = Math.max(0, (scores[i] - 0.5) * 2);
    const combined = Math.max(forestExcess, ruleBasedAccountRisk(features[i]));
    // Đưa về lại thang của Isolation Forest để phần sau xử lý đồng nhất
    scores[i] = 0.5 + combined / 2;

    perAuthor[a] = {
      score: scores[i],
      forestScore: Number(forestExcess.toFixed(3)),
      ruleRisk: Number(ruleBasedAccountRisk(features[i]).toFixed(3)),
      accountAgeDays: features[i][0] ? Math.round(Math.expm1(features[i][0])) : null,
      reviewsPerDay: Number(features[i][1].toFixed(2)),
      extremeRatio: Number(features[i][2].toFixed(2)),
      regularity: Number(features[i][3].toFixed(3)),
      reviewCount: features[i][4]
    };
    for (const e of byAuthor.get(a)) perItem[e.idx] = scores[i];
  });

  return { perItem, perAuthor };
}

/**
 * TÍN HIỆU (4): BẤT NHẤT GIỮA ĐIỂM SAO VÀ NỘI DUNG VĂN BẢN.
 * Người viết thuê thường đặt điểm sao theo yêu cầu nhưng viết nội dung
 * qua loa hoặc lệch nghĩa. Đo bằng độ lệch giữa điểm sao chuẩn hóa và
 * điểm cảm xúc do mô hình ABSA dự đoán.
 *
 * Hai trường hợp là chỉ dấu mạnh:
 *   - 5 sao đi kèm nội dung tiêu cực,
 *   - 1 sao đi kèm nội dung chung chung không nêu được khía cạnh nào.
 */
function starTextMismatch(fb, normalized) {
  if (!Number.isFinite(fb.rating)) {
    return { score: 0, available: false, note: 'Không có điểm sao để đối chiếu' };
  }
  // Cần CẢ HAI vế để so lệch. Thiếu nhãn cảm xúc thì tín hiệu không
  // khả dụng — không được coi là bằng chứng bất nhất.
  if (!fb.sentiment) {
    return { score: 0, available: false, note: 'Chưa có nhãn cảm xúc để đối chiếu' };
  }

  const starPolarity = (fb.rating - 3) / 2; // 1 sao -> -1, 5 sao -> +1
  const sentimentPolarity =
    fb.sentiment === 'Positive' ? 1 : fb.sentiment === 'Negative' ? -1 : 0;

  // Chỉ tính phần lệch VƯỢT QUÁ mức chấp nhận được: 4 sao kèm nội dung
  // trung tính là chuyện thường, không phải dấu hiệu gian lận. Chỉ khi
  // lệch từ nửa thang trở lên mới bắt đầu tính điểm.
  const rawGap = Math.abs(starPolarity - sentimentPolarity) / 2; // [0,1]
  const gap = Math.max(0, (rawGap - 0.25) / 0.75);

  // 1 sao nhưng nội dung chung chung, không nêu khía cạnh nào cụ thể
  const vague =
    fb.rating <= 2 &&
    normalized.syllables < 8 &&
    !/(chậm|hỏng|lỗi|móp|vỡ|thiếu|mất|đắt|thái độ|hoàn tiền)/.test(normalized.normalized);

  const score = Math.min(1, gap + (vague ? 0.4 : 0));
  const notes = [];
  if (fb.rating === 5 && fb.sentiment === 'Negative') notes.push('5 sao nhưng nội dung tiêu cực');
  if (fb.rating === 1 && fb.sentiment === 'Positive') notes.push('1 sao nhưng nội dung tích cực');
  if (vague) notes.push('Điểm sao thấp nhưng nội dung không nêu khía cạnh cụ thể');

  return { score, available: true, note: notes.join('; ') || null };
}

/**
 * TÍN HIỆU (5): BẤT NHẤT GIỮA NỘI DUNG VÀ DỮ LIỆU GIAO DỊCH.
 * Chỉ áp dụng cho nguồn hạng P1-P2. Đối soát nội dung phản hồi với đơn
 * hàng thực tế: phản hồi nhắc tới sản phẩm/tính năng không có trong
 * đơn, hoặc thời điểm viết đánh giá TRƯỚC thời điểm giao hàng.
 *
 * Đây là tín hiệu có độ chính xác cao nhất trong năm nhóm, và là lý do
 * trực tiếp để nhóm lựa chọn mô hình dữ liệu first-party.
 */
/** Dưới mức phủ này thì sổ đơn hàng coi như chưa đồng bộ đủ để kết luận */
const ORDERBOOK_COVERAGE_FLOOR = 0.5;

/** Dung sai lệch thời gian giữa mốc "đã giao" và lúc khách thực nhận hàng */
const TRANSACTION_TIME_TOLERANCE_HOURS = 12;

function transactionMismatch(fb, orderIndex, orderBookCoverage = 1) {
  if (!fb.orderId || !orderIndex) {
    return { score: 0, available: false, note: 'Không đối soát được giao dịch' };
  }

  // Chưa kết nối nguồn dữ liệu giao dịch thì tín hiệu này KHÔNG khả
  // dụng — không được suy ra "đơn không tồn tại". Đây là chế độ suy
  // giảm: hệ thống vẫn chạy, Data Health Score hiển thị thấp hơn, và
  // chính điều đó tạo động lực để doanh nghiệp kết nối thêm nguồn.
  if (orderIndex.size === 0) {
    return { score: 0, available: false, note: 'Chưa kết nối dữ liệu giao dịch' };
  }

  const order = orderIndex.get(fb.orderId);
  if (!order) {
    // "Không tìm thấy đơn" là bằng chứng YẾU và chỉ có nghĩa khi sổ đơn
    // hàng đã đồng bộ gần đủ. Một lần đồng bộ thiếu của doanh nghiệp
    // không được phép biến toàn bộ khiếu nại thật thành "review ảo" —
    // đó là kiểu lỗi đắt nhất mà tầng này có thể mắc phải.
    if (orderBookCoverage < ORDERBOOK_COVERAGE_FLOOR) {
      return {
        score: 0,
        available: false,
        note: `Sổ đơn hàng mới đồng bộ ${Math.round(orderBookCoverage * 100)}%, chưa đủ để kết luận`
      };
    }
    return { score: 0.6, available: true, note: 'Mã đơn không tìm thấy trong hệ thống bán hàng' };
  }

  const notes = [];
  let score = 0;

  const reviewTime = new Date(fb.timestamp || Date.now()).getTime();
  const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt).getTime() : null;
  if (deliveredAt && reviewTime < deliveredAt) {
    const hoursEarly = (deliveredAt - reviewTime) / 3600000;

    // Dung sai bắt buộc: mốc "đã giao" thường được đơn vị vận chuyển
    // đồng bộ TRỄ vài giờ so với lúc khách thực sự cầm hàng. Khách nhận
    // hàng lúc 9h rồi đánh giá ngay, trong khi hệ thống ghi nhận giao
    // lúc 14h là chuyện bình thường — không phải bằng chứng gian lận.
    // Chỉ khi đánh giá đi trước ngày giao một khoảng đủ lớn thì mới có
    // nghĩa là người viết chưa hề nhận được hàng.
    if (hoursEarly > TRANSACTION_TIME_TOLERANCE_HOURS) {
      score = Math.max(score, 0.95);
      notes.push(
        `Đánh giá được viết trước thời điểm giao hàng ${Math.round(hoursEarly)} giờ`
      );
    }
  }

  if (order.productName && fb.productName && order.productName !== fb.productName) {
    score = Math.max(score, 0.8);
    notes.push('Sản phẩm được nhắc tới không nằm trong đơn hàng');
  }

  return { score, available: true, note: notes.join('; ') || null };
}

// ------------------------------------------------------------------
// TỔNG HỢP: MÔ HÌNH HỒI QUY LOGISTIC -> ĐIỂM XÁC THỰC A
// ------------------------------------------------------------------

/**
 * A = sigma( b0 + SUM bi * xi )
 *
 * TRUNG THỰC VỀ TRẠNG THÁI HIỆN TẠI: các hệ số dưới đây là giá trị
 * hiệu chỉnh ban đầu (calibrated prior) do nhóm đặt theo độ tin cậy
 * tương đối của từng tín hiệu, CHƯA phải hệ số học được từ dữ liệu.
 * Chúng sẽ được thay bằng hệ số huấn luyện trên tập ~1.000 phản hồi
 * gán nhãn thủ công (hàm fitAuthenticityModel bên dưới đã sẵn sàng
 * nhận tập đó).
 *
 * Kèm theo là giới hạn diễn giải, cần ghi thẳng vào thuyết minh: nhãn
 * "không xác thực" là phán đoán của người gán dựa trên dấu hiệu quan
 * sát được, không phải sự thật đã được xác minh — vì không có cách nào
 * xác minh tuyệt đối một đánh giá là thật hay giả từ dữ liệu công
 * khai. Do đó các chỉ số của tầng này được diễn giải là MỨC ĐỘ ĐỒNG
 * THUẬN VỚI ĐÁNH GIÁ CỦA CON NGƯỜI, không phải độ chính xác tuyệt đối.
 */
const AUTHENTICITY_MODEL = {
  intercept: -3.2,
  coefficients: {
    duplicate: 4.0,           // cụm trùng lặp hoàn hảo -> tự nó đủ đưa vào vùng xám
    burst: 2.5,
    accountAnomaly: 2.6,
    starMismatch: 2.8,
    transactionMismatch: 4.5  // tín hiệu chính xác nhất -> tự nó đủ để loại
  },
  trained: false,
  trainedOn: null,
  note: 'Hệ số hiệu chỉnh ban đầu, chưa huấn luyện trên tập gán nhãn'
};

const AUTHENTICITY_BANDS = {
  reject: 0.7, // A >= 0.70: nhiều khả năng không xác thực
  gray: 0.4    // 0.40 <= A < 0.70: vùng xám, đưa vào hàng đợi kiểm duyệt
};

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function authenticityScore(features, model = AUTHENTICITY_MODEL) {
  const c = model.coefficients;
  const z =
    model.intercept +
    c.duplicate * features.duplicate +
    c.burst * features.burst +
    c.accountAnomaly * features.accountAnomaly +
    c.starMismatch * features.starMismatch +
    c.transactionMismatch * features.transactionMismatch;
  return sigmoid(z);
}

function authenticityBand(A) {
  if (A >= AUTHENTICITY_BANDS.reject) {
    return {
      band: 'LIKELY_INAUTHENTIC',
      labelVi: 'Nhiều khả năng không xác thực',
      action: 'Loại khỏi mọi phép tính chỉ số; vẫn lưu để phục vụ báo cáo và truy vết'
    };
  }
  if (A >= AUTHENTICITY_BANDS.gray) {
    return {
      band: 'GRAY_ZONE',
      labelVi: 'Vùng xám',
      action: 'Đưa vào hàng đợi kiểm duyệt của người dùng; tạm giữ trọng số giảm'
    };
  }
  return {
    band: 'ACCEPTED',
    labelVi: 'Chấp nhận',
    action: 'Đưa vào phân tích với trọng số đầy đủ'
  };
}

/**
 * Huấn luyện hệ số bằng gradient descent trên tập gán nhãn thủ công.
 * Gọi hàm này khi tập 1.000 mẫu (hợp lệ / rác / nghi ngờ không xác
 * thực) đã sẵn sàng; kết quả thay thẳng vào AUTHENTICITY_MODEL.
 *
 * @param {Array<{features:object, label:number}>} samples label 1 = không xác thực
 */
function fitAuthenticityModel(samples, opts = {}) {
  const lr = opts.learningRate ?? 0.1;
  const epochs = opts.epochs ?? 500;
  const keys = ['duplicate', 'burst', 'accountAnomaly', 'starMismatch', 'transactionMismatch'];

  let intercept = 0;
  const coef = Object.fromEntries(keys.map((k) => [k, 0]));

  for (let e = 0; e < epochs; e++) {
    let gradB = 0;
    const gradC = Object.fromEntries(keys.map((k) => [k, 0]));

    for (const s of samples) {
      let z = intercept;
      for (const k of keys) z += coef[k] * (s.features[k] || 0);
      const err = sigmoid(z) - s.label;
      gradB += err;
      for (const k of keys) gradC[k] += err * (s.features[k] || 0);
    }

    const n = Math.max(1, samples.length);
    intercept -= (lr * gradB) / n;
    for (const k of keys) coef[k] -= (lr * gradC[k]) / n;
  }

  return {
    intercept,
    coefficients: coef,
    trained: true,
    trainedOn: samples.length,
    note: `Huấn luyện trên ${samples.length} mẫu gán nhãn thủ công`
  };
}

// ==================================================================
// T3 — TRỌNG SỐ HỢP NHẤT
// ==================================================================

/** Chu kỳ bán rã mặc định, cấu hình được theo ngành */
const DEFAULT_HALF_LIFE_DAYS = 30;

/**
 * w = w(hạng nguồn) x (1 - A) x d(t),  d(t) = 0.5^(t/H)
 *
 * So với đếm thô, trọng số này cho ba thứ: không bị thổi phồng bởi các
 * chiến dịch đánh giá có tổ chức; phản ánh đúng mức tin cậy khác nhau
 * giữa các kênh; và ưu tiên tín hiệu gần hiện tại.
 */
function unifiedWeight(tierWeight, A, ageDays, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
  const decay = Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
  return tierWeight * (1 - A) * decay;
}

// ==================================================================
// ĐIỀU PHỐI — CHẠY TOÀN BỘ TRUST LAYER TRÊN MỘT LÔ DỮ LIỆU
// ==================================================================

/**
 * @param {Array} feedbacks danh sách phản hồi thô
 * @param {{ orders?: Array, halfLifeDays?: number, now?: Date,
 *           modelSignals?: Array<{ spamScore?: number|null, embedding?: ArrayLike<number>|null }> }} options
 *        modelSignals căn thẳng hàng với feedbacks, lấy từ visobert_client.trustSignals().
 *        Hàm này giữ ĐỒNG BỘ và không gọi mạng; tín hiệu mô hình được tính trước ở tầng gọi.
 * @returns {{ items: Array, clusters: Array, bursts: Array, funnel: object }}
 */
function runTrustLayer(feedbacks, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const halfLife = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;

  const orderIndex = new Map();
  for (const o of options.orders || []) orderIndex.set(o.orderId, o);

  // Độ phủ của sổ đơn hàng: bao nhiêu phần trăm phản hồi có mã đơn thực
  // sự tra được. Quyết định việc tín hiệu (5) có đủ tin cậy để kết luận.
  const withOrderId = feedbacks.filter((f) => f.orderId);
  const orderBookCoverage = withOrderId.length
    ? withOrderId.filter((f) => orderIndex.has(f.orderId)).length / withOrderId.length
    : 0;

  // --- Chuẩn hóa văn bản + T0 + T1 ---
  const modelSignals = Array.isArray(options.modelSignals) ? options.modelSignals : [];
  const items = feedbacks.map((fb, idx) => {
    const normalized = normalize(fb.originalText);
    const provenance = assignProvenanceTier(fb);
    const ms = modelSignals[idx] || {};
    const spam = runSpamFilter(fb, normalized, ms.spamScore ?? null);
    return {
      ...fb,
      _normalized: normalized.normalized,
      _norm: normalized,
      _embedding: ms.embedding || null,
      provenance,
      spam
    };
  });

  // Nội dung rác bị loại khỏi các tín hiệu T2 — không để spam làm nhiễu
  // thống kê đột biến và cụm trùng lặp của dữ liệu hợp lệ
  const clean = items.filter((it) => !it.spam.isSpam);
  const cleanIndexMap = new Map();
  clean.forEach((it, i) => cleanIndexMap.set(it, i));

  // --- T2: năm nhóm tín hiệu ---
  const { clusters, assignment } = detectNearDuplicateClusters(clean);
  const embeddingsUsed = clean.filter((it) => it._embedding).length;
  // Vector 768 chiều mỗi phản hồi không được đi tiếp vào ngữ cảnh dùng
  // chung — nó sẽ bị trả nguyên ra API ở những endpoint trả item thô
  for (const it of items) delete it._embedding;

  const { burstScore, bursts } = detectBursts(clean);
  const { perItem: accountScores, perAuthor } = detectAccountAnomalies(clean);

  for (const it of items) {
    if (it.spam.isSpam) {
      it.trust = {
        tier: it.provenance.tier,
        tierWeight: it.provenance.tierWeight,
        authenticityScore: null,
        band: 'SPAM',
        bandLabelVi: 'Nội dung rác / quảng cáo',
        action: 'Loại khỏi mọi phép tính chỉ số; vẫn lưu để truy vết',
        weight: 0,
        signals: { spamReasons: it.spam.reasons }
      };
      continue;
    }

    const i = cleanIndexMap.get(it);
    const clusterId = assignment[i];
    const cluster = clusterId >= 0 ? clusters[clusterId] : null;

    // Isolation Forest cho điểm quanh 0.5 với hành vi bình thường; chỉ
    // phần vượt trên 0.5 mới mang nghĩa "bất thường"
    const accountRaw = accountScores[i];
    const accountFeature = Math.max(0, (accountRaw - 0.5) * 2);

    const star = starTextMismatch(it, it._norm);
    const txn = transactionMismatch(
      it,
      it.provenance.tier === 'P1' || it.provenance.tier === 'P2' ? orderIndex : null,
      orderBookCoverage
    );

    const features = {
      duplicate: cluster ? Math.min(1, cluster.avgSimilarity * (cluster.size / 10)) : 0,
      burst: burstScore[i] || 0,
      accountAnomaly: accountFeature,
      starMismatch: star.score,
      transactionMismatch: txn.score
    };

    const A = authenticityScore(features);
    const band = authenticityBand(A);

    const ageDays = (now.getTime() - new Date(it.timestamp || now).getTime()) / 86400000;
    const rejected = band.band === 'LIKELY_INAUTHENTIC';
    const weight = rejected ? 0 : unifiedWeight(it.provenance.tierWeight, A, ageDays, halfLife);

    // Yêu cầu bắt buộc về tính giải thích được: mỗi phản hồi bị gắn cờ
    // phải hiển thị rõ tín hiệu nào đã kích hoạt và ở mức nào. Một hệ
    // thống chỉ nói "review này đáng ngờ" mà không nói vì sao thì doanh
    // nghiệp không tin, và cũng không kiểm chứng được.
    const triggered = [];
    if (features.duplicate > 0) {
      triggered.push({
        signal: 'Trùng lặp gần về nội dung',
        value: Number(features.duplicate.toFixed(2)),
        detail: `Cụm ${cluster.size} phản hồi, tương đồng TB ${cluster.avgSimilarity.toFixed(2)}, trong ${cluster.spanMinutes} phút`
      });
    }
    if (features.burst > 0.1) {
      triggered.push({
        signal: 'Đột biến thời gian',
        value: Number(features.burst.toFixed(2)),
        detail: 'Mật độ phản hồi trong cửa sổ 1 giờ vượt 3 lần độ lệch bền vững (MAD) so với nền'
      });
    }
    if (accountFeature > 0.2) {
      triggered.push({
        signal: 'Bất thường hành vi tài khoản',
        value: Number(accountFeature.toFixed(2)),
        detail: 'Isolation Forest trên tuổi tài khoản, tần suất, tỉ lệ đánh giá cực trị, độ đều đặn'
      });
    }
    if (star.score > 0.2) {
      triggered.push({
        signal: 'Bất nhất điểm sao và nội dung',
        value: Number(star.score.toFixed(2)),
        detail: star.note
      });
    }
    if (txn.score > 0) {
      triggered.push({
        signal: 'Bất nhất với dữ liệu giao dịch',
        value: Number(txn.score.toFixed(2)),
        detail: txn.note
      });
    }

    it.trust = {
      tier: it.provenance.tier,
      tierWeight: it.provenance.tierWeight,
      reconciliation: it.provenance.reconciliation,
      canTriggerHighAlert: it.provenance.canTriggerHighAlert,
      authenticityScore: Number(A.toFixed(4)),
      band: band.band,
      bandLabelVi: band.labelVi,
      action: band.action,
      weight: Number(weight.toFixed(4)),
      clusterId: clusterId >= 0 ? clusterId : null,
      features,
      triggeredSignals: triggered,
      // Entropy dự đoán: dùng để sắp xếp hàng đợi kiểm duyệt ở T4
      uncertainty: Number((1 - Math.abs(A - 0.5) * 2).toFixed(4))
    };
  }

  const funnel = buildFunnel(items, clusters, now);

  return {
    items,
    clusters: clusters.map((c) => ({
      ...c,
      memberIds: c.memberIndexes.map((mi) => clean[mi]._id).filter(Boolean)
    })),
    bursts,
    accountProfiles: perAuthor,
    funnel,
    modelSignals: {
      embeddingsUsed,
      spamScoresUsed: items.filter((it) => it.spam.modelScore !== null).length
    }
  };
}

// ==================================================================
// T5 — CHỈ SỐ SỨC KHỎE DỮ LIỆU VÀ TÍNH MINH BẠCH
// ==================================================================

/**
 * Toàn bộ hoạt động của Trust Layer được hiển thị công khai dưới dạng
 * một phễu, thay vì ẩn trong hệ thống. Chỉ số Sức khỏe Dữ liệu là
 * trung bình có trọng số của bốn thành phần: tỉ lệ dữ liệu vượt qua
 * Trust Layer, độ phủ kênh, độ tươi của dữ liệu, và tỉ lệ đối soát
 * được giao dịch.
 *
 * Chỉ số này đặt ở vị trí nổi bật vì nó trả lời trực tiếp câu hỏi mà
 * mọi người dùng doanh nghiệp đều có khi nhìn một dashboard phân tích:
 * "Tôi có nên tin những con số này không?"
 */
const EXPECTED_CHANNELS = 5;

const HEALTH_WEIGHTS = { passRate: 0.4, channelCoverage: 0.2, freshness: 0.2, reconciliation: 0.2 };

function buildFunnel(items, clusters, now = new Date()) {
  const total = items.length;
  const spam = items.filter((it) => it.trust.band === 'SPAM');
  const inauthentic = items.filter((it) => it.trust.band === 'LIKELY_INAUTHENTIC');
  const gray = items.filter((it) => it.trust.band === 'GRAY_ZONE');
  const accepted = items.filter((it) => it.trust.band === 'ACCEPTED');

  const channels = new Set(items.map((it) => it.source).filter(Boolean));
  const reconcilable = items.filter(
    (it) => it.trust.tier === 'P1' || it.trust.tier === 'P2'
  ).length;

  const ages = items.map(
    (it) => (now.getTime() - new Date(it.timestamp || now).getTime()) / 86400000
  );
  const medianAge = ages.length ? ages.slice().sort((a, b) => a - b)[Math.floor(ages.length / 2)] : 0;

  // Độ tươi đo ĐỘ TRỄ THU THẬP, không phải bề dày lịch sử. Có 60 ngày
  // dữ liệu quá khứ là điểm mạnh chứ không phải điểm yếu; thứ đáng lo
  // là luồng dữ liệu đã ngừng chảy. Vì vậy đo theo phản hồi mới nhất.
  const newestAgeDays = ages.length ? Math.min(...ages) : Infinity;
  const ingestionLagHours = Number.isFinite(newestAgeDays) ? newestAgeDays * 24 : null;

  const passRate = total ? (accepted.length + gray.length) / total : 0;
  const channelCoverage = Math.min(1, channels.size / EXPECTED_CHANNELS);
  // Trễ dưới 1 giờ là đầy đủ điểm; quá 24 giờ coi như luồng đã đứt
  const freshness = ingestionLagHours === null
    ? 0
    : Math.max(0, Math.min(1, 1 - (ingestionLagHours - 1) / 23));
  const reconciliationRate = total ? reconcilable / total : 0;

  const score =
    HEALTH_WEIGHTS.passRate * passRate +
    HEALTH_WEIGHTS.channelCoverage * channelCoverage +
    HEALTH_WEIGHTS.freshness * freshness +
    HEALTH_WEIGHTS.reconciliation * reconciliationRate;

  const pct = (n) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);

  return {
    rawCollected: total,
    spamRemoved: { count: spam.length, pct: pct(spam.length) },
    inauthenticFlagged: {
      count: inauthentic.length,
      pct: pct(inauthentic.length),
      duplicateClusters: clusters.length
    },
    pendingReview: { count: gray.length, pct: pct(gray.length) },
    validForAnalysis: accepted.length,
    // Tổng trọng số: mẫu số thật của mọi chỉ số phía sau
    effectiveWeight: Number(
      items.reduce((sum, it) => sum + (it.trust.weight || 0), 0).toFixed(2)
    ),
    channelCoverage: { covered: channels.size, expected: EXPECTED_CHANNELS },
    reconciliationRate: Number((reconciliationRate * 100).toFixed(1)),
    medianAgeDays: Number(medianAge.toFixed(1)),
    ingestionLagMinutes: ingestionLagHours === null ? null : Math.round(ingestionLagHours * 60),
    dataHealthScore: Math.round(score * 100),
    components: {
      passRate: Number((passRate * 100).toFixed(1)),
      channelCoverage: Number((channelCoverage * 100).toFixed(1)),
      freshness: Number((freshness * 100).toFixed(1)),
      reconciliation: Number((reconciliationRate * 100).toFixed(1))
    }
  };
}

/**
 * T4 — HÀNG ĐỢI KIỂM DUYỆT VÀ HỌC CHỦ ĐỘNG.
 * Sắp xếp theo ĐỘ BẤT ĐỊNH của mô hình (entropy dự đoán cao nhất được
 * ưu tiên trước) thay vì theo thời gian. Cách sắp xếp này tối đa hóa
 * lượng thông tin thu được trên mỗi thao tác của người dùng.
 */
function buildReviewQueue(items, limit = 50) {
  return items
    .filter((it) => it.trust && it.trust.band === 'GRAY_ZONE')
    .sort((a, b) => b.trust.uncertainty - a.trust.uncertainty)
    .slice(0, limit)
    .map((it) => ({
      _id: it._id,
      author: it.author,
      source: it.source,
      productName: it.productName,
      originalText: it.originalText,
      timestamp: it.timestamp,
      authenticityScore: it.trust.authenticityScore,
      uncertainty: it.trust.uncertainty,
      tier: it.trust.tier,
      triggeredSignals: it.trust.triggeredSignals
    }));
}

module.exports = {
  PROVENANCE_TIERS,
  AUTHENTICITY_BANDS,
  AUTHENTICITY_MODEL,
  DEFAULT_HALF_LIFE_DAYS,
  DUPLICATE_CONFIG,
  SPAM_MODEL_THRESHOLD,
  HEALTH_WEIGHTS,
  assignProvenanceTier,
  runSpamFilter,
  detectNearDuplicateClusters,
  detectBursts,
  detectAccountAnomalies,
  starTextMismatch,
  transactionMismatch,
  authenticityScore,
  authenticityBand,
  fitAuthenticityModel,
  unifiedWeight,
  runTrustLayer,
  buildFunnel,
  buildReviewQueue
};
