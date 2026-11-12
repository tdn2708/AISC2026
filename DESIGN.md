# Hệ thiết kế Customer Radar ("Sổ kiểm chứng", bảng màu B)

Hệ đã khóa (F1-06, 2026-11-12); đợt 2 "Sổ thật dưới lớp kính" (K1, 2026-11-13) thêm kính có kiềm chế. Mọi agent làm giao diện đọc file này trước, dùng đúng token và component ở đây, không tự đặt màu, cỡ chữ, bo góc hay thời lượng riêng. Muốn đổi thì sửa hệ (mục 10) chứ không vá tại chỗ. Nguồn sự thật là code: `src/index.css` (giá trị), `src/styles/tailwind.css` (tên lớp), `src/components/ui`, `src/components/motion`, `src/components/Logo.jsx`. File này khớp code ở commit F1-06; lệch nhau thì code đúng, sửa lại file này.

## 1. Nguyên tắc

| # | Nguyên tắc |
|---|---|
| 1 | Bản sắc nhóm: mực navy, nhấn xanh polo, đúng **một** điểm san hô mỗi màn (chấm logo). Còn lại là trắng, xám lam, viền 1px. |
| 2 | Số liệu nằm trên giấy đặc, kính là ống ngắm. Kính có kiềm chế ở lớp vỏ và lớp nổi (thanh trên, thanh bên, thanh lọc dính, popover, Ctrl+K, hộp thoại, ngăn kéo, trợ lý, toast); panel số liệu mờ một phần nhưng không làm mờ nền; bảng, danh sách, sổ, bảng nhiệt trên nền đặc (`paper`). Viền 1px; bóng luôn có lệch, không glow. Phía sau kính là lớp không khí rất nhẹ (navy, xanh polo; không san hô, không tím). Người dùng tắt "Hiệu ứng kính" hoặc máy bật giảm trong suốt thì về nền đặc. |
| 3 | Chữ ký duy nhất là **"phép trừ chạy"** (`LedgerRun`): thu thập trừ rác, nghi ảo, chờ duyệt, quá cũ, dừng đúng ở số được tính. Mọi thứ khác im lặng. |
| 4 | Chuyển động chỉ để kéo mắt vào chỗ vừa đổi hoặc con số quan trọng; tắt sạch khi giảm chuyển động. |
| 5 | Màu không bao giờ là tín hiệu duy nhất: mức độ luôn có chữ và biểu tượng đi kèm. |

## 2. Màu

### 2.1 Ba tầng token (`src/index.css`)

| Tầng | Ví dụ | Ai đọc |
|---|---|---|
| 1. Tham chiếu (không đổi theo chế độ) | `--navy-26 #13233F`, `--polo-52 #1F6FA8`, `--coral-68 #E66A78`, `--red-49`, `--amber-*`, `--green-*`, `--teal-*`, `--plum-*`, `--white`. Tên = họ màu + độ sáng OKLCH. | Chỉ tầng 2. Component KHÔNG đọc tầng này (grep `var(--navy` trong `src/components` phải rỗng). |
| 2. Ngữ nghĩa (một khối sáng `:root, [data-theme='light']`, một khối tối `[data-theme='dark']`) | `--canvas`, `--surface`, `--text-hi`, `--accent`, `--sev-crit`, `--viz-1` | Component và Tailwind. |
| 3. Component và bí danh (`:root, [data-theme]`) | `--logo-dot`, `--sidebar-bg`, `--glass-bg/strong/shade/blur`; vai trò Hallmark `--color-paper`, `--color-ink`... | `--glass-*` do các lớp `.glass`, `.glass-strong`, `.glass-panel`, `glass-chrome`, `glass-float` đọc. Khối `--color-paper...--font-body` chỉ cho công cụ hallmark (sloplint, theme.mjs) đo tương phản; app không đọc, nhưng giữ. |

Chế độ: `document.documentElement` mang `data-theme="light|dark"` (`hooks/useTheme.js`, lưu `localStorage['cr-theme']`). Một khối con đặt `data-theme='light'` thì hiện màu sáng giữa app tối (ô xem trước ở Cài đặt).

### 2.2 Bảng ngữ nghĩa sáng và tối (giá trị thật trong `index.css`)

