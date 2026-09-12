# Phân tích và thiết kế lại Trợ lý phân tích (Chatbot)

Tài liệu ghi lại quá trình mổ xẻ con chatbot cũ, những lỗi tìm được, hướng giải quyết,
và kết quả sau khi làm lại.

Ngày: 11/09/2026

---

## 1. Kiến trúc cũ

Toàn bộ logic nằm gọn trong một hàm:

```
câu hỏi  →  cắt 400 phản hồi mới nhất  →  nhét nguyên JSON vào prompt
         →  nhờ mô hình tự đếm, tự tính, tự suy luận  →  trả chuỗi văn bản
```

Mã nguồn tương ứng (bản cũ, `services/ai_analyzer.js`):

```js
const compact = feedbacks.slice(0, 400).map(f => ({
  text: String(f.originalText || '').slice(0, 160),
  sentiment: f.sentiment,
  category: f.categoryLabel || f.category,
  cause: f.causeLabel || f.subCategory
}));

const prompt = `...Bạn đang được cung cấp ${feedbacks.length} phản hồi...
Dữ liệu (${compact.length} phản hồi đầu):
${JSON.stringify(compact)}`;
```

---

## 2. Bảy lỗi tìm được

### 2.1. Nói dối mô hình về lượng dữ liệu nó đang có

Prompt khẳng định *"bạn đang được cung cấp `${feedbacks.length}` phản hồi"* và thậm chí
*"nếu người dùng hỏi có bao nhiêu phản hồi, hãy trả lời là `${feedbacks.length}`"* — trong
khi chỉ thực sự gửi 400 phản hồi.

Với bộ dữ liệu hiện tại (568 phản hồi, 503 hợp lệ), mô hình nhận 400 nhưng tin rằng nó
đang nhìn thấy 503. Nó kết luận trên **mẫu thiên lệch** mà vẫn tin là mình có đủ dữ liệu.
Đây là lỗi nguy hiểm nhất trong bảy lỗi, vì không có dấu hiệu nào để người đọc phát hiện.

### 2.2. Cắt theo thời gian, không phải theo liên quan

`slice(0, 400)` chạy trên mảng đã sắp xếp theo `timestamp` giảm dần. Vậy 400 phản hồi đó
là **400 phản hồi mới nhất**, không phải 400 phản hồi **liên quan nhất** tới câu hỏi.

Hệ quả cụ thể: người dùng hỏi *"có bao nhiêu phản hồi về lỗi thanh toán?"*, nhưng nếu
tuần vừa rồi toàn khiếu nại giao hàng thì trong 400 dòng gửi đi **không có một câu nào**
về thanh toán. Mô hình sẽ trả lời "không có" hoặc bịa ra một con số.

### 2.3. Dùng mô hình ngôn ngữ làm máy tính

Mô hình được yêu cầu đếm, cộng, tính tỉ lệ trên hàng trăm dòng JSON. Mô hình ngôn ngữ
làm việc này không đáng tin — và quan trọng hơn, nó **sai một cách tự tin**. Không có
thanh báo lỗi, không có cảnh báo độ tin cậy, chỉ có một con số trông rất thuyết phục.

### 2.4. Mù với chính phần giá trị nhất của hệ thống

Trợ lý hoàn toàn không chạm tới tầng phân tích đã xây:

| Đã có trong hệ thống | Trợ lý cũ có thấy không |
|---|---|
| WCR và các chỉ số có mẫu số | Không |
| Kiểm định z, p-value, hiệu chỉnh FDR | Không |
| Phễu Trust Layer, Data Health Score | Chỉ một câu tóm tắt |
| Danh sách cảnh báo đang mở | Không |
| Playbook khuyến nghị hành động | Không |
| Kết quả thực nghiệm (F1) | Không |
| Mô hình kinh doanh | Không |
| Cây taxonomy | Không |

Nó phải tự suy ra những thứ này từ dữ liệu thô — kém chính xác hơn hẳn so với việc đọc
kết quả đã tính sẵn.

### 2.5. Không có trí nhớ hội thoại

`POST /chat` chỉ nhận `{ message }`. Câu hỏi tiếp theo kiểu *"còn tháng trước thì sao?"*
là vô nghĩa vì không có ngữ cảnh nào được giữ lại.

