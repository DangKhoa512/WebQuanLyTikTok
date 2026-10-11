# Thay đổi trong audit

- Giữ thay đổi Facebook self-limit đang có; user sửa limit owner mình, admin quản lý list riêng.
- Thêm System Health tab, API JWT/no-store, owner device/task counters; admin cron/database/API diagnostics, N/A cho dịch vụ không dùng.
- Metric API window 5 phút dùng bounded buckets, không lưu header/path/body; thống kê theo worker. Alerts: DB unavailable, cron warning, HTTP 5xx, device unresponsive, task dài, conflict reservation. Long task chỉ cảnh báo, không reset/fail.
- Error card dùng FAILED execution lịch sử độc lập; thêm trường API task_failures, không xóa trường cũ.
- Sửa auth phone cũ, log nhạy cảm, production JWT, async API-key error propagation.
- Sửa cron active-resource protection, shared mutex MySQL, failure propagation, last-success snapshot.
- Thêm test manifests theo nhóm, runner, fixture farm/concurrency/performance, security/parser/regression, metadata inventory, Chrome System Health + smoke các trang.
- Không thay Dispatcher RR/cursor algorithm, device timeout 1800, task/request timeout, cooldown values hoặc reservation lease. Không seed, không sửa/xóa account thật, không deploy/commit/push.
- Không có migration schema mới: health snapshots dùng AppSetting; MySQL session lock không thêm bảng. Chưa chạy toàn bộ migration startup trên production copy.
- Yêu cầu triển khai: JWT_SECRET production đã cấu hình; các phone route cũ bổ sung x-api-key. Giữ API key username theo yêu cầu người dùng.

Kết quả có máy đọc: backend/tests/results.json, performance/results.json, recovery/commit-and-drop.json, database/schema-observed.json, audit/source-inventory.json. TEST_MATRIX.md phân biệt PASS/FAIL/N/A/NOT_RUN.

- Validate cập nhật User: is_active phải là boolean; kiểm tra role/password, tránh chuỗi "false" kích hoạt nhầm user.
- Kiểm tra Dashboard UI cuối: lần đầu timeout do test bấm nút phân trang còn disabled; bổ sung chờ nút enabled và chạy lại PASS. Không sửa logic phân trang sản phẩm.
