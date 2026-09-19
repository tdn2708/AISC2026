"""
MÔ HÌNH ĐA NHIỆM TRÊN NỀN VISOBERT
==================================================================
Một bộ mã hóa ViSoBERT dùng chung, bốn đầu ra:

  sentiment  cảm xúc toàn câu (Positive / Negative / Neutral)
  category   danh mục Level 1 của taxonomy, cộng lớp NONE = không phải khiếu nại
  cause      nguyên nhân Level 2, mã hóa "Danh mục.NguyênNhân"
  spam       nội dung rác / quảng cáo (tầng T1 của Trust Layer)

GIẢI MÃ PHÂN CẤP: nguyên nhân chỉ được chọn TRONG danh mục đã dự đoán.
Không có chuyện mô hình trả "Giao hàng" kèm nguyên nhân "Trừ tiền hai
lần" — đó là tổ hợp vô nghĩa mà một bộ phân loại phẳng vẫn sinh ra được.

Nhãn không bắt buộc đủ cả bốn trên mỗi mẫu: UIT-ViSFD chỉ cho được nhãn
cảm xúc, tập spam chỉ cho nhãn rác. Nhãn thiếu mang giá trị IGNORE và
không đóng góp vào hàm mất mát của đầu ra tương ứng.
"""

import json
from pathlib import Path

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

HERE = Path(__file__).resolve().parent
DEFAULT_BASE = HERE.parent / "visobert"
DEFAULT_CHECKPOINT = HERE / "checkpoints" / "visobert-absa"
DEFAULT_LABELS = HERE / "labels.json"

IGNORE = -100
TASKS = ("sentiment", "category", "cause", "spam")
NONE = "NONE"


def load_labels(path=DEFAULT_LABELS):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_encoder(path):
    # Kho gốc lưu dạng XLMRobertaForMaskedLM; chỉ lấy phần mã hóa, bỏ
    # đầu MLM và không tạo lớp pooler (lớp này không có trọng số huấn luyện sẵn)
    return AutoModel.from_pretrained(str(path), add_pooling_layer=False)


def load_tokenizer(path):
    return AutoTokenizer.from_pretrained(str(path))


def mean_pool(last_hidden, attention_mask):
    mask = attention_mask.unsqueeze(-1).type_as(last_hidden)
    return (last_hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)


class ViSoBertMultiTask(nn.Module):
    def __init__(self, encoder, labels, dropout=0.1):
        super().__init__()
        self.encoder = encoder
        self.labels = labels
        hidden = encoder.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.heads = nn.ModuleDict(
            {task: nn.Linear(hidden, len(labels[task])) for task in TASKS}
        )

    def forward(self, input_ids, attention_mask):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        x = self.dropout(out.last_hidden_state[:, 0])
        return {task: head(x) for task, head in self.heads.items()}


def cause_indexes_by_category(labels):
    """Chỉ số các nguyên nhân thuộc từng danh mục, phục vụ giải mã phân cấp"""
    groups = {}
    for idx, key in enumerate(labels["cause"]):
        if key == NONE:
            continue
        cat = key.split(".", 1)[0]
        groups.setdefault(cat, []).append(idx)
    return groups


CATEGORY_THRESHOLD = 0.5
CAUSE_THRESHOLD = 0.3