### 2.6. Không có dẫn chứng truy vết được

Câu trả lời là một khối văn bản. Người dùng không có cách nào kiểm chứng phát biểu
"khách phàn nàn nhiều về giao hàng" dựa trên phản hồi cụ thể nào.

### 2.7. Tốn token và đi ngược lập luận chi phí của chính dự án

Mỗi lượt chat gửi lại 400 dòng dữ liệu. Trong khi đó `services/business.js` lập luận rằng
lợi thế chi phí của hệ thống đến từ việc **chỉ gọi mô hình ở tầng tổng hợp**. Con chatbot
đang làm đúng điều mà tài liệu kiến trúc nói là không nên làm.

### Các vấn đề trải nghiệm đi kèm

- Cửa sổ cố định 340×520, không phóng to được, không kéo giãn được
- Không có câu hỏi gợi ý — người dùng mở lên và không biết hỏi gì
- Chữ "AI is thinking..." tiếng Anh giữa giao diện tiếng Việt
- Không sao chép được câu trả lời, không hỏi lại được
- Logo "CR" font viết tay cũ, không khớp nhận diện mới
- Ô nhập một dòng, không xuống dòng được
- Lỗi mạng chỉ hiện "Lỗi kết nối đến máy chủ AI", không thử lại được

---

## 3. Hướng giải quyết

Đổi từ **"nhồi dữ liệu cho mô hình tự xoay"** sang **"tính bằng mã, mô hình chỉ diễn đạt"**.

```
câu hỏi
  │
  ├─► 1. ĐỊNH TUYẾN Ý ĐỊNH      (luật, xác định, không cần mô hình)
  │
  ├─► 2. GỌI CÔNG CỤ            (JavaScript tính trên TOÀN BỘ dữ liệu)
  │      metrics_overview · root_causes · alerts_list · recommendations
  │      trust_health · channel_breakdown · time_trend · segments
  │      evaluation_results · business_model · taxonomy_info
  │
  ├─► 3. TRUY XUẤT DẪN CHỨNG    (BM25 — đúng chủ đề, có id truy vết)
  │
  └─► 4. DIỄN ĐẠT               (mô hình viết lại dữ kiện đã tính)
         └─ không có khóa API ─► tầng trả lời xác định
```

### 3.1. Nguyên tắc cốt lõi: mô hình không được làm máy tính

Mọi con số do JavaScript tính, dùng **đúng các hàm mà dashboard đang dùng**
(`metrics.buildMetricCards`, `alertEngine.detectAlerts`, …).

Hệ quả quan trọng: con số trong câu trả lời của trợ lý **luôn trùng** với con số trên
dashboard, vì cả hai gọi cùng một hàm. Trước đây hai nơi có thể cho hai kết quả khác nhau.

### 3.2. BM25 thay cho cắt 400 dòng

`services/retrieval.js` xếp hạng phản hồi theo mức liên quan tới câu hỏi, có:

- từ dừng tiếng Việt (loại "là", "của", "shop", "ạ", "nhé"… vì không phân biệt được gì)
- làm giàu văn bản chỉ mục bằng nhãn danh mục, để hỏi "vấn đề giao hàng" vẫn tìm được câu
  không chứa chữ "giao hàng" nhưng đã được phân vào danh mục đó
- ưu tiên nhẹ phản hồi có trọng số tin cậy cao, để khi hai câu liên quan ngang nhau thì
  trích dẫn câu đáng tin hơn

Kết quả: gửi **10–15 trích dẫn đúng chủ đề** thay vì 400 trích dẫn ngẫu nhiên về chủ đề.

### 3.3. Tầng trả lời xác định

`deterministicAnswer()` soạn câu trả lời hoàn toàn bằng JavaScript. Đây không phải phương
án chữa cháy, nó có ba vai trò thật:

1. Trợ lý vẫn dùng được khi chưa cấu hình khóa API hoặc nhà cung cấp gặp sự cố
2. Là **mốc đối chiếu** — nếu mô hình nói khác bản xác định thì mô hình đang bịa
3. Không tốn chi phí suy luận

Bản xác định được trả về kèm mọi câu trả lời (`deterministicAnswer` trong response).

