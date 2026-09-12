/**
 * HỒ SƠ BẰNG CHỨNG — TẦNG TRÍCH ĐẶC TRƯNG CHO KHUYẾN NGHỊ
 * ==================================================================
 * Động cơ cảnh báo đã trả lời được câu "có gì đó bất thường, và bất
 * thường thật chứ không phải nhiễu". Nhưng nó dừng ở đó. Cảnh báo nói
 * "Giao hàng — Giao trễ tăng từ 4.1% lên 9.8%", và tầng khuyến nghị
 * phía sau chỉ nhận được đúng hai thứ: mã nguyên nhân và mức nghiêm
 * trọng. Với hai thứ đó thì mọi cảnh báo Giao trễ mức Cao đều sinh ra
 * cùng một danh sách hành động, mãi mãi, bất kể dữ liệu nói gì.
 *
 * Module này lấp đúng khoảng trống đó: nó đọc TẬP BẰNG CHỨNG THẬT của
 * cảnh báo và trả lời câu hỏi mà người vận hành thực sự cần —
 * "trễ ở ĐÂU, với SẢN PHẨM nào, vào KHUNG GIỜ nào, và thiệt hại BAO NHIÊU".
 *
 * ------------------------------------------------------------------
 * NGUYÊN LÝ: TẬP TRUNG CÓ KIỂM ĐỊNH, KHÔNG PHẢI ĐẾM THÔ
 *
 * Nói "62% khiếu nại đến từ TP.HCM" là vô nghĩa nếu TP.HCM vốn đã
 * chiếm 60% toàn bộ phản hồi. Con số đáng hành động là ĐỘ LỆCH so với
 * tỉ trọng nền của chính chiều đó, và độ lệch ấy phải qua kiểm định
 * trước khi được phép xuất hiện trong một câu khuyến nghị.
 *
 * Vì vậy mỗi chiều dữ liệu được chấm bằng ba điều kiện đồng thời:
 *   1. Tỉ trọng đủ lớn        (share)  — đáng để nhắm vào
 *   2. Lệch đủ xa so với nền  (lift)   — không phải chỉ vì chiều đó vốn to
 *   3. Kiểm định đủ mạnh      (z-test) — không phải do mẫu nhỏ
 *
 * ------------------------------------------------------------------
 * KHOẢNG TRỐNG ĐO ĐẠC CŨNG LÀ MỘT PHÁT HIỆN
 *
 * Thư viện playbook hiện tại có câu "làm việc với đơn vị vận chuyển tại
 * khu vực bị ảnh hưởng". Lược đồ dữ liệu không hề có trường đơn vị vận
 * chuyển. Câu khuyến nghị đó vì thế không bao giờ chỉ đích danh được ai,
 * và người vận hành đọc xong vẫn không biết phải gọi cho nhà xe nào.
 *
 * Module này ghi nhận các chiều VẮNG MẶT như một loại phát hiện riêng.
 * Khi dữ liệu chưa đủ để nhắm mục tiêu, hệ thống không nên đoán bừa —
 * nó nên đề xuất bổ sung đúng trường dữ liệu còn thiếu. Đó cũng là một
 * khuyến nghị hành động, và thường là khuyến nghị có giá trị lâu dài nhất.
 */

const stats = require('./statistics');

/** Ngưỡng để một chiều được coi là "đủ tập trung để nhắm vào" */
const CONCENTRATION = {
  minShare: 0.45, // tỉ trọng tối thiểu của giá trị trội trong tập bằng chứng
  minLift: 1.4, // lệch tối thiểu so với tỉ trọng nền của chính chiều đó
  minCount: 4, // số bằng chứng tối thiểu, dưới mức này z-test không đáng tin
  maxP: 0.05
};

/** Tỉ lệ thiếu dữ liệu mà trên mức đó chiều bị coi là không dùng được */
const MAX_MISSING_RATE = 0.4;

