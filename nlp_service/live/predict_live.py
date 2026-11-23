"""
Dự đoán nhãn cho bình luận livestream bằng mô hình đã fine-tune (ViSoBERT đa nhiệm).

Mô hình nằm ở thư mục checkpoint

    # một câu
    python predict_live.py --model ckpt_live --nganh quan_ao "chốt mã 5 size M"
    # từ Hugging Face (kho riêng tư thì cần đăng nhập: hf auth login)
    python predict_live.py --model ten-tai-khoan/customer-radar-live-visobert --nganh cong_nghe "s23 ultra còn ko shop"
    # nhiều câu: file JSONL mỗi dòng {"nganh": "...", "text": "..."}
    python predict_live.py --model ckpt_live --file binh_luan.jsonl > ket_qua.jsonl

Dùng trong code:
    from predict_live import LivePredictor
    p = LivePredictor("ckpt_live")
    p.predict([("quan_ao", "chốt mã 5 size M")])

"""
import argparse
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_model import load_checkpoint  # noqa: E402

NGANH = ("gia_dung", "quan_ao", "cong_nghe")


def _resolve(model):
    p = Path(model)
    if (p / "meta.json").exists():
        return p
    from huggingface_hub import snapshot_download  # chỉ cần khi tải từ Hugging Face
    return Path(snapshot_download(repo_id=model))


class LivePredictor:
    def __init__(self, model, device=None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model, self.tok, self.meta = load_checkpoint(_resolve(model), self.device)
        L = self.meta["labels"]
        self.L = L
        self.th_asp = self.meta["nguong_aspects"]
        if isinstance(self.th_asp, dict):  # bản cũ lưu dạng {nhãn: ngưỡng}
            self.th_asp = [self.th_asp[a] for a in L["aspects"]]
        self.th_nr = float(self.meta["nguong_needs_reply"])
        self.max_len = int(self.meta.get("max_len", 64))

    @torch.no_grad()
    def predict(self, items, batch_size=64):
        """items: danh sách (nganh, text). Trả về danh sách dict nhãn + xác suất."""
        out = []
        for i in range(0, len(items), batch_size):
            chunk = items[i:i + batch_size]
            # cùng định dạng đầu vào lúc huấn luyện (prepare_data.model_input): "[nganh] câu"
            texts = [f"[{n}] {str(t).strip()}" for n, t in chunk]
            enc = self.tok(texts, padding=True, truncation=True, max_length=self.max_len, return_tensors="pt").to(self.device)
            o = self.model(enc["input_ids"], enc["attention_mask"])
            pi = o["intent"].float().softmax(-1).cpu()
            pa = o["aspects"].float().sigmoid().cpu()
            ps = o["sentiment"].float().softmax(-1).cpu()
            pn = o["needs_reply"].float().sigmoid().cpu()
            for k, (n, t) in enumerate(chunk):
                ii = int(pi[k].argmax())
                out.append({
                    "nganh": n, "text": t,
                    "intent": self.L["intent"][ii], "p_intent": round(float(pi[k][ii]), 4),
                    "aspects": [a for j, a in enumerate(self.L["aspects"]) if float(pa[k][j]) >= self.th_asp[j]],
                    "sentiment": self.L["sentiment"][int(ps[k].argmax())],
                    "needs_reply": int(float(pn[k]) >= self.th_nr), "p_needs_reply": round(float(pn[k]), 4),
                })
        return out


def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="thư mục checkpoint hoặc mã kho Hugging Face")
    ap.add_argument("--nganh", choices=NGANH, default="gia_dung")
    ap.add_argument("--file", help="JSONL mỗi dòng {nganh, text}")
    ap.add_argument("text", nargs="*")
    a = ap.parse_args()
    if a.file:
        rows = [json.loads(l) for l in open(a.file, encoding="utf-8") if l.strip()]
        items = [(r.get("nganh", a.nganh), r["text"]) for r in rows]
    else:
        items = [(a.nganh, " ".join(a.text))]
    for r in LivePredictor(a.model).predict(items):
        print(json.dumps(r, ensure_ascii=False))


if __name__ == "__main__":
    main()
