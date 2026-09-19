"""
TINH CHỈNH VISOBERT CHO CUSTOMER RADAR
==================================================================
Chạy (sau khi đã chuẩn bị dữ liệu bằng `npm run nlp:prepare` trong backend/):

  python train.py --train data/train.jsonl
  python train.py --train data/visfd_train.jsonl data/domain_train.jsonl --epochs 4

Mỗi dòng JSONL: {"text", "input", "inputMode", và các nhãn có sẵn}
  sentiment: "Positive" | "Negative" | "Neutral"
  category : mã Level 1, hoặc null = không phải khiếu nại
  cause    : mã Level 2 thuộc đúng category, hoặc null
  spam     : true | false
Khóa vắng mặt = không có nhãn cho đầu ra đó (khác với null).

CHỐNG RÒ RỈ TẬP KIỂM TRA — bắt buộc, không tắt được:
  mọi câu huấn luyện trùng với tập kiểm tra giữ riêng (data/gold_test.jsonl)
  bị loại trước khi train, và số câu bị loại được ghi vào meta.json.
  Bài học từ lần mở rộng từ khóa làm F1 nhảy 0.19 -> 0.97 vì học thuộc
  đáp án (docs/TIEN-DO-VA-BOI-CANH.md, mục 4.1) áp dụng y nguyên ở đây.

Tập dev (mặc định data/gold_dev.jsonl) chỉ dùng để chọn epoch tốt nhất.
Con số báo cáo chính thức do `npm run eval` đo trên tập kiểm tra giữ riêng.
"""

import argparse
import hashlib
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch import nn
from torch.utils.data import DataLoader
from transformers import get_linear_schedule_with_warmup

from visobert_model import (
    CATEGORY_THRESHOLD,
    CAUSE_THRESHOLD,
    DEFAULT_BASE,
    DEFAULT_CHECKPOINT,
    DEFAULT_LABELS,
    HERE,
    IGNORE,
    NONE,
    TASKS,
    ViSoBertMultiTask,
    decode,
    load_encoder,
    load_labels,
    load_tokenizer,
    save_checkpoint,
)

DATA = HERE / "data"


def read_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                sys.exit(f"{path}:{n} không phải JSON hợp lệ: {e}")
    return rows


def text_key(text):
    return re.sub(r"\s+", " ", str(text or "").lower()).strip()


def encode_row(row, labels, where):
    """
    Nhãn dạng chữ -> số.

    Cảm xúc và rác là MỘT nhãn: lưu chỉ số, thiếu thì IGNORE.
    Danh mục và nguyên nhân là ĐA NHÃN: lưu vector 0/1, thiếu thì None. Một
    phản hồi thật thường nêu nhiều vấn đề ("giao chậm, nhắn shop không ai
    trả lời"), nên ép về một nhãn là bóp méo bài toán ngay từ dữ liệu.

    Nhận cả `category`/`cause` (một nhãn) lẫn `categories`/`causes` (nhiều nhãn).
    """
    y = {"sentiment": IGNORE, "spam": IGNORE, "category": None, "cause": None}

    if "sentiment" in row and row["sentiment"] is not None:
        if row["sentiment"] not in labels["sentiment"]:
            raise ValueError(f"{where}: sentiment lạ '{row['sentiment']}'")
        y["sentiment"] = labels["sentiment"].index(row["sentiment"])

    if "spam" in row and row["spam"] is not None:
        y["spam"] = labels["spam"].index("spam" if row["spam"] in (True, 1, "spam") else "not_spam")

    cats = None
    if "categories" in row:
        cats = list(row["categories"] or [])
    elif "category" in row:
        cats = [] if row["category"] is None else [row["category"]]

    causes = None
    if "causes" in row:
        causes = list(row["causes"] or [])
    elif "cause" in row:
        causes = [] if row["cause"] is None else [row["cause"]]

    if cats is None:
        if causes:
            raise ValueError(f"{where}: có cause mà thiếu category")
        return y

    vec = [0.0] * len(labels["category"])
    if not cats:
        vec[labels["category"].index(NONE)] = 1.0
    for c in cats:
        if c == NONE or c not in labels["category"]:
            raise ValueError(f"{where}: category '{c}' không có trong taxonomy")
        vec[labels["category"].index(c)] = 1.0
    y["category"] = vec

    if causes is not None:
        cvec = [0.0] * len(labels["cause"])
        if not cats or not causes:
            cvec[labels["cause"].index(NONE)] = 1.0
        for i, cz in enumerate(causes):
            if cz is None:
                continue
            cat = cats[i] if i < len(cats) else cats[0]
            key = f"{cat}.{cz}"
            if key not in labels["cause"]:
                raise ValueError(f"{where}: cause '{cz}' không thuộc danh mục {cat}")
            cvec[labels["cause"].index(key)] = 1.0
        y["cause"] = cvec

    return y


