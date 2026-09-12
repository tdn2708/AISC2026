# Customer Radar

Hệ thống phân tích phản hồi khách hàng đa kênh, có **tầng kiểm soát tin cậy dữ liệu
(Data Trust Layer)** đặt trước tầng phân tích.

Đội LDS — Khoa Hệ thống Thông tin, Trường Đại học Công nghệ Thông tin.

---

## Vấn đề mà kiến trúc này giải quyết

Mọi chỉ số và khuyến nghị của một hệ thống phân tích phản hồi đều suy ra từ một giả
định nền: **mỗi phản hồi tương ứng với một trải nghiệm có thật của một khách hàng có
thật.** Trên sàn thương mại điện tử Việt Nam, giả định này sai một cách hệ thống —
đánh giá tăng cường do shop tự đặt, đánh giá hạ uy tín do đối thủ thuê, bình luận
quảng cáo và bot, đánh giá một chữ để nhận xu.

Hệ quả nguy hiểm nhất không phải sai số thống kê, mà là **hệ thống đưa ra đề xuất
hành động sai**: khuyên doanh nghiệp đổi nhà vận chuyển vì một cụm đánh giá hạ uy tín
do đối thủ đặt.

Vì vậy Trust Layer là một thành phần kiến trúc độc lập, không phải một bước làm sạch
văn bản. Nó không loại bỏ dữ liệu một cách nhị phân mà **gán cho mỗi phản hồi một
trọng số tin cậy**, và mọi chỉ số phía sau được tính trên tổng trọng số thay vì đếm thô.

---

## Chạy dự án

```bash
# Backend
cd backend
npm install
cp .env.example .env        # điền MONGODB_URI và các khóa API
npm run seed                # nạp dữ liệu thử nghiệm (GHI ĐÈ dữ liệu hiện có)
npm start                   # http://localhost:5000

# Kiểm thử (không cần MongoDB, không gọi mô hình ngôn ngữ)
npm test

# Frontend
cd ..
npm install
npm run dev
```

Tài khoản dùng thử được in sẵn trên màn hình đăng nhập.

---

## Kiến trúc

```
Nguồn dữ liệu → Thu thập (API/Webhook) → Chuẩn hóa tiếng Việt + che PII
                                              ↓
                                    ┌──────────────────────┐
                                    │   DATA TRUST LAYER   │
                                    │  T0 Phân hạng nguồn  │
                                    │  T1 Lọc rác          │
                                    │  T2 Xác thực (5 t/h) │
                                    │  T3 Trọng số hợp nhất│
                                    │  T4 Kiểm duyệt       │
                                    │  T5 Sức khỏe dữ liệu │
                                    └──────────┬───────────┘
                                               ↓
        Phân loại phân cấp (ABSA + Level 1→2) → Chỉ số có trọng số (WCR)
                                               ↓
          Kiểm định thống kê (z-test + EWMA + hiệu chỉnh FDR)
                                               ↓
            Playbook Engine → Đề xuất hành động (chờ phê duyệt)
```

### Tầng Kiểm soát Tin cậy Dữ liệu

| Tầng | Nội dung |
|------|----------|
| T0 | Phân hạng nguồn gốc P1–P5, trọng số 1.00 → 0.15. Hạng P5 không đủ điều kiện kích hoạt cảnh báo mức Cao/Nghiêm trọng |
| T1 | Lọc nội dung rác và quảng cáo. Ưu tiên Precision, vì loại nhầm một khiếu nại thật là đánh mất đúng thứ khách hàng trả tiền để nghe |
| T2 | Năm nhóm tín hiệu độc lập → Điểm Xác thực A ∈ [0,1] qua hồi quy logistic |
| T3 | `w = w(hạng nguồn) × (1 − A) × 0.5^(t/H)`, H = 30 ngày |
| T4 | Hàng đợi kiểm duyệt xếp theo độ bất định của mô hình, không theo thời gian |
| T5 | Phễu dữ liệu công khai + Chỉ số Sức khỏe Dữ liệu |

**Năm nhóm tín hiệu ở T2**

