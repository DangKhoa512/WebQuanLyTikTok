# Instagram Cookies + Token (2026-10-12)

Phần CSRF phone/web đã commit và push tại 3b4ff4b. Phần ưu tiên proxy và bổ sung CSRF cho cookie cũ dưới đây là thay đổi local chưa commit/push/deploy. Không sửa Heartbeat, Task Dispatcher hoặc cách chạy Instagram Job.

## API
POST /api/instagram/job/report giữ endpoint và các trường cũ, mở rộng cookies/token.
Ví dụ cập nhật credentials cho account Job đã có:
```json
{"uid":"example_user","device_id":"ExamplePhone","cookies":"ds_user_id=123456; sessionid=123456%3Aexample%3A1%3Aexample;","token":"Bearer IGT:2:EXAMPLE_OPAQUE_TOKEN"}
```
Header x-api-key là user sở hữu theo cơ chế hiện hành.
- Không gửi status: chỉ cập nhật credentials, không đổi status, device, login_at, locks hoặc Task.
- Có status: giữ semantics report cũ, đồng thời lưu credentials hợp lệ.
- username vẫn là alias của uid, device/phone/may vẫn theo API cũ.
- Chỉ cookies hoặc chỉ token đều được; omitted/null/empty/whitespace/"null" không ghi đè.
- Account khác user: không tìm thấy; device không đúng hoặc lock bởi máy khác: từ chối.
- Token phải có dạng Bearer + một chuỗi không có whitespace/control; không cố decode cấu trúc opaque.

POST /api/instagram/import-api:
- text/data/accounts/account dạng pipe cũ giữ nguyên. Có thể thêm cookies/token để lưu cùng mỗi account import.
- Body uid/username + cookies/token cập nhật account đã có (kind mặc định job), yêu cầu device_id; không tạo account mới hoặc đổi status ngầm.
- Với account mới, tiếp tục import text/data như trước. Token là optional.
- Reg → Job sync giữ credentials hiện có khi nguồn rỗng, đồng bộ token khi nguồn có token.

GET /api/instagram/accounts/:id/credentials?field=cookies hoặc token
- JWT active user, chỉ account thuộc user đăng nhập; admin cũng không vượt owner.
- Cache-Control: no-store; trả data.value đầy đủ của đúng một trường.
- Các sự kiện đọc/cập nhật ghi owner/account_id/field/warning code, không giá trị.
- Không thêm cơ chế phân quyền mới: active owner có quyền; user khác và chưa đăng nhập bị từ chối. API key username vẫn giữ theo quyết định trước của user.

## Validation và encoding
instagramCredentials.js parse name=value bằng dấu "=" đầu tiên, ";" phân cách. Kiểm tra tên Cookie, duplicate, giá trị ASCII không whitespace/quote/backslash/comma/control, giới hạn128KiB. ds_user_id nếu có phải numeric. Không bắt buộc đủ ds_user_id/sessionid vì header cũ có thể chứa các cookie khác.
Percent escape phải %HH; literal control hoặc percent-encoded ASCII control bị từ chối. Giữ nguyên raw colon, %3A, %253A và case escape; không decode/re-encode hoặc encode cả header.
sessionid chứa pattern hexadecimal được giữ nguyên, trả warning SESSION_HEX_PATTERN_UNVERIFIED. Không suy luận mọi pattern là rác. Chưa xác minh session hợp lệ với Instagram.

## Database / deployment
Thêm nullable LONGTEXT token và DATETIME token_updated_at vào instagram_accounts.
Migration chỉ ADD COLUMN thiếu, có advisory lock, idempotent, không xóa/sửa dữ liệu cũ, không seed. Chạy sau backup và trước khi khởi động backend mới:
```bash
cd /opt/WebQuanLyTikTok
docker compose run --rm --no-deps --build backend node scripts/migrateInstagramCredentials.js --apply
docker compose up -d --build
```
Đây là hướng dẫn, chưa chạy trên VPS. Không bật Device Manager/SSH.
Nếu chưa có columns thì model mới sẽ cần migration; không chỉ rebuild bỏ qua bước này.

Optional INSTAGRAM_CREDENTIAL_ENCRYPTION_KEY:32bytesbase64, lưu ngoài Git và giữ cố định.
AES256GCM cho cookies/token và raw_data khi ghi mới, model getters đọc transparently; token lưu riêng, timestamp chỉ khi gửi token không rỗng. Không dùng key Device Manager hoặc tự sinh key production.
Mặc định không có key: giữ cách lưu plaintext cũ để tương thích. Dữ liệu plaintext cũ vẫn đọc được, không tự backfill. Bật key không tự mã hóa mọi row cũ; backfill/rotation cần quy trình riêng được phê duyệt. Mất key thì không đọc được ciphertext. Snapshot Task trước đây không được migration/quét lại.

