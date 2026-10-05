# Hướng dẫn AI — QUANLY_REG

Đọc PROJECT_CONTEXT.md ở thư mục gốc trước khi khảo sát hoặc sửa code. Tài liệu đã đối chiếu mã nguồn ngày 2026-10-05.

- Chỉ đọc thêm phần liên quan đến yêu cầu mới, không cần rà soát toàn bộ repo lại từ đầu.
- Kiểm tra git status trước khi sửa; code và yêu cầu mới là căn cứ khi khác bản tổng hợp.
- Giữ cách ly owner_username, transaction/khóa chống cấp trùng và tương thích API thiết bị.
- Không đưa giá trị .env, mật khẩu, cookie, token hoặc dữ liệu tài khoản thật vào tài liệu bàn giao.
- Không chạy seed trên DB đang dùng: backend/seeds/seedData.js có Account.sync({ force: true }).
- Sau thay đổi đáng kể, cập nhật PROJECT_CONTEXT.md với thay đổi, kiểm tra đã chạy và việc còn lại.
- Trao đổi bằng tiếng Việt.
