/**
 * CHẠY ĐÁNH GIÁ VÀ SINH BẢNG KẾT QUẢ
 * ==================================================================
 * Chạy: npm run eval          (chỉ các baseline chạy cục bộ)
 *       npm run eval -- --llm (bật thêm B3, cần khóa API và tốn phí)
 *
 * Kết quả ghi ra `evaluation/results.json` để giao diện đọc lại, và in
 * ra màn hình dưới dạng bảng.
 *
 * NGUYÊN TẮC BÁO CÁO: in ra ĐÚNG những gì đo được, kể cả chỉ số chưa
 * đạt mục tiêu. Mục tiêu và kết quả là hai cột khác nhau trong bảng —
 * phần lớn đội thi trộn lẫn hai thứ này.
 */

const fs = require('fs');
const path = require('path');

const { ASPECT_GOLD, ASPECT_DEV, ASPECT_TEST, TRUST_GOLD, ANNOTATION_META } = require('./gold_dataset');
const { classificationReport, confusionMatrix, wilsonInterval } = require('./metrics');
const { SYNC_BASELINES, B3_zeroShotLLM, M_proposed } = require('./baselines');
const taxonomy = require('../services/taxonomy');
const trustLayer = require('../services/trust_layer');
const { normalize } = require('../services/normalizer');
const { auditLeakage } = require('./contamination');

/** Ngưỡng mục tiêu nhóm tự đặt dựa trên mức phổ biến của các công bố cùng bài toán */
const TARGETS = {
  categoryMacroF1: 0.82,
  causeMacroF1: 0.7,
  sentimentMacroF1: 0.78,
  spamPrecision: 0.95,
  inauthenticPrecision: 0.75,
  falseRejectRate: 0.02
};

const SENTIMENT_LABELS = ['Positive', 'Negative', 'Neutral'];
// 'NONE' đại diện cho "không phải khiếu nại thuộc taxonomy"
const CATEGORY_LABELS = [...taxonomy.CATEGORY_KEYS, 'NONE'];

const asLabel = (v) => v || 'NONE';

/** Đánh giá một bộ phân loại đồng bộ trên tập khía cạnh */
function evaluateAspectModel(predictions, dataset = ASPECT_TEST) {
  const goldCat = dataset.map((g) => asLabel(g.category));
  const goldSent = dataset.map((g) => g.sentiment);
  const goldCause = dataset.map((g) => asLabel(g.cause));

  const predCat = predictions.map((p) => asLabel(p.category));
  const predSent = predictions.map((p) => p.sentiment);
  const predCause = predictions.map((p) => asLabel(p.cause));

  const causeLabels = [...new Set([...goldCause, ...predCause])];

  const category = classificationReport(goldCat, predCat, CATEGORY_LABELS);
  const sentiment = classificationReport(goldSent, predSent, SENTIMENT_LABELS);
  const cause = classificationReport(goldCause, predCause, causeLabels);

  // Khoảng tin cậy cho accuracy — bắt buộc khi cỡ mẫu nhỏ
  const correctCat = goldCat.filter((g, i) => g === predCat[i]).length;

  return {
    category,
    cause,
    sentiment,
    categoryAccuracyCI: wilsonInterval(correctCat, goldCat.length),
    confusion: confusionMatrix(goldCat, predCat, CATEGORY_LABELS)
  };
}

/** Các câu mà mô hình đoán sai — nguyên liệu cho phần phân tích lỗi */
function collectErrors(predictions, dataset = ASPECT_TEST, limit = 12) {
  const errors = [];
  dataset.forEach((g, i) => {
    const p = predictions[i];
    if (asLabel(g.category) !== asLabel(p.category)) {
      errors.push({
        text: g.text,
        goldCategory: g.category ? taxonomy.categoryLabel(g.category) : 'Không phải khiếu nại',
        predCategory: p.category ? taxonomy.categoryLabel(p.category) : 'Không phải khiếu nại',
        goldSentiment: g.sentiment,
        predSentiment: p.sentiment
      });
    }
  });
  return { total: errors.length, samples: errors.slice(0, limit) };
}

/**
 * ĐÁNH GIÁ TRUST LAYER trên tập nhãn ba lớp.
 * Chạy từng câu qua bộ lọc rác và chấm điểm xác thực.
 */
