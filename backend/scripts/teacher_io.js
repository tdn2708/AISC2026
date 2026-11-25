/**
 * TRAO ĐỔI DỮ LIỆU VỚI MÔ HÌNH THẦY TRÊN KAGGLE (Qwen3 — v5 có L3 gia_dung)
 * ==================================================================
 *   node scripts/teacher_io.js export [--dbs=customer_radar_real,cr_t_...]
 *       -> nlp_service/data/real/teacher_input.jsonl + taxonomy.json
 *   node scripts/teacher_io.js import <teacher_output.jsonl> [--model=Qwen/Qwen3-8B] [--db=...]
 *
 * export: phản hồi đã che PII, kèm số sao, productType và cờ goldSplit/blind.
 * import: đọc kết quả notebook (hỗ trợ chạy 2 lần ở hai nhiệt độ khác nhau),
 *         chuẩn hóa L1/L2/L3 theo taxonomy, lưu vào `teacher_labels` — KHÔNG
 *         ghi đè nhãn đang hiển thị trong `feedbacks`. Báo tỉ lệ hai lần trùng L2.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MongoClient } = require('mongodb');
const { maskPII, stripHtml } = require('../services/normalizer');
const taxonomy = require('../services/taxonomy');
const { isBlindTest, goldSplit } = require('../services/insights');

const OUT_DIR = path.join(__dirname, '..', '..', 'nlp_service', 'data', 'real');

function realDbName(override) {
  const name = override || process.env.MONGODB_REAL_DB || 'customer_radar_real';
  if (name === (process.env.MONGODB_DB || 'customer_radar')) throw new Error(`${name} trùng kho mô phỏng`);
  return name;
}

/** Chuẩn hóa một dòng đầu ra của mô hình thầy (hàm thuần để kiểm thử được) */
function parseTeacherRow(r, model = 'Qwen/Qwen3-8B') {
  if (!r || typeof r !== 'object') return null;
  const sentiment = ['Positive', 'Negative', 'Neutral'].includes(r.sentiment) ? r.sentiment : null;
  if (!r.id || !sentiment) return null;

  const category = taxonomy.normalizeCategory(r.category);
  const issues = (Array.isArray(r.issues) ? r.issues : [])
    .map((x) => {
      const c = taxonomy.normalizeCategory(x?.category);
      return c && c !== 'Other' ? { category: c, cause: taxonomy.normalizeCause(c, x?.cause) } : null;
    })
    .filter(Boolean);

  const primaryCat = issues[0]?.category || (category && category !== 'Other' ? category : 'Other');
  const primaryCause = primaryCat !== 'Other'
    ? (issues[0]?.cause || taxonomy.normalizeCause(primaryCat, r.subCategory))
    : null;

  const rawRoots = r.rootCauses ?? r.root_causes ?? [];
  const rootCauses = taxonomy.normalizeRootCauses(rawRoots, { nonComplaint: primaryCat === 'Other' });
  const failureTiming = rootCauses.length ? taxonomy.normalizeTiming(r.failureTiming ?? r.failure_timing) : null;

  // Nếu notebook chạy 2 lần nhiệt độ khác nhau: cờ `agreed` báo hai lần có trùng L2 không
  const agreed = typeof r.agreed === 'boolean' ? r.agreed : true;

  return {
    feedbackId: String(r.id),
    sourceDb: r.sourceDb || null,
    sentiment,
    category: primaryCat,
    subCategory: primaryCause,
    issues,
    rootCauses,
    failureTiming,
    agreed,
    ...(Array.isArray(r.pass2Issues) ? { pass2Issues: r.pass2Issues } : {}),
    sarcasm: typeof r.sarcasm === 'boolean' ? r.sarcasm : null,
    reason: typeof r.reason === 'string' ? r.reason.slice(0, 300) : null,
    model,
    importedAt: new Date()
  };
}

/** Dựng tệp taxonomy.json kèm gói L3 `gia_dung` cho notebook thầy */
function buildTeacherTaxonomy() {
  return {
    categories: taxonomy.flatTaxonomy().map((c) => ({
      key: c.key,
      label: c.label,
      causes: c.causes.map((x) => ({ key: x.key, label: x.label }))
    })),
    rootPacks: taxonomy.flatRootPacks(),
    failureTimings: Object.entries(taxonomy.FAILURE_TIMINGS).map(([key, v]) => ({ key, label: v.label, description: v.description }))
  };
}