def load_split(paths, labels, input_mode=None):
    rows = []
    for p in paths:
        for i, row in enumerate(read_jsonl(p), 1):
            if "input" not in row:
                sys.exit(
                    f"{p}:{i} thiếu trường 'input'. Dữ liệu phải đi qua "
                    "`npm run nlp:prepare` để tiền xử lý GIỐNG HỆT lúc chạy thật."
                )
            mode = row.get("inputMode")
            if input_mode is None:
                input_mode = mode
            elif mode != input_mode:
                sys.exit(f"{p}:{i} inputMode '{mode}' khác '{input_mode}' — không trộn hai kiểu tiền xử lý")
            rows.append({"text": row.get("text", row["input"]), "input": row["input"],
                         "y": encode_row(row, labels, f"{p}:{i}")})
    return rows, input_mode


def length_bucketed(rows, batch_size, rng, chunk_batches=50):
    """
    Gom câu dài gần nhau vào cùng lô. Mỗi lô đệm tới câu dài nhất của nó,
    nên trộn câu UIT-ViSFD dài với câu chuyên ngành ngắn làm phần lớn phép
    tính rơi vào token đệm. Vẫn giữ tính ngẫu nhiên: xáo trộn trước, chỉ
    sắp theo độ dài trong từng khối, rồi xáo thứ tự các lô.
    """
    idx = list(range(len(rows)))
    rng.shuffle(idx)
    size = batch_size * chunk_batches
    out = []
    for s in range(0, len(idx), size):
        part = sorted(idx[s:s + size], key=lambda i: len(rows[i]["input"]))
        out.extend(part[j:j + batch_size] for j in range(0, len(part), batch_size))
    rng.shuffle(out)
    return out


def batches(rows, tokenizer, batch_size, max_len, shuffle, rng=None, labels=None):
    def collate(batch):
        enc = tokenizer([r["input"] for r in batch], padding=True, truncation=True,
                        max_length=max_len, return_tensors="pt")
        out = {
            "sentiment": torch.tensor([r["y"]["sentiment"] for r in batch]),
            "spam": torch.tensor([r["y"]["spam"] for r in batch])
        }
        for task in ("category", "cause"):
            size = len(labels[task])
            out[task] = torch.tensor([r["y"][task] or [0.0] * size for r in batch], dtype=torch.float)
            # mask = câu này CÓ nhãn cho đầu ra đó (UIT-ViSFD chỉ có nhãn cảm xúc)
            out[task + "_mask"] = torch.tensor([r["y"][task] is not None for r in batch], dtype=torch.float)
        enc["labels"] = out
        return enc
    if shuffle:
        return DataLoader(rows, batch_sampler=length_bucketed(rows, batch_size, rng or random.Random()),
                          collate_fn=collate)
    return DataLoader(rows, batch_size=batch_size, shuffle=False, collate_fn=collate)


def vector_labels(vec, names):
    return [names[i] for i, v in enumerate(vec) if v >= 0.5]


