# Device Manager — báo cáo kiểm thử 2026-10-12

Môi trường: Windows, Node.js v24.16.0.

Kết quả local: 35 nhóm test PASS với MySQL database tạm, HTTP/WebSocket thật và SSH server giả lập. Chrome desktop/mobile PASS. Không có Reboot/Respring vật lý hoặc production writes.

## Nhóm test đã chạy

| Test | Kết quả |
| --- | --- |
| Schema guard rejects missing columns or tenant FK before enabling management | PASS |
| Migration twice preserves legacy last_seen/status/task | PASS |
| Group create/edit/delete/bulk move and owner protection | PASS |
| LAN CRUD, occupied delete requires explicit unassign, same IP independent | PASS |
| Private IP first/same/new + offline/running invariants | PASS |
| Private/public/loopback/multicast/unspecified/invalid + spoof/missing auth/device rejected | PASS |
| SQL combined filters + group counts + own-only devices | PASS |
| Permission deny at backend; grants use existing admin + AppSetting | PASS |
| Gateway token hash/non-retrieval; mapping owner and fresh-only status | PASS |
| Encrypted credentials at rest; no frontend disclosure | PASS |
| Gateway invalid authentication rejected; actual reverse connection online | PASS |
| Automatic Gateway reconnect after backend socket close | PASS |
| Actual mock SSH check + AutoTouch process/script distinction | PASS |
| Host-key mismatch blocks and does not become online | PASS |
| SSH authentication failure is tracked without leaking credentials | PASS |
| Respring/Reboot confirmation/RUNNING warning and mock-only execution | PASS |
| Bulk routes both LANs, partial failure, queue concurrency and duplicate idempotency | PASS |
| Bulk SSH check/Respring/Reboot split by LAN with mock commands only | PASS |
| Wrong gateway-LAN mapping cannot be assigned by backend | PASS |
| Response lost after enqueue: retry same request_id executes once | PASS |
| Gateway cannot route unapproved LAN/subnet; private IP duplicates remain independent | PASS |
| Terminal real mock connect/input/output/resize/disconnect; one-use ticket | PASS |
| Terminal permission denied and expired session ends without task effects | PASS |
| Gateway disconnect/reconnect remains separate from Device heartbeat | PASS |
| Heartbeat response remains unchanged after management models load | PASS |
| Permission revocation rejects queued SSH | PASS |
| SSH handshake timeout is tracked against mock blackhole only | PASS |
| Feature off/HTTPS/origin fail closed; no automatic model loading at app startup | PASS |
| Active terminal closes when permission is revoked | PASS |
| Gateway queue full rejects extra job; broker command timeout is UNKNOWN, never resets task | PASS |
| Duplicate destructive request and explicit safe retry | PASS |
| Migration adds foreign keys to existing device table | PASS |
| Performance SQL list 10/50/100/200/500/1000 devices on disposable DB | PASS |
| Real Chrome Device Manager filter/detail/history/group/LAN/Gateway/mobile | PASS |
| Actual rollback/reapply preserves 1000 devices and running task | PASS |

## Đối chiếu 50 tình huống yêu cầu

| Cases | Bằng chứng và phạm vi |
| --- | --- |
| 1–5 | CRUD nhóm, chuyển/bulk, xóa không mất device/task; API/DB thật |
| 6–10 | CRUD LAN, occupied delete, move; IP trùng không unique; routing trùng CIDR fail closed |
| 11–20 | IP first/same/new/private ranges/invalid/public, auth/owner/missing device; OFFLINE/RUNNING giữ last_seen và task |
| 21–29 | Gateway reverse connect, offline, tự reconnect, token sai, correct/wrong mapping, blackhole timeout, auth failure, host mismatch |
| 30–33 | Terminal mock SSH thực, input/output/resize/disconnect, một lần ticket, TTL/permission revocation/deny |
| 34–40 | Bulk SSH/Respring/Reboot chỉ mock, queue full, partial failure, retry/idempotency/journal replay và mất response sau commit |
| 41–45 | Tenant/JWT/key/permissions, FK composite, Origin/TLS/disabled flag, IP/CIDR routing |
| 46–50 | Heartbeat response chính xác; 5 regression scripts riêng; chưa kiểm thử lại mọi API/CRUD của toàn project |

