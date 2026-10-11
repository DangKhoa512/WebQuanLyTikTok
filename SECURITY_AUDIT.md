# Audit bảo mật

## Đã sửa và có regression
- Phone accounts/chrome/jobs thiếu auth → thêm apiKeyAuth, owner lấy từ header trước body/query; response thành công không đổi.
- Global error handler ghi body/parser excerpt → log metadata tối thiểu, invalid JSON trả thông báo cố định; không echo internal 5xx.
- SQL debug logging có thể mang credential → tắt log SQL values; Morgan bỏ URL/query string.
- Production dùng fallback JWT secret → fail closed khi thiếu/secret mặc định. Startup kiểm tra trước migration.
- Async apiKeyAuth DB failure → next(err), không unhandled rejection.
- JWT và Dashboard owner isolation được chạy lại với user A/B, admin own scope, inactive/forged identity, IDOR ở các module đã có test.

## Quyết định giữ nguyên
Theo trả lời người dùng 2026-10-11: web nội bộ, giữ x-api-key bằng username. Cơ chế này không chứng minh danh tính bí mật: ai biết username active có thể giả mạo phone. Không ghi nhận điểm này là đã vá; đây là rủi ro được người dùng yêu cầu giữ nguyên. Không thể xác nhận “không còn rủi ro CRITICAL” với mô hình này nếu hệ thống được truy cập ngoài mạng tin cậy.

## Kiểm tra / giới hạn
JWT trong Authorization, không dùng auth cookie; CSRF phụ thuộc cách triển khai/cookie sau này. CORS không phải cơ chế auth.
User không có subscription/expiry field; API key không có expiry/rotation. Không tự thêm subscription.
Helmet/loginLimiter/apiLimiter có sẵn; rate limiting theo IP cần đối chiếu Nginx/cluster, không giả định phân phối Redis.
Frontend React escape mặc định; scan source không tìm cơ chế realtime Redis/WS. Chưa chứng minh mọi payload XSS/SQLi, mọi export/bulk endpoint hay mọi logger của provider đều an toàn.
Dashboard/System Health không trả password/cookie/token/raw execution payload. Các API lấy account/export riêng có trả credential vì nghiệp vụ, phải giữ xác thực và ownership.
Log regression kiểm chứng global handler/SQL/Morgan; chưa thực hiện rà soát thủ công tất cả lời gọi logger hay quét dependency CVE từ Internet.
Không kiểm tra mạng production, HTTPS firewall hoặc quyền DB/backup VPS. Không đưa secret thật vào tài liệu hoặc fixture.
