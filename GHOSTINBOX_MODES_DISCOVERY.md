# Ghost Inbox: Temp Mail và 10 Minute Mail

## Bổ sung Temp Gmail sau lỗi301 — 2026-11-12

Đã tái hiện subdomain `https://temp-gmail.ghostinbox.net/` trả HTTP301 sang `https://ghostinbox.net/temp-gmail`, làm adapter cũ chờ200 báo GHOSTINBOX_INVALID_RESPONSE. JS Go to Inbox hiện gọi `/temp-gmail/confirm-gmail-alias?email=...` rồi302 `/temp-gmail/inbox`. Các route `/confirm-gmail-alias` và `/inbox` không còn đúng luồng Gmail. Replay đường dẫn mới: page200, confirm302, inbox200, POST `/livewire/update` đầu và poll sau10giây đều200. Temp Mail/10 Minute Mail vẫn hoạt động ở các đường dẫn bên dưới. Code đã cập nhật prefix Gmail/Referer và ánh xạ origin cũ chính xác; vẫn cấm follow redirect tùy ý.

Đối chiếu HTML/JavaScript công khai và replay HTTP thực tế ngày 2026-11-12. Không chứa địa chỉ mailbox đã tạo, cookie, CSRF, signed snapshot hoặc nội dung thư thật.

## Request đã xác minh

| Bước | Temp Mail | 10 Minute Mail |
| --- | --- | --- |
| Trang tạo | GET `https://ghostinbox.net/` | GET `https://ghostinbox.net/10-minute-mail` |
| Tên và domain | `#heroUser` dạng span/text; `#addrDomainText`; danh sách `#domainList [data-domain]` | Cùng định dạng |
| Xác nhận | GET `/set-custom-email?user=...&domain=...` | GET `/10-minute-mail/set-custom-email?user=...&domain=...` |
| Redirect cùng origin | 302 `/inbox` | 302 `/10-minute-mail/inbox` |
| Inbox HTML | GET `/inbox` | GET `/10-minute-mail/inbox` |
| Poll | POST `/livewire/update` | POST `/livewire/update` |

Trang tạo chọn sẵn tên/domain. JS của Go to Inbox dùng tên lowercase alphanumeric và domain đã chọn; Shuffle đổi tên/domain trên client. Adapter dùng giá trị server-rendered và xác thực domain thuộc danh sách của trang, không nhận URL/domain tùy ý từ API phone.

Hai inbox dùng component `frontend.app`, state gồm messages/deleted/error/fetchFails/email/initial/overflow/source. Giữ signed snapshot nguyên vẹn, cookie và CSRF riêng từng mailbox. Request đầu gửi `_token`, `components` chứa snapshot/updates/calls: `__dispatch syncEmail {email}` rồi `__dispatch fetchMessages {}`; poll sau chỉ fetchMessages. Replay cả hai loại đã trả HTTP200, email đúng và error rỗng. Referer dùng đúng đường dẫn inbox; Origin là website gốc. Không follow redirect ra origin khác.

Trang 10 phút có `#expiryCountdown[data-remaining]`, mailbox mới quan sát được 600 giây. JS hiển thị Expired khi hết giờ; nút gia hạn dispatch `resetTimer`, nhận event `timerReset`. Integration chỉ tạo/đọc OTP và áp dụng hạn hiện tại, chưa thêm chức năng gia hạn. Không suy diễn mailbox bị xóa vật lý đúng thời điểm từ bộ đếm frontend.

## Phạm vi xác minh

Provider mới đã tạo mailbox và refresh inbox trống trên website thật cho cả hai loại. Không gửi thư thật để kiểm tra OTP trong lượt này; phần message normalization/OTP được kiểm thử bằng HTTP stub và MySQL tạm. Livewire là giao thức nội bộ của website, có thể thay đổi.

Temp Gmail cũ vẫn dùng cấu hình và luồng riêng của adapter hiện có. Không thay đổi origin/mailbox cũ hoặc credential của project.
