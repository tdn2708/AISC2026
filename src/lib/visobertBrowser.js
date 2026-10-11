/**
 * VISOBERT CHẠY NGAY TRONG TRÌNH DUYỆT
 * ==================================================================
 * Bản ONNX nén int8 của mô hình tinh chỉnh (~98 MB) được tải về MỘT lần từ
 * kho mô hình Hugging Face, lưu trong bộ nhớ đệm của trình duyệt, rồi chạy
 * tại chỗ bằng onnxruntime-web. Không cần máy chủ mô hình, và câu phản hồi
 * (đã được backend che thông tin cá nhân) không gửi tới dịch vụ suy luận nào.
 *
 * Đo trên tập kiểm tra + dev: dự đoán trùng khớp 100% với mô hình PyTorch
 * gốc (80/80 câu). Tokenizer JS trùng khớp 87/87 câu với tokenizer Python.
 *
 * Phần giải mã nhãn chép từ nlp_service/visobert_model.py::decode và phần
 * giải thích từ service.py::/explain — sửa một bên thì phải sửa bên kia.
 */

const MODEL_BASE = (import.meta.env?.VITE_VISOBERT_MODEL_URL ||
  'https://huggingface.co/tdn278/customer-radar-visobert-onnx/resolve/main').replace(/\/+$/, '');
const CACHE_NAME = 'cr-visobert-v1';
const TASKS = ['sentiment', 'category', 'cause', 'spam'];
const NONE = 'NONE';
const PAD_ID = 1;
const OCCLUSION_MAX_WORDS = 60;
const BATCH = 16;

let loading = null;
let engine = null;

/** Trình duyệt có chạy được không (WebAssembly là điều kiện tối thiểu) */
export const browserModelSupported = () => typeof WebAssembly === 'object' && typeof fetch === 'function';
export const browserModelReady = () => Boolean(engine);

// Trạng thái tải dùng chung cho mọi màn hình (thanh tiến độ), đọc qua
// useSyncExternalStore: { phase: idle|meta|model|init|ready|error, loaded, total, fromCache, error }
let status = { phase: 'idle', loaded: 0, total: 0 };
const listeners = new Set();
const setStatus = (s) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l());
};
export const getModelStatus = () => status;
export const subscribeModelStatus = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Tải một tệp, báo tiến độ, và giữ trong Cache Storage cho các lần sau */
async function fetchCached(url, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      onProgress?.(buf.byteLength, buf.byteLength, true);
      return buf;
    }
  } catch {
    cache = null; // trình duyệt chặn bộ nhớ đệm: vẫn chạy, chỉ là lần sau tải lại
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url.split('/').pop()} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let buf;
  if (res.body && onProgress) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(received, total, false);
    }
    const all = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    buf = all.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* hết dung lượng đệm: bỏ qua */
  }
  return buf;
}

/**
 * Nạp mô hình (một lần cho cả phiên). onProgress({ phase, loaded, total, fromCache })
 */
