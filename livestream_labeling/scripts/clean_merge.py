"""Gộp dữ liệu thô YouTube + TikTok, gắn ngành hàng cho từng phiên, đánh dấu spam.
Không xoá dòng nào: spam được đánh dấu ở cột spam_flag/spam_reason để có thể kiểm tra lại.
Đầu ra: data/live_comments_all.csv, data/live_sessions.csv"""
import pandas as pd, re, unicodedata, glob, os, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(f"{ROOT}/data", exist_ok=True)

def norm(t):
    t = unicodedata.normalize("NFC", str(t)).lower()
    t = re.sub(r":[\w-]+:|\[[a-z_]+\]", " ", t)          # emoji YouTube :face-...:, TikTok [wow]
    t = re.sub(r"(.)\1{2,}", r"\1\1", t)                 # kéo dài ký tự: lấyyyyy -> lấyy
    return re.sub(r"\s+", " ", t).strip()

CAT_RULES = [  # theo tiêu đề / tên kênh phiên live
    ("cong_nghe", r"iphone|điện thoại|điện máy|audio|\bloa\b|karaoke|\btek\b|tecno|samsung|laptop|tai nghe|phụ kiện|mobile"),
    ("quan_ao",  r"quần áo|thời trang|túi|giày|dép|boutique|sneaker|đồ bộ|váy|đầm|hồng chi|dori shop"),
    ("gia_dung", r"gốm|sứ|gia dụng|nồi|chảo|ly |tô |bát tràng|máy cầm tay|máy bãi|kho hàng vip|hàng nhật|costco|thanh lý|x[ảã]\s*hàng"),
    # 4 ngành mới (18/11/2026): đặt SAU 3 ngành cũ để phiên cũ giữ nguyên ngành; phiên mới nên gán qua category_map.csv
    ("my_pham",   r"mỹ phẩm|skin\s?care|make\s?up|trang điểm|son môi|serum|kem chống nắng|kem dưỡng|dưỡng da|trị mụn|trị nám|sữa rửa mặt|toner|cushion|kem nền|nước hoa|làm đẹp|beauty|cosmetic"),
    ("trang_suc", r"trang sức|vàng bạc|đá quý|nhẫn|dây chuyền|bông tai|lắc tay|vòng tay|ngọc trai|kim cương|jewelry|bạc 925|bạc ta"),
    ("me_be",     r"mẹ và bé|mẹ & bé|mẹ bé|sơ sinh|trẻ em|cho bé|bỉm|\btã\b|sữa bột|đồ chơi|baby|kids"),
    ("thuc_pham", r"đồ ăn|ăn vặt|đặc sản|hải sản|trái cây|hoa quả|ruốc|chà bông|yến sào|yến tổ|khô gà|khô bò|mắm|thực phẩm|bánh tráng|food"),
]
NEW_CATS = ["my_pham", "trang_suc", "me_be", "thuc_pham"]
ALL_CATS = ["gia_dung", "quan_ao", "cong_nghe"] + NEW_CATS
def cat_of(title, channel):
    s = f"{title} {channel}".lower()
    for c, rx in CAT_RULES:
        if re.search(rx, s): return c
    return "ngoai_pham_vi"

sess, com = [], []
for f in glob.glob(f"{ROOT}/raw/*/*sessions.csv"):
    s = pd.read_csv(f); s["source_file"] = os.path.relpath(f, ROOT); sess.append(s)
for f in glob.glob(f"{ROOT}/raw/*/*comments.csv"):
    c = pd.read_csv(f, dtype={"msg_id": str}); c["source_file"] = os.path.relpath(f, ROOT); com.append(c)
S = pd.concat(sess).drop_duplicates("session_id", keep="last")
C = pd.concat(com).drop_duplicates(["session_id", "msg_id", "text"])
# phiên TikTok bị dừng giữa chừng (người dùng cho dừng cào): có bình luận nhưng chưa có dòng phiên -> dựng lại
orph = sorted(set(C.session_id) - set(S.session_id))
if orph:
    rows = []
    for sid in orph:
        g = C[C.session_id == sid]
        ch = sid[3:].rsplit("_", 1)[0] if sid.startswith("tt_") else ""
        rows.append({"platform": g.platform.iloc[0], "session_id": sid, "url": f"https://www.tiktok.com/@{ch}/live" if ch else "",
                     "channel": ch, "title": "", "start_utc": g.ts_utc.min(), "duration_sec": None, "view_count_final": None,
                     "like_count_final": None, "n_comments": len(g), "collected_at": g.ts_utc.max(),
                     "method": "tiktok-live-connector, dừng sớm theo yêu cầu (dựng lại từ bình luận)", "source_file": g.source_file.iloc[0]})
    S = pd.concat([S, pd.DataFrame(rows)], ignore_index=True)
    print("dựng lại", len(orph), "phiên dừng sớm")
