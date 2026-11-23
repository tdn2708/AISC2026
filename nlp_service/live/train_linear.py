"""
Mô hình tuyến tính cho bình luận livestream, chạy được ngay trong Node (backend/services/live/linear_model.js).

Vì sao không dùng thẳng ViSoBERT ở đây: máy chủ Render 512 MB không chạy được dịch vụ Python,
mỗi bình luận live phải phân loại trong vài phần nghìn giây ngay trong tiến trình Node.
Mô hình: n-gram ký tự (trên chữ có dấu) + từ đơn/đôi (trên chữ bỏ dấu) + vài cờ hình dạng,
TF-IDF tự tính (để Node tính lại y hệt), hồi quy logistic nhiều lớp cho intent (9 lớp) và
hồi quy logistic một-đấu-còn-lại cho aspects (11 nhãn đa nhãn).

Quy trình đánh giá: chọn tham số trên dev (theo macro-F1 5 lớp mà hệ thống dùng), báo số trên
test một lần. Dữ liệu chia theo phiên (prepare_data.py), không phiên nào trùng giữa các tập.

    python nlp_service/live/train_linear.py            # huấn luyện, in số, ghi trọng số
    python nlp_service/live/train_linear.py --check    # chỉ in đặc trưng của vài câu (đối chiếu với JS)

PHẢI GIỮ GIỐNG backend/services/live/linear_model.js: prep(), fold(), features().
"""
import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT.parent.parent / "backend" / "services" / "live" / "linear_model.json"

INTENTS = ["ORDER", "QUESTION", "REQUEST", "NEGOTIATE", "COMPLAINT", "PRAISE", "GIVEAWAY", "SOCIAL", "OTHER"]
ASPECTS = ["PRICE", "PROMOTION", "SIZE_FIT", "VARIANT", "SPEC_MATERIAL", "USAGE", "STOCK", "SHIPPING", "ORDER_PROCESS", "QUALITY_TRUST", "HOST_STREAM"]
# 9 intent của tập nhãn -> 5 intent của hệ thống (hàng đợi, trợ lý hành động dùng 5 lớp này)
TO5 = {"ORDER": "order", "QUESTION": "question", "REQUEST": "question", "NEGOTIATE": "question",
       "COMPLAINT": "complaint", "PRAISE": "praise", "GIVEAWAY": "chatter", "SOCIAL": "chatter", "OTHER": "chatter"}
FIVE = ["order", "question", "complaint", "praise", "chatter"]

KEEP = set("0123456789 ?!.,/+-:")


def prep(text):
    """Chữ thường NFC, bỏ [USER], link, số -> 0, ký hiệu khác (emoji...) -> *, rút ký tự lặp"""
    s = unicodedata.normalize("NFC", str(text or "")).lower()
    s = s.replace("[user]", " ")
    s = re.sub(r"(https?://|www\.)\S+", " url ", s)
    out = []
    for ch in s:
        if ord(ch) > 0xFFFF:
            out.append("*")
        elif ch.isalpha() or ch in KEEP:
            out.append("0" if ch.isdigit() and ch in "0123456789" else ch)
        elif ch.isspace():
            out.append(" ")
        else:
            out.append("*")
    s = "".join(out)
    s = re.sub(r"(.)\1{2,}", r"\1\1", s)
    s = re.sub(r" +", " ", s).strip()
    return s


def fold(s):
    s = s.replace("đ", "d")
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not (0x300 <= ord(ch) <= 0x36F))


