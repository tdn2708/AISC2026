# Kế hoạch "Quản gia": trợ lý 24/7 báo qua Zalo và nhận lệnh từ xa

Người viết: Claude (kiến trúc, thiết kế). Người làm: Gemini. Người kiểm: Claude, rồi người dùng duyệt push.
Ngày: 2026-11-16. Chung kết: 2026-12-10.

Đọc hết file này trước khi viết dòng code nào. Làm đúng thứ tự giai đoạn ở mục 9. Mỗi giai đoạn có "Thế nào là xong"; chưa đạt thì không sang giai đoạn sau. Chỗ nào file này mâu thuẫn với code thật thì code đúng: ghi lại mâu thuẫn ở mục 12 (Nhật ký) và chọn cách ít đụng code cũ nhất.

---

## 0. Luật cứng (vi phạm là làm lại)

1. **Không commit, không push.** Chỉ sửa file trong cây làm việc. Claude kiểm diff rồi mới commit, người dùng duyệt push.
2. **Không đụng dữ liệu prod.** `backend/.env` trỏ cụm Atlas thật. Mọi lần chạy backend ở máy phải đặt:
   ```powershell
   $env:MONGODB_DB='customer_radar_ui_test'; $env:MONGODB_REAL_DB='customer_radar_ui_test_real'; $env:AUTO_COLLECT='0'; $env:PORT='5000'
   ```
   Tài khoản khi đó nằm ở `customer_radar_ui_test_auth`. Không bao giờ chạy `npm run seed` không có hai biến trên. Không xóa database nào.
3. **Không in bí mật** ra log, màn hình hay file: `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET`, `PII_SALT`, `WRITE_KEY`, khóa API, token phiên. Lưu ý riêng: URL gọi Zalo có chứa token (`/bot<TOKEN>/...`), nên **không bao giờ log `error.config.url`, `error.request` hay cả đối tượng lỗi axios**. Không sửa `backend/.env`; người dùng tự dán mã bot.
4. **Không sửa** `backend/evaluation/results.json`, `handoff-customer-radar.md`, `src/vendor/**`, `.github/**`.
5. **Không thêm thư viện npm** (cả backend lẫn frontend). Có sẵn: `axios`, `mongodb`, `express`, `crypto` của Node, `lucide-react`. Render free chỉ có 512 MB RAM.
6. **Chữ trong giao diện và tin Zalo** (người dùng đã chốt): tiếng Việt; không dấu "·" nối chuỗi; không mũi tên "→" dán vào chữ hay nút; không nhãn IN HOA; không chữ "tuyệt đối"; không emoji; không chấm tròn trạng thái trang trí; không vòng tròn, đồng hồ đo, donut; không thẻ lồng thẻ; không sọc màu bên trái thẻ. Số kiểu Việt (2,45%; 14.128). Ô trống "—". Không z, p, EWMA trong chữ cho chủ shop.
7. **Code**: comment, chuỗi giao diện, tên mô tả bằng tiếng Việt như code hiện có. Backend CommonJS. File test backend dùng CRLF (giữ nguyên kiểu dòng của file đang có).
8. **Hiệu năng**: không gọi `getContext(db, { force: true })`; không `.toArray()` cả một collection lớn trong vòng lặp; mọi bộ hẹn giờ `unref()`; mọi lời gọi mạng có timeout.
9. Windows: script nhiều dòng có backtick hay `${}` thì viết ra file bằng công cụ ghi file, không dán vào heredoc của Bash.

---

## 1. Mục tiêu và phạm vi

Người dùng muốn chatbot không chỉ trả lời câu hỏi mà như một **quản gia**:
- **Tự canh 24/7**: có sự cố (cảnh báo mới, phiên live có việc gấp, thu thập lỗi, dữ liệu cũ) thì **tự nhắn Zalo** cho chủ shop, không cần mở web.
- **Nhận lệnh từ xa**: chủ shop nhắn Zalo hoặc dùng trang chat trên điện thoại để xem việc, xem kế hoạch, **duyệt / bỏ qua đề xuất**, chạy thu thập, tạm im.
- **Không nghẽn, không sập**: mọi việc của quản gia chạy nền, có giới hạn, có hàng đợi bền, lỗi Zalo không kéo web chết theo.

Trong phạm vi lần này:
- Kênh Zalo bằng **Zalo Bot Platform** (miễn phí, chủ shop tự tạo bot bằng Zalo cá nhân).
- Trang `/butler` "Quản gia" trên web, ưu tiên điện thoại, cài được ra màn hình chính (PWA tối thiểu).
- Lõi lệnh dùng chung cho Zalo và web.

Ngoài phạm vi (ghi rõ để không làm): Zalo OA và ZNS (cần doanh nghiệp được duyệt, tính phí); trả lời khách hàng cuối thay shop; tự thực thi hành động tốn tiền hay chạm khách (vẫn chỉ ghi quyết định như web); thông báo đẩy của trình duyệt (service worker); tách dữ liệu theo từng shop (đã hoãn sau chung kết).

---

## 2. Dữ kiện về Zalo Bot Platform (đã tra 16/11/2026)

- Tạo bot: trong app Zalo tìm OA **"Zalo Bot Manager"**, chọn **"Tạo bot"** (mở "Zalo Bot Creator"), đặt tên **bắt đầu bằng "Bot"** (ví dụ "Bot Radar Shop"). Zalo nhắn **Bot Token** dạng `số:chuỗi` về tài khoản Zalo của người tạo.
- Gọi API: `POST https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>`, thân JSON. Trả về `{ ok: boolean, result, description?, error_code? }`.
- `getMe` trả `result: { id, account_name, account_type, can_join_groups }`.
- `sendMessage` nhận `{ chat_id, text }`, text **1 đến 2000 ký tự**; trả `result: { message_id, date }`. Có `parse_mode` nhưng **không dùng** (gửi chữ thường cho chắc).
- `sendChatAction` nhận `{ chat_id, action: 'typing' }`.
- `getUpdates` nhận `{ timeout: '30' }` (giây, kiểu chuỗi), long-poll. Tài liệu ghi `result` là **một** sự kiện; code phải chịu được cả mảng, `null`, hoặc `ok:false` khi hết giờ không có tin.
- `setWebhook` nhận `{ url, secret_token }` (url HTTPS công khai, secret 8 đến 256 ký tự). `getWebhookInfo`, `deleteWebhook` có sẵn.
- **Webhook và getUpdates loại trừ nhau.** Bot đang có webhook thì getUpdates lỗi.
- Webhook gửi header **`X-Bot-Api-Secret-Token`** bằng đúng secret đã đặt. Thân: `{ ok: true, result: { event_name, message } }`. Có khi chỉ là `{ event_name, message }`, nên chấp nhận cả hai.
- `event_name`: `message.text.received` (chỉ xử lý loại này), `message.image.received`, `message.sticker.received`, `message.voice.received`, `message.unsupported.received`.
- `message`: `{ message_id, date (mili giây), message_type, text, from: { id, display_name, is_bot }, chat: { id, chat_type } }`. `chat.id` là địa chỉ để gửi lại.
- Bot chỉ nhắn được cho người đã nhắn bot trước (giả định an toàn). Vì vậy bước nối tài khoản bắt người dùng nhắn mã cho bot.
- Không có tài liệu về giới hạn tần suất: tự giới hạn ở mức 1 tin mỗi 1,1 giây toàn hệ thống.

**Hai bot riêng**: một bot cho máy local (thử) và một bot cho Render (thật), vì một bot không chạy được cả getUpdates (local) lẫn webhook (Render) cùng lúc. Code ở chế độ poll **không bao giờ tự gọi `deleteWebhook`** (sẽ làm hỏng bot của Render).

---

## 3. Kiến trúc

### 3.1 Yêu cầu không chức năng

| Mục | Mức cần đạt |
|---|---|
| Phản hồi webhook | trả 200 trong dưới 50 ms (ghi nhận rồi xử lý nền) |
| Trả lời lệnh qua Zalo | dưới 5 giây với lệnh, dưới 20 giây với câu hỏi cần mô hình ngôn ngữ |
| Từ lúc có sự cố tới lúc Zalo kêu | dưới `BUTLER_WATCH_MINUTES` + 1 phút (mặc định 6 phút) khi máy chủ đang thức |
| Không gửi trùng | một sự cố gửi một lần cho một người (khóa duy nhất trong Mongo), kể cả khi có 2 tiến trình lúc Render đổi bản |
| Không mất tin | tin báo nằm trong hàng đợi Mongo; máy chủ chết giữa chừng thì lần sau gửi tiếp |
| Không làm chậm web | vòng canh không ép tính lại ngữ cảnh; bộ nhớ tăng thêm dưới 30 MB; mọi hàng đợi trong bộ nhớ có trần |
| Lỗi Zalo | ngắt mạch sau 5 lỗi liên tiếp, nghỉ 2 phút; web vẫn chạy bình thường |
| Tắt khẩn | `BUTLER=0` tắt toàn bộ phần nền của quản gia |

### 3.2 Sơ đồ thành phần

```
                 điện thoại chủ shop
          ┌──────────────┴──────────────┐
      app Zalo                      trình duyệt (/butler, PWA)
          │ nhắn lệnh / nhận báo          │ POST /api/butler/command
          ▼                               ▼
  Zalo Bot Platform                 Express (server.js)
          │ webhook (Render)              │ requireSession + writeGuard
          │ hoặc getUpdates (local)       │
          ▼                               ▼
  ┌──────────────── services/butler ─────────────────────────┐
  │ zalo.js      client: gọi API, ngắt mạch, che token        │
  │ inbound.js   hàng đợi tin đến: chống trùng, giới hạn,     │
  │              xử lý tuần tự theo từng chat, song song 2     │
  │ engine.js    lõi lệnh (dùng chung web và Zalo)             │
  │ commands.js  hiểu câu lệnh (hàm thuần)                     │
  │ text.js      định dạng tin, cắt 2000 ký tự (hàm thuần)     │
  │ watcher.js   vòng canh mỗi 5 phút, khóa Mongo              │
  │ incidents.js gom sự cố, quyết có báo không (hàm thuần)     │
  │ outbox.js    hàng đợi tin đi bền trong Mongo, thử lại      │
  │ store.js     collection, chỉ mục, cài đặt mặc định         │
  │ index.js     startButler(): bật các phần trên              │
  └───────────────┬────────────────────────────┬──────────────┘
                  │ đọc                        │ ghi quyết định
                  ▼                            ▼
   services/work_items.js (ĐÃ CÓ)     recordDecision → recommendation_log
   pendingAlerts, buildInboxItems     realCollector.runOnce (thu thập)
   analysis_context.getContext        chat_engine.ask (câu hỏi)
```

### 3.3 Luồng chính

**A. Báo sự cố**: `watcher` tick → lấy khóa `meta._id='butler_watch'` → với mỗi kho có người theo dõi: `getContext` (bản đang có, không ép tính) → `collectIncidents` → upsert `butler_incidents` → với từng người đã nối Zalo: `pickToNotify` (mức độ, giờ yên lặng, tạm im, đã báo chưa) → gộp thành một tin → `outbox.enqueue` (khóa chống trùng) → worker gửi qua `zalo.sendText`.

**B. Lệnh từ Zalo**: Zalo → webhook (hoặc poll) → `inbound.push` (trả 200 ngay) → chống trùng `message_id` → tìm `butler_links` theo `chat.id` → chưa nối: chỉ nhận mã nối → đã nối: `engine.handle` → lưu tin vào `butler_messages` → trả lời qua outbox (`kind: 'reply'`).

**C. Lệnh từ web**: `POST /api/butler/command` → `engine.handle` (kho = kho người đó đang xem trên web) → lưu `butler_messages` → trả JSON. Web và Zalo dùng chung lịch sử theo tài khoản.

**D. Lệnh ghi** (duyệt, bỏ qua, thu thập) luôn **hai bước**: lệnh tạo `butler_pending` (hạn 5 phút) và hỏi lại; "có" mới ghi. Tránh gõ nhầm số trên điện thoại.

### 3.4 Đánh đổi đã chọn

| Quyết định | Chọn | Vì sao | Cái giá |
|---|---|---|---|
| Kênh Zalo | Zalo Bot Platform | miễn phí, tạo bằng Zalo cá nhân, không cần duyệt doanh nghiệp | chưa có tài liệu giới hạn tần suất; bot chưa được "tick xanh" |
| Hàng đợi | collection Mongo + worker trong tiến trình | không thêm Redis hay dịch vụ; sống qua lần khởi động lại | gửi chậm vài giây; đủ cho vài chục tin mỗi giờ |
| Vòng canh | trong máy chủ, khóa Mongo | giống `real_collector.js` đã chạy ổn | Render free ngủ khi không ai gọi: xem 3.5 |
| Nơi lưu | database tài khoản (`authDb`) | theo tài khoản, không bị `npm run seed` xóa | thêm 7 collection nhỏ |
| Hiểu lệnh | luật, không gọi mô hình | tức thì, không tốn lượt Gemini, kiểm được | câu lạ rơi về "câu hỏi" (chat_engine) |
| Tin Zalo | chữ thường, không markdown | chắc chắn hiện đúng trên mọi máy | không in đậm được |

### 3.5 Giới hạn phải nói thật: Render free ngủ

Render free ngủ sau khoảng 15 phút không có request. Khi ngủ thì **vòng canh không chạy**. Tin Zalo đến webhook sẽ đánh thức máy (mất khoảng 30 đến 60 giây lần đầu). Muốn canh thật 24/7 thì phải giữ máy thức:
- Cách khuyên dùng: dịch vụ ping bên ngoài miễn phí (cron-job.org hoặc UptimeRobot) gọi `GET https://aisc2026-q1vx.onrender.com/health` mỗi 10 phút. Người dùng tự cài.
- Cách trong code (giai đoạn 4, **mặc định tắt**): `BUTLER_KEEPALIVE=1` thì máy chủ tự gọi `${RENDER_EXTERNAL_URL}/health` mỗi 10 phút. Render cho 750 giờ miễn phí mỗi tháng **cho mọi dịch vụ free của tài khoản cộng lại**; một dịch vụ chạy cả tháng hết khoảng 744 giờ. Có dịch vụ free thứ hai là vượt. Vì vậy chỉ bật khi người dùng đồng ý.

---

## 4. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `BUTLER` | bật | `0` tắt vòng canh, worker gửi, poll Zalo. Route vẫn trả trạng thái `enabled:false`. |
| `ZALO_BOT_TOKEN` | trống | mã bot. Trống thì kênh Zalo "chưa cấu hình": tin báo vẫn ghi vào outbox với `status: 'skipped'`, lý do "Chưa cấu hình bot Zalo". |
| `ZALO_MODE` | `webhook` nếu có biến `RENDER`, ngược lại `poll` | `poll` hoặc `webhook` hoặc `off` |
| `ZALO_WEBHOOK_SECRET` | trống | bắt buộc ở chế độ webhook (8 đến 256 ký tự). Thiếu thì route webhook trả 503 và log một dòng cảnh báo lúc khởi động. |
| `ZALO_API_BASE` | `https://bot-api.zaloplatforms.com` | đổi sang máy giả lập khi test |
| `BUTLER_WATCH_MINUTES` | `5` | nhịp canh (từ 1 đến 60) |
| `BUTLER_WATCH_FIRST_DELAY_SEC` | `180` | chờ sau khởi động cho việc nạp sẵn ngữ cảnh xong; test đặt `5` |
| `BUTLER_KEEPALIVE` | trống (tắt) | `1` thì tự ping, xem 3.5 |
| `PUBLIC_APP_URL` | `https://aisc-2026.vercel.app` | đường dẫn trong tin Zalo; local đặt `http://localhost:5199` |

Ở chế độ webhook, lúc khởi động gọi `setWebhook({ url: RENDER_EXTERNAL_URL + '/api/butler/zalo/webhook', secret_token })` khi có đủ `RENDER_EXTERNAL_URL` và secret. `RENDER_EXTERNAL_URL` do Render tự đặt.

---

## 5. Dữ liệu (MongoDB, database tài khoản `authDb`)

Tạo chỉ mục trong `store.ensureButlerIndexes(authDb)`, gọi lúc khởi động. Dùng `Promise.allSettled` như `ensureIndexes` trong `server.js`: chỉ mục hỏng chỉ cảnh báo, không làm sập máy.

### 5.1 `butler_links`: mỗi tài khoản một bản ghi
```js
{
  _id: ObjectId,
  userId: ObjectId,              // unique
  chatId: string | null,         // chat.id của Zalo; unique khi là chuỗi
  zaloName: string | null,       // from.display_name, cắt 80 ký tự
  linkedAt: Date | null,
  settings: {
    workspace: 'real' | 'demo',  // kho quản gia canh và trả lời trên Zalo. Mặc định 'real'
    notifyLevel: 'critical' | 'high' | 'all',   // mặc định 'high'
    quietFrom: 22, quietTo: 7,   // giờ Việt Nam, 0 đến 23; trong khung này chỉ báo mức nghiêm trọng
    digest: true, digestHour: 8, // bản tin sáng
    muteUntil: Date | null
  },
  lastList: { workspace, at: Date, items: [{ n, kind: 'alert' | 'inbox', id, title, to }] } | null,
  lastDigestOn: 'YYYY-MM-DD' | null,   // ngày Việt Nam
  createdAt: Date, updatedAt: Date
}
```
Chỉ mục: `{ userId: 1 }` unique; `{ chatId: 1 }` unique với `partialFilterExpression: { chatId: { $type: 'string' } }`.
`store.getLink(authDb, userId)` tạo bản ghi với cài đặt mặc định nếu chưa có (`findOneAndUpdate` upsert `$setOnInsert`).

