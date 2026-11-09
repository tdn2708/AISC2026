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

const { runTrustLayer, DEFAULT_HALF_LIFE_DAYS } = require('./trust_layer');
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
// Kho có dữ liệu phát lại (seed với --future): phản hồi "tới giờ" liên tục nên
// tính lại mỗi giờ. Độ tươi đạt tối đa khi phản hồi mới nhất trễ dưới 1 giờ.
const REPLAY_MAX_AGE_MS = 60 * 60 * 1000;
const FETCH_BATCH = 5000;

/**
 * Kho dữ liệu thật tính thời gian THEO MỐC DỮ LIỆU: đánh giá thật trên sàn thưa
 * (sản phẩm bán chạy nhất có khi cả tháng mới có một đánh giá mới), nên "7 ngày
 * tính đến hôm nay" gần như luôn trống và trọng số giảm theo tuổi về 0. Mọi cửa
 * sổ thời gian, trọng số và kiểm định của kho này lấy mốc là đánh giá mới nhất
 * trong kho (asOf), còn độ tươi đo theo lần thu thập gần nhất (ingestedAt) — để
 * độ tươi không thành số đẹp giả.
 */
const REAL_DB = process.env.MONGODB_REAL_DB || 'customer_radar_real';
const anchorsToData = (db) => db.databaseName === REAL_DB;

/**
 * Chu kỳ bán rã của trọng số theo kho. Kho mô phỏng giữ 30 ngày (mặc định
 * của Trust Layer). Kho thật trên sàn rất thưa — đánh giá Tiki phần lớn từ
 * 2021–2023, cả năm gần nhất chỉ vài chục — nên với 30 ngày, mọi đánh giá cũ
 * hơn ~14 tháng về trọng số 0 và trang Tổng quan chỉ còn tính 62/3.783.
 * 180 ngày vẫn ưu tiên phản hồi mới mà không xoá trắng lịch sử.
 */
const REAL_HALF_LIFE_DAYS = Number(process.env.REAL_HALF_LIFE_DAYS) || 180;

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
    f.machineLabel = { sentiment: f.sentiment, category: f.category, subCategory: f.subCategory, labelledBy: f.labelledBy };
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

/** "Bây giờ" của một ngữ cảnh: mốc dữ liệu với kho thật, giờ thật với kho mô phỏng */
const ctxNow = (ctx) => (ctx && ctx.asOf ? new Date(ctx.asOf) : new Date());
// Chỉ các trường giao dịch thật sự được dùng (đối soát, doanh thu rủi ro, vùng)
const TXN_PROJECTION = { _id: 0, orderId: 1, productName: 1, region: 1, orderedAt: 1, deliveredAt: 1, amount: 1 };

/**
 * Trạng thái bộ đệm RIÊNG cho từng database. Máy chủ phục vụ cùng lúc kho mô
 * phỏng và kho dữ liệu thật (người xem chuyển qua lại), nên một bộ đệm dùng
 * chung sẽ trả nhầm số liệu của kho này cho kho kia.
 */
const states = new Map();
function stateFor(db) {
  const name = db.databaseName;
  if (!states.has(name)) {
    states.set(name, { cache: { key: null, at: 0, computedAt: 0, value: null, generation: 0 }, generation: 0, ongoing: null });
  }
  return states.get(name);
}

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
  const st = stateFor(db);
  const valid = st.cache.value && st.cache.generation === st.generation;

  if (!opts.force && valid) {
    if (Date.now() - st.cache.at >= CACHE_TTL_MS) {
      // Hết hạn: trả bản đang có ngay, làm mới ở nền
      refresh(db, { onlyIfChanged: true }).catch((e) =>
        console.warn('[CONTEXT] Làm mới nền thất bại, giữ bản cũ:', e.message)
      );
    }
    return st.cache.value;
  }

  return refresh(db, { onlyIfChanged: false });
}

/** Một lần nạp duy nhất cho mỗi thế hệ dữ liệu; các request đồng thời dùng chung */
function refresh(db, { onlyIfChanged }) {
  const st = stateFor(db);
  if (st.ongoing && st.ongoing.generation === st.generation) return st.ongoing.promise;

  const gen = st.generation;
  const promise = doFetch(db, gen, onlyIfChanged).finally(() => {
    if (st.ongoing && st.ongoing.promise === promise) st.ongoing = null;
  });
  st.ongoing = { generation: gen, promise };
  return promise;
}

