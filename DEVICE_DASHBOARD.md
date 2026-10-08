# Device Dashboard và MMO branding — 2026-10-07

## Audit và nguyên nhân

Code cũ không tính Offline bằng `total-running`: nó đã dùng tuổi last_seen với ngưỡng 5 phút. Tuy nhiên source liveness/runtime không thống nhất: máy chỉ có trong Facebook/Instagram account dùng MAX(account.updated_at) làm last_seen; máy có heartbeat lại ghi đè giá trị đó. Thời gian chỉnh resource không chứng minh thiết bị online. Runtime suy từ current_task/current_uid, bỏ qua reported_status, nên IDLE có UID gần nhất bị tính Running, trong khi heartbeat RUNNING không có UID/task có thể bị tính Idle. Không thể kết luận riêng con số 307 trên VPS chỉ từ screenshot; chưa đọc dữ liệu heartbeat VPS thật.

API thống kê toàn bộ nhưng rows bị slice 100 hai lần (theo owner rồi admin tổng hợp). Frontend lọc/search chỉ trên rows đã tải, nên danh sách không khớp counter và bỏ sót máy sau dòng 100. Đây là giới hạn payload, không phải capacity đăng ký cũ; trước thay đổi không có chặn 100 thiết bị/user.

## Source trạng thái

- last_seen lấy từ dashboard_devices, được heartbeat/get-next-task/task-report cập nhật như trước. Account.updated_at chỉ là last_activity_at tham khảo, không dùng để chứng minh online. Máy chỉ có resource nhưng chưa có tín hiệu thiết bị vẫn xuất hiện Offline.
- Quá timeout hoặc không có last_seen hợp lệ: OFFLINE. Trong timeout và có DeviceTaskRun RUNNING/REPORTING hoặc thiết bị báo RUNNING: RUNNING. Trong timeout và không chạy: IDLE (ONLINE được quy về IDLE).
- Heartbeat không truyền task_id vẫn tìm active run theo owner/device. Active run có ưu tiên hơn status IDLE client; ngoài active run, IDLE/ONLINE explicit có ưu tiên hơn UID gần nhất. Giữ contract alias và kiểm tra task_id đã kết thúc/sai owner.
- Config tập trung backend/src/config/devices.js: capacity 1000, DEVICE_OFFLINE_TIMEOUT_SECONDS mặc định 300; .env.example có mô tả. Tái sử dụng 5 phút hiện hữu, không đổi timeout khóa task của Dispatcher. Không có heartbeat interval tự động trong client repo; tool bên ngoài quyết định gửi heartbeat. Dashboard tiếp tục polling 15 giây, không thêm polling thứ hai. Không có heartbeat mới thì không thể suy đoán thiết bị vật lý vẫn online.
- Summary và filter dùng cùng classified snapshot: total=running+idle+offline; online=running+idle. Admin vẫn tổng hợp toàn hệ thống, không scope nhầm sang user khác.

## Capacity và pagination

ensureDevice dùng chung cho đăng ký qua heartbeat và next-task. Existing device vẫn dùng được khi đạt capacity. Thiết bị mới xét tổng DISTINCT device_id của dashboard_devices cùng inventory Facebook/Instagram job đang active theo owner. Máy legacy đã biết có thể tạo registration record mà không tính thành máy mới; không xóa/cắt inventory có sẵn dù đã vượt capacity.

Khi đủ 1000, device mới bị 409 DEVICE_LIMIT_REACHED. Đăng ký mới serialize bằng cùng state lock user của Round-Robin (không đổi cursor) để tránh race và deadlock khóa FK; khi chưa migration RR thì fallback khóa User. Không sửa luồng import/assignment resource cũ thành đăng ký thiết bị. Không thay handler/account lock/business reports. Có fast path cho registration đã tồn tại, tránh khóa user mỗi heartbeat.

GET /api/dashboard/summary JWT giữ accounts/tasks/activity/devices.summary/devices.rows; thêm query và metadata:

```text
device_status=ALL|RUNNING|IDLE|OFFLINE|DEVICE_UNRESPONSIVE
device_task=ALL|<task>
device_search=<text>
page=1
page_size=20|50|100
```

```json
{
  "devices": {
    "summary": { "total": 309, "running": 2, "idle": 20, "offline": 287, "online": 22 },
    "total": 309,
    "capacity": 1000,
    "page": 1,
    "page_size": 50,
    "page_count": 7,
    "filtered_total": 309,
    "offline_timeout_seconds": 300,
    "task_options": [],
    "rows": []
  }
}
```

Số trong example chỉ minh họa contract; runtime không hardcode. Backend merge inventory/heartbeat/task rows nhẹ, classify/filter/search toàn dataset rồi trả tối đa một page, không gửi 1000 full payload mỗi polling. Summary tính toàn dataset; filtered_total/page_count tính theo filter/search. Next-available chỉ query cho máy Idle thuộc page trả về. Admin aggregate toàn user trước pagination một lần; capacity vẫn per-user, UI admin ghi tổng hệ thống và giới hạn/user. Index owner/device unique, owner/last_seen, active task owner/device/status và account device_id hiện có được reuse; không thêm index/schema/migration.

Frontend mặc định 50 dòng, chọn 20/50/100, trước/sau; search debounce 300ms, status/task/search giữ qua polling; response cũ bị bỏ qua khi query đổi, không chạy request summary song song. Page được backend clamp nếu dữ liệu co lại.

## Branding, export và asset

Product đổi MMO Manager; subtitle/description/title đổi Quản lý tài nguyên MMO. Sidebar desktop, Login, mobile header, browser title/meta và START.bat đã đổi; backend package description đổi theo sản phẩm. Tên module/platform TikTok/Facebook/Instagram và khóa localStorage auth cũ giữ tương thích.

Logo lấy đúng C:\Users\KHOA\Downloads\logo.png người dùng cung cấp. Giữ toàn bộ ảnh nguồn hiện tại, chỉ resize LANCZOS; không crop/redraw/generate. frontend/public/assets/dk-logo-c3f2afce.png 256px dùng sidebar 40px, mobile 36px, login 56px, object-fit contain. dk-favicon-c3f2afce.png 64px từ cùng ảnh nguồn; index.html trỏ path mới /assets/dk-favicon-c3f2afce.png, không dùng timestamp hack.

Đã bỏ navigation Xuất file và route /export, nên không thể vào chức năng export bằng UI. Backend export endpoints và helper/source export không còn được route dùng được giữ để không phá consumer bên ngoài. Không xóa backup/file/log downloads.

## File thay đổi

Backend: config/devices.js, services/deviceStatusService.js, services/deviceRegistrationService.js, services/dashboardService.js, services/taskDispatcherService.js (điểm ensure registration), controllers/dashboardController.js, controllers/deviceController.js, .env.example, package.json; scripts/testDeviceDashboardIntegration.js mới và testRoundRobinIntegration.js thêm message chẩn đoán không có account payload.

Frontend: index.html; src/App.jsx; components/Layout.jsx; pages/Dashboard.jsx, Login.jsx; services/api.js; index.css; styles/dashboard.css; public/assets/dk-logo-c3f2afce.png, dk-favicon-c3f2afce.png. Khác: START.bat, scripts/test-dashboard-ui.cjs cập nhật wait cho server search/filter; DEVICE_DASHBOARD.md, PROJECT_CONTEXT.md.

## Kiểm tra