## Giao diện
Giữ COOKIES, thêm TOKEN với nút Xem.
API danh sách chính/thùng rác/nuôi bỏ cookies/token/raw_data/full_data và dùng presence flags, SQL projection tránh tải giá trị ở danh sách chính/thùng rác/nuôi.
Modal chỉ request sau click, hiển thị toàn bộ trong textarea, có copy, xóa khỏi DOM khi đóng; không localStorage hoặc console values. Auth/owner kiểm tra tại backend.
API phone lấy một account và bulk export được user yêu cầu vẫn giữ dữ liệu cần thiết như trước; default browser list không chứa credentials.

## Lua
tools/autotouch/get_ig_active.lua thay phần reconstruct sessionid:
- Giữ nguyên giá trị, không bóc các đoạn theo 0X/P.
- Không nối "%%3A": đây là hai dấu phần trăm trong chuỗi literal, không phải replacement pattern.
- Không ghi Cookie/Token vào log.
- Return cookies, bearer: caller Lua cũ nhận biến đầu vẫn lấy cookie; client mới nhận hai giá trị:
```lua
local cookies, token = dofile("get_ig_active.lua")
```
Ghép JSON bằng JSON encoder của môi trường AutoTouch rồi gửi API; không nối JSON thủ công và không URL-encode toàn bộ header.
Nguồn clipboard/file có thể cũ hoặc chứa nhiều account; không chứng minh account active từ mã tweak hiện chưa được cung cấp. Không khôi phục dữ liệu đã bị Lua cũ làm mất.

## Kiểm thử đã chạy
testInstagramCredentials.js --ui:14 nhóm PASS, MySQL DB tạm riêng, Chrome headless với UI thật. Cookies-only/combined/partial/empty, %3A/raw colon, hex preservation/warning, invalid atomic, owner/device/JWT/no-store, migration2lần, 1000list, legacy pipe/status, sync retention, AES storage, audit no values, modal exact strings và không localStorage.
1000list local khoảng90ms lần cuối; không suy ra capacity production.
RegistryIntegration và RoundRobinIntegration PASS (50request vàPage16) sau thay đổi model/API.
Frontend production build PASS, chunk>500KB warning vẫn có.
UI harness từng timeout vì đặt route preview sau not-found hoặc trước Express init; đã sửa harness, không đổi app middleware production.
Chưa chạy Lua/iPhone/tweak thật, chưa xác minh token Instagram thật, không chạy migration trên DB đang dùng. Token/session validity bên ngoài chưa được chứng minh.

## File thay ??i
- backend/src/controllers/instagramController.js
- backend/src/models/InstagramAccount.js
- backend/src/routes/instagram.js
- backend/src/services/instagramCredentials.js
- backend/src/services/instagramCredentialService.js
- backend/src/services/instagramCredentialMigration.js
- backend/scripts/migrateInstagramCredentials.js
- backend/scripts/testInstagramCredentials.js
- backend/tests/instagram-credentials/results.json
- backend/package.json
- backend/.env.example
- frontend/src/pages/InstagramAccounts.jsx
- frontend/src/components/InstagramCredentialDialog.jsx
- frontend/src/services/api.js
- tools/autotouch/get_ig_active.lua
- INSTAGRAM_CREDENTIALS.md
- PROJECT_CONTEXT.md

Local schema follow-up: missing token/token_updated_at confirmed; additive migration applied locally after user reported 500. Read-only list/trash/nurture checks return success200. VPS migration remains pending.

## Mẫu user bổ sung: normalization có giới hạn (2026-10-12)
Yêu cầu mới cung cấp input/output cụ thể, thay policy giữ nguyên cho duy nhất signature nhận diện được:
1. 0X1.0FDAB1AP-1042
2. 0X0P+0 (phần số phía sau là segment được giữ nguyên, không ăn vào exponent)
3. 0X1.FB5D8CE8P-1042

