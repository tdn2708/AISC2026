/**
 * ĐIỂM ĐAU CỤ THỂ — tìm thẳng từ câu chữ gốc, hàm thuần
 * ==================================================================
 * 7 nhóm vấn đề và 27 nguyên nhân cho biết BỘ PHẬN nào phải sửa, nhưng quá
 * thô để giao việc: cùng "lỗi kỹ thuật", chuột thì "mất kết nối", tai nghe thì
 * "chỉ nghe được một bên". Lớp này tìm chuyện cụ thể đó, cho MỌI mảng hàng,
 * không cần danh sách nào viết trước.
 *
 * Cách làm (không gọi mạng, không dùng LLM, chạy được với mọi cách gán nhãn):
 *  1. Mỗi phản hồi được tính (`isCountable`) -> chuẩn hóa (teencode, che PII),
 *     cắt theo dấu câu, tách cụm 2 đến 4 âm tiết. So khớp trên dạng BỎ DẤU, vì
 *     khách gõ không dấu ("mat ket noi") vẫn là cùng một chuyện.
 *  2. Với mỗi mảng hàng: tập "chê" = phản hồi tiêu cực của mảng; tập "nền" =
 *     mọi phản hồi được tính còn lại (khen cùng mảng + chê mảng khác). Cụm
 *     nào chỉ là tên hàng thì khen cũng nhắc -> bị nền triệt; cụm chê chung
 *     chung ("không nên mua") mảng nào cũng có -> cũng bị triệt.
 *  3. Chấm từng cụm bằng tỉ số log-odds giữa hai tập (đếm theo số phản hồi
 *     có cụm, không đếm số lần lặp trong một câu), z = log-odds / sai số chuẩn.
 *  4. Giữ cụm đủ mạnh và đủ rộng: z >= Z_MIN, xuất hiện ở >= 3 khách khác
 *     nhau trong >= 2 ngày khác nhau (một người viết 10 câu không thành điểm đau).
 *  5. Gộp cụm chồng nhau ("mất kết nối" và "bị mất kết nối") thành một điểm đau.
 * Mảng có ít câu chê hơn MIN_NEGATIVES thì KHÔNG tách: trả "chưa đủ câu".
 *
 * Giới hạn biết trước: bắt được chuyện nhiều người nói GIỐNG NHAU; cùng một lỗi
 * mà mỗi người tả bằng chữ khác hẳn thì có thể bị tách vụn hoặc sót.
 */

const metrics = require('./metrics');
const taxonomy = require('./taxonomy');
const { normalize } = require('./normalizer');
const { buildGrouper, nameTokens, SOURCE_LABEL, ALL_SHOP } = require('./product_group');

const DAY = 86400000;
const MIN_NEGATIVES = 15;
const MIN_CUSTOMERS = 3;
const MIN_DAYS = 2;
const Z_MIN = 2.5;
const LIFT_MIN = 2;
const MAX_PER_GROUP = 6;
const OVERLAP_MERGE = 0.5;
const MIN_BACKGROUND = 10;
const Z_SIDE = 1.5;
const SUBSET_MERGE = 0.8;
const SPREAD_MAX = 0.5;
const MIN_GROUPS_FOR_SPREAD = 3;
const SHOP_CAUSE_SHARE = 0.6;
const GROUP_CAUSE_SHARE = 0.5;
const MAX_N = 4;

/** Bỏ toàn bộ dấu: "mất kết nối" -> "mat ket noi" (đ -> d) */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd');
}

/**
 * Từ hư tiếng Việt (dạng bỏ dấu): không được đứng ĐẦU hoặc CUỐI một cụm.
 * Chỉ là từ chức năng chung của tiếng Việt, không có từ nào của một mảng hàng.
 * "khong", "chua", "bi" được đứng đầu: "không kết nối", "bị lệch" là chuyện thật.
 */
