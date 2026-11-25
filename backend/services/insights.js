/**
 * CÁC TÍNH NĂNG XÂY TRÊN NGỮ CẢNH PHÂN TÍCH
 * ==================================================================
 *   1. Kiểm tra ngẫu nhiên do người làm  — đo độ chính xác THẬT của nhãn AI
 *   2. Hiệu quả sau quyết định            — tỉ lệ khiếu nại trước / sau
 *   3. So sánh hai sản phẩm               — kèm kiểm định khác biệt
 *   4. Soạn nháp trả lời khách            — prompt có ràng buộc + bản mẫu dự phòng
 *
 * Mọi hàm ở đây là hàm thuần trên ctx.items (đã qua Trust Layer); phần đọc /
 * ghi database nằm ở routes/api.js.
 */

const metrics = require('./metrics');
const taxonomy = require('./taxonomy');
const { wilsonInterval, twoProportionZTest } = require('./statistics');

const crypto = require('crypto');

const DAY = 86400000;
const AUDIT_TARGET = 300;

/**
 * BỘ TEST MÙ CỐ ĐỊNH: ~15% phản hồi, chọn theo mã băm của id nên không đổi
 * giữa các lần chạy và không phụ thuộc ai chọn. Nhãn người trên các phản hồi
 * này là tập kiểm tra; script xuất dữ liệu huấn luyện LUÔN loại chúng ra.
 */
const BLIND_PERCENT = 15;
function isBlindTest(id) {
  const h = crypto.createHash('sha1').update(String(id)).digest();
  return h.readUInt32BE(0) % 100 < BLIND_PERCENT;
}

/**
 * CHIA BỘ GOLD THEO SẢN PHẨM (chống rò rỉ giữa train/dev/test của ViSoBERT v5):
 * Băm SHA-1 tên sản phẩm đã chuẩn hóa để MỌI đánh giá của cùng một sản phẩm
 * luôn nằm trọn về một phía (`test` ~35%, `dev` ~15%, `train` ~50%).
 * Không đụng `isBlindTest` cũ (đang dùng ở hàng đợi kiểm tra cũ).
 */
