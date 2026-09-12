# Bộ dữ liệu thử nghiệm

## Nói rõ ngay từ đầu

Đây là **dữ liệu mô phỏng**, không phải dữ liệu thu thập từ sàn thương mại điện tử thật.
Nhóm không có thỏa thuận truy cập dữ liệu với doanh nghiệp nào tại thời điểm này, và việc
tự ý thu thập diện rộng thì vi phạm điều khoản sử dụng của các sàn.

Nhưng *mô phỏng* không đồng nghĩa với *bịa bừa*. Bộ dữ liệu này được dựng để phục vụ hai
việc mà một tập ngẫu nhiên đơn giản không làm được:

1. **Phân bố giống dữ liệu thật**, để hệ thống được thử trong điều kiện gần thực tế.
2. **Có đáp án để chấm**, để chứng minh bằng số rằng hệ thống phát hiện đúng thứ cần
   phát hiện, và không bắt nhầm phần dữ liệu bình thường.

---

## Quy mô

| | |
|---|---|
| Phản hồi | **6.419** |
| Giao dịch | **25.845** |
| Tỉ lệ để lại đánh giá | 11,3% |
| Sản phẩm | 18 (5 nhóm ngành) |
| Khách hàng | 1.773 người có phản hồi |
| Khu vực | 12 tỉnh thành |
| Kênh | 5 (Shopee, Facebook, TikTok, Lazada, CSKH) |
| Khoảng thời gian | 90 ngày |
| Câu văn khác nhau | 2.673 |

Tái lập được: bộ sinh dùng hạt giống cố định, nên chạy lại luôn cho ra đúng cùng một tập
dữ liệu. Con số trên slide sẽ khớp với con số trên màn hình lúc demo.

```bash
npm run seed                              # 6.000 phản hồi, 90 ngày
npm run seed -- --reviews=12000 --days=120
npm run seed -- --dry                     # chỉ xem thống kê, không ghi CSDL
```

---

## Vì sao dữ liệu trông giống thật

Tài liệu phản biện nói thẳng rằng ban giám khảo phân biệt được hai thứ này rất nhanh:
*"dữ liệu thật có phân bố lệch, có ngoại lệ, có những chỗ xấu; dữ liệu giả thì tròn trịa
một cách đáng ngờ."*

Vì vậy bộ sinh dựng theo các quy luật sau, thay vì rải ngẫu nhiên đều.

### Điểm sao hình chữ J

| 1 sao | 2 sao | 3 sao | 4 sao | 5 sao |
|---|---|---|---|---|
| 18,6% | 9,9% | 10,7% | 15,0% | 45,8% |

Đây là dáng phân bố đặc trưng đã được ghi nhận rộng rãi của đánh giá thương mại điện tử:
người rất hài lòng và người rất bực mới bỏ công viết, nhóm ở giữa thường im lặng. Một tập
dữ liệu bịa thường cho phân bố phẳng hoặc hình chuông — nhìn là biết.

### Độ phổ biến sản phẩm theo luật lũy thừa

Sản phẩm bán chạy nhất chiếm 2.041 phản hồi; đuôi dài có sản phẩm chỉ 71 phản hồi. Tỉ lệ
chênh gần 30 lần, đúng dáng Zipf của danh mục hàng hóa thật.

### Độ tích cực của khách hàng cũng lệch

Khách viết nhiều nhất: 28 đánh giá trong 90 ngày. Trung vị: 3. Có 492 người chỉ đánh giá
đúng một lần.

> Chi tiết đáng nói: số mũ Zipf phải hiệu chỉnh cẩn thận. Thử 0,75 cho ra khách tích cực
> nhất **267** đánh giá, thử 1,15 còn tệ hơn với **1.170**. Một tài khoản 1.170 đánh giá
> trong 90 ngày tự nó đã là bất thường, và sẽ kích hoạt chính bộ phát hiện hành vi tài
> khoản — tạo báo động giả ngay trong dữ liệu nền, làm hỏng phép đo tỉ lệ loại nhầm. Mức
> 0,35 cho ra dáng đúng.

### Mùa vụ

- **Thứ trong tuần**: cuối tuần cao hơn ngày thường khoảng 25%
- **Kỳ lương**: đầu tháng +35%, giữa tháng +25%, cuối tháng −18%
- **Giờ trong ngày**: đỉnh 19–21 giờ, đáy 2–5 giờ sáng
- **Xu hướng**: tăng nhẹ theo thời gian, cộng nhiễu ngẫu nhiên từng ngày

### Văn bản