- node backend/scripts/testDeviceDashboardIntegration.js --ui: HTTP/MySQL DB tạm và Chrome thật; A Running/B Idle/C Offline, boundary timeout, heartbeat trở lại, task active không truyền id, chỉ-ID completion chuyển Idle, UID cũ với explicit Idle; 1000 máy stats/search/filter/page; 1001 bị chặn qua heartbeat/next-task; hai đăng ký tranh suất cuối chỉ một thành công; legacy inventory và owner/admin isolation; trang 20/search ngoài trang; UI polling không reload, logo/login/sidebar/mobile/favicon/export, mobile không overflow.
- node backend/scripts/testRoundRobinIntegration.js --ui: 4/50 request (13/13/12/12), 50 resume, 16 Page claim/resume, rollback, order/cursor/migration/persistence/UI đạt. Đã phát hiện deadlock khi dùng User lock khác thứ tự với FK RR; sửa đăng ký mới dùng state lock cùng thứ tự và test hồi quy đạt.
- node backend/scripts/testTaskReportOnly.js: contract report, no domain writes, owner/lock/race và chuyển status đạt.
- Frontend production build đạt; cảnh báo chunk >500KB hiện hữu. Không có lint/typecheck script trong package frontend/backend, không tự thêm workflow ngoài yêu cầu. Syntax và git diff --check kiểm tra cuối.
- Các fixture chỉ trong DB tạm có kiểm tra tên và tự cleanup; không seed hoặc sửa DB thật. Không deploy/migration/commit/push lượt này.

## Dashboard per-user — thay đổi contract 2026-10-07

Yêu cầu mới thay thế mô tả admin toàn hệ thống phía trên: cả admin và user Dashboard đều chỉ có data/Device/task stats/settings/activity của mình. Nhánh service aggregate users đã xóa. Capacity 1000/user và pagination giữ nguyên. JWT resolve identity active trong DB; query spoof owner bỏ qua. Scheduler global không trả trên Dashboard (scheduler=null), capabilities get/put cần owned device. Xem DASHBOARD_ISOLATION.md cho audit/schema/API/IDOR/test.

## Offline timeout — cập nhật 2026-10-08

Ngưỡng Offline hiện tại thay 300s ở phần cũ bằng 1800s (30 phút). Source duy nhất của logic phân loại vẫn backend/src/config/devices.js qua DEVICE_OFFLINE_TIMEOUT_SECONDS. Default và backend/.env.example =1800; backend/.env local đã cập nhật riêng key, runtime Node nạp dotenv đã xác minh 1800, không in secret khác. Compose backend.environment thêm ${DEVICE_OFFLINE_TIMEOUT_SECONDS:-1800}, có ưu tiên hơn env_file backend/.env để bản triển khai cũ không vô tình giữ override 300 ở env_file. Biến cùng tên trong môi trường chạy Compose/.env gốc vẫn có thể override chủ động.

Điều kiện `now-last_seen > timeout*1000` giữ nguyên: đúng 30 phút còn online (Running nếu active/reported Running, còn lại Idle); 30 phút +1ms/31 phút Offline dù active task. Không mutation task, không tự báo FAILED. Timeout request/execution/lock/cooldown/reservation/Round-Robin không sửa; task expiration độc lập giữ nguyên. Nguồn last_seen heartbeat/get-task/task-report không đổi.

Frontend không tính timeout riêng: summary/counter/alert/filter/table từ cùng classified snapshot backend và offline_timeout_seconds metadata, scope user authenticate kể cả admin. Polling 15s giữ nguyên, không thêm timer AutoTouch/task ngoài repo.

Kiểm thử: node backend/scripts/testDeviceOfflineTimeout.js xác minh default/env override, 10/25/30 phút online, >30 phút offline, active task stale, không mutation và heartbeat recovery; testDeviceDashboardIntegration.js --ui bổ sung boundary và kiểm thử HTTP/MySQL/Chrome existing heartbeat/polling/filter/capacity; testDashboardIsolation.js hồi quy own/admin/spoof/IDOR. DB tạm riêng tự cleanup, không seed/DB thật writes.

Production: đã cập nhật cấu hình Compose trong repo, chưa deploy/SSH VPS. Máy phát triển không có Docker CLI nên không chạy compose config/container locally; runtime Node local=1800 đã kiểm tra. Sau deploy source cần recreate backend bằng docker compose up -d --build; kiểm tra duy nhất key bằng docker compose exec backend node -e "console.log(require('./src/config/devices').offlineTimeoutSeconds)" (mong đợi1800). Không cần migration. Chưa commit/push lượt này.