### 3.4. Ràng buộc chống bịa trong prompt

Prompt mới có bảy quy tắc bắt buộc, đáng chú ý:

- Dùng lại nguyên văn con số đã tính, **không tự cộng trừ**
- Trích dẫn bằng `[số]` tương ứng danh sách dẫn chứng
- Chỉ số nào được ghi là **không tính được** (ví dụ WCR khi chưa có dữ liệu giao dịch) thì
  phải nói rõ, không được đưa con số khác ra thay thế như thể là nó
- Không mô tả hành động phát sinh chi phí như thể hệ thống sẽ tự làm

---

## 4. Một lỗi nghiêm trọng phát hiện khi kiểm thử

Câu hỏi thử: *"Tuần này có vấn đề gì đáng chú ý không?"*

Trợ lý trả lời: *"Tuần này không phát hiện vấn đề nào đáng chú ý. Đã kiểm định **0 tổ
hợp**."*

Nhưng dữ liệu **có** một sự cố giao hàng thật đang diễn ra.

**Nguyên nhân:** động cơ cảnh báo hoạt động bằng cách so cửa sổ hiện tại với **đường nền
28 ngày**. Khi bộ lọc thời gian "tuần này" được áp vào dữ liệu *trước khi* đưa vào động cơ,
đường nền bị xóa sạch — không còn gì để so, nên không có tổ hợp nào được kiểm định.

Hệ thống kết luận "không có vấn đề gì" trong khi thực tế là "không có dữ liệu để so sánh".
Hai điều đó hoàn toàn khác nhau, và đây là kiểu sai **im lặng** nguy hiểm nhất.

**Cách sửa:** giữ nguyên toàn bộ lịch sử khi đưa vào động cơ cảnh báo, và dịch mốc thời
gian người dùng hỏi thành **độ dài cửa sổ hiện tại** (`windowDays`), thay vì lọc dữ liệu.

Sau khi sửa, cùng câu hỏi đó trả về đúng 2 cảnh báo.

---

## 5. Kết quả

Thử trên bộ dữ liệu 568 phản hồi:

| Câu hỏi | Ý định nhận ra | Công cụ gọi | Kết quả |
|---|---|---|---|
| Tuần này có vấn đề gì đáng chú ý không? | `alerts` | alerts_list, recommendations, search_feedbacks | 2 cảnh báo, kèm z, p, số khách ảnh hưởng |
| Khách phàn nàn nhiều nhất về điều gì? | `root_cause` | root_causes, search_feedbacks | Giao chậm 46.0%, kèm bộ phận phụ trách |
| Dữ liệu này có đáng tin không? | `data_quality` | trust_health, metrics_overview | Điểm 84/100, phễu lọc chi tiết |
| Mô hình đang đạt F1 bao nhiêu? | `model_performance` | evaluation_results | 0.1611 test / 0.9731 dev, kèm giải thích khoảng cách |
| Tôi nên làm gì bây giờ? | `action` | recommendations, alerts_list, root_causes | Các bước playbook, ghi rõ bước cần phê duyệt |
| Giá các gói dịch vụ thế nào? | `business` | business_model | Bảng giá, biên lợi nhuận, LTV/CAC |

Đáng chú ý ở câu về F1: trợ lý tự nêu **cả giới hạn của phép đo** (tập tự gán nhãn, chưa
phải UIT-ViSFD, chưa tính được kappa) vì các giới hạn đó nằm sẵn trong dữ kiện do công cụ
cung cấp — không phải do mô hình tự nghĩ ra.

---

## 6. Tệp liên quan

| Tệp | Vai trò |
|---|---|
| `backend/services/retrieval.js` | Chỉ mục và tìm kiếm BM25 trên phản hồi |
| `backend/services/chat_tools.js` | 11 công cụ truy vấn dữ liệu xác định |
| `backend/services/chat_engine.js` | Định tuyến ý định, gom dữ kiện, dựng prompt, tầng xác định |
| `backend/routes/api.js` | `POST /api/chat`, `GET /api/chat/suggestions` |
| `src/components/AiChatWidget.jsx` | Giao diện trợ lý |

Hàm `chatWithData()` cũ trong `ai_analyzer.js` không còn được `/api/chat` gọi tới.
