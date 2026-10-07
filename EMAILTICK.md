# EmailTick: VPS provider integration

## Phạm vi / trạng thái

AutoTouch chỉ gọi VPS. Provider phía backend gọi EmailTick theo contract đã cung cấp: `/get-mailbox`, `/activate-email`, `/get-emails`. Không thay đổi Hotmail/EmailOtpOrder hoặc API account/task hiện tại; trong repo chưa có abstraction gọi email provider để dùng chung nên integration được tách thành provider/service/controller riêng.

Ngày 2026-10-07: GET read-only `https://emailtick.com/` từ máy phát triển nhận **HTTP 403, HTML Cloudflare challenge**. Không tạo mailbox thật, không bypass, scrape challenge hoặc dùng browser vượt Cloudflare. Code đã kiểm thử end-to-end với provider HTTP giả theo contract + MySQL riêng + API/curl thật. Kết nối từ VPS production chưa được kiểm chứng; nếu VPS bị chặn, endpoint trả `EMAILTICK_CLOUDFLARE_CHALLENGE` và dừng retry challenge.

## Cấu hình

Các biến trong backend/.env.example; copy vào cấu hình môi trường VPS nếu muốn override, restart backend sau khi sửa:

```dotenv
EMAILTICK_BASE_URL=https://emailtick.com
EMAILTICK_TIMEOUT_MS=15000
EMAILTICK_RETRY_COUNT=2
EMAILTICK_RETRY_DELAY_MS=250
EMAILTICK_ALLOWED_TYPES=1,2,3,4,5
EMAILTICK_RANDOM_TYPES=3,4,5
```

Defaults được tập trung trong `config/emailtick.js`, không rải URL/type pool trong source. Retry tối đa 2 lần sau request đầu (cấu hình cho phép 0..3), chỉ timeout/reset/DNS tạm thời/5xx; backoff nhẹ. Mỗi request có timeout và giới hạn response 1MB/1000 messages. Không retry challenge, input/schema sai hoặc mailbox invalid. Không follow redirect. Không thêm provider API key vì contract người dùng cung cấp không yêu cầu.

Random_count mặc định 1, nhận số nguyên dương; clamp theo số type của pool, không lặp type. Các giá trị number, chuỗi CSV, array đều normalize/dedupe và phải nằm trong allowed types. Empty/missing/invalid types trả 400 `INVALID_EMAIL_TYPE`; random_count sai trả 400 `INVALID_RANDOM_COUNT`.

## Migration

```powershell
npm run migrate:emailtick --prefix backend
```

Đã áp dụng thành công trên DB local. Migration chỉ tạo `emailtick_mailboxes`, không seed/force/alter hay chỉnh bảng email/account cũ; rerun idempotent. Môi trường VPS khác cần chạy migration trước khi dùng và restart backend để tải code mới.

Model: uuid public mailbox_id unique, owner_username, email, mailbox_code (server-only), types JSON, trạng thái ACTIVE/ERROR/EXPIRED, last_email_time, last_message_code và processed_message_codes (những ID đã trả ở timestamp hiện tại). Không dùng id tăng dần làm public ID.

Mailbox activate thành công mới được lưu ACTIVE và trả thành công. Activate thất bại lưu bản ghi ERROR server-side để chẩn đoán, trả lỗi; không trả mailbox thành công. Provider xác nhận INVALID_MAILBOX khi đọc inbox sẽ đánh dấu EXPIRED. Không tự xóa mailbox/history cũ; không có UI quản lý bổ sung trong lượt này.

## VPS API

Authentication hiện có: header `x-api-key: <username user đang active>`. Owner luôn từ API key, không lấy từ body/query. HTTPS khi chạy production. Rate limit dùng apiLimiter đang có (mặc định 1200 request/phút/IP, override API_RATE_LIMIT_MAX); response no-store.

### Tạo mailbox

```http
POST /api/emailtick/new
Content-Type: application/json
x-api-key: <username>
```

```json
{"types":"random","random_count":1}
```

Cũng nhận `{"types":1}`, `{"types":2}`, `{"types":"1,2"}` hoặc `{"types":[1,2]}`.

Response ví dụ giả:

```json
{
  "success": true,
  "mailbox_id": "11111111-1111-4111-8111-111111111111",
  "email": "example@example.test",
  "types": [4]
}
```

VPS gọi get-mailbox → validate JSON/email/provider code → activate → lưu DB. `code` của get-mailbox là credential, **không phải OTP** và không trả cho client.

### Lấy OTP: polling một lần/request

```http
GET /api/emailtick/code?mailbox_id=<uuid>&provider=instagram
x-api-key: <username>
```

Không gửi email/mailbox_code từ iPhone. Provider mặc định `instagram`, hiện hỗ trợ thêm `facebook`. Có thể thêm `requested_at=<Unix seconds>` để lọc mail từ thời điểm bắt đầu chờ. Timestamp không được ở tương lai quá 5 giây. Backend luôn bỏ mail trước khi tạo mailbox.

Inbox chưa có mail hoặc không có OTP phù hợp:

```json
{"success":true,"status":"WAITING","code":null}
```

Có OTP:

