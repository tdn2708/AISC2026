"""
So sánh hai hệ trên cùng một tập (dev để chọn, test để báo cáo) bằng bootstrap ghép cặp theo phiên.

    python compare.py --a runs/visobert_s42 runs/visobert_s43 runs/visobert_s44 \
                      --b runs/dapt_s42 runs/dapt_s43 runs/dapt_s44 --out runs/so_sanh.json

Mỗi hệ có thể gồm nhiều lần chạy (nhiều seed). Ta báo:
  - điểm từng seed và trung bình ± độ lệch chuẩn;
  - hiệu số macro-F1 intent (B − A) của dự đoán trung bình xác suất qua các seed, KTC 95% bootstrap
    ghép cặp theo phiên (cùng các phiên được lấy lại cho cả hai hệ).
Quy tắc đổi mô hình (DE-XUAT-MO-HINH.md): B thắng khi hiệu ≥ 0,02 VÀ KTC không chứa 0.
`--b luat` để so với bộ luật từ khoá cũ.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import cluster_bootstrap, macro_f1  # noqa: E402

L = json.loads((Path(__file__).resolve().parent / "labels_live.json").read_text(encoding="utf-8"))
N = len(L["intent"])


def load_system(dirs, test_rows):
    if dirs == ["luat"]:
        pred = np.array([L["intent"].index(r["intent_luat"]) if r["intent_luat"] in L["intent"] else L["intent"].index("OTHER")
                         for r in test_rows])
        return pred, []
    probs, singles = [], []
    for d in dirs:
        rows = [json.loads(l) for l in open(Path(d) / f"preds_{args.split}.jsonl", encoding="utf-8")]
        if [r["id"] for r in rows] != [r["id"] for r in test_rows]:
            sys.exit(f"{d}: thứ tự/tập khác với {args.test}")
        p = np.array([r["p_intent"] for r in rows])
        probs.append(p)
        singles.append(macro_f1(gold, p.argmax(-1), N))
    return np.mean(probs, 0).argmax(-1), singles


ap = argparse.ArgumentParser()
ap.add_argument("--a", nargs="+", required=True)
ap.add_argument("--b", nargs="+", required=True)
ap.add_argument("--split", choices=["dev", "test"], default="test",
                help="dev = để CHỌN mô hình; test = để BÁO CÁO (không chọn trên test)")
ap.add_argument("--test", type=Path, help="Tệp nhãn của tập đang so; mặc định data/<split>.jsonl")
ap.add_argument("--out", type=Path)
args = ap.parse_args()

args.test = args.test or Path(__file__).resolve().parent / "data" / f"{args.split}.jsonl"
test_rows = [json.loads(l) for l in open(args.test, encoding="utf-8") if l.strip()]
gold = np.array([L["intent"].index(r["intent"]) for r in test_rows])
groups = np.array([r["phien"] for r in test_rows])
pa, sa = load_system(args.a, test_rows)
pb, sb = load_system(args.b, test_rows)
diff = cluster_bootstrap(groups, lambda i: macro_f1(gold[i], pb[i], N) - macro_f1(gold[i], pa[i], N), B=5000, seed=1)
res = {
    "tap": args.split, "A": args.a, "B": args.b,
    "A_tung_seed": [round(x, 4) for x in sa], "B_tung_seed": [round(x, 4) for x in sb],
    "A_tb_sd": [round(float(np.mean(sa)), 4), round(float(np.std(sa)), 4)] if sa else None,
    "B_tb_sd": [round(float(np.mean(sb)), 4), round(float(np.std(sb)), 4)] if sb else None,
    "A_gop_seed": round(macro_f1(gold, pa, N), 4), "B_gop_seed": round(macro_f1(gold, pb, N), 4),
    "hieu_B_tru_A_KTC95": [round(x, 4) for x in diff],
    "B_thang_theo_quy_tac": bool(diff[0] >= 0.02 and diff[1] > 0),
}
print(json.dumps(res, ensure_ascii=False, indent=1))
if args.out:
    args.out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
