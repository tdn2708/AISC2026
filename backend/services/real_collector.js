/**
 * TỰ THU THẬP DỮ LIỆU THẬT, CHẠY NGAY TRONG MÁY CHỦ
 * ==================================================================
 * Trước đây kho "Dữ liệu thật" chỉ mới khi có người chạy tay
 * scripts/collect_real.js hoặc một workflow GitHub Actions (cần quyền đẩy
 * workflow và bốn secret). Một shop dùng thật không nên phụ thuộc vào việc đó.
 *
 * Module này chứa phần lõi (tìm sản phẩm, lấy đánh giá mới nhất, gán nhãn,
 * che tên, ghi chống trùng) và một bộ hẹn giờ nhẹ:
 *  - Mỗi 30 phút, và một lần sau khi khởi động, xem lần thu thập gần nhất.
 *    Cũ hơn 24 giờ thì chạy một lượt. Render bản miễn phí ngủ khi không ai
 *    dùng, nên không dựa vào giờ cố định: máy thức dậy là bù ngay lượt bị lỡ.
 *  - Khóa nằm trong MongoDB (findOneAndUpdate có điều kiện), nên dù có hai
 *    tiến trình (lúc Render chuyển bản triển khai) cũng chỉ một lượt chạy.
 *  - Khóa có hạn 2 giờ: tiến trình chết giữa chừng thì lượt sau tự lấy lại.
 *  - Thiếu PII_SALT bí mật vẫn chạy, nhưng ingest.js không lưu mã khách (băm
 *    bằng muối công khai thì dò ngược ra tài khoản thật được). Giao diện báo
 *    rõ phần bị thiếu: bước gom theo tài khoản của Trust Layer.
 *
 * Gán nhãn đi lần lượt từng sản phẩm, nghỉ giữa các sản phẩm, để nằm trong
 * hạn mức miễn phí của LLM mà không giành tài nguyên với người đang dùng web.
 */

const axios = require('axios');
const { fetchTikiReviews } = require('./scraper');
const { labelReviews } = require('./label_cascade');
const { buildFeedbackDocs, saveFeedbacks } = require('./ingest');
const { invalidate } = require('./analysis_context');

// Nhóm hàng có nhiều đánh giá và nhiều kiểu khiếu nại khác nhau (giao vận,
// chất lượng, đóng gói, hàng giả, đổi trả), đủ đa dạng cho phân tích
const DEFAULT_QUERIES = [
  'tai nghe bluetooth', 'chuột không dây', 'bàn phím', 'loa bluetooth', 'sạc dự phòng',
  'cáp sạc', 'đồng hồ thông minh', 'nồi chiên không dầu', 'máy xay sinh tố', 'quạt điện',
  'máy sấy tóc', 'bình giữ nhiệt', 'kem chống nắng', 'sữa rửa mặt', 'dầu gội',
  'nước giặt', 'tã dán', 'sữa bột', 'áo thun nam', 'giày thể thao',
  'balo laptop', 'sách kỹ năng', 'đồ chơi trẻ em', 'nồi cơm điện'
];

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (CustomerRadar research collector)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOUR = 3600 * 1000;
const STATE_ID = 'autocollect';
const EVERY_MS = 24 * HOUR;
const CHECK_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 2 * HOUR;
const MANUAL_GAP_MS = 30 * 60 * 1000;

// Muối băm mã khách: nạp lúc khởi động từ biến môi trường hoặc database
const { saltReady } = require('./pii_salt');

/** Sản phẩm nhiều đánh giá nhất của một từ khóa */
async function searchProducts(query, limit, minReviews) {
  const { data } = await axios.get('https://tiki.vn/api/v2/products', {
    // Sắp theo bán chạy: thứ tự mặc định của Tiki (từ 11/2026) đưa hàng mới,
    // gần như chưa có đánh giá, lên đầu, nên lọc theo số đánh giá thì còn 0
    params: { q: query, limit: 40, sort: 'top_seller' },
    headers: HEADERS,
    timeout: 20000
  });
  return (data?.data || [])
    .filter((p) => (p.review_count || 0) >= minReviews && p.url_path)
    .sort((a, b) => b.review_count - a.review_count)
    .slice(0, limit)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      url: `https://tiki.vn/${p.url_path}`,
      price: p.price ?? null,
      ratingAverage: p.rating_average ?? null,
      reviewCount: p.review_count ?? null,
      quantitySold: p.quantity_sold?.value ?? null,
      query
    }));
}

