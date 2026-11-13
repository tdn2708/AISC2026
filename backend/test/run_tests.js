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

test('Bảng số liệu: khối dữ liệu chỉ gồm phản hồi được tính, mã hoá đúng từ điển', () => {
  const { buildCube } = require('../services/bi_cube');
  const asOf = '2026-11-10T12:00:00Z';
  const items = [
    { timestamp: '2026-11-10T08:00:00Z', source: 'Shopee', category: 'Delivery', subCategory: 'Late', sentiment: 'Negative', productName: 'Áo', rating: 2, trust: { weight: 0.8 } },
    { timestamp: '2026-11-08T08:00:00Z', source: 'Shopee', category: 'Other', sentiment: 'Positive', productName: ' ', rating: 5, trust: { weight: 1 } },
    { timestamp: '2026-11-09T08:00:00Z', source: 'Tiki', category: 'Delivery', sentiment: 'Neutral', trust: { weight: 0 } }
  ];
  const cube = buildCube(items, {
    asOf,
    evidenceKind: (f) => (f.rating === 5 ? 'verified' : 'inferred'),
    isCountable: (f) => f.trust.weight > 0,
    categoryLabel: (k) => `nhom ${k}`,
    causeLabel: (c, s) => `${c}/${s}`
  });
  assert.strictEqual(cube.rows.length, 2, 'phản hồi trọng số 0 không vào khối');
  assert.deepStrictEqual(cube.dicts.source, ['Shopee']);
  assert.deepStrictEqual(cube.rows[0], [0, 0, 0, 0, 2, 0, 0, 2, 8000]);
  assert.deepStrictEqual(cube.rows[1], [2, 0, -1, 2, 0, -1, -1, 5, 10000], 'Other và sản phẩm rỗng thành -1');
  assert.strictEqual(cube.dicts.cause[0].label, 'Delivery/Late');
});

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

test('Văn bản tổ hợp dấu (NFD) cho kết quả y hệt dạng dựng sẵn (NFC)', () => {
  const s = 'Giao hàng chậm quá, shop lừa đảo';
  assert.strictEqual(normalizer.normalize(s.normalize('NFD')).normalized, normalizer.normalize(s).normalized);
});

test('Từ thật không bị dịch nhầm thành teencode', () => {
  assert.ok(normalizer.normalize('hôm qua shop giao').normalized.includes('hôm qua'), '"qua" không được thành "quá"');
  assert.ok(normalizer.normalize('ban đầu dùng ổn').normalized.includes('ban đầu'), '"ban" không được thành "bạn"');
  assert.ok(normalizer.normalize('size m vừa').normalized.includes('size m'), '"size m" không được thành "size mình"');
  assert.ok(normalizer.normalize('Sp tốt.giao nhanh').normalized.includes('tốt. giao'), 'thiếu dấu cách sau dấu chấm không được dính chữ');
});

test('Chữ kéo dài và Telex bị Unikey trả về được hiểu đúng từ', () => {
  assert.strictEqual(normalizer.normalize('ngonnnnnn quáaaa').normalized, 'ngon quá');
  assert.strictEqual(normalizer.normalize('chaamjmmmm').normalized, 'chậm');
  assert.strictEqual(normalizer.normalize('ddepjppppp').normalized, 'đẹp');
  for (const w of ['max', 'box', 'bus', 'good', 'free', 'wow', 'shop', 'size']) {
    assert.strictEqual(normalizer.restoreTelex(w), null, `"${w}" không phải Telex`);
  }
});

test('Số điện thoại được phát hiện ổn định qua nhiều lần gọi', () => {
  const ad = 'Liên hệ mua sỉ giá gốc gọi ngay 0912345678 nhé';
  const runs = [1, 2, 3, 4].map(() => normalizer.spamSignals(ad).hasPhone);
  assert.deepStrictEqual(runs, [true, true, true, true]);
});

test('Chữ kéo dài mang cảm xúc không bị coi là rác; gõ phím bừa thì vẫn bị', () => {
  const spam = (s) => trust.runSpamFilter({ originalText: s }, normalizer.normalize(s)).isSpam;
  for (const s of ['ngonnnnnnn', 'chaamjmmmm', 'Giao chậmmmmmmm quá trời', 'đẹppppppp quá shop ơi', 'giao hang cham qua']) {
    assert.strictEqual(spam(s), false, `"${s}" có nghĩa, không phải rác`);
  }
  for (const s of ['hhhhhhhhhhhh', '👍', '.']) {
    assert.strictEqual(spam(s), true, `"${s}" vẫn phải là rác`);
  }
});

test('Đánh giá ngắn ít thông tin KHÔNG bị coi là rác, chỉ gắn cờ; lời chê ngắn không bị gắn cờ', () => {
  const run = (s) => trust.runSpamFilter({ originalText: s }, normalizer.normalize(s));
  for (const s of ['ok', 'Hàng tốt.', '5 sao', 'Nghe tốt']) {
    const r = run(s);
    assert.strictEqual(r.isSpam, false, `"${s}" là lời khen ngắn của người mua, không phải rác`);
    assert.strictEqual(r.lowInfo, true, `"${s}" phải được gắn cờ ít thông tin`);
  }
  assert.strictEqual(run('Âm thanh nhỏ quá').lowInfo, false, 'lời chê ngắn nêu khía cạnh không phải "ít thông tin"');
});

test('Chu kỳ bán rã dài giữ được đánh giá cũ trong chỉ số; 30 ngày thì về 0', () => {
  const now = new Date('2026-10-30T00:00:00Z');
  const old = [{ _id: 'a', source: 'Tiki', author: 'A', verifiedPurchase: true, accountAgeDays: 900, rating: 2,
    originalText: 'Giao hàng chậm quá, hộp bị móp méo hết cả', timestamp: new Date('2025-06-01T00:00:00Z') }];
  const w = (h) => trust.runTrustLayer(JSON.parse(JSON.stringify(old)).map((f) => ({ ...f, timestamp: new Date(f.timestamp) })), { now, halfLifeDays: h }).items[0].trust.weight;
  assert.strictEqual(w(30), 0, '500 ngày tuổi với chu kỳ 30 ngày phải về 0');
  assert.ok(w(180) > 0.1, `chu kỳ 180 ngày phải giữ trọng số đáng kể, nhận ${w(180)}`);
});

// ==================================================================
console.log('\nTAXONOMY');

test('Nhắc tới shipper hay khía cạnh khác trong lời KHEN không phải khiếu nại', () => {
  const rules = (s) => taxonomy.classifyByRules(normalizer.normalize(s).normalized);
  for (const s of ['Shipper thân thiện, giao nhanh', 'Anh shipper dễ thương lắm', 'Tài xế giao hàng nhiệt tình',
    'Nhân viên thái độ rất tốt', 'Đóng gói kỹ, thùng carton dày chắc chắn', 'Cổng thanh toán nhanh gọn',
    'Đèn báo sáng đẹp', 'App không lag chút nào', 'Shipper giao hàng nhanh, không hề cáu gắt']) {
    assert.strictEqual(rules(s).length, 0, `"${s}" bị gán nhầm: ${rules(s).map((m) => m.cause).join(', ')}`);
  }
  const causes = (s) => rules(s).map((m) => m.cause);
  assert.ok(causes('Shipper cáu gắt, quát khách').includes('CourierAttitude'));
  assert.ok(causes('Anh shipper thân thiện nhưng hộp bị móp').includes('DamagedInTransit'));
  assert.ok(!causes('Anh shipper thân thiện nhưng hộp bị móp').includes('CourierAttitude'), 'lời khen shipper ở mệnh đề khác');
  assert.ok(causes('Nhân viên thái độ không tốt').includes('BadAttitude'));
  assert.ok(causes('Thùng carton bị rách, ướt hết').includes('DamagedInTransit'));
});

test('Lớp an toàn gỡ khiếu nại shipper mô hình gán nhầm cho lời khen, giữ lời chê thật', () => {
  const visobert = require('../services/visobert_client');
  const pred = {
    sentiment: 'Positive', category: 'Delivery', cause: 'CourierAttitude', categoryConfidence: 0.6,
    categories: [{ category: 'Delivery', p: 0.6, cause: 'CourierAttitude', causeConfidence: 0.6 }]
  };
  const praise = visobert.guardPrediction(pred, 'Anh shipper vui tính, còn phụ mình bê thùng lên tận lầu ba');
  assert.strictEqual(visobert.detectedAspects(praise).length, 0, 'lời khen không được thành khiếu nại');
  assert.ok(praise.guard, 'phải ghi lại việc đã gỡ và lý do');
  for (const s of ['Shipper cáu gắt, quát khách', 'Anh giao hàng thì vui vẻ nhưng shipper lần trước chửi mình', 'Shipper không thân thiện chút nào']) {
    assert.strictEqual(visobert.guardPrediction(pred, s), pred, `"${s}" là lời chê thật, không được gỡ`);
  }
});

test('Kết quả mô hình do trình duyệt gửi lên được làm sạch trước khi dùng', () => {
  const visobert = require('../services/visobert_client');
  const bad = {
    prediction: {
      sentiment: '<script>', sentimentConfidence: 'cao', spamProbability: 7,
      categories: [...Array(50)].map(() => ({ category: 'Delivery', p: 2, cause: 'x'.repeat(5000) }))
    },
    tokens: [...Array(10000)].map(() => 'a'), words: [...Array(500)].map(() => 'b'),
    importance: { category: { values: [...Array(1000)].map(() => 'NaN') } }, device: 'máy chủ giả'
  };
  const e = visobert.sanitizeClientExplain(bad, 'câu thử');
  assert.strictEqual(e.prediction.sentiment, 'Neutral');
  assert.strictEqual(e.prediction.sentimentConfidence, null);
  assert.strictEqual(e.prediction.spamProbability, null, 'xác suất ngoài [0,1] bị bỏ');
  assert.ok(e.prediction.categories.length <= 8 && e.prediction.categories[0].cause.length <= 60);
  assert.ok(e.tokens.length <= 300 && e.words.length <= 60 && e.importance.category.values.length <= 60);
  assert.strictEqual(e.device, 'trình duyệt (WebAssembly)', 'không nhận nhãn thiết bị do phía người dùng tự khai');
  assert.strictEqual(visobert.sanitizeClientExplain(null, 'x'), null);
});

test('Lời chê bị phủ định được hiểu là lời khen', () => {
  const { classifyByRulesFallback } = require('../services/ai_analyzer');
  for (const s of ['Không có gì để chê', 'Hết chỗ chê luôn', 'Chẳng có gì phải chê', 'Hàng không lỗi, đóng gói kỹ', 'App không lag chút nào']) {
    assert.strictEqual(classifyByRulesFallback(s).sentiment, 'Positive', s);
  }
  for (const s of ['Sản phẩm không tốt', 'chẳng đẹp gì cả', 'Nhân viên mất lịch sự']) {
    assert.strictEqual(classifyByRulesFallback(s).sentiment, 'Negative', s);
  }
});
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
console.log('\nVISOBERT (không cần dịch vụ chạy)');
// ==================================================================

const visobert = require('../services/visobert_client');
const { buildLabels } = require('../scripts/prepare_nlp_data');

test('Đầu vào mô hình luôn che PII; chế độ masked giữ nguyên teencode', () => {
  const raw = 'Sp ok lắm, gọi 0912345678 nha';
  const masked = visobert.prepareInput(raw, 'masked');
  assert.ok(!masked.includes('0912345678'), 'số điện thoại lọt vào đầu vào mô hình');
  assert.ok(masked.includes('[SĐT]'), 'thiếu token che PII');
  assert.ok(masked.includes('Sp ok'), 'chế độ masked không được dịch teencode');
  const normalized = visobert.prepareInput(raw, 'normalized');
  assert.ok(!normalized.includes('0912345678'), 'số điện thoại lọt vào đầu vào mô hình');
});