## Regression riêng

- testDeviceMonitoring.js — PASS
- testRoundRobinIntegration.js — PASS
- testTaskResumeLoginState.js — PASS
- testFacebookSelfLimit.js — PASS
- testLegacyPhoneAuth.js — PASS

Round-Robin kiểm thử 4/50 request đồng thời, phân bố 13/13/12/12 và 16 Page claims. Device Monitoring kiểm tra 10/25/30/31 phút và recovery; resume 6 task types không đổi. Không chạy lại toàn bộ npm run test:audit trong lượt này.

## Performance local

| Devices | Latency service (ms) | SQL total (ms) | Queries | Rows trả về | RSS process (MiB) |
| --- | --- | --- | --- | --- | --- |
| 10 | 7 | 7 | 4 | 10 | 113.1 |
| 50 | 6 | 6 | 4 | 50 | 113.5 |
| 100 | 7 | 7 | 4 | 100 | 113.7 |
| 200 | 11 | 11 | 4 | 100 | 114.1 |
| 500 | 18 | 18 | 4 | 100 | 114.1 |
| 1000 | 29 | 29 | 4 | 100 | 114.0 |

Một sample mỗi mức, không phải P95/P99 hay concurrent farm capacity. SQL time đo wrapper sequelize.query, gồm driver/roundtrip. RSS/CPU là toàn bộ tiến trình test (HTTP server + broker + mock SSH + client); CPU Windows có độ phân giải thô, 0 không có nghĩa không dùng CPU. Không đo riêng DB process hoặc VPS.

SSH/WS functional dùng một Gateway mock, giới hạn 2 connections trong fixture; chỉ vài terminal. Chưa load 10/50/100/200/500/1000 SSH hoặc terminal đồng thời, chưa soak 24/7. Gateway idle polling dùng aggregate count queries, ping 15 giây thay vì ghi last_seen mỗi giây. Không suy ra 1000-device listing PASS thành SSH farm capacity PASS.

## Build/security

- Frontend Vite production build PASS; terminal lazy chunk ~336 kB, main vẫn ~1.07 MB và có warning >500 kB.
- Node syntax 18 file JS PASS; git diff --check PASS.
- Credential AES-256-GCM, token hash, host-key pinning; snapshot ciphertext không trả/log, terminal nội dung không log.
- Các model/route mới nạp sau schema guard; app startup không đăng ký model quản lý hoặc tự migrate.
- npm audit: backend 17 advisories (1 critical), frontend 13 (0 critical), Gateway 0 ở lần kiểm tra này. Advisory trên dependency backend/frontend cần xử lý ở lượt riêng có regression, chưa chứng nhận production security.
- Username API key vẫn giữ theo yêu cầu trước đó; không coi nó là secret cho môi trường public.

## Lỗi tìm thấy trong quá trình triển khai đã sửa

- Placeholder SQL sát ký tự > không được Sequelize thay; đã tách whitespace và chạy query thật.
- Alias SSH status trong GROUP BY đụng cột cùng tên khi ONLY_FULL_GROUP_BY; đã dùng derived aggregate.
- Gap lock/duplicate enqueue đồng thời deadlock; khóa device theo thứ tự, READ COMMITTED và retry chỉ deadlock/lock wait đã rollback.
- ORM management projection ban đầu làm heartbeat nhận thêm trường; đã giữ model gốc nguyên và test response không thêm network/SSH fields.
- FK composite trả 2 metadata rows/constraint khiến rollback remove hai lần; dùng Set tên constraint, rollback/reapply giữ 1000 devices/task PASS.
- Search/filter đổi khi request cũ đang chạy bị bỏ qua; request marker riêng và generation loại response cũ.
- Kết quả SSH cũ có thể ghi ONLINE sau đổi host key/credential; snapshot hash kiểm tra trước dispatch và trước ghi kết quả.
- Gateway CIDRs LAN chồng lấn có thể route nhầm; startup fail closed, cần Gateway/VM mạng riêng cho subnet trùng.

