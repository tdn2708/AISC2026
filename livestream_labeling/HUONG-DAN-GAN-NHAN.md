# Hướng dẫn gán nhãn bình luận livestream bán hàng (v1 — 10/11/2026)

Phạm vi: bình luận người xem trong phiên livestream bán **quần áo/giày dép, đồ gia dụng, đồ công nghệ**; từ v1.4 (18/11/2026) thêm **mỹ phẩm, trang sức/phụ kiện, thực phẩm, mẹ và bé** (TikTok Live, YouTube Live).
Đơn vị gán nhãn: **một bình luận**. Chỉ dựa vào chữ trong bình luận + tiêu đề/ngành hàng của phiên; không đoán điều không viết ra.
Bộ nhãn này tách riêng khỏi bộ nhãn phản hồi sau mua (Delivery/ProductQuality/...) của Customer Radar, vì bình luận live là hội thoại thời gian thực, ngắn, nhiều tiếng lóng và gắn với quyết định mua ngay.

Mỗi bình luận có 5 trường:

| Trường | Kiểu | Giá trị |
|---|---|---|
| `intent` | 1 nhãn | ORDER, QUESTION, REQUEST, NEGOTIATE, COMPLAINT, PRAISE, GIVEAWAY, SOCIAL, OTHER |
| `aspects` | nhiều nhãn (0..n) | PRICE, PROMOTION, SIZE_FIT, VARIANT, SPEC_MATERIAL, USAGE, STOCK, SHIPPING, ORDER_PROCESS, QUALITY_TRUST, HOST_STREAM, SKIN_CONCERN, INGREDIENT_SAFETY, AGE_STAGE (3 nhãn cuối từ v1.4) |
| `sentiment` | 1 nhãn | POS, NEU, NEG |
| `needs_reply` | 0/1 | 1 nếu người bán nên trả lời/hành động với bình luận này |
| `product_ref` | chuỗi (có thể rỗng) | mã/tên sản phẩm được nhắc: "m83", "mã 9", "ip 7 plus", "áo thun" |

---

## 1. `intent` — hành vi của người bình luận (chọn đúng 1)

Cơ sở: lý thuyết hành vi ngôn ngữ (speech act) của Searle (1976) chia phát ngôn theo mục đích: *directive* (yêu cầu/hỏi), *commissive* (cam kết), *expressive* (bày tỏ), *assertive* (khẳng định). Các bộ nhãn dialogue act (DAMSL/SWBD-DAMSL, Stolcke et al., 2000) cụ thể hoá thành nhãn hỏi, yêu cầu, đồng ý, chào hỏi... Ở đây gộp lại theo **giai đoạn ra quyết định mua** (nhận biết → cân nhắc → mua) để người bán hành động được: ORDER = cam kết mua; QUESTION/REQUEST/NEGOTIATE = đang cân nhắc; PRAISE/COMPLAINT = bày tỏ; SOCIAL/GIVEAWAY = tương tác không gắn với mua.

