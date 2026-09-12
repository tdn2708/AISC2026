/**
 * CHỈ SỐ ĐÁNH GIÁ MÔ HÌNH PHÂN LOẠI
 * ==================================================================
 * Cài đặt trực tiếp thay vì gọi thư viện, vì ba lý do: không thêm phụ
 * thuộc cho một phép tính đơn giản, kiểm thử được từng bước, và quan
 * trọng nhất — người đọc mã có thể kiểm chứng công thức thay vì phải
 * tin vào một hộp đen.
 */

/**
 * Ma trận nhầm lẫn theo từng lớp, dạng one-vs-rest.
 * @param {Array} gold nhãn đúng
 * @param {Array} pred nhãn dự đoán
 * @param {Array} labels tập lớp cần tính
 */
function perClassCounts(gold, pred, labels) {
  const counts = new Map(labels.map((l) => [l, { tp: 0, fp: 0, fn: 0, support: 0 }]));

  for (let i = 0; i < gold.length; i++) {
    const g = gold[i];
    const p = pred[i];

    if (counts.has(g)) counts.get(g).support += 1;

    if (g === p) {
      if (counts.has(g)) counts.get(g).tp += 1;
    } else {
      if (counts.has(p)) counts.get(p).fp += 1;
      if (counts.has(g)) counts.get(g).fn += 1;
    }
  }

  return counts;
}

function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

/**
 * Precision / Recall / F1 cho từng lớp, kèm macro và micro.
 *
 * Lưu ý về cách chọn chỉ số tổng hợp:
 *   - Macro-F1 tính trung bình KHÔNG trọng số qua các lớp, nên lớp hiếm
 *     có tiếng nói ngang lớp phổ biến. Đây là chỉ số chính cần báo cáo
 *     khi nhãn mất cân bằng — mà nhãn khiếu nại thì luôn mất cân bằng
 *     ("Thất lạc" hiếm hơn "Giao chậm" rất nhiều).
 *   - Micro-F1 gộp toàn bộ tp/fp/fn nên bị lớp phổ biến chi phối; với
 *     bài toán một-nhãn thì micro-F1 chính là accuracy.
 */
function classificationReport(gold, pred, labels) {
  if (gold.length !== pred.length) {
    throw new Error(`Số nhãn đúng (${gold.length}) khác số dự đoán (${pred.length})`);
  }

  const counts = perClassCounts(gold, pred, labels);
  const perClass = {};

  let macroP = 0;
  let macroR = 0;
  let macroF = 0;
  let sumTp = 0;
  let sumFp = 0;
  let sumFn = 0;
  let labelsWithSupport = 0;

  for (const label of labels) {
    const c = counts.get(label);
    const precision = safeDiv(c.tp, c.tp + c.fp);
    const recall = safeDiv(c.tp, c.tp + c.fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);

    perClass[label] = {
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: c.support,
      tp: c.tp,
      fp: c.fp,
      fn: c.fn
    };

    sumTp += c.tp;
    sumFp += c.fp;
    sumFn += c.fn;

    // Chỉ tính trung bình macro trên các lớp THỰC SỰ CÓ MẪU. Lớp không
    // có mẫu nào trong tập kiểm tra mà vẫn đưa F1 = 0 vào trung bình sẽ
    // kéo macro-F1 xuống một cách vô nghĩa.
    if (c.support > 0) {
      macroP += precision;
      macroR += recall;
      macroF += f1;
      labelsWithSupport += 1;
    }
  }

  const n = Math.max(1, labelsWithSupport);
  const microP = safeDiv(sumTp, sumTp + sumFp);
  const microR = safeDiv(sumTp, sumTp + sumFn);

  let correct = 0;
  for (let i = 0; i < gold.length; i++) if (gold[i] === pred[i]) correct += 1;

  return {
    perClass,
    macroPrecision: Number((macroP / n).toFixed(4)),
    macroRecall: Number((macroR / n).toFixed(4)),
    macroF1: Number((macroF / n).toFixed(4)),
    microPrecision: Number(microP.toFixed(4)),
    microRecall: Number(microR.toFixed(4)),
    microF1: Number(safeDiv(2 * microP * microR, microP + microR).toFixed(4)),
    accuracy: Number((correct / Math.max(1, gold.length)).toFixed(4)),
    sampleSize: gold.length,
    labelsEvaluated: labelsWithSupport
  };
}

