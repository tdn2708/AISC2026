"""
ĐO CHECKPOINT VISOBERT V5 TRÊN BỘ GOLD TEST GIỮ RIÊNG (BOOTSTRAP KTC 95% THEO SẢN PHẨM)
==================================================================
  python eval_real.py --checkpoint checkpoints/visobert-v5 --test data/real/test.jsonl --out test_report.json

Báo cáo trung thực (mục 5 kế hoạch v5):
  - L1 macro-F1, L2 macro-F1, L3 macro-F1 + micro-F1 + F1 từng khóa L3
  - Ma trận nhầm L3 (các cặp hay nhầm nhất)
  - Tỉ lệ khiếu nại hành động được (có L3 >= ngưỡng / tổng khiếu nại)
  - KTC 95% bootstrap lấy mẫu lại theo SẢN PHẨM (cluster bootstrap, 1.000 lần)
  - F1 riêng trên các câu mỉa mai
"""

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import numpy as np
import torch
from sklearn.metrics import f1_score

from train import batches, load_split, vector_labels
from visobert_model import NONE, decode, load_checkpoint


def predict_rows(model, rows, tok, labels, trained, device, max_len, calibration):
    model.eval()
    preds = []
    for enc in batches(rows, tok, 32, max_len, shuffle=False, labels=labels):
        logits = model(enc["input_ids"].to(device), enc["attention_mask"].to(device))
        preds.extend(decode({k: v.cpu() for k, v in logits.items()}, labels, trained, multi_label=True, calibration=calibration))
    return preds


def compute_metrics(rows, preds, labels, trained):
    out = {}
    if trained.get("sentiment"):
        g, p = [], []
        for r, pr in zip(rows, preds):
            if r["y"]["sentiment"] == -100:
                continue
            g.append(labels["sentiment"][r["y"]["sentiment"]])
            p.append(pr.get("sentiment"))
        if g:
            out["sentiment"] = {"macroF1": round(float(f1_score(g, p, average="macro", zero_division=0)), 4), "n": len(g)}

    if trained.get("category"):
        g, p = [], []
        for r, pr in zip(rows, preds):
            vec = r["y"]["category"]
            if vec is None:
                continue
            gl = vector_labels(vec, labels["category"])
            g.append(gl[0] if gl else NONE)
            p.append(pr.get("category") or NONE)
        if g:
            out["category"] = {"macroF1": round(float(f1_score(g, p, average="macro", zero_division=0)), 4), "n": len(g)}

    if trained.get("cause"):
        g, p = [], []
        for r, pr in zip(rows, preds):
            vec = r["y"]["cause"]
            if vec is None:
                continue
            gl = vector_labels(vec, labels["cause"])
            g.append(gl[0] if gl else NONE)
            p.append(f"{pr['category']}.{pr['cause']}" if pr.get("cause") else NONE)
        if g:
            out["cause"] = {"macroF1": round(float(f1_score(g, p, average="macro", zero_division=0)), 4), "n": len(g)}

    if trained.get("sarcasm") and "sarcasm" in labels:
        g, p = [], []
        for r, pr in zip(rows, preds):
            if r["y"]["sarcasm"] == -100 or "sarcasmProbability" not in pr:
                continue
            g.append(labels["sarcasm"][r["y"]["sarcasm"]])
            p.append("sarcastic" if pr["sarcasmProbability"] >= 0.5 else "literal")
        if g:
            out["sarcasm"] = {
                "f1Sarcastic": round(float(f1_score(g, p, pos_label="sarcastic", average="binary", zero_division=0)), 4),
                "macroF1": round(float(f1_score(g, p, average="macro", zero_division=0)), 4),
                "n": len(g),
                "sarcasticGold": g.count("sarcastic"),
            }

    if trained.get("root") and "root" in labels:
        root_keys = [k for k in labels["root"] if k != NONE]
        g_rows, p_rows = [], []
        confusions = Counter()
        complaints, actionable = 0, 0
        for r, pr in zip(rows, preds):
            vec = r["y"].get("root")
            if vec is None:
                continue
            g_set = {x for x in vector_labels(vec, labels["root"]) if x != NONE}
            p_set = set(pr.get("rootCauseKeys") or [])
            g_rows.append([1 if k in g_set else 0 for k in root_keys])
            p_rows.append([1 if k in p_set else 0 for k in root_keys])
            for gk in g_set - p_set:
                if p_set:
                    for pk in p_set - g_set:
                        confusions[(gk, pk)] += 1
                else:
                    confusions[(gk, NONE)] += 1
            for pk in p_set - g_set:
                if not g_set:
                    confusions[(NONE, pk)] += 1
            cat_vec = r["y"]["category"]
            if cat_vec is not None and any(x != NONE for x in vector_labels(cat_vec, labels["category"])):
                complaints += 1
                if p_set:
                    actionable += 1
        if g_rows:
            g_arr = np.asarray(g_rows, dtype=int)
            p_arr = np.asarray(p_rows, dtype=int)
            present = [j for j in range(len(root_keys)) if g_arr[:, j].sum() > 0]
            per_root = {
                root_keys[j]: {
                    "f1": round(float(f1_score(g_arr[:, j], p_arr[:, j], zero_division=0)), 4),
                    "support": int(g_arr[:, j].sum()),
                }
                for j in present
            }
            macro_f1 = float(np.mean([v["f1"] for v in per_root.values()])) if per_root else 0.0
            micro_f1 = float(f1_score(g_arr.ravel(), p_arr.ravel(), zero_division=0))
            out["root"] = {
                "macroF1": round(macro_f1, 4),
                "microF1": round(micro_f1, 4),
                "n": len(g_rows),
                "classesEvaluated": len(present),
                "actionableRate": round(actionable / complaints, 4) if complaints else None,
                "complaints": complaints,
                "perRoot": per_root,
                "topConfusions": [{"gold": g, "pred": p, "count": c} for (g, p), c in confusions.most_common(15)],
            }
    return out


