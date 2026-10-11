# Bug report — 2026-10-11

Mỗi mục dưới ghi nguồn, cách tái hiện bằng fixture synthetic, expected/actual, sửa và regression. FAIL trước sửa đã quan sát trực tiếp trong lượt audit.

## AUD-001 — HIGH — Log dữ liệu nhạy cảm
Root: errorHandler log req.body và err.message chứa parser excerpt. Repro: chạy tests/security/errorLogging.test.js với body giả chứa password. Expected không xuất hiện secret; actual assertion FAIL.
Files: middleware/errorHandler.js, app.js, config/database.js. Fix: metadata log, parser 400/413 cố định, internal 5xx chung, bỏ query URL và SQL values. Regression PASS. Phạm vi global path; chưa audit mọi logger riêng.

## AUD-002 — CRITICAL — Phone API cũ thiếu authentication
Root: routes accounts/chrome/jobs gọi controller không qua apiKeyAuth; owner có thể lấy body.
Repro: DB tạm có JobAccount owner A, POST jobs/get-account không header vẫn HTTP 200 trả account. Expected 401; actual 200.
Fix: thêm middleware cho các phone endpoint, bắt DB error async, không log username trong invalid-key attempt. Regression parser.test.js và fixture auth trong testAuditFarm.js. Header x-api-key bắt buộc trước triển khai; response thành công giữ nguyên. CLOSED cho “thiếu header”; chất lượng key vẫn là AUD-008.

## AUD-003 — HIGH — Error card cộng khác đơn vị
Root: frontend cộng tasks.errors gồm account lỗi và claim Reg IG lỗi lịch sử, rồi gọi lỗi cần xử lý.
Repro: hai FAILED runs owner A/một owner B, testDashboardFailureCounts.js yêu cầu task_failures; trước sửa FAIL.
Fix: backend thêm task_failures total/by_type theo owner; card ghi “Lượt task thất bại (lịch sử)”; Reg IG lịch sử không tạo cảnh báo unresolved. Task inventory counters không bị thay bằng số hardcode. Regression PASS; CLOSED.

## AUD-004 — HIGH — Cron reset resource của active execution
Root: resetExpiredPageJobStates chỉ kiểm tra status/cooldown, không đối soát active DeviceTaskRun.
Repro: FB DA_CHAY_XONG + Page DA_LAM đủ 48 giờ, PAGE_JOB RUNNING. Cron đã reset FB → LOGIN_THANH_CONG và page trước task kết thúc; test FAIL.
Fix: withoutActiveTask filter cho Page reset và nurture reset. Regression testCronActiveProtection.js kiểm tra giữ lock, terminal reset và concurrent idempotency PASS. CLOSED cho fixture đã kiểm chứng.

## AUD-005 — HIGH — Cron chạy trùng trên PM2 cluster
Root: biến running chỉ theo tiến trình. Repro: hai Node process gọi scheduler đồng thời; counter commit 2, expected 1; FAIL.
Fix: MySQL session advisory lock trong cronLockService.js, publish cron snapshot vào AppSetting để worker khác đọc. Regression testCronDistributedLock.js PASS, gồm kill worker và connection loss. CLOSED.

## AUD-006 — CRITICAL — JWT fallback trong production
Root: thiếu JWT_SECRET vẫn dùng secret mặc định trong source. Repro productionJwt.test.js expected throw, actual không throw; FAIL.
Fix: getJwtSecret fail closed production và startup validate trước sync/migration. Regression PASS. Không xác nhận env runtime VPS.

## AUD-007 — HIGH — Cron che lỗi SQL
Root: accountService.runStatusTransitions catch lỗi rồi return; scheduler có thể đánh dấu thành công.
Repro failurePropagation.test.js inject Account.update lỗi, expected reject; actual resolve, FAIL.
Fix: throw lại để scheduler ghi WARNING; giữ last_success_at riêng. Regression PASS. CLOSED.

## AUD-008 — CRITICAL trong môi trường không tin cậy — Username là API key
Root: middleware xác thực bằng username active, không có secret. Người dùng yêu cầu giữ nguyên cho web nội bộ ngày 2026-10-11.
Status: ACCEPTED_BY_USER / NOT_FIXED, không coi là PASS bảo mật bên ngoài mạng tin cậy. Không thay giao thức/key trong audit.

## AUD-009 — HIGH / chưa xác định root cause hạ tầng — Burst local không đạt
Repro 500/1000 virtual HTTP requests, ECONNREFUSED. Expected không lỗi; actual có lỗi kết nối. Số cụ thể trong PERFORMANCE_REPORT.md.
Invariant task/account/report vẫn đúng sau retry. Chưa đủ bằng chứng gán lỗi cho backend, Windows listener, client/socket limit hay VPS; không chỉnh timeout/pool/Dispatcher để che benchmark. OPEN về yêu cầu burst không lỗi.

## AUD-010 — HIGH — Instagram nurture READY khác điều kiện cấp mới
Root: Dashboard nhận LOGIN_THANH_CONG/DANG_LAM/DA_CHAY_XONG; controller cấp mới chỉ LOGIN_THANH_CONG.
Repro: tạo ba account cùng owner/cookie/nurture CHUA_NUOI, mỗi trạng thái một account; expected READY=1, actual 3; regression FAIL trước sửa.
Fix: query dashboard giới hạn LOGIN_THANH_CONG. testDashboardFailureCounts.js PASS và đối soát 17 metrics độc lập. CLOSED cho sai lệch này; chưa coi mọi predicate của sáu task đã đối soát hết.


## AUD-011 — HIGH — Cập nhật khóa user bằng sai kiểu dữ liệu
Root: updateUser dùng !!is_active, nên chuỗi "false" biến thành true.
Repro userValidation.test.js gửi is_active string; expected 400/no write, actual 200/update true; FAIL trước sửa.
Fix: yêu cầu boolean cho is_active, kiểm tra role/password types; username create nhận string. Regression PASS. Không đổi quyền admin/user hoặc thêm subscription.
Files: controllers/userController.js, tests/security/userValidation.test.js.

Nghiệm thu toàn hệ thống: CHƯA ĐẠT. Có quyết định giữ cơ chế key nội bộ và burst/coverage chưa đạt; không xác nhận production ổn định từ các regression local.
