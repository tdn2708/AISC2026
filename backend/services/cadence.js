/**
 * NHỊP PHÂN TÍCH THEO MẬT ĐỘ DỮ LIỆU (hàm thuần)
 * ==================================================================
 * Mọi phép "gần đây so với trước đó" (cảnh báo đột biến, tốc độ tiêu cực,
 * so sánh hai kỳ, biểu đồ xu hướng) cần một cửa sổ. Cửa sổ cố định 7 ngày so
 * với 28 ngày chỉ đúng với kho dày (vài trăm phản hồi mỗi tuần). Kho thật lấy
 * từ sàn thì thưa: đánh giá trải nhiều năm, 28 ngày gần nhất có khi chỉ vài
 * câu, nên kiểm định không bao giờ chạy và trang nào cũng "chưa có gì".
 *
 * Ở đây chọn cửa sổ theo chính dữ liệu: bậc nhỏ nhất trong BẬC mà
 *   - cửa sổ có ≥ MIN_WINDOW phản hồi được tính, và
 *   - phần nền (từ 1 tới BASE_RATIO lần cửa sổ, lùi về trước) có ≥ MIN_BASELINE.
 * Kho dày giữ đúng 7 so với 28 ngày như cũ; kho thưa tự giãn ra (ví dụ 6 tháng
 * so với 24 tháng). Không có bậc nào đủ thì lấy bậc đầu tiên có cửa sổ đủ câu,
 * không có nữa thì bậc lớn nhất, và ghi `enough: false` để giao diện nói thật.
 *
 * Tính MỘT lần cho cả kho (không theo bộ lọc), để mọi trang và mọi bộ lọc nói
 * cùng một cửa sổ.
 */

const DAY = 86400000;
const LADDER = [7, 14, 30, 60, 90, 180, 365, 730];
const MIN_WINDOW = 50;
const MIN_BASELINE = 100;
const BASE_RATIO = 4;
const TREND_BUCKETS = 14;

/** Khoảng ngày bằng chữ: dưới 60 ngày đếm ngày, từ 60 ngày đếm tháng */
function spanWords(days) {
  const d = Math.round(Number(days) || 0);
  if (d < 60) return `${d} ngày`;
  return `${Math.round(d / 30)} tháng`;
}

/**
 * @param {Array} items phản hồi đã qua Trust Layer
 * @param {Date|string|number} now mốc phân tích (kho thật: phản hồi mới nhất)
 * @param {(f) => boolean} isCountable
 */
function analysisCadence(items, now, isCountable = (f) => f && f.trust && f.trust.weight > 0) {
  const nowMs = new Date(now || Date.now()).getTime();
  // Tuổi (ngày) của từng phản hồi được tính, không tính phản hồi ở tương lai
  const ages = [];
  for (const f of items || []) {
    if (!isCountable(f)) continue;
    // Dòng nạp không có ngày (timeInferred) không nói gì về nhịp thời gian
    const t = f.timeInferred ? NaN : new Date(f.timestamp).getTime();
    if (!Number.isFinite(t) || t > nowMs) continue;
    ages.push((nowMs - t) / DAY);
  }
  ages.sort((a, b) => a - b);
  // Số phần tử có tuổi < x (tìm nhị phân)
  const below = (x) => {
    let lo = 0;
    let hi = ages.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ages[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const measure = (w) => {
    const windowSample = below(w);
    return { w, windowSample, baselineSample: below(w * BASE_RATIO) - windowSample };
  };
  const rungs = LADDER.map(measure);

  let pick = rungs.find((r) => r.windowSample >= MIN_WINDOW && r.baselineSample >= MIN_BASELINE);
  const enough = Boolean(pick);
  if (!pick) pick = rungs.find((r) => r.windowSample >= MIN_WINDOW) || rungs[rungs.length - 1];
  // Kho quá ít (mọi bậc đều thiếu) thì vẫn giữ 7 ngày nếu cửa sổ lớn cũng không hơn
  if (!enough && pick.windowSample === rungs[0].windowSample) pick = rungs[0];

  const windowDays = pick.w;
  const baselineDays = windowDays * BASE_RATIO;
  return {
    windowDays,
    baselineDays,
    windowSample: pick.windowSample,
    baselineSample: pick.baselineSample,
    enough,
    adaptive: windowDays !== LADDER[0],
    trendSpanDays: baselineDays,
    // Kho thưa: ô khoảng 2 tháng (6 đến 24 ô) để nhãn là tháng tròn, không phải "mỗi 51 ngày"
    trendBuckets: windowDays === LADDER[0] ? TREND_BUCKETS : Math.min(24, Math.max(6, Math.round(baselineDays / 60))),
    windowLabel: spanWords(windowDays),
    baselineLabel: spanWords(baselineDays),
    thresholds: { minWindow: MIN_WINDOW, minBaseline: MIN_BASELINE, ratio: BASE_RATIO }
  };
}

/** Nhịp mặc định khi chưa có ngữ cảnh (giữ đúng hành vi cũ) */
const DEFAULT_CADENCE = Object.freeze({
  windowDays: 7, baselineDays: 28, trendSpanDays: 28, trendBuckets: TREND_BUCKETS,
  windowLabel: '7 ngày', baselineLabel: '28 ngày', enough: true, adaptive: false
});

module.exports = { analysisCadence, spanWords, DEFAULT_CADENCE, LADDER, MIN_WINDOW, MIN_BASELINE, BASE_RATIO };