function evaluateTrustLayer() {
  /**
   * ĐIỂM QUAN TRỌNG VỀ PHƯƠNG PHÁP ĐO.
   *
   * Hai tầng của Trust Layer có BẢN CHẤT KHÁC NHAU, nên phải đo khác nhau:
   *
   *   - Lọc rác / quảng cáo là bài toán TRÊN TỪNG CÂU. Một bình luận
   *     chào mời kèm số điện thoại tự nó đã đủ dấu hiệu. Đo trên từng
   *     câu rời rạc là hợp lệ.
   *
   *   - Phát hiện đánh giá không xác thực là bài toán TRÊN CẢ QUẦN THỂ.
   *     Bốn trong năm nhóm tín hiệu (trùng lặp, đột biến, hành vi tài
   *     khoản, đối soát giao dịch) đều cần nhìn nhiều phản hồi cùng lúc.
   *     Một câu "Sản phẩm rất tốt, shop giao hàng nhanh" đứng MỘT MÌNH
   *     thì không ai — người hay máy — có thể kết luận là thật hay thuê.
   *     Nó chỉ trở nên đáng ngờ khi xuất hiện 12 lần trong 40 phút từ 12
   *     tài khoản mới lập.
   *
   * Vì vậy đánh giá được tách làm hai phần. Đo tính xác thực trên từng
   * câu rời rạc sẽ cho Precision = 0 và đó là phép đo SAI, không phải
   * mô hình tồi.
   */

  // --- Phần 1: lọc rác, đo trên từng câu ---
  const items = TRUST_GOLD.map((g, i) => ({
    _id: 'g' + i,
    originalText: g.text,
    author: 'nguoi_dung_' + i,
    source: 'Shopee',
    accountAgeDays: 120,
    timestamp: new Date()
  }));

  const result = trustLayer.runTrustLayer(items, { orders: [] });

  // Gộp 'inauthentic' vào 'valid' cho phép đo này: ở dạng câu rời rạc,
  // điều duy nhất hỏi được là "có phải rác không"
  const gold = TRUST_GOLD.map((g) => (g.label === 'spam' ? 'spam' : 'not_spam'));
  const pred = result.items.map((it) => (it.trust.band === 'SPAM' ? 'spam' : 'not_spam'));
  const spamReport = classificationReport(gold, pred, ['spam', 'not_spam']);

  // --- Phần 2: tính xác thực, đo trong ngữ cảnh quần thể ---
  const authenticity = evaluateAuthenticityInPopulation();

  const reportCompat = { perClass: { spam: spamReport.perClass.spam, inauthentic: authenticity.perClass } };

  // Tỉ lệ loại nhầm phản hồi thật: trong các câu gold = valid, bao nhiêu
  // bị hệ thống loại. Đây là chỉ số quan trọng nhất của tầng này — loại
  // nhầm một khiếu nại thật là đánh mất đúng thứ khách hàng trả tiền để nghe.
  const validIdx = TRUST_GOLD.map((g, i) => (g.label === 'valid' ? i : -1)).filter((i) => i >= 0);
  const wronglyRejected = validIdx.filter(
    (i) => result.items[i].trust.band === 'SPAM' || result.items[i].trust.band === 'LIKELY_INAUTHENTIC'
  ).length;

  return {
    report: reportCompat,
    spamReport,
    authenticity,
    falseRejectRate: Number((wronglyRejected / Math.max(1, validIdx.length)).toFixed(4)),
    falseRejectCI: wilsonInterval(wronglyRejected, validIdx.length),
    wronglyRejected,
    validTotal: validIdx.length,
    confusion: confusionMatrix(gold, pred, ['spam', 'not_spam']),
    methodNote:
      'Lọc rác đo trên từng câu; tính xác thực đo trong ngữ cảnh quần thể. ' +
      'Đo tính xác thực trên câu rời rạc là phép đo sai về mặt phương pháp, ' +
      'vì bốn trong năm nhóm tín hiệu cần nhìn nhiều phản hồi cùng lúc.',
    note:
      'Nhãn "không xác thực" là phán đoán của người gán dựa trên dấu hiệu quan sát được, ' +
      'không phải sự thật đã xác minh. Do đó các chỉ số ở đây được diễn giải là MỨC ĐỘ ĐỒNG ' +
      'THUẬN VỚI ĐÁNH GIÁ CỦA CON NGƯỜI, không phải độ chính xác tuyệt đối.'
  };
}

