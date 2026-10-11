# Bộ kiểm thử audit

Chạy từ gốc: `npm run test:audit --prefix backend`.

Runner dùng Node assert và Selenium hiện có. Mỗi integration script tạo MySQL database test riêng với tên có timestamp/UUID, guard khác DB_NAME gốc, rồi chỉ dọn database đó. Không chạy seed. Cần MySQL local và quyền tạo/dọn database test; Chrome/driver local cho E2E.

Nhóm tests chứa manifest trỏ tới script đã có hoặc regression mới, kết quả assertions ở results.json. Performance có lỗi burst được ghi PARTIAL, runner exit 1; không được coi là toàn bộ test đạt chỉ vì consistency sau retry đạt. Chi tiết log chỉ lưu artifacts/audit (gitignored), không đưa vào tài liệu bàn giao.

Đọc TEST_MATRIX.md ở gốc để biết NOT_RUN/N/A, đặc biệt production, mọi CRUD, đa user và soak 24/7. Snapshot schema chỉ là metadata local, không có credential/account rows.