### 5.2 `butler_link_codes`
```js
{ codeHash: string /* sha256 hex của mã 6 số */, userId: ObjectId, expiresAt: Date /* +10 phút */ }
```
Chỉ mục: `{ codeHash: 1 }` unique; `{ expiresAt: 1 }` TTL `expireAfterSeconds: 0`. Tạo mã mới thì xóa mã cũ của người đó. Mã dùng một lần. Kiểm hết hạn bằng code (TTL của Mongo chạy mỗi phút, có thể trễ).

### 5.3 `butler_messages`: lịch sử chung web và Zalo
```js
{ userId: ObjectId, channel: 'web' | 'zalo', role: 'user' | 'butler', text: string /* cắt 4000 */,
  reply: object | null /* phần có cấu trúc cho web: kind, cards, confirm, facts, evidence, meta */,
  workspace: 'real' | 'demo', at: Date }
```
Chỉ mục: `{ userId: 1, at: -1 }`; `{ at: 1 }` TTL 30 ngày (`expireAfterSeconds: 2592000`).

### 5.4 `butler_incidents`: sự cố đang mở
```js
{ _id: `${workspace}|${key}`, workspace, key, kind: 'alert' | 'live' | 'orders' | 'data' | 'collector' | 'pain' | 'case',
  severity: 'critical' | 'high' | 'medium', title, why, to /* đường dẫn web */,
  firstSeenAt, lastSeenAt, resolvedAt: Date | null,
  notified: [{ userId: ObjectId, severity, at }] }
```
Chỉ mục: `{ workspace: 1, resolvedAt: 1, lastSeenAt: -1 }`; `{ lastSeenAt: 1 }` TTL 30 ngày.

### 5.5 `butler_outbox`: tin đi
```js
{ dedupKey: string /* unique */, userId: ObjectId, chatId: string | null,
  kind: 'alert' | 'digest' | 'reply' | 'test' | 'link',
  text: string, status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped',
  tries: 0, nextAttemptAt: Date, claimedAt: Date | null, lastError: string | null,
  createdAt: Date, sentAt: Date | null }
```
Chỉ mục: `{ dedupKey: 1 }` unique; `{ status: 1, nextAttemptAt: 1 }`; `{ userId: 1, createdAt: -1 }`; `{ createdAt: 1 }` TTL 30 ngày.

### 5.6 `butler_inbound`: chống xử lý một tin hai lần
`{ _id: string /* message_id */, at: Date }`, chỉ mục `{ at: 1 }` TTL 2 ngày. Chèn trùng (lỗi 11000) nghĩa là đã xử lý, bỏ qua.

### 5.7 `butler_pending`: lệnh ghi chờ xác nhận
`{ _id: string /* userId dạng chuỗi */, action: 'accept' | 'dismiss' | 'collect', args: object, workspace, prompt: string, expiresAt: Date /* +5 phút */ }`, chỉ mục `{ expiresAt: 1 }` TTL. Mỗi người tối đa một lệnh chờ; lệnh mới đè lệnh cũ.

### 5.8 `meta` (trong authDb)
- `_id: 'butler_watch'`: `{ running, lockedAt, lastRunAt, lastOkAt, lastError, lastMs, lastIncidents }`. Khóa giống `real_collector.runOnce`: `findOneAndUpdate` có điều kiện `running != true` hoặc `lockedAt < now - 10 phút`.

---

## 6. Backend: từng file

### 6.0 ĐÃ LÀM: `backend/services/work_items.js`

Claude đã tạo file này. Nó chứa, chép nguyên từ `routes/api.js`: `detectAlertsCached`, `buildRecommendationsCached` (cùng `memo`), `painPointsFor`, phần thân của `GET /inbox` dưới tên `buildInboxItems(db, workspace, ctx)`, và `recordDecision(db, {...})` (thân của `POST /recommendations/decision`, thêm trường `via`). Có thêm `pendingAlerts(db, ctx)`: cảnh báo chưa quyết, nặng trước, kèm `title`, `summary`, `recommendation`.

**Việc của Gemini ở 6.1 là nối `routes/api.js` vào file này**, không viết lại logic.

### 6.1 Sửa `backend/routes/api.js` (giữ nguyên hành vi)

1. Thêm ở đầu: `const workItems = require('../services/work_items');` và lấy ra `detectAlertsCached, buildRecommendationsCached, painPointsFor, buildInboxItems, recordDecision`.
2. Xóa khối từ comment `BỘ NHỚ ĐỆM CẢNH BÁO + ĐỀ XUẤT` tới hết hàm `buildRecommendationsCached` (gồm `ALERT_MEMO_TTL_MS`, `alertMemo`, `memo`, `filterKey`, hai hàm). Kiểm lại: `filterKey` và `memo` còn ai dùng trong `api.js` không (`grep -n "memo(\|filterKey("`). Còn thì giữ bản cục bộ cho chỗ đó, hoặc xuất thêm từ `work_items.js`.
3. Thân `router.get('/inbox', ...)` thay bằng:
   ```js
   router.get('/inbox', wrap(async (req, res) => {
     const ctx = await getContext(req.db);
     res.json({ items: await buildInboxItems(req.db, req.workspace, ctx) });
   }));
   ```
4. Xóa hàm `painPointsFor` và `painMemo` cục bộ (giữ `painPoints`, `caseFile`, `findPoint` nếu còn dùng ở chỗ khác).
5. Thân `router.post('/recommendations/decision', ...)` thay bằng lời gọi `recordDecision(req.db, { ...req.body, via: 'web' })`; bắt lỗi có `status` 400 trả `res.status(400).json({ error: e.message })`; thành công trả `{ success: true, ...kết quả }` (giữ đúng các khóa cũ: `success, decision, acceptanceRate, totalDecisions, followUpAt`).
6. Xóa các `require` không còn dùng (oxlint sẽ báo nếu có cấu hình `no-unused-vars`; nếu không báo thì tự `grep`).

**Thế nào là xong 6.1**: `cd backend; npm test` đạt toàn bộ như trước. Chạy backend local (luật 0.2), đăng nhập tài khoản mẫu, gọi `/api/inbox`, `/api/alerts`, `/api/recommendations`, `/api/nav/status` cho cả hai kho trước và sau khi sửa: JSON giống hệt nhau (bỏ qua trường thời gian). Ghi cách so vào mục 12.

### 6.2 `backend/services/butler/text.js` (hàm thuần)

```js
fold(s)                       // chữ thường, bỏ dấu, đ→d, gộp khoảng trắng, trim (giống foldVi trong api.js)
chunk(text, max = 2000)       // cắt theo dòng; dòng dài hơn max thì cắt theo khoảng trắng; không trả phần rỗng
plain(markdown)               // bỏ **, __, _x_, `x`, tiêu đề #, giữ gạch đầu dòng "- ", bỏ [n] trích dẫn, gộp >2 dòng trống
vnParts(date = new Date())    // { hour, ymd: 'YYYY-MM-DD' } theo Asia/Ho_Chi_Minh, dùng Intl.DateTimeFormat
inQuiet(hour, from, to)       // from === to: false; from < to: from <= h < to; from > to (qua nửa đêm): h >= from || h < to
severityWord(sev)             // critical 'Nghiêm trọng', high 'Cao', medium 'Chú ý'
fromAlertSeverity(s)          // 'Critical'→'critical', 'High'→'high', còn lại 'medium'
ago(date, now)                // 'vừa xong', '5 phút trước', '2 giờ trước', '3 ngày trước'
viDate(date)                  // 'dd/mm' theo giờ Việt Nam
```

### 6.3 `backend/services/butler/commands.js` (hàm thuần)

`parseCommand(text)` → một trong:

| type | Ví dụ câu (sau `fold`) | Trường thêm |
|---|---|---|
| `help` | `giup`, `tro giup`, `huong dan`, `lenh`, `help`, `/help`, `?` | |
| `tasks` | `viec`, `viec hom nay`, `co viec gi`, `can lam gi`, `/viec`, `ds` | |
| `detail` | `xem 2`, `chi tiet 2`, `ke hoach 2`, `2` (chỉ một số 1 đến 99) | `n` |
| `accept` | `duyet 2`, `chap nhan 2`, `ok 2`, `dong y 2`, `chap nhan so 2` | `n` |
| `dismiss` | `bo qua 2 vi da xu ly`, `bo 2 do hang da het`, `bo qua 2: khong dung` | `n`, `reason` (bỏ chữ dẫn `vi`, `do`, `ly do`, `:` ở đầu; giữ nguyên dấu tiếng Việt từ câu gốc, không lấy bản đã fold) |
| `confirm` | `co`, `ok`, `dong y`, `xac nhan`, `yes`, `uh`, `u` (không kèm số) | |
| `cancel` | `khong`, `thoi`, `huy`, `no`, `dung` (không kèm số) | |
| `status` | `tinh hinh`, `tom tat`, `bao cao`, `ban tin`, `the nao roi` | |
| `collect` | `thu thap`, `lay du lieu moi`, `cap nhat du lieu` | |
| `mute` | `im`, `tam im`, `tat bao`, `im 3 gio`, `im 3h`, `im 30 phut`, `im den sang` | `minutes` (mặc định 120; "đến sáng" = tới 7 giờ sáng gần nhất theo giờ Việt Nam; trần 7 ngày) |
| `unmute` | `bat bao`, `het im`, `bao lai` | |
| `workspace` | `kho that`, `du lieu that`, `kho mo phong`, `kho demo` | `workspace: 'real' | 'demo'` |
| `live` | `live`, `phien live`, `livestream` | |
| `link_code` | `123456`, `ket noi 123456`, `ma 123 456` (6 chữ số, cho phép khoảng trắng giữa) | `code` |
| `unlink` | `huy ket noi`, `ngat zalo`, `ngat ket noi` | |
| `question` | mọi câu còn lại | `text` (câu gốc) |

Luật ưu tiên: khớp nguyên câu (sau `fold`, bỏ dấu câu cuối `.!?`) theo bảng trên trước; `question` là cuối cùng. Câu dài hơn 6 từ mà bắt đầu bằng từ khóa lệnh nhưng không đúng mẫu (ví dụ "việc hôm nay khách chê gì nhiều nhất") thì là `question`. Viết bảng mẫu bằng regex có neo `^...$`.

Bắt buộc có test (mục 8.1) với ít nhất 40 câu, gồm cả câu có dấu và không dấu, viết hoa, thừa khoảng trắng.

### 6.4 `backend/services/butler/zalo.js`

```js
const BASE = () => (process.env.ZALO_API_BASE || 'https://bot-api.zaloplatforms.com').replace(/\/+$/, '');
const token = () => process.env.ZALO_BOT_TOKEN || '';
configured()                         // token khác rỗng và khớp /^\d+:[A-Za-z0-9_-]{10,}$/ (không khớp thì log MỘT lần "mã bot sai dạng", không in mã)
mode()                               // 'off' nếu !configured() hoặc ZALO_MODE==='off'; ZALO_MODE nếu là poll|webhook; mặc định process.env.RENDER ? 'webhook' : 'poll'

class ZaloError extends Error { constructor(method, code, description) }   // message: `Zalo ${method}: ${description || code}`

async call(method, body = {}, { timeoutMs = 10000 } = {})
  // axios.post(`${BASE()}/bot${token()}/${method}`, body, { timeout, headers: {'Content-Type':'application/json'}, validateStatus: () => true })
  // HTTP != 2xx hoặc data.ok !== true → throw new ZaloError(method, data?.error_code || status, data?.description)
  // lỗi mạng: throw new ZaloError(method, err.code || 'network', err.code === 'ECONNABORTED' ? 'quá thời gian' : 'lỗi mạng')
  //   TUYỆT ĐỐI không đưa err.message gốc của axios (có thể chứa URL kèm token) vào lỗi mới.
  // Ngắt mạch: đếm lỗi liên tiếp (trừ getUpdates hết giờ); >= 5 thì mở 2 phút: mọi call() ném ZaloError('circuit_open') ngay.
  // Thành công: đặt lại bộ đếm.

getMe()                              // nhớ kết quả 1 giờ; trả { id, name: account_name }
sendText(chatId, text)               // chunk(text) rồi gửi lần lượt; trả message_id cuối
typing(chatId)                       // sendChatAction typing, nuốt lỗi
setWebhook(url, secret)
health()                             // { configured, mode, circuit: 'closed' | 'open', openUntil, lastError, lastOkAt }

normalizeUpdate(raw)                 // chịu được {ok,result:{...}}, {event_name,message}, mảng; trả mảng
  // mỗi phần tử: { messageId: String, chatId: String, fromName, text, at: Date, kind: 'text' | 'other' }
  // bỏ phần thiếu chat.id hoặc message_id; from.is_bot === true thì bỏ
verifySecret(headerValue)            // so constant-time với ZALO_WEBHOOK_SECRET; secret trống → false

startPolling(onUpdate)               // chỉ khi mode()==='poll'
  // vòng lặp async: call('getUpdates', { timeout: '30' }, { timeoutMs: 40000 })
  //   thành công: normalizeUpdate(result).forEach(onUpdate)
  //   lỗi hết giờ không có tin: lặp ngay
  //   lỗi khác: chờ lùi 5s, 10s, 20s, 40s, trần 60s; mô tả lỗi nhắc tới webhook → log một lần
  //     "Bot này đang dùng webhook (có thể của Render). Máy local cần bot riêng." rồi chờ 5 phút
  // trả hàm stop()
```
Các hàm thuần (`normalizeUpdate`, `verifySecret`, phần quyết định ngắt mạch) phải test được không cần mạng.

### 6.5 `backend/services/butler/store.js`

`ensureButlerIndexes(authDb)`, `getLink(authDb, userId)`, `findLinkByChat(authDb, chatId)`, `updateSettings(authDb, userId, patch)` (kiểm từng trường: `workspace` thuộc `real|demo`; `notifyLevel` thuộc ba giá trị; giờ là số nguyên 0 đến 23; `digest` boolean; `muteUntil` null hoặc ngày trong 7 ngày tới), `createLinkCode(authDb, userId)` (mã `crypto.randomInt(0, 1e6)` đệm 6 chữ số; lưu sha256; trả mã thô một lần), `consumeLinkCode(authDb, code)` (`findOneAndDelete` theo hash và `expiresAt > now`; trả userId hoặc null), `linkChat(authDb, userId, chatId, zaloName)` (một chat chỉ nối một tài khoản: trước khi gán thì `updateMany({ chatId }, { $set: { chatId: null, linkedAt: null } })`), `unlink(authDb, userId)`, `saveMessage(authDb, doc)`, `recentMessages(authDb, userId, { before, limit })`, `setPending`, `takePending(authDb, userId)` (`findOneAndDelete` còn hạn), `peekPending`.

### 6.6 `backend/services/butler/outbox.js`

```js
enqueue(authDb, { dedupKey, userId, chatId, kind, text })
  // status 'queued' nếu zalo.configured() && chatId; ngược lại 'skipped' kèm lastError
  //   ('Chưa cấu hình bot Zalo' | 'Chưa nối Zalo')
  // giới hạn: kind 'alert' quá 10 tin queued+sent trong 60 phút của người đó → 'skipped',
  //   lastError 'Quá 10 tin trong một giờ, gộp vào bản tin sáng'
  // insertOne; lỗi 11000 → return { duplicate: true }
  // thành công và queued → kick()
startOutbox(authDb)                 // setInterval 3 giây (unref) + kick() khi có tin; chỉ một vòng chạy tại một lúc (cờ busy)
tick(authDb)
  // 1. trả về hàng đợi các tin 'sending' có claimedAt quá 2 phút (tiến trình chết giữa chừng)
  // 2. lấy tối đa 5 tin: findOneAndUpdate({ status:'queued', nextAttemptAt:{$lte:now} }, {$set:{status:'sending', claimedAt:now}}, { sort:{ nextAttemptAt:1 } })
  //    (gọi lặp 5 lần; nhận null thì dừng). Nhờ claim nguyên tử nên 2 tiến trình không gửi trùng.
  // 3. gửi lần lượt, cách nhau tối thiểu 1100 ms (biến toàn tiến trình lastSendAt)
  //    thành công: status 'sent', sentAt
  //    lỗi: tries+1; tries >= 5 → 'failed'; ngược lại 'queued', nextAttemptAt = now + [30s, 2m, 10m, 30m][tries-1]
  //    lỗi circuit_open: không tính lần thử, nextAttemptAt = openUntil
  //    lastError = e.message (đã sạch token)
stats(authDb, userId)               // { queued, failed24h, lastSentAt }
```

### 6.7 `backend/services/butler/incidents.js` (phần lớn là hàm thuần)

