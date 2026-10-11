"""
TẢI MÔ HÌNH ONNX LÊN KHO MÔ HÌNH HUGGING FACE (miễn phí)
==================================================================
Chạy sau export_onnx.py:  .venv/Scripts/python.exe deploy/push_onnx.py

Đọc HF_TOKEN và HF_ONNX_REPO (mặc định <tài khoản>/customer-radar-visobert-onnx)
từ nlp_service/.env. Trang web tải mô hình từ đây và chạy ngay trong trình
duyệt — không cần máy chủ mô hình (Space Docker giờ phải trả phí).
"""

import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from huggingface_hub import HfApi

HERE = Path(__file__).resolve().parent
ONNX_DIR = HERE / "onnx"
ENV_FILE = HERE.parent / ".env"
FILES = ["model_int8.onnx", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "meta.json"]

CARD = """---
language: vi
library_name: onnx
tags: [vietnamese, absa, sentiment-analysis, customer-feedback, onnx]
base_model: uitnlp/visobert
---

# Customer Radar — ViSoBERT ABSA (ONNX int8)

ViSoBERT (Nguyen và cs., EMNLP 2023) tinh chỉnh đa nhiệm cho phản hồi khách hàng
thương mại điện tử tiếng Việt: cảm xúc, danh mục vấn đề (đa nhãn), nguyên nhân
gốc theo phân cấp, xác suất rác. Bản ONNX nén int8 theo từng kênh (~98 MB) để
chạy trong trình duyệt bằng onnxruntime-web; đo trên tập kiểm tra và tập dev,
dự đoán trùng khớp 100% với mô hình PyTorch gốc (80/80 câu).

Đầu vào: `input_ids`, `attention_mask` (tokenizer đi kèm). Đầu ra: logits của
`sentiment`, `category`, `cause`, `spam`; giải mã nhãn theo `meta.json`.

Đội LDS — Trường ĐH Công nghệ Thông tin, ĐHQG-HCM.
"""


def read_env():
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main():
    env = read_env()
    api = HfApi(token=env["HF_TOKEN"])
    user = api.whoami()["name"]
    repo = env.get("HF_ONNX_REPO") or f"{user}/customer-radar-visobert-onnx"
    missing = [f for f in FILES if not (ONNX_DIR / f).exists()]
    if missing:
        sys.exit(f"Thiếu {missing} — chạy export_onnx.py trước")

    api.create_repo(repo, repo_type="model", private=False, exist_ok=True)
    (ONNX_DIR / "README.md").write_text(CARD, encoding="utf-8")
    print(f"Đang tải lên {repo} (~98 MB)...")
    api.upload_folder(
        repo_id=repo, repo_type="model", folder_path=str(ONNX_DIR),
        allow_patterns=FILES + ["README.md"], commit_message="Mô hình ONNX int8 cho Customer Radar",
    )
    print(f"XONG: https://huggingface.co/{repo}")
    print(f"Tệp mô hình: https://huggingface.co/{repo}/resolve/main/model_int8.onnx")


if __name__ == "__main__":
    main()