Mỗi nguyên nhân có nhiều khung câu, mỗi khung có nhiều biến thể cho từng ô trống. Khoảng
18% số câu được viết lại theo kiểu teencode, đúng như cách người Việt viết trên mạng — và
để bước chuẩn hóa có việc thật để làm.

---

## Các sự cố được cài vào có chủ đích

Đây là phần quan trọng nhất. Mỗi sự cố được ghi lại trong bản kê (manifest), nên có thể
chấm điểm phát hiện một cách khách quan.

| Mã | Loại | Số phản hồi | Nội dung |
|---|---|---|---|
| INC-01 | Đột biến | 259 | Giao chậm tăng dần 12 ngày, tập trung TP.HCM |
| INC-02 | Đột biến | 46 | Cổng thanh toán lỗi trong một buổi tối |
| INC-03 | Đột biến | 192 | Lô sản phẩm lỗi kỹ thuật, tăng chậm 20 ngày |
| INC-04 | Đánh giá thuê | 34 | 5 sao, nội dung na ná nhau, tài khoản dưới 5 ngày tuổi |
| INC-05 | Hạ uy tín | 21 | 1 sao thành cụm, do đối thủ đặt |
| INC-06 | Suy giảm chậm | 92 | Dịch vụ khách hàng xấu đi đều suốt 60 ngày |
| INC-07 | Bất nhất giao dịch | 14 | Đánh giá viết trước thời điểm giao hàng |

Cộng thêm nhiễu nền: 480 bình luận quảng cáo và đánh giá rỗng nghĩa.

---

## Kết quả chấm điểm

```bash
npm run verify
```

| | |
|---|---|
| Sự cố bắt buộc phát hiện | **6/6** |
| Đánh giá không xác thực cài vào | 69 — bắt được **69 (100%)** |
| Nội dung rác cài vào | 480 — bắt được **480 (100%)** |
| Precision bộ lọc rác | **1,000** |
| Phản hồi nền bị loại nhầm | **0 / 5.870 (0,0%)** |
| Điểm Sức khỏe Dữ liệu | 86/100 |

Giá trị của Trust Layer, đo trên cùng một tập dữ liệu:

| | Bật Trust Layer | Tắt Trust Layer |
|---|---|---|
| Số cảnh báo | 9 | 6 |
| Tỉ lệ khiếu nại (WCR) | **2,00%** | **3,61%** |
| Cảnh báo ma | — | 1 (Chất lượng sản phẩm → Không đúng mô tả) |

Cảnh báo ma đó chính là chiến dịch hạ uy tín INC-05. Không có tầng lọc, hệ thống sẽ báo
cho doanh nghiệp một vấn đề chất lượng sản phẩm **không hề tồn tại**, và WCR bị thổi lên
gần gấp đôi.

---

## Hệ thống có "đọc đáp án" không?

Không, và điều này được khóa bằng kiểm thử tự động.

Trường `_plantedAs` đánh dấu các phản hồi được cài vào. Nếu bất kỳ tầng phân tích nào đọc
trường đó thì con số "6/6" trở nên vô nghĩa. Có hai kiểm thử trong `npm test`:

- Quét toàn bộ `services/`, `routes/`, `evaluation/` để chắc chắn không tệp nào nhắc tới
  `_plantedAs`. Chỉ `data/generator.js` (ghi vào) và `data/verify_detection.js` (chấm
  điểm) được phép dùng.
- Kiểm tra dữ liệu trả ra API không để lộ trường này cho giao diện.

---

## Giới hạn

Phải nói rõ khi trích dẫn bất kỳ con số nào ở trên:

- Dữ liệu là **mô phỏng có đáp án cài sẵn**. Kết quả chứng minh pipeline chạy đúng như
  thiết kế trên các hình thái sự cố đã biết. Nó **chưa thay thế được** thử nghiệm trên dữ
  liệu sàn thật.
- Các hình thái sự cố được cài theo hiểu biết của nhóm về cách đánh giá thuê và sự cố vận
  hành diễn ra trên thực tế. Sự cố thật có thể có hình thái khác mà bộ sinh chưa bao phủ.
- Tỉ lệ loại nhầm 0,0% đo trên dữ liệu mô phỏng, nơi ranh giới giữa phản hồi thật và phản
  hồi cài vào là rạch ròi. Trên dữ liệu thật ranh giới đó mờ hơn nhiều, nên con số này gần
  như chắc chắn sẽ xấu đi.

Bước tiếp theo để có bằng chứng mạnh hơn: kiểm chứng ngược trên một đợt phản hồi tiêu cực
có thật quan sát được từ dữ liệu công khai (mục A.5 trong kế hoạch thực nghiệm).