Chỉ normalize nếu ds_user_id khớp UID đầu session và cấu trúc các phần còn lại không mơ hồ. Mỗi marker thành %3A; giữ các phần auth và dấu "-" / "_". Trả warning SESSION_CONFIRMED_SIGNATURE_NORMALIZED để nhận biết đã đổi theo mapping người dùng cung cấp. Pattern khác giữ nguyên với cảnh báo chưa xác minh, không xóa mọi hexadecimal bằng regex.
Không chứng minh đây là rác bộ nhớ hoặc session mới đăng nhập thành công; chưa có code tweak gốc để kết luận nguyên nhân. Không normalize từ một regex generic có thể ăn mất phần số.
Áp dụng khi nhận API structured và import pipe. Dữ liệu cũ không tự rewrite; gửi lại cookie để cập nhật.
Test cuối15groups --ui PASS với fixtures, không ghi cookie/token thật vào repo. Header đã chuẩn giữ nguyên và không double encode.

## Khôi phục từ IGT payload cho marker thay đổi (2026-10-12)
Khi gửi Cookie có hexadecimal float, gửi kèm Token IGT2 trong cùng request hoặc cột pipe cuối:
username|password|2fa|cookies|Bearer IGT:2:<BASE64_JSON>

Backend chỉ coi token payload là dữ liệu đối chiếu, không phải chứng minh Instagram đã xác thực:
- strict base64/base64url → JSON, ds_user_id stringnumeric, sessionid4segments dùng %3A.
- Cookie raw phải khớp UID + mọi phần session trongpayload, chỉ khác3markershexfloat.
- Lấy nguyên sessionid payload, giữ nguyên %3A/case; không xóa regexgeneric.
- Có thể sửa ds_user_id<digits> thiếu "=" khi numericUID khớp payload. Các lỗiCookie khác vẫnreject.
- Mismatch/malformedpayload trả400, không mấtCookie/Tokencũ.
- Token-only không tự ghiCookie; khôngtoken thì không mở rộng normalize signature chưa biết.
- Response warning SESSION_RECOVERED_FROM_IGT_PAYLOAD; audit chỉmetadata.
Test16groups --ui PASS fixtures, chưa xác minh token/session vớiInstagram. Không đổi migration hoặc Task.

2026-10-13: fixed existing-account pipe import to persist parsed token/token_updated_at; omission retains old token. 17 groups --ui PASS on disposable DB. No new migration; not deployed.

## Tự bổ sung csrftoken khi phone hoặc giao diện web gửi cookie (2026-10-14)

Các API phone và import giao diện web nhận Instagram credentials sẽ kiểm tra cookie sau bước validate/normalize. Nếu cookie chưa có `csrftoken`, backend gửi một GET cố định tới `https://www.instagram.com/accounts/login/` với cookie hiện có, đọc `csrftoken` từ header `Set-Cookie` hoặc HTML rồi ghép vào cookie trước khi lưu.

- Áp dụng cho `/api/instagram/import` (giao diện web, JWT), `/api/instagram/import-api`, `/api/instagram/reg/report` và `/api/instagram/job/report` khi request có cookie.
- Cookie đã có `csrftoken` được giữ nguyên và không phát sinh request ra Instagram.
- Request chạy trước transaction khóa account. Không log cookie, token hoặc giá trị CSRF.
- Đây là best-effort: `CSRF_TOKEN_FETCHED` nghĩa là đã ghép thành công; `CSRF_TOKEN_NOT_RECEIVED` hoặc `CSRF_TOKEN_FETCH_FAILED` nghĩa là account vẫn được lưu bằng cookie đã làm sạch nhưng Instagram không cấp token trong lần gọi đó.
- Với import/reg, các mã nằm trong `data.credential_warnings`; với Job report/cập nhật credentials, chúng nằm trong `data.warnings`.
- Không tự backfill dữ liệu cũ. Account cũ cần import lại hoặc gửi lại cookie qua một API phone nêu trên.
- `INSTAGRAM_CSRF_FETCH_ENABLED=true` mặc định bật; `INSTAGRAM_CSRF_FETCH_TIMEOUT_MS=8000`, chỉ chấp nhận 1.000–30.000 ms. URL đích cố định trong code để tránh request tùy ý.
- Kiểm thử dùng HTTP stub và DB test biệt lập; không gửi fixture/cookie thật ra Internet.

## Ưu tiên proxy và lấy CSRF cho cookie cũ (2026-10-14)