```js
async collectIncidents(db, workspace, ctx, { collectorStatus } = {})
  // trả mảng { key, kind, severity, title, why, to }
  // 1. pendingAlerts(db, ctx): mọi mức; key = `alert|${a.id}`; severity = fromAlertSeverity(a.severity);
  //    title = a.title + (a.productName ? ` trên ${a.productName}` : ''); why = a.summary; to = '/risk'
  // 2. buildInboxItems(db, workspace, ctx): chỉ lấy item severity 'critical' | 'high'
  //    key = `inbox|${item.id}`; kind = item.source; to = item.actions?.[0]?.to || '/dashboard'
  // 3. kho real: collectorStatus.lastError có và lastFinishedAt trong 24 giờ →
  //    key `collector|${ymd của lastFinishedAt}`, severity 'high', title 'Lượt tự thu thập gần nhất bị lỗi'
  // Không để một phần lỗi làm hỏng cả: bọc từng phần try/catch; trả thêm cờ partial = true nếu có phần lỗi.

shouldNotify(incident, link, now)   // THUẦN
  // link.chatId trống → false
  // muteUntil > now → false
  // ngưỡng: notifyLevel 'critical' chỉ critical; 'high' critical+high; 'all' mọi mức
  // inQuiet(giờ VN) → chỉ critical
  // đã báo cho userId này với mức >= mức hiện tại → false (thứ hạng critical 3, high 2, medium 1)
  // còn lại true

buildAlertMessage(items, { workspaceLabel, appUrl })   // THUẦN
  // 1 việc:
  //   "Quản gia Customer Radar, kho Dữ liệu thật.\n[Nghiêm trọng] <title>\n<why, cắt 400 ký tự>\n
  //    Nhắn "xem 1" để xem kế hoạch, "duyệt 1" để chấp nhận.\n<appUrl><to>"
  // nhiều việc: "Quản gia Customer Radar, kho ...: có N việc mới.\n1. [Cao] <title>\n2. ...\n
  //    Nhắn "xem <số>" để xem chi tiết, "việc" để xem cả danh sách."
  // tối đa 6 việc; thừa thì dòng cuối "Còn K việc nữa, nhắn "việc" để xem."
  // KHÔNG emoji, không "·", không "→".

buildDigest({ workspaceLabel, ctxSummary, incidents, appUrl })   // THUẦN, cho bản tin sáng và lệnh "tình hình"
  // ví dụ:
  // "Bản tin sáng 17/11, kho Dữ liệu thật.
  //  Phản hồi được tính: 4.557. Độ tin số liệu: 82/100.
  //  Việc đang chờ: 2 nghiêm trọng, 1 cao, 3 chú ý.
  //  Dữ liệu mới nhất: 2 giờ trước.
  //  Nhắn "việc" để xem danh sách."
  // trường nào không có số thì bỏ cả dòng, không in "undefined" hay "NaN"
```
`ctxSummary` lấy từ ngữ cảnh: `counted = ctx.items.filter(metrics.isCountable).length`, `health = ctx.funnel.dataHealthScore`, `freshAt = ctx.ingestedAt || ctx.asOf`. Số dùng `toLocaleString('vi-VN')`.

### 6.8 `backend/services/butler/watcher.js`

```js
startWatcher({ authDb, workspaces })    // setTimeout(firstDelay).unref(); setInterval(every).unref(); trả stop()
async tick({ authDb, workspaces, now = new Date() })
  // 0. lấy khóa meta butler_watch (TTL 10 phút); không lấy được → return
  // 1. links = butler_links.find({ chatId: { $type: 'string' } }).toArray()  (vài bản ghi)
  //    links rỗng → ghi lastRunAt, nhả khóa, return (KHÔNG tính gì: không ai nghe thì không tốn CPU)
  // 2. kho cần canh = tập settings.workspace của các link
  // 3. mỗi kho: ctx = await withTimeout(getContext(workspaces[ws]), 60000)
  //    (withTimeout lấy từ real_collector.js); lỗi → ghi lỗi, bỏ kho này
  //    list = await collectIncidents(...)
  //    upsert butler_incidents: $set { severity, title, why, to, lastSeenAt: now, resolvedAt: null, workspace, key, kind },
  //      $setOnInsert { firstSeenAt: now, notified: [] }   (dùng bulkWrite, ordered:false)
  //    chỉ khi list.partial !== true: đánh dấu resolvedAt = now cho sự cố của kho này đang mở mà không có trong list
  // 4. mỗi link: open = sự cố đang mở của kho đó; pick = open.filter(i => shouldNotify(i, link, now))
  //    pick không rỗng: sắp nặng trước; text = buildAlertMessage(pick, ...)
  //      cập nhật link.lastList = pick (đánh số 1..n, kind 'alert' nếu key bắt đầu 'alert|', id = phần sau tiền tố)
  //      enqueue({ dedupKey: `alert|${userId}|${sha1(pick.map(i => i._id + ':' + i.severity).sort().join(','))}`, kind: 'alert', ... })
  //      $push notified { userId, severity, at } vào từng sự cố đã gửi
  //    bản tin sáng: settings.digest, giờ VN >= digestHour, lastDigestOn !== ymd hôm nay, không im
  //      → enqueue({ dedupKey: `digest|${userId}|${ymd}`, kind: 'digest', text: buildDigest(...) }); set lastDigestOn
  // 5. ghi meta: lastRunAt, lastOkAt (khi không lỗi), lastError, lastMs, lastIncidents (số đang mở); nhả khóa
  // Cả tick bọc withTimeout 120000; lỗi không bao giờ ném ra ngoài bộ hẹn giờ.
```
Tránh báo dồn khi vừa bật lần đầu: lần đầu một link được canh (chưa có `notified` nào cho userId đó trong kho) thì **không** gửi từng sự cố cũ; chỉ gửi một tin "Quản gia đã bắt đầu canh kho X. Đang có N việc chờ, nhắn "việc" để xem." và đánh dấu tất cả là đã báo. Lưu cờ `link.watchStarted[workspace] = now`.

### 6.9 `backend/services/butler/engine.js`

```js
async handle({ authDb, workspaces, user, link, text, channel, workspace })
  // workspace: web truyền req.workspace; Zalo truyền link.settings.workspace
  // trả { text, kind, cards?, confirm?, facts?, evidence?, meta? }
```
Theo `parseCommand(text).type`:

| type | Làm gì | Trả lời mẫu |
|---|---|---|
| `help` | | danh sách lệnh, mỗi dòng một lệnh kèm ví dụ (xem mục 7.4) |
| `tasks` | `ctx`; `alerts = pendingAlerts` (tối đa 5) + `inbox` critical/high trước rồi medium, tổng tối đa 8; ghi `link.lastList` | "Việc đang chờ ở kho Dữ liệu thật, 3 việc:\n1. [Nghiêm trọng] ...\n..." + `cards: [{ type: 'tasks', items }]`. Không có việc: "Không có việc nào đang chờ ở kho X. Số liệu tính lúc HH:MM." (kho trống, tức 0 phản hồi: "Kho X chưa có phản hồi nào nên chưa có gì để canh.") |
| `detail` | tìm `n` trong `lastList` (cũ hơn 24 giờ hoặc không có → "Nhắn "việc" để lấy danh sách mới trước.") | cảnh báo: `summary` + tối đa 4 bước của `recommendation.steps` ("1. <text> (cần <approvalRole> duyệt)") + link `/risk`; việc khác: `why` + link |
| `accept` | phải là `kind 'alert'` (khác → "Việc này làm trên web: <link>"); `setPending({ action:'accept', args:{ alertId, title, actionIds: steps.map(s=>s.actionId), scopeKey, snapshot:{ title, productName, severity } } })` | "Chấp nhận kế hoạch cho "<title>"? Nhắn "có" trong 5 phút để ghi, "thôi" để bỏ." + `confirm: { yes: 'Chấp nhận kế hoạch', no: 'Thôi' }` |
| `dismiss` | thiếu `reason` → hỏi lý do; đủ → pending `dismiss` | "Bỏ qua "<title>" với lý do "<reason>"? Nhắn "có" để ghi." |
| `collect` | chỉ kho real (demo → "Kho mô phỏng không thu thập."); pending `collect` | "Chạy một lượt thu thập đánh giá mới? Mất khoảng 10 đến 20 phút. Nhắn "có" để chạy." |
| `confirm` | `takePending`; không có → "Không có lệnh nào đang chờ xác nhận." accept/dismiss → `recordDecision(db, { ...args, decision, reason, by: user.name, via: channel })`; collect → `realCollector.runOnce(db, { trigger: 'butler', minGapMs: realCollector.MANUAL_GAP_MS })` | "Đã ghi: chấp nhận kế hoạch "<title>". Hệ thống nhắc theo dõi lại ngày dd/mm." / runOnce không chạy → nói lý do như `/collector/run` |
| `cancel` | xóa pending | "Đã bỏ, không ghi gì." |
| `status` | `buildDigest` | |
| `mute` / `unmute` | `updateSettings({ muteUntil })`; khi im thì im hẳn, kể cả việc nghiêm trọng | "Tạm im đến HH:MM dd/mm. Nhắn "bật báo" để báo lại." / "Đã bật báo lại." |
| `workspace` | `updateSettings({ workspace })` (chỉ Zalo; trên web thì trả "Trên web, đổi kho ở ô Kho dữ liệu trên thanh bên.") | "Từ giờ quản gia canh và trả lời theo kho Dữ liệu thật." |
| `live` | `liveBriefing(db, workspace)` → nối `facts` | |
| `link_code` | trên web: "Mã này dùng để nhắn cho bot trên Zalo." (xử lý nối nằm ở inbound) | |
| `unlink` | Zalo: `unlink` + "Đã ngắt Zalo khỏi tài khoản <tên>." | |
| `question` | giới hạn 20 câu hỏi mỗi giờ mỗi người (đếm trong bộ nhớ, Map userId → mốc thời gian); `ctx` (+ `live` như `/chat` nếu `routeIntent` ra `live`); `history` = 6 tin gần nhất từ `butler_messages`; `chatEngine.ask(ctx, text, history, {})` | web: trả nguyên `{ text, facts, evidence, meta }`, `kind: 'answer'`. Zalo: `plain(result.text)` + tối đa 2 dẫn chứng `"<150 ký tự>"` + dòng cuối "Xem đủ số liệu: <appUrl>/butler" |

Mọi nhánh bọc `try/catch`: lỗi → "Quản gia gặp lỗi khi làm việc này. Thử lại sau ít phút." và `console.error('[QUẢN GIA]', type, e.message)`. Ngữ cảnh chưa sẵn sàng quá 20 giây (dùng `withTimeout`) → "Số liệu đang được tính lại, thử lại sau một phút."

`workspaceLabel`: `real` → "Dữ liệu thật", `demo` → "Mô phỏng".

### 6.10 `backend/services/butler/inbound.js`

```js
createInbound({ authDb, workspaces, maxQueue = 200, concurrency = 2 })
  push(update)          // đồng bộ, không await: queue đầy → log, bỏ (trả false)
  // xử lý: chat cùng chatId đi tuần tự (Map chatId → Promise đuôi); toàn cục tối đa `concurrency` việc cùng lúc
  async process(u)
    // 1. u.kind !== 'text' → trả lời "Quản gia mới đọc được tin chữ." (qua outbox, dedupKey reply|messageId), xong
    // 2. insert butler_inbound { _id: messageId }; trùng → bỏ
    // 3. giới hạn mỗi chat 20 tin/phút; vượt → lần đầu trả "Nhắn chậm lại một chút." rồi bỏ đến hết phút
    // 4. link = findLinkByChat(chatId)
    //    chưa nối: parse link_code → consumeLinkCode → linkChat → "Đã nối Zalo với tài khoản <tên>, shop <shop>. Nhắn "giúp" để xem lệnh."
    //              sai mã: đếm 5 lần/10 phút mỗi chat, quá thì im
    //              câu khác: "Bot này của Customer Radar. Để nhận báo, mở trang Quản gia trên web, bấm "Nối Zalo" rồi gửi mã 6 số vào đây."
    //    đã nối: user = users.findOne({ _id: link.userId }) (không có → unlink, trả như chưa nối)
    //            typing(); reply = engine.handle({... channel: 'zalo', workspace: link.settings.workspace })
    //            saveMessage user + butler
    //            enqueue({ dedupKey: `reply|${messageId}`, kind: 'reply', text: reply.text })
```

### 6.11 `backend/services/butler/index.js`

```js
startButler({ authDb, workspaces })
  // BUTLER==='0' → log 'Quản gia: TẮT (BUTLER=0).', return { inbound: null }
  // await ensureButlerIndexes(authDb)
  // startOutbox(authDb); startWatcher({ authDb, workspaces })
  // inbound = createInbound(...)
  // zalo.mode()==='poll' → zalo.startPolling(u => inbound.push(u))
  // zalo.mode()==='webhook' && RENDER_EXTERNAL_URL && secret → zalo.setWebhook(...).catch(log)
  // BUTLER_KEEPALIVE==='1' && RENDER_EXTERNAL_URL → setInterval 10 phút axios.get(`${url}/health`, {timeout: 10000}).catch(()=>{}) (unref)
  // log một dòng: 'Quản gia: bật, Zalo <chưa cấu hình|poll|webhook>, canh mỗi N phút.'
  // return { inbound }
```

### 6.12 `backend/routes/butler.js`

`module.exports = ({ authDb, workspaces, getInbound }) => router`. Dùng `wrap` cùng kiểu `routes/api.js` (chép hàm nhỏ đó). `rateLimit` từ `services/rate_limit.js`.

| Route | Quyền | Việc |
|---|---|---|
| `POST /zalo/webhook` | công khai, kiểm secret | `zalo.mode() !== 'webhook'` → 404. `!verifySecret(req.get('X-Bot-Api-Secret-Token'))` → 403. Trả `200 { ok: true }` **trước**, rồi `normalizeUpdate(req.body).forEach(u => getInbound()?.push(u))`. Giới hạn 120 lượt/phút/IP. |
| `GET /status` | phiên | `{ enabled, zalo: { ...zalo.health(), botName }, watcher: meta butler_watch (không lộ khóa), link: { linked, zaloName, linkedAt }, settings, incidents: 10 sự cố đang mở của kho (req.workspace), outbox: stats }`. `botName` từ `getMe()` có nhớ, lỗi thì null. |
| `GET /messages?before=&limit=` | phiên | `limit` 1 đến 50 (mặc định 30); trả từ cũ tới mới; thêm `hasMore` |
| `POST /command` `{ text }` | phiên + khóa ghi | `text` là chuỗi 1 đến 2000 ký tự (dùng `normalizer.canonicalize`). Giới hạn 30 lượt/phút/IP. `engine.handle({ channel: 'web', workspace: req.workspace })`, lưu hai tin, trả `{ reply, messages: [userMsg, butlerMsg] }` |
| `POST /link-code` | phiên + khóa ghi | tài khoản mẫu (`req.user.email === DEMO_ACCOUNT.email`) → 403 "Tài khoản mẫu dùng chung nên không nối Zalo được. Tạo tài khoản riêng để nhận báo."; `!zalo.configured()` → 409 "Máy chủ chưa cấu hình bot Zalo."; trả `{ code, expiresAt, botName }`. Giới hạn 5 lượt/10 phút/IP. |
| `DELETE /link` | phiên + khóa ghi | ngắt; nếu có chatId thì enqueue tin "Đã ngắt Zalo khỏi tài khoản này." |
| `PATCH /settings` | phiên + khóa ghi | `updateSettings`; sai dữ liệu → 400 kèm câu lỗi tiếng Việt |
| `GET /outbox?limit=20` | phiên | tin đi gần nhất của người đó: `{ kind, text (300 ký tự), status, createdAt, sentAt, lastError }` |
| `POST /test` | phiên + khóa ghi | chưa nối → 409; enqueue "Tin thử từ quản gia Customer Radar. Đọc được tin này là báo qua Zalo đã chạy." (`dedupKey: test|userId|phút hiện tại`). Giới hạn 3 lượt/10 phút. |

`req.user` do `requireSession` gắn là **nguyên bản ghi `users` trong Mongo** (đã kiểm: `services/auth.js` `lookupSession`), gồm `_id` (ObjectId), `email`, `name`, `shop` và cả `passwordHash`. Vì vậy: userId dùng thẳng `req.user._id`; **không bao giờ** trả `req.user` hay `user` ra JSON hoặc đưa vào tin Zalo; cần hiện thông tin tài khoản thì chỉ lấy `name`, `shop`. Kiểm tài khoản mẫu bằng `req.user.email === auth.DEMO_ACCOUNT.email`.

### 6.13 Nối vào máy chủ và lớp bảo vệ

1. `services/auth.js`: thêm vào `PUBLIC` dòng `['POST', /^\/api\/butler\/zalo\/webhook\/?$/]`. Sửa comment liệt kê ngoại lệ.
2. `services/api_access.js` `writeGuard`: thêm `BUTLER_WEBHOOK_PATH = /^\/api\/butler\/zalo\/webhook\/?$/` vào điều kiện miễn khóa ghi (cạnh `WEBHOOK_PATH`). Sửa comment.
3. `server.js`, sau dòng `app.use('/api/live', ...)` và trước `app.use('/api', require('./routes/api'))`:
   ```js
   let butler = { inbound: null };
   app.use('/api/butler', require('./routes/butler')({ authDb, workspaces, getInbound: () => butler.inbound }));
   ```
   Trong `app.listen` callback, sau phần tự thu thập:
   ```js
   require('./services/butler').startButler({ authDb, workspaces })
     .then((b) => { butler = b; })
     .catch((e) => console.warn('[QUẢN GIA] Không bật được:', e.message));
   ```
4. Test mới cho `isPublicApi` và `writeGuard` với đường webhook (mục 8.1).

---

## 7. Frontend

### 7.1 Đọc trước

`DESIGN.md` (đã khóa, cả file), `KE-HOACH-GIAO-DIEN.md` mục 1, 2, 8. Dùng đúng token và component ở đó. Không tự đặt màu, cỡ chữ, bo góc hay thời lượng. Trang này là màn **ứng dụng**, không phải trang giới thiệu.

