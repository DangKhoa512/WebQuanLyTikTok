# Task Management — Registry global + cấu hình cá nhân

Cập nhật 2026-10-06, thay thế mô hình admin assign/revoke của lượt triển khai trước.

## Kiến trúc hiện hành

- `task_registry` là danh mục toàn hệ thống: id, task_key UNIQUE, name, platform, description, enabled (System Enabled), default_priority, sort_order, archived_at, timestamps.
- `user_task_settings`: user_id, task_id, enabled, priority, timestamps; UNIQUE(user_id,task_id), FK RESTRICT. Đây là cấu hình tự quản lý, không phải quyền admin cấp.
- Mọi user, bao gồm admin, thấy tất cả task active của Registry. Thiếu cấu hình cá nhân: **OFF + default_priority**. Task mới mặc định priority 50; tạo task không insert hàng loạt cấu hình user.
- Admin chỉ quản lý loại task: tạo, metadata, System Enabled, archive. Không chọn user, không assign/revoke, không sửa Enabled/Priority của user khác.
- Mỗi account tự ON/OFF và chỉnh priority của chính mình. Admin cũng dùng cấu hình cá nhân của account admin.
- Timeout/retry vốn theo owner trong `AppSetting.task_dispatcher`; tiếp tục theo owner và user tự sửa được. JSON tasks cũ không còn là nguồn Enabled/Priority khi migration v2 hoàn tất.

Sáu task giữ nguyên key và defaults: PAGE_JOB 100, INSTAGRAM_JOB 90, REG_PAGE 80, REG_INSTAGRAM 70, NUOI_FACEBOOK 60, NUOI_INSTAGRAM 50. Metadata/default builtin định nghĩa một lần trong `taskRegistryPolicy.js`; danh mục active lấy từ DB sau migration. Frontend không giữ danh sách sáu task riêng.

## Dispatcher và owner

`canRun = task active && System Enabled && userSetting.enabled`, sau đó giữ nguyên handler, capabilities, Round-Robin (dispatch_order), READY data, account/device condition, lock, retry, cooldown.

JWT xác định current owner. Device tiếp tục dùng x-api-key xác thực username active. Không dùng user_id/target_user_id/owner_username từ body để đổi owner. Registry API đọc lại role/is_active từ DB; user tạo/sửa/archive loại task trực tiếp bị 403.

Dispatcher đọc cấu hình cá nhân trong transaction cấp task với shared lock, giữ khóa chống cấp trùng. Task OFF/System OFF/archive không được cấp hoặc resume; report/release của lượt đã chạy vẫn kết thúc hợp lệ. Sáu API cấp task cũ cũng kiểm tra System Enabled + cấu hình cá nhân; không đổi contract khi được chạy.

Dashboard dùng cùng Registry. User thấy account/device/statistics/activity theo owner; ON/OFF cá nhân không làm mất dòng thống kê task. Admin vẫn xem tổng quan toàn hệ thống, nhưng không có API chỉnh cấu hình task của user khác. Task mới chưa có job hiển thị 0/0/0.

## API `/api/task-registry` (JWT)

| Endpoint | Quyền / hành vi |
| --- | --- |
| GET / | Mọi user: Registry active + user_enabled/priority của chính mình |
| PUT /mine `{tasks:[{task_id,enabled,priority}]}` | Upsert các cấu hình đã chỉnh của current user; không cần target_user_id |
| POST / | Admin tạo loại task; key uppercase/unique, default_priority mặc định 50 |
| PATCH /:id | Admin sửa metadata/System Enabled/default_priority, không rename key |
| POST /:id/archive | Admin archive; giữ record/key/history |

**Đã loại bỏ** `/users`, `/users/:id/tasks` và API assign/revoke. Gọi các endpoint này trả 404, kể cả admin. `service.users()` chỉ là truy vấn nội bộ để tổng hợp Dashboard toàn hệ thống; không mở API quản lý cấu hình user.

UI: Enabled + drag/drop order + up/down controls + cycle preview. Own Priority input is hidden; Priority remains DB/API metadata. Reorder saves current toggles and full task_ids atomically; backend response is authoritative; failures restore previous order.

## Migration an toàn

```powershell
node backend/scripts/migrateTaskRegistry.js
node backend/scripts/migrateTaskRegistry.js --apply
```

Lệnh đầu chỉ in kế hoạch. `--apply` tạo backup cục bộ gitignored `artifacts/task-settings-backup-*.json`, thêm default_priority và bảng user_task_settings, migrate Enabled/Priority, đối chiếu cấu hình/users/history trước–sau.

- Nếu có `user_tasks` từ triển khai v1: copy nguyên Enabled/Priority sang user_task_settings, không reset các cấu hình cũ. Bảng cũ giữ để đối chiếu/khôi phục, **không được dùng trong runtime hoặc API**.
- Nếu chưa triển khai v1: đọc AppSetting dispatcher cũ để bảo toàn sáu task/config của user hiện hữu, không tạo bảng permission user_tasks.
- User/task tạo sau migration không tự có row: fallback OFF/default_priority cho đến khi account tự lưu.
- Marker `AppSetting('__system__','task_settings_v2','complete')` kích hoạt v2. Trước marker, giữ legacy dispatcher. Migration idempotent; chạy lại không reset cấu hình cá nhân.
- Không DDL startup, không drop bảng, không seed, không xóa job/report/statistics/history. Backup không chứa password/cookie/token/account data và không được commit.

