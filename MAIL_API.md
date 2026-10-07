# API mail chung: EmailTick + Ghost Inbox

Đã đối chiếu Ghost Inbox bằng browser Network và request HTTP thật ngày 2026-10-07. Contract chi tiết nằm trong [GHOSTINBOX_DISCOVERY.md](GHOSTINBOX_DISCOVERY.md). Endpoint Livewire là internal/undocumented, có thể thay đổi; mọi chi tiết Ghost được cô lập trong GhostInboxProvider. Không dùng browser trong backend, không giải CAPTCHA/challenge hoặc giả fingerprint.

## Triển khai

```bash
cd backend
npm ci
npm run migrate:ghostinbox
# Restart backend bằng cách đang dùng trên VPS.
```

Migration chỉ thêm `ghostinbox_mailboxes`, không đổi/xóa bảng EmailTick hoặc account. Đã chạy thành công trên DB local; trên VPS cần chạy sau khi pull code. Không chạy seed.

Config trong `backend/.env.example`:

```dotenv
GHOSTINBOX_BASE_URL=https://temp-gmail.ghostinbox.net
GHOSTINBOX_TIMEOUT_MS=15000
GHOSTINBOX_RETRY_COUNT=2
GHOSTINBOX_POLL_INTERVAL_MS=10000
```

Interval được giới hạn tối thiểu 10 giây theo frontend. Timeout mỗi request, retry chỉ network tạm thời/5xx, tối đa 3 lần bổ sung. Không retry 403/429/schema/session invalid. Retry-After được lưu theo mailbox để request sau không gọi provider sớm hơn hạn. Không có cookie global hoặc password giả; session/cookie/CSRF/signed snapshot được lưu riêng trong state server-side.

## Tạo mailbox

```http
POST /api/mail/new
Content-Type: application/json
x-api-key: <API key thiết bị>
```

```json
{"provider":"GHOSTINBOX"}
```

```json
{
  "success": true,
  "provider": "GHOSTINBOX",
  "mailbox_id": "00000000-0000-4000-8000-000000000001",
  "email": "example@gmail.com"
}
```

Ví dụ curl (dùng URL HTTPS của VPS):

```bash
curl --silent --show-error --max-time 240 \
  'https://YOUR_VPS/api/mail/new' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  --data '{"provider":"GHOSTINBOX"}'
```

Chọn EmailTick qua API chung:

```json
{"provider":"EMAILTICK","types":"random"}
```

`types`/`random_count` chỉ dành cho EmailTick; thiếu types thì mặc định random. Không thêm RANDOM provider/health page vì không cần cho integration hiện tại.

## Lấy OTP

```http
GET /api/mail/code?mailbox_id=<uuid>&service=INSTAGRAM
x-api-key: <cùng API key đã tạo mailbox>
```

Service: `INSTAGRAM` (mặc định), `FACEBOOK`, `GENERIC`. Service chỉ lọc loại thư; provider email được xác định từ mailbox đã lưu, không lấy từ iPhone. `GENERIC` dùng cho thư test/thư không có sender Instagram/Facebook.

```json
{"success":true,"status":"WAITING","code":null}
```

```json
{"success":true,"status":"RECEIVED","code":"041374"}
```

```bash
curl --silent --show-error --max-time 60 \
  'https://YOUR_VPS/api/mail/code?mailbox_id=YOUR_MAILBOX_ID&service=INSTAGRAM' \
  -H 'x-api-key: YOUR_API_KEY'
```

Có thể thêm `requested_at=<Unix seconds>` để chỉ nhận thư từ lúc bắt đầu chờ. Luôn bỏ thư trước thời điểm tạo mailbox; requested_at không được vượt thời gian server quá 5 giây.

API chỉ đọc một lần mỗi request, không long-poll trên VPS. Ghost chưa đủ 10 giây từ lần đọc trước thì trả WAITING và không gọi upstream. AutoTouch chờ có giới hạn.

## OTP và chống mã cũ

Cả hai provider dùng chung selector/claim. Ghost normalize id/sender/subject/timestamp ISO/content thành message nội bộ; EmailTick có adapter giữ hành vi lấy code từ subject của API cũ. Ghost ưu tiên subject, rồi plain text, rồi HTML đã bỏ script/style/iframe/object; không execute HTML. OTP luôn string 6 số, giữ số 0 đầu.

Chọn thư mới nhất phù hợp service và timestamp hợp lệ; không mặc định messages[0]. Ghost lưu toàn bộ message ID đã trả cùng high-water timestamp để không trả lại ngay cả khi timestamp của ID cũ thay đổi. Row lock bao quanh cập nhật session/snapshot và claim OTP, nên request đồng thời không nhận cùng message. Session và lịch sử tồn tại qua restart.

OTP được lấy thành công một lần. Nếu tool gọi lại cùng mailbox sau RECEIVED và không có thư mới, API trả WAITING.

## AutoTouch

Helper cũ `tools/autotouch/emailtick.js` vẫn chạy độc lập và giữ `_EmailTick_New`/`_EmailTick_GetCode`. File này chứa transport/polling chung; helper mới `tools/autotouch/mail.js` tái sử dụng nó.

