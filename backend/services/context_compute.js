/**
 * PHẦN TÍNH TOÁN CỦA NGỮ CẢNH PHÂN TÍCH — hàm thuần, không đụng database
 * ==================================================================
 * Tách khỏi analysis_context.js để chạy được trong LUỒNG RIÊNG (worker thread).
 * Trust Layer chạy đồng bộ trên cả kho: đo trên CPU của Render, một lần tính
 * mất 18 giây (kho 6 nghìn phản hồi) tới gần một phút (kho 15 nghìn). Chạy
 * ngay trong luồng chính thì suốt thời gian đó MỌI request đều đứng, kể cả
 * luồng bình luận livestream. Luồng chính giờ chỉ đọc database (bất đồng bộ)
 * rồi giao phần tính cho worker.
 *
 * Vì kết quả đi qua postMessage (structured clone): `_id` phải là chuỗi (đối
 * tượng ObjectId mất prototype khi sao chép), và kết quả không được chứa hàm.
 */

const { runTrustLayer } = require('./trust_layer');
const taxonomy = require('./taxonomy');
const { decodeEntities } = require('./normalizer');
const { analysisCadence } = require('./cadence');
const { findPainPoints } = require('./pain_points');

/** Chuẩn hóa nhãn danh mục/nguyên nhân về taxonomy hiện hành */
function normalizeLabels(fb) {
  const category = taxonomy.normalizeCategory(fb.category);
  const cause = taxonomy.normalizeCause(category, fb.subCategory);
  return {
    ...fb,
    // Tên lưu từ trước còn mã HTML ("&amp;") thì giải ngay lúc đọc
    ...(typeof fb.productName === 'string' && fb.productName.includes('&') ? { productName: decodeEntities(fb.productName) } : {}),
    category,
    subCategory: cause,
    categoryLabel: taxonomy.categoryLabel(category),
    causeLabel: taxonomy.causeLabel(category, cause)
  };
}

/**
 * Ghi đè nhãn máy bằng nhãn người duyệt (collection audit_labels).
 * Chỉ ghi đè trường người đã sửa; trường người xác nhận "đúng" giữ nguyên.
 * Hàm thuần trên mảng, để kiểm thử được không cần database.
 */
function applyHumanLabels(feedbacks, labels) {
  if (!labels || !labels.length) return 0;
  const byId = new Map(labels.map((l) => [String(l.feedbackId), l]));
  let applied = 0;
  for (const f of feedbacks) {
    const l = byId.get(String(f._id));
    if (!l) continue;
    // Áp lại lên phản hồi đã có nhãn người (sửa nhãn lần hai): giữ nhãn máy GỐC
    if (!f.machineLabel) {
      f.machineLabel = { sentiment: f.sentiment, category: f.category, subCategory: f.subCategory, labelledBy: f.labelledBy };
    }
    if (l.correctSentiment) f.sentiment = l.correctSentiment;
    if (l.correctCategory) {
      if (l.correctCategory !== f.category) f.subCategory = l.correctCause || null;
      f.category = l.correctCategory;
    }
    if (l.correctCause) f.subCategory = l.correctCause;
    if (typeof l.sarcasm === 'boolean') {
      f.sarcasm = { ...(f.sarcasm || {}), verdict: l.sarcasm ? 'sarcastic' : 'literal', by: 'human' };
    }
    f.labelledBy = 'human';
    f.needsReview = false;
    applied += 1;
  }
  return applied;
}

/**
 * Nhãn kiểm duyệt (thật / rác / ảo) GHI ĐÈ phán đoán của Trust Layer trên một
 * phản hồi. Dùng lúc tính cả kho và lúc người dùng vừa bấm duyệt (vá ngay bản
 * đang phục vụ, không chờ tính lại).
 */
