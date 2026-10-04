# Kế hoạch thiết kế lại UI/UX — Customer Radar

> Phong cách tham chiếu: UI-kit "Mindora" — kính mờ sáng trên nền phong cảnh sương mù,
> bảng màu sage / sky / slate / mist / blush.
> Mục tiêu: **đẹp, cao cấp, mang chất công nghệ**, đồng thời gỡ bỏ các phần "AI trang trí"
> không phục vụ quyết định.

---

## 1. Định hướng: "Calm Tech"

Ảnh tham chiếu là một app thiền — êm, thoáng, nhiều khoảng trắng. Customer Radar là một
công cụ giám sát dữ liệu dày đặc. Nếu sao chép nguyên phong cách, cảnh báo khẩn cấp sẽ
"chìm" vào màu pastel. Vì vậy hướng đi là **giữ ngôn ngữ thị giác của Mindora, thêm độ
chính xác của một thiết bị đo**:

| Lấy từ Mindora | Thêm vào để ra chất "tech" |
|---|---|
| Kính mờ sáng, viền trắng mảnh, bo góc lớn | Lưới hairline, số liệu dùng font đơn cách (mono) |
| Nền phong cảnh sương mù, nhiều lớp (ảnh chỉ làm nền, không gắn thương hiệu) | Nhãn khu vực viết hoa giãn chữ, có đường kẻ mảnh — không đánh số |
| Bảng màu dịu: sage, sky, slate, mist, blush | Thang màu trạng thái riêng, đậm hơn, chỉ dành cho rủi ro |
| Icon nét mảnh, chip bo tròn, tab gạch chân | Dải trạng thái hệ thống, phím tắt, bảng lệnh `Ctrl+K` |
| Wordmark có chữ nghiêng có chân (*Mindora*) | Wordmark *Radar* nghiêng, phần còn lại sans |

**Nguyên tắc cốt lõi:** sự êm dịu dành cho *khung*, sự sắc nét dành cho *dữ liệu*. Nền,
panel, điều hướng thì mềm; con số, cảnh báo, biểu đồ thì rõ và tương phản cao.

---

## 2. Gỡ bỏ phần AI thừa

Rà toàn bộ `src/` tìm thấy 57 điểm liên quan AI trong 13 file. Phân loại như sau:

### 2.1 Gỡ hẳn

| Thành phần | Vị trí | Lý do |
|---|---|---|
| Khung chat nổi "Trợ lý phân tích" | `AiChatWidget.jsx` (491 dòng), gắn ở `App.jsx:73` | Che góc màn hình mọi trang; câu hỏi dữ liệu đã có câu trả lời trực tiếp trên dashboard |
| Tab "AI Configuration" (Groq / OpenRouter / Gemini, Tri-API load balancing) | `Settings.jsx:18, 158–210` | Cấu hình hạ tầng mô hình không thuộc về người dùng doanh nghiệp |
| Báo cáo do LLM sinh (`/predict`, icon Brain/Sparkles) | `Analytics.jsx` | Văn bản sinh tự do không kiểm chứng được — trái với triết lý "mọi con số đều có mẫu số" của sản phẩm |
| Thư viện `react-markdown` + CSS `.markdown-body` | `package.json`, `index.css:473` | Chỉ phục vụ khung chat |
| Dữ liệu `crChatHistory` trong localStorage | — | Dọn khi gỡ khung chat |

### 2.2 Đổi tên — tính năng thật, chỉ có nhãn "AI" là thừa

| Hiện tại | Thực chất | Đổi thành |
|---|---|---|
| "AI Insight:" (`RiskCenter.jsx:180`) | Câu diễn giải do Playbook Engine sinh theo mẫu — hoàn toàn xác định | "Diễn giải" |
| "↳ AI Note:" (`Feedbacks.jsx:191`) | Tóm tắt phản hồi | "Tóm tắt" |
| "Run AI Sync Pipeline", "send to Gemini AI", "AI credits" (`DataSources.jsx`) | Thu thập + phân loại | "Đồng bộ & phân loại", bỏ câu về credit |
| "AI sentiment", "AI-driven action plans", "AI Summary" (`Reports.jsx`) | Cảm xúc, khuyến nghị theo playbook | "Cảm xúc", "Kế hoạch hành động", "Tóm tắt điều hành" |
| "This will force the AI to re-analyze…" (`Settings.jsx:312`) | Chạy lại phân loại | "Phân loại lại toàn bộ dữ liệu lịch sử" |

### 2.3 Giữ lại (cần anh xác nhận)

- **Phòng thí nghiệm (`/lab`)** và **dải trạng thái ViSoBERT** ở thanh bên: đây là *mô hình
  phân loại cốt lõi* của sản phẩm, không phải trang trí. Đề xuất giữ, chỉ đổi giọng điệu:
  "Bộ phân loại · ViSoBERT · đang hoạt động" đặt trong khu Hệ thống.
