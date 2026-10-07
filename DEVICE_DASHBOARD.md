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
device_status=ALL|RUNNING|IDLE|OFFLINE
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
