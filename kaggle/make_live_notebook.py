"""
Sinh notebook Kaggle huấn luyện mô hình bình luận livestream.
  python kaggle/make_live_notebook.py   →  kaggle/03_live_visobert.ipynb
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

CELLS = [
    ("markdown", """
# Customer Radar — mô hình bình luận livestream (ViSoBERT đa nhiệm)

Dự đoán cho mỗi bình luận: **intent** (9 lớp), **aspects** (11, đa nhãn), **sentiment**, **needs_reply**.

**Chuẩn bị (một lần, trên máy):**
1. `python nlp_service/live/prepare_data.py` → `nlp_service/live/data/` (train/dev/test chia theo phiên + kho câu DAPT).
2. Kaggle → Datasets → New dataset `customer-radar-live`, tải lên **cả thư mục `nlp_service/live/`** (mã + `labels_live.json` + `data/`).
3. Notebook này: Accelerator **GPU T4** (một GPU đủ), Internet **On**, Add Data = `customer-radar-live`.

**Chạy:** Run All, khoảng 30–45 phút.
So 3 hệ: (a) luật từ khoá cũ, (b) ViSoBERT, (c) ViSoBERT + DAPT. Mỗi hệ mạng học 3 seed.
Mô hình được **chọn trên dev** theo bậc (luật → ViSoBERT → DAPT), chỉ lên bậc khi hơn ≥ 0,02 macro-F1 intent và KTC không chứa 0.
Test chỉ dùng để báo cáo hệ đã chọn.

**Tải về** từ `/kaggle/working/`: `ket_qua_live.zip` (báo cáo + so sánh) và `ckpt_live_tot_nhat.zip` (mô hình được chọn).

Con số được phép báo cáo là điểm trên **test**: 21 phiên không xuất hiện ở train/dev.
Không chỉnh mô hình theo các câu test đang sai.
"""),
    ("code", """
import glob, json, os, shutil, subprocess, sys
# Tìm thư mục chứa mã (Kaggle có thể giữ hoặc làm phẳng tên thư mục khi tải lên)
hits = glob.glob("/kaggle/input/**/live/train_live.py", recursive=True) or glob.glob("/kaggle/input/**/train_live.py", recursive=True)
assert hits, "Không thấy train_live.py trong /kaggle/input — kiểm tra đã Add Data chưa"
src = os.path.dirname(hits[0])
W = "/kaggle/working/live"
shutil.copytree(src, W, dirs_exist_ok=True)
os.chdir(W)
m = json.load(open("data/manifest.json", encoding="utf-8"))
for k, v in m["tap"].items():
    print(k, v["so_cau"], "câu,", v["so_phien"], "phiên |", v["intent"])
print("DAPT:", m["dapt_corpus"]["so_cau"], "câu")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "sentencepiece"], check=True)
"""),
    ("code", """
SEEDS = [42, 43, 44]
BASE = "uitnlp/visobert"
# Ứng viên thêm (tắt mặc định). Kiểm tra tên kho và GIẤY PHÉP trước khi bật (xem DE-XUAT-MO-HINH.md):
EXTRA = {
    # "cafebert": "uitnlp/CafeBERT",                    # XLM-R large: chậm hơn ~3 lần, nên giảm batch-size xuống 16
    # "bamibert": "Qualcomm-AI-Research/BamiBERT",      # BSD-3-Clause-Clear + điều khoản Qualcomm
}

def run(cmd):
    print(">>", " ".join(cmd), flush=True)
    subprocess.run([sys.executable, *cmd], check=True)

def train(name, base, extra_args=()):
    for s in SEEDS:
        out = f"runs/{name}_s{s}"
        if os.path.exists(f"{out}/test_report.json"):
            print("đã có", out); continue
        # Chỉ lưu checkpoint của seed đầu để tiết kiệm đĩa
        run(["train_live.py", "--base", base, "--out", out, "--seed", str(s), *extra_args,
             *([] if s == SEEDS[0] else ["--no-save"])])
"""),
    ("code", """
# (b) ViSoBERT gốc
train("visobert", BASE)
"""),
    ("code", """
# (c) Pretrain thêm trên ~10 nghìn bình luận live chưa nhãn (đã bỏ phiên dev/test), rồi fine-tune
if not os.path.exists("runs/visobert_dapt/config.json"):
    run(["dapt.py", "--base", BASE, "--out", "runs/visobert_dapt", "--epochs", "3"])
train("dapt", "runs/visobert_dapt")
"""),
    ("code", """
for name, base in EXTRA.items():
    train(name, base, ["--batch-size", "16"] if "CafeBERT" in base else [])
"""),
    ("code", """
