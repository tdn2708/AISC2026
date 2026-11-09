/**
 * TRAO ĐỔI DỮ LIỆU VỚI MÔ HÌNH THẦY TRÊN KAGGLE (Qwen3)
 * ==================================================================
 *   node scripts/teacher_io.js export                 -> nlp_service/data/real/teacher_input.jsonl
 *   node scripts/teacher_io.js import <teacher_output.jsonl> [--model=Qwen/Qwen3-8B]
 *
 * export: mọi phản hồi của kho thật, đã che PII, kèm số sao và cờ test mù.
 *         Mô hình thầy gán nhãn TẤT CẢ (kể cả câu test mù, để so sánh), nhưng
 *         script xuất dữ liệu huấn luyện không bao giờ lấy nhãn của câu test mù.
 * import: đọc kết quả notebook, kiểm tra từng nhãn theo taxonomy, lưu vào
 *         collection `teacher_labels` — KHÔNG ghi đè nhãn trong `feedbacks`.
 *         Nhãn thầy chỉ dùng để huấn luyện (trọng số thấp hơn nhãn người).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MongoClient } = require('mongodb');
const { maskPII, stripHtml } = require('../services/normalizer');
const taxonomy = require('../services/taxonomy');
const { isBlindTest } = require('../services/insights');

const OUT_DIR = path.join(__dirname, '..', '..', 'nlp_service', 'data', 'real');
const realDbName = () => {
  const name = process.env.MONGODB_REAL_DB || 'customer_radar_real';
  if (name === (process.env.MONGODB_DB || 'customer_radar')) throw new Error(`${name} trùng kho mô phỏng`);
  return name;
};

async function exportInput() {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const docs = await client.db(realDbName()).collection('feedbacks')
    .find({}, { projection: { originalText: 1, rating: 1, productCategory: 1 } }).toArray();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'teacher_input.jsonl');
  const lines = docs
    .filter((d) => String(d.originalText || '').trim())
    .map((d) => JSON.stringify({
      id: String(d._id),
      text: maskPII(stripHtml(d.originalText)).text,
      rating: Number.isFinite(d.rating) ? d.rating : null,
      productCategory: d.productCategory || null,
      blind: isBlindTest(d._id)
    }));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  // Taxonomy đi kèm để notebook dùng ĐÚNG bộ mã nhãn của hệ thống
  fs.writeFileSync(path.join(OUT_DIR, 'taxonomy.json'), JSON.stringify(taxonomy.flatTaxonomy().map((c) => ({
    key: c.key, label: c.label, causes: c.causes.map((x) => ({ key: x.key, label: x.label }))
  })), null, 2), 'utf8');
  console.log(`Đã xuất ${lines.length} phản hồi (đã che PII) -> ${file}`);
  console.log('Tải tệp này lên Kaggle làm dataset, rồi chạy notebook kaggle/01_teacher_qwen3.ipynb.');
  await client.close();
}

async function importLabels(file, model) {
  if (!file || !fs.existsSync(file)) throw new Error('Cần đường dẫn tới teacher_output.jsonl');
  const rows = [];
  let bad = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      bad += 1;
      continue;
    }
    const sentiment = ['Positive', 'Negative', 'Neutral'].includes(r.sentiment) ? r.sentiment : null;
    const category = taxonomy.normalizeCategory(r.category);
    // Nhiều vấn đề trong một câu: [{category, cause}]
    const issues = (Array.isArray(r.issues) ? r.issues : [])
      .map((x) => {
        const c = taxonomy.normalizeCategory(x?.category);
        return c && c !== 'Other' ? { category: c, cause: taxonomy.normalizeCause(c, x?.cause) } : null;
      })
      .filter(Boolean);
    if (!r.id || !sentiment) {
      bad += 1;
      continue;
    }
    rows.push({
      feedbackId: String(r.id),
      sentiment,
      category: category || 'Other',
      subCategory: category && category !== 'Other' ? taxonomy.normalizeCause(category, r.subCategory) : null,
      issues,
      sarcasm: typeof r.sarcasm === 'boolean' ? r.sarcasm : null,
      reason: typeof r.reason === 'string' ? r.reason.slice(0, 300) : null,
      model,
      importedAt: new Date()
    });
  }
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const col = client.db(realDbName()).collection('teacher_labels');
  if (rows.length) {
    await col.bulkWrite(rows.map((r) => ({ updateOne: { filter: { feedbackId: r.feedbackId }, update: { $set: r }, upsert: true } })));
  }
  console.log(`Đã nhập ${rows.length} nhãn thầy (${model}), bỏ ${bad} dòng hỏng. Mỉa mai: ${rows.filter((r) => r.sarcasm).length}.`);
  await client.close();
}

const [cmd, file] = process.argv.slice(2);
const model = process.argv.find((a) => a.startsWith('--model='))?.split('=')[1] || 'Qwen/Qwen3-8B';
(cmd === 'export' ? exportInput() : cmd === 'import' ? importLabels(file, model) : Promise.reject(new Error('Dùng: teacher_io.js export | import <file>')))
  .catch((e) => {
    console.error('Lỗi:', e.message);
    process.exit(1);
  });
