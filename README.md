# 🎵 TikTok Account Manager

Hệ thống quản lý tài khoản TikTok với API cho phone/AutoTouch gửi dữ liệu lên và Dashboard theo dõi thống kê real-time.

---

## 📁 Cấu trúc dự án

```
QUANLY_REG/
├── backend/                    # Node.js + Express + Sequelize
│   ├── src/
│   │   ├── config/             # database.js, logger.js
│   │   ├── controllers/        # accountController, statsController
│   │   ├── routes/             # accounts.js, stats.js, index.js
│   │   ├── middleware/         # errorHandler, rateLimiter, validator
│   │   ├── services/           # accountService, statsService (business logic)
│   │   ├── cron/               # scheduler.js (mỗi 5 phút)
│   │   ├── models/             # Account.js (Sequelize model)
│   │   ├── utils/              # response.js
│   │   ├── app.js
│   │   └── server.js
│   └── seeds/                  # seedData.js (50 accounts mẫu)
│
├── frontend/                   # React + Vite
│   └── src/
│       ├── pages/              # Dashboard, AccountList, AccountDetail, Stats
│       ├── components/         # Layout, StatCard, StatusBadge, Pagination, Toast
│       └── services/           # api.js (Axios)
│
├── docker-compose.yml
└── README.md
```

---

## ⚡ Chạy local (phát triển)

### Yêu cầu
- **Node.js** >= 18
- **MySQL** >= 8.0 (bắt buộc 8.0+ để dùng `SKIP LOCKED`)
- **npm** hoặc **yarn**

### 1. Tạo database MySQL

```sql
-- Chạy trong MySQL client
CREATE DATABASE IF NOT EXISTS tiktok_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 2. Setup Backend

```bash
cd backend

# Sao chép và điền thông tin kết nối
cp .env.example .env
# Chỉnh sửa .env: DB_HOST, DB_USER, DB_PASS, DB_NAME

# Cài dependencies
npm install

# (Tuỳ chọn) Seed dữ liệu mẫu – XOÁ & TẠO LẠI table!
npm run seed

# Chạy development
npm run dev
```

Backend sẽ chạy tại: **http://localhost:3000**

### 3. Setup Frontend

```bash
cd frontend

# Cài dependencies
npm install

# Chạy development
npm run dev
```

Frontend sẽ chạy tại: **http://localhost:5173**

> Vite tự proxy `/api` → `http://localhost:3000` nên không cần cấu hình thêm.

---

## 🐳 Chạy bằng Docker Compose

```bash
# Từ thư mục gốc QUANLY_REG/
# (Tuỳ chọn) Đặt biến môi trường
export DB_PASS=MyStr0ngP@ss
export DB_NAME=tiktok_manager

# Build & run
docker-compose up -d --build

# Xem log
docker-compose logs -f backend

# Seed dữ liệu mẫu (sau khi backend healthy)
docker exec tiktok_backend node seeds/seedData.js
```

Sau khi chạy:
- Frontend: **http://localhost** (port 80)
- Backend API: **http://localhost:3000**
- MySQL: **localhost:3306**

---

## 🚀 Deploy VPS

### Cách 1: Docker Compose (khuyến nghị)

```bash
# Clone dự án lên VPS
git clone <repo> /opt/tiktok-manager
cd /opt/tiktok-manager

# Cấu hình production
nano .env.production   # tạo file env

# Chạy
docker-compose -f docker-compose.yml up -d --build

# Nginx reverse proxy (nếu dùng domain)
# Cấu hình nginx trỏ domain → localhost:80
```

### Cách 2: PM2 (không Docker)