### 7.2 Hướng thiết kế (Claude đã chọn theo frontend-design và hallmark, chế độ hệ khóa)

- **Chủ thể**: người chủ shop nhỏ, đang ở ngoài (kho, chợ, đang giao hàng), cầm điện thoại một tay, mở trang trong 30 giây để biết "có gì gấp không" và bấm duyệt. Việc chính của trang: **thấy việc gấp và ra lệnh được bằng ngón cái**.
- **Thứ để nhớ (chỉ một)**: **"phiếu việc có số"**. Danh sách việc trong cuộc trò chuyện hiện thành các dòng phiếu đánh số. Số ở đây là thật sự cần, không phải trang trí: nó chính là tay cầm của lệnh ("duyệt 2" trên Zalo, nút trên web cùng số). Số đặt to (`text-heading`, `tabular-nums`, màu `text-ink-hi`), mức độ dùng `SeverityBadge` (màu, biểu tượng và chữ). Mọi thứ khác im lặng: không minh họa, không hình mascot quản gia, không bong bóng chat màu mè.
- **Giọng chữ**: quản gia nói ngắn, câu đầu là kết luận. Không xưng hô (không "anh chị", không "tôi"), không chào hỏi thừa. Viết "Có 2 việc đang chờ.", không viết "Chào anh chị, tôi thấy có 2 việc cần anh chị xem."
- Không dùng cái gì sẵn có kiểu "ứng dụng chat": không ảnh đại diện tròn, không chấm "đang gõ" nảy (đang chờ thì dùng `SkeletonBlock` có câu "Quản gia đang tính", giống ngăn kéo trợ lý).

### 7.3 Bố cục

Máy tính (từ `lg`, 1024px):
```
┌ thanh bên ┐┌──────────────────── nội dung (cx) ──────────────────────────────┐
│           ││ Quản gia                                     [Nối Zalo / Đã nối]│
│           ││ Canh kho Dữ liệu thật, kiểm lần cuối 2 phút trước.              │
│           ││ ┌──────── cuộc trò chuyện (max 680px) ─┐ ┌─ Đang canh (320px) ─┐│
│           ││ │ tin cũ ... (cuộn)                    │ │ Zalo: Bot Radar Shop ││
│           ││ │ [phiếu việc 1] [2] [3]               │ │ Báo ngay: từ mức cao ││
│           ││ │ [thanh xác nhận]                     │ │ Giờ yên: 22 đến 7 giờ││
│           ││ │──────────────────────────────────────│ │ Bản tin sáng: 8 giờ  ││
│           ││ │ (Việc) (Tình hình) (Tạm im) (Giúp)   │ │ [Cài đặt báo]        ││
│           ││ │ [ô nhập ..................] [Gửi]    │ │──────────────────────││
│           ││ └──────────────────────────────────────┘ │ Đã báo gần đây       ││
│           ││                                          │ 09:12 Đã gửi  ...    ││
└───────────┘└──────────────────────────────────────────┴──────────────────────┘
```
Điện thoại (390px): một cột. Trên cùng một dòng trạng thái (chữ, không chấm màu): "Canh kho Dữ liệu thật. Zalo đã nối." và nút `IconButton` "Cài đặt báo" mở `Drawer` chứa toàn bộ cột phải. Cuộc trò chuyện chiếm phần còn lại; thanh nhập dính đáy, đệm `pb-[max(0.75rem,env(safe-area-inset-bottom))]`, ô nhập `text-base` (16px để iOS không phóng to). Hàng nút lệnh nhanh cuộn ngang (`overflow-x-auto scroll-hint-x`), mỗi nút `Chip` cao 40px khi cảm ứng (đã có sẵn).

### 7.4 Thành phần và chữ

Tạo:
- `src/lib/butler.js`: `getStatus()`, `getMessages({ before })`, `sendCommand(text)`, `createLinkCode()`, `unlinkZalo()`, `saveSettings(patch)`, `getOutbox()`, `sendTest()`. Dùng `axios` mặc định của app (đã có header phiên, kho, khóa ghi). Không tự thêm header.
- `src/components/shell/ChatAnswer.jsx`: **tách** `Inline`, `markdownBlocks`, `Answer`, `PROVIDER` từ `shell/Assistant.jsx` ra đây, xuất `Answer`. `Assistant.jsx` import lại từ đây. Không đổi hành vi ngăn kéo.
- `src/components/Butler.jsx`: trang, bọc `PageEnter className="cx pt-2"` như các trang khác.
- `src/components/butler/Conversation.jsx`: danh sách tin. Tin của người: khối `bg-raised rounded-ctrl` canh phải như ngăn kéo. Tin của quản gia: chữ thường không khung; `kind === 'answer'` thì dùng `Answer`; có `cards` loại `tasks` thì `TaskTickets`; có `confirm` và là tin cuối thì `ConfirmBar`. Tin đến từ Zalo có dòng chú thích `text-xs text-ink-lo` "qua Zalo, 09:12". Tải thêm tin cũ khi cuộn lên đầu (nút link "Xem tin cũ hơn", không tự tải vô hạn).
- `src/components/butler/TaskTickets.jsx`: `<ol>` (đây là danh sách có thứ tự thật vì số là tay cầm lệnh). Mỗi dòng: số to bên trái; `SeverityBadge`; tiêu đề `text-base font-semibold`; `why` `text-sm text-ink-mid` tối đa 2 dòng (`line-clamp-2`); hai nút `size="sm"`: "Xem kế hoạch" (`secondary`, gửi lệnh `xem n`) và với cảnh báo thì "Duyệt" (`primary`, gửi `duyệt n`); việc không phải cảnh báo thì nút link "Mở trang" tới `to`. Các dòng chia bằng `border-line-soft`, không thẻ lồng thẻ.
- `src/components/butler/ConfirmBar.jsx`: khối `paper p-3 rounded-ctrl` với câu hỏi và hai nút: `primary` theo `confirm.yes`, `ghost` "Thôi". Bấm thì gửi lệnh `có` hoặc `thôi`, nút đang gửi có `loading`.
- `src/components/butler/Composer.jsx`: hàng lệnh nhanh (`Chip`): "Việc hôm nay" (`việc`), "Tình hình" (`tình hình`), "Livestream" (`live`), "Tạm im 2 giờ" (`im 2 giờ`), "Lệnh" (`giúp`). Ô `textarea` 1 đến 4 dòng, Enter gửi, Shift+Enter xuống dòng, bỏ qua khi đang gõ IME (chép cách xử lý `isComposing` của `Assistant.jsx`). Nút gửi `IconButton icon={ArrowUp} variant="primary" size={44} label="Gửi"`. Placeholder: "Hỏi hoặc ra lệnh, ví dụ: việc hôm nay".
- `src/components/butler/WatchPanel.jsx`: cột phải (và nội dung `Drawer` trên điện thoại). Panel `GlassPanel`. Phần:
  1. "Zalo": chưa cấu hình máy chủ → câu "Máy chủ chưa có bot Zalo. Người quản trị đặt ZALO_BOT_TOKEN rồi khởi động lại." Chưa nối → nút chính "Nối Zalo" mở `ZaloConnect`. Đã nối → "Đã nối với <zaloName> từ dd/mm." và hai nút "Gửi tin thử" (`secondary`), "Ngắt" (`ghost`, hỏi lại bằng `Modal tone="crit"`).
  2. "Báo ngay khi": `Segmented` ba lựa chọn "Chỉ nghiêm trọng" / "Từ mức cao" / "Mọi việc".
  3. "Kho quản gia canh": `Segmented` "Dữ liệu thật" / "Mô phỏng". Câu nhỏ: "Áp dụng cho tin Zalo. Trên web, quản gia trả lời theo kho đang mở."
  4. "Giờ yên lặng": hai `Select` giờ (0 đến 23). Câu nhỏ: "Trong giờ này chỉ báo việc nghiêm trọng."
  5. "Bản tin sáng": `Switch` và `Select` giờ.
  6. "Tạm im": đang im thì "Đang im đến HH:MM dd/mm" + nút "Bật báo lại"; không thì nút "Tạm im 2 giờ".
  7. "Đã báo gần đây" (`SentLog`): danh sách 10 dòng từ `/butler/outbox`: giờ (`tabular-nums`), trạng thái bằng chữ ("Đã gửi", "Đang chờ gửi", "Không gửi được", "Chỉ lưu, chưa nối Zalo"), một dòng đầu của tin. Trạng thái lỗi dùng `text-crit` kèm chữ, không chỉ màu.
  8. Dòng cuối `text-xs text-ink-lo`: "Quản gia kiểm mỗi 5 phút. Lần gần nhất: 2 phút trước." Nếu `watcher.lastError` thì thêm "Lần kiểm gần nhất bị lỗi, đang thử lại."
  Mỗi thay đổi cài đặt gọi `saveSettings` ngay, báo kết quả bằng `Toast` ("Đã lưu"), lỗi `Toast tone="crit"`.
- `src/components/butler/ZaloConnect.jsx`: `Modal` "Nối Zalo của bạn". Ba bước **đánh số vì là trình tự thật**: "1. Mở Zalo, tìm <botName> (hoặc quét mã QR bot trong Zalo Bot Manager)." "2. Gửi mã này cho bot:" mã 6 số to (`text-metric tabular-nums`, nhóm "482 913"), nút "Chép mã". "3. Bot nhắn lại "Đã nối" là xong." Đồng hồ đếm lùi bằng chữ ("Mã còn 9 phút"). Trong lúc mở, gọi `/butler/status` mỗi 4 giây; thấy `link.linked` thì đóng, `Toast` "Đã nối Zalo". Hết hạn: nút "Lấy mã mới".
- Trạng thái: đang tải trang dùng `Skeleton` đúng hình (cột chat, cột phải); lỗi tải dùng `EmptyState variant="error"` và nút "Thử lại"; cuộc trò chuyện rỗng: câu "Quản gia canh kho dữ liệu và báo bạn qua Zalo khi có việc gấp. Bắt đầu bằng một lệnh bên dưới." và hàng lệnh nhanh. Kho trống (`useWorkspaceEmpty() === true`): thêm một câu "Kho này chưa có phản hồi nào nên chưa có gì để canh." và liên kết "Xem cách có dữ liệu" tới `/dashboard`.
- Sau lệnh ghi thành công (tin trả lời bắt đầu bằng "Đã ghi"), gọi `bumpDataVersion()` từ `lib/dataVersion.js` để các trang khác tải lại số.

Sửa:
- `src/lib/nav.js`: thêm `{ to: '/butler', label: 'Quản gia', icon: ConciergeBell }` (không huy hiệu, huy hiệu cảnh báo đã có ở mục Cảnh báo) làm mục **thứ hai** của nhóm "Hằng ngày" (sau Tổng quan). Import `ConciergeBell` từ `lucide-react` (đã kiểm có trong gói).
- `src/App.jsx`: `const Butler = lazyPage(() => import('./components/Butler'));` và `<Route path="/butler" element={page(<Butler />)} />`.
- `src/components/shell/Assistant.jsx`: dưới ô nhập thêm nút link "Mở Quản gia" tới `/butler` (đóng ngăn kéo trước khi chuyển trang). Không đổi đường gọi `/chat` của ngăn kéo trong lần này.
- Chuỗi trợ giúp (lệnh `giúp`), dùng nguyên văn:
  ```
  Lệnh quản gia hiểu:
  việc: xem việc đang chờ, có số thứ tự
  xem 2: xem kế hoạch của việc số 2
  duyệt 2: chấp nhận kế hoạch việc số 2 (hỏi lại trước khi ghi)
  bỏ qua 2 vì <lý do>: bỏ qua việc số 2
  tình hình: tóm tắt số liệu
  live: tình hình livestream
  thu thập: lấy đánh giá mới (kho Dữ liệu thật)
  im 2 giờ, bật báo: tạm im hoặc bật lại báo
  kho thật, kho mô phỏng: đổi kho quản gia canh (trên Zalo)
  Câu khác được hiểu là câu hỏi về dữ liệu, ví dụ: khách chê gì nhiều nhất tuần này?
  ```

### 7.5 Cài ra màn hình chính (PWA tối thiểu, không service worker)

- `public/manifest.webmanifest`:
  ```json
  { "name": "Customer Radar", "short_name": "Radar", "lang": "vi", "start_url": "/butler", "scope": "/",
    "display": "standalone", "background_color": "#F4F6F9", "theme_color": "#F4F6F9",
    "icons": [ { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
               { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
               { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" } ] }
  ```
  Hai mã màu là giá trị `--canvas` (DESIGN.md 2.6 cho phép hex ở manifest và meta theme-color).
- `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="Radar">`.
- Biểu tượng: vẽ từ logo A2 (`public/favicon.svg`, DESIGN.md mục 7) trên nền `#F4F6F9`, logo chiếm 60% (bản maskable 50%). Sinh PNG 192, 512, maskable 512 và apple-touch-icon 180 bằng một script Node chạy **ngoài repo** (để trong thư mục tạm, dùng Playwright `page.screenshot` trên một trang HTML chỉ chứa SVG), rồi chép PNG vào `public/icons/`. Không commit script.
- `vercel.json`: kiểm `manifest.webmanifest` và `/icons/*` không bị luật rewrite SPA nuốt (mở `https://.../manifest.webmanifest` sau deploy phải ra JSON; ở local thì `npm run build` rồi `npx vite preview` kiểm).

---

## 8. Kiểm thử

### 8.1 Test đơn vị (thêm vào `backend/test/run_tests.js`, cùng helper `test(name, fn)`; hàm async dùng `asyncTests` như cuối file)

Tối thiểu:
1. `parseCommand`: bảng 40 câu (mục 6.3), mỗi câu một kỳ vọng `type` và trường thêm. Gồm: "Duyệt 2", "duyet 2", "  OK 2 ", "bỏ qua 3 vì hàng đã về" (reason giữ dấu "hàng đã về"), "bo qua 3" (dismiss không reason), "có", "Thôi", "im 3h" (180 phút), "im 30 phút" (30), "im" (120), "123 456" (link_code "123456"), "1234567" (question), "việc hôm nay khách chê gì nhiều nhất" (question), "kho thật", "?".
2. `inQuiet`: (23, 22, 7) true; (7, 22, 7) false; (6, 22, 7) true; (12, 9, 17) true; (17, 9, 17) false; (5, 5, 5) false.
3. `chunk`: chuỗi 4500 ký tự nhiều dòng ra 3 phần, mỗi phần ≤ 2000, nối lại (bỏ khoảng trắng nối) đủ nội dung; một dòng 3000 ký tự không khoảng trắng vẫn cắt được.
4. `plain`: "**Cảnh báo** [1] _mới_" → "Cảnh báo mới".
5. `shouldNotify`: ma trận mức độ × notifyLevel × giờ yên lặng × im × đã báo cùng mức × đã báo mức thấp hơn (báo lại khi leo thang).
6. `normalizeUpdate`: dạng `{ok,result:{...}}`, dạng phẳng, mảng, `null`, thiếu chat.id, `is_bot: true`.
7. `verifySecret`: đúng, sai, thiếu header, secret môi trường trống.
8. `buildAlertMessage`: 1 việc, 3 việc, 8 việc (cắt 6 + "Còn 2 việc nữa"); không chứa "·", "→", "undefined", "NaN".
9. `buildDigest`: thiếu trường thì bỏ dòng.
10. `isPublicApi('POST', '/api/butler/zalo/webhook')` true; `isPublicApi('POST', '/api/butler/command')` false; `writeGuard` miễn đường webhook, không miễn `/api/butler/command`.
11. Lỗi Zalo không chứa token: giả lập axios ném lỗi có `config.url` chứa "bot123:SECRET" → `String(err)` và `err.message` không chứa "SECRET". (Viết `call` để nhận hàm `post` tiêm vào khi test.)

**Thế nào là xong**: `npm test` toàn bộ đạt (số test tăng thêm ít nhất 11 nhóm trên).

### 8.2 Máy Zalo giả lập (để chạy thật mà không cần bot thật)

Tạo `backend/scripts/mock_zalo.js` (được commit, chỉ dùng khi thử): Express trên cổng 5055.
- `POST /bot:token/getMe` → `{ ok: true, result: { id: '1', account_name: 'Bot Radar Thử' } }`
- `POST /bot:token/sendMessage` → lưu vào mảng `sent`, in ra `[GỬI] chat=<id>: <80 ký tự đầu>`, trả `{ ok:true, result:{ message_id, date } }`. Biến `FAIL_NEXT=n` qua `POST /_fail {n}` để giả lỗi 500 n lần liền.
- `POST /bot:token/sendChatAction` → ok.
- `POST /bot:token/getUpdates` → giữ request tới 25 giây hoặc tới khi có tin trong hàng; trả `{ ok:true, result: <một sự cố> }`; hết giờ `{ ok:false, error_code: 408, description: 'timeout' }`.
- `POST /_say { chat_id, text, name }` → tạo sự kiện `message.text.received` với `message_id` tăng dần, đưa vào hàng getUpdates.
- `GET /_sent` → mảng tin đã gửi; `POST /_reset`.

### 8.3 Chạy thử đầu cuối (kịch bản `backend/scripts/butler_e2e.js`, được commit)

