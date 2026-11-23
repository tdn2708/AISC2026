"""Tạo output/04_tap_train_ban_hang_sach.csv từ output/04_tap_train_ban_hang.csv (viết 19/11/2026; trước đây làm tay).
Bỏ: câu chưa có intent_cuoi; câu tiếng Thái (chữ Thái); câu tiếng Indonesia (có từ đặc trưng).
Cách dùng: python make_train_sach.py ROOT"""
import re, sys
import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
T = pd.read_csv(f"{ROOT}/output/04_tap_train_ban_hang.csv")
THAI = re.compile(r"[฀-๿]")
# Từ tiếng Indonesia gặp trong dữ liệu. Không dùng "mau", "ada", "kk" vì trùng tiếng Việt không dấu / tiếng lóng.
INDO = re.compile(r"\b(kak|yg|yang|etalase|brp|brpa|bahan|itu)\b", re.I)
txt = T.binh_luan.fillna("").astype(str)
lang = txt.map(lambda s: bool(THAI.search(s) or INDO.search(s)))
empty = T.intent_cuoi.isna() | (T.intent_cuoi.astype(str).str.strip() == "")
K = T[~lang & ~empty]
K.to_csv(f"{ROOT}/output/04_tap_train_ban_hang_sach.csv", index=False, encoding="utf-8-sig")
print(f"{len(T)} -> {len(K)} | bỏ {int(lang.sum())} câu Thái/Indonesia, {int((empty & ~lang).sum())} câu chưa có nhãn cuối")