## Files modified

- .gitignore
- PROJECT_CONTEXT.md
- backend/package-lock.json
- backend/package.json
- backend/src/routes/device.js
- backend/src/routes/index.js
- frontend/package-lock.json
- frontend/package.json
- frontend/src/App.jsx
- frontend/src/components/Layout.jsx
- frontend/src/services/api.js

## Files created

- DEVICE_MANAGER.md
- DEVICE_MANAGER_DEPLOYMENT.md
- DEVICE_MANAGER_TEST_REPORT.md
- backend/scripts/migrateDeviceManager.js
- backend/scripts/startDeviceBroker.js
- backend/scripts/testDeviceManager.js
- backend/src/controllers/deviceNetworkController.js
- backend/src/middleware/deviceManagerReady.js
- backend/src/models/DeviceManager.js
- backend/src/models/ManagedDevice.js
- backend/src/routes/deviceManager.js
- backend/src/services/deviceGatewayBroker.js
- backend/src/services/deviceManagerMigration.js
- backend/src/services/deviceManagerSecurity.js
- backend/src/services/deviceManagerService.js
- backend/src/services/deviceSshService.js
- backend/tests/device-manager/dependencies.json
- backend/tests/device-manager/manifest.json
- backend/tests/device-manager/performance.json
- backend/tests/device-manager/regressions.json
- backend/tests/device-manager/results.json
- backend/tests/device-manager/verification.json
- frontend/src/components/DeviceTerminal.jsx
- frontend/src/pages/DeviceManager.css
- frontend/src/pages/DeviceManager.jsx
- gateway/README.md
- gateway/config.example.json
- gateway/package-lock.json
- gateway/package.json
- gateway/src/index.js
- gateway/src/sshAdapter.js

## Remaining issues

- Integration Compose/Nginx/HTTPS/WSS chưa áp dụng: automatic approval review từ chối thay đổi persistent; xem DEVICE_MANAGER_DEPLOYMENT.md để review cấu hình cụ thể.
- Gateway Windows thật, binary RootHide/SSH host identity thực, routing/VLAN thật và service manager chưa kiểm chứng. Không tự chọn/đoán private key hoặc trust fingerprint.
- AutoTouch log/script telemetry chưa có nguồn hiện hữu để đọc; process và script không đánh đồng, script UNKNOWN.
- Multi-LAN cùng CIDR cần Gateway/VM/network compartment độc lập, không chạy qua một routing table ambiguous.
- Chưa stress SSH/WS hoặc test HA broker: chỉ một broker, DB queue durable, restart/mất kết nối giữ outcome UNKNOWN, không tự lặp destructive action.
- Chưa commit/push/deploy, không sửa server startup hoặc cấu hình production active.

## Reproduce

Run npm run test:device-manager --prefix backend cho core. Run npm run test:device-manager:ui --prefix backend khi có Chrome/driver Windows phù hợp. Cần DB user có quyền create/drop database test; script chỉ thao tác prefix quanly_dm_test_* khác DB_NAME gốc, không seed. npm run test:audit tự nhận manifest mới nhưng toàn suite cũ có benchmark PARTIAL; không che kết quả đó.

## Cập nhật cấu hình sau user phê duyệt

Đã áp dụng cấu hình local Compose/Nginx/.env.example ngày2026-10-12; trạng thái chưa đổi active-config ở kết quả trước là bằng chứng trước lượt này. Kiểm thử bổ sung YAML/legacy-service-volume equality và nginx native -t HTTP/WSS/TLS example PASS. Docker engine/Linux/live TLS NOT_RUN; probe HTTPS user URL cổng45473 không handshake được. Không thực hiện migration hoặc deployment. Xem configuration.json và DEVICE_MANAGER_DEPLOYMENT.md.

## 2026-10-12 SSH tunnel supplement

Current non-UI DeviceManager run: 35 groups PASS, including three concurrent isolated sessions across two owners and Gateways. Separate encrypted SSH transport mock tests PASS. Prior UI results remain historical; no live VPS/iPhone/WSS certification. See DEVICE_MANAGER_SSH_TUNNEL.md and tunnel-results.json.
