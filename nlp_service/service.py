"""
DỊCH VỤ SUY LUẬN VISOBERT
==================================================================
Chạy:  python service.py            (mặc định http://127.0.0.1:8001)

Endpoint
  GET  /health   trạng thái: đã nạp bộ mã hóa chưa, có checkpoint tinh chỉnh chưa
  POST /embed    {"texts": [...]} -> vector nhúng (mean pooling, chuẩn hóa L2)
  POST /predict  {"texts": [...]} -> nhãn cảm xúc / danh mục / nguyên nhân / rác

HAI MỨC SẴN SÀNG, tách bạch có chủ đích:
  - /embed chạy được ngay với trọng số gốc uitnlp/visobert.
  - /predict CHỈ chạy khi có checkpoint đã tinh chỉnh. Trọng số gốc là
    mô hình điền từ bị che, chưa hề học nhãn nào — gắn một lớp phân loại
    khởi tạo ngẫu nhiên lên đó rồi trả kết quả là bịa nhãn.

Văn bản gửi tới đây ĐÃ được backend Node che PII (normalizer.js). Dịch vụ
không ghi log nội dung văn bản.

Biến môi trường
  VISOBERT_BASE        thư mục trọng số gốc      (mặc định ../visobert)
  VISOBERT_CHECKPOINT  thư mục checkpoint        (mặc định checkpoints/visobert-absa)
  VISOBERT_HOST / VISOBERT_PORT                  (mặc định 127.0.0.1 / 8001)
  VISOBERT_MAX_LEN     độ dài token tối đa       (mặc định 256, trần 512)
  VISOBERT_THREADS     số luồng CPU cho torch
"""

import sys

# Log in tiếng Việt có dấu. Trên Windows, khi stdout bị chuyển hướng (chạy nền,
# ghi ra tệp log) Python dùng cp1252 và print đầu tiên ném UnicodeEncodeError —
# với service.py là sập ngay lúc khởi động. Ép UTF-8 thay vì trông vào
# PYTHONIOENCODING do script khởi chạy đặt.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import hmac
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import torch
import torch.nn.functional as F
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from visobert_model import (
    DEFAULT_BASE,
    DEFAULT_CHECKPOINT,
    NONE,
    TASKS,
    cause_indexes_by_category,
    decode,
    load_checkpoint,
    load_encoder,
    load_tokenizer,
    mean_pool,
)

MAX_TEXTS = 256
BATCH = 32
BASE = Path(os.environ.get("VISOBERT_BASE", DEFAULT_BASE))
CHECKPOINT = Path(os.environ.get("VISOBERT_CHECKPOINT", DEFAULT_CHECKPOINT))
MAX_LEN = min(int(os.environ.get("VISOBERT_MAX_LEN", 256)), 512)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

if os.environ.get("VISOBERT_THREADS"):
    torch.set_num_threads(int(os.environ["VISOBERT_THREADS"]))

state = {"encoder": None, "tokenizer": None, "model": None, "model_tokenizer": None,
         "meta": None, "checkpoint_error": None}


@asynccontextmanager
async def lifespan(_app):
    has_base = (BASE / "pytorch_model.bin").exists() or (BASE / "model.safetensors").exists()
    has_checkpoint = (CHECKPOINT / "meta.json").exists()
    if not has_base and not has_checkpoint:
        raise RuntimeError(f"Không thấy trọng số ViSoBERT trong {BASE} lẫn checkpoint trong {CHECKPOINT}. "
                           "Clone https://huggingface.co/uitnlp/visobert (cần git lfs) hoặc chạy train.py.")
    if has_base:
        state["tokenizer"] = load_tokenizer(BASE)
        state["encoder"] = load_encoder(BASE).to(DEVICE).eval()
        print(f"[visobert] Đã nạp bộ mã hóa gốc từ {BASE} ({DEVICE})")
    else:
        # Bản triển khai chỉ mang checkpoint tinh chỉnh (373 MB) thay vì thêm
        # 746 MB trọng số gốc: /predict và /explain chạy đủ, chỉ /embed (vector
        # nhúng cho Trust Layer, mặc định tắt) là đóng
        print(f"[visobert] Không có trọng số gốc tại {BASE} — /embed tạm đóng, /predict vẫn chạy")

    if has_checkpoint:
        try:
            model, tok, meta = load_checkpoint(CHECKPOINT, DEVICE)
            state.update(model=model, model_tokenizer=tok, meta=meta)
            print(f"[visobert] Đã nạp checkpoint tinh chỉnh {CHECKPOINT} (train lúc {meta.get('trainedAt')})")
        except Exception as e:  # checkpoint hỏng không được kéo sập /embed
            state["checkpoint_error"] = str(e)
            print(f"[visobert] Không nạp được checkpoint {CHECKPOINT}: {e}")
    else:
        print(f"[visobert] Chưa có checkpoint tại {CHECKPOINT} — /predict tạm đóng, /embed vẫn chạy")
    yield