test('Nhãn mô hình bị ép về taxonomy, không nhận nhãn lạ hay tổ hợp sai nhánh', () => {
  const ok = visobert.toAnalysis({ category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative', causeConfidence: 0.8 });
  assert.strictEqual(ok.category, 'Delivery');
  assert.strictEqual(ok.subCategory, 'LateDelivery');
  assert.strictEqual(ok.labelledBy, 'visobert');

  const alien = visobert.toAnalysis({ category: 'Foo', cause: 'Bar', sentiment: 'Weird' });
  assert.strictEqual(alien.category, 'Other');
  assert.strictEqual(alien.subCategory, null);
  assert.strictEqual(alien.sentiment, 'Neutral');

  const crossBranch = visobert.toBaselinePrediction({ category: 'Delivery', cause: 'DoubleCharge', sentiment: 'Negative' });
  assert.strictEqual(crossBranch.cause, null, 'nguyên nhân khác nhánh phải bị bỏ');
});

test('Mô hình đa nhãn trả đủ khía cạnh; nhãn lệch nhánh bị loại', () => {
  const aspects = visobert.detectedAspects({
    category: 'Delivery',
    categories: [
      { category: 'Delivery', p: 0.99, cause: 'LateDelivery', causeConfidence: 0.9 },
      { category: 'CustomerService', p: 0.83, cause: 'SlowResponse', causeConfidence: 0.7 },
      { category: 'KhongCoThat', p: 0.6, cause: 'Bịa', causeConfidence: 0.5 }
    ]
  });
  assert.strictEqual(aspects.length, 2, 'danh mục ngoài taxonomy phải bị loại');
  assert.deepStrictEqual(aspects.map((a) => a.category), ['Delivery', 'CustomerService']);
  assert.strictEqual(aspects[1].causeLabel, 'Phản hồi chậm');
  assert.strictEqual(aspects[0].owner, taxonomy.categoryOwner('Delivery'));

  const crossBranch = visobert.detectedAspects({
    categories: [{ category: 'Delivery', p: 0.9, cause: 'DoubleCharge', causeConfidence: 0.8 }]
  });
  assert.strictEqual(crossBranch[0].cause, null, 'nguyên nhân khác nhánh phải bị bỏ');
});

test('Checkpoint một nhãn đời cũ vẫn dựng được danh sách khía cạnh', () => {
  const analysis = visobert.toAnalysis({
    category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative',
    categoryConfidence: 0.95, causeConfidence: 0.9
  });
  assert.strictEqual(analysis.aspects.length, 1);
  assert.strictEqual(analysis.category, 'ProductQuality');
  assert.strictEqual(analysis.subCategory, 'TechnicalDefect');
});

test('Nhiều khía cạnh được tóm tắt đủ, danh mục chính giữ nguyên cho bản ghi', () => {
  const analysis = visobert.toAnalysis({
    category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative',
    categories: [
      { category: 'Delivery', p: 0.99, cause: 'LateDelivery', causeConfidence: 0.9 },
      { category: 'CustomerService', p: 0.8, cause: 'SlowResponse', causeConfidence: 0.6 }
    ]
  });
  assert.strictEqual(analysis.category, 'Delivery', 'bản ghi vẫn cần một danh mục chính');
  assert.strictEqual(analysis.aspects.length, 2);
  assert.ok(analysis.aiSummary.includes('Giao hàng') && analysis.aiSummary.includes('Dịch vụ khách hàng'),
    'tóm tắt phải nêu cả hai vấn đề');
});

test('Không gian nhãn cho Python sinh đúng từ taxonomy', () => {
  const labels = buildLabels();
  assert.strictEqual(labels.category.length, taxonomy.CATEGORY_KEYS.length + 1, 'thiếu lớp NONE');
  assert.strictEqual(labels.cause.length, taxonomy.CAUSE_COUNT + 1);
  assert.ok(labels.cause.includes('Delivery.DamagedInTransit'));
});

test('Điểm rác của mô hình không một mình chặn được khiếu nại thật', () => {
  const complaint = 'Giao hàng trễ cả tuần, gọi tổng đài không ai bắt máy, quá thất vọng';
  const r = trust.runSpamFilter({ originalText: complaint }, normalizer.normalize(complaint), 0.99);
  assert.strictEqual(r.isSpam, false, 'khiếu nại không có dấu hiệu thương mại bị chặn vì điểm mô hình');
  assert.strictEqual(r.modelScore, 0.99);
});

test('Điểm rác cao của mô hình nâng dấu hiệu yếu thành bằng chứng đủ chặn', () => {
  const text = 'Hàng về rồi nha mọi người, ai cần thì ib mình tư vấn thêm nhé';
  const norm = normalizer.normalize(text);
  assert.strictEqual(trust.runSpamFilter({ originalText: text }, norm).isSpam, false, 'lớp luật một mình không được chặn câu này');
  assert.strictEqual(trust.runSpamFilter({ originalText: text }, norm, 0.5).isSpam, false, 'điểm thấp không được chặn');
  const high = trust.runSpamFilter({ originalText: text }, norm, 0.99);
  assert.strictEqual(high.isSpam, true, 'điểm cao kèm "ib" phải chặn');
  assert.ok(high.reasons.some((x) => x.includes('ViSoBERT')), 'lý do phải nêu rõ là do mô hình');
});

function paraphraseCampaign(embeddingFor) {
  const base = new Date('2026-09-01T08:00:00Z').getTime();
  const texts = [
    'sản phẩm tuyệt vời shop tư vấn nhiệt tình',
    'đồ xịn đóng gói kỹ càng rất đáng mua',
    'chất lượng vượt mong đợi sẽ quay lại ủng hộ',
    'hàng đẹp y hình giao siêu tốc luôn',
    'mua lần hai vẫn ưng như lần đầu',
    'giá hợp lý chất liệu mịn đường may chắc'
  ];
  return texts.map((t, i) => ({
    _normalized: t,
    productName: 'Sản phẩm A',
    timestamp: new Date(base + i * 5 * 60000),
    _embedding: embeddingFor(i)
  }));
}

test('Kênh vector nhúng bổ sung được cặp mà vector token bỏ sót', () => {
  // Kiểm tra CƠ CHẾ bằng vector giả lập; vector nhúng gốc thật không tách được câu viết lại (xem README hiệu chỉnh)
  const same = paraphraseCampaign(() => Float32Array.from([1, 0, 0]));
  const noEmb = same.map((it) => ({ ...it, _embedding: null }));
  assert.strictEqual(trust.detectNearDuplicateClusters(noEmb).clusters.length, 0, 'vector token không được gom các câu khác chữ');
  const withEmb = trust.detectNearDuplicateClusters(same);
  assert.strictEqual(withEmb.clusters.length, 1, 'vector nhúng vượt ngưỡng phải gom thành cụm');
  assert.strictEqual(withEmb.clusters[0].size, 6);
});

test('Bật vector nhúng không làm mất cụm mà vector token đã bắt được', () => {
  const copies = paraphraseCampaign((i) => {
    const v = new Float32Array(6);
    v[i] = 1; // vector nhúng trực giao: kênh nhúng không kích hoạt
    return v;
  }).map((it) => ({ ...it, _normalized: 'sản phẩm rất tốt shop giao hàng nhanh đóng gói đẹp' }));
  const r = trust.detectNearDuplicateClusters(copies);
  assert.strictEqual(r.clusters.length, 1, 'cụm chép nguyên văn bị mất khi có vector nhúng');
  assert.strictEqual(r.clusters[0].size, 6);
});

test('Vector nhúng khác nhau không bị gom cụm, ràng buộc thời gian vẫn giữ nguyên', () => {
  const orthogonal = paraphraseCampaign((i) => {
    const v = new Float32Array(6);
    v[i] = 1;
    return v;
  });
  assert.strictEqual(trust.detectNearDuplicateClusters(orthogonal).clusters.length, 0);

  const spread = paraphraseCampaign(() => Float32Array.from([1, 0, 0])).map((it, i) => ({
    ...it,
    timestamp: new Date(new Date('2026-09-01T08:00:00Z').getTime() + i * 24 * 3600000)
  }));
  assert.strictEqual(trust.detectNearDuplicateClusters(spread).clusters.length, 0, 'cụm rải nhiều ngày không phải chiến dịch');
});

test('Trust Layer dùng tín hiệu mô hình rồi gỡ vector nhúng khỏi kết quả', () => {
  const fbs = paraphraseCampaign(() => null).map((it, i) => ({
    _id: 'v' + i, originalText: it._normalized, author: 'u' + i, source: 'Shopee',
    productName: it.productName, timestamp: it.timestamp, accountAgeDays: 200
  }));
  const signals = fbs.map(() => ({ embedding: Float32Array.from([0, 1, 0]), spamScore: 0.1 }));
  const out = trust.runTrustLayer(fbs, { orders: [], modelSignals: signals, now: new Date('2026-09-02T00:00:00Z') });
  assert.strictEqual(out.modelSignals.embeddingsUsed, fbs.length);
  assert.strictEqual(out.modelSignals.spamScoresUsed, fbs.length);
  assert.ok(out.items.every((it) => !('_embedding' in it)), 'vector nhúng lọt ra kết quả');
  assert.strictEqual(out.clusters.length, 1, 'tín hiệu vector nhúng phải được dùng trong T2');
});

// ==================================================================
// DỮ LIỆU THẬT: che thông tin cá nhân, chống trùng, dữ kiện sàn xác nhận
// ==================================================================
const ingest = require('../services/ingest');

test('Tên người mua bị che, mã khách ẩn danh ổn định và không lộ mã gốc', () => {
  assert.strictEqual(ingest.maskName('Quang Duy Ha'), 'Quang D. H.');
  assert.strictEqual(ingest.maskName('Linh'), 'L***');
  assert.strictEqual(ingest.maskName(''), 'Ẩn danh');
  const keep = process.env.PII_SALT;
  process.env.PII_SALT = 'muoi-bi-mat-chi-de-chay-test-0123456789';
  const a = ingest.pseudoCustomerId('Tiki', 1769036);
  assert.strictEqual(a, ingest.pseudoCustomerId('Tiki', 1769036), 'cùng khách phải ra cùng mã');
  assert.notStrictEqual(a, ingest.pseudoCustomerId('Tiki', 1769037));
  assert.ok(a.startsWith('tiki:') && !a.includes('1769036'), 'mã ẩn danh không được chứa mã gốc');
  // Muối công khai thì băm ra dò ngược được: không lưu mã khách
  process.env.PII_SALT = 'customer-radar';
  assert.strictEqual(ingest.pseudoCustomerId('Tiki', 1769036), null);
  if (keep === undefined) delete process.env.PII_SALT; else process.env.PII_SALT = keep;
});

test('Bản ghi từ sàn: che tên, giữ dữ kiện sàn, không lưu mã khách gốc, chống trùng theo mã đánh giá', () => {
  const raw = {
    source: 'Tiki', rawText: 'Chuột hay mất kết nối', author: 'Quang Duy Ha', rating: 1,
    productName: 'Chuột HXSJ', timestamp: new Date('2024-07-27T02:41:46Z'), accountAgeDays: 2846,
    platformFacts: {
      platform: 'Tiki', reviewId: 19937935, verifiedPurchase: true,
      deliveredAt: new Date('2024-07-23T08:20:59Z'), customerRatings: [], replies: [], rawCustomerId: 1769036
    }
  };
  const [doc] = ingest.buildFeedbackDocs([raw], [{ category: 'ProductQuality', subCategory: 'TechnicalDefect', sentiment: 'Negative' }], { collectedVia: 'test' });
  assert.strictEqual(doc.author, 'Quang D. H.');
  assert.strictEqual(doc.verifiedPurchase, true);
  assert.ok(!('rawCustomerId' in doc.platformFacts), 'mã khách gốc không được lưu');
  const edited = { ...doc, originalText: 'nội dung đã sửa', author: 'tên khác' };
  assert.strictEqual(ingest.dedupKey(doc), ingest.dedupKey(edited), 'cùng mã đánh giá thì cùng khóa');
});

test('Sàn xác nhận đã mua -> P1; viết trước mốc giao do sàn ghi nhận -> bất nhất', () => {
  const base = { source: 'Tiki', author: 'Quang D. H.', accountAgeDays: 400, verifiedPurchase: true };
  assert.strictEqual(trust.assignProvenanceTier(base).tier, 'P1');
  assert.strictEqual(trust.assignProvenanceTier({ ...base, verifiedPurchase: false }).tier, 'P3');
  const early = trust.transactionMismatch({ ...base, timestamp: new Date('2024-07-20T00:00:00Z'), deliveredAt: new Date('2024-07-23T08:00:00Z') }, new Map());
  assert.ok(early.score >= 0.9 && early.available, 'đánh giá trước ngày giao 3 ngày phải bị đánh dấu');
  const ok = trust.transactionMismatch({ ...base, timestamp: new Date('2024-07-27T00:00:00Z'), deliveredAt: new Date('2024-07-23T08:00:00Z') }, new Map());
  assert.strictEqual(ok.score, 0);
});

test('Thành phần bằng chứng: người duyệt > đối soát > suy luận, bỏ phản hồi bị loại', () => {
  const fb = (tier, extra = {}) => ({ sentiment: 'Negative', timestamp: new Date(), trust: { tier, weight: 0.5, ...extra }, labelledBy: 'llm' });
  const mix = metrics.evidenceMix([
    fb('P1'), fb('P2'), fb('P3'), fb('P4', { humanLabel: 'valid' }), fb('P1', { humanLabel: 'valid' }),
    fb('P1', { weight: 0 })
  ]);
  assert.deepStrictEqual(
    { total: mix.total, human: mix.human, verified: mix.verified, inferred: mix.inferred },
    { total: 5, human: 2, verified: 2, inferred: 1 }
  );
  assert.strictEqual(mix.labels.llm, 5);
  const ev = metrics.buildEvidence([fb('P1'), fb('P3')]);
  assert.strictEqual(ev.reconcilableComplaints.total, 1);
  assert.strictEqual(ev.samples.length, 2);
});

console.log('\nTÍNH NĂNG MỚI: KIỂM TRA, HIỆU QUẢ, SO SÁNH, TRẢ LỜI');
const insights = require('../services/insights');

test('Khoảng Wilson không sụp về 100% khi mẫu nhỏ toàn đúng', () => {
  const w = stats.wilsonInterval(30, 30);
  assert.strictEqual(w.p, 1);
  assert.ok(w.low > 0.88 && w.low < 0.89, `cận dưới ~0,886, nhận ${w.low}`);
  const h = stats.wilsonInterval(45, 50);
  assert.ok(h.low < 0.9 && h.high > 0.9 && h.high < 1);
  assert.strictEqual(stats.wilsonInterval(0, 0).p, null);
});

test('Kiểm tra ngẫu nhiên: lấy đúng phản hồi được tính, bỏ phản hồi đã kiểm; tổng hợp đúng', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ _id: `f${i}`, trust: { weight: i < 40 ? 0.5 : 0 } }));
  const { items: s, remaining } = insights.auditSample(items, new Set(['f0', 'f1']), 10, () => 0.3);
  assert.strictEqual(remaining, 38);
  assert.strictEqual(s.length, 10);
  assert.ok(s.every((f) => f.trust.weight > 0 && f._id !== 'f0' && f._id !== 'f1'));
  const sum = insights.auditSummary([
    { categoryCorrect: true, sentimentCorrect: true, by: 'A', labelledBy: 'llm' },
    { categoryCorrect: false, sentimentCorrect: true, by: 'B', labelledBy: 'llm', aiCategory: 'Delivery', correctCategory: 'ProductQuality' }
  ]);
  assert.strictEqual(sum.n, 2);
  assert.strictEqual(sum.category.p, 0.5);
  assert.strictEqual(sum.sentiment.p, 1);
  assert.strictEqual(sum.reviewers, 2);
  assert.strictEqual(sum.topConfusions[0].count, 1);
});