- **Backend** (`/chat`, `/predict`, khóa API trong `.env`): giai đoạn này chỉ gỡ ở giao diện.
  Endpoint backend tính sau, vì `ai_analyzer.js` còn dùng cho gán nhãn theo lô.

### 2.4 Trang Phân tích sau khi bỏ báo cáo LLM

Thay bằng **"Phân tích nguyên nhân"** dựng hoàn toàn từ dữ liệu đã có (`/categories`,
`/root-causes`, `/trend`): chọn một nhóm vấn đề → xem các nguyên nhân cấp 2 xếp hạng → xem
diễn biến theo thời gian → mở phản hồi gốc. Mọi con số truy ngược được tới dữ liệu.
Gộp trang **Phân khúc** vào đây thành một tab.

---

## 3. Kiến trúc thông tin

Thanh bên hiện có 10 mục trong 3 nhóm. Rút còn 8, nhóm theo *việc người dùng cần làm*:

```
GIÁM SÁT
  ⌂  Tổng quan
  △  Cảnh báo & hành động        [badge số cảnh báo]
  ◷  Phản hồi
PHÂN TÍCH
  ⌖  Phân tích nguyên nhân        (gộp Phân tích + Phân khúc)
  ◈  Tin cậy dữ liệu              [badge hàng đợi kiểm duyệt]
  ⚗  Phòng thí nghiệm
HỆ THỐNG
  ⛁  Nguồn dữ liệu
  ▤  Báo cáo
  ⚙  Cài đặt                      (chuyển xuống khối người dùng)
──────────────
  ● Sức khỏe dữ liệu 66 · 10:39
  ● Bộ phân loại: ViSoBERT
```

Thêm **bảng lệnh `Ctrl+K`** (thuần điều hướng, không AI): nhảy tới trang, tìm phản hồi
theo mã, mở cảnh báo. Đây là "chất tech" thật — tốc độ thao tác — thay cho khung chat.

---

## 4. Hệ thiết kế (Design System)

### 4.1 Bảng màu

Kiểm tra tương phản WCAG trên chính bảng màu gốc của ảnh tham chiếu cho thấy **không thể
dùng nguyên**:

| Cặp màu | Tỉ lệ | Kết luận |
|---|---|---|
| Chữ trắng trên sage gốc `#5E8B7E` | **3,84 : 1** | ✗ Trượt AA cho chữ thường (cần 4,5) |
| Chữ trắng trên sage đậm `#4A7468` | 5,26 : 1 | ✓ Dùng cho nút chính |
| Blush `#E8AEB7` / sky `#A7C7E7` trên nền mist | 1,6–1,7 : 1 | ✗ Chỉ được làm nền/fill, không bao giờ làm chữ |
| Slate `#2F3E46` trên mist `#F1F5F4` | 10,07 : 1 | ✓ Chữ chính |

**Token đề xuất** (giá trị cuối sẽ chạy lại bộ kiểm định ở Giai đoạn 0):

| Vai trò | Token | Sáng (mặc định) | Ghi chú |
|---|---|---|---|
| Nền trang | `--canvas` | Phong cảnh sương mù + `#E9EFEE` | Xem 4.4 |
| Bề mặt kính | `--surface` | `rgb(255 255 255 / 0.62)` + blur 20px | Panel dữ liệu: 0.78 để chữ rõ |
| Viền kính | `--border` | `rgb(255 255 255 / 0.7)` + bóng `rgb(47 62 70 / 0.06)` | Viền trắng như Mindora |
| Chữ chính | `--text-hi` | `#2F3E46` slate | 10:1 |
| Chữ phụ | `--text-mid` | `#5B6B70` | 5:1 |
| Nhấn / tương tác | `--accent` | `#4A7468` sage đậm | Nút, link, trạng thái chọn |
| Nhấn nhạt | `--accent-dim` | `#5E8B7E` @ 14% | Nền chip/hàng được chọn |
| Phụ (secondary) | `--blush` | `#E8AEB7` | Nút phụ, điểm nhấn trang trí — **không mang nghĩa rủi ro** |
| Trạng thái: nghiêm trọng | `--sev-crit` | coral `~#B4485E` | Đậm hơn blush để không lẫn |
| Trạng thái: cao | `--sev-high` | hổ phách `~#95590A` | |
| Trạng thái: ổn | `--sev-ok` | sage `#4A7468` | |
| Cảm xúc tiêu cực | `--viz-neg` | blush đậm `~#CC6479` | Thang phân kỳ lấy cảm hứng từ hàng mặt cười của Mindora: sky = tốt, blush = xấu |
| Cảm xúc trung tính | `--viz-neu` | `#9AA8A6` | |
| Cảm xúc tích cực | `--viz-pos` | sky đậm `#4F86C2` | |

