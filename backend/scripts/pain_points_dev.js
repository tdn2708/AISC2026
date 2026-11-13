/**
 * Chạy thử tìm điểm đau trên một kho (CHỈ ĐỌC), in kết quả ra màn hình.
 *   node scripts/pain_points_dev.js --db=customer_radar_real [--blind=hide|only] [--out=file.json]
 * --blind=hide (mặc định): giấu 8 mảng kiểm mù (KE-HOACH-GIAO-DIEN.md mục 13.4, H0).
 * --blind=only: chỉ chạy 8 mảng mù (dùng SAU KHI khóa mã, cho người chấm).
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { computeContext } = require('../services/context_compute');
const { findPainPoints } = require('../services/pain_points');

const BLIND = new Set(['sữa rửa mặt', 'đồng hồ thông minh', 'tã dán', 'bình giữ nhiệt', 'bàn phím', 'cáp sạc', 'sữa bột', 'máy sấy tóc']);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;

(async () => {
  const dbName = arg('db', 'customer_radar_real');
  const blind = arg('blind', 'hide');
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db(dbName);
  const asOf = new Date();
  const raw = await db.collection('feedbacks').find({ timestamp: { $not: { $gt: asOf } } }).sort({ timestamp: -1 }).toArray();
  for (const f of raw) f._id = String(f._id);
  const tx = await db.collection('transactions').find({}).toArray();
  const audit = await db.collection('audit_labels').find({}).toArray();
  const review = await db.collection('review_labels').find({}).toArray();
  await c.close();
  const real = dbName.includes('real');
  const ctx = computeContext({ rawFeedbacks: raw, transactions: tx, auditLabels: audit, reviewLabels: review, anchorToData: real, halfLifeDays: real ? 180 : 30 });
  const isBlind = (label) => BLIND.has(String(label).toLowerCase());
  const t0 = Date.now();
  const r = findPainPoints(ctx.items, {
    now: ctx.asOf || asOf,
    groupFilter: blind === 'all' ? undefined : (key, label) => (blind === 'only' ? isBlind(label) : !isBlind(label))
  });
  const ms = Date.now() - t0;
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(r, null, 1));
  console.log(`${dbName}: ${r.counted} phản hồi được tính, ${r.groups.length} mảng, ${ms} ms`);
  for (const g of [...r.groups, ...(r.shop ? [r.shop] : [])]) {
    console.log(`\n## ${g.label} [${g.sourceLabel}] chê ${g.negatives}/${g.feedbacks} ${g.status} (chưa gom ${g.uncovered})`);
    for (const p of g.painPoints) {
      console.log(`  - "${p.phrase}" ${p.count} câu, ${p.customers} khách | ${p.categoryLabel || '—'} / ${p.causeLabel || '—'} | z ${p.stats.z} | ${p.variants.join('; ')}`);
      if (arg('ex') === '1') for (const e of p.examples.slice(0, 2)) console.log(`      > ${e.text.slice(0, 110)}`);
    }
  }
})().catch((e) => { console.error('LỖI', e.message); process.exit(1); });