| Nhãn | Định nghĩa | Tiêu chí nhận biết | Ví dụ thật | Không phải |
|---|---|---|---|---|
| **ORDER** | Người xem **cam kết mua** hoặc báo đã mua/đặt. (commissive) | "lấy", "chốt", "đặt", "em mua", "đã mua", mã sp + số lượng ("m83 x2", "chot m 83"), báo đã thanh toán; trong phiên đấu giá: trả giá cụ thể ("ch150", "250/10") | "em lấy ạ", "chot m83", "Đã mua 606k9", "Em mua combo 6 r" | "lấy được không?" (→ QUESTION); "muốn mua mà đắt quá" (→ NEGOTIATE) |
| **QUESTION** | Hỏi để **lấy thông tin** về sản phẩm/giá/giao hàng/cách mua. (directive – hỏi) | Có từ hỏi (bao nhiêu, không, ko, sao, nào, có…không, ạ?) hoặc dấu "?" và nội dung về hàng hoá/dịch vụ | "ip 7 plus giá sẽ bao nhiêu anh", "Free ship mọi mặt hàng ko mọi người???", "Da mụn sài dc hem" | Câu hỏi xã giao "ăn cơm chưa" (→ SOCIAL) |
| **REQUEST** | Yêu cầu người live **làm một hành động** trên sóng. (directive – yêu cầu) | Động từ mệnh lệnh + "đi/với/nha": lên sp, cho xem, thử, soi gần, đọc lại mã, ghim link, tư vấn cho em | "Lên cần cheap đi", "cho co xem tô bông có nắp", "Tư vấn mã 9 giúp em ạ" | Xin quà "tặng em đi" (→ GIVEAWAY) |
| **NEGOTIATE** | **Do dự / phản đối về giá** hoặc mặc cả. | Chê đắt, xin bớt, so sánh giá, "giá yêu thương", "để rẻ hơn được không" | "Mình muốn mua mã 51 mà giá đang cao quá", "Chị để cho em giá yêu thương nhá" | Hỏi giá trung tính (→ QUESTION + PRICE) |
| **COMPLAINT** | Phàn nàn, nghi ngờ, tố lỗi về hàng, giao hàng, shop, người live. | Từ tiêu cực, nghi ngờ thật/giả, chưa nhận hàng, hàng lỗi, "lừa", "nhái" | "Bà NTN làm mất hứng", "nhái hơi" | Chê đắt (→ NEGOTIATE) |
| **PRAISE** | Khen sản phẩm/người live, ủng hộ, xác nhận tốt. (expressive tích cực) | đẹp, xịn, ưng, mê, ủng hộ, "hàng đẹp quá" | "nhạc hay quá đê", "Xin chào MC gốm Huyền Lý xinh đẹp nhoa" (chào + khen → PRAISE nếu khen là chính) | |
| **GIVEAWAY** | Xin quà, tham gia mini game, điểm danh để nhận thưởng. | "tặng", "xin quà", "free", "điểm danh", hô số trong mini game | "tặng em đi", "Tặng tiếp đi để tôi đặt", "Freeeee" | |
| **SOCIAL** | Chào hỏi, tán gẫu, tag bạn, chuyện ngoài lề không về hàng hoá. | chào, tag @, kể chuyện cá nhân, bàn chuyện khác | "em ăn cơm rồi", "@Hien Thanh", "hi anh VanLien nha" | |
| **OTHER** | Không xác định được nghĩa, vô nghĩa, chỉ emoji/ký tự, quảng cáo, nội dung xúc phạm/khiêu dâm không liên quan. | | "Cheoa", "....…", "ngực bự vãi" | |

**Quy tắc ưu tiên khi một bình luận có nhiều hành vi:** ORDER > COMPLAINT > NEGOTIATE > QUESTION > REQUEST > GIVEAWAY > PRAISE > SOCIAL > OTHER.
(Lý do: tín hiệu chốt đơn và rủi ro (phàn nàn) có giá trị hành động cao nhất cho người bán; đây cũng là thứ tự ưu tiên trong `backend/services/live/intent.js` hiện có, mở rộng thêm.)
Ví dụ: "Tặng tiếp đi để tôi đặt" → GIVEAWAY (chưa cam kết mua); "em lấy m83, ship HN bao lâu?" → ORDER (aspects: SHIPPING).

## 2. `aspects` — khía cạnh được nhắc (0..n nhãn)

Cơ sở: phân tích cảm xúc theo khía cạnh (ABSA) — Pontiki et al. (SemEval-2014 Task 4; SemEval-2016 Task 5) định nghĩa khía cạnh là thuộc tính của thực thể mà người viết nói tới; với tiếng Việt, UIT-ViSFD (Luc Phan et al., 2021) dùng 10 khía cạnh cho bình luận thương mại điện tử; VLSP 2018 ABSA dùng cặp thực thể#thuộc tính. Ở đây khía cạnh được chọn theo **những gì người bán có thể nói/làm ngay trên sóng** (giá, mã giảm, size, tồn kho…), khớp với 13 chủ đề câu hỏi đang có trong `intent.js` của dự án nhưng gộp lại cho ổn định khi gán nhãn.