const EDGE_STOP = new Set(('a ah a ạ ai anh ba bao ban bay ben bi biet bon ca cac cai cam cho chi chiec chu chua co con cu cua cung da dang day de den deu di do dung duoc em gi gio gium giup ha hai hay het hoac hoi hon hu khi khien kho khong ko kia la lai lam len luc luon ma may minh moi mot muon nao nay neu nen nhe nha nhi nhieu nhu nhung nua nam o oi ok qua ra rang rat roi sao se so sp san pham shop ta tai thay the them thi thoi thuc toi tot trong tren tu tuy va vao vay ve vi voi vua xai xong xin').split(' '));
const START_OK = new Set(['khong', 'chua', 'bi', 'không', 'chưa', 'bị']);
/** Từ hư mà cả cụm chỉ toàn những từ này thì bỏ (thêm vài từ chung chung) */
const ALL_STOP = new Set([...EDGE_STOP, 'hang', 'mua', 'nhan', 'giao', 'dung', 'su', 'cam', 'on']);

/**
 * Cùng danh sách, dạng CÓ DẤU. Chữ có dấu chỉ so với danh sách này: bỏ dấu rồi so
 * thì chữ có nghĩa trùng dạng với từ hư và bị bỏ oan ("ố" thành "o" như "ở", "bàn"
 * thành "ban" như "bạn", "máy" thành "may" như "mấy", "đèn" thành "den" như "đến"),
 * nên "ố vàng", "bàn phím ...", "máy ..." không bao giờ đứng đầu cụm. Chữ gõ không
 * dấu vẫn so với danh sách bỏ dấu ở trên (không biết người gõ định chữ nào).
 */
const EDGE_STOP_VI = new Set(('à ạ á ah ai anh ba bao bạn bây bên bị biết bốn cả các cái cảm cho chỉ chiếc chứ chưa có còn cứ của cũng đã đang đây để đề đến đều đi đó dùng được em gì giờ giùm giúp hả hai hay hết hoặc hỏi hơi hơn hử khi khiến khó không kia là lại làm lên lúc luôn mà mấy mình mỗi mới một muốn nào này nếu nên nhé nha nhà nhỉ nhiều như nhưng nữa năm ở ơi quá ra rằng rất rồi sao sẽ số sản phẩm ta tại thấy thế thêm thì thôi thực tôi tốt trong trên từ tuy và vào vậy về vì với vừa xài xong xin').split(' '));
const ALL_STOP_VI = new Set([...EDGE_STOP_VI, 'hàng', 'mua', 'nhận', 'giao', 'dùng', 'sự', 'cảm', 'ơn']);
const hasMarks = (w) => fold(w) !== w;
/** Từ hư? Chữ có dấu so danh sách có dấu; chữ không dấu so danh sách bỏ dấu */
const isStop = (word, folded, accentedSet, foldedSet) => (hasMarks(word) ? accentedSet.has(word) : foldedSet.has(folded));

// Kết quả tách cụm cho từng phản hồi: tính một lần, dùng lại giữa các bộ lọc.
// Khóa là chính đối tượng phản hồi, nên ngữ cảnh mới (đối tượng mới) tự bỏ bộ nhớ cũ.
const gramCache = new WeakMap();

/**
 * Các cụm 2 đến 4 âm tiết của một câu, mỗi cụm một lần.
 * @returns {Map<string, string>} khóa bỏ dấu -> dạng có dấu gặp đầu tiên
 */