Database local cấu hình hiện tại đã áp dụng v2 thành công ngày 2026-10-06: Enabled/Priority cũ được đối chiếu nguyên vẹn, user/config cũ giữ nguyên, history không giảm. Không tạo task thử hay sửa settings task user thật; các fixture chỉ ở DB tạm. Các cấu hình khác thay trong UI test đã được khôi phục.

Môi trường khác cần deploy source mới và chạy migration chủ động, xác minh GET Registry ready=true; không tiếp tục chạy source assign/revoke v1 sau khi chuyển sang v2. Chiến lược rollback cần quyết định riêng và giữ dữ liệu mới; không xóa bảng để rollback.

## Task mới và executor

Admin tạo task global → tất cả account thấy OFF/default_priority → account tự ON/priority → dispatcher xét cấu hình riêng.

Metadata không tự tạo executor. Task chưa có handler ghi rõ “Chưa có handler”; dispatcher không cấp task giả. Muốn thực thi loại mới cần handler/job/statistics/device support thật. Dashboard/Settings không cần thêm row hard-code.

## Kiểm thử đã đạt

- Frontend production build, backend syntax, policy và Instagram check-live mock.
- `node backend/scripts/testTaskRegistryIntegration.js`: migration fresh, không bảng permission, giữ Enabled/Priority/config cũ, idempotent.
- `node backend/scripts/testTaskRegistryIntegration.js --ui --legacy`: upgrade schema v1, CRUD/unique/key bất biến/archive, global visibility, task mới OFF/50 không fan-out rows, admin/user tự chỉnh Enabled/Priority độc lập, body spoof không đổi owner, endpoint assign đã loại, user gọi quản lý Registry 403, timeout/retry theo owner.
- Chrome UI dùng CommonSettingsPanel thật + ref + một SaveBar: admin thêm global task; user không Add/select-user, nhìn thấy task mới và tự bật/priority; mobile không tràn.
- API device thật hai owner cùng device_id: OFF chặn, ON dùng đúng account/priority; body owner giả bị bỏ qua. Sáu legacy acquisition endpoint cũng chặn OFF.
- Dispatcher thật trên DB tạm: Page/Instagram cùng READY chọn đúng priority cao; race/khóa/retry/timeout/preview, tự OFF chặn resume, report in-flight hợp lệ, archive giữ history/key/name.
- Dashboard: Registry đồng nhất, không duplicate, task mới zero, user owner scope/admin toàn hệ thống.
- `scripts/test-dashboard-ui.cjs` và `scripts/test-settings-tabs.cjs` trên API thật: KPI/workload, refresh/filter/search, mọi tab, save/reload/restore, offline giữ nháp, không GET trùng, responsive.

Không chạy `testTaskDispatcher.js` độc lập trên DB đang dùng; integration chỉ tái sử dụng fixture trong DB tạm được kiểm tra tên và cleanup.

## Dashboard status cá nhân — cập nhật 2026-10-06

Công việc realtime có cột Trạng thái giữa Tác vụ và READY. Badge xanh nhạt “● Đang bật” / đỏ nhạt “● Đang tắt” chỉ đọc `task_registry.user_enabled` của current user. User thiếu row mặc định OFF. Admin cũng lấy Registry kèm cấu hình chính admin (`registry.list(owner)`), trong khi READY/RUNNING/ERROR vẫn tổng hợp toàn hệ thống như trước.

Status không suy ra từ errors hoặc job availability, không lấy trạng thái từ user khác và không có toggle trên Dashboard. Khi System OFF nhưng cấu hình cá nhân ON, badge vẫn thể hiện ON cá nhân; tooltip giải thích global disable. OFF không ẩn row hoặc làm mất statistics; chỉ tên task giảm opacity nhẹ, badge và số đếm giữ rõ. Error indicator cạnh tên và badge error vẫn riêng.

Giữ thứ tự Registry sort_order/id, không thêm cột priority, không sửa công thức statistics. Polling 15 giây và nút refresh lấy status mới từ summary; không cache enabled riêng và không reload trang. Không thêm endpoint/schema/migration.

Kiểm tra đạt: frontend build, backend syntax/diff; integration `--ui --legacy` qua API/Chrome thật trên DB tạm đủ sáu ca (ON, OFF, OFF+READY26, ON+ERROR6, task mới OFF/0, self ON rồi refresh), giữ search khi polling và không reload, không toggle, mobile không overflow; admin status riêng/statistics toàn hệ thống. `scripts/test-dashboard-ui.cjs` đã cập nhật selector số liệu cho cột Status và thêm assert badge/read-only.

