"""
Fine-tune đa nhiệm cho bình luận livestream (intent, aspects, sentiment, needs_reply).

    python train_live.py --data data --base uitnlp/visobert --out runs/visobert_s42 --seed 42

Quy trình:
  1. Huấn luyện trên train.jsonl; sau mỗi epoch đo macro-F1 intent trên dev; giữ epoch tốt nhất.
  2. Chọn ngưỡng cho từng aspect và cho needs_reply trên DEV (không đụng test).
  3. Đo một lần trên TEST, ghi test_report.json và preds_test.jsonl (để so sánh mô hình bằng compare.py).

Loss = CE(intent, trọng số lớp) + BCE(aspects) + 0,5·CE(sentiment, trọng số lớp) + 0,5·BCE(needs_reply);
mỗi câu nhân thêm trọng số độ tin cậy nhãn (câu 'thap' = 0,5).
"""
import argparse
import json
import math
import random
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_model import LiveMultiTask, load_encoder, save_checkpoint  # noqa: E402
from metrics import binary_f1, cluster_bootstrap, f1_per_class, macro_f1, multilabel_f1  # noqa: E402

MAIN_CHANNEL = "GỐM NHẬT HUYỀN LÝ"  # kênh chiếm ~2/3 dữ liệu


def read_jsonl(p, limit=0):
    rows = [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]
    return rows[:limit] if limit else rows


def targets(rows, L):
    ai = {a: i for i, a in enumerate(L["aspects"])}
    asp = np.zeros((len(rows), len(L["aspects"])), dtype=np.float32)
    for k, r in enumerate(rows):
        for a in r["aspects"]:
            asp[k, ai[a]] = 1
    return {
        "intent": np.array([L["intent"].index(r["intent"]) for r in rows]),
        "aspects": asp,
        "sentiment": np.array([L["sentiment"].index(r["sentiment"]) for r in rows]),
        "needs_reply": np.array([r["needs_reply"] for r in rows], dtype=np.float32),
        "weight": np.array([r.get("weight", 1.0) for r in rows], dtype=np.float32),
    }


def class_weights(y, n, cap=10.0):
    """Trọng số lớp = căn bậc hai nghịch tần suất, chặn trên `cap`, chuẩn hoá trung bình 1.
    Căn bậc hai để lớp hiếm (NEGOTIATE ~11 câu) được chú ý mà không bị học thuộc."""
    cnt = np.bincount(y, minlength=n).astype(float)
    w = np.sqrt(cnt.max() / np.maximum(cnt, 1))
    w = np.minimum(w, cap)
    w[cnt == 0] = 0
    return torch.tensor(w / w[cnt > 0].mean(), dtype=torch.float32)


def make_batches(n, bs, shuffle, rng):
    idx = list(range(n))
    if shuffle:
        rng.shuffle(idx)
    return [idx[i:i + bs] for i in range(0, n, bs)]


@torch.no_grad()
def predict(model, tok, rows, device, max_len, bs=64):
    model.eval()
    out = {"intent": [], "aspects": [], "sentiment": [], "needs_reply": []}
    for b in make_batches(len(rows), bs, False, None):
        enc = tok([rows[i]["input"] for i in b], padding=True, truncation=True, max_length=max_len, return_tensors="pt").to(device)
        with torch.autocast(device_type=device, dtype=torch.float16, enabled=device == "cuda"):
            o = model(enc["input_ids"], enc["attention_mask"])
        out["intent"].append(o["intent"].float().softmax(-1).cpu())
        out["aspects"].append(o["aspects"].float().sigmoid().cpu())
        out["sentiment"].append(o["sentiment"].float().softmax(-1).cpu())
        out["needs_reply"].append(o["needs_reply"].float().sigmoid().cpu())
    return {k: torch.cat(v).numpy() for k, v in out.items()}


def tune_thresholds(prob, gold, grid=np.arange(0.15, 0.81, 0.05), min_pos=5):
    """Ngưỡng tối ưu F1 trên dev cho từng cột; cột có < min_pos mẫu dương giữ 0,5."""
    th = []
    for j in range(gold.shape[1]):
        if gold[:, j].sum() < min_pos:
            th.append(0.5)
            continue
        best = max(grid, key=lambda t: binary_f1(gold[:, j], prob[:, j] >= t))
        th.append(round(float(best), 2))
    return th


def scores(P, Y, L, th_asp, th_nr, idx=None):
    if idx is None:
        idx = np.arange(len(Y["intent"]))
    n_int, n_sent = len(L["intent"]), len(L["sentiment"])
    pi = P["intent"][idx].argmax(-1)
    pa = (P["aspects"][idx] >= np.array(th_asp)).astype(int)
    mi, ma, _ = multilabel_f1(Y["aspects"][idx], pa)
    return {
        "so_cau": int(len(idx)),
        "intent_macro_f1": macro_f1(Y["intent"][idx], pi, n_int),
        "intent_accuracy": float(np.mean(pi == Y["intent"][idx])),
        "aspects_micro_f1": mi,
        "aspects_macro_f1": ma,
        "sentiment_macro_f1": macro_f1(Y["sentiment"][idx], P["sentiment"][idx].argmax(-1), n_sent),
        "needs_reply_f1": binary_f1(Y["needs_reply"][idx], P["needs_reply"][idx] >= th_nr),
    }


