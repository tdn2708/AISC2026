"""
Chuẩn bị dữ liệu huấn luyện mô hình bình luận livestream.
Chỉ dùng thư viện chuẩn, chạy trên máy:

    python nlp_service/live/prepare_data.py

Đầu vào : livestream_labeling/output/04_tap_train_ban_hang_sach.csv (5.801 câu có nhãn)
          livestream_labeling/data/live_comments_all.csv (bình luận chưa nhãn, cho DAPT)
Đầu ra  : nlp_service/live/data/
          train.jsonl, dev.jsonl, test.jsonl   — chia THEO PHIÊN, một phiên chỉ nằm ở một tập
          dapt_corpus.txt                      — câu chưa nhãn, đã che SĐT/@tên, BỎ các phiên dev/test
          manifest.json                        — số câu, phân bố nhãn, mã băm tệp

Vì sao chia theo phiên: các câu trong cùng phiên rất giống nhau (cùng mã sản phẩm, cùng
người live). Chia ngẫu nhiên theo câu sẽ làm điểm test cao giả tạo.
"""
import csv
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LAB = ROOT / "livestream_labeling"
sys.path.insert(0, str(LAB / "scripts"))
from pii import mask_pii  # noqa: E402

LABELS = json.loads((HERE / "labels_live.json").read_text(encoding="utf-8"))
SRC = LAB / "output" / "04_tap_train_ban_hang_sach.csv"
RAW = LAB / "data" / "live_comments_all.csv"
OUT = HERE / "data"

DEV_SHARE, TEST_SHARE = 0.15, 0.15
TRIES = 4000
SEED = 2026
# Câu có độ tin cậy thấp (hai người gán và người kiểm chứng còn phân vân) vẫn dùng để học
# nhưng nặng bằng nửa câu chắc chắn.
SECTORS = ("gia_dung", "quan_ao", "cong_nghe")
WEIGHT = {"cao": 1.0, "trung_binh": 1.0, "thap": 0.5}


def model_input(nganh, text):
    # Ghi ngành trước câu để mô hình phân biệt "m83" là mã gốm hay số đo quần áo
    return f"[{nganh}] {text.strip()}"


def parse_aspects(s):
    out = [a.strip() for a in s.replace("|", ",").split(",") if a.strip()]
    bad = [a for a in out if a not in LABELS["aspects"]]
    if bad:
        raise ValueError(f"aspect lạ: {bad}")
    return sorted(set(out), key=LABELS["aspects"].index)


def load_rows():
    rows = []
    for x in csv.DictReader(open(SRC, encoding="utf-8-sig")):
        assert x["intent_cuoi"] in LABELS["intent"], x["intent_cuoi"]
        assert x["sentiment_cuoi"] in LABELS["sentiment"], x["sentiment_cuoi"]
        rows.append({
            "id": x["item_id"],
            "phien": x["phien"],
            "kenh": x["kenh"],
            "nen_tang": x["nen_tang"],
            "nganh": x["nganh"],
            "text": x["binh_luan"],
            "input": model_input(x["nganh"], x["binh_luan"]),
            "intent": x["intent_cuoi"],
            "aspects": parse_aspects(x["aspects_cuoi"]),
            "sentiment": x["sentiment_cuoi"],
            "needs_reply": int(float(x["needs_reply_cuoi"])),
            "muc_tin_cay": x["muc_tin_cay_intent"],
            "weight": WEIGHT[x["muc_tin_cay_intent"]],
            # Nhãn của bộ luật từ khoá cũ (backend/services/live/intent.js) để so sánh
            "intent_luat": x["intent_C_luat"],
        })
    return rows


