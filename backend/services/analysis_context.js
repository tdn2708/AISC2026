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

const path = require('path');
const { DEFAULT_HALF_LIFE_DAYS } = require('./trust_layer');
const { computeContext, normalizeLabels, applyHumanLabels, applyReviewLabel } = require('./context_compute');
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

/** "Bây giờ" của một ngữ cảnh: mốc dữ liệu với kho thật, giờ thật với kho mô phỏng */
const ctxNow = (ctx) => (ctx && ctx.asOf ? new Date(ctx.asOf) : new Date());
// Chỉ các trường giao dịch thật sự được dùng (đối soát, doanh thu rủi ro, vùng)
const TXN_PROJECTION = { _id: 0, orderId: 1, productName: 1, region: 1, orderedAt: 1, deliveredAt: 1, amount: 1 };

/**
 * Trạng thái bộ đệm RIÊNG cho từng database. Máy chủ phục vụ cùng lúc kho mô
 * phỏng và kho dữ liệu thật (người xem chuyển qua lại), nên một bộ đệm dùng
 * chung sẽ trả nhầm số liệu của kho này cho kho kia.
 *   cache     bản đang hợp lệ
 *   stale     bản vừa bị invalidate: vẫn phục vụ trong lúc bản mới đang tính
 */
const states = new Map();
function stateFor(db) {
  const name = db.databaseName;
  if (!states.has(name)) {
    states.set(name, { cache: { key: null, at: 0, computedAt: 0, value: null, generation: 0 }, generation: 0, ongoing: null, stale: null });
  }
  return states.get(name);
}

// ==================================================================
// LUỒNG TÍNH RIÊNG
// ==================================================================

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  const { Worker } = require('worker_threads');
  worker = new Worker(path.join(__dirname, 'context_worker.js'));
  worker.unref(); // không giữ tiến trình sống (script chạy một lần vẫn thoát được)
  const fail = (err) => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
    worker = null;
  };
  worker.on('message', (msg) => {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.ok) job.resolve(msg);
    else job.reject(new Error(msg.error));
  });
  worker.on('error', fail);
  worker.on('exit', (code) => fail(new Error(`Luồng tính dừng (mã ${code})`)));
  return worker;
}