```bash
# Backend
cd backend
npm install --production
cp .env.example .env   # điền đầy đủ
pm2 start src/server.js --name tiktok-backend

# Frontend (build static)
cd frontend
npm install
npm run build
# Copy dist/ vào nginx webroot

# Nginx config
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/tiktok-frontend/dist;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📡 API Reference

### Headers chung
```
Content-Type: application/json
```

### Response format
```json
{
  "success": true,
  "message": "Thành công",
  "data": {}
}
```

---

### 1. POST `/api/accounts/reg-submit`

Phone gửi account sau khi đăng ký xong.

**Kiểu A – Raw string:**
```json
{ "data": "username|password|twofa|email|email_pass|cookie|token|proxy|device_id" }
```

**Kiểu B – JSON fields:**
```json
{
  "username":   "tiktok_abc",
  "password":   "P@ssw0rd!",
  "twofa":      "123456",
  "email":      "abc@gmail.com",
  "email_pass": "emailpass",
  "cookie":     "...",
  "token":      "...",
  "proxy":      "192.168.1.1:8080",
  "device_id":  "iphone_01"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đăng ký account thành công",
  "data": { "account": { "id": 1, "username": "tiktok_abc", "status": "REG_DA_LAM", ... } }
}
```

---

### 2. POST `/api/accounts/get-upvideo`

Phone lấy account UPVIDEO (có lock chống trùng).

```json
{ "device_id": "iphone_01" }
```

---

### 3. POST `/api/accounts/upload-success`

```json
{
  "account_id": 1,
  "device_id":  "iphone_01",
  "video_count": 5
}
```

---

### 4. POST `/api/accounts/upload-fail`

```json
{
  "account_id": 1,
  "device_id":  "iphone_01",
  "reason":     "upload_error"
}
```

---

### 5. POST `/api/accounts/update-live`

```json
{
  "account_id": 1,
  "live_status": "live"
}
```

---

### 6. GET `/api/accounts`

Query params:
| Param | Giá trị |
|-------|---------|
| `status` | REG_DA_LAM \| UPVIDEO \| UPVIDEO_FAIL \| DAT_CHI_TIEU \| DIE |
| `live_status` | unknown \| live \| die |
| `device_id` | string |
| `search` | username (LIKE search) |
| `date_from` | YYYY-MM-DD |
| `date_to` | YYYY-MM-DD |
| `page` | số trang (default: 1) |
| `limit` | số dòng/trang (default: 20, max: 100) |

---

### 7. GET `/api/stats`

```json
{
  "success": true,
  "data": {
    "total": 50,
    "REG_DA_LAM": 10,
    "UPVIDEO": 15,
    "UPVIDEO_FAIL": 5,
    "DAT_CHI_TIEU": 12,
    "DIE": 8,
    "today_reg": 3,
    "today_upload": 7,
    "today_fail": 2
  }
}
```

---

### 8. GET `/api/stats/daily?days=7`

---

## 🔄 Flow tự động (Cron mỗi 5 phút)

```
1. Unlock accounts bị lock > 10 phút
2. live_status = die → status = DIE
3. REG_DA_LAM (đủ 1 ngày + live) → UPVIDEO
4. UPVIDEO (≥5 ngày, ≥20 videos, upload 24h gần, live) → DAT_CHI_TIEU
5. Nếu UPVIDEO < 10 acc → lấy từ UPVIDEO_FAIL bổ sung
```

---

## 🛡️ Chống race condition

- `get-upvideo` dùng **MySQL transaction + `SELECT FOR UPDATE SKIP LOCKED`**
- Mỗi phone nhận account khác nhau dù gọi API cùng lúc
- Lock timeout 10 phút, cron tự unlock

---

## 📊 Database Schema

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | INT UNSIGNED AUTO_INCREMENT | Primary key |
| `username` | VARCHAR(255) UNIQUE | Tên tài khoản |
| `status` | ENUM | REG_DA_LAM/UPVIDEO/UPVIDEO_FAIL/DAT_CHI_TIEU/DIE |
| `live_status` | ENUM | unknown/live/die |
| `video_count` | INT | Số video đã up |
| `reg_at` | DATETIME | Server ghi lúc nhận account |
| `last_upload_at` | DATETIME | Lần upload cuối |
| `locked_by` | VARCHAR | Device đang lock |
| `locked_at` | DATETIME | Thời điểm lock |
| `created_at` | DATETIME | Auto |
| `updated_at` | DATETIME | Auto |

---

## 🧪 Test API nhanh (curl)

```bash
# Đăng ký account
curl -X POST http://localhost:3000/api/accounts/reg-submit \
  -H "Content-Type: application/json" \
  -d '{"username":"test01","password":"pass123","device_id":"iphone1"}'

# Lấy account để upload
curl -X POST http://localhost:3000/api/accounts/get-upvideo \
  -H "Content-Type: application/json" \
  -d '{"device_id":"iphone1"}'

# Xem stats
curl http://localhost:3000/api/stats

# Health check
curl http://localhost:3000/health
```

---

## 📝 Environment Variables (backend)

| Biến | Mặc định | Mô tả |
|------|---------|-------|
| `NODE_ENV` | development | development/production |
| `PORT` | 3000 | HTTP port |
| `DB_HOST` | localhost | MySQL host |
| `DB_PORT` | 3306 | MySQL port |
| `DB_NAME` | tiktok_manager | Database name |
| `DB_USER` | root | MySQL user |
| `DB_PASS` | - | MySQL password |
| `CORS_ORIGIN` | * | Allowed origins (comma-separated) |
| `LOG_LEVEL` | info | error/warn/info/debug |
