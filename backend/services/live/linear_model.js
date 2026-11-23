/**
 * MÔ HÌNH TUYẾN TÍNH CHO BÌNH LUẬN LIVESTREAM (chạy ngay trong Node)
 * ==================================================================
 * Trọng số sinh bởi nlp_service/live/train_linear.py từ bộ nhãn livestream_labeling
 * (8.157 bình luận bán hàng thật YouTube/TikTok, chia train/dev/test theo phiên).
 * Test 1.345 câu / 35 phiên: intent 5 lớp macro-F1 0,750 (luật từ khóa 0,388),
 * 9 lớp 0,576 (ViSoBERT fine-tune của nhóm: 0,577), cần trả lời F1 0,930.
 *
 * prep(), fold(), features() PHẢI GIỐNG HỆT bản Python (train_linear.py), nếu không trọng số
 * không còn đúng. Test "Live: mô hình tuyến tính JS khớp Python" kiểm điều này.
 *
 * Không có tệp trọng số (bản dựng thiếu tệp) thì available() = false và intent.js dùng luật như cũ.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'linear_model.json');
const KEEP = new Set('0123456789 ?!.,/+-:');

let model = null;
let loadError = null;

function load() {
  if (model || loadError) return model;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const index = new Map(raw.vocab.map((f, i) => [f, i]));
    // Trọng số xếp theo đặc trưng: W[i*K + k], K = số intent + số aspect. Mỗi đặc trưng có mặt
    // cộng vào K điểm liền nhau (nhanh gấp mấy lần mảng lồng mảng, ít rác bộ nhớ)
    const nI = raw.intents.length;
    const K = nI + raw.aspects.length;
    const V = raw.vocab.length;
    const W = new Float64Array(V * K);
    for (let k = 0; k < nI; k += 1) for (let i = 0; i < V; i += 1) W[i * K + k] = raw.intent.coef[k][i];
    for (let j = 0; j < raw.aspects.length; j += 1) for (let i = 0; i < V; i += 1) W[i * K + nI + j] = raw.aspect.coef[j][i];
    const idf = Float64Array.from(raw.idf);
    model = { intents: raw.intents, aspects: raw.aspects, index, idf, W, K, nI, bias: [...raw.intent.bias, ...raw.aspect.bias], threshold: raw.aspect.threshold, test: raw.test };
  } catch (e) {
    loadError = e;
    if (e.code !== 'ENOENT') console.warn('[LIVE] Không nạp được mô hình tuyến tính, dùng luật:', e.message);
  }
  return model;
}

const isLetter = (ch) => /\p{L}/u.test(ch);

/** Chữ thường NFC, bỏ [USER], link, số -> 0, ký hiệu khác (emoji...) -> *, rút ký tự lặp */
function prep(text) {
  let s = String(text ?? '').normalize('NFC').toLowerCase();
  s = s.split('[user]').join(' ');
  s = s.replace(/(https?:\/\/|www\.)\S+/g, ' url ');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) out += '*';
    else if (ch >= '0' && ch <= '9') out += '0';
    else if (isLetter(ch) || KEEP.has(ch)) out += ch;
    else if (/\s/.test(ch)) out += ' ';
    else out += '*';
  }
  out = out.replace(/(.)\1{2,}/g, '$1$1');
  return out.replace(/ +/g, ' ').trim();
}

function fold(s) {
  return s.replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function features(text) {
  const s = prep(text);
  const feats = [];
  for (const w0 of s.split(' ')) {
    if (!w0) continue;
    const w = ` ${w0} `;
    for (const n of [2, 3, 4]) {
      if (w.length < n) break;
      for (let i = 0; i + n <= w.length; i += 1) feats.push(`c:${w.slice(i, i + n)}`);
    }
  }
  const toks = fold(s).match(/[a-z0-9]+|[?!*]/g) || [];
  for (const t of toks) feats.push(`w:${t}`);
  for (let i = 0; i + 1 < toks.length; i += 1) feats.push(`b:${toks[i]}_${toks[i + 1]}`);
  if (s && /^[0 ,./x+\-:*]+$/.test(s) && s.includes('0')) feats.push('f:numonly');
  const nw = s.split(' ').filter(Boolean).length;
  feats.push(`f:len${nw <= 1 ? '1' : nw <= 3 ? '2' : nw <= 7 ? '4' : '8'}`);
  if (s.includes('?')) feats.push('f:qmark');
  return feats;
}

/** Vector TF-IDF thưa (chuẩn hóa L2) như Python vectorize() */
function vectorize(text, m) {
  const cnt = new Map();
  for (const f of features(text)) {
    const i = m.index.get(f);
    if (i !== undefined) cnt.set(i, (cnt.get(i) || 0) + 1);
  }
  let norm = 0;
  const vec = [];
  for (const [i, c] of cnt) {
    const v = (1 + Math.log(c)) * m.idf[i];
    vec.push([i, v]);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (const e of vec) e[1] /= norm;
  return vec;
}

function softmax(z) {
  const mx = Math.max(...z);
  const e = z.map((x) => Math.exp(x - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/**
 * @returns {null | { intent: string, probs: Object<string, number>, aspects: string[], aspectProbs: Object<string, number> }}
 */
function predict(text) {
  const m = load();
  if (!m) return null;
  const vec = vectorize(text, m);
  const { K, nI, W } = m;
  const z = m.bias.slice();
  for (const [i, v] of vec) {
    const base = i * K;
    for (let k = 0; k < K; k += 1) z[k] += W[base + k] * v;
  }
  const p = softmax(z.slice(0, nI));
  const probs = {};
  let best = 0;
  for (let k = 0; k < nI; k += 1) {
    probs[m.intents[k]] = p[k];
    if (p[k] > p[best]) best = k;
  }
  const aspectProbs = {};
  const aspects = [];
  for (let j = 0; j < m.aspects.length; j += 1) {
    const pr = 1 / (1 + Math.exp(-z[nI + j]));
    aspectProbs[m.aspects[j]] = pr;
    if (pr >= m.threshold[j]) aspects.push(m.aspects[j]);
  }
  return { intent: m.intents[best], probs, aspects, aspectProbs };
}

const available = () => Boolean(load());

module.exports = { predict, available, prep, fold, features };
