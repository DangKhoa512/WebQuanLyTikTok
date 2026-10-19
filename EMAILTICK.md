# EmailTick: VPS provider integration

## Getcode dùng proxy (đối soát 2026-10-19)

Cả GET `/api/emailtick/code` và `/api/mail/code` cho EmailTick đều dùng Proxy Check/Login của owner qua emailTickMailboxService.getCode → createOwnerEmailTickService → getEmails. Proxy lỗi kết nối/timeout được thay trong giới hạn đã mô tả bên dưới; hết pool lỗi trả EMAILTICK_PROXY_UNAVAILABLE, không chuyển direct hoặc đánh dấu mailbox EXPIRED. Upstream429/challenge vẫn trả đúng lỗi, không xoay proxy để thử tiếp.

Proxy được chọn lại từ pool khi bắt đầu mỗi request getcode; chưa lưu liên kết cố định mailbox→proxy qua các request. Kiểm thử API riêng/common đã nhận OTP qua failover, giữ số0 đầu và chống trả lại OTP đã claim, với provider/network stub và DB tạm. Đây không phải nghiệm thu OTP thực tế trên VPS.

## Proxy Check/Login theo user (2026-10-19)

EmailTick dùng pool Proxy Check/Login trong Cài đặt chung của owner đã xác thực, áp dụng cho tạo mailbox, activate và đọc inbox qua cả `/api/emailtick/*` và `/api/mail/*`. Không dùng pool Proxy Reg hoặc proxy do phone truyền vào. Pool được đọc ngoài transaction; kiểm tra owner mailbox trước khi đọc inbox/lấy cấu hình. Proxy đã hoạt động được dùng tiếp cho activate trong cùng lượt API; lượt API sau chọn điểm bắt đầu ngẫu nhiên từ pool hiện tại.

Hỗ trợ `host:port`, `host:port:user:pass`, `user:pass@host:port`, URL HTTP/HTTPS và SOCKS5/SOCKS5h. Các chuỗi không có scheme mặc định là HTTP theo pool Check/Login hiện tại; SOCKS5 cần prefix `socks5://` hoặc `socks5h://`. Kiểm tra proxy host public, DNS không có địa chỉ private và pin IP khi kết nối. TLS vẫn xác minh chứng chỉ; không redirect. Agent truyền credential cho proxy, không thêm credential/cookie proxy vào request tới EmailTick hoặc response/log.

Lỗi kết nối, DNS/handshake/timeout, auth407 hoặc CONNECT lỗi sẽ chuyển proxy khác, không lặp mãi proxy cũ. Mặc định tối đa 3 proxy khác nhau, 6 giây/proxy và ngân sách 20 giây chung cho phần gọi EmailTick trong một instance (create+activate dùng chung). Agent/socket có abort và cleanup; DNS cũng bị giới hạn thời gian. Env tùy chọn: EMAILTICK_PROXY_TIMEOUT_MS=6000, EMAILTICK_PROXY_MAX_ATTEMPTS=3, EMAILTICK_PROXY_TOTAL_TIMEOUT_MS=20000. Retry upstream5xx vẫn dùng proxy hiện tại trong ngân sách chung. Không chuyển proxy/retry khi EmailTick trả429/challenge/schema lỗi.

Pool trống giữ luồng direct trước đây. Khi đã có pool thì không fallback direct: hết proxy lỗi trả EMAILTICK_PROXY_UNAVAILABLE/502; cấu hình proxy sai trả EMAILTICK_PROXY_CONFIG_ERROR/503; đọc/parse settings lỗi trả EMAILTICK_PROXY_SETTINGS_ERROR/503. Getter strict chỉ dùng cho EmailTick; không đổi hành vi Proxy Check/Login của module khác. Không migration và không sửa .env thật.

Chạy `npm run test:emailtick --prefix backend`: gồm proxy suite, HTTP API/DB tạm và provider giả. Test riêng có proxy CONNECT local thật với handshake bị treo, auth và failover; không dùng proxy/mailbox/account thật. Chưa nghiệm thu proxy người dùng trên VPS. Timeout lấy mail sau khi upstream đã xử lý có thể để lại mailbox upstream không được nhận; retry/failover được giới hạn, không có idempotency upstream.

## Random User-Agent (2026-10-19)

Mỗi instance EmailTick service chọn ngẫu nhiên một UA từ pool Chrome Windows/Linux/macOS và Firefox Windows bằng crypto.randomInt. Luồng API hiện tạo instance mới mỗi lần xử lý request; create-mailbox và activate-email trong cùng lượt dùng chung UA, các lần retry lỗi tạm thời cũng giữ UA đó. Poll inbox ở request sau có thể chọn UA khác. Origin/Referer vẫn theo EMAILTICK_BASE_URL, không thêm cookie. Random UA không thay đổi IP hoặc hạn mức nhà cung cấp; gặp429 vẫn không tự retry và chuyển tiếp Retry-After hợp lệ như phần dưới.

Test unit dùng bộ chọn xác định để kiểm tra đủ pool, UA nhất quán qua retry/create/activate/inbox, Origin/Referer và không-cookie. EmailTick unit/integration PASS trên provider giả/DB tạm; không thử thêm request thật trên VPS đang bị429. Chưa commit/push/deploy lượt UA.

## HTTP 429 từ nhà cung cấp (2026-10-19)

Đã xác định từ kết quả chẩn đoán người dùng trên VPS: `/get-mailbox` trả HTTP429 khi lấy types=4; backend cũ gộp thành EMAILTICK_ERROR/502. Không có bằng chứng xác định giới hạn áp dụng theo IP, tài khoản, type hay thời gian chờ cụ thể. Không liên quan việc gắn domain/HTTPS của website.

Provider nay phân loại 429 thành `EMAILTICK_RATE_LIMITED`, HTTP429; cả `/api/emailtick/*` và `/api/mail/*` trả mã này. Nếu có Retry-After hợp lệ (số giây hoặc HTTP-date), response có `retry_after_seconds` và header Retry-After dạng số giây; thiếu/sai header thì không tự đoán thời gian. Không lộ raw body/header hoặc mailbox credential. Không tự retry upstream 429; client cần ngừng gọi liên tục, giảm đồng thời và chờ theo Retry-After/giới hạn của nhà cung cấp. Chưa thêm cooldown dùng chung giữa request/worker; thay đổi này không gỡ giới hạn upstream.

Kiểm thử unit/integration dùng HTTP provider giả + DB tạm: create/activate/inbox 429, không retry, Retry-After số/ngày/sai/thiếu, legacy/common API header/response, không cấp mailbox ACTIVE khi create/activate lỗi, mailbox ACTIVE không bị đánh dấu EXPIRED do inbox429, không lộ secret. Không migration hoặc frontend change; chưa commit/push/deploy bản sửa 429.

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

## EmailTick without cookies - 2026-10-07

- Shared headers for get-mailbox/activate-email/get-emails now include browser User-Agent and Accept application/json, text/plain, */*, with Origin/Referer/Content-Type. No Cookie is sent or stored.
- Live empty inbox returns exactly {success:true} without emails; normalize this response to [] (VPS WAITING). Malformed emails still fail validation.
- Live check from development machine passed create, activate and get-emails without cookies. Inbox was empty; real OTP receipt and production VPS remain unverified. No real mailbox credentials were logged or stored in the application database.
- npm run test:emailtick --prefix backend passed unit/integration, including no-Cookie headers and empty-inbox response. git diff --check passed. These changes are not committed/pushed yet.
