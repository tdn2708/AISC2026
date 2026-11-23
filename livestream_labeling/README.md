# Dữ liệu và nhãn bình luận livestream (Customer Radar – phần Live)

## Cập nhật 19/11/2026 — đợt 5: thêm công nghệ và thời trang (dùng số liệu ở mục này)

Mục đích: giảm lệch về gốm sứ. **File huấn luyện chính: `output/04_tap_train_ban_hang_sach.csv` — 8.157 câu** (gia dụng 4.718 · công nghệ 1.780 · quần áo 1.659; YouTube 7.062 · TikTok 1.095). Kênh gốm Huyền Lý còn 48% (trước ~68%). Intent: ORDER 2.871 · QUESTION 2.135 · SOCIAL 1.482 · REQUEST 913 · PRAISE 236 · OTHER 229 · COMPLAINT 191 · NEGOTIATE 60 · GIVEAWAY 40.

| Mục | Đợt 5                                                                                                                                                                               |
|---|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nguồn | YouTube: `raw/youtube3` (46 phiên tìm theo từ khoá), `raw/youtube4` (123 live cũ lấy từ tab "Phát trực tiếp" của 11 kênh có chat đông). Ngành gán theo kênh qua `category_map.csv`. |
| Câu gán nhãn | 2.916 (công nghệ 2.000, quần áo 916), lô `w5_batch_00..19`                                                                                                                          |
| Người gán | A Claude, B Thao, C GPT, V Gemini (mọi câu A≠B + 20% A=B). Prompt: `data/PROMPT-GAN-NHAN-DOT5.md`, `data/PROMPT-KIEM-CHUNG-DOT5.md`. Chỉ 11 aspect cũ.                              |
| Câu A=B được kiểm chứng | ~5/450 câu bị sửa intent/sentiment/needs_reply (~1%)                                                                                                                                |
| Soát độc lập 80 câu ngẫu nhiên | 0 sai rõ intent, 2 câu còn tranh cãi                                                                                                                                                |
| Loại khỏi tập train sau soát | Kênh HACOM (live lắp PC kiểu talkshow → `review_cong_nghe_khong_ban`), 3 phiên quay số/tặng quà (`mini_game_tang_qua`), 1 phiên gia dụng lẫn (`ban_hang_lan_nganh`)                 |

Độ tin cậy A–B toàn bộ (mọi đợt, 9.105 câu đã gán, `output/do_tin_cay.json`): intent κ 0,846 · sentiment κ 0,695 · needs_reply κ 0,853 · aspects α-MASI 0,740. Nhãn của 6.173 câu đợt 1–4 không đổi (chỉ cột Dawid–Skene được ước lượng lại trên toàn bộ dữ liệu).

---

## Cập nhật 12/11/2026 — bộ dữ liệu đầy đủ (dùng số liệu ở mục này)

**File huấn luyện chính: `output/04_tap_train_ban_hang_sach.csv` — 5.801 câu**, chỉ phiên bán hàng thật (`loai_phien = ban_hang`), đã loại 12 câu tiếng Thái/Indonesia và 4 câu chưa có nhãn cuối.

| Mục | Số lượng |
|---|---|
| Bình luận thô đã cào | 45.292 (176 phiên; thêm 748 bình luận TikTok tối 11.11) |
| Bình luận sạch, 3 ngành | 6.968 |
| Đã gán nhãn (mọi loại phiên) | 6.169 |
| Tập huấn luyện (bán hàng thật) | **5.801**: gia dụng 4.718 · quần áo 743 · công nghệ 340; YouTube 4.780 · TikTok 1.021 |

Phân bố intent: ORDER 2.614 · QUESTION 1.152 · SOCIAL 1.031 · REQUEST 536 · PRAISE 159 · OTHER 137 · COMPLAINT 108 · GIVEAWAY 38 · NEGOTIATE 26.

**Bốn đợt gán nhãn:**

| Đợt | Câu | Người gán A | Người gán B | Kiểm chứng |
|---|---|---|---|---|
| 1–2 | 1.599 | Opus | Sonnet | Opus, đọc lại mọi câu |
| 3 | 4.061 (phần còn lại của dữ liệu sạch, chủ yếu gốm sứ YouTube) | Opus (lô 00–19), Sonnet (20–27) | Sonnet (00–19), Haiku (20–27) | Opus/Sonnet: mọi câu A≠B + 20% ngẫu nhiên câu A=B |
| 4 | 529 (TikTok 11.11: quần áo, gia dụng, công nghệ) | Sonnet | Haiku | Sonnet, như đợt 3 |

Từ đợt 3, câu A và B giống nhau ở intent, sentiment, needs_reply mà không rơi vào mẫu 20% thì nhận nhãn chung tự động (`quyet_dinh_kiem_chung = tu_dong_A=B`, aspects = phần giao của A và B). Trong mẫu 20% câu A=B được kiểm chứng (~700 câu), người kiểm chứng chỉ sửa intent khoảng 1% → nhãn tự động đáng tin ở mức này. Chuyển sang Sonnet/Haiku và bản hướng dẫn rút gọn `HUONG-DAN-TOM-TAT.md` theo yêu cầu tiết kiệm token của người dùng.

