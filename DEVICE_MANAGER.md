# Device Manager — bản triển khai 2026-10-12

Module nâng cấp màn hình Trạng Thái Máy, dùng dữ liệu dashboard_devices hiện có. Không thay Dashboard chính, Dispatcher, Account Manager, heartbeat controller hay timeout thiết bị 1800 giây. Thống kê account trước đây vẫn truy cập tại /machine-account-stats.

## Phạm vi code

- Nhóm thiết bị: tạo/sửa/xóa, số máy, tìm nhóm, chuyển một hoặc nhiều máy; xóa nhóm chỉ bỏ gán nhóm.
- LAN: tạo/sửa/xóa; LAN có máy cần xác nhận unassign hoặc API move_to; một máy thuộc một LAN; IP trùng ở các LAN khác nhau hợp lệ.
- Thông tin mạng: API riêng nhận device_id/private_ip và có thể nhận thêm public_ip/mac; không tạo máy, không tự gán LAN và không cập nhật last_seen/current_task/current_uid/error/runtime/status/cursor/reservation.
- Device Manager: 8 thẻ thống kê, filter kết hợp tại SQL, phân trang tối đa 100 dòng, detail overview/terminal/log/history, kết quả bulk cập nhật định kỳ.
- Gateway Windows: kết nối ngược WSS, token ngẫu nhiên 256 bit, lưu SHA-256 tại VPS, mạng được cấp quyền tại VPS và CIDR allowlist tại Gateway. Gateway giới hạn đồng thời, reconnect backoff, journal chống chạy lại cùng Action ID.
- SSH: kiểm tra kết nối, thông tin uname/uptime, process AutoTouch; script_status UNKNOWN nếu không có telemetry script xác nhận. Device status không lấy từ SSH.
- Terminal: xterm, input/output/resize/disconnect, ticket dùng một lần trong 30 giây. Phiên tối đa 15 phút/idle 5 phút, tối đa 10 phiên đang hoạt động mỗi user. Nội dung terminal không lưu log.
- Respring/Reboot: action whitelist, xác nhận riêng, thêm xác nhận khi còn task hoạt động; adapter ROOTHIDE tìm đúng một .jbroot-* dài 16 ký tự hex. Không chạy tự động và không reset task.
- Hàng đợi SSH: lưu database, mặc định 5 kết nối mỗi Gateway, cấu hình 1–20; tối đa 1000 action chờ mỗi Gateway; kết quả từng máy riêng. Không tự retry thao tác nguy hiểm khi chưa biết kết quả. Mất kết nối/timeout sau dispatch -> UNKNOWN, cần đối soát.
- Audit: action ID, user, device, gateway, trạng thái, thời điểm, kết quả kiểm tra/mã lỗi; lịch sử task đọc từ bảng hiện có.

## Database và rollout

6 bảng mới: device_groups, network_lans, ssh_gateways, gateway_lan_mappings, ssh_action_logs, ssh_sessions.
13 cột bổ sung dashboard_devices: private_ip, public_ip, mac_address, ip_updated_at, ip_changed_at, device_group_id, lan_id, gateway_id, ssh_status, ssh_checked_at, ssh_credentials, ssh_host_fingerprint, command_adapter.

ManagedDevice.js là ORM projection của chính dashboard_devices, không phải bảng hoặc inventory mới. Model DashboardDevice cũ giữ nguyên để heartbeat không trả thêm trường SSH/network hay ciphertext.

Migration thủ công: backend/scripts/migrateDeviceManager.js --apply; chạy hai lần đã kiểm thử. Có advisory lock riêng chống chạy đồng thời, index owner/group/LAN/SSH và FK composite owner+id chống liên kết khác tenant. Rollback --rollback --apply chỉ xóa extension và bảng quản lý SSH; giữ device/account/task gốc. Rollback mất metadata và lịch sử SSH, phải backup và dừng module/broker trước khi chạy.

