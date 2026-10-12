# MMO Device Gateway (Windows / Linux, Node.js)

Gateway kết nối chủ động WSS tới VPS, không mở cổng SSH iPhone ra Internet.
Cài Node.js 20+, npm ci. Dùng config.example.json làm mẫu config.json; nạp GATEWAY_TOKEN từ environment, rồi npm start.
Thiết lập lan_networks bằng LAN ID trên web và CIDRs Gateway thực sự truy cập được.
Credentials chỉ nhận trong bộ nhớ qua WSS khi thực hiện thao tác; không nằm trong config hoặc journal.

SSH host fingerprint SHA-256 hex được VPS cung cấp từ cấu hình đã xác minh. Mismatch bị từ chối.
Adapter ROOTHIDE tìm đúng một /var/mobile/Containers/Shared/AppGroup/.jbroot-<16 hex>, kiểm tra binary trước lệnh. Không tự Respring/Reboot khi offline.
Quick actions không nhận command tùy ý; terminal chỉ dùng sau user permission/ticket từ VPS.

Giữ gateway-journal.json qua restart: Action ID đã bắt đầu nhưng chưa có kết quả được giữ UNKNOWN_OUTCOME, không tự chạy lại. Nếu journal bị mất/hỏng, dừng và đối soát trước khi tiếp tục.
Không lưu nội dung terminal/password/private key; chỉ console thông báo kết nối.
VPS có queue và Gateway có hard connection cap; local config nên khớp giới hạn cấu hình web. Reconnect exponential backoff 1–30 giây, có jitter.

GATEWAY_ALLOW_LOCAL_TEST chỉ cho phép ws loopback ở automated tests; không dùng production. Không tắt certificate/host-key verification.

Xem ../DEVICE_MANAGER_DEPLOYMENT.md. Chưa chạy Gateway trên Windows farm thực tế hoặc lệnh reboot/respring vật lý.

CIDR của các LAN trong cùng Gateway không được chồng lấn; startup fail closed nếu ambiguous hoặc public CIDR. Subnet trùng cần Gateway/VM/network compartment riêng đã kiểm tra routing và host key.

## SSH tunnel transport

See [deployment and multi-user testing](../DEVICE_MANAGER_SSH_TUNNEL.md). Use config.ssh-tunnel.example.json, GATEWAY_TUNNEL_KEY_FILE and GATEWAY_TOKEN. Browser Terminal still requires HTTPS/WSS. No production configuration is applied automatically.
