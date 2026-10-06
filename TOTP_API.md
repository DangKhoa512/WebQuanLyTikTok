# Stateless TOTP API / AutoTouch

## API

`POST /api/totp/generate`

Headers:

```text
Content-Type: application/json
x-api-key: <username của user đang active>
```

Body:

```json
{"secret":"<SECRET_BASE32_VUA_NHAN>"}
```

Response đúng format phẳng:

```json
{"success":true,"code":"123456","expires_in":23}
```

`code` luôn là string 6 số, giữ số 0 đầu. `expires_in` là số giây còn lại làm tròn lên, từ 1..30. Nếu window còn <=3 giây, server chờ qua window tiếp theo rồi sinh mã hiện tại; không trả mã tương lai trước thời điểm có hiệu lực. Thuật toán SHA1, 6 số, chu kỳ 30 giây, sử dụng helper hiện hữu đã tách khỏi Instagram login và đối chiếu test vector RFC 6238: https://www.rfc-editor.org/rfc/rfc6238.

Secret được trim, uppercase và validate Base32 canonical, có thể padded hoặc unpadded; không chấp nhận ký tự sai/dấu cách giữa chuỗi hoặc giá trị không phải string. Giới hạn 512 ký tự Base32 sau normalize, body tối đa 2 KB.

Secret sai/thiếu/rỗng trả HTTP 400:

```json
{"success":false,"error":"INVALID_SECRET"}
```

Auth reuse Device API `apiKeyAuth`: chỉ đọc User để xác thực client, không truy vấn account hoặc xác định owner của secret. Không yêu cầu uid, account_id, username trong body. Không lưu secret/OTP/history hoặc tạo bảng. Không gọi 2fa.live.

Các lỗi khác: auth 401 theo format auth hiện có; 405 METHOD_NOT_ALLOWED cho method khác POST; query bị từ chối 400 INVALID_REQUEST; JSON sai 400 INVALID_REQUEST; body quá lớn 413 PAYLOAD_TOO_LARGE; rate limit 60 request/phút/IP trả 429 RATE_LIMITED; lỗi nội bộ trả 500 TOTP_GENERATION_FAILED. Response Cache-Control: no-store.

Router mount riêng trong app.js trước parser/Morgan chung, có parser và error handler riêng. Không log request URL/body/error chi tiết/secret/OTP. Không chuyển lỗi parser/auth/service sang common errorHandler (đang log req.body). Các endpoint khác giữ nguyên logging.

Production gọi HTTPS. Không đặt secret vào query URL. Curl tương đương (thay placeholder bằng cấu hình và secret thực của tool):

```sh
curl -s --fail --max-time 30 -X POST 'https://SERVER/api/totp/generate' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: DEVICE_API_KEY' \
  --data '{"secret":"SECRET_BASE32"}'
```

## AutoTouch JavaScript

File `tools/autotouch/totp.js` dành cho bản AutoTouch đang hỗ trợ JS/exec, theo tool hiện tại của người dùng. Copy file vào thư mục script của tool. Không đổi sang Lua trong lượt này.

Khởi tạo một lần, giữ object API và helper/config hiện có:

```js
const installGetTOTP = require('./totp.js');
installGetTOTP(API, {
  exec: exec,
  safeParse: safeParse,
  getBaseUrl: () => API_BASE_URL,
  getApiKey: () => DEVICE_API_KEY
});
```

`API_BASE_URL` và `DEVICE_API_KEY` trong đoạn khởi tạo là **tên minh họa**, thay bằng biến URL/API key đang dùng trong tool. Getter URL nhận domain gốc hoặc URL kết thúc `/api`; không hardcode domain/key trong helper. Nếu tool chưa có safeParse, bỏ thuộc tính đó để helper dùng JSON.parse có catch nội bộ.

Thay lời gọi `exec(curl ...2fa.live/tok/...)` hiện tại bằng:

```js
let code = API._GetTOTP(tow_FA);
if (!code) {
  toast('❌ Không lấy được mã 2FA', 'top', 2);
  return 0;
}
TOOL._gokytu(code);
```

Helper dùng exec đồng bộ, curl POST JSON, timeout 30 giây, shell quoting an toàn và safeParse. Trả code string nếu success=true/code đủ 6 số, ngược lại trả 0; không log secret/code/command. Mặc định chỉ HTTPS; `allowHttp:true` chỉ dùng cho test/local. Không theo redirect, không gọi dịch vụ ngoài và không lưu file secret tạm.

Tài liệu lịch sử exec (string output): https://docs.autotouch.net/js/api.html#exec. AutoTouch JS tool chạy trên iPhone chưa được kiểm thử trực tiếp tại workspace; command curl và parse đã được test thật với server test riêng trên Node.

## Kiểm thử

```powershell
npm run test:totp --prefix backend
npm run test:instagram-check-live-mock --prefix backend
```

`testTotp.js` không kết nối DB: mock User chỉ cho auth, chặn query DB, không khởi động server.js/cron/seed. Test RFC SHA1 vectors (6 số), normalize/padding/invalid Base32, secret A/B/C, cùng window/khác window, near-expiry/wait, auth, errors/parser/size/rate limit và capture log không chứa secret/OTP. Client AutoTouch được test exec/safeParse/config cùng curl HTTP thật; test server con kiểm tra chờ sang window mới bằng timer thật. Chỉ dùng public RFC fixture và secret test giả, không đọc tài khoản thật.