export function loadBrowserModel(onProgressCb) {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  const onProgress = (s) => {
    setStatus(s);
    onProgressCb?.(s);
  };
  loading = (async () => {
    // Bản chỉ có WASM (không WebGPU): tệp .wasm được Vite đóng gói và phục vụ
    // từ chính trang web — không phụ thuộc thêm một CDN có thể bị chặn ở mạng
    // trường hay mạng hội trường
    const [ort, { Tokenizer }] = await Promise.all([import('onnxruntime-web/wasm'), import('@huggingface/tokenizers')]);

    onProgress?.({ phase: 'meta', loaded: 0, total: 0 });
    const text = async (f) => new TextDecoder().decode(await fetchCached(`${MODEL_BASE}/${f}`));
    const [meta, tokJson, tokCfg] = await Promise.all([
      text('meta.json').then(JSON.parse),
      text('tokenizer.json').then(JSON.parse),
      text('tokenizer_config.json').then(JSON.parse)
    ]);
    const modelBuf = await fetchCached(`${MODEL_BASE}/model_int8.onnx`, (loaded, total, fromCache) =>
      onProgress?.({ phase: 'model', loaded, total, fromCache })
    );
    onProgress?.({ phase: 'init', loaded: 0, total: 0 });
    const session = await ort.InferenceSession.create(modelBuf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    engine = { ort, session, meta, tokenizer: new Tokenizer(tokJson, tokCfg), maxLen: Math.min(256, meta.maxLength || 256) };
    onProgress?.({ phase: 'ready', loaded: 0, total: 0 });
    return engine;
  })();
  loading.catch((e) => {
    loading = null;
    setStatus({ phase: 'error', error: e.message || 'Không tải được mô hình' });
  });
  return loading;
}

// ------------------------------------------------------------------
// Toán học nhỏ
// ------------------------------------------------------------------
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const softmax = (row, temp = 1) => {
  const z = row.map((v) => v / temp);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};
const logSoftmax = (row, temp = 1) => {
  const z = row.map((v) => v / temp);
  const m = Math.max(...z);
  const lse = m + Math.log(z.reduce((a, v) => a + Math.exp(v - m), 0));
  return z.map((v) => v - lse);
};
const logSumExp = (arr) => {
  const m = Math.max(...arr);
  return m + Math.log(arr.reduce((a, v) => a + Math.exp(v - m), 0));
};
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const argmax = (arr) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);

// ------------------------------------------------------------------
// Mã hóa + chạy mô hình
// ------------------------------------------------------------------
function encode(eng, text) {
  const { ids, tokens } = eng.tokenizer.encode(text);
  const all = ids;
  // Cắt như tokenizer Python (truncation=True): giữ đầu câu, luôn kết thúc bằng </s>
  const cut = all.length > eng.maxLen ? [...all.slice(0, eng.maxLen - 1), all[all.length - 1]] : all;
  const toks = tokens.length > eng.maxLen ? [...tokens.slice(0, eng.maxLen - 1), tokens[tokens.length - 1]] : tokens;
  return { ids: cut, tokens: toks, fullLength: all.length };
}