/** Chạy phần tính trong worker; worker hỏng thì tính ngay tại luồng chính như trước */
async function compute(input) {
  if (process.env.CONTEXT_WORKER === '0') return computeContext(input);
  try {
    const msg = await new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      try {
        getWorker().postMessage({ id, input });
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
    return msg.value;
  } catch (e) {
    console.warn('[CONTEXT] Luồng tính riêng lỗi, tính tại luồng chính:', e.message);
    return computeContext(input);
  }
}

// ==================================================================
// BỘ ĐỆM
// ==================================================================

/**
 * Ngữ cảnh phân tích của một kho.
 *  - Bản hợp lệ: trả ngay; quá TTL thì làm mới ở nền.
 *  - Vừa bị invalidate (có thao tác ghi): trả ngay BẢN CŨ kèm cờ `refreshing`,
 *    bản mới tính ở nền. Trước đây request kế tiếp phải chờ cả lần tính lại
 *    (hàng chục giây trên Render) — duyệt nhãn liên tục là mỗi lần bấm một lần chờ.
 *  - Chưa có bản nào (vừa khởi động): chờ.
 * @param {import('mongodb').Db} db
 * @param {{ force?: boolean, fresh?: boolean }} opts  fresh: chờ bản mới nhất
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

  if (!opts.force && !opts.fresh && st.stale) {
    refresh(db, { onlyIfChanged: false }).catch((e) =>
      console.warn('[CONTEXT] Tính lại sau khi ghi thất bại, giữ bản cũ:', e.message)
    );
    return st.stale;
  }

  return refresh(db, { onlyIfChanged: false });
}

/** Kho này có đang tính lại số liệu không (để giao diện báo cho người dùng) */
function isRefreshing(db) {
  const st = stateFor(db);
  return !(st.cache.value && st.cache.generation === st.generation);
}

/** Một lần nạp duy nhất cho mỗi thế hệ dữ liệu; các request đồng thời dùng chung */
function refresh(db, { onlyIfChanged }) {
  const st = stateFor(db);
  if (st.ongoing && st.ongoing.generation === st.generation) return st.ongoing.promise;

  const gen = st.generation;
  const promise = doFetch(db, gen, onlyIfChanged).finally(() => {
    if (st.ongoing && st.ongoing.promise === promise) st.ongoing = null;
    // Có thao tác ghi xảy ra trong lúc đang tính: tính tiếp bản mới hơn ở nền,
    // nếu không cờ `refreshing` treo tới tận request kế tiếp
    if (st.generation !== gen && st.stale) {
      refresh(db, { onlyIfChanged: false }).catch((e) => console.warn('[CONTEXT] Tính lại thất bại:', e.message));
    }
  });
  st.ongoing = { generation: gen, promise };
  return promise;
}

async function doFetch(db, gen, onlyIfChanged) {
  const st = stateFor(db);
  const { cache } = st;
  const t0 = Date.now();
  const lastId = (name) =>
    db.collection(name).find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).next();
  const [feedbackCount, txnCount, lastFeedback, lastTxn, labelsMeta] = await Promise.all([
    db.collection('feedbacks').estimatedDocumentCount(),
    db.collection('transactions').estimatedDocumentCount(),
    lastId('feedbacks'),
    lastId('transactions'),
    db.collection('meta').findOne({ _id: 'labels' })
  ]);

  // Khóa cache: số bản ghi + _id mới nhất của mỗi bảng. Chỉ đếm thì không
  // nhận ra khi kho bị nạp lại bằng script bên ngoài với ĐÚNG số lượng cũ
  // (seed lại cùng tham số) — _id mới thì luôn đổi. Truy vấn _id dùng chỉ
  // mục mặc định nên gần như không tốn gì.
  // Script sửa nhãn tại chỗ (không thêm bản ghi) tăng meta.labels.version
  // để mọi máy chủ đang chạy biết mà nạp lại.
  const key = `${feedbackCount}:${txnCount}:${lastFeedback?._id ?? ''}:${lastTxn?._id ?? ''}:${labelsMeta?.version ?? 0}`;
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
  const [rawFeedbacks, transactions, upcoming, auditLabels, reviewLabels] = await Promise.all([
    db.collection('feedbacks').find({ timestamp: { $not: { $gt: asOf } } }).sort({ timestamp: -1 }).batchSize(FETCH_BATCH).toArray(),
    db.collection('transactions').find({ deliveredAt: { $not: { $gt: asOf } } }, { projection: TXN_PROJECTION }).batchSize(FETCH_BATCH).toArray(),
    db.collection('feedbacks').findOne({ timestamp: { $gt: asOf } }, { projection: { _id: 1 } }),
    db.collection('audit_labels').find({}).toArray(),
    db.collection('review_labels').find({}).toArray()
  ]);
  // Mã dạng chuỗi: đi qua được luồng tính riêng, và mọi nơi vốn so mã bằng String()
  for (const f of rawFeedbacks) f._id = String(f._id);
  for (const l of auditLabels) l._id = String(l._id);
  for (const l of reviewLabels) l._id = String(l._id);
  const fetchMs = Date.now() - t0;

  // Tín hiệu ViSoBERT (vector nhúng cho T2, xác suất rác cho T1) nếu
  // được bật và dịch vụ đang chạy. Lỗi ở đây không được chặn Trust
  // Layer: không có tín hiệu mô hình thì chạy đúng như trước.
  let nlp = null;
  try {
    nlp = await visobert.trustSignals(rawFeedbacks);
  } catch (e) {
    console.warn('[VISOBERT] Bỏ qua tín hiệu mô hình cho Trust Layer:', e.message);
  }

  const halfLifeDays = anchorsToData(db) ? REAL_HALF_LIFE_DAYS : DEFAULT_HALF_LIFE_DAYS;
  const t1 = Date.now();
  const computed = await compute({
    rawFeedbacks,
    transactions,
    auditLabels,
    reviewLabels,
    anchorToData: anchorsToData(db),
    halfLifeDays,
    modelSignals: nlp ? nlp.signals : null
  });

  const value = {
    items: computed.items,
    clusters: computed.clusters,
    bursts: computed.bursts,
    accountProfiles: computed.accountProfiles,
    funnel: computed.funnel,
    transactions,
    transactionCount: transactions.length,
    humanLabelCount: reviewLabels.length,
    modelSignals: { ...computed.modelSignals, source: nlp ? 'visobert' : null, ...(nlp ? nlp.meta : {}) },
    computedAt: new Date().toISOString(),
    dbName: db.databaseName,
    asOf: computed.asOf,
    halfLifeDays,
    ingestedAt: computed.ingestedAt,
    replay: Boolean(upcoming)
  };
  console.log(`[CONTEXT] ${db.databaseName}: ${computed.items.length} phản hồi, đọc ${fetchMs} ms, tính ${Date.now() - t1} ms`);

  // Dữ liệu đã bị invalidate trong lúc nạp: không ghi đè bộ đệm bằng bản cũ
  if (gen === st.generation) {
    const now = Date.now();
    st.cache = { key, at: now, computedAt: now, value, generation: gen };
    st.stale = null;
  } else if (!st.stale) {
    // Bản này đã cũ so với thao tác ghi vừa xảy ra, nhưng vẫn hơn là không có gì
    // để phục vụ trong lúc bản mới hơn đang tính
    st.stale = { ...value, refreshing: true };
  }
  return value;
}