const GOLD_TEST_PERCENT = 35;
const GOLD_DEV_PERCENT = 15;
function normalizeProductKey(productName) {
  return String(productName || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function goldSplit(productName, { testPercent = GOLD_TEST_PERCENT, devPercent = GOLD_DEV_PERCENT } = {}) {
  const key = normalizeProductKey(productName);
  if (!key) return 'train';
  const h = crypto.createHash('sha1').update(`gold-v5|${key}`).digest();
  const bucket = h.readUInt32BE(0) % 100;
  if (bucket < testPercent) return 'test';
  if (bucket < testPercent + devPercent) return 'dev';
  return 'train';
}

/** Bốn hàng đợi duyệt: chỉ "random" được dùng để đo độ chính xác */
const AUDIT_MODES = ['random', 'sarcasm', 'review', 'gold'];
const inQueue = (f, mode) =>
  mode === 'sarcasm' ? Boolean(f.sarcasm?.suspected) && f.sarcasm?.by !== 'human'
    : mode === 'review' ? f.needsReview === true
      : mode === 'gold' ? Boolean(f.originalText && String(f.originalText).trim().length >= 4)
        : true;

// ==================================================================
// 1. KIỂM TRA NGẪU NHIÊN & LẤY MẪU BỘ CHUẨN (GOLD)
// ==================================================================

function shuffleWith(arr, rand) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Lấy mẫu phân tầng cho hàng đợi `mode=gold` (mục 3.4 kế hoạch v5):
 *  - Ưu tiên sản phẩm đồ gia dụng (`isApplianceProduct`); nếu kho thử không có
 *    tên gia dụng thì lấy trên toàn kho để vẫn chạy được khi kiểm thử.
 *  - Trong mỗi lô `n` câu: ~75% là khiếu nại/câu có nhóm vấn đề (xoay vòng theo L2
 *    để các L2 hiếm cũng có mẫu, ưu tiên BlueStone nếu có), ~25% phân tầng theo sao
 *    (1-2 sao, 3 sao, 4-5 sao) để bộ gold có đủ câu đối chứng tích cực/trung tính.
 */
function sampleGoldStratified(items, labelledIds, n = 10, rand = Math.random) {
  const unlabelled = items.filter((f) => inQueue(f, 'gold') && !labelledIds.has(String(f._id)));
  const appliances = unlabelled.filter((f) => taxonomy.isApplianceProduct(f.productName, f.productCategory));
  const pool = appliances.length > 0 ? appliances : unlabelled;
  if (!pool.length) return { items: [], remaining: 0 };

  const isIssue = (f) => f.sentiment === 'Negative' || (f.sentiment === 'Neutral' && f.category && f.category !== 'Other');
  const isBlueStone = (f) => /bluestone/i.test(String(f.productName || ''));

  // Chia nhóm khiếu nại theo L2 để quay vòng công bằng
  const issueByCause = new Map();
  const restByStar = { low: [], mid: [], high: [] };
  for (const f of pool) {
    if (isIssue(f)) {
      const k = f.subCategory || f.category || 'Other';
      if (!issueByCause.has(k)) issueByCause.set(k, []);
      issueByCause.get(k).push(f);
    } else {
      const r = Number(f.rating);
      if (Number.isFinite(r) && r <= 2) restByStar.low.push(f);
      else if (Number.isFinite(r) && r === 3) restByStar.mid.push(f);
      else restByStar.high.push(f);
    }
  }

  // Xáo trong từng nhóm nhưng đưa BlueStone lên trước nếu có
  const sortGroup = (arr) => {
    const bs = shuffleWith(arr.filter(isBlueStone), rand);
    const other = shuffleWith(arr.filter((f) => !isBlueStone(f)), rand);
    return [...bs, ...other];
  };
  for (const [k, arr] of issueByCause.entries()) issueByCause.set(k, sortGroup(arr));
  restByStar.low = sortGroup(restByStar.low);
  restByStar.mid = sortGroup(restByStar.mid);
  restByStar.high = sortGroup(restByStar.high);

  const picked = [];
  const pickedIds = new Set();
  const take = (f) => {
    if (!f || pickedIds.has(String(f._id))) return false;
    pickedIds.add(String(f._id));
    picked.push(f);
    return true;
  };

  const issueTarget = Math.min(pool.length, Math.max(1, Math.round(n * 0.75)));
  const causeKeys = shuffleWith([...issueByCause.keys()], rand);
  let progressed = true;
  while (picked.length < issueTarget && progressed) {
    progressed = false;
    for (const k of causeKeys) {
      if (picked.length >= issueTarget) break;
      const arr = issueByCause.get(k);
      if (arr && arr.length) {
        take(arr.shift());
        progressed = true;
      }
    }
  }

  const starBuckets = [restByStar.low, restByStar.mid, restByStar.high];
  progressed = true;
  while (picked.length < n && progressed) {
    progressed = false;
    for (const b of starBuckets) {
      if (picked.length >= n) break;
      if (b.length) {
        take(b.shift());
        progressed = true;
      }
    }
  }

  // Nếu vẫn chưa đủ n (ví dụ kho toàn khiếu nại), lấy nốt từ các nhóm còn lại
  if (picked.length < n) {
    for (const f of shuffleWith(pool, rand)) {
      if (picked.length >= n) break;
      take(f);
    }
  }

  return { items: picked, remaining: pool.length };
}

/**
 * Lấy ngẫu nhiên ĐỀU trên các phản hồi được tính vào chỉ số, bỏ những phản
 * hồi đã kiểm. Ngẫu nhiên đều (không chọn theo độ bất định như hàng đợi
 * kiểm duyệt) là điều kiện để tỉ lệ đúng đo được đại diện cho cả kho.
 */
function auditSample(items, labelledIds, n = 10, rand = Math.random, mode = 'random') {
  if (mode === 'gold') return sampleGoldStratified(items, labelledIds, n, rand);
  // Hàng nghi mỉa mai / cần duyệt lấy cả phản hồi trọng số 0 (vd. bị hạ trọng số oan vì lệch sao)
  const pool = items.filter((f) => (mode === 'random' ? metrics.isCountable(f) : true) && inQueue(f, mode) && !labelledIds.has(String(f._id)));
  // Fisher–Yates một phần: chỉ xáo n phần tử đầu
  const arr = pool.slice();
  const k = Math.min(n, arr.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { items: arr.slice(0, k), remaining: pool.length };
}

/** Kết quả kiểm tra: tỉ lệ AI đúng, khoảng tin cậy 95%, tách theo nguồn gán nhãn */
function auditSummary(allLabels) {
  // Độ chính xác chỉ đo trên mẫu NGẪU NHIÊN: hàng nghi mỉa mai / cần duyệt toàn
  // câu khó, tính vào sẽ kéo con số xuống và không đại diện cho cả kho
  const labels = allLabels.filter((l) => !l.sampleMode || l.sampleMode === 'random');
  const sarcasmLabelled = allLabels.filter((l) => typeof l.sarcasm === 'boolean');
  const goldLabels = allLabels.filter((l) => l.sampleMode === 'gold' || Array.isArray(l.correctRootCauses));
  const goldBySplit = { train: 0, dev: 0, test: 0 };
  for (const l of goldLabels) {
    const sp = l.goldSplit || goldSplit(l.productName);
    if (goldBySplit[sp] != null) goldBySplit[sp] += 1;
  }
  const n = labels.length;
  const cat = labels.filter((l) => l.categoryCorrect).length;
  const sent = labels.filter((l) => l.sentimentCorrect).length;
  const byLabeller = {};
  for (const l of labels) {
    const k = l.labelledBy || 'synthetic';
    byLabeller[k] ||= { n: 0, categoryCorrect: 0, sentimentCorrect: 0 };
    byLabeller[k].n += 1;
    if (l.categoryCorrect) byLabeller[k].categoryCorrect += 1;
    if (l.sentimentCorrect) byLabeller[k].sentimentCorrect += 1;
  }
  // Lỗi hay gặp nhất: AI nói X, người sửa thành Y — chỉ ra phải cải thiện ở đâu
  const confusions = {};
  for (const l of labels) {
    if (l.categoryCorrect || !l.correctCategory) continue;
    const key = `${l.aiCategory || 'Other'}>${l.correctCategory}`;
    confusions[key] = (confusions[key] || 0) + 1;
  }
  return {
    n,
    target: AUDIT_TARGET,
    reviewers: [...new Set(labels.map((l) => l.by).filter(Boolean))].length,
    category: wilsonInterval(cat, n),
    sentiment: wilsonInterval(sent, n),
    byLabeller,
    topConfusions: Object.entries(confusions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, count]) => {
        const [from, to] = k.split('>');
        const label = (c) => (c === 'Other' ? 'Không nêu vấn đề' : taxonomy.categoryLabel(c));
        return { from: label(from), to: label(to), count };
      }),
    method: 'Lấy mẫu ngẫu nhiên đều trên phản hồi được tính vào chỉ số; khoảng tin cậy 95% theo Wilson. Hàng nghi mỉa mai và hàng cần duyệt không tính vào con số này.',
    totalReviewed: allLabels.length,
    byMode: Object.fromEntries(AUDIT_MODES.map((m) => [m, allLabels.filter((l) => (l.sampleMode || 'random') === m).length])),
    sarcasm: { labelled: sarcasmLabelled.length, sarcastic: sarcasmLabelled.filter((l) => l.sarcasm).length },
    gold: {
      total: goldLabels.length,
      withRootCauses: goldLabels.filter((l) => Array.isArray(l.correctRootCauses) && l.correctRootCauses.length > 0).length,
      bySplit: goldBySplit
    },
    blindTest: allLabels.filter((l) => isBlindTest(l.feedbackId)).length
  };
}

/** Dựng danh sách bản ghi bộ gold (nhãn người) kèm thông tin chia theo sản phẩm */
function buildGoldExport(feedbacks, auditLabels) {
  const byId = new Map((feedbacks || []).map((f) => [String(f._id), f]));
  const rows = [];
  const bySplit = { train: 0, dev: 0, test: 0 };
  const testProducts = new Set();
  const rootCounts = {};

  for (const l of auditLabels || []) {
    const fb = byId.get(String(l.feedbackId));
    if (!fb) continue;
    const productName = fb.productName || l.productName || '';
    const productType = fb.productType || taxonomy.productTypeOf(productName) || null;
    const split = l.goldSplit || goldSplit(productName);
    const category = l.correctCategory === 'Other' ? null : (l.correctCategory || null);
    const cause = category ? (l.correctCause || null) : null;
    const rootCauses = taxonomy.normalizeRootCauses(l.correctRootCauses, { nonComplaint: !category });

    if (bySplit[split] != null) bySplit[split] += 1;
    if (split === 'test' && productName) testProducts.add(productName);
    for (const r of rootCauses) rootCounts[r] = (rootCounts[r] || 0) + 1;

    rows.push({
      feedbackId: String(l.feedbackId),
      text: fb.originalText || '',
      rating: fb.rating ?? null,
      productName,
      productType,
      productCategory: fb.productCategory || null,
      source: fb.source || null,
      sentiment: l.correctSentiment || fb.sentiment || 'Neutral',
      category,
      cause,
      rootCauses,
      sarcasm: typeof l.sarcasm === 'boolean' ? l.sarcasm : null,
      sampleMode: l.sampleMode || 'random',
      goldSplit: split,
      blindTest: isBlindTest(l.feedbackId),
      labelSource: 'human',
      by: l.by || null,
      at: l.at ? new Date(l.at).toISOString() : null
    });
  }

  return {
    rows,
    manifest: {
      total: rows.length,
      labelSource: 'human',
      bySplit,
      testProducts: [...testProducts].sort(),
      rootCounts
    }
  };
}

// ==================================================================
// 2. HIỆU QUẢ SAU QUYẾT ĐỊNH
// ==================================================================

/**
 * So tỉ lệ khiếu nại đúng phạm vi của cảnh báo (nhóm, nguyên nhân, sản phẩm)
 * trong 7 ngày TRƯỚC và 7 ngày SAU lúc chấp nhận kế hoạch.
 * Đây là so sánh trước / sau, không phải thí nghiệm có đối chứng: con số
 * cho biết tình hình có cải thiện không, chưa chứng minh nhờ kế hoạch.
 */
function decisionEffect(items, decision, now, windowDays = 7, beforeDays = windowDays) {
  if (decision.decision !== 'ACCEPTED' || !decision.at) return null;
  const [cat, cause, product] = String(decision.alertId).split('|');
  if (!cat) return null;
  const at = new Date(decision.at).getTime();
  const nowMs = new Date(now).getTime();
  const scope = items.filter((f) => metrics.isCountable(f) && (!product || product === '*' || f.productName === product));
  const isHit = (f) => f.category === cat && (!cause || cause === '*' || f.subCategory === cause);

  const windowStats = (from, to) => {
    const list = scope.filter((f) => {
      const t = new Date(f.timestamp).getTime();
      return t >= from && t < to;
    });
    const hits = list.filter(isHit).length;
    return { n: list.length, hits, rate: list.length ? hits / list.length : null };
  };

  // Nền trước dài ít nhất bằng nhịp của kho (kho thưa); `now` là đồng hồ thật
  const beforeSpan = Math.max(windowDays, beforeDays || windowDays) * DAY;
  const before = windowStats(at - beforeSpan, at);
  const afterEnd = Math.max(at, Math.min(at + beforeSpan, nowMs));
  const after = windowStats(at, afterEnd);
  const daysElapsed = Math.max(0, (nowMs - at) / DAY);
  const status = daysElapsed >= windowDays ? 'done' : 'pending';
  const change = before.rate != null && after.rate != null ? after.rate - before.rate : null;

  // Đối chứng: cùng nhóm vấn đề trên các sản phẩm KHÁC (không được xử lý), cùng hai
  // khoảng thời gian. Mức thay đổi của nhóm đối chứng là phần do mùa vụ, khuyến mãi,
  // nhịp chung của shop; trừ đi thì còn phần gắn với việc đã làm (khác biệt kép).
  // Chỉ có khi cảnh báo gắn một sản phẩm và nhóm đối chứng đủ 30 phản hồi mỗi bên.
  let control = null;
  if (product && product !== '*') {
    const others = items.filter((f) => metrics.isCountable(f) && f.productName && f.productName !== product);
    const ctlStats = (from, to) => {
      const list = others.filter((f) => {
        const t = new Date(f.timestamp).getTime();
        return t >= from && t < to;
      });
      const hits = list.filter(isHit).length;
      return { n: list.length, hits, rate: list.length ? hits / list.length : null };
    };
    const cb = ctlStats(at - beforeSpan, at);
    const ca = ctlStats(at, afterEnd);
    if (cb.n >= 30 && ca.n >= 30 && cb.rate != null && ca.rate != null) {
      control = { before: cb, after: ca, change: ca.rate - cb.rate };
    }
  }

  return {
    status,
    daysLeft: status === 'pending' ? Math.ceil(windowDays - daysElapsed) : 0,
    before,
    after,
    change,
    control,
    // Thay đổi sau khi trừ nhịp chung (âm là giảm); không có đối chứng thì bằng change
    adjustedChange: change != null && control ? change - control.change : change,
    beforeDays: Math.round(beforeSpan / DAY),
    enough: before.n >= 30 && after.n >= 30
  };
}

// ==================================================================
// 3. SO SÁNH HAI SẢN PHẨM
// ==================================================================

/** Danh sách sản phẩm có đủ phản hồi để so sánh */
function productList(items, min = 20) {
  const m = new Map();
  for (const f of items) {
    if (!metrics.isCountable(f) || !f.productName) continue;
    const row = m.get(f.productName) || { name: f.productName, category: f.productCategory || null, count: 0 };
    row.count += 1;
    m.set(f.productName, row);
  }
  return [...m.values()].filter((p) => p.count >= min).sort((a, b) => b.count - a.count);
}

function productProfile(items, name) {
  const list = items.filter((f) => metrics.isCountable(f) && f.productName === name);
  const neg = list.filter(metrics.isComplaint);
  const rated = list.filter((f) => Number.isFinite(f.rating));
  const byCat = {};
  const byCause = {};
  for (const f of neg) {
    if (!f.category || f.category === 'Other') continue;
    byCat[f.category] = (byCat[f.category] || 0) + 1;
    if (f.subCategory) {
      const k = `${f.category}|${f.subCategory}`;
      byCause[k] = (byCause[k] || 0) + 1;
    }
  }
  const weighted = metrics.shareOfNegative(list);
  return {
    name,
    n: list.length,
    negatives: neg.length,
    // Tỉ lệ đếm thô (để kiểm định) và tỉ lệ có trọng số (cùng cách tính với Tổng quan)
    negativeShare: wilsonInterval(neg.length, list.length),
    weightedNegativeShare: weighted.available ? weighted.value : null,
    avgRating: rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length : null,
    evidence: metrics.evidenceMix(list),
    categories: Object.entries(byCat).map(([key, count]) => ({
      key, label: taxonomy.categoryLabel(key), count, share: list.length ? count / list.length : 0
    })),
    topCauses: Object.entries(byCause)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, count]) => {
        const [c, s] = k.split('|');
        return { label: taxonomy.causeLabel(c, s) || s, category: taxonomy.categoryLabel(c), count };
      })
  };
}