Nếu nhúng trực tiếp source vào tool, nhúng toàn bộ `emailtick.js` trước `mail.js`. Nếu dùng CommonJS, đặt hai file cạnh nhau và import `mail.js`.

```javascript
// Khi dùng CommonJS: const installMail = require('./mail');
installMail(API, {
    getBaseUrl: () => VPS_URL,
    getApiKey: () => VPS_API_KEY,
    exec: command => exec(command),
    safeParse: text => safeParse(text),
    sleep: seconds => TOOL._sleep(seconds, 't')
    // allowHttp: true // chỉ khi URL VPS hiện tại là http://
});

let mail = API._Mail_New('GHOSTINBOX');
if (!mail) return 0;

// Lưu mail.mailbox_id để dùng về sau; không lưu email vào vị trí mailbox_id.
TOOL._gokytu(mail.email);
// Sau khi ứng dụng gửi thư OTP:
let code = API._Mail_GetOTP(mail.mailbox_id, 'INSTAGRAM');
if (!code) return 0;
TOOL._gokytu(code);
```

`VPS_URL` và `VPS_API_KEY` là tên minh họa, nối với cấu hình tool đang có. AutoTouch không gọi trực tiếp Ghost. `_Mail_New` trả provider/mailbox_id/email hoặc 0; `_Mail_GetOTP` trả string hoặc 0. Ghost chờ 10 giây, tối đa 6 request/deadline 60 giây; EmailTick 5 giây/tối đa 12 request. Mailbox không có trong mapping local (ví dụ tool restart) dùng interval 10 giây. Lỗi/challenge dừng, không loop vô hạn. Tạo Ghost timeout 240 giây để bao gồm các bước bootstrap/retry mặc định, EmailTick 120 giây; không tự retry create nếu timeout vì provider không có idempotency contract.

## Lỗi và dữ liệu nhạy cảm

Lỗi rõ ràng: GHOSTINBOX_ACCESS_CHALLENGE, GHOSTINBOX_SESSION_EXPIRED, GHOSTINBOX_MAILBOX_EXPIRED, GHOSTINBOX_RATE_LIMITED, GHOSTINBOX_INVALID_RESPONSE, GHOSTINBOX_ERROR. Khi session/mailbox expired, tạo mailbox mới; không tự chuyển email đang dùng sang địa chỉ khác.

403/challenge dừng; không bypass. Expiration/429 classification là xử lý phòng vệ, chưa chủ động gây expiry/rate limit trên provider thật. Response không có token/cookie/snapshot/internal ID. Model default scope ẩn provider_state; query/update logging:false. Route /api/mail mount trước Morgan/common parser, lỗi và structured log không chứa body/HTML/OTP/session/credential.

## Kiểm tra đã chạy

```bash
npm run test:mail --prefix backend
npm run test:emailtick --prefix backend
npm run test:totp --prefix backend
```

- Unit: normalize Livewire tuples/ISO time, subject/body/HTML/zero, service/sort/old/processed IDs, CSRF/session riêng, challenge/expiry/retry/Retry-After, polling giới hạn, AutoTouch.
- Integration: provider HTTP giả đúng contract + MySQL DB tạm riêng + API auth thật + AutoTouch exec/curl thật trên process con, owner isolation, concurrent claim, lịch sử/session qua restart, migration hai lần giữ nguyên dữ liệu, EmailTick API cũ/chung và không lộ dữ liệu trong log. DB test được xóa sau chạy; không dùng seed hoặc fixture trên DB đang dùng.
- Live: Ghost provider đã tạo mailbox/mở inbox trống thật. Thư test do người dùng gửi đã được đọc/normalize/extract qua provider thật bằng GENERIC, giữ số 0 đầu và bỏ message processed. Đã quan sát mở thư bằng browser tại /message/{id}. Không phải thư Instagram production; chưa xác minh trên VPS/iPhone thật.

Backend không có lint/typecheck/build scripts; đã kiểm tra syntax và git diff. Không sửa frontend nên không chạy frontend build.

### Danh sách file thay đổi

- Discovery/hướng dẫn/context: GHOSTINBOX_DISCOVERY.md, MAIL_API.md, PROJECT_CONTEXT.md.
- Config/dependency/scripts: backend/.env.example, backend/package.json, backend/package-lock.json.
- Provider và logic chung: backend/src/services/mailProviders/GhostInboxProvider.js, backend/src/services/mailService.js, backend/src/services/mailOtpService.js; adapter backend/src/services/emailTickService.js, backend/src/services/emailTickMailboxService.js.
- API/model: backend/src/app.js, backend/src/controllers/mailController.js, backend/src/routes/mail.js, backend/src/models/GhostInboxMailbox.js, backend/src/models/index.js.
- Migration/kiểm thử: backend/scripts/migrateGhostInbox.js, backend/scripts/testMail.js, backend/scripts/testMailIntegration.js, backend/scripts/mailHttpTestServer.js.
- AutoTouch: tools/autotouch/mail.js; cập nhật tools/autotouch/emailtick.js để chia sẻ transport/polling, vẫn chạy độc lập.