def features(text):
    """Danh sách tên đặc trưng (có lặp) của một bình luận"""
    s = prep(text)
    feats = []
    # n-gram ký tự 2..4 trong từng từ có đệm khoảng trắng (giống char_wb)
    for w in s.split(" "):
        if not w:
            continue
        w = " " + w + " "
        for n in (2, 3, 4):
            if len(w) < n:
                break
            for i in range(len(w) - n + 1):
                feats.append("c:" + w[i:i + n])
    # từ đơn, từ đôi trên chữ bỏ dấu (người xem hay gõ không dấu)
    toks = re.findall(r"[a-z0-9]+|[?!*]", fold(s))
    for t in toks:
        feats.append("w:" + t)
    for a, b in zip(toks, toks[1:]):
        feats.append("b:" + a + "_" + b)
    # cờ hình dạng: chỉ có số (mã sản phẩm), độ dài, có dấu hỏi
    if s and re.fullmatch(r"[0 ,./x+\-:*]+", s) and "0" in s:
        feats.append("f:numonly")
    nw = len([w for w in s.split(" ") if w])
    feats.append("f:len" + ("1" if nw <= 1 else "2" if nw <= 3 else "4" if nw <= 7 else "8"))
    if "?" in s:
        feats.append("f:qmark")
    return feats