def split_sessions(rows):
    """Thử nhiều cách xếp phiên vào dev/test; chọn cách có tỉ lệ nhãn gần toàn bộ nhất."""
    by_s = defaultdict(list)
    for r in rows:
        by_s[r["phien"]].append(r)
    sessions = sorted(by_s)
    keys = ([("intent", c) for c in LABELS["intent"]] + [("nganh", c) for c in SECTORS]
            + [("nen_tang", c) for c in ("youtube", "tiktok")])

    def prof(rs):
        n = len(rs) or 1
        return [sum(r[k] == v for r in rs) / n for k, v in keys]

    total = prof(rows)
    rare = [c for c in LABELS["intent"] if sum(r["intent"] == c for r in rows) < 200]
    rng = random.Random(SEED)
    best = None
    for _ in range(TRIES):
        order = sessions[:]
        rng.shuffle(order)
        part = {"dev": [], "test": []}
        size = {"dev": 0, "test": 0}
        for s in order:
            n = len(by_s[s])
            for name, share in (("test", TEST_SHARE), ("dev", DEV_SHARE)):
                # Không để một phiên khổng lồ lấn hết chỗ của tập nhỏ
                if size[name] + n <= share * len(rows) * 1.1 and n <= share * len(rows) * 0.45:
                    part[name].append(s); size[name] += n
                    break
        if min(size.values()) < 0.85 * DEV_SHARE * len(rows):
            continue
        score = 0.0
        for name in part:
            rs = [r for s in part[name] for r in by_s[s]]
            score += sum(abs(a - b) / (b + 0.01) for a, b in zip(prof(rs), total))
            # Tập dev/test phải có đủ mẫu lớp hiếm để đo được (ít nhất 4 câu mỗi lớp)
            score += 5 * sum(max(0, 4 - sum(r["intent"] == c for r in rs)) for c in rare)
            # Mỗi ngành phải có ít nhất 70% số câu kỳ vọng, để đo riêng được từng ngành
            for g in SECTORS:
                want = sum(r["nganh"] == g for r in rows) * len(rs) / len(rows)
                score += 3 * max(0, 0.7 * want - sum(r["nganh"] == g for r in rs)) / want
        if best is None or score < best[0]:
            best = (score, {k: list(v) for k, v in part.items()})
    if best is None:
        sys.exit("Không tìm được cách chia hợp lệ — kiểm tra lại tỉ lệ DEV/TEST_SHARE.")
    dev, test = set(best[1]["dev"]), set(best[1]["test"])
    split = {s: "test" if s in test else "dev" if s in dev else "train" for s in sessions}
    return split, best[0]


def dapt_corpus(exclude_sessions, labeled_texts):
    """Bình luận chưa nhãn cho bước pretrain thêm (DAPT).
    Bỏ spam, bỏ trùng, che thông tin cá nhân, và BỎ các phiên dev/test để không rò rỉ."""
    seen, lines = set(), []
    for x in csv.DictReader(open(RAW, encoding="utf-8-sig")):
        if x["spam_flag"] == "True" or x["session_id"] in exclude_sessions:
            continue
        t = mask_pii(x["text"]).strip()
        key = x["text_norm"] or t.lower()
        if len(t) < 2 or key in seen:
            continue
        seen.add(key)
        # Chỉ ghi tiền tố ngành cho 3 ngành trong phạm vi, giống đầu vào lúc fine-tune
        lines.append(model_input(x["category"], t) if x["category"] in SECTORS else t)
    # Thêm câu đã gán nhãn của tập train (đã che sẵn)
    for t in labeled_texts:
        if t not in lines:
            lines.append(t)
    return lines


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    rows = load_rows()
    split, score = split_sessions(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    parts = {k: [r for r in rows if split[r["phien"]] == k] for k in ("train", "dev", "test")}
    for k, rs in parts.items():
        with open(OUT / f"{k}.jsonl", "w", encoding="utf-8", newline="\n") as f:
            for r in rs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    held_out = {s for s, k in split.items() if k != "train"}
    corpus = dapt_corpus(held_out, [r["input"] for r in parts["train"]])
    (OUT / "dapt_corpus.txt").write_text("\n".join(corpus) + "\n", encoding="utf-8", newline="\n")

    # Kiểm tra rò rỉ: không phiên nào nằm ở hai tập
    sess = {k: {r["phien"] for r in rs} for k, rs in parts.items()}
    assert not (sess["train"] & sess["dev"]) and not (sess["train"] & sess["test"]) and not (sess["dev"] & sess["test"])

    manifest = {
        "nguon": str(SRC.relative_to(ROOT)).replace("\\", "/"),
        "sha256_nguon": sha(SRC),
        "seed_chia": SEED,
        "diem_lech_ti_le": round(score, 3),
        "nhan": LABELS,
        "tap": {},
        "dapt_corpus": {"so_cau": len(corpus), "ghi_chu": "bỏ spam, bỏ trùng, đã che SĐT/@tên, không gồm phiên dev/test"},
    }
    for k, rs in parts.items():
        manifest["tap"][k] = {
            "so_cau": len(rs),
            "so_phien": len(sess[k]),
            "intent": dict(Counter(r["intent"] for r in rs).most_common()),
            "nganh": dict(Counter(r["nganh"] for r in rs)),
            "nen_tang": dict(Counter(r["nen_tang"] for r in rs)),
            "sentiment": dict(Counter(r["sentiment"] for r in rs)),
            "needs_reply_1": sum(r["needs_reply"] for r in rs),
            "muc_tin_cay_thap": sum(r["muc_tin_cay"] == "thap" for r in rs),
            "sha256": sha(OUT / f"{k}.jsonl"),
        }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in manifest["tap"].items():
        print(f"{k:5s} {v['so_cau']:5d} câu, {v['so_phien']:3d} phiên | {v['intent']} | {v['nganh']} | {v['nen_tang']}")
    print("DAPT:", len(corpus), "câu")


if __name__ == "__main__":
    main()