test('Hiệu quả sau quyết định: so đúng phạm vi 7 ngày trước / sau', () => {
  const at = new Date('2026-10-19T00:00:00Z');
  const mk = (d, cat) => ({ productName: 'P', category: cat, subCategory: 'LateDelivery', sentiment: 'Negative', trust: { weight: 1 }, timestamp: new Date(at.getTime() + d * 86400000) });
  const items = [
    ...[-6, -5, -4, -3].map((d) => mk(d, 'Delivery')), mk(-2, 'Other'), mk(-1, 'Other'),
    mk(2, 'Delivery'), ...[3, 4, 5].map((d) => mk(d, 'Other'))
  ];
  const e = insights.decisionEffect(items, { decision: 'ACCEPTED', at, alertId: 'Delivery|LateDelivery|P|*|2026-10-19' }, new Date('2026-10-30'));
  assert.strictEqual(e.status, 'done');
  assert.strictEqual(e.before.rate, 4 / 6);
  assert.strictEqual(e.after.rate, 1 / 4);
  assert.ok(e.change < 0);
  const pending = insights.decisionEffect(items, { decision: 'ACCEPTED', at, alertId: 'Delivery|*|*|*|x' }, new Date('2026-10-22'));
  assert.strictEqual(pending.status, 'pending');
  assert.strictEqual(insights.decisionEffect(items, { decision: 'DISMISSED', at, alertId: 'x' }, new Date()), null);
});

test('So sánh hai sản phẩm có kiểm định khác biệt', () => {
  const mk = (p, neg, i) => ({ _id: `${p}${i}`, productName: p, sentiment: neg ? 'Negative' : 'Positive', category: neg ? 'Delivery' : 'Other', subCategory: neg ? 'LateDelivery' : null, rating: neg ? 1 : 5, trust: { weight: 1, tier: 'P1' } });
  const items = [
    ...Array.from({ length: 200 }, (_, i) => mk('A', i < 80, i)),
    ...Array.from({ length: 200 }, (_, i) => mk('B', i < 20, i))
  ];
  const r = insights.compareProducts(items, 'A', 'B');
  assert.strictEqual(r.a.n, 200);
  assert.strictEqual(r.a.negativeShare.p, 0.4);
  assert.ok(r.difference.significant, '40% so với 10% trên 200 mẫu phải có ý nghĩa');
  assert.strictEqual(r.categories[0].key, 'Delivery');
  assert.strictEqual(insights.productList(items).length, 2);
});

test('Bản trả lời dự phòng nhắc đúng vấn đề và không hứa hẹn', () => {
  const t = insights.fallbackReply({ causeLabel: 'Giao chậm' }, 'formal');
  assert.ok(t.includes('giao chậm'));
  assert.ok(!/hoàn tiền|mã giảm|voucher/i.test(t));
  const p = insights.buildReplyPrompt({ originalText: 'giao trễ quá', rating: 1, causeLabel: 'Giao chậm' }, null, 'friendly');
  assert.ok(p.includes('KHÔNG hứa hoàn tiền') && p.includes('giao trễ quá'));
});

console.log('\nMỈA MAI VÀ GÁN NHÃN NHIỀU TẦNG');
const sarcasm = require('../services/sarcasm');
const { applyJudgement } = require('../services/label_cascade');
const { applyHumanLabels } = require('../services/analysis_context');

test('Luật nghi mỉa mai bắt lệch sao và "khen + sự việc tiêu cực", bỏ qua lời khen thật', () => {
  const s1 = sarcasm.sarcasmSignals({ text: 'Giao nhanh ghê, đặt mùng 1 mà 15 mới tới', rating: 1, sentiment: 'Positive' });
  assert.ok(s1.suspected, 'sao thấp + chữ khen phải bị nghi');
  const s2 = sarcasm.sarcasmSignals({ text: 'Chất lượng tuyệt vời, dùng 2 hôm là hỏng 🙂', rating: null, sentiment: 'Positive' });
  assert.ok(s2.suspected, 'khen + hỏng + giọng mỉa, không có sao vẫn phải bị nghi');
  const s3 = sarcasm.sarcasmSignals({ text: 'Hàng tốt, giao nhanh, đóng gói kỹ', rating: 5, sentiment: 'Positive' });
  assert.strictEqual(s3.suspected, false, 'lời khen thật không bị nghi');
  const s4 = sarcasm.sarcasmSignals({ text: 'Giao chậm, hộp móp', rating: 5, sentiment: 'Negative' });
  assert.ok(s4.ratingConflict && !s4.suspected, '5 sao mà chê là lệch sao, không phải mỉa mai');
});

test('Bỏ phiếu: mô hình thứ hai + số sao thắng mô hình chính; hai nhóm khác nhau thì cần người', () => {
  const primary = { sentiment: 'Positive', category: 'Other', subCategory: null };
  const judge = { sentiment: 'Negative', category: 'Delivery', subCategory: 'LateDelivery', sarcastic: true };
  const v = sarcasm.resolveVotes(primary, judge, 1);
  assert.strictEqual(v.sentiment, 'Negative');
  assert.strictEqual(v.category, 'Delivery');
  assert.strictEqual(v.needsReview, false, 'đa số rõ ràng thì không cần người');
  const conflict = sarcasm.resolveVotes({ sentiment: 'Negative', category: 'ProductQuality' }, { sentiment: 'Negative', category: 'Delivery', sarcastic: false }, 1);
  assert.strictEqual(conflict.needsReview, true, 'hai mô hình chỉ ra hai nhóm khác nhau phải hỏi người');
  const split = sarcasm.resolveVotes({ sentiment: 'Positive', category: 'Other' }, { sentiment: 'Negative', category: 'Other' }, null);
  assert.strictEqual(split.needsReview, true, 'không có số sao và hai mô hình bất đồng thì không có đa số');
});

test('Giám khảo lỗi (null) thì đẩy sang người duyệt, câu bình thường không bị đụng tới', () => {
  const sus = applyJudgement({ text: 'Giao nhanh ghê, 2 tuần mới tới', rating: 1 }, { sentiment: 'Positive', category: 'Other', labelledBy: 'llm' }, null);
  assert.strictEqual(sus.needsReview, true);
  assert.strictEqual(sus.sarcasm.suspected, true);
  assert.strictEqual(sus.labelVotes.rating, 'Negative');
  const normal = applyJudgement({ text: 'Hàng đẹp, đúng mô tả', rating: 5 }, { sentiment: 'Positive', category: 'Other', labelledBy: 'llm' }, null);
  assert.strictEqual(normal.needsReview, false);
  assert.strictEqual(normal.sarcasm.suspected, false);
});

test('"ưng" trong "nhưng" không bị tính là lời khen', () => {
  assert.strictEqual(sarcasm.hasPraise('Nhưng dùng vài bữa đã bị khét'), false);
  assert.strictEqual(sarcasm.hasPraise('siêu ưng ý'), true);
  assert.strictEqual(sarcasm.hasPraise('SP tốt.....'), true);
  assert.strictEqual(sarcasm.hasPraise('ồn'), false);
});

test('Câu không có lời khen thì không thành mỉa mai dù mô hình nói vậy', () => {
  const judge = { sarcastic: true, sentiment: 'Negative', category: 'ProductQuality', subCategory: null, reason: 'x', by: 'groq' };
  const r = applyJudgement({ text: 'ồn', rating: 5 }, { sentiment: 'Negative', category: 'ProductQuality', labelledBy: 'llm' }, judge);
  assert.strictEqual(r.sarcasm.verdict, 'literal');
  assert.strictEqual(r.sentiment, 'Negative', 'vẫn giữ cảm xúc mô hình đưa ra');
});

test('Kết luận mỉa mai mà vẫn Tích cực thì đẩy sang người duyệt', () => {
  const judge = { sarcastic: true, sentiment: 'Positive', category: 'Other', subCategory: null, reason: 'x', by: 'groq' };
  const r = applyJudgement({ text: 'Sản phẩm rất tốt, rất hài lòng', rating: 1 }, { sentiment: 'Positive', category: 'Other', labelledBy: 'llm' }, judge);
  assert.strictEqual(r.sarcasm.verdict, 'sarcastic');
  assert.strictEqual(r.needsReview, true);
});

test('Nhãn người duyệt ghi đè nhãn máy và giữ lại nhãn máy cũ', () => {
  const fbs = [{ _id: 'a', sentiment: 'Positive', category: 'Other', subCategory: null, labelledBy: 'llm', needsReview: true }, { _id: 'b', sentiment: 'Negative', category: 'Delivery' }];
  const n = applyHumanLabels(fbs, [{ feedbackId: 'a', correctSentiment: 'Negative', correctCategory: 'Delivery', correctCause: 'LateDelivery', sarcasm: true }]);
  assert.strictEqual(n, 1);
  assert.deepStrictEqual([fbs[0].sentiment, fbs[0].category, fbs[0].subCategory, fbs[0].labelledBy], ['Negative', 'Delivery', 'LateDelivery', 'human']);
  assert.strictEqual(fbs[0].machineLabel.sentiment, 'Positive');
  assert.strictEqual(fbs[0].sarcasm.verdict, 'sarcastic');
  assert.strictEqual(fbs[0].needsReview, false);
  assert.strictEqual(fbs[1].labelledBy, undefined, 'phản hồi chưa duyệt không bị đụng tới');
});

test('Bộ test mù cố định theo mã và chiếm khoảng 15%', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `id${i}`);
  const blind = ids.filter(insights.isBlindTest).length / ids.length;
  assert.ok(blind > 0.12 && blind < 0.18, `tỉ lệ test mù ${blind}`);
  assert.strictEqual(insights.isBlindTest('id7'), insights.isBlindTest('id7'));
});

