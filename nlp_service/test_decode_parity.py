"""
TEST SO KHỚP 3 NƠI GIẢI MÃ (bắt buộc theo mục 3.3 kế hoạch v5):
  1. nlp_service/visobert_model.py::decode
  2. nlp_service/service.py::explain_from_logits (/explain)
  3. src/lib/visobertBrowser.js::decodeOne

Chạy trên cùng 6 ca logit mẫu (bao gồm đa nguyên nhân L2, L3 khớp L2 cha,
L3 bị lọc vì L2 cha không hoạt động, L3 kéo theo L2 cha khi L2 trống,
câu không phải khiếu nại NONE, và checkpoint v4 cũ không có đầu `root`).

Cách chạy:
  python nlp_service/test_decode_parity.py
"""

import json
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import torch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from visobert_model import decode, load_labels  # noqa: E402
from service import explain_from_logits  # noqa: E402


def make_case_logits(labels, sent, cats, causes, spam, sarcasm, roots=None):
    lg = {
        "sentiment": [-3.0] * len(labels["sentiment"]),
        "category": [-4.0] * len(labels["category"]),
        "cause": [-4.0] * len(labels["cause"]),
        "spam": [2.5, -2.5],
        "sarcasm": [2.0, -2.0],
    }
    lg["sentiment"][labels["sentiment"].index(sent)] = 2.5
    for k, v in cats.items():
        lg["category"][labels["category"].index(k)] = v
    for k, v in causes.items():
        lg["cause"][labels["cause"].index(k)] = v
    if spam:
        lg["spam"] = [-2.0, 2.2]
    if sarcasm:
        lg["sarcasm"] = [-1.8, 2.1]
    if roots is not None:
        lg["root"] = [-4.0] * len(labels["root"])
        for k, v in roots.items():
            lg["root"][labels["root"].index(k)] = v
    return lg