app = FastAPI(title="Customer Radar — ViSoBERT", lifespan=lifespan)

# Khi dịch vụ chạy trên máy chủ công khai (Hugging Face Spaces), chỉ backend
# Customer Radar được gọi suy luận: đặt VISOBERT_API_KEY và backend gửi kèm
# "Authorization: Bearer <khóa>". Chạy cục bộ không đặt khóa thì không kiểm tra.
API_KEY = os.environ.get("VISOBERT_API_KEY", "").strip()


@app.middleware("http")
async def require_api_key(request, call_next):
    if API_KEY and request.url.path in ("/embed", "/predict", "/explain"):
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {API_KEY}"):
            return JSONResponse({"detail": "Thiếu hoặc sai khóa truy cập dịch vụ"}, status_code=401)
    return await call_next(request)


class TextsIn(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=MAX_TEXTS)


def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


@app.get("/health")
def health():
    meta = state["meta"]
    return {
        "status": "ok",
        "device": DEVICE,
        "maxLength": MAX_LEN,
        "encoderLoaded": state["encoder"] is not None,
        "finetuned": state["model"] is not None,
        "checkpointError": state["checkpoint_error"],
        "checkpoint": None if meta is None else {
            k: meta.get(k) for k in ("model", "inputMode", "trainedTasks", "trainCounts", "bestEpoch",
                                     "devReport", "leakageGuard", "excludedTestSha256",
                                     "testOverlapRemoved", "trainedAt", "dataManifests", "hyperparameters",
                                     "calibration", "multiLabel")
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


@app.post("/predict")
@torch.inference_mode()
def predict(body: TextsIn):
    model, meta = state["model"], state["meta"]
    if model is None:
        raise HTTPException(503, "Chưa có checkpoint ViSoBERT tinh chỉnh. Chạy train.py trước; "
                                 "trọng số gốc chưa học nhãn nên không được dùng để dự đoán.")
    tok = state["model_tokenizer"]
    max_len = min(MAX_LEN, int(meta.get("maxLength") or MAX_LEN))
    out = []
    for part in chunks(body.texts, BATCH):
        batch = tok(part, padding=True, truncation=True, max_length=max_len, return_tensors="pt").to(DEVICE)
        logits = model(batch["input_ids"], batch["attention_mask"])
        out.extend(decode({k: v.cpu() for k, v in logits.items()}, meta["labels"], meta["trainedTasks"],
                          multi_label=bool(meta.get("multiLabel")), calibration=meta.get("calibration")))
    return {"predictions": out, "trainedTasks": meta["trainedTasks"], "multiLabel": bool(meta.get("multiLabel"))}


class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


OCCLUSION_MAX_WORDS = 60


def _logits(model, tok, texts, max_len):
    parts = {t: [] for t in TASKS}
    for part in chunks(texts, BATCH):
        batch = tok(part, padding=True, truncation=True, max_length=max_len, return_tensors="pt").to(DEVICE)
        out = model(batch["input_ids"], batch["attention_mask"])
        for t in TASKS:
            parts[t].append(out[t].cpu())
    return {t: torch.cat(v) for t, v in parts.items()}


@app.post("/explain")
@torch.inference_mode()
def explain(body: TextIn):
    """
    Phơi toàn bộ quá trình suy luận cho MỘT câu, phục vụ màn hình trình diễn:
    token thật mà mô hình nhìn thấy, phân bố xác suất đầy đủ (không chỉ nhãn
    thắng), và mức ảnh hưởng của từng từ.

    Mức ảnh hưởng đo bằng phép BỎ TỪNG TỪ (occlusion): xóa từ thứ i, chạy lại
    mô hình, xem xác suất của nhãn đã chọn giảm bao nhiêu. Cách này chậm hơn
    đọc trọng số attention nhưng trả lời đúng câu hỏi người xem quan tâm —
    "thiếu từ này thì mô hình còn kết luận vậy không" — trong khi attention
    không phải là lời giải thích nhân quả.
    """
    model, meta = state["model"], state["meta"]
    if model is None:
        raise HTTPException(503, "Chưa có checkpoint ViSoBERT tinh chỉnh.")
    tok = state["model_tokenizer"]
    labels, trained = meta["labels"], meta["trainedTasks"]
    max_len = min(MAX_LEN, int(meta.get("maxLength") or MAX_LEN))

    t0 = time.perf_counter()
    all_ids = tok(body.text)["input_ids"]
    ids = all_ids[:max_len]
    pieces = tok.convert_ids_to_tokens(ids)
    t1 = time.perf_counter()

    multi_label = bool(meta.get("multiLabel"))
    cal = meta.get("calibration") or {}
    logits = _logits(model, tok, [body.text], max_len)
    # Ở chế độ đa nhãn, danh mục và nguyên nhân là xác suất ĐỘC LẬP (sigmoid),
    # nên các cột không cộng lại thành 100% — đúng như vậy mới nêu được nhiều vấn đề
    def to_probs(task, rows):
        if multi_label and task in ("category", "cause"):
            return torch.sigmoid(rows)
        # Cảm xúc và rác hiển thị theo xác suất ĐÃ HIỆU CHỈNH, đúng bằng
        # con số mà tầng quyết định dùng
        return torch.softmax(rows / float(cal.get(f"{task}Temperature", 1.0) or 1.0), dim=-1)

    probs = {t: to_probs(t, logits[t][0]) for t in TASKS}
    prediction = decode({t: logits[t] for t in TASKS}, labels, trained,
                        multi_label=multi_label, calibration=meta.get("calibration"))[0]
    t2 = time.perf_counter()

    def dist(task):
        rows = [{"label": l, "p": round(float(p), 4)} for l, p in zip(labels[task], probs[task])]
        return sorted(rows, key=lambda r: -r["p"])

    distributions = {}
    if trained.get("sentiment"):
        distributions["sentiment"] = dist("sentiment")
    if trained.get("category"):
        distributions["category"] = dist("category")
        cat = prediction.get("category")
        groups = cause_indexes_by_category(labels)
        if trained.get("cause") and cat in groups:
            idxs = groups[cat]
            sub = probs["cause"][idxs]
            if not multi_label:
                sub = sub / sub.sum().clamp(min=1e-9)
            distributions["cause"] = sorted(
                [{"label": labels["cause"][i].split(".", 1)[1], "p": round(float(p), 4)} for i, p in zip(idxs, sub)],
                key=lambda r: -r["p"],
            )[:5]
    if trained.get("spam"):
        distributions["spam"] = round(float(probs["spam"][labels["spam"].index("spam")]), 4)

    # Đo bằng độ giảm LOG-ODDS thay vì độ giảm xác suất. Khi mô hình chắc chắn
    # ~100%, bỏ một từ quan trọng chỉ kéo xác suất từ 99.99% xuống 99.9% — gần
    # như bằng 0 trên thang xác suất, nhưng là một bước lớn trên thang log-odds.
    # Đo trên thang xác suất cho kết quả "từ nào cũng không quan trọng", sai.
    #
    # Log-odds tính THẲNG từ logit, không đi qua xác suất: mô hình hay chắc
    # chắn tới mức xác suất làm tròn thành 1.0, và phép kẹp p về [1e-6, 1-1e-6]
    # khi đó biến mọi hiệu số thành 0 — đo trên câu thật, 11/12 từ ra 0.
    def log_odds_rows(task, rows, target):
        if multi_label and task in ("category", "cause"):
            return rows[:, target]  # log-odds của sigmoid chính là logit
        lp = torch.log_softmax(rows / float(cal.get(f"{task}Temperature", 1.0) or 1.0), dim=-1)
        others = torch.cat([lp[:, :target], lp[:, target + 1:]], dim=1)
        return lp[:, target] - torch.logsumexp(others, dim=1)

    words = body.text.split()
    importance = None
    if 2 <= len(words) <= OCCLUSION_MAX_WORDS:
        variants = [" ".join(words[:i] + words[i + 1:]) for i in range(len(words))]
        occ = _logits(model, tok, variants, max_len)
        importance = {}
        for task in ("category", "sentiment"):
            if not trained.get(task):
                continue
            target = int(probs[task].argmax())
            base = float(probs[task][target])
            # Cùng hàm xác suất với `base`. Bản cũ luôn dùng softmax thô ở đây,
            # trong khi `base` của danh mục đa nhãn là sigmoid và của cảm xúc là
            # softmax đã chia nhiệt độ — hiệu số giữa hai thang khác nhau làm từ
            # nào cũng có vẻ "quan trọng" kể cả khi bỏ nó đi không đổi gì.
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
        "truncated": len(all_ids) > max_len,
        "prediction": prediction,
        "distributions": distributions,
        "multiLabel": multi_label,
        "thresholds": meta.get("thresholds"),
        "calibrated": bool(cal),
        "calibration": {k: v for k, v in cal.items() if k.endswith("Temperature") or k == "causeThreshold"} or None,
        "words": words,
        "importance": importance,
        "noneLabel": NONE,
        "timings": {
            "tokenizeMs": round((t1 - t0) * 1000, 1),
            "inferenceMs": round((t2 - t1) * 1000, 1),
            "explainMs": round((t3 - t2) * 1000, 1),
        },
        "device": DEVICE,
    }


if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("VISOBERT_HOST", "127.0.0.1"),
                port=int(os.environ.get("VISOBERT_PORT", 8001)))