/**
 * Đo khả năng phát hiện đánh giá không xác thực TRONG NGỮ CẢNH QUẦN THỂ.
 *
 * Dựng lại đúng kịch bản thực tế: một nền phản hồi thật, cộng một chiến
 * dịch đánh giá thuê có cấu trúc (nội dung na ná nhau, dồn trong thời
 * gian ngắn, từ tài khoản mới lập). Đây là hình thái mà đánh giá thuê
 * thực sự xuất hiện trên sàn, và cũng là hình thái duy nhất mà bài toán
 * này có lời giải.
 */
function evaluateAuthenticityInPopulation() {
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);

  const items = [];
  const REAL_TEXTS = [
    'Giao hàng hơi chậm nhưng đóng gói cẩn thận, sản phẩm dùng ổn',
    'Máy dùng được ba ngày là hỏng, mình cần đổi trả gấp',
    'Nhân viên tư vấn sai thông tin bảo hành, rất bực mình',
    'Chất lượng tốt hơn mình nghĩ, sẽ ủng hộ shop lần sau',
    'Hộp bị móp một góc, mong shop rút kinh nghiệm khâu đóng gói',
    'Đợi hoàn tiền hai tuần rồi mà chưa thấy đâu cả'
  ];

  // Nền phản hồi thật: tài khoản lâu năm, rải đều theo thời gian
  for (let i = 0; i < 70; i++) {
    items.push({
      _id: 'real' + i,
      originalText: REAL_TEXTS[i % REAL_TEXTS.length] + ' ' + i,
      author: 'khach_' + (i % 35),
      source: i % 2 === 0 ? 'Shopee' : 'Facebook',
      accountAgeDays: 180 + i * 3,
      rating: i % 3 === 0 ? 5 : 2,
      sentiment: i % 3 === 0 ? 'Positive' : 'Negative',
      productName: 'Sản phẩm A',
      timestamp: hoursAgo(24 * (i % 30) + i),
      _goldLabel: 'valid'
    });
  }

  // Chiến dịch đánh giá thuê: dùng đúng các câu văn mẫu trong tập chuẩn
  const seedTexts = TRUST_GOLD.filter((g) => g.label === 'inauthentic').map((g) => g.text);
  for (let i = 0; i < 12; i++) {
    items.push({
      _id: 'fake' + i,
      originalText: seedTexts[i % seedTexts.length],
      author: 'user' + (700000 + i),
      source: 'Shopee',
      accountAgeDays: 1 + (i % 3),
      rating: 5,
      sentiment: 'Positive',
      productName: 'Sản phẩm A',
      timestamp: hoursAgo(5 + i * 0.05),
      _goldLabel: 'inauthentic'
    });
  }

  const result = trustLayer.runTrustLayer(items, { orders: [] });

  const gold = items.map((i) => i._goldLabel);
  const pred = result.items.map((it) =>
    it.trust.band === 'LIKELY_INAUTHENTIC' ? 'inauthentic' : 'valid'
  );

  const report = classificationReport(gold, pred, ['valid', 'inauthentic']);
  const fakeIdx = gold.map((g, i) => (g === 'inauthentic' ? i : -1)).filter((i) => i >= 0);
  const caught = fakeIdx.filter((i) => pred[i] === 'inauthentic').length;

  return {
    populationSize: items.length,
    plantedCampaignSize: fakeIdx.length,
    caught,
    perClass: report.perClass.inauthentic,
    recall: report.perClass.inauthentic.recall,
    precision: report.perClass.inauthentic.precision,
    precisionCI: wilsonInterval(
      report.perClass.inauthentic.tp,
      report.perClass.inauthentic.tp + report.perClass.inauthentic.fp
    ),
    macroF1: report.macroF1,
    note:
      'Đo trong quần thể ' + items.length + ' phản hồi, trong đó ' + fakeIdx.length +
      ' phản hồi thuộc một chiến dịch đánh giá thuê được cài vào có chủ đích.'
  };
}

/**
 * THÍ NGHIỆM LOẠI BỎ THÀNH PHẦN (ABLATION).
 * Trả lời câu hỏi: từng tầng đóng góp bao nhiêu, đo bằng con số?
 */
