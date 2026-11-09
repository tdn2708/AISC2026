"""
Sinh hai notebook Kaggle từ mã nguồn đọc được (dễ review hơn sửa JSON .ipynb).
  python kaggle/make_notebooks.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


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


TEACHER = [
    ("markdown", """
# Customer Radar — mô hình thầy Qwen3 gán nhãn kho đánh giá thật

**Chuẩn bị (một lần):**
1. Trên máy: `cd backend && node scripts/teacher_io.js export` → ra `nlp_service/data/real/teacher_input.jsonl` và `taxonomy.json`.
2. Tạo Kaggle Dataset tên `customer-radar-real` chứa hai tệp đó (Add Data → Upload).
3. Notebook này: Accelerator = **GPU T4 x2**, Internet = **On**, Add Data = dataset vừa tạo.

**Chạy:** Run All. Khoảng 2–4 giờ cho ~4.000 đánh giá với Qwen3-8B (đổi `MODEL_ID` sang `Qwen/Qwen3-4B` nếu muốn nhanh gấp đôi).
Tắt giữa chừng thì chạy lại: notebook tự bỏ qua những dòng đã có trong `teacher_output.jsonl`.

**Xong:** tải `/kaggle/working/teacher_output.jsonl` về, rồi trên máy:
`node scripts/teacher_io.js import đường/dẫn/teacher_output.jsonl --model=Qwen/Qwen3-8B`

Nhãn thầy chỉ dùng để HUẤN LUYỆN (trọng số thấp hơn nhãn người), không ghi đè nhãn đang hiển thị trên web.
Văn bản đã được che thông tin cá nhân trước khi xuất.
"""),
    ("code", """
MODEL_ID = "Qwen/Qwen3-8B"      # hoặc "Qwen/Qwen3-4B" để nhanh hơn
BATCH = 8
MAX_NEW_TOKENS = 320

import glob, json, os, re, time
inp = glob.glob("/kaggle/input/**/teacher_input.jsonl", recursive=True)[0]
tax = json.load(open(glob.glob("/kaggle/input/**/taxonomy.json", recursive=True)[0], encoding="utf-8"))
OUT = "/kaggle/working/teacher_output.jsonl"
rows = [json.loads(l) for l in open(inp, encoding="utf-8") if l.strip()]
done = set()
if os.path.exists(OUT):
    done = {json.loads(l)["id"] for l in open(OUT, encoding="utf-8") if l.strip()}
todo = [r for r in rows if r["id"] not in done]
print(f"{len(rows)} đánh giá, đã có {len(done)}, còn {len(todo)}")
"""),
    ("code", """
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
tok = AutoTokenizer.from_pretrained(MODEL_ID)
tok.padding_side = "left"
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.float16, device_map="auto")
model.eval()
print("Đã nạp", MODEL_ID)
"""),
    ("code", """
TAXONOMY = "\\n".join(
    f"- {c['key']} ({c['label']}): " + " | ".join(f"{x['key']} = {x['label']}" for x in c["causes"]) for c in tax
)
CATS = {c["key"]: {x["key"] for x in c["causes"]} for c in tax}

SYSTEM = f'''Bạn gán nhãn đánh giá khách hàng tiếng Việt trên sàn thương mại điện tử.
TAXONOMY (chỉ dùng đúng các mã này):
{TAXONOMY}

Quy tắc:
- Hư hỏng do vận chuyển thuộc Delivery.DamagedInTransit, không thuộc ProductQuality.
- Chỉ ghi vấn đề khi khách PHÀN NÀN về nó. Khen thuần thì issues = [].
- MỈA MAI: người Việt hay dùng lời khen để chê ("giao nhanh ghê, 15 ngày mới tới",
  "chất lượng tuyệt vời, dùng 2 hôm là hỏng", "cảm ơn shop đã gửi nhầm màu").
  Dấu hiệu: lời khen đi cùng sự việc tiêu cực, số sao thấp mà chữ khen, "ghê", "quá trời",
  "đúng là", 🙂👏, câu hỏi tu từ. Khi mỉa mai: sentiment theo Ý THẬT, issues theo vấn đề THẬT.
- Số sao chỉ là gợi ý: 1 sao mà khen thật lòng vẫn là Positive.
- Một câu có thể nêu NHIỀU vấn đề (kể cả nhiều nguyên nhân trong cùng một nhóm): liệt kê đủ.

Trả về DUY NHẤT một JSON:
{{"sentiment": "Positive|Negative|Neutral", "sarcasm": true|false,
  "issues": [{{"category": "<mã nhóm>", "cause": "<mã nguyên nhân>"}}],
  "reason": "<một câu ngắn>"}}'''

