/**
 * KIỂM TRA RÒ RỈ TẬP KIỂM TRA
 * ==================================================================
 * Đây là phần dễ bị bỏ quên nhất của một quy trình đánh giá, và cũng là
 * phần khiến con số F1 trở nên vô giá trị nếu bỏ quên.
 *
 * BỐI CẢNH THẬT (ghi lại để không ai lặp lại):
 * Trong lần chạy đầu, bộ phân loại luật đạt Macro-F1 = 0.19 trên tập
 * kiểm tra. Sau khi mở rộng danh sách từ khóa, con số nhảy lên 0.97 —
 * một mức tăng đẹp tới mức đáng ngờ. Kiểm tra lại thì phát hiện 61 từ
 * khóa mới được lấy ra từ chính câu văn trong tập kiểm tra. Bộ phân
 * loại không hề khái quát hóa tốt hơn; nó chỉ đơn giản đã học thuộc
 * đáp án.
 *
 * Sau khi gỡ 61 từ khóa đó, con số quay về mức phản ánh đúng năng lực.
 *
 * NGUYÊN TẮC ĐƯỢC RÚT RA VÀ MÃ HÓA THÀNH KIỂM TRA TỰ ĐỘNG:
 * Một từ khóa chỉ hợp lệ nếu nó được chứng minh bởi TẬP PHÁT TRIỂN.
 * Từ khóa chỉ khớp ở tập kiểm tra mà không khớp ở tập phát triển, theo
 * đúng định nghĩa, là rò rỉ đáp án.
 */

const taxonomy = require('../services/taxonomy');
const { normalize } = require('../services/normalizer');

/** Lấy toàn bộ từ khóa dạng chuỗi trong taxonomy */
function allStringKeywords() {
  const out = [];
  for (const [catKey, cat] of Object.entries(taxonomy.TAXONOMY)) {
    for (const [causeKey, cause] of Object.entries(cat.causes)) {
      for (const kw of cause.keywords) {
        if (typeof kw === 'string') out.push({ keyword: kw, category: catKey, cause: causeKey });
      }
    }
  }
  return out;
}

/** Tập hợp các từ khóa khớp được trên một tập dữ liệu */
function firedKeywords(dataset, keywords) {
  const fired = new Set();
  for (const g of dataset) {
    const t = normalize(g.text).normalized;
    for (const k of keywords) {
      if (t.includes(k.keyword)) fired.add(k.keyword);
    }
  }
  return fired;
}

/**
 * Chạy kiểm tra rò rỉ.
 * @returns {{clean: boolean, leaked: string[], ...}}
 */
function auditLeakage(devSet, testSet) {
  const keywords = allStringKeywords();
  const devFired = firedKeywords(devSet, keywords);
  const testFired = firedKeywords(testSet, keywords);

  const leaked = [...testFired].filter((k) => !devFired.has(k));

  return {
    clean: leaked.length === 0,
    totalKeywords: keywords.length,
    firedOnDev: devFired.size,
    firedOnTest: testFired.size,
    leaked,
    leakedCount: leaked.length,
    verdict: leaked.length === 0
      ? 'Không phát hiện rò rỉ: mọi từ khóa khớp trên tập kiểm tra đều đã được chứng minh bởi tập phát triển.'
      : `CẢNH BÁO: ${leaked.length} từ khóa chỉ khớp ở tập kiểm tra. Con số F1 báo cáo đang bị thổi phồng.`
  };
}

module.exports = { auditLeakage, allStringKeywords, firedKeywords };
