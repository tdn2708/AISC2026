/**
 * CHỨNG MINH TẦNG KHUYẾN NGHỊ ĐÃ CHẠY THEO DỮ LIỆU
 * ==================================================================
 * Chạy: node test/recommender_demo.js   (không cần MongoDB, không gọi LLM)
 *
 * Bài kiểm tra dựng HAI bộ dữ liệu có CÙNG nguyên nhân và CÙNG mức
 * nghiêm trọng, chỉ khác nhau ở hình thái phân bố:
 *
 *   Kịch bản A — trễ giao dồn vào một khu vực và một khung giờ
 *   Kịch bản B — trễ giao rải đều mọi khu vực, mọi khung giờ
 *
 * Động cơ cũ trả về hai danh sách giống hệt nhau, vì nó chỉ đọc
 * (nguyên nhân, mức nghiêm trọng). Động cơ mới phải trả về hai danh
 * sách khác nhau, với câu chữ chứa đúng khu vực và khung giờ thật.
 */

const assert = require('assert');
const alertEngine = require('../services/alert_engine');
const recommender = require('../services/recommender');

const NOW = new Date('2026-03-15T12:00:00Z');
const DAY = 86400000;

let seq = 0;
function fb({ daysAgo, hour, region, product, sentiment = 'Negative', cause = 'LateDelivery', tier = 'P1', orderId = null }) {
  const ts = new Date(NOW.getTime() - daysAgo * DAY);
  ts.setHours(hour, 0, 0, 0);
  return {
    _id: `f${seq++}`,
    source: 'Shopee',
    productName: product,
    productCategory: 'Điện tử',
    region,
    timestamp: ts,
    author: `kh${seq % 97}`,
    orderId,
    category: 'Delivery',
    subCategory: cause,
    sentiment,
    trust: { tier, weight: tier === 'P5' ? 0.15 : 1.0, canTriggerHighAlert: tier !== 'P5' }
  };
}

const REGIONS = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ'];
const HOURS = [8, 11, 15, 20];

/** Nền chung: 28 ngày phản hồi bình thường, rải đều mọi khu vực */
function baseline() {
  const out = [];
  for (let d = 8; d < 28; d++) {
    for (let i = 0; i < 12; i++) {
      out.push(
        fb({
          daysAgo: d,
          hour: HOURS[i % HOURS.length],
          region: REGIONS[i % REGIONS.length],
          product: `SP-${i % 5}`,
          sentiment: i % 6 === 0 ? 'Negative' : 'Positive',
          orderId: `OD${d}-${i}`
        })
      );
    }
  }
  return out;
}

/** Kịch bản A: đợt trễ dồn vào TP.HCM, khung giờ 18–22h */
function scenarioFocused() {
  const out = baseline();
  for (let d = 0; d < 7; d++) {
    for (let i = 0; i < 12; i++) {
      const spike = i < 7;
      out.push(
        fb({
          daysAgo: d,
          hour: spike ? 20 : HOURS[i % HOURS.length],
          region: spike ? 'TP.HCM' : REGIONS[i % REGIONS.length],
          product: 'SP-1',
          sentiment: spike ? 'Negative' : 'Positive',
          orderId: `ODA${d}-${i}`
        })
      );
    }
  }
  return out;
}

/** Kịch bản B: cùng số lượng phản hồi trễ, nhưng rải đều */
function scenarioDiffuse() {
  const out = baseline();
  for (let d = 0; d < 7; d++) {
    for (let i = 0; i < 12; i++) {
      const spike = i < 7;
      const k = d * 12 + i;
      out.push(
        fb({
          daysAgo: d,
          hour: HOURS[k % HOURS.length],
          region: REGIONS[(k + 1) % REGIONS.length],
          product: `SP-${k % 10}`,
          sentiment: spike ? 'Negative' : 'Positive',
          orderId: `ODB${d}-${i}`
        })
      );
    }
  }
  return out;
}

/** Bảng giao dịch để tính thiệt hại tiền */
function transactionsFor(items) {
  return items
    .filter((f) => f.orderId)
    .map((f) => ({ orderId: f.orderId, amount: 450000, region: f.region, productName: f.productName }));
}

