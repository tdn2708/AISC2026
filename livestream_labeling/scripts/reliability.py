"""Đo độ tin cậy nhãn giữa người gán A (Claude Opus), người gán B (Claude Sonnet, độc lập với A), C (bộ luật dự án).
Người kiểm chứng/phân xử (agent 3, thư mục labels/V) KHÔNG tham gia các chỉ số này.

Công thức dùng:
- Cohen's kappa (Cohen, 1960):          k = (p_o - p_e) / (1 - p_e)
- Krippendorff's alpha (2004/2011):     a = 1 - D_o / D_e   (nominal cho nhãn đơn; khoảng cách MASI cho tập aspects)
- MASI (Passonneau, 2006):              d = 1 - Jaccard * M, M = 1 (bằng), 0.67 (tập con), 0.33 (giao khác rỗng), 0
- KTC 95% bootstrap theo item (Efron, 1979)
- KTC Wilson (Wilson, 1927) cho tỉ lệ đồng thuận
- Dawid & Skene (1979): EM ước lượng ma trận nhầm lẫn từng người gán và xác suất hậu nghiệm nhãn đúng của từng item
Cách dùng: python reliability.py A.json B.json C.json out_metrics.json out_items.csv
"""
import json, sys, math
import numpy as np, pandas as pd

rng = np.random.default_rng(42)
INTENTS = ["ORDER", "QUESTION", "REQUEST", "NEGOTIATE", "COMPLAINT", "PRAISE", "GIVEAWAY", "SOCIAL", "OTHER"]
ASPECTS = ["PRICE", "PROMOTION", "SIZE_FIT", "VARIANT", "SPEC_MATERIAL", "USAGE", "STOCK", "SHIPPING",
           "ORDER_PROCESS", "QUALITY_TRUST", "HOST_STREAM"]


def cohen(a, b):
    a, b = np.asarray(a), np.asarray(b)
    cats = np.union1d(a, b)
    po = np.mean(a == b)
    pe = sum(np.mean(a == c) * np.mean(b == c) for c in cats)
    return float((po - pe) / (1 - pe)) if pe < 1 else 1.0


def alpha_nominal(M):
    """M: danh sách item, mỗi item là list nhãn của các người gán (None = thiếu)."""
    vals = sorted({v for row in M for v in row if v is not None})
    idx = {v: i for i, v in enumerate(vals)}
    o = np.zeros((len(vals), len(vals)))
    for row in M:
        r = [idx[v] for v in row if v is not None]
        m = len(r)
        if m < 2:
            continue
        for i in range(m):
            for j in range(m):
                if i != j:
                    o[r[i], r[j]] += 1 / (m - 1)
    n = o.sum()
    nc = o.sum(1)
    Do = n - np.trace(o)
    De = (n * n - (nc ** 2).sum()) / (n - 1)
    return float(1 - Do / De) if De > 0 else 1.0


def masi(a, b):
    a, b = set(a), set(b)
    if not a and not b:
        return 0.0
    inter, uni = len(a & b), len(a | b)
    j = inter / uni
    m = 1 if a == b else (2 / 3 if (a <= b or b <= a) else (1 / 3 if inter else 0))
    return 1 - j * m


def alpha_sets(M):
    """Krippendorff alpha với khoảng cách MASI (nhãn đa trị). D_e tính trên các giá trị khác nhau có trọng số."""
    po, allv = [], []
    for row in M:
        r = [frozenset(v) for v in row if v is not None]
        if len(r) < 2:
            continue
        allv += r
        m = len(r)
        po += [masi(r[i], r[j]) / (m - 1) for i in range(m) for j in range(m) if i != j]
    n = len(allv)
    Do = np.sum(po) / n
    cnt = pd.Series(allv).value_counts()
    keys, w = list(cnt.index), cnt.values.astype(float)
    s = 0.0
    for i, ki in enumerate(keys):
        for j, kj in enumerate(keys):
            if i != j:
                s += w[i] * w[j] * masi(ki, kj)
    De = s / (n * (n - 1))
    return float(1 - Do / De) if De > 0 else 1.0


def wilson(k, n, z=1.96):
    if n == 0:
        return [float("nan")] * 2
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [c - h, c + h]


def boot(fn, n, B=2000):
    vals = []
    for _ in range(B):
        ix = rng.integers(0, n, n)
        try:
            v = fn(ix)
            if np.isfinite(v):
                vals.append(v)
        except Exception:
            pass
    return [float(x) for x in np.percentile(vals, [2.5, 97.5])]


def dawid_skene(L, K, iters=50):
    """L: ma trận item x người gán, giá trị = chỉ số lớp, -1 = thiếu."""
    n, R = L.shape
    T = np.full((n, K), 1e-6)
    for i in range(n):
        for r in range(R):
            if L[i, r] >= 0:
                T[i, L[i, r]] += 1
    T /= T.sum(1, keepdims=True)
    for _ in range(iters):
        prior = T.mean(0) + 1e-9
        pi = np.full((R, K, K), 0.01)
        for r in range(R):
            for i in range(n):
                if L[i, r] >= 0:
                    pi[r, :, L[i, r]] += T[i]
            pi[r] /= pi[r].sum(1, keepdims=True)
        logT = np.tile(np.log(prior), (n, 1))
        for r in range(R):
            for i in range(n):
                if L[i, r] >= 0:
                    logT[i] += np.log(pi[r, :, L[i, r]])
        T = np.exp(logT - logT.max(1, keepdims=True))
        T /= T.sum(1, keepdims=True)
    return T, pi