/**
 * Một lượt thu thập. db = null là chạy thử (không ghi).
 * log(line) nhận từng dòng tiến độ; onProgress(totals) nhận số liệu cộng dồn.
 */
async function collectReal(db, opts = {}, { log = () => {}, onProgress = null } = {}) {
  const o = {
    queries: opts.queries?.length ? opts.queries : DEFAULT_QUERIES,
    productsPerQuery: opts.productsPerQuery ?? 5,
    pages: opts.pages ?? 5,
    minReviews: opts.minReviews ?? 20,
    pauseMs: opts.pauseMs ?? 1000
  };
  if (db) {
    await db.collection('feedbacks').createIndex(
      { dedupKey: 1 },
      { unique: true, partialFilterExpression: { dedupKey: { $type: 'string' } } }
    );
    await db.collection('products').createIndex({ productId: 1, snapshotAt: -1 });
  }

  const totals = { queries: o.queries.length, products: 0, fetched: 0, inserted: 0, duplicates: 0, failed: 0, byLabeller: {} };
  const seen = new Set();
  log(`Thu thập ${o.queries.length} nhóm hàng, ${o.productsPerQuery} sản phẩm mỗi nhóm, tối đa ${o.pages * 20} đánh giá mới nhất mỗi sản phẩm${db ? '' : ' (chạy thử, không ghi)'}`);

  for (const query of o.queries) {
    let products = [];
    try {
      products = await searchProducts(query, o.productsPerQuery, o.minReviews);
    } catch (e) {
      totals.failed += 1;
      log(`[${query}] không tìm được sản phẩm: ${e.message}`);
      continue;
    }
    await sleep(800);

    for (const product of products) {
      if (seen.has(product.productId)) continue;
      seen.add(product.productId);
      totals.products += 1;

      let raw = [];
      try {
        raw = await fetchTikiReviews(new URL(product.url), { sort: 'id|desc', maxPages: o.pages });
      } catch (e) {
        totals.failed += 1;
        log(`[${query}] lỗi khi lấy đánh giá ${product.productId}: ${e.message}`);
        continue;
      }
      totals.fetched += raw.length;
      if (!raw.length) continue;

      // Kèm số sao; câu nghi mỉa mai được hỏi thêm mô hình thứ hai rồi bỏ phiếu
      const ai = await labelReviews(raw.map((r) => ({ text: r.rawText, rating: r.rating })));
      for (const a of ai) totals.byLabeller[a?.labelledBy || 'none'] = (totals.byLabeller[a?.labelledBy || 'none'] || 0) + 1;
      const docs = buildFeedbackDocs(raw, ai, { fallbackProduct: product.name, collectedVia: 'bulk', sourceUrl: product.url });
      for (const d of docs) d.productCategory = query;

      if (db) {
        const { inserted, duplicates } = await saveFeedbacks(db, docs);
        totals.inserted += inserted;
        totals.duplicates += duplicates;
        await db.collection('products').insertOne({ ...product, snapshotAt: new Date() });
        log(`[${query}] ${product.name.slice(0, 60)}: ${raw.length} đánh giá, +${inserted} mới`);
      } else {
        const complaints = docs.filter((d) => d.category !== 'Other').length;
        log(`[${query}] ${product.name.slice(0, 60)}: ${raw.length} đánh giá, ${complaints} lời chê`);
      }
      onProgress?.(totals);
      await sleep(o.pauseMs);
    }
  }
  return totals;
}

// ------------------------------------------------------------------
// Bộ hẹn giờ trong máy chủ
// ------------------------------------------------------------------

const enabled = () => process.env.AUTO_COLLECT !== '0';

/** Trạng thái để giao diện hiển thị: lần chạy gần nhất, lần kế tiếp, lý do không chạy */
async function collectorStatus(db) {
  const s = (await db.collection('meta').findOne({ _id: STATE_ID })) || {};
  const ready = true;
  const salt = saltReady();
  const lastAt = s.finishedAt || null;
  return {
    enabled: enabled(),
    ready,
    reason: !enabled()
      ? 'Tự thu thập đang tắt (AUTO_COLLECT=0).'
      : null,
    // Có muối thì lưu mã khách đã băm; chưa có thì bỏ trống mã khách cho an toàn
    saltReady: salt,
    note: salt ? null : 'Chưa có muối băm bí mật (PII_SALT) nên mã khách không được lưu. Đánh giá vẫn được thu thập và phân tích, chỉ thiếu bước kiểm tra hành vi theo tài khoản.',
    running: Boolean(s.running && s.lockedAt && Date.now() - new Date(s.lockedAt).getTime() < LOCK_TTL_MS),
    startedAt: s.lockedAt || null,
    progress: s.progress || null,
    lastFinishedAt: lastAt,
    lastResult: s.lastResult || null,
    lastError: s.lastError || null,
    trigger: s.trigger || null,
    nextDueAt: lastAt ? new Date(new Date(lastAt).getTime() + EVERY_MS) : null,
    everyHours: EVERY_MS / HOUR
  };
}

