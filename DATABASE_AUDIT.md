# Audit database local

Chỉ đọc INFORMATION_SCHEMA và EXPLAIN trên schema đang có; không đọc credential/account rows thật, không sync/migrate schema này. Bằng chứng: backend/tests/database/schema-observed.json, explain-observed.json.

| Mục | Kết quả |
| --- | --- |
| Bảng quan sát | 47 |
| Model Sequelize | 41 |
| Column model thiếu trên schema local | 0 |
| Index/constraint quan sát | 204/96 |
| Index model chưa tìm thấy theo fields/unique | 0 |

Các index model đã khớp theo thứ tự fields/unique. Index SQL startup/registry cần đối chiếu riêng; không suy ra chỉ từ model.

MySQL row locks, transaction và các unique owner/device, owner/kind/uid, owner/page cùng cursor FKs có trong source/metadata. DeviceTaskRun không có constraint unique một resource active; không áp đặt unique lịch sử execution vì có thể phá lưu nhiều lượt chạy.

Schema local không phải schema VPS. Chưa query duplicate/orphan account thật, chưa audit permissions/backup disk, chưa chạy toàn bộ startup migration trên bản sao production. Không có migration schema mới trong bản sửa này; AppSetting dùng snapshot cron hiện có. RR migration idempotent được kiểm tra bằng snapshot settings/cursor trong database tạm.

Seed không chạy. Fixture tạo database có prefix và UUID, guard khác DB_NAME gốc, cleanup chỉ DROP database test riêng. SQL test không được trỏ vào database đang dùng.
