"""Chọn câu cho agent 3 kiểm chứng (đợt 3 trở đi, theo quyết định của người dùng 11/11/2026):
- MỌI câu A và B khác nhau ở intent, sentiment hoặc needs_reply;
- cộng 20% ngẫu nhiên (seed cố định) các câu A=B ở cả ba trường đó, để đo tỉ lệ sai còn sót khi A=B.
Câu không được chọn sẽ nhận nhãn chung A=B tự động trong build_excel.py.
Cách dùng: python select_verify.py ROOT w3_batch_00 [w3_batch_01 ...]
Ghi data/verify/<lô>.json gồm item cần xem + nhãn A, B, C; in số câu."""
import sys, json, os, random

ROOT, names = sys.argv[1], sys.argv[2:]
os.makedirs(f"{ROOT}/data/verify", exist_ok=True)
tot = {"bat_dong": 0, "mau_20": 0, "tu_dong": 0}
for n in names:
    items = json.load(open(f"{ROOT}/data/batches/{n}.json", encoding="utf-8"))
    A = {d["item_id"]: d for d in json.load(open(f"{ROOT}/data/labels/A/{n}.json", encoding="utf-8"))}
    B = {d["item_id"]: d for d in json.load(open(f"{ROOT}/data/labels/B/{n}.json", encoding="utf-8"))}
    C = {d["item_id"]: d for d in json.load(open(f"{ROOT}/data/labels/C/{n}.json", encoding="utf-8"))}
    rng = random.Random(f"verify-{n}")
    out = []
    for it in items:
        i = it["item_id"]
        a, b = A[i], B[i]
        diff = a["intent"] != b["intent"] or a["sentiment"] != b["sentiment"] or int(a["needs_reply"]) != int(b["needs_reply"])
        if diff:
            why = "bat_dong"
        elif rng.random() < 0.20:
            why = "mau_20"
        else:
            tot["tu_dong"] += 1
            continue
        tot[why] += 1
        out.append({**it, "ly_do_chon": why,
                    "A": {k: a.get(k) for k in ("intent", "aspects", "sentiment", "needs_reply", "product_ref", "note")},
                    "B": {k: b.get(k) for k in ("intent", "aspects", "sentiment", "needs_reply", "product_ref", "note")},
                    "C_luat": {k: C.get(i, {}).get(k) for k in ("intent", "aspects")}})
    json.dump(out, open(f"{ROOT}/data/verify/{n}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(n, len(out), "câu cần kiểm chứng /", len(items))
print(tot)
