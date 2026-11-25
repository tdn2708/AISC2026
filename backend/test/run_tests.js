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

  // Chuỗi thật của kho thật 24/11 (đổi trả, % mỗi kỳ 103 ngày): vượt ngưỡng ở
  // giữa rồi về 0 ba kỳ cuối. Đợt vượt đã qua không được báo là "đang xấu đi".
  const past = stats.ewmaControlChart([0.36, 0.48, 0.58, 1.07, 0, 0, 0.57, 0, 2.47, 2.17, 1.75, 0, 0, 0], { runLength: 3 });
  assert.strictEqual(past.breached, false, 'đợt vượt đã kết thúc vẫn bị báo động');
  assert.ok(past.maxConsecutiveBreaches >= 3, 'vẫn phải giữ lại độ dài đợt vượt cũ');
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

test('Quảng cáo đã che số ("[SĐT]") vẫn bị chặn; khiếu nại nhắc số shop và chữ S, T hoa thì không', () => {
  // Kho thật 24/11: file nạp được che số trước khi lọc rác, quảng cáo "Liên hệ zalo [SĐT]
  // để mua hàng giá sỉ" lọt vào và được tính như đánh giá thật
  const spam = (s) => trust.runSpamFilter({ originalText: s }, normalizer.normalize(s)).isSpam;
  assert.strictEqual(spam('Liên hệ zalo [SĐT] để mua hàng giá sỉ rẻ hơn'), true);
  assert.strictEqual(spam('Inbox [SĐT] lấy sỉ giá tốt'), true);
  assert.strictEqual(spam('Gọi [SĐT] shop không nghe máy, hàng lỗi'), false, 'khiếu nại có số shop không phải quảng cáo');
  assert.strictEqual(spam('mua sỉ được giảm không shop'), false, 'hỏi mua sỉ không kèm liên hệ không phải quảng cáo');
  assert.strictEqual(normalizer.spamSignals('Shop Tốt, STT 12').hasPhone, false, 'chữ S, Đ, T không phải số điện thoại');
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

test('Cảnh báo suy giảm kéo dài mang cửa sổ của kho: đề xuất đếm đúng khiếu nại trên kho thưa (nhịp 6 tháng)', () => {
  // Lỗi tìm thấy trên kho thật 24/11: cảnh báo drift không mang windowDays nên
  // đề xuất dựng lại bằng chứng trong 7 ngày mặc định, ra "0 phản hồi trong 7 ngày"
  // dù cảnh báo có 10 khiếu nại.
  const now = new Date('2026-11-23T00:00:00Z');
  const items = [];
  const buckets = 14;
  const bucketDays = 1440 / buckets;
  let id = 0;
  for (let b = 0; b < buckets; b++) {
    const rate = b >= 11 ? 0.3 : [0.06, 0.1, 0.08, 0.12, 0.06][b % 5];
    for (let k = 0; k < 50; k++) {
      const complaint = k < rate * 50;
      items.push({
        _id: 'dr' + id++,
        category: complaint ? 'ReturnRefund' : 'Other',
        subCategory: null,
        sentiment: complaint ? 'Negative' : 'Positive',
        productName: 'SP ' + (k % 4),
        source: 'Tiki',
        timestamp: new Date(now.getTime() - ((buckets - b - 0.5) * bucketDays + (k % 5)) * 86400000),
        trust: { weight: 0.5, tierWeight: 1, authenticityScore: 0, tier: 'P2', canTriggerHighAlert: true, band: 'ACCEPTED' }
      });
    }
  }
  const drift = alertEngine.detectSustainedDrift(items, { now, baselineDays: 1440, windowDays: 180, recentBaselineDays: 720 });
  assert.strictEqual(drift.length, 1, 'phải có đúng một cảnh báo suy giảm');
  assert.strictEqual(drift[0].windowDays, 180);
  assert.strictEqual(drift[0].baselineDays, 720);
  const rec = require('../services/recommender').buildRecommendation(drift[0], { items, now });
  assert.ok(rec.evidence.evidenceCount > 0, 'đề xuất phải thấy khiếu nại trong cửa sổ 6 tháng');
  assert.strictEqual(rec.dataProfile.slots.windowDays, '6 tháng');
  assert.ok(!/0 phản hồi trong 7 ngày/.test(rec.steps[0].text), rec.steps[0].text);
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
  // Kho thật 24/11: "6 tháng qua" từng khớp "tháng qua" thành 30 ngày (0 khiếu nại)
  assert.strictEqual(chatEngine.inferFilters('Sản phẩm nào bị chê nhiều nhất 6 tháng qua?').time, 'Days:180');
  assert.strictEqual(chatEngine.inferFilters('2 tuần gần đây').time, 'Days:14');
  assert.strictEqual(chatEngine.inferFilters('7 ngày qua').time, 'This Week');
  assert.strictEqual(chatEngine.inferFilters('size 38 còn không').time, undefined, 'số không kèm đơn vị thời gian không phải khoảng thời gian');
  const { timeBounds } = require('../services/analysis_context');
  const b = timeBounds('Days:180', new Date('2026-11-23T00:00:00Z'));
  assert.strictEqual(b.start, new Date('2026-11-23T00:00:00Z').getTime() - 180 * 86400000);
});

test('Trợ lý nhận ra sản phẩm được hỏi (đủ mọi mẫu của một dòng hàng, không khớp câu hỏi chung)', () => {
  const names = ['Máy Xay Sinh Tố Toshiba BL-70PR1NV (700W) - Hàng Chính Hãng', 'Máy xay sinh tố Philips HR2221/00 (700W) - Hàng Chính Hãng',
    'Máy xay sinh tố Philips HR2223/00 - Hàng Chính Hãng', 'Máy sấy tóc Philips BHC010/10 - Hàng Chính Hãng', 'Chuột Không Dây PIX-LINK P100'];
  assert.deepStrictEqual(chatEngine.productsInQuestion('Máy xay sinh tố Philips bị than gì?', names), [names[1], names[2]]);
  assert.deepStrictEqual(chatEngine.productsInQuestion('máy xay philips hr2223 thế nào', names), [names[2]]);
  // "dây" không được trùng "đây" (từ bỏ qua) sau khi bỏ dấu
  assert.deepStrictEqual(chatEngine.productsInQuestion('chuột không dây bị gì gần đây', names), [names[4]]);
  assert.deepStrictEqual(chatEngine.productsInQuestion('Sản phẩm nào bị chê nhiều nhất và vì sao?', names), []);
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
/** Chạy riêng bộ luật (tắt mô hình tuyến tính): các test này kiểm luật, không kiểm mô hình */
const rulesOnly = (fn) => () => { const prev = process.env.LIVE_MODEL; process.env.LIVE_MODEL = '0'; try { fn(); } finally { if (prev === undefined) delete process.env.LIVE_MODEL; else process.env.LIVE_MODEL = prev; } };
const liveAnswer = require('../services/live/answer');
const { LiveAggregator, groupKeyOf } = require('../services/live/aggregator');
const { MEGALIVE_CATALOG, MEGALIVE_POLICY } = require('../services/live/connectors/simulator');

test('Live (luật): phân loại ý định bình luận, kể cả gõ không dấu', rulesOnly(() => {
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
    ['xin chào cả nhà', 'chatter', null],
    ['áo xin quá shop ơi', 'praise', null],
    ['❤️❤️❤️', 'chatter', null]
  ];
  for (const [text, intent, topic] of cases) {
    const r = liveIntent.classifyComment(text);
    assert.strictEqual(r.intent, intent, `${text} -> ${r.intent}`);
    if (topic) assert.strictEqual(r.topic, topic, `${text} -> ${r.topic}`);
  }
}));

test('Live (luật): bình luận thật (YouTube/TikTok 23/11) không bị xếp nhầm vì trùng chữ khi bỏ dấu', rulesOnly(() => {
  // Câu lấy nguyên văn từ phiên live thật; trước bản sửa đều bị xếp sai
  const cases = [
    ['lo nghe máy', 'chatter'],                       // "máy" không phải "mấy"
    ['Clm nó ko thể tin đc', 'chatter'],              // "ko" giữa câu không phải câu hỏi
    ['không thì đi ngủ', 'chatter'],
    ['anh vẫn mang đi cho mà có sao đâu', 'chatter'], // "có sao đâu" là "không sao"
    ['thấy có chia tối ngũ phòng ngày chẵn và ngày lẽ nữa kia hihi', 'chatter'], // "chẵn" không phải "chán"
    ['cảm ơn nhiều', 'chatter'],
    ['trỡ lơi không biết có lợi hại hơn sưa ko', 'question'],
    ['box nào v', 'question'],
    ['giá bao nhiêu ạ.', 'question'],
    ['Em chuyển khoản anh Beo 50, mời anh Hoàng và a Beo ly nước, check giúp em', 'question'],
    ['chưa', 'chatter'],                               // câu đáp trơ trọi
    ['huyêyt cao hay thấp uống đc ko shop , vì mình mua cho mẹ mình uống nên hỏi kỷ tý nhe', 'question'],
    ['AE NÀO ĐI CHƯA ĐẾN CHỢ ĐÃ HẾT TIỀN THÌ VÀO CHỊ 3 ĐU ĐỦ CÓ THUỐC ĐÓ AE', 'chatter'],
    ['Anh em rảnh tay cho mình 1 Like + đăng ký kênh + chia sẻ với - Xin chân thành cảm ơn', 'chatter'],
    ['Ủng hộ tôi bằng cách đăng ký tài khoản Sàn HFM - Sàn uy tín theo link sau: https://www.hfreg-vn.com/', 'chatter'],
    ['Box new seal hả mn', 'question'],
    ['Mấy mô', 'question'],
    ['1lộ trình báo nhiêu ông chủ', 'question'],
    ['đừng nói chốt 240 nha', 'chatter'],
    ['lấy một mình em Nguyệt thôi không lấy 2 đâu', 'chatter'],
    ['lúc đó vụ kia cũng thua luôn hả mẫn', 'question'],
    ['giờ đây như sắt như đồng như đinh đóng cột như rồng phun mưa phải không mẫn', 'question'],
    ['cho xuống chốt lời giờ cho lên để lấy lời', 'chatter'],       // "chốt lời" là chốt lãi khi giao dịch
    ['???', 'chatter'],                                              // bày tỏ, không phải câu hỏi
    ['giá??', 'question']
  ];
  for (const [text, intent] of cases) assert.strictEqual(liveIntent.classifyComment(text).intent, intent, text);
  // "đến giờ" không phải màu đen; "cảm ơn" không phải màu cam
  assert.strictEqual(liveIntent.classifyComment('để không quên giờ cần có đồng hồ báo đến giờ làm việc M ạ').variant.color, undefined);
  assert.strictEqual(liveIntent.classifyComment('cảm ơn shop nhiều').variant.color, undefined);
  // Gõ không dấu vẫn hiểu như cũ
  assert.strictEqual(liveIntent.classifyComment('ao mau den con ko').variant.color, 'đen');
  assert.strictEqual(liveIntent.classifyComment('bo nay nhieu shop').topic, 'price');
}));

// Mốc do nlp_service/live/train_linear.py --check in ra: JS phải tính y hệt, không thì trọng số sai
const LIVE_PY_FEATURES = [{"text":"198","prep":"00","features":["c: 0","c:00","c:0 ","c: 00","c:00 ","c: 00 ","w:00","f:numonly","f:len1"]},{"text":"10x2","prep":"00x0","features":["c: 0","c:00","c:0x","c:x0","c:0 ","c: 00","c:00x","c:0x0","c:x0 ","c: 00x","c:00x0","c:0x0 ","w:00x0","f:numonly","f:len1"]}];
const LIVE_PY_PREP = [["Còn size M không shop??","còn size m không shop??"],["198","00"],["chốt 2 cái 😍😍😍","chốt 0 cái **"],["[USER] gia bn v","gia bn v"],["10x2","00x0"]];

test('Live: mô hình tuyến tính JS tính đặc trưng y hệt bản Python đã huấn luyện', () => {
  const lm = require('../services/live/linear_model');
  assert.ok(lm.available(), 'phải có backend/services/live/linear_model.json');
  for (const [text, prep] of LIVE_PY_PREP) assert.strictEqual(lm.prep(text), prep, text);
  for (const f of LIVE_PY_FEATURES) assert.deepStrictEqual(lm.features(f.text), f.features, f.text);
});

test('Live: luật + mô hình trên tập test gán nhãn (1.345 câu, 35 phiên không trùng train) không tụt điểm', () => {
  // Số lúc chọn 23/11: macro-F1 5 lớp 0,759, accuracy 0,852, cần trả lời F1 0,931 (luật một mình: 0,388 / 0,407 / 0,471)
  const rows = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'nlp_service', 'live', 'data', 'test.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const TO5 = { ORDER: 'order', QUESTION: 'question', REQUEST: 'question', NEGOTIATE: 'question', COMPLAINT: 'complaint', PRAISE: 'praise', GIVEAWAY: 'chatter', SOCIAL: 'chatter', OTHER: 'chatter' };
  const C = ['order', 'question', 'complaint', 'praise', 'chatter'];
  const pairs = rows.map((r) => [TO5[r.intent], liveIntent.classifyComment(r.text).intent]);
  const f1 = (c) => { const tp = pairs.filter(([g, q]) => g === c && q === c).length; const fp = pairs.filter(([g, q]) => g !== c && q === c).length; const fn = pairs.filter(([g, q]) => g === c && q !== c).length; return tp ? (2 * tp) / (2 * tp + fp + fn) : 0; };
  const macro = C.reduce((s2, c) => s2 + f1(c), 0) / C.length;
  const acc = pairs.filter(([g, q]) => g === q).length / pairs.length;
  assert.ok(macro >= 0.74, `macro-F1 5 lớp ${macro.toFixed(3)} < 0,74`);
  assert.ok(acc >= 0.83, `accuracy ${acc.toFixed(3)} < 0,83`);
  assert.ok(f1('order') >= 0.9, `chốt đơn F1 ${f1('order').toFixed(3)}`);
});

test('Live: luật vẫn phủ quyết mô hình ở chỗ chắc chắn; tắt được mô hình bằng LIVE_MODEL=0', () => {
  const c = (t) => liveIntent.classifyComment(t).intent;
  assert.strictEqual(c('198'), 'order', 'mã số trơn là chốt đơn (kiểu phiên gốm, gia dụng)');
  assert.strictEqual(c('32/10'), 'order');
  assert.strictEqual(c('???'), 'chatter', 'không có chữ thì không phải câu hỏi');
  assert.notStrictEqual(c('đừng nói chốt 240 nha'), 'order', 'chốt bị phủ định');
  assert.notStrictEqual(c('cho xuống chốt lời giờ cho lên để lấy lời'), 'order', 'chốt lời khi giao dịch');
  assert.strictEqual(c('sdt 0912345678 lấy cái này'), 'order', 'để lại số điện thoại');
  assert.strictEqual(c('vào nhóm zalo.me/g/abc để nhận quà'), 'chatter', 'link mời nhóm');
  assert.strictEqual(c('lo nghe máy'), 'chatter', 'mô hình chưa chắc là khiếu nại thì theo luật');
  const m = liveIntent.classifyComment('còn size M không shop');
  assert.ok(m.model && m.model.label, 'có ý kiến của mô hình để soi lại');
  process.env.LIVE_MODEL = '0';
  try {
    assert.strictEqual(liveIntent.classifyComment('198').model, null);
    assert.strictEqual(c('198'), 'chatter', 'tắt mô hình thì về luật như cũ');
  } finally {
    delete process.env.LIVE_MODEL;
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

test('Live: câu hỏi không rõ chủ đề chỉ gom khi cùng nội dung; dồn dập thì việc gấp nêu đúng câu khách hỏi', () => {
  // Phiên YouTube thật 23/11: mọi câu "khác" bị gom một thẻ, báo "34 câu cùng nội dung" sai
  const a = groupKeyOf({ intent: 'question', topic: 'other', text: 'Mạng sao thế chị' });
  const b = groupKeyOf({ intent: 'question', topic: 'other', text: 'Em sinh năm nào vậy em?' });
  const c = groupKeyOf({ intent: 'question', topic: 'other', text: 'mạng sao thế chị!!' });
  assert.notStrictEqual(a, b, 'hai câu khác nhau không chung thẻ');
  assert.strictEqual(a, c, 'cùng câu (khác dấu câu, hoa thường) thì chung thẻ');
  assert.ok(groupKeyOf({ intent: 'question', topic: 'price', text: 'giá sao' }).startsWith('q|price|'), 'chủ đề có tên vẫn gom theo chủ đề');
  const { actions } = liveScenario(times(6, 2, 'mạng sao thế chị'));
  const burst = actions.find((x) => x.type === 'question_burst');
  assert.ok(burst && /6 người cùng hỏi "mạng sao thế chị"/.test(burst.title), burst && burst.title);
  const mixed = liveScenario([[2, 'mạng sao thế chị'], [2, 'em sinh năm nào'], [2, 'quê ở đâu vậy'], [2, 'ai đang xem'], [2, 'mấy giờ nghỉ'], [2, 'hôm nay bán gì']]).actions;
  assert.ok(!mixed.some((x) => x.type === 'question_burst'), 'các câu khác nhau không thành "nhiều người cùng hỏi"');
});

test('Live: xu hướng người mua 10 phút (muốn mua, muốn biết, đang cần, nhịp bán) và người xem theo phút', () => {
  const now = Date.parse('2026-11-24T10:30:00Z');
  const agg = new LiveAggregator({ products: MEGALIVE_CATALOG });
  let i = 0;
  const add = (minAgo, text, extra = {}) => {
    const c = liveIntent.classifyComment(text, { products: MEGALIVE_CATALOG });
    const doc = { _id: `t${i++}`, ts: new Date(now - minAgo * 60000), author: { hash: `u${i}` }, ...c, ...extra, status: c.intent === 'question' || c.intent === 'complaint' ? 'open' : null };
    doc.groupKey = groupKeyOf(doc);
    agg.add(doc);
  };
  for (let k = 0; k < 4; k++) add(15 - k, 'chốt áo thun size M');          // 10 phút trước: 4 lượt
  for (let k = 0; k < 6; k++) add(4 - k * 0.5, 'chốt áo thun size M');      // 10 phút gần nhất: 6 lượt
  add(3, 'áo thun giá bao nhiêu'); add(2, 'giá áo thun sao shop');
  add(1, 'đơn hôm trước chưa nhận được hàng');
  agg.setViewers(1000, now - 12 * 60000); agg.setViewers(1200, now - 2 * 60000);
  const snap = agg.snapshot({ now });
  const tr = snap.trend;
  assert.ok(tr.wants[0].label.includes('Áo thun') && tr.wants[0].label.includes('size M'), JSON.stringify(tr.wants));
  assert.deepStrictEqual([tr.wants[0].now, tr.wants[0].before], [6, 4]);
  assert.strictEqual(tr.asks[0].key, 'price');
  assert.ok(tr.asks[0].sample, 'có câu khách hỏi thật làm ví dụ');
  assert.ok(tr.needs.some((n) => n.kind === 'complaint' && n.count === 1));
  assert.ok(tr.needs.some((n) => n.kind === 'waiting' && n.count === 2));
  assert.strictEqual(tr.sales.viewersNow, 1200);
  assert.ok(snap.series.some((m) => m.viewers === 1000) && snap.series.some((m) => m.viewers === 1200), 'người xem ghi theo phút');
  assert.ok(snap.series.some((m) => m.qty >= 1), 'số sản phẩm chốt theo phút');
  // Phiên không khai danh mục, chốt bằng mã số: gom theo chính câu chốt
  const bare = new LiveAggregator({ products: [] });
  for (let k = 0; k < 3; k++) { const c = liveIntent.classifyComment('198'); bare.add({ _id: `b${k}`, ts: new Date(now - k * 60000), author: { hash: `b${k}` }, ...c }); }
  const w = bare.snapshot({ now }).trend.wants[0];
  assert.deepStrictEqual([w.label, w.now, w.byCode], ['"198"', 3, true]);
  // Phiên mới chạy 1 phút: nhịp chốt chia cho thời gian đã live, không chia cứng 5 phút
  const young = new LiveAggregator({ products: [] });
  for (let k = 0; k < 6; k++) { const c = liveIntent.classifyComment('chốt 1 cái'); young.add({ _id: `y${k}`, ts: new Date(now - 60000 + k * 5000), author: { hash: `y${k}` }, ...c }); }
  const ys = young.snapshot({ now }).trend.sales;
  assert.strictEqual(ys.perMinNow, 6);
  assert.strictEqual(ys.state, 'start');
});

test('Live coach: nhịp chốt đơn chậm hẳn so với 10 phút trước -> quay lại món bán chạy, nhắc ưu đãi', () => {
  const lines = [...times(8, 13, 'chốt áo thun size M'), [3, 'đẹp quá shop']];
  const { actions } = liveScenario(lines, { current: 'quan-jean' });
  const a = actions.find((x) => x.type === 'order_slowdown');
  assert.ok(a, JSON.stringify(actions.map((x) => x.type)));
  assert.strictEqual(a.do?.productId, 'ao-thun', 'quay lại món chốt nhiều nhất');
  assert.ok(a.script && /chỉ trong mấy phút tới/.test(a.script), a.script);
  assert.ok(!a.script.includes('..'), a.script);
  // Nhịp vẫn đều thì không báo
  assert.ok(!liveScenario([...times(6, 12, 'chốt áo thun size M'), ...times(4, 3, 'chốt áo thun size M')]).actions.some((x) => x.type === 'order_slowdown'));
});

test('Live coach: chốt dồn dập -> dự báo phút hết hàng trước khi chạm ngưỡng sắp hết', () => {
  // Áo thun size XL tồn 25, 16 lượt chốt trong 10 phút: còn 9 cái, 1,6 cái/phút -> hết sau khoảng 6 phút
  const { actions } = liveScenario(times(16, 5, 'chốt áo thun size XL'));
  const a = actions.find((x) => x.type === 'low_stock');
  assert.ok(a, JSON.stringify(actions.map((x) => x.type)));
  assert.strictEqual(a.etaMin, 6);
  assert.ok(/dự kiến hết sau khoảng 6 phút/.test(a.title), a.title);
  // Nhịp chậm (3 lượt chốt) và còn nhiều hàng thì chưa báo
  assert.ok(!liveScenario(times(3, 5, 'chốt áo thun size XL')).actions.some((x) => x.type === 'low_stock'));
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
test('Quản gia live: sự cố kỹ thuật báo khi quá ngưỡng, báo "đã ổn lại" đúng người đã nhận tin lỗi', () => {
  const { detectProblems, TechTracker, buildTechText, buildTechOkText } = require('../services/butler/live_tech');
  const session = { _id: 's1', title: 'Live tối thứ sáu', platform: 'tiktok' };
  const t0 = Date.parse('2026-11-17T12:00:00Z');
  const rt = (status, health = {}) => ({
    status, error: status === 'reconnecting' ? 'DEVICE_BLOCKED' : null,
    healthInfo: () => ({ statusSince: new Date(t0), writeFailures: 0, dropped: 0, pendingWrites: 0, ...health })
  });
  const tr = new TechTracker();
  // Mất kết nối 30 giây: chưa báo
  let probs = detectProblems({ ws: 'real', running: [{ session, runtime: rt('reconnecting') }], now: t0 + 30000 });
  assert.strictEqual(probs.length, 1);
  let out = tr.update(probs, t0 + 30000);
  assert.strictEqual(out.due.length, 0, 'chưa quá 1 phút thì chưa báo');
  // 70 giây: báo
  probs = detectProblems({ ws: 'real', running: [{ session, runtime: rt('reconnecting') }], now: t0 + 70000 });
  out = tr.update(probs, t0 + 70000);
  assert.strictEqual(out.due.length, 1);
  const text = buildTechText(out.due[0], { appUrl: 'https://app', now: t0 + 70000 });
  assert.ok(/mất kết nối với TikTok/.test(text) && /DEVICE_BLOCKED/.test(text) && /https:\/\/app\/live\?session=s1/.test(text), text);
  tr.markNotified(out.due[0].key, 'u1');
  // Nối lại: báo đã ổn lại cho u1, một lần
  out = tr.update([], t0 + 130000);
  assert.strictEqual(out.recovered.length, 1);
  assert.ok(out.recovered[0].notified.has('u1'));
  assert.ok(/Đã ổn lại: phiên "Live tối thứ sáu" đã nối lại sau 2 phút/.test(buildTechOkText(out.recovered[0], { now: t0 + 130000 })));
  assert.strictEqual(tr.update([], t0 + 190000).recovered.length, 0, 'không báo ổn lại hai lần');
  // Sự cố chưa từng báo thì hết cũng không nhắn
  tr.update(detectProblems({ ws: 'real', running: [{ session, runtime: rt('live', { writeFailures: 1, failingSince: new Date(t0) }) }], now: t0 }), t0);
  assert.strictEqual(tr.update([], t0 + 5000).recovered.length, 0);
  // Ghi lỗi quá 30 giây, quá tải, phiên bị ngắt sau khi khởi động lại đủ lâu
  probs = detectProblems({
    ws: 'demo',
    running: [{ session, runtime: rt('live', { writeFailures: 3, failingSince: new Date(t0), pendingWrites: 1200 }) }],
    orphans: [{ _id: 's2', title: 'Phiên cũ' }],
    proc: { rssMb: 470, loop: { p99Ms: 30 } },
    now: t0 + 40000, uptimeSec: 300
  });
  assert.deepStrictEqual(probs.map((p) => p.kind).sort(), ['interrupted', 'overload', 'write']);
  assert.strictEqual(detectProblems({ ws: 'demo', orphans: [{ _id: 's2' }], uptimeSec: 30 }).length, 0, 'vừa khởi động thì chờ tự nối lại');
});

test('Báo cáo Zalo cuối phiên live có ba việc ưu tiên cho phiên sau', () => {
  const { buildLiveReportText } = require('../services/butler/live_watch');
  const text = buildLiveReportText(
    { _id: 's9', title: 'Live 11.11' },
    { totals: { comments: 1200, byIntent: { order: 80 }, orderQuantity: 95 }, revenue: { estimated: 12000000, lostTotal: 900000 },
      todo: [{ title: 'Lên đơn cho 12 lượt chốt chưa xử lý' }, { title: 'Xử lý 4 khiếu nại trước phiên sau' }, { title: 'Nhập thêm Áo thun size M' }, { title: 'Việc thứ tư' }] },
    { appUrl: 'https://app', durationMs: 3600000 }
  );
  assert.ok(/Việc cho phiên sau:\n1\. Lên đơn cho 12 lượt chốt chưa xử lý\.\n2\. Xử lý 4 khiếu nại trước phiên sau\.\n3\. Nhập thêm Áo thun size M\./.test(text), text);
  assert.ok(!/Việc thứ tư/.test(text), 'chỉ ba việc');
});

test('Đề xuất AI: cổng kiểm loại số bịa, tên ngoài bằng chứng, tự nhận đã làm; giữ bản đúng', () => {
  const { verifyDraft } = require('../services/rec_drafter');
  const pack = {
    allowedNumbers: ['32', '186', '202', '284040831', '96', '1', '2', '3'],
    forbidden: ['Nồi chiên không dầu Lock&Lock 5.5L', 'Hà Nội']
  };
  const ok = verifyDraft('{"actions":[{"text":"Báo trễ hẹn cho 202 khách tại TP.HCM (cần duyệt).","why":"96% phản hồi ở TP.HCM, tỉ lệ từ 3,2% lên 18,6%."}]}', pack);
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.strictEqual(ok.draft.actions.length, 1);
  const badNum = verifyDraft('{"actions":[{"text":"Báo cho 350 khách.","why":"ước tính"}]}', pack);
  assert.ok(!badNum.ok && /350/.test(badNum.reason), 'số 350 không có trong bằng chứng phải bị loại');
  const stray = verifyDraft('{"actions":[{"text":"Chuyển kho sang Hà Nội.","why":"x"}]}', pack);
  assert.ok(!stray.ok && /Hà Nội/.test(stray.reason));
  const claim = verifyDraft('{"actions":[{"text":"Hệ thống sẽ tự động hoàn tiền cho khách.","why":"x"}]}', pack);
  assert.ok(!claim.ok, 'không được hứa tự động làm');
  assert.ok(!verifyDraft('không phải json', pack).ok);
  assert.ok(!verifyDraft('{"actions":[]}', pack).ok);
});

test('Đề xuất: việc bổ sung dữ liệu tách ra mục riêng; kết quả đo thật kéo điểm hiệu quả', () => {
  const rec = require('../services/recommender');
  // Học từ kết quả: hai lần chấp nhận, khiếu nại giảm thật thì hiệu quả tăng so với kỳ vọng
  const day = 86400000;
  const at = Date.parse('2026-11-01T00:00:00Z');
  const mk = (t, hit) => ({ _id: `${t}-${Math.random()}`, timestamp: new Date(t), category: hit ? 'Delivery' : 'Product', subCategory: hit ? 'Late' : null, productName: 'A', trust: { weight: 1 } });
  const items = [];
  for (let i = 0; i < 60; i += 1) items.push(mk(at - (i % 7) * day - 1000, i % 3 === 0)); // trước: 1/3 khiếu nại
  for (let i = 0; i < 60; i += 1) items.push(mk(at + (i % 7) * day + 1000, i % 12 === 0)); // sau: 1/12
  const decisions = [{ alertId: 'Delivery|Late|A|*|x', decision: 'ACCEPTED', at: new Date(at), actionIds: ['ACT_X'] }];
  const out = rec.learnOutcomes(decisions, items, new Date(at + 10 * day), 7);
  const o = out.get('ACT_X');
  assert.ok(o && o.n === 1 && o.improved === 1 && o.sumRel > 0.5, JSON.stringify(o));
  const learning = { byAction: new Map(), suppressed: [], totalDecisions: 1, outcomes: out };
  const alert = { category: 'Delivery', severity: 'High', statistics: { currentRate: 0.3, baselineRate: 0.1, sampleCurrent: 100 }, affectedCustomers: 50 };
  const profile = { evidenceCount: 100, weightedCount: 80, revenue: { measurable: false }, focusedDimensions: [], concentration: 'DIFFUSE' };
  const base = rec.scoreAction({ id: 'ACT_Y', expectedReduction: 0.2, kind: 'INTERNAL_FIX' }, alert, profile, learning);
  const learned = rec.scoreAction({ id: 'ACT_X', expectedReduction: 0.2, kind: 'INTERNAL_FIX' }, alert, profile, learning);
  assert.ok(learned.components.expectedEffect > base.components.expectedEffect, 'đo được giảm thật thì hiệu quả cao hơn kỳ vọng');
  assert.strictEqual(learned.components.measuredOutcomes, 1);
});

test('Giá trị cho shop: doanh thu rủi ro chỉ của cảnh báo chưa xử lý, khiếu nại tránh được đo trước sau, livestream 30 ngày', () => {
  const { computeValue } = require('../services/value_summary');
  const day = 86400000;
  const now = new Date('2026-11-18T12:00:00Z');
  const at = now.getTime() - 10 * day;
  const mk = (t, hit) => ({ _id: `${t}-${Math.random()}`, timestamp: new Date(t), category: hit ? 'Delivery' : 'Product', subCategory: hit ? 'Late' : null, productName: 'A', trust: { weight: 1 } });
  const items = [];
  for (let i = 0; i < 60; i += 1) items.push(mk(at - (i % 7) * day - 1000, i % 3 === 0)); // trước: 20/60
  for (let i = 0; i < 60; i += 1) items.push(mk(at + (i % 7) * day + 1000, i % 12 === 0)); // sau: 5/60
  const v = computeValue({
    recs: [
      { status: 'PROPOSED', dataProfile: { revenue: { measurable: true, extrapolatedVnd: 5000000, isLowerBound: true } } },
      { status: 'ACCEPTED', dataProfile: { revenue: { measurable: true, extrapolatedVnd: 9000000 } } },
      { status: 'PROPOSED', dataProfile: { revenue: { measurable: false, extrapolatedVnd: 0 } } }
    ],
    decisions: [
      { alertId: 'Delivery|Late|A|*|x', decision: 'ACCEPTED', at: new Date(at) },
      { alertId: 'Delivery|Late|A|*|y', decision: 'ACCEPTED', at: new Date(now.getTime() - 2 * day) },
      { alertId: 'Delivery|Late|A|*|z', decision: 'ACCEPTED', at: new Date(now.getTime() - 60 * day) }
    ],
    items,
    transactions: [{ amount: 200000 }, { amount: 400000 }, { amount: 0 }],
    liveSessions: [
      { endedAt: new Date(now.getTime() - 3 * day), summary: { revenue: 12000000, lostRevenue: 900000 }, actions: [{ status: 'done' }, { status: 'dismissed' }] },
      { endedAt: new Date(now.getTime() - 40 * day), summary: { revenue: 99999999 } }
    ],
    now,
    cadenceDays: 7
  });
  assert.deepStrictEqual(v.atRisk, { amount: 5000000, alerts: 1, lowerBound: true }, 'chỉ cảnh báo chưa xử lý và đo được tiền');
  assert.strictEqual(v.saved.measured, 1);
  assert.strictEqual(v.saved.pending, 1, 'quyết định 2 ngày trước chưa đủ 7 ngày đo');
  assert.strictEqual(v.saved.complaintsAvoided, 15, '(20/60 - 5/60) x 60 = 15 khiếu nại');
  assert.strictEqual(v.saved.avgOrderValue, 300000);
  assert.strictEqual(v.saved.amount, 4500000);
  assert.deepStrictEqual(v.live, { sessions: 1, revenue: 12000000, lostFlagged: 900000, actionsDone: 1 });
});

test('Giá trị cho shop: phản hồi nằm trong hai cảnh báo chỉ được tính tiền một lần', () => {
  const { computeValue } = require('../services/value_summary');
  const rev = (v) => ({ measurable: true, extrapolatedVnd: v });
  const v = computeValue({
    recs: [
      { status: 'PROPOSED', dataProfile: { revenue: rev(10000000) }, evidence: { evidenceIds: ['a', 'b', 'c', 'd'] } },
      { status: 'PROPOSED', dataProfile: { revenue: rev(4000000) }, evidence: { evidenceIds: ['c', 'd'] } },
      { status: 'PROPOSED', dataProfile: { revenue: rev(6000000) }, evidence: { evidenceIds: ['d', 'e', 'f'] } }
    ],
    now: new Date('2026-11-18T12:00:00Z')
  });
  // 10 triệu (a-d) + 6 triệu x 2/3 (e, f mới) ; cảnh báo c-d trùng hẳn nên bỏ
  assert.strictEqual(v.atRisk.amount, 14000000);
  assert.strictEqual(v.atRisk.alerts, 2);
});

test('Hiệu quả quyết định có đối chứng: trừ phần giảm chung của sản phẩm khác cùng kỳ', () => {
  const insights = require('../services/insights');
  const day = 86400000;
  const at = Date.parse('2026-11-01T00:00:00Z');
  const mk = (t, prod, hit) => ({ _id: `${prod}${t}${Math.random()}`, timestamp: new Date(t), productName: prod, category: hit ? 'Delivery' : 'Product', subCategory: hit ? 'Late' : null, trust: { weight: 1 } });
  const items = [];
  for (let i = 0; i < 60; i += 1) {
    items.push(mk(at - (i % 7) * day - 1000, 'A', i % 3 === 0)); // A trước 20/60
    items.push(mk(at + (i % 7) * day + 1000, 'A', i % 12 === 0)); // A sau 5/60
    items.push(mk(at - (i % 7) * day - 2000, 'B', i % 3 === 0)); // B trước 20/60
    items.push(mk(at + (i % 7) * day + 2000, 'B', i % 4 === 0)); // B sau 15/60
  }
  const eff = insights.decisionEffect(items, { alertId: 'Delivery|Late|A|*|x', decision: 'ACCEPTED', at: new Date(at) }, new Date(at + 10 * day), 7);
  assert.ok(eff.control, 'có nhóm đối chứng');
  assert.ok(Math.abs(eff.change - (-15 / 60)) < 1e-9);
  assert.ok(Math.abs(eff.control.change - (-5 / 60)) < 1e-9);
  assert.ok(Math.abs(eff.adjustedChange - (-10 / 60)) < 1e-9, 'giảm nhờ việc đã làm = 15/60 - 5/60');
  const noCtl = insights.decisionEffect(items.filter((f) => f.productName === 'A'), { alertId: 'Delivery|Late|A|*|x', decision: 'ACCEPTED', at: new Date(at) }, new Date(at + 10 * day), 7);
  assert.strictEqual(noCtl.control, null);
  assert.strictEqual(noCtl.adjustedChange, noCtl.change);
});

test('Lỗi máy chủ: đếm lỗi 5 phút gần nhất, từ 5 lỗi hoặc bộ nhớ sát trần thì thành sự cố báo Zalo', () => {
  const ph = require('../services/process_health');
  const { detectSystemProblems } = require('../services/butler/live_tech');
  for (let i = 0; i < 4; i += 1) ph.recordError('http', 'GET /api/stats');
  ph.recordError('http', 'GET /api/alerts');
  const r = ph.recentErrors(5 * 60 * 1000);
  assert.ok(r.count >= 5);
  assert.strictEqual(r.top[0].where, 'GET /api/stats');
  assert.deepStrictEqual(detectSystemProblems({ errors: { count: 4 }, proc: { rssMb: 300 } }), [], 'dưới ngưỡng thì im');
  const p = detectSystemProblems({ errors: r, proc: { rssMb: 480 } });
  assert.deepStrictEqual(p.map((x) => x.key), ['sys|errors', 'sys|memory']);
});

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

testAsync('Live: tin cũ trước khi mở phiên TikTok/YouTube không vào hàng đợi; bỏ "@" thừa ở tên', async () => {
  const hub = require('../services/live/hub');
  const opened = Date.now() - 60 * 1000;
  const session = { _id: 'yt1', platform: 'youtube', target: 'abcdefghijk', products: [], policy: {}, createdAt: new Date(opened) };
  const { db } = fakeLiveDb(() => []);
  const r = new hub.Runtime(session, db, 'real');
  try {
    // tin 56 phút trước khi mở phiên (YouTube trả kèm lúc mới nối): bỏ
    assert.strictEqual(r.ingest({ type: 'comment', platformMsgId: 'm1', text: 'giá bao nhiêu ạ', ts: new Date(opened - 56 * 60000), author: { handle: '@khach1' } }), null);
    // tin 1 phút trước khi mở phiên: vẫn nhận (lệch đồng hồ, độ trễ nối)
    const d = r.ingest({ type: 'comment', platformMsgId: 'm2', text: 'giá bao nhiêu ạ', ts: new Date(opened - 60000), author: { handle: '@khach2' } });
    assert.ok(d, 'tin sát lúc mở phiên phải được nhận');
    assert.strictEqual(d.author.handle, 'khach2', 'tên không còn @ đầu');
    assert.strictEqual(r.health.skippedOld, 1);
    assert.strictEqual(r.agg.total, 1);
    // phiên nhập tay vẫn nhận bình luận cũ (dán lại sau live)
    const m = new hub.Runtime({ ...session, _id: 'm1', platform: 'manual' }, db, 'real');
    try { assert.ok(m.ingest({ type: 'comment', text: 'còn size M không', ts: new Date(opened - 3 * 3600000) })); } finally { m.dispose(); }
  } finally {
    r.dispose();
  }
});

test('YouTube không khóa API: đọc tin thường, Super Chat, biểu tượng; trang tắt trò chuyện báo rõ; hết live không lấy tổng lượt xem làm người đang xem', () => {
  const yt = require('../services/live/connectors/youtube_public');
  const out = yt.parseChatActions([
    { addChatItemAction: { item: { liveChatTextMessageRenderer: { id: 'a', message: { runs: [{ text: 'còn ' }, { emoji: { emojiId: '❤', shortcuts: [':heart:'] } }, { text: ' size M ko' }] }, authorName: { simpleText: '@khach' }, authorExternalChannelId: 'UC1', timestampUsec: '1763900000000000' } } } },
    { addChatItemAction: { item: { liveChatPaidMessageRenderer: { id: 'b', message: { runs: [{ text: 'chốt 2' }] }, authorName: { simpleText: 'Lan' }, timestampUsec: '1763900001000000' } } } },
    { addChatItemAction: { item: { liveChatViewerEngagementMessageRenderer: { id: 'c' } } } },
    { addLiveChatTickerItemAction: {} }
  ]);
  assert.deepStrictEqual(out.map((c) => [c.platformMsgId, c.text, c.author.handle, c.paid]), [['a', 'còn ❤ size M ko', 'khach', false], ['b', 'chốt 2', 'Lan', true]]);
  assert.strictEqual(out[0].ts.getTime(), 1763900000000);
  const off = yt.parseChatPage('<script>window["ytInitialData"] = {"contents":{"messageRenderer":{"text":{"runs":[{"text":"Sự kiện trực tiếp này đã bị tắt tính năng trò chuyện."}]}}}};</script>');
  assert.ok(/tắt tính năng trò chuyện/.test(off.offline), off.offline);
  assert.ok(!off.parseError, 'YouTube nói rõ tắt trò chuyện: kết luận được');
  assert.strictEqual(yt.parseChatPage('<html>trang lỗi</html>').parseError, true, 'trang đọc không được: phải hỏi lại còn phát không, không kết thúc ngay');
  const page = yt.parseChatPage('"INNERTUBE_API_KEY":"k1","INNERTUBE_CLIENT_VERSION":"2.1"<script>window["ytInitialData"] = ' + JSON.stringify({ contents: { liveChatRenderer: {
    continuations: [{ invalidationContinuationData: { continuation: 'TOP', timeoutMs: 5000 } }], actions: [],
    header: { liveChatHeaderRenderer: { viewSelector: { sortFilterSubMenuRenderer: { subMenuItems: [
      { title: 'Tin nhắn hàng đầu', selected: true, continuation: { reloadContinuationData: { continuation: 'TOP' } } },
      { title: 'Trò chuyện trực tiếp', selected: false, continuation: { reloadContinuationData: { continuation: 'ALL' } } }] } } } } } } }) + ';</script>');
  assert.deepStrictEqual([page.apiKey, page.clientVersion, page.continuation, page.allMessages], ['k1', '2.1', 'ALL', true], 'phải đọc chế độ mọi tin nhắn, không phải tin đã lọc');
  const vr = (v) => ({ actions: [{ updateViewershipAction: { viewCount: { videoViewCountRenderer: v } } }] });
  assert.deepStrictEqual(yt.parseViewers(vr({ originalViewCount: '739', isLive: true })), { count: 739, isLive: true });
  assert.deepStrictEqual(yt.parseViewers(vr({ originalViewCount: '29694' })), { count: null, isLive: false });
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

// ------------------------------------------------------------------
// Nhịp phân tích theo mật độ dữ liệu (services/cadence.js)
// ------------------------------------------------------------------
{
  const cadence = require('../services/cadence');
  const DAY = 86400000;
  const NOW = Date.UTC(2026, 10, 1);
  const mk = (ageDays) => ({ timestamp: new Date(NOW - ageDays * DAY).toISOString(), trust: { weight: 1 } });

  test('Nhịp: kho dày giữ đúng 7 ngày so với 28 ngày như cũ', () => {
    const items = Array.from({ length: 2800 }, (_, i) => mk((i % 56) + 0.5));
    const c = cadence.analysisCadence(items, NOW);
    assert.strictEqual(c.windowDays, 7);
    assert.strictEqual(c.baselineDays, 28);
    assert.strictEqual(c.trendSpanDays, 28);
    assert.strictEqual(c.adaptive, false);
  });

  test('Nhịp: kho thưa trải nhiều năm tự giãn cửa sổ cho đủ câu', () => {
    // Mỗi tuần một câu, 4 năm: 7 ngày chỉ có 1 câu
    const items = Array.from({ length: 208 }, (_, i) => mk(i * 7 + 1));
    const c = cadence.analysisCadence(items, NOW);
    assert.ok(c.windowDays > 7, 'phải giãn ra');
    assert.ok(c.windowSample >= cadence.MIN_WINDOW || c.windowDays === cadence.LADDER[cadence.LADDER.length - 1]);
    assert.strictEqual(c.baselineDays, c.windowDays * cadence.BASE_RATIO);
  });

  test('Nhịp: kho rỗng hoặc toàn câu không được tính vẫn trả 7 ngày, không lỗi', () => {
    assert.strictEqual(cadence.analysisCadence([], NOW).windowDays, 7);
    assert.strictEqual(cadence.analysisCadence([{ timestamp: 'x', trust: { weight: 0 } }], NOW).windowDays, 7);
    assert.strictEqual(cadence.analysisCadence([mk(1), mk(2)], NOW).windowDays, 7);
  });

  test('Nhịp: phản hồi ở tương lai không được đếm', () => {
    const items = Array.from({ length: 500 }, () => mk(-3));
    assert.strictEqual(cadence.analysisCadence(items, NOW).windowSample, 0);
  });

  test('Nhịp: khoảng ngày bằng chữ', () => {
    assert.strictEqual(cadence.spanWords(7), '7 ngày');
    assert.strictEqual(cadence.spanWords(180), '6 tháng');
    assert.strictEqual(cadence.spanWords(720), '24 tháng');
  });

  test('Xu hướng: ô dài hơn một tháng ghi tháng/năm, không trùng nhãn', () => {
    const m = require('../services/metrics');
    const s = m.weightedTimeSeries([], 14, new Date(NOW), 720);
    assert.strictEqual(new Set(s.map((x) => x.name)).size, 14);
    assert.ok(/^\d{2}\/\d{4}$/.test(s[0].name));
    assert.ok(s[0].days > 31);
    const d = m.weightedTimeSeries([], 14, new Date(NOW), 28);
    assert.ok(/^\d{2}\/\d{2}$/.test(d[0].name));
  });

  test('Hồ sơ: số ngày đã trôi tính theo đồng hồ thật, nền trước theo nhịp kho', () => {
    const caseFile = require('../services/case_file');
    // Kho thưa: đánh giá mới nhất cách lúc mở hồ sơ 9 ngày
    const items = Array.from({ length: 60 }, (_, i) => ({ ...mk(9 + i * 3), sentiment: 'Negative', text: 'bị lỗi', productCategory: 'x' }));
    const c = { groupKey: 'shop', phraseKeys: ['bị lỗi'], createdAt: new Date(NOW - 10 * DAY) };
    const e = caseFile.caseEffect(items, c, new Date(NOW), 7, 180);
    assert.strictEqual(e.status, 'done');
    // Kho thật: mốc dữ liệu cũ hơn hôm nay 9 ngày, vừa mở xong thì vẫn còn đủ 7 ngày chờ
    const fresh = caseFile.caseEffect(items, { ...c, createdAt: new Date(NOW - 9 * DAY), openedAt: new Date(NOW) }, new Date(NOW), 7, 180);
    assert.strictEqual(fresh.status, 'pending');
    assert.strictEqual(fresh.daysLeft, 7);
    assert.ok(e.before.n > 0, 'nền trước phải có câu');
    assert.strictEqual(e.beforeDays, 180);
  });
}

// ------------------------------------------------------------------
// Dữ liệu mới bất kỳ: chữ có dấu, dòng không ngày, gán nhãn bằng luật
// ------------------------------------------------------------------
{
  const pain = require('../services/pain_points');
  const ai = require('../services/ai_analyzer');
  const alertEngine = require('../services/alert_engine');
  const m = require('../services/metrics');

  test('Điểm đau: chữ có dấu không bị coi là từ hư vì trùng dạng bỏ dấu (ố/ở, bàn/bạn, máy/mấy)', () => {
    const keys = (t) => [...pain.gramsOf({ originalText: t }).keys()];
    assert.ok(keys('ốp bị ố vàng').includes('ố vàng'));
    assert.ok(keys('bàn phím bị liệt').includes('bàn phím'));
    assert.ok(keys('máy kêu to quá').includes('máy kêu'));
    // từ hư có dấu vẫn bị chặn ở mép cụm
    assert.ok(!keys('giao hàng đến chậm').some((k) => k.startsWith('đến ')));
    // gõ không dấu: vẫn so danh sách bỏ dấu
    assert.ok(!keys('o day giao cham').includes('o day'));
  });

  test('Lớp luật: câu không có từ khóa dùng số sao; 1 đến 2 sao thắng từ khen yếu', () => {
    assert.strictEqual(ai.classifyByRulesFallback('ốp bị ố vàng', 1).sentiment, 'Negative');
    assert.strictEqual(ai.classifyByRulesFallback('nem xep lun nhanh', 2).sentiment, 'Negative');
    assert.strictEqual(ai.classifyByRulesFallback('dày dặn', 5).sentiment, 'Positive');
    // câu chê kèm 5 sao vẫn là chê
    assert.strictEqual(ai.classifyByRulesFallback('giao hàng chậm quá', 5).sentiment, 'Negative');
    // không có số sao: như cũ
    assert.strictEqual(ai.classifyByRulesFallback('ốp bị ố vàng').sentiment, 'Neutral');
  });

  test('Dòng nạp không có ngày không tạo đột biến và không vào biểu đồ thời gian', () => {
    const NOW = Date.UTC(2026, 10, 1);
    const base = (i, extra) => ({ _id: String(i), timestamp: new Date(NOW - (i % 50) * 86400000).toISOString(), trust: { weight: 1, canTriggerHighAlert: true }, category: 'Other', sentiment: 'Positive', ...extra });
    const items = Array.from({ length: 600 }, (_, i) => base(i));
    // 80 khiếu nại không ngày, mang ngày nạp = NOW
    for (let i = 0; i < 80; i++) items.push(base(1000 + i, { timestamp: new Date(NOW).toISOString(), timeInferred: true, category: 'ProductQuality', subCategory: 'TechnicalDefect', sentiment: 'Negative', author: 'k' + i }));
    const r = alertEngine.detectAlerts(items, { now: new Date(NOW) });
    assert.strictEqual(r.alerts.length, 0, 'không được báo đột biến từ dòng không ngày');
    const series = m.weightedTimeSeries(items, 14, new Date(NOW), 28);
    assert.strictEqual(series.reduce((s, x) => s + x.complaints, 0), 0);
  });

  test('Nạp file: khóa chống trùng phân biệt hai khách cùng câu, nạp lại cùng dòng thì trùng', () => {
    const { dedupKey } = require('../services/ingest');
    const d = (o) => ({ source: 'Khác', productName: 'X', author: 'Nguyễn V. A.', timestamp: new Date(Date.UTC(2026, 0, 1)), originalText: 'hàng tốt', collectedVia: 'import', ...o });
    assert.notStrictEqual(dedupKey(d({ customerId: 'c1' })), dedupKey(d({ customerId: 'c2' })));
    assert.notStrictEqual(dedupKey(d({ importRef: 'f#1' })), dedupKey(d({ importRef: 'f#2' })));
    assert.strictEqual(dedupKey(d({ importRef: 'f#1' })), dedupKey(d({ importRef: 'f#1' })));
    // nguồn khác (thu thập sàn) giữ nguyên khóa cũ
    const old = { source: 'Tiki', productName: 'X', author: 'A', timestamp: new Date(Date.UTC(2026, 0, 1)), originalText: 'ok' };
    assert.strictEqual(dedupKey(old), dedupKey({ ...old, customerId: 'zz' }));
  });
}

// ------------------------------------------------------------------
// Kiểm thử 14/11: giới hạn tần suất, khoảng ngày đảo ngược
// ------------------------------------------------------------------
{
  test('Giới hạn tần suất: quá số lượt trả 429 kèm số giây chờ, IP khác không bị ảnh hưởng', () => {
    const { rateLimit } = require('../services/rate_limit');
    const mw = rateLimit({ max: 2, windowMs: 60000, name: 'thử' });
    const call = (ip) => { let code = 200; let body = null; const headers = {}; mw({ ip }, { set: (k, v) => { headers[k] = v; }, status: (c) => { code = c; return { json: (b) => { body = b; } }; } }, () => {}); return { code, body, headers }; };
    assert.strictEqual(call('1.1.1.1').code, 200);
    assert.strictEqual(call('1.1.1.1').code, 200);
    const third = call('1.1.1.1');
    assert.strictEqual(third.code, 429);
    assert.ok(Number(third.headers['Retry-After']) > 0);
    assert.strictEqual(call('2.2.2.2').code, 200);
  });

  test('Khoảng ngày chọn ngược được đổi chỗ, không ra 0 phản hồi', () => {
    const { timeBounds } = require('../services/analysis_context');
    const a = timeBounds('Custom:2026-01-01:2026-01-31');
    const b = timeBounds('Custom:2026-01-31:2026-01-01');
    assert.deepStrictEqual(b, a);
  });

  test('Khóa ghi: không đặt WRITE_KEY thì không khóa; đặt rồi thì lệnh ghi thiếu hoặc sai mã trả 401', () => {
    const { writeGuard } = require('../services/api_access');
    const run = (env, method, path, key) => {
      let code = 200;
      const req = { method, path, get: (h) => (h === 'X-Write-Key' ? key : undefined) };
      writeGuard(env)(req, { status: (c) => { code = c; return { json: () => {} }; } }, () => {});
      return code;
    };
    assert.strictEqual(run({}, 'POST', '/api/cases', undefined), 200);
    const env = { WRITE_KEY: 'ma-thu-123' };
    assert.strictEqual(run(env, 'GET', '/api/stats', undefined), 200);
    assert.strictEqual(run(env, 'POST', '/api/cases', undefined), 401);
    assert.strictEqual(run(env, 'DELETE', '/api/live/sessions/abc', 'sai'), 401);
    assert.strictEqual(run(env, 'PATCH', '/api/cases/abc', 'ma-thu-123'), 200);
    // Webhook bình luận live có khóa nhập riêng của phiên
    assert.strictEqual(run(env, 'POST', '/api/live/sessions/abc/comments', undefined), 200);
    assert.strictEqual(run(env, 'POST', '/api/live/sessions/abc/comments/x/label', undefined), 401);
  });

  test('CORS: chỉ trang Vercel của nhóm, localhost và origin thêm qua CORS_ORIGINS', () => {
    const { corsOptions } = require('../services/api_access');
    const ok = (origin, env = {}) => { let r; corsOptions(env).origin(origin, (_e, v) => { r = v; }); return r; };
    assert.strictEqual(ok('https://aisc-2026.vercel.app'), true);
    assert.strictEqual(ok('http://localhost:5199'), true);
    assert.strictEqual(ok('http://127.0.0.1:5173'), true);
    assert.strictEqual(ok(undefined), true);
    assert.strictEqual(ok('https://aisc-2026-evil.vercel.app'), false);
    assert.strictEqual(ok('http://localhost.evil.com'), false);
    assert.strictEqual(ok('https://ban-nhom.example', { CORS_ORIGINS: 'https://ban-nhom.example/' }), true);
  });

  test('Khóa ghi miễn cho đăng ký, đăng nhập, đăng xuất; sửa hồ sơ vẫn cần mã', () => {
    const { writeGuard } = require('../services/api_access');
    const env = { WRITE_KEY: 'ma-thu-123' };
    const run = (method, path) => {
      let code = 200;
      writeGuard(env)({ method, path, get: () => undefined }, { status: (c) => { code = c; return { json: () => {} }; } }, () => {});
      return code;
    };
    assert.strictEqual(run('POST', '/api/auth/login'), 200);
    assert.strictEqual(run('POST', '/api/auth/signup'), 200);
    assert.strictEqual(run('POST', '/api/auth/logout'), 200);
    assert.strictEqual(run('PATCH', '/api/auth/me'), 401);
    assert.strictEqual(run('POST', '/api/auth/login/x'), 401);
  });

  test('Tài khoản: kiểm tra đăng ký nói đúng ô sai, chuẩn hóa email và tên', () => {
    const auth = require('../services/auth');
    const bad = auth.validateSignup({ name: ' a ', email: 'khong-phai-email', password: 'ngan1' });
    assert.ok(bad.errors.name && bad.errors.email && bad.errors.password);
    assert.ok(auth.validateSignup({ name: 'An', email: 'a@b.vn', password: 'chiconchu' }).errors.password.includes('chữ và số'));
    assert.ok(auth.validateSignup({ name: 'An', email: 'a@b.vn', password: '12345678' }).errors.password.includes('chữ và số'));
    const ok = auth.validateSignup({ name: '  Nguyễn   Văn\tA ', shop: ' Shop  X ', email: ' Ten@CuaHang.VN ', password: 'matkhau2026', acceptTerms: true });
    assert.deepStrictEqual(ok.value, { name: 'Nguyễn Văn A', shop: 'Shop X', email: 'ten@cuahang.vn', password: 'matkhau2026', acceptTerms: true });
    // Chưa đồng ý điều khoản và chính sách dữ liệu thì không tạo được tài khoản (Nghị định 13/2023)
    assert.ok(auth.validateSignup({ name: 'An', email: 'a@b.vn', password: 'matkhau2026' }).errors.acceptTerms);
    // Mật khẩu chữ có dấu vẫn tính là chữ
    assert.deepStrictEqual(auth.passwordProblems('mậtkhẩu99'), []);
  });

  test('Tài khoản: thông tin gửi về trình duyệt không bao giờ có mật khẩu băm', () => {
    const auth = require('../services/auth');
    const u = auth.publicUser({ _id: 'x1', email: 'a@b.vn', name: 'An', shop: '', passwordHash: 'scrypt$...', createdAt: new Date(0) });
    assert.ok(!('passwordHash' in u));
    assert.strictEqual(u.isDemo, false);
    assert.strictEqual(auth.publicUser({ _id: 'x2', email: auth.DEMO_ACCOUNT.email, name: 'M' }).isDemo, true);
  });

  test('Tài khoản: đọc token Bearer, từ chối chuỗi lạ', () => {
    const auth = require('../services/auth');
    const req = (h) => ({ get: () => h });
    assert.strictEqual(auth.bearerToken(req('Bearer abcdefghijklmnopqrstuvwxyz_-0123')), 'abcdefghijklmnopqrstuvwxyz_-0123');
    assert.strictEqual(auth.bearerToken(req('Bearer ngan')), null);
    assert.strictEqual(auth.bearerToken(req('Basic abcdefghijklmnopqrstuvwxyz')), null);
    assert.strictEqual(auth.bearerToken(req(undefined)), null);
    assert.notStrictEqual(auth.hashToken('a'), 'a');
  });
}

test('API dữ liệu cần đăng nhập: chỉ đăng nhập, sổ tổng hợp và webhook live là công khai', () => {
  const auth = require('../services/auth');
  assert.strictEqual(auth.isPublicApi('POST', '/api/auth/login'), true);
  assert.strictEqual(auth.isPublicApi('GET', '/api/auth/me'), true, 'router tài khoản tự kiểm phiên');
  assert.strictEqual(auth.isPublicApi('GET', '/api/trust/health'), true);
  assert.strictEqual(auth.isPublicApi('POST', '/api/live/sessions/abc/comments'), true);
  assert.strictEqual(auth.isPublicApi('OPTIONS', '/api/stats'), true);
  for (const [m, p] of [['GET', '/api/stats'], ['GET', '/api/feedbacks'], ['GET', '/api/trust/healthx'], ['GET', '/api/live/sessions/abc/comments'], ['POST', '/api/trust/health'], ['GET', '/api/authx']]) {
    assert.strictEqual(auth.isPublicApi(m, p), false, `${m} ${p} phải cần đăng nhập`);
  }
});

test('Token qua ?access_token= chỉ nhận ở luồng live và xuất file (GET)', () => {
  const auth = require('../services/auth');
  const tok = 'abcdefghijklmnopqrstuvwxyz_-0123';
  const req = (method, q) => ({ method, query: { access_token: q }, get: () => undefined });
  assert.strictEqual(auth.requestToken(req('GET', tok), '/api/live/sessions/x1/stream'), tok);
  assert.strictEqual(auth.requestToken(req('GET', tok), '/api/live/sessions/x1/export'), tok);
  assert.strictEqual(auth.requestToken(req('GET', tok), '/api/stats'), null);
  assert.strictEqual(auth.requestToken(req('POST', tok), '/api/live/sessions/x1/export'), null);
  assert.strictEqual(auth.requestToken(req('GET', 'ngan'), '/api/live/sessions/x1/stream'), null);
});

testAsync('Chặn API dữ liệu: không phiên trả 401 auth_required; có phiên thì qua và ghi đúng tên người làm', async () => {
  const auth = require('../services/auth');
  const { ObjectId } = require('mongodb');
  const token = 'tokenthunghiem_abcdefghijklmnop123';
  const uid = new ObjectId();
  const fakeDb = {
    collection: (name) => ({
      findOne: async (q) => {
        if (name === 'auth_sessions') return q.tokenHash === auth.hashToken(token) ? { userId: uid, expiresAt: new Date(Date.now() + 6e4) } : null;
        return { _id: uid, email: 'a@b.vn', name: 'Chủ Shop Thật' };
      }
    })
  };
  const run = async (method, url, { bearer, body, env = {} } = {}) => {
    let code = 200;
    let payload = null;
    let passed = false;
    const req = { method, originalUrl: url, query: {}, body, get: (h) => (h === 'Authorization' && bearer ? `Bearer ${bearer}` : undefined) };
    const res = { status: (c) => { code = c; return { json: (p) => { payload = p; } }; } };
    await auth.requireSession(fakeDb, env)(req, res, () => { passed = true; });
    return { code: passed ? 200 : code, payload, req };
  };
  const none = await run('GET', '/api/stats');
  assert.strictEqual(none.code, 401);
  assert.strictEqual(none.payload.code, 'auth_required');
  assert.strictEqual((await run('GET', '/api/stats', { bearer: 'saisaisaisaisaisaisaisai' })).code, 401);
  const ok = await run('POST', '/api/recommendations/decision', { bearer: token, body: { by: 'Tên tự khai', decision: 'accepted' } });
  assert.strictEqual(ok.code, 200);
  assert.strictEqual(ok.req.body.by, 'Chủ Shop Thật', 'nhật ký ghi tên tài khoản, không tin tên trình duyệt gửi');
  assert.strictEqual((await run('GET', '/api/trust/health')).code, 200);
  assert.strictEqual((await run('GET', '/api/stats', { env: { AUTH_REQUIRED: '0' } })).code, 200);
});

testAsync('Tài khoản: băm mật khẩu scrypt có muối riêng, đúng thì qua, sai thì không', async () => {
  const auth = require('../services/auth');
  const h1 = await auth.hashPassword('matkhau2026');
  const h2 = await auth.hashPassword('matkhau2026');
  assert.notStrictEqual(h1, h2, 'cùng mật khẩu phải ra chuỗi băm khác nhau (muối riêng)');
  assert.ok(h1.startsWith('scrypt$') && !h1.includes('matkhau2026'));
  assert.strictEqual(await auth.verifyPassword('matkhau2026', h1), true);
  assert.strictEqual(await auth.verifyPassword('matkhau2027', h1), false);
  assert.strictEqual(await auth.verifyPassword('matkhau2026', 'hong'), false);
});

// ------------------------------------------------------------------
// Quản gia (services/butler): văn bản, lệnh, sự cố
// ------------------------------------------------------------------
{
  const butlerText = require('../services/butler/text');
  const { parseCommand } = require('../services/butler/commands');
  const incidents = require('../services/butler/incidents');

  test('Quản gia: parseCommand phân loại đúng bảng hơn 40 câu lệnh và câu hỏi', () => {
    // 23:00 giờ Việt Nam (16:00 UTC) -> còn 8 giờ (480 phút) tới 7 giờ sáng
    const now23VN = new Date('2026-11-16T16:00:00.000Z');
    const cases = [
      ['?', { type: 'help' }],
      ['giúp', { type: 'help' }],
      ['  TRO GIUP! ', { type: 'help' }],
      ['hướng dẫn', { type: 'help' }],
      ['lệnh', { type: 'help' }],
      ['help', { type: 'help' }],
      ['/help', { type: 'help' }],
      ['việc', { type: 'tasks' }],
      ['Việc hôm nay.', { type: 'tasks' }],
      ['co viec gi?', { type: 'tasks' }],
      ['cần làm gì', { type: 'tasks' }],
      ['/viec', { type: 'tasks' }],
      ['ds', { type: 'tasks' }],
      ['xem 2', { type: 'detail', n: 2 }],
      ['Chi tiết 15', { type: 'detail', n: 15 }],
      ['ke hoach 1', { type: 'detail', n: 1 }],
      ['xem số 4', { type: 'detail', n: 4 }],
      ['2', { type: 'detail', n: 2 }],
      ['99', { type: 'detail', n: 99 }],
      ['Duyệt 2', { type: 'accept', n: 2 }],
      ['duyet 2', { type: 'accept', n: 2 }],
      ['  OK 2 ', { type: 'accept', n: 2 }],
      ['chấp nhận 5', { type: 'accept', n: 5 }],
      ['dong y 3', { type: 'accept', n: 3 }],
      ['chap nhan so 2', { type: 'accept', n: 2 }],
      ['bỏ qua 3 vì hàng đã về', { type: 'dismiss', n: 3, reason: 'hàng đã về' }],
      ['bo qua 2 vi da xu ly', { type: 'dismiss', n: 2, reason: 'da xu ly' }],
      ['bỏ 2 do hàng đã hết', { type: 'dismiss', n: 2, reason: 'hàng đã hết' }],
      ['bỏ qua 2: không đúng', { type: 'dismiss', n: 2, reason: 'không đúng' }],
      ['bo qua 3', { type: 'dismiss', n: 3, reason: null }],
      ['có', { type: 'confirm' }],
      ['ok', { type: 'confirm' }],
      ['đồng ý', { type: 'confirm' }],
      ['xac nhan', { type: 'confirm' }],
      ['yes', { type: 'confirm' }],
      ['uh', { type: 'confirm' }],
      ['Thôi', { type: 'cancel' }],
      ['không', { type: 'cancel' }],
      ['hủy', { type: 'cancel' }],
      ['no', { type: 'cancel' }],
      ['tình hình', { type: 'status' }],
      ['tóm tắt', { type: 'status' }],
      ['bản tin', { type: 'status' }],
      ['thế nào rồi?', { type: 'status' }],
      ['thu thập', { type: 'collect' }],
      ['lấy dữ liệu mới', { type: 'collect' }],
      ['im', { type: 'mute', minutes: 120 }],
      ['tạm im', { type: 'mute', minutes: 120 }],
      ['im 3h', { type: 'mute', minutes: 180 }],
      ['im 2 giờ', { type: 'mute', minutes: 120 }],
      ['im 30 phút', { type: 'mute', minutes: 30 }],
      ['im đến sáng', { type: 'mute', minutes: 480 }],
      ['bật báo', { type: 'unmute' }],
      ['hết im', { type: 'unmute' }],
      ['kho thật', { type: 'workspace', workspace: 'real' }],
      ['dữ liệu thật', { type: 'workspace', workspace: 'real' }],
      ['kho mô phỏng', { type: 'workspace', workspace: 'demo' }],
      ['kho demo', { type: 'workspace', workspace: 'demo' }],
      ['live', { type: 'live' }],
      ['phiên live', { type: 'live' }],
      ['123456', { type: 'link_code', code: '123456' }],
      ['123 456', { type: 'link_code', code: '123456' }],
      ['kết nối 654321', { type: 'link_code', code: '654321' }],
      ['ma 111 222', { type: 'link_code', code: '111222' }],
      ['hủy kết nối', { type: 'unlink' }],
      ['ngat zalo', { type: 'unlink' }],
      ['1234567', { type: 'question', text: '1234567' }],
      ['việc hôm nay khách chê gì nhiều nhất', { type: 'question', text: 'việc hôm nay khách chê gì nhiều nhất' }],
      ['sản phẩm nào bị phàn nàn giao chậm tuần này?', { type: 'question', text: 'sản phẩm nào bị phàn nàn giao chậm tuần này?' }]
    ];
    assert.ok(cases.length >= 40, 'bảng test phải có ít nhất 40 câu');
    for (const [input, expected] of cases) {
      const actual = parseCommand(input, now23VN);
      assert.deepStrictEqual(actual, expected, `Sai ở câu: "${input}"`);
    }
  });

  test('Quản gia: inQuiet kiểm đúng khung giờ yên lặng trong ngày và qua nửa đêm', () => {
    assert.strictEqual(butlerText.inQuiet(23, 22, 7), true);
    assert.strictEqual(butlerText.inQuiet(7, 22, 7), false);
    assert.strictEqual(butlerText.inQuiet(6, 22, 7), true);
    assert.strictEqual(butlerText.inQuiet(12, 9, 17), true);
    assert.strictEqual(butlerText.inQuiet(17, 9, 17), false);
    assert.strictEqual(butlerText.inQuiet(5, 5, 5), false);
  });

  test('Quản gia: chunk cắt chuỗi 4500 ký tự nhiều dòng và dòng 3000 ký tự không khoảng trắng', () => {
    const lines = [];
    while (lines.join('\n').length < 4500) {
      lines.push(`Dòng kiểm thử số ${lines.length + 1}: khách phản hồi giao hàng chậm ở khu vực nội thành.`);
    }
    const text4500 = lines.join('\n').slice(0, 4500);
    const parts = butlerText.chunk(text4500, 2000);
    assert.strictEqual(parts.length, 3);
    assert.ok(parts.every((p) => p.length > 0 && p.length <= 2000));
    assert.strictEqual(parts.join('').replace(/\s+/g, ''), text4500.replace(/\s+/g, ''));

    const noSpace3000 = 'a'.repeat(3000);
    const hardParts = butlerText.chunk(noSpace3000, 2000);
    assert.strictEqual(hardParts.length, 2);
    assert.strictEqual(hardParts[0].length, 2000);
    assert.strictEqual(hardParts[1].length, 1000);
    assert.strictEqual(hardParts.join(''), noSpace3000);
  });

  test('Quản gia: plain làm sạch markdown, trích dẫn và giữ gạch đầu dòng', () => {
    assert.strictEqual(butlerText.plain('**Cảnh báo** [1] _mới_'), 'Cảnh báo mới');
    const md = '## Tiêu đề\n\n* Mục `một` [2]\n- Mục __hai__\n\n\n\nKết luận.';
    assert.strictEqual(butlerText.plain(md), 'Tiêu đề\n\n- Mục một\n- Mục hai\n\nKết luận.');
  });

  test('Quản gia: shouldNotify kiểm đúng mức độ, giờ yên lặng, tạm im và leo thang mức độ', () => {
    // 14:00 giờ Việt Nam (07:00 UTC): ngoài giờ yên lặng 22..7
    const dayTime = new Date('2026-11-16T07:00:00.000Z');
    // 23:00 giờ Việt Nam (16:00 UTC): trong giờ yên lặng 22..7
    const quietTime = new Date('2026-11-16T16:00:00.000Z');
    const baseLink = (overrides = {}) => ({
      userId: 'u1',
      chatId: 'chat1',
      settings: { notifyLevel: 'high', quietFrom: 22, quietTo: 7, muteUntil: null, ...(overrides.settings || {}) },
      ...overrides
    });

    // Không có chatId -> false
    assert.strictEqual(incidents.shouldNotify({ severity: 'critical', notified: [] }, baseLink({ chatId: null }), dayTime), false);

    // Đang tạm im -> false kể cả critical
    const muted = baseLink({ settings: { muteUntil: new Date(dayTime.getTime() + 60000) } });
    assert.strictEqual(incidents.shouldNotify({ severity: 'critical', notified: [] }, muted, dayTime), false);

    // Ngưỡng notifyLevel: critical / high / all
    const critLink = baseLink({ settings: { notifyLevel: 'critical' } });
    assert.strictEqual(incidents.shouldNotify({ severity: 'critical', notified: [] }, critLink, dayTime), true);
    assert.strictEqual(incidents.shouldNotify({ severity: 'high', notified: [] }, critLink, dayTime), false);

    const highLink = baseLink({ settings: { notifyLevel: 'high' } });
    assert.strictEqual(incidents.shouldNotify({ severity: 'critical', notified: [] }, highLink, dayTime), true);
    assert.strictEqual(incidents.shouldNotify({ severity: 'high', notified: [] }, highLink, dayTime), true);
    assert.strictEqual(incidents.shouldNotify({ severity: 'medium', notified: [] }, highLink, dayTime), false);

    const allLink = baseLink({ settings: { notifyLevel: 'all' } });
    assert.strictEqual(incidents.shouldNotify({ severity: 'medium', notified: [] }, allLink, dayTime), true);

    // Giờ yên lặng: chỉ critical qua được
    assert.strictEqual(incidents.shouldNotify({ severity: 'high', notified: [] }, allLink, quietTime), false);
    assert.strictEqual(incidents.shouldNotify({ severity: 'critical', notified: [] }, allLink, quietTime), true);

    // Đã báo cùng mức -> false; leo thang từ high lên critical -> true
    const incSame = { severity: 'high', notified: [{ userId: 'u1', severity: 'high', at: dayTime }] };
    assert.strictEqual(incidents.shouldNotify(incSame, highLink, dayTime), false);
    const incEscalated = { severity: 'critical', notified: [{ userId: 'u1', severity: 'high', at: dayTime }] };
    assert.strictEqual(incidents.shouldNotify(incEscalated, highLink, dayTime), true);
  });

  test('Quản gia: buildAlertMessage định dạng 1 việc, 3 việc, 8 việc đúng luật chữ', () => {
    const mk = (i, sev = 'high') => ({
      severity: sev,
      title: `Sự cố số ${i}`,
      why: `Lý do chi tiết của sự cố ${i}.`,
      to: '/risk'
    });
    const m1 = incidents.buildAlertMessage([mk(1, 'critical')], { workspaceLabel: 'Dữ liệu thật', appUrl: 'https://aisc-2026.vercel.app' });
    assert.ok(m1.includes('[Nghiêm trọng] Sự cố số 1'));
    assert.ok(m1.includes('Nhắn "xem 1" để xem kế hoạch, "duyệt 1" để chấp nhận.'));
    assert.ok(m1.includes('https://aisc-2026.vercel.app/risk'));

    const m3 = incidents.buildAlertMessage([mk(1, 'critical'), mk(2, 'high'), mk(3, 'medium')], { workspaceLabel: 'Dữ liệu thật', appUrl: 'https://aisc-2026.vercel.app' });
    assert.ok(m3.includes('có 3 việc mới.'));
    assert.ok(m3.includes('1. [Nghiêm trọng] Sự cố số 1'));
    assert.ok(m3.includes('3. [Chú ý] Sự cố số 3'));
    assert.ok(!m3.includes('Còn '));

    const m8 = incidents.buildAlertMessage(Array.from({ length: 8 }, (_, i) => mk(i + 1)), { workspaceLabel: 'Mô phỏng', appUrl: 'https://aisc-2026.vercel.app' });
    assert.ok(m8.includes('có 8 việc mới.'));
    assert.ok(m8.includes('6. [Cao] Sự cố số 6'));
    assert.ok(!m8.includes('7. '));
    assert.ok(m8.includes('Còn 2 việc nữa, nhắn "việc" để xem.'));

    for (const msg of [m1, m3, m8]) {
      assert.ok(!/[\u00b7\u2192]|undefined|NaN/.test(msg), `Tin nhắn chứa chuỗi cấm: ${msg}`);
    }
  });

  test('Quản gia: buildDigest bỏ dòng thiếu số liệu, không in undefined hay NaN', () => {
    const now = new Date('2026-11-17T01:00:00.000Z'); // 08:00 ngày 17/11 giờ VN
    const full = incidents.buildDigest({
      workspaceLabel: 'Dữ liệu thật',
      ctxSummary: { counted: 4557, health: 82, freshAt: new Date(now.getTime() - 2 * 3600 * 1000) },
      incidents: [{ severity: 'critical' }, { severity: 'critical' }, { severity: 'high' }, { severity: 'medium' }],
      now
    });
    assert.ok(full.includes('Bản tin sáng 17/11, kho Dữ liệu thật.'));
    assert.ok(full.includes('Phản hồi được tính: 4.557. Độ tin số liệu: 82/100.'));
    assert.ok(full.includes('Việc đang chờ: 2 nghiêm trọng, 1 cao, 1 chú ý.'));
    assert.ok(full.includes('Dữ liệu mới nhất: 2 giờ trước.'));
    assert.ok(!/undefined|NaN/.test(full));

    const sparse = incidents.buildDigest({
      workspaceLabel: 'Dữ liệu thật',
      ctxSummary: {},
      incidents: undefined,
      now
    });
    assert.ok(!sparse.includes('Phản hồi được tính'));
    assert.ok(!sparse.includes('Việc đang chờ'));
    assert.ok(!sparse.includes('Dữ liệu mới nhất'));
    assert.ok(!/undefined|NaN/.test(sparse));
  });

  const zalo = require('../services/butler/zalo');

  test('Quản gia: normalizeUpdate xử lý đúng các dạng gói tin Zalo, bỏ tin thiếu trường và tin từ bot', () => {
    const wrapped = zalo.normalizeUpdate({
      ok: true,
      result: {
        event_name: 'message.text.received',
        message: {
          message_id: 'm1',
          date: 1763280000000,
          message_type: 'text',
          text: 'việc hôm nay',
          from: { id: 'u1', display_name: 'Chủ Shop A', is_bot: false },
          chat: { id: 'c1', chat_type: 'PRIVATE' }
        }
      }
    });
    assert.strictEqual(wrapped.length, 1);
    assert.strictEqual(wrapped[0].messageId, 'm1');
    assert.strictEqual(wrapped[0].chatId, 'c1');
    assert.strictEqual(wrapped[0].fromName, 'Chủ Shop A');
    assert.strictEqual(wrapped[0].text, 'việc hôm nay');
    assert.strictEqual(wrapped[0].kind, 'text');
    assert.ok(wrapped[0].at instanceof Date);

    const flatSticker = zalo.normalizeUpdate({
      event_name: 'message.sticker.received',
      message: {
        message_id: 'm2',
        date: 1763280000000,
        from: { id: 'u1', display_name: 'Chủ Shop A' },
        chat: { id: 'c1' }
      }
    });
    assert.strictEqual(flatSticker.length, 1);
    assert.strictEqual(flatSticker[0].kind, 'other');
    assert.strictEqual(flatSticker[0].text, '');

    const arrMixed = zalo.normalizeUpdate([
      null,
      { message: { message_id: 'm3', chat: {} } },
      { message: { chat: { id: 'c1' } } },
      { message: { message_id: 'm4', chat: { id: 'c1' }, from: { is_bot: true }, text: 'tự nhắn' } },
      { event_name: 'message.text.received', message: { message_id: 'm5', chat: { id: 'c2' }, from: { display_name: 'B' }, text: 'ok' } }
    ]);
    assert.strictEqual(arrMixed.length, 1);
    assert.strictEqual(arrMixed[0].messageId, 'm5');
    assert.strictEqual(arrMixed[0].chatId, 'c2');
    assert.deepStrictEqual(zalo.normalizeUpdate(null), []);
  });

  test('Quản gia: verifySecret so khớp thời gian hằng số và từ chối khi chưa cấu hình secret', () => {
    assert.strictEqual(zalo.verifySecret('secret-12345678', 'secret-12345678'), true);
    assert.strictEqual(zalo.verifySecret('secret-12345679', 'secret-12345678'), false);
    assert.strictEqual(zalo.verifySecret('ngan', 'secret-12345678'), false);
    assert.strictEqual(zalo.verifySecret(undefined, 'secret-12345678'), false);
    assert.strictEqual(zalo.verifySecret('', 'secret-12345678'), false);
    assert.strictEqual(zalo.verifySecret('secret-12345678', ''), false);
  });

  testAsync('Quản gia: lỗi Zalo không bao giờ lộ mã bot và ngắt mạch sau 5 lỗi liên tiếp', async () => {
    zalo.resetCircuit();
    const fakeAxiosFail = async () => {
      const err = new Error('Request failed for https://bot-api.zaloplatforms.com/bot123:SECRET_TOKEN_XYZ/sendMessage');
      err.code = 'ECONNREFUSED';
      err.config = { url: 'https://bot-api.zaloplatforms.com/bot123:SECRET_TOKEN_XYZ/sendMessage' };
      throw err;
    };

    for (let i = 0; i < 5; i += 1) {
      let caught = null;
      try {
        await zalo.call('sendMessage', { chat_id: '1', text: 'hi' }, { post: fakeAxiosFail });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, 'phải ném lỗi');
      assert.ok(!String(caught).includes('SECRET'), 'String(err) không được chứa SECRET');
      assert.ok(!caught.message.includes('SECRET'), 'err.message không được chứa SECRET');
    }

    // Lần thứ 6: mạch đã mở, từ chối ngay với circuit_open
    let circuitErr = null;
    try {
      await zalo.call('sendMessage', { chat_id: '1', text: 'hi' }, { post: fakeAxiosFail });
    } catch (e) {
      circuitErr = e;
    }
    assert.ok(circuitErr && circuitErr.code === 'circuit_open', 'sau 5 lỗi liên tiếp phải mở mạch circuit_open');
    assert.strictEqual(zalo.health().circuit, 'open');
    zalo.resetCircuit();
    assert.strictEqual(zalo.health().circuit, 'closed');
  });

  test('Quản gia: isPublicApi và writeGuard miễn đường webhook Zalo nhưng bảo vệ /api/butler/command', () => {
    const auth = require('../services/auth');
    const { writeGuard } = require('../services/api_access');

    assert.strictEqual(auth.isPublicApi('POST', '/api/butler/zalo/webhook'), true);
    assert.strictEqual(auth.isPublicApi('POST', '/api/butler/zalo/webhook/'), true);
    assert.strictEqual(auth.isPublicApi('GET', '/api/butler/zalo/webhook'), false);
    assert.strictEqual(auth.isPublicApi('POST', '/api/butler/command'), false);
    assert.strictEqual(auth.isPublicApi('GET', '/api/butler/status'), false);

    const env = { WRITE_KEY: 'ma-ghi-thu-nghiem' };
    const runGuard = (method, path, key) => {
      let code = 200;
      const req = { method, path, get: (h) => (h === 'X-Write-Key' ? key : undefined) };
      writeGuard(env)(req, { status: (c) => { code = c; return { json: () => {} }; } }, () => {});
      return code;
    };
    assert.strictEqual(runGuard('POST', '/api/butler/zalo/webhook', undefined), 200);
    assert.strictEqual(runGuard('POST', '/api/butler/command', undefined), 401);
    assert.strictEqual(runGuard('POST', '/api/butler/command', 'ma-ghi-thu-nghiem'), 200);
  });

  test('Quản gia: sự cố đã báo, hết rồi mở lại cùng mức thì được báo lại', () => {
    const watcher = require('../services/butler/watcher');
    const dayTime = new Date('2026-11-16T03:00:00Z');
    const link = {
      userId: 'u1',
      chatId: 'c1',
      settings: { notifyLevel: 'high', quietFrom: 22, quietTo: 7, muteUntil: null }
    };

    // 1. Sự cố mở lần đầu và đã báo ở mức high -> không báo lặp
    let incident = {
      _id: 'demo|alert|1',
      severity: 'high',
      resolvedAt: null,
      notified: [{ userId: 'u1', severity: 'high', at: dayTime }]
    };
    assert.strictEqual(incidents.shouldNotify(incident, link, dayTime), false);

    // 2. Sự cố hết -> watcher.resolveUpdate đặt resolvedAt và xóa notified: []
    const patch = watcher.resolveUpdate(new Date('2026-11-17T03:00:00Z'));
    incident = {
      ...incident,
      ...patch.$set,
      cycle: (incident.cycle || 0) + (patch.$inc?.cycle || 0)
    };
    assert.ok(incident.resolvedAt instanceof Date);
    assert.deepStrictEqual(incident.notified, []);
    assert.strictEqual(incident.cycle, 1);

    // 3. Vài ngày sau sự cố xuất hiện lại cùng mức high -> được báo lại
    incident = {
      ...incident,
      resolvedAt: null,
      lastSeenAt: new Date('2026-11-19T03:00:00Z')
    };
    assert.strictEqual(incidents.shouldNotify(incident, link, new Date('2026-11-19T03:00:00Z')), true);
  });

  testAsync('Quản gia: sendText lưu sentParts khi đoạn sau lỗi và thử lại chỉ gửi đoạn chưa gửi; stripTitlePrefix bỏ lặp tiêu đề', async () => {
    zalo.resetCircuit();
    const sentTexts = [];
    let callCount = 0;
    const fakePost = async (_url, body) => {
      callCount += 1;
      if (callCount === 2) {
        return { status: 500, data: { ok: false, error_code: 500, description: 'lỗi tạm' } };
      }
      sentTexts.push(body.text);
      return { status: 200, data: { ok: true, result: { message_id: `m_${callCount}` } } };
    };

    const longMsg = `${'Đoạn một '.repeat(180)}\n${'Đoạn hai '.repeat(180)}`;
    let err1 = null;
    try {
      await zalo.sendText('chat_1', longMsg, { post: fakePost });
    } catch (e) {
      err1 = e;
    }
    assert.ok(err1, 'lần gửi đầu phải lỗi ở đoạn 2');
    assert.strictEqual(err1.sentParts, 1, 'đoạn 1 đã gửi thành công nên sentParts = 1');
    assert.strictEqual(sentTexts.length, 1);

    // Thử lại từ sentParts = 1: chỉ gửi đoạn 2, không gửi lặp đoạn 1
    const lastId = await zalo.sendText('chat_1', longMsg, { fromPart: err1.sentParts, post: fakePost });
    assert.strictEqual(lastId, 'm_3');
    assert.strictEqual(sentTexts.length, 2, 'tổng số đoạn gửi thành công phải đúng bằng 2');
    assert.ok(sentTexts[0].startsWith('Đoạn một'));
    assert.ok(sentTexts[1].startsWith('Đoạn hai'));
    zalo.resetCircuit();

    const title = 'Thanh toán: lỗi cổng thanh toán trên Tai nghe Bluetooth SoundCore Q30';
    const rawWhy = 'Thanh toán: lỗi cổng thanh toán trên Tai nghe Bluetooth SoundCore Q30 tăng từ 3,1% lên 14,2% so với 28 ngày trước đó.';
    assert.strictEqual(
      butlerText.stripTitlePrefix(title, rawWhy),
      'Tăng từ 3,1% lên 14,2% so với 28 ngày trước đó.'
    );
  });

  test('Quản gia (14.6.1): validateSchedulePayload kiểm đúng tên, nền tảng, __proto__, simulator kho thật, khoảng ngày, thời lượng, nhắc trước', () => {
    const { validateSchedulePayload } = require('../routes/live_schedule');
    const now = new Date('2026-11-16T12:00:00Z');
    const validStart = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const badCases = [
      [{ title: '   ', platform: 'tiktok', target: '@shop', startAt: validStart }, 'real', 'thiếu tên'],
      [{ title: 'Live tối', platform: 'unknown_plat', target: '@shop', startAt: validStart }, 'real', 'nền tảng lạ'],
      [{ title: 'Live tối', platform: '__proto__', target: '@shop', startAt: validStart }, 'real', '__proto__ làm nền tảng'],
      [{ title: 'Live tối', platform: 'toString', target: '@shop', startAt: validStart }, 'real', 'toString làm nền tảng'],
      [{ title: 'Live thử', platform: 'simulator', startAt: validStart }, 'real', 'simulator ở kho real'],
      [{ title: 'Live tối', platform: 'tiktok', target: '', startAt: validStart }, 'real', 'tiktok thiếu target'],
      [{ title: 'Live tối', platform: 'tiktok', target: '@shop', startAt: new Date(now.getTime() + 91 * 86400000).toISOString() }, 'real', 'startAt quá 90 ngày'],
      [{ title: 'Live tối', platform: 'tiktok', target: '@shop', startAt: new Date(now.getTime() - 10 * 60000).toISOString() }, 'real', 'startAt quá khứ hơn 5 phút'],
      [{ title: 'Live tối', platform: 'tiktok', target: '@shop', startAt: validStart, durationMin: 5 }, 'real', 'durationMin: 5'],
      [{ title: 'Live tối', platform: 'tiktok', target: '@shop', startAt: validStart, remindBeforeMin: 45 }, 'real', 'remindBeforeMin: 45']
    ];

    for (const [payload, ws, label] of badCases) {
      let threw = false;
      try {
        validateSchedulePayload(payload, { workspace: ws, now });
      } catch (e) {
        threw = true;
        assert.strictEqual(e.status, 400, `${label} phải có status 400`);
      }
      assert.ok(threw, `${label} phải bị từ chối`);
    }

    const okReal = validateSchedulePayload(
      {
        title: '  Sale cuối tháng  ',
        platform: 'tiktok',
        target: ' @shop_chinh_hang ',
        startAt: validStart,
        durationMin: 120,
        remindBeforeMin: 30,
        note: ' Chuẩn bị mã giảm giá '
      },
      { workspace: 'real', now }
    );
    assert.strictEqual(okReal.title, 'Sale cuối tháng');
    assert.strictEqual(okReal.platform, 'tiktok');
    assert.strictEqual(okReal.target, '@shop_chinh_hang');
    assert.strictEqual(okReal.durationMin, 120);
    assert.strictEqual(okReal.remindBeforeMin, 30);
    assert.strictEqual(okReal.note, 'Chuẩn bị mã giảm giá');

    const okSim = validateSchedulePayload(
      { title: 'Thử megalive', platform: 'simulator', startAt: validStart, remindBeforeMin: 0 },
      { workspace: 'demo', now }
    );
    assert.strictEqual(okSim.platform, 'simulator');
    assert.strictEqual(okSim.remindBeforeMin, 0);
  });

  test('Quản gia (14.6.2 & 14.6.3): dueReminders và lateSchedules kiểm đúng mốc giờ nhắc trước và quá giờ', () => {
    const liveWatch = require('../services/butler/live_watch');
    const s2000 = {
      _id: 'sched_1',
      title: 'Sale cuối tháng',
      platform: 'tiktok',
      target: '@tenshop',
      startAt: new Date('2026-11-16T13:00:00Z'), // 20:00 giờ Việt Nam
      remindBeforeMin: 30,
      status: 'scheduled',
      sessionId: null
    };
    const sNoRemind = {
      ...s2000,
      _id: 'sched_2',
      remindBeforeMin: 0
    };

    assert.strictEqual(liveWatch.dueReminders([s2000], new Date('2026-11-16T12:29:00Z')).length, 0, '19:29 chưa nhắc');
    assert.strictEqual(liveWatch.dueReminders([s2000], new Date('2026-11-16T12:30:00Z')).length, 1, '19:30 nhắc');
    assert.strictEqual(liveWatch.dueReminders([s2000], new Date('2026-11-16T12:59:00Z')).length, 1, '19:59 nhắc');
    assert.strictEqual(liveWatch.dueReminders([s2000], new Date('2026-11-16T13:00:00Z')).length, 0, '20:00 không nhắc');
    assert.strictEqual(liveWatch.dueReminders([sNoRemind], new Date('2026-11-16T12:45:00Z')).length, 0, 'remindBeforeMin: 0 không bao giờ nhắc');

    // lateSchedules: quá 10 phút (20:10), chưa có phiên thì có
    assert.strictEqual(liveWatch.lateSchedules([s2000], [], new Date('2026-11-16T13:10:00Z')).length, 1, '20:10 chưa có phiên thì nhắc trễ');
    // có phiên tạo lúc 19:55 (12:55 UTC) thì không
    assert.strictEqual(
      liveWatch.lateSchedules([s2000], [{ createdAt: new Date('2026-11-16T12:55:00Z') }], new Date('2026-11-16T13:15:00Z')).length,
      0,
      'có phiên mở lúc 19:55 thì không nhắc trễ'
    );
    // quá 30 phút (20:30) thì không
    assert.strictEqual(liveWatch.lateSchedules([s2000], [], new Date('2026-11-16T13:30:00Z')).length, 0, 'quá 30 phút không nhắc trễ');
  });

  test('Quản gia (14.6.4 & 14.6.5): _id sự cố live khớp vòng canh 5 phút và shouldNotify hỗ trợ ignoreQuiet', () => {
    const liveWatch = require('../services/butler/live_watch');
    const ws = 'demo';
    const sessionId = '6738a1b2c3d4e5f601234567';
    const fakeAction = { id: 'soldout_demand:sp-1', severity: 'high', title: 'Hết hàng Nồi chiên' };

    // Vòng canh 5 phút: buildInboxItems tạo id = `live|${s._id}|${a.id}`, collectIncidents tạo key = `inbox|${item.id}`, watcher tạo _id = `${ws}|${item.key}`
    const inboxItemId = `live|${sessionId}|${fakeAction.id}`;
    const watcherIncidentKey = `inbox|${inboxItemId}`;
    const watcherDocId = `${ws}|${watcherIncidentKey}`;

    const liveWatchDocId = liveWatch.liveIncidentId(ws, sessionId, fakeAction.id);
    assert.strictEqual(liveWatchDocId, watcherDocId, '_id sự cố của vòng canh live phải trùng khít với vòng canh 5 phút');

    // Lúc 23:00 giờ Việt Nam (16:00 UTC), việc mức high
    const night23VN = new Date('2026-11-16T16:00:00Z');
    const link = {
      userId: 'u1',
      chatId: 'c1',
      settings: { notifyLevel: 'high', quietFrom: 22, quietTo: 7, muteUntil: null }
    };
    const highInc = { _id: liveWatchDocId, severity: 'high', notified: [] };

    assert.strictEqual(incidents.shouldNotify(highInc, link, night23VN), false, 'không có ignoreQuiet thì giờ yên lặng chặn mức high');
    assert.strictEqual(incidents.shouldNotify(highInc, link, night23VN, { ignoreQuiet: true }), true, 'có ignoreQuiet: true thì báo ngay lúc 23:00');
  });

  test('Quản gia (14.6.6): buildLiveReportText định dạng đúng mẫu, bỏ dòng thiếu doanh thu và không chứa ký tự cấm', () => {
    const liveWatch = require('../services/butler/live_watch');
    const session = {
      _id: '6738a1b2c3d4e5f601234567',
      title: 'Megalive 11.11',
      platform: 'tiktok'
    };
    const fullReport = {
      totals: {
        comments: 3412,
        byIntent: { order: 286, complaint: 17 },
        orderQuantity: 412
      },
      revenue: {
        estimated: 48200000,
        lostTotal: 6200000
      },
      response: {
        answeredShare: 0.82
      },
      complaints: {
        total: 17,
        pushed: 0
      },
      products: [
        { id: 'p1', name: 'Tai nghe SoundCore Q30', quantity: 96 },
        { id: 'p2', name: 'Nồi chiên 5.5L', quantity: 40 }
      ]
    };

    const text = liveWatch.buildLiveReportText(session, fullReport, {
      appUrl: 'https://aisc-2026.vercel.app',
      durationMs: 135 * 60000
    });
    const expected = [
      'Phiên "Megalive 11.11" đã kết thúc sau 2 giờ 15 phút.',
      'Bình luận: 3.412. Lượt chốt: 286 (412 sản phẩm).',
      'Doanh thu ước tính: 48,2 triệu đồng. Lỡ vì hết hàng: 6,2 triệu đồng.',
      'Khách hỏi được trả lời: 82%. Khiếu nại: 17, đã đưa vào hệ thống 0.',
      'Chốt nhiều nhất: Tai nghe SoundCore Q30 (96 sản phẩm).',
      'Báo cáo đầy đủ: https://aisc-2026.vercel.app/live?session=6738a1b2c3d4e5f601234567'
    ].join('\n');
    assert.strictEqual(text, expected);

    const noRevReport = {
      ...fullReport,
      revenue: { estimated: null, lostTotal: null }
    };
    const textNoRev = liveWatch.buildLiveReportText(session, noRevReport, {
      appUrl: 'https://aisc-2026.vercel.app',
      durationMs: null
    });
    assert.ok(textNoRev.startsWith('Phiên "Megalive 11.11" đã kết thúc.\n'));
    assert.ok(!textNoRev.includes('Doanh thu ước tính'));
    assert.ok(!/undefined|NaN|chưa rõ|·|→/.test(textNoRev));
  });

  testAsync('Quản gia (14.6.8 & 14.6.9): updateSettings kiểm kiểu live boolean và outbox giới hạn 20 tin live/giờ nhưng không chặn alert', async () => {
    const store = require('../services/butler/store');
    const outbox = require('../services/butler/outbox');
    const { ObjectId } = require('mongodb');

    let badErr = null;
    try {
      store.validateSettingsPatch({ live: 'yes' });
    } catch (e) {
      badErr = e;
    }
    assert.ok(badErr && badErr.status === 400, 'live: "yes" phải trả lỗi 400');

    const okPatch = store.validateSettingsPatch({ live: false });
    assert.strictEqual(okPatch['settings.live'], false);

    // Giả lập authDb trong bộ nhớ cho outbox.enqueue
    const prevToken = process.env.ZALO_BOT_TOKEN;
    process.env.ZALO_BOT_TOKEN = '123456:testtokenabcdef';
    try {
      const docs = [];
      const fakeAuthDb = {
        collection: (name) => {
          if (name !== 'butler_outbox') throw new Error('unexpected collection ' + name);
          return {
            countDocuments: async (filter) =>
              docs.filter(
                (d) =>
                  String(d.userId) === String(filter.userId) &&
                  d.kind === filter.kind &&
                  filter.status.$in.includes(d.status) &&
                  d.createdAt >= filter.createdAt.$gte
              ).length,
            insertOne: async (doc) => {
              if (docs.some((d) => d.dedupKey === doc.dedupKey)) {
                const dup = new Error('duplicate');
                dup.code = 11000;
                throw dup;
              }
              const _id = new ObjectId();
              docs.push({ ...doc, _id });
              return { insertedId: _id };
            },
            updateMany: async () => ({}),
            findOneAndUpdate: async () => null
          };
        }
      };

      const uid = new ObjectId();
      for (let i = 1; i <= 20; i += 1) {
        const r = await outbox.enqueue(fakeAuthDb, {
          dedupKey: `live_test_${i}`,
          userId: uid,
          chatId: 'chat_1',
          kind: 'live',
          text: `Tin live ${i}`
        });
        assert.strictEqual(r.status, 'queued');
      }

      // Tin live thứ 21 trong 1 giờ bị skipped
      const r21 = await outbox.enqueue(fakeAuthDb, {
        dedupKey: 'live_test_21',
        userId: uid,
        chatId: 'chat_1',
        kind: 'live',
        text: 'Tin live 21'
      });
      assert.strictEqual(r21.status, 'skipped');
      assert.strictEqual(docs[20].lastError, 'Quá 20 tin live trong một giờ');

      // Tin kind: 'alert' không bị ảnh hưởng bởi giới hạn của live
      const rAlert = await outbox.enqueue(fakeAuthDb, {
        dedupKey: 'alert_test_1',
        userId: uid,
        chatId: 'chat_1',
        kind: 'alert',
        text: 'Tin cảnh báo 1'
      });
      assert.strictEqual(rAlert.status, 'queued');
    } finally {
      if (prevToken === undefined) delete process.env.ZALO_BOT_TOKEN;
      else process.env.ZALO_BOT_TOKEN = prevToken;
    }
  });

  test('Quản gia (14.6.7): parseCommand phân biệt lệnh lịch và live; buildDigest thêm lịch live hôm nay', () => {
    const commands = require('../services/butler/commands');
    assert.deepStrictEqual(commands.parseCommand('lịch'), { type: 'schedule' });
    assert.deepStrictEqual(commands.parseCommand('lich'), { type: 'schedule' });
    assert.deepStrictEqual(commands.parseCommand('Lịch live'), { type: 'schedule' });
    assert.deepStrictEqual(commands.parseCommand('lịch livestream.'), { type: 'schedule' });
    assert.deepStrictEqual(commands.parseCommand('live'), { type: 'live' });
    assert.deepStrictEqual(commands.parseCommand('livestream'), { type: 'live' });

    const now = new Date('2026-11-16T01:00:00Z'); // 08:00 ngày 16/11 giờ Việt Nam
    const digest = incidents.buildDigest({
      workspaceLabel: 'Dữ liệu thật',
      ctxSummary: { counted: 1200, health: 88 },
      incidents: [],
      todaySchedules: [
        {
          title: 'Sale cuối tháng',
          platform: 'tiktok',
          startAt: new Date('2026-11-16T13:00:00Z'), // 20:00 ngày 16/11 giờ Việt Nam
          status: 'scheduled'
        }
      ],
      now
    });
    assert.ok(
      digest.includes('Lịch live hôm nay: 20:00 "Sale cuối tháng" trên TikTok.'),
      'bản tin sáng phải có dòng Lịch live hôm nay'
    );
  });
}

testAsync('Livestream: Atlas lỗi giữa phiên thì giữ bình luận để ghi lại, không mất cái nào; lượt ghi chồng nhau gộp làm một', async () => {
  const { Runtime } = require('../services/live/hub');
  const stored = new Map();
  let failNext = 1;
  let calls = 0;
  const fakeDb = {
    collection: () => ({
      insertMany: async (docs) => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 15));
        if (failNext > 0) { failNext -= 1; throw new Error('mất kết nối Atlas'); }
        for (const d of docs) {
          const k = String(d._id);
          if (stored.has(k)) { const e = new Error('trùng'); e.code = 11000; throw e; }
          stored.set(k, d);
        }
      },
      updateOne: async () => ({})
    })
  };
  const r = new Runtime({ _id: 'sess1', platform: 'manual', products: [] }, fakeDb, 'demo');
  try {
    for (let i = 0; i < 30; i += 1) r.ingest({ type: 'comment', platformMsgId: `m${i}`, author: { handle: `k${i}` }, text: `còn size M không ${i}`, ts: new Date() });
    await assert.rejects(r.flush(), /mất kết nối/);
    assert.strictEqual(r.pending.length, 30, 'lô ghi lỗi phải quay lại hàng chờ');
    assert.strictEqual(r.healthInfo().writeFailures, 1);
    // Nhiều lời gọi cùng lúc: một lượt đang chạy + đúng một lượt nối tiếp
    calls = 0;
    const p1 = r.flush();
    for (let i = 30; i < 40; i += 1) r.ingest({ type: 'comment', platformMsgId: `m${i}`, author: { handle: `k${i}` }, text: `chốt 1 cái ${i}`, ts: new Date() });
    const waiters = Array.from({ length: 20 }, () => r.flush());
    await Promise.all([p1, ...waiters]);
    assert.strictEqual(stored.size, 40, `kho phải có đủ 40, có ${stored.size}`);
    assert.ok(calls <= 2, `20 lời gọi chồng nhau chỉ được 2 lượt ghi, đã ghi ${calls} lượt`);
    assert.strictEqual(r.healthInfo().writeFailures, 0, 'ghi lại được thì xóa trạng thái lỗi');
    assert.strictEqual(r.pending.length, 0);
  } finally {
    clearInterval(r.flushTimer); clearInterval(r.statsTimer); clearInterval(r.heartbeat); clearInterval(r.pushTimer);
  }
});

testAsync('Livestream: kết nối TikTok treo im lặng quá 3 phút thì tự nối lại và ghi nhận để báo', async () => {
  const { Runtime } = require('../services/live/hub');
  const fakeDb = { collection: () => ({ insertMany: async () => {}, updateOne: async () => ({}) }) };
  const r = new Runtime({ _id: 'st1', platform: 'tiktok', target: 'shop', products: [] }, fakeDb, 'demo');
  let starts = 0;
  let stops = 0;
  r.connectorFor = () => ({ start: async (emit) => { starts += 1; emit({ type: 'connected', info: null }); }, stop: () => { stops += 1; } });
  try {
    await r.start();
    assert.strictEqual(r.status, 'live');
    const t = Date.now();
    assert.strictEqual(r.checkStall(t + 60 * 1000), false, 'mới im 1 phút thì chưa nối lại');
    assert.strictEqual(r.checkStall(t + 4 * 60 * 1000), true, 'im quá 3 phút thì nối lại');
    await new Promise((res) => setTimeout(res, 20));
    assert.strictEqual(stops, 1);
    assert.strictEqual(starts, 2);
    assert.strictEqual(r.status, 'live', 'nối lại xong thì về live');
    assert.strictEqual(r.healthInfo().reconnects, 1);
    // Phiên nhập tay (webhook) im lặng là bình thường, không đụng tới
    const m = new Runtime({ _id: 'st2', platform: 'manual', products: [] }, fakeDb, 'demo');
    await m.start();
    assert.strictEqual(m.checkStall(Date.now() + 60 * 60 * 1000), false);
    [m.flushTimer, m.statsTimer, m.heartbeat, m.pushTimer].forEach(clearInterval);
  } finally {
    [r.flushTimer, r.statsTimer, r.heartbeat, r.pushTimer].forEach(clearInterval);
  }
});

testAsync('Livestream: mở phiên gặp lỗi máy ký TikTok 500 thì tự thử lại; sai tên báo lỗi ngay; bị tạm chặn thì không nối thêm', async () => {
  const hub = require('../services/live/hub');
  const { db } = fakeLiveDb(() => []);
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 15000 ? 0 : ms, ...a);
  try {
    // 23/11: phòng vangyasuoo hỏng lúc mở vì Euler Stream trả 500
    const r = new hub.Runtime({ _id: 'tr1', platform: 'tiktok', target: 'shop', products: [] }, db, 'real');
    let n = 0;
    r.connectorFor = () => ({ start: async (emit) => { n += 1; if (n === 1) throw new Error('Máy chủ ký kết nối TikTok đang lỗi tạm thời (mã 500)'); emit({ type: 'connected', info: null }); }, stop: () => {} });
    await r.start();
    assert.strictEqual(n, 2, 'thử lại một lần thì được');
    assert.strictEqual(r.status, 'live');
    r.dispose();
    // Mất DNS lúc mở phiên (đo thật 23/11 bằng chặn DNS máy ký): cũng là lỗi tạm
    const d = new hub.Runtime({ _id: 'tr4', platform: 'youtube', target: 'abcdefghijk', products: [] }, db, 'real');
    let dn = 0;
    d.connectorFor = () => ({ start: async (emit) => { dn += 1; if (dn === 1) throw new Error('getaddrinfo ENOTFOUND www.youtube.com'); emit({ type: 'connected', info: null }); }, stop: () => {} });
    await d.start();
    assert.strictEqual(d.status, 'live', 'mất DNS thoáng qua thì nối lại được');
    d.dispose();
    const w = new hub.Runtime({ _id: 'tr2', platform: 'tiktok', target: 'sai-ten', products: [] }, db, 'real');
    let m = 0;
    w.connectorFor = () => ({ start: async () => { m += 1; throw new Error('Không tìm thấy tài khoản TikTok này'); }, stop: () => {} });
    await w.start();
    assert.strictEqual(m, 1, 'sai tên: không thử lại');
    assert.strictEqual(w.status, 'error');
    const b = new hub.Runtime({ _id: 'tr3', platform: 'tiktok', target: 'shop', products: [] }, db, 'real');
    let k = 0;
    b.connectorFor = () => ({ start: async () => { k += 1; throw new Error('TikTok đang tạm chặn máy chủ này vì kết nối quá nhiều lần'); }, stop: () => {} });
    await b.reopen(0);
    assert.strictEqual(k, 1, 'bị tạm chặn: không nối thêm kẻo bị chặn lâu hơn');
    assert.strictEqual(b.status, 'error');
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

testAsync('Livestream: nối lại sau khi treo mà lỗi thoáng qua thì thử lại; chủ kênh tắt live thì kết thúc phiên, không báo lỗi', async () => {
  const hub = require('../services/live/hub');
  const { db } = fakeLiveDb(() => []);
  const r = new hub.Runtime({ _id: 'ro1', platform: 'tiktok', target: 'shop', products: [] }, db, 'real');
  const results = ['Không kết nối được TikTok: socket hang up', 'Không kết nối được TikTok: 502', 'ok'];
  let starts = 0;
  r.connectorFor = () => ({ start: async (emit) => { const x = results[starts++]; if (x !== 'ok') throw new Error(x); emit({ type: 'connected', info: null }); }, stop: () => {} });
  const waits = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => { if (ms >= 15000) { waits.push(ms); return realSetTimeout(fn, 0, ...a); } return realSetTimeout(fn, ms, ...a); };
  try {
    await r.reopen(0);
  } finally {
    global.setTimeout = realSetTimeout;
  }
  try {
    assert.strictEqual(starts, 3, 'thử 3 lần: 2 lần lỗi, lần 3 được');
    assert.deepStrictEqual(waits, [15000, 30000], 'chờ giãn dần giữa các lần');
    assert.strictEqual(r.status, 'live');
    assert.strictEqual(r.health.reconnects, 2);
  } finally {
    r.dispose();
  }
  const e = new hub.Runtime({ _id: 'ro2', platform: 'tiktok', target: 'shop', products: [] }, db, 'real');
  let tries = 0;
  e.connectorFor = () => ({ start: async () => { tries += 1; throw new Error('Tài khoản này đang không phát live'); }, stop: () => {} });
  await e.reopen(0);
  assert.strictEqual(tries, 1, 'chủ kênh đã tắt live thì không thử lại');
  assert.strictEqual(e.status, 'ended');
  e.dispose();
});

// ==================================================================
// QUẢN TRỊ MÁY CHỦ: VAI TRÒ, ĐĂNG NHẬP QUẢN TRỊ, ENSURE ADMIN
// ==================================================================
test('Quản trị: publicUser có role (mặc định user), status, mustChangePassword và không có passwordHash', () => {
  const auth = require('../services/auth');
  const legacy = { _id: 'u1', email: 'a@shop.vn', name: 'Lan', passwordHash: 'scrypt$secret' };
  const pubLegacy = auth.publicUser(legacy);
  assert.strictEqual(pubLegacy.role, 'user');
  assert.strictEqual(pubLegacy.status, 'active');
  assert.strictEqual(pubLegacy.mustChangePassword, false);
  assert.strictEqual('passwordHash' in pubLegacy, false);

  const adm = {
    _id: 'u2',
    email: 'admin@shop.vn',
    name: 'Quản trị',
    role: 'admin',
    status: 'locked',
    mustChangePassword: true,
    passwordHash: 'scrypt$secret2'
  };
  const pubAdm = auth.publicUser(adm);
  assert.strictEqual(pubAdm.role, 'admin');
  assert.strictEqual(pubAdm.status, 'locked');
  assert.strictEqual(pubAdm.mustChangePassword, true);
  assert.strictEqual('passwordHash' in pubAdm, false);
});

test('Bảng giá: publicUser chỉ trả gói giữ chỗ hợp lệ (shop, live), còn lại là null', () => {
  const auth = require('../services/auth');
  assert.deepStrictEqual(auth.PLAN_IDS, ['shop', 'live']);
  assert.strictEqual(auth.publicUser({ _id: 'p1', email: 'a@b.vn', planWanted: 'live', planWantedAt: new Date(0) }).planWanted, 'live');
  assert.strictEqual(auth.publicUser({ _id: 'p2', email: 'a@b.vn', planWanted: 'vip' }).planWanted, null);
  assert.strictEqual(auth.publicUser({ _id: 'p3', email: 'a@b.vn', planWanted: 'try' }).planWanted, null);
  assert.strictEqual(auth.publicUser({ _id: 'p4', email: 'a@b.vn' }).planWanted, null);
});

test('Quản trị: requireAdmin chặn không phiên (401), người thường (403), cho admin qua kể cả khi AUTH_REQUIRED=0', () => {
  const auth = require('../services/auth');
  const prevAuthReq = process.env.AUTH_REQUIRED;
  process.env.AUTH_REQUIRED = '0';
  try {
    const run = (user) => {
      let status = 200;
      let body = null;
      let nextCalled = false;
      const req = user ? { user } : {};
      const res = {
        status(code) {
          status = code;
          return {
            json(obj) {
              body = obj;
              return this;
            }
          };
        }
      };
      auth.requireAdmin(req, res, () => {
        nextCalled = true;
      });
      return { status, body, nextCalled };
    };

    const rNoUser = run(null);
    assert.strictEqual(rNoUser.status, 401);
    assert.strictEqual(rNoUser.body.code, 'auth_required');
    assert.strictEqual(rNoUser.nextCalled, false);

    const rUser = run({ _id: 'u1', role: 'user', status: 'active' });
    assert.strictEqual(rUser.status, 403);
    assert.strictEqual(rUser.body.code, 'admin_required');
    assert.strictEqual(rUser.nextCalled, false);

    const rLockedAdmin = run({ _id: 'u2', role: 'admin', status: 'locked' });
    assert.strictEqual(rLockedAdmin.status, 401);
    assert.strictEqual(rLockedAdmin.nextCalled, false);

    const rAdmin = run({ _id: 'u3', role: 'admin', status: 'active' });
    assert.strictEqual(rAdmin.nextCalled, true);
  } finally {
    if (prevAuthReq === undefined) delete process.env.AUTH_REQUIRED;
    else process.env.AUTH_REQUIRED = prevAuthReq;
  }
});

testAsync('Quản trị: ensureAdminAccount thiếu biến trả null, mật khẩu 9 ký tự bị từ chối, hợp lệ thì tạo mới', async () => {
  const auth = require('../services/auth');
  const docs = [];
  const fakeAuthDb = {
    collection: () => ({
      findOne: async (q) => docs.find((d) => d.email === q.email) || null,
      updateOne: async (q, u, opts) => {
        const idx = docs.findIndex((d) => (q.email ? d.email === q.email : d._id === q._id));
        if (idx >= 0) {
          if (u.$set) docs[idx] = { ...docs[idx], ...u.$set };
        } else if (opts && opts.upsert && u.$setOnInsert) {
          docs.push({ _id: `id_${docs.length + 1}`, ...u.$setOnInsert });
        }
        return { acknowledged: true };
      },
      deleteMany: async () => ({ deletedCount: 0 })
    })
  };

  assert.strictEqual(await auth.ensureAdminAccount(fakeAuthDb, {}), null, 'thiếu biến phải trả null');
  assert.strictEqual(
    await auth.ensureAdminAccount(fakeAuthDb, { ADMIN_EMAIL: 'adm@customerradar.local', ADMIN_PASSWORD: 'Abcdef123' }),
    null,
    'mật khẩu 9 ký tự phải bị từ chối'
  );
  assert.strictEqual(
    await auth.ensureAdminAccount(fakeAuthDb, { ADMIN_EMAIL: auth.DEMO_ACCOUNT.email, ADMIN_PASSWORD: 'MatKhauAdmin2026' }),
    null,
    'email tài khoản mẫu phải bị từ chối'
  );

  const created = await auth.ensureAdminAccount(fakeAuthDb, {
    ADMIN_EMAIL: 'admin.test@customerradar.local',
    ADMIN_PASSWORD: 'MatKhauAdmin2026'
  });
  assert.ok(created && created.created === true && created.email === 'admin.test@customerradar.local');
  assert.strictEqual(docs.length, 1);
  assert.strictEqual(docs[0].role, 'admin');
  assert.strictEqual(docs[0].status, 'active');
  assert.ok(await auth.verifyPassword('MatKhauAdmin2026', docs[0].passwordHash));
});

testAsync('Mật khẩu tạm: chưa đổi thì máy chủ chặn API dữ liệu (403), /api/auth vẫn qua; thiếu một biến admin thì bỏ qua', async () => {
  const auth = require('../services/auth');
  const { ObjectId } = require('mongodb');
  const token = 'tokenmatkhautam_abcdefghijklmnop123';
  const uid = new ObjectId();
  const fakeDb = {
    collection: (name) => ({
      findOne: async (q) => {
        if (name === 'auth_sessions') return q.tokenHash === auth.hashToken(token) ? { userId: uid, tokenHash: q.tokenHash, expiresAt: new Date(Date.now() + 6e4) } : null;
        return { _id: uid, email: 'tam@shop.vn', name: 'Người Dùng Tạm', mustChangePassword: true };
      }
    })
  };
  const run = async (method, url) => {
    let code = 200;
    let payload = null;
    let passed = false;
    const req = { method, originalUrl: url, query: {}, get: (h) => (h === 'Authorization' ? `Bearer ${token}` : undefined) };
    const res = { status: (c) => { code = c; return { json: (p) => { payload = p; } }; } };
    await auth.requireSession(fakeDb, {})(req, res, () => { passed = true; });
    return { code: passed ? 200 : code, payload };
  };
  const blocked = await run('GET', '/api/stats');
  assert.strictEqual(blocked.code, 403);
  assert.strictEqual(blocked.payload.code, 'password_change_required');
  assert.strictEqual((await run('GET', '/api/admin/overview')).code, 403, 'phần quản trị cũng bị chặn');
  assert.strictEqual((await run('POST', '/api/auth/password')).code, 200, 'đường đổi mật khẩu phải còn dùng được');
  assert.strictEqual(
    await auth.ensureAdminAccount({ collection: () => ({}) }, { ADMIN_EMAIL: 'adm@customerradar.local' }),
    null,
    'thiếu ADMIN_PASSWORD thì bỏ qua'
  );
});

test('Quản trị: guard chặn tự khóa, tự xóa, hạ admin cuối cùng, đổi tài khoản mẫu; cho phép thu hồi phiên tài khoản mẫu và khóa người thường', () => {
  const auth = require('../services/auth');
  const admin = require('../services/admin');
  const actor = { _id: 'adm1', email: 'adm1@shop.vn', role: 'admin', status: 'active' };
  const otherAdmin = { _id: 'adm2', email: 'adm2@shop.vn', role: 'admin', status: 'active' };
  const normal = { _id: 'usr1', email: 'lan@shop.vn', role: 'user', status: 'active' };
  const demo = { _id: 'demo1', email: auth.DEMO_ACCOUNT.email, role: 'user', status: 'active' };

  assert.ok(admin.guard(actor, actor, 'lock', { adminCount: 2 }), 'tự khóa phải bị chặn');
  assert.ok(admin.guard(actor, actor, 'delete_user', { adminCount: 2 }), 'tự xóa phải bị chặn');
  assert.ok(admin.guard(actor, actor, 'set_role', { adminCount: 2 }), 'tự đổi vai trò phải bị chặn');

  assert.ok(admin.guard(actor, otherAdmin, 'set_role', { adminCount: 1 }), 'hạ admin cuối cùng phải bị chặn');
  assert.ok(admin.guard(actor, otherAdmin, 'delete_user', { adminCount: 1 }), 'xóa admin cuối cùng phải bị chặn');
  assert.ok(admin.guard(actor, otherAdmin, 'lock', { adminCount: 1 }), 'khóa admin cuối cùng phải bị chặn');
  assert.strictEqual(admin.guard(actor, otherAdmin, 'set_role', { adminCount: 2 }), null, 'hạ admin khi còn từ 2 người trở lên được phép');

  assert.ok(admin.guard(actor, demo, 'lock', { adminCount: 2 }), 'khóa tài khoản mẫu bị chặn');
  assert.ok(admin.guard(actor, demo, 'delete_user', { adminCount: 2 }), 'xóa tài khoản mẫu bị chặn');
  assert.ok(admin.guard(actor, demo, 'reset_password', { adminCount: 2 }), 'đổi mật khẩu tài khoản mẫu bị chặn');
  assert.ok(admin.guard(actor, demo, 'set_role', { adminCount: 2 }), 'đổi vai trò tài khoản mẫu bị chặn');
  assert.strictEqual(admin.guard(actor, demo, 'revoke_sessions', { adminCount: 2 }), null, 'đăng xuất phiên tài khoản mẫu được phép');
  assert.strictEqual(admin.guard(actor, demo, 'revoke_session', { adminCount: 2 }), null, 'xóa một phiên tài khoản mẫu được phép');

  assert.strictEqual(admin.guard(actor, normal, 'lock', { adminCount: 1 }), null, 'admin khóa người thường được phép');
  assert.strictEqual(admin.guard(actor, normal, 'delete_user', { adminCount: 1 }), null, 'admin xóa người thường được phép');
});

test('Quản trị: tempPassword chạy 200 lần luôn 14 ký tự, qua passwordProblems, không có ký tự dễ nhầm và không trùng', () => {
  const auth = require('../services/auth');
  const admin = require('../services/admin');
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const pw = admin.tempPassword();
    assert.strictEqual(pw.length, 14, `lần ${i}: phải dài 14 ký tự`);
    assert.deepStrictEqual(auth.passwordProblems(pw), [], `lần ${i}: phải qua passwordProblems`);
    assert.strictEqual(/[0Oo1lI]/.test(pw), false, `lần ${i}: không được có ký tự dễ nhầm`);
    assert.strictEqual(seen.has(pw), false, `lần ${i}: không được trùng`);
    seen.add(pw);
  }
});

test('Quản trị: sessionRow ẩn tokenHash, adminUserRow ẩn passwordHash, parseListQuery chuẩn hóa và thoát regex an toàn', () => {
  const admin = require('../services/admin');
  const sRow = admin.sessionRow(
    { _id: 's1', tokenHash: 'secret-hash-xyz', kind: 'admin', ua: 'Chrome', createdAt: new Date(), expiresAt: new Date() },
    'secret-hash-xyz'
  );
  assert.strictEqual('tokenHash' in sRow, false);
  assert.strictEqual(sRow.current, true);

  const uRow = admin.adminUserRow(
    { _id: 'u1', email: 'lan@shop.vn', name: 'Lan', passwordHash: 'scrypt$secret', role: 'user', status: 'active' },
    { sessions: 2, zaloLinked: true }
  );
  assert.strictEqual('passwordHash' in uRow, false);
  assert.strictEqual(uRow.sessions, 2);
  assert.strictEqual(uRow.zaloLinked, true);

  const pq = admin.parseListQuery({ page: '-3', limit: '999', status: 'xyz', sort: 'bad', q: '.*(test)+$' });
  assert.strictEqual(pq.page, 1);
  assert.strictEqual(pq.limit, 50);
  assert.strictEqual(pq.status, 'all');
  assert.strictEqual(pq.sort, 'lastLogin');
  assert.doesNotThrow(() => new RegExp(pq.qEscaped, 'i'));
  assert.strictEqual(new RegExp(pq.qEscaped, 'i').test('.*(test)+$'), true);
  assert.strictEqual(new RegExp(pq.qEscaped, 'i').test('anything'), false);
});

test('Gói: tắt thu tiền (mặc định) thì mọi tài khoản dùng đủ tính năng, không hạn mức', () => {
  const billing = require('../services/billing');
  const saved = process.env.BILLING;
  delete process.env.BILLING;
  try {
    assert.strictEqual(billing.billingEnabled(), false);
    assert.strictEqual(billing.effectivePlan({ email: 'a@b.vn' }), 'live');
    assert.strictEqual(billing.planAllows({ email: 'a@b.vn' }, 'live'), true);
    assert.strictEqual(billing.planSummary({ email: 'a@b.vn' }).billingEnabled, false);
  } finally {
    if (saved === undefined) delete process.env.BILLING; else process.env.BILLING = saved;
  }
});

test('Gói: hết hạn về Dùng thử; tài khoản mẫu và quản trị dùng đủ; khóa tính năng theo bậc', () => {
  const billing = require('../services/billing');
  const saved = process.env.BILLING;
  process.env.BILLING = '1';
  try {
  const now = new Date('2026-11-24T00:00:00Z');
  const future = new Date('2026-12-24T00:00:00Z');
  const past = new Date('2026-11-01T00:00:00Z');
  assert.strictEqual(billing.effectivePlan({ email: 'a@b.vn', plan: 'shop', planUntil: future }, now), 'shop');
  assert.strictEqual(billing.effectivePlan({ email: 'a@b.vn', plan: 'live', planUntil: past }, now), 'try', 'hết hạn phải về Dùng thử');
  assert.strictEqual(billing.effectivePlan({ email: 'a@b.vn', plan: 'live' }, now), 'try', 'không có hạn thì không tính');
  assert.strictEqual(billing.effectivePlan({ email: 'demo@customerradar.vn' }, now), 'live');
  assert.strictEqual(billing.effectivePlan({ email: 'x@y.vn', role: 'admin' }, now), 'live');
  const shopUser = { email: 'a@b.vn', plan: 'shop', planUntil: future };
  assert.strictEqual(billing.planAllows(shopUser, 'orders_import', now), true);
  assert.strictEqual(billing.planAllows(shopUser, 'butler_commands', now), true);
  assert.strictEqual(billing.planAllows(shopUser, 'live', now), false, 'gói Shop chưa có live');
  assert.strictEqual(billing.planAllows({ email: 'a@b.vn' }, 'orders_import', now), false);
  // Đầu tháng giờ Việt Nam: 1/12 00:30 giờ VN là 30/11 17:30 UTC, vẫn thuộc tháng 12
  assert.strictEqual(billing.vnMonthStart(new Date('2026-11-30T17:30:00Z')).toISOString(), '2026-11-30T17:00:00.000Z');
  } finally {
    if (saved === undefined) delete process.env.BILLING; else process.env.BILLING = saved;
  }
});

test('Thanh toán: mã đơn, QR, đơn sai bị từ chối, gia hạn cộng dồn, webhook SePay và Casso', () => {
  const billing = require('../services/billing');
  const codes = new Set(Array.from({ length: 200 }, () => billing.newOrderCode()));
  assert.ok(codes.size > 195, 'mã đơn phải gần như không trùng');
  for (const c of codes) assert.ok(billing.CODE_RE.test(c) && !/[01OIL]/.test(c.slice(2)), c);
  assert.deepStrictEqual(billing.validateOrder({ plan: 'shop', months: 3 }).value, { plan: 'shop', months: 3, amount: 597000 });
  assert.ok(billing.validateOrder({ plan: 'try', months: 1 }).error);
  assert.ok(billing.validateOrder({ plan: 'live', months: 2 }).error);
  const pay = billing.payInfo({ code: 'CRABC234', amount: 199000 }, { PAY_BANK_BIN: '970436', PAY_ACCOUNT_NO: '0123456789', PAY_ACCOUNT_NAME: 'NGUYEN VAN A' });
  assert.ok(pay.qrUrl.startsWith('https://img.vietqr.io/image/970436-0123456789-'));
  assert.ok(pay.qrUrl.includes('amount=199000') && pay.qrUrl.includes('addInfo=CRABC234'));
  assert.strictEqual(billing.payInfo({ code: 'CRABC234', amount: 1 }, {}), null, 'chưa cấu hình tài khoản thì không bịa QR');
  const now = new Date('2026-11-24T00:00:00Z');
  const still = new Date('2026-12-04T00:00:00Z');
  assert.strictEqual(billing.extendPlan({ plan: 'shop', planUntil: still }, 'shop', 1, now).toISOString(), new Date(still.getTime() + 30 * 86400000).toISOString(), 'gia hạn cùng gói cộng vào hạn cũ');
  assert.strictEqual(billing.extendPlan({ plan: 'shop', planUntil: still }, 'live', 1, now).toISOString(), new Date(now.getTime() + 30 * 86400000).toISOString(), 'đổi gói tính từ hôm nay');
  const sepay = billing.parseBankWebhook({ id: 92704, transferType: 'in', transferAmount: 199000, content: 'MBVCB.123 CRABC234 chuyen tien' });
  assert.deepStrictEqual(sepay, [{ code: 'CRABC234', amount: 199000, ref: '92704' }]);
  assert.deepStrictEqual(billing.parseBankWebhook({ transferType: 'out', transferAmount: 5, content: 'CRABC234' }), [], 'tiền ra không tính');
  const casso = billing.parseBankWebhook({ data: [{ id: 1, amount: 499000, description: 'thanh toan CRXYZ789' }] });
  assert.deepStrictEqual(casso.map((t) => t.code), ['CRXYZ789']);
  // Ngân hàng chèn dấu cách, gạch nối vào nội dung: vẫn nhận ra mã
  assert.deepStrictEqual(billing.parseBankWebhook({ data: [{ id: 2, amount: 1, description: 'cr-xyz 789' }] }).map((t) => t.code), ['CRXYZ789']);
});

test('Tách dữ liệu từng shop: khóa kho, header không chọn được kho người khác, kho mô phỏng chỉ đọc', () => {
  const tenants = require('../services/tenants');
  const fakeDb = (name) => ({ databaseName: name, collection: () => ({ updateOne: () => Promise.resolve() }) });
  const workspaces = { demo: fakeDb('x_demo'), real: fakeDb('x_real') };
  const client = { db: (n) => fakeDb(n) };
  const authDb = { collection: () => ({ updateOne: () => Promise.resolve() }) };
  tenants.init({ client, workspaces, authDb, demoUserId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
  const shopA = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', email: 'a@shop.vn', role: 'user' };
  const shopB = { _id: 'cccccccccccccccccccccccc', email: 'b@shop.vn', role: 'user' };
  const demo = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', email: 'demo@customerradar.vn' };
  assert.strictEqual(tenants.keyFor(demo, 'real'), 'real');
  assert.strictEqual(tenants.keyFor(shopA, 'real'), 't_bbbbbbbbbbbbbbbbbbbbbbbb');
  assert.notStrictEqual(tenants.keyFor(shopA, 'real'), tenants.keyFor(shopB, 'real'));
  assert.strictEqual(tenants.dbForKey('t_bbbbbbbbbbbbbbbbbbbbbbbb').databaseName, 'cr_t_bbbbbbbbbbbbbbbbbbbbbbbb');
  assert.ok(tenants.dbNameFor('bbbbbbbbbbbbbbbbbbbbbbbb').length <= 38, 'Atlas giới hạn tên database 38 byte');
  assert.strictEqual(tenants.keyFor(shopA, 'demo'), 'demo');
  assert.strictEqual(tenants.keyFor({ ...shopB, sharedWorkspaces: true }, 'real'), 'real', 'thành viên nhóm dùng kho chung');
  assert.strictEqual(tenants.isShared(shopB._id), true, 'ghi nhớ quyền kho chung cho vòng canh');
  tenants.isShared(shopB);
  assert.strictEqual(tenants.isShared(shopB._id), false, 'bỏ quyền thì vòng canh cũng bỏ');
  const mw = tenants.middleware();
  const run = (req) => { let code = null; let body = null; let nexted = false; const res = { status: (c) => { code = c; return { json: (b) => { body = b; } }; } }; mw(req, res, () => { nexted = true; }); return { code, body, nexted, req }; };
  const base = (o) => ({ get: () => null, query: {}, ...o });
  const r1 = run(base({ user: shopA, workspace: 'real', method: 'GET', originalUrl: '/api/stats', db: workspaces.real }));
  assert.ok(r1.nexted && r1.req.db.databaseName === 'cr_t_bbbbbbbbbbbbbbbbbbbbbbbb', 'kho thật của shop là kho riêng');
  const r2 = run(base({ user: shopA, workspace: 'demo', method: 'POST', originalUrl: '/api/recommendations/decision', db: workspaces.demo }));
  assert.strictEqual(r2.code, 403, 'shop không ghi vào kho mô phỏng chung');
  const r3 = run(base({ user: shopA, workspace: 'demo', method: 'POST', originalUrl: '/api/chat', db: workspaces.demo }));
  assert.ok(r3.nexted, 'hỏi trợ lý trên kho mô phỏng vẫn được');
  const r4 = run(base({ user: demo, workspace: 'demo', method: 'POST', originalUrl: '/api/recommendations/decision', db: workspaces.demo }));
  assert.ok(r4.nexted, 'tài khoản mẫu vẫn thao tác trên kho mô phỏng');
  // Webhook live không đăng nhập: chỉ khóa kho đã có mới đổi được kho; khóa bịa giữ kho mặc định
  const hook = (key) => run(base({ workspace: 'demo', method: 'POST', originalUrl: '/api/live/sessions/aaaaaaaaaaaaaaaaaaaaaaaa/comments', db: workspaces.demo, get: (h) => (h === 'X-Workspace' ? key : null) }));
  assert.strictEqual(hook('t_bbbbbbbbbbbbbbbbbbbbbbbb').req.db.databaseName, 'cr_t_bbbbbbbbbbbbbbbbbbbbbbbb');
  assert.strictEqual(hook('t_dddddddddddddddddddddddd').req.db.databaseName, 'x_demo', 'khóa kho bịa không tạo database mới');
});

testAsync('Theo dõi kênh: kênh lên live thì tự mở phiên một lần; đang có phiên thì thôi; bị chặn thì nghỉ; kho mô phỏng bỏ qua', async () => {
  const follow = require('../services/live/follow');
  const hub = require('../services/live/hub');
  const mkCol = (docs) => ({
    docs,
    find(q) {
      const match = (d) => Object.entries(q || {}).every(([k, v]) => (v && typeof v === 'object' && v.$in ? v.$in.includes(d[k]) : d[k] === v));
      const out = docs.filter(match);
      return { limit: () => ({ toArray: async () => out }), toArray: async () => out };
    },
    async updateOne(q, u) { const d = docs.find((x) => String(x._id) === String(q._id)); if (d) Object.assign(d, u.$set || {}); return {}; },
    async insertOne(d) { const id = 'sess' + (docs.length + 1); docs.push({ ...d, _id: id }); return { insertedId: id }; },
    async createIndex() { return {}; }
  });
  const mkDb = (follows) => { const cols = { live_follow: mkCol(follows), live_sessions: mkCol([]), live_comments: mkCol([]) }; return { cols, collection: (n) => cols[n] || mkCol([]) }; };
  const shop = mkDb([{ _id: 'f1', platform: 'tiktok', target: 'bluestonevn', enabled: true, products: [{ id: 'afb-5880', name: 'Nồi chiên AFB-5880' }] }]);
  const demo = mkDb([{ _id: 'f2', platform: 'tiktok', target: 'khac', enabled: true }]);
  const started = [];
  const origStart = hub.startSession;
  const origRuntime = hub.runtimeFor;
  hub.startSession = async (db, key, s) => { started.push({ key, s }); return {}; };
  hub.runtimeFor = (id) => (started.some((x) => String(x.s._id) === String(id)) ? {} : null);
  try {
    const now = new Date('2026-11-25T13:00:00Z');
    const asked = [];
    const isLive = async (t) => { asked.push(t); return true; };
    const r1 = await follow.tick({ demo: demo, t_aaaaaaaaaaaaaaaaaaaaaaaa: shop }, { isLive, now, log: () => {} });
    assert.strictEqual(r1.length, 1, 'mở đúng một phiên');
    assert.deepStrictEqual(asked, ['bluestonevn'], 'kho mô phỏng không bị hỏi');
    assert.strictEqual(started[0].key, 't_aaaaaaaaaaaaaaaaaaaaaaaa', 'phiên gắn khóa kho riêng');
    assert.strictEqual(started[0].s.target, 'bluestonevn');
    assert.strictEqual(started[0].s.products.length, 1, 'mang theo danh mục đã lưu');
    assert.strictEqual(started[0].s.autoStarted, true);
    const r2 = await follow.tick({ t_aaaaaaaaaaaaaaaaaaaaaaaa: shop }, { isLive, now, log: () => {} });
    assert.strictEqual(r2.length, 0, 'đang có phiên chạy thì không mở thêm');
    // TikTok tạm chặn: nghỉ 60 phút, không hỏi lại trong lúc nghỉ
    const shop2 = mkDb([{ _id: 'f3', platform: 'tiktok', target: 'shopb', enabled: true }]);
    await follow.tick({ t_bbbbbbbbbbbbbbbbbbbbbbbb: shop2 }, { isLive: async () => { throw new Error('DEVICE_BLOCKED'); }, now, log: () => {} });
    const f3 = shop2.cols.live_follow.docs[0];
    assert.strictEqual(new Date(f3.backoffUntil).getTime(), now.getTime() + 3600000);
    let askedAgain = false;
    await follow.tick({ t_bbbbbbbbbbbbbbbbbbbbbbbb: shop2 }, { isLive: async () => { askedAgain = true; return true; }, now: new Date(now.getTime() + 600000), log: () => {} });
    assert.strictEqual(askedAgain, false, 'đang nghỉ thì không hỏi TikTok');
    assert.strictEqual(follow.cleanTikTok('https://www.tiktok.com/@bluestonevn/live'), 'bluestonevn');
    assert.strictEqual(follow.cleanTikTok('@a b'), null, 'tên có khoảng trắng bị từ chối');
  } finally {
    hub.startSession = origStart;
    hub.runtimeFor = origRuntime;
  }
});

// ------------------------------------------------------------------
// G0: Nguyên nhân gốc rễ cấp 3 (L3), loại hàng và chia gold theo sản phẩm
// ------------------------------------------------------------------
console.log('\nNGUYÊN NHÂN GỐC RỄ CẤP 3 (G0)');

test('G0: ROOT_PACKS.gia_dung đủ 18 khóa, mỗi khóa gắn đúng một L2 cha hợp lệ và không đổi L1/L2 cũ', () => {
  assert.strictEqual(taxonomy.CATEGORY_KEYS.length, 7);
  assert.strictEqual(taxonomy.CAUSE_COUNT, 27);
  const keys = taxonomy.rootCauseKeys('gia_dung');
  assert.strictEqual(keys.length, 18, 'gói gia_dung phải có đúng 18 khóa L3');
  for (const k of keys) {
    const info = taxonomy.rootCauseInfo(k, 'gia_dung');
    assert.ok(info && info.label && info.description, `thiếu mô tả cho ${k}`);
    assert.ok(taxonomy.TAXONOMY[info.parentCategory], `parentCategory sai cho ${k}`);
    assert.ok(taxonomy.TAXONOMY[info.parentCategory].causes[info.parentCause], `parentCause sai cho ${k}`);
  }
  assert.strictEqual(taxonomy.rootCausesFor('TechnicalDefect').length, 7);
  assert.strictEqual(taxonomy.rootCausesFor('NotAsDescribed').length, 4);
  assert.strictEqual(taxonomy.rootCausesFor('MissingAccessory').length, 3);
  assert.strictEqual(taxonomy.rootCausesFor('UnresolvedCase')[0].key, 'WARRANTY_ACTIVATION');
  assert.strictEqual(taxonomy.rootCausesFor('MisleadingPromo')[0].key, 'GIFT_NOT_DELIVERED');
  assert.strictEqual(taxonomy.rootCausesFor('DamagedInTransit')[0].key, 'TRANSIT_DENT');
});

test('G0: normalizeRootCauses làm sạch, khử trùng lặp, bỏ NONE/khóa lạ và tôn trọng strictParent', () => {
  assert.deepStrictEqual(
    taxonomy.normalizeRootCauses(['weak_heat', 'NOISE_SMELL', 'WEAK_HEAT', 'NONE', 'KHONG_TON_TAI', '']),
    ['WEAK_HEAT', 'NOISE_SMELL']
  );
  assert.deepStrictEqual(
    taxonomy.normalizeRootCauses('WARRANTY_ACTIVATION, Thiếu phiếu bảo hành'),
    ['WARRANTY_ACTIVATION', 'NO_WARRANTY_CARD']
  );
  // strictParent lọc đúng theo L2 cha
  assert.deepStrictEqual(
    taxonomy.normalizeRootCauses(['WEAK_HEAT', 'TRANSIT_DENT', 'NO_POWER'], { subCategory: 'TechnicalDefect', strictParent: true }),
    ['WEAK_HEAT', 'NO_POWER']
  );
  // Câu không phải khiếu nại luôn ra mảng rỗng
  assert.deepStrictEqual(taxonomy.normalizeRootCauses(['WEAK_HEAT'], { category: 'Other' }), []);
  assert.deepStrictEqual(taxonomy.normalizeRootCauses(['WEAK_HEAT'], { nonComplaint: true }), []);
  assert.deepStrictEqual(taxonomy.normalizeRootCauses(null), []);
});

test('G0: productTypeOf nhận đúng các dòng sản phẩm BlueStone thật và trả null với hàng ngoài từ điển', () => {
  assert.strictEqual(taxonomy.productTypeOf('Lò vi sóng điện tử có nướng BlueStone MOB-7815 20 lít'), 'Lò vi sóng');
  assert.strictEqual(taxonomy.productTypeOf('Nồi chiên không dầu BlueStone AFB-5880 5.5L'), 'Nồi chiên không dầu');
  assert.strictEqual(taxonomy.productTypeOf('Bàn ủi hơi nước đứng BlueStone GSB-3941'), 'Bàn ủi hơi nước');
  assert.strictEqual(taxonomy.productTypeOf('Máy làm sữa hạt đa năng BlueStone BLB-6035'), 'Máy làm sữa hạt');
  assert.strictEqual(taxonomy.productTypeOf('Máy xay sinh tố BlueStone BLB-5339'), 'Máy xay sinh tố');
  assert.strictEqual(taxonomy.productTypeOf('Bếp từ đơn cảm ứng BlueStone ICB-6619'), 'Bếp từ');
  assert.strictEqual(taxonomy.productTypeOf('Nồi áp suất điện tử BlueStone PCB-5629'), 'Nồi áp suất');
  assert.strictEqual(taxonomy.productTypeOf('Nồi cơm điện tử BlueStone RCB-5938'), 'Nồi cơm điện');
  assert.strictEqual(taxonomy.productTypeOf('Máy sấy tóc BlueStone HDB-1827'), 'Máy sấy tóc');
  assert.strictEqual(taxonomy.productTypeOf('Máy đánh trứng cầm tay BlueStone HMB-6333S'), 'Máy đánh trứng');
  assert.strictEqual(taxonomy.productTypeOf('Ấm đun siêu tốc BlueStone KTB-3426'), 'Ấm siêu tốc');
  // Dự phòng theo mã model BlueStone khi tên ngắn gọn
  assert.strictEqual(taxonomy.productTypeOf('BlueStone AFB-5880'), 'Nồi chiên không dầu');
  assert.strictEqual(taxonomy.productTypeOf('BlueStone MOB-7815'), 'Lò vi sóng');
  // Không thuộc gia dụng -> null (không gắn tiền tố bịa)
  assert.strictEqual(taxonomy.productTypeOf('Áo thun nam cổ tròn cotton'), null);
  assert.strictEqual(taxonomy.productTypeOf(''), null);
});

test('G0: goldSplit chia cố định theo sản phẩm (chống rò rỉ) và không đụng isBlindTest cũ', () => {
  const s1 = insights.goldSplit('Lò vi sóng BlueStone MOB-7815');
  const s2 = insights.goldSplit('  lò   vi sóng bluestone mob-7815 ');
  assert.strictEqual(s1, s2, 'cùng sản phẩm khác hoa thường/khoảng trắng phải rơi cùng một phía');
  assert.ok(['train', 'dev', 'test'].includes(s1));
  const counts = { train: 0, dev: 0, test: 0 };
  for (let i = 0; i < 400; i += 1) counts[insights.goldSplit(`BlueStone SP-${i}`)] += 1;
  assert.ok(counts.test >= 100 && counts.test <= 190, `tỉ lệ test bất thường: ${counts.test}/400`);
  assert.ok(counts.dev >= 30 && counts.dev <= 100, `tỉ lệ dev bất thường: ${counts.dev}/400`);
  // isBlindTest cũ giữ nguyên hoạt động
  assert.strictEqual(typeof insights.isBlindTest('fb-123'), 'boolean');
});

test('G0: buildFeedbackDocs và applyHumanLabels lưu/áp rootCauses & productType tương thích ngược dữ liệu cũ', () => {
  const ingest = require('../services/ingest');
  const ctxCompute = require('../services/context_compute');
  const docs = ingest.buildFeedbackDocs(
    [
      {
        source: 'Tiki',
        rawText: 'Lò vi sóng MOB-7815 đĩa không quay, nút ít nhạy',
        author: 'Nguyễn Văn An',
        timestamp: new Date('2026-11-20T00:00:00Z'),
        productName: 'Lò vi sóng BlueStone MOB-7815',
        rating: 2
      },
      {
        source: 'Tiki',
        rawText: 'Nồi chiên dùng tốt lắm',
        author: 'Trần Thị Bình',
        timestamp: new Date('2026-11-20T00:00:00Z'),
        productName: 'Nồi chiên không dầu BlueStone AFB-5880',
        rating: 5
      }
    ],
    [
      { category: 'ProductQuality', subCategory: 'TechnicalDefect', rootCauses: ['MECH_PART', 'CONTROL_FAULT', 'BAD_KEY'], sentiment: 'Negative' },
      { category: 'Other', subCategory: null, rootCauses: ['WEAK_HEAT'], sentiment: 'Positive' }
    ],
    { collectedVia: 'test' }
  );
  assert.strictEqual(docs[0].productType, 'Lò vi sóng');
  assert.deepStrictEqual(docs[0].rootCauses, ['MECH_PART', 'CONTROL_FAULT']);
  assert.strictEqual(docs[1].productType, 'Nồi chiên không dầu');
  assert.deepStrictEqual(docs[1].rootCauses, [], 'câu không phải khiếu nại phải có rootCauses rỗng');

  // Dữ liệu cũ thiếu rootCauses và productType vẫn chuẩn hóa bình thường
  const oldDoc = ctxCompute.normalizeLabels({
    _id: 'old1',
    originalText: 'quét serial báo không tìm thấy',
    productName: 'Nồi chiên không dầu BlueStone AFB-5880',
    category: 'CustomerService',
    subCategory: 'UnresolvedCase',
    sentiment: 'Negative',
    labelledBy: 'llm'
  });
  assert.strictEqual(oldDoc.productType, 'Nồi chiên không dầu');
  assert.deepStrictEqual(oldDoc.rootCauses, []);

  // Nhãn người ghi đè rootCauses và giữ nhãn máy gốc trong machineLabel
  const items = [oldDoc];
  const nApplied = ctxCompute.applyHumanLabels(items, [{
    feedbackId: 'old1',
    correctCategory: 'CustomerService',
    correctCause: 'UnresolvedCase',
    correctRootCauses: ['WARRANTY_ACTIVATION']
  }]);
  assert.strictEqual(nApplied, 1);
  assert.deepStrictEqual(items[0].rootCauses, ['WARRANTY_ACTIVATION']);
  assert.deepStrictEqual(items[0].rootCauseLabels, ['Không kích hoạt được bảo hành điện tử']);
  assert.deepStrictEqual(items[0].machineLabel.rootCauses, []);
  assert.strictEqual(items[0].labelledBy, 'human');
});

// ------------------------------------------------------------------
// G1: Công cụ gán gold (mode=gold phân tầng, xuất gold, auditSummary)
// ------------------------------------------------------------------
console.log('\nCÔNG CỤ GÁN GOLD (G1)');

test('G1: auditSample(mode=gold) ưu tiên đồ gia dụng, phân tầng theo khiếu nại/L2 và sao, không lệch CI ngẫu nhiên', () => {
  const mk = (id, name, sent, cat, sub, rating) => ({
    _id: id,
    originalText: `Đánh giá thực tế cho ${name} (${id})`,
    productName: name,
    sentiment: sent,
    category: cat,
    subCategory: sub,
    rating,
    trust: { weight: 1 }
  });
  const pool = [
    mk('b1', 'Lò vi sóng BlueStone MOB-7815', 'Negative', 'ProductQuality', 'TechnicalDefect', 1),
    mk('b2', 'Nồi chiên không dầu BlueStone AFB-5880', 'Negative', 'CustomerService', 'UnresolvedCase', 2),
    mk('b3', 'Bàn ủi hơi nước BlueStone GSB-3941', 'Negative', 'PricePromotion', 'MisleadingPromo', 2),
    mk('b4', 'Máy xay sinh tố BlueStone BLB-5339', 'Neutral', 'ProductQuality', 'MissingAccessory', 3),
    mk('b5', 'Lò vi sóng BlueStone MOB-7815', 'Positive', 'Other', null, 5),
    mk('b6', 'Nồi chiên không dầu BlueStone AFB-5880', 'Positive', 'Other', null, 5),
    mk('o1', 'Áo thun nam cotton', 'Negative', 'Delivery', 'LateDelivery', 1),
    mk('o2', 'Tai nghe bluetooth X1', 'Positive', 'Other', null, 5)
  ];
  const { items: picked, remaining } = insights.auditSample(pool, new Set(['b6']), 5, () => 0.1, 'gold');
  assert.strictEqual(remaining, 5, 'chỉ tính 5 câu gia dụng chưa gán (loại b6 đã gán và o1, o2 ngoài gia dụng)');
  assert.strictEqual(picked.length, 5);
  assert.ok(picked.every((f) => taxonomy.isApplianceProduct(f.productName)), 'hàng gold phải ưu tiên sản phẩm gia dụng');
  assert.ok(picked.some((f) => f.sentiment === 'Positive'), 'lô gold phải giữ cả câu tích cực làm đối chứng');

  // Nhãn mode=gold không được tính vào chỉ số CI ngẫu nhiên (random)
  const sum = insights.auditSummary([
    { feedbackId: 'b1', sampleMode: 'gold', sentimentCorrect: true, categoryCorrect: false, correctCategory: 'ProductQuality', correctRootCauses: ['MECH_PART'], productName: 'Lò vi sóng BlueStone MOB-7815', goldSplit: 'test' },
    { feedbackId: 'r1', sampleMode: 'random', sentimentCorrect: true, categoryCorrect: true, productName: 'SP A' }
  ]);
  assert.strictEqual(sum.n, 1, 'CI ngẫu nhiên chỉ đếm nhãn mode=random');
  assert.strictEqual(sum.gold.total, 1);
  assert.strictEqual(sum.gold.withRootCauses, 1);
  assert.strictEqual(sum.gold.bySplit.test, 1);
});

test('G1: buildGoldExport xuất đủ trường L3, productType, goldSplit và danh sách sản phẩm test', () => {
  const feedbacks = [
    { _id: 'f1', originalText: 'đĩa không quay và nút bấm liệt', rating: 1, productName: 'Lò vi sóng BlueStone MOB-7815', source: 'Tiki', sentiment: 'Negative' },
    { _id: 'f2', originalText: 'dùng ổn lắm', rating: 5, productName: 'Nồi chiên không dầu BlueStone AFB-5880', source: 'Tiki', sentiment: 'Positive' }
  ];
  const labels = [
    { feedbackId: 'f1', correctSentiment: 'Negative', correctCategory: 'ProductQuality', correctCause: 'TechnicalDefect', correctRootCauses: ['MECH_PART', 'CONTROL_FAULT'], sarcasm: false, sampleMode: 'gold', by: 'nguoi1', at: new Date('2026-11-25T00:00:00Z') },
    { feedbackId: 'f2', correctSentiment: 'Positive', correctCategory: 'Other', correctCause: null, correctRootCauses: ['WEAK_HEAT'], sarcasm: false, sampleMode: 'gold', by: 'nguoi1', at: new Date('2026-11-25T00:00:00Z') }
  ];
  const exp = insights.buildGoldExport(feedbacks, labels);
  assert.strictEqual(exp.rows.length, 2);
  assert.strictEqual(exp.rows[0].productType, 'Lò vi sóng');
  assert.deepStrictEqual(exp.rows[0].rootCauses, ['MECH_PART', 'CONTROL_FAULT']);
  assert.strictEqual(exp.rows[0].labelSource, 'human');
  assert.deepStrictEqual(exp.rows[1].rootCauses, [], 'nhãn Other không được mang L3');
  assert.strictEqual(exp.manifest.total, 2);
  assert.strictEqual(exp.manifest.rootCounts.MECH_PART, 1);
});

testAsync('G1: Route /audit/sample?mode=gold + POST /audit/label (5 câu BlueStone) lưu đủ trường trong audit_labels và xuất gold', async () => {
  const express = require('express');
  const http = require('http');
  const apiRouter = require('../routes/api');
  const prevWorker = process.env.CONTEXT_WORKER;
  process.env.CONTEXT_WORKER = '0';

  const feedbacks = [
    { _id: 'bs1', source: 'Tiki', originalText: 'Lò vi sóng MOB-7815 đĩa không quay, nút giảm rất ít nhạy', productName: 'Lò vi sóng BlueStone MOB-7815', rating: 1, category: 'ProductQuality', subCategory: 'TechnicalDefect', sentiment: 'Negative', timestamp: new Date('2026-11-20T00:00:00Z'), labelledBy: 'llm' },
    { _id: 'bs2', source: 'Tiki', originalText: 'Nồi chiên AFB-5880 quét serial không kích hoạt được bảo hành điện tử', productName: 'Nồi chiên không dầu BlueStone AFB-5880', rating: 2, category: 'CustomerService', subCategory: 'UnresolvedCase', sentiment: 'Negative', timestamp: new Date('2026-11-21T00:00:00Z'), labelledBy: 'llm' },
    { _id: 'bs3', source: 'Tiki', originalText: 'Trang treo tặng bình nước nhưng nhận nồi không có quà', productName: 'Nồi chiên không dầu BlueStone AFB-5880', rating: 2, category: 'PricePromotion', subCategory: 'MisleadingPromo', sentiment: 'Negative', timestamp: new Date('2026-11-22T00:00:00Z'), labelledBy: 'llm' },
    { _id: 'bs4', source: 'Tiki', originalText: 'Bàn ủi hơi nước GSB-3941 nhỏ giọt nước liên tục khi phun', productName: 'Bàn ủi hơi nước BlueStone GSB-3941', rating: 2, category: 'ProductQuality', subCategory: 'TechnicalDefect', sentiment: 'Negative', timestamp: new Date('2026-11-23T00:00:00Z'), labelledBy: 'llm' },
    { _id: 'bs5', source: 'Tiki', originalText: 'Nồi chạy êm, nóng nhanh, rất hài lòng', productName: 'Nồi chiên không dầu BlueStone AFB-5880', rating: 5, category: 'Other', subCategory: null, sentiment: 'Positive', timestamp: new Date('2026-11-24T00:00:00Z'), labelledBy: 'llm' }
  ];
  const store = { feedbacks, transactions: [], audit_labels: [], review_labels: [], meta: [] };
  const mkCursor = (arr) => ({
    sort() { return this; },
    limit(n) { arr = arr.slice(0, n); return this; },
    batchSize() { return this; },
    async next() { return arr[0] || null; },
    async toArray() { return arr.slice(); }
  });
  const mockDb = {
    databaseName: 'customer_radar_ui_test_g1',
    collection(name) {
      store[name] ||= [];
      return {
        async estimatedDocumentCount() { return store[name].length; },
        find() { return mkCursor(store[name]); },
        async findOne() { return null; },
        async updateOne(filter, update, opts) {
          const idx = store[name].findIndex((d) => d.feedbackId === filter.feedbackId);
          const doc = { ...(idx >= 0 ? store[name][idx] : {}), ...(update.$set || {}) };
          if (idx >= 0) store[name][idx] = doc;
          else if (opts?.upsert) store[name].push(doc);
          return { modifiedCount: idx >= 0 ? 1 : 0, upsertedCount: idx >= 0 ? 0 : 1 };
        }
      };
    }
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = mockDb; req.workspace = 'real'; next(); });
  app.use('/api', apiRouter);

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const reqJson = (method, p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  try {
    const sample = await reqJson('GET', '/api/audit/sample?n=5&mode=gold');
    assert.strictEqual(sample.status, 200);
    assert.strictEqual(sample.body.mode, 'gold');
    assert.strictEqual(sample.body.items.length, 5);
    assert.strictEqual(sample.body.rootCauses.length, 18);

    const rootsById = {
      bs1: ['MECH_PART', 'CONTROL_FAULT'],
      bs2: ['WARRANTY_ACTIVATION'],
      bs3: ['GIFT_NOT_DELIVERED'],
      bs4: ['LEAK'],
      bs5: []
    };
    for (const it of sample.body.items) {
      const res = await reqJson('POST', '/api/audit/label', {
        feedbackId: it._id,
        sentimentCorrect: true,
        categoryCorrect: true,
        correctRootCauses: rootsById[it._id],
        sarcasm: false,
        sampleMode: 'gold',
        by: 'nguoi_gan_thu'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    }

    assert.strictEqual(store.audit_labels.length, 5, 'phải lưu đủ 5 bản ghi vào audit_labels');
    for (const doc of store.audit_labels) {
      assert.strictEqual(doc.sampleMode, 'gold');
      assert.ok(Array.isArray(doc.correctRootCauses), 'thiếu correctRootCauses');
      assert.ok(['train', 'dev', 'test'].includes(doc.goldSplit), 'thiếu goldSplit');
      assert.ok(doc.productName && doc.productType, 'thiếu productName/productType');
      assert.deepStrictEqual(doc.correctRootCauses, rootsById[doc.feedbackId]);
    }

    const exported = await reqJson('GET', '/api/audit/gold-export?mode=gold');
    assert.strictEqual(exported.status, 200);
    assert.strictEqual(exported.body.rows.length, 5);
    assert.strictEqual(exported.body.manifest.rootCounts.WARRANTY_ACTIVATION, 1);
  } finally {
    server.close();
    if (prevWorker === undefined) delete process.env.CONTEXT_WORKER;
    else process.env.CONTEXT_WORKER = prevWorker;
  }
});

// ------------------------------------------------------------------
// G3 & G4: Nhãn thầy L3, tiền tố loại hàng, chống rò rỉ train/test
// ------------------------------------------------------------------
console.log('\nNHÃN THẦY L3 & XUẤT DỮ LIỆU V5 (G3/G4)');

test('G3: teacher_io chuẩn hóa L3, giữ cờ trùng 2 lượt và dựng taxonomy có gói gia_dung', () => {
  const teacherIo = require('../scripts/teacher_io');
  const tax = teacherIo.buildTeacherTaxonomy();
  assert.strictEqual(tax.categories.length, 7);
  assert.strictEqual(tax.rootPacks.gia_dung.length, 18);

  const ok = teacherIo.parseTeacherRow({
    id: 'f10',
    sentiment: 'Negative',
    issues: [{ category: 'ProductQuality', cause: 'TechnicalDefect' }],
    root_causes: ['weak_heat', 'NOISE_SMELL', 'INVALID_CODE'],
    sarcasm: false,
    agreed: true
  }, 'Qwen/Qwen3-8B');
  assert.strictEqual(ok.category, 'ProductQuality');
  assert.strictEqual(ok.subCategory, 'TechnicalDefect');
  assert.deepStrictEqual(ok.rootCauses, ['WEAK_HEAT', 'NOISE_SMELL']);
  assert.strictEqual(ok.agreed, true);

  const dis = teacherIo.parseTeacherRow({
    id: 'f11',
    sentiment: 'Positive',
    issues: [],
    root_causes: ['WEAK_HEAT'],
    agreed: false
  });
  assert.deepStrictEqual(dis.rootCauses, [], 'câu không phải khiếu nại không được giữ L3');
  assert.strictEqual(dis.agreed, false);
});

test('G4: prepareInput ghép tiền tố [N sao] [loại hàng] và bỏ tiền tố khi thiếu dữ kiện', () => {
  const vc = require('../services/visobert_client');
  assert.strictEqual(
    vc.prepareInput('đĩa không quay', 'masked', 2, 'Lò vi sóng'),
    '[2 sao] [Lò vi sóng] đĩa không quay'
  );
  assert.strictEqual(
    vc.prepareInput('đĩa không quay', 'masked', null, 'Lò vi sóng'),
    '[Lò vi sóng] đĩa không quay'
  );
  assert.strictEqual(
    vc.prepareInput('đĩa không quay', 'masked', 2, null),
    '[2 sao] đĩa không quay'
  );
  assert.strictEqual(vc.prepareInput('đĩa không quay', 'masked'), 'đĩa không quay');
});

test('G4: buildV5Dataset chống rò rỉ theo sản phẩm & Jaccard>=0.8, đúng trọng số và loại nhãn luật', () => {
  const { buildV5Dataset } = require('../scripts/export_training_data');
  // Tìm 1 tên sản phẩm rơi vào test và 1 tên rơi vào train bằng chính goldSplit
  let testProd = null;
  let trainProd = null;
  for (let i = 0; i < 100 && (!testProd || !trainProd); i += 1) {
    const name = `Nồi chiên không dầu BlueStone AFB-${5000 + i}`;
    const sp = insights.goldSplit(name);
    if (sp === 'test' && !testProd) testProd = name;
    if (sp === 'train' && !trainProd) trainProd = name;
  }
  assert.ok(testProd && trainProd);

  const pickNonBlind = (prefix) => {
    for (let i = 1; i < 100; i += 1) {
      const id = `${prefix}_${i}`;
      if (!insights.isBlindTest(id)) return id;
    }
    return prefix;
  };
  const idTeacherGood = pickNonBlind('t_good');
  const idClaudeGood = pickNonBlind('c_good');

  const docs = [
    { _id: 'h_test', originalText: 'Nồi chiên nướng khoai rất lâu không chín, nhiệt yếu quá', rating: 1, productName: testProd, labelledBy: 'claude' },
    { _id: 't_same_prod', originalText: 'Nồi bị móp vỏ do giao hàng ẩu', rating: 2, productName: testProd, labelledBy: 'llm' },
    { _id: 't_near_dup', originalText: 'Nồi chiên nướng khoai rất lâu không chín, nhiệt yếu quá trời', rating: 1, productName: trainProd, labelledBy: 'llm' },
    { _id: 't_disagree', originalText: 'Nút bấm hơi khó nhấn chút', rating: 3, productName: trainProd, labelledBy: 'llm' },
    { _id: idTeacherGood, originalText: 'Mở hộp không thấy phiếu bảo hành chính hãng đâu', rating: 2, productName: trainProd, labelledBy: 'llm' },
    { _id: idClaudeGood, originalText: 'Quét mã serial không kích hoạt được bảo hành điện tử', rating: 2, productName: trainProd, sentiment: 'Negative', category: 'CustomerService', subCategory: 'UnresolvedCase', rootCauses: ['WARRANTY_ACTIVATION'], labelledBy: 'claude' },
    { _id: 'r_rules', originalText: 'Giao hơi chậm chút', rating: 3, productName: trainProd, sentiment: 'Negative', category: 'Delivery', subCategory: 'LateDelivery', labelledBy: 'rules' }
  ];
  const human = [
    { feedbackId: 'h_test', correctSentiment: 'Negative', correctCategory: 'ProductQuality', correctCause: 'TechnicalDefect', correctRootCauses: ['WEAK_HEAT'], sarcasm: false }
  ];
  const teacher = [
    { feedbackId: 't_same_prod', sentiment: 'Negative', category: 'Delivery', subCategory: 'DamagedInTransit', rootCauses: ['TRANSIT_DENT'], agreed: true },
    { feedbackId: 't_near_dup', sentiment: 'Negative', category: 'ProductQuality', subCategory: 'TechnicalDefect', rootCauses: ['WEAK_HEAT'], agreed: true },
    { feedbackId: 't_disagree', sentiment: 'Negative', category: 'ProductQuality', subCategory: 'TechnicalDefect', rootCauses: ['CONTROL_FAULT'], agreed: false },
    { feedbackId: idTeacherGood, sentiment: 'Negative', category: 'ProductQuality', subCategory: 'MissingAccessory', rootCauses: ['NO_WARRANTY_CARD'], agreed: true }
  ];

  const ds = buildV5Dataset({ docs, human, teacher });
  assert.strictEqual(ds.test.length, 1);
  assert.strictEqual(ds.test[0].feedbackId, 'h_test');
  assert.ok(ds.testProducts.includes(testProd));

  const trainIds = ds.train.map((r) => r.feedbackId);
  assert.ok(!trainIds.includes('t_same_prod'), 'câu cùng sản phẩm test phải bị loại khỏi train');
  assert.ok(!trainIds.includes('t_near_dup'), 'câu gần trùng Jaccard >= 0.8 với gold test phải bị loại khỏi train');
  assert.ok(!trainIds.includes('t_disagree'), 'nhãn thầy bất đồng 2 lượt không được vào train');
  assert.ok(!trainIds.includes('r_rules'), 'nhãn luật không được vào train');
  assert.strictEqual(ds.counts.droppedNearDupTest, 1);
  assert.strictEqual(ds.counts.teacherSkippedDisagreed, 1);
  assert.strictEqual(ds.counts.rulesSkipped, 1);

  // Kiểm tra trọng số nguồn nhãn (teacher = 0.5, claude = 0.5) và tiền tố đầu vào
  const tRow = ds.train.find((r) => r.feedbackId === idTeacherGood);
  const cRow = ds.train.find((r) => r.feedbackId === idClaudeGood);
  assert.ok(tRow && tRow.weight === 0.5 && tRow.source === 'teacher');
  assert.ok(cRow && cRow.weight === 0.5 && cRow.source === 'claude');
  assert.ok(tRow.input.startsWith('[2 sao] [Nồi chiên không dầu] '));
});

// ------------------------------------------------------------------
// G5: Dịch vụ suy luận tắt mặc định & thứ tự ViSoBERT trước, LLM sau
// ------------------------------------------------------------------
console.log('\nTHỨ TỰ GÁN NHÃN VISOBERT TRƯỚC LLM SAU (G5)');

test('G5: Dịch vụ ViSoBERT tắt mặc định khi chưa đặt VISOBERT_URL, và nhận VISOBERT_KEY', () => {
  const vc = require('../services/visobert_client');
  const prevUrl = process.env.VISOBERT_URL;
  const prevKey = process.env.VISOBERT_KEY;
  try {
    delete process.env.VISOBERT_URL;
    assert.strictEqual(vc.config().enabled, false, 'chưa đặt VISOBERT_URL thì dịch vụ phải tắt mặc định');
    process.env.VISOBERT_URL = 'https://example.hf.space';
    process.env.VISOBERT_KEY = 'secret-test-key';
    const cfg = vc.config();
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.apiKey, 'secret-test-key');
  } finally {
    if (prevUrl === undefined) delete process.env.VISOBERT_URL; else process.env.VISOBERT_URL = prevUrl;
    if (prevKey === undefined) delete process.env.VISOBERT_KEY; else process.env.VISOBERT_KEY = prevKey;
    vc.invalidateStatus();
  }
});

testAsync('G5: analyzeFeedbackBatch giữ câu ViSoBERT tự tin và chỉ gửi câu chưa chắc sang LLM', async () => {
  const vc = require('../services/visobert_client');
  const ai = require('../services/ai_analyzer');
  const items = [
    { text: 'Lò vi sóng đĩa không quay', rating: 1, productName: 'Lò vi sóng BlueStone MOB-7815' },
    { text: 'Nồi dùng rất tốt, ưng ý', rating: 5, productName: 'Nồi chiên không dầu BlueStone AFB-5880' },
    { text: 'Cảm giác hơi lạ nhưng chưa rõ lỗi gì', rating: 3, productName: 'Nồi chiên không dầu BlueStone AFB-5880' }
  ];
  const mockPreds = [
    vc.toAnalysis({
      sentiment: 'Negative', sentimentConfidence: 0.95,
      category: 'ProductQuality', categoryConfidence: 0.94,
      cause: 'TechnicalDefect', causeConfidence: 0.91, causeUncertain: false,
      rootCauseKeys: ['MECH_PART'], rootConfidence: 0.88, rootCauses: [{ root: 'MECH_PART', p: 0.88 }]
    }),
    vc.toAnalysis({
      sentiment: 'Positive', sentimentConfidence: 0.98,
      category: null, categoryConfidence: 0.96, noneProbability: 0.96,
      cause: null, causeConfidence: null,
      rootCauseKeys: [], rootConfidence: null, rootCauses: []
    }),
    vc.toAnalysis({
      sentiment: 'Negative', sentimentConfidence: 0.58,
      category: 'ProductQuality', categoryConfidence: 0.54,
      cause: 'TechnicalDefect', causeConfidence: 0.38, causeUncertain: true,
      rootCauseKeys: [], rootConfidence: null, rootCauses: []
    })
  ];
  const llmSent = [];
  const res = await ai.analyzeFeedbackBatch(items, {
    hasLlm: true,
    predictAnalysis: async () => mockPreds,
    analyzeChunkWithLLM: async (chunk) => {
      llmSent.push(...chunk);
      return chunk.map(() => ({
        category: 'ProductQuality', subCategory: 'NotAsDescribed', rootCauses: ['USABILITY'],
        sentiment: 'Neutral', aspects: [], entities: {}, aiSummary: 'Khó dùng', labelledBy: 'llm'
      }));
    }
  });
  assert.strictEqual(llmSent.length, 1, 'chỉ được gửi duy nhất 1 câu chưa chắc sang LLM (giảm 67% lượt gọi)');
  assert.strictEqual(res[0].labelledBy, 'visobert');
  assert.deepStrictEqual(res[0].rootCauses, ['MECH_PART']);
  assert.strictEqual(res[1].labelledBy, 'visobert');
  assert.strictEqual(res[1].category, 'Other');
  assert.strictEqual(res[2].labelledBy, 'llm');
  assert.deepStrictEqual(res[2].rootCauses, ['USABILITY']);
});

// ------------------------------------------------------------------
// G6: Playbook L3, dataProfile.facts, case_file, chat_engine và /root-causes
// ------------------------------------------------------------------
console.log('\nPLAYBOOK & PHÂN TÍCH L3 (G6)');

test('G6: ROOT_PLAYBOOKS phủ đủ 18 khóa L3, recommender gắn L3 vào dataProfile.facts & steps, chat_engine productFocus liệt kê L3', () => {
  const pbLib = require('../services/playbook_library');
  const recommender = require('../services/recommender');
  const chatEngine = require('../services/chat_engine');

  const keys = taxonomy.rootCauseKeys('gia_dung');
  for (const k of keys) {
    assert.ok(pbLib.ROOT_PLAYBOOKS[k], `thiếu playbook L3 cho ${k}`);
  }

  const now = new Date('2026-11-25T00:00:00Z');
  const items = Array.from({ length: 10 }, (_, i) => ({
    _id: `bs_l3_${i}`,
    source: 'Tiki',
    originalText: i < 8 ? 'Nồi chiên AFB-5880 nóng yếu, nướng lâu không chín' : 'Nồi chiên bị tiếng kêu to',
    productName: 'Nồi chiên không dầu BlueStone AFB-5880',
    productType: 'Nồi chiên không dầu',
    category: 'ProductQuality',
    categoryLabel: 'Chất lượng sản phẩm',
    subCategory: 'TechnicalDefect',
    causeLabel: 'Lỗi kỹ thuật',
    rootCauses: i < 8 ? ['WEAK_HEAT'] : ['NOISE_SMELL'],
    rootCauseLabels: i < 8 ? ['Nóng yếu, nấu lâu, không chín'] : ['Ồn, rung, mùi nhựa, mùi khét'],
    sentiment: 'Negative',
    timestamp: new Date(now.getTime() - (i + 1) * 3600 * 1000).toISOString(),
    trust: { weight: 1, tier: 'P1' }
  }));

  const alert = {
    id: 'ProductQuality|TechnicalDefect|Nồi chiên không dầu BlueStone AFB-5880|*|2026-11-25',
    category: 'ProductQuality',
    categoryLabel: 'Chất lượng sản phẩm',
    cause: 'TechnicalDefect',
    causeLabel: 'Lỗi kỹ thuật',
    productName: 'Nồi chiên không dầu BlueStone AFB-5880',
    severity: 'High',
    severityScore: 0.72,
    owner: 'Sản phẩm / QC',
    affectedCustomers: 10,
    windowDays: 7,
    baselineDays: 28,
    statistics: { currentRate: 0.25, baselineRate: 0.05, deltaPP: 20 }
  };

  const rec = recommender.buildRecommendation(alert, { items, now });
  assert.ok(rec.dataProfile.facts.some((f) => f.includes('80%') && f.includes('Nóng yếu')), 'dataProfile.facts phải có câu tỉ lệ L3 trội nhất');
  assert.ok(rec.steps.some((s) => s.actionId === 'L3-WEAK-HEAT'), 'steps phải có hành động cụ thể cho WEAK_HEAT');

  // Trợ lý productFocus liệt kê cả L2 lẫn L3
  const focus = chatEngine.productFocus({ items, asOf: now.toISOString() }, 'Nồi chiên AFB-5880 bị lỗi gì?');
  assert.ok(focus && focus.section.facts.some((f) => f.includes('Nóng yếu')), 'productFocus phải liệt kê L3');
});

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
