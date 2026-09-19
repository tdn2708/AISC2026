# Kịch bản demo: ViSoBERT trong Customer Radar

Mục tiêu của phần demo này là cho người xem **thấy tận mắt** tầng phân loại đã chuyển từ
luật từ khóa sang mô hình ngôn ngữ ViSoBERT tinh chỉnh. Người xem cũng phải thấy được
mô hình này **tốt hơn ở đâu và còn thua ở đâu**.

## Khởi động

```powershell
cd AISC2026
pwsh -File .\start-demo.ps1
```

Lệnh này mở ba cửa sổ: ViSoBERT (8001), backend (5000), giao diện (5173). Chờ khoảng
30 giây cho mô hình nạp xong, rồi mở **http://127.0.0.1:5173/lab**.

Kiểm tra nhanh trước khi trình bày:

- Góc dưới thanh bên trái hiện **"ViSoBERT đang gán nhãn"** kèm chấm xanh. Rê chuột lên
  để xem checkpoint được train lúc nào.
- `http://127.0.0.1:5000/api/nlp/status` trả `"canLabel": true`.

## Màn 1 — Có ViSoBERT hay không, nhìn là biết (30 giây)

Chỉ vào dòng trạng thái ở thanh bên. Tắt cửa sổ ViSoBERT: sau tối đa một phút, dòng này
đổi thành **"ViSoBERT tắt · dùng luật"**, và toàn bộ hệ thống vẫn chạy. Đây là bằng chứng
cho thiết kế suy giảm có kiểm soát. Bật lại trước khi sang màn 2.

## Màn 2 — Trình diễn xử lý ngôn ngữ: tám bước (3–4 phút)

Tab **Trình diễn xử lý ngôn ngữ**. Chọn một thẻ thử thách rồi bấm **"Trình diễn từng
bước"**: tám bước mở lần lượt, khoảng 1,4 giây mỗi bước. Có thể bấm **Tạm dừng** để giải
thích, hoặc **Hiện tất cả**. Mọi số trên màn hình là dữ liệu thật của đúng câu đang chạy.

| Bước | Chỉ cho giám khảo |
|---|---|
| 1 Tiếp nhận | Văn bản thô, số ký tự, có chữ số/emoji |
| 2 Che PII | Số điện thoại hiện thành `[SĐT]` màu xanh, trước khi chạm tới mô hình |
| 3 Chuẩn hóa teencode | Từng cặp đã dịch (`r → rồi`, `k → không`, `rep → trả lời`) |
| 4 Lọc rác | Từng tín hiệu (liên hệ, chào mời, SĐT…), xác suất rác của mô hình, ngưỡng 0.95 |
| 5 Tách token | Token SentencePiece thật; teencode như "dth", "sốp" là một token nguyên vẹn |
| 6 Suy luận | Phân bố xác suất đầy đủ cho cảm xúc, danh mục, nguyên nhân; thời gian chạy (ms) |
| 7 Vì sao | Tô màu từ quyết định: bỏ từng từ rồi chạy lại mô hình |
| 8 Bản ghi | Bản ghi đi vào dashboard; so với **đáp án kỳ vọng** và với luật từ khóa |

Thứ tự thẻ nên chạy:

1. **Không chứa từ khóa** (sạc dự phòng phồng): luật trả "không phải khiếu nại", mô hình
   ra "Chất lượng sản phẩm → Lỗi kỹ thuật". Bước 8 báo khớp kỳ vọng.
2. **Quảng cáo kèm SĐT**: dừng ở bước 2 và bước 4 để chỉ việc che PII và chặn rác.
3. **Viết tắt nặng**: bước 3 cho thấy từ điển teencode, bước 5 cho thấy mô hình đọc thẳng
   teencode.
4. **Mỉa mai (câu khó)**: bước 8 hiện **đỏ, không khớp kỳ vọng**, và cả luật lẫn mô hình
   cùng sai. Nói thẳng đây là giới hạn hiện tại.

