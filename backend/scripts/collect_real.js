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
 * đánh giá mới.
 *
 * Máy chủ đã tự chạy việc này mỗi 24 giờ (services/real_collector.js). Script
 * dùng chung phần lõi đó, để chạy tay một lượt lớn hơn hoặc chạy thử (--dry).
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { DEFAULT_QUERIES, collectReal, saltReady } = require('../services/real_collector');

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
    minReviews: Number(get('min-reviews') || 20),
    dry: args.includes('--dry')
  };
}

async function main() {
  const opts = parseArgs();
  const dbName = process.env.MONGODB_REAL_DB || 'customer_radar_real';
  if (dbName === (process.env.MONGODB_DB || 'customer_radar')) {
    console.error(`Từ chối: MONGODB_REAL_DB (${dbName}) trùng kho mô phỏng.`);
    process.exit(1);
  }

  // Mã khách của sàn là số tuần tự: không có muối bí mật thì ingest.js bỏ trống mã khách
  if (!opts.dry && !saltReady()) {
    console.warn('Chưa đặt PII_SALT bí mật: vẫn thu thập, nhưng không lưu mã khách.');
  }

  const client = opts.dry ? null : await MongoClient.connect(process.env.MONGODB_URI);
  const db = client ? client.db(dbName) : null;
  const totals = await collectReal(db, opts, { log: (line) => console.log(`  ${line}`) });
  console.log(`\nXong: ${totals.products} sản phẩm, ${totals.fetched} đánh giá có nội dung, ${totals.inserted} mới, ${totals.duplicates} đã có.`);
  console.log('Gán nhãn bởi:', JSON.stringify(totals.byLabeller));
  if (client) await client.close();
}

main().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
