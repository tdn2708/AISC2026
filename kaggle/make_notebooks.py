"""
Sinh các notebook Kaggle từ mã nguồn đọc được (dễ review hơn sửa JSON .ipynb).
  python kaggle/make_notebooks.py

Sinh ra:
  - kaggle/01_teacher_qwen3.ipynb        (nhãn thầy Qwen3 v5: L1 + L2 + L3 gia_dung, chạy 2 lần nhiệt độ khác nhau)
  - kaggle/02_train_visobert_v4.ipynb    (giữ tương thích quy trình v4 cũ)
  - kaggle/02_train_visobert_v5.ipynb    (huấn luyện ViSoBERT v5 + calibrate dev + eval_real bootstrap theo sản phẩm + ONNX int8)
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
# Customer Radar — mô hình thầy Qwen3 gán nhãn v5 (L1 + L2 + L3 gia dụng, kiểm 2 lượt)

**Chuẩn bị (một lần trên máy):**
1. Xuất dữ liệu đã che PII kèm loại hàng và taxonomy L3:
   `cd backend && node scripts/teacher_io.js export --dbs=customer_radar_real,cr_t_6b063cbc5122d551a58f9737`
   → ra `nlp_service/data/real/teacher_input.jsonl` và `taxonomy.json`.
2. Tạo Kaggle Dataset tên `customer-radar-real` chứa hai tệp đó.
3. Notebook này: Accelerator = **GPU T4 x2**, Internet = **On**, Add Data = dataset vừa tạo.

**Quy trình 2 lượt kiểm nhất quán (mục 3.4 kế hoạch v5):**
- Lượt 1: `do_sample=False` (nhiệt độ 0).
- Lượt 2: `do_sample=True, temperature=0.35, top_p=0.9`.
- Chỉ các câu hai lượt **trùng tập L2** mới mang `agreed: true` để vào tập huấn luyện (trọng số 0,5). Câu bất đồng ghi `agreed: false` để bỏ khỏi train hoặc chuyển hàng đợi duyệt.

**Xong:** tải `/kaggle/working/teacher_output.jsonl` về máy, rồi chạy:
`cd backend && node scripts/teacher_io.js import đường/dẫn/teacher_output.jsonl --model=Qwen/Qwen3-8B`
"""),
    ("code", """
MODEL_ID = "Qwen/Qwen3-8B"      # hoặc "Qwen/Qwen3-4B" để nhanh hơn
BATCH = 8
MAX_NEW_TOKENS = 360
PASS2_TEMP = 0.35

import glob, json, os, re, time
inp = glob.glob("/kaggle/input/**/teacher_input.jsonl", recursive=True)[0]
raw_tax = json.load(open(glob.glob("/kaggle/input/**/taxonomy.json", recursive=True)[0], encoding="utf-8"))
tax_cats = raw_tax["categories"] if isinstance(raw_tax, dict) else raw_tax
root_pack = (raw_tax.get("rootPacks") or {}).get("gia_dung", []) if isinstance(raw_tax, dict) else []

OUT = "/kaggle/working/teacher_output.jsonl"
rows = [json.loads(l) for l in open(inp, encoding="utf-8") if l.strip()]
done = set()
if os.path.exists(OUT):
    done = {json.loads(l)["id"] for l in open(OUT, encoding="utf-8") if l.strip()}
todo = [r for r in rows if r["id"] not in done]
print(f"{len(rows)} đánh giá, đã có {len(done)}, còn {len(todo)} | số khóa L3 gia_dung: {len(root_pack)}")
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
    f"- {c['key']} ({c['label']}): " + " | ".join(f"{x['key']} = {x['label']}" for x in c["causes"]) for c in tax_cats
)
CATS = {c["key"]: {x["key"] for x in c["causes"]} for c in tax_cats}
ROOTS_MAP = {r["key"]: (r["parentCategory"], r["parentCause"]) for r in root_pack}
TIMINGS = {"ON_ARRIVAL", "EARLY", "LATER", "UNKNOWN"}
ROOT_LIST = "\\n".join(
    f"- {r['key']} [{r['parentCategory']}.{r['parentCause']}]: {r['label']}. {r.get('description', '')}"
    + (f" Không phải: {r['notThis']}" if r.get('notThis') else "")
    for r in root_pack
)

SYSTEM = f'''Bạn gán nhãn đánh giá khách hàng tiếng Việt trên sàn thương mại điện tử (trọng tâm đồ gia dụng).

TAXONOMY CẤP 1 & 2 (chỉ dùng đúng các mã này):
{TAXONOMY}

NGUYÊN NHÂN GỐC RỄ CẤP 3 CHO ĐỒ GIA DỤNG (đa nhãn `root_causes`, chỉ dùng đúng mã sau):
{ROOT_LIST}

Quy tắc:
- Hư hỏng do vận chuyển thuộc Delivery.DamagedInTransit (L3: TRANSIT_DENT), không thuộc ProductQuality.
- Chỉ ghi vấn đề khi khách PHÀN NÀN về nó. Khen thuần thì issues = [] và root_causes = [].
- Nếu L2 không thuộc các L2 cha có trong danh sách L3 (ví dụ giao chậm, thanh toán, đổi trả...) thì để root_causes = [], không ép vào mã gần giống.
- MỈA MAI: khen ngoài miệng kèm sự việc tiêu cực hoặc sao thấp mà chữ khen -> sentiment theo Ý THẬT, issues và root_causes theo lỗi THẬT.
- Một câu có thể nêu nhiều lỗi cùng lúc: liệt kê đủ issues và root_causes.
- Khách chê lỗi máy mà không nói lỗi gì cụ thể thì dùng OTHER_DEFECT.
- Khi có root_causes, ghi `failure_timing`: ON_ARRIVAL (ngay khi nhận hoặc lần dùng đầu), EARLY (sau vài lần dùng, dưới khoảng 1 tháng), LATER (từ khoảng 1 tháng trở lên), UNKNOWN (câu không nói). Không có root_causes thì null.

Trả về DUY NHẤT một JSON:
{{"sentiment": "Positive|Negative|Neutral", "sarcasm": true|false,
  "issues": [{{"category": "<mã L1>", "cause": "<mã L2>"}}],
  "root_causes": ["<mã L3>"], "failure_timing": "ON_ARRIVAL|EARLY|LATER|UNKNOWN|null",
  "reason": "<một câu ngắn>"}}'''

def build(r):
    payload = {"text": r["text"], "rating": r.get("rating")}
    if r.get("productType"):
        payload["productType"] = r["productType"]
    user = json.dumps(payload, ensure_ascii=False)
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
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
    raw_roots = o.get("root_causes") or o.get("rootCauses") or []
    roots = []
    for rk in raw_roots:
        rk_s = str(rk or "").strip().upper()
        if rk_s in ROOTS_MAP and rk_s not in roots:
            roots.append(rk_s)
    if not issues:
        roots = []
    timing = str(o.get("failure_timing") or o.get("failureTiming") or "").strip().upper()
    timing = timing if roots and timing in TIMINGS else None
    first = issues[0] if issues else None
    return {
        "sentiment": o["sentiment"],
        "sarcasm": o.get("sarcasm") is True,
        "issues": issues,
        "category": first["category"] if first else "Other",
        "subCategory": first["cause"] if first else None,
        "rootCauses": roots,
        "failureTiming": timing,
        "reason": str(o.get("reason") or "")[:300],
    }

def l2_set(lab):
    return {(x["category"], x["cause"]) for x in (lab.get("issues") or [])}
"""),
    ("code", """
started, bad, agreed_n, disagreed_n = time.time(), 0, 0, 0
with open(OUT, "a", encoding="utf-8") as f:
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        prompts = [build(r) for r in part]
        enc = tok(prompts, return_tensors="pt", padding=True).to(model.device)
        in_len = enc["input_ids"].shape[1]
        with torch.no_grad():
            g1 = model.generate(**enc, max_new_tokens=MAX_NEW_TOKENS, do_sample=False, pad_token_id=tok.eos_token_id)
            g2 = model.generate(**enc, max_new_tokens=MAX_NEW_TOKENS, do_sample=True, temperature=PASS2_TEMP, top_p=0.9, pad_token_id=tok.eos_token_id)
        outs1 = tok.batch_decode(g1[:, in_len:], skip_special_tokens=True)
        outs2 = tok.batch_decode(g2[:, in_len:], skip_special_tokens=True)
        for r, o1, o2 in zip(part, outs1, outs2):
            lab1, lab2 = parse(o1), parse(o2)
            if lab1 is None:
                bad += 1
                continue
            same_l2 = lab2 is not None and l2_set(lab1) == l2_set(lab2)
            if same_l2:
                agreed_n += 1
                # Giữ các L3 hai lượt cùng đồng ý (nếu giao rỗng thì giữ lượt 1 khi lượt 1 có)
                inter_r = [k for k in lab1["rootCauses"] if k in set(lab2["rootCauses"])]
                roots_final = inter_r if inter_r else lab1["rootCauses"]
                # Hai lượt khác nhau về lúc phát hiện thì ghi UNKNOWN, không đoán
                if lab1["failureTiming"] and lab2["failureTiming"] and lab1["failureTiming"] != lab2["failureTiming"]:
                    lab1 = {**lab1, "failureTiming": "UNKNOWN"}
            else:
                disagreed_n += 1
                roots_final = lab1["rootCauses"]
            rec = {
                "id": r["id"],
                "sourceDb": r.get("sourceDb"),
                **lab1,
                "rootCauses": roots_final,
                "agreed": same_l2,
                **({} if same_l2 or not lab2 else {"pass2Issues": lab2["issues"]}),
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\\n")
        f.flush()
        n = i + len(part)
        if n % (BATCH * 10) == 0 or n == len(todo):
            el = time.time() - started
            rate = agreed_n / max(1, agreed_n + disagreed_n) * 100
            print(f"{n}/{len(todo)} | {el/60:.1f} phút | trùng L2: {rate:.1f}% | hỏng {bad}", flush=True)
print(f"Xong. Trùng 2 lượt L2: {agreed_n}/{agreed_n + disagreed_n} ({agreed_n/max(1, agreed_n+disagreed_n)*100:.1f}%), hỏng JSON: {bad}")
"""),
    ("code", """
# Kiểm tra nhanh phân bố nhãn, tỉ lệ trùng 2 lượt và top L3
from collections import Counter
out = [json.loads(l) for l in open(OUT, encoding="utf-8") if l.strip()]
agreed = [o for o in out if o.get("agreed", True)]
print(f"Tổng: {len(out)} | trùng 2 lượt L2: {len(agreed)} ({len(agreed)/max(1,len(out))*100:.1f}%)")
print("Cảm xúc:", Counter(o["sentiment"] for o in agreed))
print("Mỉa mai:", sum(o.get("sarcasm", False) for o in agreed), "/", len(agreed))
rc = Counter(k for o in agreed for k in (o.get("rootCauses") or []))
print("Top L3 gia_dung:", rc.most_common(18))
"""),
]