// onnxruntime-web không cho hai lượt session.run chạy đồng thời trên cùng một
// phiên ("Session already started"). Người dùng bấm nhanh hai thử thách, hay
// React chạy hiệu ứng hai lần, là đủ để đụng nhau — nên mọi lượt xếp hàng.
let queue = Promise.resolve();
function serialized(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

/** Logits cho cả lô: { task: number[][] } */
function logits(eng, texts) {
  return serialized(() => logitsUnqueued(eng, texts));
}

async function logitsUnqueued(eng, texts) {
  const out = Object.fromEntries(TASKS.map((t) => [t, []]));
  for (let i = 0; i < texts.length; i += BATCH) {
    const enc = texts.slice(i, i + BATCH).map((t) => encode(eng, t).ids);
    const L = Math.max(...enc.map((e) => e.length));
    const ids = new BigInt64Array(enc.length * L).fill(BigInt(PAD_ID));
    const mask = new BigInt64Array(enc.length * L).fill(0n);
    enc.forEach((e, b) => e.forEach((id, j) => { ids[b * L + j] = BigInt(id); mask[b * L + j] = 1n; }));
    const feeds = {
      input_ids: new eng.ort.Tensor('int64', ids, [enc.length, L]),
      attention_mask: new eng.ort.Tensor('int64', mask, [enc.length, L])
    };
    const res = await eng.session.run(feeds);
    for (const t of TASKS) {
      const tensor = res[`${t}_logits`];
      const width = tensor.dims[1];
      for (let b = 0; b < enc.length; b++) out[t].push(Array.from(tensor.data.slice(b * width, (b + 1) * width)));
    }
  }
  return out;
}

function causeGroups(labels) {
  const groups = {};
  labels.cause.forEach((key, idx) => {
    if (key === NONE) return;
    const cat = key.split('.', 1)[0];
    (groups[cat] ||= []).push(idx);
  });
  return groups;
}

/** Bản JavaScript của visobert_model.decode cho MỘT câu */
function decodeOne(eng, lg) {
  const { labels, trainedTasks: trained, multiLabel } = eng.meta;
  const cal = eng.meta.calibration || {};
  const catThresholds = cal.categoryThresholds || {};
  const catThreshold = eng.meta.thresholds?.category ?? 0.5;
  const causeThreshold = cal.causeThreshold ?? eng.meta.thresholds?.cause ?? 0.3;
  const groups = causeGroups(labels);
  const noneIdx = labels.category.indexOf(NONE);
  const r = {};

  if (trained.sentiment) {
    const p = softmax(lg.sentiment, cal.sentimentTemperature || 1);
    const j = argmax(p);
    r.sentiment = labels.sentiment[j];
    r.sentimentConfidence = r4(p[j]);
  }

  if (trained.category) {
    const row = multiLabel ? lg.category.map(sigmoid) : softmax(lg.category);
    const causeP = multiLabel ? lg.cause.map(sigmoid) : softmax(lg.cause);
    const bestCause = (cat) => {
      if (!trained.cause || !groups[cat]) return { cause: null, p: null, uncertain: false };
      const idxs = groups[cat];
      let sub = idxs.map((i) => causeP[i]);
      if (!multiLabel) { const s = Math.max(sub.reduce((a, b) => a + b, 0), 1e-9); sub = sub.map((v) => v / s); }
      const k = argmax(sub);
      return { cause: labels.cause[idxs[k]].split('.').slice(1).join('.'), p: r4(sub[k]), uncertain: Boolean(multiLabel && sub[k] < causeThreshold) };
    };

    if (multiLabel) {
      const scored = labels.category.map((c, j) => [c, row[j], j]).filter(([, , j]) => j !== noneIdx).sort((a, b) => b[1] - a[1]);
      const detected = scored.filter(([c, p]) => p >= (catThresholds[c] ?? catThreshold));
      const noneP = row[noneIdx];
      let primary;
      let primaryP;
      if (!detected.length && noneP >= scored[0][1]) { primary = null; primaryP = noneP; } else { [primary, primaryP] = detected.length ? detected[0] : scored[0]; }
      const chosen = detected.length ? detected : (primary === null ? [] : [[primary, primaryP]]);
      r.categories = chosen.map(([c, p]) => {
        const bc = bestCause(c);
        return { category: c, p: r4(p), cause: bc.cause, causeConfidence: bc.p, causeUncertain: bc.uncertain };
      });
      r.category = primary;
      r.categoryConfidence = r4(primaryP);
      r.noneProbability = r4(noneP);
      const bc = primary ? bestCause(primary) : { cause: null, p: null, uncertain: false };
      Object.assign(r, { cause: bc.cause, causeConfidence: bc.p, causeUncertain: bc.uncertain });
    } else {
      const j = argmax(row);
      const cat = labels.category[j];
      r.category = cat === NONE ? null : cat;
      r.categoryConfidence = r4(row[j]);
      const bc = r.category ? bestCause(r.category) : { cause: null, p: null, uncertain: false };
      Object.assign(r, { cause: bc.cause, causeConfidence: bc.p, causeUncertain: bc.uncertain });
      r.categories = r.category ? [{ category: r.category, p: r.categoryConfidence, cause: r.cause, causeConfidence: r.causeConfidence, causeUncertain: bc.uncertain }] : [];
    }
  }

  if (trained.spam) {
    const p = softmax(lg.spam, cal.spamTemperature || 1);
    r.spamProbability = r4(p[labels.spam.indexOf('spam')]);
  }
  return r;
}

const pick = (lg, i) => Object.fromEntries(TASKS.map((t) => [t, lg[t][i]]));

/** Dự đoán cho nhiều câu — cùng dạng kết quả với POST /predict */
export async function browserPredict(texts) {
  const eng = await loadBrowserModel();
  const lg = await logits(eng, texts);
  return texts.map((_, i) => decodeOne(eng, pick(lg, i)));
}

/** Giải thích một câu — cùng dạng kết quả với POST /explain của nlp_service */
export async function browserExplain(text) {
  const eng = await loadBrowserModel();
  const { labels, trainedTasks: trained, multiLabel } = eng.meta;
  const cal = eng.meta.calibration || {};
  const t0 = performance.now();
  const enc = encode(eng, text);
  const t1 = performance.now();

  const lg = pick(await logits(eng, [text]), 0);
  const toProbs = (task, row) =>
    multiLabel && (task === 'category' || task === 'cause') ? row.map(sigmoid) : softmax(row, cal[`${task}Temperature`] || 1);
  const probs = Object.fromEntries(TASKS.map((t) => [t, toProbs(t, lg[t])]));
  const prediction = decodeOne(eng, lg);
  const t2 = performance.now();

  const dist = (task) => labels[task].map((l, i) => ({ label: l, p: r4(probs[task][i]) })).sort((a, b) => b.p - a.p);
  const distributions = {};
  if (trained.sentiment) distributions.sentiment = dist('sentiment');
  if (trained.category) {
    distributions.category = dist('category');
    const groups = causeGroups(labels);
    const cat = prediction.category;
    if (trained.cause && groups[cat]) {
      let sub = groups[cat].map((i) => probs.cause[i]);
      if (!multiLabel) { const s = Math.max(sub.reduce((a, b) => a + b, 0), 1e-9); sub = sub.map((v) => v / s); }
      distributions.cause = groups[cat]
        .map((i, k) => ({ label: labels.cause[i].split('.').slice(1).join('.'), p: r4(sub[k]) }))
        .sort((a, b) => b.p - a.p)
        .slice(0, 5);
    }
  }
  if (trained.spam) distributions.spam = r4(probs.spam[labels.spam.indexOf('spam')]);

  // Mức ảnh hưởng từng từ: bỏ lần lượt từng từ, đo độ giảm LOG-ODDS tính thẳng
  // từ logit (không qua xác suất, để không bị bão hòa ở ~1.0)
  const logOdds = (task, row, target) => {
    if (multiLabel && (task === 'category' || task === 'cause')) return row[target];
    const lp = logSoftmax(row, cal[`${task}Temperature`] || 1);
    return lp[target] - logSumExp(lp.filter((_, i) => i !== target));
  };
  const words = text.split(/\s+/).filter(Boolean);
  let importance = null;
  if (words.length >= 2 && words.length <= OCCLUSION_MAX_WORDS) {
    const variants = words.map((_, i) => [...words.slice(0, i), ...words.slice(i + 1)].join(' '));
    const occ = await logits(eng, variants);
    importance = {};
    for (const task of ['category', 'sentiment']) {
      if (!trained[task]) continue;
      const target = argmax(probs[task]);
      const baseLo = logOdds(task, lg[task], target);
      importance[task] = {
        target: labels[task][target],
        base: r4(probs[task][target]),
        measure: 'log-odds',
        values: occ[task].map((row) => Math.round((baseLo - logOdds(task, row, target)) * 1000) / 1000),
        probAfter: occ[task].map((row) => r4(toProbs(task, row)[target]))
      };
    }
  }
  const t3 = performance.now();

  return {
    modelInput: text,
    tokens: enc.tokens,
    tokenCount: enc.ids.length,
    maxLength: eng.maxLen,
    truncated: enc.fullLength > eng.maxLen,
    prediction,
    distributions,
    multiLabel: Boolean(multiLabel),
    thresholds: eng.meta.thresholds || null,
    calibrated: Boolean(Object.keys(cal).length),
    calibration: null,
    words,
    importance,
    noneLabel: NONE,
    timings: {
      tokenizeMs: Math.round((t1 - t0) * 10) / 10,
      inferenceMs: Math.round((t2 - t1) * 10) / 10,
      explainMs: Math.round((t3 - t2) * 10) / 10
    },
    device: 'trình duyệt (WebAssembly)',
    trainedAt: eng.meta.trainedAt || null
  };
}
