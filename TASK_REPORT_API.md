# Báo cáo hoàn thành task cho Dashboard

Contract cập nhật 2026-10-07: dữ liệu account, OTP, đăng ký, kết quả nuôi/job và thống kê nghiệp vụ tiếp tục gửi qua API cũ. `/api/device/task/report` chỉ cập nhật lượt task và trạng thái thiết bị, không gọi lại handler nghiệp vụ, không đổi domain lock/account hoặc tăng thống kê nghiệp vụ lần nữa.

## Luồng tool

1. POST `/api/device/next-task` để lấy task; lưu `task.id`.
2. Chạy task và gửi heartbeat như hiện tại.
3. Gửi dữ liệu/kết quả qua API nghiệp vụ cũ và kiểm tra response thành công.
4. POST `/api/device/task/report` với task_id để đánh dấu hoàn thành.
5. Sau khi report được chấp nhận, gọi next-task cho lượt tiếp theo.

Nên chốt task sau khi API dữ liệu cũ đã thành công để account/claim được cập nhật và domain lock được giải phóng bởi đúng luồng nghiệp vụ. API task không xác minh thay cho kết quả API cũ; nó ghi nhận thông báo hoàn thành từ tool.

## Request tối thiểu

```http
POST /api/device/task/report
Content-Type: application/json
x-api-key: <cùng user đã lấy task>
```

```json
{"task_id":123}
```

```bash
curl --silent --show-error --max-time 20 \
  'http://vn1.ip3s.net:45473/api/device/task/report' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  --data '{"task_id":123}'
```

`task_id` là `task.id` do next-task trả về; không dùng account_id/claim_id. Khi không có status thì mặc định SUCCESS. Không cần device_id: backend lấy từ task đã lưu và chỉ cho user owner đang xác thực báo cáo task của mình. Nếu vẫn gửi device_id theo tool cũ thì backend kiểm tra đúng device/locked_by; sai trả 409. Không nhận owner từ body để thay user.

Ví dụ response:

```json
{
  "success": true,
  "code": 1,
  "task": {"id":123,"type":"REG_INSTAGRAM","status":"SUCCESS","retry_count":0},
  "already_reported": false,
  "retryable": false,
  "data": null
}
```

Backend lưu completed_at, đặt task SUCCESS và đưa thiết bị về IDLE khi không có lượt task khác đang chạy. Report lại cùng trạng thái trả already_reported:true và không ghi lần hai. Không đổi task FAILED/RELEASED thành SUCCESS; khác trạng thái cuối trả 409. Task đang REPORTING từ luồng cũ trả 409.

`result` không còn được dùng để gửi hoặc lưu dữ liệu nghiệp vụ tại endpoint này. Các ví dụ cũ yêu cầu result.instagram_account/duration_seconds không còn áp dụng cho task/report; dùng API nghiệp vụ tương ứng.

## Báo trạng thái lỗi tùy chọn

Giữ hỗ trợ body cũ có device_id/status/message/error_code để tool ghi nhận task lỗi:

```json
{
  "task_id":123,
  "status":"FAILED",
  "error_code":"NETWORK_ERROR",
  "message":"Lỗi mạng khi chạy task"
}
```

Retry_count/retryable chỉ là metadata điều phối. API dữ liệu cũ vẫn phải cập nhật account/claim và xử lý lock trước khi tool lấy lượt tiếp theo. Task report không tự reset account READY, đánh account die hoặc release claim. SUCCESS/DONE/DA_XONG là hoàn thành; FAILED là lỗi.

## Phạm vi và kiểm thử

- Không đổi API cấp task, heartbeat, API dữ liệu cũ, schema hoặc UI. Dashboard đọc dữ liệu nghiệp vụ hiện có và trạng thái lượt task/thiết bị.
- Transaction khóa theo thứ tự device rồi task như dispatcher; READ COMMITTED tránh gap lock giữa report hai máy độc lập. Kiểm tra lượt khác đang chạy trước khi đưa device IDLE, tránh report cũ xóa trạng thái task mới.
- `node backend/scripts/testTaskReportOnly.js`: HTTP/MySQL DB tạm riêng, sáu task chỉ-ID, auth/owner/device, ID validation, không gọi legacy/đổi account, API dữ liệu cũ rồi task complete, result bị bỏ qua, idempotency/race, failure metadata/final-status conflict và giữ task mới trên device.
- `node backend/scripts/testTaskRegistryIntegration.js`: hồi quy Registry/Dispatcher/Dashboard trên DB tạm riêng; dispatcher test đã mô phỏng API nghiệp vụ cũ trước khi chốt task. Không chạy standalone testTaskDispatcher.js trên DB đang dùng.
- Không migration; deploy backend mới bằng Docker compose như hiện tại. Chưa deploy/commit/push lượt này.
