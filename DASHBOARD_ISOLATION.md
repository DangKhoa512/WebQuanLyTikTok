# Dashboard isolation — 2026-10-07

## Nguyên nhân và phạm vi audit

GET /api/dashboard/summary trước đây lấy User từ JWT nhưng controller truyền system=true khi role admin. Service chủ động duyệt registry.users(), cộng stats và gộp Device/activity của tất cả user. Đây là nhánh admin-global trước đó, không phải SQL owner filter của User thường bị mất. Yêu cầu mới thay contract: mọi Dashboard, kể cả admin, chỉ có dữ liệu của current authenticated user.

Các query account/task/device/activity đã có owner_username ở WHERE/findAll. Nhánh aggregate toàn user bị xóa hoàn toàn; service không còn mode global và không có endpoint System Dashboard mới. Cờ boolean từ consumer cũ được chấp nhận nhưng không thể kích hoạt global scope.

Audit còn phát hiện scheduler state có last_result/reset counts và last_error toàn hệ thống; không thể quy thuộc user. Không trả dữ liệu này hoặc activity CRON global trên Dashboard cá nhân, scheduler giữ field null. Không tạo số reset cá nhân giả. UI bỏ alert scheduler global. JWT cũ chỉ verify signature, chưa xác minh id/username/user active, tạo khả năng payload thiếu username làm một số service nhận owner rỗng và bỏ WHERE; middleware nay fail closed cho payload thiếu/sai identity.

## Authentication và ownership

JWT thật được authController ký với id, username, role. Middleware jwtAuth tiếp tục verify token/expiry bằng secret cũ, sau đó lookup users bằng signed id + is_active, kiểm tra username khớp. req.authenticatedUser và req.admin dùng identity/role DB hiện tại. Thiếu username/id, mismatch hoặc tài khoản inactive trả 401. Không tin role/owner/id trong query/body; giữ chữ ký token, storage frontend và convention req.admin. Không sửa apiKeyAuth/phone contracts.

Ownership entity hiện có:

| Entity | Ownership |
| --- | --- |
| User | users.id, username |
| Facebook/Instagram/Account, DashboardDevice, DeviceTaskCapability | owner_username trực tiếp |
| FacebookPageJob | owner_username trực tiếp hiện có + facebook_account_id liên kết Account; Page detail kiểm tra Account cùng owner trước khi lấy pages |
| DeviceTaskRun, Reg Instagram claim, nurture logs/report | owner_username trực tiếp; account/device IDs vẫn được kiểm tra cùng owner |
| Scenario, cooldown/eligibility settings | AppSetting key theo owner_username, scenario trong JSON cá nhân |
| User Task Settings / Round-Robin state | user_id FK users.id; task metadata Registry là global |

Không thêm user_id/ownership column trùng lặp. Reuse indexes: account owner/kind/status, owner/kind/trashed; Page owner/is_active; Device owner/device unique và owner/last_seen; task run owner/device/status; Reg claim owner/status và owner/account/status; log owner/created; user_task_settings user/task unique và dispatch_order. Không schema/index/migration mới.

## Source dữ liệu Dashboard

- Facebook/Instagram/Page cards và tất cả trạng thái/error count: SQL WHERE owner_username=current authenticated username trước aggregate.
- READY/RUNNING/ERROR sáu business flows: giữ nguyên điều kiện hiện có cộng owner predicate, kể cả REG_INSTAGRAM subquery và claim ngoài. Task Registry vẫn dynamic/global; list(owner) lấy enabled/priority/order của chính user, không list(null) cho Dashboard.
- Device inventory/heartbeat/active task: mỗi query scope owner trước merge, sau đó classify/filter/search/pagination trên snapshot của riêng user. Summary không phụ thuộc page; capacity 1000 và page size 20/50/100 giữ nguyên.
- Error card, alert health/offline/task: frontend derive từ summary/task stats đã scope backend; không filter global data để che scope.
- Activity: từng log/report/Page/Reg claim findAll theo owner. Bỏ CRON global. Next available chỉ query owner được authenticate, không lấy owner từ client hoặc tùy ý từ row.
- Initial load/refresh/polling đều cùng endpoint được JWT enforce; polling 15 giây hiện hữu giữ nguyên. Không có Dashboard websocket/SSE hay backend Dashboard cache. Thêm Cache-Control: private, no-store để browser/proxy không dùng chung response. Không tạo cache mới.
- Response shape giữ accounts/tasks/task_registry/devices/activity/generated_at; scope=user cho cả admin; scheduler=null. Frontend wording xxx / 1.000 thiết bị, không Toàn hệ thống và không owner column của global mode.

