"""
DỊCH VỤ SUY LUẬN VISOBERT (hỗ trợ PyTorch lẫn ONNX INT8 cho Hugging Face Space CPU)
==================================================================
Chạy:  python service.py            (mặc định http://127.0.0.1:8001)

Endpoint
  GET  /health   trạng thái: đã nạp bộ mã hóa chưa, có checkpoint/ONNX chưa
  POST /embed    {"texts": [...]} -> vector nhúng (mean pooling, chuẩn hóa L2)
  POST /predict  {"texts": [...]} -> nhãn cảm xúc / danh mục / nguyên nhân L2 / L3 / rác / mỉa mai (lô <= 32)
  POST /explain  {"text": "..."}  -> phân bố xác suất + độ quan trọng từng từ (log-odds occlusion)

Bảo mật & riêng tư:
  - Văn bản gửi tới ĐÃ được backend Node che PII. Dịch vụ KHÔNG ghi log nội dung văn bản.
  - Khi chạy công khai (Space), đặt `VISOBERT_KEY` (hoặc `VISOBERT_API_KEY`): mọi request
    tới `/embed`, `/predict`, `/explain` phải gửi `Authorization: Bearer <key>` hoặc `X-Api-Key: <key>`.

Biến môi trường
  VISOBERT_BASE        thư mục trọng số gốc      (mặc định ../visobert)
  VISOBERT_CHECKPOINT  thư mục checkpoint        (mặc định checkpoints/visobert-absa)
  VISOBERT_ONNX_DIR    thư mục ONNX INT8 (chứa model_int8.onnx, tokenizer.json, meta.json)
  VISOBERT_RUNTIME     auto | onnx | torch       (mặc định auto: ưu tiên ONNX nếu có VISOBERT_ONNX_DIR)
  VISOBERT_KEY         khóa truy cập header (tương thích cả VISOBERT_API_KEY)
  VISOBERT_HOST / VISOBERT_PORT                  (mặc định 127.0.0.1 / 8001)
  VISOBERT_MAX_LEN     độ dài token tối đa       (mặc định 256, trần 512)
  VISOBERT_THREADS     số luồng CPU
"""

import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import hmac
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import numpy as np
import torch
import torch.nn.functional as F
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from visobert_model import (
    DEFAULT_BASE,
    DEFAULT_CHECKPOINT,
    MULTI_LABEL_TASKS,
    NONE,
    cause_indexes_by_category,
    decode,
    load_checkpoint,
    load_encoder,
    load_tokenizer,
    mean_pool,
)

MAX_TEXTS = 32
BATCH = 32
BASE = Path(os.environ.get("VISOBERT_BASE", DEFAULT_BASE))
CHECKPOINT = Path(os.environ.get("VISOBERT_CHECKPOINT", DEFAULT_CHECKPOINT))
ONNX_DIR = Path(os.environ["VISOBERT_ONNX_DIR"]) if os.environ.get("VISOBERT_ONNX_DIR") else (Path(__file__).resolve().parent / "deploy" / "onnx")
RUNTIME = os.environ.get("VISOBERT_RUNTIME", "auto").strip().lower()
MAX_LEN = min(int(os.environ.get("VISOBERT_MAX_LEN", 256)), 512)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

if os.environ.get("VISOBERT_THREADS"):
    torch.set_num_threads(int(os.environ["VISOBERT_THREADS"]))

state = {
    "encoder": None,
    "tokenizer": None,
    "model": None,
    "model_tokenizer": None,
    "onnx_session": None,
    "onnx_tokenizer": None,
    "onnx_tasks": [],
    "runtime": None,
    "meta": None,
    "checkpoint_error": None,
}


def _try_load_onnx(onnx_dir: Path):
    model_file = onnx_dir / "model_int8.onnx"
    if not model_file.exists():
        model_file = onnx_dir / "model.onnx"
    meta_file = onnx_dir / "meta.json"
    tok_file = onnx_dir / "tokenizer.json"
    if not (model_file.exists() and meta_file.exists() and tok_file.exists()):
        return False
    import onnxruntime as ort
    from tokenizers import Tokenizer

    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    tok = Tokenizer.from_file(str(tok_file))
    max_len = min(MAX_LEN, int(meta.get("maxLength") or MAX_LEN))
    tok.enable_truncation(max_length=max_len)
    tok.enable_padding(pad_id=1, pad_token="<pad>")

    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    if os.environ.get("VISOBERT_THREADS"):
        opts.intra_op_num_threads = int(os.environ["VISOBERT_THREADS"])
    sess = ort.InferenceSession(str(model_file), sess_options=opts, providers=["CPUExecutionProvider"])
    tasks = [o.name.replace("_logits", "") for o in sess.get_outputs() if o.name.endswith("_logits")]
    state.update(onnx_session=sess, onnx_tokenizer=tok, onnx_tasks=tasks, meta=meta, runtime="onnx")
    print(f"[visobert] Đã nạp ONNX {model_file.name} từ {onnx_dir} (đầu ra: {tasks})")
    return True