def evaluate(model, rows, tokenizer, labels, trained, device, max_len):
    if not rows:
        return {}
    model.eval()
    preds = []
    for enc in batches(rows, tokenizer, 32, max_len, shuffle=False, labels=labels):
        logits = model(enc["input_ids"].to(device), enc["attention_mask"].to(device))
        preds.extend(decode({k: v.cpu() for k, v in logits.items()}, labels, trained, multi_label=True))

    report = {}
    for task in ("sentiment", "spam"):
        if not trained.get(task):
            continue
        gold, pred = [], []
        for r, p in zip(rows, preds):
            if r["y"][task] == IGNORE:
                continue
            gold.append(labels[task][r["y"][task]])
            pred.append(p["sentiment"] if task == "sentiment"
                        else ("spam" if p["spamProbability"] >= 0.5 else "not_spam"))
        if gold:
            report[task] = {"macroF1": round(float(f1_score(gold, pred, average="macro", zero_division=0)), 4),
                            "n": len(gold)}

    # Danh mục đo hai cách: top-1 (so được với các lần train trước) và đa nhãn
    if trained.get("category"):
        g1, p1, gold_sets, pred_sets = [], [], [], []
        for r, p in zip(rows, preds):
            vec = r["y"]["category"]
            if vec is None:
                continue
            gl = vector_labels(vec, labels["category"])
            g1.append(gl[0] if gl else NONE)
            p1.append(p["category"] or NONE)
            gold_sets.append({x for x in gl if x != NONE})
            pred_sets.append({c["category"] for c in p.get("categories", [])})
        if g1:
            report["category"] = {"macroF1": round(float(f1_score(g1, p1, average="macro", zero_division=0)), 4),
                                  "n": len(g1)}
            tp = sum(len(a & b) for a, b in zip(gold_sets, pred_sets))
            fp = sum(len(b - a) for a, b in zip(gold_sets, pred_sets))
            fn = sum(len(a - b) for a, b in zip(gold_sets, pred_sets))
            report["categoryMulti"] = {"microF1": round(2 * tp / max(1, 2 * tp + fp + fn), 4),
                                       "goldLabels": tp + fn, "predLabels": tp + fp}

    if trained.get("cause"):
        gold, pred = [], []
        for r, p in zip(rows, preds):
            vec = r["y"]["cause"]
            if vec is None:
                continue
            gl = vector_labels(vec, labels["cause"])
            gold.append(gl[0] if gl else NONE)
            pred.append(f"{p['category']}.{p['cause']}" if p.get("cause") else NONE)
        if gold:
            report["cause"] = {"macroF1": round(float(f1_score(gold, pred, average="macro", zero_division=0)), 4),
                               "n": len(gold)}
    return report


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description="Tinh chỉnh ViSoBERT đa nhiệm cho Customer Radar")
    ap.add_argument("--train", nargs="+", required=True, type=Path)
    ap.add_argument("--dev", type=Path, default=DATA / "gold_dev.jsonl")
    ap.add_argument("--exclude", type=Path, default=DATA / "gold_test.jsonl",
                    help="Tập kiểm tra giữ riêng; câu trùng bị loại khỏi tập huấn luyện")
    ap.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    ap.add_argument("--base", type=Path, default=DEFAULT_BASE)
    ap.add_argument("--out", type=Path, default=DEFAULT_CHECKPOINT)
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--head-lr", type=float, default=1e-3)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--warmup", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--max-steps", type=int, default=0, help="Dừng sớm sau N bước (chỉ để chạy thử)")
    args = ap.parse_args()

    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if not args.exclude.exists():
        sys.exit(f"Không thấy {args.exclude}. Chạy `npm run nlp:prepare` trong backend/ trước — "
                 "không train khi chưa kiểm tra được rò rỉ tập kiểm tra.")
    if not args.labels.exists():
        sys.exit(f"Không thấy {args.labels}. Chạy `npm run nlp:prepare` trong backend/ trước.")

    labels = load_labels(args.labels)
    train_rows, input_mode = load_split(args.train, labels)

    exclude_rows = read_jsonl(args.exclude)
    test_keys = {text_key(r.get("text", r.get("input"))) for r in exclude_rows}
    before = len(train_rows)
    train_rows = [r for r in train_rows if text_key(r["text"]) not in test_keys]
    leaked = before - len(train_rows)
    if leaked:
        print(f"CẢNH BÁO: đã loại {leaked} câu huấn luyện trùng tập kiểm tra giữ riêng.")

    dev_rows = []
    if args.dev and args.dev.exists():
        dev_rows, dev_mode = load_split([args.dev], labels, input_mode)
        if dev_mode != input_mode:
            sys.exit("Tập dev được tiền xử lý khác kiểu với tập huấn luyện.")

    # Nguồn gốc nhãn của từng tệp (nếu có manifest đi kèm) được chép vào checkpoint,
    # để mọi con số đo sau này truy vết được về loại nhãn đã dùng
    manifests = {}
    for p in args.train:
        mf = p.with_name(p.stem + ".manifest.json")
        if mf.exists():
            m = json.loads(mf.read_text(encoding="utf-8"))
            manifests[p.name] = {k: m.get(k) for k in ("labelProvenance", "total", "leakageGuard", "paraphrase")}
        elif p.name.startswith("visfd"):
            manifests[p.name] = {"labelProvenance": "UIT-ViSFD: nhãn cảm xúc do người gán; chỉ giữ câu mọi khía cạnh cùng cực tính",
                                 "total": sum(1 for _ in open(p, encoding="utf-8"))}

    counts = {
        "sentiment": sum(1 for r in train_rows if r["y"]["sentiment"] != IGNORE),
        "spam": sum(1 for r in train_rows if r["y"]["spam"] != IGNORE),
        "category": sum(1 for r in train_rows if r["y"]["category"] is not None),
        "cause": sum(1 for r in train_rows if r["y"]["cause"] is not None)
    }
    multi_issue_rows = sum(1 for r in train_rows
                           if r["y"]["category"] is not None and sum(r["y"]["category"]) > 1)
    trained = {t: counts[t] > 0 for t in TASKS}
    if trained["cause"] and not trained["category"]:
        sys.exit("Có nhãn cause nhưng không có nhãn category.")
    print(f"Thiết bị: {device} | inputMode: {input_mode} | mẫu huấn luyện: {len(train_rows)}")
    print("Số nhãn theo đầu ra:", counts)
    print(f"Câu mang nhiều danh mục cùng lúc: {multi_issue_rows}")
    if not any(trained.values()):
        sys.exit("Không có nhãn nào để huấn luyện.")

    tokenizer = load_tokenizer(args.base)
    model = ViSoBertMultiTask(load_encoder(args.base), labels).to(device)

    optim = torch.optim.AdamW([
        {"params": model.encoder.parameters(), "lr": args.lr},
        {"params": model.heads.parameters(), "lr": args.head_lr},
    ], weight_decay=0.01)
    batch_rng = random.Random(args.seed)
    loader = batches(train_rows, tokenizer, args.batch_size, args.max_len, shuffle=True, rng=batch_rng, labels=labels)
    total_steps = args.max_steps or len(loader) * args.epochs
    sched = get_linear_schedule_with_warmup(optim, int(total_steps * args.warmup), total_steps)
    def class_weights(task):
        """
        Trọng số nghịch đảo tần suất. Dữ liệu lệch rất mạnh (Tiêu cực áp đảo
        Trung tính; không-rác áp đảo rác), và không cân lại thì lớp hiếm bị bỏ
        rơi hoàn toàn — lần train trước cho Trung tính F1 = 0 trên tập kiểm tra.
        """
        n = len(labels[task])
        freq = [0] * n
        for r in train_rows:
            if r["y"][task] != IGNORE:
                freq[r["y"][task]] += 1
        total = sum(freq)
        if total == 0:
            return None
        w = [(total / (n * f)) if f else 0.0 for f in freq]
        print(f"Trọng số lớp {task}: " + ", ".join(f"{labels[task][i]}={w[i]:.2f} (n={freq[i]})" for i in range(n)))
        return torch.tensor(w, dtype=torch.float, device=device)

    ce_by_task = {
        "sentiment": nn.CrossEntropyLoss(ignore_index=IGNORE, weight=class_weights("sentiment")),
        "spam": nn.CrossEntropyLoss(ignore_index=IGNORE, weight=class_weights("spam"))
    }
    bce = nn.BCEWithLogitsLoss(reduction="none")

    best_score, best_report, step = -1.0, None, 0
    started = time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        if epoch > 1:
            loader = batches(train_rows, tokenizer, args.batch_size, args.max_len, shuffle=True, rng=batch_rng, labels=labels)
        for enc in loader:
            logits = model(enc["input_ids"].to(device), enc["attention_mask"].to(device))
            loss = 0.0
            for t in ("sentiment", "spam"):
                y = enc["labels"][t].to(device)
                # Lô không có nhãn nào cho đầu ra này thì bỏ qua — CE trên 0 phần tử cho NaN
                if (y != IGNORE).any():
                    loss = loss + ce_by_task[t](logits[t], y)
            # Danh mục và nguyên nhân: BCE trên từng lớp độc lập, nhờ vậy một câu
            # mang được nhiều nhãn. Mask loại các câu không có nhãn cho đầu ra đó.
            for t in ("category", "cause"):
                mask = enc["labels"][t + "_mask"].to(device)
                if float(mask.sum()) > 0:
                    y = enc["labels"][t].to(device)
                    # CỘNG trên các lớp, không lấy trung bình: vector nhãn hầu hết là 0
                    # (1-3 lớp dương trên 8 hoặc 28), lấy trung bình sẽ nén tín hiệu học
                    # của hai đầu ra này xuống mức không đáng kể so với cảm xúc và rác
                    per_row = bce(logits[t], y).sum(dim=1)
                    loss = loss + (per_row * mask).sum() / mask.sum()
            if not torch.is_tensor(loss):
                continue
            optim.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step(); sched.step()
            running += loss.item(); step += 1
            if step % 50 == 0:
                elapsed = time.time() - started
                remaining = elapsed / step * (total_steps - step)
                print(f"  bước {step}/{total_steps} | loss TB {running / max(1, step - (epoch - 1) * len(loader)):.4f} | "
                      f"đã chạy {elapsed / 60:.1f} phút | còn khoảng {remaining / 60:.0f} phút", flush=True)
            if args.max_steps and step >= args.max_steps:
                break

        report = evaluate(model, dev_rows, tokenizer, labels, trained, device, args.max_len)
        # categoryMulti báo microF1; chỉ lấy các mục có macroF1 để chọn epoch
        scores = [v["macroF1"] for v in report.values() if "macroF1" in v]
        score = float(np.mean(scores)) if scores else -float(running)
        print(f"Epoch {epoch}: loss {running / max(1, len(loader)):.4f} | dev {report}")

        if score > best_score:
            best_score, best_report = score, report
            save_checkpoint(model, tokenizer, args.out, {
                "model": "ViSoBERT đa nhiệm (sentiment + category + cause + spam)",
                "base": "uitnlp/visobert",
                "labels": labels,
                "inputMode": input_mode,
                "maxLength": args.max_len,
                "multiLabel": True,
                "thresholds": {"category": CATEGORY_THRESHOLD, "cause": CAUSE_THRESHOLD},
                "trainedTasks": trained,
                "trainCounts": counts,
                "multiIssueTrainRows": multi_issue_rows,
                "classWeighted": ["sentiment", "spam"],
                "trainFiles": [str(p) for p in args.train],
                "dataManifests": manifests,
                "bestEpoch": epoch,
                "devReport": report,
                "devIsModelSelectionSet": True,
                "leakageGuard": True,
                "excludedTestFile": str(args.exclude),
                "excludedTestSha256": sha256_file(args.exclude),
                "testOverlapRemoved": leaked,
                "hyperparameters": {k: v for k, v in vars(args).items()
                                    if k in ("epochs", "batch_size", "lr", "head_lr", "max_len", "warmup", "seed", "max_steps")},
                "device": device,
                "trainedAt": datetime.now(timezone.utc).isoformat(),
                "note": "Số dev chỉ dùng chọn epoch; con số báo cáo lấy từ `npm run eval` trên tập kiểm tra giữ riêng.",
            })
            print(f"  -> lưu checkpoint vào {args.out}")
        if args.max_steps and step >= args.max_steps:
            break

    print(f"Xong sau {time.time() - started:.0f}s. Dev tốt nhất: {best_report}")


if __name__ == "__main__":
    main()
