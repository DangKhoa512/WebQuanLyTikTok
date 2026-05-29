# 🚀 Hướng dẫn Deploy lên Ubuntu VPS

## Yêu cầu VPS
- **OS**: Ubuntu 22.04 LTS
- **RAM**: tối thiểu 1GB (khuyến nghị 2GB)
- **CPU**: 1 vCPU trở lên
- **Disk**: 20GB+
- **Port mở**: 22 (SSH), 80 (HTTP), 443 (HTTPS)

---

## CÁCH 1 — Docker Compose (Khuyến nghị ✅)

### 1. Cài Docker lên VPS

```bash
# SSH vào VPS
ssh root@YOUR_VPS_IP

# Cài Docker
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# Cài Docker Compose plugin
apt-get install -y docker-compose-plugin

# Kiểm tra
docker --version
docker compose version
```

### 2. Clone project

```bash
cd /opt
git clone https://github.com/YOUR_USER/tiktok-manager.git
# Hoặc upload bằng scp:
# scp -r C:\Users\KHOA\Desktop\QUANLY_REG root@IP:/opt/tiktok-manager
cd tiktok-manager
```

### 3. Cấu hình .env production

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Điền đầy đủ:
```env
NODE_ENV=production
PORT=3000

DB_HOST=mysql
DB_PORT=3306
DB_NAME=tiktok_manager
DB_USER=tiktok_user
DB_PASS=SomeSuperStr0ngPassword!

# Tạo API_KEY: openssl rand -hex 32
API_KEY=abc123...

# Tạo JWT_SECRET: openssl rand -hex 64  
JWT_SECRET=xyz789...

ADMIN_USER=admin
ADMIN_PASS=YourAdminPassword!

CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
```

### 4. Build và chạy

```bash
# Build + khởi động tất cả services
docker compose up -d --build

# Xem log
docker compose logs -f

# Seed dữ liệu mẫu (tùy chọn)
docker exec tiktok_backend node seeds/seedData.js
```

### 5. Kiểm tra

```bash
# Health check
curl http://localhost/health

# API stats (cần JWT)
curl http://localhost/api/stats
```

### Lệnh quản lý

```bash
# Xem trạng thái services
docker compose ps

# Restart backend
docker compose restart backend

# Xem log backend
docker compose logs -f backend

# Dừng tất cả
docker compose down

# Update code
git pull
docker compose up -d --build
```

---

## CÁCH 2 — PM2 + Nginx (không Docker)

### 1. Cài Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Kiểm tra
node -v   # v20.x.x
npm -v
```

### 2. Cài PM2

```bash
npm install -g pm2
pm2 startup systemd -u root
```

### 3. Cài MySQL 8.0

```bash
apt-get install -y mysql-server
mysql_secure_installation

# Tạo user và database
mysql -u root -p <<EOF
CREATE DATABASE tiktok_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tiktok_user'@'localhost' IDENTIFIED BY 'SomeStr0ngPassword!';
GRANT ALL ON tiktok_manager.* TO 'tiktok_user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### 4. Cài Nginx

```bash
apt-get install -y nginx
systemctl enable nginx
```

### 5. Deploy backend

```bash
cd /opt/tiktok-manager/backend

# Cài dependencies
npm install --production

# Cấu hình .env
cp .env.example .env
nano .env   # điền đầy đủ

# Tạo bảng database
node seeds/seedData.js

# Chạy bằng PM2
pm2 start ecosystem.config.js --env production
pm2 save

# Kiểm tra
pm2 status
curl http://localhost:3000/health
```

### 6. Build frontend

```bash
cd /opt/tiktok-manager/frontend

npm install
npm run build

# Copy build output ra webroot
mkdir -p /var/www/tiktok
cp -r dist/* /var/www/tiktok/
```

### 7. Cấu hình Nginx

```bash
nano /etc/nginx/sites-available/tiktok
```

Nội dung:
```nginx
limit_req_zone $binary_remote_addr zone=api_zone:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=10r/m;

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/tiktok;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /api/auth/login {
        limit_req zone=login_zone burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000/api/auth/login;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        limit_req zone=api_zone burst=30 nodelay;
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        client_max_body_size 20m;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

```bash
# Kích hoạt site
ln -s /etc/nginx/sites-available/tiktok /etc/nginx/sites-enabled/
nginx -t        # kiểm tra syntax
systemctl reload nginx
```

---

## 🌐 Trỏ Domain về VPS

### Tại DNS provider (Cloudflare, NameCheap, v.v.):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_VPS_IP | 300 |
| A | www | YOUR_VPS_IP | 300 |

Chờ 5-30 phút để DNS propagate.

Kiểm tra:
```bash
ping yourdomain.com   # phải ra IP của VPS
```

---

## 🔒 Cài SSL (HTTPS) miễn phí với Let's Encrypt

```bash
# Cài certbot
apt-get install -y certbot python3-certbot-nginx

# Lấy cert
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew (đã tự động setup, kiểm tra)
certbot renew --dry-run
```

Sau khi có cert, bỏ comment phần HTTPS trong `nginx/nginx.conf` hoặc `/etc/nginx/sites-available/tiktok`.

---

## 💾 Backup Database tự động

```bash
# Cấp quyền thực thi
chmod +x /opt/tiktok-manager/scripts/backup-db.sh

# Test chạy thử
bash /opt/tiktok-manager/scripts/backup-db.sh

# Thêm vào crontab — chạy 2h sáng mỗi ngày
crontab -e
```

Thêm dòng:
```
0 2 * * * /opt/tiktok-manager/scripts/backup-db.sh >> /var/log/tiktok-backup.log 2>&1
```

---

## 📡 Cấu hình Phone / AutoTouch

Trong script AutoTouch, gửi header:
```
x-api-key: <giá trị API_KEY trong .env>
```

Ví dụ (Lua):
```lua
local headers = {
    ["Content-Type"] = "application/json",
    ["x-api-key"] = "YOUR_API_KEY_HERE"
}

local body = '{"username":"tiktok123","password":"pass","device_id":"iphone_01"}'

local code, data = http.post(
    "https://yourdomain.com/api/accounts/reg-submit",
    body,
    headers
)
```

---

## 🔧 PM2 — Các lệnh thường dùng

```bash
pm2 status                    # xem trạng thái
pm2 logs tiktok-backend       # xem log realtime
pm2 restart tiktok-backend    # restart
pm2 reload tiktok-backend     # zero-downtime reload (cluster mode)
pm2 monit                     # dashboard CPU/RAM
pm2 save                      # lưu process list

# Update code
cd /opt/tiktok-manager
git pull
cd backend && npm install --production
pm2 reload tiktok-backend
```

---

## ⚙️ Checklist trước khi go live

- [ ] `API_KEY` đã đổi thành random string
- [ ] `JWT_SECRET` đã đổi thành random string (≥ 32 ký tự)
- [ ] `ADMIN_PASS` đã đổi thành password mạnh
- [ ] `DB_PASS` đã đổi thành password mạnh
- [ ] `CORS_ORIGIN` đã trỏ về domain thật
- [ ] SSL đã cài (HTTPS)
- [ ] Backup đã cấu hình crontab
- [ ] Firewall: chỉ mở port 22, 80, 443
- [ ] PM2 startup đã cấu hình (tự khởi động sau reboot)