| Nhãn | Định nghĩa | Từ khoá gợi ý |
|---|---|---|
| **PRICE** | Giá bán, giá sau giảm, đắt/rẻ, mặc cả | giá, bao nhiêu, nhiêu, k, tr, đắt, rẻ, bớt |
| **PROMOTION** | Mã giảm giá, voucher, freeship, quà tặng kèm, flash sale, combo | mã giảm, voucher, freeship, tặng kèm, sale, deal, combo |
| **SIZE_FIT** | Kích cỡ, số đo, cân nặng/chiều cao, vừa không | size, cỡ, kg, m6, mặc vừa, chân 38 |
| **VARIANT** | Màu, mẫu, mã số sản phẩm, phiên bản/dung lượng | màu, mẫu, mã 9, tông, bản 128G |
| **SPEC_MATERIAL** | Chất liệu, thông số kỹ thuật, thành phần, chức năng | chất, vải, cotton, inox, pin, chip, công suất, chống nước |
| **USAGE** | Cách dùng, liều lượng, trình tự, bảo quản, hợp hoàn cảnh nào (trừ loại da → SKIN_CONCERN, tuổi → AGE_STAGE) | dùng sao, thoa mấy lần, pha bao nhiêu, đi biển dùng được không |
| **STOCK** | Còn hàng, hết hàng, số lượng còn | còn không, hết chưa, còn size |
| **SHIPPING** | Phí ship, thời gian/khu vực giao | ship, giao, bao lâu nhận, HN, tỉnh |
| **ORDER_PROCESS** | Cách đặt, link/giỏ hàng, thanh toán, COD, xác nhận đơn | link, giỏ, đặt sao, ck, cod, đã chốt chưa |
| **QUALITY_TRUST** | Chất lượng, độ bền, chính hãng/nhái, bảo hành, đổi trả | xịn, auth, nhái, bảo hành, đổi trả, lỗi |
| **HOST_STREAM** | Về người live, âm thanh, hình ảnh, tốc độ đọc mã | to lên, đọc chậm, MC, không nghe |
| **SKIN_CONCERN** (v1.4) | Loại da/tóc hoặc vấn đề da/tóc của người hỏi hay sản phẩm nhắm tới | da dầu, da khô, nhạy cảm, mụn, nám, thâm, lỗ chân lông, rụng tóc |
| **INGREDIENT_SAFETY** (v1.4) | Thành phần hoá học/dinh dưỡng và độ an toàn: kích ứng, dị ứng, corticoid, chất bảo quản, phẩm màu, bầu/cho con bú dùng được không | thành phần gì, có cồn không, kích ứng không, bầu dùng được không, có chất bảo quản không |
| **AGE_STAGE** (v1.4) | Độ tuổi hoặc giai đoạn của bé/mẹ quyết định sản phẩm phù hợp | bé 6 tháng, sơ sinh, sữa số 2, bé 3 tuổi, mẹ sau sinh, bầu 3 tháng |

Không gán khía cạnh cho SOCIAL/OTHER thuần. GIVEAWAY có thể kèm PROMOTION.

## 3. `sentiment` — sắc thái

POS: khen, hào hứng, hài lòng. NEG: chê, bực, nghi ngờ, chê đắt. NEU: hỏi/yêu cầu/chốt đơn không kèm cảm xúc rõ.
Cơ sở: thang 3 mức như UIT-ViSFD và SemEval ABSA. Chốt đơn mặc định NEU trừ khi có biểu cảm ("lấy luôn chị yêu" → POS).

## 4. `needs_reply`

=1 khi bình luận **chờ người bán đáp lại hoặc làm gì đó**: mọi QUESTION, REQUEST, NEGOTIATE, COMPLAINT; ORDER cần xác nhận (có mã/số lượng/hỏi kèm). =0 với PRAISE, SOCIAL, GIVEAWAY thuần, OTHER.
Cơ sở: tỉ lệ khách hỏi được trả lời và thời gian chờ là chỉ số đã có trong `report.js`; tương tác thời gian thực/khả năng phản hồi là yếu tố thúc đẩy niềm tin và ý định mua trong live commerce (Wongkitrungrueng & Assarut, 2020; Sun et al., 2019 — metavoicing & guidance shopping).

## 5. `product_ref`

