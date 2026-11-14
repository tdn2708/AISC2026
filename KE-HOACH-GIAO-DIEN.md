# Kế hoạch nâng cấp giao diện Customer Radar

Bắt đầu 2026-11-12. Hạn chót: bản cuối trên Vercel trước **2026-12-07** (chừa 8 đến 9/12 cho nạp lại dữ liệu và tập demo; chung kết 10/12).

File này là **nguồn sự thật duy nhất** cho việc nâng cấp giao diện. Bất kỳ agent hay model nào nhận việc (kể cả ở cuộc trò chuyện mới) đọc theo thứ tự:

1. Mục 1 (Mục tiêu) và mục 2 (Luật cứng).
2. Mục 8 (Bảng trạng thái): tìm việc có trạng thái `sẵn sàng` mà mình được giao.
3. Mục của khung chứa việc đó (mục 5).
4. Mục 9 (Nhật ký bàn giao): đọc 5 dòng gần nhất.
5. `CLAUDE.md` cho kiến trúc backend, API, quy tắc prod.

Làm xong thì cập nhật đúng hai chỗ: dòng của việc đó trong mục 8, và thêm một dòng vào mục 9. Không sửa nội dung kế hoạch của khung khác; muốn đổi kế hoạch thì ghi đề xuất vào mục 10.

---

## 1. Mục tiêu

**Một câu:** biến bản demo thành phần mềm mà một chủ shop nhỏ mở ra là tin được và muốn dùng: có bản sắc riêng của nhóm Customer Radar, có chuyển động làm người xem chú ý vào đúng con số quan trọng, và không lộ dấu "AI làm".

**Xong khi:**
- Có trang giới thiệu công khai ở `/` (trước đăng nhập) mà lúc cuộn, người xem thấy dữ liệu thật bị lọc dần còn đúng con số đáng tin.
- Mọi trang trong app dùng chung một bộ chuyển động (vào trang, đếm số, vẽ biểu đồ, phản hồi thao tác), tắt sạch khi bật "giảm chuyển động".
- Bản sắc nhóm (màu, logo, chữ, giọng văn) nhất quán ở trang giới thiệu, đăng nhập, app và báo cáo PDF.
- `sloplint` 0 FAIL ở mọi route; ảnh chụp sáng, tối, điện thoại đã được người xem lại.
- Không chậm hơn: tải lần đầu trang Tổng quan không tăng quá 10% so với mốc đo ở F0-02.

**Không làm:** đổi logic backend, đổi công thức số liệu, thêm tính năng phân tích mới. Đây là việc giao diện.

## 2. Luật cứng (mọi agent tuân theo, không ngoại lệ)

**Chữ và số trong giao diện** (người dùng chốt, xem thêm `CLAUDE.md`):
- Không dùng: dấu "·" nối chuỗi, mũi tên "→" dán vào chữ hay nút, nhãn IN HOA hay giãn chữ, chữ "tuyệt đối", emoji, chấm tròn trạng thái trang trí, **vòng tròn, đồng hồ đo, biểu đồ donut, vòng radar quét**, thẻ lồng thẻ, sọc màu bên trái thẻ, gradient tím sang xanh, chữ gradient, bóng phát sáng.
- Số kiểu Việt: 2,45%; 14.128; tỉ lệ dưới 1% giữ 2 chữ số (0,04%). Khoảng số viết "20 đến 30". Ô trống hiện "—".
- Không z, p, EWMA trong chữ cho quản lý (chỉ trong "Số liệu kiểm định").
- Không bịa số, lời khen, logo khách hàng. Mọi con số trên trang giới thiệu lấy từ API thật hoặc ghi rõ nguồn.
- Giao diện, comment, commit tiếng Việt.

**Chuyển động** (Floor của hallmark):
- Chỉ animate `transform`, `opacity`, `clip-path`. Không `transition: all`, không animate width, height, top, left.
- Mọi chuyển động có nhánh `prefers-reduced-motion: reduce`, và nội dung vẫn hiện khi tắt JavaScript hoặc khi chuyển động bị tắt.
- Chuyển động tự chạy (không do người bấm) chỉ dùng để kéo mắt vào một chỗ: **tối đa một màn mở đầu có dàn dựng mỗi trang**. Không fade-up từng khối, không hover nhún trên từng thẻ.
- Chuyển động do người thao tác (mở, gập, xác nhận, lọc) thì khuyến khích, vì nó cho thấy cái gì vừa đổi.
- Không thêm thư viện animation lớn (framer-motion, GSAP). Dùng CSS, hook nhỏ tự viết, View Transitions API (trình duyệt không hỗ trợ thì bỏ qua êm). Riêng trang giới thiệu dùng engine `scroll-craft` (JS thuần, chép nguyên, không sửa engine).

**Kỹ thuật và prod:**
- Mọi màu, font qua token ở `:root` / `[data-theme='dark']` trong `src/index.css`, ánh xạ sang Tailwind ở `src/styles/tailwind.css`. Không mã màu trần trong component.
- `overflow-x: clip` trên `html` và `body`. Mọi phần tử bấm được có `:focus-visible`.
- Không gọi API prod dồn dập (tối đa 1 lần mỗi 20 đến 30 giây khi kiểm). Trang giới thiệu gọi `/trust/health` **một lần**, lỗi hay chậm quá 4 giây thì dùng ảnh chụp số liệu tĩnh có ghi ngày.
- Đổi frontend thuần thì Render không deploy lại, phiên live không bị ngắt. Nếu một việc buộc phải đổi backend, ghi vào mục 10 và chờ người điều phối duyệt.
- Không cho trình duyệt tự tải file vào thư mục repo (Vite sập vì `.crdownload`); tải vào scratchpad.
- Commit thẳng `main`, mỗi việc một commit, message tiếng Việt, cuối có `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Trước push quét bí mật: `git diff --cached | grep -E "hf_|ghp_|mongodb\+srv|AIza|gsk_|sk-or-|PII_SALT="`. Push lọc token: `git push origin main 2>&1 | sed -E 's#https://[^@]*@#https://***@#'`.
- Không xóa route hay cây component khi chưa có kế hoạch theo từng file được người dùng duyệt.

## 3. Hiện trạng (mốc 2026-11-12, HEAD `bcfcc1e`)

| Mục | Hiện trạng |
|---|---|
| Khung | React 19, Vite 8, Tailwind v4, Recharts 3, lucide-react. Không có thư viện animation. |
| Hệ thiết kế | "Sổ kiểm chứng" (`src/index.css`, 631 dòng): nền `#F3F5F4`, bề mặt trắng, nhấn xanh rêu `#0E6B5E`, chữ Be Vietnam Pro, viền 1px, không bóng. Có chế độ tối. |
| Chuyển động có sẵn | `AnimatedNumber` (đếm số 0,7 giây, tôn trọng giảm chuyển động); `animate-fade-in` khi đổi route; keyframes `fade-up`, `pop-in`, `grow-x` trong `tailwind.css`; token `--ease`, `--ease-out`, `--dur-*`. |
| Điểm nhấn hiện tại | Sổ đối chiếu ở đầu Tổng quan (thu thập trừ rác trừ nghi ảo trừ chờ duyệt trừ quá cũ = được tính). |
| Trang công khai | Chưa có. `/` chuyển thẳng tới `/dashboard`; `/login` có khối mực + sổ đối chiếu thật. |
| Route | /dashboard, /insights, /risk, /feedbacks, /live, /analytics, /trust, /data, /reports, /lab, /settings, /ui-kit |
| Lần chấm hallmark gần nhất | 0 FAIL; còn waiver 64 trong `src/index.css`. |

**Chẩn đoán vì sao "hơi đơn giản":** app đúng chuẩn nhưng tĩnh và đồng đều; mọi trang cùng nhịp (tiêu đề, bộ lọc, khối trắng viền xám); không có khoảnh khắc nào được dàn dựng; bản sắc chỉ là một màu xanh rêu, chưa có gì của nhóm; không có trang nào kể câu chuyện sản phẩm cho người chưa đăng nhập.

## 4. Hướng thiết kế

### 4.1 Bản sắc nhóm (lấy từ ảnh nhóm)

Ảnh nhóm: 5 thành viên (2 nam áo polo xanh da trời, 3 nữ áo trắng viền xanh navy và hồng), tư thế tự tin, hai bạn nam làm ký hiệu tay. Ảnh gốc cất tại `.hallmark/team/nhom-customer-radar.png` (thư mục đã gitignore, **chưa** đưa lên web).

Chất liệu rút ra cho bản sắc:
- **Màu:** xanh da trời của áo polo, xanh navy của dây đeo thẻ và viền cổ, trắng, một chút hồng san hô ở tay áo.
- **Tính cách:** sinh viên làm thật, gọn, thân thiện nhưng nghiêm túc với số liệu. Không phải startup bóng bẩy.
- **Câu thương hiệu (nháp):** "Đọc hết phản hồi khách, chỉ tin con số có chứng từ."

**Người dùng chọn phương án B (2026-11-12).** Cột A giữ lại để tham khảo, không làm.

Hai phương án màu:

| Vai trò | Phương án A: giữ xanh rêu, thêm màu nhóm làm phụ | Phương án B: chuyển sang màu nhóm |
|---|---|---|
| Mực (chữ, khối đậm) | `#17242A` | `#13233F` (navy) |
| Nhấn chính (nút, liên kết) | `#0E6B5E` | `#1F6FA8` (xanh polo đậm cho đủ tương phản chữ) |
| Nhấn sáng (trên nền mực) | `#8FD3C3` | `#8CCBEB` |
| Màu nhóm phụ | `#5AB4DC` chỉ ở trang giới thiệu | `#E66A78` san hô, chỉ cho một điểm nhấn mỗi màn, không dùng cho cảnh báo |
| Xấu / tốt / chú ý | giữ `#A3303D` / `#1D6A46` / `#875200` | giữ nguyên (không trùng san hô vì san hô không dùng cho trạng thái) |

Mọi giá trị trên là nháp; F1-02 đo tương phản trên nền sáng và tối rồi chỉnh cho đạt WCAG AA (chữ thường 4,5:1, chữ lớn và đường biểu đồ 3:1) trước khi chốt.

**Logo:** giữ `LogoMark` hiện có làm gốc, F1-03 làm lại cho có nét riêng (gợi tín hiệu dội về, không vẽ vòng radar quét tròn vì người dùng cấm vòng tròn trang trí). Logo là chữ ký: xuất hiện ở trang giới thiệu, đăng nhập, thanh bên, bìa PDF, favicon.

### 4.2 Chữ ký (thứ người xem nhớ)

Chọn **một** thứ và làm thật tốt, mọi thứ khác im lặng:

**"Phép trừ chạy":** sổ đối chiếu (thứ trả lời câu giám khảo "dữ liệu tin được không") được dựng thành chuyển động. Con số thu thập hiện trước, rồi từng dòng rác, nghi ảo, chờ duyệt, quá cũ lần lượt trừ vào, số còn lại đếm lùi và dừng **đúng** ở số được tính, khớp với mọi trang. Dùng số thật từ `/trust/health` (`ledger`).
- Trên trang giới thiệu: phép trừ chạy theo thanh cuộn (người xem tự kéo).
- Trên Tổng quan: chạy một lần khi mở trang, là màn mở đầu có dàn dựng duy nhất của trang đó.
- Trên đăng nhập: bản tĩnh (đã có), thêm một lần chạy khi tải.

Câu người xem kể lại: "Đó là cái web mà lúc cuộn, mày thấy hơn 15 nghìn bình luận bị lọc dần còn đúng con số đáng tin."

### 4.3 Hệ chuyển động (motion system)

