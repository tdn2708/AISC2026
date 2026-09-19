# Customer Radar — Bối cảnh và Tiến độ

Tài liệu này ghi lại toàn bộ bối cảnh của đợt nâng cấp mã nguồn, để bất kỳ thành viên
nào mở dự án lên cũng hiểu được *tại sao* từng quyết định kỹ thuật được đưa ra, chứ
không chỉ *cái gì* đã thay đổi.

Cập nhật lần cuối: 11/09/2026

---

## 1. Xuất phát điểm

Ban giám khảo vòng 1 để lại một nhận xét duy nhất nhưng chỉ đúng vào nền móng đề tài:

> "nhóm có thể làm rõ cơ chế kiểm soát chất lượng dữ liệu đầu vào (lọc spam/đánh giá
> ảo) và minh chứng hiệu quả thực tế từ mô hình thử nghiệm Pilot,… từ đó xây dựng demo
> phù hợp."

Dịch sang ngôn ngữ kỹ thuật, nhận xét đó gồm ba vế:

1. **Nguyên liệu đầu vào chưa được chứng minh là sạch.** Toàn bộ chuỗi giá trị của sản
   phẩm đứng trên một giả định: mỗi dòng phản hồi = một tiếng nói khách hàng thật. Trên
   sàn TMĐT Việt Nam, giả định này sai một cách hệ thống.
2. **Chưa có một con số nào tự đo được.** Bản thuyết minh dùng ba lần số minh họa
   ("tăng 40%", "Late delivery 52%") mà không ghi rõ đó là số giả định.
3. **Demo phải hiển thị được chính hai thứ vừa hỏi** — chất lượng dữ liệu đầu vào, và
   bằng chứng hiệu quả.

---

## 2. Những lỗ hổng đã được vá trong mã nguồn

### 2.1. Tầng Kiểm soát Tin cậy Dữ liệu (lỗ hổng A1)

**Hiện trạng cũ:** mục tiền xử lý chỉ có làm sạch kỹ thuật — chuẩn hóa định dạng, lọc
HTML, dịch teencode, che PII. Cả bốn bước đều làm cho văn bản *dễ đọc với máy hơn*,
không bước nào *xác thực tính hợp lệ* của phản hồi. Một review ảo đi qua bốn bước đó sẽ
trở thành một review ảo sạch sẽ, đúng định dạng JSON, và được đếm đủ 1 điểm như review
thật.

**Đã làm:** `backend/services/trust_layer.js` — một thành phần kiến trúc độc lập đặt
giữa tầng thu thập và tầng phân tích, gồm sáu tầng con T0–T5. Nguyên tắc cốt lõi: không
loại bỏ nhị phân, mà **gán trọng số tin cậy**; mọi chỉ số phía sau tính trên tổng trọng
số thay vì đếm thô.

Năm nhóm tín hiệu độc lập ở tầng T2, cùng những cạm bẫy đã gặp khi cài đặt:

| Tín hiệu | Cài đặt | Cạm bẫy đã xử lý |
|---|---|---|
| Trùng lặp gần nội dung | SimHash lọc thô + cosine gom cụm | Cụm phải nằm gọn trong 48 giờ **và** đủ mật độ. Nội dung giống nhau rải đều nhiều ngày không phải chiến dịch — câu ngắn kiểu "giao hàng nhanh" trùng nhau là bình thường |
| Đột biến thời gian | Cửa sổ trượt 1 giờ, nền ước lượng bằng trung vị + MAD | Dùng độ lệch chuẩn thường thì **chính đợt đột biến sẽ thổi phồng cái nền mà nó đang bị đem ra so** — càng nhiều đánh giá thuê thì z càng nhỏ |
| Bất thường hành vi tài khoản | Isolation Forest + lớp luật | Rừng chỉ cô lập điểm *hiếm*; khi chiến dịch thuê chiếm tỉ trọng lớn thì tài khoản ảo không còn hiếm, đúng lúc cần nhất |
| Bất nhất điểm sao / nội dung | Độ lệch giữa sao chuẩn hóa và cực tính ABSA | Chỉ tính khi có **cả hai** vế; thiếu nhãn cảm xúc thì tín hiệu không khả dụng, không phải bằng chứng |
| Bất nhất với giao dịch | Đối soát mã đơn và mốc giao hàng | Hai lỗi suýt mắc: (a) sổ đơn hàng chưa kết nối mà vẫn suy ra "đơn không tồn tại" → loại nhầm hàng loạt khiếu nại thật; (b) mốc "đã giao" thường đồng bộ trễ vài giờ, nên cần dung sai 12 giờ |

