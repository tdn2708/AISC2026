# GEMINI.md

Hướng dẫn cho Gemini khi làm việc trong repo Customer Radar. Hiểu sâu về dự án nằm ở các file dưới; file này chỉ nói đọc gì trước và các luật không được phá.

## Đọc trước khi sửa

1. [CLAUDE.md](CLAUDE.md): lệnh chạy, kiến trúc (hai kho dữ liệu, Trust Layer, worker tính ngữ cảnh, đăng nhập), luật prod. Áp dụng nguyên cho Gemini.
2. Việc đang giao: [KE-HOACH-QUAN-GIA.md](KE-HOACH-QUAN-GIA.md) (quản gia 24/7 qua Zalo). Làm đúng thứ tự giai đoạn ở mục 9, ghi nhật ký vào mục 12, báo cáo theo mục 11 rồi dừng.
3. Việc giao diện: [DESIGN.md](DESIGN.md) (hệ thiết kế đã khóa) và [KE-HOACH-GIAO-DIEN.md](KE-HOACH-GIAO-DIEN.md) mục 1, 2, 8.

## Luật không được phá

- **Không commit, không push.** Chỉ sửa cây làm việc. Claude đọc diff, chạy lại test rồi mới commit; người dùng duyệt push.
- **Không đụng dữ liệu thật.** `backend/.env` trỏ cụm MongoDB Atlas đang phục vụ web thật. Mọi lần chạy backend ở máy phải đặt trước (PowerShell):
  ```powershell
  $env:MONGODB_DB='customer_radar_ui_test'; $env:MONGODB_REAL_DB='customer_radar_ui_test_real'; $env:AUTO_COLLECT='0'; $env:PORT='5000'
  ```
  Không chạy `npm run seed` thiếu hai biến database trên. Không xóa database hay collection nào, trừ database có tên chứa `_test` và chỉ sau khi kiểm tên trong code.
- **Không gọi API prod** (`aisc2026-q1vx.onrender.com`) để thử. Thử trên backend local.
- **Không in, không ghi ra file, không đưa vào commit**: nội dung `backend/.env`, `nlp_service/.env`, token GitHub trong `.git/config`, `PII_SALT`, `WRITE_KEY`, `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET`, khóa API, token phiên. Không sửa file `.env`.
- **Không sửa**: `backend/evaluation/results.json`, `handoff-customer-radar.md`, `src/vendor/**`, `.github/**`.
- **Không thêm thư viện npm** khi kế hoạch không ghi rõ. Máy chủ Render chỉ có 512 MB RAM.
- **Không xóa route hay cây component** nếu kế hoạch không ghi rõ file nào.
- Trình duyệt tự động không được tải file vào thư mục repo (Vite sập vì file `.crdownload`); ảnh chụp và file tạm để ngoài repo.

## Quy ước

- Comment, chữ giao diện, tin nhắn: tiếng Việt. Backend CommonJS; frontend React 19, Vite, Tailwind v4.
- Chữ giao diện: không dấu "·" nối chuỗi, không mũi tên "→" dán vào chữ hay nút, không nhãn IN HOA, không chữ "tuyệt đối", không emoji, không chấm tròn trạng thái trang trí, không thẻ lồng thẻ. Số kiểu Việt (2,45%; 14.128), ô trống "—".
- Màu, cỡ chữ, bo góc, thời lượng chuyển động chỉ lấy từ token và component trong DESIGN.md.
- Kiểm trước khi báo xong: `cd backend; npm test`; ở gốc repo `npm run lint` và `npm run build`.
- Windows: script nhiều dòng có backtick hay `${}` thì ghi ra file rồi chạy, không dán vào heredoc. File test backend dùng CRLF.