function applyReviewLabel(item, label) {
  if (!item?.trust || !label) return;
  item.trust.humanLabel = label.label;
  item.trust.labelledBy = label.by || 'người kiểm duyệt';
  item.trust.labelledAt = label.at;
  if (label.label === 'valid') {
    item.trust.band = 'ACCEPTED';
    item.trust.bandLabelVi = 'Chấp nhận (người kiểm duyệt xác nhận)';
    item.trust.weight = item.trust.tierWeight;
  } else if (label.label === 'inauthentic' || label.label === 'spam') {
    item.trust.band = label.label === 'spam' ? 'SPAM' : 'LIKELY_INAUTHENTIC';
    item.trust.bandLabelVi = label.label === 'spam' ? 'Nội dung rác (xác nhận)' : 'Không xác thực (xác nhận)';
    item.trust.weight = 0;
  }
}

/**
 * @param {object} input
 *   rawFeedbacks  đã sắp mới nhất trước, `_id` là chuỗi
 *   transactions, auditLabels, reviewLabels
 *   anchorToData  kho thật: mọi mốc thời gian tính theo đánh giá mới nhất
 *   halfLifeDays, modelSignals
 * @returns phần kết quả phụ thuộc dữ liệu của ngữ cảnh (không gồm transactions)
 */
function computeContext(input) {
  const { rawFeedbacks, transactions, auditLabels = [], reviewLabels = [], anchorToData, halfLifeDays, modelSignals } = input;
  const feedbacks = rawFeedbacks.map(normalizeLabels);

  let dataAsOf = null;
  let ingestedAt = null;
  if (anchorToData && feedbacks.length) {
    // Mốc dữ liệu: phản hồi mới nhất CÓ ngày thật (dòng nạp không ngày mang ngày nạp)
    const dated = feedbacks.find((f) => !f.timeInferred) || feedbacks[0];
    dataAsOf = new Date(dated.timestamp);
    if (Number.isNaN(dataAsOf.getTime())) dataAsOf = null;
    ingestedAt = feedbacks.reduce((max, f) => {
      const t = f.collectedAt ? new Date(f.collectedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0) || null;
  }

  // NHÃN NGƯỜI DUYỆT THẮNG NHÃN MÁY, áp TRƯỚC Trust Layer vì luật lệch sao đọc
  // chính nhãn cảm xúc này. Nhãn máy cũ giữ ở `machineLabel`.
  applyHumanLabels(feedbacks, auditLabels);

  const result = runTrustLayer(feedbacks, {
    orders: transactions,
    halfLifeDays,
    now: dataAsOf || undefined,
    ingestedAt: ingestedAt ? new Date(ingestedAt) : undefined,
    modelSignals: modelSignals || undefined
  });

  if (reviewLabels.length) {
    const labelMap = new Map(reviewLabels.map((l) => [String(l.feedbackId), l]));
    for (const item of result.items) {
      const label = labelMap.get(String(item._id));
      if (label) applyReviewLabel(item, label);
    }
  }

  // Nhịp phân tích (cửa sổ theo mật độ dữ liệu) và điểm đau của cả kho (không
  // lọc) tính luôn ở đây, trong worker: tách cụm từ cả kho mất vài giây, chạy
  // ở luồng chính thì chặn mọi request lần đầu mở trang Tổng quan.
  const anchor = dataAsOf || new Date();
  const cadence = analysisCadence(result.items, anchor);
  let pain = null;
  try {
    pain = findPainPoints(result.items, { now: anchor, trendDays: cadence.windowDays });
    // `members` (để dựng hồ sơ) là thuộc tính ẩn, không qua được postMessage: gửi kèm
    // mã các phản hồi thành viên, luồng chính ghép lại (analysis_context.attachPainMembers)
    for (const g of [...pain.groups, ...(pain.shop ? [pain.shop] : [])]) {
      for (const p of g.painPoints) p.memberIds = (p.members || []).map((f) => String(f._id));
    }
  } catch (e) {
    pain = null;
  }

  return {
    cadence,
    pain,
    items: result.items,
    clusters: result.clusters,
    bursts: result.bursts,
    accountProfiles: result.accountProfiles,
    funnel: result.funnel,
    modelSignals: result.modelSignals,
    asOf: dataAsOf ? dataAsOf.toISOString() : null,
    ingestedAt: ingestedAt ? new Date(ingestedAt).toISOString() : null
  };
}

module.exports = { computeContext, normalizeLabels, applyHumanLabels, applyReviewLabel };