# số người xem lớn nhất từ chuỗi theo thời gian (tt_metrics.csv) cho phiên TikTok
mets = [pd.read_csv(f) for f in glob.glob(f"{ROOT}/raw/*/tt_metrics.csv")]
if mets:
    Mt = pd.concat(mets)
    vmax = Mt[Mt.metric == "viewers"].groupby("session_id").value.max()
    S["viewers_max"] = S.session_id.map(vmax)

# ngành hàng: TikTok lấy từ category_map (tìm theo từ khoá), YouTube theo tiêu đề
cmap = {}
for f in glob.glob(f"{ROOT}/raw/*/category_map.csv"):
    m = pd.read_csv(f); cmap.update(dict(zip(m.channel, m.category)))
S["category"] = [cmap.get(ch) or cat_of(t, ch) for t, ch in zip(S.title.fillna(""), S.channel.fillna(""))]
# loại thủ công các phiên không phải bán lẻ (show giải trí đa ngành, đấu giá cây/tượng, xe, nhạc cụ).
# Từ 18/11 mỹ phẩm, thực phẩm, đá quý được nhận (4 ngành mới) nên bỏ khỏi danh sách loại.
EXCLUDE = r"siêu show|đại tiệc|mai vàng|tượng gỗ|lũa|xe máy|motor|guitar|bonsai|hloan"
S.loc[S.title.fillna("").str.lower().str.contains(EXCLUDE) & ~S.session_id.str.startswith("tt_"), "category"] = "ngoai_pham_vi"
# đợt TikTok đầu (10/11) cào các hãng mỹ phẩm, trước đây để ngoài phạm vi
TT_MY_PHAM = {"lorealparis_vn", "garnier_vn", "maybelline_vn", "innisfreevietnam", "bioderma_vietnam"}
S.loc[S.session_id.str.startswith("tt_") & S.channel.isin(TT_MY_PHAM), "category"] = "my_pham"
S.loc[S.session_id.str.startswith("tt_") & ~S.channel.isin(cmap) & ~S.channel.isin(TT_MY_PHAM), "category"] = "ngoai_pham_vi"

C = C.merge(S[["session_id", "category", "channel", "title"]], on="session_id", how="left")
C["text_norm"] = C.text.map(norm)
C = C.sort_values(["session_id", "ts_utc"])

# ---- đánh dấu spam ----
reason = pd.Series("", index=C.index)
alnum = C.text_norm.str.replace(r"[^\w]", "", regex=True)
# số trần / mã ngắn ("1", "m6", "50") thường là chốt mã/số lượng -> không coi là rỗng (QA bước lọc 10/11)
CODE = C.text_norm.str.fullmatch(r"\d{1,4}|m\s?\d{1,4}|mã\s?\d{1,4}")
reason[(alnum.str.len() < 2) & ~CODE] = "rong_hoac_chi_emoji"
reason[(reason == "") & C.text_norm.str.contains(r"https?://|www\.|zalo\s*\d|t\.me/", regex=True)] = "quang_cao_link"
dup_same_author = C.duplicated(["session_id", "author_hash", "text_norm"])
reason[(reason == "") & dup_same_author] = "lap_lai_cung_nguoi"
rank = C.groupby(["session_id", "author_hash"]).cumcount()
# QA bước lọc: ~28% câu bị bỏ ở luật cũ (>=8) là hỏi/chốt thật -> nâng ngưỡng 20 và miễn trừ câu có tín hiệu mua/hỏi
USEFUL = C.text_norm.str.contains(r"\?|\bko\b|không|\bk\b|chốt|chot|lấy|lay|mua|giá|bao nhiêu|size|\bsz\b|còn|ship|cọc|đặt|\bok\b|\bss\b|mã|\d", regex=True)
reason[(reason == "") & (rank >= 20) & ~USEFUL] = "qua_20_binh_luan_moi_nguoi"
# flood: cùng một câu xuất hiện dày đặc trong 10 giây từ >=5 người (hô hào mini game)
C["_t"] = pd.to_datetime(C.ts_utc, errors="coerce", utc=True).dt.floor("10s")
burst = C.groupby(["session_id", "_t", "text_norm"]).author_hash.transform("nunique")
# chỉ coi là hô hào khi có từ mini game; số/mã/lấy/chốt đồng loạt là làn sóng chốt đơn thật -> giữ
HOHAO = C.text_norm.str.contains(r"tặng|\btang\b|follow|\blike\b|\bsub\b|\btim\b|share|điểm danh|diem danh|free", regex=True)
reason[(reason == "") & (burst >= 5) & (C.text_norm.str.len() <= 12) & HOHAO] = "flood_ho_hao"
# SĐT/zalo: không xoá (khách cũng để SĐT để chốt đơn), chỉ gắn cờ
C["has_contact"] = C.text_norm.str.contains(r"zalo|\[sđt\]|\b0\d{9}\b", regex=True)
C["spam_flag"] = reason != ""
C["spam_reason"] = reason
C = C.drop(columns="_t")