| Token | Lớp Tailwind | Sáng | Tối | Dùng cho |
|---|---|---|---|---|
| `--canvas` | `bg-canvas` | `#F4F6F9` | `#0D1524` | nền trang |
| `--surface`, `--surface-solid` | `bg-surface` | `#FFFFFF` | `#142036` | panel, ô nhập, lớp nổi |
| `--surface-side` | (qua `--sidebar-bg`) | `#FFFFFF` | `#111C30` | thanh bên |
| `--raised` | `bg-raised` | navy 5% | trắng 6% | rê chuột, nền nhạt trong panel |
| `--sheet`, `--sheet-rule` | `bg-(--sheet)` | `#F7F8FB`, `#D7DDE7` | `#18263E`, trắng 10% | tờ sổ đối chiếu |
| `--border` | `border-line` | `#D7DDE7` | trắng 13% | viền bề mặt |
| `--border-soft` | `border-line-soft` | `#E6EAF1` | trắng 8% | kẻ dòng trong panel |
| `--border-field` | `border-field` | `#76839A` (3,83:1) | `#7E8CA3` | viền ô nhập, rãnh công tắc tắt |
| `--scrim` | `bg-(--scrim)` | navy 32% | `rgb(4 8 16 / 0.60)` | lớp phủ sau hộp thoại |
| `--text-hi` | `text-ink-hi` | `#13233F` (15,67:1) | `#E8EDF5` | chữ chính, nét logo |
| `--text-mid` | `text-ink-mid` | `#36465F` (9,55:1) | `#BAC5D4` | chữ phụ |
| `--text-lo` | `text-ink-lo` | `#56647A` (6:1) | `#97A5B9` | chú thích, trục biểu đồ |
| `--accent` | `bg-accent`, `text-accent` | `#1F6FA8` (5,39:1) | `#8CCBEB` | nút chính, liên kết, focus |
| `--accent-hi` | `text-accent-hi`, `bg-accent-hi` | `#185A8A` | `#B6DFF3` | chữ nhấn trên nền nhấn nhạt, nút chính khi rê |
| `--accent-dim` | `bg-accent-dim` | polo 10% | polo-81 14% | trạng thái đang chọn |
| `--on-accent` | `text-on-accent` | `#FFFFFF` | `#0B1F33` | chữ trên nền nhấn |
| `--strip-bg` | `bg-strip` | `#13233F` | `#1C2E4D` | khối mực duy nhất (đăng nhập, câu tóm tắt) |
| `--on-strip`, `-mid`, `-lo` | `text-on-strip`, `-mid`, `-lo` | trắng, trắng 75%, trắng 62% | như sáng | chữ trên khối mực |
| `--accent-on-strip` | đổi token cục bộ: `style={{ '--accent': 'var(--accent-on-strip)' }}` | `#8CCBEB` | `#8CCBEB` | nhấn trên khối mực (khối mực cũng đặt `'--text-hi': 'var(--on-strip)'`, xem `Login.jsx`) |
| `--coral` | `bg-coral` (chưa ai dùng) | `#E66A78` | `#E66A78` | chỉ đồ họa thương hiệu, xem 2.3 |
| `--blush`, `--sky` | `bg-blush/45`, `bg-sky/45` | `#F2C6CC`, `#A9D3EC` | `#8A3F52`, `#3A6F96` | nền huy hiệu nguồn dữ liệu (chữ `text-ink-hi`) |
| `--shadow-knob` | `shadow-(--shadow-knob)` | `0 1px 3px` navy 25% | nền đen 45% | núm công tắc |
| `--shadow-overlay` | `shadow-(--shadow-overlay)` | `0 6px 16px -6px` navy 22% | nền đen 65% | lớp nổi không phải kính (hiện chưa ai dùng; giữ làm dự phòng) |
| `--shadow-float` | `shadow-(--shadow-float)` | `0 10px 30px -14px` navy 28% | `0 12px 32px -14px` đen 60% | lớp kính nổi (đã nằm trong `glass-float`); có lệch xuống, không glow |
| `--glass-tint` | (qua `glass-chrome`) | trắng 78% (K1-08 chỉnh, đo lại sau khi tăng lớp không khí; 12.3 ghi 66%) | `rgb(20 32 54)` 62% | nền thanh trên, thanh bên, thanh lọc dính |
| `--glass-tint-strong` | (qua `glass-float`) | trắng 82% | `rgb(20 32 54)` 80% | nền lớp nổi có chữ dày |
| `--glass-panel` | (qua `glass`, `glass-strong`, `.glass-panel`, `GlassPanel`) | trắng 78% | `rgb(20 32 54)` 76% | nền panel số liệu, không backdrop-filter |
| `--glass-line` | `border-(--glass-line)` | navy 10% | trắng 12% | viền 1px của mọi bề mặt kính |
| `--glass-edge` | (trong `box-shadow` của lớp kính) | `inset 0 1px 0` trắng 70% | `inset 0 1px 0` trắng 8% | vệt sáng mép trên, như cạnh kính |
| `--glass-blur` | (qua `glass-chrome`, `glass-float`) | 16px | 16px | điện thoại (dưới 768px) 8px; luôn kèm `saturate(140%)` |
| `--atmos-a`, `-b`, `-c` | (qua `.atmos`) | polo-52 30%, polo-81 40%, navy-26 10% | polo-52 38%, polo-81 14%, navy-17 50% (K1-08 chỉnh, mức tối đa được duyệt; 12.3 ghi 10, 6, 14 và 16, 8, 40) | ba vùng sáng của lớp không khí |

