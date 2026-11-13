/**
 * Chép kho prod sang DB thử để thử thao tác ghi (đọc prod, chỉ GHI vào DB có "_test").
 *   node scripts/copy_to_test_db.js            chép cả hai kho
 *   node scripts/copy_to_test_db.js --drop     xóa hai DB thử
 */
require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');

const PAIRS = [
  ['customer_radar', 'customer_radar_ui_test'],
  ['customer_radar_real', 'customer_radar_ui_test_real']
];
const COLLECTIONS = ['feedbacks', 'transactions', 'audit_labels', 'review_labels', 'meta'];

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  for (const [from, to] of PAIRS) {
    const dst = c.db(to);
    if (!dst.databaseName.includes('_test')) throw new Error(`từ chối ghi vào ${to}`);
    if (process.argv.includes('--drop')) { await dst.dropDatabase(); console.log('đã xóa', to); continue; }
    for (const name of COLLECTIONS) {
      const docs = await c.db(from).collection(name).find({}).toArray();
      await dst.collection(name).deleteMany({});
      for (let i = 0; i < docs.length; i += 5000) await dst.collection(name).insertMany(docs.slice(i, i + 5000));
      console.log(`${from}.${name} -> ${to}: ${docs.length}`);
    }
  }
  await c.close();
})().catch((e) => { console.error('LỖI', e.message); process.exit(1); });