/**
 * Ma trận nhầm lẫn đầy đủ — để biết mô hình nhầm lớp nào với lớp nào,
 * chứ không chỉ biết nó sai bao nhiêu phần trăm. Phần phân tích lỗi
 * dựa trên ma trận này.
 */
function confusionMatrix(gold, pred, labels) {
  const idx = new Map(labels.map((l, i) => [l, i]));
  const m = labels.map(() => labels.map(() => 0));

  for (let i = 0; i < gold.length; i++) {
    const g = idx.get(gold[i]);
    const p = idx.get(pred[i]);
    if (g === undefined || p === undefined) continue;
    m[g][p] += 1;
  }

  return { labels, matrix: m };
}

/**
 * HỆ SỐ COHEN'S KAPPA — độ đồng thuận giữa hai người gán nhãn, đã loại
 * trừ phần đồng thuận do ngẫu nhiên.
 *
 *   kappa = (Po - Pe) / (1 - Pe)
 *
 * Po là tỉ lệ đồng thuận quan sát được, Pe là tỉ lệ đồng thuận kỳ vọng
 * nếu hai người gán độc lập ngẫu nhiên theo phân phối biên của họ.
 *
 * Vì sao không dùng tỉ lệ đồng thuận thô: nếu 90% mẫu thuộc cùng một
 * lớp, hai người gán bừa cùng lớp đó cũng đạt 90% đồng thuận mà không
 * mang thông tin nào.
 */
function cohensKappa(annotatorA, annotatorB) {
  if (annotatorA.length !== annotatorB.length) {
    throw new Error('Hai người gán phải có cùng số mẫu');
  }
  const n = annotatorA.length;
  if (n === 0) return { kappa: null, note: 'Không có mẫu' };

  const labels = [...new Set([...annotatorA, ...annotatorB])];

  let agree = 0;
  for (let i = 0; i < n; i++) if (annotatorA[i] === annotatorB[i]) agree += 1;
  const po = agree / n;

  let pe = 0;
  for (const label of labels) {
    const pa = annotatorA.filter((x) => x === label).length / n;
    const pb = annotatorB.filter((x) => x === label).length / n;
    pe += pa * pb;
  }

  if (pe === 1) {
    return { kappa: null, po, pe, note: 'Cả hai gán cùng một nhãn cho mọi mẫu, kappa không xác định' };
  }

  const kappa = (po - pe) / (1 - pe);

  // Thang diễn giải Landis & Koch (1977)
  let interpretation;
  if (kappa < 0) interpretation = 'Kém hơn ngẫu nhiên';
  else if (kappa < 0.2) interpretation = 'Rất thấp';
  else if (kappa < 0.4) interpretation = 'Thấp';
  else if (kappa < 0.6) interpretation = 'Trung bình';
  else if (kappa < 0.8) interpretation = 'Đáng kể';
  else interpretation = 'Gần như hoàn toàn';

  return {
    kappa: Number(kappa.toFixed(4)),
    po: Number(po.toFixed(4)),
    pe: Number(pe.toFixed(4)),
    interpretation,
    sampleSize: n
  };
}

/**
 * Khoảng tin cậy Wilson cho một tỉ lệ.
 *
 * Dùng Wilson thay vì khoảng chuẩn (p ± 1.96·SE) vì với cỡ mẫu nhỏ —
 * đúng tình huống của tập đánh giá hiện tại — khoảng chuẩn cho cận
 * dưới âm hoặc cận trên vượt 1, tức là vô nghĩa.
 *
 * Báo cáo khoảng tin cậy kèm F1 là bắt buộc khi cỡ mẫu nhỏ: "F1 = 0.72"
 * trên 80 mẫu và trên 8.000 mẫu là hai mức độ chắc chắn hoàn toàn khác nhau.
 */
function wilsonInterval(successes, total, z = 1.96) {
  if (total === 0) return { low: 0, high: 0, note: 'Không có mẫu' };

  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));

  return {
    point: Number(p.toFixed(4)),
    low: Number(Math.max(0, (centre - spread) / denom).toFixed(4)),
    high: Number(Math.min(1, (centre + spread) / denom).toFixed(4)),
    total
  };
}

module.exports = {
  classificationReport,
  confusionMatrix,
  cohensKappa,
  wilsonInterval,
  perClassCounts
};