1. **Trùng lặp gần về nội dung** — SimHash lọc thô, cosine gom cụm; yêu cầu cụm nằm gọn trong cửa sổ 48 giờ *và* đủ mật độ. Nội dung giống nhau rải đều nhiều ngày không phải chiến dịch.
2. **Đột biến thời gian** — cửa sổ trượt 1 giờ, nền ước lượng bằng trung vị và MAD. Dùng độ lệch chuẩn thường thì chính đợt đột biến sẽ thổi phồng cái nền mà nó đang bị đem ra so.
3. **Bất thường hành vi tài khoản** — Isolation Forest kết hợp một lớp luật. Rừng cô lập điểm *hiếm*; khi chiến dịch thuê chiếm tỉ trọng lớn thì tài khoản ảo không còn hiếm nữa, đúng lúc cần nhất.
4. **Bất nhất điểm sao và nội dung** — chỉ tính khi có *cả hai* vế để so.
5. **Bất nhất với dữ liệu giao dịch** — chính xác nhất trong năm nhóm, và là lý do trực tiếp chọn mô hình dữ liệu first-party.

### Chỉ số

`WCR(t) = (Σ w(i), i là khiếu nại trong kỳ t) / Transactions(t)`

WCR **chỉ tính được trên kênh đối soát được giao dịch**. Bình luận Facebook, TikTok hay
Google Maps không gắn với giao dịch nào, nên mẫu số đơn giản là không tồn tại. Với các
kênh đó hệ thống dùng chỉ số thay thế **trong cùng kênh** — Tỉ trọng phản hồi tiêu cực
và Tốc độ tăng so với nền của chính kênh đó. Mỗi thẻ chỉ số trên giao diện ghi rõ mẫu
số và độ phủ đang dùng.

### Cảnh báo

Ngưỡng cố định kiểu "tăng 40% thì báo động" hỏng ở cả hai đầu quy mô: gian hàng nhỏ bị
cảnh báo giả liên tục, doanh nghiệp lớn bị bỏ sót. Thay bằng:

- Kiểm định tỉ lệ hai mẫu, cửa sổ hiện tại so với nền 28 ngày
- **Điều kiện kép**: p < 0.01 *và* ΔWCR ≥ 0.5 điểm phần trăm hoặc ≥ 20 khách bị ảnh hưởng
- Biểu đồ kiểm soát EWMA (λ = 0.2, L = 3) cho kiểu suy giảm chậm và đều
- Hiệu chỉnh đa kiểm định Benjamini–Hochberg, FDR = 0.05
- Gộp các cảnh báo trùng sự việc, giữ lại bản cụ thể nhất

### Khuyến nghị hành động

Playbook Engine ánh xạ `(nguyên nhân × mức nghiêm trọng)` sang thư viện hành động đã
chuẩn hóa. Tầng sinh ngôn ngữ chỉ diễn đạt lại, không thêm dữ kiện.

> **Hệ thống không tự thực thi bất kỳ hành động nào phát sinh chi phí hoặc tác động tới
> khách hàng cuối.** Mọi hành động đều ở dạng đề xuất kèm bằng chứng và độ tin cậy, và
> phải được người có thẩm quyền phê duyệt.

---

## API

| Endpoint | Mô tả |
|---|---|
| `GET /api/stats` | Thẻ chỉ số, mỗi thẻ kèm mẫu số và độ phủ |
| `GET /api/trust/health` | Phễu dữ liệu + Chỉ số Sức khỏe Dữ liệu |
| `GET /api/trust/clusters` | Cụm trùng lặp gần, kèm tín hiệu đã kích hoạt |
| `GET /api/trust/queue` | Hàng đợi kiểm duyệt theo độ bất định |
| `POST /api/trust/label` | Ghi nhãn người kiểm duyệt (học chủ động) |
| `GET /api/trust/impact` | So sánh có/không có Trust Layer |
| `GET /api/alerts` | Cảnh báo kèm bằng chứng thống kê và playbook |
| `GET /api/alerts/:id/evidence` | Phản hồi gốc đứng sau một cảnh báo |
| `GET /api/recommendations` | Khuyến nghị đang chờ quyết định |
| `POST /api/recommendations/decision` | Chấp nhận / Bỏ qua (bỏ qua phải nêu lý do) |
| `POST /api/analyze` | Phân tích trực tiếp một câu |
| `GET /api/taxonomy` | Cây taxonomy nhãn |
| `POST /api/transactions` | Nạp dữ liệu giao dịch (mẫu số của WCR) |