function run(name, items) {
  const txns = transactionsFor(items);
  const { alerts } = alertEngine.detectAlerts(items, { now: NOW, transactionCount: txns.length });

  const delivery = alerts.filter((a) => a.category === 'Delivery');
  const out = recommender.buildAll(delivery, { items, transactions: txns, decisions: [], now: NOW });

  console.log('\n' + '='.repeat(74));
  console.log(name);
  console.log('='.repeat(74));
  console.log(`cảnh báo Giao vận: ${delivery.length}`);

  const rec = out.recommendations[0];
  if (!rec) {
    console.log('(không có cảnh báo nào)');
    return null;
  }
  const alert = delivery.find((x) => x.id === rec.alertId);

  console.log(`phân bố          : ${rec.dataProfile.concentration} (${rec.dataProfile.focusedDimensions} chiều tập trung)`);
  console.log(`chỗ trống điền được: ${JSON.stringify(rec.dataProfile.slots)}`);
  console.log(`thiệt hại ước tính : ${rec.dataProfile.revenue.extrapolatedVnd.toLocaleString('vi-VN')} đ (đối soát ${(rec.dataProfile.revenue.coverage * 100).toFixed(0)}%)`);
  if (rec.dataProfile.facts.length) {
    console.log('dẫn chứng:');
    for (const f of rec.dataProfile.facts) console.log(`  · ${f.text}`);
  }
  console.log('\nhành động (đã xếp theo giá trị kỳ vọng):');
  for (const s of rec.steps) {
    console.log(`  ${s.order}. [${s.score.toFixed(3)}] ${s.text}`);
    console.log(`     ${s.kindLabel} · ${s.effortDays} ngày · ${s.requiresApproval ? 'CẦN PHÊ DUYỆT: ' + s.approvalRole : 'không cần phê duyệt'}`);
  }
  if (rec.diagnostics.rejected.length) {
    console.log('\nhành động bị loại vì dữ liệu không đủ:');
    for (const r of rec.diagnostics.rejected) console.log(`  · ${r.id}: ${r.reason}`);
  }
  return { alert, rec };
}

const A = run('KỊCH BẢN A — trễ dồn vào TP.HCM, khung giờ 18–22h', scenarioFocused());
const B = run('KỊCH BẢN B — trễ rải đều mọi khu vực', scenarioDiffuse());

console.log('\n' + '='.repeat(74));
console.log('KIỂM CHỨNG');
console.log('='.repeat(74));

assert.ok(A && B, 'cả hai kịch bản phải sinh được cảnh báo Giao vận');

const a = A.rec;
const b = B.rec;
const textA = a.steps.map((s) => s.text).join(' | ');
const textB = b.steps.map((s) => s.text).join(' | ');

assert.notStrictEqual(textA, textB, 'hai bộ dữ liệu khác nhau phải cho hai khuyến nghị khác nhau');
console.log('✓ hai bộ dữ liệu khác nhau cho ra hai khuyến nghị khác nhau');

assert.ok(/TP\.HCM/.test(textA), 'kịch bản tập trung phải gọi đích danh khu vực');
console.log('✓ kịch bản tập trung gọi đích danh khu vực trội');

assert.ok(!/\{\w+\}/.test(textA) && !/\{\w+\}/.test(textB), 'không được để lọt chỗ trống chưa điền');
console.log('✓ không có chỗ trống nào chưa điền lọt ra ngoài');

assert.ok(a.steps.every((s, i, arr) => i === 0 || arr[i - 1].score >= s.score), 'phải xếp theo điểm giảm dần');
console.log('✓ hành động được xếp hạng theo giá trị kỳ vọng');

// Vòng lặp học: bỏ qua một hành động với lý do "đang làm rồi" thì lần
// sau hành động đó phải biến mất khỏi danh sách.
const blockedId = a.steps[0].actionId;
const withDecision = recommender.buildRecommendation(
  A.alert,
  {
    items: scenarioFocused(),
    transactions: transactionsFor(scenarioFocused()),
    now: NOW,
    decisions: [
      { alertId: a.alertId, scopeKey: a.scopeKey, actionIds: [blockedId], decision: 'DISMISSED', reason: 'ALREADY_DOING', at: NOW }
    ]
  }
);
console.log(`✓ sau khi người dùng bỏ qua "${blockedId}" với lý do đang làm rồi:`);
console.log(`  hành động đó ${withDecision.steps.find((s) => s.actionId === blockedId) ? 'VẪN CÒN (lỗi)' : 'đã bị ẩn trong thời gian nguội'}`);
assert.ok(!withDecision.steps.find((s) => s.actionId === blockedId), 'hành động bị bỏ qua phải được ẩn');
assert.ok(withDecision.diagnostics.suppressed.length > 0, 'phải liệt kê minh bạch hành động đang bị ẩn');

// Hàng rào chống bịa số của tầng sinh ngôn ngữ
const grounded = recommender.verifyNumericGrounding('Trễ tăng lên 9.8% tại TP.HCM', ['9.8', '4.1']);
const bịa = recommender.verifyNumericGrounding('Trễ tăng lên 42.7% tại TP.HCM', ['9.8', '4.1']);
assert.ok(grounded.grounded && !bịa.grounded, 'hàng rào kiểm số phải bắt được con số bịa');
console.log('✓ hàng rào kiểm số bắt được con số không có trong dữ liệu nguồn');

console.log('\nTẤT CẢ KIỂM CHỨNG ĐỀU ĐẠT\n');
