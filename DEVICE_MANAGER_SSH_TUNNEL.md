# SSH Tunnel nhiều LAN / nhiều user (2026-10-12)

Code local đã bổ sung transport SSH tunnel; chưa triển khai VPS, chưa thay cấu hình production.

## Kiến trúc

- Mỗi Gateway Windows chủ động xác thực VPS bằng SSH public key, pin SSH host fingerprint SHA256 hex. Gateway tạo listener cục bộ 127.0.0.1 với port ngẫu nhiên, chuyển tiếp SSH đến VPS 127.0.0.1:3002. Không cần cổng inbound vào LAN.
- WebSocket Gateway chạy qua listener loopback này, nội dung đi trong SSH được mã hóa. Gateway token vẫn bắt buộc và được kiểm tra owner/is_active như WSS.
- Listener broker 3002 chỉ nhận /device-ws/gateway; từ chối Terminal, kể cả header x-forwarded-proto=https. Main broker 3001 tiếp tục phục vụ trình duyệt qua HTTPS reverse proxy.
- Hai listener dùng chung một broker, cùng map Gateway/session, queue và kiểm tra quyền. Chạy một broker instance. Nhiều Gateway/user/máy tính trình duyệt cùng truy cập website; không phụ thuộc máy Windows quản trị.
- Mỗi session được ràng buộc user + device + Gateway ở backend; ticket một lần 30 giây, phiên 15 phút/idle 5 phút, tối đa 10 phiên/user và giới hạn Gateway hiện hữu. Frame input không được dùng để chọn lại thiết bị/session.
- Mất tunnel đóng SSH/Terminal hiện hữu; reconnect tự động với backoff 1–30 giây. Không tự chạy lại terminal hoặc lệnh nguy hiểm, không sửa trạng thái task/heartbeat.
- Private IP API, Heartbeat, Dispatcher và API account không thay đổi.

## Giai đoạn 1: code và kiểm thử local

Gateway dùng gateway/config.ssh-tunnel.example.json:
transport=ssh_tunnel; ssh_tunnel gồm host, port SSH nhà cung cấp (ví dụ 33194), username riêng, host_fingerprint đã xác minh độc lập.
Các biến riêng của Gateway:
GATEWAY_CONFIG: đường dẫn config.
GATEWAY_TOKEN: token Gateway của user.
GATEWAY_TUNNEL_KEY_FILE: đường dẫn private key SSH (không commit).
GATEWAY_TUNNEL_KEY_PASSPHRASE: tùy chọn.
Khởi động: npm ci --prefix gateway, rồi node gateway/src/index.js.
WSS mode cũ vẫn hoạt động khi transport=wss hoặc không khai báo transport.

Broker mẫu env (chỉ .env.example được cập nhật):
DEVICE_MANAGER_GATEWAY_TUNNEL_ENABLED=false mặc định; chỉ bật sau khi kiểm tra deployment.
DEVICE_MANAGER_TUNNEL_BIND=127.0.0.1 mặc định.
DEVICE_MANAGER_TUNNEL_PEERS= để trống mặc định.
DEVICE_MANAGER_PROXY_PEERS= để trống mặc định; reverse proxy plaintext ngoài loopback phải khai báo đúng IP peer.
DEVICE_MANAGER_ORIGIN phải là origin HTTPS chính xác của website.
Không tin header HTTPS từ peer Internet; req TLS thật hoặc proxy thuộc danh sách tin cậy mới được chấp nhận.

## Giai đoạn 2: bản cấu hình VPS để review, chưa áp dụng

Native broker trên VPS: listener 127.0.0.1:3002 tương thích trực tiếp SSH forwarding.

Docker broker: loopback trong container khác loopback host. Cần override riêng được review:
- Bind listener 0.0.0.0 trong container.
- Publish DUY NHẤT host 127.0.0.1:3002:3002, tuyệt đối không 0.0.0.0:3002.
- DEVICE_MANAGER_TUNNEL_PEERS chỉ IP bridge host thực tế đã xác minh. Không chấp nhận toàn subnet.
- DEVICE_MANAGER_PROXY_PEERS chỉ IP Nginx container thực tế; cần IP ổn định nếu recreate.
- Không expose 3001 công khai. Giữ Nginx HTTP /device-ws/ trả 426.
Các giá trị này chưa được ghi vào docker-compose.yml hoặc .env production trong lượt này.

Tạo SSH user hạn chế, key riêng mỗi Gateway và thu hồi độc lập. Cấu hình sshd dự kiến theo Match User:
AllowTcpForwarding local
PermitOpen 127.0.0.1:3002
MaxSessions 0
PermitTTY no
AllowAgentForwarding no
X11Forwarding no
PermitTunnel no
Dùng public-key authentication, tắt password cho user tunnel. Không thay SSH quản trị hiện hữu.
Phải kiểm tra sshd -t và hiệu lực Match trước khi reload; kiểm thử thêm forwarding khác bị từ chối.
Tài liệu chính thức: [sshd_config](https://man.openbsd.org/sshd_config), [SSH2 forwardOut](https://github.com/mscdex/ssh2).

## Giai đoạn 3: trình duyệt nhiều máy tính

Website HTTP hiện tại chưa được phép mở Terminal. Gateway tunnel không thay thế bảo vệ trình duyệt.

Không cần domain riêng để có HTTPS: có thể dùng IP với certificate chứa IP SAN và CA được các máy trình duyệt tin cậy. Hoặc route website/broker trong VPN bảo mật, kèm HTTPS bằng CA nội bộ. Cài trust trên từng máy, không tắt kiểm tra certificate. DEVICE_MANAGER_ORIGIN khớp origin này; WSS cùng origin qua Nginx.

Chưa tạo certificate, VPN, SSH user, firewall, port mapping hoặc restart dịch vụ thật. Cần xác nhận phương án HTTPS/VPN và review cấu hình thực tế trước triển khai. Nếu dùng VPN, bản hiện tại vẫn yêu cầu HTTPS cho Terminal; không mở ngoại lệ HTTP chỉ dựa vào header hoặc địa chỉ private.

## Kiểm thử và giới hạn

node backend/scripts/testDeviceTunnelTransport.js: SSH server mock với public-key signature verification, hostkey mismatch, hai tunnel WebSocket mã hóa đồng thời, mất SSH, guards TLS/peer/tunnel-only. PASS. Key fixture sinh tạm trong artifacts và xóa sau test.
node backend/scripts/testDeviceManager.js: DB tạm, 35 nhóm PASS bao gồm ba browser session đồng thời của hai user/hai Gateway; output riêng từng phiên, spoof session id không đổi đích, owner khác trả404; Gateway qua listener tunnel và browser bị chặn tại listener đó. Những browser session này dùng WS loopback trong môi trường test; chưa phải nghiệm thu WSS production.
npm run build --prefix frontend: PASS; cảnh báo bundle >500KB hiện hữu.
Evidence: backend/tests/device-manager/results.json và tunnel-results.json.

Chưa kiểm thử Windows Gateway với sshd Linux thật, HTTPS/IP certificate trên nhiều máy, VPN, RootHide vật lý, tải nhiều Terminal hoặc soak 24/7. Test tunnel transport và broker/session là hai lớp riêng; chưa chạy end-to-end browser WSS → broker → tunnel → iPhone thật.
