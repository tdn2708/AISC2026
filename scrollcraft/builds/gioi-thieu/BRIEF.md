# BRIEF: trang giới thiệu Customer Radar (`/`)

**Self-authored under explicit creative delegation.** Người dùng giao "làm luôn" cho trang giới thiệu (KE-HOACH-GIAO-DIEN.md mục 4.4 và mục 11). Không phỏng vấn thêm. Mọi câu dưới đây là quyết định do agent Trang giới thiệu soạn, dựa trên bằng chứng trong repo; chỗ nào là giả định thì ghi "giả định".

Ngày soạn: 12/11/2026. Agent: Trang giới thiệu (F3-01 đến F3-07).

## Đợt 2 (13/11/2026, K5): kính là ống ngắm

Người dùng chọn 1A (phóng to phép trừ), 4B (tối suốt, chỉ sổ là giấy sáng) và yêu cầu kính + chuyển động. Đánh giá F8-06 chấm 6/10: chữ ký chỉ là thẻ 430 px giữa nền rộng, hero theo công thức landing. Bản này **thay** các mục cùng tên bên dưới (đường cảm xúc, bảng điểm, câu kể lại, đỉnh); phần còn lại của brief vẫn đúng. Ngữ pháp vẫn là "Sổ đối chiếu" (một phép trừ làm xương sống, cảnh cắt cứng theo nền, một cảnh ghim dài, chốt sổ).

**Ý chính:** logo A2 là khung ngắm, kính là mặt kính của khung ngắm đó. Vì thế kính chỉ ở nơi "nhìn qua": khung hero (ảnh app phía sau mờ qua kính). Phép trừ là SỐ LIỆU nên là giấy đặc, không kính.

**Bốn thay đổi:**
1. Hero (K5-02): ba lớp ảnh app đặt quanh một tấm kính `glass-float`; ảnh Bảng số liệu lùi xa lọt sau kính nên mờ, màn Tổng quan và tờ sổ nằm trước kính. Phía sau có lớp không khí (navy, xanh polo, tĩnh). Rê chuột (chỉ chuột) thì tờ sổ lớp trước nghiêng tối đa 3 độ bằng `data-sc-tilt` của engine.
2. Sổ lớn (K5-03, 1A): sổ chiếm khoảng 57% bề ngang ở 1440, số cuối 72 đến 96 px. Mỗi dòng trừ kèm MỘT bình luận mẫu bị gạch ngang, chép tĩnh từ kho Mô phỏng, ghi "Ví dụ trong kho Mô phỏng". Khi số chốt hiện chấm san hô (chỉ đồ họa).
3. Tối suốt (K5-04, 4B): ở chế độ tối nền trang tối từ đầu tới cuối; chỉ sổ là khối giấy sáng (`data-theme="light"` trên sổ). Chế độ sáng giữ khối mực quanh sổ.
4. Khung ngắm (K5-05, động tác riêng của trang): hai góc chữ L của logo phóng to, trôi theo `--sc-p` của nhịp "Cái giá" xuống một danh sách bình luận mẫu. Bình luận lọt trong khung được gắn nhãn theo Trust Layer (Rác, Nghi ảo, Khách thật), rác và ảo mờ đi; ngoài khung để nguyên. Chỉ `transform`, `opacity`, `clip-path`.

### Đường cảm xúc (thay bảng cũ)

| # | Cảm xúc | Thứ trên màn gây ra nó |
|---|---|---|
| 1 | Nhận ra | câu hỏi về buổi sáng lướt bình luận; ảnh app thật sau một tấm kính, tờ sổ nổi lên trước |
| 2 | Ngờ vực, rồi tự tay soi | danh sách bình luận thật; khung ngắm trượt xuống và gọi tên từng cái: rác, ảo, khách thật |
| 3 | Nhẹ nhõm, tin (ĐỈNH) | cắt cứng sang nền tối, tờ sổ giấy sáng to, mỗi dòng trừ một bình luận bị gạch, số dừng đúng, chấm san hô |
| 4 | Yên tâm | thanh "khớp với đơn hàng" mở bằng một nhát cắt, ba loại bằng chứng |
| 5 | Sẵn sàng | ba màn hình làm việc trượt ngang |
| 6 | Gần gũi | ảnh năm bạn, tên từng người |
| 7 | Quyết định | gạch đôi, con số được tính, một nút, đứng yên |