test('Câu mỉa mai không bị Trust Layer coi là lệch sao (không hạ trọng số oan)', () => {
  const norm = normalizer.normalize('Giao nhanh ghê, 15 ngày mới tới');
  const plain = trust.starTextMismatch({ rating: 1, sentiment: 'Positive' }, norm);
  assert.ok(plain.score > 0.5, 'không có thông tin mỉa mai thì vẫn bị coi là lệch');
  const sar = trust.starTextMismatch({ rating: 1, sentiment: 'Positive', sarcasm: { suspected: true, verdict: null } }, norm);
  assert.strictEqual(sar.score, 0);
  const literal = trust.starTextMismatch({ rating: 1, sentiment: 'Positive', sarcasm: { suspected: true, verdict: 'literal' } }, norm);
  assert.ok(literal.score > 0.5, 'người/mô hình đã kết luận KHÔNG mỉa mai thì lệch sao vẫn tính');
});

test('Các file route nạp được (bắt lỗi cú pháp trước khi máy chủ không khởi động nổi)', () => {
  for (const r of ['../routes/api', '../routes/live']) {
    const router = require(r);
    assert.strictEqual(typeof router, 'function', `${r} phải xuất ra một router`);
  }
});

// ==================================================================
// LIVESTREAM
// ==================================================================
const liveIntent = require('../services/live/intent');
const liveAnswer = require('../services/live/answer');
const { LiveAggregator, groupKeyOf } = require('../services/live/aggregator');
const { MEGALIVE_CATALOG, MEGALIVE_POLICY } = require('../services/live/connectors/simulator');

test('Live: phân loại ý định bình luận, kể cả gõ không dấu', () => {
  const cases = [
    ['giá bao nhiêu shop', 'question', 'price'],
    ['gia bn v', 'question', 'price'],
    ['còn size M không', 'question', 'stock'],
    ['1m6 50kg mặc size gì ạ', 'question', 'size'],
    ['ship về Cà Mau mất mấy ngày', 'question', 'shipping'],
    ['có mã giảm giá không', 'question', 'promo'],
    ['có bị xù không', 'question', 'material'],
    ['chốt M2', 'order', null],
    ['lấy 2 cái áo thun', 'order', null],
    ['đơn hôm trước chưa nhận được hàng', 'complaint', null],
    ['nhắn tin không ai trả lời', 'complaint', null],
    ['đẹp quáaaa', 'praise', null],
    ['❤️❤️❤️', 'chatter', null]
  ];
  for (const [text, intent, topic] of cases) {
    const r = liveIntent.classifyComment(text);
    assert.strictEqual(r.intent, intent, `${text} -> ${r.intent}`);
    if (topic) assert.strictEqual(r.topic, topic, `${text} -> ${r.topic}`);
  }
});

test('Live: trích size, màu, số lượng, số đo và che số điện thoại', () => {
  const o = liveIntent.classifyComment('chốt M2 màu đen sdt 0912345678');
  assert.deepStrictEqual([o.intent, o.variant.size, o.variant.color, o.quantity, o.hasPhone], ['order', 'M', 'đen', 2, true]);
  assert.ok(!o.text.includes('0912345678'));
  const b = liveIntent.classifyComment('cao 1m55 nặng 48 mặc size nào');
  assert.deepStrictEqual(b.body, { heightCm: 155, weightKg: 48 });
  assert.strictEqual(liveIntent.classifyComment('size gì vậy').variant.size, undefined, '"gì" không phải mã size');
});

test('Live: nhận sản phẩm theo số giỏ hàng và từ khóa', () => {
  const p = MEGALIVE_CATALOG;
  assert.strictEqual(liveIntent.classifyComment('giỏ 2 còn hàng không', { products: p }).productId, 'quan-jean');
  assert.strictEqual(liveIntent.classifyComment('lấy 1 cái túi', { products: p }).productId, 'tui-tote');
  assert.strictEqual(liveIntent.classifyComment('giá bao nhiêu', { products: p }).productId, null);
});

test('Live: gợi ý trả lời chỉ dùng dữ kiện shop khai báo', () => {
  const session = { products: MEGALIVE_CATALOG, policy: MEGALIVE_POLICY, currentProductId: 'ao-thun' };
  const price = liveAnswer.suggestAnswer({ intent: 'question', topic: 'price', productId: null }, session);
  assert.ok(price.grounded && price.text.includes('129.000đ'), price.text);
  const size = liveAnswer.suggestAnswer({ intent: 'question', topic: 'size', productId: 'ao-thun', body: { heightCm: 165, weightKg: 58 } }, session);
  assert.ok(size.text.includes('size M'), size.text);
  const soldOut = liveAnswer.suggestAnswer({ intent: 'question', topic: 'stock', productId: 'quan-jean', variant: { size: 'XL' } }, session);
  assert.ok(/hết hàng/.test(soldOut.text), soldOut.text);
  const unknown = liveAnswer.suggestAnswer({ intent: 'question', topic: 'price', productId: null }, { products: [], policy: {} });
  assert.strictEqual(unknown.grounded, false, 'không có danh mục thì không được bịa giá');
  assert.ok(!/\d/.test(unknown.text));
});

test('Live: hàng đợi gộp câu hỏi giống nhau, khiếu nại lên đầu, mở lại khi hỏi tiếp', () => {
  const agg = new LiveAggregator({ products: MEGALIVE_CATALOG });
  let i = 0;
  const add = (text) => {
    const c = liveIntent.classifyComment(text, { products: MEGALIVE_CATALOG });
    const doc = { _id: `c${i++}`, ts: new Date(Date.now() + i * 1000), author: { hash: `u${i}`, handle: `u${i}` }, ...c, status: c.intent === 'question' || c.intent === 'complaint' ? 'open' : null };
    doc.groupKey = groupKeyOf(doc);
    agg.add(doc);
    return doc;
  };
  const q1 = add('xin giá áo thun');
  add('áo thun bao nhiêu tiền');
  add('đơn hôm trước chưa nhận được hàng');
  add('chốt 2 áo thun');
  let s = agg.snapshot();
  assert.strictEqual(s.queue[0].intent, 'complaint');
  const priceGroup = s.queue.find((g) => g.topic === 'price');
  assert.strictEqual(priceGroup.count, 2);
  assert.strictEqual(s.totals.orderQuantity, 2);
  agg.resolve(q1.groupKey, 'answered', { text: 'x' });
  assert.ok(!agg.snapshot().queue.some((g) => g.key === q1.groupKey), 'đã trả lời thì rời hàng đợi');
  add('giá áo thun sao shop');
  add('áo thun giá bao nhiêu');
  add('xin giá áo thun ạ');
  s = agg.snapshot();
  assert.ok(s.queue.some((g) => g.key === q1.groupKey), 'ba người hỏi lại thì thẻ mở lại');
});

const { coach: liveCoach, measureEffect } = require('../services/live/coach');

/** Dựng một phiên giả với mốc thời gian cụ thể cho bộ gợi ý hành động */
function liveScenario(lines, { current = 'ao-thun', now = Date.parse('2026-11-11T20:30:00Z') } = {}) {
  const session = { products: MEGALIVE_CATALOG, policy: MEGALIVE_POLICY, currentProductId: current };
  const agg = new LiveAggregator(session);
  let i = 0;
  for (const [minAgo, text] of lines) {
    const c = liveIntent.classifyComment(text, { products: MEGALIVE_CATALOG });
    const inferred = !c.productId && (c.intent === 'question' || c.intent === 'order');
    const doc = {
      _id: `s${i++}`, ts: new Date(now - minAgo * 60000), author: { hash: `u${i}`, handle: `u${i}` }, ...c,
      productId: c.productId || (inferred ? current : null), productInferred: inferred,
      status: c.intent === 'question' || c.intent === 'complaint' ? 'open' : null
    };
    doc.groupKey = groupKeyOf(doc);
    agg.add(doc);
  }
  const suggestionFor = (g) => liveAnswer.suggestAnswer({ intent: g.intent, topic: g.topic, productId: g.productId, variant: { size: g.size } }, session);
  return { agg, session, now, actions: liveCoach({ agg, session, suggestionFor, now }) };
}
const times = (n, minAgo, text) => Array.from({ length: n }, (_, k) => [minAgo - k * 0.1, text]);

test('Live coach: biến thể đã hết mà vẫn có người chốt -> báo hết, gợi ý size còn hàng, tính doanh thu lỡ', () => {
  const { actions } = liveScenario(times(3, 4, 'chốt quần jean size XL'));
  const a = actions.find((x) => x.type === 'soldout_demand');
  assert.ok(a, JSON.stringify(actions.map((x) => x.type)));
  assert.strictEqual(a.severity, 'critical');
  assert.ok(/size L/.test(a.script), a.script);
  assert.strictEqual(a.lostValue, 3 * 299000);
});

test('Live coach: biến thể sắp hết -> câu nói tạo khan hiếm với số lượng thật', () => {
  const { actions } = liveScenario(times(7, 6, 'chốt váy size L'), { current: 'vay-hoa' });
  const a = actions.find((x) => x.type === 'low_stock');
  assert.ok(a, JSON.stringify(actions.map((x) => x.type)));
  assert.ok(/còn 2 cái/.test(a.script), a.script);
});

test('Live coach: nhiều người cùng hỏi giá -> trả lời một lần trên sóng bằng giá trong danh mục', () => {
  const { actions } = liveScenario(times(6, 2, 'giá bao nhiêu shop'));
  const a = actions.find((x) => x.type === 'question_burst');
  assert.ok(a);
  assert.ok(a.script.includes('129.000đ') && !a.script.startsWith('@'), a.script);
});

test('Live coach: khiếu nại dồn dập được ưu tiên cao nhất', () => {
  const lines = [...times(15, 4, 'đẹp quá'), ...times(3, 3, 'đơn hôm trước chưa nhận được hàng'), ...times(6, 2, 'giá bao nhiêu shop')];
  const { actions } = liveScenario(lines);
  assert.strictEqual(actions[0].type === 'complaint_spike' || actions[0].severity === 'critical', true);
  assert.ok(actions.some((x) => x.type === 'complaint_spike'));
});

test('Live coach: bình luận giảm mạnh và khách hỏi dồn sản phẩm chưa giới thiệu', () => {
  const busy = Array.from({ length: 60 }, (_, k) => [8.5 - k * 0.09, k % 2 ? 'đẹp quá' : 'hi shop']);
  const { actions } = liveScenario([...busy, ...times(6, 2.5, 'túi tote còn không shop')]);
  assert.ok(actions.some((x) => x.type === 'engagement_drop'), JSON.stringify(actions.map((x) => x.type)));
  const hot = actions.find((x) => x.type === 'hot_other_product');
  assert.ok(hot && hot.do.productId === 'tui-tote');
});

test('Live coach: báo hết hàng được đo bằng lượt chốt vào đúng biến thể đã hết, không bằng cả sản phẩm', () => {
  const lines = [...times(4, 5.5, 'chốt quần jean size XL'), ...times(8, 2.5, 'chốt quần jean size M'), [1, 'chốt quần jean size XL']];
  const { agg, now } = liveScenario(lines, { current: 'quan-jean' });
  const e = measureEffect(agg, { type: 'soldout_demand', watch: 'order', key: 'quan-jean|XL', productId: 'quan-jean' }, new Date(now - 3 * 60000), now);
  assert.ok(e.ready && e.after < e.before && e.better === true, JSON.stringify(e));
  assert.ok(/hàng đã hết/.test(e.metric));
});

test('Live coach: đo hiệu quả trước/sau một hành động', () => {
  const lines = [...times(3, 5.5, 'chốt M1'), ...times(9, 2.8, 'chốt M1')];
  const { agg, now } = liveScenario(lines);
  const at = new Date(now - 3 * 60000);
  const e = measureEffect(agg, { watch: 'order', productId: 'ao-thun', type: 'ask_not_buy' }, at, now);
  assert.ok(e.ready && e.after > e.before && e.better === true, JSON.stringify(e));
});

test('Muối băm: giá trị mặc định công khai hoặc quá ngắn không được coi là bí mật', () => {
  const { isSecret, saltReady } = require('../services/pii_salt');
  assert.strictEqual(isSecret('customer-radar'), false);
  assert.strictEqual(isSecret('live'), false);
  assert.strictEqual(isSecret('ngan'), false);
  assert.strictEqual(isSecret(undefined), false);
  assert.strictEqual(isSecret('a'.repeat(32)), true);
  const keep = process.env.PII_SALT;
  process.env.PII_SALT = 'customer-radar';
  assert.strictEqual(saltReady(), false, 'muối mặc định thì các đường ghi dữ liệu thật phải từ chối');
  if (keep === undefined) delete process.env.PII_SALT; else process.env.PII_SALT = keep;
});

