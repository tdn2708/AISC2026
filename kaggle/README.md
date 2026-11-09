# Huấn luyện ViSoBERT v4 trên Kaggle: mỉa mai, số sao, nhiều nguyên nhân

Quy trình gồm 4 bước. Bước 1 và 3 làm trên máy, bước 2 và 4 chạy trên Kaggle (GPU miễn phí).

## 0. Trước đó: đội duyệt nhãn trên web

Vào **Tin cậy dữ liệu → Kiểm tra ngẫu nhiên**, chọn kho **Dữ liệu thật**.

| Hàng đợi | Dùng để | Mục tiêu |
|---|---|---|
| Ngẫu nhiên | Đo độ chính xác của AI (con số báo cáo) | 300 câu |
| Nghi mỉa mai | Dữ liệu mỉa mai thật để huấn luyện | Duyệt hết |
| Cần duyệt | Hai mô hình bất đồng; nhãn của người là nhãn cuối | Duyệt hết |

Mỗi câu mất khoảng 10–15 giây. Nhãn người thay nhãn máy ngay trên web.

Khoảng 15% câu thuộc **bộ test mù**, chọn cố định theo mã băm. Nhãn người trên các câu này chỉ dùng để đo, không bao giờ dùng để huấn luyện.

## 1. Xuất dữ liệu cho mô hình thầy (trên máy)

```bash
cd backend
node scripts/teacher_io.js export
```

Lệnh này tạo hai tệp trong `nlp_service/data/real/`:
- `teacher_input.jsonl`: đánh giá đã che thông tin cá nhân, kèm số sao;
- `taxonomy.json`.

## 2. Mô hình thầy Qwen3 gán nhãn toàn bộ kho (Kaggle)

1. Kaggle → Datasets → New dataset, tên `customer-radar-real`. Tải lên hai tệp ở bước 1.
2. Mở `kaggle/01_teacher_qwen3.ipynb` (Kaggle → Code → Import notebook) và cài đặt:
   - Accelerator: **GPU T4 x2**
   - Internet: **On**
   - Add Data: dataset `customer-radar-real`
3. Bấm Run All. Thời gian:
   - Qwen3-8B: khoảng 2–4 giờ cho khoảng 4.000 câu;
   - đổi `MODEL_ID = "Qwen/Qwen3-4B"` thì nhanh gấp đôi.

   Nếu bị ngắt giữa chừng, chạy lại: notebook tự làm tiếp từ chỗ dừng.
4. Tải `/kaggle/working/teacher_output.jsonl` về máy.

## 3. Nhập nhãn thầy và xuất bộ huấn luyện (trên máy)

```bash
cd backend
node scripts/teacher_io.js import ../teacher_output.jsonl --model=Qwen/Qwen3-8B
node scripts/export_training_data.js
```

- Nhãn thầy nằm trong collection riêng `teacher_labels` và **không** đổi nhãn đang hiển thị trên web.
- `export_training_data.js` tạo `nlp_service/data/real/`:

| Tệp | Nội dung |
|---|---|
| `train.jsonl` | Nhãn người (trọng số 1) và nhãn thầy (trọng số 0,5) |
| `dev.jsonl` | Nhãn người, dùng để chọn epoch |
| `test.jsonl` | Nhãn người trên bộ test mù |
| `manifest.json` | Nguồn gốc của từng tệp |

## 4. Huấn luyện v4 (Kaggle)

1. Tạo dataset `customer-radar-v4` chứa thư mục `nlp_service/`: mã nguồn, `labels.json`, và `data/`. **Không** đưa vào `checkpoints/` và `.venv/`.
2. Mở `kaggle/02_train_visobert_v4.ipynb`, cài đặt:
   - GPU T4 (1 GPU là đủ)
   - Internet On
   - Add Data: dataset `customer-radar-v4`

   Rồi bấm Run All, mất khoảng 30–60 phút.
3. Tải về ba tệp:
   - `ckpt-v4.zip`: checkpoint PyTorch;
   - `onnx-v4.zip`: bản ONNX int8, khoảng 98 MB, cho trình duyệt;
   - `test_report.json`: **con số được phép báo cáo**, đo trên test mù và có F1 riêng cho câu mỉa mai.

## 5. Đưa v4 vào dùng

- **Máy chủ có dịch vụ mô hình:** giải nén `ckpt-v4.zip` vào `nlp_service/checkpoints/visobert-absa`. Nên sao lưu bản cũ trước.
  - Checkpoint v4 có `inputRating: true` trong `meta.json`, nên backend tự thêm tiền tố số sao.
  - Checkpoint cũ không có cờ này và vẫn chạy như trước.
- **Bản web dùng mô hình trên trình duyệt:** đẩy nội dung `onnx-v4.zip` lên kho Hugging Face của mô hình bằng `nlp_service/deploy/push_onnx.py`; cần token HF của bạn.
  - Trình duyệt tự nhận đầu ra `sarcasm_logits`.
  - Bộ giải mã trả nhiều nguyên nhân trong cùng một nhóm.

## Quy tắc trung thực

- Chỉ báo con số đo trên `test.jsonl`, tức bộ test mù.
- Không sửa dữ liệu huấn luyện theo những câu test đang sai.
- Không dùng câu mỉa mai tự viết. Lần thử trước mô hình chỉ học thuộc mẫu câu.
- `phamluan/vn_msa_sar` **không** được dùng, vì hai lý do:
  - bộ này không ghi giấy phép;
  - 397/450 câu mỉa mai là câu sinh thêm.
