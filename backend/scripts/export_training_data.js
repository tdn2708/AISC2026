/**
 * XUẤT DỮ LIỆU HUẤN LUYỆN VISOBERT V5 TỪ KHO THẬT (CHỐNG RÒ RỈ THEO SẢN PHẨM & JACCARD)
 * ==================================================================
 * Chạy:
 *   node scripts/export_training_data.js [--dbs=customer_radar_real,cr_t_...] [--teacher-weight=0.5] [--claude-weight=0.5]
 *
 * Ra nlp_service/data/real/:
 *   train.jsonl    nhãn người (1,0) + nhãn thầy Qwen3 trùng 2 lần (0,5) + nhãn Claude (0,5); KHÔNG dùng nhãn luật
 *   dev.jsonl      nhãn người thuộc sản phẩm dev (dùng chọn epoch & hiệu chỉnh ngưỡng calibrate.py)
 *   test.jsonl     nhãn người thuộc sản phẩm test — không bao giờ vào train/dev
 *   manifest.json  nguồn gốc nhãn, danh sách sản phẩm test, số câu bị loại do chống rò rỉ
 *
 * Chống rò rỉ bắt buộc (mục 3.4 kế hoạch v5):
 *   1. Chia gold theo SẢN PHẨM (`insights.goldSplit(productName)`): sản phẩm rơi vào test
 *      thì MỌI câu (cả người, thầy, Claude) của sản phẩm đó đều không được vào train/dev.
 *   2. Loại gần trùng: mọi câu train có Jaccard token >= 0,8 với bất kỳ câu gold test nào bị loại.
 *   3. Tiền tố đầu vào `[N sao] [loại hàng] văn bản đã che PII` đi qua đúng `prepareInput`.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { prepareInput } = require('../services/visobert_client');
const taxonomy = require('../services/taxonomy');
const { isBlindTest, goldSplit, normalizeProductKey } = require('../services/insights');

const OUT_DIR = path.join(__dirname, '..', '..', 'nlp_service', 'data', 'real');
const INPUT_MODE = 'masked';
const JACCARD_LEAK_THRESHOLD = 0.8;

/** Tập token chữ/số chuẩn hóa để đo Jaccard chống rò rỉ gần trùng */
function tokenSet(text) {
  const toks = String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return new Set(toks);
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const t of small) if (big.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

function makeRow(doc, label, source, weight) {
  const rating = Number.isFinite(doc.rating) ? doc.rating : null;
  const productName = doc.productName || '';
  const productType = doc.productType || taxonomy.productTypeOf(productName) || null;
  const out = {
    feedbackId: String(doc._id || ''),
    productName,
    ...(productType ? { productType } : {}),
    text: doc.originalText,
    input: prepareInput(doc.originalText, INPUT_MODE, rating, productType),
    inputMode: INPUT_MODE,
    inputRating: rating !== null,
    inputProductType: Boolean(productType),
    sentiment: label.sentiment,
    source,
    weight
  };
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
  // Nhãn L3 (`roots`): chỉ ghi khi nguồn có gán L3 (câu không phải khiếu nại mang [])
  if (Array.isArray(label.rootCauses)) {
    const nonComplaint = out.category === null && !(out.categories && out.categories.length);
    out.roots = taxonomy.normalizeRootCauses(label.rootCauses, { nonComplaint });
  }
  return out;
}

/**
 * Hàm thuần dựng bộ train/dev/test + manifest từ mảng docs, human, teacher
 * (tách khỏi MongoDB để chạy kiểm thử chống rò rỉ trong `npm test`).
 */
function buildV5Dataset({ docs = [], human = [], teacher = [], teacherWeight = 0.5, claudeWeight = 0.5, jaccardThreshold = JACCARD_LEAK_THRESHOLD } = {}) {
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const humanIds = new Set(human.map((h) => String(h.feedbackId)));

  const trainRaw = [];
  const dev = [];
  const test = [];
  const testProductKeys = new Set();
  const testProductNames = new Set();
  const devProductKeys = new Set();

  const counts = {
    humanTrain: 0,
    humanDev: 0,
    humanTest: 0,
    teacherTrain: 0,
    claudeTrain: 0,
    teacherSkippedTestProduct: 0,
    teacherSkippedDevProduct: 0,
    teacherSkippedBlind: 0,
    teacherSkippedHuman: 0,
    teacherSkippedDisagreed: 0,
    claudeSkippedTestProduct: 0,
    claudeSkippedDevProduct: 0,
    rulesSkipped: 0,
    droppedNearDupTest: 0,
    missingDoc: 0
  };

  // Bước 1: chia nhãn người theo SẢN PHẨM (`goldSplit`)
  for (const h of human) {
    const doc = byId.get(String(h.feedbackId));
    if (!doc || !String(doc.originalText || '').trim()) { counts.missingDoc += 1; continue; }
    const pName = doc.productName || h.productName || '';
    const pKey = normalizeProductKey(pName);
    const split = h.goldSplit || goldSplit(pName);
    const label = {
      sentiment: h.correctSentiment,
      category: h.correctCategory,
      subCategory: h.correctCause,
      rootCauses: Array.isArray(h.correctRootCauses) ? h.correctRootCauses : (h.correctCategory === 'Other' ? [] : undefined),
      sarcasm: h.sarcasm
    };
    const r = makeRow(doc, label, 'human', 1.0);
    if (split === 'test') {
      test.push(r);
      counts.humanTest += 1;
      if (pKey) testProductKeys.add(pKey);
      if (pName) testProductNames.add(pName);
    } else if (split === 'dev') {
      dev.push(r);
      counts.humanDev += 1;
      if (pKey) devProductKeys.add(pKey);
    } else {
      trainRaw.push(r);
      counts.humanTrain += 1;
    }
  }

  // Bước 2: nhãn thầy Qwen3 (chỉ giữ câu 2 lần trùng L2, loại mọi câu thuộc sản phẩm test/dev hoặc test mù)
  const teacherUsedIds = new Set();
  for (const t of teacher) {
    const id = String(t.feedbackId);
    if (humanIds.has(id)) { counts.teacherSkippedHuman += 1; continue; }
    if (t.agreed === false) { counts.teacherSkippedDisagreed += 1; continue; }
    if (isBlindTest(id)) { counts.teacherSkippedBlind += 1; continue; }
    const doc = byId.get(id);
    if (!doc || !String(doc.originalText || '').trim()) { counts.missingDoc += 1; continue; }
    const pKey = normalizeProductKey(doc.productName);
    if (pKey && testProductKeys.has(pKey)) { counts.teacherSkippedTestProduct += 1; continue; }
    if (pKey && devProductKeys.has(pKey)) { counts.teacherSkippedDevProduct += 1; continue; }
    if (goldSplit(doc.productName) === 'test') { counts.teacherSkippedTestProduct += 1; continue; }
    teacherUsedIds.add(id);
    trainRaw.push(makeRow(doc, t, 'teacher', teacherWeight));
    counts.teacherTrain += 1;
  }

  // Bước 3: nhãn Claude hiện có trên phản hồi (trọng số 0,5); nhãn luật bị loại hoàn toàn
  for (const doc of docs) {
    const id = String(doc._id);
    if (humanIds.has(id) || teacherUsedIds.has(id)) continue;
    const by = String(doc.labelledBy || '').toLowerCase();
    if (by === 'rules' || !by || by === 'synthetic') {
      if (by === 'rules') counts.rulesSkipped += 1;
      continue;
    }
    if (by !== 'claude') continue;
    if (!String(doc.originalText || '').trim()) continue;
    if (isBlindTest(id)) continue;
    const pKey = normalizeProductKey(doc.productName);
    if ((pKey && testProductKeys.has(pKey)) || goldSplit(doc.productName) === 'test') {
      counts.claudeSkippedTestProduct += 1;
      continue;
    }
    if (pKey && devProductKeys.has(pKey)) {
      counts.claudeSkippedDevProduct += 1;
      continue;
    }
    const label = {
      sentiment: doc.sentiment || 'Neutral',
      category: doc.category || 'Other',
      subCategory: doc.subCategory || null,
      rootCauses: Array.isArray(doc.rootCauses) && doc.rootCauses.length ? doc.rootCauses : undefined,
      sarcasm: typeof doc.sarcasm?.verdict === 'string' ? doc.sarcasm.verdict === 'sarcastic' : undefined
    };
    trainRaw.push(makeRow(doc, label, 'claude', claudeWeight));
    counts.claudeTrain += 1;
  }

  // Bước 4: chống rò rỉ gần trùng (token Jaccard >= 0,8 với bất kỳ câu gold test nào)
  const testTokenSets = test.map((r) => tokenSet(r.text));
  const train = [];
  for (const r of trainRaw) {
    const ts = tokenSet(r.text);
    let leaked = false;
    for (const tts of testTokenSets) {
      if (jaccard(ts, tts) >= jaccardThreshold) {
        leaked = true;
        break;
      }
    }
    if (leaked) {
      counts.droppedNearDupTest += 1;
      if (r.source === 'human') counts.humanTrain -= 1;
      else if (r.source === 'teacher') counts.teacherTrain -= 1;
      else if (r.source === 'claude') counts.claudeTrain -= 1;
      continue;
    }
    train.push(r);
  }

  return {
    train,
    dev,
    test,
    counts,
    testProducts: [...testProductNames].sort()
  };
}

async function main() {
  const teacherWeight = Number(process.argv.find((a) => a.startsWith('--teacher-weight='))?.split('=')[1]) || 0.5;
  const claudeWeight = Number(process.argv.find((a) => a.startsWith('--claude-weight='))?.split('=')[1]) || 0.5;
  const dbsArg = process.argv.find((a) => a.startsWith('--dbs='))?.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
  const dbNames = dbsArg && dbsArg.length ? dbsArg : [process.env.MONGODB_REAL_DB || 'customer_radar_real'];

  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const allDocs = [];
  const allHuman = [];
  const allTeacher = [];
  const teacherModels = new Set();
  try {
    for (const dbName of dbNames) {
      const db = client.db(dbName);
      const [docs, human, teacher] = await Promise.all([
        db.collection('feedbacks').find({}, {
          projection: { originalText: 1, rating: 1, productName: 1, productType: 1, productCategory: 1, category: 1, subCategory: 1, rootCauses: 1, sentiment: 1, sarcasm: 1, labelledBy: 1 }
        }).toArray(),
        db.collection('audit_labels').find({}).toArray(),
        db.collection('teacher_labels').find({}).toArray()
      ]);
      for (const d of docs) allDocs.push({ ...d, _id: `${dbName}:${String(d._id)}` });
      for (const h of human) allHuman.push({ ...h, feedbackId: `${dbName}:${String(h.feedbackId)}` });
      for (const t of teacher) {
        if (t.model) teacherModels.add(t.model);
        allTeacher.push({ ...t, feedbackId: `${dbName}:${String(t.feedbackId)}` });
      }
    }
  } finally {
    await client.close();
  }

  const { train, dev, test, counts, testProducts } = buildV5Dataset({
    docs: allDocs,
    human: allHuman,
    teacher: allTeacher,
    teacherWeight,
    claudeWeight
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const write = (name, rows) => fs.writeFileSync(path.join(OUT_DIR, name), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  write('train.jsonl', train);
  write('dev.jsonl', dev);
  write('test.jsonl', test);

  const sarcasticIn = (rows) => rows.filter((r) => r.sarcasm === true).length;
  const rootIn = (rows) => rows.filter((r) => Array.isArray(r.roots) && r.roots.length > 0).length;
  const bySource = (rows) => rows.reduce((acc, r) => { acc[r.source] = (acc[r.source] || 0) + 1; return acc; }, {});

  const manifest = {
    version: 'v5',
    databases: dbNames,
    exportedAt: new Date().toISOString(),
    inputMode: INPUT_MODE,
    inputRating: true,
    inputProductType: true,
    teacherWeight,
    claudeWeight,
    teacherModels: [...teacherModels],
    counts,
    labelSources: { train: bySource(train), dev: bySource(dev), test: bySource(test) },
    sarcastic: { train: sarcasticIn(train), dev: sarcasticIn(dev), test: sarcasticIn(test) },
    withRootCauses: { train: rootIn(train), dev: rootIn(dev), test: rootIn(test) },
    testProducts,
    labelProvenance: 'Nhãn người (trọng số 1,0): audit_labels. Nhãn thầy Qwen3 (trọng số 0,5): teacher_labels chỉ giữ câu 2 lần trùng L2. Nhãn Claude (trọng số 0,5): phản hồi labelledBy=claude. Nhãn luật không dùng. test.jsonl chỉ gồm nhãn người trên các sản phẩm test.',
    leakageGuard: `Chia theo sản phẩm (goldSplit) + loại mọi câu train có sản phẩm nằm trong test + loại câu có Jaccard token >= ${JACCARD_LEAK_THRESHOLD} với bất kỳ câu test nào.`
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'train.manifest.json'), JSON.stringify({ ...manifest, total: train.length }, null, 2), 'utf8');

  console.log(`Xuất v5 từ [${dbNames.join(', ')}]: train ${train.length} (người ${counts.humanTrain}, thầy ${counts.teacherTrain}, claude ${counts.claudeTrain}), dev ${dev.length}, test ${test.length} (${testProducts.length} sản phẩm)`);
  console.log(`Loại chống rò rỉ: gần trùng test ${counts.droppedNearDupTest}, thầy bất đồng ${counts.teacherSkippedDisagreed}, nhãn luật bỏ qua ${counts.rulesSkipped}`);
}

if (require.main === module) {
  require('dotenv').config();
  main().catch((e) => {
    console.error('Lỗi:', e.message);
    process.exit(1);
  });
}

module.exports = { tokenSet, jaccard, makeRow, buildV5Dataset, JACCARD_LEAK_THRESHOLD };
