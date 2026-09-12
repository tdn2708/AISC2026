# Tài liệu tham khảo

Quy chế cho phép tối đa 10 tài liệu. Bản thuyết minh vòng 1 mới dùng 4, và **không có
tài liệu nào về phát hiện đánh giá giả** — tức là đúng chủ đề ban giám khảo vừa hỏi.

Danh sách dưới đây lấp khoảng trống đó. Bốn mục đầu giữ nguyên từ bản cũ.

---

### Đã có trong bản vòng 1

**[1]** Malik, N., & Bilal, M. (2024). Natural language processing for analyzing online
customer reviews: A survey, taxonomy, and open research challenges. *PeerJ Computer
Science, 10*, e2203. https://doi.org/10.7717/peerj-cs.2203

**[2]** Jain, P. K., Pamula, R., & Srivastava, G. (2021). A systematic literature review
on machine learning applications for consumer sentiment analysis using online reviews.
*Computer Science Review, 41*, 100413. https://doi.org/10.1016/j.cosrev.2021.100413

**[3]** Nguyen, D. Q., & Nguyen, A. T. (2020). PhoBERT: Pre-trained language models for
Vietnamese. *Findings of the ACL: EMNLP 2020*, 1037–1042.
https://doi.org/10.18653/v1/2020.findings-emnlp.92

**[4]** Pontiki, M., Galanis, D., Papageorgiou, H., et al. (2016). SemEval-2016 Task 5:
Aspect based sentiment analysis. *Proceedings of SemEval-2016*, 19–30.
https://doi.org/10.18653/v1/S16-1002

---

### Bổ sung: phát hiện đánh giá giả và spam ý kiến

Đây là khoảng trống lớn nhất của bản cũ, và là nền học thuật cho Tầng Kiểm soát Tin cậy
Dữ liệu.

**[5]** Jindal, N., & Liu, B. (2008). Opinion spam and analysis. *Proceedings of the
International Conference on Web Search and Data Mining (WSDM '08)*, 219–230.
https://doi.org/10.1145/1341531.1341560

> Công trình kinh điển mở đầu lĩnh vực. Đóng góp trực tiếp cho thiết kế của nhóm: chỉ ra
> rằng **đánh giá trùng lặp gần về nội dung** là chỉ dấu mạnh nhất của spam ý kiến — cơ
> sở cho nhóm tín hiệu (1) trong tầng T2.

**[6]** Mukherjee, A., Liu, B., & Glance, N. (2012). Spotting fake reviewer groups in
consumer reviews. *Proceedings of the 21st International Conference on World Wide Web
(WWW '12)*, 191–200. https://doi.org/10.1145/2187836.2187863

> Cơ sở cho quyết định đo tính xác thực **trên cả quần thể thay vì trên từng câu rời
> rạc**: đánh giá thuê hoạt động theo nhóm, và chỉ lộ diện khi nhìn hành vi tập thể —
> cùng thời điểm, cùng sản phẩm, nội dung tương tự.

**[7]** Liu, F. T., Ting, K. M., & Zhou, Z.-H. (2008). Isolation Forest. *Proceedings of
the 8th IEEE International Conference on Data Mining (ICDM '08)*, 413–422.
https://doi.org/10.1109/ICDM.2008.17

> Thuật toán được cài đặt trong `backend/services/anomaly.js` cho nhóm tín hiệu (3).
> Chọn phương pháp không giám sát vì nhóm **không có nhãn "tài khoản ảo" đã xác minh**.

---

### Bổ sung: ABSA tiếng Việt

**[8]** Luc Phan, L., Huynh Pham, P., Thi-Thanh Nguyen, K., et al. (2021). SA2SL: From
aspect-based sentiment analysis to social listening system for business intelligence.
*Knowledge Science, Engineering and Management (KSEM 2021)*. arXiv:2105.15079.
https://arxiv.org/abs/2105.15079

> **Bắt buộc trích dẫn.** Công trình này xây trên bộ UIT-ViSFD và đến từ chính Trường
> Đại học Công nghệ Thông tin. Nó gần như đúng mô tả tầng lõi mà đề tài đang trình bày,
> nên phải được nêu rõ là phần **kế thừa**, không phải phần mới. Định vị lại tính mới của
> đề tài nằm ở tầng kiểm soát tin cậy dữ liệu đặt TRƯỚC tầng phân tích — điều mà SA2SL và
> các hệ thống hiện có đều chưa xử lý.

---

### Bổ sung: kiểm soát thống kê quá trình

Nền tảng cho cơ chế cảnh báo, thay cho ngưỡng phần trăm cố định.

**[9]** Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: A
practical and powerful approach to multiple testing. *Journal of the Royal Statistical
Society: Series B, 57*(1), 289–300. https://doi.org/10.1111/j.2517-6161.1995.tb02031.x

> Thủ tục hiệu chỉnh đa kiểm định được cài trong `backend/services/statistics.js`. Cần
> thiết vì hệ thống chạy hàng chục tới hàng trăm kiểm định mỗi chu kỳ; không hiệu chỉnh
> thì mỗi ngày đều có vài cảnh báo giả ngay cả khi không có vấn đề gì.

**[10]** Lucas, J. M., & Saccucci, M. S. (1990). Exponentially weighted moving average
control schemes: Properties and enhancements. *Technometrics, 32*(1), 1–12.
https://doi.org/10.1080/00401706.1990.10484583

> Cơ sở cho biểu đồ kiểm soát EWMA (λ = 0.2, L = 3) dùng để bắt kiểu **suy giảm chậm và
> đều** — kiểu mà kiểm định đột biến bỏ sót.

---

## Văn bản pháp lý (trích dẫn ở mục tuân thủ, không tính vào 10 suất)

- **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân. Xác định vai trò: doanh nghiệp là
  Bên Kiểm soát dữ liệu, Customer Radar là Bên Xử lý dữ liệu theo hợp đồng.

## Bộ dữ liệu

- **UIT-ViSFD** — 11.122 bình luận tiếng Việt có nhãn ABSA trên 10 khía cạnh, do Trường
  Đại học Công nghệ Thông tin xây dựng. Dùng làm tập đối chuẩn cho mô hình ABSA.
  Hiện **chưa được tích hợp**; xem mục giới hạn trong `docs/TIEN-DO-VA-BOI-CANH.md`.
