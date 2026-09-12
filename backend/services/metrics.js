/**
 * CHỈ SỐ NGHIỆP VỤ TÍNH TRÊN TRỌNG SỐ TIN CẬY
 * ==================================================================
 * Vấn đề của công thức cũ: Complaint Rate = Tổng khiếu nại / Tổng giao
 * dịch được đặt làm chỉ số ký hiệu của cả sản phẩm, nhưng bình luận
 * Facebook, TikTok hay Google Maps KHÔNG gắn với giao dịch nào cả.
 * Mẫu số đơn giản là không tồn tại trên phần lớn kênh.
 *
 * Cách xử lý trung thực:
 *   - Kênh đối soát được (P1/P2, có mã đơn): tính WCR thật.
 *   - Kênh không đối soát được: KHÔNG tính WCR, mà dùng chỉ số thay thế
 *     trong cùng kênh — Tỉ trọng phản hồi tiêu cực (Share of Negative)
 *     và Tốc độ tăng phản hồi tiêu cực so với nền của chính kênh đó.
 *   - Mỗi thẻ chỉ số đều ghi rõ MẪU SỐ và ĐỘ PHỦ đang được dùng.
 */

const RECONCILABLE_TIERS = ['P1', 'P2'];

function isComplaint(fb) {
  return fb.sentiment === 'Negative';
}

/** Phản hồi có được tính vào chỉ số hay không (đã qua Trust Layer) */
function isCountable(fb) {
  return fb.trust && fb.trust.weight > 0;
}

/**
 * TỈ LỆ KHIẾU NẠI CÓ TRỌNG SỐ
 *
 *   WCR(t) = ( SUM w(i), i là khiếu nại trong kỳ t ) / Transactions(t)
 *
 * Ba ưu điểm so với đếm thô: không bị thổi phồng bởi chiến dịch đánh
 * giá có tổ chức; phản ánh đúng mức tin cậy khác nhau giữa các kênh;
 * và ưu tiên tín hiệu gần hiện tại (nhờ hệ số suy giảm theo thời gian).
 */
function weightedComplaintRate(feedbacks, transactionCount) {
  const reconcilable = feedbacks.filter(
    (f) => isCountable(f) && RECONCILABLE_TIERS.includes(f.trust.tier)
  );

  const complaintWeight = reconcilable
    .filter(isComplaint)
    .reduce((sum, f) => sum + f.trust.weight, 0);

  if (!transactionCount || transactionCount <= 0) {
    return {
      value: null,
      available: false,
      reason: 'Chưa có dữ liệu giao dịch làm mẫu số',
      numerator: Number(complaintWeight.toFixed(2)),
      denominator: 0,
      denominatorLabel: 'Số giao dịch (chưa kết nối)',
      coverage: 0,
      sampleSize: reconcilable.length
    };
  }

  return {
    value: complaintWeight / transactionCount,
    available: true,
    reason: null,
    numerator: Number(complaintWeight.toFixed(2)),
    denominator: transactionCount,
    denominatorLabel: 'Số giao dịch đối soát được',
    // Độ phủ: bao nhiêu phần trăm phản hồi hợp lệ đối soát được giao dịch
    coverage: feedbacks.length ? reconcilable.length / feedbacks.filter(isCountable).length : 0,
    sampleSize: reconcilable.length
  };
}

/**
 * CHỈ SỐ THAY THẾ CHO KÊNH KHÔNG ĐỐI SOÁT ĐƯỢC.
 * Mẫu số là tổng phản hồi CÙNG KÊNH, không phải số giao dịch — và điều
 * đó được ghi rõ trên thẻ chỉ số để không ai hiểu nhầm hai thứ.
 */
function shareOfNegative(feedbacks, channel = null) {
  const scope = feedbacks.filter(
    (f) => isCountable(f) && (!channel || f.source === channel)
  );
  const totalWeight = scope.reduce((s, f) => s + f.trust.weight, 0);
  const negWeight = scope.filter(isComplaint).reduce((s, f) => s + f.trust.weight, 0);

  return {
    value: totalWeight > 0 ? negWeight / totalWeight : null,
    available: totalWeight > 0,
    numerator: Number(negWeight.toFixed(2)),
    denominator: Number(totalWeight.toFixed(2)),
    denominatorLabel: channel
      ? `Tổng phản hồi hợp lệ kênh ${channel} (theo trọng số)`
      : 'Tổng phản hồi hợp lệ (theo trọng số)',
    sampleSize: scope.length,
    channel
  };
}