def interp(k):
    """Thang Landis & Koch (1977)."""
    return ("kém" if k < 0 else "rất thấp" if k <= .2 else "thấp" if k <= .4 else "trung bình" if k <= .6
            else "khá cao" if k <= .8 else "gần như hoàn toàn")


def main(fa, fb, fc, out_json, out_items):
    load = lambda f: {d["item_id"]: d for d in json.load(open(f, encoding="utf-8"))}
    A, B, C = load(fa), load(fb), load(fc)
    ids = [i for i in A if i in B]
    n = len(ids)
    res = {"n_items": n}
    for field in ["intent", "sentiment", "needs_reply"]:
        a = np.array([str(A[i][field]) for i in ids])
        b = np.array([str(B[i][field]) for i in ids])
        c = np.array([str(C[i][field]) if i in C and field in C[i] else "NA" for i in ids])
        k = cohen(a, b)
        agree = int((a == b).sum())
        res[field] = {
            "percent_agreement_AB": agree / n, "wilson95": wilson(agree, n),
            "cohen_kappa_AB": k, "kappa_AB_boot95": boot(lambda ix: cohen(a[ix], b[ix]), n),
            "landis_koch": interp(k),
            "kripp_alpha_AB": alpha_nominal([[a[j], b[j]] for j in range(n)]),
            "kripp_alpha_AB_boot95": boot(lambda ix: alpha_nominal([[a[j], b[j]] for j in ix]), n, B=1000),
            "kripp_alpha_ABC": alpha_nominal([[a[j], b[j], c[j] if c[j] != "NA" else None] for j in range(n)]),
            "cohen_kappa_A_vs_rules": cohen(a, c), "cohen_kappa_B_vs_rules": cohen(b, c),
        }
    a = np.array([A[i]["intent"] for i in ids])
    b = np.array([B[i]["intent"] for i in ids])
    per = {}
    for cl in INTENTS:
        tp = int(((a == cl) & (b == cl)).sum())
        fa_ = int(((a == cl) & (b != cl)).sum())
        fb_ = int(((a != cl) & (b == cl)).sum())
        per[cl] = {"n_A": int((a == cl).sum()), "n_B": int((b == cl).sum()), "kappa_binary": cohen(a == cl, b == cl),
                   "F1_A_vs_B": (2 * tp / (2 * tp + fa_ + fb_)) if (tp + fa_ + fb_) else None}
    res["intent_per_class"] = per
    SA = [A[i].get("aspects", []) or [] for i in ids]
    SB = [B[i].get("aspects", []) or [] for i in ids]
    res["aspects"] = {
        "kripp_alpha_MASI_AB": alpha_sets([[x, y] for x, y in zip(SA, SB)]),
        "mean_jaccard": float(np.mean([1 if not x and not y else len(set(x) & set(y)) / len(set(x) | set(y)) for x, y in zip(SA, SB)])),
        "exact_match": float(np.mean([set(x) == set(y) for x, y in zip(SA, SB)])),
        "per_aspect": {asp: {"n_A": sum(asp in x for x in SA), "n_B": sum(asp in y for y in SB),
                             "kappa_binary": cohen(np.array([asp in x for x in SA]), np.array([asp in y for y in SB]))}
                       for asp in ASPECTS},
    }
    K = len(INTENTS)
    L = np.array([[INTENTS.index(A[i]["intent"]), INTENTS.index(B[i]["intent"]),
                   INTENTS.index(C[i]["intent"]) if i in C else -1] for i in ids])
    T, pi = dawid_skene(L, K)
    prior = T.mean(0)
    res["dawid_skene_estimated_accuracy"] = {nm: float(np.sum(prior * np.diag(pi[r])))
                                             for r, nm in enumerate(["A", "B", "C_luat"])}
    rows = []
    for j, i in enumerate(ids):
        k_ = int(T[j].argmax())
        rows.append({"item_id": i, "intent_A": A[i]["intent"], "intent_B": B[i]["intent"],
                     "intent_C_rules": C.get(i, {}).get("intent"), "intent_DS": INTENTS[k_],
                     "conf_DS": round(float(T[j, k_]), 4),
                     "p_label_A": round(float(T[j, INTENTS.index(A[i]["intent"])]), 4),
                     "agree_AB": bool(A[i]["intent"] == B[i]["intent"]),
                     **{f"p_{c}": round(float(T[j, k2]), 4) for k2, c in enumerate(INTENTS)}})
    pd.DataFrame(rows).to_csv(out_items, index=False, encoding="utf-8-sig")
    json.dump(res, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    for f in ["intent", "sentiment", "needs_reply"]:
        r = res[f]
        print(f"{f:12s} agree={r['percent_agreement_AB']:.3f} kappa={r['cohen_kappa_AB']:.3f} {r['kappa_AB_boot95']} "
              f"alphaAB={r['kripp_alpha_AB']:.3f} alphaABC={r['kripp_alpha_ABC']:.3f} ({r['landis_koch']})")
    print("aspects", {k: v for k, v in res["aspects"].items() if k != "per_aspect"})
    print("DS acc", res["dawid_skene_estimated_accuracy"])


if __name__ == "__main__":
    main(*sys.argv[1:6])