Chế độ tối **"Dusk"** giữ lại (hook `useTheme` đã có): nền slate `#1E2A30`, kính tối, cùng
bộ vai trò. Đề xuất **sáng làm mặc định** để đúng tinh thần ảnh tham chiếu.

### 4.2 Typography

| Vai trò | Font | Lưu ý |
|---|---|---|
| Tiêu đề | Inter Semibold | Hỗ trợ tiếng Việt đầy đủ |
| Nội dung | DM Sans → **cần kiểm tra bộ dấu tiếng Việt**; nếu thiếu, giữ Be Vietnam Pro | Dấu chồng hai tầng (Ệ, ữ) là điểm hay vỡ |
| Wordmark / tiêu đề lớn | Serif nghiêng (ứng viên: Fraunces Italic, Lora Italic) | Chỉ cho *Radar* và tiêu đề trang đăng nhập |
| Số liệu | IBM Plex Mono (đang dùng) | Nguồn của chất "tech" |
| Nhãn khu vực | Inter 11px, viết hoa, giãn chữ 0.14em, không đánh số | Số thứ tự không mang thông tin nên đã bỏ |

### 4.3 Thư viện component — ánh xạ từ UI-kit sang nhu cầu thật

| # trong ảnh | Component | Dùng ở đâu trong Customer Radar |
|---|---|---|
| 1 | Button: primary / secondary / ghost / icon, đủ 4 trạng thái | Mọi trang |
| 2 | Input: icon trái, trạng thái lỗi, textarea đếm ký tự | Đăng nhập, nhập URL nguồn, **ô lý do khi bỏ qua khuyến nghị** |
| 3 | Toggle / checkbox / radio | Cài đặt, công tắc bật/tắt Trust Layer |
| 4 | Slider | Ngưỡng cảnh báo, cửa sổ thời gian |
| 5 | Card (kể cả card có ảnh nền) | Thẻ chỉ số, thẻ cảnh báo, card nguồn dữ liệu |
| 6 | Thang đánh giá cảm xúc (5 mặt) | **Chú giải cảm xúc** + gán nhãn thủ công trong hàng đợi kiểm duyệt |
| 7 | Chip / tag | Bộ lọc nhanh (Hôm nay · 7 ngày · 30 ngày), nguồn, danh mục |
| 8 | Điều hướng: tab gạch chân, stepper 1-2-3 | Tab trang con; stepper cho luồng kết nối nguồn dữ liệu và mô phỏng pipeline ở Lab |
| 9 | Icon nét mảnh | Lucide, stroke 1.5 thống nhất |
| 10 | Modal: thành công / nhắc nhở / chọn lựa | Xác nhận chấp nhận khuyến nghị, **nhập lý do bỏ qua ngay trên dashboard** |
| 11 | Badge | Mức độ, bộ đếm |
| 12 | Thanh tiến trình mảnh | Độ tin cậy khuyến nghị, sức khỏe dữ liệu, tiến trình đồng bộ |
| 13 | Minh họa | Trạng thái rỗng ("Không có cảnh báo"), trang đăng nhập — vẽ SVG nét mảnh |

Tất cả nằm trong `src/components/ui/`, viết bằng Tailwind (đã cài v4). Thêm một route nội bộ
`/ui-kit` hiển thị toàn bộ component giống chính tấm ảnh tham chiếu — để duyệt thiết kế
trước khi áp vào trang thật.

### 4.4 Nền phong cảnh

Không dùng lại ảnh tham chiếu (bản quyền). Hai phương án:

- **A (đề xuất):** phong cảnh vẽ bằng SVG nhiều lớp — dãy núi, lớp sương gradient, mặt
  hồ phản chiếu. Nhẹ (< 10 KB), sắc nét mọi độ phân giải, đổi màu theo theme được.
- **B:** ảnh chụp có giấy phép (Unsplash) do nhóm chọn, nén WebP, khoảng 150 KB.

Cường độ nền thay đổi theo trang: rõ nhất ở **Đăng nhập**; mờ đi trong ứng dụng để không
cạnh tranh với dữ liệu.

---

## 5. Thiết kế lại từng màn hình