### 2.2. Cảnh báo có ý nghĩa thống kê (lỗ hổng chính của mục 6.4 cũ)

**Hiện trạng cũ:** "khiếu nại giao hàng tăng 40%" — ngưỡng phần trăm cố định.

Ngưỡng cố định hỏng ở **cả hai đầu quy mô**: gian hàng nhỏ có ít phản hồi nên dao động
ngẫu nhiên thường xuyên vượt ngưỡng, sinh cảnh báo giả liên tục cho tới khi người dùng
tắt thông báo; doanh nghiệp lớn thì một thay đổi nhỏ về phần trăm có thể tương ứng hàng
nghìn khách hàng nhưng không đủ vượt ngưỡng.

**Đã làm:** `backend/services/statistics.js` + `alert_engine.js`

- Kiểm định tỉ lệ hai mẫu, cửa sổ hiện tại so với nền 28 ngày
- **Điều kiện kép**: p < 0.01 *và* (ΔWCR ≥ 0.5 điểm phần trăm hoặc ≥ 20 khách bị ảnh
  hưởng). Vế thứ hai là bắt buộc: với cỡ mẫu rất lớn, gần như mọi chênh lệch đều đạt ý
  nghĩa thống kê
- Biểu đồ kiểm soát EWMA (λ = 0.2, L = 3) cho kiểu suy giảm chậm và đều — kiểu nguy
  hiểm nhất vì không ngày nào đủ xấu để gây chú ý
- Hiệu chỉnh đa kiểm định Benjamini–Hochberg, FDR = 0.05
- Gộp cảnh báo trùng sự việc, giữ bản cụ thể nhất

### 2.3. Complaint Rate bất khả thi về mặt dữ liệu (lỗ hổng A2)

**Hiện trạng cũ:** CR = Tổng khiếu nại / Tổng giao dịch được đặt làm chỉ số ký hiệu của
cả sản phẩm. Nhưng bình luận Facebook, TikTok, Google Maps **không gắn với giao dịch
nào cả**, và kiến trúc dữ liệu cũ chưa hề có nguồn giao dịch. Đây là lỗi logic tự mâu
thuẫn trong chính tài liệu.

**Đã làm:** `backend/services/metrics.js`

- WCR **chỉ tính trên kênh đối soát được** (hạng P1/P2, có mã đơn)
- Kênh không đối soát được dùng chỉ số thay thế **trong cùng kênh**: Tỉ trọng phản hồi
  tiêu cực và Tốc độ tăng so với nền của chính kênh đó
- Mỗi thẻ chỉ số ghi rõ **mẫu số và độ phủ** đang dùng
- Bổ sung nguồn dữ liệu thứ 5: collection `transactions`, API `POST /api/transactions`
- Thiếu mẫu số thì trả `available: false`, **không trả ra một con số bịa**

### 2.4. Taxonomy nhãn và mâu thuẫn nội tại (lỗi C1, C2)

**Hiện trạng cũ:** bảng 6.3 ghi "Shipper dth thương nhưng hàng móp méo" → "Giao hàng:
Tích cực / Sản phẩm: Tiêu cực", nhưng cột nguyên nhân lại ghi "Damaged package trong
quá trình vận chuyển". Bảng tự phản bác chính nó trong cùng một dòng. Dòng khác trộn
"Nhân viên: Tiêu cực" (nhãn cảm xúc) với "Chi nhánh: Chi nhánh A" (thực thể).

**Đã làm:** `backend/services/taxonomy.js` — 7 danh mục × 27 nguyên nhân cốt lõi.

Nguyên tắc phân nhánh được ghi thẳng vào mã: **theo bộ phận có thể hành động để khắc
phục**, không theo đối tượng được nhắc tới trong câu. Vì vậy hư hỏng khi vận chuyển
thuộc nhánh Giao hàng. Có kiểm thử khóa chặt điều này.

Đầu ra NER được tách hẳn khỏi đầu ra ABSA trong `ai_analyzer.js` (`entities` vs
`aspects`).

### 2.5. Prescriptive Analytics hộp đen (lỗ hổng B3) và rủi ro tài chính (lỗi C3)

**Hiện trạng cũ:** "ứng dụng thuật toán học máy để tự động sinh Business
Recommendation" — không mô tả cơ chế. Và bảng hành động ghi "**Tự động** gửi voucher
xin lỗi". Một hệ thống tự phát voucher dựa trên phán đoán của mô hình NLP là lỗ hổng
tài chính: mô hình sai, hoặc có người phát hiện quy luật kích hoạt, là doanh nghiệp mất
tiền hàng loạt.

