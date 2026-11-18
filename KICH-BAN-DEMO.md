# Kịch bản demo chung kết (10/12/2026)

Ba màn, khoảng 6 phút, đi theo một ngày của chủ shop: sáng mở Zalo, tối đứng live, cuối phiên nhận báo cáo. Mọi con số lấy từ web thật lúc demo; câu chữ dưới đây chỉ là gợi ý nói.

## Chuẩn bị (ngày 8 hoặc 9/12)

1. Nạp kho demo đúng mốc giờ demo:
   `cd backend && npm run demo:prep -- --anchor=2026-12-10T09:00:00+07:00 --yes`
2. Sáng 10/12, trước giờ lên: `cd backend && npm run demo:check`. Phải ra "SẴN SÀNG". Lệnh này in luôn các con số cho slide.
3. Trên máy chiếu: đăng nhập tài khoản riêng (không dùng tài khoản demo, vì tài khoản demo không nối Zalo được), bật chế độ chủ shop, chọn kho Mô phỏng.
4. Trang Quản gia: bấm gửi tin thử, kiểm điện thoại nhận được tin Zalo.
5. Trang Livestream: mở một phiên Mô phỏng mới khoảng 10 phút trước khi lên, để có bình luận và việc gấp.
6. Không push code trong ngày demo: Render triển khai lại sẽ khởi động lại máy chủ.

## Màn 1: 8 giờ sáng, chủ shop mở Zalo (khoảng 1,5 phút)

- Chiếu điện thoại: bản tin sáng của quản gia, gồm 3 việc gấp nhất kèm tiền rủi ro, và dòng "30 ngày qua".
- Nhắn "xem 1": bot trả kế hoạch cho việc số 1. Nhắn "duyệt 1", bot hỏi lại, nhắn "có".
- Chuyển sang web, trang Tổng quan: việc vừa duyệt đã đổi trạng thái; khối "Customer Radar giúp shop trong 30 ngày".
- Ý chính: chủ shop không cần mở web, việc nào gấp và đáng bao nhiêu tiền đã nằm trên Zalo.

## Màn 2: 8 giờ tối, livestream giờ cao điểm (khoảng 2,5 phút)

- Trang Livestream, phiên Mô phỏng đang chạy: bình luận chảy vào và được phân loại ngay (hỏi, chốt, khiếu nại).
- Khối "Việc nên làm ngay": ví dụ "size L đã hết, vẫn có N người muốn mua", có câu nói mẫu và gợi ý size còn hàng. Bấm "Đã báo hết hàng".
- Hàng đợi câu hỏi: câu giống nhau đã gom thành một thẻ, có gợi ý trả lời từ danh mục.
- Nếu giám khảo hỏi về tải: hệ thống đã đo 500 bình luận mỗi giây không mất bình luận nào; trên máy chủ yếu như Render miễn phí vẫn chịu được khoảng 300 bình luận mỗi giây.

## Màn 3: hết phiên, báo cáo và bằng chứng (khoảng 2 phút)

- Bấm Kết thúc phiên. Điện thoại nhận tin Zalo báo cáo cuối phiên: doanh thu ước tính, lỡ vì hết hàng, "phiên sau có thể giữ thêm", 3 việc cho phiên sau.
- Trang Cảnh báo, mở một cảnh báo Nghiêm trọng: kế hoạch có bằng chứng, khối "Việc cụ thể nên làm" do AI viết đã được đối chiếu từng con số, mục "Cần thêm dữ liệu" tách riêng.
- Trang Tin cậy dữ liệu (mở trong Nâng cao): phễu từ phản hồi thu về tới số được tính, đánh giá ảo bị loại.
- Ý chính: mỗi con số nói rõ nó đứng trên gì; AI chỉ được viết khi mọi con số khớp dữ liệu.

## Câu hỏi hay gặp

- Dữ liệu có thật không? Kho Mô phỏng là dữ liệu sinh có cài sẵn sự cố để chứng minh hệ thống bắt đúng; kho Dữ liệu thật là đánh giá Tiki thu thật và file đơn hàng, đánh giá shop nạp vào. Nói rõ đang chiếu kho nào.
- Tin được AI không? Lớp tin cậy chấm từng phản hồi; đề xuất chọn từ thư viện hành động có kiểm điều kiện; AI chỉ viết lại khi qua cổng kiểm số liệu, sai một con số là bị loại.
- Hiệu quả đo thế nào? So tỉ lệ khiếu nại trước và sau khi làm theo; cảnh báo gắn một sản phẩm thì trừ thay đổi chung của các sản phẩm khác cùng kỳ.
- Bán cho ai, giá bao nhiêu? Chủ shop online, nhất là shop có livestream. Giá dự kiến: Thử 0 đ, Shop 199.000 đ, Shop có live 499.000 đ mỗi tháng (trang giới thiệu).

## Dự phòng

- Web chậm lúc mở đầu (Render vừa ngủ dậy): UptimeRobot gọi 5 phút một lần nên ít gặp; nếu gặp, chờ khoảng 30 giây.
- Zalo không nhận tin: chiếu lịch sử tin trên trang Quản gia (cùng nội dung).
- Phiên live mô phỏng dừng: bấm Kết nối lại, hoặc mở phiên mới.