function compareProducts(items, a, b) {
  const A = productProfile(items, a);
  const B = productProfile(items, b);
  const test = twoProportionZTest(A.negatives, A.n, B.negatives, B.n);
  const keys = [...new Set([...A.categories, ...B.categories].map((c) => c.key))];
  const categories = keys
    .map((key) => {
      const ca = A.categories.find((c) => c.key === key);
      const cb = B.categories.find((c) => c.key === key);
      return { key, label: taxonomy.categoryLabel(key), a: ca ? ca.share : 0, b: cb ? cb.share : 0 };
    })
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  return {
    a: A,
    b: B,
    categories,
    difference: {
      delta: test.delta,
      z: Number.isFinite(test.z) ? Number(test.z.toFixed(2)) : null,
      p: test.p,
      significant: Boolean(test.valid && test.p < 0.05),
      valid: test.valid,
      reason: test.reason
    }
  };
}

// ==================================================================
// 4. SOẠN NHÁP TRẢ LỜI KHÁCH
// ==================================================================

const TONES = {
  formal: 'lịch sự, trang trọng, xưng "chúng tôi" và gọi khách là "Quý khách"',
  friendly: 'thân thiện, gần gũi, xưng "shop" và gọi khách là "bạn"'
};

/** Prompt có ràng buộc: chỉ dùng dữ kiện được đưa, không hứa điều chưa duyệt */
function buildReplyPrompt(item, plan, tone = 'formal') {
  return `Bạn soạn NHÁP câu trả lời cho một đánh giá của khách hàng trên sàn thương mại điện tử Việt Nam.
Nhân viên sẽ đọc, sửa rồi mới gửi. Viết ${TONES[tone] || TONES.formal}.

Quy tắc bắt buộc:
1. Tối đa 80 từ, một đoạn, không tiêu đề, không markdown.
2. Nhắc đúng vấn đề khách nêu (${item.causeLabel || item.categoryLabel || 'vấn đề khách gặp'}), xin lỗi ngắn gọn, không đổ lỗi cho khách.
3. KHÔNG hứa hoàn tiền, đổi hàng, tặng mã giảm giá hay mốc thời gian cụ thể trừ khi có trong "Hướng xử lý đã duyệt".
4. KHÔNG bịa mã đơn, tên nhân viên, số điện thoại. Mời khách nhắn tin cho shop để được hỗ trợ.
5. Kết thúc bằng "[Tên cửa hàng]".

Đánh giá của khách (${item.rating != null ? `${item.rating} sao` : 'không có số sao'}):
"${String(item.originalText || '').slice(0, 600)}"

Hướng xử lý đã duyệt: ${plan || 'chưa có — chỉ xin lỗi, ghi nhận và mời khách nhắn tin.'}

Chỉ trả về nội dung câu trả lời.`;
}

