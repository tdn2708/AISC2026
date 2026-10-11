---
title: Customer Radar ViSoBERT
emoji: 📡
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

Dịch vụ suy luận ViSoBERT tinh chỉnh cho Customer Radar (đội LDS, Trường ĐH
Công nghệ Thông tin – ĐHQG-HCM).

- `GET /health` — trạng thái, thông tin checkpoint
- `POST /predict` — cảm xúc, danh mục, nguyên nhân, xác suất rác
- `POST /explain` — phân bố xác suất và mức ảnh hưởng từng từ

Các endpoint suy luận yêu cầu `Authorization: Bearer <VISOBERT_API_KEY>`; chỉ
backend Customer Radar giữ khóa này. Văn bản gửi tới đã được che thông tin cá
nhân ở phía backend.

Mô hình gốc: uitnlp/visobert (Nguyen và cs., EMNLP 2023).