n = C.groupby("session_id").agg(n_total=("text", "size"), n_spam=("spam_flag", "sum"))
S = S.merge(n, left_on="session_id", right_index=True, how="left")
S.to_csv(f"{ROOT}/data/live_sessions.csv", index=False, encoding="utf-8-sig")
C.to_csv(f"{ROOT}/data/live_comments_all.csv", index=False, encoding="utf-8-sig")

# ---- file SẠCH: 7 ngành, không spam, bỏ trùng câu trong cùng phiên (giữ số lần lặp) ----
K = C[C.category.isin(ALL_CATS) & ~C.spam_flag].copy()
K = K[K.text_norm.str.replace(r"[^\w]", "", regex=True).str.len() >= 2]
K["n_repeat_in_session"] = K.groupby(["session_id", "text_norm"]).text.transform("size")
K = K.drop_duplicates(["session_id", "text_norm"])
import hashlib
K.insert(0, "clean_id", [("Y" if p == "youtube" else "T") + hashlib.md5(f"{s}|{m}|{t}".encode()).hexdigest()[:10]
                          for p, s, m, t in zip(K.platform, K.session_id, K.msg_id.astype(str), K.text_norm)])
keep = ["clean_id", "platform", "category", "session_id", "channel", "title", "msg_id", "ts_utc", "offset_sec",
        "author_hash", "text", "text_norm", "has_phone", "has_contact", "n_repeat_in_session", "source_file"]
K[keep].to_csv(f"{ROOT}/data/live_comments_clean.csv", index=False, encoding="utf-8-sig")
print("FILE SẠCH:", len(K), "câu |", K.groupby(["category", "platform"]).size().to_dict())
print(S.groupby("category")[["n_total", "n_spam"]].sum().assign(phien=S.groupby("category").size()))
print(C[C.spam_flag].spam_reason.value_counts())

# ---- che thông tin cá nhân (sau khi đã tính clean_id để ID ổn định) + cờ loại phiên ----
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pii import mask_pii
# Phiên trong 3 ngành nhưng KHÔNG phải bán hàng trực tiếp đúng ngành (soát độc lập 11/11): gắn cờ để lọc khi train/báo cáo
SESSION_TYPE = {
    "Tony Phùng Studio": "review_cong_nghe_khong_ban",
    "dReviews": "review_cong_nghe_khong_ban",
    "Ông Tek": "san_sale_da_nganh",
    "chosaigon": "vlog_do_si",
    "TÚI VỊT VINTAGE DOONEY & BOURKE VÀ TÚI DA ĐỘC LẠ": "ban_hang_lan_nganh",
    "Máy Bãi Cầm Tay Nguyễn Ích Dũng": "may_cong_cu",
    "Dũng Nguyễn Máy Hàn": "may_cong_cu",
    "KT Food Stories": "ban_hang_lan_nganh",   # yến + mỹ phẩm + đồ ăn trong cùng phiên (18/11)
    "Điện Máy Tây Hồ": "may_cong_cu",          # máy mài, máy pin cầm tay (19/11)
    "HACOM": "review_cong_nghe_khong_ban",     # live lắp PC kiểu talkshow, gần như không chốt đơn (soát 19/11)
}
S["loai_phien"] = [SESSION_TYPE.get(str(ch).strip(), "ban_hang" if c != "ngoai_pham_vi" else "ngoai_pham_vi") for ch, c in zip(S.channel, S.category)]
# Theo từng phiên (soát độc lập đợt 5, 19/11/2026): phiên không phải bán hàng trong kênh có bán hàng
SESSION_TYPE_BY_ID = {
    "R5_mlDx-QvE": "mini_game_tang_qua",      # MC Studio "Tặng điện thoại Free" (đoán giá, tên shop + số)
    "WMxyfxXmaJA": "mini_game_tang_qua",      # HACOM quay số trúng thưởng
    "7rceXIgr3mk": "mini_game_tang_qua",
    "oGhg-Vu6MyM": "ban_hang_lan_nganh",      # CKT: đồ gia dụng thanh lý, kênh xếp công nghệ
}
S["loai_phien"] = [SESSION_TYPE_BY_ID.get(sid, lp) for sid, lp in zip(S.session_id, S.loai_phien)]
S.to_csv(f"{ROOT}/data/live_sessions.csv", index=False, encoding="utf-8-sig")
lp = dict(zip(S.session_id, S.loai_phien))
for name, df, cols in [("live_comments_all.csv", C, None), ("live_comments_clean.csv", K, keep)]:
    df = df.copy()
    df["text"] = df.text.map(mask_pii)
    df["text_norm"] = df.text.map(norm)
    df["loai_phien"] = df.session_id.map(lp)
    out_cols = (cols + ["loai_phien"]) if cols else list(df.columns)
    df[out_cols].to_csv(f"{ROOT}/data/{name}", index=False, encoding="utf-8-sig")
print("loại phiên (file sạch):", K.session_id.map(lp).value_counts().to_dict())
