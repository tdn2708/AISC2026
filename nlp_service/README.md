# nlp_service — ViSoBERT cho Customer Radar

Dịch vụ Python chạy mô hình **ViSoBERT** (`uitnlp/visobert`, Nguyen và cs., EMNLP 2023):
mô hình ngôn ngữ huấn luyện trên văn bản mạng xã hội tiếng Việt, đúng loại văn bản của
phản hồi TMĐT. Backend Node gọi sang qua HTTP ([visobert_client.js](../backend/services/visobert_client.js)).
Dịch vụ tắt thì hệ thống lùi về lớp luật, không có gì bị sập.

> **Giấy phép:** mặc định ViSoBERT chỉ cấp cho nghiên cứu. Nhóm đã xin phép nhóm tác giả
> để sử dụng (ghi nhận 15/09/2026). Trích dẫn bài báo là bắt buộc: mục [3] trong
> `docs/TAI-LIEU-THAM-KHAO.md`.

## Mô hình làm được gì trong hệ thống

| Điểm cắm | Cần checkpoint tinh chỉnh? | Tác dụng |
|---|---|---|
| `POST /embed` → T2 Trust Layer | Không | Kênh bổ sung cho vector token khi gom cụm trùng lặp. Với trọng số gốc chỉ bắt thêm được bản chép gần nguyên văn, **không** bắt được câu viết lại (xem mục hiệu chỉnh) |
| `POST /predict` → `analyzeFeedbackBatch` | Có (sentiment + category) | Gán nhãn cảm xúc, danh mục, nguyên nhân (giải mã phân cấp) thay cho luật |
| `POST /predict` → T1 Trust Layer | Có (spam) | Xác suất rác. **Không được một mình chặn phản hồi**, chỉ nâng một dấu hiệu yếu thành bằng chứng |
| `POST /predict` → dòng M của `npm run eval` | Có | Số F1 đo trên tập kiểm tra giữ riêng |
| `POST /analyze` (màn hình Phòng thí nghiệm) | Có | Hiển thị kết quả mô hình cạnh kết quả luật |

Trọng số gốc chưa học nhãn nào, nên **`/predict` bị khóa cho tới khi có checkpoint**.
Gắn lớp phân loại khởi tạo ngẫu nhiên lên rồi trả kết quả là bịa nhãn.

## 1. Cài đặt

Trọng số gốc (~390MB) phải nằm ở `AISC2026/visobert/` (cần `git lfs`):

```bash
git clone https://huggingface.co/uitnlp/visobert
```

```bash
cd nlp_service
python -m venv .venv
.venv\Scripts\activate                # Linux/macOS: source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # máy có GPU: pip install torch
pip install -r requirements.txt
```

## 2. Chuẩn bị dữ liệu

Luôn đi qua script Node, để lúc huấn luyện và lúc chạy thật dùng **chung một hàm tiền xử lý**
(`prepareInput`, có che PII):

```bash
cd backend
npm run nlp:prepare                   # labels.json + data/gold_dev.jsonl + data/gold_test.jsonl

# Tập tự gán nhãn theo taxonomy — mỗi dòng {text, sentiment?, category?, cause?, spam?}
npm run nlp:prepare -- --in nhan_tay.jsonl --out ../nlp_service/data/domain_train.jsonl

# UIT-ViSFD → nhãn cảm xúc (câu có khía cạnh trái dấu bị bỏ)
npm run nlp:prepare -- --in UIT-ViSFD/Train.csv --format visfd --out ../nlp_service/data/visfd_train.jsonl
```

Quy ước nhãn: khóa **vắng mặt** nghĩa là không có nhãn cho đầu ra đó; `category: null`
nghĩa là "không phải khiếu nại". Nhờ vậy trộn được UIT-ViSFD (chỉ có cảm xúc), tập spam
(chỉ có nhãn rác) và tập chuyên ngành vào cùng một lần huấn luyện.

`--input-mode masked` (mặc định) chỉ che PII, giữ teencode và emoji, vì ViSoBERT học trên
đúng dạng văn bản đó. `--input-mode normalized` đi qua toàn bộ normalizer, dùng để chạy
ablation.

## 3. Tinh chỉnh

```bash
python train.py --train data/visfd_train.jsonl data/domain_train.jsonl --epochs 5
```

- **Chống rò rỉ, không tắt được:** câu trùng `data/gold_test.jsonl` bị loại khỏi tập huấn
  luyện. Số câu bị loại và mã băm của tập kiểm tra được ghi vào `meta.json`. Dòng M trong
  `npm run eval` từ chối báo số cho checkpoint thiếu dấu này.
- `gold_dev.jsonl` chỉ dùng để chọn epoch, nên F1 dev của M **không độc lập**.
- CPU chạy được nhưng chậm. Nên train trên GPU (Colab T4 là đủ), rồi chép
  `checkpoints/visobert-absa/` về máy.