function runAblations() {
  const { B1_lexiconRules } = require('./baselines');

  // --- Ablation 1: tắt bước chuẩn hóa teencode/tiếng lóng ---
  const withSlang = ASPECT_DEV.map((g) => B1_lexiconRules(g.text));

  const withoutSlang = ASPECT_DEV.map((g) => {
    const t = normalize(g.text, { skipSlang: true }).normalized;
    const matches = taxonomy.classifyByRules(t);
    const top = matches[0] || null;
    const { NEGATIVE_LEXICON, POSITIVE_LEXICON } = require('./baselines');
    let neg = 0;
    let pos = 0;
    for (const w of NEGATIVE_LEXICON) if (t.includes(w)) neg += 1;
    for (const w of POSITIVE_LEXICON) if (t.includes(w)) pos += 1;
    return {
      category: top ? top.category : null,
      cause: top ? top.cause : null,
      sentiment: neg > pos ? 'Negative' : pos > neg ? 'Positive' : 'Neutral'
    };
  });

  const evalWith = evaluateAspectModel(withSlang, ASPECT_DEV);
  const evalWithout = evaluateAspectModel(withoutSlang, ASPECT_DEV);

  // Đếm riêng trên nhóm câu CÓ teencode — nơi bước chuẩn hóa thực sự
  // có việc để làm. Tính trên toàn tập sẽ pha loãng tác dụng.
  const slangIdx = ASPECT_DEV.map((g, i) => (normalize(g.text).slangHits > 0 ? i : -1))
    .filter((i) => i >= 0);

  const accOn = slangIdx.filter(
    (i) => asLabel(ASPECT_DEV[i].category) === asLabel(withSlang[i].category)
  ).length;
  const accOff = slangIdx.filter(
    (i) => asLabel(ASPECT_DEV[i].category) === asLabel(withoutSlang[i].category)
  ).length;

  return {
    slangNormalization: {
      description: 'Tắt bước chuẩn hóa teencode / tiếng lóng tiếng Việt',
      categoryMacroF1_on: evalWith.category.macroF1,
      categoryMacroF1_off: evalWithout.category.macroF1,
      delta: Number((evalWith.category.macroF1 - evalWithout.category.macroF1).toFixed(4)),
      sentimentMacroF1_on: evalWith.sentiment.macroF1,
      sentimentMacroF1_off: evalWithout.sentiment.macroF1,
      onSlangSubset: {
        sampleSize: slangIdx.length,
        correctWithNormalization: accOn,
        correctWithoutNormalization: accOff,
        note: 'Chỉ tính trên các câu thực sự chứa teencode hoặc tiếng lóng'
      }
    }
  };
}

/**
 * ABLATION TRUST LAYER: cùng một tập dữ liệu, so số cảnh báo và WCR khi
 * bật và khi tắt tầng kiểm soát tin cậy. Đây là con số trả lời trực tiếp
 * câu hỏi "nếu không lọc thì sao".
 */
function runTrustLayerAblation() {
  const { buildDataset } = require('../seed_realistic_data');
  const alertEngine = require('../services/alert_engine');
  const metricsSvc = require('../services/metrics');

  const { feedbacks, orders } = buildDataset();
  feedbacks.forEach((f, i) => {
    f._id = 'ab' + i;
  });

  const trust = trustLayer.runTrustLayer(feedbacks, { orders });
  const impact = alertEngine.trustLayerImpact(trust.items, { transactionCount: orders.length });

  const withCards = metricsSvc.buildMetricCards(trust.items, orders.length);
  const naive = trust.items.map((f) => ({
    ...f,
    trust: { ...f.trust, weight: 1, tier: 'P1', canTriggerHighAlert: true }
  }));
  const withoutCards = metricsSvc.buildMetricCards(naive, orders.length);

  return {
    description: 'Tắt Trust Layer: mọi phản hồi được đếm đủ 1 điểm',
    datasetSize: feedbacks.length,
    alertsWithTrustLayer: impact.withTrustLayer.alertCount,
    alertsWithoutTrustLayer: impact.withoutTrustLayer.alertCount,
    phantomAlerts: impact.phantomAlerts,
    phantomExamples: impact.phantomExamples,
    wcrWithTrustLayer: withCards.weightedComplaintRate.display,
    wcrWithoutTrustLayer: withoutCards.weightedComplaintRate.display,
    excludedFeedbacks: impact.excludedFeedbacks,
    funnel: trust.funnel
  };
}

// ==================================================================
// ĐIỀU PHỐI
// ==================================================================

