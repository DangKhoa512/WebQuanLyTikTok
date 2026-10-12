# Device Manager — cấu hình local đã áp dụng

Người dùng đã đồng ý áp dụng cấu hình local ngày 2026-10-12. Đã thêm device_broker opt-in profile, snippet WSS, HTTPS example và biến mẫu; không sửa .env đang dùng, không chạy migration/deploy hoặc thay server startup. Giữ nguyên 3 dịch vụ cũ và mysql_data. Trước đây auto-review từ chối tự áp dụng; phê duyệt cụ thể của user đã giải quyết phần sửa config local.

## Thứ tự áp dụng

1. Backup DB; kiểm tra MySQL 8, dung lượng và FK/table collation. Migration có DDL auto-commit; lỗi giữa chừng không rollback transaction tự động, up idempotent có thể tiếp tục.
2. Chạy migration thủ công một lần bằng npm run migrate:device-manager --prefix backend hoặc node scripts/migrateDeviceManager.js --apply trong backend container có code mới.
3. Sau migration, đặt DEVICE_MANAGER_ENABLED=true cho backend HTTP. Không cần thay controller heartbeat hoặc timeout 1800.
4. Tạo key AES bằng node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" tại môi trường quản trị; giữ key ngoài Git, dùng cùng key cho backend và broker. Không thay key khi còn credential/snapshot cũ nếu chưa có kế hoạch re-encrypt.
5. Chạy duy nhất một broker bằng npm run device-manager:broker --prefix backend. Với PM2/Compose nhiều HTTP worker vẫn chỉ một broker. Không chạy broker trong tất cả workers.
6. Cho Nginx reverse proxy /device-ws/ tới broker qua mạng nội bộ; chỉ công khai HTTPS/WSS, không public port 3001.
7. Cấp quyền cần thiết cho user; tạo Gateway, lưu token một lần; tạo LAN, mapping; gán thiết bị LAN+Gateway.
8. iPhone gọi API IP riêng; cấu hình SSH username/password/key, host fingerprint xác minh, adapter ROOTHIDE trên web.
9. Khởi động Gateway Windows, kiểm tra SSH/info trước. Xác minh đường dẫn binary RootHide trên iPhone thật trước thao tác Respring/Reboot.

## Biến môi trường đề xuất

| Biến | Backend HTTP | Broker |
| --- | --- | --- |
| DEVICE_MANAGER_ENABLED | true sau migration | true |
| DEVICE_MANAGER_ENCRYPTION_KEY | key quản trị tạo riêng | cùng key |
| DEVICE_MANAGER_SSH_ENABLED | không cần bật broker trong HTTP | true |
| DEVICE_MANAGER_WS_PORT | không dùng | 3001 (nội bộ) |
| DEVICE_MANAGER_ORIGIN | không dùng | origin HTTPS chính xác, gồm port nếu có |
| NODE_ENV | production | production |

Các DB_* và JWT_SECRET dùng cấu hình backend hiện có; tài liệu không ghi giá trị thật. Key không có mặc định và credential API fail closed khi chưa cấu hình.

## Compose service đã thêm (profile device-manager)

Dùng cùng image/build backend, DB/env/network như HTTP backend, nhưng command riêng:

```yaml
device_broker:
  profiles: ["device-manager"]
  build:
    context: ./backend
    dockerfile: Dockerfile
  command: ["node", "scripts/startDeviceBroker.js"]
  restart: unless-stopped
  env_file: ./backend/.env
  environment:
    DB_HOST: mysql
    NODE_ENV: production
    DEVICE_MANAGER_ENABLED: "true"
    DEVICE_MANAGER_SSH_ENABLED: "true"
    DEVICE_MANAGER_WS_PORT: "3001"
  depends_on:
    mysql:
      condition: service_healthy
  networks:
    - app_net
  # Không có ports: và không dùng HTTP /health của backend cho broker.
```

backend HTTP cần DEVICE_MANAGER_ENABLED=true; backend/.env cần key và Origin đã nêu. Lệnh migration thủ công trước khi bật flag; không thêm tự chạy migration startup.

## Nginx snippet đã thêm, HTTPS chưa kích hoạt

```nginx
location /device-ws/ {
    limit_req zone=api_zone burst=30 nodelay;
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $device_broker_upstream device_broker:3001;
    proxy_pass http://$device_broker_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    access_log off;
}
```

Server HTTPS/certificate chưa được kiểm chứng trên VPS. File nginx/nginx.conf hiện chỉ bật HTTP; block HTTPS đang comment. Phải kiểm tra certificate và domain/port đang dùng, không giả định chỉ map cổng 443 là đủ. Existing API routes không đổi request/task timeout. ws terminal heartbeat ping sẽ cần được kiểm tra trên proxy thực tế.

Dev Vite nếu chạy riêng có thể proxy /device-ws/ sang broker local 3001 với ws:true. Chưa sửa Vite config active.

## Gateway trên Windows

Cài Node.js 20+; tại thư mục gateway chạy npm ci. Sao chép config.example.json thành config.json (file này gitignored), thay YOUR_DOMAIN, LAN IDs và CIDRs. Không đặt token vào config JSON/Git; cung cấp qua environment bằng cơ chế quản lý secret của máy.