function gramsOf(f) {
  const hit = gramCache.get(f);
  if (hit) return hit;
  const out = new Map();
  const text = normalize(String(f.originalText || f.text || '')).normalized;
  const segments = text.split(/[.,!?;:…\n\r()"“”'\-–—/\\|*~+=<>[\]{}]+/u);
  for (const seg of segments) {
    const words = seg.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (words.length < 2) continue;
    const lower = words.map((w) => w.toLowerCase());
    const folded = lower.map(fold);
    const edge = (j) => isStop(lower[j], folded[j], EDGE_STOP_VI, EDGE_STOP);
    for (let i = 0; i < words.length; i += 1) {
      if (edge(i) && !START_OK.has(lower[i])) continue;
      if (/^\d+$/.test(folded[i])) continue;
      for (let n = 2; n <= MAX_N && i + n <= words.length; n += 1) {
        const last = folded[i + n - 1];
        if (edge(i + n - 1) || /^\d+$/.test(last)) continue;
        const slice = folded.slice(i, i + n);
        if (slice.every((w, j) => isStop(lower[i + j], w, ALL_STOP_VI, ALL_STOP))) continue;
        // Khóa giữ DẤU: bỏ hết dấu thì 'nhận tín' (tín hiệu) trùng 'nhắn tin'. Cụm gõ
        // hoàn toàn không dấu giữ dạng bỏ dấu, rồi được quy về dạng có dấu phổ biến nhất (gramsWithAlias)
        const surface = words.slice(i, i + n).join(' ').toLowerCase();
        const foldedKey = slice.join(' ');
        const key = surface === foldedKey ? foldedKey : surface;
        if (!out.has(key)) out.set(key, words.slice(i, i + n).join(' '));
      }
    }
  }
  gramCache.set(f, out);
  return out;
}

/**
 * Cụm của từng phản hồi, cụm gõ không dấu đã quy về dạng có dấu phổ biến nhất trong
 * chính tập này ('mat ket noi' -> 'mất kết nối'). Không có dạng có dấu nào thì giữ nguyên.
 */
function gramsWithAlias(items) {
  const counts = new Map();
  for (const f of items) for (const k of gramsOf(f).keys()) counts.set(k, (counts.get(k) || 0) + 1);
  const best = new Map();
  for (const [k, n] of counts) {
    const fk = fold(k);
    if (fk === k) continue;
    const cur = best.get(fk);
    if (!cur || n > cur.n) best.set(fk, { k, n });
  }
  const memo = new WeakMap();
  return (f) => {
    let m = memo.get(f);
    if (m) return m;
    m = new Map();
    for (const [k, surface] of gramsOf(f)) {
      const to = fold(k) === k ? best.get(k)?.k || k : k;
      if (!m.has(to)) m.set(to, surface);
    }
    memo.set(f, m);
    return m;
  };
}

const isNegative = (f) => f.sentiment === 'Negative';
const customerOf = (f) => String(f.customerId || f.author || f._id);
const dayOf = (f) => {
  // Dòng nạp không có ngày: không biết ngày nào (không gộp chung vào ngày nạp)
  if (f.timeInferred) return null;
  const t = new Date(f.timestamp).getTime();
  return Number.isFinite(t) ? Math.floor(t / DAY) : null;
};

/** z của tỉ số log-odds giữa hai tỉ lệ y1/n1 và y2/n2 (cộng 0,5 mỗi ô) */
function logOddsZ(y1, n1, y2, n2) {
  const a = 0.5;
  const delta = Math.log((y1 + a) / (n1 - y1 + a)) - Math.log((y2 + a) / (n2 - y2 + a));
  const se = Math.sqrt(1 / (y1 + a) + 1 / (n1 - y1 + a) + 1 / (y2 + a) + 1 / (n2 - y2 + a));
  return { z: delta / se, logOdds: delta };
}

function mostCommon(counter) {
  let best = null;
  let bestN = -1;
  for (const [k, n] of counter) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function snippet(text, max = 220) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Dạng phản hồi trả cho giao diện (đã che PII từ lúc nạp) */
function exampleOf(f) {
  return {
    id: String(f._id),
    text: snippet(f.originalText),
    rating: f.rating ?? null,
    productName: f.productName || null,
    source: f.source || null,
    timestamp: f.timestamp || null,
    evidence: f.trust ? (['P1', 'P2'].includes(f.trust.tier) ? 'verified' : f.labelledBy === 'human' ? 'human' : 'inferred') : 'inferred'
  };
}

/**
 * Tóm tắt một tập phản hồi: khách, ngày, sản phẩm, nhóm vấn đề chiếm đa số,
 * xu hướng 4 tuần gần nhất so với 4 tuần trước đó.
 */
function summarize(list, nowMs, trendDays = 28) {
  const T = trendDays * DAY;
  const customers = new Set();
  const days = new Set();
  const products = new Map();
  const causes = new Map();
  const sources = new Map();
  let weight = 0;
  let first = Infinity;
  let last = -Infinity;
  let recent = 0;
  let previous = 0;
  let verified = 0;
  let unlabelled = 0;
  for (const f of list) {
    if (!f.category || f.category === 'Other') unlabelled += 1;
    customers.add(customerOf(f));
    const d = dayOf(f);
    if (d != null) days.add(d);
    weight += Number(f.trust?.weight) || 0;
    if (f.productName) products.set(f.productName, (products.get(f.productName) || 0) + 1);
    if (f.source) sources.set(f.source, (sources.get(f.source) || 0) + 1);
    if (f.category && f.category !== 'Other') {
      const k = `${f.category}|${f.subCategory || ''}`;
      causes.set(k, (causes.get(k) || 0) + 1);
    }
    if (['P1', 'P2'].includes(f.trust?.tier)) verified += 1;
    const t = f.timeInferred ? NaN : new Date(f.timestamp).getTime();
    if (Number.isFinite(t)) {
      if (t < first) first = t;
      if (t > last) last = t;
      const age = nowMs - t;
      if (age >= 0 && age < T) recent += 1;
      else if (age >= T && age < 2 * T) previous += 1;
    }
  }
  const top = mostCommon(causes);
  const [category, cause] = top ? top.split('|') : [null, null];
  const topCount = top ? causes.get(top) : 0;
  return {
    count: list.length,
    customers: customers.size,
    days: days.size,
    weight: Number(weight.toFixed(4)),
    verified,
    firstSeen: Number.isFinite(first) ? new Date(first).toISOString() : null,
    lastSeen: Number.isFinite(last) ? new Date(last).toISOString() : null,
    trend: { recent, previous, days: trendDays },
    category: category || null,
    categoryLabel: category ? taxonomy.categoryLabel(category) : null,
    cause: cause || null,
    causeLabel: category && cause ? taxonomy.causeLabel(category, cause) : null,
    causeShare: list.length ? topCount / list.length : 0,
    // Tỉ lệ câu chưa phân loại được (nhãn Khác): cao thì không đo được độ tập trung nguyên nhân
    unlabelledShare: list.length ? unlabelled / list.length : 0,
    owner: category ? taxonomy.categoryOwner(category) : null,
    products: [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, count: n })),
    sources: [...sources.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n }))
  };
}

