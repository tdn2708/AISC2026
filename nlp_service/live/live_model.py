"""
Mô hình đa nhiệm cho bình luận livestream: một bộ mã hoá dùng chung, bốn đầu ra.

  intent       softmax 9 lớp  (ORDER, QUESTION, ...)
  aspects      sigmoid 11     (đa nhãn: PRICE, VARIANT, ...)
  sentiment    softmax 3      (POS / NEU / NEG)
  needs_reply  sigmoid 1      (người bán có nên trả lời không)

Tách riêng với visobert_model.py (mô hình phản hồi sau mua) để không ảnh hưởng bản đang chạy.
Bộ mã hoá đổi được: ViSoBERT, ViSoBERT sau DAPT, CafeBERT, BamiBERT... (tham số --base).
"""
import json
from pathlib import Path

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer


def load_encoder(path):
    try:
        # ViSoBERT/XLM-R lưu kèm đầu MLM; chỉ lấy phần mã hoá, không tạo pooler chưa huấn luyện
        return AutoModel.from_pretrained(str(path), add_pooling_layer=False)
    except TypeError:
        return AutoModel.from_pretrained(str(path))


class LiveMultiTask(nn.Module):
    def __init__(self, encoder, labels, dropout=0.1):
        super().__init__()
        self.encoder = encoder
        self.labels = labels
        h = encoder.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.heads = nn.ModuleDict({
            "intent": nn.Linear(h, len(labels["intent"])),
            "aspects": nn.Linear(h, len(labels["aspects"])),
            "sentiment": nn.Linear(h, len(labels["sentiment"])),
            "needs_reply": nn.Linear(h, 1),
        })

    def forward(self, input_ids, attention_mask):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        x = self.dropout(out.last_hidden_state[:, 0])
        o = {k: head(x) for k, head in self.heads.items()}
        o["needs_reply"] = o["needs_reply"].squeeze(-1)
        return o


def save_checkpoint(model, tokenizer, out, meta):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(out / "encoder")
    tokenizer.save_pretrained(out / "encoder")
    torch.save(model.heads.state_dict(), out / "heads.pt")
    (out / "meta.json").write_text(json.dumps({**meta, "labels": model.labels}, ensure_ascii=False, indent=1),
                                   encoding="utf-8")


def load_checkpoint(path, device="cpu"):
    path = Path(path)
    meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
    model = LiveMultiTask(load_encoder(path / "encoder"), meta["labels"])
    model.heads.load_state_dict(torch.load(path / "heads.pt", map_location=device))
    tok = AutoTokenizer.from_pretrained(str(path / "encoder"))
    return model.to(device).eval(), tok, meta