@asynccontextmanager
async def lifespan(_app):
    has_base = (BASE / "pytorch_model.bin").exists() or (BASE / "model.safetensors").exists()
    has_checkpoint = (CHECKPOINT / "meta.json").exists()

    if has_base:
        state["tokenizer"] = load_tokenizer(BASE)
        state["encoder"] = load_encoder(BASE).to(DEVICE).eval()
        print(f"[visobert] Đã nạp bộ mã hóa gốc từ {BASE} ({DEVICE})")
    else:
        print(f"[visobert] Không có trọng số gốc tại {BASE} — /embed tạm đóng, /predict vẫn chạy")

    loaded = False
    if RUNTIME in ("auto", "onnx"):
        try:
            loaded = _try_load_onnx(ONNX_DIR)
        except Exception as e:
            state["checkpoint_error"] = str(e)
            print(f"[visobert] Không nạp được ONNX từ {ONNX_DIR}: {e}")

    if not loaded and RUNTIME in ("auto", "torch") and has_checkpoint:
        try:
            model, tok, meta = load_checkpoint(CHECKPOINT, DEVICE)
            state.update(model=model, model_tokenizer=tok, meta=meta, runtime="torch")
            loaded = True
            print(f"[visobert] Đã nạp checkpoint PyTorch {CHECKPOINT} (train lúc {meta.get('trainedAt')})")
        except Exception as e:
            state["checkpoint_error"] = str(e)
            print(f"[visobert] Không nạp được checkpoint {CHECKPOINT}: {e}")

    if not loaded and not has_base:
        raise RuntimeError(
            f"Không thấy trọng số ViSoBERT trong {BASE}, ONNX trong {ONNX_DIR} lẫn checkpoint trong {CHECKPOINT}."
        )
    if not loaded:
        print(f"[visobert] Chưa có checkpoint/ONNX tại {CHECKPOINT} — /predict tạm đóng, /embed vẫn chạy")
    yield


app = FastAPI(title="Customer Radar — ViSoBERT", lifespan=lifespan)

# Hỗ trợ cả VISOBERT_KEY (kế hoạch v5) và VISOBERT_API_KEY (tương thích bản cũ)
API_KEY = (os.environ.get("VISOBERT_KEY") or os.environ.get("VISOBERT_API_KEY") or "").strip()


def _authorized(headers) -> bool:
    if not API_KEY:
        return True
    auth = headers.get("authorization", "")
    xkey = headers.get("x-api-key", "")
    return hmac.compare_digest(auth, f"Bearer {API_KEY}") or hmac.compare_digest(xkey, API_KEY)


@app.middleware("http")
async def require_api_key(request, call_next):
    if API_KEY and request.url.path in ("/embed", "/predict", "/explain"):
        if not _authorized(request.headers):
            return JSONResponse({"detail": "Thiếu hoặc sai khóa truy cập dịch vụ"}, status_code=401)
    return await call_next(request)


class TextsIn(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=MAX_TEXTS)


def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _predict_ready() -> bool:
    return state["onnx_session"] is not None or state["model"] is not None


@app.get("/health")
def health():
    meta = state["meta"]
    return {
        "status": "ok",
        "device": "cpu (onnx)" if state["runtime"] == "onnx" else DEVICE,
        "runtime": state["runtime"],
        "maxLength": MAX_LEN,
        "maxBatch": MAX_TEXTS,
        "encoderLoaded": state["encoder"] is not None,
        "finetuned": _predict_ready(),
        "checkpointError": state["checkpoint_error"],
        "checkpoint": None if meta is None else {
            k: meta.get(k) for k in (
                "model", "inputMode", "trainedTasks", "trainCounts", "bestEpoch",
                "devReport", "leakageGuard", "excludedTestSha256",
                "testOverlapRemoved", "trainedAt", "dataManifests", "hyperparameters",
                "calibration", "multiLabel", "inputRating", "inputProductType", "thresholds",
            )
        },
    }