def cluster_bootstrap_ci(rows, preds, labels, trained, n_boot=1000, seed=42):
    """KTC 95% bootstrap lấy mẫu lại theo cụm SẢN PHẨM (các câu cùng sản phẩm không độc lập)."""
    by_prod = {}
    for i, r in enumerate(rows):
        key = (r.get("productName") or f"__row_{i}").strip().lower()
        by_prod.setdefault(key, []).append(i)
    clusters = list(by_prod.values())
    if len(clusters) < 2:
        return None
    rng = random.Random(seed)
    samples = {"causeMacroF1": [], "rootMacroF1": [], "actionableRate": []}
    for _ in range(n_boot):
        picked = [idx for _ in range(len(clusters)) for idx in rng.choice(clusters)]
        sub_r = [rows[i] for i in picked]
        sub_p = [preds[i] for i in picked]
        m = compute_metrics(sub_r, sub_p, labels, trained)
        if "cause" in m:
            samples["causeMacroF1"].append(m["cause"]["macroF1"])
        if "root" in m:
            samples["rootMacroF1"].append(m["root"]["macroF1"])
            if m["root"].get("actionableRate") is not None:
                samples["actionableRate"].append(m["root"]["actionableRate"])
    ci = {"clusters": len(clusters), "resamples": n_boot}
    for k, vals in samples.items():
        if vals:
            lo, hi = np.percentile(vals, [2.5, 97.5])
            ci[k] = [round(float(lo), 4), round(float(hi), 4)]
    return ci


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--test", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=None, help="Ghi kết quả ra JSON")
    ap.add_argument("--bootstrap", type=int, default=1000)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, tok, meta = load_checkpoint(args.checkpoint, device)
    labels = meta["labels"]
    rows, mode = load_split([args.test], labels)
    if meta.get("inputMode") and mode and mode != meta["inputMode"]:
        sys.exit(f"Tập test tiền xử lý kiểu {mode}, checkpoint học kiểu {meta['inputMode']}.")

    max_len = int(meta.get("maxLength") or 128)
    preds = predict_rows(model, rows, tok, labels, meta["trainedTasks"], device, max_len, meta.get("calibration"))
    report = compute_metrics(rows, preds, labels, meta["trainedTasks"])
    report["bootstrapCI95ByProduct"] = cluster_bootstrap_ci(rows, preds, labels, meta["trainedTasks"], n_boot=args.bootstrap)

    sarcastic_idx = [
        i for i, r in enumerate(rows)
        if r["y"].get("sarcasm") == (labels.get("sarcasm", ["", ""]).index("sarcastic") if "sarcasm" in labels else -1)
    ]
    if sarcastic_idx:
        report["onSarcasticSentences"] = compute_metrics(
            [rows[i] for i in sarcastic_idx],
            [preds[i] for i in sarcastic_idx],
            labels,
            meta["trainedTasks"],
        )

    report["n"] = len(rows)
    report["labelSourceNote"] = "Chỉ đo trên gold test (nhãn người, tách theo sản phẩm)."
    report["checkpointTrainedAt"] = meta.get("trainedAt")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.out:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