test('Sổ đối chiếu: phản hồi chờ duyệt còn trọng số được tính tạm, phép trừ vẫn khớp', () => {
  const mk = (band, weight) => ({ trust: { band, weight } });
  const items = [
    mk('ACCEPTED', 0.8), mk('ACCEPTED', 0.5), mk('ACCEPTED', 0),
    mk('SPAM', 0), mk('LIKELY_INAUTHENTIC', 0),
    mk('GRAY_ZONE', 0.3), mk('GRAY_ZONE', 0)
  ];
  const l = metrics.ledgerSplit(items);
  assert.deepStrictEqual(
    { spam: l.spam, inauthentic: l.inauthentic, pendingNotCounted: l.pendingNotCounted, pendingCounted: l.pendingCounted, aged: l.aged, counted: l.counted },
    { spam: 1, inauthentic: 1, pendingNotCounted: 1, pendingCounted: 1, aged: 1, counted: 3 }
  );
  assert.strictEqual(items.length - l.spam - l.inauthentic - l.pendingNotCounted - l.aged, l.counted, 'phép trừ phải khớp số được tính');
});

// ==================================================================
// K7-02 lỗi 1: mẫu số giao dịch cùng phạm vi lọc với phản hồi
// ==================================================================
{
  const { scopeTransactions } = require('../services/analysis_context');
  const DAY = 86400000;
  const NOW = new Date('2026-11-10T05:00:00Z');
  const at = (d) => new Date(NOW.getTime() - d * DAY);
  // 100 giao dịch rải đều 20 ngày (5 giao dịch mỗi ngày), hai sản phẩm luân phiên
  const txns = [];
  for (let d = 0; d < 20; d += 1) {
    for (let k = 0; k < 5; k += 1) {
      txns.push({ orderId: `o${d}-${k}`, productName: k % 2 ? 'Áo A' : 'Giày B', region: 'HCM', deliveredAt: at(d + 0.5 + 0.05 * k), orderedAt: at(d + 2) });
    }
  }
  const complaint = (d, product, w = 1) => ({
    timestamp: at(d).toISOString(), sentiment: 'Negative', productName: product, source: 'Tiki',
    trust: { weight: w, tier: 'P1' }
  });

  test('WCR: lọc 7 ngày thì mẫu số là giao dịch của 7 ngày, không phải toàn kỳ', () => {
    const scoped = scopeTransactions(txns, { time: 'This Week' }, NOW);
    assert.ok(scoped.length < txns.length, 'mẫu số 7 ngày phải nhỏ hơn toàn kỳ');
    assert.strictEqual(scoped.length, 35, '7 ngày x 5 giao dịch');
    const items = [complaint(1, 'Áo A'), complaint(2, 'Áo A')];
    const cards = metrics.buildMetricCards(items, scoped.length, NOW);
    assert.strictEqual(cards.weightedComplaintRate.denominator, 35);
    near(cards.weightedComplaintRate.value, 2 / 35, 1e-9, 'WCR 7 ngày');
  });

  test('WCR: lọc sản phẩm thì mẫu số chỉ đếm giao dịch của sản phẩm đó', () => {
    const scoped = scopeTransactions(txns, { product: 'Áo A' }, NOW);
    assert.strictEqual(scoped.length, 40, 'Áo A: 2 giao dịch mỗi ngày x 20 ngày');
    assert.ok(scoped.every((t) => t.productName === 'Áo A'));
  });

  test('WCR: toàn kỳ và không có bộ lọc thì giữ nguyên toàn bộ giao dịch', () => {
    assert.strictEqual(scopeTransactions(txns, {}, NOW).length, txns.length);
    assert.strictEqual(scopeTransactions(txns, { time: 'All', source: 'All', product: 'All' }, NOW).length, txns.length);
  });

  test('WCR: bộ lọc kênh không có trường tương ứng ở giao dịch thì không làm mất mẫu số', () => {
    assert.strictEqual(scopeTransactions(txns, { source: 'Tiki' }, NOW).length, txns.length);
  });

  test('So sánh hai kỳ: mẫu số mỗi kỳ là giao dịch trong đúng kỳ đó, không chia đôi tổng', () => {
    // Kỳ này 5 giao dịch/ngày, kỳ trước chỉ 1 giao dịch/ngày
    const t2 = [];
    for (let d = 0; d < 14; d += 1) {
      const n = d < 7 ? 5 : 1;
      for (let k = 0; k < n; k += 1) t2.push({ orderId: `p${d}-${k}`, productName: 'Áo A', deliveredAt: at(d + 0.5 + 0.01 * k) });
    }
    const items = [];
    for (let i = 0; i < 7; i += 1) items.push(complaint(0.5 + i * 0.5, 'Áo A'));    // 7 khiếu nại kỳ này
    for (let i = 0; i < 7; i += 1) items.push(complaint(7.5 + i * 0.5, 'Áo A'));    // 7 khiếu nại kỳ trước
    const cmp = metrics.periodComparison(items, t2, NOW);
    near(cmp.current.wcr, 7 / 35, 1e-9, 'WCR kỳ này');
    near(cmp.previous.wcr, 7 / 7, 1e-9, 'WCR kỳ trước');
    assert.ok(cmp.deltas.wcr.rel < 0, 'kỳ này ít khiếu nại trên đơn hơn kỳ trước');
    assert.strictEqual(cmp.approximation, null, 'không còn là xấp xỉ khi có danh sách giao dịch');
  });

  test('So sánh hai kỳ: dạng số cũ vẫn chạy (ước lượng chia đôi)', () => {
    const cmp = metrics.periodComparison([complaint(1, 'Áo A')], 100, NOW);
    assert.ok(cmp.approximation, 'phải ghi rõ đây là ước lượng');
  });

  test('Cảnh báo: WCR của cảnh báo dùng giao dịch trong cửa sổ hiện tại', () => {
    const items = [];
    for (let i = 0; i < 12; i += 1) {
      items.push({ _id: `c${i}`, timestamp: at(0.2 + i * 0.3).toISOString(), sentiment: 'Negative', category: 'Delivery', subCategory: 'Late', productName: 'Áo A', source: 'Tiki', author: `u${i}`, trust: { weight: 1, tier: 'P1', canTriggerHighAlert: true } });
    }
    for (let i = 0; i < 40; i += 1) {
      items.push({ _id: `g${i}`, timestamp: at(0.1 + i * 0.1).toISOString(), sentiment: 'Positive', category: 'Product', productName: 'Áo A', source: 'Tiki', author: `v${i}`, trust: { weight: 1, tier: 'P1', canTriggerHighAlert: true } });
    }
    for (let i = 0; i < 60; i += 1) {
      items.push({ _id: `b${i}`, timestamp: at(8 + i * 0.3).toISOString(), sentiment: i % 20 === 0 ? 'Negative' : 'Positive', category: i % 20 === 0 ? 'Delivery' : 'Product', subCategory: 'Late', productName: 'Áo A', source: 'Tiki', author: `w${i}`, trust: { weight: 1, tier: 'P1', canTriggerHighAlert: true } });
    }
    const withAll = alertEngine.detectAlerts(items, { transactionCount: 74403, transactions: txns, now: NOW });
    const noTxn = alertEngine.detectAlerts(items, { transactionCount: 74403, now: NOW });
    const a = withAll.alerts.find((x) => x.category === 'Delivery');
    const b = noTxn.alerts.find((x) => x.category === 'Delivery');
    assert.ok(a && b, 'cả hai lần chạy đều phải có cảnh báo giao hàng');
    assert.ok(a.wcr > b.wcr * 100, `WCR cảnh báo phải dùng mẫu số cửa sổ (${a.wcr}) chứ không phải toàn kho (${b.wcr})`);
  });
}

// ==================================================================
// K7-02 lỗi 7: quyết định còn hiệu lực qua ngày
// ==================================================================
{
  const { alertScope, findDecision, DECISION_WINDOW_DAYS } = require('../services/decision_match');
  const NOW = new Date('2026-12-10T00:30:00Z').getTime();
  const hours = (h) => new Date(NOW - h * 3600000);

  test('Quyết định: phạm vi cảnh báo là mã bỏ phần ngày ở cuối', () => {
    assert.strictEqual(alertScope('Delivery|Late|Áo A|*|2026-12-09'), 'Delivery|Late|Áo A|*');
    assert.strictEqual(alertScope('drift|Delivery|2026-12-09'), 'drift|Delivery');
    assert.strictEqual(alertScope('Delivery|Late|*|*'), 'Delivery|Late|*|*', 'mã không có ngày thì giữ nguyên');
  });

  test('Quyết định chấp nhận hôm trước vẫn khớp cảnh báo cùng phạm vi sang ngày mới', () => {
    const log = [{ alertId: 'Delivery|Late|Áo A|*|2026-12-09', decision: 'ACCEPTED', at: hours(2) }];
    const d = findDecision('Delivery|Late|Áo A|*|2026-12-10', log, NOW);
    assert.ok(d && d.decision === 'ACCEPTED');
  });

  test('Quyết định không khớp cảnh báo khác sản phẩm hoặc khác nguyên nhân', () => {
    const log = [{ alertId: 'Delivery|Late|Áo A|*|2026-12-09', decision: 'DISMISSED', at: hours(2) }];
    assert.strictEqual(findDecision('Delivery|Late|Giày B|*|2026-12-10', log, NOW), undefined);
    assert.strictEqual(findDecision('Delivery|Damaged|Áo A|*|2026-12-10', log, NOW), undefined);
  });

  test('Quyết định hết hiệu lực sau cửa sổ theo dõi lại (7 ngày)', () => {
    assert.strictEqual(DECISION_WINDOW_DAYS, 7);
    const log = [{ alertId: 'Delivery|Late|Áo A|*|2026-11-30', decision: 'ACCEPTED', at: hours(24 * 8) }];
    assert.strictEqual(findDecision('Delivery|Late|Áo A|*|2026-12-10', log, NOW), undefined);
    const fresh = [{ alertId: 'Delivery|Late|Áo A|*|2026-12-04', decision: 'ACCEPTED', at: hours(24 * 6) }];
    assert.ok(findDecision('Delivery|Late|Áo A|*|2026-12-10', fresh, NOW));
  });

  test('Quyết định cùng mã đúng ngày luôn khớp, nhiều quyết định thì lấy cái mới nhất', () => {
    const log = [
      { alertId: 'Delivery|Late|Áo A|*|2026-12-09', decision: 'DISMISSED', at: hours(30) },
      { alertId: 'Delivery|Late|Áo A|*|2026-12-10', decision: 'ACCEPTED', at: hours(1) }
    ];
    assert.strictEqual(findDecision('Delivery|Late|Áo A|*|2026-12-10', log, NOW).decision, 'ACCEPTED');
  });
}

// ==================================================================
// K7-02 lỗi 8: "Hôm nay" và "Tuỳ chọn" theo giờ Việt Nam, bất kể múi giờ máy chủ
// ==================================================================
{
  const { applyFilters, timeBounds } = require('../services/analysis_context');

  test('Hôm nay bắt đầu 00:00 giờ Việt Nam (17:00 UTC hôm trước)', () => {
    // 03:00 sáng 11/11 giờ Việt Nam = 20:00 UTC ngày 10/11
    const b = timeBounds('Today', new Date('2026-11-10T20:00:00Z'));
    assert.strictEqual(new Date(b.start).toISOString(), '2026-11-10T17:00:00.000Z');
    // 12:00 trưa 11/11 giờ Việt Nam
    const b2 = timeBounds('Today', new Date('2026-11-11T05:00:00Z'));
    assert.strictEqual(new Date(b2.start).toISOString(), '2026-11-10T17:00:00.000Z');
  });

  test('Hôm nay: phản hồi lúc 02:00 giờ Việt Nam có trong bộ lọc, phản hồi 23:00 hôm trước thì không', () => {
    const items = [
      { _id: 'a', timestamp: '2026-11-10T19:00:00Z' }, // 02:00 ngày 11/11 VN
      { _id: 'b', timestamp: '2026-11-10T16:00:00Z' }  // 23:00 ngày 10/11 VN
    ];
    const out = applyFilters(items, { time: 'Today' }, new Date('2026-11-10T20:00:00Z'));
    assert.deepStrictEqual(out.map((f) => f._id), ['a']);
  });

  test('Tuỳ chọn: ngày tính theo giờ Việt Nam, đủ từ 00:00 đến 23:59:59', () => {
    const b = timeBounds('Custom:2026-11-01:2026-11-05', new Date('2026-11-10T00:00:00Z'));
    assert.strictEqual(new Date(b.start).toISOString(), '2026-10-31T17:00:00.000Z');
    assert.strictEqual(new Date(b.end).toISOString(), '2026-11-05T16:59:59.999Z');
  });

  test('Tuỳ chọn: ngày sai định dạng thì bỏ qua bộ lọc', () => {
    assert.strictEqual(timeBounds('Custom:abc:def', new Date()), null);
  });

  test('Nhãn ngày của biểu đồ xu hướng theo giờ Việt Nam', () => {
    // Ô cuối có tâm vào 03:00 sáng 10/11 giờ Việt Nam, nhưng vẫn là 09/11 theo UTC
    const s = metrics.weightedTimeSeries([], 14, new Date('2026-11-10T20:00:00Z'));
    assert.strictEqual(s[13].name, '10/11');
  });
}