### 2.3 Luật san hô

`--coral #E66A78` chỉ là **đồ họa**: chấm logo (`--logo-dot`) và tối đa một điểm nhấn mỗi màn. Không cho chữ (3,14:1 trên trắng), không cho trạng thái hay cảnh báo, không cho chuỗi biểu đồ, không cho nút, và **không mang nghĩa "xấu"**. Màu xấu ở tối lệch về cam đỏ (`#FF9A80`) để xa san hô.

### 2.4 Màu trạng thái (chỉ cho mức độ)

| Vai | Token | Lớp | Sáng | Tối |
|---|---|---|---|---|
| Xấu, nghiêm trọng | `--sev-crit` (+ `--sev-crit-dim`) | `text-crit`, `bg-crit/12`, `border-crit` | `#A3303D` (6,89:1) | `#FF9A80` |
| Cao | `--sev-high` (+ `-dim`) | `text-high`, `bg-high/12` | `#A84D06` | `#F0A860` |
| Chú ý | `--sev-med` | `text-med`, `bg-med/12` | `#875200` (6,49:1) | `#E6D27E` |
| Thấp | `--sev-low` | qua `lib/format.js` `severityOf` | `#56647A` | `#97A5B9` |
| Tốt | `--sev-ok` (+ `-dim`) | `text-ok`, `bg-ok/12` | `#1D6A46` (6,56:1) | `#7FCB9E` |
| Chữ trên huy hiệu đỏ đặc | `--on-crit` | `text-on-crit` | `#FFFFFF` | `#0B1F33` |

Nền nhạt trạng thái viết `bg-crit/12` (đúng 12%); viền báo động của panel là `GlassPanel glow="crit|high"` (đổi màu viền /35, không bóng).

### 2.5 Biểu đồ

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `--viz-neg`, `--viz-neu`, `--viz-pos` | `#A3303D`, `#6B7A90`, `#2B7FB8` | `#FF9A80`, `#AEB8C6`, `#7DB8E8` | cảm xúc tiêu cực, trung tính, tích cực (lớp `bg-neg`, `bg-neu`, `bg-pos`, `text-neg`...) |
| `--viz-grid` | navy 8% | trắng 8% | lưới |
| `--viz-1` đến `--viz-6` | `#1F6FA8`, `#A3303D`, `#0F8A7A`, `#C26E12`, `#733160`, `#6B7A90` | `#7DB8E8`, `#FF9A80`, `#4FD1B8`, `#E8B84A`, `#B0679A`, `#AEB8C6` | chuỗi phân loại theo thứ tự; `viz-2` chỉ cho chuỗi mang nghĩa xấu; `viz-6` xám cho nhóm "Khác". Lớp `bg-viz-1..6`. |
| `--viz-support`, `--viz-oppose` | bộ ba số `240 166 75`, `43 163 199` | như sáng | dùng `rgb(var(--viz-support) / a)` ở phần giải thích mô hình |

Mọi màu chuỗi đạt 3:1 trên bề mặt và nền trang ở cả hai chế độ. `viz-2, 3, 5, 6` hiện chưa trang nào dùng nhưng được giữ cho F6.

### 2.6 Đọc token trong JS và bản in

| Chỗ | Cách |
|---|---|
| Recharts, SVG trong app | truyền thẳng chuỗi `'var(--viz-1)'`, `'var(--text-lo)'`; tắt hiệu ứng Recharts (`isAnimationActive={false}`) khi bọc `ChartReveal` |
| Trục biểu đồ | `AXIS_TICK` (`{ fontSize: 13, fill: 'var(--text-lo)' }`) và `CHART_FONT = 13` ở `src/lib/tokens.js` |
| Chỗ bắt buộc chuỗi màu (meta theme-color, thư viện đòi hex) | `readToken('--canvas')` ở `src/lib/tokens.js` |
| Bản in PDF (html2canvas không đọc biến CSS trong SVG) | hằng `REPORT` và `REPORT_VARS` (`--r-paper`, `--r-ink`, `--r-ink2`, `--r-ink3`, `--r-rule`, `--r-rule-soft`, `--r-tint`, `--r-brand`, `--r-brand-soft`, `--r-brand-ink`, `--r-on-ink`, `--r-on-ink-muted`, `--r-bad`, `--r-good`, `--r-warn`, `--r-desk`) ở `src/components/report_kit.jsx`, đọc bởi `components/report/report.css`. Giá trị phải trùng tầng tham chiếu; đổi màu ở `index.css` thì đổi cả đây. Bản in luôn nền sáng. |
| Đo tương phản | `node .hallmark/contrast-F1.mjs` (app, sáng và tối, 134 cặp) và `--print` (bản in, 19 cặp). Thư mục `.hallmark/` bị gitignore, chỉ có trên máy này. Chuẩn: chữ 4,5:1, chữ lớn và đồ họa 3:1. |

