/**
 * THU THẬP DỮ LIỆU THẬT VÀO KHO "real"
 * ==================================================================
 * Chạy:  node scripts/collect_real.js                 (bộ nhóm hàng mặc định)
 *        node scripts/collect_real.js --products=6 --pages=3
 *        node scripts/collect_real.js --queries="tai nghe,noi chien" --dry
 *
 * Lấy đánh giá MỚI NHẤT của các sản phẩm bán chạy trên Tiki qua API công khai
 * (robots.txt của Tiki cho phép /api/v2/reviews), gán nhãn AI, che tên người
 * mua, rồi ghi vào database kho thật (MONGODB_REAL_DB, mặc định
 * customer_radar_real). Không bao giờ ghi vào kho mô phỏng.
 *
 * Chạy lại an toàn: chống trùng theo mã đánh giá của Tiki, lần sau chỉ thêm
 * đánh giá mới. Chạy định kỳ thì kho thật tự cập nhật như một luồng thu thập.
 *
 * Kèm theo mỗi lần chạy là một bản chụp thông tin sản phẩm (số đã bán, điểm
 * trung bình, số đánh giá) vào collection `products` — hai bản chụp ở hai thời
 * điểm cho ra số đơn bán được giữa chúng, tức mẫu số thật cho tỉ lệ khiếu nại.
 */

require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');
const { fetchTikiReviews } = require('../services/scraper');
const { analyzeFeedbackBatch } = require('../services/ai_analyzer');
const { buildFeedbackDocs, saveFeedbacks } = require('../services/ingest');

// Nhóm hàng có nhiều đánh giá và nhiều kiểu khiếu nại khác nhau (giao vận,
// chất lượng, đóng gói, hàng giả, đổi trả) — đủ đa dạng cho phân tích và gán nhãn
const DEFAULT_QUERIES = [
  'tai nghe bluetooth', 'chuột không dây', 'bàn phím', 'loa bluetooth', 'sạc dự phòng',
  'cáp sạc', 'đồng hồ thông minh', 'nồi chiên không dầu', 'máy xay sinh tố', 'quạt điện',
  'máy sấy tóc', 'bình giữ nhiệt', 'kem chống nắng', 'sữa rửa mặt', 'dầu gội',
  'nước giặt', 'tã dán', 'sữa bột', 'áo thun nam', 'giày thể thao',
  'balo laptop', 'sách kỹ năng', 'đồ chơi trẻ em', 'nồi cơm điện'
];

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (CustomerRadar research collector)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  return {
    queries: get('queries') ? get('queries').split(',').map((q) => q.trim()).filter(Boolean) : DEFAULT_QUERIES,
    productsPerQuery: Number(get('products') || 5),
    pages: Number(get('pages') || 5),
    minReviews: Number(get('min-reviews') || 30),
    dry: args.includes('--dry')
  };
}

/** Sản phẩm nhiều đánh giá nhất của một từ khóa */
async function searchProducts(query, limit, minReviews) {
  const { data } = await axios.get('https://tiki.vn/api/v2/products', {
    params: { q: query, limit: 40 },
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

async function main() {
  const opts = parseArgs();
  const dbName = process.env.MONGODB_REAL_DB || 'customer_radar_real';
  if (dbName === (process.env.MONGODB_DB || 'customer_radar')) {
    console.error(`Từ chối: MONGODB_REAL_DB (${dbName}) trùng kho mô phỏng.`);
    process.exit(1);
  }

  const client = opts.dry ? null : await MongoClient.connect(process.env.MONGODB_URI);
  const db = client ? client.db(dbName) : null;
  if (db) {
    await db.collection('feedbacks').createIndex(
      { dedupKey: 1 },
      { unique: true, partialFilterExpression: { dedupKey: { $type: 'string' } } }
    );
    await db.collection('products').createIndex({ productId: 1, snapshotAt: -1 });
  }

  const totals = { products: 0, fetched: 0, inserted: 0, duplicates: 0, byLabeller: {} };
  const seen = new Set();
  console.log(`Thu thập ${opts.queries.length} nhóm hàng × ${opts.productsPerQuery} sản phẩm × tối đa ${opts.pages * 20} đánh giá mới nhất -> ${opts.dry ? '(thử, không ghi)' : dbName}\n`);

  for (const query of opts.queries) {
    let products = [];
    try {
      products = await searchProducts(query, opts.productsPerQuery, opts.minReviews);
    } catch (e) {
      console.warn(`  [${query}] không tìm được sản phẩm: ${e.message}`);
      continue;
    }
    await sleep(800);

    for (const product of products) {
      if (seen.has(product.productId)) continue;
      seen.add(product.productId);
      totals.products += 1;

      let raw = [];
      try {
        raw = await fetchTikiReviews(new URL(product.url), { sort: 'id|desc', maxPages: opts.pages });
      } catch (e) {
        console.warn(`  [${query}] lỗi khi lấy đánh giá ${product.productId}: ${e.message}`);
        continue;
      }
      totals.fetched += raw.length;
      if (!raw.length) continue;

      const ai = await analyzeFeedbackBatch(raw.map((r) => r.rawText));
      for (const a of ai) totals.byLabeller[a?.labelledBy || 'none'] = (totals.byLabeller[a?.labelledBy || 'none'] || 0) + 1;
      const docs = buildFeedbackDocs(raw, ai, { fallbackProduct: product.name, collectedVia: 'bulk', sourceUrl: product.url });
      for (const d of docs) d.productCategory = query;

      if (db) {
        const { inserted, duplicates } = await saveFeedbacks(db, docs);
        totals.inserted += inserted;
        totals.duplicates += duplicates;
        await db.collection('products').insertOne({ ...product, snapshotAt: new Date() });
        console.log(`  [${query}] ${product.name.slice(0, 60)}: ${raw.length} đánh giá, +${inserted} mới`);
      } else {
        const complaints = docs.filter((d) => d.category !== 'Other').length;
        console.log(`  [${query}] ${product.name.slice(0, 60)}: ${raw.length} đánh giá, ${complaints} lời chê (thử)`);
      }
      await sleep(1000);
    }
  }

  console.log(`\nXong: ${totals.products} sản phẩm, ${totals.fetched} đánh giá có nội dung, ${totals.inserted} mới, ${totals.duplicates} đã có.`);
  console.log('Gán nhãn bởi:', JSON.stringify(totals.byLabeller));
  if (client) await client.close();
}

main().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
