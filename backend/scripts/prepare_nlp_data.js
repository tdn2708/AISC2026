/**
 * CHUẨN BỊ DỮ LIỆU CHO VISOBERT
 * ==================================================================
 * Chạy trong backend/:
 *
 *   npm run nlp:prepare
 *       Sinh nlp_service/labels.json (không gian nhãn lấy thẳng từ
 *       taxonomy.js) và hai tập gold_dev / gold_test đã tiền xử lý.
 *       gold_test là tập mà train.py BẮT BUỘC dùng để loại câu rò rỉ.
 *
 *   npm run nlp:prepare -- --in du_lieu.jsonl --out ../nlp_service/data/train.jsonl
 *       Tiền xử lý tập tự gán nhãn. Mỗi dòng: {text, sentiment?, category?, cause?, spam?}
 *
 *   npm run nlp:prepare -- --in UIT-ViSFD/Train.csv --format visfd --out ../nlp_service/data/visfd_train.jsonl
 *       Chuyển UIT-ViSFD sang nhãn CẢM XÚC. 10 khía cạnh của UIT-ViSFD không
 *       khớp taxonomy 7x27 nên không suy ra danh mục; chỉ giữ các câu mà mọi
 *       khía cạnh cùng một cực tính, câu trái dấu bị bỏ thay vì gán bừa.
 *
 *   --input-mode masked|normalized   (mặc định theo VISOBERT_INPUT_MODE, rồi 'masked')
 *
 * Tiền xử lý dùng CHUNG hàm prepareInput() với lúc chạy thật, nên mô hình
 * không bao giờ học trên một phân phối rồi chạy trên phân phối khác.
 */

const fs = require('fs');
const path = require('path');

const taxonomy = require('../services/taxonomy');
const { prepareInput, INPUT_MODES } = require('../services/visobert_client');
const { ASPECT_DEV, ASPECT_TEST } = require('../evaluation/gold_dataset');

const NLP_DIR = path.join(__dirname, '..', '..', 'nlp_service');
const DATA_DIR = path.join(NLP_DIR, 'data');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/** Không gian nhãn: sinh từ taxonomy để Python không bao giờ lệch khỏi Node */
function buildLabels() {
  const cause = ['NONE'];
  for (const cat of taxonomy.CATEGORY_KEYS) {
    for (const key of Object.keys(taxonomy.TAXONOMY[cat].causes)) cause.push(`${cat}.${key}`);
  }
  return {
    sentiment: ['Positive', 'Negative', 'Neutral'],
    category: [...taxonomy.CATEGORY_KEYS, 'NONE'],
    cause,
    spam: ['not_spam', 'spam'],
    generatedFrom: 'backend/services/taxonomy.js'
  };
}

/** Kiểm tra nhãn của một dòng; trả về chuỗi lỗi hoặc null */
function validateRow(row) {
  if (!row.text || !String(row.text).trim()) return 'thiếu text';
  if ('sentiment' in row && row.sentiment !== null &&
      !['Positive', 'Negative', 'Neutral'].includes(row.sentiment)) {
    return `sentiment lạ: ${row.sentiment}`;
  }
  if ('category' in row && row.category !== null && !taxonomy.TAXONOMY[row.category]) {
    return `category không có trong taxonomy: ${row.category}`;
  }
  if ('cause' in row && row.cause !== null) {
    if (!row.category) return 'có cause mà không có category';
    if (!taxonomy.TAXONOMY[row.category].causes[row.cause]) {
      return `cause ${row.cause} không thuộc danh mục ${row.category}`;
    }
  }

  if ('categories' in row) {
    if (!Array.isArray(row.categories)) return 'categories phải là mảng';
    for (const c of row.categories) {
      if (!taxonomy.TAXONOMY[c]) return `categories chứa danh mục lạ: ${c}`;
    }
    if (new Set(row.categories).size !== row.categories.length) return 'categories bị trùng';
  }
  if ('causes' in row) {
    if (!Array.isArray(row.causes)) return 'causes phải là mảng';
    if (!Array.isArray(row.categories) || row.causes.length !== row.categories.length) {
      return 'causes phải cùng độ dài với categories (cùng thứ tự)';
    }
    row.causes.forEach((cz, i) => {
      if (cz !== null && !taxonomy.TAXONOMY[row.categories[i]].causes[cz]) {
        return `cause ${cz} không thuộc danh mục ${row.categories[i]}`;
      }
      return null;
    });
  }
  return null;
}

function toRow(src, mode) {
  const row = { text: String(src.text), input: prepareInput(src.text, mode), inputMode: mode };
  // `category`/`cause` là dạng một nhãn; `categories`/`causes` là dạng đa nhãn
  // (một phản hồi nêu nhiều vấn đề). Hai dạng dùng lẫn nhau được trong cùng tập.
  for (const k of ['sentiment', 'category', 'cause', 'spam', 'categories', 'causes']) {
    if (k in src) row[k] = src[k];
  }
  return row;
}