## 3. Chữ

| Mục | Luật |
|---|---|
| Họ chữ | Be Vietnam Pro 400, 500, 600, 700 (`--font-sans`, nạp từ Google Fonts ở đầu `index.css`). Một họ cho cả tiêu đề và thân. |
| Số | `tabular-nums` cho mọi cột số, số đếm. `.font-mono` và `.data-num` cũ = chữ chính + tabular-nums, không phải font đơn cách. |
| Font đơn cách | Chỉ `.font-code` (`--font-code`, 0,92em) cho chuỗi thống kê z, p, n trong "Số liệu kiểm định". |
| Dòng | thân 1,6; tiêu đề h1 đến h5 1,3, giãn chữ -0,015em, `text-wrap: balance`. |
| Nhãn | viết thường, chỉ hoa chữ đầu câu, không giãn chữ (lớp `eyebrow`: 13px, 500, `--text-mid`). |
| Cấm | `text-[...rem]`, `text-[...px]`, chữ dưới 13px. CSS thuần dùng `--fs-xs` 13, `--fs-sm` 14, `--fs-base` 16 (phải khớp thang dưới). |

Thang 6 bậc (`@theme` trong `tailwind.css`):

| Lớp | Cỡ | Dòng | Dùng cho |
|---|---|---|---|
| `text-xs` | 13px | 18px | chú thích, nhãn, huy hiệu, trục biểu đồ |
| `text-sm` | 14px | 20px | thân trong bảng, thẻ, mô tả |
| `text-base` | 16px | 24px | tiêu đề một dòng việc, đoạn đọc chính |
| `text-heading` | 18px | 1,4 | tiêu đề panel, section |
| `text-display` | 26px | 1,25 | tiêu đề trang, câu tóm tắt, số trong `Stat` |
| `text-metric` | 32px | 1 | con số chính của một chỉ số |
| `text-cover` | 2,6rem | 1,12 | **chỉ** tiêu đề khối mực ở đăng nhập (trang giới thiệu có thang riêng trong `landing.css`) |

## 4. Bo góc, bóng, khoảng cách, lớp

| Token | Giá trị | Lớp | Dùng cho |
|---|---|---|---|
| `--r-ctrl` | 6px | `rounded-ctrl` (cũ: `rounded`, `-sm`, `-md`, `-lg` ra cùng 6px) | nút, ô nhập, chip, huy hiệu, khối bên trong panel |
| `--r-surf` | 10px | `rounded-surf` (cũ: `rounded-xl`, `-2xl` ra 10px) | panel, hộp thoại, ngăn kéo, popover, toast |
| tròn | | `rounded-full` | công tắc, ảnh đại diện, thanh tiến độ |
| `--r-mark` | 2px | `rounded-xs` | dấu dữ liệu: ô màu chú giải, vạch thanh bằng chứng |

Lồng nhau thì trong nhỏ hơn ngoài: nút trong `Segmented` dùng `rounded-[calc(var(--r-ctrl)-2px)]` (4px).

Bóng: ba bậc, `--shadow-knob`, `--shadow-overlay` và `--shadow-float` (bảng 2.2); bóng nào cũng có lệch, không glow. Panel số liệu không bóng ngoài, chỉ vệt sáng mép trên `--glass-edge`.

Khoảng cách: component dùng thang Tailwind gốc 4px. Thực tế đang dùng: đệm panel `p-5` hoặc `p-6` (điện thoại `p-4 sm:p-5`), khoảng giữa phần tử `gap-1.5`, `gap-2`, `gap-3`, giữa khối `gap-4`, `gap-6`. CSS thuần trong `index.css` dùng `--space-3xs` 2, `--space-2xs` 4, `--space-xs` 8, `--space-sm` 12, `--space-md` 16, `--space-lg` 24, `--space-xl` 40 (px).

Khung: `--sidebar-w` 240px, `--sidebar-w-collapsed` 72px, `--shell-gap` 0. Vùng cuộn của app là `main.main-content`, không phải document. Điểm gãy: 640, 768, 1024px (Tailwind `sm`, `md`, `lg`).

### Kính (K1, 2026-11-13)

