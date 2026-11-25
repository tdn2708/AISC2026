"""
MÔ HÌNH ĐA NHIỆM TRÊN NỀN VISOBERT (v5: thêm nguyên nhân gốc rễ cấp 3)
==================================================================
Một bộ mã hóa ViSoBERT dùng chung, tối đa sáu đầu ra:

  sentiment  cảm xúc toàn câu (Positive / Negative / Neutral)
  category   danh mục Level 1 của taxonomy, cộng lớp NONE = không phải khiếu nại
  cause      nguyên nhân Level 2, mã hóa "Danh mục.NguyênNhân"
  spam       nội dung rác / quảng cáo (tầng T1 của Trust Layer)
  sarcasm    câu mỉa mai (literal / sarcastic) — từ bản v4
  root       nguyên nhân gốc rễ cấp 3 (gói gia_dung, sigmoid đa nhãn) — từ bản v5

Số đầu ra lấy theo labels của checkpoint: checkpoint cũ (không có `sarcasm`
hoặc không có `root`) vẫn nạp và chạy được y như trước.

GIẢI MÃ PHÂN CẤP (L1 -> L2 -> L3):
  - L2 chỉ được chọn TRONG L1 đã dự đoán.
  - L3 chỉ giữ những khóa có L2 cha nằm trong các nguyên nhân dự đoán (hoặc có
    xác suất L2 cha >= ngưỡng); nếu L2 trống mà L3 vượt ngưỡng thì L3 kéo theo
    L2 cha (và L1 cha nếu cần).

Ba nơi giải mã phải khớp nhau từng kết quả:
  1. nlp_service/visobert_model.py::decode
  2. nlp_service/service.py::explain_from_logits (/explain)
  3. src/lib/visobertBrowser.js::decodeOne
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
TASKS = ("sentiment", "category", "cause", "spam", "sarcasm", "root")
# Các đầu ra phân loại một nhãn (softmax); category/cause/root là đa nhãn (sigmoid)
SINGLE_LABEL_TASKS = ("sentiment", "spam", "sarcasm")
MULTI_LABEL_TASKS = ("category", "cause", "root")
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
        # Chỉ tạo đầu ra có trong labels: checkpoint cũ không có "sarcasm"/"root" vẫn nạp được
        self.tasks = [t for t in TASKS if t in labels]
        self.heads = nn.ModuleDict(
            {task: nn.Linear(hidden, len(labels[task])) for task in self.tasks}
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


def root_parent_map(labels):
    """Ánh xạ mỗi mã L3 -> (parentCategory, parentCause) từ labels['rootParents']"""
    raw = labels.get("rootParents") or {}
    out = {}
    for k, val in raw.items():
        if isinstance(val, str) and "." in val:
            cat, cz = val.split(".", 1)
            out[k] = (cat, cz)
    return out


CATEGORY_THRESHOLD = 0.5
CAUSE_THRESHOLD = 0.3
ROOT_THRESHOLD = 0.4


@torch.no_grad()
def decode(logits, labels, trained_tasks, multi_label=False,
           cat_threshold=CATEGORY_THRESHOLD, cause_threshold=CAUSE_THRESHOLD,
           root_threshold=ROOT_THRESHOLD, calibration=None):
    """
    Chuyển logits thành nhãn. Đầu ra chưa từng được huấn luyện thì KHÔNG
    trả về — trọng số của nó là khởi tạo ngẫu nhiên.

    Hỗ trợ đầy đủ giải mã phân cấp L1 -> L2 -> L3 (v5) và giữ nguyên hành vi
    100% cho checkpoint v4 trở về trước (không có đầu `root`).
    """
    groups = cause_indexes_by_category(labels)
    none_idx = labels["category"].index(NONE)
    r_parents = root_parent_map(labels)

    cal = calibration or {}
    cat_thresholds = cal.get("categoryThresholds") or {}
    cause_threshold = cal.get("causeThreshold", cause_threshold)
    root_thresholds = cal.get("rootThresholds") or {}
    root_threshold = cal.get("rootThreshold", root_threshold)

    soft = {
        t: torch.softmax(logits[t] / float(cal.get(f"{t}Temperature", 1.0) or 1.0), dim=-1)
        for t in SINGLE_LABEL_TASKS if t in logits
    }
    if multi_label:
        cat_p = torch.sigmoid(logits["category"])
        cause_p = torch.sigmoid(logits["cause"])
    else:
        cat_p = torch.softmax(logits["category"], dim=-1)
        cause_p = torch.softmax(logits["cause"], dim=-1)

    has_root = bool(trained_tasks.get("root") and "root" in logits and "root" in labels)
    root_p = torch.sigmoid(logits["root"]) if has_root else None
    cause_idx_map = {key: idx for idx, key in enumerate(labels["cause"])} if "cause" in labels else {}

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
                if not trained_tasks.get("cause") or cat not in groups:
                    return {"cause": None, "p": None, "uncertain": False, "causes": []}
                idxs = groups[cat]
                sub = cause_p[i][idxs]
                if not multi_label:
                    sub = sub / sub.sum().clamp(min=1e-9)
                k = int(sub.argmax())
                p_best = float(sub[k])
                causes = []
                if multi_label:
                    order = sorted(range(len(idxs)), key=lambda j: -float(sub[j]))
                    causes = [
                        {"cause": labels["cause"][idxs[j]].split(".", 1)[1], "p": round(float(sub[j]), 4)}
                        for j in order if float(sub[j]) >= cause_threshold
                    ]
                if not causes:
                    causes = [{"cause": labels["cause"][idxs[k]].split(".", 1)[1], "p": round(p_best, 4)}]
                return {
                    "cause": labels["cause"][idxs[k]].split(".", 1)[1],
                    "p": round(p_best, 4),
                    "uncertain": bool(multi_label and p_best < cause_threshold),
                    "causes": causes,
                }

            if multi_label:
                scored = sorted(
                    ((labels["category"][j], float(row[j])) for j in range(len(row)) if j != none_idx),
                    key=lambda x: -x[1],
                )
                detected = [(c, p) for c, p in scored if p >= cat_thresholds.get(c, cat_threshold)]
                none_p = float(row[none_idx])
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
                        "cause": bc["cause"], "causeConfidence": bc["p"], "causeUncertain": bc["uncertain"],
                        "causes": bc.get("causes", []),
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
                    "cause": r["cause"], "causeConfidence": r["causeConfidence"], "causeUncertain": bc["uncertain"],
                }]

        # Giải mã phân cấp L3 (`root`): chỉ giữ L3 có L2 cha hoạt động (được dự đoán
        # hoặc có xác suất L2 cha >= cause_threshold); nếu L2 trống mà L3 vượt ngưỡng
        # thì kéo L2 cha (và L1 cha) theo đúng mục 3.3 của kế hoạch v5.
        if has_root:
            r_row = root_p[i]
            raw_roots = []
            for j, rk in enumerate(labels["root"]):
                if rk == NONE:
                    continue
                p_val = float(r_row[j])
                th = float(root_thresholds.get(rk, root_threshold))
                if p_val >= th:
                    p_cat, p_cz = r_parents.get(rk, (None, None))
                    raw_roots.append((rk, p_val, p_cat, p_cz, j))
            raw_roots.sort(key=lambda x: (-x[1], x[4]))

            active_l2 = set()
            for entry in r.get("categories") or []:
                ec = entry.get("category")
                if not ec:
                    continue
                if entry.get("cause"):
                    active_l2.add(f"{ec}.{entry['cause']}")
                for sub in entry.get("causes") or []:
                    if sub.get("cause"):
                        active_l2.add(f"{ec}.{sub['cause']}")

            # Thêm mọi L2 có xác suất thô >= cause_threshold
            if trained_tasks.get("cause"):
                for ckey, cidx in cause_idx_map.items():
                    if ckey != NONE and float(cause_p[i][cidx]) >= cause_threshold:
                        active_l2.add(ckey)

            kept_roots = []
            if not active_l2 and raw_roots:
                # L2 trống nhưng có L3 vượt ngưỡng -> kéo theo L2 cha của L3 mạnh nhất
                top_rk, top_p, top_cat, top_cz, _ = raw_roots[0]
                if top_cat and top_cz:
                    parent_key = f"{top_cat}.{top_cz}"
                    active_l2.add(parent_key)
                    cat_idx = labels["category"].index(top_cat) if top_cat in labels["category"] else -1
                    cz_idx = cause_idx_map.get(parent_key, -1)
                    cat_prob = round(float(cat_p[i][cat_idx]), 4) if cat_idx >= 0 else round(top_p, 4)
                    cz_prob = round(float(cause_p[i][cz_idx]), 4) if cz_idx >= 0 else round(top_p, 4)
                    r["category"] = top_cat
                    r["categoryConfidence"] = cat_prob
                    r["cause"] = top_cz
                    r["causeConfidence"] = cz_prob
                    r["causeUncertain"] = False
                    r["categories"] = [{
                        "category": top_cat, "p": cat_prob,
                        "cause": top_cz, "causeConfidence": cz_prob, "causeUncertain": False,
                        "causes": [{"cause": top_cz, "p": cz_prob}],
                    }]
                    r["pulledByRoot"] = True

            for rk, p_val, p_cat, p_cz, _ in raw_roots:
                if not r_parents or (p_cat and p_cz and f"{p_cat}.{p_cz}" in active_l2):
                    kept_roots.append({
                        "root": rk,
                        "p": round(p_val, 4),
                        "parentCategory": p_cat,
                        "parentCause": p_cz,
                    })

            r["rootCauses"] = kept_roots
            r["rootCauseKeys"] = [x["root"] for x in kept_roots]
            r["rootConfidence"] = kept_roots[0]["p"] if kept_roots else None

        if trained_tasks.get("spam"):
            spam_idx = labels["spam"].index("spam")
            r["spamProbability"] = round(float(soft["spam"][i][spam_idx]), 4)

        if trained_tasks.get("sarcasm") and "sarcasm" in soft:
            sar_idx = labels["sarcasm"].index("sarcastic")
            r["sarcasmProbability"] = round(float(soft["sarcasm"][i][sar_idx]), 4)

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