def build(r):
    user = json.dumps({"text": r["text"], "rating": r["rating"]}, ensure_ascii=False)
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
    # Tắt chế độ "suy nghĩ" của Qwen3: chỉ cần JSON, nhanh hơn nhiều lần
    return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)

def parse(text):
    m = re.search(r"\\{.*\\}", text, re.S)
    if not m:
        return None
    try:
        o = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if o.get("sentiment") not in ("Positive", "Negative", "Neutral"):
        return None
    issues = []
    for x in o.get("issues") or []:
        c, z = (x or {}).get("category"), (x or {}).get("cause")
        if c in CATS:
            issues.append({"category": c, "cause": z if z in CATS[c] else None})
    first = issues[0] if issues else None
    return {"sentiment": o["sentiment"], "sarcasm": o.get("sarcasm") is True, "issues": issues,
            "category": first["category"] if first else "Other", "subCategory": first["cause"] if first else None,
            "reason": str(o.get("reason") or "")[:300]}
"""),
    ("code", """
started, bad = time.time(), 0
with open(OUT, "a", encoding="utf-8") as f:
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        enc = tok([build(r) for r in part], return_tensors="pt", padding=True).to(model.device)
        with torch.no_grad():
            gen = model.generate(**enc, max_new_tokens=MAX_NEW_TOKENS, do_sample=False, pad_token_id=tok.eos_token_id)
        outs = tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
        for r, o in zip(part, outs):
            lab = parse(o)
            if lab is None:
                bad += 1
                continue
            f.write(json.dumps({"id": r["id"], **lab}, ensure_ascii=False) + "\\n")
        f.flush()
        n = i + len(part)
        if n % (BATCH * 10) == 0 or n == len(todo):
            el = time.time() - started
            print(f"{n}/{len(todo)} | {el/60:.1f} phút | còn ~{el/n*(len(todo)-n)/60:.0f} phút | hỏng {bad}", flush=True)
print("Xong. Dòng không đọc được JSON:", bad)
"""),
    ("code", """
# Kiểm tra nhanh: phân bố nhãn, số câu mỉa mai, và độ lệch với số sao
out = [json.loads(l) for l in open(OUT, encoding="utf-8") if l.strip()]
by_id = {r["id"]: r for r in rows}
from collections import Counter
print("Cảm xúc:", Counter(o["sentiment"] for o in out))
print("Mỉa mai:", sum(o["sarcasm"] for o in out), "/", len(out))
low_pos = [o for o in out if (by_id[o["id"]]["rating"] or 3) <= 2 and o["sentiment"] == "Positive"]
print("1–2 sao mà thầy gán Tích cực:", len(low_pos))
for o in [o for o in out if o["sarcasm"]][:8]:
    print("-", by_id[o["id"]]["rating"], "sao |", by_id[o["id"]]["text"][:100], "=>", o["sentiment"], o["issues"])
"""),
]

TRAIN = [
    ("markdown", """
# Customer Radar — huấn luyện ViSoBERT v4 (mỉa mai + số sao + nhiều nguyên nhân)

