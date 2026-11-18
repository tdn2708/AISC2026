/**
 * KIỂM MÔ HÌNH MỚI TRƯỚC KHI GẮN LÊN WEB
 * ==================================================================
 * Bạn cùng nhóm gửi model_int8.onnx, tokenizer.json, tokenizer_config.json,
 * meta.json (và special_tokens_map.json). Trước khi đẩy lên Hugging Face, kiểm
 * các file khớp với cách trang web đọc mô hình (src/lib/visobertBrowser.js) và
 * với taxonomy của máy chủ; lệch nhãn là web xếp sai nhóm ngay trước giám khảo.
 * So thêm với mô hình đang chạy trên HF (đọc meta.json công khai).
 *
 * Chạy: cd backend && npm run model:check -- --dir=../nlp_service/deploy/onnx
 * Đạt thì đẩy: cd nlp_service && .venv/Scripts/python.exe deploy/push_onnx.py
 */
const fs = require('fs');
const path = require('path');
const taxonomy = require('../services/taxonomy');

const arg = (name, fb) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || fb;
const DIR = path.resolve(__dirname, '..', arg('dir', '../nlp_service/deploy/onnx'));
const HF = (process.env.VITE_VISOBERT_MODEL_URL || 'https://huggingface.co/tdn278/customer-radar-visobert-onnx/resolve/main').replace(/\/+$/, '');
const REQUIRED = ['model_int8.onnx', 'tokenizer.json', 'tokenizer_config.json', 'meta.json'];
const MAX_MODEL_MB = 200;

const fail = [];
const warn = [];
const ok = (m) => console.log(`  ĐẠT  ${m}`);

function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  } catch (e) {
    fail.push(`${f} không đọc được: ${e.message}`);
    return null;
  }
}

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

(async () => {
  console.log(`Kiểm mô hình trong ${DIR}\n`);
  for (const f of REQUIRED) {
    if (!fs.existsSync(path.join(DIR, f))) fail.push(`thiếu ${f}`);
  }
  if (fail.length) return finish();

  const mb = fs.statSync(path.join(DIR, 'model_int8.onnx')).size / 1048576;
  if (mb > MAX_MODEL_MB) fail.push(`model_int8.onnx ${mb.toFixed(0)} MB, quá ${MAX_MODEL_MB} MB để trình duyệt tải`);
  else ok(`model_int8.onnx ${mb.toFixed(0)} MB`);
  readJson('tokenizer.json');
  readJson('tokenizer_config.json');
  const meta = readJson('meta.json');
  if (!meta) return finish();
  const L = meta.labels || {};

  // Cảm xúc
  if (!Array.isArray(L.sentiment) || !sameSet(L.sentiment, ['Positive', 'Negative', 'Neutral'])) fail.push(`nhãn cảm xúc phải là Positive, Negative, Neutral (đang là ${JSON.stringify(L.sentiment)})`);
  else ok('nhãn cảm xúc');

  // Nhóm vấn đề: đúng 7 nhóm của taxonomy cộng NONE
  const cats = taxonomy.CATEGORY_KEYS;
  if (!Array.isArray(L.category) || !L.category.includes('NONE')) fail.push('nhãn nhóm vấn đề thiếu NONE');
  else {
    const extra = L.category.filter((c) => c !== 'NONE' && !cats.includes(c));
    const missing = cats.filter((c) => !L.category.includes(c));
    if (extra.length) fail.push(`nhóm vấn đề lạ, máy chủ không biết: ${extra.join(', ')}`);
    if (missing.length) warn.push(`mô hình không có nhóm: ${missing.join(', ')}`);
    if (!extra.length) ok(`nhãn nhóm vấn đề (${L.category.length - 1} nhóm)`);
  }

  // Nguyên nhân: "Nhóm.Nguyên nhân" có trong taxonomy
  if (Array.isArray(L.cause)) {
    const bad = L.cause.filter((c) => {
      if (c === 'NONE') return false;
      const [cat, cause] = String(c).split('.');
      return !cats.includes(cat) || !taxonomy.TAXONOMY[cat] || !Object.keys(taxonomy.TAXONOMY[cat].causes || taxonomy.TAXONOMY[cat].subCategories || {}).includes(cause);
    });
    if (bad.length) fail.push(`nguyên nhân lạ, máy chủ không biết: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '...' : ''}`);
    else ok(`nhãn nguyên nhân (${L.cause.length - 1} nguyên nhân)`);
  } else warn.push('mô hình không có đầu nguyên nhân');

  if (!Array.isArray(L.spam) || !L.spam.includes('spam')) fail.push('thiếu đầu rác (labels.spam phải có "spam")');
  else ok('đầu rác');
  if (L.sarcasm && !L.sarcasm.includes('sarcastic')) fail.push('labels.sarcasm phải có "sarcastic"');
  else if (L.sarcasm) ok('đầu mỉa mai');
  else warn.push('mô hình không có đầu mỉa mai (web vẫn chạy, chỉ thiếu điểm mỉa mai)');

  if (!Number.isFinite(meta.maxLength) || meta.maxLength > 256) warn.push(`maxLength ${meta.maxLength}: trang web cắt ở 256`);
  if (!meta.thresholds) warn.push('meta.json thiếu thresholds: web dùng ngưỡng mặc định 0,5');
  if (meta.testOverlapRemoved == null && !meta.leakageGuard) warn.push('meta.json không ghi đã loại câu trùng bộ test: hỏi lại bạn cùng nhóm trước khi báo số');
  else ok(`chống rò rỉ bộ test: ${meta.testOverlapRemoved ?? 'có'} câu trùng đã loại`);

  // So với mô hình đang chạy trên HF
  try {
    const res = await fetch(`${HF}/meta.json`, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const cur = await res.json();
      const f1 = (m) => m?.devReport?.category?.macroF1 ?? m?.devReport?.categoryMacroF1 ?? null;
      console.log(`\nĐang chạy trên HF: huấn luyện ${cur.trainedAt || '—'}, F1 nhóm vấn đề (tập dev) ${f1(cur) ?? '—'}`);
      console.log(`Mô hình mới:      huấn luyện ${meta.trainedAt || '—'}, F1 nhóm vấn đề (tập dev) ${f1(meta) ?? '—'}`);
      if (cur.trainedAt && meta.trainedAt && cur.trainedAt === meta.trainedAt) warn.push('mô hình mới trùng ngày huấn luyện với bản đang chạy: có thể là cùng một bản');
    }
  } catch {
    warn.push('không đọc được meta.json trên HF để so');
  }
  finish();
})();

function finish() {
  for (const w of warn) console.log(`  LƯU Ý ${w}`);
  if (fail.length) {
    console.log(`\nKHÔNG ĐẠT:\n- ${fail.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nĐẠT: đẩy lên HF bằng nlp_service/deploy/push_onnx.py, rồi mở trang Lab kiểm 4 tab.');
  console.log('Số báo cáo: chỉ lấy F1 trên bộ test mù (nlp_service/eval_real.py với checkpoint PyTorch), không lấy số tập dev.');
}