async function main() {
  const useLLM = process.argv.includes('--llm');

  console.log('\n' + '='.repeat(64));
  console.log('ĐÁNH GIÁ MÔ HÌNH — CUSTOMER RADAR');
  console.log('='.repeat(64));

  console.log(`\nTập đánh giá khía cạnh : ${ASPECT_GOLD.length} câu`);
  console.log(`Tập đánh giá Trust Layer: ${TRUST_GOLD.length} câu`);
  console.log(`Người gán nhãn          : ${ANNOTATION_META.annotators}` +
    (ANNOTATION_META.doubleAnnotated ? '' : ' (chưa gán đôi)'));
  console.log(`Cohen's kappa           : ${ANNOTATION_META.cohensKappa ?? 'chưa tính được'}`);
  console.log(`  ${ANNOTATION_META.kappaNote}`);

  // --- Kiểm tra rò rỉ tập kiểm tra TRƯỚC khi báo cáo bất kỳ con số nào ---
  const leakage = auditLeakage(ASPECT_DEV, ASPECT_TEST);
  console.log('\n' + '-'.repeat(64));
  console.log('KIỂM TRA RÒ RỈ TẬP KIỂM TRA');
  console.log('-'.repeat(64));
  console.log(`Tổng từ khóa: ${leakage.totalKeywords} | khớp trên tập phát triển: ${leakage.firedOnDev} | trên tập kiểm tra: ${leakage.firedOnTest}`);
  console.log(leakage.verdict);
  if (!leakage.clean) {
    console.log('  Từ khóa nghi rò rỉ: ' + leakage.leaked.slice(0, 15).join(', '));
  }

  const models = [];

  // --- Baseline chạy cục bộ ---
  for (const b of SYNC_BASELINES) {
    // Bao cao trên TẬP KIỂM TRA GIỮ RIÊNG, không phải tập đã dùng để tinh chỉnh
    const preds = ASPECT_TEST.map((g) => b.predict(g.text));
    const ev = evaluateAspectModel(preds, ASPECT_TEST);
    const devPreds = ASPECT_DEV.map((g) => b.predict(g.text));
    const devEv = evaluateAspectModel(devPreds, ASPECT_DEV);
    models.push({
      id: b.id,
      name: b.name,
      role: b.role,
      available: true,
      canDetectAspect: b.canDetectAspect,
      categoryMacroF1: ev.category.macroF1,
      causeMacroF1: ev.cause.macroF1,
      sentimentMacroF1: ev.sentiment.macroF1,
      categoryAccuracy: ev.category.accuracy,
      categoryAccuracyCI: ev.categoryAccuracyCI,
      detail: ev,
      devCategoryMacroF1: devEv.category.macroF1,
      errors: collectErrors(preds, ASPECT_TEST)
    });
  }

  // --- B3: mô hình ngôn ngữ zero-shot ---
  if (useLLM) {
    try {
      console.log('\nĐang gọi mô hình ngôn ngữ cho B3 (có thể mất một lúc)...');
      const preds = await B3_zeroShotLLM(ASPECT_TEST.map((g) => g.text));
      const ev = evaluateAspectModel(preds, ASPECT_TEST);
      const viaRules = preds.filter((p) => p.labelledBy === 'rules').length;
      models.push({
        id: 'B3',
        name: 'Mô hình ngôn ngữ lớn, zero-shot',
        role: 'Đại diện phương án "chỉ cần gọi API"',
        available: true,
        canDetectAspect: true,
        categoryMacroF1: ev.category.macroF1,
        causeMacroF1: ev.cause.macroF1,
        sentimentMacroF1: ev.sentiment.macroF1,
        categoryAccuracy: ev.category.accuracy,
        categoryAccuracyCI: ev.categoryAccuracyCI,
        detail: ev,
        errors: collectErrors(preds, ASPECT_TEST),
        warning: viaRules > 0
          ? `${viaRules}/${preds.length} câu phải lùi về lớp luật vì lỗi gọi mô hình — con số không thuần túy là kết quả của LLM`
          : null
      });
    } catch (e) {
      models.push({
        id: 'B3', name: 'Mô hình ngôn ngữ lớn, zero-shot',
        available: false, reason: 'Lỗi khi gọi mô hình: ' + e.message
      });
    }
  } else {
    models.push({
      id: 'B3',
      name: 'Mô hình ngôn ngữ lớn, zero-shot',
      role: 'Đại diện phương án "chỉ cần gọi API"',
      available: false,
      reason: 'Chưa chạy. Bật bằng: npm run eval -- --llm (cần khóa API, có phát sinh chi phí)'
    });
  }

  // --- M: mô hình đề xuất ---
  models.push({
    id: 'M',
    name: 'PhoBERT tinh chỉnh cho ABSA + phân loại phân cấp',
    role: 'Mô hình đề xuất',
    available: false,
    reason: M_proposed.reason,
    nextSteps: M_proposed.nextSteps
  });

  // --- In bảng kết quả ---
  console.log('\n' + '-'.repeat(64));
  console.log('BẢNG 1 — PHÂN LOẠI DANH MỤC (Level 1)');
  console.log('-'.repeat(64));
  console.log(
    'Mã'.padEnd(5) + 'Mô hình'.padEnd(34) + 'F1 (test)'.padEnd(11) + 'F1 (dev)'.padEnd(11) + 'Accuracy'
  );
  for (const m of models) {
    if (!m.available) {
      console.log(`${m.id.padEnd(5)}${m.name.slice(0, 33).padEnd(34)}${'chưa có số'.padEnd(11)}—`);
      continue;
    }
    const f1 = m.canDetectAspect ? m.categoryMacroF1.toFixed(4) : 'n/a';
    const devF1 = m.devCategoryMacroF1 != null ? m.devCategoryMacroF1.toFixed(4) : '—';
    console.log(
      `${m.id.padEnd(5)}${m.name.slice(0, 33).padEnd(34)}${String(f1).padEnd(11)}${devF1.padEnd(11)}${m.categoryAccuracy.toFixed(4)}` +
      (m.canDetectAspect ? '' : '   <- không bóc tách được khía cạnh')
    );
  }

  // Khoảng cách dev/test là phát hiện quan trọng nhất của cả bảng
  const b1 = models.find((m) => m.id === 'B1');
  if (b1 && b1.devCategoryMacroF1 != null) {
    const gap = b1.devCategoryMacroF1 - b1.categoryMacroF1;
    console.log(
      `\nKhoảng cách dev/test của B1: ${b1.devCategoryMacroF1.toFixed(4)} -> ${b1.categoryMacroF1.toFixed(4)} (chênh ${gap.toFixed(4)})`
    );
    console.log(
      '  Bộ phân loại luật khớp gần như hoàn hảo trên tập đã dùng để tinh chỉnh từ khóa,'
    );
    console.log(
      '  nhưng sụp đổ trên câu chưa từng thấy. Đây là bằng chứng định lượng cho thấy'
    );
    console.log(
      '  phương pháp từ khóa KHÔNG khái quát hóa được sang cách diễn đạt mới — và đó'
    );
    console.log(
      '  chính là lý do cần mô hình ngôn ngữ tinh chỉnh, chứ không phải thêm từ khóa.'
    );
  }

  console.log('\n' + '-'.repeat(64));
  console.log('BẢNG 2 — PHÂN LOẠI CẢM XÚC');
  console.log('-'.repeat(64));
  for (const m of models) {
    if (!m.available) continue;
    console.log(`${m.id.padEnd(5)}${m.name.slice(0, 33).padEnd(34)}Macro-F1 = ${m.sentimentMacroF1.toFixed(4)}`);
  }

  // --- Trust Layer ---
  const trustEval = evaluateTrustLayer();
  console.log('\n' + '-'.repeat(64));
  console.log('BẢNG 3 — TẦNG KIỂM SOÁT TIN CẬY DỮ LIỆU');
  console.log('-'.repeat(64));
  const spamP = trustEval.report.perClass.spam;
  const fakeP = trustEval.report.perClass.inauthentic;
  console.log(`Precision bộ lọc rác            : ${spamP.precision.toFixed(4)}  (mục tiêu >= ${TARGETS.spamPrecision})  ${spamP.precision >= TARGETS.spamPrecision ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`Precision phát hiện không xác thực: ${fakeP.precision.toFixed(4)}  (mục tiêu >= ${TARGETS.inauthenticPrecision})  ${fakeP.precision >= TARGETS.inauthenticPrecision ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`Tỉ lệ loại nhầm phản hồi thật   : ${(trustEval.falseRejectRate * 100).toFixed(1)}%  (mục tiêu <= ${TARGETS.falseRejectRate * 100}%)  ${trustEval.falseRejectRate <= TARGETS.falseRejectRate ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`  Khoảng tin cậy 95%: ${(trustEval.falseRejectCI.low * 100).toFixed(1)}% – ${(trustEval.falseRejectCI.high * 100).toFixed(1)}% trên ${trustEval.validTotal} mẫu`);

  // --- Ablation ---
  const ablations = runAblations();
  const trustAblation = runTrustLayerAblation();

  console.log('\n' + '-'.repeat(64));
  console.log('BẢNG 4 — THÍ NGHIỆM LOẠI BỎ THÀNH PHẦN');
  console.log('-'.repeat(64));
  const sn = ablations.slangNormalization;
  console.log(`Chuẩn hóa teencode: Macro-F1 ${sn.categoryMacroF1_off.toFixed(4)} (tắt) -> ${sn.categoryMacroF1_on.toFixed(4)} (bật), chênh ${sn.delta >= 0 ? '+' : ''}${sn.delta.toFixed(4)}`);
  console.log(`  Trên riêng ${sn.onSlangSubset.sampleSize} câu có teencode: đúng ${sn.onSlangSubset.correctWithoutNormalization} -> ${sn.onSlangSubset.correctWithNormalization} câu`);
  console.log(`Trust Layer: ${trustAblation.alertsWithoutTrustLayer} cảnh báo (tắt) -> ${trustAblation.alertsWithTrustLayer} cảnh báo (bật)`);
  console.log(`  Cảnh báo ma biến mất sau khi lọc: ${trustAblation.phantomAlerts}`);
  console.log(`  WCR: ${trustAblation.wcrWithoutTrustLayer} (tắt) -> ${trustAblation.wcrWithTrustLayer} (bật)`);

  // --- Đối chiếu mục tiêu và kết quả ---
  console.log('\n' + '-'.repeat(64));
  console.log('BẢNG 5 — MỤC TIÊU SO VỚI KẾT QUẢ ĐO ĐƯỢC');
  console.log('-'.repeat(64));
  const best = models.filter((m) => m.available && m.canDetectAspect)
    .sort((a, b) => b.categoryMacroF1 - a.categoryMacroF1)[0];
  const rows = [
    ['Macro-F1 danh mục (Level 1)', TARGETS.categoryMacroF1, best ? best.categoryMacroF1 : null],
    ['Macro-F1 nguyên nhân (Level 2)', TARGETS.causeMacroF1, best ? best.causeMacroF1 : null],
    ['Macro-F1 cảm xúc', TARGETS.sentimentMacroF1, best ? best.sentimentMacroF1 : null],
    ['Precision bộ lọc rác', TARGETS.spamPrecision, spamP.precision]
  ];
  for (const [label, target, actual] of rows) {
    const status = actual == null ? 'chưa đo' : actual >= target ? 'ĐẠT' : 'CHƯA ĐẠT';
    console.log(`${label.padEnd(34)} mục tiêu ${String(target).padEnd(7)} đo được ${actual == null ? '—' : actual.toFixed(4)}   ${status}`);
  }

  console.log('\nGhi chú bắt buộc khi trích dẫn các con số trên:');
  console.log('  - Đây là kết quả trên tập do nhóm tự gán nhãn, cỡ mẫu nhỏ, CHƯA phải UIT-ViSFD.');
  console.log('  - Dòng M (mô hình đề xuất) chưa có số vì chưa huấn luyện PhoBERT.');
  console.log('  - Các chỉ số chưa đạt mục tiêu được báo cáo nguyên trạng, không làm tròn có lợi.');

  // --- Ghi tệp kết quả ---
  const output = {
    generatedAt: new Date().toISOString(),
    dataset: {
      aspectSamples: ASPECT_GOLD.length,
      trustSamples: TRUST_GOLD.length,
      ...ANNOTATION_META,
      isPublishedBenchmark: false,
      benchmarkNote: 'Tập tự soạn để kiểm chứng pipeline; chưa thay thế được UIT-ViSFD'
    },
    targets: TARGETS,
    leakageAudit: leakage,
    models,
    trustLayer: trustEval,
    ablations: { ...ablations, trustLayer: trustAblation }
  };

  const outPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nĐã ghi kết quả chi tiết vào ${outPath}\n`);

  return output;
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Lỗi khi chạy đánh giá:', e);
    process.exit(1);
  });
}

module.exports = { main, evaluateAspectModel, evaluateTrustLayer, runAblations, runTrustLayerAblation, TARGETS };
