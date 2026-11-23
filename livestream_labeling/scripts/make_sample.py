"""Lấy mẫu phân tầng để gán nhãn.
- Chỉ ngành gia_dung / quan_ao / cong_nghe, bỏ spam_flag, bỏ trùng text_norm trong cùng phiên, bỏ câu < 2 ký tự chữ.
- Tối đa PER_SESSION câu/phiên (tránh một kênh lớn lấn át), tối đa PER_CAT câu/ngành.
- Chia lô BATCH câu để gán nhãn; ghi data/sample_for_labeling.csv và data/batches/batch_XX.json
Cách dùng: python make_sample.py ROOT [PER_CAT=450] [PER_SESSION=60] [BATCH=150]"""
import sys, os, json, pandas as pd
ROOT = sys.argv[1]
PER_CAT = int(sys.argv[2]) if len(sys.argv) > 2 else 450
PER_SESSION = int(sys.argv[3]) if len(sys.argv) > 3 else 60
BATCH = int(sys.argv[4]) if len(sys.argv) > 4 else 150

# Chỉ lấy mẫu từ file SẠCH (đã lọc spam, đúng 3 ngành, bỏ trùng). Bỏ câu đã có trong mẫu trước (gán theo đợt).
C = pd.read_csv(f"{ROOT}/data/live_comments_clean.csv", dtype={"msg_id": str})
WAVE = os.environ.get("WAVE", "1")
prev = f"{ROOT}/data/sample_for_labeling.csv"
done_ids = set(pd.read_csv(prev).clean_id) if os.path.exists(prev) and WAVE != "1" else set()
C = C[~C.clean_id.isin(done_ids)]
# Từ đợt 5 (19/11/2026): CATS chọn ngành cần lấy (file sạch nay có cả 4 ngành mới); CHI_BAN_HANG=1 chỉ lấy phiên bán hàng thật
CATS = os.environ.get("CATS", "gia_dung,quan_ao,cong_nghe").split(",")
C = C[C.category.isin(CATS)]
if os.environ.get("CHI_BAN_HANG") == "1" and "loai_phien" in C:
    C = C[C.loai_phien == "ban_hang"]
C = C.sample(frac=1, random_state=2026).groupby("session_id").head(PER_SESSION)
parts = []
for cat, g in C.groupby("category"):
    # ưu tiên đa dạng nền tảng: lấy tối đa một nửa từ mỗi nền tảng nếu đủ
    g = g.sample(frac=1, random_state=7)
    tt = g[g.platform == "tiktok"].head(PER_CAT // 2)
    rest = g.drop(tt.index).head(PER_CAT - len(tt))
    parts.append(pd.concat([tt, rest]))
S = pd.concat(parts).sample(frac=1, random_state=11).reset_index(drop=True)
S = S.rename(columns={"clean_id": "item_id"})
S["wave"] = int(WAVE)
cols = ["item_id", "wave", "platform", "category", "session_id", "channel", "title", "msg_id", "ts_utc", "offset_sec",
        "author_hash", "text", "n_repeat_in_session"]
out = S[cols].rename(columns={"item_id": "clean_id"})
if done_ids:
    out = pd.concat([pd.read_csv(prev), out])
out.to_csv(prev, index=False, encoding="utf-8-sig")
os.makedirs(f"{ROOT}/data/batches", exist_ok=True)
for b in range(0, len(S), BATCH):
    items = [{"item_id": r.item_id, "category": r.category, "session_title": str(r.title)[:80], "text": r.text}
             for r in S.iloc[b:b + BATCH].itertuples()]
    json.dump(items, open(f"{ROOT}/data/batches/w{WAVE}_batch_{b // BATCH:02d}.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
print(S.groupby(["category", "platform"]).size(), "\ntổng đợt", WAVE, ":", len(S), "| số lô", (len(S) + BATCH - 1) // BATCH)