## Giám sát AutoTouch 24/7 — 2026-10-08

Timeout tập trung DEVICE_OFFLINE_TIMEOUT_SECONDS=1800. Cron monitorDevices chạy ngay startup và mỗi 5 phút, độc lập với task completion, có guard chống chạy chồng trong process. Quá 30 phút không có tín hiệu hợp lệ: OFFLINE + DEVICE_UNRESPONSIVE. Đúng 30 phút còn online.

Model DeviceHealth (device_health, unique owner_username/device_id) lưu status OFFLINE, alert_code DEVICE_UNRESPONSIVE, last_seen snapshot, unresponsive_since (=last_seen+timeout), detected_at (lần đầu cron phát hiện). Server sync force:false/alter:false tạo bảng mới khi boot, không cần seed hoặc migration thủ công. Monitor khóa device/recheck last_seen; giữ first detected_at; không cập nhật last_seen hoặc task/account/khóa. Bỏ qua snapshot cảnh báo đã lưu để tránh transaction lặp.

Heartbeat/next-task/report SUCCESS hoặc FAILED hợp lệ cập nhật đúng owner/device và gỡ cảnh báo trong transaction. Report idempotent và next-task không có việc hoặc task bị OFF vẫn ghi liveness. Tín hiệu sai/report xung đột không cập nhật. Heartbeat/report khóa device cùng thứ tự chống race. Next-task resume đúng task ID cũ trước cấp mới; task OFF giữ task/khóa và trả no-task. releaseExpiredTasks chỉ monitor/trả 0, không RELEASED/TASK_TIMEOUT hoặc giải phóng account do mất heartbeat. activeTaskProtection loại trừ resource có task RUNNING/REPORTING cùng owner khỏi stale cleanup FB Job/IG Job/Reg IG; timeout cũ giữ cho resource không tracked. Global Round-Robin/cooldown/reservation/request timeout không đổi; dữ liệu nghiệp vụ vẫn báo qua API cũ.

Dashboard derive cảnh báo từ last_seen cùng timeout, hiện ngay quá hạn; cron lưu bền mỗi 5 phút. Filter device_status=DEVICE_UNRESPONSIVE (Cần xử lý), unresponsive_total tính toàn dataset của user trước pagination. Hiển thị tên máy, task/account hiện tại hoặc gần nhất, Last Seen, thời gian không tín hiệu. Row có alert_code/unresponsive_since/unresponsive_seconds (quá ngưỡng)/inactive_seconds (không tín hiệu); cột Mất phản hồi dùng inactive_seconds. last_task/last_uid từ run mới nhất cùng owner. Inventory không last_seen vẫn Offline nhưng không suy ra mất phản hồi trên 30 phút.

Repo không có vòng chạy AutoTouch chính để cài heartbeat nền. Client có thể gửi POST /api/device/heartbeat với device_id, task_id tùy chọn qua timer độc lập, không gọi lại vòng task từ timer.

Kiểm thử đạt trên DB tạm riêng, không seed/ghi DB đang dùng: testDeviceMonitoring.js (API/MySQL/callback cron, biên 10/25/30/31, warning timestamp, owner/device trùng ID, invalid signals, hold/resume 5 concurrent, task OFF, recovery/race, FAILED/idempotent, stale-lock SQL); testDeviceDashboardIntegration.js --ui (Chrome cảnh báo/filter/duration/recovery polling, capacity/search/pagination/mobile); DeviceOfflineTimeout; TaskReportOnly; TaskRegistryIntegration (kỳ vọng hold/resume); RoundRobinIntegration (50 concurrent và Page); DashboardIsolation; frontend build. Chưa deploy VPS; cấu hình local/default/Compose 1800, cần xác minh container sau deploy. Chuẩn bị commit/push main theo yêu cầu user; sửa lỗi mã hóa tiếng Việt trước commit.