Chép nguyên văn cụm chỉ sản phẩm nếu có ("m83", "mã 51", "cần đài", "ip 7 plus"). Rỗng nếu không có. Dùng để tính "sản phẩm nào đang được hỏi nhiều nhưng ít chốt".

---

## Cơ sở lý luận cho bài toán (liên hệ quyết định của người live)

- Bình luận thời gian thực là tín hiệu dẫn dắt doanh số: số lượt và số người gửi bình luận (danmaku) trung gian một phần giữa tương tác và doanh số livestream, và cảm xúc bình luận có vai trò điều tiết (Zhang, Li, Qian, Li & Yuan, 2024, JRCS 78:103793).
- Khuyến mãi và cảm giác hiện diện xã hội làm tăng mua bốc đồng trong live-stream (Huo et al., 2023, SAGE Open) → cần tách PROMOTION và GIVEAWAY để đo phản ứng với khuyến mãi.
- Tương tác thời gian thực, khả năng hỏi-đáp, hướng dẫn mua (guidance shopping) ảnh hưởng ý định mua (Sun et al., 2019, ECRA) → nhãn QUESTION/REQUEST + needs_reply.
- Live streaming xây niềm tin người bán qua giá trị tức thời và tính xác thực (Wongkitrungrueng & Assarut, 2020, JBR) → nhãn COMPLAINT + QUALITY_TRUST.
- Gắn kết quan hệ người xem – người bán thúc đẩy engagement (Hu & Chaudhry, 2020, Internet Research) → giữ SOCIAL/PRAISE thay vì bỏ đi như rác.
- Động cơ xem live mua sắm gồm cả thực dụng (thông tin, giá) và giải trí (Cai & Wohn, 2019, HICSS) → tách nhóm "cân nhắc mua" và "giải trí/xã hội".
- Phát hiện ý định mua từ bài đăng mạng xã hội là bài toán phân loại khả thi (Gupta et al., 2014, ICWSM) → nhãn ORDER/NEGOTIATE.

Ví dụ quy tắc hành động suy ra từ nhãn (dùng ở Coach/Live của dự án):
- Tỉ lệ QUESTION có aspect PRICE ∪ PROMOTION > 40% trong 5 phút → gợi ý nói rõ giá + mã giảm.
- Nhiều QUESTION + REQUEST nhưng ORDER/(QUESTION+REQUEST) < 25% → nhắc lại cách đặt (ORDER_PROCESS), chốt khan hiếm, trả lời câu hỏi tồn đọng.
- NEGOTIATE tăng → cân nhắc combo/mã giảm; COMPLAINT có QUALITY_TRUST → đưa bằng chứng chính hãng/bảo hành.

## Phụ lục v1.1 — quy ước bổ sung sau đợt 1 (10/11/2026)

Thêm sau khi hai người gán độc lập báo các ca mơ hồ (đúng bước "Revise" của chu trình MATTER). Áp dụng khi phân xử đợt 1 và gán đợt 2.

1. **Số/mã trần** ("36", "m83", "mã 14", "39", "250/10") trong phiên bán hàng/đọc mã → **ORDER**. Aspect: `VARIANT` nếu là mã sản phẩm (có m/mã, hoặc số 1–3 chữ số trong phiên đọc mã); `PRICE` nếu có k/tr/nghìn hoặc là trả giá trong phiên đấu giá; `SIZE_FIT` nếu là size (S/M/L/XL, giày 34–45 trong phiên giày dép). `product_ref` = chính chuỗi đó. Không chắc là mã hay giá → `VARIANT`, ghi note.
2. **"X đi", "lên X đi", "cho xem X", "mã 14 đi ạ"** → **REQUEST** (yêu cầu đưa lên/cho xem), không phải ORDER. "lấy X", "chốt X", "X x2" → ORDER.
3. **Nêu cân nặng/chiều cao/số đo mà không có từ hỏi** ("65 ký", "1m50 47kg") → **QUESTION** + `SIZE_FIT`, needs_reply=1 (ngầm hỏi size).
4. **Xin miễn phí kiểu đùa** ("cho xin cái đt", "cho e tiền mua iphone") → **GIVEAWAY**.
5. **`HOST_STREAM` được phép đi kèm COMPLAINT, REQUEST, SOCIAL** (ngoại lệ của quy tắc "không gán aspect cho SOCIAL"): "mất tiếng", "nói to lên", "nghe được rồi".
6. **Tin hướng dẫn đặt hàng/quảng cáo kèm SĐT/Zalo** có vẻ do chủ phiên hoặc người ngoài đăng → **OTHER**. Khách để SĐT để chốt ("0348xx", "[SĐT] lấy m5") → ORDER + `ORDER_PROCESS`.
7. **Báo đặt nhầm/sửa đơn** ("đặt nhầm size M rồi") → ORDER + `ORDER_PROCESS`, sentiment NEG, needs_reply=1.
8. **Chê đặc điểm sản phẩm không liên quan giá** ("gót cao quá", "to quá") → COMPLAINT + aspect tương ứng (SIZE_FIT/SPEC_MATERIAL), không phải OTHER.

