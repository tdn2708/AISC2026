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

/**
 * CHIẾN LƯỢC BỘ ĐỆM
 * Nạp lại cả kho + chạy Trust Layer tốn vài giây (đo trên 6,4 nghìn phản
 * hồi và 25,8 nghìn giao dịch trên Atlas: ~8 giây). Bản cũ làm việc đó NGAY
 * TRONG request cứ mỗi 30 giây, nên cứ nửa phút lại có người dùng chờ 8 giây.
 *
 *  - Mọi thao tác ghi trong tiến trình này đều gọi invalidate(), nên bộ đệm
 *    chỉ cần tự làm mới để bắt thay đổi từ BÊN NGOÀI (script seed chạy riêng).
 *  - Hết TTL: trả ngay bản đang có và làm mới ở nền (stale-while-revalidate).
 *    Làm mới nền chỉ tính lại khi số bản ghi đổi, hoặc khi bản đang có đã quá
 *    MAX_AGE (trọng số tin cậy suy giảm theo tuổi phản hồi nên cần tính lại định kỳ).
 *  - invalidate() tăng "thế hệ": kết quả của một lần nạp bắt đầu TRƯỚC khi
 *    invalidate không được ghi vào bộ đệm, và request sau invalidate không
 *    được nhận lời hứa cũ — nếu không, nhãn vừa gán có thể biến mất 30 giây.
 */
const CACHE_TTL_MS = 30 * 1000;
// Tính lại định kỳ chỉ để trọng số tin cậy suy giảm theo tuổi phản hồi (nửa
// chu kỳ 30 ngày: 3 giờ chỉ đổi ~0,3%). Không đặt ngắn: Trust Layer chạy đồng
// bộ, trên CPU yếu của Render một lần tính mất hơn chục giây và chặn mọi request.
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const FETCH_BATCH = 5000;
// Chỉ các trường giao dịch thật sự được dùng (đối soát, doanh thu rủi ro, vùng)
const TXN_PROJECTION = { _id: 0, orderId: 1, productName: 1, region: 1, orderedAt: 1, deliveredAt: 1, amount: 1 };

let cache = { key: null, at: 0, computedAt: 0, value: null, generation: 0 };
let generation = 0;
let ongoing = null; // { generation, promise }

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
  const valid = cache.value && cache.generation === generation;

  if (!opts.force && valid) {
    if (Date.now() - cache.at >= CACHE_TTL_MS) {
      // Hết hạn: trả bản đang có ngay, làm mới ở nền
      refresh(db, { onlyIfChanged: true }).catch((e) =>
        console.warn('[CONTEXT] Làm mới nền thất bại, giữ bản cũ:', e.message)
      );
    }
    return cache.value;
  }

  return refresh(db, { onlyIfChanged: false });
}

/** Một lần nạp duy nhất cho mỗi thế hệ dữ liệu; các request đồng thời dùng chung */
function refresh(db, { onlyIfChanged }) {
  if (ongoing && ongoing.generation === generation) return ongoing.promise;

  const gen = generation;
  const promise = doFetch(db, gen, onlyIfChanged).finally(() => {
    if (ongoing && ongoing.promise === promise) ongoing = null;
  });
  ongoing = { generation: gen, promise };
  return promise;
}

async function doFetch(db, gen, onlyIfChanged) {
  const [feedbackCount, txnCount] = await Promise.all([
    db.collection('feedbacks').estimatedDocumentCount(),
    db.collection('transactions').estimatedDocumentCount()
  ]);

  // Khóa cache dựa trên khối lượng dữ liệu: dữ liệu mới nạp thì khóa
  // đổi và Trust Layer chạy lại
  const key = `${feedbackCount}:${txnCount}`;
  if (
    onlyIfChanged && cache.value && cache.generation === gen &&
    cache.key === key && Date.now() - cache.computedAt < MAX_AGE_MS
  ) {
    cache.at = Date.now();
    return cache.value;
  }

  // batchSize lớn: mặc định driver kéo 101 tài liệu mỗi lượt, mỗi lượt là
  // một vòng mạng tới Atlas — riêng bước này đã tốn vài giây
  const [rawFeedbacks, transactions] = await Promise.all([
    db.collection('feedbacks').find({}).sort({ timestamp: -1 }).batchSize(FETCH_BATCH).toArray(),
    db.collection('transactions').find({}, { projection: TXN_PROJECTION }).batchSize(FETCH_BATCH).toArray()
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

  // Dữ liệu đã bị invalidate trong lúc nạp: không ghi đè bộ đệm bằng bản cũ
  if (gen === generation) {
    const now = Date.now();
    cache = { key, at: now, computedAt: now, value, generation: gen };
  }
  return value;
}

function invalidate() {
  generation += 1;
  cache = { key: null, at: 0, computedAt: 0, value: null, generation };
}

/** Bộ lọc dùng chung cho mọi endpoint (thời gian / nguồn / sản phẩm) */
function applyFilters(items, query = {}) {
  // `?time=a&time=b` cho ra mảng; `time.startsWith` trên mảng từng ném TypeError
  const one = (v) => {
    const x = Array.isArray(v) ? v[0] : v;
    return x == null ? undefined : String(x);
  };
  const q = query || {};
  const source = one(q.source);
  const time = one(q.time);
  const product = one(q.product);
  const region = one(q.region);
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
        // Ngày sai định dạng: bỏ qua bộ lọc thay vì so sánh với NaN
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          start = null;
          end = null;
        }
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
