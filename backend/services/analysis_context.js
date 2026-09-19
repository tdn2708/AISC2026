/**
 * NGỮ CẢNH PHÂN TÍCH DÙNG CHUNG
 * ==================================================================
 * Mọi endpoint đều phải nhìn thấy CÙNG MỘT kết quả Trust Layer, nếu
 * không thì thẻ chỉ số, cảnh báo và phễu dữ liệu sẽ nói ba con số khác
 * nhau trên cùng một màn hình.
 *
 * Trust Layer chạy trên toàn bộ lô dữ liệu (các tín hiệu cụm trùng lặp,
 * đột biến và hành vi tài khoản đều cần nhìn cả quần thể, không thể
 * tính trên từng phản hồi rời rạc), nên kết quả được tính một lần rồi
 * dùng lại trong một khoảng ngắn.
 */

const { runTrustLayer } = require('./trust_layer');
const taxonomy = require('./taxonomy');
const visobert = require('./visobert_client');

const CACHE_TTL_MS = 30 * 1000;
let cache = { key: null, at: 0, value: null };
let ongoingPromise = null;

/** Chuẩn hóa nhãn danh mục/nguyên nhân về taxonomy hiện hành */
function normalizeLabels(fb) {
  const category = taxonomy.normalizeCategory(fb.category);
  const cause = taxonomy.normalizeCause(category, fb.subCategory);
  return {
    ...fb,
    category,
    subCategory: cause,
    categoryLabel: taxonomy.categoryLabel(category),
    causeLabel: taxonomy.causeLabel(category, cause)
  };
}

/**
 * Nạp dữ liệu và chạy Trust Layer một lần cho cả vòng đời request.
 * @param {import('mongodb').Db} db
 * @param {{ force?: boolean }} opts
 */
async function getContext(db, opts = {}) {
  // If there's an ongoing fetch and we don't force a refresh, wait for it
  if (ongoingPromise && !opts.force) {
    return ongoingPromise;
  }

  const doFetch = async () => {
    const [feedbackCount, txnCount] = await Promise.all([
      db.collection('feedbacks').estimatedDocumentCount(),
      db.collection('transactions').estimatedDocumentCount()
    ]);

    // Khóa cache dựa trên khối lượng dữ liệu: dữ liệu mới nạp thì khóa
    // đổi và Trust Layer chạy lại
    const key = `${feedbackCount}:${txnCount}`;
    const fresh = cache.value && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS;
    if (fresh && !opts.force) return cache.value;

    const [rawFeedbacks, transactions] = await Promise.all([
      db.collection('feedbacks').find({}).sort({ timestamp: -1 }).toArray(),
      db.collection('transactions').find({}).toArray()
    ]);

    const feedbacks = rawFeedbacks.map(normalizeLabels);

    // Tín hiệu ViSoBERT (vector nhúng cho T2, xác suất rác cho T1) nếu
    // được bật và dịch vụ đang chạy. Lỗi ở đây không được chặn Trust
    // Layer: không có tín hiệu mô hình thì chạy đúng như trước.
    let nlp = null;
    try {
      nlp = await visobert.trustSignals(feedbacks);
    } catch (e) {
      console.warn('[VISOBERT] Bỏ qua tín hiệu mô hình cho Trust Layer:', e.message);
    }

    const result = runTrustLayer(feedbacks, {
      orders: transactions,
      modelSignals: nlp ? nlp.signals : undefined
    });

    // Nhãn do người dùng kiểm duyệt GHI ĐÈ phán đoán của mô hình — đây là
    // nửa đầu của vòng lặp học chủ động: mỗi thao tác của người dùng là
    // một mẫu huấn luyện đúng ngành, đúng khách hàng của doanh nghiệp đó.
    const labels = await db.collection('review_labels').find({}).toArray();
    if (labels.length) {
      const labelMap = new Map(labels.map((l) => [String(l.feedbackId), l]));
      for (const item of result.items) {
        const label = labelMap.get(String(item._id));
        if (!label) continue;
        item.trust.humanLabel = label.label;
        item.trust.labelledBy = label.by || 'người kiểm duyệt';
        item.trust.labelledAt = label.at;
        if (label.label === 'valid') {
          item.trust.band = 'ACCEPTED';
          item.trust.bandLabelVi = 'Chấp nhận (người kiểm duyệt xác nhận)';
          item.trust.weight = item.trust.tierWeight;
        } else if (label.label === 'inauthentic' || label.label === 'spam') {
          item.trust.band = label.label === 'spam' ? 'SPAM' : 'LIKELY_INAUTHENTIC';
          item.trust.bandLabelVi =
            label.label === 'spam' ? 'Nội dung rác (xác nhận)' : 'Không xác thực (xác nhận)';
          item.trust.weight = 0;
        }
      }
    }

    const value = {
      items: result.items,
      clusters: result.clusters,
      bursts: result.bursts,
      accountProfiles: result.accountProfiles,
      funnel: result.funnel,
      transactions,
      transactionCount: transactions.length,
      humanLabelCount: labels.length,
      modelSignals: { ...result.modelSignals, source: nlp ? 'visobert' : null, ...(nlp ? nlp.meta : {}) },
      computedAt: new Date().toISOString()
    };

    cache = { key, at: Date.now(), value };
    return value;
  };

  try {
    ongoingPromise = doFetch();
    const res = await ongoingPromise;
    return res;
  } finally {
    ongoingPromise = null;
  }
}

function invalidate() {
  cache = { key: null, at: 0, value: null };
}

/** Bộ lọc dùng chung cho mọi endpoint (thời gian / nguồn / sản phẩm) */
function applyFilters(items, query = {}) {
  const { source, time, product, region } = query;
  let out = items;

  if (source && source !== 'All') out = out.filter((f) => f.source === source);
  if (product && product !== 'All') out = out.filter((f) => f.productName === product);
  if (region && region !== 'All') out = out.filter((f) => f.region === region);

  if (time && time !== 'All') {
    const now = new Date();
    let start = null;
    let end = null;

    if (time.startsWith('Custom:')) {
      const parts = time.split(':');
      if (parts.length === 3) {
        start = new Date(parts[1]);
        start.setHours(0, 0, 0, 0);
        end = new Date(parts[2]);
        end.setHours(23, 59, 59, 999);
      }
    } else if (time === 'Today') {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    } else if (time === 'This Week') {
      start = new Date(now.getTime() - 7 * 86400000);
    } else if (time === 'This Month') {
      start = new Date(now.getTime() - 30 * 86400000);
    }

    if (start) {
      out = out.filter((f) => {
        const t = new Date(f.timestamp).getTime();
        if (t < start.getTime()) return false;
        if (end && t > end.getTime()) return false;
        return true;
      });
    }
  }

  return out;
}

module.exports = { getContext, invalidate, applyFilters, normalizeLabels };