- Luồng tự bổ sung khi phone gửi cookie hoặc import web đọc proxy pool của chính owner tại Cài đặt → Cài đặt chung → Proxy (cấu hình dùng chung check Facebook/Instagram). Proxy được luân phiên; không dùng proxy của user khác. Nếu chưa cấu hình proxy, luồng tự bổ sung giữ cách gọi trực tiếp từ VPS. Nếu có cấu hình nhưng không có proxy hợp lệ, hoặc proxy lỗi, không fallback sang IP VPS; vẫn lưu cookie và trả warning. Lỗi đọc settings trả CSRF_PROXY_SETTINGS_FAILED. Không có retry tự động.
- Request khởi đầu ở HTTPS cố định, tổng timeout cũ; đọc token từ HTTP 200 hoặc redirect hợp lệ. Theo tối đa 2 redirect HTTPS chỉ tới instagram.com/www.instagram.com (cùng proxy), dừng challenge/checkpoint/suspended, domain ngoài hoặc redirect không hợp lệ. Không log proxy credentials/cookie/token.
- Nút “Lấy CSRF thiếu đã chọn” hoặc “Lấy CSRF thiếu trang này” trên danh sách Instagram Reg/Job gọi POST `/api/instagram/csrf/fetch-missing` với JWT và `{ids:[1,2]}`. Mỗi request tối đa 5 ID số nguyên dương, web chia batch tuần tự và hiện tiến độ/kết quả. Chỉ xử lý account thuộc owner đang đăng nhập, chưa vào thùng rác; không quét toàn bộ DB.
- Thao tác thủ công bắt buộc proxy hợp lệ, không chạy trực tiếp bằng IP VPS; có thể chạy kể cả khi INSTAGRAM_CSRF_FETCH_ENABLED=false (flag này chỉ tắt luồng tự bổ sung). Bỏ qua account chưa có cookie hoặc đã có CSRF. Cookie không hợp lệ hoặc fetch lỗi không bị ghi đè.
- Network ngoài transaction; khi lưu khóa row và đối chiếu lại cookie/token trước request. Cookie/token thay đổi hoặc account bị xóa trong lúc chờ thì bỏ qua COOKIE_CHANGED. Chỉ cập nhật cookies, giữ status/owner/lock/task/token; hỗ trợ getter/setter mã hóa hiện có. Response no-store chỉ chứa ID/status/reason/count, không chứa credentials.
- Kiểm thử `node backend/scripts/testInstagramCredentials.js --ui`: 19 nhóm PASS trên DB test biệt lập và Chrome; thêm proxy owner/agent/no-fallback, manual fetch/success/skip/failure/owner/ID validation/cookie race, encrypted cookie qua UI. Build frontend PASS (cảnh báo chunk lớn hiện có); syntax/diff PASS. Chưa thử proxy hoặc Instagram thật, chưa deploy; không cần migration mới.

Rà soát ảnh lỗi ngày 2026-10-14: sửa bỏ lỡ Set-Cookie trên HTTP302, thêm redirect giới hạn cùng proxy như trên. Phân biệt HTTP429 (CSRF_RATE_LIMITED), 401/403 (CSRF_ACCESS_DENIED), 407 (CSRF_PROXY_AUTH_REQUIRED), HTTP khác, challenge, timeout và phản hồi không có token. Kết quả web hiện username + HTTP status, không chứa URL redirect hoặc credentials. Test20groups --ui PASS gồm redirect token/HTML, domain outside/HTTP/missing Location, challenge/no retry, loop limit, HTTP errors và timeout. Không xác định nguyên nhân thật account29 chỉ từ ảnh, chưa gọi Instagram/proxy thật. Build/syntax/diff PASS.

Ảnh tiếp theo hiển thị fetch failure cùng HTTP302: mã302 là phản hồi trước đó, không phải HTTP của request lỗi sau redirect. Đã tách http_status/previous_http_status/request_stage, phân loại DNS/connection refused/reset/TLS/timeout bằng mã lỗi cho phép, không trả raw error hoặc URL. Web ghi “sau chuyển hướng” và “Chưa nhận HTTP mới; trước đó 302”. Test20groups --ui mở rộng PASS cho redirect rồi DNS/refused/reset/TLS, no raw error leaks; build/syntax/diff PASS. Chưa xác định nguyên nhân kết nối thực tế hoặc deploy.

Sau xác nhận cụ thể của user, chẩn đoán read-only bằng cookie/proxy local tới Instagram thật xác định lỗi ERR_BAD_RESPONSE do maxContentLength 1MB. Trang sau redirect có HTML khoảng1.35MB. Đã tăng giới hạn hữu hạn8MB và thêm CSRF_RESPONSE_TOO_LARGE (không còn gộp thành lỗi proxy). Thử lại thật qua proxy nhận302→200 và lấyCSRF thành công; không ghiDB hoặc in/lưu cookie/token/body/proxycredential. Test20groups --ui hồi quyPASS + oversize classification; frontendbuild/syntax/diffPASS. Chưacommit/push/deploy. Điều này supersede giới hạn chưa test thật ở các ghi chú trước, không xác nhận mọi account/proxy đều thành công.
