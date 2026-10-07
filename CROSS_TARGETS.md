# Tương tác chéo Facebook / Instagram

Engine: `backend/src/services/crossTargetService.js`. History/batch/cycle lưu MySQL, không phụ thuộc bộ nhớ hoặc device.

## Scope và pool

- Instagram: owner + INSTAGRAM + CROSS_FOLLOW + internal source_account_id + scenario_id. Pool là `actions.cross_follow.usernames` của kịch bản hiện tại; trim, bỏ @, chuyển lowercase, bỏ trùng.
- Facebook: owner + FACEBOOK + CROSS_FRIEND + internal source_account_id. Giữ scope xuyên scenario của implementation cũ (`scenario_id=''` trong engine). Pool vẫn là account Facebook job cùng owner, đủ trạng thái login/job, chưa xóa, không die, loại chính source. Không thêm danh sách UID mới vào UI.
- Target đã ISSUED/SUCCESS/FAILED đều bị trừ khỏi current pool trong cycle hiện tại. Thêm/xóa target hoặc đổi Min/Max không reset cycle. Chỉ GET với request mới sau khi available=0 và pool còn target mới tăng cycle. Phần đuôi ít hơn requested_count được trả nguyên phần còn lại, không trộn hai cycle.
- Retry cùng request_id/scope trả lại batch đã cấp, kể cả cycle đã chuyển hoặc cấu hình pool thay đổi. Request mới dùng pool hiện tại. Khi OFF không cấp target; report batch đang chạy vẫn được chấp nhận.

## API cấp target độc lập

Dùng POST theo convention API thiết bị hiện tại, header `x-api-key: <username đang active>` và `Content-Type: application/json`.

`POST /api/instagram/nurture/targets`

```json
{
  "source_account_id": 123,
  "scenario_id": "scenario-demo",
  "request_id": "ig-batch-001",
  "count": 3
}
```

Các giá trị ở ví dụ là giả. source_account_id là id nội bộ trong danh sách account thuộc user xác thực. count là số nguyên 0..200, không lớn hơn Max. Device có thể random Min..Max rồi truyền count. Nếu bỏ count, Instagram reserve tối đa Max; thiết bị có thể thực hiện trong khoảng Min..Max đã được giới hạn theo số target trả về. Mọi target đã cấp đều tính ISSUED, kể cả target thiết bị chưa thực hiện.

Response theo `{success,message,data}`, ví dụ `data`:

```json
{
  "enabled": true,
  "configured_min": 2,
  "configured_max": 5,
  "min": 2,
  "max": 3,
  "request_id": "ig-batch-001",
  "cycle_id": 1,
  "requested_count": 3,
  "available_count": 8,
  "issued_count": 3,
  "targets": ["u2", "u4", "u6"],
  "usernames": ["u2", "u4", "u6"]
}
```

`POST /api/facebook/nurture/targets`

```json
{
  "source_account_id": 456,
  "scenario_id": "scenario-demo",
  "request_id": "fb-batch-001"
}
```

Facebook vẫn random số lượng trên server theo `friend_request.min/max` như trước. Response thêm metadata request/cycle và `targets`, giữ `uids` là danh sách UID đã cấp. Bỏ request_id tạo UUID mới; muốn retry idempotent phải gửi lại request_id cũ. Muốn batch tiếp theo phải dùng request_id mới.

API cấp target cũng kiểm tra System/User Enabled của NUOI_INSTAGRAM/NUOI_FACEBOOK. Owner trong body không quyết định scope; luôn lấy identity từ API key.

## Báo cáo từng target

`POST /api/instagram/nurture/targets/report` hoặc `/api/facebook/nurture/targets/report`:

```json
{
  "source_account_id": 123,
  "scenario_id": "scenario-demo",
  "request_id": "ig-batch-001",
  "results": [
    {"target": "u2", "status": "SUCCESS"},
    {"target": "u4", "status": "FAILED"}
  ]
}
```

Chỉ báo cáo target đã cấp trong batch của source/owner đó. Báo lại cùng kết quả là idempotent; đổi kết quả đã chốt trả 409. FAILED không quay lại pool trong cycle. API report lượt nuôi/task hiện có vẫn giữ nguyên; report từng target là tùy chọn để lưu chi tiết.

## API cũ và dispatcher

- Facebook `/api/facebook/nurture/get-account` giữ `data.friend_candidates`, `data.friend_request.uids`, `data.scenario.actions.friend_request.uids`; thêm request_id/cycle_id vào friend_request. API random scenario máy giữ format `status/value` và các field cũ.
- Instagram `/api/instagram/nurture/get-account` trả batch trong `data.scenario.actions.cross_follow.usernames` và `.targets`, không trả toàn bộ pool khi ON. Cấu hình đầy đủ vẫn ở GET `/api/settings/instagram-nurture`.
- `/api/device/next-task` đưa batch vào `task.data.scenario.actions`; tiếp tục task vẫn giữ task/account/khóa. Cả FB và IG đọc lại kịch bản hiện tại khi resume.
- Nếu không gửi request_id trong API nuôi/dispatcher, dùng nurture_run_id làm idempotency key. Retry cùng lượt nuôi không tiêu thụ batch mới. Muốn thêm batch trong cùng lượt, dùng request_id mới hoặc API targets độc lập. Cấu hình/pool mới áp dụng cho request mới, batch cũ giữ ổn định.
- API random Facebook cũng nhận request_id ở body/query; mặc định dùng nurture_run_id như trước.

