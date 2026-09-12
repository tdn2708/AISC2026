/**
 * NẠP DỮ LIỆU THỬ NGHIỆM VÀO MONGODB
 * ==================================================================
 * Chạy: npm run seed              (mặc định 6.000 phản hồi, 90 ngày)
 *       npm run seed -- --reviews=12000 --days=120
 *       npm run seed -- --dry      (chỉ in thống kê, không ghi CSDL)
 *
 * CẢNH BÁO: lệnh này XÓA TOÀN BỘ dữ liệu hiện có trong các collection
 * liên quan rồi ghi mới.
 *
 * Bộ sinh nằm ở `data/generator.js`. Xem phần đầu tệp đó để hiểu vì sao
 * dữ liệu được dựng theo các phân bố lệch thay vì ngẫu nhiên đều.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const { generateDataset } = require('./data/generator');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? Number(hit.split('=')[1]) : fallback;
  };
  return {
    targetReviews: get('reviews', 6000),
    days: get('days', 90),
    seed: get('seed', 20260911),
    dryRun: args.includes('--dry')
  };
}

const num = (n) => new Intl.NumberFormat('vi-VN').format(n);

async function main() {
  const opts = parseArgs();

  console.log('\nĐang sinh dữ liệu...');
  const t0 = Date.now();
  const { feedbacks, orders, manifest } = generateDataset(opts);
  console.log(`Xong trong ${Date.now() - t0} ms\n`);

  const t = manifest.totals;
  console.log('QUY MÔ');
  console.log(`  Phản hồi          : ${num(t.feedbacks)}`);
  console.log(`  Giao dịch         : ${num(t.orders)}  (tỉ lệ để lại đánh giá ${(t.reviewRate * 100).toFixed(1)}%)`);
  console.log(`  Sản phẩm          : ${t.products}`);
  console.log(`  Khách hàng        : ${num(t.customers)}`);
  console.log(`  Khu vực / kênh    : ${t.regions} / ${t.channels}`);
  console.log(`  Khoảng thời gian  : ${t.days} ngày`);
  console.log(`  Câu văn khác nhau : ${num(t.distinctTexts)}`);

  console.log('\nSỰ CỐ ĐƯỢC CÀI VÀO CÓ CHỦ ĐÍCH');
  for (const inc of manifest.incidents) {
    console.log(`  ${inc.id}  ${inc.type.padEnd(13)} ${String(inc.feedbackCount).padStart(4)} phản hồi  ${inc.label}`);
  }
  console.log('\n  Chạy `npm run verify` để chấm điểm xem hệ thống có phát hiện đúng không.');

  if (opts.dryRun) {
    console.log('\n(--dry: không ghi vào cơ sở dữ liệu)\n');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\nThiếu MONGODB_URI trong .env — không ghi được vào cơ sở dữ liệu.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('customer_radar');

    console.log('\nĐang ghi vào cơ sở dữ liệu...');
    for (const c of ['feedbacks', 'transactions', 'predictions', 'review_labels', 'recommendation_log']) {
      await db.collection(c).deleteMany({});
    }

    // Ghi theo lô để tránh vượt giới hạn kích thước một lệnh
    const BATCH = 2000;
    for (let i = 0; i < feedbacks.length; i += BATCH) {
      await db.collection('feedbacks').insertMany(feedbacks.slice(i, i + BATCH));
    }
    for (let i = 0; i < orders.length; i += BATCH) {
      await db.collection('transactions').insertMany(orders.slice(i, i + BATCH));
    }

    await db.collection('feedbacks').createIndex({ timestamp: -1 });
    await db.collection('feedbacks').createIndex({ productName: 1, timestamp: -1 });
    await db.collection('feedbacks').createIndex({ source: 1, timestamp: -1 });
    await db.collection('transactions').createIndex({ orderId: 1 }, { unique: true });

    const fc = await db.collection('feedbacks').countDocuments();
    const oc = await db.collection('transactions').countDocuments();
    console.log(`Đã ghi ${num(fc)} phản hồi và ${num(oc)} giao dịch.\n`);
  } catch (e) {
    console.error('Lỗi khi ghi cơ sở dữ liệu:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) main();

/**
 * Giữ tên `buildDataset` để các tệp cũ (kiểm thử, kiểm toán) gọi tới
 * vẫn chạy, đồng thời xuất luôn bộ sinh mới.
 */
module.exports = {
  buildDataset: (opts) => {
    const { feedbacks, orders } = generateDataset({ targetReviews: 1200, days: 60, ...opts });
    return { feedbacks, orders };
  },
  generateDataset
};