## IDOR

GET/PUT /api/device/capabilities/:device_id bổ sung hasOwnedDevice: chỉ chấp nhận registration hoặc Facebook/Instagram inventory job active của current owner; device chỉ thuộc user khác/không tồn tại trả 404, PUT không tạo config cho tên máy tùy ý. Cùng device_id của hai owner vẫn là hai scope riêng hợp lệ.

Các protection hiện có được giữ và kiểm thử: GET/PATCH /api/accounts/:id (id + owner), GET /api/facebook/:accountId/pages (Account owner trước Page), Instagram login-cookies (id + owner), Page report (page_id + apiKey owner), task report (run.id + apiKey owner). Bulk get/update/delete FB/IG lọc ids+owner ở DB; theo contract hiện hữu, ID lạ bị bỏ qua, response count/affected=0, không trả dữ liệu và không sửa/xóa row người khác. Không đổi bulk API thành error mới hoặc phá xử lý list trộn ID.

Stats endpoints liên quan /api/stats và FB/IG/nurture list/stats được audit: controller ownerFromAdmin từ JWT identity đã chuẩn hóa, query scope owner. Không mở rộng thay đổi sang API thiết bị cũ không liên quan.

## Files sửa

- backend/src/middleware/jwtAuth.js
- backend/src/controllers/dashboardController.js, deviceController.js
- backend/src/services/dashboardService.js, deviceRegistrationService.js
- backend/scripts/testDashboardIsolation.js mới; testDeviceDashboardIntegration.js, testTaskRegistryIntegration.js cập nhật assertion admin-own
- backend/package.json thêm test:dashboard-isolation
- frontend/src/pages/Dashboard.jsx
- DASHBOARD_ISOLATION.md, DEVICE_DASHBOARD.md, TASK_REGISTRY.md, PROJECT_CONTEXT.md

## Kiểm thử đã đạt

- node backend/scripts/testDashboardIsolation.js: HTTP/MySQL DB tạm, A 10 FB/20 IG/5 Page/4 Device và admin B 100/200/50/40, không cộng 110/220/55/44; Device A3 1 Running/1 Idle/1 Offline; task REG_INSTAGRAM 10/2/1 vs 100/20/10; own enabled/order; error/card source; own activity/scheduler global excluded; concurrent 12 refreshes xen kẽ owner; spoof query; search/task-independent status filter/page20; IDOR detail/update/delete/action/Page report/task execution; signed malformed/mismatched JWT và inactive user trả 401; service owner rỗng reject; old boolean true không global; no-store.
- node backend/scripts/testDeviceDashboardIntegration.js --ui: 1000/1001/race, status transitions/task completion, search/filter/pages và Chrome polling không reload, branding/mobile, admin own Device 2 thay vì total1002.
- node backend/scripts/testTaskRegistryIntegration.js --ui: Registry/global metadata/personal settings, owner-specific Dashboard realtime ON/OFF/errors, API/Dispatcher lock/race/report/retry/timeout, own task order/priority preserved. Admin Page READY=0, user READY=26; không cộng stats khi admin ON.
- Frontend production build đạt, cảnh báo chunk >500KB hiện hữu; không lint/typecheck script trong package hiện tại. Syntax/diff kiểm tra cuối.
- Mọi fixture ở database tạm kiểm tra tên khác DB đang dùng, cleanup sau test. Không seed hoặc sửa DB thật. Chưa commit/push/deploy lượt này; không cần migration mới.