Contract task completion mới: xem TASK_REPORT_API.md. POST /api/device/task/report chỉ cần {task_id}, mặc định SUCCESS và chỉ ghi trạng thái task/thiết bị; data nghiệp vụ gửi qua API cũ. Task report không còn gọi lại handler nghiệp vụ hoặc lưu result.

## Round-Robin toàn user — cập nhật 2026-10-07

Phần này thay thế mô tả cấp task theo Priority và chỉnh Priority cá nhân phía trên. Mỗi user có thứ tự riêng; tất cả máy cùng user dùng chung con trỏ lưu DB. Priority còn nguyên trong DB/API, chỉ dùng để khởi tạo thứ tự lần đầu (giảm dần), không quyết định task được cấp sau migration. UI cá nhân ẩn Priority, thêm kéo thả, nút lên/xuống và preview vòng chạy. Kéo thả lưu cả toggle đang chỉnh cùng thứ tự; lỗi khôi phục thứ tự trước đó.

Schema bổ sung: `user_task_settings.dispatch_order` nullable unsigned integer, index `(user_id,dispatch_order,task_id)`; bảng `user_dispatcher_state` với PK/FK `user_id`, nullable FK `next_task_id`, `updated_at`. Marker `AppSetting('__system__','round_robin_v1','complete')`. Task mới mặc định OFF, thêm cuối vòng khi cấu hình được khởi tạo. Metadata không tự tạo handler nghiệp vụ.

`GET /api/task-registry` trả task theo thứ tự cá nhân, bổ sung `dispatch_order`. JWT `PUT /api/task-registry/order` nhận `{ "task_ids": [1,2,3,4,5,6] }`: thay số bằng toàn bộ ID task active thực tế, mỗi ID xuất hiện đúng một lần. Không nhận owner khác. `PUT /api/task-registry/mine` giữ contract tasks cũ và nhận thêm task_ids tùy chọn để lưu Enabled/Priority/thứ tự trong cùng transaction. API thiết bị get/report giữ contract hiện tại.

Dispatcher khóa state user trước device; reservation nghiệp vụ, task run và cursor chung transaction/connection, từng ứng viên dùng savepoint. Quét tối đa một vòng: OFF, archived, capabilities không hỗ trợ, chưa có handler hoặc thiếu dữ liệu hợp lệ được bỏ qua. Chỉ sau cấp thành công, next_task_id chuyển sang task kế tiếp sau task thực sự được cấp. Resume, SUCCESS/FAILED và no-task không dịch cursor. Reorder giữ nguyên ID next_task_id nếu còn active; task đã archive thì bắt đầu từ đầu thứ tự active. User khác có state/lock độc lập.

Context transaction chỉ áp dụng trong dispatcher; API nghiệp vụ cũ vẫn giữ hành vi riêng. Các cập nhật bảo trì khi không cấp được Page (đã hoàn thành, token hỏng) được giữ, khóa Page chưa có task được giải phóng. Log sau commit gồm user/device, task được chọn, cursor trước/sau, lý do skip và thời gian; không ghi credential/account payload.

Migration local đã chạy thành công ngày 2026-10-07, có backup local gitignored và đối chiếu Enabled/Priority/history/cursor. Chưa triển khai VPS. Migration không seed/drop/reset, chạy lại không đổi cấu hình hoặc cursor hiện hữu. Không có DDL tự động khi startup; dispatcher yêu cầu migration hoàn tất.

Chạy trong backend sau khi cập nhật source:

```bash
npm run migrate:round-robin
```

Docker tại thư mục chứa compose (build image mới trước migration):

```bash
docker compose build backend
docker compose run --rm backend npm run migrate:round-robin
docker compose up -d --build
docker compose logs backend
```

Kiểm thử: `node backend/scripts/testRoundRobinIntegration.js --ui` trên DB tạm: chuỗi vòng chính xác; 4 và 50 request HTTP đồng thời (50: 13/13/12/12), 50 resume; 16 Page claim/resume đồng thời; skip/OFF/capabilities/no-task; rollback khi tạo task lỗi; owner isolation; reorder/archive; migration lặp; restart process; kéo thả/lưu/reload/failure rollback/mobile. Đây là xác minh tính đúng đắn trên môi trường local, không phải số liệu sức tải VPS. Registry integration UI, CrossTarget, Instagram cross-follow UI, task report và frontend build cũng đã đạt.

Các file Round-Robin: backend/src/services/{roundRobinService,taskTransactionContext,taskDispatcherService,taskRegistryService,legacyTaskAdapter}.js; backend/src/controllers/taskRegistryController.js; backend/src/middleware/taskAcquirePermission.js; backend/src/routes/taskRegistry.js; backend/scripts/{migrateRoundRobin,testRoundRobinIntegration,testTaskRegistryIntegration}.js; backend/package.json; frontend/src/components/TaskRegistrySettings.jsx; frontend/src/services/taskRegistryApi.js; frontend/src/styles/settings.css; TASK_REGISTRY.md; PROJECT_CONTEXT.md. Các thay đổi kịch bản nuôi/tương tác chéo trước đó vẫn giữ nguyên, chưa commit/push ở lượt này.
