/**
 * XUẤT BỘ NHÃN NGƯỜI (GOLD) TỪ MONGODB RA JSONL + MANIFEST
 * ==================================================================
 * Dùng sau khi đội ngũ hoàn thành gán nhãn ở tab Duyệt nhãn (mode=gold)
 * hoặc gộp bộ gold từ nhiều kho (ví dụ kho thật chung + kho BlueStone).
 *
 * Cách chạy:
 *   cd backend
 *   node scripts/export_gold.js --dbs=customer_radar_real,cr_t_6b063cbc5122d551a58f9737 --out=../nlp_service/data/real/gold_human.jsonl
 *
 * Lưu ý an toàn: chỉ đọc (`find`), không ghi vào cơ sở dữ liệu.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const insights = require('../services/insights');

function parseArgs(argv) {
  const out = { dbs: null, out: path.resolve(__dirname, '../../nlp_service/data/real/gold_human.jsonl'), mode: null };
  for (const a of argv) {
    if (a.startsWith('--dbs=')) out.dbs = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--db=')) out.dbs = [a.slice(5).trim()].filter(Boolean);
    else if (a.startsWith('--out=')) out.out = path.resolve(process.cwd(), a.slice(6).trim());
    else if (a.startsWith('--mode=')) out.mode = a.slice(7).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong môi trường.');
    process.exit(1);
  }
  const dbNames = args.dbs && args.dbs.length
    ? args.dbs
    : [process.env.MONGODB_REAL_DB || 'customer_radar_real'];

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const allRows = [];
    const perDb = {};
    const seen = new Set();

    for (const name of dbNames) {
      const db = client.db(name);
      const [feedbacks, labels] = await Promise.all([
        db.collection('feedbacks').find({}, {
          projection: { originalText: 1, rating: 1, productName: 1, productType: 1, productCategory: 1, source: 1, sentiment: 1 }
        }).toArray(),
        db.collection('audit_labels').find({}).toArray()
      ]);
      const filtered = args.mode ? labels.filter((l) => (l.sampleMode || 'random') === args.mode) : labels;
      const { rows } = insights.buildGoldExport(feedbacks, filtered);
      let kept = 0;
      for (const r of rows) {
        const uid = `${name}:${r.feedbackId}`;
        if (seen.has(uid)) continue;
        seen.add(uid);
        allRows.push({ ...r, sourceDb: name });
        kept += 1;
      }
      perDb[name] = { labels: filtered.length, exported: kept };
    }

    const bySplit = { train: 0, dev: 0, test: 0 };
    const testProducts = new Set();
    const rootCounts = {};
    for (const r of allRows) {
      if (bySplit[r.goldSplit] != null) bySplit[r.goldSplit] += 1;
      if (r.goldSplit === 'test' && r.productName) testProducts.add(r.productName);
      for (const k of r.rootCauses || []) rootCounts[k] = (rootCounts[k] || 0) + 1;
    }

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, allRows.map((r) => JSON.stringify(r)).join('\n') + (allRows.length ? '\n' : ''), 'utf8');
    const manifestPath = args.out.replace(/\.jsonl$/i, '') + '.manifest.json';
    const manifest = {
      generatedAt: new Date().toISOString(),
      labelSource: 'human',
      total: allRows.length,
      perDb,
      bySplit,
      testProducts: [...testProducts].sort(),
      rootCounts
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Đã xuất ${allRows.length} câu nhãn người -> ${args.out}`);
    console.log('Phân chia theo sản phẩm:', bySplit, '| số sản phẩm test:', testProducts.size);
    console.log('Manifest:', manifestPath);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Lỗi xuất bộ chuẩn:', err.message);
  process.exit(1);
});