**Độ tin cậy A–B trên tập huấn luyện (n = 5.817 trước khi lọc ngôn ngữ):** intent κ = 0,877 [0,867–0,887]; needs_reply κ = 0,872; aspects α-MASI = 0,766; **sentiment κ = 0,664** (thấp hơn đợt 1–2: người gán Haiku hay để NEU cho câu chào/cảm ơn mà người gán khác để POS — dùng `sentiment_cuoi` cẩn trọng).

**Hạn chế còn lại:** 81% gia dụng (chủ yếu một kênh gốm sứ YouTube); công nghệ chỉ 340 câu; NEGOTIATE 26 và GIVEAWAY 38 quá ít để mô hình học tốt; chưa có người thật kiểm nhãn (202 câu `muc_tin_cay_intent = thap` nên được xem trước).

---

## Phiên bản 11/11/2026 (đợt 1–2, giữ để đối chiếu)

Cập nhật 11/11/2026. Phạm vi: livestream bán **gia dụng, quần áo/giày dép, đồ công nghệ** trên YouTube Live và TikTok Live.

## File kết quả (`output/`)

| File | Nội dung |
|---|---|
| `01_du_lieu_cao_tho.csv` | Toàn bộ 44.544 bình luận đã cào (139 phiên), có cột ngành, `spam_flag`, `spam_reason`. Không xoá dòng nào. |
| `01_nguon_phien_live.csv` | Nguồn: nền tảng, URL phiên, kênh, tiêu đề, thời gian, ngành, số bình luận, số spam, cách thu. |
| `02_du_lieu_sach.csv` | 6.439 bình luận sạch (3 ngành theo từ khoá, đã lọc spam, bỏ trùng trong phiên, có cột `loai_phien`). Mọi câu có nhãn đều nằm trong file này (nối qua `clean_id`). |
| `03_nhan_livestream.xlsx` | 1.583 bình luận đã gán nhãn + kiểm chứng. Sheet: `Nhan_cuoi`, `Dinh_nghia_nhan`, `Nguon_co_so`, `Do_tin_cay`, `Cong_thuc`, `Thong_ke`, `Nguon_du_lieu`. |
| `03_nhan_livestream.csv` | Sheet `Nhan_cuoi` dạng CSV (mọi loại phiên). |
| `04_tap_train_ban_hang_sach.csv` | **Tập huấn luyện chính** (chỉ phiên bán hàng, đã lọc ngôn ngữ). |
| `do_tin_cay.json` | Toàn bộ chỉ số độ tin cậy. |


## Kết quả độ tin cậy (người gán A vs người gán B, n = 1.599 câu; người kiểm chứng không tham gia các chỉ số này)

| Trường | Đồng ý | Cohen's κ [KTC 95%] | Diễn giải (Landis & Koch) |
|---|---|---|---|
| intent (9 lớp) | 86,8% | 0,834 [0,813–0,854] | gần như hoàn toàn |
| sentiment | 96,3% | 0,822 [0,777–0,866] | gần như hoàn toàn |
| needs_reply | 95,1% | 0,887 [0,863–0,911] | gần như hoàn toàn |
| aspects (đa nhãn) | khớp hoàn toàn 72,5% | α-MASI 0,699; Jaccard TB 0,768 | chấp nhận tạm (≥0,667) |

- κ theo lớp intent: ORDER 0,93; QUESTION 0,93; REQUEST 0,89; PRAISE 0,85; GIVEAWAY 0,84; SOCIAL 0,75; COMPLAINT 0,67; NEGOTIATE 0,58; **OTHER 0,49** (A gán 85 câu, B gán 199 câu — B hay xếp câu đáp ngắn "ok", "vâng" vào OTHER). Gộp SOCIAL+OTHER thì κ intent = 0,894.
- Bộ luật từ khoá hiện có của dự án (`intent.js`): độ chính xác ước lượng Dawid–Skene ≈ 0,39 → có cơ sở để thay bằng mô hình học máy.
- Phân xử trên 1.583 câu: 1.229 câu A=B được giữ; 336 câu A≠B được chọn theo A (237) hoặc B (99); 12 câu A≠B nhận nhãn thứ ba theo ghi nhận của người kiểm chứng; 6 câu A=B bị sửa. Tính lại từ dữ liệu: chỉ **6 câu** có intent cuối khác cả A lẫn B. Nhãn cuối trùng A 98,0%, trùng B 88,1%.
- Cột lọc nên dùng: `muc_tin_cay_intent` — **cao** 1.135 câu (A = B = người kiểm chứng, chắc chắn cao), **trung_binh** 385, **thap** 63 (người kiểm chứng ghi "low" hoặc nhãn cuối khác cả A và B).
- `p_nhan_cuoi_DawidSkene` (xác suất hậu nghiệm của chính `intent_cuoi`) và `intent_DawidSkene` chỉ để tham khảo: mô hình Dawid–Skene với 3 người gán (C rất yếu) nghiêng về B, trong khi người kiểm chứng nghiêng về A → hai nguồn này không thống nhất ở ~160 câu.