**Đã làm:** `backend/services/playbook.js` — rule engine ánh xạ playbook, có 15 playbook
theo nguyên nhân cốt lõi, mỗi playbook có hai mức (thường / leo thang).

Nguyên tắc an toàn được mã hóa thành dữ liệu, không chỉ là lời hứa trong tài liệu: mỗi
bước hành động mang cờ `incursCost` / `touchesCustomer` → `requiresApproval` +
`approvalRole`. `autoExecuted` luôn `false`. Có kiểm thử khóa chặt.

### 2.6. Rủi ro pháp lý scraping (lỗ hổng B1)

**Đã làm:** `backend/services/scraper.js` — kiểm tra `robots.txt`, giới hạn tần suất 5
giây/tên miền, không lưu PII. Quan trọng hơn: **bỏ hẳn nhánh sinh dữ liệu giả khi bị
chặn**. Bản cũ khi Shopee trả 403 thì gọi LLM sinh 10 review bịa rồi lưu vào cùng kho
với dữ liệu thật — đúng thứ mà cả Trust Layer sinh ra để ngăn.

### 2.7. Số minh họa lẫn với số đo thật

**Hiện trạng cũ:** `KPICards.jsx` hiển thị "NPS Score 42", "+12%", "-2.1%" — viết cứng
trong mã, không có nguồn dữ liệu nào phía sau. `ai_analyzer.js` khi lỗi thì sinh nhãn
**ngẫu nhiên** (`Math.random()`), làm mọi biểu đồ phía sau trông như đang hoạt động
trong khi không mang thông tin nào.

**Đã làm:** thẻ chỉ số chỉ hiển thị số tính được; lớp dự phòng của bộ gán nhãn chuyển
sang phân loại theo luật từ khóa (mọi nhãn truy vết được về từ khóa đã khớp); dự phòng
của dự báo chuyển sang thống kê mô tả trên dữ liệu thật.

### 2.8. Vấn đề bảo mật phát hiện trong lúc rà soát

Ba vấn đề **không nằm trong yêu cầu ban đầu** nhưng nghiêm trọng:

1. `backend/seed_rich_data.js` và `backend/test-mongo.js` nhúng cứng chuỗi kết nối
   MongoDB kèm tài khoản và mật khẩu. Đã gỡ khỏi mã nguồn.
2. `.gitignore` có dòng `backend/.env` nhưng được ghi bằng **mã hóa UTF-16**, nên git
   không đọc được và tệp `.env` chứa khóa API thật **không hề được bỏ qua**. Đã viết
   lại bằng UTF-8.
3. **Hai chuỗi kết nối trên vẫn nằm trong lịch sử git** (commit `4fc5efe` và `05cbd2e`).
   Gỡ khỏi tệp không gỡ được khỏi lịch sử.

> ⚠️ **Việc cần làm thủ công:** đổi mật khẩu hai tài khoản MongoDB đó trên Atlas. Chỉ
> đổi mã nguồn là chưa đủ.

---

## 3. Trạng thái hiện tại

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
  test/run_tests.js      Kiểm thử hồi quy

src/components/
  Logo.jsx               Nhận diện thương hiệu dùng chung
  TrustLayer.jsx         Phễu dữ liệu, cụm nghi vấn, hàng đợi kiểm duyệt
  KPICards.jsx           Thẻ chỉ số kèm mẫu số
  RiskAlerts.jsx         Cảnh báo kèm bằng chứng thống kê
