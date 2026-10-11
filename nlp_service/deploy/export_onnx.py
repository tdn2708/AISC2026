"""
XUẤT VISOBERT TINH CHỈNH SANG ONNX ĐỂ CHẠY TRONG TRÌNH DUYỆT
==================================================================
Chạy:  .venv/Scripts/python.exe deploy/export_onnx.py

Đầu ra (thư mục deploy/onnx/, đã nằm ngoài git):
  model.onnx          độ chính xác đầy đủ (fp32) — chỉ để đối chiếu
  model_int8.onnx     nén int8 động — bản dùng trên web
  tokenizer.json, tokenizer_config.json, special_tokens_map.json, meta.json

Đồ thị nhận input_ids + attention_mask, trả bốn mảng logits theo đúng thứ tự
TASKS (sentiment, category, cause, spam). Phần giải mã nhãn (ngưỡng, hiệu
chỉnh, giải mã phân cấp) giữ nguyên ở phía JavaScript, chép từ decode().
"""

import shutil
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from visobert_model import DEFAULT_CHECKPOINT, TASKS, load_checkpoint  # noqa: E402

OUT = Path(__file__).resolve().parent / "onnx"


class Exportable(torch.nn.Module):
    """Bọc mô hình để trả tuple thay cho dict — ONNX cần đầu ra có thứ tự"""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        out = self.model(input_ids, attention_mask)
        return tuple(out[t] for t in TASKS)


def main():
    OUT.mkdir(exist_ok=True)
    model, tok, meta = load_checkpoint(DEFAULT_CHECKPOINT, "cpu")
    model.eval()
    wrapped = Exportable(model).eval()

    sample = tok(["giao hàng chậm quá", "sản phẩm tốt"], padding=True, return_tensors="pt")
    fp32 = OUT / "model.onnx"
    torch.onnx.export(
        wrapped,
        (sample["input_ids"], sample["attention_mask"]),
        str(fp32),
        input_names=["input_ids", "attention_mask"],
        output_names=[f"{t}_logits" for t in TASKS],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            **{f"{t}_logits": {0: "batch"} for t in TASKS},
        },
        opset_version=17,
        dynamo=False,
    )
    print(f"fp32: {fp32.stat().st_size / 1e6:.1f} MB")

    int8 = OUT / "model_int8.onnx"
    # Nén theo từng kênh: đo trên tập kiểm tra + dev, kết quả trùng khớp 100%
    # với mô hình gốc (80/80 câu); nén theo cả tensor lệch 1 câu kiểm tra
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8, per_channel=True)
    print(f"int8: {int8.stat().st_size / 1e6:.1f} MB")

    for f in ("tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"):
        shutil.copy(DEFAULT_CHECKPOINT / "tokenizer" / f, OUT / f)
    shutil.copy(DEFAULT_CHECKPOINT / "meta.json", OUT / "meta.json")
    print(f"Xong: {OUT}")


if __name__ == "__main__":
    main()
