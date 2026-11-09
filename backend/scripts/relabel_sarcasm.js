/**
 * GÁN LẠI NHÃN MỈA MAI CHO KHO ĐÃ CÓ
 * ==================================================================
 * Chạy:  node scripts/relabel_sarcasm.js --dry        (chỉ đếm, không gọi mô hình, không ghi)
 *        node scripts/relabel_sarcasm.js              (kho thật, mặc định)
 *        node scripts/relabel_sarcasm.js --limit=50   (thử trên 50 câu nghi vấn đầu)
 *
 * Phản hồi thu thập TRƯỚC khi có quy trình gán nhãn nhiều tầng chưa được kiểm
 * tra mỉa mai. Script này chạy đúng các bước của label_cascade cho kho cũ:
 * luật nghi mỉa mai → hỏi mô hình thứ hai cho câu bị nghi → bỏ phiếu.
 *
 * Không xoá gì: nhãn cũ được giữ trong labelVotes.primary, mọi thay đổi truy
 * vết được. Câu đã có trường `sarcasm` thì bỏ qua (chạy lại an toàn), trừ khi
 * thêm --force. Không bao giờ ghi vào kho mô phỏng.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { sarcasmSignals } = require('../services/sarcasm');
const { judgeSarcasm } = require('../services/ai_analyzer');
const { applyJudgement } = require('../services/label_cascade');

const args = process.argv.slice(2);
const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const LIMIT = Number(get('limit')) || 0;

async function main() {
  const dbName = process.env.MONGODB_REAL_DB || 'customer_radar_real';
  if (dbName === (process.env.MONGODB_DB || 'customer_radar')) {
    console.error(`Từ chối: ${dbName} trùng kho mô phỏng.`);
    process.exit(1);
  }
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const col = client.db(dbName).collection('feedbacks');
  // --retry-failed: chỉ chạy lại câu đã bị nghi nhưng mô hình thứ hai chưa trả lời
  // được (lỗi mạng, hết lượt). Nhãn gốc lấy lại từ labelVotes.primary.
  const RETRY = args.includes('--retry-failed');
  const query = RETRY
    ? { 'sarcasm.suspected': true, 'labelVotes.judge': null, 'sarcasm.by': { $ne: 'human' } }
    : FORCE ? {} : { sarcasm: { $exists: false } };
  const docs = (await col
    .find(query, { projection: { originalText: 1, rating: 1, sentiment: 1, category: 1, subCategory: 1, labelledBy: 1, labelVotes: 1 } })
    .toArray())
    .map((d) => (RETRY && d.labelVotes?.primary
      ? { ...d, sentiment: d.labelVotes.primary.sentiment, category: d.labelVotes.primary.category, subCategory: d.labelVotes.primary.subCategory, labelledBy: d.labelVotes.primary.by }
      : d));

  const flagged = [];
  const plain = [];
  for (const d of docs) {
    const s = sarcasmSignals({ text: d.originalText, rating: d.rating, sentiment: d.sentiment });
    (s.suspected || s.ratingConflict ? flagged : plain).push({ d, s });
  }
  console.log(`${dbName}: ${docs.length} phản hồi chưa kiểm tra mỉa mai — ${flagged.length} bị nghi hoặc lệch sao, ${plain.length} bình thường`);
  for (const { d, s } of flagged.slice(0, 8)) console.log(`  ${d.rating ?? '-'}★ [${d.sentiment}] ${String(d.originalText).slice(0, 90)}  ← ${s.signals.join('; ') || 'lệch sao'}`);
  if (DRY) {
    await client.close();
    return;
  }

  // Câu bình thường: ghi nhận đã kiểm tra, không đổi nhãn
  if (plain.length) {
    await col.bulkWrite(plain.map(({ d }) => ({
      updateOne: { filter: { _id: d._id }, update: { $set: { sarcasm: { suspected: false, verdict: null, signals: [], by: 'rules' }, needsReview: false } } }
    })));
  }

  const todo = LIMIT ? flagged.slice(0, LIMIT) : flagged;
  const stats = { sarcastic: 0, literal: 0, changed: 0, review: 0, judgeFailed: 0 };
  const BATCH = 10;
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const items = part.map(({ d }) => ({ text: d.originalText, rating: Number.isFinite(d.rating) ? d.rating : null }));
    const primaries = part.map(({ d }) => ({ sentiment: d.sentiment, category: d.category || 'Other', subCategory: d.subCategory || null, labelledBy: d.labelledBy || 'llm' }));
    const judges = (await judgeSarcasm(items.map((it, k) => ({ ...it, primary: primaries[k] })))) || part.map(() => null);
    const ops = part.map(({ d }, k) => {
      const r = applyJudgement(items[k], primaries[k], judges[k] || null);
      if (!judges[k]) stats.judgeFailed += 1;
      if (r.sarcasm.verdict === 'sarcastic') stats.sarcastic += 1;
      if (r.sarcasm.verdict === 'literal') stats.literal += 1;
      if (r.sentiment !== d.sentiment || r.category !== (d.category || 'Other')) stats.changed += 1;
      if (r.needsReview) stats.review += 1;
      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { sentiment: r.sentiment, category: r.category, subCategory: r.subCategory, labelledBy: r.labelledBy, sarcasm: r.sarcasm, labelVotes: r.labelVotes, needsReview: r.needsReview } }
        }
      };
    });
    await col.bulkWrite(ops);
    process.stdout.write(`\r  đã kiểm tra ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  console.log(`\nXong: mỉa mai ${stats.sarcastic}, không mỉa mai ${stats.literal}, đổi nhãn ${stats.changed}, chờ người duyệt ${stats.review}, mô hình thứ hai lỗi ${stats.judgeFailed}`);
  await client.close();
}

main().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
