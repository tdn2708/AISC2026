/**
 * XUẤT DỮ LIỆU HUẤN LUYỆN VISOBERT V4 TỪ KHO THẬT
 * ==================================================================
 * Chạy:  node scripts/export_training_data.js [--teacher-weight=0.5]
 *
 * Ra nlp_service/data/real/:
 *   train.jsonl  nhãn người (trọng số 1) + nhãn mô hình thầy (trọng số thấp hơn)
 *   dev.jsonl    ~15% nhãn người không thuộc test mù — chỉ để chọn epoch
 *   test.jsonl   nhãn người trên các câu TEST MÙ — không bao giờ vào train/dev
 *   manifest.json  nguồn gốc từng tệp, để mọi con số truy vết được
 *
 * Quy tắc:
 *   - Câu test mù (insights.isBlindTest) chỉ xuất hiện trong test.jsonl, và chỉ
 *     khi có nhãn NGƯỜI. Nhãn thầy của câu test mù bị bỏ hẳn.
 *   - Câu có nhãn người thì không dùng nhãn thầy (người thắng).
 *   - Đầu vào đi qua ĐÚNG hàm prepareInput lúc chạy thật, kèm tiền tố số sao.
 *   - Không bao giờ chỉnh dữ liệu theo câu test đang sai; test chỉ để đo.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { prepareInput } = require('../services/visobert_client');
const { isBlindTest } = require('../services/insights');

const OUT_DIR = path.join(__dirname, '..', '..', 'nlp_service', 'data', 'real');
const TEACHER_WEIGHT = Number(process.argv.find((a) => a.startsWith('--teacher-weight='))?.split('=')[1]) || 0.5;
const INPUT_MODE = 'masked';

// Tách dev khỏi train cũng theo mã băm (khác hạt với test mù) để ổn định giữa các lần xuất
const isDev = (id) => crypto.createHash('sha1').update(`dev:${id}`).digest().readUInt32BE(0) % 100 < 15;

function row(doc, label, source, weight) {
  const rating = Number.isFinite(doc.rating) ? doc.rating : null;
  const out = {
    text: doc.originalText,
    input: prepareInput(doc.originalText, INPUT_MODE, rating),
    inputMode: INPUT_MODE,
    inputRating: rating !== null,
    sentiment: label.sentiment,
    source,
    weight
  };
  // Nhiều vấn đề trong một câu (nhãn thầy) hoặc một vấn đề (nhãn người)
  if (Array.isArray(label.issues) && label.issues.length) {
    out.categories = label.issues.map((x) => x.category);
    out.causes = label.issues.map((x) => x.cause || null);
  } else if (label.category && label.category !== 'Other') {
    out.category = label.category;
    out.cause = label.subCategory || null;
  } else {
    out.category = null;
  }
  if (typeof label.sarcasm === 'boolean') out.sarcasm = label.sarcasm;
  return out;
}

async function main() {
  const dbName = process.env.MONGODB_REAL_DB || 'customer_radar_real';
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db(dbName);
  const [docs, human, teacher] = await Promise.all([
    db.collection('feedbacks').find({}, { projection: { originalText: 1, rating: 1 } }).toArray(),
    db.collection('audit_labels').find({}).toArray(),
    db.collection('teacher_labels').find({}).toArray()
  ]);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const humanIds = new Set(human.map((h) => String(h.feedbackId)));

  const train = [];
  const dev = [];
  const test = [];
  const counts = { humanTrain: 0, humanDev: 0, humanTest: 0, teacherTrain: 0, teacherSkippedBlind: 0, teacherSkippedHuman: 0, missingDoc: 0 };

  for (const h of human) {
    const doc = byId.get(String(h.feedbackId));
    if (!doc || !String(doc.originalText || '').trim()) { counts.missingDoc += 1; continue; }
    const label = { sentiment: h.correctSentiment, category: h.correctCategory, subCategory: h.correctCause, sarcasm: h.sarcasm };
    if (isBlindTest(h.feedbackId)) { test.push(row(doc, label, 'human', 1)); counts.humanTest += 1; }
    else if (isDev(h.feedbackId)) { dev.push(row(doc, label, 'human', 1)); counts.humanDev += 1; }
    else { train.push(row(doc, label, 'human', 1)); counts.humanTrain += 1; }
  }

  for (const t of teacher) {
    const id = String(t.feedbackId);
    if (isBlindTest(id)) { counts.teacherSkippedBlind += 1; continue; }
    if (humanIds.has(id)) { counts.teacherSkippedHuman += 1; continue; }
    const doc = byId.get(id);
    if (!doc || !String(doc.originalText || '').trim()) { counts.missingDoc += 1; continue; }
    train.push(row(doc, t, 'teacher', TEACHER_WEIGHT));
    counts.teacherTrain += 1;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const write = (name, rows) => fs.writeFileSync(path.join(OUT_DIR, name), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  write('train.jsonl', train);
  write('dev.jsonl', dev);
  write('test.jsonl', test);

  const sarcasticIn = (rows) => rows.filter((r) => r.sarcasm === true).length;
  const manifest = {
    database: dbName,
    exportedAt: new Date().toISOString(),
    inputMode: INPUT_MODE,
    inputRating: true,
    teacherWeight: TEACHER_WEIGHT,
    teacherModels: [...new Set(teacher.map((t) => t.model).filter(Boolean))],
    counts,
    sarcastic: { train: sarcasticIn(train), dev: sarcasticIn(dev), test: sarcasticIn(test) },
    labelProvenance: 'Nhãn người: trang Kiểm tra trên web (audit_labels). Nhãn thầy: mô hình ngôn ngữ chạy trên Kaggle (teacher_labels), trọng số thấp hơn. test.jsonl chỉ gồm nhãn người trên bộ test mù cố định (15%, theo mã băm).',
    leakageGuard: 'Câu test mù không bao giờ vào train/dev; nhãn thầy của câu test mù bị bỏ.'
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'train.manifest.json'), JSON.stringify({ ...manifest, total: train.length }, null, 2), 'utf8');

  console.log(`Kho ${dbName}: train ${train.length} (người ${counts.humanTrain}, thầy ${counts.teacherTrain}), dev ${dev.length}, test mù ${test.length}`);
  console.log(`Câu mỉa mai: train ${manifest.sarcastic.train}, dev ${manifest.sarcastic.dev}, test ${manifest.sarcastic.test}`);
  if (test.length < 100) console.log('Lưu ý: test mù còn ít nhãn người — con số đo trên đó sẽ có khoảng tin cậy rộng.');
  await client.close();
}

main().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