Module mặc định chưa bật. DEVICE_MANAGER_ENABLED=true chỉ bật sau migration thủ công. Middleware kiểm tra schema trước khi nạp model quản lý; schema thiếu trả 503, tránh ảnh hưởng backend cũ. Không gắn migration hoặc broker vào startup của server hiện tại.

## API mới

| Method | Endpoint | Auth / quyền |
| --- | --- | --- |
| POST | /api/device/network/report | x-api-key hiện có; device phải thuộc owner |
| GET | /api/device-manager | JWT DEVICE_VIEW; bộ lọc SQL |
| GET | /api/device-manager/catalog | JWT DEVICE_VIEW; nhóm/LAN/Gateway thuộc owner |
| GET | /api/device-manager/devices/:device_id | JWT DEVICE_VIEW |
| PATCH | /api/device-manager/devices/:device_id | DEVICE_EDIT; cấu hình credential/fingerprint/adapter thêm GATEWAY_MANAGE |
| GET | /api/device-manager/devices/:device_id/history | DEVICE_VIEW; không trả credential/snapshot/ticket |
| POST/PATCH/DELETE | /api/device-manager/groups[/:id] | DEVICE_GROUP_MANAGE |
| POST/PATCH/DELETE | /api/device-manager/lans[/:id] | DEVICE_LAN_MANAGE |
| POST | /api/device-manager/move | DEVICE_EDIT + quyền nhóm/LAN; nhiều máy thêm DEVICE_BULK_ACTION |
| POST/PATCH | /api/device-manager/gateways[/:id] | GATEWAY_MANAGE |
| POST | /api/device-manager/actions | quyền theo action; request_id bắt buộc để idempotency |
| GET | /api/device-manager/actions | DEVICE_VIEW; request_id lọc kết quả bulk |
| POST | /api/device-manager/devices/:device_id/terminal | DEVICE_SSH_TERMINAL; ticket dùng một lần |
| GET | /api/device-manager/permissions | quyền user hiện tại |
| GET | /api/device-manager/permissions/:username | admin đọc quyền trước khi sửa |
| PUT | /api/device-manager/permissions/:username | admin hiện có; thay toàn bộ quyền module |
| WSS | /device-ws/gateway | Bearer Gateway token; broker riêng |
| WSS | /device-ws/terminal | Origin cho phép + ticket từ JWT API gửi trong frame đầu |

Query danh sách: search, group_id, lan_id (none = chưa gán), status, ssh_status, task, private_ip, needs_attention=true, page, page_size.
SSH status đã quá 5 phút hoặc Gateway không còn kết nối được trình bày UNKNOWN. Tổng device chỉ đếm các máy đã đăng ký trong dashboard_devices của owner; không tạo registration mới từ account hoặc IP report.

Ví dụ API báo cáo mạng (thay YOUR_DOMAIN/API_KEY/DEVICE_ID bằng cấu hình của bạn):

```bash
curl --request POST 'https://YOUR_DOMAIN/api/device/network/report' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: API_KEY' \
  --data '{"device_id":"DEVICE_ID","private_ip":"192.168.1.105","public_ip":"203.0.113.10","mac":"AA:BB:CC:DD:EE:FF"}'
```

Response:
```json
{"success":true,"message":"Network information updated","data":{"device_id":"DEVICE_ID","private_ip":"192.168.1.105","public_ip":"203.0.113.10","mac":"AA:BB:CC:DD:EE:FF","ip_changed":true,"public_ip_changed":true,"mac_changed":true}}
```

`private_ip` vẫn bắt buộc để tương thích luồng hiện có; client cũ chỉ gửi `device_id/private_ip` vẫn dùng được. `public_ip` và `mac` là tùy chọn, nhưng nếu gửi phải hợp lệ; MAC được chuẩn hóa thành chữ hoa dạng `AA:BB:CC:DD:EE:FF`. Private IP không thay đổi: ip_changed=false, ip_changed_at giữ nguyên, ip_updated_at cập nhật. Chỉ thay đổi private IP mới làm SSH status về UNKNOWN để không dùng kết quả kiểm tra địa chỉ cũ. API không nhận group_id/lan_id/gateway_id; người dùng tự chia nhóm LAN trên giao diện.

