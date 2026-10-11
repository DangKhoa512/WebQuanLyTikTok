# Audit API

Danh mục method/path/route/middleware tường minh: `backend/tests/audit/source-inventory.json`. Middleware kế thừa phải đọc thêm routes/index.js; nhãn inherited-or-controller không đồng nghĩa public.

| Endpoint | Auth | Contract / kiểm tra |
| --- | --- | --- |
| POST /api/device/heartbeat | x-api-key | cập nhật đúng owner/device; task active ưu tiên status client |
| POST /api/device/next-task | x-api-key | success/code/has_task/task; resume giữ ID/cursor |
| POST /api/device/task/report | x-api-key | task_id bắt buộc; status mặc định SUCCESS; same-terminal idempotent |
| GET /api/dashboard/summary | JWT | scope user, private/no-store, pagination, thêm task_failures |
| GET /api/system-health | JWT | owner metrics; admin mới thấy cron/API window |
| POST /api/emailtick/new | x-api-key | types; mailbox_id/email, không nhận cookie client |
| GET /api/emailtick/code | x-api-key | mailbox_id; WAITING hoặc RECEIVED/code |
| POST /api/mail/new | x-api-key | EMAILTICK/GHOSTINBOX theo contract hiện có |
| GET /api/mail/code | x-api-key | mailbox_id + service |
| POST /api/totp/generate | x-api-key | TOTP server-side; parser/log riêng |

Task report tối thiểu: POST, header x-api-key của owner, Content-Type application/json, body `{"task_id":123}`. ID phải lấy từ task.id thật; undefined không phải JSON. Dữ liệu nghiệp vụ tiếp tục gửi API cũ trước khi kết thúc task.

Thay đổi tương thích có chủ đích: phone routes accounts/chrome-accounts/jobs trước đây thiếu middleware; nay yêu cầu header x-api-key giống các API Facebook/Instagram/device. Payload và response thành công giữ nguyên. Tool chưa gửi header sẽ nhận 401, phải bổ sung trước triển khai.

Global parser: invalid JSON 400 không echo excerpt; >10MB 413; không đổi timeout request/task. API key DB exception chuyển vào error handler thay vì unhandled rejection. Production JWT thiếu secret sẽ không khởi động.

Rate limiter hiện 1200 request/phút/IP mặc định; benchmark controller không mount limiter, không đại diện giới hạn production sau Nginx/NAT. Không tự tăng ngưỡng trong audit.

Đã kiểm tra: thiếu auth, invalid JSON, payload lớn, owner spoof/JWT inactive, task không tồn tại/sai owner/device, report lặp/conflict, thiếu source và resume. Key expiry/subscription N/A theo schema hiện tại. Kiểm thử mọi endpoint/kiểu dữ liệu/SQLi/timeout không được xem là hoàn tất chỉ từ inventory.