| Lớp (`tailwind.css`, `@utility`) | Nền | Backdrop-filter | Dùng cho |
|---|---|---|---|
| `glass-chrome` | `--glass-tint`, viền `--glass-line`, mép `--glass-edge` | `blur(var(--glass-blur)) saturate(140%)` | thanh trên, thanh bên, thanh lọc dính |
| `glass-float` | `--glass-tint-strong`, viền, mép, `--shadow-float` | như trên | Popover, Modal, Drawer, Toast, Ctrl+K, trợ lý, ChartTooltip |
| `glass`, `glass-strong`, `.glass-panel`, `GlassPanel` | `--glass-panel`, viền, mép | KHÔNG | panel số liệu (nhiều panel cuộn cùng lúc: blur tốn GPU, mà lớp không khí vốn đã mềm) |
| `paper` | `--surface-solid` đặc 100%, bo `--r-ctrl`, không viền, không bóng | không | vùng chữ dày trong panel kính: bảng, danh sách phản hồi, sổ đối chiếu, bảng nhiệt, "Số liệu kiểm định". Chữ 13 đến 14px luôn nằm trên nền đặc. Chỉ là nền, không thành thẻ lồng thẻ. |

Ba nhánh dự phòng cho mọi lớp kính: trình duyệt không có `backdrop-filter` (`@supports not`) thì `glass-chrome`, `glass-float` nền `--surface-solid`; `prefers-reduced-transparency: reduce` thì mọi lớp kính về `--surface-solid` và lớp không khí ẩn; `[data-glass='off']` (Cài đặt, `applyGlass` trong `hooks/useTheme.js`) làm đúng như vậy. Thanh bên cũng về nền đặc khi tắt kính. Vì `utilities.css` được import không qua `@layer`, các khối dự phòng phải đứng sau khối `@utility` trong `tailwind.css`.

Lớp không khí: `AppAtmosphere` (`components/shell/AppAtmosphere.jsx`), gắn trong `MainLayout` của `App.jsx` (vùng app, không ở `/`). Một `div.atmos` `position: fixed`, `z-index: -1`, `pointer-events: none`, ba vùng tròn 48 đến 60vw `radial-gradient` rất nhẹ. Bố cục `data-atmos="dashboard|data|work|quiet"` lấy theo route trong bảng `ATMOS_BY_ROUTE` của component (dashboard; insights, analytics, risk là data; feedbacks, live, data là work; trust, reports, settings, lab là quiet). Trôi chậm theo cuộn của `main.main-content` (tối đa 6vh) bằng timeline có tên `--app-scroll` (`html { timeline-scope }` và `main.main-content { scroll-timeline }`), không phải `scroll(nearest)`, vì phần tử `fixed` không coi `main` là tổ tiên cuộn. Trình duyệt không hỗ trợ hoặc giảm chuyển động thì đứng yên.

Chữ trên kính đo ở `node .hallmark/contrast-K1.mjs`: chữ `--text-hi/mid/lo`, `--accent`, `--sev-*` trên `--glass-panel`, `--glass-tint`, `--glass-tint-strong` chồng lên điểm sáng nhất và tối nhất của lớp không khí và lên `--surface`, có và không có ô `bg-crit/12` bên dưới, cả sáng và tối: 208 cặp, 0 trượt 4,5:1 (thấp nhất 4,56:1, `--accent` trên `--glass-panel` và `--glass-tint` sáng ở chỗ tối nhất có ô đỏ). Đổi một độ đặc kính thì chạy lại; trượt thì tăng độ đặc theo bước 0,04.

Lớp chồng (giá trị thật): thanh trên `z-[120]`, popover `z-[150]`, phủ thanh bên 990, thanh bên 1000, Modal và Drawer `z-[2000]`, Toast `z-[2100]`.

## 5. Chuyển động

Token (`index.css`; bản JS cùng số `MOTION`, `EASE`, `STAGGER_STEP` ở `components/motion/tokens.js`, đổi một bên thì đổi bên kia):

