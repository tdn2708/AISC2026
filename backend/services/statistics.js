/**
 * CƠ CHẾ PHÁT HIỆN BẤT THƯỜNG CÓ Ý NGHĨA THỐNG KÊ
 * ------------------------------------------------------------------
 * Thay ngưỡng cố định kiểu "khiếu nại tăng trên 30% thì cảnh báo" bằng
 * kiểm định thống kê, vì ngưỡng cố định hỏng ở cả hai đầu quy mô:
 *   - gian hàng nhỏ: dao động ngẫu nhiên thường xuyên vượt ngưỡng
 *     => cảnh báo giả liên tục => người dùng tắt thông báo;
 *   - doanh nghiệp lớn: thay đổi vài phần nghìn có thể là hàng nghìn
 *     khách hàng chịu ảnh hưởng nhưng không đủ vượt ngưỡng.
 *
 * Ba lớp: kiểm định tỉ lệ hai mẫu (đột biến), biểu đồ kiểm soát EWMA
 * (suy giảm chậm), và hiệu chỉnh đa kiểm định Benjamini-Hochberg.
 */

/**
 * Hàm phân phối tích lũy chuẩn tắc, xấp xỉ Abramowitz & Stegun 7.1.26
 * qua hàm lỗi erf. Sai số tuyệt đối < 1.5e-7 — thừa chính xác cho việc
 * so p-value với các mức 0.01 / 0.05.
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** p-value hai phía cho thống kê z */
function twoSidedP(z) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * KIỂM ĐỊNH TỈ LỆ HAI MẪU (two-proportion z-test)
 *
 *   z = (p1 - p2) / sqrt( p_pooled * (1 - p_pooled) * (1/n1 + 1/n2) )
 *
 * @param {number} x1 số khiếu nại ở cửa sổ hiện tại
 * @param {number} n1 cỡ mẫu cửa sổ hiện tại
 * @param {number} x2 số khiếu nại ở đường nền
 * @param {number} n2 cỡ mẫu đường nền
 */
function twoProportionZTest(x1, n1, x2, n2) {
  if (n1 <= 0 || n2 <= 0) {
    return { z: 0, p: 1, p1: 0, p2: 0, delta: 0, valid: false, reason: 'Cỡ mẫu bằng 0' };
  }

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));

  if (se === 0) {
    return { z: 0, p: 1, p1, p2, delta: p1 - p2, valid: false, reason: 'Phương sai bằng 0' };
  }

  const z = (p1 - p2) / se;

  // Điều kiện xấp xỉ chuẩn: mỗi ô kỳ vọng >= 5
  const expectedOk =
    n1 * pooled >= 5 && n1 * (1 - pooled) >= 5 && n2 * pooled >= 5 && n2 * (1 - pooled) >= 5;

  return {
    z,
    p: twoSidedP(z),
    p1,
    p2,
    delta: p1 - p2,
    valid: expectedOk,
    reason: expectedOk ? null : 'Cỡ mẫu chưa đủ cho xấp xỉ chuẩn (kỳ vọng ô < 5)'
  };
}

/** Ngưỡng mặc định cho điều kiện kép kích hoạt cảnh báo */
const ALERT_THRESHOLDS = {
  pValue: 0.01,             // ý nghĩa thống kê
  minDeltaPP: 0.5,          // ý nghĩa nghiệp vụ: >= 0.5 điểm phần trăm
  minAffectedCustomers: 20, // hoặc >= 20 khách hàng bị ảnh hưởng
  fdrLevel: 0.05            // mức kiểm soát FDR của Benjamini-Hochberg
};

/**
 * ĐIỀU KIỆN KÉP.
 * Chỉ đạt ý nghĩa thống kê là chưa đủ: với cỡ mẫu rất lớn gần như mọi
 * chênh lệch đều có p nhỏ, và hệ thống sẽ sinh vô số cảnh báo đúng về
 * mặt toán học nhưng vô nghĩa với người vận hành.
 */
function passesDualCriteria(test, affectedCustomers, thresholds = ALERT_THRESHOLDS) {
  const statistical = test.p < thresholds.pValue;
  const deltaPP = test.delta * 100;
  const practical =
    deltaPP >= thresholds.minDeltaPP || affectedCustomers >= thresholds.minAffectedCustomers;

  return {
    statistical,
    practical,
    passed: statistical && practical && test.delta > 0,
    deltaPP,
    affectedCustomers
  };
}

