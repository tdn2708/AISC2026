"""Chỉ số đánh giá (chỉ cần numpy) và khoảng tin cậy bootstrap theo PHIÊN.

Bootstrap theo phiên (cluster bootstrap): lấy mẫu lại cả phiên chứ không lấy từng câu,
vì các câu trong một phiên không độc lập. KTC tính theo cách này rộng hơn nhưng trung thực hơn.
"""
import numpy as np


def f1_per_class(gold, pred, n):
    gold, pred = np.asarray(gold), np.asarray(pred)
    out = []
    for c in range(n):
        tp = np.sum((gold == c) & (pred == c))
        fp = np.sum((gold != c) & (pred == c))
        fn = np.sum((gold == c) & (pred != c))
        out.append(2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else float("nan"))
    return np.array(out)


def macro_f1(gold, pred, n):
    """Trung bình F1 trên các lớp CÓ MẶT trong nhãn vàng (lớp vắng không tính)."""
    gold = np.asarray(gold)
    f = f1_per_class(gold, pred, n)
    present = [c for c in range(n) if np.any(gold == c)]
    return float(np.mean([0.0 if np.isnan(f[c]) else f[c] for c in present])) if present else float("nan")


def binary_f1(gold, pred):
    gold, pred = np.asarray(gold).astype(bool), np.asarray(pred).astype(bool)
    tp, fp, fn = np.sum(gold & pred), np.sum(~gold & pred), np.sum(gold & ~pred)
    return float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else float("nan")


def multilabel_f1(gold, pred):
    """gold, pred: ma trận 0/1 (số câu × số aspect). Trả (micro-F1, macro-F1 trên aspect có mặt, F1 từng aspect)."""
    gold, pred = np.asarray(gold).astype(bool), np.asarray(pred).astype(bool)
    tp, fp, fn = np.sum(gold & pred), np.sum(~gold & pred), np.sum(gold & ~pred)
    micro = float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else float("nan")
    per = []
    for j in range(gold.shape[1]):
        g, p = gold[:, j], pred[:, j]
        d = 2 * np.sum(g & p) + np.sum(~g & p) + np.sum(g & ~p)
        per.append(float(2 * np.sum(g & p) / d) if d else float("nan"))
    present = [j for j in range(gold.shape[1]) if gold[:, j].any()]
    macro = float(np.mean([0.0 if np.isnan(per[j]) else per[j] for j in present])) if present else float("nan")
    return micro, macro, per


def cluster_bootstrap(groups, stat, B=2000, seed=0):
    """stat(idx) -> số. Lấy mẫu lại theo nhóm (phiên). Trả (giá trị, KTC 2,5%, KTC 97,5%)."""
    groups = np.asarray(groups)
    uniq = np.unique(groups)
    members = {g: np.where(groups == g)[0] for g in uniq}
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(B):
        pick = rng.choice(uniq, size=len(uniq), replace=True)
        idx = np.concatenate([members[g] for g in pick])
        v = stat(idx)
        if not np.isnan(v):
            vals.append(v)
    full = stat(np.arange(len(groups)))
    return float(full), float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))