> **Bước 7 phải đọc trung thực.** Với câu sạc dự phòng, từ quyết định nhất hiện là
> "tuần", "mua" chứ không phải "phồng", "nóng". Nghĩa là mô hình đang dựa vào lối tắt
> học từ dữ liệu sinh theo khung câu. Trình bày đây là phát hiện, và là lý do cần tập
> gán nhãn thật. Đừng né.
>
> **Câu nhiều vấn đề** là điểm nên nhấn: mô hình dùng đầu ra đa nhãn, nên thẻ "Viết tắt
> nặng" ("đặt hàng 2 tuần r mà vẫn chưa thấy đâu, nhắn shop k ai rep") ra đủ **Giao hàng**
> lẫn **Dịch vụ khách hàng**, trong khi luật chỉ bắt được giao chậm. Bước 8 chấm riêng hai
> nhánh theo đáp án kỳ vọng.
>
> Thẻ "Teencode, nhiều vấn đề" thì ngược lại: **luật bắt 3/3, mô hình chỉ 2/3** (thiếu
> Thanh toán). Để nguyên cho người xem thấy; mô hình không thắng ở mọi câu.

## Màn 3 — Số đo và đối đầu từng câu (2 phút)

Tab **Kết quả thực nghiệm**:

1. **Bảng phân loại danh mục:** dòng **M · ViSoBERT tinh chỉnh** có Macro-F1 trên tập
   kiểm tra giữ riêng, đặt cạnh B1 (luật) và B2.
2. **"Luật từ khóa và ViSoBERT trên từng câu":** liệt kê từng câu chỉ ViSoBERT đúng,
   **và cả những câu chỉ luật đúng**. Trình bày cả hai chiều để phần demo không thành
   trình diễn chọn lọc.
3. **Khối "Giới hạn của các con số"** ở đầu trang: nói rõ trước khi đọc số.

## Câu hỏi giám khảo hay hỏi và câu trả lời trung thực

**"Dữ liệu huấn luyện ở đâu ra?"**
Có hai nguồn. Nhãn cảm xúc do người gán lấy từ UIT-ViSFD (4.063 câu). Nhãn danh mục và
nguyên nhân lấy từ tập chuyên ngành 7.595 câu **sinh từ khung câu**, khoảng 40% do
mô hình ngôn ngữ lớn diễn đạt lại, trong đó 1.600 câu ghép nhiều vấn đề để mô hình học
nêu đồng thời nhiều khía cạnh. Nhãn chuyên ngành **chưa phải người gán trên phản hồi
thật**; tập gán nhãn thật là việc tiếp theo.

**"Có rò rỉ tập kiểm tra không?"**
Có hai lớp lọc. Thứ nhất, loại cả khung câu nếu có biến thể trùng mặt chữ với tập chuẩn:
66/133 khung bị loại. Thứ hai, lọc từng câu sinh ra. LLM không bao giờ nhận câu của tập
kiểm tra. `train.py` loại thêm câu trùng tập kiểm tra và ghi mã băm của tập đó vào
checkpoint. Giới hạn còn lại: không loại trừ được trùng ý nghĩa ngẫu nhiên.

**"Tập kiểm tra có đủ lớn không?"**
Không: chỉ 48 câu, một người gán. Khoảng tin cậy rộng, nên con số là tín hiệu về hướng
đi, chưa phải kết quả công bố.

**"Sao không dùng PhoBERT?"**
ViSoBERT được huấn luyện trên văn bản mạng xã hội tiếng Việt, đúng loại văn bản của
phản hồi TMĐT, và không cần bước tách từ (PhoBERT cần VnCoreNLP chạy Java). Nhóm đã xin
phép nhóm tác giả để sử dụng.

## Nếu có sự cố khi trình bày

| Hiện tượng | Xử lý |
|---|---|
| Thanh bên báo "ViSoBERT tắt" | Xem cửa sổ ViSoBERT; mô hình cần khoảng 30 giây để nạp |
| Báo "chưa tinh chỉnh" | Thiếu `nlp_service/checkpoints/visobert-absa/`; chạy lại `train.py` |
| Tab thực nghiệm dòng M "chưa có số" | Chạy `npm run eval` trong `backend/` **khi dịch vụ ViSoBERT đang chạy** |
| Trang trắng | Kiểm tra cửa sổ backend đã in "Máy chủ đang chạy tại cổng 5000" |
