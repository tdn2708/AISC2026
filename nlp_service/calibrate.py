"""
HIỆU CHỈNH XÁC SUẤT VÀ NGƯỠNG SAU HUẤN LUYỆN
==================================================================
Chạy sau train.py, trên CHÍNH tập dev đã dùng để chọn epoch:

  python calibrate.py --checkpoint checkpoints/visobert-absa-v4 --dev data/dev_combined.jsonl

Hai việc, hai lý do khác nhau:

1. NHIỆT ĐỘ (temperature) cho cảm xúc và rác.
   Mô hình huấn luyện trên dữ liệu gần như không nhiễu nhãn nên xác suất
   dồn hết về 1.0 — màn hình demo hiện "100%" cho cả câu nó đoán sai, và
   người xem có lý khi mất tin. Chia logits cho một hằng số T học trên dev
   kéo xác suất về mức phản ánh đúng tần suất đúng. T KHÔNG đổi nhãn thắng,
   nên F1 giữ nguyên; thứ cải thiện là độ tin cậy của con số.

2. NGƯỠNG RIÊNG cho từng danh mục và cho nguyên nhân.
   Đầu ra đa nhãn dùng chung ngưỡng 0.5 là mặc định tiện, không phải mặc
   định đúng: lớp hiếm cần ngưỡng thấp hơn mới được gọi tên. Ngưỡng được
   chọn trên dev để tối đa F1 của chính lớp đó.

Kết quả ghi vào `meta.json` của checkpoint, mục `calibration`. Dịch vụ tự
đọc và áp dụng; checkpoint chưa hiệu chỉnh vẫn chạy với ngưỡng mặc định.
"""

import argparse
import json
import math
from pathlib import Path

import torch

from train import load_split, vector_labels
from visobert_model import (
    CATEGORY_THRESHOLD,
    CAUSE_THRESHOLD,
    DEFAULT_CHECKPOINT,
    IGNORE,
    NONE,
    cause_indexes_by_category,
    load_checkpoint,
)

GRID = [round(0.05 * i, 2) for i in range(1, 20)]  # 0.05 .. 0.95


def collect_logits(model, tokenizer, rows, max_len, device, batch_size=32):
    outs = {"sentiment": [], "spam": [], "category": [], "cause": []}
    model.eval()
    with torch.inference_mode():
        for i in range(0, len(rows), batch_size):
            part = [r["input"] for r in rows[i:i + batch_size]]
            enc = tokenizer(part, padding=True, truncation=True, max_length=max_len, return_tensors="pt").to(device)
            logits = model(enc["input_ids"], enc["attention_mask"])
            for k in outs:
                outs[k].append(logits[k].cpu())
    return {k: torch.cat(v) for k, v in outs.items()}


def fit_temperature(logits, targets):
    """Chọn T tối thiểu hóa NLL trên dev. Chỉ xét các câu CÓ nhãn cho đầu ra này."""
    mask = targets != IGNORE
    if mask.sum() < 10:
        return None, None, None
    x, y = logits[mask], targets[mask]
    nll = torch.nn.functional.cross_entropy

    def ece(probs, labels, bins=10):
        conf, pred = probs.max(dim=1)
        correct = (pred == labels).float()
        total = 0.0
        for b in range(bins):
            lo, hi = b / bins, (b + 1) / bins
            sel = (conf > lo) & (conf <= hi)
            if sel.any():
                total += float(sel.float().mean()) * abs(float(correct[sel].mean()) - float(conf[sel].mean()))
        return total

    before = {"nll": float(nll(x, y)), "ece": ece(torch.softmax(x, dim=1), y),
              "avgConfidence": float(torch.softmax(x, dim=1).max(dim=1).values.mean())}

    best_t, best_nll = 1.0, before["nll"]
    t = 0.25
    while t <= 8.0:
        v = float(nll(x / t, y))
        if v < best_nll:
            best_t, best_nll = t, v
        t = round(t + 0.05, 2)

    scaled = torch.softmax(x / best_t, dim=1)
    after = {"nll": best_nll, "ece": ece(scaled, y), "avgConfidence": float(scaled.max(dim=1).values.mean())}
    return best_t, before, after