```json
{"success":true,"status":"RECEIVED","code":"041374"}
```

Backend lọc fromName đúng provider, thời gian hợp lệ, bỏ message đã trả, sort newest first rồi extract regex 6 số từ subject. Không lấy emails[0] hoặc nhầm message.code thành OTP. OTP luôn string, giữ số 0 đầu.

History dùng high-water last_email_time: mail cũ hơn mốc đã trả không được trả nữa. Cùng timestamp giữ tập ID đã xử lý để không lặp khi nhiều message đến cùng giây. Thiếu message.code dùng hash sender/subject/time làm ID nội bộ. Provider call nằm ngoài transaction; bước kiểm tra history+ghi nhận trả OTP khóa mailbox row theo owner, nên request đồng thời không nhận cùng OTP. History tồn tại qua restart.

Lỗi có format `{success:false,status:<code>,error:<code>}` từ controller. Các mã: INVALID_INPUT, INVALID_PROVIDER, INVALID_MAILBOX, EMAILTICK_ERROR, EMAILTICK_TEMPORARY_ERROR, EMAILTICK_CLOUDFLARE_CHALLENGE, EMAILTICK_INVALID_RESPONSE. Parser/auth/rate-limit giữ lỗi tương ứng middleware. Unauthorized 401; mailbox không thuộc owner/không active 404; provider challenge/schema/network thường 502; provider báo mailbox expired 410. Không chuyển raw provider JSON/HTML/exception xuống client.

Không triển khai long-poll 60 giây ở VPS. iPhone poll mỗi 5 giây và tự giới hạn thời gian/lần thử; không có vòng lặp vô hạn.

## AutoTouch JS

Copy `tools/autotouch/emailtick.js` cạnh script hiện tại, khởi tạo một lần:

```js
const installEmailTick = require('./emailtick.js');
installEmailTick(API, {
  exec: exec,
  safeParse: safeParse,
  getBaseUrl: () => API_BASE_URL,
  getApiKey: () => DEVICE_API_KEY,
  sleep: seconds => TOOL._sleep(seconds, 't')
});
```

API_BASE_URL/DEVICE_API_KEY là tên minh họa, nối vào biến cấu hình VPS hiện có của tool. Getter base nhận domain gốc hoặc URL kết thúc `/api`. Nếu chưa có safeParse thì bỏ thuộc tính đó (helper có JSON.parse an toàn). `allowHttp:true` chỉ dành cho local/test, mặc định HTTPS. Helper không gọi emailtick.com, không log email credential/OTP/command hoặc ghi secret vào file.

```js
let mail = API._EmailTick_New('random');
// Hoặc _EmailTick_New(1), (2), ('1,2'), ([1,2]), ('random', 2)
if (!mail) {
  toast('❌ Không tạo được email EmailTick', 'top', 2);
  return 0;
}

// Nhập mail.email vào ứng dụng và yêu cầu ứng dụng gửi email OTP trước khi poll.
let otp = API._EmailTick_GetCode(mail.mailbox_id);
if (!otp) {
  toast('❌ Không lấy được OTP EmailTick', 'top', 2);
  return 0;
}
TOOL._gokytu(otp);
```

`_EmailTick_New` trả `{mailbox_id,email,types}` hoặc 0. `_EmailTick_GetCode` tối đa 12 request, nghỉ 5 giây khi WAITING và có deadline 60 giây, return string 6 số/0. TIMEOUT/error/challenge dừng; không retry create mù quáng. Curl tạo mailbox timeout 120 giây (bao gồm retry get/activate), GET không vượt thời gian còn lại; có thể điều chỉnh client nếu đổi timeout/retry môi trường. Device có thể chặn do transport timeout trước backend; provider không có idempotency create trong contract nên không bảo đảm create retry sẽ dùng lại cùng mailbox.

## Logging / bảo mật

Route EmailTick mount trước global parser/Morgan, dùng parser/error handler riêng để không log request body hoặc credential provider. Log chỉ gồm provider/operation/types/mailbox_id/duration/status, không email, mailbox_code/OTP, raw HTML, Axios request/response hay stack. CRUD mailbox dùng logging:false để không ghi credential trong Sequelize SQL logs. Model default scope ẩn mailbox_code, controller luôn whitelist response.

## Kiểm thử

```powershell
npm run test:emailtick --prefix backend
npm run test:totp --prefix backend
```

Unit: types/random/dedupe/allowed/config, schema/content-type/Cloudflare, headers/timeout/retry, filter/newest/time/old message/ties/leading zeros, AutoTouch WAITING/RECEIVED/error/timeout và bounded polling.

Integration: provider HTTP giả + MySQL DB riêng + API auth thực + curl AutoTouch trên process con. Kiểm tra activate thành công/thất bại, credentials ẩn, owner spoof/isolation, không OTP lặp/concurrency/ties, migration hai lần giữ dữ liệu, mailbox persistence và không có credential/OTP trong application/SQL log. Chỉ dùng fixture giả, test DB có prefix+timestamp/random, kiểm tra khác DB thật và cleanup đúng DB đã tạo. Không tạo mailbox thật trên EmailTick và chưa test trực tiếp iPhone/VPS production.