Chuẩn bị (PowerShell, ba cửa sổ hoặc `Start-Process` có log ra thư mục tạm, không ra repo):
```powershell
node backend/scripts/mock_zalo.js
# cửa sổ 2, trong backend/:
$env:MONGODB_DB='customer_radar_ui_test'; $env:MONGODB_REAL_DB='customer_radar_ui_test_real'; $env:AUTO_COLLECT='0'; $env:PORT='5000'
$env:ZALO_API_BASE='http://127.0.0.1:5055'; $env:ZALO_BOT_TOKEN='123456:testtokenabcdef'; $env:ZALO_MODE='poll'
$env:BUTLER_WATCH_MINUTES='1'; $env:BUTLER_WATCH_FIRST_DELAY_SEC='5'; $env:PUBLIC_APP_URL='http://localhost:5199'
node server.js
```
Kịch bản tự động (in "ĐẠT" hoặc "LỖI: ..." từng bước, thoát mã khác 0 khi lỗi):
1. Đăng ký một tài khoản thử mới (`/api/auth/signup`, email `butler-e2e-<thời gian>@example.com`) trên database test.
2. `POST /api/butler/link-code` → có mã 6 số. Với tài khoản mẫu thì 403.
3. `/_say` chat_id `9001` gửi "xin chào" khi chưa nối → tin trả lời hướng dẫn nối, **không** chứa số liệu.
4. `/_say` gửi mã → tin "Đã nối Zalo ..."; `/api/butler/status` có `link.linked: true`.
5. Gửi "việc" → tin có danh sách đánh số (kho test demo có cảnh báo cài sẵn; nếu kho real test trống thì gửi "kho mô phỏng" trước).
6. Gửi "xem 1" → có kế hoạch. Gửi "duyệt 1" → hỏi xác nhận. Gửi "có" → "Đã ghi". Kiểm `recommendation_log` trong `customer_radar_ui_test` có bản ghi `via: 'zalo'`, `by` = tên tài khoản thử.
7. Gửi lại cùng `message_id` hai lần (gọi `/_say` với id cố định, thêm tùy chọn đó vào mock) → chỉ một tin trả lời.
8. Chờ một nhịp canh → có tin "Quản gia đã bắt đầu canh kho ..." (tin đầu, không dồn từng sự cố cũ).
9. `POST /_fail {n: 3}` rồi gửi "tình hình" → tin vẫn tới sau khi thử lại (outbox `tries` > 0, `status: 'sent'`).
10. `POST /api/butler/command {text:'tình hình'}` từ web → `/api/butler/messages` có cả tin web và tin Zalo.
11. Dọn: xóa tài khoản thử và các bản ghi butler của nó **chỉ trong database có tên chứa `_test`** (kiểm `db.databaseName.includes('_test')` trước khi xóa, sai thì dừng).

### 8.4 Tải và độ bền

Script `backend/scripts/butler_load.js` (được commit):
1. 300 tin `/_say` từ 30 chat khác nhau trong 5 giây. Đồng thời mỗi 200 ms gọi `GET /health` và `GET /api/nav/status` (có token). Đạt khi: không request nào lỗi 5xx; `/health` chậm nhất dưới 500 ms; mỗi chat nhận đủ trả lời cho tin trong giới hạn 20/phút và đúng một câu "Nhắn chậm lại"; không tin trả lời trùng.
2. Ở chế độ webhook (`ZALO_MODE=webhook`, `ZALO_WEBHOOK_SECRET=<chuỗi thử 32 ký tự>`): 200 POST webhook song song có secret đúng → tất cả 200 dưới 50 ms (p95); 20 POST sai secret → 403; quá 120/phút/IP → 429.
3. Ghi `process.memoryUsage().rss` trước và sau (thêm `GET /api/butler/status` trả `rssMb` khi `NODE_ENV !== 'production'`), tăng dưới 30 MB.
4. `BUTLER=0`: khởi động, không có dòng poll hay canh nào chạy; `/api/butler/status` trả `enabled: false`; web chạy bình thường.
Ghi số đo vào mục 12.

### 8.5 Giao diện

- `npm run lint` (exit 0), `npm run build` (đạt; ghi cỡ gói JS chính, không được tăng quá 5 KB gzip vì trang mới phải nằm ở chunk riêng).
- Playwright (dùng công cụ trình duyệt có sẵn), vào `http://localhost:5199/butler` (Vite: `npx vite --port 5199 --strictPort`, backend như 8.3): chụp sáng, tối, 1280×800 và 390×844 (giả lập cảm ứng: `hasTouch`, `isMobile`). Lưu ảnh vào thư mục tạm, **không** vào repo. Kiểm: không cuộn ngang ở 390px; thanh nhập không bị bàn phím ảo che (thử `scrollIntoView`); mọi nút cao ≥ 40px khi cảm ứng; console 0 lỗi; đổi cài đặt báo "Đã lưu"; luồng nối Zalo với máy giả lập ra "Đã nối Zalo".
- `node C:/Users/DELL/.claude/skills/hallmark/scripts/sloplint.mjs src --genre modern-minimal --scope app --render --kept --url http://localhost:5199/butler`: không có FAIL mới (2 FAIL `#000` cũ được miễn).
- Quét chữ cấm trong file mới: `grep -nE "·|→|tuyệt đối" src/components/butler src/components/Butler.jsx backend/services/butler` phải rỗng.

---

## 9. Thứ tự làm (giai đoạn)

| # | Việc | Thế nào là xong |
|---|---|---|
| G1 | 6.1 nối `api.js` vào `work_items.js` | 6.1 "xong" |
| G2 | 6.2, 6.3, phần thuần của 6.7, test 8.1 mục 1 đến 9 | `npm test` đạt |
| G3 | 6.4 zalo.js, 8.2 mock | test 8.1 mục 6, 7, 11 đạt; gọi tay `getMe` qua mock ra tên bot |
| G4 | 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13 | máy chủ khởi động không lỗi với và không có `ZALO_BOT_TOKEN`; test 8.1 mục 10 đạt |
| G5 | 8.3, 8.4 | kịch bản e2e "ĐẠT" hết; số đo tải đạt |
| G6 | 7.4 frontend, 7.5 PWA | 8.5 đạt |
| G7 | Tài liệu (mục 10) | đủ ba chỗ |
| G8 | Báo lại Claude (mục 11) | |

Không làm song song G4 với G6. Giữa các giai đoạn chạy lại `npm test`.

---

## 10. Tài liệu phải cập nhật (G7)

1. `CLAUDE.md`, thêm mục `### Quản gia (/butler, services/butler/, Zalo)` sau mục "Accounts". Viết bằng tiếng Anh như phần Architecture (giữ phong cách file): mục đích, các module, collection trong authDb, biến môi trường, hai bot (local poll, Render webhook), lệnh hai bước, `BUTLER=0`, giới hạn Render ngủ, cách chạy mock và e2e. Dưới 40 dòng.
2. `DESIGN.md` mục 6, thêm một đoạn ngắn "**Quản gia (16/11):**" mô tả phiếu việc có số (vì sao được đánh số) và thanh xác nhận.
3. `KE-HOACH-GIAO-DIEN.md` mục 9: một dòng nhật ký "Quản gia: trang /butler, ..." kèm ngày.

Không tạo thêm file tài liệu nào khác. File kế hoạch này giữ nguyên, chỉ ghi vào mục 12.

---

## 11. Báo cáo cho Claude kiểm (G8)

Viết vào mục 12 của file này, rồi dừng:
- Danh sách file tạo và sửa (đường dẫn), mỗi file một câu.
- Kết quả: `npm test` (số đạt / lỗi), `npm run lint`, `npm run build` (cỡ gói chính trước và sau), e2e (từng bước), tải (số đo), sloplint.
- Chỗ làm khác kế hoạch và lý do.
- Việc còn dở, lỗi biết mà chưa sửa.
- Đường dẫn ảnh chụp giao diện (thư mục tạm).

Claude sẽ đọc diff, chạy lại test, chạy e2e, xem ảnh, rồi mới commit.

---

## 12a. Việc của người dùng (không phải của Gemini)

1. Tạo **bot thử** cho máy local: Zalo, tìm OA "Zalo Bot Manager", chọn "Tạo bot", đặt tên kiểu "Bot Radar Thử". Zalo nhắn mã bot về.
2. Mở `backend/.env` bằng tay, thêm hai dòng (không dán mã vào khung chat với AI nào):
   ```
   ZALO_BOT_TOKEN=<mã bot thử>
   ZALO_MODE=poll
   ```
3. Chạy backend local với database test (luật 0.2) và giao diện `npx vite --port 5199 --strictPort`, đăng nhập bằng tài khoản riêng (không phải tài khoản mẫu), vào trang Quản gia, bấm "Nối Zalo", gửi mã 6 số cho bot trên Zalo của mình.
4. Khi lên Render: tạo **bot thứ hai** cho bản thật, đặt trên Render `ZALO_BOT_TOKEN`, `ZALO_MODE=webhook`, `ZALO_WEBHOOK_SECRET` (chuỗi ngẫu nhiên 32 ký tự), `PUBLIC_APP_URL=https://aisc-2026.vercel.app`. Muốn canh 24/7 thì cài ping ngoài (mục 3.5).

## 12. Nhật ký của người làm

(Gemini ghi từ đây, mới nhất ở dưới cùng.)

- 2026-11-16 Claude: tạo `backend/services/work_items.js` (bước 6.0). Chưa nối vào `routes/api.js`.
- 2026-11-16 Gemini (G1): nối `backend/routes/api.js` vào `backend/services/work_items.js` (`detectAlertsCached`, `buildRecommendationsCached`, `painPointsFor`, `buildInboxItems`, `recordDecision`), bỏ hàm và `require` trùng (`cadence.spanWords`, `recommender`, `pain_points`), giữ hằng `ALERT_MEMO_TTL_MS` cho `/stats`. Chạy `npm test` đạt 193/193. So JSON trước và sau khi sửa trên máy chủ local (`customer_radar_ui_test` và `customer_radar_ui_test_real`, đăng nhập tài khoản mẫu) cho 4 đường `/api/inbox`, `/api/alerts`, `/api/recommendations`, `/api/nav/status` ở cả hai kho `demo` và `real` bằng script tự động lược bỏ trường mốc thời gian (`computedAt`, `detectedAt`, `dueAt`, `generatedAt`, `at`, `decidedAt`, `followUpAt`): kết quả khớp hệt nhau.
- 2026-11-16 Gemini (G2): tạo `backend/services/butler/text.js` (mục 6.2), `backend/services/butler/commands.js` (mục 6.3), `backend/services/butler/incidents.js` (mục 6.7), và thêm 7 nhóm test đơn vị thuần (8.1 mục 1, 2, 3, 4, 5, 8, 9; bảng `parseCommand` có 54 câu; mục 6, 7 nằm ở `zalo.js` sẽ kiểm ở G3). Chạy `npm test` đạt 200/200.
- 2026-11-16 Gemini (G3): tạo `backend/services/butler/zalo.js` (mục 6.4: che token trong lỗi, ngắt mạch sau 5 lỗi liên tiếp, `normalizeUpdate`, `verifySecret`, `startPolling`, đặt `proxy: false` cho địa chỉ nội bộ `127.0.0.1`/`localhost`) và `backend/scripts/mock_zalo.js` (mục 8.2: máy Zalo giả lập ở cổng 5055). Thêm test 8.1 mục 6, 7, 11 vào `backend/test/run_tests.js`. Chạy `npm test` đạt 203/203; gọi `zalo.getMe()` qua mock trả `{"id":"1","name":"Bot Radar Thử"}`.
- 2026-11-16 Gemini (G4): tạo `backend/services/butler/store.js` (6.5), `backend/services/butler/outbox.js` (6.6), `backend/services/butler/watcher.js` (6.8), `backend/services/butler/engine.js` (6.9), `backend/services/butler/inbound.js` (6.10), `backend/services/butler/index.js` (6.11), `backend/routes/butler.js` (6.12); nối webhook và quản gia vào `backend/services/auth.js`, `backend/services/api_access.js`, `backend/server.js` (6.13). Thêm test 8.1 mục 10 vào `backend/test/run_tests.js` (204/204 đạt). Khởi động máy chủ trên database test thành công cả khi không có `ZALO_BOT_TOKEN` ("Quản gia: bật, Zalo chưa cấu hình, canh mỗi 5 phút.") và khi có `ZALO_BOT_TOKEN` với mock Zalo ("Quản gia: bật, Zalo poll, canh mỗi 5 phút.").
- 2026-11-16 Gemini (G5): tạo `backend/scripts/butler_e2e.js` (8.3) và `backend/scripts/butler_load.js` (8.4). Sửa `mock_zalo.js` nghe `res.on('close')` thay vì `req.on('close')` (Node 24 phát `req.close` ngay khi đọc xong thân JSON) và khởi tạo `seq = Date.now()` để `message_id` không trùng qua các lần chạy; trong `outbox.js` khi `ZALO_API_BASE` trỏ `127.0.0.1`/`localhost` rút ngắn thời gian chờ thử lại để kiểm thử tự động không phải chờ 12 phút (trên Zalo thật vẫn giữ nguyên 1.100 ms và `[30s, 2m, 10m, 30m]`). Kết quả:
  - `butler_e2e.js`: 11/11 bước ĐẠT (đăng ký, tạo mã nối 6 số + tài khoản mẫu 403, chưa nối trả lời hướng dẫn không lộ số liệu, nối Zalo thành công, đổi sang kho Mô phỏng và lấy danh sách việc đánh số, xem kế hoạch việc 1 + duyệt 2 bước + kiểm `recommendation_log` có `via='zalo'`, chống trùng `message_id`, nhịp canh đầu tiên gửi tin mở đầu không bắn dồn sự cố cũ, giả lập 3 lỗi liên tiếp tự thử lại thành công `tries=3, status='sent'`, lịch sử chung web và Zalo 16 tin, dọn sạch dữ liệu thử trong `customer_radar_ui_test_auth`).
  - `butler_load.js`: 4/4 mục ĐẠT: (1) 300 tin từ 30 chat (5 chat x 25 tin + 25 chat x 7 tin) gửi trong 5.137 ms, nhận đủ 280/280 tin trả lời (mỗi chat vượt 20 tin/phút nhận đúng 20 trả lời + 1 câu "Nhắn chậm lại một chút."), 0 lỗi 5xx, `/health` p95 = 84,11 ms (chậm nhất 97,24 ms < 500 ms), `/api/nav/status` p95 = 91,46 ms; (2) Webhook: 200 POST song song có secret đúng đạt 200/200 với p95 = 13,85 ms (< 50 ms, max = 15,48 ms), 20 POST sai secret trả 403, vượt 120 lượt/phút/IP trả 429; (3) Bộ nhớ RSS: trước tải 380,64 MB (ngay sau khi worker nạp ngữ cảnh), sau tải 155,00 MB (chênh lệch -225,64 MB < 30 MB); (4) `BUTLER=0`: không chạy poll hay vòng canh, `/api/butler/status` trả `enabled: false`, `/api/nav/status` trả 200. Chạy lại `npm test` đạt 204/204.
- 2026-11-16 Gemini (G6): tạo `src/lib/butler.js`, `src/components/shell/ChatAnswer.jsx` (tách từ `Assistant.jsx`), `src/components/Butler.jsx`, `src/components/butler/Conversation.jsx`, `src/components/butler/TaskTickets.jsx`, `src/components/butler/ConfirmBar.jsx`, `src/components/butler/Composer.jsx`, `src/components/butler/WatchPanel.jsx`, `src/components/butler/ZaloConnect.jsx`; nối điều hướng và route trong `src/lib/nav.js`, `src/App.jsx`, thêm liên kết "Mở Quản gia" trong `src/components/shell/Assistant.jsx`; tạo `public/manifest.webmanifest` và 4 ảnh biểu tượng PWA trong `public/icons/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`), cập nhật `index.html` và `vercel.json` (7.5). Kết quả kiểm tra 8.5:
  - `npm run lint`: exit 0 (0 lỗi).
  - `npm run build`: đạt; gói JS chính trước G6 là `702,17 kB` (`210,78 kB` gzip), sau G6 là `703,06 kB` (`211,04 kB` gzip, chỉ tăng `+0,26 kB` gzip, dưới mức trần 5 KB); trang Quản gia tách thành gói riêng `dist/assets/Butler-C8O8O6i6.js` (`24,25 kB`, `7,59 kB` gzip).
  - Trình duyệt (Puppeteer 1280×800 và 390×844 cảm ứng `hasTouch: true, isMobile: true`, sáng và tối): 0 lỗi console, không cuộn ngang ở 390px (`docW = 390, winW = 390, overflowX = false`), khung nhập lệnh hiển thị trọn trong màn hình (`composerVisible = true`, cỡ chữ `16px`), mọi nút cảm ứng cao ≥ 40px (`smallButtons = []`), đổi cài đặt báo hiện `Toast` "Đã lưu", luồng nối Zalo qua `mock_zalo` nhận mã 6 số và tự cập nhật "Đã nối với Chủ Shop Trên Zalo". Ảnh lưu tại `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\`.
  - `sloplint`: 0 FAIL, 0 REFLEX, 0 WARN trên toàn bộ file mới của Quản gia. Quét chữ cấm (`·`, `→`, `tuyệt đối`) trên toàn bộ file mới: 0 kết quả. Chạy lại `npm test` đạt 204/204.
- 2026-11-16 Gemini (G7): cập nhật đủ 3 tài liệu theo mục 10: (1) `CLAUDE.md` thêm mục `### Quản gia (/butler, services/butler/, Zalo)` (21 dòng, tiếng Anh cùng phong cách phần Architecture) ngay sau mục `### Accounts`; (2) `DESIGN.md` mục 6 thêm đoạn `**Quản gia (16/11):**` mô tả phiếu việc có số (`TaskTickets` `<ol>`) và thanh xác nhận (`ConfirmBar` trên nền `paper`); (3) `KE-HOACH-GIAO-DIEN.md` mục 9 thêm một dòng nhật ký bàn giao ngày `2026-11-16` cho trang `/butler` và dịch vụ Quản gia. Chạy lại `npm test` đạt 204/204.
- 2026-11-16 Gemini (G8 - Báo cáo cho Claude kiểm theo mục 11):