def fit_category_thresholds(probs, rows, labels):
    """Ngưỡng cho từng danh mục: tối đa F1 của chính lớp đó trên dev"""
    names = labels["category"]
    none_idx = names.index(NONE)
    keep = [i for i, r in enumerate(rows) if r["y"]["category"] is not None]
    if not keep:
        return {}, None

    gold = [set(vector_labels(rows[i]["y"]["category"], names)) for i in keep]
    out, report = {}, {}
    for j, name in enumerate(names):
        if j == none_idx:
            continue
        col = probs[keep, j]
        y = torch.tensor([1.0 if name in g else 0.0 for g in gold])
        if y.sum() == 0:
            out[name] = CATEGORY_THRESHOLD
            continue
        best_t, best_f1 = CATEGORY_THRESHOLD, -1.0
        for t in GRID:
            pred = (col >= t).float()
            tp = float((pred * y).sum())
            fp = float((pred * (1 - y)).sum())
            fn = float(((1 - pred) * y).sum())
            f1 = 2 * tp / max(1e-9, 2 * tp + fp + fn)
            if f1 > best_f1:
                best_t, best_f1 = t, f1
        out[name] = best_t
        report[name] = {"threshold": best_t, "devF1": round(best_f1, 4), "devPositives": int(y.sum())}
    return out, report


def fit_cause_threshold(probs, rows, labels):
    """Một ngưỡng chung cho nguyên nhân: tối đa micro-F1 trên dev"""
    names = labels["cause"]
    keep = [i for i, r in enumerate(rows) if r["y"]["cause"] is not None]
    if not keep:
        return CAUSE_THRESHOLD, None
    y = torch.zeros(len(keep), len(names))
    for k, i in enumerate(keep):
        y[k] = torch.tensor(rows[i]["y"]["cause"])
    sub = probs[keep]
    best_t, best_f1 = CAUSE_THRESHOLD, -1.0
    for t in GRID:
        pred = (sub >= t).float()
        tp = float((pred * y).sum())
        fp = float((pred * (1 - y)).sum())
        fn = float(((1 - pred) * y).sum())
        f1 = 2 * tp / max(1e-9, 2 * tp + fp + fn)
        if f1 > best_f1:
            best_t, best_f1 = t, f1
    return best_t, {"microF1": round(best_f1, 4), "n": len(keep)}


def main():
    ap = argparse.ArgumentParser(description="Hiệu chỉnh xác suất và ngưỡng trên tập dev")
    ap.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    ap.add_argument("--dev", type=Path, required=True)
    ap.add_argument("--dry", action="store_true", help="Chỉ in, không ghi vào meta.json")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, tokenizer, meta = load_checkpoint(args.checkpoint, device)
    labels = meta["labels"]
    rows, _ = load_split([args.dev], labels)
    print(f"Dev: {len(rows)} câu | checkpoint train lúc {meta.get('trainedAt')}")

    logits = collect_logits(model, tokenizer, rows, int(meta.get("maxLength") or 96), device)

    calibration = {"fittedOn": str(args.dev), "devSize": len(rows)}

    for task in ("sentiment", "spam"):
        if not meta["trainedTasks"].get(task):
            continue
        targets = torch.tensor([r["y"][task] for r in rows])
        t, before, after = fit_temperature(logits[task], targets)
        if t is None:
            continue
        calibration[f"{task}Temperature"] = t
        calibration[f"{task}Calibration"] = {"before": before, "after": after}
        print(f"{task}: T={t} | ECE {before['ece']:.4f} -> {after['ece']:.4f} | "
              f"độ tự tin TB {before['avgConfidence']:.3f} -> {after['avgConfidence']:.3f}")

    cat_probs = torch.sigmoid(logits["category"]) if meta.get("multiLabel") else torch.softmax(logits["category"], dim=1)
    thresholds, report = fit_category_thresholds(cat_probs, rows, labels)
    if thresholds:
        calibration["categoryThresholds"] = thresholds
        calibration["categoryThresholdReport"] = report
        print("Ngưỡng danh mục: " + ", ".join(f"{k}={v}" for k, v in thresholds.items()))

    cause_probs = torch.sigmoid(logits["cause"]) if meta.get("multiLabel") else torch.softmax(logits["cause"], dim=1)
    cause_t, cause_report = fit_cause_threshold(cause_probs, rows, labels)
    calibration["causeThreshold"] = cause_t
    calibration["causeThresholdReport"] = cause_report
    print(f"Ngưỡng nguyên nhân: {cause_t} ({cause_report})")

    if args.dry:
        print("(--dry: không ghi meta.json)")
        return

    meta["calibration"] = calibration
    with open(Path(args.checkpoint) / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Đã ghi mục calibration vào {args.checkpoint}/meta.json")


if __name__ == "__main__":
    main()