/**
 * Báo dữ liệu của một kho vừa đổi (sau khi ghi); không truyền db thì mọi kho.
 * Bản đang có được giữ làm bản tạm, gắn cờ `refreshing`, tới khi bản mới tính xong.
 */
function invalidate(db) {
  const targets = db ? [stateFor(db)] : [...states.values()];
  for (const st of targets) {
    const previous = st.cache.value || st.stale;
    st.generation += 1;
    st.cache = { key: null, at: 0, computedAt: 0, value: null, generation: st.generation };
    st.stale = previous ? (previous.refreshing ? previous : { ...previous, refreshing: true }) : null;
  }
}

/**
 * Vá ngay bản đang phục vụ sau một thao tác nhỏ của người dùng (duyệt một
 * nhãn), để màn hình thấy kết quả tức thì; bản tính lại đầy đủ vẫn chạy ở nền.
 * @param {(ctx: object) => void} fn
 */
function patchServing(db, fn) {
  const st = stateFor(db);
  const ctx = st.cache.value || st.stale;
  if (!ctx) return;
  try {
    fn(ctx);
  } catch (e) {
    console.warn('[CONTEXT] Không vá được bản đang phục vụ:', e.message);
  }
}

/** `?time=a&time=b` cho ra mảng; `time.startsWith` trên mảng từng ném TypeError */
const oneParam = (v) => {
  const x = Array.isArray(v) ? v[0] : v;
  return x == null ? undefined : String(x);
};

/**
 * "Ngày" của cửa hàng tính theo giờ Việt Nam (UTC+7, không có giờ mùa hè),
 * không theo múi giờ của máy chủ: Render chạy UTC nên "Hôm nay" từng bắt đầu
 * lúc 07:00 sáng giờ Việt Nam.
 */