function hourBucket(ts) {
  const h = new Date(ts).getHours();
  if (Number.isNaN(h)) return null;
  if (h < 6) return '0–6h';
  if (h < 11) return '6–11h';
  if (h < 14) return '11–14h';
  if (h < 18) return '14–18h';
  if (h < 22) return '18–22h';
  return '22–24h';
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/**
 * Các chiều có thể nhắm mục tiêu, theo đúng lược đồ dữ liệu hiện có.
 * `slot` là tên biến dùng trong template hành động của playbook.
 */
const DIMENSIONS = [
  { key: 'region', slot: 'region', label: 'khu vực', get: (f) => f.region || null },
  { key: 'productName', slot: 'product', label: 'sản phẩm', get: (f) => f.productName || null },
  { key: 'productCategory', slot: 'productGroup', label: 'nhóm hàng', get: (f) => f.productCategory || null },
  { key: 'source', slot: 'channel', label: 'kênh', get: (f) => f.source || null },
  { key: 'hourBucket', slot: 'hour', label: 'khung giờ', get: (f) => hourBucket(f.timestamp) },
  { key: 'weekday', slot: 'weekday', label: 'ngày trong tuần', get: (f) => WEEKDAYS[new Date(f.timestamp).getDay()] ?? null }
];

/**
 * Các chiều mà nghiệp vụ CẦN nhưng lược đồ dữ liệu chưa có. Khi một
 * hành động đòi hỏi chiều này mà không có, hệ thống chuyển sang đề xuất
 * bổ sung đo đạc thay vì phát ra một câu chung chung.
 */
const ABSENT_DIMENSIONS = [
  {
    slot: 'carrier',
    label: 'đơn vị vận chuyển',
    field: 'carrier',
    why: 'Không có trường này thì mọi khuyến nghị về giao vận đều không chỉ được đích danh nhà xe nào, và người vận hành không biết phải gọi cho ai.',
    appliesTo: ['Delivery']
  },
  {
    slot: 'batch',
    label: 'số lô sản xuất',
    field: 'batchCode',
    why: 'Không có số lô thì không thể khoanh vùng hàng lỗi, và phương án duy nhất còn lại là thu hồi toàn bộ tồn kho — đắt hơn nhiều lần.',
    appliesTo: ['ProductQuality']
  },
  {
    slot: 'agent',
    label: 'mã nhân sự CSKH',
    field: 'agentId',
    why: 'Không có mã nhân sự thì phản ánh về thái độ phục vụ không quy được về ca trực nào, và việc đào tạo lại trở thành đại trà.',
    appliesTo: ['CustomerService']
  },
  {
    slot: 'appVersion',
    label: 'phiên bản ứng dụng',
    field: 'appVersion',
    why: 'Không có phiên bản thì đội kỹ thuật không biết nên quay lui bản nào.',
    appliesTo: ['TechnicalApp']
  }
];

function tally(list, getter) {
  const counts = new Map();
  let missing = 0;
  for (const item of list) {
    const v = getter(item);
    if (v === null || v === undefined || v === '') {
      missing += 1;
      continue;
    }
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return { counts, missing };
}

/**
 * Chấm một chiều dữ liệu: giá trị nào trội, trội đến mức nào so với nền,
 * và độ trội đó có qua được kiểm định không.
 */
function profileDimension(dim, evidence, baseline) {
  const ev = tally(evidence, dim.get);
  const base = tally(baseline, dim.get);

  const evTotal = evidence.length - ev.missing;
  const baseTotal = baseline.length - base.missing;
  const missingRate = evidence.length ? ev.missing / evidence.length : 1;

  if (evTotal === 0 || baseTotal === 0) {
    return {
      key: dim.key,
      slot: dim.slot,
      label: dim.label,
      usable: false,
      reason: 'không có dữ liệu ở chiều này',
      missingRate: Number(missingRate.toFixed(3))
    };
  }

  const ranked = [...ev.counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topValue, topCount] = ranked[0];

  const share = topCount / evTotal;
  const baseCount = base.counts.get(topValue) || 0;
  const baselineShare = baseCount / baseTotal;
  // Nền bằng 0 nghĩa là giá trị này chưa từng xuất hiện trước đây. Đó là
  // tín hiệu mạnh chứ không phải lỗi chia, nên lift được kẹp trần thay
  // vì trả về vô cực.
  const lift = baselineShare > 0 ? share / baselineShare : share > 0 ? 99 : 0;

  const test = stats.twoProportionZTest(topCount, evTotal, baseCount, baseTotal);

  // Chỉ số Herfindahl: gần 1 là dồn vào một giá trị, gần 0 là dàn đều.
  // Dùng để phân biệt "một điểm hỏng" với "hỏng toàn hệ thống", hai
  // tình huống cần hai loại hành động khác hẳn nhau.
  const hhi = ranked.reduce((s, [, c]) => s + (c / evTotal) ** 2, 0);

  const concentrated =
    missingRate <= MAX_MISSING_RATE &&
    topCount >= CONCENTRATION.minCount &&
    share >= CONCENTRATION.minShare &&
    lift >= CONCENTRATION.minLift &&
    test.p <= CONCENTRATION.maxP;

  return {
    key: dim.key,
    slot: dim.slot,
    label: dim.label,
    usable: missingRate <= MAX_MISSING_RATE,
    missingRate: Number(missingRate.toFixed(3)),
    topValue,
    topCount,
    distinctValues: ranked.length,
    share: Number(share.toFixed(3)),
    baselineShare: Number(baselineShare.toFixed(3)),
    lift: Number(lift.toFixed(2)),
    hhi: Number(hhi.toFixed(3)),
    z: Number(test.z.toFixed(2)),
    pValue: test.p,
    approximationValid: test.valid,
    concentrated
  };
}

/**
 * Thiệt hại tài chính ước tính, bằng cách nối mã đơn của bằng chứng với
 * bảng giao dịch.
 *
 * Con số này LUÔN là cận dưới: phản hồi trên mạng xã hội không gắn mã
 * đơn nào, nên phần doanh thu đứng sau chúng không đếm được. Trường
 * `coverage` nói rõ tỉ lệ bằng chứng đối soát được, và giao diện phải
 * hiển thị nó cạnh con số tiền — một con số cận dưới bị trình bày như
 * con số đầy đủ sẽ dẫn tới quyết định sai về mức ưu tiên.
 */
function estimateRevenueAtRisk(evidence, transactions) {
  if (!transactions || !transactions.length) {
    return { atRiskVnd: 0, matchedOrders: 0, coverage: 0, isLowerBound: true, measurable: false };
  }

  const byOrder = new Map(transactions.map((t) => [String(t.orderId), t]));
  let sum = 0;
  let matched = 0;

  for (const f of evidence) {
    if (!f.orderId) continue;
    const txn = byOrder.get(String(f.orderId));
    if (!txn) continue;
    matched += 1;
    sum += Number(txn.amount) || 0;
  }

  const withOrderId = evidence.filter((f) => f.orderId).length;
  const coverage = evidence.length ? withOrderId / evidence.length : 0;

  // Ngoại suy sang phần bằng chứng không đối soát được, chỉ khi đã đối
  // soát được ít nhất một phần ba — dưới mức đó phép ngoại suy dựa trên
  // quá ít đơn và con số trở thành đoán mò.
  const avgTicket = matched ? sum / matched : 0;
  const extrapolated =
    coverage >= 0.33 ? Math.round(avgTicket * evidence.length) : Math.round(sum);

  return {
    atRiskVnd: Math.round(sum),
    extrapolatedVnd: extrapolated,
    avgTicketVnd: Math.round(avgTicket),
    matchedOrders: matched,
    coverage: Number(coverage.toFixed(3)),
    isLowerBound: coverage < 1,
    measurable: matched > 0
  };
}

/**
 * Xây hồ sơ bằng chứng đầy đủ cho một cảnh báo.
 *
 * @param {Array}  evidence     phản hồi hợp lệ đứng sau cảnh báo
 * @param {Array}  baseline     phản hồi hợp lệ trong cửa sổ nền, dùng làm mẫu so sánh
 * @param {object} options      { transactions, category }
 * @returns {object} hồ sơ gồm slots điền được, dẫn chứng dạng câu, thiệt hại, và khoảng trống đo đạc
 */
function profileEvidence(evidence, baseline, options = {}) {
  const { transactions = [], category = null } = options;

  const dimensions = {};
  for (const dim of DIMENSIONS) {
    dimensions[dim.key] = profileDimension(dim, evidence, baseline);
  }

  // Slots là nguyên liệu điền vào template hành động. CHỈ những chiều
  // đã qua kiểm định tập trung mới được điền — nếu không, khuyến nghị sẽ
  // chỉ đích danh một khu vực chỉ vì tình cờ nó đứng đầu trong 6 phản hồi.
  const slots = {};
  const facts = [];

  for (const dim of DIMENSIONS) {
    const d = dimensions[dim.key];
    if (!d.concentrated) continue;
    slots[dim.slot] = d.topValue;
    facts.push({
      dimension: dim.key,
      text: `${d.topValue} chiếm ${(d.share * 100).toFixed(0)}% phản hồi trong cảnh báo này, so với ${(d.baselineShare * 100).toFixed(0)}% ở nền (gấp ${d.lift.toFixed(1)} lần, z = ${d.z})`,
      numbers: [d.topCount, Number((d.share * 100).toFixed(0)), Number((d.baselineShare * 100).toFixed(0)), d.lift, d.z]
    });
  }

  const revenue = estimateRevenueAtRisk(evidence, transactions);

  // Khoảng trống đo đạc: chiều nghiệp vụ cần mà lược đồ không có, cộng
  // với chiều có trong lược đồ nhưng thiếu dữ liệu quá nhiều.
  const gaps = [];
  for (const absent of ABSENT_DIMENSIONS) {
    if (category && !absent.appliesTo.includes(category)) continue;
    gaps.push({ slot: absent.slot, label: absent.label, field: absent.field, why: absent.why, kind: 'ABSENT_FIELD' });
  }
  for (const dim of DIMENSIONS) {
    const d = dimensions[dim.key];
    if (d.usable === false && d.missingRate > MAX_MISSING_RATE) {
      gaps.push({
        slot: dim.slot,
        label: dim.label,
        field: dim.key,
        why: `${(d.missingRate * 100).toFixed(0)}% phản hồi trong cảnh báo này không có giá trị ở chiều ${dim.label}.`,
        kind: 'SPARSE_FIELD'
      });
    }
  }

  // Mức tập trung tổng thể quyết định loại hành động phù hợp: một điểm
  // hỏng thì vá đúng điểm đó, hỏng dàn đều thì phải rà soát quy trình.
  const focusedCount = Object.values(dimensions).filter((d) => d.concentrated).length;
  const concentration = focusedCount >= 2 ? 'FOCUSED' : focusedCount === 1 ? 'PARTIAL' : 'DIFFUSE';

  const weightedCount = evidence.reduce((s, f) => s + (f.trust?.weight ?? 1), 0);

  return {
    evidenceCount: evidence.length,
    weightedCount: Number(weightedCount.toFixed(2)),
    baselineCount: baseline.length,
    dimensions,
    slots,
    facts,
    revenue,
    gaps,
    concentration,
    focusedDimensions: focusedCount
  };
}

module.exports = {
  profileEvidence,
  profileDimension,
  estimateRevenueAtRisk,
  hourBucket,
  DIMENSIONS,
  ABSENT_DIMENSIONS,
  CONCENTRATION
};