/** Phản hồi tiêu biểu: có chứng từ trước, rồi trọng số cao, rồi mới nhất */
function pickExamples(list, k = 5) {
  return [...list]
    .sort((a, b) =>
      (['P1', 'P2'].includes(b.trust?.tier) ? 1 : 0) - (['P1', 'P2'].includes(a.trust?.tier) ? 1 : 0) ||
      (Number(b.trust?.weight) || 0) - (Number(a.trust?.weight) || 0) ||
      new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, k)
    .map(exampleOf);
}

/** Khóa ổn định của một điểm đau: dùng làm đường dẫn hồ sơ */
const painKey = (groupKey, phraseKey) => `${groupKey}::${phraseKey}`;

/**
 * Tìm điểm đau trong từng mảng hàng.
 * @param {Array} items phản hồi đã qua Trust Layer (đã lọc theo bộ lọc trang)
 * @param {{ now?: Date|string|number, groupFilter?: (key: string) => boolean }} opts
 *   groupFilter: chỉ tính các mảng được chọn (kiểm mù dùng để giấu mảng)
 */
function findPainPoints(items, opts = {}) {
  const nowMs = opts.now != null ? new Date(opts.now).getTime() : Date.now();
  // Độ dài kỳ so xu hướng (kỳ gần nhất so với kỳ liền trước): theo nhịp của kho
  const trendDays = Math.max(28, Number(opts.trendDays) || 28);
  const countable = items.filter(metrics.isCountable);
  const groupOf = buildGrouper(countable);

  // Nhóm phản hồi theo mảng; đếm tần suất cụm: trong từng mảng, và trong mọi câu chê
  const groups = new Map();
  const negDf = new Map();
  let totalNeg = 0;
  const G = gramsWithAlias(countable);
  const totalDf = new Map();
  for (const f of countable) {
    const g = groupOf(f);
    for (const k of G(f).keys()) totalDf.set(k, (totalDf.get(k) || 0) + 1);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [], negatives: [], df: new Map() });
    const entry = groups.get(g.key);
    entry.items.push(f);
    const neg = isNegative(f);
    if (neg) { entry.negatives.push(f); totalNeg += 1; }
    for (const k of G(f).keys()) {
      entry.df.set(k, (entry.df.get(k) || 0) + 1);
      if (neg) negDf.set(k, (negDf.get(k) || 0) + 1);
    }
  }
  const N = countable.length;

  // Độ PHỦ của cụm qua các mảng: câu chê có cụm này xuất hiện ở bao nhiêu mảng
  // đủ lớn. Lời chê chung ("thất vọng", "hỗ trợ") mảng nào cũng có -> không phải
  // điểm đau riêng của mảng nào. Đo từ chính dữ liệu, không có danh sách viết tay.
  const bigGroups = [...groups.values()].filter((g) => g.negatives.length >= MIN_NEGATIVES);
  const spread = new Map();
  for (const g of bigGroups) {
    const seen = new Set();
    for (const f of g.negatives) for (const k of G(f).keys()) seen.add(k);
    for (const k of seen) spread.set(k, (spread.get(k) || 0) + 1);
  }
  const spreadMax = bigGroups.length >= MIN_GROUPS_FOR_SPREAD ? Math.ceil(bigGroups.length * SPREAD_MAX) : Infinity;

  /**
   * Đào điểm đau trong một tập. mode 'group': một mảng hàng, bỏ cụm phủ quá nhiều
   * mảng (chuyện chung của shop). mode 'shop': cả shop, CHỈ giữ cụm phủ nhiều mảng
   * (giao chậm, shop không trả lời...) và phải dồn vào một nguyên nhân rõ ràng
   * (câu cảm thán chung "thất vọng" rải đều mọi nguyên nhân nên bị loại).
   */
  const mine = (g, mode) => {
    const base = {
      key: g.key,
      label: g.label,
      source: g.source,
      sourceLabel: SOURCE_LABEL[g.source],
      scope: mode,
      feedbacks: g.items.length,
      negatives: g.negatives.length,
      negativeShare: g.items.length ? g.negatives.length / g.items.length : 0
    };
    if (g.negatives.length < MIN_NEGATIVES) {
      return { ...base, status: 'too_few', minNegatives: MIN_NEGATIVES, painPoints: [], uncovered: g.negatives.length, examples: pickExamples(g.negatives, 3) };
    }

    // Tần suất cụm trong tập chê
    const fgDocs = new Map();
    const surfaces = new Map();
    for (const f of g.negatives) {
      for (const [k, surface] of G(f)) {
        if (!fgDocs.has(k)) { fgDocs.set(k, []); surfaces.set(k, new Map()); }
        fgDocs.get(k).push(f);
        const s = surfaces.get(k);
        s.set(surface, (s.get(surface) || 0) + 1);
      }
    }
    // Điểm chính: so với MỌI câu được tính còn lại. Hai nền phụ, chỉ cần không thua:
    //  (a) câu không chê của CÙNG tập: triệt tên hàng ("nồi cơm" khen chê đều nhắc);
    //  (b) câu chê của các mảng KHÁC (chỉ ở mode group): triệt lời chê chung.
    // Nền nào quá nhỏ để so (shop một mảng, mảng gần như toàn chê) thì bỏ qua nền đó.
    const n1 = g.negatives.length;
    const n0 = N - n1;
    const nA = g.items.length - n1;
    const nB = totalNeg - n1;
    const useMain = n0 >= MIN_BACKGROUND;
    const useA = nA >= MIN_BACKGROUND;
    const useB = mode === 'group' && nB >= MIN_BACKGROUND;
    // Chữ trong tên sản phẩm và tên mảng: cụm chỉ gồm những chữ này là tên hàng
    const nameWords = new Set(nameTokens(g.label).map(fold));
    for (const f of g.items) for (const w of nameTokens(f.productName)) nameWords.add(fold(w));
    const candidates = [];
    for (const [k, docs] of fgDocs) {
      const y1 = docs.length;
      if (y1 < MIN_CUSTOMERS) continue;
      if (mode === 'group' && fold(k).split(' ').every((w) => nameWords.has(w) || ALL_STOP.has(w))) continue;
      const sp = spread.get(k) || 0;
      if (mode === 'group' && sp >= spreadMax) continue;
      if (mode === 'shop' && sp < spreadMax) continue;
      const y0 = (totalDf.get(k) || 0) - y1;
      const yA = (g.df.get(k) || 0) - y1;
      const yB = (negDf.get(k) || 0) - y1;
      // Cả shop: "mọi câu còn lại" chính là câu không chê, nên điểm chính là nền (a)
      const z = mode === 'shop' ? (useA ? logOddsZ(y1, n1, yA, nA).z : null) : (useMain ? logOddsZ(y1, n1, y0, n0).z : null);
      if (z == null || z < Z_MIN) continue;
      const lift = mode === 'shop' ? (y1 / n1) / ((yA + 0.5) / (nA + 0.5)) : (y1 / n1) / ((y0 + 0.5) / (n0 + 0.5));
      if (lift < LIFT_MIN) continue;
      const zA = mode === 'group' && useA ? logOddsZ(y1, n1, yA, nA).z : null;
      const zB = useB ? logOddsZ(y1, n1, yB, nB).z : null;
      if ((zA != null && zA < Z_SIDE) || (zB != null && zB < Z_SIDE)) continue;
      const customers = new Set(docs.map(customerOf));
      const days = new Set(docs.map(dayOf).filter((d) => d != null));
      // Dòng không có ngày không chứng minh được là dồn vào một ngày: mỗi dòng tính như một ngày chưa biết
      const undated = docs.filter((f) => f.timeInferred).length;
      if (customers.size < MIN_CUSTOMERS || days.size + undated < MIN_DAYS) continue;
      candidates.push({ key: k, label: mostCommon(surfaces.get(k)), docs, y1, y0, yA, yB, z, zA, zB, lift, spread: sp, len: k.split(' ').length });
    }
    // Mạnh trước; cùng độ mạnh thì cụm dài trước (nghĩa trọn hơn)
    candidates.sort((a, b) => b.z - a.z || b.len - a.len);

    const chosen = [];
    for (const c of candidates) {
      const cSet = new Set(c.docs);
      let merged = false;
      for (const p of chosen) {
        let inter = 0;
        for (const d of cSet) if (p.docSet.has(d)) inter += 1;
        const union = cSet.size + p.docSet.size - inter;
        const contains = ` ${c.key} `.includes(` ${p.key} `) || ` ${p.key} `.includes(` ${c.key} `);
        // Hai cụm nối đuôi nhau ("nhận tín" + "tín hiệu") hoặc chung một chữ
        // ("mất kết" + "kết nối") và cùng nằm trong phần lớn các câu của cụm nhỏ hơn
        const cw = fold(c.key).split(' ');
        const pw = fold(p.key).split(' ');
        const touches = cw.some((w) => pw.includes(w) && !ALL_STOP.has(w));
        const ofSmaller = inter / Math.min(cSet.size, p.docSet.size);
        if ((contains && inter > 0) || inter / union >= OVERLAP_MERGE ||
            (touches && ofSmaller >= 0.5) || ofSmaller >= SUBSET_MERGE) {
          p.phrases.push(c);
          for (const d of cSet) p.docSet.add(d);
          merged = true;
          break;
        }
      }
      if (merged) continue;
      if (chosen.length >= MAX_PER_GROUP * 2) continue;
      chosen.push({ ...c, docSet: cSet, phrases: [c] });
    }
    // Nhãn: cụm DÀI nhất mà vẫn phủ >= 70% số câu của cụm phủ nhiều nhất
    // ("không hoạt" và "không hoạt động" cùng phủ một tập câu -> lấy cụm dài)
    for (const p of chosen) {
      const maxDocs = Math.max(...p.phrases.map((x) => x.y1));
      const best = p.phrases
        .filter((x) => x.y1 >= 0.7 * maxDocs)
        .sort((a, b) => b.len - a.len || b.y1 - a.y1)[0];
      p.label = best.label;
      p.variants = p.phrases.map((x) => x.label).filter((l) => l !== best.label);
    }

    const covered = new Set();
    const painPoints = [];
    const groupUnlabelled = n1 ? g.negatives.filter((f) => !f.category || f.category === 'Other').length / n1 : 0;
    for (const p of chosen) {
      const list = [...p.docSet];
      const s = summarize(list, nowMs, trendDays);
      // Cả shop: phải dồn vào MỘT nguyên nhân (giao chậm, shop im lặng...).
      // Một mảng: quá nửa câu chưa được phân loại (nhãn "Khác", thường do lớp luật khi
      // hết hạn mức mô hình) thì không đo được độ tập trung nguyên nhân; vẫn giữ điểm
      // đau và ghi "chưa rõ nguyên nhân" thay vì bỏ đi chuyện khách lặp lại rõ nhất.
      // Chỉ khi CẢ mảng chủ yếu chưa phân loại (bộ gán nhãn không đọc ra), không phải
      // vì riêng cụm này nhiều câu "Khác" (mảng đã gán nhãn tốt thì cụm đó là cụm yếu)
      const unlabelled = s.unlabelledShare >= 0.5 && groupUnlabelled >= 0.5;
      if (mode === 'shop' || !unlabelled) {
        if (s.causeShare < (mode === 'shop' ? SHOP_CAUSE_SHARE : GROUP_CAUSE_SHARE)) continue;
      }
      for (const d of list) covered.add(d);
      const point = {
        key: painKey(g.key, p.key),
        phrase: p.label,
        variants: [...new Set(p.variants)].slice(0, 6),
        phraseKeys: p.phrases.map((x) => x.key),
        ...s,
        shareOfNegatives: s.count / n1,
        // Số liệu kiểm định: chỉ hiện trong phần "Số liệu kiểm định"
        stats: {
          z: Number(p.z.toFixed(2)),
          zSameGroup: p.zA != null ? Number(p.zA.toFixed(2)) : null,
          zOtherNegatives: p.zB != null ? Number(p.zB.toFixed(2)) : null,
          lift: Number(p.lift.toFixed(2)),
          groupsWithPhrase: p.spread,
          groupsTotal: bigGroups.length,
          inNegatives: p.y1, negatives: n1,
          inRest: mode === 'shop' ? p.yA : p.y0, rest: mode === 'shop' ? nA : n0,
          inOtherNegatives: useB ? p.yB : null, otherNegatives: useB ? nB : null
        },
        examples: pickExamples(list)
      };
      // Toàn bộ phản hồi của điểm đau, không đi ra JSON (chỉ để dựng hồ sơ)
      Object.defineProperty(point, 'members', { value: list, enumerable: false });
      painPoints.push(point);
      if (painPoints.length >= MAX_PER_GROUP) break;
    }
    painPoints.sort((a, b) => b.weight - a.weight || b.count - a.count);
    return { ...base, status: painPoints.length ? 'ok' : 'none', painPoints, uncovered: n1 - covered.size, examples: painPoints.length ? [] : pickExamples(g.negatives, 3) };
  };

  const out = [];
  for (const g of groups.values()) {
    if (opts.groupFilter && !opts.groupFilter(g.key, g.label)) continue;
    out.push(mine(g, 'group'));
  }
  out.sort((a, b) => b.negatives - a.negatives);

  // Chuyện chung của cả shop: chỉ khi có đủ mảng để biết cụm nào là "chung"
  let shop = null;
  if (Number.isFinite(spreadMax) && !opts.groupFilter) {
    const all = { key: 'shop', label: ALL_SHOP, source: 'shop', items: countable, negatives: countable.filter(isNegative), df: totalDf };
    shop = mine(all, 'shop');
    shop.sourceLabel = 'chuyện lặp lại ở nhiều mảng hàng';
  }
  return {
    groups: out,
    shop,
    thresholds: { minNegatives: MIN_NEGATIVES, minCustomers: MIN_CUSTOMERS, minDays: MIN_DAYS, zMin: Z_MIN, liftMin: LIFT_MIN },
    counted: N
  };
}

/** Phản hồi thuộc một điểm đau (để dựng hồ sơ): cùng mảng, câu chê có cụm hoặc biến thể */
function painPointMembers(items, key, opts = {}) {
  const result = findPainPoints(items, opts);
  const [groupKey] = String(key).split('::');
  const group = groupKey === 'shop' ? result.shop : result.groups.find((g) => g.key === groupKey);
  const point = group?.painPoints.find((p) => p.key === key) || null;
  return { group: group || null, point, result };
}

module.exports = { findPainPoints, painPointMembers, gramsOf, gramsWithAlias, fold, logOddsZ, painKey, MIN_NEGATIVES };
