/**
 * BỘ KIỂM THỬ HỒI QUY
 * ==================================================================
 * Chạy: npm test  (không cần MongoDB, không gọi mô hình ngôn ngữ)
 *
 * Trọng tâm là những thứ nếu hỏng thì hỏng âm thầm: hàm phân phối
 * chuẩn, hiệu chỉnh đa kiểm định, và hành vi của Trust Layer trên một
 * kịch bản tấn công đã dựng sẵn.
 */

const assert = require('assert');

const stats = require('../services/statistics');
const taxonomy = require('../services/taxonomy');
const normalizer = require('../services/normalizer');
const { isolationForestScores } = require('../services/anomaly');
const trust = require('../services/trust_layer');
const alertEngine = require('../services/alert_engine');
const metrics = require('../services/metrics');
const playbook = require('../services/playbook');
const evalMetrics = require('../evaluation/metrics');
const { auditLeakage } = require('../evaluation/contamination');
const { ASPECT_DEV, ASPECT_TEST, ASPECT_GOLD } = require('../evaluation/gold_dataset');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}

function near(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: nhận ${actual}, kỳ vọng ~${expected} (sai số cho phép ${tolerance})`
  );
}

// ==================================================================
console.log('\nTHỐNG KÊ');
// ==================================================================

test('Hàm phân phối chuẩn khớp giá trị đã biết', () => {
  near(stats.normalCdf(0), 0.5, 1e-6, 'Phi(0)');
  near(stats.normalCdf(1.96), 0.975, 1e-4, 'Phi(1.96)');
  near(stats.normalCdf(2.576), 0.995, 1e-4, 'Phi(2.576)');
  near(stats.normalCdf(-1.96), 0.025, 1e-4, 'Phi(-1.96)');
});

test('p-value hai phía khớp các mức ý nghĩa chuẩn', () => {
  near(stats.twoSidedP(1.96), 0.05, 1e-3, 'p(1.96)');
  near(stats.twoSidedP(2.576), 0.01, 1e-3, 'p(2.576)');
  near(stats.twoSidedP(0), 1.0, 1e-6, 'p(0)');
});

test('Kiểm định tỉ lệ hai mẫu tính đúng z', () => {
  // Hai tỉ lệ bằng nhau => z = 0
  const same = stats.twoProportionZTest(50, 500, 50, 500);
  near(same.z, 0, 1e-9, 'z khi hai tỉ lệ bằng nhau');
  assert.strictEqual(same.p > 0.99, true, 'p phải gần 1 khi không có khác biệt');

  // Chênh lệch rõ rệt => z lớn, p nhỏ
  const diff = stats.twoProportionZTest(100, 500, 40, 500);
  assert.ok(diff.z > 5, `z phải lớn, nhận ${diff.z}`);
  assert.ok(diff.p < 0.001, `p phải nhỏ, nhận ${diff.p}`);
  near(diff.p1, 0.2, 1e-9, 'p1');
  near(diff.p2, 0.08, 1e-9, 'p2');
});

test('Kiểm định báo không hợp lệ khi cỡ mẫu quá nhỏ', () => {
  const tiny = stats.twoProportionZTest(1, 5, 0, 5);
  assert.strictEqual(tiny.valid, false, 'phải đánh dấu không đủ điều kiện xấp xỉ chuẩn');
  assert.ok(tiny.reason, 'phải nêu lý do');
});

test('Điều kiện kép chặn được khác biệt vô nghĩa về nghiệp vụ', () => {
  // Cỡ mẫu khổng lồ, chênh lệch cực nhỏ: đạt ý nghĩa thống kê nhưng vô nghĩa thực tế
  const t = stats.twoProportionZTest(10300, 1000000, 10000, 1000000);
  assert.ok(t.p < 0.05, 'nên đạt ý nghĩa thống kê do cỡ mẫu lớn');
  const dual = stats.passesDualCriteria(t, 2);
  assert.strictEqual(dual.practical, false, 'không được đạt ý nghĩa nghiệp vụ');
  assert.strictEqual(dual.passed, false, 'không được kích hoạt cảnh báo');
});

test('Benjamini-Hochberg kiểm soát FDR đúng thứ tự', () => {
  const out = stats.benjaminiHochberg(
    [{ p: 0.7 }, { p: 0.001 }, { p: 0.02 }, { p: 0.008 }, { p: 0.3 }],
    0.05
  );
  assert.strictEqual(out[1].significant, true, 'p=0.001 phải có ý nghĩa');
  assert.strictEqual(out[3].significant, true, 'p=0.008 phải có ý nghĩa');
  assert.strictEqual(out[0].significant, false, 'p=0.7 không được có ý nghĩa');
  assert.strictEqual(out[4].significant, false, 'p=0.3 không được có ý nghĩa');
  // q-value phải đơn điệu không giảm theo p
  const sorted = out.slice().sort((a, b) => a.p - b.p);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].qValue >= sorted[i - 1].qValue - 1e-12, 'q-value phải đơn điệu');
  }
});

test('BH nghiêm ngặt hơn khi số kiểm định tăng', () => {
  // Ngưỡng BH cho kiểm định nhỏ nhất là (1/m)*q: với m=2 là 0.025,
  // với m=100 là 0.0005. Cùng một p-value sẽ qua được ở tập nhỏ và
  // trượt ở tập lớn — đó chính là tác dụng của hiệu chỉnh.
  const few = stats.benjaminiHochberg([{ p: 0.02 }, { p: 0.9 }], 0.05);
  const many = stats.benjaminiHochberg(
    [{ p: 0.02 }, ...Array.from({ length: 99 }, () => ({ p: 0.9 }))],
    0.05
  );
  assert.strictEqual(few[0].significant, true, 'với 2 kiểm định, p=0.02 < 0.025 nên qua được');
  assert.strictEqual(many[0].significant, false, 'với 100 kiểm định, p=0.02 > 0.0005 nên không qua');
});

test('EWMA phát hiện dịch chuyển chậm nhưng bỏ qua chuỗi ổn định', () => {
  const stable = stats.ewmaControlChart([5, 4, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5]);
  assert.strictEqual(stable.breached, false, 'chuỗi ổn định không được báo động');

  const drifting = stats.ewmaControlChart([2, 3, 2, 3, 2, 3, 5, 7, 9, 11, 13, 15]);
  assert.strictEqual(drifting.breached, true, 'chuỗi tăng đều phải bị bắt');
  assert.ok(drifting.consecutiveBreaches >= 3, 'phải vượt giới hạn ít nhất 3 chu kỳ');
});

test('Điểm nghiêm trọng nằm trong [0,1] và ánh xạ đúng mức', () => {
  const low = stats.severityScore({ wcr: 0, z: 0, velocity: 0, categoryImpact: 0, coverage: 0 });
  const high = stats.severityScore({ wcr: 1, z: 10, velocity: 5, categoryImpact: 1, coverage: 1 });
  assert.ok(low >= 0 && low <= 1, 'điểm thấp phải trong [0,1]');
  assert.ok(high >= 0 && high <= 1, 'điểm cao phải trong [0,1]');
  assert.ok(high > low, 'điểm cao phải lớn hơn điểm thấp');
  assert.strictEqual(stats.severityBand(0.1).level, 'Low');
  assert.strictEqual(stats.severityBand(0.4).level, 'Medium');
  assert.strictEqual(stats.severityBand(0.6).level, 'High');
  assert.strictEqual(stats.severityBand(0.9).level, 'Critical');
});

// ==================================================================
console.log('\nCHUẨN HÓA TIẾNG VIỆT');
// ==================================================================

test('Che thông tin cá nhân trước khi vào pipeline', () => {
  const r = normalizer.normalize('gọi mình 0912345678 hoặc mail a@b.com nhé');
  assert.ok(!r.normalized.includes('0912345678'), 'số điện thoại phải bị che');
  assert.ok(!r.normalized.includes('a@b.com'), 'email phải bị che');
  assert.ok(r.piiMasked, 'phải đánh dấu đã che PII');
  assert.ok(r.piiTypes.includes('phone'), 'phải ghi nhận loại PII');
});

test('Dịch teencode và tiếng lóng thương mại điện tử', () => {
  const r = normalizer.normalize('sp này ko dc, giao hàng xu cà na wa');
  assert.ok(r.normalized.includes('sản phẩm'), '"sp" -> "sản phẩm"');
  assert.ok(r.normalized.includes('không'), '"ko" -> "không"');
  assert.ok(r.normalized.includes('tệ'), '"xu cà na" -> "tệ"');
  assert.ok(r.slangHits >= 3, `phải đếm được số mục từ điển đã dùng, nhận ${r.slangHits}`);
});

test('Gỡ được cách viết lách kiểm duyệt', () => {
  const r = normalizer.normalize('s.ản p.hẩm l-ừa đ-ảo');
  assert.ok(r.normalized.includes('sản phẩm'), 'phải nối lại các từ bị chèn dấu');
});

test('Tắt chuẩn hóa tiếng lóng để chạy đối chứng ablation', () => {
  const on = normalizer.normalize('sp này ko dc');
  const off = normalizer.normalize('sp này ko dc', { skipSlang: true });
  assert.notStrictEqual(on.normalized, off.normalized, 'hai nhánh phải khác nhau');
  assert.strictEqual(off.slangHits, 0, 'nhánh tắt không được đếm mục từ điển');
});

// ==================================================================
console.log('\nTAXONOMY');
// ==================================================================

test('Taxonomy có đủ 7 danh mục và mọi nguyên nhân đều có nhãn', () => {
  assert.strictEqual(taxonomy.CATEGORY_KEYS.length, 7, 'phải có đúng 7 danh mục Level 1');
  assert.ok(taxonomy.CAUSE_COUNT > 20, 'phải có trên 20 nguyên nhân Level 2');
  for (const cat of taxonomy.flatTaxonomy()) {
    assert.ok(cat.label, `danh mục ${cat.key} thiếu nhãn`);
    for (const c of cat.causes) assert.ok(c.label, `nguyên nhân ${c.key} thiếu nhãn`);
  }
});

test('Hư hỏng khi vận chuyển thuộc nhánh Giao hàng, không thuộc Chất lượng sản phẩm', () => {
  // Đây chính là mâu thuẫn nội tại của bảng phân loại bản cũ
  assert.ok(
    taxonomy.TAXONOMY.Delivery.causes.DamagedInTransit,
    'DamagedInTransit phải nằm trong nhánh Delivery'
  );
  assert.strictEqual(
    taxonomy.TAXONOMY.ProductQuality.causes.DamagedInTransit,
    undefined,
    'DamagedInTransit KHÔNG được nằm trong nhánh ProductQuality'
  );
  const m = taxonomy.classifyByRules('hộp bị móp hết khi nhận hàng');
  assert.strictEqual(m[0].category, 'Delivery', 'phải phân vào Giao hàng');
  assert.strictEqual(m[0].cause, 'DamagedInTransit');
});

test('Nhãn cũ được ánh xạ sang taxonomy hiện hành', () => {
  assert.strictEqual(taxonomy.normalizeCategory('Product Quality'), 'ProductQuality');
  assert.strictEqual(taxonomy.normalizeCategory('Pricing'), 'PricePromotion');
  assert.strictEqual(taxonomy.normalizeCause('Delivery', 'Late Delivery'), 'LateDelivery');
  assert.strictEqual(taxonomy.normalizeCategory('nhãn không tồn tại'), 'Other');
});

// ==================================================================
console.log('\nISOLATION FOREST');
// ==================================================================

test('Isolation Forest tách được điểm dị thường khỏi nền', () => {
  const data = [];
  for (let i = 0; i < 80; i++) data.push([Math.sin(i) * 0.5 + 1, Math.cos(i) * 0.5 + 1, 1]);
  data.push([50, 50, 50]);
  const scores = isolationForestScores(data, { seed: 7 });
  const normalAvg = scores.slice(0, 80).reduce((a, b) => a + b, 0) / 80;
  assert.ok(scores[80] > normalAvg + 0.1, `điểm dị thường (${scores[80]}) phải cao hơn nền (${normalAvg})`);
});

test('Isolation Forest cho kết quả tái lập được với cùng hạt giống', () => {
  const data = Array.from({ length: 50 }, (_, i) => [i % 7, i % 5, i % 3]);
  const a = isolationForestScores(data, { seed: 99 });
  const b = isolationForestScores(data, { seed: 99 });
  assert.deepStrictEqual(a, b, 'cùng hạt giống phải cho cùng kết quả');
});

// ==================================================================
console.log('\nTRUST LAYER');
// ==================================================================

/** Dựng kịch bản: nền phản hồi thật + một đợt đánh giá thuê + quảng cáo */
function buildScenario() {
  const now = new Date('2026-09-10T12:00:00Z');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);
  const feedbacks = [];
  const orders = [];

  const realTexts = [
    'Giao hàng hơi chậm nhưng đóng gói cẩn thận, sản phẩm dùng ổn',
    'Hàng bị móp hộp khi nhận, mong shop đóng gói kỹ hơn lần sau',
    'Nhân viên tư vấn sai thông tin về bảo hành, tôi muốn đổi trả',
    'Chất lượng tốt so với giá tiền, sẽ ủng hộ shop tiếp',
    'Đợi hoàn tiền cả tuần rồi mà chưa thấy đâu, liên hệ không ai trả lời'
  ];

  for (let i = 0; i < 60; i++) {
    const orderId = i % 2 === 0 ? 'OD' + i : null;
    if (orderId) {
      orders.push({
        orderId,
        productName: 'Tai nghe Sony',
        // Giao hàng luôn diễn ra TRƯỚC khi khách đánh giá
        deliveredAt: hoursAgo(24 * (i % 25) + i + 48)
      });
    }
    feedbacks.push({
      _id: 'real' + i,
      source: i % 2 === 0 ? 'Shopee' : 'Facebook',
      originalText: realTexts[i % realTexts.length] + ' ' + i,
      author: 'khach_that_' + (i % 25),
      accountAgeDays: 200 + i,
      rating: i % 3 === 0 ? 5 : 2,
      sentiment: i % 3 === 0 ? 'Positive' : 'Negative',
      orderId,
      productName: 'Tai nghe Sony',
      timestamp: hoursAgo(24 * (i % 25) + i)
    });
  }

  // Đợt đánh giá thuê: giống hệt nhau, dồn trong 40 phút, tài khoản mới
  for (let i = 0; i < 10; i++) {
    feedbacks.push({
      _id: 'seed' + i,
      source: 'Shopee',
      originalText: 'Sản phẩm rất tốt shop giao hàng nhanh đóng gói đẹp mình rất hài lòng sẽ ủng hộ tiếp',
      author: 'user' + (9000 + i),
      accountAgeDays: 2,
      rating: 5,
      sentiment: 'Positive',
      productName: 'Tai nghe Sony',
      timestamp: hoursAgo(3 + i * 0.07)
    });
  }

  // Quảng cáo
  for (let i = 0; i < 5; i++) {
    feedbacks.push({
      _id: 'ad' + i,
      source: 'Facebook',
      originalText: 'Tuyển CTV bán hàng sỉ lẻ toàn quốc, hoa hồng cao, inbox mình 0912345678 nhé',
      author: 'seller' + i,
      accountAgeDays: 40,
      sentiment: 'Neutral',
      productName: 'Tai nghe Sony',
      timestamp: hoursAgo(10 + i)
    });
  }

  return { feedbacks, orders, now };
}

const scenario = buildScenario();
const result = trust.runTrustLayer(scenario.feedbacks, {
  orders: scenario.orders,
  now: scenario.now
});

test('Đợt đánh giá thuê bị phát hiện và loại khỏi mọi phép tính', () => {
  const seeded = result.items.filter((i) => String(i._id).startsWith('seed'));
  const rejected = seeded.filter((i) => i.trust.band === 'LIKELY_INAUTHENTIC');
  assert.ok(
    rejected.length >= 8,
    `phải loại ít nhất 8/10 đánh giá thuê, thực tế loại ${rejected.length}`
  );
  assert.ok(rejected.every((i) => i.trust.weight === 0), 'phản hồi bị loại phải có trọng số 0');
});

test('Không loại nhầm phản hồi thật (tỉ lệ dưới 2%)', () => {
  const real = result.items.filter((i) => String(i._id).startsWith('real'));
  const wrongly = real.filter((i) => i.trust.band === 'LIKELY_INAUTHENTIC');
  const rate = wrongly.length / real.length;
  assert.ok(
    rate <= 0.02,
    `tỉ lệ loại nhầm ${(rate * 100).toFixed(1)}% vượt ngưỡng mục tiêu 2% (${wrongly.length}/${real.length})`
  );
});

test('Nội dung quảng cáo bị bộ lọc rác chặn', () => {
  const ads = result.items.filter((i) => String(i._id).startsWith('ad'));
  assert.ok(ads.every((a) => a.trust.band === 'SPAM'), 'mọi bình luận quảng cáo phải bị chặn');
  assert.ok(ads.every((a) => a.trust.weight === 0), 'nội dung rác phải có trọng số 0');
});

test('Phát hiện đúng cụm trùng lặp gần và giới hạn trong cửa sổ thời gian', () => {
  assert.ok(result.clusters.length >= 1, 'phải tìm được ít nhất một cụm');
  for (const c of result.clusters) {
    assert.ok(c.size >= 5, 'cụm phải có ít nhất 5 phản hồi');
    assert.ok(c.spanMinutes <= 48 * 60, 'toàn cụm phải nằm trong cửa sổ 48 giờ');
    assert.ok(c.avgSimilarity >= 0.9, 'độ tương đồng trung bình phải trên 0.90');
  }
});

test('Mọi phản hồi bị gắn cờ đều giải thích được', () => {
  const flagged = result.items.filter(
    (i) => i.trust.band === 'LIKELY_INAUTHENTIC' || i.trust.band === 'GRAY_ZONE'
  );
  for (const f of flagged) {
    assert.ok(
      f.trust.triggeredSignals && f.trust.triggeredSignals.length > 0,
      `phản hồi ${f._id} bị gắn cờ nhưng không nêu tín hiệu nào`
    );
  }
});

test('Sổ đơn hàng thiếu đồng bộ không được biến khiếu nại thật thành review ảo', () => {
  // Cùng dữ liệu nhưng KHÔNG cấp sổ đơn hàng
  const noOrders = trust.runTrustLayer(scenario.feedbacks, { orders: [], now: scenario.now });
  const real = noOrders.items.filter((i) => String(i._id).startsWith('real'));
  const wrongly = real.filter((i) => i.trust.band === 'LIKELY_INAUTHENTIC');
  assert.strictEqual(
    wrongly.length,
    0,
    `không kết nối giao dịch mà vẫn loại ${wrongly.length} phản hồi thật`
  );
});

test('Trọng số hợp nhất giảm theo tuổi dữ liệu', () => {
  const fresh = trust.unifiedWeight(1.0, 0, 0, 30);
  const halfLife = trust.unifiedWeight(1.0, 0, 30, 30);
  const old = trust.unifiedWeight(1.0, 0, 60, 30);
  near(fresh, 1.0, 1e-9, 'dữ liệu mới nhất');
  near(halfLife, 0.5, 1e-9, 'sau đúng một chu kỳ bán rã');
  near(old, 0.25, 1e-9, 'sau hai chu kỳ bán rã');
});

test('Phân hạng nguồn gốc gán đúng trọng số', () => {
  const p1 = trust.assignProvenanceTier({ source: 'Shopee', author: 'Nguyễn Văn A', orderId: 'OD1', accountAgeDays: 300 });
  assert.strictEqual(p1.tier, 'P1');
  assert.strictEqual(p1.tierWeight, 1.0);

  const p5 = trust.assignProvenanceTier({ source: 'Facebook', author: 'Anonymous' });
  assert.strictEqual(p5.tier, 'P5');
  assert.strictEqual(p5.canTriggerHighAlert, false, 'P5 không được kích hoạt cảnh báo mức cao');

  const newAccount = trust.assignProvenanceTier({ source: 'Shopee', author: 'user123456', orderId: 'OD9', accountAgeDays: 2 });
  assert.strictEqual(newAccount.tier, 'P5', 'tài khoản dưới 7 ngày phải xuống hạng P5');
});

test('Chỉ số Sức khỏe Dữ liệu nằm trong [0,100] và phễu cân đối', () => {
  const f = result.funnel;
  assert.ok(f.dataHealthScore >= 0 && f.dataHealthScore <= 100, 'điểm phải trong [0,100]');
  const sum =
    f.spamRemoved.count + f.inauthenticFlagged.count + f.pendingReview.count + f.validForAnalysis;
  assert.strictEqual(sum, f.rawCollected, `phễu không cân: ${sum} != ${f.rawCollected}`);
});

// ==================================================================
console.log('\nĐỘNG CƠ CẢNH BÁO');
// ==================================================================

test('Không sinh cảnh báo khi dữ liệu ổn định', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const flat = [];
  // Bộ sinh giả ngẫu nhiên có hạt giống: cực tính phải ĐỘC LẬP với thời
  // gian, nếu không thì chính cấu trúc dữ liệu thử tạo ra khác biệt thật
  // giữa cửa sổ và đường nền, và kiểm định sẽ đúng khi báo động.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 400; i++) {
    flat.push({
      _id: 'f' + i,
      category: 'Delivery',
      subCategory: 'LateDelivery',
      sentiment: rand() < 0.2 ? 'Negative' : 'Positive',
      author: 'u' + (i % 40),
      productName: 'SP',
      timestamp: new Date(now.getTime() - Math.floor(rand() * 28) * 86400000),
      trust: { weight: 0.8, tier: 'P1', canTriggerHighAlert: true, band: 'ACCEPTED' }
    });
  }
  const r = alertEngine.detectAlerts(flat, { now, transactionCount: 5000 });
  assert.strictEqual(r.alerts.length, 0, `dữ liệu ổn định vẫn sinh ${r.alerts.length} cảnh báo`);
});

test('Lịch sử ngắn không sinh cảnh báo suy giảm giả', () => {
  // Doanh nghiệp mới onboard: chỉ có 10 ngày dữ liệu, ngắn hơn cửa sổ
  // theo dõi. Nếu nửa đầu chuỗi toàn số 0 bị coi là đường nền thật thì
  // MỌI danh mục sẽ bị báo "suy giảm kéo dài" ngay ngày đầu sử dụng.
  const now = new Date('2026-09-10T12:00:00Z');
  const short = [];
  for (let i = 0; i < 120; i++) {
    short.push({
      _id: 's' + i,
      category: 'Delivery',
      subCategory: 'LateDelivery',
      sentiment: 'Negative',
      author: 'u' + (i % 30),
      productName: 'SP',
      timestamp: new Date(now.getTime() - (i % 10) * 86400000),
      trust: { weight: 0.9, tier: 'P1', canTriggerHighAlert: true, band: 'ACCEPTED' }
    });
  }
  const drift = alertEngine.detectSustainedDrift(short, { now });
  assert.strictEqual(
    drift.length,
    0,
    `lịch sử 10 ngày mà vẫn sinh ${drift.length} cảnh báo suy giảm`
  );
});

test('Biểu đồ kiểm soát báo không hợp lệ khi đường nền rỗng', () => {
  const emptyBaseline = stats.ewmaControlChart([0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9, 10]);
  assert.strictEqual(emptyBaseline.valid, false, 'đường nền toàn 0 phải bị coi là không hợp lệ');
  assert.strictEqual(emptyBaseline.breached, false, 'không được báo động khi nền không hợp lệ');
  assert.ok(emptyBaseline.invalidReason, 'phải nêu lý do');
});

test('Phát hiện được sự cố thật và gộp về một cảnh báo duy nhất', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const data = [];
  // Nền 28 ngày, tỉ lệ khiếu nại giao hàng thấp
  for (let i = 0; i < 300; i++) {
    data.push({
      _id: 'base' + i,
      category: i % 20 === 0 ? 'Delivery' : 'ProductQuality',
      subCategory: i % 20 === 0 ? 'LateDelivery' : null,
      sentiment: i % 20 === 0 ? 'Negative' : 'Positive',
      author: 'u' + (i % 60),
      productName: 'SP',
      region: 'TP.HCM',
      timestamp: new Date(now.getTime() - (8 + (i % 20)) * 86400000),
      trust: { weight: 0.9, tier: 'P1', canTriggerHighAlert: true, band: 'ACCEPTED' }
    });
  }
  // Sự cố trong 7 ngày gần nhất
  for (let i = 0; i < 70; i++) {
    data.push({
      _id: 'inc' + i,
      category: 'Delivery',
      subCategory: 'LateDelivery',
      sentiment: 'Negative',
      author: 'kh' + i,
      productName: 'SP',
      region: 'TP.HCM',
      timestamp: new Date(now.getTime() - (i % 6) * 86400000),
      trust: { weight: 0.9, tier: 'P1', canTriggerHighAlert: true, band: 'ACCEPTED' }
    });
  }

  const r = alertEngine.detectAlerts(data, { now, transactionCount: 4000 });
  assert.ok(r.alerts.length >= 1, 'phải phát hiện được sự cố');

  const spike = r.alerts.find((a) => a.type === 'SPIKE');
  assert.ok(spike, 'phải có cảnh báo dạng đột biến');
  assert.strictEqual(spike.category, 'Delivery');
  assert.strictEqual(spike.cause, 'LateDelivery', 'phải bóc được tới nguyên nhân cốt lõi');
  assert.ok(spike.statistics.z > 3, 'z phải đủ lớn');
  assert.ok(spike.statistics.pValue < 0.01, 'p phải dưới 0.01');

  // Cùng một sự việc không được hiện thành nhiều cảnh báo
  const deliverySpikes = r.alerts.filter((a) => a.type === 'SPIKE' && a.category === 'Delivery');
  assert.strictEqual(deliverySpikes.length, 1, `một sự cố sinh ${deliverySpikes.length} cảnh báo trùng`);
});

test('Cảnh báo luôn kèm playbook truy vết được và không tự thực thi', () => {
  const alert = {
    id: 'x', type: 'SPIKE', category: 'Delivery', cause: 'DamagedInTransit',
    categoryLabel: 'Giao hàng', causeLabel: 'Hư hỏng khi vận chuyển',
    severity: 'Critical', severityScore: 0.8, owner: 'Vận hành',
    statistics: { z: 5, pValueDisplay: 'p < 0.001', currentRate: 0.2, baselineRate: 0.05 },
    evidenceCount: 30, excludedByTrust: 5, affectedCustomers: 20, evidenceIds: [], baselineDays: 28
  };
  const rec = playbook.buildRecommendation(alert);

  assert.ok(rec.ruleId.startsWith('PB:'), 'phải truy vết được về quy tắc playbook');
  assert.strictEqual(rec.autoExecuted, false, 'không bao giờ được tự thực thi');
  assert.strictEqual(rec.status, 'PROPOSED', 'mọi khuyến nghị phải ở dạng đề xuất');

  const financial = rec.steps.filter((s) => s.incursCost);
  assert.ok(financial.length > 0, 'kịch bản này phải có bước phát sinh chi phí');
  assert.ok(
    financial.every((s) => s.requiresApproval && s.approvalRole),
    'mọi hành động tốn tiền phải yêu cầu phê duyệt và ghi rõ người duyệt'
  );
  assert.ok(rec.evidence.statistics, 'khuyến nghị phải đính kèm bằng chứng thống kê');
});

test('Tắt Trust Layer làm số cảnh báo và WCR tăng lên', () => {
  const items = result.items;
  const impact = alertEngine.trustLayerImpact(items, {
    now: scenario.now,
    transactionCount: scenario.orders.length
  });
  assert.ok(
    impact.withoutTrustLayer.alertCount >= impact.withTrustLayer.alertCount,
    'bỏ lọc thì số cảnh báo không được ít đi'
  );
  assert.ok(impact.excludedFeedbacks > 0, 'phải có phản hồi bị loại');
});

// ==================================================================
console.log('\nĐÁNH GIÁ MÔ HÌNH');
// ==================================================================

test('Chỉ số phân loại khớp giá trị tính tay', () => {
  const perfect = evalMetrics.classificationReport(['a', 'a', 'b', 'b'], ['a', 'a', 'b', 'b'], ['a', 'b']);
  near(perfect.macroF1, 1, 1e-9, 'macro-F1 khi dự đoán hoàn hảo');

  // Đoán tất cả là 'a': P(a)=0.5, R(a)=1 -> F1(a)=0.667; lớp b toàn 0 -> macro = 0.333
  const allA = evalMetrics.classificationReport(['a', 'a', 'b', 'b'], ['a', 'a', 'a', 'a'], ['a', 'b']);
  near(allA.perClass.a.precision, 0.5, 1e-9, 'precision lớp a');
  near(allA.perClass.a.recall, 1, 1e-9, 'recall lớp a');
  near(allA.macroF1, 0.3333, 1e-3, 'macro-F1');
});

test("Cohen's kappa bằng 1 khi đồng thuận tuyệt đối, 0 khi ngang mức ngẫu nhiên", () => {
  near(evalMetrics.cohensKappa(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b']).kappa, 1, 1e-9, 'đồng thuận tuyệt đối');
  const k = evalMetrics.cohensKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b']);
  near(k.kappa, 0, 1e-9, 'đồng thuận đúng bằng mức ngẫu nhiên');
});

test('Khoảng tin cậy Wilson rộng ra khi cỡ mẫu nhỏ', () => {
  const big = evalMetrics.wilsonInterval(720, 1000);
  const small = evalMetrics.wilsonInterval(7, 10);
  assert.ok(small.high - small.low > (big.high - big.low) * 3, 'cỡ mẫu nhỏ phải cho khoảng rộng hơn hẳn');
  assert.ok(big.low >= 0 && big.high <= 1, 'khoảng phải nằm trong [0,1]');
  assert.ok(small.low >= 0 && small.high <= 1, 'khoảng phải nằm trong [0,1]');
});

test('Tập phát triển và tập kiểm tra không chồng lấn', () => {
  const devTexts = new Set(ASPECT_DEV.map((g) => g.text));
  const overlap = ASPECT_TEST.filter((g) => devTexts.has(g.text));
  assert.strictEqual(overlap.length, 0, `${overlap.length} câu xuất hiện ở cả hai tập`);
  assert.strictEqual(
    ASPECT_DEV.length + ASPECT_TEST.length,
    ASPECT_GOLD.length,
    'hai tập cộng lại phải bằng toàn bộ tập chuẩn'
  );
});

test('Hệ thống nạp được toàn bộ module khi không có khóa API', () => {
  // Bản trước khởi tạo client mô hình ngôn ngữ ngay lúc nạp module, nên
  // thiếu một khóa API là toàn bộ máy chủ sập lúc khởi động — kể cả
  // Trust Layer và kiểm định thống kê vốn không dùng tới mô hình nào.
  const saved = {
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY
  };
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    for (const m of Object.keys(require.cache)) {
      if (m.includes('ai_analyzer') || m.includes('routes')) delete require.cache[m];
    }
    const analyzer = require('../services/ai_analyzer');
    assert.strictEqual(analyzer.llmAvailability().anyAvailable, false, 'phải báo không có khóa nào');
    assert.doesNotThrow(() => require('../routes/api'), 'nạp routes không được ném lỗi');
  } finally {
    if (saved.groq) process.env.GROQ_API_KEY = saved.groq;
    if (saved.gemini) process.env.GEMINI_API_KEY = saved.gemini;
    if (saved.openrouter) process.env.OPENROUTER_API_KEY = saved.openrouter;
  }
});

test('Không có từ khóa nào rò rỉ từ tập kiểm tra', () => {
  // Kiểm tra này khóa chặt một bài học đã trả giá: có lúc Macro-F1 nhảy
  // từ 0.19 lên 0.97 chỉ vì 61 từ khóa được lấy ra từ chính câu trong
  // tập kiểm tra. Nếu ai đó thêm từ khóa theo cách đó lần nữa, kiểm thử
  // này đỏ ngay, thay vì để một con số đẹp trôi vào báo cáo.
  const audit = auditLeakage(ASPECT_DEV, ASPECT_TEST);
  assert.strictEqual(
    audit.clean,
    true,
    `${audit.leakedCount} từ khóa chỉ khớp trên tập kiểm tra: ${audit.leaked.slice(0, 8).join(', ')}`
  );
});

// ==================================================================
console.log('\nTRỢ LÝ PHÂN TÍCH');
// ==================================================================

const chatEngine = require('../services/chat_engine');
const retrieval = require('../services/retrieval');

/** Ngữ cảnh giả lập dùng chung cho các kiểm thử trợ lý */
function buildChatContext() {
  const now = new Date();
  const items = [];
  const texts = [
    { t: 'Giao hàng chậm quá, đợi cả tuần chưa thấy', cat: 'Delivery', cause: 'LateDelivery' },
    { t: 'Cổng thanh toán báo lỗi liên tục không đặt được hàng', cat: 'Payment', cause: 'GatewayError' },
    { t: 'Hộp bị móp méo khi nhận, đóng gói ẩu', cat: 'Delivery', cause: 'DamagedInTransit' },
    { t: 'Sản phẩm tốt, đóng gói cẩn thận, rất hài lòng', cat: 'Other', cause: null }
  ];

  for (let i = 0; i < 120; i++) {
    const t = texts[i % texts.length];
    items.push({
      _id: 'c' + i,
      originalText: t.t,
      author: 'khach_' + (i % 30),
      source: i % 2 === 0 ? 'Shopee' : 'Facebook',
      productName: 'Sản phẩm A',
      category: t.cat,
      subCategory: t.cause,
      categoryLabel: taxonomy.categoryLabel(t.cat),
      causeLabel: taxonomy.causeLabel(t.cat, t.cause),
      sentiment: t.cause ? 'Negative' : 'Positive',
      timestamp: new Date(now.getTime() - (i % 25) * 86400000),
      trust: { weight: 0.9, tier: 'P1', canTriggerHighAlert: true, band: 'ACCEPTED' }
    });
  }

  return {
    items,
    clusters: [],
    bursts: [],
    funnel: {
      rawCollected: items.length,
      validForAnalysis: items.length,
      dataHealthScore: 82,
      spamRemoved: { count: 0, pct: 0 },
      inauthenticFlagged: { count: 0, pct: 0, duplicateClusters: 0 },
      pendingReview: { count: 0, pct: 0 },
      components: { passRate: 100, channelCoverage: 40, freshness: 90, reconciliation: 50 },
      effectiveWeight: 108
    },
    transactions: [],
    transactionCount: 3000,
    computedAt: new Date().toISOString()
  };
}

const chatCtx = buildChatContext();

test('BM25 xếp hạng theo mức liên quan, không theo thời gian', () => {
  // Đây chính là lỗi của bản cũ: cắt 400 phản hồi MỚI NHẤT rồi coi như
  // đó là dữ liệu liên quan tới câu hỏi.
  const index = retrieval.buildIndex(chatCtx.items);
  const hits = retrieval.search('lỗi thanh toán', index, { limit: 5 });
  assert.ok(hits.length > 0, 'phải tìm được phản hồi về thanh toán');
  assert.ok(
    hits[0].item.originalText.includes('thanh toán'),
    `kết quả đầu phải nói về thanh toán, nhận: "${hits[0].item.originalText}"`
  );
});

test('Định tuyến ý định nhận đúng loại câu hỏi', () => {
  const cases = [
    ['Tuần này có cảnh báo gì không?', 'alerts'],
    ['Khách phàn nàn nhiều nhất về nguyên nhân gì?', 'root_cause'],
    ['Dữ liệu có đáng tin không?', 'data_quality'],
    ['Có bao nhiêu đánh giá ảo bị loại?', 'data_quality'],
    ['Mô hình đạt F1 bao nhiêu?', 'model_performance'],
    ['Bảng giá các gói thế nào?', 'business'],
    ['Tôi nên làm gì để khắc phục?', 'action']
  ];
  for (const [q, expected] of cases) {
    const routed = chatEngine.routeIntent(q);
    assert.strictEqual(routed.intent.id, expected, `"${q}" phải cho ý định ${expected}, nhận ${routed.intent.id}`);
  }
});

test('Suy ra bộ lọc thời gian từ câu hỏi', () => {
  assert.strictEqual(chatEngine.inferFilters('tuần này thế nào').time, 'This Week');
  assert.strictEqual(chatEngine.inferFilters('hôm nay có gì').time, 'Today');
  assert.strictEqual(chatEngine.inferFilters('tháng này ra sao').time, 'This Month');
  // Không được ghi đè bộ lọc người dùng đã chọn trên dashboard
  const explicit = chatEngine.inferFilters('tuần này thế nào', { time: 'Today' });
  assert.strictEqual(explicit.time, 'Today', 'bộ lọc người dùng chọn phải được tôn trọng');
});

test('Lọc thời gian KHÔNG được xóa đường nền của động cơ cảnh báo', () => {
  // Lỗi thật đã gặp: hỏi "tuần này có vấn đề gì" thì bộ lọc 7 ngày cũng
  // cắt luôn đường nền 28 ngày, khiến hệ thống báo "đã kiểm định 0 tổ
  // hợp" và kết luận không có vấn đề gì — trong khi sự cố đang diễn ra.
  const withTime = chatEngine.gatherBriefing(
    chatCtx, 'tuần này có vấn đề gì', { id: 'alerts', tools: ['alerts_list'] }, { time: 'This Week' }
  );
  const factText = withTime.sections[0].facts.join(' ');
  const m = factText.match(/Đã kiểm định (\d+) tổ hợp/);
  assert.ok(m, 'phải báo cáo số tổ hợp đã kiểm định');
  assert.ok(
    Number(m[1]) > 0,
    'lọc theo tuần mà vẫn phải kiểm định được tổ hợp — nếu bằng 0 là đường nền đã bị xóa'
  );
});

test('Mọi công cụ trả về dữ kiện đã tính sẵn, không trả dữ liệu thô', () => {
  // Nguyên tắc: mô hình ngôn ngữ không được dùng làm máy tính
  for (const [name, tool] of Object.entries(chatEngine.TOOLS)) {
    const out = tool.run(chatCtx, { query: 'giao hàng', filters: {} });
    assert.ok(out.title, `công cụ ${name} thiếu tiêu đề`);
    assert.ok(Array.isArray(out.facts), `công cụ ${name} phải trả mảng facts`);
    for (const f of out.facts) {
      assert.strictEqual(typeof f, 'string', `công cụ ${name} trả dữ kiện không phải chuỗi`);
    }
  }
});

test('Tầng trả lời xác định hoạt động khi không có mô hình ngôn ngữ', () => {
  const routed = chatEngine.routeIntent('khách phàn nàn nhiều nhất về gì');
  const filters = chatEngine.inferFilters('khách phàn nàn nhiều nhất về gì');
  const briefing = chatEngine.gatherBriefing(chatCtx, 'khách phàn nàn nhiều nhất về gì', routed.intent, filters);
  const answer = chatEngine.deterministicAnswer('khách phàn nàn nhiều nhất về gì', routed.intent, briefing);

  assert.ok(answer.length > 50, 'câu trả lời xác định phải có nội dung thật');
  assert.ok(answer.includes('Giao hàng'), 'phải nêu được danh mục nổi bật trong dữ liệu');
  assert.ok(!/undefined|NaN|\[object/.test(answer), 'không được lọt giá trị rác vào câu trả lời');
});

test('Câu hỏi gợi ý sinh theo dữ liệu thật', () => {
  const s = chatEngine.suggestedQuestions(chatCtx);
  assert.ok(Array.isArray(s) && s.length >= 3, 'phải có ít nhất 3 gợi ý');
  assert.ok(s.every((x) => typeof x === 'string' && x.length > 10), 'gợi ý phải là câu hỏi có nghĩa');
});

test('Dẫn chứng luôn kèm id để truy vết được về phản hồi gốc', () => {
  const out = chatEngine.TOOLS.search_feedbacks.run(chatCtx, { query: 'giao hàng chậm', filters: {} });
  assert.ok(out.evidence.length > 0, 'phải tìm được dẫn chứng');
  for (const e of out.evidence) {
    assert.ok(e.id, 'mỗi dẫn chứng phải có id');
    assert.ok(e.text, 'mỗi dẫn chứng phải có nội dung gốc');
  }
});

// ==================================================================
console.log('\nTÍNH LIÊM CHÍNH CỦA PHÉP ĐO');
// ==================================================================

test('Không tầng phân tích nào đọc trường đáp án _plantedAs', () => {
  /**
   * Bộ dữ liệu thử nghiệm có cài sẵn các sự cố và đánh dấu chúng bằng
   * trường `_plantedAs` để chấm điểm phát hiện. Nếu bất kỳ tầng phân
   * tích nào đọc trường đó thì toàn bộ con số "bắt được 6/6 sự cố" trở
   * nên vô nghĩa — hệ thống chỉ đang đọc đáp án.
   *
   * Kiểm thử này quét mã nguồn để khóa chặt điều đó.
   */
  const fs = require('fs');
  const path = require('path');
  const dirs = ['services', 'routes', 'evaluation'];
  const offenders = [];

  for (const dir of dirs) {
    const full = path.join(__dirname, '..', dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith('.js')) continue;
      const content = fs.readFileSync(path.join(full, file), 'utf8');
      if (content.includes('_plantedAs')) offenders.push(`${dir}/${file}`);
    }
  }

  assert.strictEqual(
    offenders.length,
    0,
    `các tệp sau đang đọc trường đáp án: ${offenders.join(', ')}`
  );
});

test('Dữ liệu trả ra API không để lộ trường đáp án', () => {
  // Trường `_plantedAs` nằm trong cơ sở dữ liệu để script chấm điểm dùng,
  // nhưng không được xuất hiện trong dữ liệu gửi cho giao diện.
  const fs = require('fs');
  const path = require('path');
  const api = fs.readFileSync(path.join(__dirname, '..', 'routes', 'api.js'), 'utf8');
  const publicItemBlock = api.slice(api.indexOf('function publicItem'), api.indexOf('// ====', api.indexOf('function publicItem')));
  assert.ok(!publicItemBlock.includes('_plantedAs'), 'publicItem đang để lộ trường đáp án');
  assert.ok(!publicItemBlock.includes('...f'), 'publicItem không được trải toàn bộ bản ghi ra ngoài');
});

// ==================================================================
console.log('\nMÔ HÌNH KINH DOANH');
// ==================================================================

const business = require('../services/business');

test('Số cảnh báo tỉ lệ theo quy mô, không phải hằng số', () => {
  // Bản đầu đặt cố định 30 cảnh báo/ngày cho mọi khách hàng, khiến gói
  // Growth ra biên lợi nhuận ÂM. Đó là lỗi mô hình hóa.
  const small = business.alertsPerDayFor(5000);
  const large = business.alertsPerDayFor(200000);
  assert.ok(large > small * 5, 'khách lớn phải sinh nhiều cảnh báo hơn hẳn khách nhỏ');
  assert.ok(small >= business.COST_ASSUMPTIONS.minAlertsPerDay.value, 'phải có sàn tối thiểu');
});

test('Mọi gói trả phí đều có biên lợi nhuận gộp dương và đạt chuẩn SaaS', () => {
  for (const tier of business.PRICING_TIERS.filter((t) => t.priceVnd > 0)) {
    const u = business.unitEconomics(tier.id);
    assert.ok(u.grossMargin > 0, `gói ${tier.name} có biên lợi nhuận âm: ${u.grossMarginDisplay}`);
    assert.ok(u.grossMargin > 0.7, `gói ${tier.name} dưới chuẩn SaaS 70%: ${u.grossMarginDisplay}`);
    assert.ok(u.paybackMonths > 0 && u.paybackMonths < 12, `gói ${tier.name} hoàn vốn quá lâu`);
  }
});

test('Mọi giả định chi phí đều ghi rõ căn cứ và độ tin cậy', () => {
  // Con số không có căn cứ là con số không bảo vệ được trước hội đồng
  for (const [key, a] of Object.entries(business.COST_ASSUMPTIONS)) {
    assert.ok(a.basis, `giả định ${key} thiếu căn cứ`);
    assert.ok(a.confidence, `giả định ${key} thiếu mức độ tin cậy`);
    assert.ok(Number.isFinite(a.value), `giả định ${key} thiếu giá trị số`);
  }
});

test('So sánh chi phí kiến trúc nêu rõ điểm hòa vốn', () => {
  const small = business.compareArchitectureCost(100);
  const big = business.compareArchitectureCost(100000);
  assert.ok(big.ratio > 1, 'ở quy mô lớn, kiến trúc đã chọn phải rẻ hơn');
  assert.ok(small.breakEvenFeedbacksPerMonth > 0, 'phải tính được điểm hòa vốn');
  // Không được tuyên bố lợi thế ba bậc độ lớn khi mô hình không cho ra con số đó
  assert.ok(big.ratio < 100, `tỉ lệ ${big.ratio}x không ủng hộ tuyên bố "ba bậc độ lớn"`);
});

// ==================================================================
console.log('\nCHỈ SỐ');
// ==================================================================

test('WCR báo không khả dụng khi thiếu mẫu số thay vì trả số bịa', () => {
  const r = metrics.weightedComplaintRate(result.items, 0);
  assert.strictEqual(r.available, false, 'phải báo không khả dụng');
  assert.strictEqual(r.value, null, 'không được trả về một con số');
  assert.ok(r.reason, 'phải nêu lý do');
});

test('WCR chỉ tính trên kênh đối soát được giao dịch', () => {
  const r = metrics.weightedComplaintRate(result.items, 1000);
  assert.strictEqual(r.available, true);
  assert.ok(r.value >= 0 && r.value <= 1, 'tỉ lệ phải trong [0,1]');
  assert.strictEqual(r.denominator, 1000, 'mẫu số phải là số giao dịch');
  assert.ok(r.denominatorLabel.includes('giao dịch'), 'phải ghi rõ mẫu số là gì');
});

test('Chỉ số thay thế dùng mẫu số cùng kênh và ghi rõ điều đó', () => {
  const r = metrics.shareOfNegative(result.items, 'Facebook');
  assert.strictEqual(r.channel, 'Facebook');
  assert.ok(
    r.denominatorLabel.includes('Facebook'),
    'nhãn mẫu số phải nêu rõ đang tính trong kênh nào'
  );
});

test('Phản hồi bị Trust Layer loại không lọt vào bất kỳ chỉ số nào', () => {
  const cards = metrics.buildMetricCards(result.items, 1000);
  const countable = result.items.filter(metrics.isCountable).length;
  assert.strictEqual(cards.totalFeedbacks.valid, countable);
  assert.strictEqual(
    cards.totalFeedbacks.value - cards.totalFeedbacks.valid,
    cards.totalFeedbacks.excluded,
    'số bị loại phải khớp'
  );
  assert.ok(cards.totalFeedbacks.excluded > 0, 'kịch bản này phải có phản hồi bị loại');
});

// ==================================================================
console.log(`\n${'='.repeat(52)}`);
console.log(`Kết quả: ${passed} đạt, ${failed} lỗi`);
console.log('='.repeat(52));
process.exit(failed > 0 ? 1 : 0);
