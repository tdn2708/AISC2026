/**
 * CHẤM ĐIỂM KHẢ NĂNG PHÁT HIỆN CỦA HỆ THỐNG
 * ==================================================================
 * Chạy: npm run verify
 *
 * Ý tưởng: bộ sinh dữ liệu cài vào một số sự cố có chủ đích và ghi lại
 * trong bản kê (manifest). Script này chạy toàn bộ pipeline thật trên
 * tập dữ liệu đó rồi đối chiếu: hệ thống có tìm ra đúng những thứ đã
 * cài không, và có bắt nhầm phần dữ liệu nền không.
 *
 * Vì sao phép đo này có giá trị: khi chưa có dữ liệu sự cố thật đã được
 * gán nhãn, đây là cách chuẩn để kiểm chứng một hệ thống phát hiện bất
 * thường. Nó cho ra hai con số mà một hội đồng sẽ hỏi ngay:
 *
 *    - Độ nhạy  : cài N sự cố, bắt được bao nhiêu?
 *    - Độ ồn    : có bao nhiêu báo động trên phần dữ liệu bình thường?
 *
 * GIỚI HẠN PHẢI NÓI RÕ: dữ liệu là mô phỏng. Con số ở đây chứng minh
 * pipeline hoạt động đúng như thiết kế trên các hình thái sự cố đã biết.
 * Nó KHÔNG thay thế được thử nghiệm trên dữ liệu sàn thật.
 */

const { generateDataset } = require('./generator');
const trustLayer = require('../services/trust_layer');
const alertEngine = require('../services/alert_engine');
const metrics = require('../services/metrics');
const taxonomy = require('../services/taxonomy');

const num = (n) => new Intl.NumberFormat('vi-VN').format(n);
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function enrich(feedbacks) {
  return feedbacks.map((f, i) => {
    const cat = taxonomy.normalizeCategory(f.category);
    const cause = taxonomy.normalizeCause(cat, f.subCategory);
    return {
      ...f,
      _id: 'gen' + i,
      category: cat,
      subCategory: cause,
      categoryLabel: taxonomy.categoryLabel(cat),
      causeLabel: taxonomy.causeLabel(cat, cause)
    };
  });
}