```

Kiểm chứng: `npm test` trong `backend/` — toàn bộ kiểm thử đạt, không cần MongoDB và
không gọi mô hình ngôn ngữ.

---

## 4. Khung đánh giá mô hình (bổ sung 11/09)

### 4.1. Con số F1 đầu tiên, và bài học đắt nhất của đợt này

Chạy `npm run eval` trong `backend/`. Kết quả trên **tập kiểm tra giữ riêng**:

| Mã | Mô hình | F1 (kiểm tra) | F1 (phát triển) |
|---|---|---|---|
| B1 | Từ điển cảm xúc + luật | **0.1611** | 0.9731 |
| B2 | Phân loại cảm xúc toàn câu | không bóc tách được khía cạnh | — |
| B3 | Mô hình ngôn ngữ zero-shot | chưa chạy (cần khóa API) | — |
| M | ViSoBERT tinh chỉnh, đa nhãn | **0.8590** | 0.6844 (dùng để chọn epoch) |

> **Cập nhật 15/09:** mô hình đề xuất chuyển từ PhoBERT sang **ViSoBERT** (uitnlp/visobert,
> EMNLP 2023), đã tinh chỉnh và đo trên tập kiểm tra giữ riêng (48 câu):
>
> | Chỉ số | B1 luật | M một nhãn (15/09) | **M đa nhãn (16/09)** | Mục tiêu |
> |---|---|---|---|---|
> | Macro-F1 danh mục | 0.161 | 0.753 | **0.859** | 0.82, đạt |
> | Accuracy danh mục | 0.333 | 0.771 | **0.875** (KTC 95%: 0.75–0.94) | — |
> | Macro-F1 nguyên nhân | — | 0.563 | **0.616** | 0.70, chưa đạt |
> | Macro-F1 cảm xúc | 0.439 | 0.828 | **0.514** | 0.78, chưa đạt |
>
> Đối đầu từng câu (danh mục, bản đa nhãn): cả hai đúng 14, **chỉ ViSoBERT đúng 28**, chỉ
> luật đúng 2, cả hai sai 4.
>
> **16/09 — chuyển sang đa nhãn.** Bản một nhãn dùng softmax nên không thể nêu hai vấn đề
> trong cùng một phản hồi ("giao chậm, nhắn shop không ai trả lời" chỉ ra Giao hàng). Bản
> mới dùng sigmoid độc lập cho danh mục và nguyên nhân, train thêm 1.600 câu ghép nhiều vấn
> đề, và ra đủ cả Giao hàng lẫn Dịch vụ khách hàng. Cái giá: **cảm xúc giảm** (0.828 → 0.514).
> Toàn bộ mức giảm nằm ở 3 câu Trung tính và 3 câu Tích cực của tập kiểm tra (câu nêu ý định;
> câu khen chứa từ vựng khiếu nại như "không phải chờ lâu"). Nhóm không tinh chỉnh dữ liệu
> theo đúng các câu sai này để tránh rò rỉ; cần tập gán nhãn thật.
>
> **18/09 — thử dạy mỉa mai, không giữ.** Thêm 840 câu mỉa mai sinh từ khoảng 20 khung câu.
> Nguyên nhân tăng lên 0.702 và cảm xúc lên 0.592, nhưng danh mục giảm còn 0.798. Câu mỉa mai
> trên demo **vẫn sai**, và câu hai vấn đề mất một khía cạnh. Mô hình học thuộc khung câu chứ
> không khái quát được mỉa mai. Nhóm quay về bản ngày 16/09. Chi tiết:
> `nlp_service/README.md`, mục "Thí nghiệm dạy mỉa mai".
>
> **Giới hạn bắt buộc nêu kèm:** nhãn danh mục khi train lấy từ tập **sinh từ khung câu**
> (một phần do LLM diễn đạt lại), chưa phải người gán trên phản hồi thật. Nhãn cảm xúc lấy
> từ UIT-ViSFD. Tập kiểm tra nhỏ, một người gán. Chi tiết dữ liệu và chống rò rỉ nằm ở
> `nlp_service/README.md`.

**Khoảng cách 0.97 → 0.16 chính là phát hiện quan trọng nhất.** Cùng một bộ phân loại
luật khớp gần như hoàn hảo trên tập đã dùng để tinh chỉnh từ khóa, nhưng sụp đổ trên câu
chưa từng thấy. Đây là bằng chứng **định lượng** cho việc cần mô hình ngôn ngữ tinh
chỉnh, thay vì tiếp tục mở rộng danh sách từ khóa — mạnh hơn nhiều so với lập luận suông.

Bài học về phương pháp, đã mã hóa thành kiểm thử tự động:

> Trong lần chạy đầu, F1 nhảy từ 0.19 lên **0.97** sau khi mở rộng từ khóa. Mức tăng đẹp
> tới mức đáng ngờ. Kiểm tra lại thì 61 từ khóa mới được lấy ra từ chính câu văn trong
> tập kiểm tra. Mô hình không khái quát hóa tốt hơn, nó chỉ học thuộc đáp án.
>
> Đã gỡ 61 từ khóa đó, và viết `evaluation/contamination.js` để kiểm tra rò rỉ tự động
> mỗi lần chạy. Có một kiểm thử khóa chặt điều này, nên nếu ai đó lặp lại sai lầm cũ thì
> `npm test` đỏ ngay, thay vì để một con số đẹp trôi vào báo cáo.

### 4.2. Trust Layer — đo đúng cách

| Chỉ số | Mục tiêu | Đo được | |
|---|---|---|---|
| Precision bộ lọc rác | ≥ 0.95 | 1.000 | ĐẠT |
| Precision phát hiện không xác thực | ≥ 0.75 | 1.000 | ĐẠT |
| Tỉ lệ loại nhầm phản hồi thật | ≤ 2% | 0.0% | ĐẠT |

Một điều chỉnh về phương pháp cần nêu rõ: **lọc rác đo trên từng câu, nhưng tính xác thực
phải đo trong ngữ cảnh quần thể.** Bốn trong năm nhóm tín hiệu cần nhìn nhiều phản hồi
cùng lúc. Một câu "Sản phẩm rất tốt, shop giao hàng nhanh" đứng một mình thì không ai —
người hay máy — kết luận được là thật hay thuê; nó chỉ đáng ngờ khi xuất hiện 12 lần
trong 40 phút từ 12 tài khoản mới lập. Đo tính xác thực trên câu rời rạc cho Precision =
0, và đó là **phép đo sai**, không phải mô hình tồi.

### 4.3. Thí nghiệm loại bỏ thành phần

| Thành phần | Tắt | Bật |
|---|---|---|
| Chuẩn hóa teencode (Macro-F1) | 0.9336 | 0.9731 |
| Trust Layer (WCR) | 3.98% | 1.13% |

---

## 5. Trạng thái các lỗ hổng

| # | Lỗ hổng | Trạng thái |
|---|---|---|
| G1 | Chưa có số F1 thật | **Xong** — khung đánh giá đầy đủ, có số trên tập giữ riêng |
| G2 | Chưa có ablation | **Xong** — teencode và Trust Layer |
| G4 | Màn hình phân tích trực tiếp | **Xong** — `/lab`, tab "Phân tích trực tiếp" |
| G5 | Từ điển chuẩn hóa 129 mục | **Xong** — 258 mục |
| G7 | Bảng giá và kinh tế đơn vị | **Xong** — `services/business.js`, API `/api/business` |
| G8 | Tài liệu tham khảo 4/10 | **Xong** — `docs/TAI-LIEU-THAM-KHAO.md`, đủ 10 |
| G3 | Back-testing trên sự cố có thật | **Chưa** — cần dữ liệu sự cố công khai |
| G6 | Sơ đồ kiến trúc trong sản phẩm | **Chưa** |

### Hai đính chính quan trọng phát hiện khi làm

**1. Tuyên bố "rẻ hơn ba bậc độ lớn" không đúng.** Thuyết minh viết rằng kiến trúc chỉ
gọi LLM ở tầng tổng hợp rẻ hơn cách gọi từng phản hồi khoảng 1000 lần. Mô hình chi phí
trong `services/business.js` cho ra **6–7 lần**, không phải 1000 lần — vì số cảnh báo
cũng tăng theo khối lượng dữ liệu. Sáu tới bảy lần vẫn là lợi thế lớn và vẫn đủ để lập
luận về giá cho SME, nhưng con số trong thuyết minh **cần sửa lại**.

**2. Máy chủ từng không khởi động được nếu thiếu khóa API.** Client mô hình ngôn ngữ được
khởi tạo ngay khi nạp module, nên thiếu một khóa là sập toàn bộ — kể cả Trust Layer và
kiểm định thống kê vốn không dùng tới mô hình nào. Đã chuyển sang khởi tạo muộn; có kiểm
thử khóa chặt.

### Nhóm ngoài phạm vi mã nguồn

Thuộc về tài liệu thuyết minh: render lại hai công thức toán bị vỡ khi copy, viết lại mục
"Tính mới" có trích dẫn SA2SL (nội dung đã chuẩn bị ở `docs/TAI-LIEU-THAM-KHAO.md`), chọn
một ngành dọc, thiết kế pilot 3–5 đơn vị.

---

## 6. Lệnh thường dùng

```bash
cd backend
npm test     # 47 kiểm thử hồi quy, không cần MongoDB, không gọi mô hình
npm run eval # sinh bảng kết quả thực nghiệm -> evaluation/results.json
npm run seed # nạp dữ liệu thử nghiệm (GHI ĐÈ dữ liệu hiện có)
npm start
```

Giao diện: `/lab` có hai tab — phân tích trực tiếp một câu, và bảng kết quả thực nghiệm
đọc từ `evaluation/results.json`.