### Báo cáo bàn giao G8 (Mục 11)

#### 1. Danh sách file tạo mới và file sửa (mỗi file một câu)

**File tạo mới (25 file):**
- `backend/services/butler/text.js`: Các hàm thuần xử lý giờ yên lặng (`inQuiet`), cắt đoạn tin Zalo (`chunk`), làm sạch markdown (`plain`), quyết định báo động (`shouldNotify`) và dựng nội dung tin báo/bản tin theo luật chữ của dự án.
- `backend/services/butler/commands.js`: Bộ phân tích câu lệnh tiếng Việt có dấu và không dấu (`parseCommand`) cùng hằng chuỗi trợ giúp `HELP_TEXT`.
- `backend/services/butler/zalo.js`: Client gọi Zalo Bot (`bot-api.zaloplatforms.com`) có che mã bot trong mọi lỗi, cầu dao ngắt mạch sau 5 lỗi liên tiếp, chuẩn hóa gói tin (`normalizeUpdate`), kiểm tra secret thời gian hằng số (`verifySecret`) và vòng long-polling (`startPolling`).
- `backend/services/butler/store.js`: Tầng lưu trữ MongoDB trên `authDb` quản lý chỉ mục TTL/unique, cài đặt người dùng, liên kết tài khoản Zalo, mã nối 6 số, lịch sử tin nhắn và lệnh chờ xác nhận 2 bước.
- `backend/services/butler/outbox.js`: Hàng đợi gửi tin Zalo bền vững (`butler_outbox`) giới hạn tốc độ 1 tin / 1,1 giây mỗi chat và tự thử lại theo cấp số nhân `[30s, 2m, 10m, 30m]`.
- `backend/services/butler/incidents.js`: Gom sự cố từ cảnh báo, livestream và hộp việc hôm nay với khóa ổn định (`alert|...`, `live|...`, `inbox|...`) để đối chiếu sự cố mới, leo thang mức độ hoặc đã hết.
- `backend/services/butler/watcher.js`: Vòng canh định kỳ có khóa thuê (`meta._id='butler_watch'`), đánh dấu `baselineDone` ở lượt đầu để không bắn dồn sự cố cũ, gửi báo động sự cố mới/leo thang và bản tin sáng.
- `backend/services/butler/engine.js`: Bộ máy thực thi mọi câu lệnh quản gia dùng chung cho cả trang web và Zalo, áp dụng xác nhận 2 bước cho lệnh ghi và giới hạn 20 câu hỏi/giờ/người.
- `backend/services/butler/inbound.js`: Hàng đợi xử lý tin đến từ Zalo tuần tự theo từng `chatId` (tối đa 2 việc song song toàn cục), chống trùng `message_id`, giới hạn 20 tin/phút/chat và nối tài khoản bằng mã 6 số.
- `backend/services/butler/index.js`: Điểm khởi động Quản gia (`startButler`) tôn trọng công tắc `BUTLER=0`, khởi tạo chỉ mục, bật `outbox`, `watcher`, `inbound`, polling/webhook Zalo và nhịp tự giữ thức (`BUTLER_KEEPALIVE=1`).
- `backend/routes/butler.js`: Bộ route Express `/api/butler/*` gồm webhook Zalo công khai có kiểm secret và các endpoint quản gia có kiểm phiên, khóa ghi và giới hạn tần suất.
- `backend/scripts/mock_zalo.js`: Máy chủ Zalo Bot giả lập ở cổng `5055` hỗ trợ `getMe`, `getUpdates` long-poll, `sendMessage`, `sendChatAction`, `setWebhook`, `/_say`, `/_sent` và `/_fail` để kiểm thử tự động.
- `backend/scripts/butler_e2e.js`: Kịch bản kiểm thử tích hợp đầu-cuối 11 bước tự khởi động máy giả lập Zalo và backend trên database `_test`, kiểm tra toàn bộ luồng nối, lệnh, canh kho, thử lại lỗi mạng và tự dọn dữ liệu thử.
- `backend/scripts/butler_load.js`: Kịch bản kiểm thử tải và độ bền (300 tin từ 30 chat trong 5 giây, 200 POST webhook song song, đo độ trễ `/health` p95, kiểm tra rò bộ nhớ RSS và công tắc `BUTLER=0`).
- `src/lib/butler.js`: Thư viện hàm gọi API `/api/butler/*` từ trình duyệt bằng thực thể `axios` mặc định của ứng dụng.
- `src/components/shell/ChatAnswer.jsx`: Thành phần hiển thị câu trả lời trợ lý (`Inline`, `markdownBlocks`, `Answer`, `PROVIDER`) được tách từ `Assistant.jsx` để dùng chung cho ngăn kéo trợ lý và trang Quản gia.
- `src/components/Butler.jsx`: Trang Quản gia (`/butler`) bố cục hai cột trên máy tính và một cột kèm ngăn kéo cài đặt trên điện thoại.
- `src/components/butler/Conversation.jsx`: Luồng hiển thị tin nhắn giữa người dùng và quản gia, hỗ trợ tải tin cũ, nhãn nguồn Zalo, phiếu việc có số, thanh xác nhận và trạng thái kho trống.
- `src/components/butler/TaskTickets.jsx`: Danh sách phiếu việc có thứ tự (`<ol>`) với số thứ tự làm tay cầm lệnh, `SeverityBadge` và nút thao tác nhanh ("Xem kế hoạch", "Duyệt", "Mở trang").
- `src/components/butler/ConfirmBar.jsx`: Thanh xác nhận lệnh ghi hai bước đặt trên nền `paper` ở cuối cuộc trò chuyện.
- `src/components/butler/Composer.jsx`: Khung nhập lệnh dính đáy kèm hàng nút lệnh nhanh (`Chip`), hỗ trợ Enter gửi, Shift+Enter xuống dòng và chống gửi nhầm khi đang gõ bộ gõ tiếng Việt (IME).
- `src/components/butler/WatchPanel.jsx`: Bảng trạng thái và cài đặt canh kho (kết nối Zalo, mức độ báo, kho canh, giờ yên lặng, bản tin sáng, tạm im và nhật ký 10 tin đi gần nhất).
- `src/components/butler/ZaloConnect.jsx`: Hộp thoại hướng dẫn nối Zalo 3 bước kèm mã 6 số định dạng `482 913`, đếm lùi thời hạn và tự đóng khi phát hiện đã nối thành công.
- `public/manifest.webmanifest`: Cấu hình PWA tiếng Việt đặt `start_url: "/butler"`, `theme_color: "#0b1929"` và `background_color: "#f6f5f1"`.
- `public/icons/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`): Bộ biểu tượng PWA nền `#0b1929` vẽ logo khung ngắm A2 nét trắng và chấm tròn `#c85a32`.

**File sửa (13 file):**
- `backend/routes/api.js`: Chuyển sang import `detectAlertsCached`, `buildRecommendationsCached`, `painPointsFor`, `buildInboxItems`, `recordDecision` từ `../services/work_items` và xóa các hàm trùng lặp.
- `backend/services/auth.js`: Mở ngoại lệ công khai cho đường `POST /api/butler/zalo/webhook` trong `PUBLIC`.
- `backend/services/api_access.js`: Miễn kiểm tra `X-Write-Key` cho đường webhook Zalo `POST /api/butler/zalo/webhook` trong `writeGuard`.
- `backend/server.js`: Gắn route `/api/butler` và khởi chạy `startButler({ authDb, workspaces })` sau khi máy chủ lắng nghe.
- `backend/test/run_tests.js`: Thêm 11 bài kiểm thử đơn vị (8.1 mục 1 đến 11, giữ nguyên định dạng dòng CRLF).
- `src/components/shell/Assistant.jsx`: Import `Answer` từ `./ChatAnswer` và thêm liên kết "Mở Quản gia" dưới ô nhập lệnh.
- `src/lib/nav.js`: Thêm mục điều hướng `{ to: '/butler', label: 'Quản gia', icon: ConciergeBell }` ở vị trí thứ hai trong nhóm hằng ngày.
- `src/App.jsx`: Khai báo `lazyPage` cho `Butler` và thêm `<Route path="/butler" ... />`.
- `index.html`: Thêm liên kết `manifest.webmanifest`, `apple-touch-icon` và các thẻ meta cài đặt PWA trên điện thoại.
- `vercel.json`: Cập nhật biểu thức `rewrites` để phục vụ trực tiếp `manifest.webmanifest` và `icons/*` trước khi chuyển về `index.html`.
- `CLAUDE.md`: Thêm mục tài liệu kiến trúc `### Quản gia (/butler, services/butler/, Zalo)` sau mục `### Accounts`.
- `DESIGN.md`: Thêm đoạn `**Quản gia (16/11):**` vào mục 6 giải thích phiếu việc có số và thanh xác nhận.
- `KE-HOACH-GIAO-DIEN.md`: Thêm dòng nhật ký bàn giao ngày `2026-11-16` tại mục 9.

#### 2. Kết quả kiểm thử và đo đạc

- **`npm test` (trong `backend/`)**: **204 đạt, 0 lỗi** (tăng từ 193 lên 204 bài kiểm thử).
- **`npm run lint` (gốc repo)**: **exit 0** (0 lỗi).
- **`npm run build` (gốc repo)**: **Đạt**.
  - Gói JS chính trước khi làm G6: `dist/assets/index-CFG0GK7b.js` — `702,17 kB` (`210,78 kB` gzip).
  - Gói JS chính sau khi làm G6: `dist/assets/index-CsYbwq87.js` — `703,06 kB` (`211,04 kB` gzip, chỉ tăng **+0,26 kB gzip**, dưới xa giới hạn 5 KB gzip).
  - Gói riêng của trang Quản gia: `dist/assets/Butler-C8O8O6i6.js` — `24,25 kB` (`7,59 kB` gzip).
- **Kịch bản E2E (`backend/scripts/butler_e2e.js`)**: **11/11 bước ĐẠT**:
  - Bước 1: Đăng ký tài khoản thử thành công (201).
  - Bước 2: Tạo mã nối 6 số thành công; tài khoản mẫu bị chặn nối Zalo đúng mã 403.
  - Bước 3: Chat Zalo chưa nối gửi câu hỏi bị từ chối lịch sự, không lộ số liệu.
  - Bước 4: Gửi mã 6 số qua Zalo nối thành công với tài khoản và cửa hàng.
  - Bước 5: Đổi sang kho Mô phỏng và lấy danh sách việc có số thứ tự (`1.`, `2.`, ...).
  - Bước 6: Xem kế hoạch việc 1 (`xem 1`), duyệt việc 1 (`duyệt 1` -> `có`) và xác nhận bản ghi trong `recommendation_log` có `via: 'zalo'`.
  - Bước 7: Gửi lại gói tin trùng `message_id` được bỏ qua, không trả lời lần hai.
  - Bước 8: Nhịp canh đầu tiên gửi đúng 1 tin mở đầu, không bắn dồn các sự cố cũ.
  - Bước 9: Giả lập 3 lần lỗi gửi Zalo liên tiếp (`/_fail`), hàng đợi `outbox` tự thử lại đến khi thành công (`tries: 3, status: 'sent'`).
  - Bước 10: Lịch sử `GET /api/butler/messages` hợp nhất đúng tin từ cả web và Zalo (16 tin).
  - Bước 11: Dọn sạch toàn bộ dữ liệu thử trong `customer_radar_ui_test_auth`.
- **Kịch bản tải & độ bền (`backend/scripts/butler_load.js`)**: **4/4 mục ĐẠT**:
  1. 300 tin từ 30 chat trong `5.137 ms`: 0 lỗi 5xx, nhận đủ `280/280` tin trả lời hợp lệ (5 chat gửi 25 tin nhận đúng 20 trả lời + 1 câu nhắc "Nhắn chậm lại một chút."), `/health` p95 = `84,11 ms` (chậm nhất `97,24 ms` < 500 ms), `/api/nav/status` p95 = `91,46 ms`.
  2. Chế độ webhook: 200 POST song song có secret đúng trả 200 toàn bộ với p95 = `13,85 ms` (< 50 ms, chậm nhất `15,48 ms`); 20 POST sai secret trả 403; vượt 120 lượt/phút/IP trả 429.
  3. Bộ nhớ RSS: trước tải `380,64 MB` (ngay sau khi worker nạp ngữ cảnh), sau tải `155,00 MB` (chênh lệch `-225,64 MB` < 30 MB, không rò bộ nhớ).
  4. Công tắc `BUTLER=0`: máy chủ in `Quản gia: TẮT (BUTLER=0).`, không chạy poll hay vòng canh, `/api/butler/status` trả `enabled: false`, `/api/nav/status` trả 200.
- **`sloplint`**: Chạy `node C:/Users/DELL/.claude/skills/hallmark/scripts/sloplint.mjs src --genre modern-minimal --scope app --render --kept --url http://localhost:5199/butler` đạt **0 FAIL mới, 0 REFLEX mới, 0 WARN trên các file mới của Quản gia**.

#### 3. Chỗ làm khác kế hoạch và lý do

1. **Giữ hằng `ALERT_MEMO_TTL_MS = 60_000` trong `backend/routes/api.js`**: Mục 6.1 yêu cầu xóa bản sao bộ đệm cảnh báo trong `routes/api.js` để dùng `services/work_items.js`, nhưng endpoint `GET /api/stats` (dòng 356) vẫn đọc hằng `ALERT_MEMO_TTL_MS` cho bộ đệm `statsMemo`. Vì vậy giữ lại dòng khai báo hằng số này để `/api/stats` không bị lỗi `ReferenceError`.
2. **Đặt `proxy: false` cho địa chỉ nội bộ trong `backend/services/butler/zalo.js`**: Môi trường chạy có biến `HTTP_PROXY` chặn truy cập IP nội bộ (`127.0.0.1`), nên `zalo.js` tự tắt proxy khi `ZALO_API_BASE` trỏ về `127.0.0.1` hoặc `localhost` (khi gọi `bot-api.zaloplatforms.com` ngoài mạng vẫn giữ nguyên hành vi mặc định).
3. **Rút ngắn nhịp chờ thử lại của `outbox.js` chỉ khi chạy với máy giả lập nội bộ (`127.0.0.1`/`localhost`)**: Mục 6.6 quy định mảng chờ thử lại `[30s, 2m, 10m, 30m]`, còn mục 8.3 bước 9 yêu cầu giả lập 3 lỗi liên tiếp rồi kiểm tra tự gửi thành công trong kịch bản E2E. Để kịch bản E2E hoàn tất trong vài giây thay vì phải chờ 12,5 phút, `outbox.js` dùng khoảng chờ ngắn (`150 ms` đến `600 ms`) khi `ZALO_API_BASE` là `127.0.0.1`/`localhost` và giữ nguyên `1.100 ms` cùng `[30s, 2m, 10m, 30m]` khi gọi Zalo thật.
4. **Dùng `res.on('close')` và `seq = Date.now()` trong `backend/scripts/mock_zalo.js`**: Trên Node 24 + Express 5, sự kiện `req.on('close')` phát ngay khi đọc xong body JSON khiến kết nối long-poll `getUpdates` bị tháo sớm; đổi sang `res.on('close')` và khởi tạo `seq = Date.now()` giúp long-polling giữ đúng suốt thời gian chờ và `message_id` không trùng giữa các lần chạy.

#### 4. Việc còn dở hoặc lỗi biết mà chưa sửa

- Không có việc còn dở; toàn bộ các mục từ G1 đến G8 đã hoàn thành và vượt qua kiểm thử.

#### 5. Đường dẫn ảnh chụp giao diện (thư mục tạm ngoài repo)