## Phụ lục v1.2 — quy ước bổ sung từ người kiểm chứng (10/11/2026)

Áp dụng khi phân xử đợt 2 trở đi (người gán đợt 2 dùng v1.1; khác biệt do v1.2 được giải quyết ở bước phân xử).

9. **VARIANT** chỉ khi có màu, mẫu, hoa văn, mã số hoặc phiên bản. Tên loại sản phẩm chung ("áo", "ấm", "ly", "sữa tắm") **không** phải VARIANT (ghi vào `product_ref`).
10. **SOCIAL vs OTHER:** câu đáp/xác nhận ngắn có nghĩa ("ok", "vâng", "đúng rồi") và ý kiến trao đổi giữa người xem → **SOCIAL**. OTHER chỉ cho vô nghĩa, chỉ emoji/ký tự, quảng cáo, tin của chủ phiên, xúc phạm.
11. Bổ sung ví dụ cho #8: "9 phân cao quá để e chọn mẫu khác", "to quá anh không lấy" → COMPLAINT, needs_reply=1.
12. **ORDER_PROCESS** gồm cả xin gắn/ghim link, giỏ hàng ("ghim lại link", "gắn giỏ giúp em").
13. **Phiên đọc mã vs phiên đấu giá:** "đấu giá" khi tiêu đề/ngữ cảnh có "đấu giá" hoặc người xem trả giá tăng dần; còn lại coi là phiên đọc mã. Dạng "giá×SL" ("700×2", "100x2") → ORDER + PRICE, product_ref chép nguyên. Số trần không có k trong phiên đọc mã → VARIANT.
14. "nghe được rồi", "em nghe được" → SOCIAL + HOST_STREAM.
15. Lo ngại vừa/chật không có từ hỏi ("em sợ chặt bụng") → QUESTION + SIZE_FIT (mở rộng #3).
16. Xin thông tin bằng câu mệnh lệnh ("cho địa chỉ đi em", "cho xin giá đi") → **QUESTION** (bản chất là hỏi thông tin; khác "lên X đi" là yêu cầu hành động trên sóng).
17. Giá có k ("50k", "chốt 50k") → product_ref chép nguyên chuỗi.
18. **HOST_STREAM đi kèm PRAISE** khi khen người live/buổi live ("fan anh nè", "live vui quá"). "Tặng like/ủng hộ" = PRAISE; "chào + chúc" = SOCIAL.
19. **SOCIAL/OTHER không gắn aspect** (kể cả tin mẫu của shop, lời khuyên giữa người xem), ngoại lệ duy nhất là HOST_STREAM (#5, #14).
20. **SĐT trần hoặc tên + SĐT** trong phiên bán → ORDER + ORDER_PROCESS (khách để số chốt đơn).
21. **Phân vân giữa các lựa chọn** ("rêu với vàng phân vân") → QUESTION (ngầm xin tư vấn) + VARIANT.
22. **"X đi" mà X là con số kiểu giá** ("40 đi", "bớt 50 đi") → NEGOTIATE + PRICE (không phải REQUEST). "xem mã 8", "mã 1 mã 24 đi" → REQUEST + VARIANT.

23. **Dãy 5–6 chữ số** (đuôi SĐT theo hướng dẫn đặt hàng của shop) → ORDER + ORDER_PROCESS.
24. **Hoãn/huỷ chốt** ("khoan chốt", "xả mã 38", "bỏ mã X") → ORDER + ORDER_PROCESS, needs_reply=1.
25. **"X được không" mà X là hành động trên sóng** (thử, mặc lại, quay gần) → REQUEST; QUESTION chỉ khi hỏi lấy thông tin.
26. **"m53", "m6" kèm cân nặng** là chiều cao → SIZE_FIT, product_ref rỗng.

### Phụ lục v1.3 — quy ước cho phiên gốm/đấu giá (11/11/2026, dùng khi phân xử đợt 3)

27. **"xả dùm/xả cho + món + giá"** ("xả dùm chị 2 dĩa 400") → ORDER + PRICE (nhờ shop bán cho mình). **"xả mã X"** đứng một mình, sau khi đã chốt → ORDER + ORDER_PROCESS (huỷ chốt, #24).
28. **"tang", "tăg", "tăng 50"** trong phiên đấu giá/giao lưu gốm → ORDER + PRICE (nâng giá). Chỉ GIVEAWAY khi rõ là xin quà ("tặng em đi", "xin quà").
29. **Số trần 3 chữ số** (100–999) không có k → ORDER + VARIANT (chưa đủ căn cứ là giá); **từ 4 chữ số** ("1250") → ORDER + PRICE; dãy 5–6 chữ số → ORDER_PROCESS (#23).
30. **"X lỗi", "70 loi"** → QUESTION + VARIANT + QUALITY_TRUST (hỏi mã đó có lỗi không), certainty medium.

Ghi chú tồn đọng: số trần 3 chữ số (≥100) trong phiên gốm "giao lưu/khui thùng" vẫn mơ hồ giữa mã (VARIANT) và trả giá (PRICE); intent luôn là ORDER nên không ảnh hưởng intent, chỉ ảnh hưởng aspects. Cần người bán xác nhận quy ước đọc mã của từng kênh.

## Quy trình gán nhãn và kiểm chứng (MATTER — Pustejovsky & Stubbs, 2012)

1. Model: bộ nhãn này. 2. Annotate: **người gán A** (Claude Opus) và **người gán B** (Claude Sonnet) gán độc lập toàn bộ mẫu, không thấy nhãn của nhau.
3. Đường cơ sở: bộ luật từ khoá của dự án (`intent.js`) là người gán C.
4. Đo độ tin cậy giữa A và B: Cohen's κ (Cohen, 1960); Krippendorff's α (Krippendorff, 2004/2011) cho A–B, A–B–C và cho nhãn đa trị (khoảng cách MASI với aspects); khoảng tin cậy 95% bằng bootstrap (Efron, 1979); diễn giải theo Landis & Koch (1977) và khuyến nghị α ≥ 0,667 chấp nhận tạm, ≥ 0,8 tin cậy (Krippendorff, 2004); tham khảo Artstein & Poesio (2008).
5. Mô hình Dawid–Skene (1979) trên A, B, C: ước lượng ma trận nhầm lẫn từng người gán và xác suất hậu nghiệm của nhãn (chỉ tham khảo vì chỉ có 3 người gán và C yếu).
6. Kiểm chứng/phân xử: **agent thứ ba** (Claude Opus, không tham gia gán) đọc lại TỪNG bình luận cùng nhãn A, B, C, đưa nhãn cuối, mức chắc chắn (high/medium/low) và lý do. Người kiểm chứng không tham gia các chỉ số ở bước 4–5.
7. Lưu ý: A, B và người kiểm chứng đều là mô hình ngôn ngữ lớn cùng họ Claude (sai số có thể tương quan; người kiểm chứng cùng mô hình với A và đã chọn A nhiều hơn B) (LLM-as-annotator: Gilardi et al., 2023 PNAS; Törnberg, 2023) — cần một người thật kiểm tra mẫu ngẫu nhiên trước khi dùng làm nhãn vàng để báo cáo.

## Trạng thái xác minh trích dẫn

Danh mục đầy đủ kèm DOI và trạng thái ("Đã xác minh" = đã mở trang DOI/ACL/arXiv; "Một phần" = chỉ thấy qua danh mục/tìm kiếm) nằm ở sheet `Nguon_co_so` của `output/03_nhan_livestream.xlsx`. 14/28 mục mới ở mức "Một phần" (Searle, Sun et al., Cai & Wohn, Gupta et al., Pontiki et al., Krippendorff, Landis & Koch, Luc Phan et al., VLSP 2018…) — cần mở bản gốc đối chiếu trước khi đưa vào báo cáo chính thức.

### Phụ lục v1.4 — ngành mới và 3 aspect mới (18/11/2026)

31. **SKIN_CONCERN thay USAGE** khi câu hỏi xoay quanh loại da/vấn đề da: "da mụn dùng được không" → QUESTION + SKIN_CONCERN (không gắn thêm USAGE). "Dùng buổi sáng hay tối" → USAGE.
32. **INGREDIENT_SAFETY vs SPEC_MATERIAL:** thành phần hoá học/dinh dưỡng và độ an toàn → INGREDIENT_SAFETY. Chất liệu vật lý và thông số (bạc 925, vàng 18k, vải, inox, dung tích, công suất) vẫn là SPEC_MATERIAL.
33. **AGE_STAGE đi kèm aspect khác khi có:** "bé 2 tuổi mặc size gì" → QUESTION + SIZE_FIT + AGE_STAGE; "bầu 3 tháng dùng được không" → QUESTION + INGREDIENT_SAFETY + AGE_STAGE; "sữa này cho bé mấy tháng" → QUESTION + AGE_STAGE.
34. **Màu son/phấn/kem nền** ("tông 01", "màu đỏ gạch", "nền 21") → VARIANT. Hỏi màu có hợp da ngăm không → VARIANT + SKIN_CONCERN.
35. **Trang sức:** hỏi tuổi vàng, bạc thật, kiểm định → SPEC_MATERIAL (thông số) và/hoặc QUALITY_TRUST (thật/giả, bảo hành). Size nhẫn, ni tay, độ dài dây → SIZE_FIT. Đổi sang vàng nặng bao nhiêu chỉ → PRICE.
36. **Thực phẩm:** hạn dùng, ngày sản xuất, xuất xứ → QUALITY_TRUST (không thêm aspect riêng theo quyết định 18/11); vị, độ cay, khối lượng gói → SPEC_MATERIAL; ăn kiêng/dị ứng/chất bảo quản → INGREDIENT_SAFETY.

### Phụ lục v1.5 — quy ước từ đợt 5 (20/11/2026, người dùng duyệt)

Rút ra khi kiểm chứng đợt 5 (công nghệ, thời trang). Hai quy ước đầu được áp dụng lại cho **mọi đợt** bằng bước chuẩn hoá tự động trong `scripts/build_excel.py` (cột `chuan_hoa_v15` ghi câu nào đã đổi); quy ước thứ ba chỉ áp dụng từ đợt 6 vì cần đọc hiểu, không dò tự động được.

37. **ORDER không kèm gì cần xác nhận → `needs_reply` = 0.** "chốt", "ok chốt", "chốt luôn", "em lấy ạ", "đã săn", "đã mua", "a đặt rồi" đứng một mình. ORDER có mã/size/màu/số lượng/SĐT/giá cần shop xác nhận ("chốt m83", "lấy size M", "chốt 2 cái") → `needs_reply` = 1 như #9 cũ.
38. **Câu chỉ có tag người** ("@[USER]", "@[USER] @[USER]") → SOCIAL, không aspect, `needs_reply` = 0. Tag kèm nội dung thì gán theo nội dung ("@[USER] hồng" trong phiên thời trang → REQUEST + VARIANT).
39. **Bàn chuyện hãng/linh kiện/sản phẩm nói chung, không nhắm tới shop hay món đang bán** ("Samsung cảm giác hơi chán", "card 4060 nóng lắm", "Trident Z đẹp") → SOCIAL (sentiment theo giọng câu), không phải COMPLAINT/PRAISE. Chỉ gán COMPLAINT/PRAISE khi nói về hàng, shop, người live hoặc phiên live này.