TRAIN_V4 = [
    ("markdown", """
# Customer Radar — huấn luyện ViSoBERT v4 (mỉa mai + số sao + nhiều nguyên nhân)

Giữ lại cho tương thích v4. Với bản v5 có nguyên nhân gốc rễ cấp 3 (L3 `gia_dung`), dùng `02_train_visobert_v5.ipynb`.
"""),
    ("code", """
import glob, os, shutil, subprocess
src = os.path.dirname(glob.glob("/kaggle/input/**/nlp_service/train.py", recursive=True)[0])
shutil.copytree(src, "/kaggle/working/nlp_service", dirs_exist_ok=True)
os.chdir("/kaggle/working/nlp_service")
print(open("data/real/manifest.json", encoding="utf-8").read())
"""),
    ("code", """
from huggingface_hub import snapshot_download
base = snapshot_download("uitnlp/visobert", local_dir="/kaggle/working/visobert")
print(base)
"""),
    ("code", """
train_files = ["data/real/train.jsonl"] + [p for p in ["data/domain_train.jsonl", "data/visfd_train.jsonl"] if os.path.exists(p)]
dev = "data/real/dev.jsonl" if sum(1 for _ in open("data/real/dev.jsonl", encoding="utf-8")) >= 50 else "data/gold_dev.jsonl"
cmd = ["python", "train.py", "--train", *train_files, "--dev", dev, "--exclude", "data/real/test.jsonl",
       "--base", "/kaggle/working/visobert", "--out", "/kaggle/working/ckpt-v4",
       "--epochs", "4", "--batch-size", "32", "--max-len", "160"]
subprocess.run(cmd, check=True)
"""),
    ("code", """
subprocess.run(["python", "eval_real.py", "--checkpoint", "/kaggle/working/ckpt-v4",
                "--test", "data/real/test.jsonl", "--out", "/kaggle/working/test_report.json"], check=True)
"""),
    ("code", """
subprocess.run(["pip", "install", "-q", "onnx", "onnxruntime"], check=True)
subprocess.run(["python", "deploy/export_onnx.py", "--checkpoint", "/kaggle/working/ckpt-v4", "--out", "/kaggle/working/onnx-v4"], check=True)
shutil.make_archive("/kaggle/working/ckpt-v4", "zip", "/kaggle/working/ckpt-v4")
shutil.make_archive("/kaggle/working/onnx-v4", "zip", "/kaggle/working/onnx-v4")
print(os.listdir("/kaggle/working"))
"""),
]