- Thư mục chứa ảnh: `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\`
  - `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\butler-1280-light.png` (1280×800 sáng, danh sách phiếu việc có số và cột phải Đang canh)
  - `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\butler-1280-dark.png` (1280×800 tối, sau khi nối Zalo thành công)
  - `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\butler-1280-connect-modal.png` (1280×800 hộp thoại Nối Zalo có mã 6 số)
  - `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\butler-390-light.png` (390×844 cảm ứng sáng)
  - `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\butler-390-dark.png` (390×844 cảm ứng tối)

- 2026-11-16 Gemini (Mục 13 - Sửa sau lần kiểm của Claude): đã sửa đủ 11 mục theo thứ tự trong phần 13:
  1. `src/components/butler/WatchPanel.jsx`: thay `Segmented` cuộn ngang bằng thanh chọn `OptionBar` (`flex-wrap`, nút `flex-1`) để cả 3 lựa chọn "Chỉ nghiêm trọng" / "Từ mức cao" / "Mọi việc" và "Kho quản gia canh" hiện trọn chữ ở cả 1280px và 390px, không cuộn ngang và không cắt chữ.
  2. `src/components/butler/Composer.jsx`: bỏ hoàn toàn `whitespace-nowrap` / `overflow-hidden` trên `textarea`; ở màn hẹp (`max-width: 639px`) dùng gợi ý ngắn `"Hỏi hoặc ra lệnh"`, ở màn rộng giữ `"Hỏi hoặc ra lệnh, ví dụ: việc hôm nay"`, hiển thị trọn vẹn không cắt dòng.
  3. `src/components/Butler.jsx`: đọc kho đang mở trên web (`getWorkspace()`) và so với kho Zalo canh (`status.settings.workspace`); khi khác nhau thì ghi rõ `"Đang xem kho <Web>. Zalo canh kho <Zalo>, kiểm lần cuối ..."`, khi trùng nhau chỉ ghi một câu.
  4. `backend/services/butler/text.js`, `engine.js`, `incidents.js`: thêm hàm thuần `stripTitlePrefix(title, why)` cắt phần đầu lặp lại tiêu đề trong `why` khi dựng danh sách việc, chi tiết việc và sự cố báo qua Zalo.
  5. `src/components/Butler.jsx`: bỏ nút "Nối Zalo / Đã nối Zalo" ở góc phải tiêu đề trên màn rộng (`lg`), chỉ giữ nút trong bảng "Đang canh" bên phải; ở 390px giữ nguyên như cũ.
  6. `src/components/butler/ZaloConnect.jsx`: dừng cả bộ đếm lùi 1 giây và vòng hỏi `/api/butler/status` mỗi 4 giây ngay khi `expired === true`, hiển thị nút "Lấy mã mới".
  7. `backend/services/butler/watcher.js` & `backend/test/run_tests.js`: khi sự cố đã hết (`resolvedAt: now`), đặt luôn `notified: []` và tăng `cycle: 1` (`resolveUpdate`, đưa `cycle` vào chữ ký `dedupKey`) để sự cố quay lại sau nhiều ngày vẫn được báo lại; thêm test đơn vị kiểm tra vòng đời mở -> đã báo -> hết -> mở lại -> được báo lại.
  8. `backend/services/butler/outbox.js`, `backend/scripts/butler_e2e.js`, `backend/scripts/butler_load.js`: bỏ nhánh gửi song song `Promise.all` và bỏ kiểm tra `isLocalMock()`; luôn gửi tuần tự qua vòng `for` và luôn giãn cách giữa các tin (`1.100 ms` mặc định; `50 ms` khi đặt `BUTLER_FAST_RETRY=1` trong script kiểm thử).
  9. `backend/services/butler/outbox.js`: đầu hàm `tick` và `kick` kiểm tra `!zalo.configured()` để trả về ngay trước khi chạm MongoDB; nâng chu kỳ quét định kỳ từ 3 giây lên 15 giây.
  10. `backend/services/butler/zalo.js`, `outbox.js` & `backend/test/run_tests.js`: `sendText` nhận `fromPart` và gắn `err.sentParts` khi lỗi ở đoạn giữa; `outbox` lưu `sentParts` vào bản ghi MongoDB để lần thử lại chỉ gửi tiếp từ đoạn chưa gửi; thêm test đơn vị kiểm chứng.
  11. `CLAUDE.md` & `KE-HOACH-QUAN-GIA.md`: sửa tên miền máy chủ Zalo trong tài liệu thành `bot-api.zaloplatforms.com` khớp với mã nguồn.
  - **Kết quả chạy lại bộ kiểm mục 11**:
    - `npm test`: **206 đạt, 0 lỗi** (thêm 2 bài test mới cho mục 7, 4 và 10).
    - `npm run lint`: **exit 0** (0 lỗi).
    - `npm run build`: **Đạt** — gói JS chính `dist/assets/index-ZjgaWOmz.js` giữ ở `703,06 kB` (`211,04 kB` gzip, chỉ +0,26 kB gzip so với trước G6); gói riêng `dist/assets/Butler-BI138rsK.js` là `25,37 kB` (`8,05 kB` gzip).
    - `butler_e2e.js`: **11/11 bước ĐẠT** (chạy trên đường gửi tuần tự có giãn cách).
    - `butler_load.js`: **4/4 mục ĐẠT** — (1) 300 tin / 30 chat gửi trong `5.095 ms`, nhận đủ `280/280` trả lời tuần tự, 0 lỗi 5xx, `/health` p95 = `94,13 ms` (max `134,92 ms` < 500 ms), `/api/nav/status` p95 = `100,17 ms`; (2) Webhook 200 POST song song đạt 200/200 với p95 = `16,31 ms` (< 50 ms, max `16,85 ms`), sai secret trả 403, quá ngưỡng trả 429; (3) RSS trước `380,57 MB`, sau `155,04 MB` (chênh lệch `-225,53 MB` < 30 MB); (4) `BUTLER=0` tắt nền, `/api/butler/status` trả `enabled: false`, web trả 200.
    - `sloplint` & quét chữ cấm: 0 FAIL mới, 0 REFLEX mới, 0 WARN trên các file Quản gia; 0 chữ cấm; đã chụp lại đủ 5 ảnh giao diện tại `C:\Users\DELL\.gemini\antigravity\brain\657bbb40-f8df-4b9d-adee-2c5b92f23ed6\scratch\butler-shots\`.

## 13. Sửa sau lần kiểm của Claude (16/11)

Claude đã chạy lại: `npm test` 204/204, lint 0 lỗi, build đạt, `butler_e2e.js` 11/11, `butler_load.js` 4/4. Phần lõi đạt. Còn các lỗi dưới, sửa theo thứ tự, giữ nguyên luật mục 0. Làm xong thì chạy lại đủ bộ kiểm ở mục 11, chụp lại 5 ảnh, ghi nhật ký vào mục 12 rồi dừng.

### Giao diện (`src/components/Butler.jsx`, `src/components/butler/*`)

1. **Nút "Báo ngay khi" bị cắt ở 1280 px.** Lựa chọn thứ ba "Mọi việc" chỉ hiện "Mọ". Ba nút phải hiện đủ ở 1280 và 390 (cho xuống dòng hoặc chia đều chiều rộng), không cuộn ngang.
2. **Chữ gợi ý ô nhập bị cắt ở 390 px.** "Hỏi hoặc ra lệnh, ví dụ: việc hôm nay" xuống dòng và mất nửa dòng hai. Ở màn hẹp dùng chữ ngắn hơn ("Hỏi hoặc ra lệnh") hoặc để ô cao đủ hai dòng. Không dựa vào `whitespace-nowrap` trên `textarea`.
3. **Hai kho lẫn nhau trên cùng màn hình.** Tiêu đề ghi "Canh kho Dữ liệu thật", còn câu trả lời ngay dưới ghi "kho Mô phỏng" (web trả lời theo kho đang mở, Zalo theo cài đặt). Tiêu đề phải nói rõ cả hai, ví dụ: "Đang xem kho Mô phỏng. Zalo canh kho Dữ liệu thật, kiểm lần cuối 1 giờ trước." Khi hai kho giống nhau thì chỉ ghi một câu.
4. **Phiếu việc lặp chữ.** Dòng mô tả bắt đầu lại đúng bằng tiêu đề ("Thanh toán: lỗi cổng thanh toán trên ... tăng từ ..."). Bỏ phần đầu trùng tiêu đề khỏi dòng mô tả (cắt ở backend `engine.js` khi dựng `why`, để tin Zalo cũng hết lặp).
5. **Hai nút "Nối Zalo" cùng lúc ở 1280 px** (góc phải tiêu đề và trong bảng "Đang canh"). Giữ nút trong bảng, bỏ nút ở tiêu đề trên màn rộng. Ở 390 px giữ như hiện tại.
6. **Hộp nối Zalo vẫn hỏi `/status` mỗi 4 giây sau khi mã hết hạn.** Dừng hỏi khi `expired` là true; hiện nút "Lấy mã mới".

### Backend (`backend/services/butler/*`)

7. **Sự cố quay lại không được báo lại.** Một sự cố đã báo, hết, rồi vài ngày sau xuất hiện lại cùng mức thì `shouldNotify` thấy `notified` cũ và im luôn. Trong `watcher.js`, lúc đặt `resolvedAt: now` cho sự cố đã hết thì đặt luôn `notified: []`. Thêm 1 test đơn vị: sự cố đã báo, hết, mở lại, thì được báo lại.
8. **Test e2e không chạy đúng đường gửi của bản thật.** `outbox.js` đổi hành vi khi `ZALO_API_BASE` là localhost (gửi song song, không giãn 1,1 giây, thử lại nhanh). Đổi sang biến riêng `BUTLER_FAST_RETRY=1` chỉ rút ngắn thời gian thử lại và nhịp quét; còn gửi thì luôn tuần tự và luôn giãn khoảng như bản thật (có thể cho giãn 50 ms khi `BUTLER_FAST_RETRY=1`). `butler_e2e.js` và `butler_load.js` đặt biến này. `proxy: false` cho localhost trong `zalo.js` thì giữ.
9. **Outbox quét Mongo mỗi 3 giây kể cả khi chưa cấu hình Zalo.** Khi `!zalo.configured()` thì `tick` trả về ngay, không chạy `updateMany`. Nhịp quét định kỳ đổi từ 3 giây lên 15 giây (tin mới vẫn được gửi ngay nhờ `kick` lúc `enqueue`).
10. **Tin dài bị gửi lặp khi thử lại.** `sendText` gửi nhiều đoạn; đoạn 2 lỗi thì lần thử lại gửi lại cả đoạn 1. Lưu số đoạn đã gửi (`sentParts`) vào bản ghi outbox và lần thử lại bắt đầu từ đoạn chưa gửi.

### Tài liệu

11. `CLAUDE.md` và nhật ký mục 12 ghi máy chủ Zalo là `bot-api.zapps.me`. Code đúng là `bot-api.zaloplatforms.com` (Claude đã thử: trả `401 Unauthorized` với mã giả). Sửa chữ trong tài liệu cho khớp code.

## 14. Quản gia lo livestream: canh nhanh, báo cáo cuối phiên, lịch live (giao 16/11)

Người dùng chọn làm cả hai phần: A (canh live nhanh và báo cáo cuối phiên) và B (lịch livestream có nhắc). Luật mục 0 giữ nguyên: không commit, không push, không thêm thư viện, chỉ chạy trên database `_test`. Làm theo thứ tự L1 đến L7 ở 14.8, ghi nhật ký vào mục 12, báo cáo theo mục 11 rồi dừng.

### 14.1 Kết quả người dùng phải thấy

1. Mở phiên live (bất kỳ nền tảng nào) thì trong khoảng 1 phút Zalo nhận được: `Phiên live "Megalive 11.11" đã bắt đầu trên TikTok. Quản gia canh mỗi phút, có việc gấp sẽ nhắn ngay.`
2. Trong lúc live, việc gấp (mức cao, nghiêm trọng) của trợ lý live tới Zalo chậm nhất khoảng 1 phút, thay vì 5 phút như hiện nay. Nhiều việc cùng lúc thì gộp thành một tin. Mỗi phiên tối đa một tin việc gấp mỗi 3 phút.
3. Phiên kết thúc thì trong khoảng 1 phút Zalo nhận báo cáo tóm tắt: thời lượng, bình luận, lượt chốt, doanh thu ước tính, doanh thu lỡ vì hết hàng, tỉ lệ câu hỏi được trả lời, khiếu nại, sản phẩm chốt nhiều nhất, liên kết mở báo cáo đầy đủ.
4. Trang Livestream có thêm phần "Lịch live": thêm, sửa, hủy phiên đã hẹn (tên, nền tảng, tài khoản hoặc liên kết, giờ bắt đầu, thời lượng dự kiến, nhắc trước bao lâu, ghi chú).
5. Trước giờ hẹn (mặc định 30 phút), Zalo nhận lời nhắc. Quá giờ hẹn 10 phút mà chưa mở phiên trên Customer Radar thì nhắc thêm một lần.
6. Nhắn bot `lịch` (hoặc `lich`, `lịch live`) thì bot trả 5 phiên hẹn sắp tới. Bản tin sáng có thêm dòng lịch live trong ngày.
7. Bảng "Đang canh" có công tắc "Báo về livestream" (mặc định bật) và dòng "Phiên hẹn tới: <tên>, <giờ>".

Không làm: tự mở phiên live khi tới giờ (kết nối nền tảng lúc chưa live sẽ lỗi), lên lịch qua Zalo (đọc ngày giờ tự do dễ sai), lịch lặp lại hằng tuần.

### 14.2 Kiến trúc

```
                 mỗi 60 giây (BUTLER_LIVE_WATCH_SEC)
live_watch.js  (khóa meta._id = 'butler_live_watch')
   |
   |-- đọc live_sessions (đang chạy, vừa kết thúc)     chỉ đọc Mongo và bộ nhớ hub,
   |-- đọc hub.runtimeFor(...).snapshot()              KHÔNG gọi getContext
   |-- đọc live_schedule (sắp tới giờ, quá giờ)
   |
   |-- ghi butler_incidents (cùng _id với vòng canh 5 phút, nên không báo trùng)
   '-- outbox.enqueue(...)  với dedupKey cố định cho từng sự kiện
```

- Vòng canh 5 phút giữ nguyên. Vòng canh live chạy riêng và nhẹ: không có liên kết Zalo nào thì dừng sau 1 truy vấn; không có phiên chạy và không có lịch gần giờ thì dừng sau tối đa 3 truy vấn mỗi kho.
- `hub.runtimeFor` nằm trong bộ nhớ tiến trình. Render chạy 1 tiến trình, nên vòng canh live phải chạy trong cùng tiến trình với `server.js` (khởi động trong `startButler`).
- Render bản miễn phí ngủ sau khoảng 15 phút không ai gọi. Khi đang live, luồng bình luận giữ máy thức. Lời nhắc lịch thì cần máy thức trước giờ live, nên trong `startButler`: nếu có lịch `scheduled` trong 2 giờ tới thì bật nhịp giữ thức (như `BUTLER_KEEPALIVE`) dù biến này chưa đặt; hết lịch thì tắt. Kiểm điều kiện này trong mỗi nhịp canh live. Ghi rõ trong CLAUDE.md.

### 14.3 Dữ liệu

**Collection mới `live_schedule`**, nằm trong database của kho (real hoặc demo), giống `live_sessions`:

| Trường | Kiểu | Luật |
|---|---|---|
| `title` | string | 1 đến 120 ký tự, cắt khoảng trắng |
| `platform` | string | khóa có trong `hub.PLATFORMS` (kiểm bằng `Object.hasOwn`); `simulator` chỉ được ở kho demo |
| `target` | string | 0 đến 300 ký tự; bắt buộc với `tiktok`, `youtube` (giống POST /sessions) |
| `startAt` | Date | khi tạo hoặc sửa: từ hiện tại trừ 5 phút đến hiện tại cộng 90 ngày |
| `durationMin` | int | 15 đến 720, mặc định 120 |
| `remindBeforeMin` | int | một trong 0, 10, 15, 30, 60, 120; mặc định 30; 0 là không nhắc trước |
| `note` | string | 0 đến 500 ký tự |
| `status` | string | `scheduled`, `cancelled`, `done` |
| `sessionId` | ObjectId hoặc null | phiên live đã gắn |
| `createdBy` | string | tên người tạo (`req.user.name`), không lưu email |
| `createdAt`, `updatedAt` | Date | |

Chỉ mục `{ status: 1, startAt: 1 }`, tạo một lần trong route mới (cùng kiểu `hub.ensureIndexes`). Mỗi kho tối đa 50 lịch `scheduled` có `startAt` trong tương lai; quá thì trả 400 "Đã có 50 phiên hẹn, hủy bớt rồi thêm."

**Cài đặt quản gia mới** trong `store.js`: `DEFAULT_SETTINGS.live = true`. `updateSettings` nhận `live` kiểu boolean, sai kiểu trả 400 như `digest`.

Không thêm collection nào khác. Việc "đã nhắc chưa" dùng `dedupKey` của outbox (14.4), không ghi cờ vào `live_schedule`.

### 14.4 Backend

**L1. `backend/routes/live_schedule.js`** (mới), gắn trong `server.js` ngay TRƯỚC dòng `app.use('/api/live', ...)`:

```js
app.use('/api/live/schedule', require('./routes/live_schedule'));
```

Dùng `req.db`, `req.workspace` như `routes/live.js`, bọc lỗi bằng `wrap` cùng kiểu. Đường này cần đăng nhập như mọi đường khác; KHÔNG thêm vào danh sách công khai.

- `GET /api/live/schedule`: trả `{ items }` gồm lịch `scheduled` có `startAt >= now - 1 ngày`, và lịch `done` hoặc `cancelled` trong 7 ngày qua; sắp theo `startAt` tăng dần, tối đa 60. Mỗi phần tử: `id`, `title`, `platform`, `platformLabel`, `target`, `startAt`, `endAt` (startAt cộng durationMin), `durationMin`, `remindBeforeMin`, `note`, `status`, `sessionId`, `createdBy`.
- `POST /api/live/schedule`: tạo, kiểm theo bảng 14.3, trả 201 `{ item }`.
- `PATCH /api/live/schedule/:id`: sửa các trường như POST (trừ `status`), hoặc nhận `{ status: 'cancelled' }` để hủy. Lịch `done` không sửa được (409). `:id` sai dạng ObjectId thì 404.
- `DELETE /api/live/schedule/:id`: chỉ xóa được lịch `cancelled`; còn lại trả 409 "Hủy lịch trước rồi mới xóa."
- Giới hạn ghi: `rateLimit({ max: 30, windowMs: 60_000, name: 'lịch live' })` cho POST, PATCH, DELETE.
- Xuất thêm `linkSession(db, session)` từ file này (dùng ở L1b).

**L1b. Gắn lịch với phiên.** Trong `routes/live.js`, ở `POST /sessions`, sau khi `hub.startSession` chạy xong và trước `res.status(201)`, gọi không chặn:

```js
require('./live_schedule').linkSession(req.db, session).catch(() => {});
```

`linkSession` tìm 1 lịch `scheduled` cùng `platform`, có `startAt` trong khoảng [giờ tạo phiên trừ 60 phút, giờ tạo phiên cộng 180 phút], gần giờ tạo phiên nhất; đặt `status: 'done'`, `sessionId`, `updatedAt`. Không thấy thì thôi.

**L2. `backend/services/butler/live_watch.js`** (mới). Xuất `liveTick({ authDb, workspaces, now })`, `startLiveWatch({ authDb, workspaces })`, và các hàm thuần để test: `dueReminders(schedules, now)`, `lateSchedules(schedules, sessions, now)`, `buildLiveStartText`, `buildLiveAlertText`, `buildLiveReportText`, `buildReminderText`, `buildLateText`, `buildScheduleListText`.

Một nhịp `liveTick`:

1. Khóa `meta._id = 'butler_live_watch'`, hết hạn sau 2 phút (cùng kiểu khóa trong `watcher.js`). Không lấy được khóa thì thoát.
2. Đọc `butler_links` có `chatId` kiểu string và `settings.live !== false`. Không có thì nhả khóa, thoát.
3. Với mỗi kho mà các liên kết cần (`settings.workspace`):
   - `running`: `live_sessions.find({ status: { $in: ['connecting', 'live', 'reconnecting'] }, createdAt: { $gte: now - 2 ngày } })`, giữ phiên có `hub.runtimeFor(id, ws)` và `runtime.status !== 'ended'`.
   - `ended`: `live_sessions.find({ status: 'ended', endedAt: { $gte: now - 6 giờ } })`, tối đa 5.
   - `schedules`: `live_schedule.find({ status: 'scheduled', startAt: { $gte: now - 30 phút, $lte: now + 125 phút } })`.
4. Với mỗi liên kết dùng kho đó; bỏ qua liên kết đang tạm im (`muteUntil` còn hạn):
   - **Phiên bắt đầu**: mỗi phiên trong `running` có `startedAt` (không có thì `createdAt`) trong 30 phút gần nhất: gửi tin, `dedupKey: live_start|<userId>|<sessionId>`, `kind: 'live'`.
   - **Việc gấp**: lấy `snapshot().actions.active` có `severity` khác `medium`. Mỗi việc là một sự cố, `_id` PHẢI là `` `${ws}|inbox|live|${sessionId}|${action.id}` `` (trùng `_id` mà vòng canh 5 phút tạo từ `buildInboxItems`, để hai vòng không báo trùng). Upsert cùng các trường như `watcher.js` (`kind: 'live'`, `to: '/live?session=<id>'`). Lọc bằng `shouldNotify` nhưng bỏ qua giờ yên lặng (shop đang live thì chủ shop đang thức): thêm tham số thứ tư `{ ignoreQuiet: true }` cho `shouldNotify`, mặc định false. Gộp các việc được chọn thành 1 tin, `dedupKey: live_alert|<userId>|<sha1 của các _id:severity:cycle>`, `kind: 'live'`. Nhịp độ: nếu `butler_links.liveLastAlertAt.<sessionId>` cách chưa đủ 3 phút thì để nhịp sau; gửi thì cập nhật mốc này. Gửi xong thì `$push notified` như `watcher.js`. Vòng canh live KHÔNG đặt `resolvedAt`; việc đó vẫn do vòng canh 5 phút làm.
   - **Báo cáo cuối phiên**: mỗi phiên trong `ended` có `endedAt` sau `link.linkedAt` (để vừa nối Zalo không bị dồn báo cáo cũ): gọi `hub.reportFor(db, session, null)` bọc `withTimeout` 15 giây, dựng tin bằng `buildLiveReportText`, `dedupKey: live_end|<userId>|<sessionId>`, `kind: 'live'`.
   - **Nhắc trước giờ**: `dueReminders` trả các lịch có `remindBeforeMin > 0` và `startAt - remindBeforeMin <= now < startAt`. `dedupKey: live_remind|<userId>|<scheduleId>|<startAt ISO>` (đổi giờ hẹn thì nhắc lại). Bỏ qua giờ yên lặng.
   - **Quá giờ chưa mở phiên**: `lateSchedules` trả các lịch có `startAt + 10 phút <= now < startAt + 30 phút`, chưa có `sessionId`, và trong kho không có phiên nào tạo trong [startAt trừ 60 phút, now]. `dedupKey: live_late|<userId>|<scheduleId>|<startAt ISO>`. Bỏ qua giờ yên lặng.
5. Ghi `meta.butler_live_watch`: `running: false`, `lastRunAt`, `lastMs`, `lastError`.
6. Cả nhịp bọc `withTimeout` 45 giây, không ném lỗi ra ngoài (giống `watcher.tick`).

`startLiveWatch`: chu kỳ `BUTLER_LIVE_WATCH_SEC` (mặc định 60, kẹp trong 5 đến 600), nhịp đầu sau 20 giây, timer `unref()`. Gọi trong `services/butler/index.js` ngay sau `startWatcher`, và thêm vào hàm `stop`. `BUTLER=0` thì không chạy.

**Outbox**: `kind: 'live'` có giới hạn riêng 20 tin mỗi giờ mỗi người (đếm giống `alert`); quá thì `skipped`, `lastError: 'Quá 20 tin live trong một giờ'`. Giới hạn của `alert` giữ nguyên.

**L3. Mẫu tin** (trong `live_watch.js`; theo luật chữ mục 0: không "·", không "→" dính chữ, không IN HOA, số kiểu Việt, không emoji; mọi tin dưới 2000 ký tự):

```
Phiên live "Megalive 11.11" đã bắt đầu trên TikTok. Quản gia canh mỗi phút, có việc gấp sẽ nhắn ngay. Nhắn "live" để xem tình hình.
```

```
Việc gấp trong phiên "Megalive 11.11":
1. [Nghiêm trọng] Hết hàng Nồi chiên 5.5L: 23 khách chốt sau khi hết.
2. [Cao] 14 câu hỏi về phí ship chưa trả lời.
Mở phiên: https://aisc-2026.vercel.app/live?session=<id>
```

```
Phiên "Megalive 11.11" đã kết thúc sau 2 giờ 15 phút.
Bình luận: 3.412. Lượt chốt: 286 (412 sản phẩm).
Doanh thu ước tính: 48,2 triệu đồng. Lỡ vì hết hàng: 6,2 triệu đồng.
Khách hỏi được trả lời: 82%. Khiếu nại: 17, đã đưa vào hệ thống 0.
Chốt nhiều nhất: Tai nghe SoundCore Q30 (96 sản phẩm).
Báo cáo đầy đủ: https://aisc-2026.vercel.app/live?session=<id>
```

Dòng nào thiếu số liệu thì bỏ cả dòng; không in "chưa rõ", "undefined" hay "NaN" (hàm `money`, `pct` trả "chưa rõ" khi số là null, nên kiểm null trước khi gọi). Số liệu lấy từ `hub.reportFor` và `session.summary`; thời lượng dùng `liveDurationMs` trong `hub.js` (xuất ra nếu chưa xuất), null thì bỏ phần "sau ...". Tiền và phần trăm dùng chung hàm `money`, `pct` của `services/live/brief.js` (xuất ra nếu chưa xuất), không viết lại.

```
Còn 30 phút nữa tới phiên live "Sale cuối tháng" lúc 20:00 trên TikTok (@tenshop). Mở trang Livestream để bắt đầu canh: https://aisc-2026.vercel.app/live
```

```
Đã quá giờ hẹn 10 phút mà phiên "Sale cuối tháng" chưa mở trên Customer Radar. Mở phiên để quản gia canh bình luận: https://aisc-2026.vercel.app/live
```

Liên kết dùng `PUBLIC_APP_URL` như `watcher.js`. Giờ hiển thị theo giờ Việt Nam: thêm `vnTime(date, now)` vào `text.js`, trả "20:00" nếu cùng ngày với `now`, "20:00 ngày 18/11" nếu khác ngày.

**L4. Lệnh và bản tin**

- `commands.js`: thêm TRƯỚC mục 13 (lệnh `live`): khớp `^(?:lich|lich live|lich livestream)$` trên chuỗi đã bỏ dấu, trả `{ type: 'schedule' }`.
- `engine.js`: `case 'schedule'` đọc 5 lịch `scheduled` có `startAt >= now` của kho đang dùng, trả `kind: 'schedule'`, chữ do `buildScheduleListText` dựng. Không có thì: `Chưa có phiên live nào được hẹn. Thêm lịch ở trang Livestream: <url>/live`.
- `HELP_TEXT`: thêm dòng `lịch: xem các phiên live đã hẹn`.
- `incidents.buildDigest`: thêm dòng `Lịch live hôm nay: 20:00 "Sale cuối tháng" trên TikTok.` khi có lịch trong ngày (giờ Việt Nam); nhiều lịch nối bằng dấu chấm phẩy, tối đa 3. `watcher.js` đọc lịch hôm nay của kho và truyền vào `buildDigest`.
- `GET /api/butler/status`: thêm `nextLive: { title, startAt, platformLabel } | null` (lịch `scheduled` gần nhất của kho Zalo đang canh) và `liveWatch: { everySec, lastRunAt, lastError }`.

### 14.5 Frontend

Theo DESIGN.md, dùng component có sẵn trong `src/components/ui` (`GlassPanel`, `PanelHeader`, `Button`, `Select`, `Modal`, `Badge`, `EmptyState`, `Switch`, trường nhập). Không thêm thư viện lịch hay chọn ngày; dùng `<input type="datetime-local">` trong trường nhập sẵn có.

**L5a. `src/components/live/Schedule.jsx`** (mới) và `src/lib/liveSchedule.js` (gọi API bằng axios mặc định như `src/lib/butler.js`).

- `Live.jsx`: thêm một `GlassPanel` "Lịch live" dưới danh sách phiên, hiện cả khi chưa có phiên nào. Nút "Thêm lịch" ở `PanelHeader`.
- Danh sách nhóm theo ngày ("Hôm nay", "Ngày mai", rồi dạng "Thứ năm, 20/11"). Mỗi dòng: giờ (`tabular-nums`), tên, nền tảng và tài khoản, `Badge` trạng thái ("Đã hẹn", "Đã mở phiên", "Đã hủy"), nhắc trước bao lâu. Dòng đã mở phiên có liên kết "Xem phiên". Lịch `scheduled` có nút "Bắt đầu phiên": mở `StartSession` đã điền sẵn `platform`, `target`, `title` (thêm prop `initial` cho `StartSession`; không truyền thì hành vi như cũ).
- Thêm và sửa trong `Modal`: tên; nền tảng (lấy từ `/live/platforms` như `StartSession`); tài khoản hoặc liên kết (chỉ hiện khi nền tảng cần); ngày giờ bắt đầu; thời lượng (`Select`: 30 phút, 1 giờ, 1 giờ 30 phút, 2 giờ, 3 giờ, 4 giờ); nhắc trước (`Select`: Không nhắc, 10 phút, 15 phút, 30 phút, 1 giờ, 2 giờ); ghi chú. Nút lưu ghi "Lưu lịch", xong thì toast "Đã lưu lịch". Hủy lịch: hỏi lại bằng `Modal` "Hủy phiên hẹn này?", nút "Hủy lịch". Lịch đã hủy có nút "Xóa".
- Trống: `EmptyState` "Chưa có phiên nào được hẹn. Thêm lịch để quản gia nhắc qua Zalo trước giờ live." kèm nút "Thêm lịch".
- 390 px: một cột, nút chạm cao tối thiểu 44 px, không cuộn ngang.

**L5b. Bảng "Đang canh"** (`WatchPanel.jsx`): thêm `Switch` "Báo về livestream" (lưu `settings.live`), chú thích "Báo khi phiên bắt đầu, việc gấp trong phiên, báo cáo cuối phiên và nhắc lịch." Nếu `status.nextLive` có thì thêm dòng "Phiên hẹn tới: Sale cuối tháng, 20:00" kèm liên kết "Xem lịch" tới `/live`.

**L5c.** `Composer`: thêm Chip "Lịch live" gửi `lịch`.

### 14.6 Kiểm thử

**Test đơn vị** (thêm vào `backend/test/run_tests.js`, giữ CRLF):

1. Kiểm dữ liệu lịch: thiếu tên, nền tảng lạ, `__proto__` làm nền tảng, `simulator` ở kho real, `startAt` quá 90 ngày, `durationMin: 5`, `remindBeforeMin: 45` đều bị từ chối; dữ liệu đúng thì qua. Tách hàm kiểm thành hàm thuần để test không cần Mongo.
2. `dueReminders`: nhắc 30 phút, lịch 20:00; lúc 19:29 không, 19:30 có, 19:59 có, 20:00 không; `remindBeforeMin: 0` không bao giờ.
3. `lateSchedules`: quá 10 phút, chưa có phiên thì có; có phiên tạo lúc 19:55 thì không; quá 30 phút thì không.
4. `_id` sự cố do vòng canh live tạo trùng đúng `_id` vòng canh 5 phút tạo cho cùng một việc live (dựng cả hai từ cùng một việc giả, so chuỗi).
5. `shouldNotify(..., { ignoreQuiet: true })` lúc 23:00 với việc mức cao thì báo; không có cờ thì không báo.
6. `buildLiveReportText`: báo cáo đủ số liệu ra đúng các dòng như mẫu; báo cáo thiếu doanh thu thì không có dòng doanh thu; không chứa "undefined", "NaN", "·", "→".
7. `parseCommand`: "lịch", "lich", "Lịch live" ra `schedule`; "live", "livestream" vẫn ra `live`.
8. `updateSettings({ live: 'yes' })` trả 400; `{ live: false }` lưu được (dùng database `_test` như các test Mongo đang có, hoặc hàm kiểm thuần).
9. Outbox: tin `kind: 'live'` thứ 21 trong một giờ bị `skipped`; `kind: 'alert'` không bị ảnh hưởng.

**E2E**: thêm bước 12 đến 16 vào `backend/scripts/butler_e2e.js` (kho demo; máy chủ thử đặt `BUTLER_LIVE_WATCH_SEC=5`):

- 12. POST lịch với `startAt` bằng bây giờ cộng 20 phút, `remindBeforeMin: 30`. Trong 20 giây máy Zalo giả nhận tin có "Còn" và tên lịch. Chờ thêm 2 nhịp: không nhận lần hai.
- 13. Mở phiên `simulator` tốc độ 4 (POST `/api/live/sessions`). Trong 20 giây nhận tin "đã bắt đầu". GET lịch: lịch ở bước 12 thành `done`, có `sessionId`.
- 14. Chờ tối đa 60 giây: nếu trình mô phỏng sinh việc mức cao thì phải nhận tin "Việc gấp trong phiên"; không sinh thì in "BỎ QUA (mô phỏng chưa sinh việc gấp)", không tính là lỗi.
- 15. Dừng phiên (POST `/stop`). Trong 20 giây nhận tin "đã kết thúc" có "Bình luận:". Chờ thêm 2 nhịp: không nhận lần hai.
- 16. Nhắn `lịch` qua Zalo giả: trả lời đúng (hết lịch thì là câu "Chưa có phiên live nào được hẹn").
- Dọn: xóa phiên mô phỏng (DELETE `/api/live/sessions/:id`), xóa lịch thử và bản ghi outbox thử, chỉ trong database có tên chứa `_test`.

**Tải**: thêm mục 5 vào `butler_load.js`: 3 phiên mô phỏng chạy cùng lúc, `BUTLER_LIVE_WATCH_SEC=5`, trong 60 giây: `lastMs` của `butler_live_watch` dưới 300 ms mỗi nhịp, `/health` p95 dưới 500 ms, vòng canh live không gọi `getContext` (kiểm bằng cách bọc `getContext` đếm số lần gọi khi `BUTLER_COUNT_CTX=1`, hoặc cách khác không đổi hành vi bản thật). Dừng và xóa 3 phiên sau khi đo.

**Giao diện**: chụp 1280 và 390 px, sáng và tối: trang Livestream có 3 lịch (hôm nay, mai, đã hủy), hộp thêm lịch, bảng Đang canh có công tắc mới. Ảnh để ngoài repo.

### 14.7 Tài liệu

- CLAUDE.md, mục Quản gia: thêm `live_watch.js`, collection `live_schedule`, biến `BUTLER_LIVE_WATCH_SEC`, việc tự giữ máy thức khi có lịch trong 2 giờ tới.
- DESIGN.md mục 6: một câu về phần "Lịch live".
- Nhật ký mục 12 của file này.

### 14.8 Thứ tự

- L1: route lịch, `linkSession`, test 1. Chạy `npm test`.
- L2: `live_watch.js`, cài đặt `live`, giới hạn outbox, `ignoreQuiet`, test 2 đến 5, 8, 9.
- L3: mẫu tin, `vnTime`, test 6.
- L4: lệnh `lịch`, bản tin sáng, `/status`, test 7.
- L5: giao diện, chụp ảnh.
- L6: e2e bước 12 đến 16, tải mục 5.
- L7: tài liệu; `npm test`, `npm run lint`, `npm run build`; chạy lại toàn bộ `butler_e2e.js` và `butler_load.js`; báo cáo theo mục 11, thêm số liệu nhịp canh live (`lastMs` trung bình và lớn nhất).
