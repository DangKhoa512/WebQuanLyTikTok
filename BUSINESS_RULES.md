# Quy tắc nghiệp vụ đã đối chiếu

## Ownership và quyền
JWT phải khớp id/username với user đang active trong DB; role lấy từ DB. Dashboard thường, kể cả admin, chỉ tổng hợp owner đăng nhập. Admin quản lý user/task catalog/limit của user khác theo API riêng. Owner phone lấy từ middleware x-api-key, ưu tiên hơn body/query.

Theo quyết định của người dùng ngày 2026-10-11, x-api-key tiếp tục là username trên web nội bộ. Không có model subscription/expiry của API key, không giả lập chức năng hết hạn không tồn tại.

## Thiết bị
DEVICE_OFFLINE_TIMEOUT_SECONDS mặc định 1800, Compose override dùng cùng biến. OFFLINE khi now-last_seen > timeout; đúng 1800 giây vẫn online. Online có task active hoặc trạng thái RUNNING hợp lệ → RUNNING, còn lại IDLE. Không có last_seen → OFFLINE. Heartbeat/get-task/report hợp lệ cập nhật last_seen; request sai owner/task không được làm sống lại thiết bị.

Cron 5 phút tạo DEVICE_UNRESPONSIVE, giữ task/reservation. Heartbeat hợp lệ gỡ cảnh báo và dựa task thực tế để chọn Running/Idle. Giới hạn 1000 thiết bị/owner, recheck trong khóa user; bảng máy phân trang độc lập giới hạn này.

## Task
Sáu task built-in: PAGE_JOB, INSTAGRAM_JOB, REG_PAGE, REG_INSTAGRAM, NUOI_FACEBOOK, NUOI_INSTAGRAM. Catalog admin; bật/tắt/thứ tự theo user. Cursor chung tất cả máy của user, chỉ advance khi reservation và execution commit thành công. Resume không advance. capabilities là bộ lọc khả năng bổ sung, không thay quyền bật/tắt user.

RUNNING/REPORTING là active; terminal SUCCESS/FAILED/RELEASED. Không có CANCELLED trong enum hiện tại. SUCCESS/DONE/DA_XONG nhận ở report; mặc định SUCCESS. Report lặp cùng terminal state trả already_reported; terminal khác trả 409. id-only report không tăng chỉ tiêu account/job/nuôi và không giải phóng domain lock thay API cũ.

Source xóa/trash → execution FAILED với SOURCE_ACCOUNT_UNAVAILABLE và thử task khác, vòng quét hữu hạn. Source CHO_LOGIN/ACCOUNT_DIE/live_status die → giữ task để đối soát, không trả account và không tự reset.

## Account / Page
Facebook/Instagram status: CHO_LOGIN, DANG_LOGIN, DANG_LAM, LOGIN_THANH_CONG, LOGIN_FAIL, DA_CHAY_XONG, ACCOUNT_DIE; nurture: CHUA_NUOI, DANG_NUOI, DA_NUOI, NUOI_FAIL.
Page: CHUA_LAM, DANG_LAM, DA_LAM.
Chrome: ACC_LOGIN, LOGIN_THANH_CONG, ACC_DA_KHANG, ACC_CHUA_KHANG, ACC_DU_DK, ACC_DA_DUNG, ACC_DIE.
Enum từng bảng có trong source-inventory.json.

REG_PAGE cần tuổi login/cooldown, Page limit, token/live và khóa phù hợp. Nuôi DA_NUOI đủ cooldown được lấy lại/reset theo luồng từng nền tảng. Cron Facebook Page reset DA_CHAY_XONG → LOGIN_THANH_CONG và Page → CHUA_LAM khi đủ cấu hình; bản sửa giữ nguyên nếu DeviceTaskRun vẫn active. Không biến Offline thành thất bại task.

Facebook login limit: user chỉnh limit của mình; admin được sửa user khác. Số nguyên dương; giới hạn áp dụng từng máy của cùng owner, không phải config riêng từng device.

## Định nghĩa Dashboard
FB/IG total: mọi kind chưa trash của owner; các dòng Login/Active/Chưa nuôi là tập con có thể chồng nhau, không phải phân hoạch total.
Page total: is_active=1; ba trạng thái Page phân hoạch total.
Device total = Running + Idle + Offline.
Error card mới: số DeviceTaskRun FAILED trong lịch sử, tách khỏi lỗi account/claim; không phải unresolved errors.
Bảng task vẫn là số liệu nghiệp vụ: Reg IG ERROR là claim REG_FAIL lịch sử, các dòng khác là account/tài nguyên lỗi hiện tại. Claim lỗi lịch sử không tự tạo cảnh báo cần xử lý.
READY là bộ lọc inventory của dashboard, không phải cam kết mọi request đều nhận task; còn phụ thuộc scenario, capability, claim, cooldown và transaction. Cần tiếp tục đối soát toàn bộ predicates (xem BUG_REPORT.md).
