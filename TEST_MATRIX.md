# Ma trận kiểm thử

Nguồn máy đọc: backend/tests/results.json. PASS của một script chỉ áp dụng assertions của script; không đồng nghĩa mọi yêu cầu trong module hoặc toàn hệ thống PASS.

| Nhóm | Script | Assertions | Thời gian ms |
| --- | --- | --- | --- |
| accounts | testFacebookImportParser.js | PASS | 528 |
| accounts | testFacebookSelfLimit.js | PASS | 3830 |
| accounts | testInstagramJobSettingsMock.js | PASS | 664 |
| api | testTotp.js | PASS | 7011 |
| api | testEmailTick.js | PASS | 305 |
| api | testEmailTickIntegration.js | PASS | 3810 |
| api | testMail.js | PASS | 320 |
| api | testMailIntegration.js | PASS | 13921 |
| api | testInstagramCheckLiveMock.js | PASS | 4913 |
| api | ../tests/api/parser.test.js | PASS | 1147 |
| cron | testCronActiveProtection.js | PASS | 3452 |
| cron | ../tests/cron/failurePropagation.test.js | PASS | 397 |
| cron | testCronDistributedLock.js | PASS | 6583 |
| dashboard | testDashboardIsolation.js | PASS | 9343 |
| dashboard | testDeviceDashboardIntegration.js | PASS | 12195 |
| dashboard | testDashboardFailureCounts.js | PASS | 3614 |
| devices | testDeviceOfflineTimeout.js | PASS | 150 |
| devices | testDeviceMonitoring.js | PASS | 4245 |
| dispatcher | testRoundRobinIntegration.js | PASS | 9644 |
| performance | testAuditFarm.js | PARTIAL | 136097 |
| realtime | testSystemHealthUI.js | PASS | 27258 |
| recovery | testDeviceMonitoring.js | PASS | 3958 |
| reservations | testCrossTargetEngineIntegration.js | PASS | 5729 |
| reservations | testInstagramCrossFollowIntegration.js | PASS | 4180 |
| security | ../tests/security/errorLogging.test.js | PASS | 130 |
| security | ../tests/security/apiKeyFailure.test.js | PASS | 401 |
| security | ../tests/security/productionJwt.test.js | PASS | 124 |
| security | testLegacyPhoneAuth.js | PASS | 3644 |
| security | ../tests/security/userValidation.test.js | PASS | 383 |
| tasks | testTaskReportOnly.js | PASS | 7312 |
| tasks | testTaskResumeLoginState.js | PASS | 5543 |
| tasks | testTaskRegistryPolicy.js | PASS | 60 |
| tasks | testTaskRegistryIntegration.js | PASS | 4789 |

Kiểm tra bổ sung đã chạy riêng: testDashboardFailureCounts.js (đối soát 17 metrics độc lập + IG READY), testLegacyPhoneAuth.js (owner spoof/inactive), testSystemHealthUI.js (Chrome smoke + 10 tab), testDeviceDashboardIntegration.js --ui, build production frontend và node --check/diff.

| Yêu cầu | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| 10/25/30/31 phút và +1ms biên | PASS | testDeviceOfflineTimeout/testDeviceMonitoring; >1800 mới Offline |
| Owner/admin own scope/IDOR | PASS phạm vi fixtures | testDashboardIsolation; không thay thế mọi endpoint |
| 999/1000/1001, last-slot race | PASS | testDeviceDashboardIntegration |
| RR rollback/cursor/restart/no work | PASS | testRoundRobinIntegration |
| Source thiếu/Chờ Login/Die | PASS | testTaskResumeLoginState sáu task |
| Report id-only/duplicate/final conflict | PASS | testTaskReportOnly và farm 1000 terminal rows |
| Cron active/resource protection | PASS | testCronActiveProtection |
| Cron hai process/connection loss/kill worker | PASS | testCronDistributedLock |
| Socket drop sau commit assignment/report | PASS | tests/recovery/commit-and-drop.json |
| 1/10/50/100/200 device burst | PASS trong lần đo | latency/zero errors trong performance JSON |
| 500/1000 device burst không lỗi | FAIL | ECONNREFUSED; invariants sau retry PASS |
| Get account/config/dashboard 10..1000 clients | PASS có giới hạn | max 50 HTTP in-flight, cron chạy cùng get-config |
| Chrome Settings Health + 12 route smoke | PASS | frontend-smoke.json; không phải toàn bộ CRUD |
| 2/10 tab cùng user | PASS load | tabs.json; Dashboard polling recovery riêng đã PASS; chưa soak memory |
| 100 user đồng thời với JWT riêng | NOT_RUN | Không suy ra từ 1000 device chung một owner |
| Redis/Queue/WebSocket restart/rooms | N/A | Project không dùng các dịch vụ này |
| Subscription/API key expiry | N/A | Không có mô hình expiry, key username giữ nguyên |
| Mọi CRUD/bulk/modal/error-state từng trang | NOT_RUN đầy đủ | Smoke + suites chọn lọc; chưa phủ mọi workflow |
| Linux VPS/Nginx/PM2 load và container restart | NOT_RUN | Không có quyền truy cập production từ phiên này |
| DB restart/packet loss/deadlock chaos dài hạn | NOT_RUN đầy đủ | Connection loss cron + transaction rollback đã chạy riêng |
| Startup migrations production-copy/no-loss | NOT_RUN | Chỉ registry migration có fixture idempotency |
| Dependency CVE/penetration/full SQLi-XSS | NOT_RUN | Source audit và regression security chọn lọc |
| Soak 24/7 / memory leak chứng minh | NOT_RUN | RSS burst không chứng minh leak hoặc độ ổn định 24/7 |

Kết luận nghiệm thu: CHƯA ĐẠT TOÀN BỘ. Giữ rủi ro API key theo quyết định user, burst cao FAIL và các hạng mục NOT_RUN. Không triển khai database thật, không tự commit/push.

Kiểm tra bổ sung cuối: testSystemHealthSignals.js PASS (owner isolation, admin-only metrics, cảnh báo task dài/offline/conflict và DB unavailable). Dashboard --ui chạy lại PASS sau sửa đồng bộ test chờ nút phân trang enabled; lần chạy trước timeout được giữ trong supplemental-results.json.
