/**
 * GÁN NHÃN NHIỀU TẦNG CHO DỮ LIỆU THẬT
 * ==================================================================
 *   1. Mô hình chính gán nhãn (ViSoBERT nếu có, không thì LLM; LLM nhận cả
 *      số sao và được dặn cách nhận ra mỉa mai).
 *   2. Luật mỉa mai (sarcasm.js) đánh dấu câu NGHI mỉa mai hoặc lệch sao.
 *   3. Câu bị đánh dấu được hỏi thêm MỘT mô hình khác (judgeSarcasm).
 *   4. Bỏ phiếu: mô hình chính + mô hình thứ hai + số sao. Không có đa số,
 *      hoặc hai mô hình chỉ ra hai vấn đề khác nhau → cần người duyệt.
 *
 * Mọi phiếu được lưu lại trong `labelVotes`, nên nhãn cuối luôn truy được
 * về: ai nói gì, số sao là bao nhiêu, vì sao chọn nhãn này.
 */

const { analyzeFeedbackBatch, judgeSarcasm } = require('./ai_analyzer');
const { sarcasmSignals, resolveVotes, ratingVote } = require('./sarcasm');

const toItem = (r) =>
  typeof r === 'string'
    ? { text: r, rating: null }
    : { text: String(r?.text ?? r?.rawText ?? ''), rating: Number.isFinite(Number(r?.rating)) && r?.rating != null ? Number(r.rating) : null };

/**
 * Gắn kết quả kiểm tra mỉa mai và bỏ phiếu vào một nhãn đã có.
 * Hàm thuần — dùng chung cho lúc thu thập và cho script gán lại kho cũ.
 */
function applyJudgement(item, primary, judge) {
  const signals = sarcasmSignals({ text: item.text, rating: item.rating, sentiment: primary.sentiment });
  const flagged = signals.suspected || signals.ratingConflict || primary.sarcasm === true;
  if (!flagged) {
    return {
      ...primary,
      sarcasm: { suspected: false, verdict: primary.sarcasm === true ? 'sarcastic' : null, signals: [], by: primary.labelledBy },
      needsReview: false
    };
  }

  const vote = resolveVotes(primary, judge, item.rating);
  // Phiếu thứ hai hỏng (mất mạng, hết lượt): không đoán, đẩy sang người duyệt
  const judgeMissing = !judge;
  const verdict = judge ? (judge.sarcastic ? 'sarcastic' : 'literal') : primary.sarcasm === true ? 'sarcastic' : null;
  return {
    ...primary,
    sentiment: vote.sentiment,
    category: vote.category,
    subCategory: vote.subCategory,
    sarcasm: {
      suspected: true,
      verdict,
      signals: signals.signals.concat(signals.ratingConflict ? ['Sao cao nhưng nhãn Tiêu cực'] : []),
      reason: judge?.reason || null,
      by: judge?.by || primary.labelledBy
    },
    labelVotes: {
      primary: { sentiment: primary.sentiment, category: primary.category, subCategory: primary.subCategory, by: primary.labelledBy, sarcasm: primary.sarcasm ?? null },
      judge: judge ? { sentiment: judge.sentiment, category: judge.category, subCategory: judge.subCategory, sarcastic: judge.sarcastic, by: judge.by } : null,
      rating: ratingVote(item.rating),
      tally: vote.tally
    },
    needsReview: judgeMissing || vote.needsReview,
    labelledBy: vote.sentiment !== primary.sentiment || vote.category !== primary.category ? 'cascade' : primary.labelledBy
  };
}

/**
 * @param {Array<string|{text, rating}>} reviews
 * @returns {Promise<Array>} nhãn cùng thứ tự đầu vào
 */
async function labelReviews(reviews) {
  const items = (reviews || []).map(toItem);
  if (!items.length) return [];
  const primary = await analyzeFeedbackBatch(items);

  const flaggedIdx = [];
  items.forEach((it, i) => {
    const s = sarcasmSignals({ text: it.text, rating: it.rating, sentiment: primary[i]?.sentiment });
    if (s.suspected || s.ratingConflict || primary[i]?.sarcasm === true) flaggedIdx.push(i);
  });

  let judges = [];
  if (flaggedIdx.length) {
    judges = (await judgeSarcasm(flaggedIdx.map((i) => ({ text: items[i].text, rating: items[i].rating, primary: primary[i] })))) || flaggedIdx.map(() => null);
  }
  const judgeAt = new Map(flaggedIdx.map((i, k) => [i, judges[k] || null]));

  return items.map((it, i) => applyJudgement(it, primary[i] || {}, judgeAt.get(i) ?? null));
}

module.exports = { labelReviews, applyJudgement };