## Schema / migration / kiểm thử

Ba bảng mới: cross_target_cycles (unique scope), cross_target_batches (unique scope+request_id, ghi cả batch rỗng), cross_target_history (unique scope+cycle_id+target_key, index batch_id).

Engine khóa source account theo owner trước khi đọc cycle/history và tạo batch; các insert trong cùng transaction. Dispatcher truyền transaction đang giữ khóa của mình vào engine khi resume, tránh mở transaction chồng cho source.

Migration chủ động:

```powershell
npm run migrate:cross-targets --prefix backend
```

Chỉ tạo ba bảng bổ sung và nhập Facebook history cũ vào cycle 1. Không xóa/sửa `facebook_friend_suggestions`, không seed/force/alter. Chạy lại không nhân đôi hoặc reset cycle. Runtime cũng có import theo từng source trong transaction cho dữ liệu legacy chưa nhập. Các source đã xóa vẫn giữ history ở bảng cũ.

```powershell
npm run test:cross-target-engine --prefix backend
npm run test:instagram-cross-follow --prefix backend
node backend/scripts/testTaskRegistryIntegration.js
npm run build --prefix frontend
```

Integration dùng database test có timestamp/random, kiểm tra tên khác DB thật và cleanup đúng DB do script tạo. Không chạy `testFacebookFriendSuggestions.js` standalone trên DB đang dùng; script cũ có cleanup fixture trực tiếp. Engine test kiểm tra concurrency, retry, tail/cycle, pool edit, FAILED, đổi device, owner/scenario/source isolation, uniqueness DB, legacy migration hai lần, process Node mới và API thật.

## Instagram Follow chéo Account

Scenario lưu riêng hai nguồn:

```json
{
  "cross_follow": { "enabled": true, "min": 2, "max": 5, "usernames": ["demo_a", "demo_b", "demo_c", "demo_d", "demo_e"] },
  "cross_account_follow": { "enabled": true, "min": 3, "max": 6 }
}
```

`cross_account_follow` lấy username từ `InstagramAccount.uid` của owner đã xác thực. Trạng thái hợp lệ: `LOGIN_THANH_CONG`, `DANG_LAM`, `DA_CHAY_XONG`. Loại trash, nguồn/cùng username nguồn, username rỗng/sai định dạng; dedupe cả bản reg/job. Không cần textarea hoặc client gửi danh sách account. Min/Max cấu hình tối đa 200; pool thiếu trả batch ngắn/rỗng, không bù bằng target trùng.

POST `/api/instagram/nurture/targets`, header `x-api-key`, JSON:

```json
{
  "source_account_id": 123,
  "scenario_id": "scenario-demo",
  "request_id": "follow-account-demo-001",
  "action": "cross_account_follow",
  "count": 3
}
```

POST `/api/instagram/nurture/targets/report`, cùng API key:

```json
{
  "source_account_id": 123,
  "scenario_id": "scenario-demo",
  "request_id": "follow-account-demo-001",
  "action": "cross_account_follow",
  "results": [{ "target": "demo_target", "status": "SUCCESS" }]
}
```

Các ID/username là minh họa; target báo cáo phải thuộc batch đã cấp. Không truyền `action` vẫn dùng `cross_follow` thủ công. Retry dùng cùng request_id; lượt cấp mới dùng request_id mới. Pool cập nhật status hiện tại ở lượt mới; retry trả batch cũ để giữ idempotency. Scope engine riêng `ACCOUNT_CROSS_FOLLOW` nên history không lẫn với danh sách Username, không phụ thuộc phone; giữ scope scenario của Instagram hiện có.

API nuôi và Dashboard get task trả activity ở `data.scenario.actions.cross_account_follow` hoặc `task.data.scenario.actions.cross_account_follow`. Có `enabled`, `min`, `max`, `configured_min`, `configured_max`, `targets`, `usernames` (batch), `request_id`, `cycle_id` và số lượng. Min/Max response được giới hạn theo batch như cross_follow cũ; configured_min/max là cấu hình gốc. `account_count` optional ở API nuôi/next-task chỉ định count cho nguồn Account; `count` cũ vẫn dành nguồn Username. Khi không chỉ định, reserve tối đa Max. Device thực hiện follow, backend chỉ cấp/ghi nhận target.

Quick Create Instagram lưu `generator_config.actions` và đầy đủ action cho mỗi scenario. Newfeed/Reels/Story ON chia tổng time range; count follow không cộng vào thời gian. Random count Min/Max theo convention Facebook; do đó từng scenario có thể có range khác nhau trong khoảng người dùng nhập. Không thêm schema bảng/migration; dùng JSON AppSetting và ba bảng engine hiện có. Lệnh kiểm thử UI/API/DB riêng: `node backend/scripts/testInstagramCrossFollowIntegration.js --ui`.