**Đỉnh:** nhịp 3, vẫn là phép trừ, vẫn khoảng cuộn dài nhất trang (3,8 vh). Khác bản đầu: sổ rộng gấp rưỡi và mỗi khoản bị trừ có một bình luận thật làm chứng, nên người xem thấy cái gì đang bị trừ chứ không chỉ thấy số giảm.

**Đây là trang mà** lúc cuộn, mày thấy một cái khung ngắm gọi tên từng bình luận rác và ảo, rồi tự tay kéo hơn 15 nghìn xuống đúng con số đáng tin, mỗi khoản bị trừ có một bình luận thật làm chứng.

### Bảng nhịp và thiết bị (thay bảng điểm cũ)

| Nhịp | Thiết bị | Khoảng cuộn | Họ | Vì sao |
|---|---|---|---|---|
| 1 Nhận ra mình | `parallax` ba lớp ảnh + tấm kính `glass-float`, tilt tờ sổ bằng chuột | khoảng 1 vh | parallax | chiều sâu thật: ảnh lùi xa mờ sau kính, ảnh chính nét |
| 2 Cái giá | khung ngắm (viết riêng, đọc `--sc-p`, flow) | khoảng 1,3 vh | quét | chuyển cảnh "xem lướt" thành "soi từng cái"; không ghim vì ngay sau là cảnh ghim |
| 3 Đỉnh | `pin` + LedgerRun theo cuộn + cue | 3,8 vh (lớn nhất) | ghim | phép trừ cần thời gian dưới tay người xem |
| 4 Bằng chứng | `reveal` clip-path từ trái | khoảng 1 vh | cắt | một nhát cắt là đổi trạng thái |
| 5 Việc hôm nay | `pan` rãnh ngang ba ảnh | 2,4 vh | trượt ngang | đi ngang đọc như "những thứ dùng được" |
| 6 Người làm ra | `in` (flow) | khoảng 1 vh | hiện | gần gũi cần yên |
| 7 Chốt | tĩnh, không thiết bị | khoảng 0,8 vh | không | nút đứng yên, không mờ dần |

Hai nhịp liền nhau không bao giờ cùng họ (parallax, quét, ghim, cắt, trượt ngang, hiện, tĩnh). Giảm chuyển động: khung ngắm thành bảng tĩnh có nhãn, tilt tắt, không ghim, sổ hiện đủ số.

**Cổng vân tay:** khác hàng "gioi-thieu" đầu tiên ở hero (có tấm kính và tilt), nhịp 2 (khung ngắm thay chữ trơn), chữ ký (thêm bình luận gạch và chấm san hô). Vẫn cùng ngữ pháp và cách chốt, nên đây là bản nâng cấp của cùng một trang, không phải build mới; ghi thêm một hàng vào sổ cho rõ.

## Tám chủ đề

1. **Khí chất (3 đến 5 từ):** sổ sách thật, gọn, có số, ấm vì có người thật (mục 4.4, lời điều phối). Tham chiếu ngoài web: một cuốn sổ cái kế toán có gạch đôi dưới dòng tổng; tờ hóa đơn có chữ ký; ảnh tập thể chụp trước bức tường trắng của trường.
2. **Hành trình (theo mục 4.4):** Nhận ra mình, Cái giá, Đỉnh (phép trừ chạy), Bằng chứng, Việc hôm nay, Người làm ra, Chốt.
3. **Đường năng lượng:** mở vừa phải (ảnh app nhiều lớp), hạ hẳn xuống im lặng (chỉ chữ trên nền trơn), bùng ở đỉnh (cắt cứng sang nền mực, sổ trừ dưới tay), hạ dần (bằng chứng, việc hôm nay), ấm (ảnh nhóm), đứng yên ở chốt.
4. **Cảm giác từng chặng và khoảnh khắc nhớ:** xem đường cảm xúc bên dưới. Khoảnh khắc nhớ: tự tay kéo con số hơn 15 nghìn xuống đúng số được tính.
5. **Một thứ chưa trang nào làm:** thanh cuộn là cây bút trừ. Mỗi nấc cuộn trừ một phần của sổ đối chiếu bằng số thật lấy từ API; kéo ngược lên thì số cộng trở lại. Số dừng ở đúng số mọi trang trong app dùng.
6. **Xa premium-minimal tới đâu:** dày thông tin vừa phải (dense nhẹ, kiểu sổ sách), không bóng bẩy. Không tối sang trọng một màu nhấn; dùng đúng hệ "Sổ kiểm chứng" màu B của app (navy, xanh polo, một chấm san hô) để trang giới thiệu và app là một sản phẩm.
7. **Một thế giới liền hay các cảnh riêng:** các cảnh riêng biệt, cắt cứng giữa các nền (mục 4.4: "các cảnh riêng biệt, không bay một mạch").
8. **Tài sản có sẵn:** ảnh chụp app thật (chụp từ Vite local, kho mô phỏng, 12/11/2026), ảnh nhóm 480 px (người dùng cho phép công khai), logo "khung ngắm" A2, sổ đối chiếu thật từ `/trust/health`. Không ảnh sinh AI, không video, không ảnh stock (mục 11 câu 4).