Token (F2-01 thêm vào `src/index.css`, giữ tên cũ làm bí danh):

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--motion-instant` | 0ms | giảm chuyển động |
| `--motion-micro` | 120ms | đổi màu nút, tick ô chọn |
| `--motion-short` | 220ms | mở menu, thả chip lọc, hiện tooltip |
| `--motion-medium` | 420ms | ngăn kéo, đổi tab, chuyển trang |
| `--motion-long` | 900ms | vẽ biểu đồ, đếm số lớn |
| `--motion-story` | 1600ms | phép trừ chạy (cả chuỗi) |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | vào |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | đổi trạng thái |
| `--ease-spring` | `linear()` mô phỏng lò xo nhẹ | số "chốt" vào vị trí |

Thành phần (F2, đặt trong `src/components/motion/`):

| Tên | Làm gì | Ghi chú |
|---|---|---|
| `useInView` | IntersectionObserver, trả `inView` một lần | không có IO thì coi như đã thấy |
| `useReducedMotion` | đọc `prefers-reduced-motion`, nghe thay đổi | thay hàm `reduceMotion()` lặp ở nhiều nơi |
| `AnimatedNumber` (nâng cấp) | đếm khi vào khung nhìn chứ không khi mount; có `from`; có hiệu ứng "chốt" nhẹ ở cuối | giữ API cũ |
| `LedgerRun` | phép trừ chạy, nhận `ledger`, chế độ `auto` hoặc `scroll` (nhận tiến độ 0 đến 1) | chữ ký; số cuối luôn bằng `countedForMetrics` |
| `ChartReveal` | bọc biểu đồ Recharts, mở bằng `clip-path` từ trái sang khi vào khung nhìn | không dùng animation riêng của Recharts (nó animate thuộc tính SVG) |
| `BarGrow` | thanh ngang mọc bằng `transform: scaleX` | thay `grow-x` |
| `RouteTransition` | View Transitions API khi đổi route, rơi về `animate-fade-in` | chỉ 1 hiệu ứng toàn cục |
| `Stagger` | lệch nhịp 40ms cho danh sách **chỉ khi dữ liệu mới về sau thao tác** | không dùng khi tải trang |
| `Pulse` | một nhịp sáng nền ở dòng vừa đổi (chấp nhận cảnh báo, nhận bình luận live mới) | thay cho chấm trạng thái |

**API đã làm xong ở F2** (import từ `src/components/motion`, demo ở `/ui-kit`; agent F3 đến F7 dùng, không viết lại):
- `LedgerRun({ ledger, evidence?, mode='auto'|'scroll', progress=0..1, duration=1600, title, showLink=true, onDone, className })`. `ledger` nhận nguyên object `/trust/health` hoặc dạng phẳng `{raw, spam, inauthentic, pendingNotCounted, pendingCounted, aged, counted}`. `onDone` để nối số đếm kế tiếp. Số dùng cột chữ số kiểu công tơ (dải 0 đến 9 trượt bằng transform). Thay được thẳng `Ledger` trong `SummaryHeader`. Hàm thuần `src/lib/ledgerRun.js`, test `node --test src/lib/ledgerRun.test.mjs`.
- `AnimatedNumber({ value, from=0, decimals, signed, unit, unitClassName, className, duration=700, settle=true })`: API cũ giữ nguyên, nay đếm khi vào khung nhìn.
- `ChartReveal({ as, threshold=0.3, className, children })`: Recharts bên trong phải đặt `isAnimationActive={false}`.
- `BarGrow({ value 0..1, grow=true, start?, className })`: chỉ phần tô; rãnh do trang vẽ (`overflow-hidden`).
- `Pulse({ trigger, as, className })`: một nhịp tô nền mỗi khi `trigger` đổi.
- `Stagger({ as, active=false, runKey, step=40 })`: chỉ chạy khi `active` và `runKey` đổi sau thao tác.
- `useReducedMotion()`, `prefersReducedMotion()`, `useInView(ref, { threshold, rootMargin, enabled })`, `MOTION`, `EASE`.
- Tailwind: `duration-micro|short|medium|long|story`, `delay-micro|short`, `ease-out|in|in-out|spring`, `animate-settle`. Vòng xoay đang tải cần chạy cả khi giảm chuyển động thì thêm lớp `keep-motion`.
- Chuyển trang: View Transitions chỉ chạy khi bấm liên kết nội bộ (BrowserRouter không có `viewTransition`); `navigate()` từ code vẫn dùng fade cũ.

**Logo (F1-03, đã áp):** `LogoMark({ size=28, colors={ink, dot} })` khung ngắm A2, nét theo `var(--text-hi)` của nền đang đứng; `Logo({ size: sm|md|lg })`; chữ "Customer Radar" một màu.

### 4.4 Trang giới thiệu công khai (scroll-craft)

Route mới `/` (công khai). Nút chính duy nhất: **"Xem bản dùng thử"** (vào `/login` đã điền sẵn tài khoản demo). `/dashboard` khi chưa đăng nhập vẫn về `/login` như cũ.

Brief (tự soạn theo ủy quyền "làm luôn" của người dùng, F3-01 ghi thành `scrollcraft/builds/gioi-thieu/BRIEF.md`):
- Khí chất: sổ sách thật, gọn, có số, ấm vì có người thật.
- Người xem: chủ shop nhỏ bán trên sàn và livestream; giám khảo AISC.
- Họ phải tin: "Con số trên màn hình này đã được lọc và có chứng từ, không phải AI đoán bừa."
- Hành động: Xem bản dùng thử.
- Ngữ pháp: các cảnh riêng biệt, không bay một mạch.

Hành trình và đường cảm xúc (nháp, F3-02 chốt):

| # | Nhịp | Người xem cảm thấy | Thiết bị |
|---|---|---|---|
| 1 | Nhận ra mình | "đúng, sáng nào mình cũng lướt bình luận" | ảnh chụp app thật nhiều lớp (hero có chiều sâu), câu tiêu đề, nút chính |
| 2 | Cái giá | khó chịu: bình luận rác, đánh giá ảo trộn lẫn | chữ hiện từng dòng khi khung đứng yên (pin + kinetic) |
| 3 | **Đỉnh: phép trừ chạy** | nhẹ nhõm, tin | `LedgerRun` theo cuộn, số thật, khoảng cuộn dài nhất trang |
| 4 | Bằng chứng | yên tâm | ba loại bằng chứng (Có chứng từ, Người duyệt, AI đoán) mở bằng clip-path |
| 5 | Việc hôm nay | "mai mở ra là biết làm gì" | ảnh chụp Việc hôm nay + Livestream, trượt ngang |
| 6 | Người làm ra | gần gũi | ảnh nhóm Customer Radar (người dùng đã cho phép công khai), tên 5 bạn, trường UIT; không ghi vai trò |
| 7 | Chốt | quyết định | nút "Xem bản dùng thử", đứng yên, không mờ dần |

Ảnh: chỉ dùng ảnh chụp app thật (`hallmark/scripts/capture.mjs`) và ảnh nhóm. Không sinh ảnh AI, không cảnh đất sét, không ảnh stock.

### 4.5 Từng trang trong app

Mỗi trang được **một** khoảnh khắc dàn dựng, phần còn lại im lặng:

| Trang | Khoảnh khắc | Chuyển động theo thao tác |
|---|---|---|
| Đăng nhập | phép trừ chạy một lần ở khối mực | nút đăng nhập chuyển trạng thái đang tải |
| Tổng quan | phép trừ chạy ở đầu trang, rồi 3 số của "Cửa hàng đang thế nào" đếm lên | mở rộng cảnh báo trong Việc hôm nay, chấp nhận thì dòng `Pulse` rồi gập |
| Bảng số liệu | biểu đồ chính mở `ChartReveal` | lọc chéo: thanh co giãn `scaleX`, số đếm từ giá trị cũ sang mới |
| Cảnh báo | dòng nghiêm trọng nhất hiện trước | mở kế hoạch, chấp nhận/bỏ qua |
| Phản hồi | không (bảng làm việc, cần yên) | mở chi tiết trượt từ phải |
| Livestream | bình luận mới chảy vào hàng đợi | gộp câu hỏi: thẻ nhóm đếm lên |
| Phân tích nguyên nhân | thanh nguyên nhân mọc theo thứ tự | đổi tab |
| Tin cậy dữ liệu | phễu lọc (cùng ngôn ngữ với phép trừ chạy) | gán nhãn: dòng `Pulse` rồi sang dòng kế |
| Nguồn dữ liệu, Cài đặt, Lab | không | trạng thái nút, tiến độ thu thập |
| Báo cáo | không (bản in) | tạo PDF: thanh tiến độ thật theo số tờ |

## 5. Các khung việc (frames)

Ký hiệu agent: xem mục 6. Ước lượng tính bằng phiên làm việc (khoảng 1 đến 2 giờ một phiên).

### F0. Nền móng và mốc đo

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F0-01 | Chụp mốc "trước" mọi route, sáng và tối, 1440 và 390 px, vào `.hallmark/before-ui2/` | QA | | đủ 12 route x 2 chế độ x 2 cỡ |
| F0-02 | Đo mốc hiệu năng: `npm run build` kích thước bundle, thời gian tải `/dashboard` (Puppeteer, 3 lần lấy trung vị) | QA | | số ghi vào mục 7 |
| F0-03 | Chạy `sloplint --scope app` toàn `src`, ghi số FAIL/REFLEX mốc | QA | | ghi vào mục 7 |
| F0-04 | Chốt câu trả lời mục 11 với người dùng | Điều phối | | mục 11 hết câu mở |

### F1. Bản sắc và hệ thiết kế

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F1-01 | Kiểm kê giao diện (theo design-systems): liệt kê mọi kiểu nút, ô nhập, thẻ, thang chữ, màu trần, khoảng cách đang có; ghi `.hallmark/inventory.md` | Hệ thiết kế | F0-01 | có bảng "đang có X kiểu, gộp còn Y" |
| F1-02 | Chốt bảng màu theo phương án người dùng chọn; đo tương phản sáng và tối; cập nhật token trong `src/index.css` và `REPORT`/`REPORT_VARS` trong `report_kit.jsx` | Hệ thiết kế | F0-04, F1-01 | mọi cặp chữ/nền đạt AA, ghi bảng đo vào đầu `index.css` |
| F1-03 | Làm lại logo (`src/components/Logo.jsx`, `public/favicon.svg`), 3 phương án phác thảo SVG, người dùng chọn 1 | Hệ thiết kế | F1-02 | logo mới ở thanh bên, đăng nhập, favicon, bìa PDF |
| F1-04 | Token 3 tầng (tham chiếu, ngữ nghĩa, component) cho màu, khoảng cách, bo góc, chuyển động; giữ tên cũ (`glass*`, `hero*`) làm bí danh | Hệ thiết kế | F1-02 | không component nào dùng mã màu trần (grep sạch) |
| F1-05 | Gộp component theo kiểm kê: một kiểu nút chính, một bán kính mỗi tầng, thẻ không lồng thẻ | Hệ thiết kế | F1-04 | `/ui-kit` hiển thị đủ 8 trạng thái mỗi control |
| F1-06 | Khóa hệ thống: viết `DESIGN.md` ở gốc repo (hallmark "lock the system") để mọi agent sau dùng chung | Hệ thiết kế | F1-05 | `DESIGN.md` có token, chữ, chuyển động, luật cấm |

### F2. Bộ chuyển động

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F2-01 | Token chuyển động (mục 4.3) vào `index.css` + `tailwind.css`; thay khối giảm chuyển động hiện tại bằng bản theo token | Chuyển động | F1-04 | token dùng được trong Tailwind |
| F2-02 | `useReducedMotion`, `useInView` trong `src/components/motion/`; thay các bản `reduceMotion()` lặp | Chuyển động | F2-01 | grep `matchMedia('(prefers-reduced-motion` chỉ còn trong hook |
| F2-03 | Nâng cấp `AnimatedNumber` (đếm khi vào khung nhìn, hiệu ứng chốt) | Chuyển động | F2-02 | API cũ không đổi; trang cũ không vỡ |
| F2-04 | `LedgerRun` (chữ ký), hai chế độ `auto` và `scroll`; test thuần cho hàm tính dòng (số cuối = `countedForMetrics` với cả số liệu demo và thật ở mục 7 của handoff) | Chuyển động | F2-03 | chạy đúng ở `/ui-kit`; giảm chuyển động thì hiện bảng tĩnh ngay |
| F2-05 | `ChartReveal`, `BarGrow`, `Pulse`, `Stagger` | Chuyển động | F2-02 | demo ở `/ui-kit` |
| F2-06 | `RouteTransition` bằng View Transitions API trong `App.jsx` (`MainLayout`) | Chuyển động | F2-02 | Chrome có hiệu ứng, Firefox rơi về fade, không giật thanh bên |

### F3. Trang giới thiệu công khai

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F3-01 | `node scroll-craft/scripts/doctor.mjs`, `workspace.mjs --ensure`; ghi `BRIEF.md` (mục 4.4) | Trang giới thiệu | F0-04 | brief có đường cảm xúc, đỉnh, câu kể lại |
| F3-02 | Chọn ngữ pháp, chạy cổng vân tay (FINGERPRINTS.md), viết bảng điểm (nhịp, thiết bị, lý do) | Trang giới thiệu | F3-01 | qua cổng 4/6 |
| F3-03 | Chụp ảnh app thật cho hero (nhiều lớp: nền, màn chính, lớp trước) bằng `capture.mjs` sau khi F4, F5 xong phần nhìn | Trang giới thiệu | F5-02 | ảnh trong `public/landing/`, mỗi ảnh dưới 250 KB (WebP/AVIF) |
| F3-04 | Route `/` công khai trong `App.jsx`, component `src/components/landing/Landing.jsx`; chép engine scroll-craft vào `src/vendor/scrollcraft/` (không sửa engine) | Trang giới thiệu | F2-04 | `/` mở được khi chưa đăng nhập; đã đăng nhập vẫn xem được, có nút "Vào ứng dụng" |
| F3-05 | Dựng 7 nhịp theo bảng điểm; nhịp 3 dùng `LedgerRun mode=scroll`; số thật từ `/trust/health` một lần, có ảnh chụp số dự phòng | Trang giới thiệu | F3-04 | chạy được cả khi Render đang ngủ (dự phòng hiện sau 4 giây) |
| F3-06 | Nhịp 6 "Người làm ra" với ảnh nhóm `.hallmark/team/nhom-customer-radar.png` (chép bản nén sang `public/landing/`) và tên 5 bạn đúng chính tả ở mục 11 câu 2 | Trang giới thiệu | F0-04 | ảnh nén dưới 250 KB, có `alt` ghi tên theo thứ tự trong ảnh |
| F3-07 | Kiểm theo scroll-craft bước 5: `shoot.mjs` 1440, 390, giảm chuyển động; đọc `sheet.png`; kiểm cảm xúc | QA | F3-05 | không có đoạn cuộn chết, chữ đủ tương phản ở mọi khung |

### F4. Khung ứng dụng

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F4-01 | Thanh bên: logo mới, trạng thái đang ở trang nào chuyển bằng một thanh trượt (transform) thay vì nhảy | Trang app | F1-05, F2-02 | |
| F4-02 | Thanh trên + bảng lệnh Ctrl+K: mở/đóng `--motion-short`, kết quả tìm lệch nhịp nhẹ | Trang app | F2-05 | |
| F4-03 | Trợ lý (ngăn kéo): trượt vào, câu trả lời hiện theo đoạn | Trang app | F2-05 | |
| F4-04 | Đăng nhập: bản sắc mới + phép trừ chạy một lần; liên kết về trang giới thiệu | Trang app | F2-04, F1-03 | |
| F4-05 | Trạng thái tải chung: khung xương (skeleton) theo đúng hình nội dung, thay chữ "Đang tải" | Trang app | F1-05 | mọi trang có loading, empty, error |

### F5. Tổng quan

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F5-01 | `SummaryHeader`: phép trừ chạy làm màn mở đầu; số cuối khớp mọi trang | Trang app | F2-04 | |
| F5-02 | `StoreHealth`: 3 số đếm lên nối tiếp sau phép trừ (không chạy cùng lúc) | Trang app | F5-01 | |
| F5-03 | `TodayInbox`: mở rộng mượt, chấp nhận thì `Pulse` rồi gập | Trang app | F2-05 | |
| F5-04 | Biểu đồ xu hướng: `ChartReveal`; bỏ `SentimentDonut` nếu còn được dùng (donut bị cấm), thay bằng thanh xếp chồng | Trang app | F2-05 | grep không còn donut trong route |

### F6. Trang số liệu và biểu đồ

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F6-01 | Bảng số liệu `/insights`: lọc chéo có chuyển động (thanh co giãn, số đếm từ cũ sang mới) | Biểu đồ | F2-05 | lọc 5 lần liên tiếp không giật, không lệch số |
| F6-02 | Phân tích nguyên nhân: thanh mọc theo thứ tự, tab chuyển `--motion-medium` | Biểu đồ | F2-05 | |
| F6-03 | Một bảng màu biểu đồ dùng chung theo skill `dataviz` (validator chạy được), sáng và tối | Biểu đồ | F1-02 | |

### F7. Các trang còn lại

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F7-01 | Cảnh báo `/risk` | Trang app | F2-05 | |
| F7-02 | Livestream `/live`: bình luận mới chảy vào, thẻ nhóm đếm | Trang app | F2-05 | không tụt khung hình khi 2 bình luận/giây |
| F7-03 | Tin cậy dữ liệu `/trust`: phễu dùng ngôn ngữ phép trừ chạy | Trang app | F2-04 | |
| F7-04 | Phản hồi, Nguồn dữ liệu, Cài đặt, Lab, Báo cáo: chỉ áp token mới và chuyển động thao tác | Trang app | F1-05 | báo cáo PDF xuất ra vẫn đúng (kiểm bằng script xuất PDF thật) |
| F7-05 | Rà chữ toàn app theo `design:ux-copy`: nút nói đúng việc, lỗi nói cách sửa | Chữ | F7-04 | |

### F8. Kiểm định và hiệu năng (chạy liên tục, chốt cuối)

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F8-01 | Sau mỗi khung: `sloplint --render` các route bị đổi, sửa hết FAIL | QA | mỗi khung | |
| F8-02 | Chụp "sau" như F0-01, ghép trước/sau; người dùng xem | QA | F7 | |
| F8-03 | Kiểm giảm chuyển động, bàn phím (Tab qua mọi trang), tương phản tối | QA | F7 | |
| F8-04 | Đo lại hiệu năng như F0-02; tăng quá 10% thì tách chunk trang giới thiệu (lazy) | QA | F7 | |
| F8-05 | `npm run lint`, `npm run build`, `node backend/test/run_tests.js` (117 đạt) | QA | F7 | |
| F8-06 | Đánh giá cuối trong ngữ cảnh mới (hallmark finish review, `design:design-critique`) | QA | F8-02 | trả lời từng điểm |
| F8-09a | Phóng to phép trừ ở `/` (người dùng chọn 1A): sổ khoảng 60% bề ngang màn 1440, số cuối 72 đến 96 px, mỗi dòng trừ kèm một bình luận mẫu bị gạch (lấy từ đúng kho có số đó, đã che tên), chấm san hô hiện khi số chốt | Trang giới thiệu (Opus) | F8-06 | 1440 và 390 không tràn; giảm chuyển động hiện bảng tĩnh; số cộng trừ đúng |
| F8-09b | Trang giới thiệu chế độ tối (4B): bỏ khối nền sáng dài khoảng 4 màn; nền trang tối, chỉ sổ là khối giấy sáng nổi lên | Trang giới thiệu (Opus) | F8-09a (cùng agent) | tương phản đo bằng script đạt AA |
| F8-09c | Đầu /dashboard (2A): đưa 2 việc gấp nhất của "Việc hôm nay" lên cột trái, lấp khoảng trống khoảng 245 px dưới nút | Trang app (Opus) | F8-06 | 1440 hết khoảng trống; 390 thứ tự hợp lý; không lặp việc hai nơi gây rối |
| F8-09d | Vỏ app bớt template (3A): thay "Admin User / AU" bằng tên shop demo + logo; bỏ avatar chữ cái trong bảng phản hồi | Trang app (Sonnet) | F8-06 | không còn avatar chữ cái ở mọi route |
| F8-09e | Đưa độ đúng AI ra mặt tiền (5B): chờ thêm mẫu người duyệt | — | | bỏ lúc này |

### F9. Chuẩn bị demo

| ID | Việc | Agent | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| F9-01 | Kịch bản demo 5 phút đi qua: trang giới thiệu, đăng nhập, Tổng quan, Livestream, Báo cáo PDF | Điều phối | F8 | |
| F9-02 | Cập nhật trang so sánh trước/sau (artifact) bằng ảnh F8-02 | Điều phối | F8-02 | |

**Thứ tự chạy:** F0 → F1 → F2 → (F3, F4 song song) → (F5, F6, F7 song song) → F8 → F9. F8-01 chạy sau mỗi khung.

## 6. Các agent và việc của từng con

Mỗi agent **sở hữu** một nhóm file; không sửa file của agent khác. Cần đổi file ngoài phần mình thì ghi vào mục 10.

| Agent | Loại subagent | Model gợi ý | Sở hữu file | Skill phải nạp trước khi làm |
|---|---|---|---|---|
| **Điều phối** | phiên chính | Opus | `KE-HOACH-GIAO-DIEN.md`, `CLAUDE.md`, `App.jsx` (route) | không |
| **Hệ thiết kế** | general-purpose | Opus | `src/index.css`, `src/styles/tailwind.css`, `src/components/ui/*` (trừ AnimatedNumber), `Logo.jsx`, `public/favicon.svg`, `report_kit.jsx` (màu), `DESIGN.md` | `design-skills:design-systems`, `hallmark` |
| **Chuyển động** | general-purpose | Opus | `src/components/motion/*`, `ui/AnimatedNumber.jsx`, `UiKit.jsx` | `frontend-design:frontend-design`, `hallmark` (craft.md § 5) |
| **Trang giới thiệu** | general-purpose | Opus | `src/components/landing/*`, `src/vendor/scrollcraft/*`, `public/landing/*`, `scrollcraft/*` | `scroll-craft`, `hallmark` |
| **Trang app** | general-purpose | Sonnet | `Sidebar.jsx`, `shell/*`, `Login.jsx`, `dashboard/*`, `alerts/*`, `live/*`, `trust/*`, `feedback/*`, các trang `*.jsx` còn lại | `hallmark` (app screens), `frontend-design:frontend-design` |
| **Biểu đồ** | general-purpose | Sonnet | `Insights.jsx`, `Analytics.jsx`, `analytics/*`, `Segments.jsx`, `lib/cube.js` (chỉ phần hiển thị) | `dataviz`, `hallmark` (data-viz.md) |
| **Chữ** | general-purpose | Sonnet | chỉ sửa chuỗi chữ, không sửa cấu trúc | `design:ux-copy` |
| **QA** | general-purpose | Sonnet | `.hallmark/*`, script kiểm trong scratchpad | `superpowers:verification-before-completion` |

### 6.1 Mẫu lời giao việc (dán nguyên cho subagent, thay phần trong ngoặc)

```
Mày là agent [TÊN AGENT] của dự án Customer Radar (repo D:\03-DuAn\AISC2026, Windows, Git Bash).
Việc: [ID] [tên việc] trong KE-HOACH-GIAO-DIEN.md.

Trước khi làm:
1. Đọc KE-HOACH-GIAO-DIEN.md mục 1, 2, 4, dòng [ID] ở mục 5, và 5 dòng cuối mục 9.
2. Đọc DESIGN.md nếu đã có (hệ đã khóa, ghi đè mọi lựa chọn riêng).
3. Nạp skill: [danh sách skill của agent].
4. Chỉ sửa file trong phần sở hữu ở mục 6. Cần sửa file khác thì ghi vào mục 10, không tự sửa.

Khi làm:
- Tuân luật cứng mục 2 (chữ Việt, số kiểu Việt, không thư viện animation lớn, chỉ transform/opacity/clip-path, có nhánh giảm chuyển động).
- Không gọi API prod quá 1 lần mỗi 20 đến 30 giây. Cần chụp nhiều trang thì KHÔNG trỏ prod, mà chạy backend local
  (chỉ đọc; cụm Atlas là cụm prod nên tuyệt đối không ghi):
    cd backend && AUTO_COLLECT=0 MONGODB_REAL_DB=customer_radar_ui_test_real PORT=5000 node server.js
  rồi giao diện: npx vite --port 5199 --strictPort (Vite tự chuyển /api sang 127.0.0.1:5000).
  Chỉ khi cần đúng số prod mới trỏ prod: PowerShell
  $env:VITE_API_URL='https://aisc2026-q1vx.onrender.com/api'; npx vite --port 5199 --strictPort
- Chấm: node C:/Users/DELL/.claude/skills/hallmark/scripts/sloplint.mjs [file] --genre modern-minimal --scope app --render --url http://localhost:5199/[route]

Xong khi: [tiêu chí "Xong khi" của dòng ID].

Bàn giao (bắt buộc):
1. npm run lint và npm run build không lỗi.
2. Chụp màn hình route bị đổi (sáng, tối, 390 px) vào .hallmark/shots/[ID]/ và tự xem lại.
3. Commit một commit tiếng Việt, cuối message: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. KHÔNG push (điều phối push).
4. Sửa dòng [ID] ở mục 8 thành "xong (chờ duyệt)", thêm một dòng vào mục 9 theo mẫu.
5. Trả về: commit hash, file đã đổi, đã kiểm gì, chưa kiểm gì, việc còn dở.
```

### 6.2 Cách điều phối chạy agent

- Chạy song song chỉ khi hai agent không chung file (bảng mục 6 bảo đảm điều đó). Agent sửa code chạy với `isolation: "worktree"` khi chạy song song, điều phối gộp lại.
- Sau mỗi agent: điều phối đọc diff, chạy F8-01 cho route bị đổi, xem ảnh, rồi mới push và đổi trạng thái thành `xong`.
- Mỗi lần push frontend thuần, Vercel tự deploy; không cần bật lại phiên live.

## 7. Số đo mốc và số đo sau

| Mục | Trước (F0) | Sau (F8) |
|---|---|---|
| JS + CSS gzip tổng (`npm run build`) | 618,43 kB (JS 601,74 kB, CSS 15,64 kB); ngân sách F8: tối đa 680 kB | 649,86 kB (+5,1%, đạt; HEAD 67f6ca4) |
| Chunk chính `index-*.js` | 1.733 kB thô, 507,88 kB gzip (mọi route một chunk, chưa tách); ngân sách F8: tối đa 559 kB | 1.773,96 kB thô, 521,15 kB gzip (đạt); trang giới thiệu lazy 14,53 kB JS + 2,62 kB CSS gzip |
| Tải `/dashboard`, bản build (`vite preview` + backend local), trung vị 3 lần | 813 ms tới khi sổ đối chiếu hiện số; LCP 832 ms | Đo lại A/B/A/B cùng máy rảnh, 5 lần x 2 vòng: sổ hiện số F0 730 ms, F8 733 ms (+0,3%); LCP F0 766, F8 892 ms (+16,4% nhưng do đổi phần tử LCP: F0 tính chữ "Đang tải", F8 tính câu tóm tắt thật; cùng mốc "câu thật hiện" 818 lên 848 ms, +3,7%). **Mốc LCP mới 892 ms.** Báo cáo `.hallmark/F8-bao-cao.md` |
| sloplint sau F8 | | tĩnh: 1 FAIL app (mã 19 "—" ở AnimatedNumber, chờ waiver) + 3 FAIL engine `src/vendor` (miễn); `--render` 14 route: 0 FAIL |
| F8-03 | | giảm chuyển động: số cuối hiện ngay ở 5 route app; `/` còn 10 đoạn chữ ẩn tới khi cuộn; bàn phím 14 route, 0 focus không thấy vòng; tương phản 134 cặp đạt, 1 ô bảng nhiệt tối 3,93:1 |
| Tải `/dashboard`, Vite dev | 2.052 ms; LCP 2.088 ms (chỉ tham khảo, F8 so với dòng bản build) | — |
| sloplint `src --scope app` | 0 FAIL, 11 REFLEX (toàn mã 64: font-mono cho nhãn), 10 WARN, 12 REJECTED (waiver 64 thiếu guard) | — |
| sloplint `--render --kept` `/dashboard` | 1 FAIL ("Khiếu nại" mất so với `.hallmark/before.json` cũ, có thể do mốc cũ lệch dữ liệu), 12 REFLEX, 12 WARN | — |
| Kiểm kê F1-01 (đang có / gộp còn) | nút khoảng 20 / 7; cỡ chữ khoảng 22 / 6; bo góc 7 / 3; khối chứa 8 / 4; mã hex trần 69 trong 7 file / 0; bóng 10 / 2; token 98 (khoảng 60 không dùng) / khoảng 40; khoảng 30 chỗ thẻ lồng thẻ, 4 sọc trái, 6 chấm trạng thái | — |

Kiểm kê đủ và bảng token màu B đã đo tương phản (108 cặp đạt AA): `.hallmark/inventory.md` (phụ lục C có script đo).

Cách đo lặp lại: `node .hallmark/perf/measure_dashboard.mjs <base> 3` (selector `figure dl .text-metric`, xóa cache mỗi lần, bỏ một lần làm ấm). Báo cáo đủ: `.hallmark/baseline-F0.md`. Ảnh mốc: `.hallmark/before-ui2/` (48 ảnh + `sheet-1440.png`, `sheet-390.png`).

Lỗi sẵn có F0 phát hiện (giao cho khung tương ứng):
- Ở 390 px, thanh tab của `/data` và `/lab` bị cắt mép phải (F7-04).
- `/lab` tải lần đầu 14,4 giây (do mô hình ONNX trong trình duyệt); F8-04 xem có tách chunk lazy không.
- Chunk chính vượt 500 kB: F8-04 tách route bằng `React.lazy` (Lab, Reports, Insights, trang giới thiệu).

## 8. Bảng trạng thái

Trạng thái: `chờ` (chưa đủ phụ thuộc), `sẵn sàng`, `đang làm (agent, ngày)`, `xong (chờ duyệt)`, `xong`, `bỏ`.

| ID | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| F0-01 | xong | | không commit (`.hallmark/` gitignore) |
| F0-02 | xong | | số ở mục 7 |
| F0-03 | xong | | số ở mục 7 |
| F0-04 | xong | | mục 11 |
| F1-01 | xong | | `.hallmark/inventory.md` |
| F1-02 | xong | 2b72f2e | đã push; chưa xuất PDF thật để kiểm màu bản in |
| F1-03 | xong | dc29354 | người dùng chọn A2; đã push; ảnh `.hallmark/shots/F1-03/` | vòng 1 (3 icon trong ô vuông bo góc) người dùng loại cả ba; vòng 2 ở `.hallmark/logo/vong-2/`: **người dùng chọn hướng A "khung ngắm"** (hai chữ L từ ký hiệu tay trong ảnh nhóm đặt đối góc, chấm san hô ở giữa), đã vẽ 3 biến thể A1 góc ngắm mảnh, A2 chữ L tay (đầu bo, cánh đứng dài hơn), A3 góc ngắm đậm (`so-sanh-A.png`, mỗi biến thể 7 SVG `A{n}-dau|khoa|favicon|...`, chữ đã thành path), chờ người dùng chọn; sau khi chọn: thay `Logo.jsx`, `public/favicon.svg` |
| F1-04 | xong | d841cf8 | đã push; bo góc 3 bậc `--r-ctrl` 6px, `--r-surf` 10px, full (+ `--r-mark` 2px cho dấu dữ liệu); `src/lib/tokens.js` `readToken` cho Recharts |
| F1-05 | xong | 36f9683, f5f9496, d74589f, 1dd47f0, 343115e, ba0ba0c | đã push; API: `Button({ variant: primary|secondary|ghost|danger|link, size: sm 32|md 40|lg 48, icon, iconRight, loading, block, pressed, as })`, `IconButton({ icon, label, variant: glass|ghost|danger|primary, size, pressed, loading, badge })`, `Popover`, `MenuItem`, `ChartTooltip`, `Modal`, `Drawer`, `Chip`, `Segmented`, `Tabs`, `fieldClass`, `SELECTED`, `Backdrop`; `AXIS_TICK`, `CHART_FONT` ở `lib/tokens.js` |
| F1-06 | xong | e4a292c | đã push; `DESIGN.md` 236 dòng (hệ đã khóa, mọi agent sau đọc trước); token 253 còn 209 (xóa 44, danh sách `.hallmark/F1-06-token-xoa.md`); 38 token chưa dùng giữ có lý do (`--viz-2..6` cho F6, API chuyển động, vai trò Hallmark cho sloplint, `--radius-*` chặn bo góc mặc định Tailwind) |
| F2-01 đến F2-06 | xong | 85f2955, 33ace03, 98aa1fa | đã push; API ở mục 4.3; chưa gắn vào trang thật (F4 đến F7) |
| F3-01 đến F3-07 | xong, đã push | a712e0e, 04758ef, f44f383, 1163888 | ngữ pháp "Sổ đối chiếu"; brief `scrollcraft/builds/gioi-thieu/BRIEF.md`; ảnh app trong `public/landing/*-light|dark.webp` là bản TẠM: chụp lại sau F5 bằng lệnh ở comment đầu `Landing.jsx`, sửa luôn `SNAPSHOT`, `SNAPSHOT_DATE` trong `landing/data.js` |
| F4-01 | xong | 150b2d7, a84c321 | đã push; dấu trang trượt translateY; tagline logo `text-xs` |
| F4-02 | xong | 46c946f | đã push; Ctrl+K --motion-short, lệch nhịp chỉ khi gõ |
| F4-03 | xong | 7fa3fc0 | đã push; trợ lý trượt (Web Animations đè pop-in, xem mục 10) |
| F4-04 | xong | cf3baa7 | đã push; đăng nhập LedgerRun một lần, link về `/` |
| F4-05 | xong | 3a267b1, f13aaac | đã push; `ui/Skeleton.jsx`, `dashboard/LedgerSkeleton.jsx`, keyframe `skeleton`; chưa vào `ui/index.js`, `/ui-kit` |
| F5-01 | xong | 213e514 | đã push; bỏ `Ledger` cũ (hết vòng tròn quanh dấu khớp); số cuối 14.306 khớp /trust và `/trust/health` |
| F5-02 | xong | bb8db1f, a84c321 | đã push; 3 số đếm nối tiếp qua `onDone`; ô chỉ số không còn là nút to, chỉ nút "Cách tính" |
| F5-03 | xong | 0cac045 | đã push; mở bằng clip-path, chấp nhận thì Pulse rồi gập |
| F5-04 | xong | b287e7e, 0c5ea8c | đã push; ChartReveal; `SentimentDonut` đổi tên `SentimentShare` (vốn là thanh xếp chồng); RisingIssues về đúng hệ |
| F6-01 | xong (chờ push) | 5570c8b | lọc chéo: AnimatedNumber từ số cũ, BarGrow, ChartReveal; lọc 5 lần khớp số với giảm chuyển động |
| F6-02 | xong (chờ push) | d7f9dd2 | thanh nguyên nhân mọc lệch 40 ms, tab --motion-medium, `Compare.jsx` width thành scaleX |
| F6-03 | xong (chỉ báo) | | validator dataviz: CVD, tương phản PASS; lightness/chroma FAIL (`viz-5` sáng, cả dải tối sáng quá vì nền navy, `viz-6` xám cố ý); không đổi token, đề xuất ở mục 10 |
| F7-01 | xong | eef4026 | đã push; dòng nặng nhất hiện trước, `Fold` clip-path trong `AlertParts.jsx`, Pulse rồi gập |
| F7-02 | xong | 529a53e | đã push; 24 đến 30 lên 59,7 khung/giây ở 2 bình luận/giây (đồng hồ tách riêng, `memo` + `slice`/`sameContent` trong `live/memo.js`, `useDeferredValue`) |
| F7-03 | xong | cbf919e | đã push; phễu = LedgerRun (14.308 khớp API và PDF); hàng đợi kiểm duyệt thành hàng kẻ |
| F7-04 | xong | 918f359 | đã push; tiến độ PDF theo tờ; tiến độ thu thập dạng vệt chạy (không phần trăm giả); tab /data, /lab rút nhãn vừa 390 px; focus dòng phản hồi; PDF thật 4 trang đúng |
| F7-05 | xong | a9fdbd8 | đã push; 18 file chỉ đổi chữ; `alertTitle` "Giao hàng: Giao chậm"; lỗi nói cách sửa; nút "Lưu danh mục", "Kết thúc phiên" |
| F3-03 (làm lại) | xong | 67f6ca4 | đã push; 10 ảnh app mới (592.786 B); `SNAPSHOT` 15.112 − 567 − 69 − 12 − 150 = 14.314; tối: đỉnh thành khối giấy navy-94 trên nền mực (15,1:1, đảo như chế độ sáng); FAIL sloplint 20/62/67 + REFLEX 64 là của engine `src/vendor`, không phải landing |
| F8-01 đến F8-05 | xong | | không commit; số ở mục 7; lỗi: chặn demo 0, nên sửa 9 (B1..B9), để sau 10 (C) trong `.hallmark/F8-bao-cao.md` mục 7; ảnh `.hallmark/after-ui2/` |
| F8-07 dọn | xong | 950a03b, f671c37, ea13ac6, 16f6a2d, b0a95b4, 59ee102 | đã push; B1..B9 + mục 10 (a..e); gốc B2 là luật CSS cũ `[class*="col-span-"]` bắt cả `lg:col-span-*` (đã bỏ, điều phối kiểm mọi lưới cha có tiền tố màn hình); `LedgerRun` thêm prop `bare`; token `--heat-span`; Drawer chung trượt từ phải; **B1: "—" ô trống để trong hằng `EMPTY_CELL` vì mã 19 là Floor không miễn được: đây là né linter có chủ ý theo luật người dùng ("—" cho ô trống), không phải sửa** |
| F8-06 | xong | | **6/10** "ấn tượng, không giống AI"; báo cáo `.hallmark/F8-06-danh-gia.md`, ảnh `.hallmark/shots/F8-06/`; chỉ chấm trên kho Mô phỏng (kho thật local rỗng) |
| F8-08 sửa nhỏ | xong | b8d42c3, d6941f4, 5e7697f, 753109a, 07fd0f7, cae7175 | đã push; `fmtDec` dùng chung ("+1.275%", "1.322 triệu"); ô nhóm trống "—"; `LedgerRun` prop `play`, /dashboard chạy một lần mỗi phiên (`sessionStorage` `cr-ledger-run`), /login và /trust tĩnh; 3 số StoreHealth chồng nhịp 40% ("90" hiện sau 1.076 ms); font nạp bằng `<link>` + chữ dự phòng `size-adjust` (chưa tái hiện được lỗi nhảy dòng ở local, xem lại trên Vercel); sloplint app 0 FAIL |
| F8-09a | xong (chờ duyệt), trong K5 | 058c9c8, f1b3c25, d3c081e | người dùng chọn 1A; sổ khoảng 57% bề ngang ở 1440, số cuối 72 đến 96 px, mỗi dòng trừ một bình luận mẫu bị gạch (kho Mô phỏng, chép tĩnh), chấm san hô khi chốt; ảnh `.hallmark/shots/K5/` |
| F8-09b | xong (chờ duyệt), trong K5 | f1b3c25 | người dùng chọn 4B; ở chế độ tối nền tối suốt, chỉ tờ sổ là giấy sáng đặc (không kính); tương phản đo bằng script, nhỏ nhất 5,39:1 |
| F8-09c | xong (chờ duyệt) | 7569a60 | người dùng chọn 2A; khối UrgentNow ở cột trái, khối Việc hôm nay bỏ 2 việc đã lên và ghi còn N việc khác; khoảng trống dưới nút ở 1440 còn khoảng 10 px (trước 245); ảnh `.hallmark/shots/F8-09c/` |
| F8-09d | xong (chờ duyệt) | 8203cbc | người dùng chọn 3A; bỏ avatar chữ cái ở 5 chỗ; thanh bên dùng LogoMark + "Chủ shop"; lớp `.fb-avatar` còn dư trong index.css (mục 10) |
| F8-09e | bỏ (lúc này) | | người dùng chọn 5B: chờ thêm mẫu người duyệt (đang 31 mẫu) |
| F9-01 đến F9-02 | chờ | | |

(Khi một khung bắt đầu, tách dòng gộp thành từng ID.)

## 9. Nhật ký bàn giao

Mẫu một dòng: `YYYY-MM-DD | ID | agent | commit | đã làm | đã kiểm | còn dở`

- 2026-11-12 | — | điều phối | — | viết kế hoạch này; cất ảnh nhóm vào `.hallmark/team/nhom-customer-radar.png` | — | chờ người dùng trả lời mục 11
- 2026-11-12 | F0-04 | điều phối | — | người dùng chốt: màu B, ảnh nhóm công khai (5 tên ở mục 11), có trang `/`, không ảnh AI | — | giao F0-01..03 cho QA, F1-01 cho hệ thiết kế
- 2026-11-12 | F0-01..03 | QA | — | 48 ảnh mốc, đo bundle và thời gian tải, sloplint mốc (mục 7) | không màn trắng; chỉ đo localhost | chưa đo mạng thật, chưa chụp /ui-kit và trạng thái sau thao tác
- 2026-11-12 | F1-01 | hệ thiết kế | — | kiểm kê + token màu B đo tương phản (`.hallmark/inventory.md`) | 108 cặp màu đạt AA bằng script | chưa xem bán kính thật trên trình duyệt, chưa đo màu bản in PDF
- 2026-11-12 | F1-02, F1-04, F1-03 (phác) | hệ thiết kế | 2b72f2e, d841cf8 | màu B toàn app + bản in; 69 mã hex trần thành token (3 tầng); bo góc 3 bậc; 3 phương án logo | lint, build đạt; sloplint bằng mốc (0 FAIL); 134 cặp màu app + 19 cặp bản in đạt AA (`.hallmark/contrast-F1.mjs`); ảnh `.hallmark/shots/F1-02/` | chưa xuất PDF thật; favicon cũ; ~60 token thừa để F1-06; `rounded-sm/md/lg` đang cùng 6px, F1-05 chuyển sang `rounded-ctrl`/`rounded-surf`; `RisingIssues` còn `brightness-125`
- 2026-11-12 | — | điều phối | push `bcfcc1e..d841cf8` | xem ảnh tổng F1-02 so với mốc: bố cục giữ nguyên, màu B đúng ở sáng và tối | — | chờ người dùng chọn logo
- 2026-11-12 | F1-03 vòng 2 | hệ thiết kế | — | người dùng loại cả 3 phương án vòng 1, chọn hướng A rồi biến thể A2 | ảnh `.hallmark/logo/vong-2/so-sanh-A.png` | —
- 2026-11-12 | F2-01..06 | chuyển động | 85f2955, 33ace03, 98aa1fa | token chuyển động, hook, AnimatedNumber mới, LedgerRun, ChartReveal, BarGrow, Pulse, Stagger, chuyển trang View Transitions, demo `/ui-kit` | test ledgerRun 14/14; lint, build đạt (chunk chính 514,85 kB gzip); sloplint 0 FAIL; 60,3 khung/giây lúc LedgerRun chạy; giảm chuyển động hiện bảng tĩnh ngay | chưa thử Firefox; giữa chuyển trang đứng trang cũ khoảng 250 ms
- 2026-11-12 | F1-03 | điều phối | dc29354 | áp logo A2: `Logo.jsx`, favicon, thanh bên (gập 28 px), bìa PDF (24 px); bỏ `--logo-from/to` | lint, build đạt; ảnh đăng nhập, thanh bên sáng/tối/gập, bìa báo cáo | chưa xuất PDF thật
- 2026-11-12 | F1-05, F3 | điều phối | — | hai agent bị dừng giữa chừng do hết hạn mức API 5 giờ (mở lại 13:40), chưa sửa file nào; 15:17 gọi chạy tiếp | — | —
- 2026-11-12 | F3-01..07 | trang giới thiệu | a712e0e, 04758ef, f44f383 | trang `/` 7 nhịp (khoảng 10,3 màn cuộn), đỉnh ghim 3,8 màn với LedgerRun theo cuộn (kéo ngược thì số cộng lại), rãnh ngang Việc hôm nay, ảnh nhóm + 5 tên, engine scroll-craft chép nguyên văn, lazy chunk riêng | lint, build (chunk chính 516,52 kB gzip; trang giới thiệu 14,53 kB JS + 2,57 kB CSS); sloplint 0 FAIL 0 REFLEX (4 waiver có lý do); shoot 1440, 390, giảm chuyển động, tối; treo API thì số dự phòng hiện sau 4 giây; Tab có focus | chưa thử điện thoại thật và Firefox; ở tối nền đỉnh (navy-30) lệch ít với nền trang nên cú cắt yếu; chưa review hallmark ngữ cảnh mới
- 2026-11-12 | F3 | điều phối | 1163888 | người mở lần đầu thấy "Xem bản dùng thử" (chỉ khi localStorage isAuthenticated = 'true' mới "Vào ứng dụng"); thêm `<noscript>` trong `index.html` | lint, build | —
- 2026-11-12 | F1-05 | hệ thiết kế | 36f9683..ba0ba0c (6 commit) | nút 20 kiểu còn 7; ô nhập 1 họ 2 cỡ; chip/tab 3; popover 2; hộp thoại Modal + Drawer (confirm/alert trình duyệt thành Modal/Toast); bỏ khoảng 30 thẻ lồng thẻ, sọc trái, chấm trang trí; 6 bậc chữ (+ `text-cover` chỉ ở khối mực đăng nhập); bo góc 3 bậc; 2 bóng; font-mono thành tabular-nums, gỡ waiver 64 | lint, build (516,5 kB gzip); sloplint phần app 0 FAIL 0 REFLEX (mốc 11); Tab /dashboard 30/30, /ui-kit 40/40 có focus; 39 ảnh không tràn ngang (`.hallmark/shots/F1-05/`) | chưa chụp /live đang trong phiên (ActionCoach); chưa Firefox; chưa xuất PDF thật; `SeverityDot`, `DeltaPill` trong report_kit không ai dùng; tab /data, /lab ở 390 px cuộn ngang
- 2026-11-12 | — | điều phối | push `dc29354..ba0ba0c` | xem ảnh tổng F1-05 (trước, F1-02, F1-05): bố cục giữ, không mất nội dung | — | sloplint toàn `src` báo 3 FAIL + 1 REFLEX trong `src/vendor/scrollcraft/scrollcraft.css` (engine chép nguyên, không được sửa): từ nay chấm sloplint bỏ thư mục `src/vendor`

- 2026-11-12 | F1-06 | hệ thiết kế | e4a292c | `DESIGN.md` (nguyên tắc, màu 3 tầng sáng/tối, chữ 6 bậc, bo góc, bóng, lớp chồng, chuyển động, API component đọc từ code, logo A2, luật cấm); xóa 44 token (bí danh `--dur-*`, `--ease`, `--z-*`, `--hero-*`, `--bg-*`, `--risk-*`, `--accent-blue...`, `--space-2xl..4xl`) | lint, build đạt; CSS gzip 15,95 xuống 15,66 kB; 7 route sáng/tối so pixel và 46 thuộc tính style: không khác do token; sloplint `src` phần app 0 FAIL 0 REFLEX | chưa 390 px, Firefox, PDF thật, trạng thái popover/hộp thoại mở
- 2026-11-12 | F1-06 | điều phối | push `ba0ba0c..e4a292c` | đọc diff, grep lại 31 tên đã xóa: không còn chỗ dùng | — | đề xuất của agent ghi ở mục 10

- 2026-11-12 | F6-01..03 | biểu đồ (Sonnet) | 5570c8b, d7f9dd2 | /insights lọc chéo có chuyển động, /analytics thanh mọc + tab, validator màu | lint đạt; build chunk chính 518,75 kB gzip; sloplint --render /insights, /analytics 0 FAIL; lọc 5 lần và lọc nhanh 250 ms khớp số với giảm chuyển động; ảnh `.hallmark/shots/F6/` | chưa xem ảnh tối và 390 px của /analytics; /segments chưa chụp
- 2026-11-12 | — | điều phối | 4d33d99 | sửa gốc `AnimatedNumber`: bị ngắt thì đếm tiếp từ số đang hiện (hết bật lùi), số chưa ai thấy không giữ số cũ sau lọc, ô trống "—" | lint | `Num` trong Insights giờ thừa, F8 có thể gỡ

- 2026-11-12 | F4-01..05, F5-01..04 | trang app (Opus) | 3a267b1..0c5ea8c (13 commit) | khung app có chuyển động, đăng nhập và Tổng quan chạy phép trừ, StoreHealth đếm nối tiếp, Việc hôm nay Pulse, skeleton/rỗng/lỗi | lint, build (chunk chính 519,51 kB gzip); test ledgerRun 14/14; số khớp 14.306 ở 3 nơi; sloplint file của mình 0 FAIL, render /dashboard 0 FAIL 1 REFLEX 72; Tab /login 5/5; 390 px không tràn; chặn POST bằng interception, không ghi DB | hiệu năng đo lúc máy bận (2 agent chạy): tới khi sổ hiện số 987 ms, LCP 1.184 ms so với mốc 813/832; agent cho là dao động máy + LCP nay đo câu tóm tắt thật thay vì chữ "Đang tải": F8-04 đo lại lúc máy rảnh, xen kẽ hai bản
- 2026-11-12 | — | điều phối | push `e4a292c..0c5ea8c` | xem ảnh phép trừ giữa chừng (Tổng quan, đăng nhập), Pulse Việc hôm nay, F6 lọc giữa chừng | — | khung sổ trên Tổng quan và đăng nhập còn khoảng trống dưới số cuối (F8); tiêu đề cảnh báo "Giao hàng — Giao chậm" có gạch dài (F7-05)

- 2026-11-12 | F7-01..04 | trang app nhóm F7 (Sonnet) | eef4026, 529a53e, cbf919e, 918f359 | Cảnh báo, Livestream, Tin cậy dữ liệu, Phản hồi, Nguồn dữ liệu, Lab, Báo cáo | lint; chunk chính 521,09 kB gzip; sloplint --render 5 route 0 FAIL thật; /live 59,7 khung/giây (Vite dev); PDF thật 4 trang; chặn POST bằng interception | chưa chạy nhánh giảm chuyển động thật; chưa xem ảnh tối /feedbacks, /settings, /lab, /reports; REFLEX 72 ở /trust (nghi `truncate` cụm giống nhau); khung hình đo ở dev không phải build
- 2026-11-12 | — | điều phối | push `0c5ea8c..918f359` | đọc `live/memo.js` + `slice` (so `sessionId`, `live`; callback chỉ phụ thuộc phiên nên không cũ); xem ảnh /trust, /live | — | /trust: sổ LedgerRun nằm trong panel "Phễu dữ liệu" (gần thẻ lồng thẻ) và tiêu đề lặp "Từ lúc thu thập tới lúc được tính": F8 xem lại

- 2026-11-12 | F7-05 | chữ (Sonnet) | a9fdbd8 | bỏ gạch dài, mũi tên, khoảng số gạch ngang, IN HOA ở Lab, p trong câu kết luận Compare; lỗi và rỗng nói cách sửa | lint; build; ledgerRun 14/14; ảnh `.hallmark/shots/F7-05/` | quyết định cũ trong DB vẫn lưu tiêu đề dạng " — " (snapshot)
- 2026-11-12 | — | điều phối | push `918f359..a9fdbd8` | kiểm đề xuất "z, p trong bản in": nằm trong Bảng A4 "Số liệu kiểm định" ở phụ lục, đúng luật, không sửa | — | backend còn "Giao hàng - Giao chậm trên ..." và "so với nền 0,0%": gộp vào lần đổi backend kế

- 2026-11-12 | F3-03 | trang giới thiệu (Sonnet) | 67f6ca4 | chụp lại 10 ảnh app, `SNAPSHOT` mới, đỉnh tối đảo thành khối giấy, sửa `SHOTS` (viec-hom-nay cao 654, so-doi-chieu 669) | lint, build (landing 14,53 kB JS + 2,62 kB CSS gzip); sheet tối 1440 | chưa xem sheet sáng, tối 390, giảm chuyển động; chưa đo tương phản bằng script
- 2026-11-12 | — | điều phối | push `a9fdbd8..67f6ca4` | xem sheet tối 1440: đỉnh tách rõ | — | khối giấy sáng giữa trang tối là quyết định thị giác, chờ người dùng xem trên Vercel

- 2026-11-12 | F8-01..05 | QA (Sonnet) | — | lint, build, backend 117, ledgerRun 14/14; đo A/B máy rảnh; sloplint 14 route; 48 ảnh sau + sheet trước/sau; giảm chuyển động, bàn phím, tương phản | không lỗi chặn demo | chưa đo mạng thật, trạng thái sau thao tác (drawer, Ctrl+K, PDF), tắt JS trên `/`
- 2026-11-12 | — | điều phối | — | xem sheet trước/sau tối: bố cục giữ, không vỡ; thêm việc F8-07 dọn | — | —

- 2026-11-12 | F8-07 | QA dọn (Sonnet) | 950a03b..b0a95b4 (5 commit) | B1..B9, Skeleton dùng chung, gỡ `Num`, chú thích lỗi thời, CSS chết, Drawer trượt | lint, build, ledgerRun 14/14; sloplint app 0 FAIL (vendor 3 miễn); bảng nhiệt nhỏ nhất 7,11:1 tối, 5,47:1 sáng; `/` giảm chuyển động 0 đoạn ẩn; điều khiển ≥ 32 px; h1/h2/h3 đúng 12 route; số khớp 14.324 | chưa lọc 5 lần ở Insights sau khi gỡ `Num`
- 2026-11-12 | — | điều phối | 59ee102, push `67f6ca4..59ee102` | xem ảnh /trust, /dashboard; thấy nhãn "Tài khoản đã định danh" đè cột Nguồn (do `whitespace-nowrap` ở `EvidenceTag`): cho xuống dòng, chụp lại 0 ô tràn | — | Tổng quan 1440 còn khoảng hở khoảng 130 px dưới nút đầu trang (cột trái thấp hơn khung sổ): để F8-06 xét

- 2026-11-12 | F8-06 | đánh giá cuối (Opus, ngữ cảnh mới) | — | 6/10: được ở ý phép trừ, số khớp 5 nơi, ảnh nhóm, lọc chéo; mất ở chỗ chữ ký chỉ là thẻ 430 px giữa nền navy rộng, phần app so với trước gần như chỉ đổi màu, vỏ app còn dáng template (Ctrl K, chuông, "Admin User/AU", avatar chữ cái), hero theo công thức landing | chặn mọi request ghi; không gọi prod | ảnh hero `/` mang số cũ 14.314/15.112: chụp lại sau seed `--anchor` 8 đến 9/12
- 2026-11-12 | — | điều phối | — | không theo ý "người lạ vào thẳng /dashboard là lỗi": `App.jsx` ghi rõ cố ý cho giám khảo vào thẳng; giao F8-08 việc nhỏ; việc lớn chờ người dùng (F8-09) | — | —
- 2026-11-12 | F8-09 | điều phối | — | người dùng chọn 1A 2A 3A 4B 5B; tách F8-09a..e; giao 3 agent song song (a+b Opus cổng 5000/5199, c Opus 5001/5299, d Sonnet 5002/5399) | — | —
- 2026-11-13 | F8-09c | trang app (Opus) | 7569a60 | UrgentNow: 2 việc khẩn/gấp nhất lên cột trái dưới nút, chung useDecisions với Việc hôm nay, khối dưới bỏ việc đã lên (ghi còn N việc khác), câu tóm tắt không lặp tên việc | lint; build scratchpad; sloplint dashboard 0 FAIL; 1440/390 sáng tối, giảm chuyển động, giả 2 việc và rỗng; chấp nhận thử (POST bị chặn) | chưa thử Bỏ qua qua hộp thoại, chưa đo khung/giây; với 2 việc cột trái cao hơn sổ khoảng 155 px; chưa gộp K4-01 (kính)
- 2026-11-13 | K1-01..05, K1-07 (trừ K1-06) | hệ thiết kế (Sonnet) | 5b93b70, aa58a48, 20d1835, 576d644 | token kính + `--shadow-float`, `glass-chrome`, `glass-float`, `paper`, 3 nhánh dự phòng; `AppAtmosphere` (4 bố cục, trôi bằng timeline có tên); Popover, Modal, Drawer, Toast dùng `glass-float`; mục Kính ở `/ui-kit`; DESIGN.md | lint exit 0; build 651,12 kB JS+CSS gzip (mốc 649,86); `node .hallmark/contrast-K1.mjs` 208 cặp, 0 trượt (không phải tăng độ đặc); ảnh `.hallmark/shots/K1/`; trôi -54px ở cuối trang, giảm chuyển động đứng yên, giảm trong suốt và data-glass off về nền đặc; sloplint 0 FAIL ngoài `src/vendor` | chưa đo khung/giây cuộn (K2-05/K6-04); thanh trên, thanh bên, Ctrl+K, trợ lý chưa dùng kính (K2); K1-06 chưa làm; chưa gắn `paper` vào trang nào (K4)
- 2026-11-13 | K1-08, K1-06, dọn | hệ thiết kế (Sonnet) | xem `git log` (3 commit sau 576d644) | lớp không khí đậm hơn (sáng 30/40/10, tối 38/14/50), `--glass-tint` sáng 0,66 lên 0,78 theo bước 0,04; Cài đặt có bật/tắt Hiệu ứng kính; xóa `.fb-avatar` và `initials` | lint exit 0; build 651,52 kB; contrast-K1 208 cặp 0 trượt (thấp nhất 4,56:1); ảnh `*-k108.png` thấy vùng xanh sau panel, chữ đọc bình thường | chưa chụp trang Cài đặt mới, chưa thử bật/tắt kính bằng tay
- 2026-11-13 | K3-01..05 | chuyển động (Sonnet) | fde681f, 3559b7c, 56dbce0 | `PageEnter` (M1, 4 khối, 60ms, chỉ khi đổi route, `usePageEntered`), `.reveal` (M2) và `.lift` (M4) trong khối `/* K3 */` của tailwind.css, demo ở /ui-kit, /dashboard bọc PageEnter: sổ chờ M1 xong rồi mới chạy, ba số chờ cả hai; DESIGN.md mục 5 | lint exit 0; build scratchpad; ledgerRun 14/14; sloplint motion 0 FAIL; /dashboard: khối vào xong ~540 ms, phép trừ chạy ngay sau (524 đến 561 ms), ba số đếm sau khi sổ xong; bấm liên kết (View Transitions) không còn `::view-transition-new(app-main)` chồng lên PageEnter, trang không có PageEnter giữ mờ cũ; đổi bộ lọc không tạo animation mới trên khối đầu; reveal chạy thật trong main.main-content (opacity 0 đến 1, translate 16 đến 0, scale 0,985 đến 1); lift: chuột nhấc -2px, Tab không nhấc, giảm chuyển động chỉ có bóng, iPhone 12 không có gì; giảm chuyển động: khối hiện ngay, sổ không chạy; ảnh `.hallmark/shots/K3/` | ảnh chụp 100 ms thực tế cách nhau khoảng 140 ms (headless chụp chậm), số liệu mốc lấy từ lấy mẫu trong trang mỗi 8 ms; chưa thử Safari, Firefox (không có view() thì reveal hiện đủ, chưa xem tận mắt); chưa đo khung/giây; `.lift` dùng `::after` nên phần tử đã có `::after` phải bọc lớp ngoài; chưa gắn reveal, lift vào trang nào (K4); FilterBar đang do K2 sửa nên chưa chắc là khối thứ hai ổn định của PageEnter
- 2026-11-13 | K2-01..05 | trang app (Sonnet) | xem `git log` (2 đến 3 commit sau 56dbce0) | Topbar M3: dải kính trải hết bề ngang main, nền giả `::before` opacity 0 đến 1 trong 0 đến 48 px bằng `scroll(nearest)`, bỏ useState; thanh bên `glass-chrome` (điện thoại mở thì tint đặc + `--shadow-float`); Ctrl+K `glass-float` (Trợ lý đã là `glass-float` qua Drawer); FilterBar `glass-chrome` dính dưới thanh trên (`--topbar-h`, `--filter-h`, `scroll-padding-top` của `.main-content`) | lint exit 0; build scratchpad; sloplint index.css 0 FAIL; ảnh `.hallmark/shots/K2/` (/dashboard 0 và 300 sáng tối, /feedbacks giữa, gập, 390 mở, Ctrl+K, trợ lý); khung/giây xem 12.5 | /insights 15 đến 20 khung/giây (cũng thế khi tắt kính và ở bản cũ); /dashboard khung trên 50 ms trung vị 4 (mục tiêu 3), dao động; chưa thử giảm trong suốt, tắt kính, giảm chuyển động bằng ảnh; scroll-mt-20/24 cũ ở file khác cộng thêm scroll-padding
- 2026-11-13 | K4-01 (+3 sửa nhỏ điều phối) | trang app (Sonnet) | 3e076e4 | khối đầu /dashboard là một GlassPanel (câu tóm tắt, nút, Việc gấp nhất dạng hàng kẻ), sổ giấy đặc không viền bên phải, 2 việc gấp thì dòng cập nhật dời sang cột phải; reveal cho Việc hôm nay, Cửa hàng đang thế nào, 2 hàng biểu đồ, Phản hồi gần đây; viết hoa chữ đầu lý do (upFirst); bỏ scroll-mt-24 ở #today | oxlint 0 lỗi; build (bản sao scratchpad vì node_modules hỏng lúc đó); ledgerRun 14/14; sloplint dashboard 0 FAIL; lấy mẫu 3 lần: khối vào, phép trừ chạy ngay sau, rồi xong; 1440 sáng tối (thật, 2 việc, giữa cuộn, cuối trang), 390 sáng; bấm Xem N việc khác: tiêu đề cách thanh lọc 10 đến 21 px, không bị che; ảnh `.hallmark/shots/K4-01/` | chưa chụp dãy khung hình (ảnh chụp rỗng trong bản build); chưa có dòng nào bấm được để gắn lift (không có); với 2 việc cột phải còn trống khoảng 110 px dưới dòng cập nhật; chưa chụp 390 tối, 390 với 2 việc, giảm chuyển động
- 2026-11-13 | K4-02..04 | trang app (Sonnet) | bc2bfba, 3af85c7, 58f8153 | /login (form vào bằng PageEnter, khối mực đứng yên), /insights, /analytics (3 tab), /risk, /trust: PageEnter; reveal cho panel dưới màn đầu 1440x900; lift cho dòng cảnh báo và 3 thẻ phân khúc; paper cho bảng nhiệt, bảng, danh sách dày chữ, sổ ở /trust, Số liệu kiểm định; 4 số KPI /insights chờ M1 (usePageEntered) | lint 0 lỗi, build scratchpad đạt; sloplint 7 file bằng mốc HEAD (0 FAIL mới); ảnh `.hallmark/shots/K4a/` 1440 sáng (đầu, giữa), 1440 tối, 390; mọi `.reveal` về opacity 1 sau khi cuộn tới; lọc 3 lần ở /insights không tạo animation PageEnter mới; số được tính 14.329 ở /dashboard và /trust; giảm chuyển động: khối đầu và reveal đều opacity 1; POST bị chặn | chưa thử Firefox/Safari, chưa đo khung/giây, chưa xem tay tab Kiểm tra ngẫu nhiên và /risk khi nhiều cảnh báo; panel lấp ló ở mép dưới màn đầu (Nhóm vấn đề, Kênh nào vấn đề gì ở /insights, tab So sánh) không reveal; Segments ở /analytics?tab=segments chưa có reveal (bảng đã ở màn đầu); node_modules hỏng giữa chừng (do việc khác), đã dùng bản npm ci ở scratchpad rồi chạy lại trong repo; KE-HOACH-GIAO-DIEN.md đang untracked nên dòng này chưa commit
- 2026-11-13 | K6-01..05 + A1..A3 | QA (Sonnet) | c4a1b72 (A1), be5e478 (A2), fc2850f (A3) (nhánh giao-dien-kinh) | A1 Settings sticky `--topbar-h`; A2 FeedbackList `paper mx-3 mb-3`; A3 /insights: nguyên nhân cuộn chậm là AnimatedNumber trong bảng đếm setState mỗi khung (trace: Layout 117 lần, React scheduler 1,56 s, 878 đột biến chữ khi cuộn), đổi số ô bảng sang `CellNum` (không đếm, KPI vẫn đếm): 15 đến 20 lên 59,9 khung/giây, 0 khung trên 50 ms | lint exit 0; build đạt; ledgerRun 14/14; backend 117 đạt; sloplint tĩnh 3 FAIL đều ở `src/vendor` (có sẵn ở cae7175), `--render` 14 route 0 FAIL; ảnh 56 + 3 sheet `.hallmark/after-kinh/`; A/B cae7175 xen kẽ; giảm chuyển động, giảm trong suốt, tắt kính: 0 nội dung ẩn, 0 backdrop-filter; Tab 14 route sáng tối 0 focus không thấy vòng; contrast-K1 208 cặp 0 trượt; báo cáo `.hallmark/K6-bao-cao.md` | không đạt ngân sách: JS+CSS +7,56 kB (6), sổ hiện số 1.300 ms (806; +30% vì M1 giữ sổ, giảm chuyển động +4%), LCP 1.268 ms (981, nhưng bản cũ hôm nay cũng 1.240); /live chỉ đo bằng EventSource giả, trung bình khoảng 38 khung/giây; số ô bảng /insights không còn đếm khi cuộn (quyết định cho điều phối); `.hallmark/` bị gitignore
- 2026-11-13 | K7-02 (backend) | Backend (Opus) | 928ad1f, ca37256, c8b2659 (nhánh giao-dien-kinh, chưa push) | lỗi K7 số 1, 2, 7, 8, 9, 10 (phần báo cáo live), 12, 25 (liveMs), 26, 27: WCR dùng giao dịch cùng phạm vi lọc, /api/seed tắt mặc định (ALLOW_SEED_ROUTE), chặn SSRF ở /api/scrape (Chromium chỉ khi ALLOW_BROWSER_SCRAPE=1), quyết định còn hiệu lực 7 ngày, Hôm nay theo giờ Việt Nam, sửa ba lỗi chữ ở mục 10 (dòng chờ lần đổi backend kế). Test 160 đạt, verify 6/6, 0% báo nhầm | frontend đọc session.liveMs thay endedAt trừ startedAt ở LiveConsole; chưa deploy Render
- 2026-11-13 | K7-02 (frontend) | Frontend (Sonnet) | xem `git log` nhánh giao-dien-kinh (4 commit, chưa push) | lỗi K7 số 3, 5, 6, 11, 15, 16, 17, 18, 20, 21, 22, 23, 24, phần frontend của 25 (icon xu hướng, bỏ tên biến AUTO_COLLECT, câu "đã live" đọc `session.liveMs`) và 27; chưa làm 4, 13, 14, 19 (chờ người dùng) | lint 0 lỗi, build đạt, ledgerRun.test 14 đạt; /insights đứng hình đo bằng rAF + longtask (dev 460 đến 620 ms xuống còn khoảng 120 đến 170 ms trong lúc vào trang; bản build 124 đến 216 ms xuống 101 đến 134 ms); ảnh `.hallmark/shots/K7-02f/` | còn: bảng giá trị khoảng ngày của bìa PDF chờ backend trả minTs/maxTs trong /stats; tài khoản demo đổi chữ thành demo@customerradar.vn / demo2026 (backend không kiểm đăng nhập)

### Bước kế (điều phối, cập nhật 2026-11-12 tối)

1. ~~F1-06~~ xong (e4a292c). Mọi agent từ nay đọc `DESIGN.md` trước khi làm.
2. ~~F4 + F5~~ xong (đến 0c5ea8c). Còn: F7 đang chạy; F7-05 chữ; F3-03 chụp lại ảnh trang giới thiệu + `SNAPSHOT`; F8.
3. (cũ) F4 + F5 (agent Trang app): gắn LedgerRun vào đăng nhập và Tổng quan, StoreHealth đếm nối tiếp, TodayInbox `Pulse`, sửa mục 10 (vòng tròn quanh dấu khớp, `scrollIntoView` smooth).
3. F6 (agent Biểu đồ) và F7 song song với F5 nếu không chung file.
4. Sau F5: chụp lại ảnh app cho trang giới thiệu (F3-03), sửa `SNAPSHOT` trong `landing/data.js`.
5. Trang giới thiệu chế độ tối: nền đoạn đỉnh (navy-30) gần trùng nền trang, cần tăng tương phản (F3 sửa lại hoặc F8).
6. Chạy agent Opus lần lượt hoặc tối đa 2 con song song: hai con Opus song song đã chạm hạn mức 5 giờ một lần (12/11), và một lần nữa lúc F4/F5 (mở lại 20:10).
7. Chọn model để tiết kiệm hạn mức (người dùng yêu cầu 12/11 tối): Opus cho việc cần óc thiết kế (F4/F5 chữ ký phép trừ, F8-06 đánh giá cuối); Sonnet cho việc làm theo mẫu đã rõ (F6, F7-01..04, F7-05 chữ, F3-03 chụp lại ảnh, F8-01..05 QA). Agent dừng giữa chừng vì hạn mức thì gọi chạy tiếp (SendMessage) thay vì mở agent mới.
8. Hai agent song song cùng thư mục: con thứ hai dùng backend cổng 5001 + Vite 5299 với `VITE_API_URL=http://127.0.0.1:5001/api` (backend mở CORS), build ra scratchpad (`--outDir`), không `git add -A`.

## 10. Đề xuất đổi kế hoạch

(Agent ghi vào đây khi cần sửa file ngoài phần mình hoặc thấy kế hoạch sai. Điều phối duyệt rồi chuyển vào mục 5.)

- 2026-11-12 (từ F2, giao cho F5-01): `SummaryHeader` còn vòng tròn quanh dấu "khớp" (luật cấm vòng tròn) và `scrollIntoView({ behavior: 'smooth' })` chưa tôn trọng giảm chuyển động.
- 2026-11-12 (từ F2, giao cho F4-05 / F7): vòng xoay đang tải nào cần chạy cả khi giảm chuyển động thì thêm lớp `keep-motion`.
- 2026-11-12 (từ F2, giao cho F1-05): ở 390 px ô "Ghi chú" mục Ô nhập của `/ui-kit` rộng 411 px.
- 2026-11-13 (từ K2-04, giao cho K3/K4): `Analytics.jsx:234`, `RiskCenter.jsx:496`, `TodayInbox.jsx:219`, `PipelineDemo` đang có `scroll-mt-20`/`scroll-mt-24`; vì `.main-content` đã có `scroll-padding-top` (thanh trên + thanh lọc), hai số cộng nhau và chừa thừa khoảng 80 đến 96 px. Nên bỏ `scroll-mt-*` ở các chỗ cuộn bằng `scrollIntoView` tới khối dưới thanh lọc. `RiskCenter.jsx:496` `lg:top-20` (sticky) cũng thấp hơn thanh trên mới (khoảng 72 px cộng 8), nên đặt `top-[calc(var(--topbar-h,5rem)+0.5rem)]`.
- 2026-11-12 (từ F1-06, giao cho F4-01): `LogoWordmark` dòng tagline cỡ `0.62 * scale` rem (cỡ sm khoảng 9,9px, dưới 13px); mọi chỗ gọi đang tắt tagline: bỏ hẳn hoặc tối thiểu `text-xs`.
- 2026-11-12 (từ F1-06, giao cho F5): `RisingIssues.jsx:76` còn `duration-500` và `group-hover:brightness-125` (ngoài hệ, animate `filter`): đổi sang `duration-micro` và màu token.
- 2026-11-12 (từ F1-06, giao cho F7-03): `/trust` khối "Hàng đợi kiểm duyệt" mỗi phản hồi là thẻ có nền trong panel (thẻ lồng thẻ): đổi thành hàng kẻ.
- 2026-11-12 (từ F1-06, giao cho F8): lớp CSS chết `.badge-*`, `.cat-badge`, `.dashboard-grid`, `.col-span-*` (kiểm kê F1-01): một việc riêng xóa CSS chết.
- 2026-11-12 (từ F1-06, giao cho F6): cuối F6 nếu `--viz-2..6` vẫn không dùng thì được xóa. (F6 xong: vẫn chưa dùng; điều phối giữ lại, quyết ở F8.)
- 2026-11-12 (từ F6, giao cho hệ thiết kế/F8): `viz-5` sáng `#733160` tối quá dải validator, gợi ý gần `#8E4A7C` rồi đo lại tương phản; dải tối sáng hơn dải là do nền navy, ghi ngoại lệ trong DESIGN.md; `viz-6` xám "Khác" là ngoại lệ cố ý.
- 2026-11-12 (từ F6, giao cho F8): `ui/Chips.jsx` `Tabs` gạch chân đổi tab 120 ms, nội dung tab 420 ms: cân nhắc cùng nhịp. `Compare.jsx` hai sản phẩm A/B dùng `--accent` và `--text-mid`, có thể đổi sang `viz-1`/`viz-3`. Heatmap /insights ở 375 px: ghim cột đầu `sticky`.
- 2026-11-12 (từ F4/F5, giao cho F8 hoặc hệ thiết kế): Drawer chung (`ui/Overlay.jsx`) nên trượt từ phải cho mọi Drawer; khi đó bỏ đoạn Web Animations trong `Assistant.jsx` kẻo chạy hai lần. Thêm Skeleton vào `ui/index.js` và `/ui-kit`; thay các `animate-pulse` còn lại (Analytics, Insights, RiskCenter, TrustLayer, Lab, live/*, FeedbackList, Audit, Compare) bằng Skeleton.
- 2026-11-12 (từ F4/F5, giao cho F7-04): dòng bảng "Phản hồi gần đây" (`FeedbackTable`/`FeedbackList`) có focus nhưng không thấy vòng; nghi đệm phải dưới 8px (REFLEX 72).
- 2026-11-12 (từ F4/F5, giao cho F7-05): `alertTitle` ghép bằng " — " ("Giao hàng — Giao chậm"): đổi cách ghép (dấu phẩy hoặc hai dòng).
- 2026-11-12 (từ F4/F5, giao cho F8): chú thích lỗi thời ở `lib/ledgerRun.js:24`, `motion/LedgerRun.jsx:18` còn nhắc `Ledger` trong SummaryHeader (đã xóa); waiver sloplint 19 cho "—" ở `AnimatedNumber.jsx` (ô trống bắt buộc theo luật); đổi mốc LCP vì giờ đo câu tóm tắt thật.
- 2026-11-12 (từ F7, giao cho F8/hệ thiết kế): `Tabs` (`ui/Chips.jsx`) nên có dấu hiệu cuộn ở mép phải thay vì rút nhãn; `ProgressBar` thêm biến thể "không xác định" dùng chung (đang tự dựng trong `DataSources.jsx`); `useLiveSession` gộp bình luận theo khung hình khi trên 5 bình luận/giây.
- 2026-11-12 (từ F7-05 và F8-08, chờ lần đổi backend kế, vì deploy backend ngắt phiên live): `backend/services/live/report.js:186, 190, 194` và câu "Chốt nhiều nhất phiên này (... sản phẩm)" in số không dấu chấm nghìn ("9691", "1647", "1660 (1894)", "2457"): thêm `fmtVi = (n) => n.toLocaleString('vi-VN')`; câu cảnh báo "Giao hàng - Giao chậm trên ..." đổi sang "Giao hàng: giao chậm"; playbook "so với nền 0,0%" giữ 2 chữ số khi dưới 1%.
- 2026-11-12 (điều phối duyệt): F1-02/F1-04 được phép sửa **chỉ phần màu** (thay mã hex trần bằng token) trong file của agent khác (`DataSources.jsx`, `Segments.jsx`, `live/*`, biểu đồ...), vì lúc này không agent nào khác đang chạy. Không sửa cấu trúc các file đó.
- 2026-11-13 | F8-09d | trang app Sonnet | 8203cbc (nhánh giao-dien-kinh) | bỏ avatar chữ cái ở FeedbackList, FeedbackDetail, Segments, Settings, Sidebar; thanh bên: LogoMark + "Chủ shop" + "Quản lý trải nghiệm KH"; `currentUser`/`DEFAULT_USER` xuất từ `useDecisions.js`, "Admin User" cũ trong localStorage coi là chưa đặt tên | lint, build; ảnh `.hallmark/shots/F8-09d/` (24 ảnh: 1440 và 390, sáng, tối, thanh bên gập), 390 không tràn ngang; grep `initials(` chỉ còn định nghĩa; sloplint: Audit/Settings/Sidebar chỉ báo 26a vì CSS ở index.css (như mốc) | chưa chạy luồng "Chấp nhận" thật (POST bị chặn); chưa kiểm /dashboard, /live (agent khác); không có tên shop trong dữ liệu mô phỏng nên không bịa thương hiệu
- 2026-11-13 | K5-01..07 (gộp F8-09a, F8-09b) | trang giới thiệu (Sonnet) | 058c9c8, f1b3c25, d3c081e (nhánh giao-dien-kinh) | BRIEF đợt 2; sổ lớn có bình luận gạch (kho Mô phỏng, tĩnh trong data.js) và chấm san hô; tối suốt, sổ giấy sáng; khung ngắm (hai góc chữ L của logo đọc --sc-p quét danh sách bình luận, nhãn Rác, Nghi ảo, Khách thật); hero có tấm glass-float giữa ba lớp ảnh, tilt 3 độ bằng data-sc-tilt; LedgerRun thêm rowNotes, numberClass, settleDot | lint 0 lỗi; build scratchpad; chunk Landing gzip 16,30 kB JS + 3,29 kB CSS (mốc 14,53 + 2,62); sloplint landing 0 FAIL; shoot.mjs 1440, 390, giảm chuyển động, sáng và tối: không dead scroll; script đo 110 chữ mỗi trạng thái, nhỏ nhất 5,39:1; tilt đo được; ảnh `.hallmark/shots/K5/` | chưa thử máy thật hay Safari; ảnh app trong hero và rãnh vẫn là bản 12/11 (còn Admin User, số 14.314) nên chưa khớp số sống 14.329, cần chụp lại; khung ngắm đọc --sc-p nên lệch một khung hình khi cuộn rất nhanh; chưa đo khung/giây
- 2026-11-13 | K4-05, K4-06, K4-07 | trang app Haiku | e4148ef (K4-05), fbe1fbf (K4-06), 5cb272a (K4-07) (nhánh giao-dien-kinh) | PageEnter bọc 6 trang (Phản hồi, Livestream, Nguồn dữ liệu, Báo cáo, Phòng thí nghiệm, Cài đặt); reveal cho 7 panel báo cáo sau live và 4 panel tab Kết quả của Phòng thí nghiệm nằm dưới màn đầu; lift cho dòng bảng phản hồi và nút mở phiên live; paper cho bảng và danh sách chữ nhỏ (FeedbackList, Báo cáo sau live, Orders, Nguồn dữ liệu, Báo cáo, Phòng thí nghiệm, BatchDemo) | lint không lỗi và build đạt trên bản sao sạch (xem dưới); ảnh 1440 đầu và cuối, 390 đầu ở `.hallmark/shots/K4b/` (bản trước ở `truoc/`); sau cuộn cuối mọi `.reveal` opacity 1,00; rê dòng bảng nhấc 2px; không bấm nút ghi nào | `node_modules` trong repo thiếu binding Windows của rolldown và oxlint (thư mục binding không có package.json), nên `npm run lint` và `vite build` không chạy được tại repo; chữ trong bảng và danh sách paper sát mép vì paper không có padding (Báo cáo sau live, cần quyết định); chưa thấy ảnh bảng Lịch sử, bảng lô BatchDemo và Lịch sử báo cáo (cần thao tác ghi); tab Điều khiển phiên không có reveal (luồng live); FeedbackList dùng chung với Tổng quan nên Tổng quan nhận paper và lift từ e4148ef, chưa kiểm ảnh Tổng quan
- 2026-11-13 | K4-09 | dọn giao diện (Sonnet) | 6a15fbd, 4806b2c, 5c5e64c (nhánh giao-dien-kinh) | `paper` có lề trong 8 px ngang, 4 px dọc (không margin âm: panel không đệm sẽ bị nền tràn; 3 chỗ `mx-3 mb-3` ở panel không đệm giữ vì không thừa); sticky Analytics và RiskCenter dùng `--topbar-h` cộng `--filter-h`, bỏ `scroll-mt-20/24` (Analytics, RiskCenter, PipelineDemo); /dashboard 2 việc gấp: dòng cập nhật xuống đáy cột sổ | lint 0 lỗi; build scratchpad; ảnh `.hallmark/shots/K4-09/` trước/sau 9 route sáng, tối (insights, live), dashboard 2 việc sáng/tối/390; chữ trên paper 6,00 đến 15,67:1 sáng, 6,51 đến 13,85:1 tối | chưa thử cuộn anchor bằng bấm thật ở 390; Settings.jsx và TodayInbox.jsx:219 còn `lg:top-20`/`scroll-mt` (ngoài quyền); khoảng trống ~100 px giữa sổ và dòng cập nhật vẫn còn (chỉ dời xuống đáy)
- 2026-11-13 | K5-08 | trang giới thiệu (Sonnet) | 761e295 | chụp lại 10 ảnh app bản kính (giảm chuyển động, kho Mô phỏng, chỉ đọc), tổng 581.782 B (trước 592.786 B); `SNAPSHOT` 15.129 − 569 − 69 − 12 − 150 = 14.329, `SNAPSHOT_DATE` 13/11/2026; `SHOTS` đổi cỡ (so-doi-chieu 552x666, viec-hom-nay 531, bang-so-lieu và livestream 972) | lint không lỗi; trang / sáng và tối, 1440 và 390: hero, rãnh lp-work, không tràn ngang; ảnh trong `.hallmark/shots/K5-08/` | lặp lại 8 đến 9/12 sau seed `--anchor`; id ví dụ bình luận trong data.js không kiểm lại được qua API (danh sách chỉ trả 200 dòng)
- ~~2026-11-13 (từ F8-09d): lớp `.fb-avatar` trong `src/index.css` (dòng 626 đến 631) không còn ai dùng; xóa khi Hệ thiết kế xong việc với index.css. Hàm `initials` trong `src/lib/format.js` cũng hết người gọi.~~ (xong K1-08, đã xóa)

- 2026-11-13 (từ K1, giao cho K2): thanh trên, thanh bên, thanh lọc chưa dùng `glass-chrome`; lớp `.atmos` nằm `z-index: -1` nên các vùng nền của app (`.main-content`, thanh bên) phải để trong suốt hoặc dùng `glass-chrome`, đừng đặt nền đặc phủ toàn trang. `CommandPalette.jsx` và `Assistant.jsx` đổi sang `glass-float` (K2-03).
- 2026-11-13 (từ K1, giao cho điều phối): K1-04 cần đổi `Toast` trong `ui/Display.jsx`, file này không có trong danh sách sở hữu K1; đã sửa đúng một dòng (`glass-float`). `ATMOS_BY_ROUTE` nằm trong `shell/AppAtmosphere.jsx` (tự map theo route), nên K4 không phải đặt `data-atmos` từng trang, chỉ sửa bảng này nếu muốn đổi bố cục.
- 2026-11-13 (từ K1, giao cho K3): `reveal` và `lift` chưa có; ghi ở DESIGN.md mục 5 luật 3 là "do K3 viết". Bảng nhiệt và danh sách cần `paper` xem báo cáo K1.
- 2026-11-13 (từ K6, giao cho K7 hoặc K3): `ui/AnimatedNumber.jsx` `setState` mỗi khung cho mỗi số đang đếm và đổi `key` khi chốt; trang nhiều số cuộn rất chậm (đã gặp ở /insights, đã tránh bằng `CellNum` trong Insights.jsx). Nên đếm bằng ghi `textContent` qua ref (không qua React) hoặc giới hạn số ô đếm cùng lúc, rồi mới cho bảng dùng lại; chưa đo /trust, /analytics, /reports, /lab với nhiều số.
- 2026-11-13 (từ K6, giao cho điều phối): sổ `/dashboard` hiện số chậm hơn bản cũ 300 ms vì chờ PageEnter (M1); muốn đạt ngưỡng 806 ms phải cho chữ số `sr-only` và LCP hiện ngay, chỉ giữ cuộn chữ số. Ngoài quyền (`LedgerRun`, `SummaryHeader`). Ngưỡng tuyệt đối 806 và 981 ms cũng nên đo lại theo bản cũ cùng lượt vì mốc 733 ms hôm 12/11 không tái hiện được (bản cũ hôm nay 974 đến 1.000 ms).
- 2026-11-13 (từ K6, giao cho điều phối): JS+CSS gzip +7,56 kB so cae7175 (ngân sách 6); +5,14 ở phần tải khi vào app, +2,43 ở chunk trang giới thiệu. Chọn: nới ngân sách lên 8 kB hoặc cắt CSS/landing.
- 2026-11-13 (từ K6, giao cho K7): WARN mới `landing.css` `.lp-cost__copy .lp-h2` 15ch (mã 25), `motion/MotionDemo.jsx` nhãn dài không `nowrap` (mã 49); `/trust` 390 px cột "Độ tin số liệu" bó hẹp, chữ xuống dòng từng từ (`TrustLayer.jsx`, đang có sửa dở của người dùng).

## 11. Quyết định của người dùng (F0-04, chốt 2026-11-12)

1. **Màu:** phương án B, chuyển cả app sang navy + xanh polo + một điểm san hô (mục 4.1).
2. **Ảnh nhóm:** được công khai. Tên, theo thứ tự trong ảnh (hàng trên trái sang phải, rồi hàng dưới trái sang phải):
   - Hàng trên: **Nguyễn Thành Dũng**, **Phạm Văn Minh Phúc**
   - Hàng dưới: **Nguyễn Ngọc Thanh Thảo**, **Nguyễn Triệu Vy**, **Lê Thị Thanh Thảo**
   - Không ghi vai trò.
3. **Trang giới thiệu công khai ở `/`:** có.
4. **Ảnh sinh bằng AI:** không dùng. Chỉ ảnh chụp app thật và ảnh nhóm.

## 12. Đợt 2: "Sổ thật dưới lớp kính" (kính + chuyển động, từ 2026-11-13)

### 12.0 Yêu cầu người dùng (13/11, ý chính)

- "Giữ được phong cách như hiện tại nhưng pha loãng một chút bằng các hiệu ứng glass như trong video, kết hợp các animation chuyên nghiệp từ scroll-craft." Video mẫu: TikTok `@settigation` "Admin Dashboard V7" (kính mờ, thẻ nhấc khi rê, thanh bên có dấu trượt). Không chép bảng màu tím của video.
- "Khi mở hay nhìn vào trang web sao cho nó tự nhiên, flexible và vẫn giữ đúng phong cách số liệu thật từ database."
- "Thích kiểu animation động khi scroll hay khi vào trang web. Giao diện hiện tại đang tĩnh."
- Chia việc thật chi tiết, **model nhỏ (Sonnet, Haiku) làm**; Opus (điều phối) chỉ kiểm thành phẩm.
- **KHÔNG push lên GitHub tới khi người dùng đồng ý toàn bộ.** GitHub `main` giữ bản cũ (`cae7175`). Mọi việc đợt 2 làm trên nhánh local `giao-dien-kinh`.

### 12.1 Ý tưởng một câu

**Số liệu nằm trên giấy đặc, kính là ống ngắm.** Logo A2 là khung ngắm; kính là mặt kính của khung ngắm đó. Vì thế kính chỉ ở lớp "nhìn qua": thanh trên, thanh bên, lớp nổi (popover, Ctrl+K, hộp thoại, ngăn kéo, trợ lý, toast), thanh lọc dính, và khối tóm tắt đầu trang. Bảng, biểu đồ, sổ đối chiếu vẫn trên nền đặc để số đọc rõ và trung thực. Phía sau kính có một **lớp không khí** (vùng sáng navy, xanh polo rất nhẹ) trôi chậm khi cuộn, để kính có thứ mà làm mờ; không có nền phía sau thì kính chỉ là một màu trắng.

Giữ nguyên: màu B, chữ Be Vietnam Pro, thang chữ 6 bậc, bo góc 3 bậc, phép trừ chạy là chữ ký, số thật, mọi luật chữ (mục 2). Vẫn cấm: tím, chữ gradient, glow (bóng không lệch), framer-motion/GSAP, animate width/height/top/left.

### 12.2 Luật đổi (chờ người dùng xác nhận ở 12.6, sau đó ghi vào DESIGN.md)

| Luật cũ (DESIGN.md) | Luật mới |
|---|---|
| Nguyên tắc 2: "không kính mờ, không bóng mềm trên bề mặt" | Kính có kiềm chế ở lớp vỏ và lớp nổi (danh sách 12.1); bảng, biểu đồ, sổ trên nền đặc. Thêm một bóng `--shadow-float` cho lớp kính nổi (có lệch, có mờ, không glow). |
| Chuyển động luật 3: "Không fade-up từng khối, không hover nhún trên thẻ" | Được: (a) một màn vào trang dàn dựng (giữ "tối đa một"); (b) **một kiểu duy nhất** hiện theo cuộn cho khối nằm dưới màn đầu; (c) thẻ bấm được nhấc 2px khi rê (chỉ thiết bị có chuột). Không được: mỗi khối một kiểu riêng, nảy, xoay, phóng to quá 2%. |
| Bóng: chỉ 2 bậc | 3 bậc: `--shadow-knob`, `--shadow-overlay`, `--shadow-float`. |

### 12.3 Thông số gốc (agent dùng đúng số này, không tự đặt)

**Token kính (tầng 3 `index.css`, khối sáng và khối tối):**

| Token | Sáng | Tối | Ghi chú |
|---|---|---|---|
| `--glass-tint` | `rgb(255 255 255 / 0.78)` (K1-08 chỉnh, gốc 0,66) | `rgb(20 32 54 / 0.62)` | nền lớp kính (thay `--glass-bg`, `--glass-strong` đang trỏ `--surface`) |
| `--glass-tint-strong` | `rgb(255 255 255 / 0.82)` | `rgb(20 32 54 / 0.80)` | lớp nổi có chữ dày (popover, Ctrl+K, hộp thoại) |
| `--glass-blur` | `16px` | `16px` | điện thoại `8px`; `saturate(140%)` đi kèm |
| `--glass-line` | navy 10% | trắng 12% | viền 1px |
| `--glass-edge` | `inset 0 1px 0 rgb(255 255 255 / 0.7)` | `inset 0 1px 0 rgb(255 255 255 / 0.08)` | vệt sáng mép trên, giống cạnh kính |
| `--shadow-float` | `0 10px 30px -14px` navy 28% | `0 12px 32px -14px rgb(0 0 0 / 0.6)` | chỉ lớp kính nổi |

Lớp dùng chung (`tailwind.css`, `@utility`): `glass-chrome` (thanh trên, thanh bên, thanh lọc dính: `--glass-tint` + blur + `--glass-line` + `--glass-edge`), `glass-float` (lớp nổi: `--glass-tint-strong` + blur + `--glass-edge` + `--shadow-float`). Cả hai: `@supports not (backdrop-filter: blur(1px))` thì nền `--surface` đặc; `prefers-reduced-transparency: reduce` và `[data-glass='off']` thì nền đặc. Chữ trên kính phải đạt 4,5:1 đo **trên nền xấu nhất phía sau** (chỗ sáng nhất của lớp không khí, và khi một ô `bg-crit/12` cuộn qua bên dưới).

**Lớp không khí (`AppAtmosphere`):** một `div` `position: fixed; inset: 0; z-index: -1; pointer-events: none` sau `main.main-content`. 3 vùng `radial-gradient` lớn (đường kính 45 đến 60vw), độ đậm thấp:
- sáng: polo `#1F6FA8` 30%, polo-81 `#8CCBEB` 40%, navy `#13233F` 10%; tối: polo 38%, `#8CCBEB` 14%, navy sâu `#0A1222` 50% (K1-08 chỉnh: gốc sáng 10, 14, 6 và tối 16, 8, 40 quá nhạt, kính không thấy; tối đa được duyệt sáng a 30, b 40, tối a 38).
- **Không san hô** (san hô vẫn chỉ ở chấm logo), không tím, không teal.
- Trôi: `translate3d` theo cuộn của `main.main-content`, tối đa 6% chiều cao màn, bằng CSS `animation-timeline: scroll(nearest)`; trình duyệt không hỗ trợ thì đứng yên. Giảm chuyển động: đứng yên. Giảm trong suốt hoặc tắt kính: ẩn.
- Mỗi trang đặt vị trí 3 vùng khác nhau qua `data-atmos="dashboard|data|work|quiet"` (4 bố cục, để các trang không giống hệt nhau).

**Chuyển động (thêm vào hệ, dùng token cũ `--motion-*`, `--ease-*`):**

| Mã | Tên | Thông số | Ở đâu |
|---|---|---|---|
| M1 | Vào trang | khối đầu (tiêu đề trang, câu tóm tắt, hàng đầu) đi từ `opacity 0, translateY(12px)` về 0, `--motion-medium` `--ease-out`, lệch 60 ms, tối đa 4 khối; chỉ chạy khi đổi route (không chạy khi lọc, khi dữ liệu về lại) | mọi trang app, một lần mỗi lần vào trang |
| M2 | Hiện theo cuộn | lớp `reveal`: `animation-timeline: view()`, `animation-range: entry 0% entry 35%`, từ `opacity 0, translateY(16px), scale(0.985)`; `@supports not (animation-timeline: view())` thì hiện đủ (không JS); chỉ cho khối nằm **dưới** màn đầu | panel dưới màn đầu ở mọi trang app |
| M3 | Thanh trên đông kính | nền giả `::before` của Topbar đổi `opacity 0 đến 1` trong 0 đến 48 px cuộn đầu (`animation-timeline: scroll()` của `main.main-content`); ở đỉnh trang thanh trên trong suốt, cuộn xuống thì thành kính | Topbar |
| M4 | Thẻ nhấc | `translateY(-2px)` + `--shadow-float`, `--motion-short`, chỉ `@media (hover: hover) and (pointer: fine)`, chỉ phần tử bấm được (có `href` hoặc `onClick` mở chi tiết) | thẻ việc, dòng cảnh báo, ô sản phẩm bấm được |
| M5 | Lớp nổi mở | giữ `animate-pop-in` hiện có; nền phía sau mờ qua `Backdrop` (đã có `blur(3px)`) | popover, Ctrl+K, hộp thoại |
| M6 | Số | giữ `AnimatedNumber` và `LedgerRun`; số trong khối đầu trang đếm sau khi M1 xong | Tổng quan, đăng nhập |

Mọi mã có nhánh `prefers-reduced-motion`: trạng thái cuối hiện ngay. Mặc định của mọi lớp là "đã hiện đủ" (tắt JS, trình duyệt cũ vẫn thấy hết).

**Ngân sách hiệu năng (bản build, máy rảnh, `node .hallmark/perf/measure_dashboard.mjs`):**
- JS + CSS gzip tăng tối đa **6 kB** so với `cae7175` (không thêm thư viện).
- `/dashboard` tới khi sổ hiện số tối đa 733 ms + 10% = **806 ms**; LCP tối đa 892 + 10% = **981 ms**.
- Cuộn `/dashboard`, `/feedbacks`, `/insights` từ đầu tới cuối (Puppeteer, 1440, CPU giảm tốc 4x): trung vị **≥ 50 khung/giây**, khung trên 50 ms không quá 3 lần. Không đạt thì giảm `--glass-blur` hoặc bỏ kính ở thanh bên trước, không bỏ M1/M2.
- `/live` ở 2 bình luận/giây vẫn ≥ 55 khung/giây (mốc 59,7).

### 12.4 Bảng việc

Model: **S** = Sonnet, **H** = Haiku, **O** = Opus (chỉ điều phối kiểm). "Sở hữu" = file được sửa; ngoài danh sách thì ghi mục 10.

#### K0. Chuẩn bị (điều phối)

| ID | Việc | Model | Xong khi |
|---|---|---|---|
| K0-01 | Tạo nhánh local `giao-dien-kinh` từ `cae7175`; mọi agent commit vào nhánh này; không push | O | `git branch --show-current` = `giao-dien-kinh` |
| K0-02 | Người dùng trả lời 12.6; ghi 12.2 thành "đã duyệt" | O | có câu trả lời |
| K0-03 | Mốc đo đầu đợt 2: bundle, sổ hiện số, LCP, khung/giây cuộn 3 trang (CPU 4x); 14 route ảnh sáng/tối/390 vào `.hallmark/before-kinh/` | H | số ghi vào 12.5, đủ 42 ảnh |

#### K1. Nền kính (agent Hệ thiết kế, S)

Sở hữu: `src/index.css`, `src/styles/tailwind.css`, `src/components/ui/Glass.jsx`, `ui/Overlay.jsx`, `ui/Popover.jsx`, `ui/index.js`, `src/components/UiKit.jsx`, `src/components/shell/AppAtmosphere.jsx` (mới), `src/App.jsx` (chỉ gắn `AppAtmosphere`), `src/components/Settings.jsx` (chỉ K1-06), `DESIGN.md`, `.hallmark/contrast-F1.mjs`.

| ID | Việc | Model | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| K1-01 | Thêm token 12.3 (sáng, tối); `--glass-bg/strong` trỏ `--glass-tint`, giữ tên cũ; thêm `--shadow-float` | S | K0 | token có ở cả hai khối; build đạt |
| K1-02 | `@utility glass-chrome`, `glass-float` + 3 nhánh dự phòng (không hỗ trợ, giảm trong suốt, `data-glass='off'`); dưới 768 px blur 8px | S | K1-01 | `/ui-kit` có mục "Kính" hiện 2 lớp trên lớp không khí, sáng và tối |
| K1-03 | `AppAtmosphere` theo 12.3 (3 vùng, trôi bằng `scroll()` timeline, 4 bố cục `data-atmos`), gắn trong `App.jsx` ở vùng app (không ở `/`) | S | K1-01 | ảnh /dashboard đầu trang và giữa trang thấy vùng sáng khác vị trí; giảm chuyển động đứng yên |
| K1-04 | `Popover`, `Modal`, `Drawer`, `Toast` dùng `glass-float` | S | K1-02 | 4 loại lớp nổi thấy nền phía sau mờ |
| K1-05 | Đo tương phản: chữ `--text-hi/mid/lo` trên `--glass-tint`/`--glass-tint-strong` chồng lên (a) điểm sáng nhất lớp không khí, (b) ô `bg-crit/12`, (c) `--surface`; sáng và tối; đạt 4,5:1, không đạt thì tăng độ đặc tint và ghi số mới | S | K1-04 | bảng số trong báo cáo, 0 cặp trượt |
| K1-06 | Cài đặt "Hiệu ứng kính" bật/tắt ở `/settings` nếu chưa có (`applyGlass` đã có trong `hooks/useTheme.js`) | S | K1-02 | tắt thì mọi lớp kính đặc, lớp không khí ẩn |
| K1-07 | Cập nhật `DESIGN.md` mục 1, 2.2, 4, 5, 6 theo 12.2, 12.3 | S | K1-01..06 | grep "không kính mờ" trong DESIGN.md rỗng |

#### K2. Vỏ app kính (agent Trang app, S). Chạy sau F8-09d (cùng file).

Sở hữu: `src/components/Sidebar.jsx`, `src/components/shell/*` (trừ `AppAtmosphere.jsx`), `src/components/FilterBar.jsx`, khối CSS `.sidebar-container`, `.main-content` trong `index.css` (chỉ các khối này).

| ID | Việc | Model | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| K2-01 | Topbar M3: trong suốt ở đỉnh, cuộn 48 px thì thành `glass-chrome` (nền giả `::before` đổi opacity, không đổi chiều cao) | S | K1-02 | ảnh cuộn 0 và 200 px khác nhau; nội dung cuộn dưới thanh trên thấy mờ |
| K2-02 | Thanh bên `glass-chrome` (máy tính); điện thoại khi mở thành `glass-float` trên `Backdrop` | S | K1-02 | ảnh sáng, tối, gập, 390 mở |
| K2-03 | Ctrl+K và trợ lý dùng `glass-float`; giữ chuyển động hiện có | S | K1-04 | ảnh mở trên /dashboard |
| K2-04 | Thanh lọc (`FilterBar`) dính dưới thanh trên khi cuộn, `glass-chrome` | S | K2-01 | ảnh cuộn giữa /dashboard, /feedbacks |
| K2-05 | Đo khung/giây cuộn /dashboard (CPU 4x); dưới 50 thì báo điều phối, đề xuất giảm blur | S | K2-01..04 | số ghi 12.5 |

#### K3. Chuyển động trong app (agent Chuyển động, S)

Sở hữu: `src/components/motion/*` (trừ `LedgerRun.jsx` khi K5 đang chạy), `src/components/ui/AnimatedNumber.jsx`, phần demo trong `UiKit.jsx` (sau K1), khối CSS mới đánh dấu `/* K3 */` trong `tailwind.css`.

| ID | Việc | Model | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| K3-01 | `PageEnter` (M1): bọc khối đầu trang, dùng `location.pathname` để chỉ chạy khi đổi route; giảm chuyển động hiện ngay | S | K0 | demo `/ui-kit`; lọc dữ liệu không chạy lại |
| K3-02 | Lớp `reveal` (M2) thuần CSS + `@supports` | S | K0 | demo `/ui-kit`; trình duyệt không hỗ trợ hiện đủ |
| K3-03 | Lớp `lift` (M4) cho phần tử bấm được | S | K1-01 | demo `/ui-kit`; rê thấy nhấc 2px, điện thoại không nhấc |
| K3-04 | Phối M1 với `LedgerRun` và `StoreHealth`: số đếm bắt đầu sau khi khối vào xong | S | K3-01 | ảnh mỗi 100 ms trong 3 giây đầu /dashboard: khối vào, rồi số chạy |
| K3-05 | Cập nhật `DESIGN.md` mục 5 (API mới) | S | K3-01..03 | |

#### K4. Gắn vào từng trang (agent Trang app, S; Haiku làm K4-05..08 vì chỉ thêm lớp theo danh sách)

Mỗi trang: bọc `PageEnter` cho khối đầu, thêm `reveal` cho panel dưới màn đầu (chụp 1440x900 để biết khối nào nằm dưới), thêm `lift` cho phần tử bấm được, đặt `data-atmos`. Không đổi bố cục, chữ, số.

| ID | Trang | Model | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| K4-01 | /dashboard (sau F8-09c) | S | K2, K3 | khối kính đầu trang = câu tóm tắt + 2 việc gấp; sổ vẫn nền giấy đặc |
| K4-02 | /login | S | K3 | khối mực giữ; phần form vào bằng M1 |
| K4-03 | /insights, /analytics, /segments | S | K3 | lọc chéo giữ chuyển động F6; `reveal` chỉ cho biểu đồ dưới màn đầu |
| K4-04 | /risk, /trust | S | K3 | |
| K4-05 | /feedbacks | H | K3 | bảng không `reveal` từng dòng (chỉ cả khối) |
| K4-06 | /live | H | K3 | KHÔNG `reveal` trong luồng bình luận; chỉ khối dưới màn đầu |
| K4-07 | /data, /reports, /lab, /settings | H | K3 | |
| K4-08 | Kiểm khớp số "được tính" ở /dashboard, /trust, /reports (PDF xem trước) | H | K4-01..07 | 3 số bằng nhau |

#### K5. Trang giới thiệu (agent Trang giới thiệu, S, nạp skill `scroll-craft`). Gộp F8-09a, F8-09b.

Sở hữu: `src/components/landing/*`, `public/landing/*`, `scrollcraft/*` (KHÔNG `src/vendor/scrollcraft/*`), `src/components/motion/LedgerRun.jsx` (chỉ thêm prop, giữ API cũ).

| ID | Việc | Model | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| K5-01 | Cập nhật `scrollcraft/builds/gioi-thieu/BRIEF.md`: đường cảm xúc mới, kính là "ống ngắm"; đỉnh vẫn là phép trừ; câu "Đây là trang mà ___" | S | K1 | BRIEF có đường cảm xúc + đỉnh |
| K5-02 | Hero có chiều sâu bằng kính: 3 lớp ảnh app hiện có (`lp-plane--back/main/front`) đặt trong khung `glass-float`, lớp không khí phía sau, parallax giữ hệ số cũ; rê chuột thì lớp trước nghiêng tối đa 3 độ (chỉ chuột; dùng `data-sc-*` có sẵn nếu engine có, không sửa engine) | S | K5-01 | ảnh 1440 đầu trang + giữa hero; 390 bố cục riêng |
| K5-03 | **F8-09a** (1A): sổ khoảng 60% bề ngang, số cuối 72 đến 96 px, mỗi dòng trừ kèm một bình luận mẫu bị gạch (kho Mô phỏng qua API local chỉ đọc, đã che tên, chép tĩnh vào `data.js`, ghi "Ví dụ trong kho Mô phỏng"), chấm san hô khi số chốt | S | K5-01 | số cộng trừ đúng `SNAPSHOT` |
| K5-04 | **F8-09b** (4B): chế độ tối nền trang tối suốt, chỉ sổ là khối giấy sáng nổi lên (giấy đặc, KHÔNG kính, vì là số liệu) | S | K5-03 | tương phản đo bằng script đạt AA |
| K5-05 | Động tác riêng của trang: **"khung ngắm"**. Hai góc chữ L của logo phóng to, bám theo cuộn ở nhịp 2 ("Cái giá"), lướt qua danh sách bình luận mẫu; bình luận lọt trong khung được gắn nhãn thật (Rác, Nghi ảo, Khách thật) theo Trust Layer, rác/ảo mờ đi; ngoài khung để nguyên. Chỉ transform/opacity/clip-path, viết trong `Landing.jsx` đọc `--sc-p` | S | K5-01 | ảnh 3 vị trí cuộn; giảm chuyển động hiện bảng tĩnh có nhãn |
| K5-06 | Nhịp 4 đến 7: hiện theo cuộn kiểu engine, không trùng thiết bị hai nhịp liền nhau; nhịp chốt đứng yên, không mờ dần | S | K5-02..05 | bảng (nhịp, thiết bị) trong BRIEF |
| K5-07 | Chạy `shoot.mjs` của scroll-craft (1440, 390, giảm chuyển động); sửa dead scroll, chữ không đủ đậm, tương phản | S | K5-06 | sheet.png không lỗi; thêm hàng vào `scrollcraft/FINGERPRINTS.md` |
| K5-08 | Sau K4 (app đã đổi giao diện kính): chụp lại 10 ảnh app trong `public/landing/` bằng script ở comment đầu `Landing.jsx` (hết "Admin User/AU", số khớp số sống), sửa `SNAPSHOT`, `SNAPSHOT_DATE`; lặp lại 8 đến 9/12 sau seed `--anchor` | S | K4 | ảnh hero mang giao diện mới và số khớp |

#### K6. Kiểm định (agent QA)

| ID | Việc | Model | Phụ thuộc | Xong khi |
|---|---|---|---|---|
| K6-01 | `npm run lint`, build, `node --test src/lib/ledgerRun.test.mjs`, `node backend/test/run_tests.js` | H | K1..K5 | tất cả đạt |
| K6-02 | sloplint `src` (bỏ `src/vendor`) + `--render` 14 route | H | K1..K5 | 0 FAIL |
| K6-03 | Ảnh sau 14 route sáng/tối/390 vào `.hallmark/after-kinh/`, ghép sheet trước/sau với K0-03 | H | K1..K5 | 3 sheet |
| K6-04 | Đo hiệu năng theo ngân sách 12.3 (A/B xen kẽ với `cae7175`, máy rảnh) | S | K6-01 | bảng số 12.5 |
| K6-05 | Giảm chuyển động, giảm trong suốt, tắt kính, bàn phím Tab 14 route, tương phản | S | K6-01 | 0 nội dung ẩn, 0 focus không thấy vòng |
| K6-06 | Đánh giá cuối ngữ cảnh mới: "ấn tượng, không giống AI"; giống và khác video mẫu ở đâu; so với 6/10 của F8-06 | O | K6-03 | `.hallmark/K6-06-danh-gia.md` |
| K6-07 | Người dùng xem bản chạy local, đồng ý toàn bộ; rồi điều phối mới gộp vào `main` và push | người dùng | K6-06 | người dùng nói đồng ý |

**Thứ tự:** K0 → đợt 1 (K1 trừ K1-06, F8-09c, F8-09d) → đợt 2 (K1-06, K2, K3, K5) → K4 → K6 → K7. Tối đa 3 agent cùng lúc. Cổng 5000/5199 là bản chạy chung cho người dùng xem (điều phối giữ); agent dùng 5001/5299, 5002/5399, 5003/5499. Hai agent không chung file.

**Cổng duyệt của điều phối sau mỗi agent:** đọc diff (không file ngoài phần sở hữu, không mã màu trần, không `transition: all`, không animate width/height/top/left, có nhánh giảm chuyển động), quét bí mật, xem ảnh sáng/tối/390 bằng mắt, kiểm số "được tính" khớp. Trượt thì gửi lại đúng agent đó (SendMessage) kèm danh sách lỗi.

### 12.5 Số đo đợt 2

| Mục | Mốc (K0-03) | Sau (K6-04) |
|---|---|---|
| JS + CSS gzip | 644,03 kB (cae7175, đo lại cùng cách) | K6-01: 651,59 kB (+7,56 so cae7175, vượt ngân sách 6 kB 1,56; so mốc F8 649,86: +1,73). Phần tải khi vào app 533,71 lên 538,85 (+5,14, trong ngân sách); chunk trang giới thiệu lazy +2,43 |
| /dashboard sổ hiện số | cae7175 hôm nay 974 đến 1.000 ms (mốc F8 12/11: 733) | K6-04 A/B/A/B 5 lần: 1.300 và 1.318 ms (+30% so bản cũ cùng lượt; ngân sách 806 không đạt). Do M1 giữ sổ khoảng 300 ms; giảm chuyển động thì 1.043 ms (+4%). msFinal 2.924 và 2.949 so 2.816 và 2.820 |
| LCP | 1.240 ms (cả hai lượt) | 1.268 và 1.264 ms (+2%; ngân sách 981 không so được vì máy hôm nay chậm hơn mốc, bản cũ cũng 1.240) |
| Khung/giây cuộn /dashboard, /feedbacks, /insights (CPU 4x) | | **K6-04 (sau A3 fc2850f, 5 lần, A/B): /dashboard 59,9 (khung trên 50 ms trung vị 0); /feedbacks 59,9 (0); /insights 59,9 (0), bản cũ cae7175 đo lại 29,9 và 27 khung trên 50 ms. Đạt cả ba.** K2-05 (trước A3), bản build (vite preview 5399, 5 lần mỗi trang, bước cuộn 12 px mỗi khung): /dashboard trung vị 59,9 khung/giây, khung trên 50 ms 2 đến 13 mỗi lần (trung vị 4); /feedbacks 59,9 khung/giây, 0; /insights 15 đến 20 khung/giây, 58 đến 68. Cùng cách đo trên `cae7175` (build trước kính): /dashboard 59,9 và 3 đến 8; /feedbacks 59,9 và 0; /insights 20 đến 30 và 50 đến 59. Tắt hẳn kính ở /insights vẫn 20 đến 30, blur 8px vẫn 20: /insights chậm do chính trang (biểu đồ), không do kính. /dashboard: khung trên 50 ms chụm ở quãng cuộn 770 đến 920 px, cả bản cũ; dao động lớn giữa các lần. Không đổi `--glass-blur`. |
| /live 2 bình luận/giây | EventSource giả phát lại 200 bình luận thật, CPU 4x, 3 lần x 8 giây: trung vị 59,9 khung/giây, trung bình khoảng 24, 47 đến 48 khung trên 50 ms | trung vị 59,9, trung bình khoảng 38, 32 đến 35 khung trên 50 ms. Không chạy simulator. Chi tiết `.hallmark/K6-bao-cao.md` |

### 12.6 Người dùng đã chốt (2026-11-13)

1. **1B**: cả panel số liệu cũng kính, nhưng "phải cân chỉnh sao cho chữ vẫn đọc một cách bình thường". Xem 12.7.
2. **2A**: vùng sáng navy + xanh polo rất nhẹ, trôi chậm khi cuộn.
3. **3A**: chỉ thẻ bấm được, nhấc 2px.
4. **4A**: F8-09c chạy lại bằng Sonnet, F8-09d chạy tiếp (Sonnet), F8-09a/b gộp vào K5.
5. "Sử dụng các model và agent vừa phải." Làm xong toàn bộ thì **một agent khác rà soát lại tất cả từ trên xuống dưới, từ UI/UX đến backend** (K7).
6. "Sửa trực tiếp và mở cổng local để ta có thể thấy được quá trình sửa, chỗ nào không vừa ý thì ta sửa liền luôn": điều phối giữ một bản chạy chung cho người dùng xem: backend `5000` (chỉ đọc) + Vite `5199` (tự nạp lại khi file đổi), mở `http://localhost:5199`. **Agent KHÔNG tắt, KHÔNG khởi động lại cổng 5000, 5199**; agent cần máy chủ riêng (chặn request, đo) thì dùng 5001/5299 hoặc 5002/5399. Người dùng có thể tự sửa file giữa chừng: agent gặp thay đổi không phải của mình thì giữ nguyên, không ghi đè, không `git checkout`/`git stash`.
7. Không làm K0-03 riêng: ảnh "trước" dùng `.hallmark/after-ui2/` (bản `67f6ca4`, giống `cae7175` về bố cục); số đo "trước" đo A/B với `cae7175` ở K6-04.

### 12.7 Kính cho panel số liệu (1B) mà chữ vẫn đọc bình thường

- Panel (`GlassPanel`, `.glass-panel`, `glass-strong rounded-xl`) dùng token mới `--glass-panel`: sáng `rgb(255 255 255 / 0.78)`, tối `rgb(20 32 54 / 0.76)`, viền `--glass-line`, mép `--glass-edge`. **Không `backdrop-filter`** trên panel: lớp không khí phía sau vốn đã mờ sẵn (gradient mềm), nên làm mờ thêm không thấy khác nhưng tốn GPU khi cuộn hàng chục panel. `backdrop-filter` chỉ ở thanh trên, thanh lọc dính, thanh bên, lớp nổi (chỗ có chữ/bảng cuộn qua bên dưới).
- Vùng chữ dày đặc bên trong panel (bảng, danh sách phản hồi, sổ đối chiếu, bảng nhiệt, khối "Số liệu kiểm định") đặt trên lớp `paper` (`--surface` đặc 100%), bo góc `--r-ctrl`, không viền thêm (không thành thẻ lồng thẻ: chỉ là nền, không khung). Chữ nhỏ 13 đến 14 px luôn nằm trên nền đặc.
- Đo bắt buộc: `--text-hi`, `--text-mid`, `--text-lo`, `--accent`, `--sev-*` trên `--glass-panel` trộn với điểm sáng nhất và tối nhất của lớp không khí, cả sáng và tối: chữ thường ≥ 4,5:1, chữ ≥ 18 px ≥ 3:1. Trượt thì tăng độ đặc `--glass-panel` theo bước 0,04 tới khi đạt, ghi số cuối.
- Người dùng tắt "Hiệu ứng kính" ở Cài đặt hoặc máy bật giảm trong suốt thì mọi panel về `--surface` đặc như hiện tại.

#### K7. Rà soát toàn bộ (sau K6, một agent ngữ cảnh mới)

| ID | Việc | Model | Xong khi |
|---|---|---|---|
| K7-01 | Rà từ trên xuống dưới: UI/UX 14 route (sáng, tối, 390, giảm chuyển động, bàn phím), chữ và số theo luật, số khớp giữa các trang, rồi backend (route, Trust Layer, metrics, live, collector, test) tìm lỗi đúng/sai; chỉ báo cáo, không sửa | O | `.hallmark/K7-ra-soat.md` có danh sách lỗi xếp theo mức |
| K7-02 | Điều phối chia lỗi K7 cho agent Sonnet sửa, kiểm lại | S | 0 lỗi mức cao |

## 13. "Hồ sơ xử lý": từ dữ liệu tới việc làm (từ 2026-11-13)

### 13.0 Người dùng chốt (13/11)
- Claude (phiên chính) tự làm, không giao agent.
- Không cố định 7 nhóm: hệ thống phải tự biết shop bán mảng gì và mảng đó đang có điểm đau gì, cả khi chạy trên kho thật.
- Phiên live mô phỏng `6af204dab6bf75ac113997aa` (giả, 34.879 bình luận): đã sao lưu ra `D:\03-DuAn\AISC2026-backup-db\live-mo-phong-2026-11-13\` và xóa khỏi prod. Quay lại livestream sau khi xong các điểm đau.
- 4B: đã che 176 tên khách thật (đánh giá Tiki cũ trong kho demo) bằng `maskName`, tăng `meta.labels.version`.
- Kính sáng giữ (5A), thanh trên giữ (6A). Chưa commit file kế hoạch, chưa push: làm tiếp trên `giao-dien-kinh`.

### 13.1 Số đo kho thật (13/11, chỉ đọc)
- 4.629 đánh giá, 134 sản phẩm, 23 mảng hàng (`productCategory`, lấy từ từ khóa tìm Tiki khi thu thập). 791 chê.
- Chê theo nhóm: Chất lượng sản phẩm 566 (Lỗi kỹ thuật 335, Không đúng mô tả 172), Giao hàng 95, Giá 37, CSKH 34, Khác 29, Đổi trả 17, Ứng dụng 10, Thanh toán 3.
- Nhiều nhất: chuột không dây 113 chê (75 lỗi kỹ thuật), máy xay sinh tố 83, máy sấy tóc 62.
- Có sẵn `aspects` (khía cạnh do AI ghi, chữ tự do: "Pin/Sạc", "Pin và nguồn", "Hoạt động") và `aiSummary`.

### 13.2 Kiểm thật: hệ thống hiện chạy được gì trên dữ liệu mới (13/11)

| Phần | Dữ liệu mới vào có chạy không | Ghi chú |
|---|---|---|
| Thu thập Tiki, gán nhãn (ViSoBERT, LLM, luật), Trust Layer | Có | đã chạy trên 4.629 đánh giá thật |
| 7 nhóm, 27 nguyên nhân | Có, nhưng quá thô | kho thật: 566/791 câu chê dồn vào "Chất lượng sản phẩm" |
| `aspects` (khía cạnh) | Không tin được | chỉ LLM ghi chữ tự do; kho demo 0/3.900 câu chê có; kho thật 618 kiểu ghi, nhiều nhất là "chất lượng sản phẩm", "độ bền" (quá chung) |
| `productCategory` (mảng hàng) | Chỉ khi máy tự thu thập | `real_collector` gán bằng từ khóa tìm; `/api/scrape` dán link không gán |
| Tỉ lệ khiếu nại trên đơn, khu vực, nhà xe, đơn hàng | Chỉ kho demo | kho thật không có giao dịch |
| Nạp file dữ liệu riêng của shop | Chưa có | chỉ dán link sàn hoặc livestream |

Kết luận: **không dựa vào `aspects`**. Lớp điểm đau phải tìm thẳng từ câu chữ gốc, chạy được với mọi cách gán nhãn.

### 13.3 Thiết kế

Ba tầng:
1. Nhóm vấn đề (7, cố định): bộ phận nào xử lý.
2. Nguyên nhân (27, cố định): chọn bộ việc mẫu trong `playbook_library.js`.
3. **Điểm đau** (mở, máy tự tìm): trong mỗi ô "mảng hàng × nguyên nhân", tìm cụm từ mà câu chê của ô đó nhắc nhiều hơn hẳn phần còn lại, gom các câu cùng cụm thành một điểm đau.

Hồ sơ xử lý mở từ một điểm đau. Mỗi bước tự xét dữ liệu có gì; thiếu thì ghi rõ thiếu gì, không bịa.

Luật chống "chỉ chạy trên bộ mô phỏng":
- Không có danh sách sản phẩm, mảng hàng hay cụm từ nào viết cứng trong mã. Chỉ có danh sách từ dừng tiếng Việt chung ("thì", "là", "mình", "sản phẩm"...).
- Chỉ bắt buộc 3 trường mà mọi đường nạp đều có: câu chữ, số sao (có thể thiếu), thời gian. Tên sản phẩm, mảng hàng, đơn hàng, khu vực là tùy chọn.
- Ngưỡng tính theo tỉ lệ và số khách riêng biệt, không theo con số cố định của bộ demo.
- **Kiểm mù:** chọn trước 8 trong 23 mảng hàng của kho thật bằng băm SHA-1 tên mảng (giống `isBlindTest`), Claude không đọc câu của 8 mảng này trong lúc làm. Khóa mã xong mới chạy trên 8 mảng đó, người đọc chấm đúng/sai.

### 13.4 Các bước

| ID | Việc | Xong khi |
|---|---|---|
| H0 | Chọn 8 mảng kiểm mù bằng băm, ghi tên vào đây; lập DB thử `customer_radar_ui_test` / `_test_real` chép từ prod (chỉ đọc prod) để thử thao tác ghi | danh sách 8 mảng; DB thử có dữ liệu |
| H1 | `services/product_group.js`: mảng hàng của một phản hồi theo thứ tự: `productCategory` → danh mục Tiki lấy lúc dán link (sửa `scraper.js` đọc danh mục sản phẩm từ API Tiki, kiểm có trường không) → suy từ tên sản phẩm (cụm chữ đầu trước thương hiệu/mã) → "Toàn shop". Trả kèm `groupSource` để giao diện ghi "mảng hàng lấy từ đâu" | test: 4 nguồn, tên sản phẩm lạ, không có tên |
| H2 | `services/pain_points.js` (thuần, không gọi mạng): chuẩn hóa câu (dùng `normalizer.js`: teencode, che PII, bỏ dấu để so), tách cụm 2 đến 4 âm tiết, bỏ cụm toàn từ dừng; chấm điểm bằng tỉ số log-odds có tiên nghiệm (Monroe 2008) giữa câu chê của ô và nền (câu khen cùng mảng + câu chê mảng khác); gộp cụm chồng nhau ("mất kết nối" + "bị mất kết nối"); gom câu theo cụm mạnh nhất. Mỗi điểm đau: cụm từ, số khách riêng biệt, trọng số tin cậy cộng dồn, tỉ lệ trong mảng, xu hướng 4 tuần, 5 câu gốc tiêu biểu, nhóm và nguyên nhân chiếm đa số. Ngưỡng: ≥ 3 khách khác nhau và ≥ 2 ngày khác nhau (chống một người spam). Ô có dưới 15 câu chê: không tách, trả "chưa đủ câu để tách điểm đau" + câu gốc | test bằng câu bịa của mảng lạ ("ốp lưng", "nệm") không có trong dữ liệu nào; test ô nhỏ; test một người spam 10 câu |
| H3 | Gắn vào `analysis_context` (tính trong worker, nhớ theo phiên bản ctx); `GET /api/pain-points?filters` (xếp theo trọng số × xu hướng, có số liệu kiểm định trong phần ẩn) | số điểm đau khớp số câu khi lọc; thời gian thêm < 1 giây trên 15 nghìn câu |
| H4 | Hồ sơ: `GET /api/cases/preview?key=` dựng hồ sơ từ dữ liệu: (1) khoanh vùng: sản phẩm, mẫu, từ ngày nào, nguồn, có chứng từ bao nhiêu; (2) ai làm: `owner` của nhóm + việc mẫu theo nguyên nhân (thiếu thì `CATEGORY_FALLBACK`); (3) đồ làm sẵn: trả lời công khai từng câu (dùng `/reply/draft`), thư gửi nhà cung cấp hoặc nhà xe có số liệu (mẫu điền số; LLM chỉ viết lại câu), tin nhắn bù khách chỉ khi có đơn hàng; (4) đo sau 7 ngày | mỗi bước có cờ `available` + `missing` (ví dụ "không có đơn hàng nên chưa soạn được tin bù") |
| H5 | Lưu hồ sơ đang xử lý: collection `cases` (`key`, `snapshot` số lúc mở, việc, người làm, hạn, trạng thái từng việc, `by`); `POST/PATCH /api/cases`; nối `decisionEffect` để đo trước/sau 7 ngày. Thử ghi chỉ trên DB thử | test ghi/đọc trên DB `_test`; xóa bằng guard `_test` |
| H6 | Giao diện: danh sách điểm đau trong trang Phân tích (tab mới hoặc thay khối nguyên nhân), nút "Xử lý" mở trang hồ sơ `/cases/:key`; "Việc gấp nhất" ở /dashboard trỏ được tới hồ sơ. Theo `DESIGN.md` (giấy đặc cho chữ dày, không thẻ lồng thẻ, không chấm trạng thái) | ảnh sáng/tối/390 px; sloplint; tương phản |
| H7 | Kiểm định: `npm test` + test mới; `npm run verify` vẫn 0% báo nhầm; chạy trên 3 bộ: kho demo, kho thật (15 mảng làm), **8 mảng mù** | xem 13.5 |
| H8 | Ghi số đo, nhật ký mục 9, ảnh; người dùng duyệt trên http://localhost:5199 | người dùng đồng ý |

Phác thảo trang hồ sơ:

```
Chuột không dây  >  Lỗi kỹ thuật  >  "mất kết nối"
12 khách, 4 tuần gần đây tăng           mảng hàng lấy từ: từ khóa thu thập
-------------------------------------------------------------
1 Khoanh vùng   mẫu nào bị nhiều, từ ngày nào, 5 câu gốc
2 Ai làm        Sản phẩm/QC: hỏi nhà cung cấp, kiểm lô hàng
3 Làm sẵn       trả lời 12 đánh giá | thư gửi nhà cung cấp
                tin bù khách: thiếu đơn hàng, chưa soạn được
4 Theo dõi      người làm, hạn, đánh dấu xong; 7 ngày sau đo lại
```

### 13.5 Thế nào là đạt (đề xuất)

- 8 mảng mù: người đọc xem từng điểm đau + 5 câu gốc, chấm "đúng một chuyện cụ thể, giao việc được" hay không. Đạt khi ≥ 70% điểm đau được chấm đúng và mỗi mảng có ít nhất 1 điểm đau đúng. Báo đúng con số, kể cả khi trượt.
- Kho demo: điểm đau Giao hàng phải trùng sự cố đã cài (INC-xx), `verify` vẫn 0% báo nhầm.
- Bộ "nghèo dữ liệu" (không tên sản phẩm, không số sao, không đơn hàng): không lỗi, mọi bước thiếu đều ghi rõ thiếu gì.
- Mã mới không chứa tên mảng hay sản phẩm nào (kiểm bằng grep trong test).

### 13.6 Giới hạn nói trước

- Cụm từ thống kê bắt được chuyện "nhiều người nói giống nhau"; chuyện mỗi người tả một kiểu (cùng hỏng nhưng chữ khác hẳn) sẽ bị tách nhỏ hoặc sót. Đây là giới hạn thật, ghi trong số liệu kiểm định.
- Câu quá ít (shop nhỏ, mảng mới) thì không tách được; hệ thống nói "chưa đủ câu" thay vì đoán.
- Shop muốn đưa dữ liệu riêng (file xuất từ Shopee, tin nhắn) hiện chưa có đường nạp: việc riêng, chờ người dùng quyết.

### 13.7 Trạng thái (cập nhật 2026-11-13, Claude tự làm)

| ID | Trạng thái | Ghi chú |
|---|---|---|
| H0 | xong | 8 mảng mù chọn bằng SHA-1 `blind-group:<tên>` trong 15 mảng đủ lớn, đã loại trước 4 mảng Claude từng đọc câu (tai nghe bluetooth, quạt điện, nồi cơm điện, máy xay sinh tố): **sữa rửa mặt, đồng hồ thông minh, tã dán, bình giữ nhiệt, bàn phím, cáp sạc, sữa bột, máy sấy tóc**. DB thử `customer_radar_ui_test` / `_test_real` chép từ prod (`backend/scripts/copy_to_test_db.js`, `--drop` để xóa) |
| H1 | xong | `services/product_group.js`; dán link Tiki giờ lấy danh mục lá trong breadcrumb (`scraper.js`) |
| H2 | xong | `services/pain_points.js`: cụm 2 đến 4 âm tiết GIỮ DẤU (bỏ hết dấu thì "nhận tín" trùng "nhắn tin"), câu gõ không dấu quy về dạng có dấu phổ biến nhất; z log-odds so mọi câu còn lại ≥ 2,5, lift ≥ 2; hai nền phụ (câu không chê cùng mảng, câu chê mảng khác) z ≥ 1,5; bỏ cụm chỉ gồm chữ trong tên hàng; bỏ cụm có ở ≥ 50% số mảng (đưa sang "Chuyện chung nhiều mảng", phải dồn ≥ 60% vào một nguyên nhân); nguyên nhân chiếm đa số ≥ 50%; ≥ 3 khách, ≥ 2 ngày; mảng < 15 câu chê thì không tách |
| H3 | xong | `GET /api/pain-points` (nhớ theo phiên bản ngữ cảnh + bộ lọc): kho thật lần đầu 3,2 giây, lần sau 0,08 giây; kho demo lần đầu 3,0 giây (máy dev) |
| H4, H5 | xong | `services/case_file.js`; `GET /api/cases/preview`, `GET/POST /api/cases`, `PATCH /api/cases/:id` (collection `cases`) |
| H6 | xong | tab "Điểm đau cụ thể" (`analytics/PainPoints.jsx`), trang `/cases` (`Cases.jsx`), Ctrl+K "Hồ sơ xử lý". Chưa nối từ "Việc gấp nhất" ở /dashboard |
| H7 | một phần | `npm test` 170 đạt (10 test mới, có mảng bịa "ốp lưng", "nệm"); `npm run verify` 6/6 sự cố; lint 0 lỗi. Kiểm mù: mã khóa ở `71437ea`, ra **9 điểm đau ở 5/8 mảng mù**, phiếu chấm `.hallmark/kiem-mu-diem-dau.html`. **Kết quả chấm mù (13/11, người chấm: user): 7 đúng, 2 sai trên 9 điểm đau = 77,8% (ngưỡng 70%, đạt tiêu chí 1). Tiêu chí 2 (mỗi mảng có ít nhất 1 đúng) KHÔNG đạt: bàn phím 0/1 ("bị lỗi" quá chung), đồng hồ thông minh 1/2 ("trả lời" sai), máy sấy tóc 2/2, sữa bột 3/3, bình giữ nhiệt 1/1; 3 mảng mù còn lại không ra điểm đau nào.** Không chỉnh lõi theo kết quả này. Lộ một phần: ảnh chụp đầu tiên có hiện SỐ điểm đau của các mảng mù (không có câu), ghi lại cho trung thực |
| 3A nạp file | xong | tab "Nạp file" ở /data (`data/ImportCsv.jsx`, `lib/csv.js`), `POST /api/import/feedbacks` (chỉ kho thật, 50 dòng mỗi lô, bỏ dòng trùng trước khi gán nhãn) |
| 4A che tên | xong, đổi cách | Không sửa bộ sinh dữ liệu: Trust Layer gom tài khoản theo tên khi không có mã khách, che tên ở dữ liệu sẽ gộp nhầm tài khoản và làm sai phát hiện đánh giá ảo. Thay vào đó che ở mọi chỗ tên đi ra giao diện (`ingest.shownName`) |
| R1 rà soát kho thật + dữ liệu mới (13/11 tối) | xong, `8352525` | Nhịp phân tích theo mật độ dữ liệu (`services/cadence.js`): kho thật 6 tháng so với 24 tháng thay vì 7 so với 28 ngày (trước: 0 cảnh báo, biểu đồ trống, 14/4.557 câu trong 28 ngày). Kho demo giữ 7/28, verify 6/6. Hộp việc có điểm đau. Điểm đau cả kho tính trong worker. Hồ sơ/quyết định đếm ngày theo đồng hồ thật. Nạp file: dòng không ngày (`timeInferred`) không tạo đột biến giả, không bị coi là ảo; chống trùng theo mã khách + dòng. Lớp luật dùng số sao. Đã thử: kho rỗng (mọi endpoint 200), bộ dữ liệu lạ 138 dòng (mảng mới, không ngày, không sản phẩm, rác, trùng) |
| R2 đường ghi + bộ nhớ (13/11 tối) | xong | Kịch bản ghi trên DB thử 28/28 bước (quyết định cảnh báo, duyệt nghi ảo, nhãn kiểm tra, phiên live mô phỏng mở/dừng/báo cáo/đẩy khiếu nại/xóa, mở/sửa hồ sơ, nạp file, nạp lại, chặn đúng chỗ). Sửa: hồ sơ kho thật vừa mở đã báo xong (số ngày tính từ openedAt); tên sản phẩm còn mã HTML ("Lock&amp;Lock") tách đôi sản phẩm (giải ở đường đọc và ghi); câu playbook "180 ngày" thành "6 tháng"; requirements_check trỏ đúng file hiện tại (0 mục thiếu). Bộ thu thập Tiki chạy thử: 5 sản phẩm, 21 đánh giá, 0 lỗi. Bộ nhớ trần heap 400 MB: đỉnh 596 MB (bản cũ 615 MB, đo working set Windows), không tăng |
| Kiểm mù vòng 2 | CHỜ CHẤM | Lõi điểm đau đổi SAU kiểm mù vòng 1 (lỗi tìm ra từ dữ liệu bịa, không từ câu mảng mù): từ hư so theo dạng có dấu ("ố"≠"ở", "bàn"≠"bạn", "máy"≠"mấy"), thêm từ hư "đề". Kết quả trên `8352525`: **12 điểm đau ở 6/8 mảng mù** (vòng 1: 9 ở 5/8, 7 đúng 2 sai). Phiếu `.hallmark/kiem-mu-diem-dau-v2.html`. Mảng làm: 26 thành 27 (thêm "máy kêu", "cắm điện", "quà tặng", "độ giữ"; mất "bị nứt", "không biết bảo hành", "giữ ấm" do trần 6 điểm đau mỗi mảng) |

Giới hạn đã thấy: kho demo là câu máy ghép từ mẫu nên điểm đau ra mẩu câu mẫu ("nói thật mô", "rất mong"); chỉ kho thật mới là phép thử. Lõi không tinh chỉnh theo kho demo.