async function doFetch(db, gen, onlyIfChanged) {
  const st = stateFor(db);
  const { cache } = st;
  const lastId = (name) =>
    db.collection(name).find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).next();
  const [feedbackCount, txnCount, lastFeedback, lastTxn] = await Promise.all([
    db.collection('feedbacks').estimatedDocumentCount(),
    db.collection('transactions').estimatedDocumentCount(),
    lastId('feedbacks'),
    lastId('transactions')
  ]);

  // Khóa cache: số bản ghi + _id mới nhất của mỗi bảng. Chỉ đếm thì không
  // nhận ra khi kho bị nạp lại bằng script bên ngoài với ĐÚNG số lượng cũ
  // (seed lại cùng tham số) — _id mới thì luôn đổi. Truy vấn _id dùng chỉ
  // mục mặc định nên gần như không tốn gì.
  const key = `${feedbackCount}:${txnCount}:${lastFeedback?._id ?? ''}:${lastTxn?._id ?? ''}`;
  const maxAge = cache.value?.replay ? REPLAY_MAX_AGE_MS : MAX_AGE_MS;
  if (
    onlyIfChanged && cache.value && cache.generation === gen &&
    cache.key === key && Date.now() - cache.computedAt < maxAge
  ) {
    cache.at = Date.now();
    return cache.value;
  }

  // batchSize lớn: mặc định driver kéo 101 tài liệu mỗi lượt, mỗi lượt là
  // một vòng mạng tới Atlas — riêng bước này đã tốn vài giây
  // Chỉ đọc những gì ĐÃ xảy ra. Dữ liệu seed có thể kéo sang các ngày sắp tới
  // (phát lại theo thời gian thực); bản ghi không có mốc thời gian vẫn được đọc
  // ($not $gt khớp cả trường thiếu hoặc null).
  const asOf = new Date();
  const [rawFeedbacks, transactions, upcoming] = await Promise.all([
    db.collection('feedbacks').find({ timestamp: { $not: { $gt: asOf } } }).sort({ timestamp: -1 }).batchSize(FETCH_BATCH).toArray(),
    db.collection('transactions').find({ deliveredAt: { $not: { $gt: asOf } } }, { projection: TXN_PROJECTION }).batchSize(FETCH_BATCH).toArray(),
    db.collection('feedbacks').findOne({ timestamp: { $gt: asOf } }, { projection: { _id: 1 } })
  ]);

  const feedbacks = rawFeedbacks.map(normalizeLabels);

  // rawFeedbacks đã sắp mới nhất trước
  let dataAsOf = null;
  let ingestedAt = null;
  if (anchorsToData(db) && feedbacks.length) {
    dataAsOf = new Date(feedbacks[0].timestamp);
    if (Number.isNaN(dataAsOf.getTime())) dataAsOf = null;
    ingestedAt = feedbacks.reduce((max, f) => {
      const t = f.collectedAt ? new Date(f.collectedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0) || null;
  }

  // Tín hiệu ViSoBERT (vector nhúng cho T2, xác suất rác cho T1) nếu
  // được bật và dịch vụ đang chạy. Lỗi ở đây không được chặn Trust
  // Layer: không có tín hiệu mô hình thì chạy đúng như trước.
  let nlp = null;
  try {
    nlp = await visobert.trustSignals(feedbacks);
  } catch (e) {
    console.warn('[VISOBERT] Bỏ qua tín hiệu mô hình cho Trust Layer:', e.message);
  }

  // NHÃN NGƯỜI DUYỆT THẮNG NHÃN MÁY. Người đọc phản hồi ở trang Kiểm tra và
  // sửa cảm xúc / nhóm vấn đề / mỉa mai: nhãn đó phải thay nhãn máy trong MỌI
  // chỉ số, không chỉ dùng để đo độ chính xác. Áp TRƯỚC Trust Layer vì luật
  // lệch sao đọc chính nhãn cảm xúc này. Nhãn máy cũ giữ ở `machineLabel`.
  const auditLabels = await db.collection('audit_labels').find({}).toArray();
  applyHumanLabels(feedbacks, auditLabels);

  const halfLifeDays = anchorsToData(db) ? REAL_HALF_LIFE_DAYS : DEFAULT_HALF_LIFE_DAYS;
  const result = runTrustLayer(feedbacks, {
    orders: transactions,
    halfLifeDays,
    now: dataAsOf || undefined,
    ingestedAt: ingestedAt ? new Date(ingestedAt) : undefined,
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
    computedAt: new Date().toISOString(),
    dbName: db.databaseName,
    asOf: dataAsOf ? dataAsOf.toISOString() : null,
    halfLifeDays,
    ingestedAt: ingestedAt ? new Date(ingestedAt).toISOString() : null,
    replay: Boolean(upcoming)
  };

  // Dữ liệu đã bị invalidate trong lúc nạp: không ghi đè bộ đệm bằng bản cũ
  if (gen === st.generation) {
    const now = Date.now();
    st.cache = { key, at: now, computedAt: now, value, generation: gen };
  }
  return value;
}

/** Bỏ bộ đệm của một database (sau khi ghi vào nó); không truyền db thì bỏ hết */
function invalidate(db) {
  const targets = db ? [stateFor(db)] : [...states.values()];
  for (const st of targets) {
    st.generation += 1;
    st.cache = { key: null, at: 0, computedAt: 0, value: null, generation: st.generation };
  }
}

/** Bộ lọc dùng chung cho mọi endpoint (thời gian / nguồn / sản phẩm) */
function applyFilters(items, query = {}, nowRef = null) {
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
    const now = nowRef ? new Date(nowRef) : new Date();
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
      start = new Date(now);
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

module.exports = { getContext, invalidate, applyFilters, normalizeLabels, ctxNow, applyHumanLabels };