| Token | Giá trị | Lớp Tailwind | Dùng cho |
|---|---|---|---|
| `--motion-instant` | 0ms | `duration-instant` | giảm chuyển động |
| `--motion-micro` | 120ms | `duration-micro`, `delay-micro` | đổi màu nút, tick ô chọn |
| `--motion-short` | 220ms | `duration-short`, `delay-short` | mở menu, chip lọc, tooltip |
| `--motion-medium` | 420ms | `duration-medium` | ngăn kéo, đổi tab, chuyển trang |
| `--motion-long` | 900ms | `duration-long` | vẽ biểu đồ, đếm số lớn, `BarGrow`, `Pulse` |
| `--motion-story` | 1600ms | `duration-story` | phép trừ chạy (cả chuỗi) |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-out` | vào |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | `ease-in` | ra (ra chạy bằng 60 đến 75% vào) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | `ease-in-out` | đổi trạng thái |
| `--ease-spring` | `linear()` lò xo vượt khoảng 4% (trình duyệt cũ: `cubic-bezier(0.34, 1.4, 0.64, 1)`) | `ease-spring` | số "chốt" vào vị trí |

Lớp có sẵn: `animate-pop-in` (lớp nổi mở), `animate-fade-up` (lớp phủ), `animate-fade-in` (vùng nội dung khi không có View Transitions), `animate-settle` và `.motion-settle` (nhịp chốt), `animate-grow-x` (cũ, thay bằng `BarGrow`), `animate-skeleton` (khung xương đang tải thở bằng opacity 1 xuống 0,45, `--motion-story`, lặp qua lại; keyframe `skeleton` ở `tailwind.css`, giảm chuyển động thì `animation: none`, đứng yên), `keep-motion` (vòng xoay đang tải vẫn quay khi giảm chuyển động).

API (import từ `src/components/motion`, `AnimatedNumber` từ `src/components/ui`; demo ở `/ui-kit`). Dùng, không viết lại:

| Thành phần | Prop | Ghi chú |
|---|---|---|
| `LedgerRun` | `ledger, evidence?, mode='auto'\|'scroll', progress=0..1, duration=1600, title, showLink=true, play=true, onDone, className` | chữ ký. `ledger` nhận nguyên `/trust/health` hoặc dạng phẳng `{raw, spam, inauthentic, pendingNotCounted, pendingCounted, aged, counted}`; số cuối luôn bằng `countedForMetrics`. `play={false}` hiện ngay số cuối như giảm chuyển động. Chỉ `/dashboard` chạy, và chỉ lần đầu mỗi phiên trình duyệt (`sessionStorage` khóa `cr-ledger-run`); `/login` và `/trust` luôn `play={false}`. Hàm thuần `src/lib/ledgerRun.js`. |
| `AnimatedNumber` | `value, from=0, decimals=0, signed, unit, unitClassName, className, duration=700, settle=true` | đếm khi vào khung nhìn, chốt nhẹ ở cuối |
| `ChartReveal` | `as='div', threshold=0.3, className` | mở biểu đồ bằng `clip-path` từ trái, một lần, `--motion-long` |
| `BarGrow` | `value 0..1, grow=true, start?, className` | chỉ phần tô, `scaleX`; rãnh do trang vẽ (`overflow-hidden`) |
| `Pulse` | `trigger, as='div', className` | một nhịp nền `--accent-dim` mỗi khi `trigger` đổi; thay chấm trạng thái |
| `Stagger` | `as='div', active=false, runKey, step=40` | lệch nhịp chỉ sau thao tác, không khi tải trang; tối đa 12 dòng |
| `RouteTransition` | | View Transitions khi bấm liên kết nội bộ; `navigate()` từ code rơi về `animate-fade-in` |
| `useReducedMotion()`, `prefersReducedMotion()` | | nơi duy nhất đọc media query bằng JS |
| `useInView(ref, { threshold=0.25, rootMargin, enabled })` | | trả true một lần; không có IntersectionObserver thì coi như đã thấy |
| `Skeleton`, `SkeletonLines`, `SkeletonBlock` (`src/components/ui/Skeleton.jsx`) | `className, as` / `lines, lineClassName` / `label, as` | khung xương theo đúng hình nội dung sắp về, thay chữ "Đang tải"; `SkeletonBlock` đặt `role="status"`, `aria-busy` và câu ẩn cho trình đọc màn hình. Mỗi khối dữ liệu có đủ: đang tải (khung xương), rỗng (`EmptyState`), lỗi (`EmptyState variant="error"` + nút thử lại), đủ. |

Luật:

| # | Luật |
|---|---|
| 1 | Chỉ animate `transform`, `opacity`, `clip-path`. Transition màu (`background-color`, `color`, `border-color`) trong `duration-micro` cho trạng thái nút là được. Không `transition: all`, không animate width, height, top, left. |
| 2 | Luôn có nhánh `prefers-reduced-motion: reduce`: khối cuối `index.css` đưa mọi `--motion-*` về 0 và kết thúc mọi animation ngay. Trạng thái mặc định của mọi lớp chuyển động là "đã hiện đủ"; JS chỉ thêm trạng thái chờ khi sắp chạy, nên tắt JS vẫn thấy nội dung. |
| 3 | Tối đa **một** màn vào trang có dàn dựng mỗi trang (M1). Được thêm (đã duyệt, kế hoạch 12.2): **một kiểu duy nhất** hiện theo cuộn cho khối nằm dưới màn đầu (M2, `reveal`); thẻ bấm được nhấc 2px khi rê, chỉ thiết bị có chuột (M4, `lift`). Không được: mỗi khối một kiểu riêng, nảy, xoay, phóng to quá 2%, hover nhún trên thẻ không bấm được. Hai lớp này do K3 viết (chưa có khi K1 xong); lớp không khí trôi theo cuộn của K1 thuộc cùng luật. |
| 4 | Chuyển động do người thao tác (mở, gập, lọc, xác nhận) thì khuyến khích. |
| 5 | Không thư viện animation lớn (framer-motion, GSAP). CSS, hook tự viết, Web Animations API, View Transitions. Riêng trang giới thiệu dùng engine `src/vendor/scrollcraft` chép nguyên, không sửa. |

## 6. Component (`src/components/ui`)

| Thành phần | API | Luật |
|---|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger\|link`, `size: sm 32\|md 40\|lg 48`, `icon`, `iconRight`, `loading`, `block`, `pressed`, `as` | một nút chính mỗi vùng thao tác; `lg` chỉ ở trang giới thiệu; `outline`, `soft` cũ ra `secondary`; đang tải giữ chữ, thay biểu tượng bằng vòng xoay `keep-motion` |
| `IconButton` | `icon`, `label` (bắt buộc), `variant: glass\|ghost\|danger\|primary`, `size: 'sm' 32\|'md' 40\|số px`, `pressed`, `loading`, `badge` | luôn có `label` cho trình đọc màn hình |
| `Popover` | `as`, `className` | bề mặt chung `OVERLAY_SURFACE` (`glass-float rounded-surf`: kính nổi, `--shadow-float`), `z-[150]`, `animate-pop-in`; chỗ đặt và cách đóng do nơi gọi giữ |
| `MenuItem` | `active`, `icon`, `hint` | đang chọn: nền `accent-dim` + dấu tích |
| `ChartTooltip` | `title`, `children` | truyền vào `content` của Recharts Tooltip; số tabular-nums |
| `Modal` | `open, onClose, title, description, icon, tone: accent\|crit\|ok, children, footer, size: sm\|md\|lg` | `glass-float` trên `Backdrop` (`--scrim` và `blur(3px)`); câu hỏi ngắn, xác nhận; `tone="crit"` cho thao tác không hoàn tác. Thay `window.confirm/alert`. |
| `Drawer` | `open, onClose, title, subtitle, children, footer, width=520` | `glass-float`; xem chi tiết bên phải |
| `Backdrop` | `onClose` | lớp phủ `--scrim` dùng chung của Modal, Drawer |
| `Toast` | `show`, `tone: ok\|crit`, `children` | `glass-float`; báo kết quả; lỗi dùng `tone="crit"` (không mở hộp thoại) |
| `Chip`, `ChipGroup` | `active, onClick, icon, count` / `options, value, onChange, label` | lọc nhanh, 32px |
| `Segmented` | `options, value, onChange, label, size: sm\|md` | đổi chế độ xem trong một panel |
| `Tabs` | `tabs, value, onChange` | đổi khu vực trang, gạch chân; đồng bộ `?tab=` |
| `SELECTED` | `'border-accent bg-accent-dim text-accent-hi'` | một ngôn ngữ "đang chọn" cho Chip, Segmented, MenuItem, nút `pressed`. Tô đặc nhấn chỉ cho nút chính. |
| `fieldClass({ size: sm\|md, error, multiline })` | | diện mạo ô nhập cho ô tự dựng; `TextField`, `TextArea`, `Select` dùng sẵn. Lỗi luôn có chữ, không chỉ đổi viền. |
| `Switch`, `Checkbox`, `RadioCards` | | `Switch` là role switch thật |
| `Badge` | `tone: neutral\|accent\|crit\|high\|med\|ok\|blush\|sky`, `icon`, `mono` | huy hiệu chữ nhỏ; mức độ dùng `SeverityBadge level` (màu + biểu tượng + chữ) |
| `GlassPanel` | `as, tone: soft\|strong, glow: null\|crit\|high` | bề mặt duy nhất cho panel số liệu: nền `--glass-panel` mờ một phần, viền 1px, mép sáng, `rounded-surf`, không backdrop-filter. Chữ nhỏ dày đặc đặt trong khối `paper` đặc. Không thẻ lồng thẻ: bên trong panel chia bằng hàng kẻ (`border-line-soft`), `Stat` (kẻ trên, không khung) |
| `paper` (lớp CSS) | `className="paper p-3"` | nền đặc cho vùng chữ dày trong panel kính (mục 4, Kính); demo ở `/ui-kit`, mục Kính |
| Khác | `PageHeader`, `PanelHeader`, `SectionLabel`, `Stat`, `ProgressBar`, `Stepper`, `EmptyState`, `Pager`, `EvidenceBar` | trạng thái rỗng dùng `EmptyState` |