- Checkpoint lưu ở `checkpoints/visobert-absa/` (~400MB, không commit).

### Dữ liệu huấn luyện của checkpoint hiện tại

| Tệp | Số mẫu | Nhãn | Nguồn gốc nhãn |
|---|---|---|---|
| `visfd_train.jsonl` | 4.063 | cảm xúc | UIT-ViSFD, người gán. Chỉ giữ câu mà mọi khía cạnh cùng cực tính (bỏ 3.608 câu trái dấu) |
| `domain_train.jsonl` | 7.595 | cảm xúc, danh mục (đa nhãn), nguyên nhân (đa nhãn), rác | **Sinh từ khung câu** `data/corpus.js`; khoảng 40% do `openai/gpt-oss-120b` diễn đạt lại. Gồm 1.600 câu ghép 2–3 vấn đề thuộc danh mục khác nhau, 400 câu khen kèm chê, 1.100 câu trung tính. Nhãn theo cấu trúc sinh, **không phải người gán trên phản hồi thật** |

Dựng lại bằng `npm run nlp:build` (trong `backend/`). Chi tiết chống rò rỉ nằm trong
`data/domain_train.manifest.json`:

- **66/133 khung câu bị loại cả khung** vì có biến thể trùng mặt chữ với tập chuẩn
  (Jaccard ≥ 0.4). Nhiều câu gold được viết gần như nguyên văn từ khung câu; nếu không
  loại cả khung thì F1 đo được sẽ là học thuộc đáp án.
- **42 câu sinh ra bị loại thêm** ở lớp lọc từng câu.
- LLM chỉ nhận khung câu huấn luyện, **không bao giờ nhận câu của tập chuẩn**.
- Giới hạn: chỉ lọc được trùng mặt chữ, không loại trừ được trùng ý nghĩa ngẫu nhiên.
- Nhóm thiếu mẫu: DisplayError (31), MisleadingPromo (38), ComplexProcess (41). Mỗi nhóm
  chỉ còn 1 khung câu sau khi lọc, nên kết quả trên ba nguyên nhân này kém tin cậy.

### Đầu ra đa nhãn

Danh mục và nguyên nhân dùng **sigmoid độc lập** (BCE), không dùng softmax. Softmax buộc
tổng xác suất bằng 1 nên về cấu trúc không thể nói "câu này vừa giao chậm vừa shop không
trả lời". Giải mã:

- Mọi danh mục có xác suất ≥ 0.5 đều được ghi nhận. Danh mục mạnh nhất là **danh mục
  chính**, dùng cho bản ghi và các chỉ số đếm theo danh mục.
- Với mỗi danh mục đã ghi nhận, lấy nguyên nhân mạnh nhất **trong chính danh mục đó**.
  Nếu nguyên nhân dưới 0.3 thì vẫn trả về nhưng gắn cờ `causeUncertain`.
- Cảm xúc và rác vẫn là softmax một nhãn, có **trọng số lớp** nghịch đảo tần suất
  (Trung tính ×3.13, rác ×12.66).

Checkpoint một nhãn đời cũ vẫn chạy được: `meta.multiLabel` vắng thì dùng softmax như trước.

### Kết quả đo của checkpoint hiện tại

Train ngày 16/09/2026 trên CPU: 3 epoch, batch 16, max_len 96, gom lô theo độ dài, lưu epoch
2. Đo bằng `npm run eval` trên **tập kiểm tra giữ riêng** (48 câu, không dùng khi train hay
chọn epoch):

| Chỉ số | B1 luật | ViSoBERT 1 nhãn (15/09) | **ViSoBERT đa nhãn (16/09)** | Mục tiêu |
|---|---|---|---|---|
| Macro-F1 danh mục | 0.161 | 0.753 | **0.859** | 0.82, đạt |
| Accuracy danh mục | 0.333 | 0.771 | **0.875** (KTC 95%: 0.75–0.94) | — |
| Macro-F1 nguyên nhân | — | 0.563 | **0.616** | 0.70, chưa đạt |
| Macro-F1 cảm xúc | 0.439 | 0.828 | **0.514** | 0.78, chưa đạt |

Đối đầu từng câu (danh mục): cả hai đúng 14, **chỉ ViSoBERT đúng 28**, chỉ luật đúng 2, cả
hai sai 4.

**Cảm xúc giảm, và phải đọc đúng lý do.** Tập kiểm tra chỉ có 3 câu Trung tính và 7 câu Tích
cực; mô hình sai cả 3 câu Trung tính và 3 câu Tích cực, nên macro-F1 rơi mạnh. Các câu sai
rơi vào hai kiểu:

- Câu nêu ý định, chưa đánh giá ("Mình mua làm quà nên chưa mở ra dùng thử"). Chính các khung
  câu này đã bị bộ lọc rò rỉ loại khỏi dữ liệu train, nên mô hình chưa từng thấy kiểu câu đó.
- Câu khen chứa từ vựng khiếu nại ("không phải chờ lâu", "lo là giao chậm mà hóa ra nhanh",
  "chống sốc"). Mô hình học lối tắt từ dữ liệu sinh.

Nhóm **không** sinh thêm dữ liệu nhắm vào đúng các câu sai này, vì đó là chỉnh mô hình theo
đáp án tập kiểm tra. Cách sửa đúng là có tập gán nhãn thật đủ lớn, kèm một tập kiểm tra mới
chưa ai nhìn vào.

Bản đa nhãn đầu tiên (không trọng số lớp) được sao lưu ở `checkpoints/visobert-absa-multi-v1`:
danh mục 0.768, nguyên nhân 0.564, cảm xúc 0.539. Bản hiện tại tốt hơn trên cả danh mục lẫn
nguyên nhân.

## 4. Chạy dịch vụ

```bash
python service.py                     # http://127.0.0.1:8001
```

| Biến môi trường | Mặc định |
|---|---|
| `VISOBERT_BASE` | `../visobert` |
| `VISOBERT_CHECKPOINT` | `checkpoints/visobert-absa` |
| `VISOBERT_HOST` / `VISOBERT_PORT` | `127.0.0.1` / `8001` |
| `VISOBERT_MAX_LEN` | `256` (trần 512) |
| `VISOBERT_THREADS` | theo torch |

Phía backend (`backend/.env`):

| Biến | Ý nghĩa |
|---|---|
| `VISOBERT_URL` | Địa chỉ dịch vụ; `off` để tắt |
| `VISOBERT_INPUT_MODE` | `masked` hoặc `normalized` (checkpoint đã ghi kiểu nào thì dùng kiểu đó) |
| `VISOBERT_TRUST_SIGNALS` | `1` để Trust Layer dùng vector nhúng và xác suất rác. Lần đầu phải nhúng cả kho dữ liệu; các lần sau dùng bộ đệm |

Kiểm tra: `GET /api/nlp/status` trên backend.

## Hiệu chỉnh ngưỡng vector nhúng (T2)

Đo ngày 15/09/2026 bằng `POST /embed` với trọng số gốc (mean pooling, chuẩn hóa L2,
`inputMode=masked`):

| Cặp câu | Số cặp | Cosine (thấp nhất – trung vị – cao nhất) |
|---|---|---|
| Các review thuê trong TRUST_GOLD với nhau | 3 | 0.373 – 0.448 – 0.551 |
| Review thuê vs phản hồi thật | 24 | 0.238 – 0.305 – 0.471 |
| Phản hồi thật khác nhau (TRUST_GOLD) | 28 | 0.209 – 0.343 – 0.618 |
| Câu khác nhau (ASPECT_GOLD) | 3.160 | 0.052 – 0.344 – **0.756** |
| Câu thật vs chính nó thêm số/dấu ở cuối | 8 | **0.863** – 0.955 – 0.973 |

**Kết luận:**

1. **Vector nhúng gốc không tách được câu viết lại khỏi câu không liên quan.** Hai nhóm
   chồng lấn hoàn toàn ở vùng 0.3–0.6. Nếu hạ ngưỡng xuống đó để bắt câu viết lại, câu
   không liên quan cũng bị gom cụm hàng loạt.
2. **Ngưỡng chọn 0.90**, cao hơn hẳn mức cao nhất của câu khác nhau (0.756). Ở ngưỡng này
   kênh vector nhúng chỉ bổ sung được bản chép gần nguyên văn.
3. Vì vậy trong T2, vector nhúng là **kênh bổ sung (OR)** cho vector token, không thay thế.
   Bật nó không bao giờ làm mất cụm mà vector token đã bắt được; có kiểm thử khóa điều này.
4. Cỡ mẫu nhỏ (chỉ 3 cặp review thuê). Muốn vector nhúng thật sự bắt được câu viết lại
   thì phải tinh chỉnh bộ mã hóa theo kiểu học tương phản (SimCSE) trên cặp câu đồng
   nghĩa, rồi đo lại bảng này.

Vì kênh này mới cho lợi ích nhỏ mà lại tốn thời gian nhúng cả kho dữ liệu, nên
`VISOBERT_TRUST_SIGNALS` mặc định tắt.

Chạy lại phép đo: khởi động `service.py`, rồi chạy script hiệu chỉnh trên `TRUST_GOLD`
và `ASPECT_GOLD` (so cosine từng cặp của `visobert_client.embed`).