## Câu hỏi bước 1

- **Là gì, cho ai:** phần mềm đọc phản hồi khách đa kênh cho chủ shop nhỏ bán trên sàn và livestream; người xem thứ hai là giám khảo AISC.
- **Phải tin:** "Con số trên màn hình này đã được lọc và có chứng từ, không phải AI đoán bừa."
- **Làm gì tiếp:** Xem bản dùng thử (một nhãn, dùng ở hero và ở chốt). Đã đăng nhập thì "Vào ứng dụng".
- **Thế giới hình ảnh:** ảnh chụp app thật, đặt như tờ giấy trên bàn: viền 1px, bóng có độ lệch, không khung trình duyệt vẽ tay.

## Ngữ pháp: "Sổ đối chiếu" (ngữ pháp mới, có ràng buộc riêng)

Trang là một phép đối chiếu. Xương sống là một phép trừ duy nhất; mọi cảnh khác hoặc là khoản sắp bị trừ (nhiễu), hoặc là chứng từ đỡ cho dòng tổng.

- **Cảnh:** mỗi cảnh một nền riêng, đổi nền cắt cứng ở mép cảnh (không `drift` nội suy). Giữa các cảnh không có chuyển cảnh mờ.
- **Thanh điều hướng:** tối giản và không cố định: logo, một liên kết "Đăng nhập". Cuộn đi cùng trang, vì không có gì trên trang cần một thanh chrome dính, và một thanh dính sẽ đè lên tờ sổ ở đỉnh.
- **Trình tự:** chỉ một cảnh ghim lâu (phép trừ) và nhiều nhất một rãnh trượt ngang; cảnh ghim lâu có khoảng cuộn lớn hơn rãnh ít nhất 1,5 lần. Mọi cảnh còn lại chảy tự nhiên.
- **Kết:** "chốt sổ". Màn cuối mở bằng gạch đôi như dòng tổng của sổ, nhắc lại đúng con số phép trừ dừng ở đó, kèm một nút. Đứng yên, không mờ.
- **Cấm:** video, scrub, chuỗi ảnh (không có cảnh quay, và ảnh AI bị cấm); `drift`; `spotlight`, `magnet`, `tilt`; chữ chạy từng ký tự; bất kỳ bộ đếm đếm LÊN nào (số trên trang này chỉ được trừ xuống, đúng tinh thần sổ đối chiếu); bất kỳ con số không lấy từ `/trust/health` hoặc ảnh chụp số có ghi ngày; vòng tròn, đồng hồ đo, donut, radar quét.

**Vì sao bảy ngữ pháp có sẵn thua:**
- *Filmic one-shot:* cần một thế giới quay liền mạch; không có cảnh quay và không được sinh ảnh. Một sản phẩm về sổ sách mà giấu đường nối giữa cảnh thì sai tính cách.
- *Chaptered editorial:* hero phải là trang tựa không có hình, trái với yêu cầu hero nhiều lớp bằng ảnh app; cấm cảnh ghim dài, mà đỉnh cần khoảng cuộn ghim dài nhất trang.
- *Live surface:* gần nhất (đỉnh đúng là component thật chạy số thật), nhưng nó cấm câu tiêu đề tiếp thị, ảnh nhóm và đòi màn cuối là ô nhập. Người xem chưa đăng nhập cần được kể chuyện trước; bề mặt thật chỉ cách một cú bấm.
- *Continuous world:* không có địa lý để bay qua.
- *Typographic poster:* bằng chứng của sản phẩm là số và màn hình, không phải một câu; ngữ pháp này cấm ảnh.
- *Gallery / catalog:* không có dãy đồ vật để chọn; câu hỏi của người xem là "tin được không", không phải "có những gì".
- *Split stage:* trước/sau (thô/được tính) hấp dẫn, nhưng phép trừ có năm bước nối nhau chứ không phải hai phía; vách ngăn giữa sẽ cắt đôi tờ sổ.
- *Rhythmic cutlist:* cấm ghim, nhịp gấp; người xem cần bình tĩnh để tin số.