## Loại phiên (cột `loai_phien`) — đọc trước khi train

Gắn ngành bằng từ khoá trên tiêu đề/kênh nên một số phiên trong 3 ngành **không phải bán hàng trực tiếp đúng ngành**. Chúng được giữ lại nhưng gắn cờ:

| loai_phien | Câu sạch | Câu có nhãn | Ghi chú |
|---|---|---|---|
| `ban_hang` | 5.272 | 1.227 | Dùng làm tập chính |
| `review_cong_nghe_khong_ban` | 869 | 120 | Tony Phùng Studio (live bàn về iPhone, 2018) — không bán hàng |
| `san_sale_da_nganh` | 151 | 120 | Ông Tek "săn sale 11.11" — lẫn nhiều ngành |
| `ban_hang_lan_nganh` | 87 | 87 | Túi vintage, có lẫn đồ ăn |
| `may_cong_cu`, `vlog_do_si` | 60 | 29 | Máy hàn/máy cầm tay; vlog đồ si |

Sau khi lọc `loai_phien = ban_hang`: gia dụng 590 câu nhãn, quần áo 443, **công nghệ chỉ còn 194** (22 ORDER).

## Giới hạn cần ghi trong báo cáo

- **Người gán là mô hình ngôn ngữ, chưa có người thật kiểm tra.** Trước khi gọi là "nhãn vàng", cần một người đọc lại 63 câu `muc_tin_cay_intent = thap` và một mẫu ngẫu nhiên ~150 câu. Bản soát độc lập 60 câu ngẫu nhiên thấy 1 câu sai rõ (≈1,7%, cận trên Wilson 95% ≈ 9%) và 4 câu còn tranh cãi.
- **Thiên lệch cùng mô hình:** A, B và người kiểm chứng đều là Claude; người kiểm chứng (Opus) cùng mô hình với A và chọn A nhiều hơn hẳn B. κ có thể cao hơn so với người thật.
- **Lệch nguồn nặng:** kênh "GỐM NHẬT HUYỀN LÝ" chiếm 3.934/6.439 câu sạch (61%; 86% ngành gia dụng), phần lớn là YouTube 2021–2022. ~19% câu sạch chỉ là số/mã trần ("80", "m15"). TikTok chỉ 503 câu sạch (chủ yếu quần áo); TikTok gia dụng + công nghệ 111 câu do dừng cào sớm và giới hạn kết nối. Mẫu gán nhãn đã giới hạn 60 câu/phiên nhưng khi train vẫn phải tách theo phiên/kênh.
- **72,5% dữ liệu thô nằm ngoài phạm vi** (32.296/44.544 câu của 59 phiên: mỹ phẩm, xe máy, nhạc cụ, show giải trí…) — có trong `01_du_lieu_cao_tho.csv` với `category = ngoai_pham_vi`, không được gán nhãn.
- Hướng dẫn được bổ sung giữa chừng: đợt 1 phân xử theo v1.1, đợt 2 theo v1.2. Một số câu đợt 1 có thể chưa theo v1.2 (chủ yếu aspects VARIANT và ranh giới SOCIAL/OTHER).
- Lấy mẫu đợt 1 diễn ra trước khi sửa luật lọc; cả 1.583 câu nhãn đều nằm trong file sạch hiện tại (16 câu được nối lại theo phiên + nội dung). Nhãn A của đợt 2 lô 03 được gán lại ngày 11/11 vì agent trước bị ngắt do hết hạn mức.
- **Không có số đơn hàng thật** (không nền tảng nào công khai). Tín hiệu thay thế là bình luận `ORDER`. Lượt xem theo thời gian chỉ có ở TikTok (`raw/*/tt_metrics.csv`); YouTube chỉ có tổng lượt xem cuối.
- Shopee Live không cào được (cần đăng nhập app).
- Số trần ≥100 trong phiên gốm vẫn mơ hồ giữa mã và giá (ảnh hưởng aspects, không ảnh hưởng intent).
- NEGOTIATE (14), GIVEAWAY (9), COMPLAINT (32) quá ít mẫu để train tốt → cần cào thêm hoặc tăng cường dữ liệu.
- Trích dẫn: 14/28 mục ở sheet `Nguon_co_so` mới xác minh "một phần" — mở bản gốc đối chiếu trước khi nộp.

## Quyền riêng tư

- Trong `output/` và `data/`: tên người bình luận được băm; dãy 8–11 chữ số (SĐT, kể cả dạng 9 số bỏ số 0) bị che thành `[SĐT]`; `@tên` thành `@[USER]`; tin có số tài khoản/tên chủ tài khoản bị che toàn bộ. Tên người được nhắc trong câu chữ thường (không có @) có thể vẫn còn.
- **Không chia sẻ thư mục `raw/`**: file `raw/youtube*/*.live_chat.json` là bản gốc còn tên và ID kênh người bình luận; các CSV trong `raw/` chưa qua lớp che mới. SĐT người bán trong tiêu đề phiên là thông tin kinh doanh công khai nên được giữ.