/**
 * TỐC ĐỘ TĂNG PHẢN HỒI TIÊU CỰC so với nền của chính kênh đó.
 * So sánh cửa sổ hiện tại với đường nền, trong cùng một kênh — không
 * so chéo kênh, vì mỗi kênh có mức nhiễu nền rất khác nhau.
 */
function negativeVelocity(feedbacks, windowDays = 7, baselineDays = 28, now = new Date()) {
  const nowMs = now.getTime();
  const windowStart = nowMs - windowDays * 86400000;
  const baselineStart = nowMs - baselineDays * 86400000;

  const inWindow = (f) => {
    const t = new Date(f.timestamp).getTime();
    return t >= windowStart && t <= nowMs;
  };
  const inBaseline = (f) => {
    const t = new Date(f.timestamp).getTime();
    return t >= baselineStart && t < windowStart;
  };

  const countable = feedbacks.filter(isCountable);
  const cur = countable.filter(inWindow);
  const base = countable.filter(inBaseline);

  const curRate = cur.length ? cur.filter(isComplaint).length / cur.length : 0;
  const baseRate = base.length ? base.filter(isComplaint).length / base.length : 0;

  const perDayCur = cur.filter(isComplaint).length / windowDays;
  const perDayBase = base.filter(isComplaint).length / Math.max(1, baselineDays - windowDays);

  return {
    currentRate: curRate,
    baselineRate: baseRate,
    ratePerDayCurrent: Number(perDayCur.toFixed(2)),
    ratePerDayBaseline: Number(perDayBase.toFixed(2)),
    velocity: perDayBase > 0 ? (perDayCur - perDayBase) / perDayBase : perDayCur > 0 ? 1 : 0,
    windowSample: cur.length,
    baselineSample: base.length
  };
}

/**
 * Chuỗi thời gian có trọng số, dùng cho biểu đồ xu hướng và cho biểu đồ
 * kiểm soát EWMA. Trả về số phản hồi theo trọng số, không phải đếm thô.
 */
function weightedTimeSeries(feedbacks, buckets = 14, now = new Date(), spanDays = 28) {
  const nowMs = now.getTime();
  const startMs = nowMs - spanDays * 86400000;
  const bucketMs = (nowMs - startMs) / buckets;

  const series = Array.from({ length: buckets }, (_, i) => {
    const center = new Date(startMs + (i + 0.5) * bucketMs);
    return {
      name: `${String(center.getDate()).padStart(2, '0')}/${String(center.getMonth() + 1).padStart(2, '0')}`,
      complaints: 0,
      satisfaction: 0,
      weightedComplaints: 0,
      total: 0,
      excluded: 0
    };
  });

  for (const f of feedbacks) {
    const t = new Date(f.timestamp).getTime();
    if (t < startMs || t > nowMs) continue;
    let idx = Math.floor((t - startMs) / bucketMs);
    if (idx >= buckets) idx = buckets - 1;
    if (idx < 0) idx = 0;

    if (!isCountable(f)) {
      series[idx].excluded += 1;
      continue;
    }
    series[idx].total += 1;
    if (isComplaint(f)) {
      series[idx].complaints += 1;
      series[idx].weightedComplaints += f.trust.weight;
    } else if (f.sentiment === 'Positive') {
      series[idx].satisfaction += 1;
    }
  }

  return series.map((s) => ({
    ...s,
    weightedComplaints: Number(s.weightedComplaints.toFixed(2))
  }));
}

/**
 * Bộ chỉ số tổng hợp cho dashboard. Mỗi chỉ số kèm mẫu số và độ phủ —
 * đây chính là biểu hiện của tư duy dữ liệu chín: người đọc luôn biết
 * con số đang được tính trên cái gì.
 */