def r4(d):
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "data")
    ap.add_argument("--base", default="uitnlp/visobert", help="Tên mô hình HF hoặc thư mục (ví dụ thư mục DAPT)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--head-lr", type=float, default=1e-4)
    ap.add_argument("--max-len", type=int, default=64)
    ap.add_argument("--warmup", type=float, default=0.1)
    ap.add_argument("--patience", type=int, default=2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--limit", type=int, default=0, help="Chỉ dùng N câu mỗi tập (chạy thử)")
    ap.add_argument("--max-steps", type=int, default=0, help="Dừng mỗi epoch sau N bước (chạy thử)")
    ap.add_argument("--no-save", action="store_true", help="Không lưu checkpoint (chỉ cần báo cáo + dự đoán)")
    a = ap.parse_args()

    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed); torch.cuda.manual_seed_all(a.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    L = json.loads((Path(__file__).resolve().parent / "labels_live.json").read_text(encoding="utf-8"))
    tr, dv, te = (read_jsonl(a.data / f"{k}.jsonl", a.limit) for k in ("train", "dev", "test"))
    # Chốt chặn rò rỉ: không phiên nào của dev/test được có trong train
    leak = {r["phien"] for r in tr} & {r["phien"] for r in dv + te}
    if leak:
        sys.exit(f"Rò rỉ phiên giữa train và dev/test: {sorted(leak)[:5]}")
    Ytr, Ydv, Yte = targets(tr, L), targets(dv, L), targets(te, L)
    print(f"train {len(tr)} | dev {len(dv)} | test {len(te)} | thiết bị {device} | nền {a.base}", flush=True)

    tok = AutoTokenizer.from_pretrained(a.base)
    model = LiveMultiTask(load_encoder(a.base), L).to(device)
    w_int = class_weights(Ytr["intent"], len(L["intent"])).to(device)
    w_sent = class_weights(Ytr["sentiment"], len(L["sentiment"])).to(device)

    enc_params = [p for n, p in model.named_parameters() if n.startswith("encoder.")]
    head_params = [p for n, p in model.named_parameters() if not n.startswith("encoder.")]
    opt = torch.optim.AdamW([{"params": enc_params, "lr": a.lr}, {"params": head_params, "lr": a.head_lr}], weight_decay=0.01)
    steps_per_epoch = math.ceil(len(tr) / a.batch_size)
    if a.max_steps:
        steps_per_epoch = min(steps_per_epoch, a.max_steps)
    sched = get_linear_schedule_with_warmup(opt, int(a.warmup * steps_per_epoch * a.epochs), steps_per_epoch * a.epochs)
    scaler = torch.amp.GradScaler("cuda", enabled=device == "cuda")
    T = {k: torch.tensor(v) for k, v in Ytr.items()}
    rng = random.Random(a.seed)

    best, best_state, bad, history = -1.0, None, 0, []
    t0 = time.time()
    for ep in range(1, a.epochs + 1):
        model.train()
        tot, n_steps = 0.0, 0
        for step, b in enumerate(make_batches(len(tr), a.batch_size, True, rng)):
            if a.max_steps and step >= a.max_steps:
                break
            enc = tok([tr[i]["input"] for i in b], padding=True, truncation=True, max_length=a.max_len, return_tensors="pt").to(device)
            y = {k: v[b].to(device) for k, v in T.items()}
            with torch.autocast(device_type=device, dtype=torch.float16, enabled=device == "cuda"):
                o = model(enc["input_ids"], enc["attention_mask"])
            o = {k: v.float() for k, v in o.items()}
            w = y["weight"]
            loss = (
                (F.cross_entropy(o["intent"], y["intent"], weight=w_int, reduction="none") * w).mean()
                + (F.binary_cross_entropy_with_logits(o["aspects"], y["aspects"], reduction="none").mean(-1) * w).mean()
                + 0.5 * (F.cross_entropy(o["sentiment"], y["sentiment"], weight=w_sent, reduction="none") * w).mean()
                + 0.5 * (F.binary_cross_entropy_with_logits(o["needs_reply"], y["needs_reply"], reduction="none") * w).mean()
            )
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); sched.step()
            tot += loss.item(); n_steps += 1
        Pdv = predict(model, tok, dv, device, a.max_len)
        f = macro_f1(Ydv["intent"], Pdv["intent"].argmax(-1), len(L["intent"]))
        history.append({"epoch": ep, "loss": round(tot / max(1, n_steps), 4), "dev_intent_macro_f1": round(f, 4)})
        print(f"epoch {ep}: loss {tot / max(1, n_steps):.4f} | dev macro-F1 intent {f:.4f} | {(time.time() - t0) / 60:.1f} phút", flush=True)
        if best_state is None or f > best:
            best, bad = f, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= a.patience:
                print("Dừng sớm: dev không tăng", a.patience, "epoch liền.")
                break
    model.load_state_dict(best_state)

    # Ngưỡng chọn trên DEV
    Pdv = predict(model, tok, dv, device, a.max_len)
    th_asp = tune_thresholds(Pdv["aspects"], Ydv["aspects"])
    th_nr = tune_thresholds(Pdv["needs_reply"][:, None], Ydv["needs_reply"][:, None])[0]

    # Đo MỘT lần trên TEST
    Pte = predict(model, tok, te, device, a.max_len)
    groups = np.array([r["phien"] for r in te])
    n_int = len(L["intent"])
    pi = Pte["intent"].argmax(-1)
    rule = np.array([L["intent"].index(r["intent_luat"]) if r["intent_luat"] in L["intent"] else L["intent"].index("OTHER") for r in te])

    def sub(cond):
        idx = np.array([i for i, r in enumerate(te) if cond(r)])
        return r4(scores(Pte, Yte, L, th_asp, th_nr, idx)) if len(idx) else None

    v, lo, hi = cluster_bootstrap(groups, lambda i: macro_f1(Yte["intent"][i], pi[i], n_int))
    rv, rlo, rhi = cluster_bootstrap(groups, lambda i: macro_f1(Yte["intent"][i], rule[i], n_int))
    per_int = f1_per_class(Yte["intent"], pi, n_int)
    _, _, per_asp = multilabel_f1(Yte["aspects"], (Pte["aspects"] >= np.array(th_asp)).astype(int))
    conf = np.zeros((n_int, n_int), dtype=int)
    for g, p in zip(Yte["intent"], pi):
        conf[g, p] += 1

    report = {
        "nen": a.base, "seed": a.seed, "thiet_bi": device,
        "tham_so": {k: getattr(a, k) for k in ("epochs", "batch_size", "lr", "head_lr", "max_len", "warmup", "patience")},
        "lich_su": history, "dev_intent_macro_f1_tot_nhat": round(best, 4),
        "nguong_aspects": dict(zip(L["aspects"], th_asp)), "nguong_needs_reply": th_nr,
        "test": r4(scores(Pte, Yte, L, th_asp, th_nr)),
        "test_intent_macro_f1_KTC95_theo_phien": [round(v, 4), round(lo, 4), round(hi, 4)],
        "luat_tu_khoa_cu_intent_macro_f1_KTC95": [round(rv, 4), round(rlo, 4), round(rhi, 4)],
        "test_f1_tung_intent": {c: (None if np.isnan(x) else round(float(x), 4)) for c, x in zip(L["intent"], per_int)},
        "test_so_cau_tung_intent": dict(Counter(r["intent"] for r in te)),
        "test_f1_tung_aspect": {c: (None if np.isnan(x) else round(float(x), 4)) for c, x in zip(L["aspects"], per_asp)},
        "ma_tran_nham_lan_intent": {"hang_la_nhan_that_cot_la_du_doan": L["intent"], "ma_tran": conf.tolist()},
        "test_theo_nhom": {
            **{f"nganh={g}": sub(lambda r, g=g: r["nganh"] == g) for g in ("gia_dung", "quan_ao", "cong_nghe")},
            **{f"nen_tang={p}": sub(lambda r, p=p: r["nen_tang"] == p) for p in ("youtube", "tiktok")},
            "bo_kenh_gom_Huyen_Ly": sub(lambda r: r["kenh"] != MAIN_CHANNEL),
            "chi_nhan_tin_cay_cao_va_trung_binh": sub(lambda r: r["muc_tin_cay"] != "thap"),
        },
        "thoi_gian_phut": round((time.time() - t0) / 60, 1),
    }
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "test_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    # Dự đoán dev dùng để CHỌN mô hình (compare.py --split dev); dự đoán test chỉ để báo cáo
    for split, rows_, P_ in (("dev", dv, Pdv), ("test", te, Pte)):
        with open(a.out / f"preds_{split}.jsonl", "w", encoding="utf-8") as f:
            for i, r in enumerate(rows_):
                f.write(json.dumps({"id": r["id"], "phien": r["phien"], "intent": r["intent"],
                                    "p_intent": [round(float(x), 5) for x in P_["intent"][i]]}, ensure_ascii=False) + "\n")
    if not a.no_save:
        save_checkpoint(model, tok, a.out / "ckpt", {"base": a.base, "max_len": a.max_len, "input": "[nganh] binh_luan",
                                                     "nguong_aspects": th_asp, "nguong_needs_reply": th_nr, "seed": a.seed})
    t = report["test"]
    print(f"TEST intent macro-F1 {v:.4f} [{lo:.4f}–{hi:.4f}] (luật cũ {rv:.4f}) | aspects micro-F1 {t['aspects_micro_f1']} | "
          f"sentiment macro-F1 {t['sentiment_macro_f1']} | needs_reply F1 {t['needs_reply_f1']}")


if __name__ == "__main__":
    main()