```powershell
cd C:\PATH\QUANLY_REG\gateway
$env:GATEWAY_CONFIG = 'C:\PATH\QUANLY_REG\gateway\config.json'
# GATEWAY_TOKEN được cấp từ web và nạp riêng vào environment của tiến trình.
npm start
```

Cấu hình gateway/config.example.json dùng WSS, max_connections=5, mỗi LAN có allowlist CIDR rõ ràng. Các LAN có cùng dải IP được phân biệt bằng LAN ID. Máy Gateway phải có route/interface hợp lệ đến LAN được cấu hình; khi hai LAN cùng subnet và route ambiguous, cần routing/VLAN/network compartment ở Windows hoặc Gateway riêng. Gateway từ chối cấu hình CIDR các LAN chồng lấn để tránh route nhầm. Với subnet trùng, cần Gateway/VM/network compartment độc lập có routing được kiểm chứng; không chỉ chạy hai process trên cùng routing table. Code không tạo route/NAT OS. Không dùng chung SSH host key trên nhiều iPhone.

SSH iPhone cần bật trong LAN; không mở SSH ra Internet. Restrict Windows ACL với token/journal/config. Journal giữ Action ID đã thực hiện qua restart; không tự xóa journal nếu chưa đối soát task SSH. Chưa tích hợp service manager Windows/Task Scheduler và chưa kiểm tra chạy Windows 24/7.

## Rollback

Tắt DEVICE_MANAGER_ENABLED, dừng broker/Gateway, backup extension metadata, rồi node scripts/migrateDeviceManager.js --rollback --apply. Device/account/task gốc được giữ; group/LAN/SSH credential/action/session extension bị xóa. Khôi phục metadata bằng backup nếu cần. Regression rollback/reapply trên DB tạm đã có test; không chạy trên production trong lượt này.

## Trạng thái sau phê duyệt

Các file local đã sửa sau khi user đồng ý. Broker không tự chạy với compose up thông thường; cần profile device-manager sau backup/migration/cấu hình key và Origin. Không tự chạy migration hoặc action vật lý. Chưa deploy VPS.

## URL thực tế và kích hoạt

User cung cấp http://vn1.ip3s.net:45473. Probe HTTPS cùng cổng không thiết lập được TLS từ máy local (curl exit35). Chưa xác nhận cổng HTTPS/public NAT mapping hoặc đường dẫn chứng chỉ thật. Không dùng -k hoặc tắt verification.

nginx/nginx.conf giữ HTTP đang dùng; /device-ws/ trên HTTP trả426. nginx/device-ws.conf chỉ include vào server HTTPS; resolver Docker DNS tại request giúp Nginx không phụ thuộc broker profile khi khởi động. Dockerfile copy snippet và example, không auto-load example.

nginx/device-manager-https.conf.example dùng server_name vn1.ip3s.net và đường dẫn certificate mẫu, chưa được mount vào conf.d. Sau khi có certificate/mapping được xác nhận, mount file đã chỉnh đúng đường dẫn vào /etc/nginx/conf.d/device-manager-https.conf, kiểm tra nginx -t và mở web bằng HTTPS. Origin và Gateway URL phải dùng HTTPS/WSS đúng public port. Không giả định cổng45473 hỗ trợ cả HTTP và HTTPS.

Sau backup, migration thủ công và cấu hình backend/.env, khởi động broker bằng docker compose --profile device-manager up -d --build device_broker. Backend HTTP cần restart sau khi DEVICE_MANAGER_ENABLED=true. Không chạy compose down -v.

Kiểm tra local: YAML parse, so sánh 3 service/volume với HEAD PASS; nginx1.27.5 native -t cho HTTP/snippet/example TLS PASS (certificate tạm chỉ để kiểm tra). Docker CLI/engine và Linux production chưa kiểm thử. Bằng chứng: backend/tests/device-manager/configuration.json.

Nguồn cấu hình: [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/), [Nginx proxy_pass/resolver](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

## Port forwarding đã xác nhận từ ảnh của user

Public TCP45473 → VPS8080; public TCP33194 → VPS22 (SSH quản trị). Compose Nginx đã sửa publish 8080:80 để khớp mapping web. Luồng HTTP: vn1.ip3s.net:45473 → VPS8080 → Nginx container80. Cổng33194 là SSH vào VPS, không phải SSH Gateway/iPhone. Mapping HTTPS tới VPS443 chưa có trong ảnh; chưa bật WSS/TLS và không đổi giao thức cổng8080 đang phục vụ API HTTP cũ.

## SSH tunnel supplement (2026-10-12)

See [multi-user SSH tunnel deployment](DEVICE_MANAGER_SSH_TUNNEL.md). New optional listener defaults disabled. Main broker and sensitive HTTP endpoints now trust forwarded HTTPS only from loopback or exact DEVICE_MANAGER_PROXY_PEERS; configure the actual Nginx peer during reviewed deployment. Existing active Compose/Nginx was not further modified for SSH tunnels.