/**
 * BIỂU ĐỒ KIỂM SOÁT EWMA
 *   z(t) = lambda * x(t) + (1 - lambda) * z(t-1),  lambda = 0.2
 *   Giới hạn: mu0 +/- L * sigma * sqrt( lambda / (2 - lambda) ),  L = 3
 *
 * Kiểm định tỉ lệ ở trên bắt tốt đột biến, nhưng bỏ sót kiểu suy giảm
 * chậm và đều — kiểu nguy hiểm nhất trong thực tế vì không ngày nào đủ
 * xấu để gây chú ý, mà sau ba tháng thì tình hình đã khác hẳn.
 */
function ewmaControlChart(series, options = {}) {
  const lambda = options.lambda ?? 0.2;
  const L = options.L ?? 3;
  const baselineLength = options.baselineLength ?? Math.max(4, Math.floor(series.length / 2));

  if (!series || series.length < 3) {
    return {
      points: [], breached: false, consecutiveBreaches: 0,
      mu0: 0, sigma: 0, ucl: 0, lcl: 0,
      valid: false, invalidReason: 'Chuỗi quá ngắn để lập biểu đồ kiểm soát'
    };
  }

  const baseline = series.slice(0, baselineLength);
  const mu0 = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const variance =
    baseline.reduce((a, b) => a + (b - mu0) ** 2, 0) / Math.max(1, baseline.length - 1);
  const sigma = Math.sqrt(variance);

  /**
   * Đường nền phải THẬT SỰ có dữ liệu thì giới hạn kiểm soát mới có
   * nghĩa. Trường hợp hỏng âm thầm: doanh nghiệp mới onboard, lịch sử
   * ngắn hơn cửa sổ theo dõi, nên nửa đầu chuỗi toàn số 0. Khi đó
   * mu0 = 0 và sigma = 0, giới hạn kiểm soát tụt về 0, và MỌI danh mục
   * có dữ liệu đều bị báo "suy giảm kéo dài" ngay ngày đầu sử dụng.
   * Thà không báo gì còn hơn báo sai hàng loạt.
   */
  const nonEmptyBaseline = baseline.filter((v) => v > 0).length;
  if (nonEmptyBaseline < 3 || sigma === 0) {
    return {
      points: [], breached: false, consecutiveBreaches: 0,
      mu0, sigma, ucl: 0, lcl: 0, lambda, L,
      valid: false,
      invalidReason:
        sigma === 0
          ? 'Đường nền không có biến thiên, không lập được giới hạn kiểm soát'
          : 'Lịch sử chưa đủ dài để lập đường nền cho biểu đồ kiểm soát'
    };
  }

  const spread = L * sigma * Math.sqrt(lambda / (2 - lambda));
  const ucl = mu0 + spread;
  const lcl = mu0 - spread;

  let z = mu0;
  const points = series.map((x, i) => {
    z = lambda * x + (1 - lambda) * z;
    return { index: i, value: x, ewma: z, above: z > ucl, below: z < lcl };
  });

  // Chuỗi vượt giới hạn ba chu kỳ liên tiếp => cảnh báo "suy giảm kéo dài"
  let consecutive = 0;
  let maxConsecutive = 0;
  for (const pt of points) {
    if (pt.above) {
      consecutive += 1;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }

  return {
    points,
    mu0,
    sigma,
    ucl,
    lcl,
    lambda,
    L,
    valid: true,
    invalidReason: null,
    consecutiveBreaches: maxConsecutive,
    // Phân biệt rõ với cảnh báo dạng "đột biến": hai loại này đòi hỏi
    // hai kiểu phản ứng khác nhau nên được tách bạch trên giao diện.
    breached: maxConsecutive >= (options.runLength ?? 3),
    driftType: maxConsecutive >= (options.runLength ?? 3) ? 'SUSTAINED_DRIFT' : null
  };
}

/**
 * HIỆU CHỈNH ĐA KIỂM ĐỊNH — thủ tục Benjamini-Hochberg (kiểm soát FDR).
 *
 * Hệ thống chạy kiểm định đồng thời trên nhiều tổ hợp (danh mục x
 * nguyên nhân x khu vực x sản phẩm), tức hàng chục tới hàng trăm kiểm
 * định mỗi chu kỳ. Ở mức ý nghĩa 0.01, ngay cả khi không có vấn đề gì
 * xảy ra thì kỳ vọng vẫn có vài cảnh báo giả mỗi ngày. Đây là chi tiết
 * kỹ thuật nhỏ nhưng quyết định trực tiếp việc người dùng có còn bật
 * thông báo sau tuần đầu tiên hay không.
 *
 * @param {Array<{p:number}>} tests
 * @param {number} q mức FDR
 * @returns {Array} cùng thứ tự đầu vào, thêm { rank, bhCritical, significant, qValue }
 */
function benjaminiHochberg(tests, q = ALERT_THRESHOLDS.fdrLevel) {
  const m = tests.length;
  if (m === 0) return [];

  const indexed = tests.map((t, i) => ({ i, p: t.p }));
  indexed.sort((a, b) => a.p - b.p);

  // Ngưỡng lớn nhất k sao cho p(k) <= (k/m) * q
  let maxK = 0;
  for (let k = 1; k <= m; k++) {
    if (indexed[k - 1].p <= (k / m) * q) maxK = k;
  }

  // q-value: đảm bảo tính đơn điệu bằng cách quét ngược
  const qValues = new Array(m);
  let running = 1;
  for (let k = m; k >= 1; k--) {
    running = Math.min(running, (indexed[k - 1].p * m) / k);
    qValues[k - 1] = running;
  }

  const out = tests.map((t) => ({ ...t }));
  indexed.forEach((entry, sortedPos) => {
    const rank = sortedPos + 1;
    out[entry.i] = {
      ...out[entry.i],
      rank,
      bhCritical: (rank / m) * q,
      qValue: qValues[sortedPos],
      significant: rank <= maxK
    };
  });

  return out;
}

/** Chuẩn hóa min-max về [0,1], dùng cho các thành phần của điểm nghiêm trọng */
function norm(value, min, max) {
  if (max === min) return 0;
  const v = (value - min) / (max - min);
  return Math.max(0, Math.min(1, v));
}

/** Trọng số mặc định của điểm nghiêm trọng tổng hợp */
const SEVERITY_WEIGHTS = { wcr: 0.25, z: 0.25, velocity: 0.2, impact: 0.2, coverage: 0.1 };

/**
 * ĐIỂM NGHIÊM TRỌNG TỔNG HỢP
 *   S = w1*norm(WCR) + w2*norm(|z|) + w3*norm(tốc độ tăng)
 *       + w4*impact(danh mục) + w5*norm(độ phủ ảnh hưởng)
 *
 * impact(danh mục) là hệ số tác động nghiệp vụ do doanh nghiệp tự cấu
 * hình: lỗi thanh toán và nghi ngờ hàng giả thường được đặt cao hơn
 * giao chậm, vì mức thiệt hại và rủi ro pháp lý khác nhau. Việc cho
 * cấu hình hệ số này cũng chính là cách sản phẩm thích ứng theo ngành.
 */
function severityScore({ wcr, z, velocity, categoryImpact, coverage }, weights = SEVERITY_WEIGHTS) {
  const s =
    weights.wcr * norm(wcr, 0, 0.1) +
    weights.z * norm(Math.abs(z), 0, 6) +
    weights.velocity * norm(velocity, 0, 3) +
    weights.impact * (categoryImpact ?? 0.25) +
    weights.coverage * norm(coverage, 0, 1);

  return Math.max(0, Math.min(1, s));
}

/** Phân cấp mức + kênh thông báo + SLA phản hồi kỳ vọng */
const SEVERITY_BANDS = [
  { max: 0.25, level: 'Low',      levelVi: 'Thấp',        channel: 'Hiển thị trên dashboard',        sla: 'Xem trong báo cáo tuần' },
  { max: 0.5,  level: 'Medium',   levelVi: 'Trung bình',  channel: 'Tổng hợp trong báo cáo ngày',    sla: '24 giờ' },
  { max: 0.75, level: 'High',     levelVi: 'Cao',         channel: 'Email + thông báo Zalo OA',      sla: '4 giờ' },
  { max: 1.01, level: 'Critical', levelVi: 'Nghiêm trọng', channel: 'Thông báo tức thời tới người phụ trách', sla: '1 giờ' }
];

function severityBand(score) {
  return SEVERITY_BANDS.find((b) => score < b.max) || SEVERITY_BANDS[SEVERITY_BANDS.length - 1];
}

/** Tốc độ tăng so với nền, chặn trên để một nền rất nhỏ không thổi bay thang đo */
function velocityRatio(current, baseline) {
  if (baseline <= 0) return current > 0 ? 3 : 0;
  return Math.min((current - baseline) / baseline, 3);
}

module.exports = {
  erf,
  normalCdf,
  twoSidedP,
  twoProportionZTest,
  passesDualCriteria,
  ewmaControlChart,
  benjaminiHochberg,
  severityScore,
  severityBand,
  velocityRatio,
  norm,
  ALERT_THRESHOLDS,
  SEVERITY_WEIGHTS,
  SEVERITY_BANDS
};