def load(split):
    return [json.loads(l) for l in (DATA / f"{split}.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]


def build_vocab(rows, min_df=2):
    df = Counter()
    for r in rows:
        df.update(set(features(r["text"])))
    n = len(rows)
    vocab = sorted(f for f, c in df.items() if c >= min_df)
    idx = {f: i for i, f in enumerate(vocab)}
    idf = np.array([math.log((1 + n) / (1 + df[f])) + 1 for f in vocab], dtype=np.float64)
    return idx, idf


def vectorize(rows, idx, idf):
    data, ind, ptr = [], [], [0]
    for r in rows:
        cnt = Counter(f for f in features(r["text"]) if f in idx)
        vals = {idx[f]: (1 + math.log(c)) * idf[idx[f]] for f, c in cnt.items()}
        norm = math.sqrt(sum(v * v for v in vals.values())) or 1.0
        for j in sorted(vals):
            ind.append(j)
            data.append(vals[j] / norm)
        ptr.append(len(ind))
    return sparse.csr_matrix((data, ind, ptr), shape=(len(rows), len(idf)))


def f1s(gold, pred, classes):
    out = {}
    for c in classes:
        tp = sum(1 for g, p in zip(gold, pred) if g == c and p == c)
        fp = sum(1 for g, p in zip(gold, pred) if g != c and p == c)
        fn = sum(1 for g, p in zip(gold, pred) if g == c and p != c)
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        out[c] = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
    return sum(out.values()) / len(classes), out


def to5(probs9):
    """Gộp xác suất 9 lớp thành 5 lớp của hệ thống"""
    p5 = np.zeros((probs9.shape[0], len(FIVE)))
    for i, k in enumerate(INTENTS):
        p5[:, FIVE.index(TO5[k])] += probs9[:, i]
    return p5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        for t in ["Còn size M không shop??", "198", "chốt 2 cái 😍😍😍", "[USER] gia bn v", "10x2"]:
            print(json.dumps({"text": t, "prep": prep(t), "features": features(t)}, ensure_ascii=False))
        return

    train, dev, test = load("train"), load("dev"), load("test")
    idx, idf = build_vocab(train)
    Xtr, Xdv, Xte = (vectorize(r, idx, idf) for r in (train, dev, test))
    ytr = np.array([INTENTS.index(r["intent"]) for r in train])
    wtr = np.array([float(r.get("weight", 1.0)) for r in train])
    print(f"đặc trưng: {len(idf)}, train {len(train)}, dev {len(dev)}, test {len(test)}")

    best = None
    for C in (1, 2, 4, 8, 16):
        for cw in (None, "balanced"):
            m = LogisticRegression(C=C, max_iter=3000, class_weight=cw)
            m.fit(Xtr, ytr, sample_weight=wtr)
            p5 = to5(m.predict_proba(Xdv)).argmax(1)
            mac5, _ = f1s([TO5[r["intent"]] for r in dev], [FIVE[i] for i in p5], FIVE)
            mac9, _ = f1s([r["intent"] for r in dev], [INTENTS[i] for i in m.predict(Xdv)], INTENTS)
            print(f"  C={C:<3} lớp={str(cw):<9} dev macro-F1 5 lớp {mac5:.3f}, 9 lớp {mac9:.3f}")
            if best is None or mac5 > best[0]:
                best = (mac5, C, cw, m)
    _, C, cw, model = best
    print(f"chọn C={C}, class_weight={cw} theo dev")

    # Aspects: mỗi nhãn một bộ phân loại nhị phân, ngưỡng chọn trên dev
    asp_coef, asp_b, asp_thr = [], [], []
    ytr_a = np.array([[1 if a in r["aspects"] else 0 for a in ASPECTS] for r in train])
    ydv_a = np.array([[1 if a in r["aspects"] else 0 for a in ASPECTS] for r in dev])
    for j, a in enumerate(ASPECTS):
        m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced")
        m.fit(Xtr, ytr_a[:, j], sample_weight=wtr)
        pr = m.predict_proba(Xdv)[:, 1]
        thr, bf = 0.5, -1
        for t in np.arange(0.2, 0.91, 0.05):
            pred = pr >= t
            tp = int((pred & (ydv_a[:, j] == 1)).sum()); fp = int((pred & (ydv_a[:, j] == 0)).sum()); fn = int((~pred & (ydv_a[:, j] == 1)).sum())
            f = 2 * tp / (2 * tp + fp + fn) if tp else 0
            if f > bf:
                bf, thr = f, float(t)
        asp_coef.append(m.coef_[0]); asp_b.append(float(m.intercept_[0])); asp_thr.append(round(thr, 2))

    # Báo số trên test MỘT lần
    pt = model.predict_proba(Xte)
    g5 = [TO5[r["intent"]] for r in test]
    p5 = [FIVE[i] for i in to5(pt).argmax(1)]
    mac5, per5 = f1s(g5, p5, FIVE)
    mac9, per9 = f1s([r["intent"] for r in test], [INTENTS[i] for i in pt.argmax(1)], INTENTS)
    acc5 = sum(g == p for g, p in zip(g5, p5)) / len(test)
    gnr = [r["needs_reply"] for r in test]
    pnr = [1 if p in ("order", "question", "complaint") else 0 for p in p5]
    tp = sum(1 for g, p in zip(gnr, pnr) if g and p); fp = sum(1 for g, p in zip(gnr, pnr) if not g and p); fn = sum(1 for g, p in zip(gnr, pnr) if g and not p)
    nr_f1 = 2 * tp / (2 * tp + fp + fn)
    print(f"TEST intent 5 lớp macro-F1 {mac5:.3f}, accuracy {acc5:.3f}; 9 lớp macro-F1 {mac9:.3f}; cần trả lời F1 {nr_f1:.3f}")
    print("  5 lớp:", {k: round(v, 3) for k, v in per5.items()})
    print("  9 lớp:", {k: round(v, 3) for k, v in per9.items()})

    vocab = [None] * len(idx)
    for f, i in idx.items():
        vocab[i] = f
    OUT.write_text(json.dumps({
        "version": 1,
        "note": "Sinh bởi nlp_service/live/train_linear.py từ livestream_labeling (nhãn LLM đã kiểm chứng, chia theo phiên)",
        "intents": INTENTS, "aspects": ASPECTS,
        "vocab": vocab,
        "idf": [round(float(v), 4) for v in idf],
        "intent": {"coef": [[round(float(x), 4) for x in row] for row in model.coef_], "bias": [round(float(b), 4) for b in model.intercept_]},
        "aspect": {"coef": [[round(float(x), 4) for x in row] for row in asp_coef], "bias": [round(b, 4) for b in asp_b], "threshold": asp_thr},
        "test": {"macroF1_5": round(mac5, 3), "acc_5": round(acc5, 3), "macroF1_9": round(mac9, 3), "needsReplyF1": round(nr_f1, 3), "n": len(test)}
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"đã ghi {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