async function exportInput(dbsArg) {
  const dbNames = dbsArg && dbsArg.length ? dbsArg : [realDbName()];
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const lines = [];
  const seen = new Set();
  try {
    for (const dbName of dbNames) {
      const docs = await client.db(dbName).collection('feedbacks')
        .find({}, { projection: { originalText: 1, rating: 1, productName: 1, productCategory: 1, productType: 1 } }).toArray();
      for (const d of docs) {
        const cleanText = maskPII(stripHtml(d.originalText)).text.trim();
        if (!cleanText) continue;
        const id = String(d._id);
        const uid = `${dbName}:${id}`;
        if (seen.has(uid)) continue;
        seen.add(uid);
        const productName = d.productName || null;
        const productType = d.productType || taxonomy.productTypeOf(productName) || null;
        lines.push(JSON.stringify({
          id,
          sourceDb: dbName,
          text: cleanText,
          rating: Number.isFinite(d.rating) ? d.rating : null,
          productName,
          productType,
          productCategory: d.productCategory || null,
          isAppliance: taxonomy.isApplianceProduct(productName, d.productCategory),
          goldSplit: goldSplit(productName),
          blind: isBlindTest(d._id)
        }));
      }
    }
  } finally {
    await client.close();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'teacher_input.jsonl');
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'taxonomy.json'), JSON.stringify(buildTeacherTaxonomy(), null, 2), 'utf8');
  console.log(`Đã xuất ${lines.length} phản hồi từ [${dbNames.join(', ')}] (đã che PII, kèm L3 & loại hàng) -> ${file}`);
  console.log('Tải teacher_input.jsonl và taxonomy.json lên Kaggle, rồi chạy kaggle/01_teacher_qwen3.ipynb.');
}

async function importLabels(file, model, dbOverride) {
  if (!file || !fs.existsSync(file)) throw new Error('Cần đường dẫn tới teacher_output.jsonl');
  const rows = [];
  let bad = 0;
  let agreedCount = 0;
  let disagreedCount = 0;
  let withRoot = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      bad += 1;
      continue;
    }
    const parsed = parseTeacherRow(raw, model);
    if (!parsed) {
      bad += 1;
      continue;
    }
    if (parsed.agreed) agreedCount += 1;
    else disagreedCount += 1;
    if (parsed.rootCauses.length) withRoot += 1;
    rows.push(parsed);
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI);
  try {
    const col = client.db(realDbName(dbOverride)).collection('teacher_labels');
    if (rows.length) {
      await col.bulkWrite(rows.map((r) => ({ updateOne: { filter: { feedbackId: r.feedbackId }, update: { $set: r }, upsert: true } })));
    }
  } finally {
    await client.close();
  }
  const agreeRate = rows.length ? ((agreedCount / rows.length) * 100).toFixed(1) : '0.0';
  console.log(`Đã nhập ${rows.length} nhãn thầy (${model}), bỏ ${bad} dòng hỏng.`);
  console.log(`Hai lần trùng L2: ${agreedCount}/${rows.length} (${agreeRate}%), bất đồng: ${disagreedCount}, có L3: ${withRoot}, mỉa mai: ${rows.filter((r) => r.sarcasm).length}.`);
}

if (require.main === module) {
  require('dotenv').config();
  const [cmd, file] = process.argv.slice(2);
  const model = process.argv.find((a) => a.startsWith('--model='))?.split('=')[1] || 'Qwen/Qwen3-8B';
  const dbsArg = process.argv.find((a) => a.startsWith('--dbs='))?.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
  const dbOverride = process.argv.find((a) => a.startsWith('--db='))?.slice(5).trim() || null;
  (cmd === 'export' ? exportInput(dbsArg) : cmd === 'import' ? importLabels(file, model, dbOverride) : Promise.reject(new Error('Dùng: teacher_io.js export [--dbs=...] | import <file> [--model=...] [--db=...]')))
    .catch((e) => {
      console.error('Lỗi:', e.message);
      process.exit(1);
    });
}

module.exports = { parseTeacherRow, buildTeacherTaxonomy };