def seeds(name):
    return [f"runs/{name}_s{s}" for s in SEEDS]

def compare(A, B, split, tag):
    run(["compare.py", "--a", *A, "--b", *B, "--split", split, "--out", f"runs/so_sanh_{tag}_{split}.json"])
    return json.load(open(f"runs/so_sanh_{tag}_{split}.json", encoding="utf-8"))

# CHỌN mô hình trên DEV, theo từng bậc: chỉ lên bậc khi hệ mới hơn ≥ 0,02 và KTC không chứa 0
chosen, chain = "luat", []
for name in ["visobert", "dapt", *EXTRA]:
    A = ["luat"] if chosen == "luat" else seeds(chosen)
    r = compare(A, seeds(name), "dev", f"{name}_vs_{chosen}")
    chain.append((name, chosen, r["hieu_B_tru_A_KTC95"], r["B_thang_theo_quy_tac"]))
    print(f"[dev] {name} vs {chosen}: hiệu {r['hieu_B_tru_A_KTC95']} -> {'THẮNG' if r['B_thang_theo_quy_tac'] else 'không đủ'}")
    if r["B_thang_theo_quy_tac"]:
        chosen = name
print("Chọn (theo dev):", chosen)
"""),
    ("code", """
# BÁO CÁO trên TEST (không dùng để chọn): hệ được chọn so với luật cũ và với ViSoBERT gốc
test_cmp = {"vs_luat": compare(["luat"], seeds(chosen), "test", f"{chosen}_vs_luat")} if chosen != "luat" else {}
if chosen not in ("luat", "visobert"):
    test_cmp["vs_visobert"] = compare(seeds("visobert"), seeds(chosen), "test", f"{chosen}_vs_visobert")

import statistics as st
rows = []
for name in ["visobert", "dapt", *EXTRA]:
    reps = [json.load(open(f"runs/{name}_s{s}/test_report.json", encoding="utf-8")) for s in SEEDS]
    mean = lambda k: st.mean(r["test"][k] for r in reps)
    rows.append((name, mean("intent_macro_f1"), mean("aspects_micro_f1"), mean("sentiment_macro_f1"), mean("needs_reply_f1"),
                 st.mean(r["test_theo_nhom"]["bo_kenh_gom_Huyen_Ly"]["intent_macro_f1"] for r in reps)))
print("TEST, trung bình 3 seed")
print(f"{'hệ':10s} {'intent':>8s} {'aspects':>8s} {'sent':>8s} {'reply':>8s} {'bỏ HL':>8s}")
for r in rows:
    print(f"{r[0]:10s}" + "".join(f"{x:8.3f}" for x in r[1:]))
luat = json.load(open(f"runs/visobert_s{SEEDS[0]}/test_report.json", encoding="utf-8"))["luat_tu_khoa_cu_intent_macro_f1_KTC95"]
print("luật cũ intent macro-F1 [KTC95]:", luat)
for k, v in test_cmp.items():
    print(f"[test] {chosen} {k}: hiệu {v['hieu_B_tru_A_KTC95']}")
"""),
    ("code", """
os.makedirs("/kaggle/working/ket_qua", exist_ok=True)
for p in glob.glob("runs/*/test_report.json") + glob.glob("runs/so_sanh_*.json"):
    dst = "/kaggle/working/ket_qua/" + os.path.relpath(p, "runs").replace(os.sep, "__").replace("/", "__")
    shutil.copy(p, dst)
shutil.copy("data/manifest.json", "/kaggle/working/ket_qua/manifest.json")
json.dump({"chon_theo_dev": chosen, "chuoi_chon": chain, "bang_test": rows}, open("/kaggle/working/ket_qua/tom_tat.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
shutil.make_archive("/kaggle/working/ket_qua_live", "zip", "/kaggle/working/ket_qua")
if chosen == "luat":
    print("Không mạng nào thắng luật cũ trên dev: giữ luật, không đóng gói checkpoint.")
else:
    shutil.make_archive("/kaggle/working/ckpt_live_tot_nhat", "zip", f"runs/{chosen}_s{SEEDS[0]}/ckpt")
print(os.listdir("/kaggle/working"))
"""),
]


def nb(cells):
    return {
        "cells": [
            {"cell_type": kind, "metadata": {}, "source": src.strip("\n").splitlines(keepends=True),
             **({"outputs": [], "execution_count": None} if kind == "code" else {})}
            for kind, src in cells
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
            "kaggle": {"accelerator": "nvidiaTeslaT4", "isInternetEnabled": True},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


(HERE / "03_live_visobert.ipynb").write_text(json.dumps(nb(CELLS), ensure_ascii=False, indent=1), encoding="utf-8")
print("written 03_live_visobert.ipynb")
