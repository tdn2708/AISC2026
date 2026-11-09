"""
ĐO CHECKPOINT TRÊN BỘ TEST MÙ CỦA DỮ LIỆU THẬT
==================================================================
  python eval_real.py --checkpoint checkpoints/visobert-v4 --test data/real/test.jsonl

test.jsonl do backend/scripts/export_training_data.js xuất: chỉ nhãn NGƯỜI trên
bộ test mù cố định, không bao giờ dùng để huấn luyện hay chọn epoch. In F1 cảm
xúc, danh mục, nguyên nhân, và F1 riêng cho câu mỉa mai.
"""

import argparse
import json
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import torch

from train import evaluate, load_split
from visobert_model import load_checkpoint


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--test", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=None, help="Ghi kết quả ra JSON")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, tok, meta = load_checkpoint(args.checkpoint, device)
    labels = meta["labels"]
    rows, mode = load_split([args.test], labels)
    if meta.get("inputMode") and mode and mode != meta["inputMode"]:
        sys.exit(f"Tập test tiền xử lý kiểu {mode}, checkpoint học kiểu {meta['inputMode']}.")
    report = evaluate(model, rows, tok, labels, meta["trainedTasks"], device, int(meta.get("maxLength") or 128))
    sarcastic = [r for r in rows if r["y"].get("sarcasm") == (labels.get("sarcasm", ["", ""]).index("sarcastic") if "sarcasm" in labels else -1)]
    if sarcastic:
        # Trên RIÊNG các câu mỉa mai: mô hình có đọc ra ý chê thật không
        report["onSarcasticSentences"] = evaluate(model, sarcastic, tok, labels, meta["trainedTasks"], device, int(meta.get("maxLength") or 128))
    report["n"] = len(rows)
    report["checkpointTrainedAt"] = meta.get("trainedAt")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.out:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