// ==================================================================
// K7-02 lỗi 9: chốt chặn đường dẫn thu thập (SSRF)
// ==================================================================
{
  const guard = require('../services/url_guard');

  test('Chốt chặn URL: chặn mọi dạng địa chỉ nội bộ, kể cả IPv6 ánh xạ', () => {
    const blocked = [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.1', '169.254.169.254',
      '100.100.100.200', '100.64.0.1', '0.0.0.0', '224.0.0.1',
      '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe',
      'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::1'
    ];
    for (const ip of blocked) assert.strictEqual(guard.isBlockedIp(ip), true, `${ip} phải bị chặn`);
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      assert.strictEqual(guard.isBlockedIp(ip), false, `${ip} là địa chỉ công khai`);
    }
  });

  test('Chốt chặn URL: URL viết thẳng IP nội bộ bị từ chối ở bước cú pháp', () => {
    for (const u of [
      'http://127.0.0.1/', 'http://[::ffff:127.0.0.1]/', 'http://[::]/', 'http://[::1]/', 'http://100.100.100.200/',
      'http://169.254.169.254/latest/meta-data', 'http://2130706433/', 'http://0x7f.1/', 'http://localhost/', 'http://db.internal/'
    ]) {
      assert.throws(() => guard.checkUrlSyntax(u), (e) => e.status === 400, `${u} phải bị chặn`);
    }
  });

  test('Chốt chặn URL: chỉ http/https, cổng 80 và 443, không kèm tài khoản', () => {
    assert.throws(() => guard.checkUrlSyntax('file:///etc/passwd'), /http/);
    assert.throws(() => guard.checkUrlSyntax('ftp://example.com/'), /http/);
    assert.throws(() => guard.checkUrlSyntax('http://example.com:5000/'), /cổng/);
    assert.throws(() => guard.checkUrlSyntax('http://example.com:8080/'), /cổng/);
    assert.throws(() => guard.checkUrlSyntax('http://user:pw@example.com/'), /tài khoản/);
    assert.ok(guard.checkUrlSyntax('https://tiki.vn/ao-p123.html'));
    assert.ok(guard.checkUrlSyntax('http://example.com:80/x'));
  });

  test('Chốt chặn URL: trình duyệt thu thập mặc định tắt, chỉ bật khi ALLOW_BROWSER_SCRAPE=1', () => {
    assert.strictEqual(guard.browserScrapeEnabled({}), false);
    assert.strictEqual(guard.browserScrapeEnabled({ ALLOW_BROWSER_SCRAPE: '0' }), false);
    assert.strictEqual(guard.browserScrapeEnabled({ ALLOW_BROWSER_SCRAPE: '1' }), true);
  });
}

// ==================================================================
// K7-02 lỗi 2: POST /api/seed mặc định tắt, chỉ chạy trên kho demo khi được bật
// ==================================================================
{
  const { seedRouteCheck } = require('../services/write_guard');

  test('Seed qua API: mặc định bị từ chối kể cả trên kho demo', () => {
    const r = seedRouteCheck({ dbName: 'customer_radar', workspace: 'demo', env: {} });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.status, 403);
  });

  test('Seed qua API: bật biến môi trường nhưng sai kho thì vẫn từ chối', () => {
    const env = { ALLOW_SEED_ROUTE: '1', MONGODB_DB: 'customer_radar' };
    assert.strictEqual(seedRouteCheck({ dbName: 'customer_radar_real', workspace: 'real', env }).allowed, false);
    assert.strictEqual(seedRouteCheck({ dbName: 'customer_radar', workspace: 'real', env }).allowed, false, 'kho thật không bao giờ được seed qua API');
    assert.strictEqual(seedRouteCheck({ dbName: 'kho_khac', workspace: 'demo', env }).allowed, false);
  });

  test('Seed qua API: bật biến môi trường và đúng kho demo thì cho chạy', () => {
    const env = { ALLOW_SEED_ROUTE: '1', MONGODB_DB: 'customer_radar_ui_test' };
    assert.strictEqual(seedRouteCheck({ dbName: 'customer_radar_ui_test', workspace: 'demo', env }).allowed, true);
    // MONGODB_DB không đặt thì kho demo mặc định là customer_radar
    assert.strictEqual(seedRouteCheck({ dbName: 'customer_radar', workspace: 'demo', env: { ALLOW_SEED_ROUTE: '1' } }).allowed, true);
  });

  test('Seed qua API: chỉ giá trị "1" mới bật', () => {
    assert.strictEqual(seedRouteCheck({ dbName: 'customer_radar', workspace: 'demo', env: { ALLOW_SEED_ROUTE: 'true' } }).allowed, false);
  });
}

// ==================================================================
// K7-02 lỗi 12: lỗi chữ (số kiểu Việt, nhãn vấn đề, tỉ lệ nhỏ)
// ==================================================================
{
  test('Nhãn vấn đề trong câu tóm tắt: "Giao hàng: giao chậm", không còn dấu gạch nối', () => {
    const a = {
      type: 'SPIKE', categoryLabel: 'Giao hàng', causeLabel: 'Giao chậm', productName: 'Áo A', region: null,
      baselineDays: 21, affectedCustomers: 30, evidenceCount: 12, excludedByTrust: 0,
      statistics: { baselineRate: 0.05, currentRate: 0.12 }
    };
    const s = playbook.summarize(a);
    assert.ok(s.startsWith('Giao hàng: giao chậm trên Áo A'), s);
    assert.ok(!/Giao hàng - /.test(s));
    const b = playbook.summarize({ ...a, causeLabel: 'Hư hỏng khi vận chuyển' });
    assert.ok(b.startsWith('Giao hàng: hư hỏng khi vận chuyển'), b);
    assert.ok(playbook.summarize({ ...a, causeLabel: null }).startsWith('Giao hàng trên Áo A'));
  });

  test('Tỉ lệ dưới 1% giữ hai chữ số, không thành "0,0%"', () => {
    const { formatPct } = require('../services/recommender');
    assert.strictEqual(formatPct(0.0004), '0,04%');
    assert.strictEqual(formatPct(0.0099), '0,99%');
    assert.strictEqual(formatPct(0.005), '0,50%');
    assert.strictEqual(formatPct(0), '0,0%');
    assert.strictEqual(formatPct(0.0523), '5,2%');
    assert.strictEqual(formatPct(0.5, 0), '50%', 'số chữ số chỉ định rõ thì giữ nguyên');
  });

  test('Số trong báo cáo live in theo dấu chấm nghìn kiểu Việt', () => {
    const { fmtVi } = require('../services/live/report');
    assert.strictEqual(fmtVi(9691), '9.691');
    assert.strictEqual(fmtVi(1647), '1.647');
    assert.strictEqual(fmtVi(12), '12');
  });
}

// ==================================================================
// K7-02 lỗi 26: dọn backend (coverage chia 0, PII trong originalText, lỗi trả ra ngoài)
// ==================================================================
{
  test('WCR: không có phản hồi nào được tính thì độ phủ là 0, không phải NaN', () => {
    const items = [{ trust: { weight: 0, tier: 'P1' }, sentiment: 'Negative' }];
    const r = metrics.weightedComplaintRate(items, 100);
    assert.strictEqual(r.coverage, 0);
    assert.ok(Number.isFinite(r.coverage));
  });

  test('Thu thập: số điện thoại và email trong originalText bị che như normalizer làm cho text', () => {
    const { buildFeedbackDocs } = require('../services/ingest');
    const raw = [{ source: 'Tiki', rawText: 'Giao chậm, ai cần liên hệ 0912 345 678 hoặc a.b@gmail.com nhé', author: 'Nguyễn Văn A', rating: 2, timestamp: new Date('2026-11-01'), platformFacts: { platform: 'Tiki', reviewId: 1, rawCustomerId: 5 } }];
    const [doc] = buildFeedbackDocs(raw, [{}], { collectedVia: 'test' });
    assert.ok(!/0912|gmail/.test(doc.originalText), doc.originalText);
    assert.ok(doc.originalText.includes('[SĐT]') && doc.originalText.includes('[EMAIL]'));
    assert.ok(doc.originalText.startsWith('Giao chậm'), 'phần còn lại của câu giữ nguyên');
  });

  test('Lỗi 5xx trả ra ngoài là câu chung, lỗi của request (4xx) giữ thông báo', () => {
    const { errorResponse } = require('../services/http_errors');
    const boom = errorResponse(new Error('MongoServerError: connect ECONNREFUSED cluster0.example.net:27017'));
    assert.strictEqual(boom.status, 500);
    assert.ok(!/Mongo|cluster0|ECONN/.test(boom.message), boom.message);
    const bad = errorResponse(Object.assign(new Error('Thiếu trường url'), { status: 400 }));
    assert.deepStrictEqual(bad, { status: 400, message: 'Thiếu trường url' });
    assert.strictEqual(errorResponse(Object.assign(new Error('x'), { type: 'entity.too.large', status: 413 })).message, 'Thân request vượt quá 2MB');
    assert.strictEqual(errorResponse(Object.assign(new Error('x'), { type: 'entity.parse.failed', status: 400 })).message, 'Thân request không phải JSON hợp lệ');
    assert.strictEqual(errorResponse(Object.assign(new Error('chi tiết nội bộ'), { status: 503 })).message, 'Lỗi máy chủ, vui lòng thử lại sau.');
  });
}

// ==================================================================
// K7-02 lỗi 25: thời lượng "đã live" không tính lúc phiên bị ngắt
// ==================================================================
{
  const { liveDurationMs } = require('../services/live/hub');
  const T = (iso) => new Date(iso);
  const MIN = 60000;

  test('Thời lượng live: phiên đang chạy = phần đã cộng dồn + đoạn hiện tại', () => {
    const s = { startedAt: T('2026-11-11T12:00:00Z'), activeMs: 30 * MIN, segmentStartedAt: T('2026-11-12T08:00:00Z'), lastActiveAt: T('2026-11-12T08:10:00Z') };
    const now = T('2026-11-12T08:20:00Z').getTime();
    assert.strictEqual(liveDurationMs(s, { status: 'live' }, now), 50 * MIN);
  });

  test('Thời lượng live: phiên bị ngắt chỉ tính đến lần cuối còn hoạt động, không tính khoảng nghỉ', () => {
    const s = { status: 'live', startedAt: T('2026-11-11T12:00:00Z'), activeMs: 0, segmentStartedAt: T('2026-11-11T12:00:00Z'), lastActiveAt: T('2026-11-11T13:30:00Z') };
    const now = T('2026-11-14T00:00:00Z').getTime(); // đã nghỉ hơn hai ngày
    assert.strictEqual(liveDurationMs(s, null, now), 90 * MIN);
  });

  test('Thời lượng live: phiên đã kết thúc lấy tổng cộng dồn; phiên cũ chưa có số cộng dồn lấy mốc đầu đến mốc cuối', () => {
    assert.strictEqual(liveDurationMs({ status: 'ended', startedAt: T('2026-11-11T12:00:00Z'), endedAt: T('2026-11-11T13:00:00Z'), activeMs: 45 * MIN }, null, 0), 45 * MIN);
    assert.strictEqual(liveDurationMs({ status: 'ended', startedAt: T('2026-11-11T12:00:00Z'), endedAt: T('2026-11-11T13:00:00Z') }, null, 0), 60 * MIN);
  });

  test('Thời lượng live: phiên cũ đang bị ngắt không có dữ liệu thì trả null thay vì đoán', () => {
    assert.strictEqual(liveDurationMs({ status: 'live', startedAt: T('2026-11-08T12:00:00Z') }, null, Date.now()), null);
    assert.strictEqual(liveDurationMs({ status: 'connecting' }, null, Date.now()), null);
  });
}

// ==================================================================
// Test bất đồng bộ (cần await): chạy lần lượt sau các test đồng bộ
// ==================================================================
const asyncTests = [];
function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

/**
 * Database giả cho live: find() trả cursor đọc dần (async iterator) và ghi lại
 * cách được gọi, để kiểm tra không ai nạp cả phiên bằng .toArray().
 */