## Chữ ký

**Phép trừ chạy theo thanh cuộn, số thật.** Một tờ sổ đối chiếu thật (`LedgerRun mode="scroll"`, F2-04) ghim giữa nền mực. Tiến độ lấy từ vị trí cuộn của chính cảnh đó (JS riêng của trang, không sửa engine): thu thập hiện trước, rồi rác, nghi ảo, chờ duyệt, quá cũ lần lượt trừ vào, các cột chữ số trượt như công tơ, dừng đúng ở `countedForMetrics`, rồi dòng "Phép trừ khớp". Kéo ngược lên thì số cộng lại. Màn chốt nhắc lại đúng con số đó.

## Đường cảm xúc (viết trước bảng điểm)

| # | Cảm xúc | Thứ trên màn gây ra nó |
|---|---|---|
| 1 | Nhận ra | câu hỏi về buổi sáng lướt bình luận, cạnh ảnh chính app của họ xếp thành ba lớp giấy |
| 2 | Ngờ vực | chữ trơn trên nền trơn, ba kiểu bình luận không thật, câu cuối nói cái giá: đếm hết thì sai, bỏ bừa thì mất khách |
| 3 | Nhẹ nhõm, tin (ĐỈNH) | cắt cứng sang nền mực, tờ sổ trừ dần dưới tay người xem, dừng đúng số được tính, "phép trừ khớp" |
| 4 | Yên tâm | thanh "khớp với đơn hàng" mở ra bằng một nhát cắt, ba loại bằng chứng gọi đúng tên |
| 5 | Sẵn sàng | ba màn hình làm việc trượt ngang: việc hôm nay, báo cáo sau livestream, bảng số liệu |
| 6 | Gần gũi | ảnh năm bạn trước bức tường trắng, tên từng người |
| 7 | Quyết định | gạch đôi, con số được tính, một nút. Đứng yên |

Không hai nhịp liền nhau cùng cảm xúc.

**Đỉnh:** nhịp 3. Câu người xem kể lại: "Tao kéo chuột tới đâu, con số mười lăm nghìn bị trừ tới đó, rác, đánh giá ảo, cái quá cũ, rồi nó dừng đúng 14.279, khớp với số trong app."

**Câu kể lại (tell-someone):** Đó là trang web mà lúc cuộn, mày tự tay trừ hơn 15 nghìn bình luận xuống đúng con số đáng tin, kéo ngược lên thì số cộng trở lại.

**Im lặng có chủ đích:** nhịp 2 là im lặng trước đỉnh: không ảnh, không ghim, chỉ bốn dòng chữ lớn hiện một lần theo thứ tự. Khoảng trống quanh chữ là cố ý, không phải cuộn chết.

## Bảng điểm (nhịp, thiết bị, lý do)

| Nhịp | Thiết bị | Khoảng cuộn | Vì sao |
|---|---|---|---|
| 1 Nhận ra mình | `parallax` (flow): ba lớp ảnh app thật, nền Bảng số liệu lùi xa, màn Tổng quan ở giữa, tờ sổ cắt ra ở trước, mỗi lớp trượt một nhịp | khoảng 1 vh | chiều sâu từ chuyển động lệch nhịp; tờ sổ ở lớp trước báo trước chữ ký |
| 2 Cái giá | `in` + stagger (flow), chữ trơn | khoảng 1 vh | im lặng trước đỉnh; nếu ghim ở đây thì hai cảnh ghim liền nhau (cùng họ thiết bị) và đỉnh mất chỗ để nổi lên |
| 3 Đỉnh | `pin` + chữ ký (LedgerRun theo cuộn) + cue | 3,8 vh (lớn nhất) | phép trừ cần thời gian dưới tay người xem; nền mực là thay đổi thị giác lớn nhất trang |
| 4 Bằng chứng | `reveal` (clip-path từ trái) trên thanh "khớp với đơn hàng" | khoảng 1 vh | một nhát cắt là đổi trạng thái: từ "tin lời" sang "có chứng từ" |
| 5 Việc hôm nay | `pan`, rãnh ngang ba màn hình thật | 2,4 vh | đi ngang đọc như "những thứ dùng được", không phải lập luận |
| 6 Người làm ra | `in` (flow), ảnh nhóm và tên | khoảng 1 vh | gần gũi cần yên, không hiệu ứng |
| 7 Chốt | tĩnh, không thiết bị | khoảng 0,8 vh | trang dừng lại; nút đứng yên, không mờ dần |