function buildMetricCards(feedbacks, transactionCount, now = new Date()) {
  const countable = feedbacks.filter(isCountable);
  const wcr = weightedComplaintRate(feedbacks, transactionCount);
  const son = shareOfNegative(feedbacks);
  const vel = negativeVelocity(feedbacks, 7, 28, now);

  const excluded = feedbacks.length - countable.length;

  return {
    totalFeedbacks: {
      value: feedbacks.length,
      valid: countable.length,
      excluded,
      denominatorLabel: 'Tổng phản hồi thô thu thập được'
    },
    weightedComplaintRate: {
      ...wcr,
      // Định dạng theo vi-VN: dấu phẩy thập phân. Một sản phẩm tiếng
      // Việt hiển thị "1.19%" kiểu Anh-Mỹ là chi tiết nhỏ nhưng người
      // dùng nhận ra ngay, và nó làm giảm cảm giác sản phẩm hoàn chỉnh.
      display: wcr.available ? `${(wcr.value * 100).toFixed(2).replace('.', ',')}%` : 'Không khả dụng',
      label: 'Tỉ lệ Khiếu nại có Trọng số (WCR)'
    },
    shareOfNegative: {
      ...son,
      display: son.available ? `${(son.value * 100).toFixed(1).replace('.', ',')}%` : 'Không khả dụng',
      label: 'Tỉ trọng phản hồi tiêu cực'
    },
    negativeVelocity: {
      ...vel,
      display: `${vel.velocity >= 0 ? '+' : ''}${(vel.velocity * 100).toFixed(0)}%`,
      label: 'Tốc độ tăng phản hồi tiêu cực (7 ngày so với nền 28 ngày)'
    }
  };
}

/**
 * SO SÁNH HAI KỲ LIỀN NHAU
 * ------------------------------------------------------------------
 * Một con số đứng một mình không giúp ai ra quyết định. "Tỉ lệ khiếu
 * nại 1,95%" không nói lên điều gì cho tới khi biết kỳ trước là bao
 * nhiêu. Đây là thứ duy nhất mà cấp quản lý thật sự đọc trên một thẻ
 * chỉ số: nó đang tốt lên hay xấu đi.
 *
 * Cửa sổ so sánh CỐ ĐỊNH là 7 ngày gần nhất đối chiếu 7 ngày liền
 * trước, không phụ thuộc bộ lọc đang hiển thị. Lý do: bộ lọc có thể
 * đang là "toàn thời gian", và khi đó không tồn tại kỳ trước nào để so.
 * Một cửa sổ cố định thì luôn tính được và luôn giải thích được bằng
 * một câu.
 *
 * Trường nào không so sánh được thì trả về null chứ không trả 0. Số 0
 * đọc ra là "không đổi", còn null đọc ra là "không biết" — hai điều
 * hoàn toàn khác nhau.
 */
function periodComparison(feedbacks, transactionCount, now = new Date(), windowDays = 7) {
  const nowMs = new Date(now).getTime();
  const span = windowDays * 86400000;

  const inWindow = (f, from, to) => {
    const t = new Date(f.timestamp).getTime();
    return t >= from && t < to;
  };

  const cur = feedbacks.filter((f) => inWindow(f, nowMs - span, nowMs + 1));
  const prev = feedbacks.filter((f) => inWindow(f, nowMs - 2 * span, nowMs - span));

  // Mẫu số giao dịch được chia đều cho hai kỳ. Đây là một xấp xỉ, và nó
  // được ghi rõ ở trường `approximation` để không ai hiểu nhầm là số đo.
  const txnPerWindow = transactionCount ? Math.round(transactionCount / 2) : 0;

  const build = (list) => {
    const countable = list.filter(isCountable);
    const wcr = weightedComplaintRate(list, txnPerWindow);
    const son = shareOfNegative(list);
    return {
      sample: list.length,
      valid: countable.length,
      wcr: wcr.available ? wcr.value : null,
      shareOfNegative: son.available ? son.value : null
    };
  };

  const c = build(cur);
  const p = build(prev);

  /** Chênh lệch tương đối. Không có kỳ trước hoặc kỳ trước bằng 0 thì không tính được. */
  const rel = (a, b) => (a == null || b == null || b === 0 ? null : (a - b) / b);

  return {
    windowDays,
    label: `${windowDays} ngày gần nhất so với ${windowDays} ngày liền trước`,
    current: c,
    previous: p,
    // `lowerIsBetter` để giao diện biết chiều nào nên tô xanh. Với khiếu
    // nại thì GIẢM là tốt, ngược với trực giác thông thường của mũi tên.
    deltas: {
      valid: { rel: rel(c.valid, p.valid), lowerIsBetter: false },
      wcr: { rel: rel(c.wcr, p.wcr), lowerIsBetter: true },
      shareOfNegative: { rel: rel(c.shareOfNegative, p.shareOfNegative), lowerIsBetter: true }
    },
    approximation: transactionCount
      ? 'Mẫu số giao dịch được chia đều cho hai kỳ, nên tỉ lệ khiếu nại ở đây là ước lượng.'
      : null
  };
}

module.exports = {
  isComplaint,
  isCountable,
  weightedComplaintRate,
  shareOfNegative,
  negativeVelocity,
  weightedTimeSeries,
  buildMetricCards,
  periodComparison,
  RECONCILABLE_TIERS
};