Trạng thái mọi control (xem `/ui-kit`, 8 trạng thái): mặc định, rê (đổi một bước màu, chỉ trên thiết bị có chuột), nhấn (lún 1px, tức thì), focus-visible (viền ngoài 2px `--accent`, cách 2px, hiện ngay; ô nhập lõm vào trong), tắt (mờ 55%, con trỏ cấm, `disabled` thật), đang tải (`aria-busy`), lỗi (chữ), đã chọn (`SELECTED`, `aria-pressed`).

## 7. Logo A2 "khung ngắm" (`src/components/Logo.jsx`)

| Mục | Giá trị |
|---|---|
| SVG | `viewBox="0 0 16 16"`; `path d="M2.5 6.5V13.5H6.5 M13.5 9.5V2.5H9.5"`, `fill="none"`, `stroke-width="3"`, `stroke-linecap="round"`, `stroke-linejoin="miter"`; `circle cx="8" cy="8" r="2"` |
| Màu | nét `var(--text-hi)` của nền đang đứng (navy trên sáng, trắng trên tối và khối mực); chấm `var(--logo-dot)` = san hô. Không nền, không vòng tròn, không gradient. |
| API | `LogoMark({ size=28, title, colors={ ink, dot } })`; `Logo({ size: sm\|md\|lg, showTagline, tagline, markSize })`; `LogoWordmark`. Chữ "Customer Radar" một màu `text-ink-hi`. |
| Cỡ | `Logo` sm 24, md 30, lg 44; thanh bên gập `LogoMark size={28}`; thanh bên mở `Logo size="sm"`; đăng nhập `Logo size="md"`; trang giới thiệu 26; bìa PDF 24 với `colors={{ ink: REPORT.logoInk, dot: REPORT.logoDot }}` (hex vì html2canvas); `/ui-kit` 56; favicon `public/favicon.svg`. |