Dữ liệu mẫu local dùng tám device ID cố định `sample-device-01..08`, gồm Public IPv4/IPv6, trường hợp thiếu Public IP, thiếu MAC và thiết bị Offline. Địa chỉ public thuộc dải tài liệu và MAC là locally administered. Script không xóa dữ liệu, không dùng seed force và không gán nhóm/LAN/Gateway. Mặc định chỉ kiểm tra; thêm `--apply` mới ghi dữ liệu:

```bash
npm run sample:device-manager --prefix backend -- --owner=admin
npm run sample:device-manager --prefix backend -- --owner=admin --apply
```

## Quyền và bảo mật

Dùng User admin/user và AppSetting hiện có, không tạo identity hoặc permission service độc lập. Admin có toàn bộ quyền module nhưng dữ liệu thiết bị vẫn chỉ của owner đăng nhập. User mặc định DEVICE_VIEW, DEVICE_EDIT, DEVICE_GROUP_MANAGE, DEVICE_LAN_MANAGE; SSH/bulk/Gateway phải được admin cấp riêng.

Credential mã hóa AES-256-GCM bằng DEVICE_MANAGER_ENCRYPTION_KEY 32 byte base64, không trả về frontend hoặc lưu plaintext. Gateway token khác API key AutoTouch và có thể rotate/disable. API key AutoTouch username giữ nguyên theo yêu cầu trước đó, bao gồm rủi ro giả mạo khi biết username; không suy ra đây là authentication phù hợp Internet công cộng.

Control/credential/grant API yêu cầu HTTPS trong production, broker yêu cầu TLS hoặc proxy HTTPS, Gateway client yêu cầu WSS và xác minh certificate mặc định. Chỉ reverse proxy được tiếp cận cổng broker và backend; không public 3001. X-Forwarded-Proto phải do proxy tin cậy overwrite.
Host fingerprint SHA-256 hex phải xác minh ngoài kênh SSH từ thiết bị. Không TOFU, không tự tin host key mới. Cấu hình không cho phép browser chọn IP/Gateway tùy ý hoặc gửi command tùy ý qua quick action.

Rate limit module reuse API limiter hiện có, control thêm 60 request/phút/user; WebSocket payload 64 KiB, terminal input 8 KiB/frame, throughput input 64 KiB/giây, backpressure 1 MiB. Session/permission/Gateway/target được kiểm tra lại định kỳ.

## Kết quả và giới hạn

Xem DEVICE_MANAGER_TEST_REPORT.md và backend/tests/device-manager/*.json. SSH server/terminal/RootHide commands chỉ mock; chưa kiểm tra iPhone vật lý hoặc Windows service tự khởi động. Không chạy reboot/respring thật, không stress production, không seed và không ghi dữ liệu account thật.

Cấu hình triển khai active chưa đổi vì automatic approval review từ chối tích hợp migration startup/cổng broker/Nginx. Có checklist cấu hình cụ thể trong DEVICE_MANAGER_DEPLOYMENT.md để review. Chưa commit/push/deploy lượt này.

Thư viện được dùng theo tài liệu gốc: [ws](https://github.com/websockets/ws), [ssh2](https://github.com/mscdex/ssh2), [xterm addons](https://xtermjs.org/docs/guides/using-addons/).

Cập nhật sau phê duyệt: cấu hình local đã áp dụng trong Compose/Nginx và .env.example; broker opt-in profile, HTTPS example chưa auto-load. Domain user cung cấp là HTTP vn1.ip3s.net:45473; cần certificate/public HTTPS mapping xác nhận trước bật WSS. Không deploy hoặc migration DB. Xem section48 PROJECT_CONTEXT và deployment doc.