@torch.no_grad()
def decode(logits, labels, trained_tasks, multi_label=False,
           cat_threshold=CATEGORY_THRESHOLD, cause_threshold=CAUSE_THRESHOLD):
    """
    Chuyển logits thành nhãn. Đầu ra chưa từng được huấn luyện thì KHÔNG
    trả về — trọng số của nó là khởi tạo ngẫu nhiên, và một nhãn ngẫu
    nhiên trông vẫn giống hệt một dự đoán thật.

    HAI CHẾ ĐỘ:
      multi_label=False  danh mục dùng softmax, mỗi câu đúng một danh mục.
      multi_label=True   danh mục và nguyên nhân dùng sigmoid độc lập, nên
                         một câu nêu ba vấn đề thì trả về đủ ba. Softmax
                         không làm được điều này về mặt cấu trúc: tổng xác
                         suất luôn bằng 1, nên danh mục thứ hai bị ép về 0.

    Dù ở chế độ nào vẫn có `category`/`cause` là danh mục CHÍNH, để tầng
    sau (bản ghi, chỉ số, bảng đánh giá) không phải đổi cách đọc.
    """
    groups = cause_indexes_by_category(labels)
    none_idx = labels["category"].index(NONE)
    soft = {t: torch.softmax(logits[t], dim=-1) for t in ("sentiment", "spam")}
    if multi_label:
        cat_p = torch.sigmoid(logits["category"])
        cause_p = torch.sigmoid(logits["cause"])
    else:
        cat_p = torch.softmax(logits["category"], dim=-1)
        cause_p = torch.softmax(logits["cause"], dim=-1)

    results = []
    for i in range(cat_p.shape[0]):
        r = {}
        if trained_tasks.get("sentiment"):
            p = soft["sentiment"][i]
            j = int(p.argmax())
            r["sentiment"] = labels["sentiment"][j]
            r["sentimentConfidence"] = round(float(p[j]), 4)

        if trained_tasks.get("category"):
            row = cat_p[i]

            def best_cause(cat):
                """
                Nguyên nhân mạnh nhất TRONG danh mục đó — không bao giờ lệch nhánh.
                Dưới ngưỡng thì vẫn trả về nguyên nhân khả dĩ nhất nhưng gắn cờ
                `uncertain`: bỏ trống là mất thông tin, còn nói rõ "chưa chắc" thì
                người dùng vẫn có manh mối để kiểm chứng.
                """
                if not trained_tasks.get("cause") or cat not in groups:
                    return {"cause": None, "p": None, "uncertain": False}
                idxs = groups[cat]
                sub = cause_p[i][idxs]
                if not multi_label:
                    sub = sub / sub.sum().clamp(min=1e-9)
                k = int(sub.argmax())
                p = float(sub[k])
                return {
                    "cause": labels["cause"][idxs[k]].split(".", 1)[1],
                    "p": round(p, 4),
                    "uncertain": bool(multi_label and p < cause_threshold)
                }

            if multi_label:
                scored = sorted(
                    ((labels["category"][j], float(row[j])) for j in range(len(row)) if j != none_idx),
                    key=lambda x: -x[1],
                )
                detected = [(c, p) for c, p in scored if p >= cat_threshold]
                none_p = float(row[none_idx])
                # Không danh mục nào vượt ngưỡng: theo lớp NONE nếu nó mạnh hơn
                if not detected and none_p >= scored[0][1]:
                    primary, primary_p = None, none_p
                else:
                    primary, primary_p = (detected[0] if detected else scored[0])
                chosen = detected if detected else ([] if primary is None else [(primary, primary_p)])
                r["categories"] = []
                for c, p in chosen:
                    bc = best_cause(c)
                    r["categories"].append({
                        "category": c, "p": round(p, 4),
                        "cause": bc["cause"], "causeConfidence": bc["p"], "causeUncertain": bc["uncertain"]
                    })
                r["category"] = primary
                r["categoryConfidence"] = round(primary_p, 4)
                r["noneProbability"] = round(none_p, 4)
                bc = best_cause(primary) if primary else {"cause": None, "p": None, "uncertain": False}
                r["cause"], r["causeConfidence"], r["causeUncertain"] = bc["cause"], bc["p"], bc["uncertain"]
            else:
                j = int(row.argmax())
                cat = labels["category"][j]
                r["category"] = None if cat == NONE else cat
                r["categoryConfidence"] = round(float(row[j]), 4)
                bc = best_cause(r["category"]) if r["category"] else {"cause": None, "p": None, "uncertain": False}
                r["cause"], r["causeConfidence"], r["causeUncertain"] = bc["cause"], bc["p"], bc["uncertain"]
                r["categories"] = [] if r["category"] is None else [{
                    "category": r["category"], "p": r["categoryConfidence"],
                    "cause": r["cause"], "causeConfidence": r["causeConfidence"], "causeUncertain": bc["uncertain"]
                }]

        if trained_tasks.get("spam"):
            spam_idx = labels["spam"].index("spam")
            r["spamProbability"] = round(float(soft["spam"][i][spam_idx]), 4)

        results.append(r)
    return results


def save_checkpoint(model, tokenizer, out_dir, meta):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(out / "encoder")
    tokenizer.save_pretrained(out / "tokenizer")
    torch.save(model.heads.state_dict(), out / "heads.pt")
    with open(out / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def load_checkpoint(path, device="cpu"):
    path = Path(path)
    with open(path / "meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    encoder = load_encoder(path / "encoder")
    tokenizer = load_tokenizer(path / "tokenizer")
    model = ViSoBertMultiTask(encoder, meta["labels"])
    state = torch.load(path / "heads.pt", map_location=device, weights_only=True)
    model.heads.load_state_dict(state)
    model.to(device).eval()
    return model, tokenizer, meta