Năm họ thiết bị (parallax, in, pin, reveal, pan); không họ nào lặp liền nhau; một cảnh scrub: không có. Tổng khoảng 10,3 vh đo được (1440x900), 7 nhịp (ngoài dải 13,6 đến 13,8 vh).

**Đã chỉnh so với nháp mục 4.4:** nhịp 2 bỏ "pin + kinetic" vì (a) nhịp ngay trước đỉnh phải yên hơn đỉnh, (b) hai cảnh ghim liền nhau là cùng một họ thiết bị, (c) chữ tách dòng của engine sửa DOM do React quản lý. Thay bằng chữ trơn hiện một lần theo thứ tự (vẫn "chữ hiện từng dòng", nhưng không ghim).

## Giảm chuyển động và tắt JS

- Giảm chuyển động: không ghim. Đỉnh thành cảnh thường, tờ sổ hiện bảng tĩnh đủ số ngay (LedgerRun tự làm), ba câu kèm hiện cùng lúc. Rãnh ngang thành lưới dọc. Lớp hero đứng yên.
- Engine không chạy: CSS của trang giữ mọi chữ hiện (`html:not(.sc-ready)`), không có gì bị ẩn chờ JS.
- Tắt hẳn JS: đây là SPA React, tắt JS thì `#root` trống. Không sửa được trong phạm vi file của agent này (cần `<noscript>` trong `index.html`); ghi lại trong báo cáo.

## Số liệu

`/trust/health` của kho demo, gọi một lần, quá 4 giây hoặc lỗi thì dùng ảnh chụp số ngày 12/11/2026 (hằng `SNAPSHOT` trong `src/components/landing/data.js`), kèm dòng "Số liệu ngày 12/11/2026". Kho demo là dữ liệu mô phỏng; trang nói rõ điều đó.

## Cổng vân tay

Sổ đăng ký `scrollcraft/FINGERPRINTS.md` trống trước bản này (bản đầu tiên của workspace), nên cổng 4/6 không có hàng nào để so; bản này khác mặc định filmic ở cả 6 chiều (ngữ pháp, thanh điều hướng không cố định, hero split ba lớp ảnh app, chuỗi chỉ một cảnh ghim dài, chốt sổ, chữ ký). Đã ghi hàng của bản này vào sổ.

## Kiểm cảm xúc (F3-07, cuộn lạnh trước khi mở lại brief)

| # | Dự định | Cảm thấy lúc cuộn lạnh | Xử lý |
|---|---|---|---|
| 1 | Nhận ra | quen (ảnh app nhận ra ngay), ảnh hơi nhỏ ở bản đầu | phóng khung ảnh, cho tràn mép phải, tờ sổ nhấc lên đúng chỗ của nó trong màn Tổng quan |
| 2 | Ngờ vực | lặng, hơi chần chừ | giữ: đó là khoảng lặng có chủ đích |
| 3 | Nhẹ nhõm, tin | chú ý, rồi thở ra khi số dừng 14.279 | khớp; rút gọn ba câu kèm cho dưới 80 từ một màn |
| 4 | Yên tâm | yên, nhưng mở đầu là một màn gần trống khi cảnh ghim trượt đi (hụt) | bớt khoảng đầu cảnh sau cảnh ghim |
| 5 | Sẵn sàng | thực dụng, cuối rãnh lại hụt một màn | bớt khoảng đầu cảnh Người làm ra |
| 6 | Gần gũi | ấm | giữ |
| 7 | Quyết định | dừng, có chỗ đặt tay | giữ, không mờ |

Bản giảm chuyển động lúc đầu chồng ba câu của đỉnh lên nhau (cùng một ô lưới); đã cho xếp lần lượt.