function main() {
  console.log('\n' + '='.repeat(70));
  console.log('CHẤM ĐIỂM PHÁT HIỆN — CUSTOMER RADAR');
  console.log('='.repeat(70));

  const t0 = Date.now();
  const { feedbacks: raw, orders, manifest } = generateDataset();
  const feedbacks = enrich(raw);
  console.log(`\nSinh dữ liệu: ${num(feedbacks.length)} phản hồi, ${num(orders.length)} giao dịch (${Date.now() - t0} ms)`);

  const t1 = Date.now();
  const trust = trustLayer.runTrustLayer(feedbacks, { orders });
  console.log(`Chạy Trust Layer: ${Date.now() - t1} ms`);

  const t2 = Date.now();
  const alertResult = alertEngine.detectAlerts(trust.items, { transactionCount: orders.length });
  console.log(`Chạy động cơ cảnh báo: ${Date.now() - t2} ms`);

  // ================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('PHẦN 1 — TRUST LAYER CÓ BẮT ĐÚNG THỨ ĐÃ CÀI KHÔNG');
  console.log('-'.repeat(70));

  const byId = new Map(trust.items.map((it) => [it._id, it]));
  const plantedInauthentic = feedbacks.filter((f) => f._plantedAs === 'inauthentic');
  const plantedSpam = feedbacks.filter((f) => f._plantedAs === 'spam');
  const background = feedbacks.filter((f) => !f._plantedAs);

  const caughtInauthentic = plantedInauthentic.filter(
    (f) => byId.get(f._id).trust.band === 'LIKELY_INAUTHENTIC'
  ).length;
  const caughtSpam = plantedSpam.filter((f) => byId.get(f._id).trust.band === 'SPAM').length;

  // Báo động giả: phản hồi NỀN bị loại nhầm
  const wronglyRejected = background.filter((f) => {
    const b = byId.get(f._id).trust.band;
    return b === 'LIKELY_INAUTHENTIC' || b === 'SPAM';
  });

  const recallInauth = caughtInauthentic / Math.max(1, plantedInauthentic.length);
  const recallSpam = caughtSpam / Math.max(1, plantedSpam.length);
  const falseRejectRate = wronglyRejected.length / Math.max(1, background.length);

  console.log(`Đánh giá không xác thực cài vào : ${plantedInauthentic.length} — bắt được ${caughtInauthentic} (${pct(recallInauth)})`);
  console.log(`Nội dung rác cài vào            : ${plantedSpam.length} — bắt được ${caughtSpam} (${pct(recallSpam)})`);
  console.log(`Phản hồi nền                    : ${num(background.length)} — loại nhầm ${wronglyRejected.length} (${pct(falseRejectRate)})`);
  console.log(`Cụm trùng lặp gần phát hiện     : ${trust.clusters.length}`);
  console.log(`Điểm Sức khỏe Dữ liệu           : ${trust.funnel.dataHealthScore}/100`);

  if (wronglyRejected.length > 0) {
    console.log('\n  Ví dụ phản hồi nền bị loại nhầm:');
    for (const f of wronglyRejected.slice(0, 3)) {
      const t = byId.get(f._id).trust;
      console.log(`   - "${f.originalText.slice(0, 60)}" -> ${t.band}`);
      console.log(`     tín hiệu: ${(t.triggeredSignals || []).map((s) => s.signal).join(', ') || 'không rõ'}`);
    }
  }

  // ================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('PHẦN 2 — ĐỘNG CƠ CẢNH BÁO CÓ BẮT ĐÚNG SỰ CỐ KHÔNG');
  console.log('-'.repeat(70));

  const alerts = alertResult.alerts;
  console.log(`Số cảnh báo sinh ra: ${alerts.length} (từ ${alertResult.diagnostics.combosTested} tổ hợp được kiểm định)\n`);

  const incidentResults = [];
  for (const inc of manifest.incidents) {
    if (inc.type === 'SEEDING' || inc.type === 'SMEAR' || inc.type === 'TXN_MISMATCH') {
      // Các sự cố này do Trust Layer xử lý, không phải động cơ cảnh báo
      const planted = feedbacks.filter((f) => f._plantedAs === 'inauthentic');
      const rate = planted.length ? caughtInauthentic / planted.length : 0;
      const ok = rate >= 0.8;
      incidentResults.push({ inc, detected: ok, how: `Trust Layer loại ${pct(rate)} nhóm không xác thực` });
      continue;
    }

    const match = alerts.find((a) => {
      if (inc.expectCategory && a.category !== inc.expectCategory) return false;
      if (inc.expectCause && a.cause && a.cause !== inc.expectCause) return false;
      return true;
    });

    incidentResults.push({
      inc,
      detected: Boolean(match),
      how: match
        ? `${match.severityVi} · z=${match.statistics.z ?? '—'} · ${match.statistics.pValueDisplay ?? match.typeVi}`
        : 'không có cảnh báo khớp'
    });
  }

  let mustDetect = 0;
  let mustDetectHit = 0;
  for (const r of incidentResults) {
    const flag = r.detected ? 'BẮT ĐƯỢC ' : 'BỎ SÓT   ';
    const req = r.inc.mustBeDetected ? '[bắt buộc]' : '[tùy chọn]';
    console.log(`  ${flag} ${r.inc.id} ${req} ${r.inc.label}`);
    console.log(`             ${r.how}`);
    if (r.inc.mustBeDetected) {
      mustDetect += 1;
      if (r.detected) mustDetectHit += 1;
    }
  }

  // ================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('PHẦN 3 — GIÁ TRỊ CỦA TRUST LAYER, ĐO BẰNG SỐ');
  console.log('-'.repeat(70));

  const impact = alertEngine.trustLayerImpact(trust.items, { transactionCount: orders.length });
  console.log(`Bật Trust Layer : ${impact.withTrustLayer.alertCount} cảnh báo · WCR ${impact.wcrWithTrustLayer}`);
  console.log(`Tắt Trust Layer : ${impact.withoutTrustLayer.alertCount} cảnh báo · WCR ${impact.wcrWithoutTrustLayer}`);
  console.log(`Cảnh báo ma biến mất sau khi lọc: ${impact.phantomAlerts}`);
  if (impact.phantomExamples?.length) {
    for (const p of impact.phantomExamples) {
      console.log(`   - ${p.category}${p.cause ? ' → ' + p.cause : ''} (${p.severity})`);
    }
  }

  // ================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('PHẦN 4 — CHỈ SỐ NGHIỆP VỤ');
  console.log('-'.repeat(70));
  const cards = metrics.buildMetricCards(trust.items, orders.length);
  console.log(`Phản hồi hợp lệ : ${num(cards.totalFeedbacks.valid)} / ${num(cards.totalFeedbacks.value)} (loại ${num(cards.totalFeedbacks.excluded)})`);
  console.log(`WCR             : ${cards.weightedComplaintRate.display} (mẫu số ${num(cards.weightedComplaintRate.denominator)} giao dịch, độ phủ ${pct(cards.weightedComplaintRate.coverage)})`);
  console.log(`Tỉ trọng tiêu cực: ${cards.shareOfNegative.display}`);

  // ================================================================
  const sensitivityOk = mustDetectHit === mustDetect;
  const noiseOk = falseRejectRate <= 0.02;

  console.log('\n' + '='.repeat(70));
  console.log('KẾT LUẬN');
  console.log('='.repeat(70));
  console.log(`Độ nhạy : bắt được ${mustDetectHit}/${mustDetect} sự cố bắt buộc  ${sensitivityOk ? '— ĐẠT' : '— CHƯA ĐẠT'}`);
  console.log(`Độ ồn   : loại nhầm ${pct(falseRejectRate)} phản hồi nền (mục tiêu ≤ 2.0%)  ${noiseOk ? '— ĐẠT' : '— CHƯA ĐẠT'}`);
  console.log('\nLưu ý bắt buộc khi trích dẫn: dữ liệu là MÔ PHỎNG có đáp án cài sẵn.');
  console.log('Con số trên chứng minh pipeline chạy đúng thiết kế, chưa thay thế được');
  console.log('thử nghiệm trên dữ liệu sàn thật.');
  console.log('='.repeat(70) + '\n');

  return { sensitivityOk, noiseOk, mustDetectHit, mustDetect, falseRejectRate };
}

if (require.main === module) {
  const r = main();
  process.exit(r.sensitivityOk && r.noiseOk ? 0 : 1);
}

module.exports = { main };
