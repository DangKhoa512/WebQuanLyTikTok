# Facebook Job: lấy Die và báo cáo kháng

Hai API dùng header `x-api-key` của user active theo cơ chế phone hiện hành. Owner lấy từ phiên xác thực; body/query không thể đổi owner. Chỉ áp dụng `kind=job`, đúng `device_id` và tài khoản chưa ở thùng rác. Response có dạng `{ success, message, data }` và `Cache-Control: no-store`.

## Lấy tài khoản Die của phone

`GET /api/facebook/job/die-accounts?device_id=phone-example`

Hoặc `POST /api/facebook/job/die-accounts`:

```json
{ "device_id": "phone-example" }
```

`data` là mảng tài khoản trạng thái `ACCOUNT_DIE`, sắp theo ID tăng dần; không có tài khoản trả `[]`. Dùng định dạng account hiện có, gồm UID và dữ liệu đăng nhập phục vụ phone. API không đổi trạng thái hoặc khóa tài khoản. Dữ liệu có credential nên client không ghi response vào log.

## Báo cáo đã kháng

`POST /api/facebook/job/report-die`

```json
{ "device_id": "phone-example", "uid": "fixture-facebook-uid" }
```

Chuyển `ACCOUNT_DIE` → `DANG_KHANG`, giữ phone, giải phóng khóa account/reg Page/nuôi trong transaction với row lock. Báo cáo lại khi còn `DANG_KHANG` trả thành công với `already_reported: true`. `data` gồm `account` và `already_reported`.

- Thiếu hoặc quá dài UID/device: HTTP 400.
- Sai owner/phone/kind, không tồn tại hoặc đã vào thùng rác: HTTP 404.
- Account ở trạng thái khác: HTTP 409; không chuyển lại sang Đang Kháng sau khi đã được check thành công.
- Chưa xác thực: HTTP 401.

## Check live trên dashboard

Facebook Job có tab/nhãn **Đang Kháng**. Dùng nút Check live hiện có (`POST /api/facebook/check-live`, JWT). Với account đang `DANG_KHANG`:

- `live`: chuyển `LOGIN_THANH_CONG`, đặt thời điểm login mới, xóa lỗi và khóa.
- `die`: chuyển `ACCOUNT_DIE`, đặt `trashed_at`; account xuất hiện trong thùng rác, không xóa vĩnh viễn.
- `unknown`, timeout hoặc upstream giới hạn: giữ `DANG_KHANG`, chưa đưa vào thùng rác.

Check live thông thường của tài khoản chưa kháng giữ quy tắc cũ. Kết quả mạng được recheck snapshot trong transaction trước khi ghi để không áp dụng kết quả cũ sau report/trash/thay đổi account.

## Triển khai và kiểm tra

Model và runtime migration trong `server.js` đã thêm `DANG_KHANG` vào ENUM. Cần restart backend mới và xác nhận migration `facebook_accounts status enum ready` thành công trước khi dùng API; không chỉ cập nhật frontend. Không chạy seed.

`npm run test:facebook-appeal --prefix backend` kiểm tra HTTP/auth thật, DB MySQL tạm riêng và stub Facebook; không gọi Facebook thật. Frontend: `npm run build --prefix frontend`.