| Trang | Thay đổi chính |
|---|---|
| **Đăng nhập** | Màn hình "trình diễn": phong cảnh toàn màn hình, một thẻ kính ở giữa, wordmark nghiêng |
| **Khung ứng dụng** | Thanh bên kính nổi (cách mép 12px, bo 20px), thanh trên kính chứa tiêu đề + `Ctrl+K` + thông báo |
| **Tổng quan** | Giữ bố cục 12 cột đã làm, đổi da sang kính sáng; Trung tâm hành động thêm modal "Bỏ qua + lý do" để quyết định trọn vẹn trên một màn |
| **Cảnh báo & hành động** | Danh sách trái, chi tiết phải; bằng chứng thống kê thành dải chip mono |
| **Phản hồi** | Bảng thoáng hơn, chip lọc, panel chi tiết trượt từ phải thay cho chuyển trang |
| **Phân tích nguyên nhân** | Trang mới (xem 2.4), gồm tab Phân khúc |
| **Tin cậy dữ liệu** | Phễu dữ liệu dạng stepper ngang; hàng đợi kiểm duyệt dùng thang cảm xúc + 3 nút nhãn |
| **Nguồn dữ liệu** | Card nguồn có trạng thái kết nối; luồng thêm nguồn dạng stepper 3 bước |
| **Báo cáo** | Xem trước báo cáo trên "giấy" kính; bỏ toàn bộ chữ "AI" |
| **Cài đặt** | Còn 5 tab: Chung · Giao diện · Thông báo · Dữ liệu · Bảo mật; toàn bộ Việt hóa |
| **Phòng thí nghiệm** | Giữ nội dung (đang phát triển), chỉ đổi da khi nhóm xong phần việc hiện tại |

Ngoài ra, các chuỗi tiếng Anh còn sót ở Cài đặt, Nguồn dữ liệu và Báo cáo sẽ được Việt
hóa toàn bộ.

---

## 6. Lộ trình triển khai

| Giai đoạn | Nội dung | Rủi ro | Quy mô |
|---|---|---|---|
| **0 · Nền móng** | Token màu (chạy kiểm định tương phản + mù màu), font, nền SVG, route `/ui-kit` | Thấp | S |
| **1 · Gỡ AI thừa** | Mục 2.1 + 2.2; gỡ `react-markdown` | Thấp — chỉ xóa và đổi chữ | S |
| **2 · Khung** | Thanh bên, thanh trên, đăng nhập, bảng lệnh `Ctrl+K` | Trung bình | M |
| **3 · Component** | 13 nhóm ở mục 4.3 | Thấp | M |
| **4 · Từng trang** | Theo thứ tự: Tổng quan → Cảnh báo → Phản hồi → Tin cậy → Phân tích nguyên nhân → Nguồn → Báo cáo → Cài đặt → Lab | Trung bình | L |
| **5 · Kiểm thử** | Tương phản AA cả hai theme, `prefers-reduced-transparency`, hiệu năng blur, màn 400px, kiểm tra bằng mắt từng trang | — | S |

**Chiến lược chuyển đổi an toàn:** dự án có khoảng 800 thuộc tính style nội tuyến trỏ vào
biến CSS (`--surface`, `--text-hi`…). Đổi giá trị token ở Giai đoạn 0 sẽ "nhuộm" lại toàn
bộ ứng dụng ngay lập tức mà không sửa component nào. Sau đó từng trang được chuyển dần sang
component mới ở Giai đoạn 4 — ứng dụng luôn chạy được ở mọi thời điểm.

---

## 7. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Kính sáng trên nền ảnh làm chữ dày đặc khó đọc | Hai mức kính: trang trí 0.55, dữ liệu 0.78; nền mờ hơn trong ứng dụng |
| Màu pastel làm cảnh báo khẩn cấp "hiền" đi | Thang trạng thái riêng, đậm hơn; luôn đi kèm icon + chữ |
| `backdrop-filter` gây giật khi cuộn trên máy yếu | Không lồng kính trong kính; tối đa khoảng 6 lớp blur mỗi màn; tắt khi `prefers-reduced-transparency` |
| Font thiếu dấu tiếng Việt | Kiểm tra ở Giai đoạn 0; giữ Be Vietnam Pro làm phương án dự phòng |
| Đi ngược ghi chú thiết kế cũ trong `index.css` (từng bỏ kính vì giật và khó đọc) | Ba biện pháp trên chính là câu trả lời cho hai lý do đó; cập nhật lại ghi chú |

---

## 8. Cần anh quyết định trước khi bắt tay vào làm

1. **Theme mặc định:** sáng (giống ảnh — *đề xuất*) hay giữ tối làm mặc định?
2. **Trang Phân tích:** thay bằng "Phân tích nguyên nhân" dựng từ dữ liệu (*đề xuất*), hay bỏ hẳn?
3. **Phòng thí nghiệm + dải ViSoBERT:** giữ như mục 2.3 (*đề xuất*)?
4. **Nền phong cảnh:** SVG tự vẽ (*đề xuất*) hay ảnh chụp do nhóm chọn?