def run_js_decode(payload):
    browser_url = (ROOT / "src" / "lib" / "visobertBrowser.js").resolve().as_uri()
    js_code = (
        f"import {{ decodeOne }} from {json.dumps(browser_url)};"
        "let raw = '';"
        "process.stdin.setEncoding('utf8');"
        "process.stdin.on('data', (c) => { raw += c; });"
        "process.stdin.on('end', () => {"
        "  const items = JSON.parse(raw);"
        "  const out = items.map(({ meta, logits }) => decodeOne({ meta }, logits));"
        "  process.stdout.write(JSON.stringify(out));"
        "});"
    )
    cp = subprocess.run(
        ["node", "--input-type=module", "-e", js_code],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(cp.stdout)


def main():
    labels_v5 = load_labels(HERE / "labels.json")
    labels_v4 = {k: v for k, v in labels_v5.items() if k not in ("root", "rootParents", "rootPack")}

    meta_v5 = {
        "labels": labels_v5,
        "trainedTasks": {"sentiment": True, "category": True, "cause": True, "spam": True, "sarcasm": True, "root": True},
        "multiLabel": True,
        "thresholds": {"category": 0.5, "cause": 0.3, "root": 0.4},
        "calibration": {
            "sentimentTemperature": 1.25,
            "spamTemperature": 1.1,
            "sarcasmTemperature": 1.0,
            "categoryThresholds": {"ProductQuality": 0.45, "Delivery": 0.5},
            "causeThreshold": 0.35,
            "rootThreshold": 0.4,
            "rootThresholds": {"WEAK_HEAT": 0.35, "WARRANTY_ACTIVATION": 0.3},
        },
    }
    meta_v4 = {
        "labels": labels_v4,
        "trainedTasks": {"sentiment": True, "category": True, "cause": True, "spam": True, "sarcasm": True},
        "multiLabel": True,
        "thresholds": {"category": 0.5, "cause": 0.3},
        "calibration": {"sentimentTemperature": 1.2, "causeThreshold": 0.3},
    }

    cases = [
        (
            "v5: đa L3 trong TechnicalDefect (MOB-7815 đĩa không quay + nút liệt)",
            meta_v5,
            make_case_logits(
                labels_v5, "Negative",
                {"ProductQuality": 2.4},
                {"ProductQuality.TechnicalDefect": 2.2},
                False, False,
                {"MECH_PART": 2.1, "CONTROL_FAULT": 1.5, "TRANSIT_DENT": 1.8},  # TRANSIT_DENT phải bị lọc vì L2 cha không bật!
            ),
        ),
        (
            "v5: đa L2 khác nhánh + 2 L3 khớp cả 2 L2 cha",
            meta_v5,
            make_case_logits(
                labels_v5, "Negative",
                {"ProductQuality": 1.8, "Delivery": 1.6},
                {"ProductQuality.TechnicalDefect": 1.4, "Delivery.DamagedInTransit": 1.9},
                False, False,
                {"NOISE_SMELL": 1.2, "TRANSIT_DENT": 2.0},
            ),
        ),
        (
            "v5: L2 trống (NONE cao) nhưng L3 WARRANTY_ACTIVATION vượt ngưỡng -> kéo theo L2 cha",
            meta_v5,
            make_case_logits(
                labels_v5, "Negative",
                {"NONE": 1.5},
                {"NONE": 1.2},
                False, False,
                {"WARRANTY_ACTIVATION": 1.4},
            ),
        ),
        (
            "v5: Khen thuần (NONE) -> không kéo L3",
            meta_v5,
            make_case_logits(
                labels_v5, "Positive",
                {"NONE": 3.0},
                {"NONE": 3.0},
                False, False,
                {"NONE": 3.0},
            ),
        ),
        (
            "v5: Mỉa mai + nóng yếu",
            meta_v5,
            make_case_logits(
                labels_v5, "Negative",
                {"ProductQuality": 1.1},
                {"ProductQuality.TechnicalDefect": 0.9},
                False, True,
                {"WEAK_HEAT": 0.2},  # sigmoid(0.2)=0.5498 >= 0.35
            ),
        ),
        (
            "v4 cũ (không có đầu root): tương thích ngược hoàn toàn",
            meta_v4,
            make_case_logits(
                labels_v4, "Negative",
                {"Delivery": 2.0},
                {"Delivery.LateDelivery": 1.8, "Delivery.DamagedInTransit": 0.5},
                False, False,
                roots=None,
            ),
        ),
    ]

    js_results = run_js_decode([{"meta": m, "logits": lg} for _, m, lg in cases])

    for (name, meta, lg), js_res in zip(cases, js_results):
        t_lg = {k: torch.tensor([v], dtype=torch.float32) for k, v in lg.items()}
        py_res = decode(t_lg, meta["labels"], meta["trainedTasks"],
                        multi_label=meta["multiLabel"], calibration=meta.get("calibration"))[0]
        svc_res, svc_dist, _, _ = explain_from_logits(t_lg, meta)

        assert py_res == svc_res, f"Lệch decode vs service /explain ở [{name}]:\n  py ={py_res}\n  svc={svc_res}"
        assert py_res == js_res, f"Lệch decode vs visobertBrowser.js ở [{name}]:\n  py ={py_res}\n  js ={js_res}"
        if meta["trainedTasks"].get("root"):
            assert "root" in svc_dist, f"service /explain thiếu distributions.root ở [{name}]"
        print(f"  OK   {name}")

    # Kiểm tra hành vi phân cấp cụ thể
    assert js_results[0]["rootCauseKeys"] == ["MECH_PART", "CONTROL_FAULT"], "TRANSIT_DENT sai L2 cha phải bị lọc"
    assert js_results[1]["rootCauseKeys"] == ["TRANSIT_DENT", "NOISE_SMELL"]
    assert js_results[2]["pulledByRoot"] is True
    assert js_results[2]["category"] == "CustomerService" and js_results[2]["cause"] == "UnresolvedCase"
    assert js_results[2]["rootCauseKeys"] == ["WARRANTY_ACTIVATION"]
    assert js_results[3]["category"] is None and js_results[3]["rootCauseKeys"] == []
    assert "rootCauses" not in js_results[5], "checkpoint v4 cũ không được tự thêm rootCauses"
    print(f"\nĐẠT 100% so khớp 3 nơi giải mã trên {len(cases)}/{len(cases)} ca kiểm thử!")


if __name__ == "__main__":
    main()