TRAIN_V5 = [
    ("markdown", """
# Customer Radar — huấn luyện ViSoBERT v5 (L3 gốc rễ gia dụng + loại hàng + số sao)

**Chuẩn bị trên máy:**
1. Chạy `cd backend && npm run nlp:prepare` để cập nhật `nlp_service/labels.json` có đầu `root` (19 mã L3 `gia_dung`).
2. Xuất bộ huấn luyện chống rò rỉ theo sản phẩm & Jaccard >= 0,8:
   `cd backend && node scripts/export_training_data.js --dbs=customer_radar_real,cr_t_6b063cbc5122d551a58f9737`
   → `nlp_service/data/real/{train,dev,test}.jsonl` + `manifest.json`.
3. Tạo Kaggle Dataset `customer-radar-v5` chứa thư mục `nlp_service/` (mã nguồn + `labels.json` + `data/`; KHÔNG đưa `checkpoints/` hay `.venv/`).
4. Notebook: GPU T4, Internet On, Add Data = `customer-radar-v5`.

**Đầu ra `/kaggle/working/`:**
- `ckpt-v5.zip`: checkpoint PyTorch v5 đã hiệu chỉnh ngưỡng `rootThresholds` trên dev.
- `onnx-v5.zip`: bản ONNX INT8 (chạy trình duyệt & Hugging Face Space CPU).
- `test_report_v5.json`: **con số được phép báo cáo** trên gold test (kèm L2/L3 macro-F1, từng lớp L3, ma trận nhầm, tỉ lệ hành động được, KTC 95% bootstrap theo sản phẩm).
"""),
    ("code", """
import glob, os, shutil, subprocess, json
src = os.path.dirname(glob.glob("/kaggle/input/**/nlp_service/train.py", recursive=True)[0])
shutil.copytree(src, "/kaggle/working/nlp_service", dirs_exist_ok=True)
os.chdir("/kaggle/working/nlp_service")
print(open("data/real/manifest.json", encoding="utf-8").read())
"""),
    ("code", """
# Trọng số gốc ViSoBERT (đã xin phép tác giả — trích dẫn Nguyen và cs., EMNLP 2023)
from huggingface_hub import snapshot_download
base = snapshot_download("uitnlp/visobert", local_dir="/kaggle/working/visobert")
print("Base:", base)
"""),
    ("code", """
# Huấn luyện v5: nhãn người (1,0) + thầy Qwen3 trùng 2 lượt (0,5) + Claude (0,5); đầu vào [N sao] [loại hàng] văn bản
train_files = ["data/real/train.jsonl"] + [p for p in ["data/visfd_train.jsonl"] if os.path.exists(p)]
dev = "data/real/dev.jsonl"
cmd = [
    "python", "train.py",
    "--train", *train_files,
    "--dev", dev,
    "--exclude", "data/real/test.jsonl",
    "--base", "/kaggle/working/visobert",
    "--out", "/kaggle/working/ckpt-v5",
    "--epochs", "5",
    "--batch-size", "32",
    "--max-len", "160",
]
print(" ".join(cmd))
subprocess.run(cmd, check=True)
"""),
    ("code", """
# Hiệu chỉnh nhiệt độ và ngưỡng từng lớp L1/L2/L3 trên tập dev (KHÔNG đụng test)
subprocess.run([
    "python", "calibrate.py",
    "--checkpoint", "/kaggle/working/ckpt-v5",
    "--dev", "data/real/dev.jsonl",
], check=True)
"""),
    ("code", """
# Đánh giá cuối cùng trên GOLD TEST giữ riêng (KTC 95% bootstrap theo sản phẩm)
subprocess.run([
    "python", "eval_real.py",
    "--checkpoint", "/kaggle/working/ckpt-v5",
    "--test", "data/real/test.jsonl",
    "--out", "/kaggle/working/test_report_v5.json",
], check=True)
"""),
    ("code", """
# Xuất ONNX FP32 + INT8 (~98 MB) và đóng gói tải về
subprocess.run(["pip", "install", "-q", "onnx", "onnxruntime"], check=True)
subprocess.run([
    "python", "deploy/export_onnx.py",
    "--checkpoint", "/kaggle/working/ckpt-v5",
    "--out", "/kaggle/working/onnx-v5",
], check=True)
shutil.make_archive("/kaggle/working/ckpt-v5", "zip", "/kaggle/working/ckpt-v5")
shutil.make_archive("/kaggle/working/onnx-v5", "zip", "/kaggle/working/onnx-v5")
print("Tệp đầu ra:", sorted(os.listdir("/kaggle/working")))
"""),
]

for name, cells in (
    ("01_teacher_qwen3.ipynb", TEACHER),
    ("02_train_visobert_v4.ipynb", TRAIN_V4),
    ("02_train_visobert_v5.ipynb", TRAIN_V5),
):
    (HERE / name).write_text(json.dumps(nb(cells), ensure_ascii=False, indent=1), encoding="utf-8")
    print("written", name)