function fakeLiveDb(makeDocs) {
  const calls = { find: [], toArray: 0, iterated: 0 };
  const cursor = (q, opts) => {
    calls.find.push({ q, opts });
    const c = {
      sort() { return c; },
      batchSize(n) { calls.batch = n; return c; },
      async toArray() {
        calls.toArray += 1;
        return [...makeDocs()].filter((d) => !q.intent || d.intent === q.intent);
      },
      async *[Symbol.asyncIterator]() {
        for (const d of makeDocs()) { calls.iterated += 1; yield d; }
      }
    };
    return c;
  };
  const col = {
    find: cursor,
    createIndex: async () => {},
    updateOne: async () => ({}),
    insertMany: async () => ({}),
    countDocuments: async () => 0
  };
  return { calls, db: { collection: () => col } };
}

function liveSimSession() {
  const { ObjectId } = require('mongodb');
  return { _id: new ObjectId(), platform: 'simulator', simulated: true, products: [], startedAt: new Date('2026-11-11T12:00:00Z'), title: 'Thử' };
}

function* simComments(session, n) {
  const hub = require('../services/live/hub');
  const texts = ['giá bao nhiêu shop', 'chốt 1 cái size M', 'đẹp quá', 'hi shop', 'giao hàng chậm quá shop ơi'];
  const t0 = Date.parse('2026-11-11T12:00:00Z');
  for (let i = 0; i < n; i += 1) {
    yield hub.buildCommentDoc(session, {
      text: texts[i % texts.length], ts: new Date(t0 + i * 500), platformMsgId: `sim-1-a-${i}`,
      author: { handle: `khach${i % 300}`, platformUserId: `u${i % 300}` }
    });
  }
}

testAsync('Live: nạp lại phiên đọc bằng cursor, bỏ trường thừa, chỉ giữ 200 bình luận gần nhất', async () => {
  const hub = require('../services/live/hub');
  const session = liveSimSession();
  const { db, calls } = fakeLiveDb(() => simComments(session, 1200));
  const r = new hub.Runtime(session, db, 'demo');
  try {
    await r.preload();
    assert.strictEqual(calls.toArray, 0, 'preload không được gọi .toArray()');
    assert.strictEqual(calls.iterated, 1200);
    assert.strictEqual(r.agg.total, 1200);
    assert.strictEqual(r.recent.length, 200);
    assert.strictEqual(r.recent[199].platformMsgId, 'sim-1-a-1199', 'phải là 200 bình luận cuối');
    assert.strictEqual(calls.find[0].opts.projection.piiTypes, 0, 'phải bỏ trường không dùng');
    assert.ok(calls.batch > 0 && calls.batch <= 1000, 'đọc theo đợt nhỏ');
    assert.ok(r.seen.has('sim-1-a-0'), 'vẫn nhớ mã tin để chống trùng');
  } finally {
    r.dispose();
  }
});

testAsync('Live: phiên mô phỏng chạm trần thì tự dừng, không nhận thêm bình luận', async () => {
  const hub = require('../services/live/hub');
  const session = liveSimSession();
  const { db } = fakeLiveDb(() => []);
  const r = new hub.Runtime(session, db, 'demo');
  r.status = 'live';
  r.agg.total = hub.SIM_MAX_COMMENTS;
  const got = r.ingest({ text: 'chốt 1 cái size M', ts: new Date(), platformMsgId: 'x1' });
  assert.strictEqual(got, null, 'không nhận bình luận vượt trần');
  await new Promise((done) => setTimeout(done, 20));
  assert.strictEqual(r.status, 'ended');
  assert.strictEqual(r.session.summary != null, true, 'phải chốt số liệu khi dừng');
  assert.strictEqual(r.pending.length, 0);
});

testAsync('Live: nối lại phiên mô phỏng đã quá trần thì dừng ngay, không bật simulator', async () => {
  const hub = require('../services/live/hub');
  const session = liveSimSession();
  const n = hub.SIM_MAX_COMMENTS;
  const { db } = fakeLiveDb(function* () {
    for (let i = 0; i < n; i += 1) yield { _id: `c${i}`, ts: new Date(1e12 + i * 1000), intent: 'chatter', author: { hash: `h${i % 50}` } };
  });
  const r = await hub.startSession(db, 'demo', { ...session, status: 'connecting' });
  assert.strictEqual(r.status, 'ended');
  assert.strictEqual(r.connector, null, 'không được bật simulator');
  assert.strictEqual(hub.runtimeFor(session._id, 'demo'), null, 'không còn runtime chạy nền');
});

{
  const guard = require('../services/url_guard');
  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

  testAsync('Chốt chặn URL: tên miền trỏ về địa chỉ nội bộ bị chặn sau khi phân giải', async () => {
    const toLoopback = async () => [{ address: '127.0.0.1', family: 4 }];
    const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }];
    const mappedV6 = async () => [{ address: '::ffff:127.0.0.1', family: 6 }];
    for (const lookup of [toLoopback, mixed, mappedV6]) {
      await assert.rejects(() => guard.assertPublicUrl('https://evil.example.com/', { lookup }), (e) => e.status === 400);
    }
    const failing = async () => { throw new Error('ENOTFOUND'); };
    await assert.rejects(() => guard.assertPublicUrl('https://khong-ton-tai.example/', { lookup: failing }), /phân giải/);
    const u = await guard.assertPublicUrl('https://tiki.vn/ao-p123.html', { lookup: publicLookup });
    assert.strictEqual(u.hostname, 'tiki.vn');
  });

}

{
  const { ObjectId } = require('mongodb');

  testAsync('Báo cáo live: đọc bình luận bằng cursor, không .toArray() cả phiên, kết quả giữ nguyên', async () => {
    const hub = require('../services/live/hub');
    const { buildReport } = require('../services/live/report');
    const session = { _id: new ObjectId(), platform: 'simulator', simulated: true, products: [], startedAt: new Date('2026-11-11T12:00:00Z'), title: 'Thử', createdAt: new Date('2026-11-11T12:00:00Z') };
    const texts = ['giá bao nhiêu shop', 'chốt 1 cái size M', 'đẹp quá', 'hi shop', 'giao hàng chậm quá shop ơi'];
    const t0 = Date.parse('2026-11-11T12:00:00Z');
    const docs = [];
    for (let i = 0; i < 1000; i += 1) {
      docs.push(hub.buildCommentDoc(session, { text: texts[i % 5], ts: new Date(t0 + i * 500), platformMsgId: `sim-1-a-${i}`, author: { handle: `khach${i % 300}`, platformUserId: `u${i % 300}` } }));
    }
    const calls = { toArray: 0, iterated: 0, projection: null };
    const cur = (list, opts) => {
      const c = {
        sort() { return c; }, batchSize() { return c; }, limit() { return c; },
        async next() { return null; },
        async toArray() { calls.toArray += 1; return [...list]; },
        async *[Symbol.asyncIterator]() { for (const d of list) { calls.iterated += 1; yield d; } }
      };
      if (opts && opts.projection) calls.projection = opts.projection;
      return c;
    };
    const db = { collection: (name) => ({ find: (q, opts) => cur(name === 'live_comments' ? docs : [], opts) }) };
    const r = await buildReport(db, session);
    assert.strictEqual(calls.toArray, 0, 'không được .toArray() cả phiên');
    assert.strictEqual(calls.iterated, 1000);
    assert.strictEqual(calls.projection.piiTypes, 0, 'phải bỏ trường thừa như REPLAY_PROJECTION');
    // Kết quả giống bản đọc bằng toArray trước khi sửa
    assert.strictEqual(r.totals.comments, 1000);
    assert.deepStrictEqual(r.funnel, { viewersPeak: null, commenters: 300, askers: 60, buyers: 60, confirmed: 0 });
    assert.strictEqual(r.response.askedPeople, 200);
    assert.strictEqual(r.response.answeredPeople, 0);
    assert.strictEqual(r.complaints.total, 200);
    assert.deepStrictEqual(r.complaints.byCategory.map((c) => [c.category, c.count]), [['Delivery', 200]]);
    assert.deepStrictEqual(r.todo.map((t) => t.kind), ['orders', 'complaints', 'catalog', 'staffing', 'script']);
  });

  testAsync('Báo cáo live: số từ một nghìn trở lên in có dấu chấm nghìn trong việc cần làm', async () => {
    const hub = require('../services/live/hub');
    const { buildReport } = require('../services/live/report');
    const session = { _id: new ObjectId(), platform: 'simulator', simulated: true, products: [], startedAt: new Date('2026-11-11T12:00:00Z'), title: 'Thử', createdAt: new Date('2026-11-11T12:00:00Z') };
    const texts = ['chốt 1 cái size M', 'chốt 2 cái size L', 'giao hàng chậm quá shop ơi', 'hi shop', 'đẹp quá'];
    const t0 = Date.parse('2026-11-11T12:00:00Z');
    const docs = [];
    for (let i = 0; i < 6000; i += 1) {
      docs.push(hub.buildCommentDoc(session, { text: texts[i % 5], ts: new Date(t0 + i * 500), platformMsgId: `m-${i}`, author: { handle: `k${i % 900}`, platformUserId: `u${i % 900}` } }));
    }
    const cur = (list) => { const c = { sort() { return c; }, batchSize() { return c; }, limit() { return c; }, async next() { return null; }, async *[Symbol.asyncIterator]() { for (const d of list) yield d; } }; return c; };
    const db = { collection: (name) => ({ find: () => cur(name === 'live_comments' ? docs : []) }) };
    const r = await buildReport(db, session);
    const titles = r.todo.map((t) => t.title).join(' | ');
    assert.ok(/Lên đơn cho 2\.400 lượt/.test(titles), titles);
    assert.ok(/Xử lý 1\.200 khiếu nại/.test(titles), titles);
    assert.ok(!/\b\d{4,}\b/.test(titles), `không còn số dài không có dấu chấm: ${titles}`);
  });

  testAsync('Thu thập: sản phẩm quá giờ bị hủy thì không ghi vào kho sau khi lượt đã đi tiếp', async () => {
    const { withTimeout } = require('../services/real_collector');
    const wrote = [];
    const token = { cancelled: false };
    const work = (async () => {
      await new Promise((r) => setTimeout(r, 60));
      if (token.cancelled) return;
      wrote.push('ghi');
    })();
    await assert.rejects(() => withTimeout(work, 15, 'Sản phẩm 1', token), /quá/);
    assert.strictEqual(token.cancelled, true, 'hết giờ phải đặt cờ hủy');
    await new Promise((r) => setTimeout(r, 90));
    assert.deepStrictEqual(wrote, [], 'việc đã hủy không được ghi');
  });

  testAsync('Thu thập: việc xong đúng giờ thì không bị đánh dấu hủy', async () => {
    const { withTimeout } = require('../services/real_collector');
    const token = { cancelled: false };
    const out = await withTimeout(Promise.resolve(42), 50, 'x', token);
    assert.strictEqual(out, 42);
    assert.strictEqual(token.cancelled, false);
  });
}

{
  const MIN = 60000;
  // Database giả ghi lại các lần updateOne lên live_sessions
  const recordingDb = () => {
    const updates = [];
    const { db } = fakeLiveDb(function* () {});
    const base = db.collection();
    return {
      updates,
      db: { collection: (name) => ({ ...base, updateOne: async (f, u) => { if (name === 'live_sessions') updates.push(u); return {}; } }) }
    };
  };

  testAsync('Live: nối lại phiên chỉ cộng đoạn đã chạy trước đó, không cộng khoảng bị ngắt', async () => {
    const hub = require('../services/live/hub');
    const session = {
      ...liveSimSession(), status: 'live',
      startedAt: new Date('2026-11-11T12:00:00Z'), activeMs: 10 * MIN,
      segmentStartedAt: new Date('2026-11-12T08:00:00Z'), lastActiveAt: new Date('2026-11-12T08:25:00Z')
    };
    const { db, updates } = recordingDb();
    const r = new hub.Runtime(session, db, 'demo');
    try {
      await r.setStatus('live');
      const set = updates[0].$set;
      assert.strictEqual(set.activeMs, 35 * MIN, '10 phút cũ + đoạn trước khi bị ngắt (25 phút)');
      assert.ok(set.segmentStartedAt instanceof Date && set.lastActiveAt instanceof Date);
      assert.ok(Date.now() - set.segmentStartedAt.getTime() < 5000, 'đoạn mới bắt đầu từ bây giờ');
    } finally {
      r.dispose();
    }
  });

  testAsync('Live: phiên cũ chưa có số cộng dồn thì ước tính đến bình luận cuối, không đến lúc nối lại', async () => {
    const hub = require('../services/live/hub');
    const session = { ...liveSimSession(), status: 'live', startedAt: new Date('2026-11-11T12:00:00Z') };
    const { db, updates } = recordingDb();
    const r = new hub.Runtime(session, db, 'demo');
    try {
      r.agg.lastAt = new Date('2026-11-11T13:30:00Z').getTime();
      await r.setStatus('live');
      assert.strictEqual(updates[0].$set.activeMs, 90 * MIN);
    } finally {
      r.dispose();
    }
  });

  testAsync('Live: dừng phiên cộng đoạn đang chạy vào tổng và xóa mốc đoạn', async () => {
    const hub = require('../services/live/hub');
    const t0 = Date.now() - 20 * MIN;
    const session = { ...liveSimSession(), status: 'live', startedAt: new Date(t0 - 60 * MIN), activeMs: 60 * MIN, segmentStartedAt: new Date(t0), lastActiveAt: new Date(t0 + 19 * MIN) };
    const { db, updates } = recordingDb();
    const r = new hub.Runtime(session, db, 'demo');
    r.status = 'live';
    r.segmentOpen = true;
    await r.stop('thử');
    const u = updates.find((x) => x.$set && x.$set.status === 'ended');
    assert.ok(u, 'phải ghi trạng thái ended');
    near(u.$set.activeMs, 80 * MIN, 5000, 'tổng = 60 phút cũ + 20 phút đoạn này');
    assert.ok('segmentStartedAt' in u.$unset && 'lastActiveAt' in u.$unset);
  });
}