## 8. Chữ và số trong giao diện

| Mục | Luật |
|---|---|
| Số | kiểu Việt: 2,45%; 14.128; tỉ lệ dưới 1% giữ 2 chữ số (0,04%) |
| Khoảng | viết "20 đến 30" |
| Ô trống | hiện "—" |
| Thuật ngữ | không z, p, EWMA trong chữ cho quản lý; chỉ trong "Số liệu kiểm định" (`font-code`) |
| Từ cho chủ shop | "Có chứng từ", "AI đoán", "Đã mua thật", "Khách không hài lòng", "Độ tin số liệu" |
| Ngôn ngữ | giao diện, comment, commit tiếng Việt |
| Số khớp | số trên sổ đối chiếu bằng số "được tính" ở mọi trang; không bịa số, lời khen, logo khách hàng |

**Danh sách cấm** (chép đúng mục 2 kế hoạch): không dùng dấu "·" nối chuỗi, mũi tên "→" dán vào chữ hay nút, nhãn IN HOA hay giãn chữ, chữ "tuyệt đối", emoji, chấm tròn trạng thái trang trí, **vòng tròn, đồng hồ đo, biểu đồ donut, vòng radar quét**, thẻ lồng thẻ, sọc màu bên trái thẻ, gradient tím sang xanh, chữ gradient, bóng phát sáng.

## 9. Thêm token hay component mới thì sao

| Bước | Việc |
|---|---|
| 1 | Tìm trong file này trước; gần đúng thì dùng cái có sẵn. Không mã màu trần, không `text-[..]`, không bo góc hay thời lượng tự đặt trong component. |
| 2 | Màu mới: thêm giá trị thô ở tầng 1 (`--họ-độsáng`), vai ở tầng 2 **cả khối sáng và khối tối**, rồi ánh xạ lớp trong `@theme inline` của `tailwind.css` (`--color-ten: var(--vai)`). Token riêng một thành phần ở tầng 3. |
| 3 | Đo tương phản: thêm cặp vào `.hallmark/contrast-F1.mjs` (sáng và tối; bản in thì `--print` và `REPORT`), đạt 4,5:1 chữ, 3:1 đồ họa; ghi số vào khối chú thích đầu `index.css`. |
| 4 | Chuyển động mới: dùng `--motion-*`, `--ease-*`; có nhánh giảm chuyển động; cập nhật `components/motion/tokens.js` nếu đổi số. |
| 5 | Component mới: đặt ở `src/components/ui` hoặc `motion`, xuất qua `index.js`, thêm đủ 8 trạng thái vào `/ui-kit`. |
| 6 | Cập nhật file này trong cùng commit. Token không còn ai dùng thì xóa (cách đếm và danh sách đã xóa ở F1-06: `.hallmark/F1-06-token-xoa.md`). |
| 7 | Kiểm: `npm run lint`, `npm run build`, `node C:/Users/DELL/.claude/skills/hallmark/scripts/sloplint.mjs src --genre modern-minimal --scope app` (bỏ kết quả `src/vendor`), ảnh sáng, tối, 390px. |