**Chuẩn bị:**
1. Trên máy (sau khi đã nhập nhãn thầy và đội đã duyệt đủ trên trang Kiểm tra):
   `cd backend && node scripts/export_training_data.js`
   → `nlp_service/data/real/{train,dev,test}.jsonl` + `manifest.json`.
2. Tạo Kaggle Dataset `customer-radar-v4` chứa **thư mục `nlp_service/`** (mã nguồn + `labels.json` + `data/`),
   KHÔNG cần thư mục `checkpoints/` hay `.venv/`.
3. Notebook: GPU T4 (một GPU là đủ), Internet On, Add Data = dataset vừa tạo.

**Đầu ra** trong `/kaggle/working/`: `ckpt-v4/` (checkpoint PyTorch), `onnx-v4/` (bản ONNX int8 cho trình duyệt),
`test_report.json` (con số đo trên test mù — đây là con số được phép báo cáo).

Bộ test mù không bao giờ vào train/dev: `--exclude data/real/test.jsonl` còn loại thêm mọi câu trùng nội dung.
"""),
    ("code", """
import glob, os, shutil, subprocess, json
src = os.path.dirname(glob.glob("/kaggle/input/**/nlp_service/train.py", recursive=True)[0])
shutil.copytree(src, "/kaggle/working/nlp_service", dirs_exist_ok=True)
os.chdir("/kaggle/working/nlp_service")
print(open("data/real/manifest.json", encoding="utf-8").read())
"""),
    ("code", """
# Trọng số gốc ViSoBERT (giấy phép: nhóm đã xin phép tác giả — xem nlp_service/README.md)
from huggingface_hub import snapshot_download
base = snapshot_download("uitnlp/visobert", local_dir="/kaggle/working/visobert")
print(base)
"""),
    ("code", """
# Trộn: nhãn thật (người + thầy, có số sao) + dữ liệu chuyên ngành cũ + UIT-ViSFD (chỉ cảm xúc)
train_files = ["data/real/train.jsonl"] + [p for p in ["data/domain_train.jsonl", "data/visfd_train.jsonl"] if os.path.exists(p)]
dev = "data/real/dev.jsonl" if sum(1 for _ in open("data/real/dev.jsonl", encoding="utf-8")) >= 50 else "data/gold_dev.jsonl"
cmd = ["python", "train.py", "--train", *train_files, "--dev", dev, "--exclude", "data/real/test.jsonl",
       "--base", "/kaggle/working/visobert", "--out", "/kaggle/working/ckpt-v4",
       "--epochs", "4", "--batch-size", "32", "--max-len", "160"]
print(" ".join(cmd))
subprocess.run(cmd, check=True)
"""),
    ("code", """
# Con số được phép báo cáo: đo trên TEST MÙ (nhãn người, chưa từng thấy khi huấn luyện)
subprocess.run(["python", "eval_real.py", "--checkpoint", "/kaggle/working/ckpt-v4",
                "--test", "data/real/test.jsonl", "--out", "/kaggle/working/test_report.json"], check=True)
"""),
    ("code", """
# Bản ONNX int8 (~98 MB) cho trình duyệt; đầu ra có thêm sarcasm_logits
subprocess.run(["pip", "install", "-q", "onnx", "onnxruntime"], check=True)
subprocess.run(["python", "deploy/export_onnx.py", "--checkpoint", "/kaggle/working/ckpt-v4", "--out", "/kaggle/working/onnx-v4"], check=True)
shutil.make_archive("/kaggle/working/ckpt-v4", "zip", "/kaggle/working/ckpt-v4")
shutil.make_archive("/kaggle/working/onnx-v4", "zip", "/kaggle/working/onnx-v4")
print(os.listdir("/kaggle/working"))
"""),
]

for name, cells in (("01_teacher_qwen3.ipynb", TEACHER), ("02_train_visobert_v4.ipynb", TRAIN)):
    (HERE / name).write_text(json.dumps(nb(cells), ensure_ascii=False, indent=1), encoding="utf-8")
    print("written", name)
