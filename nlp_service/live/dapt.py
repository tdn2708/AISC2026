"""
Pretrain thêm (DAPT, Gururangan et al. 2020) bằng masked LM trên bình luận livestream chưa gán nhãn.

    python dapt.py --base uitnlp/visobert --corpus data/dapt_corpus.txt --out runs/visobert_dapt

Kho câu đã bỏ các phiên dev/test (xem prepare_data.py) nên không rò rỉ sang tập đo.
Đầu ra là một thư mục mô hình dùng được ngay cho train_live.py --base runs/visobert_dapt.
"""
import argparse
import math
from pathlib import Path

import torch
from datasets import Dataset
from transformers import (AutoModelForMaskedLM, AutoTokenizer, DataCollatorForLanguageModeling, Trainer,
                          TrainingArguments)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="uitnlp/visobert")
    ap.add_argument("--corpus", type=Path, default=Path(__file__).resolve().parent / "data" / "dapt_corpus.txt")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--max-len", type=int, default=64)
    ap.add_argument("--max-steps", type=int, default=-1, help="Chạy thử")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    lines = [l.strip() for l in a.corpus.read_text(encoding="utf-8").splitlines() if l.strip()]
    print(len(lines), "câu DAPT")
    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForMaskedLM.from_pretrained(a.base)
    ds = Dataset.from_dict({"text": lines}).map(
        lambda b: tok(b["text"], truncation=True, max_length=a.max_len), batched=True, remove_columns=["text"])
    # transformers 5 bỏ warmup_ratio -> tự tính warmup_steps (số nguyên, chạy được mọi phiên bản)
    n_dev = max(1, torch.cuda.device_count())
    total = a.max_steps if a.max_steps > 0 else math.ceil(
        math.ceil(len(ds) / (a.batch_size * n_dev)) * a.epochs)
    args = TrainingArguments(
        output_dir=str(a.out / "_tmp"), num_train_epochs=a.epochs, max_steps=a.max_steps,
        per_device_train_batch_size=a.batch_size, learning_rate=a.lr,
        warmup_steps=max(1, int(0.06 * total)), weight_decay=0.01,
        fp16=torch.cuda.is_available(), logging_steps=50, save_strategy="no", report_to=[], seed=a.seed)
    Trainer(model=model, args=args, train_dataset=ds,
            data_collator=DataCollatorForLanguageModeling(tok, mlm_probability=0.15)).train()
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print("Đã lưu", a.out)


if __name__ == "__main__":
    main()