/**
 * Lấy khóa rồi chạy một lượt ở nền. Trả về false khi không lấy được khóa
 * (đang có lượt khác chạy, hoặc chưa tới hạn).
 */
async function runOnce(db, { trigger = 'schedule', minGapMs = EVERY_MS, opts, onDone } = {}) {
  const now = new Date();
  const meta = db.collection('meta');
  await meta.updateOne({ _id: STATE_ID }, { $setOnInsert: { running: false } }, { upsert: true });
  const lock = await meta.findOneAndUpdate(
    {
      _id: STATE_ID,
      $and: [
        { $or: [{ running: { $ne: true } }, { lockedAt: { $lt: new Date(now - LOCK_TTL_MS) } }] },
        { $or: [{ finishedAt: { $exists: false } }, { finishedAt: null }, { finishedAt: { $lt: new Date(now - minGapMs) } }] }
      ]
    },
    { $set: { running: true, lockedAt: now, trigger, progress: null, lastError: null } },
    { returnDocument: 'after' }
  );
  if (!lock) return { started: false, reason: 'busy_or_fresh' };

  // Chạy nền, không chặn request đã gọi
  (async () => {
    const t0 = Date.now();
    let lastWrite = 0;
    try {
      const totals = await collectReal(db, opts || { productsPerQuery: 4, pages: 2, pauseMs: 5000 }, {
        log: (line) => console.log('[tự thu thập]', line),
        onProgress: (t) => {
          // Ghi tiến độ thưa thôi, đủ cho giao diện hiện "đang chạy, đã thêm N"
          if (Date.now() - lastWrite < 15000) return;
          lastWrite = Date.now();
          meta.updateOne({ _id: STATE_ID }, { $set: { progress: { products: t.products, inserted: t.inserted }, lockedAt: new Date() } }).catch(() => {});
        }
      });
      await meta.updateOne({ _id: STATE_ID }, {
        $set: { running: false, finishedAt: new Date(), lastResult: { ...totals, ms: Date.now() - t0 }, progress: null }
      });
      console.log(`[tự thu thập] xong: +${totals.inserted} mới, ${totals.duplicates} đã có, ${Math.round((Date.now() - t0) / 1000)} giây`);
      // Có dữ liệu mới: bỏ dự báo cũ và tính lại số liệu ở nền (trang vẫn hiện số cũ tới khi xong)
      if (totals.inserted > 0) {
        await db.collection('predictions').deleteMany({});
        invalidate(db);
      }
      await onDone?.(totals);
    } catch (e) {
      console.error('[tự thu thập] lỗi:', e.message);
      // Lỗi cũng tính là một lượt, để không thử lại liên tục mỗi 30 phút
      await meta.updateOne({ _id: STATE_ID }, { $set: { running: false, finishedAt: new Date(), lastError: e.message, progress: null } }).catch(() => {});
    }
  })();
  return { started: true };
}

let timer = null;

/** Bật bộ hẹn giờ cho kho thật. onDone nhận số liệu sau mỗi lượt có dữ liệu mới. */
function startAutoCollect(db, { onDone } = {}) {
  if (timer || !enabled()) return;
  if (!saltReady()) console.warn('[tự thu thập] chưa có PII_SALT bí mật: vẫn thu thập, nhưng không lưu mã khách.');
  const tick = () => runOnce(db, { trigger: 'schedule', onDone }).catch((e) => console.warn('[tự thu thập]', e.message));
  // Đợi 2 phút sau khởi động: để việc nạp sẵn ngữ cảnh chạy xong trước
  setTimeout(tick, 2 * 60 * 1000).unref?.();
  timer = setInterval(tick, CHECK_MS);
  timer.unref?.();
  console.log('[tự thu thập] bật: mỗi 24 giờ, kiểm tra mỗi 30 phút.');
}

module.exports = {
  DEFAULT_QUERIES,
  collectReal,
  collectorStatus,
  runOnce,
  startAutoCollect,
  saltReady,
  MANUAL_GAP_MS
};