---

## Pháp lý và quyền riêng tư

Mô hình dữ liệu chính là **first-party**: doanh nghiệp cấp quyền truy cập gian hàng /
fanpage của chính họ qua API chính thức. Đây là lựa chọn có chủ đích, không phải hạn
chế bị buộc phải chấp nhận — nó đổi lấy tính hợp pháp, `order_id` để tính WCR thật, và
khả năng đối soát review với đơn hàng thật.

Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân: doanh nghiệp là **Bên Kiểm soát
dữ liệu**, Customer Radar là **Bên Xử lý dữ liệu** theo hợp đồng. Thông tin cá nhân
được che ngay ở bước tiền xử lý, trước khi văn bản chạm tới mô hình hoặc được ghi log.

Quét dữ liệu công khai chỉ dùng trong phạm vi hẹp: dữ liệu công khai, phục vụ đối sánh
cạnh tranh, có giới hạn tần suất, tuân thủ `robots.txt`, không lưu PII.

---

## Giới hạn đã biết

Ghi rõ để không ai hiểu nhầm mức độ trưởng thành của hệ thống:

- **Hệ số của mô hình xác thực là giá trị hiệu chỉnh ban đầu**, chưa huấn luyện trên tập
  gán nhãn. Hàm `fitAuthenticityModel()` đã sẵn sàng nhận tập ~1.000 mẫu khi có.
- **Nhãn "không xác thực" là phán đoán dựa trên dấu hiệu quan sát được**, không phải sự
  thật đã được xác minh — không có cách nào xác minh tuyệt đối một đánh giá là thật hay
  giả từ dữ liệu công khai. Do đó các chỉ số của Trust Layer được diễn giải là **mức độ
  đồng thuận với đánh giá của con người**, không phải độ chính xác tuyệt đối.
- **Phân loại hiện chạy bằng luật từ khóa** (baseline B1) và mô hình ngôn ngữ theo lô.
  Mô hình PhoBERT tinh chỉnh cho ABSA sẽ thay lớp này; luật được giữ lại để đối chứng.
- **Chưa có số F1 đo trên tập kiểm tra giữ riêng.** Khung chỉ số đánh giá đã được định
  nghĩa trong `services/statistics.js`, nhưng kết quả thực nghiệm cần tập UIT-ViSFD và
  tập chuyên ngành tự gán nhãn.

---

## Cấu trúc mã nguồn

```
backend/
  services/
    taxonomy.js          7 danh mục × 27 nguyên nhân, ánh xạ nhãn cũ
    normalizer.js        Chuẩn hóa teencode/tiếng lóng + che PII
    trust_layer.js       T0–T5, năm nhóm tín hiệu xác thực
    anomaly.js           Isolation Forest (Liu, Ting & Zhou 2008)
    statistics.js        z-test, EWMA, Benjamini–Hochberg, điểm nghiêm trọng
    metrics.js           WCR và các chỉ số thay thế
    alert_engine.js      Sinh cảnh báo, hiệu chỉnh, gộp trùng
    playbook.js          Thư viện hành động, quy tắc phê duyệt
    ai_analyzer.js       Gán nhãn theo lô, dự báo, trợ lý hội thoại
    analysis_context.js  Ngữ cảnh dùng chung + bộ nhớ đệm
  test/run_tests.js      37 kiểm thử hồi quy

src/components/
  Logo.jsx               Nhận diện thương hiệu dùng chung
  TrustLayer.jsx         Phễu dữ liệu, cụm nghi vấn, hàng đợi kiểm duyệt
  KPICards.jsx           Thẻ chỉ số kèm mẫu số
  RiskAlerts.jsx         Cảnh báo kèm bằng chứng thống kê
```