const VN_OFFSET_MS = 7 * 3600000;
const DAY_MS = 86400000;
/** 00:00 giờ Việt Nam của ngày chứa mốc `ms`, tính bằng mili giây UTC */
const vnDayStart = (ms) => Math.floor((ms + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;

/** Một ngày do người dùng chọn (YYYY-MM-DD hoặc chuỗi ngày bất kỳ) thành mốc 00:00 giờ Việt Nam */
function vnDayFromInput(text) {
  const m = /^(d{4})-(d{2})-(d{2})$/.exec(String(text).trim());
  if (m) {
    const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(utc) ? NaN : utc - VN_OFFSET_MS;
  }
  const ms = new Date(text).getTime();
  return Number.isNaN(ms) ? NaN : vnDayStart(ms);
}

/** Mốc bắt đầu/kết thúc của bộ lọc thời gian (mili giây); null nếu không giới hạn */
function timeBounds(time, nowRef = null) {
  if (!time || time === 'All') return null;
  const now = nowRef ? new Date(nowRef) : new Date();
  let start = null;
  let end = null;

  if (time.startsWith('Custom:')) {
    const parts = time.split(':');
    if (parts.length === 3) {
      start = vnDayFromInput(parts[1]);
      const endDay = vnDayFromInput(parts[2]);
      end = endDay + DAY_MS - 1;
      // Ngày sai định dạng: bỏ qua bộ lọc thay vì so sánh với NaN
      if (Number.isNaN(start) || Number.isNaN(end)) {
        start = null;
        end = null;
      }
    }
  } else if (time === 'Today') {
    start = vnDayStart(now.getTime());
  } else if (time === 'This Week') {
    start = now.getTime() - 7 * DAY_MS;
  } else if (time === 'This Month') {
    start = now.getTime() - 30 * DAY_MS;
  }
  return start != null ? { start, end: end != null ? end : null } : null;
}

/** Bộ lọc dùng chung cho mọi endpoint (thời gian / nguồn / sản phẩm) */
function applyFilters(items, query = {}, nowRef = null) {
  const q = query || {};
  const source = oneParam(q.source);
  const product = oneParam(q.product);
  const region = oneParam(q.region);
  let out = items;

  if (source && source !== 'All') out = out.filter((f) => f.source === source);
  if (product && product !== 'All') out = out.filter((f) => f.productName === product);
  if (region && region !== 'All') out = out.filter((f) => f.region === region);

  const b = timeBounds(oneParam(q.time), nowRef);
  if (b) {
    out = out.filter((f) => {
      const t = new Date(f.timestamp).getTime();
      if (t < b.start) return false;
      if (b.end != null && t > b.end) return false;
      return true;
    });
  }

  return out;
}

/**
 * Giao dịch CÙNG PHẠM VI LỌC với phản hồi: làm mẫu số của tỉ lệ khiếu nại trên
 * đơn hàng. Cùng khoảng thời gian (theo ngày giao, không có thì ngày đặt), cùng
 * sản phẩm, cùng vùng. Giao dịch không có trường kênh nên bộ lọc kênh không
 * thu hẹp mẫu số (WCR vốn chỉ tính trên kênh đối soát được).
 */
function scopeTransactions(transactions, query = {}, nowRef = null) {
  const q = query || {};
  const product = oneParam(q.product);
  const region = oneParam(q.region);
  let out = transactions || [];
  if (product && product !== 'All') out = out.filter((t) => t.productName === product);
  if (region && region !== 'All') out = out.filter((t) => t.region === region);
  const b = timeBounds(oneParam(q.time), nowRef);
  if (b) {
    out = out.filter((t) => {
      const ms = new Date(t.deliveredAt || t.orderedAt).getTime();
      if (!Number.isFinite(ms) || ms < b.start) return false;
      return b.end == null || ms <= b.end;
    });
  }
  return out;
}

module.exports = { getContext, invalidate, isRefreshing, patchServing, applyFilters, scopeTransactions, timeBounds, normalizeLabels, ctxNow, applyHumanLabels, applyReviewLabel };