@app.post("/embed")
@torch.inference_mode()
def embed(body: TextsIn):
    tok, enc = state["tokenizer"], state["encoder"]
    if enc is None:
        raise HTTPException(503, "Bản triển khai này không mang trọng số gốc nên không tính vector nhúng.")
    vectors = []
    for part in chunks(body.texts, BATCH):
        batch = tok(part, padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(DEVICE)
        hidden = enc(**batch).last_hidden_state
        pooled = F.normalize(mean_pool(hidden, batch["attention_mask"]), dim=-1)
        vectors.extend([[round(x, 5) for x in v] for v in pooled.cpu().tolist()])
    return {"dim": len(vectors[0]) if vectors else 0, "vectors": vectors}


def _forward_logits(texts, max_len):
    if state["runtime"] == "onnx":
        sess = state["onnx_session"]
        tok = state["onnx_tokenizer"]
        tasks = state["onnx_tasks"]
        parts = {t: [] for t in tasks}
        for part in chunks(texts, BATCH):
            encs = tok.encode_batch(part)
            ids = np.asarray([e.ids for e in encs], dtype=np.int64)
            mask = np.asarray([e.attention_mask for e in encs], dtype=np.int64)
            outs = sess.run([f"{t}_logits" for t in tasks], {"input_ids": ids, "attention_mask": mask})
            for t, arr in zip(tasks, outs):
                parts[t].append(torch.from_numpy(arr))
        return {t: torch.cat(v, dim=0) for t, v in parts.items()}

    model = state["model"]
    tok = state["model_tokenizer"]
    parts = {t: [] for t in model.tasks}
    for part in chunks(texts, BATCH):
        batch = tok(part, padding=True, truncation=True, max_length=max_len, return_tensors="pt").to(DEVICE)
        out = model(batch["input_ids"], batch["attention_mask"])
        for t in model.tasks:
            parts[t].append(out[t].cpu())
    return {t: torch.cat(v, dim=0) for t, v in parts.items()}


@app.post("/predict")
@torch.inference_mode()
def predict(body: TextsIn):
    meta = state["meta"]
    if not _predict_ready() or meta is None:
        raise HTTPException(503, "Chưa có checkpoint ViSoBERT tinh chỉnh. Chạy train.py trước; "
                                 "trọng số gốc chưa học nhãn nên không được dùng để dự đoán.")
    max_len = min(MAX_LEN, int(meta.get("maxLength") or MAX_LEN))
    logits = _forward_logits(body.texts, max_len)
    out = decode(
        logits,
        meta["labels"],
        meta["trainedTasks"],
        multi_label=bool(meta.get("multiLabel")),
        calibration=meta.get("calibration"),
    )
    return {"predictions": out, "trainedTasks": meta["trainedTasks"], "multiLabel": bool(meta.get("multiLabel"))}


class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


OCCLUSION_MAX_WORDS = 60


def explain_from_logits(logits, meta):
    """
    Hàm thuần giải mã dự đoán và phân bố xác suất cho `/explain` từ cùng bộ logits.
    Tách thành hàm riêng để test so khớp 3 nơi giải mã (`visobert_model.decode`,
    `service.py /explain`, `src/lib/visobertBrowser.js decodeOne`) chạy trực tiếp không cần tải checkpoint.
    """
    labels, trained = meta["labels"], meta["trainedTasks"]
    multi_label = bool(meta.get("multiLabel"))
    cal = meta.get("calibration") or {}

    def to_probs(task, rows):
        if task == "root" or (multi_label and task in MULTI_LABEL_TASKS):
            return torch.sigmoid(rows)
        return torch.softmax(rows / float(cal.get(f"{task}Temperature", 1.0) or 1.0), dim=-1)

    probs = {t: to_probs(t, logits[t][0]) for t in logits}
    prediction = decode(
        {t: logits[t] for t in logits},
        labels,
        trained,
        multi_label=multi_label,
        calibration=cal,
    )[0]

    def dist(task):
        rows = [{"label": l, "p": round(float(p), 4)} for l, p in zip(labels[task], probs[task])]
        return sorted(rows, key=lambda r: -r["p"])

    distributions = {}
    if trained.get("sentiment") and "sentiment" in probs:
        distributions["sentiment"] = dist("sentiment")
    if trained.get("category") and "category" in probs:
        distributions["category"] = dist("category")
        cat = prediction.get("category")
        groups = cause_indexes_by_category(labels)
        if trained.get("cause") and "cause" in probs and cat in groups:
            idxs = groups[cat]
            sub = probs["cause"][idxs]
            if not multi_label:
                sub = sub / sub.sum().clamp(min=1e-9)
            distributions["cause"] = sorted(
                [{"label": labels["cause"][i].split(".", 1)[1], "p": round(float(p), 4)} for i, p in zip(idxs, sub)],
                key=lambda r: -r["p"],
            )[:5]
    if trained.get("root") and "root" in probs:
        distributions["root"] = [r for r in dist("root") if r["label"] != NONE][:6]
    if trained.get("spam") and "spam" in probs:
        distributions["spam"] = round(float(probs["spam"][labels["spam"].index("spam")]), 4)

    return prediction, distributions, probs, to_probs


@app.post("/explain")
@torch.inference_mode()
def explain(body: TextIn):
    meta = state["meta"]
    if not _predict_ready() or meta is None:
        raise HTTPException(503, "Chưa có checkpoint ViSoBERT tinh chỉnh.")
    labels, trained = meta["labels"], meta["trainedTasks"]
    max_len = min(MAX_LEN, int(meta.get("maxLength") or MAX_LEN))

    t0 = time.perf_counter()
    if state["runtime"] == "onnx":
        enc_one = state["onnx_tokenizer"].encode(body.text)
        ids = enc_one.ids
        pieces = enc_one.tokens
        truncated = len(ids) >= max_len
    else:
        tok = state["model_tokenizer"]
        all_ids = tok(body.text)["input_ids"]
        ids = all_ids[:max_len]
        pieces = tok.convert_ids_to_tokens(ids)
        truncated = len(all_ids) > max_len
    t1 = time.perf_counter()

    multi_label = bool(meta.get("multiLabel"))
    cal = meta.get("calibration") or {}
    logits = _forward_logits([body.text], max_len)
    prediction, distributions, probs, to_probs = explain_from_logits(logits, meta)
    t2 = time.perf_counter()

    def log_odds_rows(task, rows, target):
        if task == "root" or (multi_label and task in MULTI_LABEL_TASKS):
            return rows[:, target]
        lp = torch.log_softmax(rows / float(cal.get(f"{task}Temperature", 1.0) or 1.0), dim=-1)
        others = torch.cat([lp[:, :target], lp[:, target + 1:]], dim=1)
        return lp[:, target] - torch.logsumexp(others, dim=1)

    words = body.text.split()
    importance = None
    if 2 <= len(words) <= OCCLUSION_MAX_WORDS:
        variants = [" ".join(words[:i] + words[i + 1:]) for i in range(len(words))]
        occ = _forward_logits(variants, max_len)
        importance = {}
        for task in ("category", "sentiment"):
            if not trained.get(task) or task not in probs:
                continue
            target = int(probs[task].argmax())
            base = float(probs[task][target])
            occ_p = to_probs(task, occ[task])[:, target].tolist()
            base_lo = float(log_odds_rows(task, logits[task][:1], target)[0])
            occ_lo = log_odds_rows(task, occ[task], target).tolist()
            importance[task] = {
                "target": labels[task][target],
                "base": round(base, 4),
                "measure": "log-odds",
                "values": [round(base_lo - lo, 3) for lo in occ_lo],
                "probAfter": [round(p, 4) for p in occ_p],
            }
    t3 = time.perf_counter()

    return {
        "modelInput": body.text,
        "tokens": pieces,
        "tokenCount": len(ids),
        "maxLength": max_len,
        "truncated": truncated,
        "prediction": prediction,
        "distributions": distributions,
        "multiLabel": multi_label,
        "thresholds": meta.get("thresholds"),
        "calibrated": bool(cal),
        "calibration": {
            k: v for k, v in cal.items()
            if k.endswith("Temperature") or k in ("causeThreshold", "rootThreshold")
        } or None,
        "words": words,
        "importance": importance,
        "noneLabel": NONE,
        "timings": {
            "tokenizeMs": round((t1 - t0) * 1000, 1),
            "inferenceMs": round((t2 - t1) * 1000, 1),
            "explainMs": round((t3 - t2) * 1000, 1),
        },
        "device": "cpu (onnx)" if state["runtime"] == "onnx" else DEVICE,
    }


if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("VISOBERT_HOST", "127.0.0.1"),
                port=int(os.environ.get("VISOBERT_PORT", 8001)))
