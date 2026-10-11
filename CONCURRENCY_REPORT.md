# Concurrency và recovery

Bằng chứng: tests/results.json; tests/performance/results.json; testRoundRobinIntegration.js; testAuditFarm.js; testCronDistributedLock.js.

- RR: 4 và 50 request HTTP đồng thời, phân phối bốn task 13/13/12/12 ở lượt 50, cursor owner độc lập, resume không advance, rollback domain reservation và cursor nếu persist execution lỗi.
- Page: 16 claim/resume đồng thời, không bỏ lại Page lock khi không có công việc.
- Capacity: 999 → hai request thêm máy cạnh tranh, chỉ một lên 1000; 1001 bị từ chối. Đã chạy lại trên DB tạm.
- Farm: mức 1/10/50/100/200/500/1000 virtual clients, tổng 1000 execution/account độc lập. Lượt tăng dần gồm cả new claim và resume, không phải 1000 claim mới đồng thời ngay từ đầu.
- Burst cao có ECONNREFUSED local. Retry get-task lấy đúng execution cũ; final/duplicate report chỉ còn 1000 terminal SUCCESS. Đây là kiểm tra invariant sau retry, không biến performance burst thành PASS.
- Cron: hai tiến trình Node riêng chỉ một thực thi sau MySQL advisory lock; khi connection mất hoặc worker bị kill, tiến trình khác lấy lại khóa. Lock scope database, cadence 5 phút không đổi.
- Account/page đã báo cáo nghiệp vụ nhưng execution còn active: cron giữ trạng thái/lock; khi terminal mới reset cooldown. Hai lượt reset đồng thời idempotent trong fixture.
- Device mất 31 phút vẫn giữ task/lock; 5 request resume cùng máy không sinh thêm execution, heartbeat gỡ cảnh báo theo trạng thái thực.
- Child process RR đọc cursor sau restart. Commit rồi đóng socket assignment/report được kiểm tra tại tests/recovery/commit-and-drop.json khi file này đã có kết quả PASS.

Hạn chế: chưa kiểm tra Linux/Nginx/PM2 production, 1000 fresh claim trong một burst không có retry, full chaos DB restart/migration rollback, tất cả combinations account lifecycle. DeviceTaskRun không có unique constraint trực tiếp enforcing một active resource; protection dựa transaction/row locks và domain locks. Audit không bổ sung lease/fencing hay tự thu hồi task Offline.