/** Bộ đọc CSV theo RFC 4180: bình luận có dấu phẩy, ngoặc kép và xuống dòng */
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (c === '"' && content[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/**
 * ÁNH XẠ KHÍA CẠNH CỦA UIT-ViSFD SANG TAXONOMY 7 DANH MỤC.
 *
 * UIT-ViSFD gán nhãn theo 10 khía cạnh của điện thoại, mỗi khía cạnh kèm một
 * cực tính, do NGƯỜI gán. Đây là nhãn thật duy nhất mà đề tài có ở quy mô
 * hàng nghìn câu, nên phải khai thác tối đa thay vì chỉ lấy cực tính toàn câu.
 *
 * Quy ước chuyển đổi: một khía cạnh bị gán Negative = một khiếu nại thuộc
 * danh mục tương ứng. Khía cạnh Positive/Neutral không sinh khiếu nại.
 *
 * GIỚI HẠN phải nêu khi báo cáo:
 *   - Ánh xạ có mất mát: GENERAL và OTHERS không ứng với danh mục nào, nên
 *     câu chỉ chê chung chung sẽ mang nhãn "không thuộc taxonomy".
 *   - Ánh xạ tới cấp danh mục (Level 1), KHÔNG suy ra được nguyên nhân
 *     (Level 2) — nguyên nhân vẫn phải học từ tập chuyên ngành.
 *   - Lệch miền: UIT-ViSFD là đánh giá điện thoại, không có khiếu nại giao
 *     hàng, thanh toán hay đổi trả.
 */
const VISFD_ASPECT_TO_CATEGORY = {
  PERFORMANCE: 'ProductQuality',
  BATTERY: 'ProductQuality',
  CAMERA: 'ProductQuality',
  SCREEN: 'ProductQuality',
  STORAGE: 'ProductQuality',
  DESIGN: 'ProductQuality',
  FEATURES: 'ProductQuality',
  'SER&ACC': 'CustomerService',
  PRICE: 'PricePromotion'
};

function readVisfd(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const textCol = header.indexOf('comment');
  const labelCol = header.indexOf('label');
  if (textCol < 0 || labelCol < 0) {
    throw new Error(`Không thấy cột comment/label trong ${file} (có: ${header.join(', ')})`);
  }

  const out = [];
  const stats = { multiAspect: 0, mixedPolarity: 0, withCategory: 0, none: 0, sentiment: {} };
  for (const r of rows.slice(1)) {
    const text = (r[textCol] || '').trim();
    const labels = [...(r[labelCol] || '').matchAll(/\{([A-Z&]+)#(Positive|Negative|Neutral)\}/g)];
    if (!text || labels.length === 0) continue;

    const polarities = new Set(labels.map((m) => m[2]));
    if (labels.length > 1) stats.multiAspect++;
    if (polarities.size > 1) stats.mixedPolarity++;

    // Cực tính toàn câu: có bất kỳ khía cạnh tiêu cực nào thì câu là tiêu cực.
    // Định nghĩa này khớp với mục đích của hệ thống (phát hiện vấn đề cần xử
    // lý) và khớp với cách tập chuyên ngành gán nhãn câu "khen nhưng chê".
    const sentiment = polarities.has('Negative') ? 'Negative'
      : polarities.has('Positive') ? 'Positive' : 'Neutral';

    const categories = [...new Set(
      labels.filter((m) => m[2] === 'Negative').map((m) => VISFD_ASPECT_TO_CATEGORY[m[1]]).filter(Boolean)
    )];

    stats.sentiment[sentiment] = (stats.sentiment[sentiment] || 0) + 1;
    if (categories.length) stats.withCategory++; else stats.none++;

    // Không có `causes`: UIT-ViSFD không cho suy ra nguyên nhân Level 2,
    // nên khóa này vắng mặt và đầu ra nguyên nhân bỏ qua các câu này
    out.push({ text, sentiment, categories });
  }

  console.log(
    `UIT-ViSFD: ${out.length} câu (nhãn người gán) | ${stats.multiAspect} câu nhiều khía cạnh | ` +
    `${stats.mixedPolarity} câu trái dấu | ${stats.withCategory} câu có khiếu nại ánh xạ được, ${stats.none} câu không\n` +
    `  cực tính: ${Object.entries(stats.sentiment).map(([k, v]) => `${k}=${v}`).join(', ')}`
  );
  return out;
}

function readJsonlFile(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`${file}:${i + 1} không phải JSON hợp lệ`); }
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envMode = process.env.VISOBERT_INPUT_MODE;
  const mode = args['input-mode'] || (INPUT_MODES.includes(envMode) ? envMode : 'masked');
  if (!INPUT_MODES.includes(mode)) {
    throw new Error(`--input-mode phải là một trong: ${INPUT_MODES.join(', ')}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const labelsPath = path.join(NLP_DIR, 'labels.json');
  fs.writeFileSync(labelsPath, JSON.stringify(buildLabels(), null, 2), 'utf8');
  console.log(`Đã ghi ${labelsPath}`);

  // Tập chuẩn: dev để train.py chọn epoch, test để loại rò rỉ và KHÔNG BAO GIỜ để huấn luyện
  writeJsonl(path.join(DATA_DIR, 'gold_dev.jsonl'), ASPECT_DEV.map((g) => toRow(g, mode)));
  writeJsonl(path.join(DATA_DIR, 'gold_test.jsonl'), ASPECT_TEST.map((g) => toRow(g, mode)));
  console.log(`Đã ghi gold_dev (${ASPECT_DEV.length}) và gold_test (${ASPECT_TEST.length}) — inputMode=${mode}`);

  if (!args.in) return;
  if (!args.out) throw new Error('Có --in thì phải có --out');

  const source = args.format === 'visfd' ? readVisfd(args.in) : readJsonlFile(args.in);
  const rows = [];
  const errors = [];
  source.forEach((src, i) => {
    const err = validateRow(src);
    if (err) errors.push(`dòng ${i + 1}: ${err}`);
    else rows.push(toRow(src, mode));
  });

  writeJsonl(args.out, rows);
  console.log(`Đã ghi ${rows.length} mẫu vào ${args.out}`);
  if (errors.length) {
    console.warn(`Bỏ ${errors.length} dòng lỗi. Ví dụ:\n  ` + errors.slice(0, 10).join('\n  '));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('Lỗi:', e.message);
    process.exit(1);
  }
}

module.exports = { buildLabels, validateRow, parseCsv, toRow, writeJsonl, DATA_DIR };