/** Bản mẫu khi không gọi được mô hình ngôn ngữ — vẫn đúng vấn đề, không hứa gì */
function fallbackReply(item, tone = 'formal') {
  const issue = (item.causeLabel || item.categoryLabel || 'trải nghiệm chưa tốt').toLowerCase();
  return tone === 'friendly'
    ? `Shop xin lỗi bạn vì ${issue} lần này. Shop đã ghi nhận và đang kiểm tra lại với bộ phận phụ trách. Bạn nhắn tin cho shop để được hỗ trợ nhanh nhất nhé. [Tên cửa hàng]`
    : `Chúng tôi chân thành xin lỗi Quý khách về ${issue}. Phản hồi của Quý khách đã được ghi nhận và chuyển tới bộ phận phụ trách để kiểm tra. Quý khách vui lòng nhắn tin cho cửa hàng để được hỗ trợ cụ thể. [Tên cửa hàng]`;
}

module.exports = {
  AUDIT_TARGET,
  AUDIT_MODES,
  BLIND_PERCENT,
  isBlindTest,
  GOLD_TEST_PERCENT,
  GOLD_DEV_PERCENT,
  normalizeProductKey,
  goldSplit,
  inQueue,
  auditSample,
  auditSummary,
  buildGoldExport,
  decisionEffect,
  productList,
  productProfile,
  compareProducts,
  buildReplyPrompt,
  fallbackReply,
  TONES
};