// ------------------------------------------------------------------
// ĐIỂM ĐAU + HỒ SƠ XỬ LÝ: chạy được với mảng hàng chưa từng có trong dữ liệu nào
// ------------------------------------------------------------------
{
  console.log('\nĐiểm đau và hồ sơ xử lý');
  const pain = require('../services/pain_points');
  const groupMod = require('../services/product_group');
  const caseFile = require('../services/case_file');
  const DAY = 86400000;
  const T0 = Date.parse('2026-10-01T03:00:00Z');
  let seq = 0;
  // Phản hồi giả đã qua Trust Layer: chỉ cần trọng số > 0 để được tính
  const fb = (text, o = {}) => ({
    _id: `t${++seq}`,
    originalText: text,
    sentiment: o.sentiment || 'Negative',
    rating: o.rating ?? (o.sentiment === 'Positive' ? 5 : 1),
    productName: o.productName === undefined ? 'Ốp lưng silicon XYZ trong suốt' : o.productName,
    productCategory: o.productCategory,
    category: o.category || (o.sentiment === 'Positive' ? 'Other' : 'ProductQuality'),
    subCategory: o.subCategory || (o.sentiment === 'Positive' ? null : 'NotAsDescribed'),
    customerId: o.customerId || `kh${seq}`,
    author: o.author || null,
    orderId: o.orderId || null,
    timestamp: new Date(T0 + (o.day ?? seq % 20) * DAY).toISOString(),
    trust: { weight: 1, tier: o.tier || 'P3' }
  });
  // Một mảng bịa (ốp lưng) với điểm đau "ố vàng" cố ý cài; mảng nền (nệm) chê chuyện khác
  const build = () => {
    seq = 0;
    const out = [];
    for (let i = 0; i < 12; i += 1) out.push(fb(`Dùng được ${i + 2} tuần thì ốp bị ố vàng, nhìn rất xấu`, { day: i }));
    for (let i = 0; i < 8; i += 1) out.push(fb(`Ốp lưng hơi ${i % 2 ? 'cứng' : 'mỏng'}, giao hàng lâu quá`, { day: i, subCategory: 'TechnicalDefect' }));
    for (let i = 0; i < 25; i += 1) out.push(fb('Ốp lưng đẹp, ôm máy vừa khít', { sentiment: 'Positive', day: i % 20 }));
    for (let i = 0; i < 20; i += 1) out.push(fb(`Nệm bị xẹp lún sau ${i + 1} tháng, nằm đau lưng`, { productName: 'Nệm cao su ABC 1m6', day: i, subCategory: 'TechnicalDefect' }));
    for (let i = 0; i < 25; i += 1) out.push(fb('Nệm êm, nằm thích', { productName: 'Nệm cao su ABC 1m8', sentiment: 'Positive', day: i % 20 }));
    return out;
  };

  test('Điểm đau: tìm đúng "ố vàng" ở mảng chưa từng thấy, tách khỏi mảng khác', () => {
    const r = pain.findPainPoints(build(), { now: T0 + 30 * DAY });
    const g = r.groups.find((x) => /ốp/i.test(x.label));
    assert.ok(g, 'phải có mảng ốp lưng');
    assert.strictEqual(g.status, 'ok');
    const p = g.painPoints.find((x) => /ố vàng/.test(x.phrase) || x.variants.some((v) => /ố vàng/.test(v)));
    assert.ok(p, `phải có điểm đau "ố vàng", được: ${g.painPoints.map((x) => x.phrase).join(', ')}`);
    assert.ok(p.count >= 12 && p.customers >= 12);
    const n = r.groups.find((x) => /nệm/i.test(x.label));
    assert.ok(n.painPoints.some((x) => /xẹp|lún/.test(x.phrase)), 'mảng nệm phải ra "xẹp lún"');
    assert.ok(!n.painPoints.some((x) => /ố vàng/.test(x.phrase)), 'điểm đau của mảng này không lọt sang mảng kia');
  });

  test('Điểm đau: tên hàng không thành điểm đau; JSON không mang danh sách phản hồi', () => {
    const r = pain.findPainPoints(build(), { now: T0 + 30 * DAY });
    const all = r.groups.flatMap((g) => g.painPoints);
    assert.ok(!all.some((p) => /^(ốp lưng|nệm cao su)$/i.test(p.phrase)), all.map((p) => p.phrase).join(', '));
    const json = JSON.parse(JSON.stringify(r));
    assert.ok(json.groups.every((g) => g.painPoints.every((p) => !('members' in p))));
    assert.ok(all.every((p) => Array.isArray(p.members) && p.members.length === p.count));
  });

  test('Điểm đau: một người viết 10 câu không thành điểm đau', () => {
    const items = build();
    for (let i = 0; i < 10; i += 1) items.push(fb('Ốp bị bong keo viền camera', { customerId: 'mot-nguoi', day: 3 }));
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    const g = r.groups.find((x) => /ốp/i.test(x.label));
    assert.ok(!g.painPoints.some((p) => /bong keo/.test(p.phrase)), 'cùng một khách, cùng một ngày: không đủ rộng');
  });

  test('Điểm đau: mảng ít câu chê trả "chưa đủ câu", không đoán', () => {
    const items = [fb('Ốp bị ố vàng'), fb('Ốp bị ố vàng'), fb('Ốp đẹp', { sentiment: 'Positive' })];
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    assert.strictEqual(r.groups[0].status, 'too_few');
    assert.strictEqual(r.groups[0].painPoints.length, 0);
  });

  test('Điểm đau: dữ liệu nghèo (không tên sản phẩm, không số sao, không đơn) vẫn chạy', () => {
    const items = build().map((f) => ({ ...f, productName: null, productCategory: undefined, rating: null }));
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    assert.strictEqual(r.groups.length, 1);
    assert.strictEqual(r.groups[0].source, 'shop');
    const g = r.groups[0];
    const p = g.painPoints[0];
    assert.ok(p, 'vẫn tìm ra điểm đau');
    const c = caseFile.buildCaseFile(p, g, { items, transactions: [], now: T0 + 30 * DAY });
    assert.strictEqual(c.steps.ready.compensation.available, false);
    assert.ok(c.steps.ready.compensation.missing[0].includes('mã đơn hàng'));
    assert.ok(c.steps.scope.missing.some((m) => m.includes('mã đơn hàng')));
    assert.ok(c.steps.follow.tasks.length >= 1);
  });

  test('Điểm đau: gõ không dấu vẫn gộp với có dấu', () => {
    const items = build();
    for (let i = 0; i < 6; i += 1) items.push(fb('op bi o vang qua nhanh', { day: 10 + i }));
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    const g = r.groups.find((x) => /ốp/i.test(x.label));
    const p = g.painPoints.find((x) => x.phraseKeys.some((k) => pain.fold(k).includes('o vang')));
    assert.ok(p && p.count >= 18, `câu không dấu phải vào cùng điểm đau (${p && p.count})`);
  });

  test('Mảng hàng: danh mục có sẵn thắng; suy từ tên; một sản phẩm; không tên', () => {
    const items = [
      { productName: 'Máy Xay Sinh Tố Toshiba 700W' },
      { productName: 'Máy xay sinh tố Philips HR2223' },
      { productName: 'Combo 2 Áo thun nam cotton' },
      { productName: 'Áo thun nam MRM basic' },
      { productName: 'Kệ sách gỗ độc bản' },
      { productName: 'Bất kỳ', productCategory: 'nồi chiên' },
      { productName: null }
    ];
    const g = groupMod.buildGrouper(items);
    assert.strictEqual(g(items[0]).label, 'Máy xay sinh tố');
    assert.strictEqual(g(items[0]).key, g(items[1]).key);
    assert.strictEqual(g(items[2]).key, g(items[3]).key, '"Combo 2" không được chặn ghép mảng');
    assert.strictEqual(g(items[4]).source, 'product');
    assert.strictEqual(g(items[5]).label, 'Nồi chiên');
    assert.strictEqual(g(items[5]).source, 'field');
    assert.strictEqual(g(items[6]).source, 'shop');
    assert.strictEqual(groupMod.leafFromBreadcrumbs([{ name: 'Điện Gia Dụng' }, { name: 'Nồi chiên' }, { name: 'Tên SP' }], 'Tên SP'), 'Nồi chiên');
  });

  test('Hồ sơ: việc mẫu chỉ giữ khi điền đủ số; có đơn thì soạn được tin bù', () => {
    const items = build().map((f, i) => (f.sentiment === 'Negative' && /ố vàng/.test(f.originalText) ? { ...f, orderId: `DH${i}` } : f));
    const tx = items.filter((f) => f.orderId).map((f) => ({ orderId: f.orderId, amount: 120000 }));
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    const g = r.groups.find((x) => /ốp/i.test(x.label));
    const p = g.painPoints.find((x) => /ố vàng/.test(x.phrase) || x.variants.some((v) => /ố vàng/.test(v)));
    const c = caseFile.buildCaseFile(p, g, { items, transactions: tx, now: T0 + 30 * DAY });
    assert.ok(c.steps.who.actions.every((a) => !/\{\w+\}/.test(a.text)), 'không còn chỗ trống chưa điền');
    assert.ok(c.steps.who.actions.length > 0, 'phải còn việc làm được');
    assert.ok(c.steps.who.dropped.every((d) => d.need.length > 0), 'việc bị loại phải ghi rõ thiếu gì');
    assert.strictEqual(c.steps.ready.compensation.available, true);
    assert.strictEqual(c.steps.ready.compensation.orderValue, 12 * 120000);
    assert.ok(c.steps.ready.letter.text.includes(String(p.customers)));
  });

  test('Hồ sơ: đo trước/sau theo cụm của điểm đau', () => {
    const items = build();
    const r = pain.findPainPoints(items, { now: T0 + 30 * DAY });
    const g = r.groups.find((x) => /ốp/i.test(x.label));
    const p = g.painPoints[0];
    const e = caseFile.caseEffect(items, { groupKey: g.key, phraseKeys: p.phraseKeys, createdAt: new Date(T0 + 7 * DAY) }, T0 + 30 * DAY);
    assert.strictEqual(e.status, 'done');
    assert.ok(e.before.n > 0 && e.after.n > 0);
  });

  test('Điểm đau: mã nguồn không viết cứng tên mảng hay sản phẩm nào', () => {
    const fs = require('fs');
    const path = require('path');
    const src = ['pain_points.js', 'product_group.js', 'case_file.js']
      .map((f) => fs.readFileSync(path.join(__dirname, '..', 'services', f), 'utf8')).join('\n')
      // bỏ chú thích: ví dụ trong chú thích được phép
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of ['chuột', 'tai nghe', 'nồi', 'máy xay', 'sữa', 'áo', 'kết nối', 'giao chậm', 'Tiki']) {
      const re = new RegExp(`(?<!\\p{L})${word.toLowerCase()}(?!\\p{L})`, 'u');
      assert.ok(!re.test(src.toLowerCase()), `không được viết cứng "${word}"`);
    }
  });
}

(async () => {
  for (const t of asyncTests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  OK   ${t.name}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${t.name}\n       ${e.message}`);
    }
  }
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Kết quả: ${passed} đạt, ${failed} lỗi`);
  console.log('='.repeat(52));
  process.exit(failed > 0 ? 1 : 0);
})();
