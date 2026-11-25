"""
HIỆU CHỈNH XÁC SUẤT VÀ NGƯỠNG SAU HUẤN LUYỆN (v5: thêm ngưỡng từng lớp L3 `root`)
==================================================================
Chạy sau train.py, trên CHÍNH tập dev đã dùng để chọn epoch:

  python calibrate.py --checkpoint checkpoints/visobert-absa-v5 --dev data/real/dev.jsonl

Kết quả ghi vào `meta.json` của checkpoint, mục `calibration`.
Ngưỡng L3 được chặn biên [0.20, 0.75] để tránh overfit ngưỡng trên lớp hiếm của dev.
"""

import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import argparse
import json
from pathlib import Path

import torch

from train import load_split, vector_labels
from visobert_model import (
    CATEGORY_THRESHOLD,
    CAUSE_THRESHOLD,
    DEFAULT_CHECKPOINT,
    IGNORE,
    NONE,
    ROOT_THRESHOLD,
    load_checkpoint,
)

GRID = [round(0.05 * i, 2) for i in range(1, 20)]  # 0.05 .. 0.95
ROOT_GRID = [round(0.05 * i, 2) for i in range(4, 16)]  # 0.20 .. 0.75


def collect_logits(model, tokenizer, rows, max_len, device, batch_size=32):
    outs = {t: [] for t in model.tasks}
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


def fit_per_class_thresholds(probs, rows, labels, task, default_th, grid=GRID, min_positives=2):
    names = labels[task]
    none_idx = names.index(NONE) if NONE in names else -1
    keep = [i for i, r in enumerate(rows) if r["y"].get(task) is not None]
    if not keep:
        return {}, None

    gold = [set(vector_labels(rows[i]["y"][task], names)) for i in keep]
    out, report = {}, {}
    for j, name in enumerate(names):
        if j == none_idx:
            continue
        col = probs[keep, j]
        y = torch.tensor([1.0 if name in g else 0.0 for g in gold])
        pos = int(y.sum())
        if pos < min_positives:
            out[name] = default_th
            continue
        best_t, best_f1 = default_th, -1.0
        for t in grid:
            pred = (col >= t).float()
            tp = float((pred * y).sum())
            fp = float((pred * (1 - y)).sum())
            fn = float(((1 - pred) * y).sum())
            f1 = 2 * tp / max(1e-9, 2 * tp + fp + fn)
            if f1 > best_f1:
                best_t, best_f1 = t, f1
        out[name] = best_t
        report[name] = {"threshold": best_t, "devF1": round(best_f1, 4), "devPositives": pos}
    return out, report


def fit_micro_threshold(probs, rows, labels, task, default_th, grid=GRID):
    names = labels[task]
    none_idx = names.index(NONE) if NONE in names else -1
    keep = [i for i, r in enumerate(rows) if r["y"].get(task) is not None]
    if not keep:
        return default_th, None
    cols = [j for j in range(len(names)) if j != none_idx]
    y = torch.zeros(len(keep), len(cols))
    for k, i in enumerate(keep):
        vec = rows[i]["y"][task]
        y[k] = torch.tensor([vec[j] for j in cols])
    sub = probs[keep][:, cols]
    best_t, best_f1 = default_th, -1.0
    for t in grid:
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

    logits = collect_logits(model, tokenizer, rows, int(meta.get("maxLength") or 128), device)
    calibration = {"fittedOn": str(args.dev), "devSize": len(rows)}

    for task in ("sentiment", "spam", "sarcasm"):
        if not meta["trainedTasks"].get(task) or task not in logits:
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
    thresholds, report = fit_per_class_thresholds(cat_probs, rows, labels, "category", CATEGORY_THRESHOLD, GRID, min_positives=1)
    if thresholds:
        calibration["categoryThresholds"] = thresholds
        calibration["categoryThresholdReport"] = report
        print("Ngưỡng danh mục: " + ", ".join(f"{k}={v}" for k, v in thresholds.items()))

    cause_probs = torch.sigmoid(logits["cause"]) if meta.get("multiLabel") else torch.softmax(logits["cause"], dim=1)
    cause_t, cause_report = fit_micro_threshold(cause_probs, rows, labels, "cause", CAUSE_THRESHOLD, GRID)
    calibration["causeThreshold"] = cause_t
    calibration["causeThresholdReport"] = cause_report
    print(f"Ngưỡng nguyên nhân L2: {cause_t} ({cause_report})")

    if meta["trainedTasks"].get("root") and "root" in logits and "root" in labels:
        root_probs = torch.sigmoid(logits["root"])
        root_t, root_micro = fit_micro_threshold(root_probs, rows, labels, "root", ROOT_THRESHOLD, ROOT_GRID)
        root_ths, root_rep = fit_per_class_thresholds(root_probs, rows, labels, "root", root_t, ROOT_GRID, min_positives=3)
        calibration["rootThreshold"] = root_t
        calibration["rootThresholds"] = root_ths
        calibration["rootThresholdReport"] = {"micro": root_micro, "perRoot": root_rep}
        print(f"Ngưỡng L3 chung: {root_t} ({root_micro}) | lớp có riêng: {len(root_rep or {})}")

    if args.dry:
        print("(--dry: không ghi meta.json)")
        return

    meta["calibration"] = calibration
    with open(Path(args.checkpoint) / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Đã ghi mục calibration vào {args.checkpoint}/meta.json")


if __name__ == "__main__":
    main()
