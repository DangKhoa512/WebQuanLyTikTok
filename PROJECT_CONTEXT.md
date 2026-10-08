# QUANLY_REG — bối cảnh tiếp nối cho AI

Cập nhật 2026-10-06 (Asia/Saigon), từ mã nguồn tại C:\Users\KHOA\Desktop\QUANLY_REG. Không chứa thông tin đăng nhập hoặc dữ liệu database.

## 1. Tổng quan

Hệ thống web quản lý tài khoản và hoạt động máy/phone tự động. Bắt đầu từ TikTok Account Manager, hiện có TikTok app/Chrome, tài khoản chạy job, Facebook, Instagram, Hotmail/email OTP, thống kê ngày/máy, quản lý user và điều phối tác vụ thiết bị.

Luồng chính: dashboard React → REST API Express → controller/service → Sequelize/MySQL. Phone/AutoTouch lấy tài khoản/tác vụ qua API rồi báo kết quả. Cron chuyển trạng thái, reset workflow và giải phóng task hết hạn.

README.md và DEPLOY.md chủ yếu phản ánh phiên bản ban đầu. Ưu tiên code nếu mâu thuẫn với tài liệu. Bản tổng hợp giúp chọn file cần đọc, không thay thế kiểm tra code liên quan đến yêu cầu mới.

## 2. Công nghệ và cấu trúc

| Phần | Công nghệ / vị trí |
| --- | --- |
| Backend | Node.js, Express 4, CommonJS; backend/src |
| Database | MySQL, Sequelize 6, mysql2; cần MySQL 8+ cho SKIP LOCKED |
| Frontend | React 18, React Router 6, Vite 5, Axios, Recharts; frontend/src |
| Check/login ngoài | Axios, proxy-chain, https-proxy-agent, selenium-webdriver |
| Vận hành | Docker Compose (MySQL/backend/Nginx), cấu hình PM2 |
| Gốc | package.json chạy concurrently cho backend/frontend |

Backend chia routes, controllers, services, models, middleware, utils, cron. Frontend chia pages, components, services; services/api.js tập trung API wrapper, App.jsx khai báo route, index.css định dạng giao diện.

## 3. Bản đồ file theo công việc

Đường dẫn backend rút gọn dưới đây thuộc backend/src. Tên màn hình thuộc frontend/src/pages; component thuộc frontend/src/components.

| Công việc | File bắt đầu |
| --- | --- |
| Startup/schema | server.js, models/index.js, model tương ứng |
| Express/health/routes | app.js, routes/index.js |
| Auth/user/owner | controllers/authController.js, controllers/userController.js, middleware/jwtAuth.js, middleware/apiKeyAuth.js, utils/owner.js |
| TikTok app | controllers/accountController.js, services/accountService.js, models/Account.js, routes/accounts.js; AccountList.jsx, AccountDetail.jsx |
| TikTok Chrome/kháng | controllers/chromeController.js, models/ChromeAccount.js, routes/chrome.js; ChromeAccountList.jsx, ChromeKhangStats.jsx |
| TikTok job | controllers/jobController.js, models/JobAccount.js, services/jobDailyStatService.js, routes/jobs.js; JobAccounts.jsx |
| Facebook reg/job/Page/nuôi | controllers/facebookController.js, services/facebookWorkflowService.js, services/facebookFriendSuggestionService.js, routes/facebook.js; FacebookAccounts.jsx, FacebookRegStats.jsx, FacebookNurture.jsx |
| Instagram reg/job/cookie/nuôi | controllers/instagramController.js, utils/instagramLoginUtils.js, utils/instagramCheckLiveUtils.js, utils/instagramCookieCheckUtils.js, routes/instagram.js; InstagramAccounts.jsx |
| Reg Instagram từ Facebook | controllers/instagramFacebookRegController.js, services/instagramFacebookLinkService.js; InstagramFacebookRegClaims.jsx, InstagramFacebookSources.jsx |
| Dispatcher | controllers/deviceController.js, services/taskDispatcherService.js, services/taskReportService.js, services/taskEligibilityService.js, services/legacyTaskAdapter.js, services/deviceTaskTypes.js |
| Dashboard/máy | controllers/dashboardController.js, services/dashboardService.js, controllers/machineStatusController.js; Dashboard.jsx |
| API config theo máy | controllers/machineApiConfigController.js, models/MachineApiConfig.js; MachineApiConfigs.jsx |
| Settings | controllers/settingsController.js, services/settingsService.js, models/AppSetting.js; ProxySettings.jsx, các component *Settings.jsx |
| Email | controllers/hotmailController.js, controllers/emailOtpController.js, route/model tương ứng; HotmailAccounts.jsx, EmailOtpAccounts.jsx |
| Stats | controllers/statsController.js, services/statsService.js, các service *JobStatService.js; Stats.jsx, FacebookJobStats.jsx, InstagramJobStats.jsx |
| Import/export/bulk/group/history | controllers/importController.js, exportController.js, bulkController.js, accountGroupController.js, usedAccountController.js; services/usageHistoryService.js; ImportModal.jsx, AccountGroupPicker.jsx, UsedAccounts.jsx, Export.jsx |
| Frontend API/navigation | frontend/src/services/api.js, frontend/src/App.jsx, frontend/src/components/Layout.jsx |

## 4. Nghiệp vụ và model

### TikTok

Account quản lý app: đăng ký, lấy account upvideo, report upload, live check, đủ chỉ tiêu và kháng. Trạng thái cơ bản từ luồng ban đầu: REG_DA_LAM, UPVIDEO, UPVIDEO_FAIL, DAT_CHI_TIEU, DIE. Code hiện có thêm login/kháng; lấy danh sách chính xác từ model/controller.

ChromeAccount là pool riêng cho login/kháng Chrome, có daily log và giới hạn. JobAccount cùng JobDailyStat/JobAccountDailyLog phục vụ chạy job; API stats có web, mặc định TDS. AccountGroup, UsedAccount và usageHistoryService phục vụ nhóm/lịch sử sử dụng.

Lấy account có transaction/row lock/skipLocked để tránh cấp trùng. ACCOUNT_LOCK_TIMEOUT_MIN mặc định trong accountService là 40 phút, khác 10 phút của README.

### Facebook và Instagram

FacebookAccount/InstagramAccount phân loại kind reg/job; có owner, group, trạng thái login/job/live và khóa nghiệp vụ. Facebook có reg Page, kiểm tra Page/token, Page job, gợi ý kết bạn, nuôi, thùng rác/khôi phục, đồng bộ reg sang job. Instagram có lấy account login/job, báo job, kiểm tra live, browser login lấy cookie với proxy, nuôi, thùng rác và đồng bộ reg sang job. INSTAGRAM_LOCK_TIMEOUT_MIN mặc định 120 phút trong controller.

Đăng ký Instagram bằng Facebook dùng InstagramFacebookRegClaim, InstagramFacebookRegResult, FacebookInstagramLink. Nuôi có FacebookNurtureAssignment/Log và InstagramNurtureAssignment/Log; trạng thái CHUA_NUOI, DANG_NUOI, DA_NUOI, NUOI_FAIL.

Instagram UI được nhúng bằng chuyển nền tảng trong FacebookAccounts.jsx. Stats.jsx chuyển sang FacebookJobStats/InstagramJobStats; FacebookNurture.jsx hỗ trợ cả hai nền tảng. Không kết luận thiếu UI Instagram chỉ vì không có route trực tiếp trong App.jsx.

### Thiết bị và dispatcher

DashboardDevice lưu heartbeat/trạng thái; DeviceTaskCapability lưu khả năng; DeviceTaskRun lưu lượt chạy; MachineApiConfig lưu config theo owner + device + key.

POST /api/device/heartbeat, /next-task, /task/report dùng API key; GET/PUT /api/device/capabilities/:device_id dùng JWT.

Task mặc định theo ưu tiên: PAGE_JOB 100, INSTAGRAM_JOB 90, REG_PAGE 80, REG_INSTAGRAM 70, NUOI_FACEBOOK 60, NUOI_INSTAGRAM 50. Mặc định bật, timeout khóa 30 phút, max retry 3; giá trị settings lưu trong DB có thể khác.

Dispatcher dùng transaction, kiểm tra capabilities/task đang chạy/ưu tiên/điều kiện nghiệp vụ; legacyTaskAdapter nối với API nghiệp vụ cũ. Report chuyển RUNNING → REPORTING → SUCCESS/FAILED; release có RELEASED. Báo task kết thúc lần nữa trả already_reported; phải đúng owner/device.

Lỗi retry: TIMEOUT, NETWORK_ERROR, APP_OPEN_FAIL. Không retry: ACCOUNT_DIE, CHECKPOINT, INVALID_ACCOUNT. Đọc service để hiểu cách retry thực thi, không mặc định có queue riêng.

Settings gồm điều kiện đủ chỉ tiêu, giới hạn kháng/login/job theo user, proxy/cookie check, workflow Facebook, reg Instagram bằng Facebook, nuôi, dispatcher.

### Email/nhóm/thống kê

Hotmail: POST /api/hotmails/get, /report-used; dashboard import/list/bulk. Email OTP: EmailOtpOrder, EmailOtpDeviceUse; POST /api/email-otps/report, /get, /report-done; dashboard quản lý trạng thái.

AccountGroup có loại app, chrome, job, facebook_reg, facebook_job, instagram_reg, instagram_job. Stats/log tách theo TikTok job, Facebook job, Instagram job, kháng app/Chrome, Page reg và báo cáo máy theo nền tảng. Khi sửa report cần xem service thống kê tương ứng.

## 5. API/auth/owner cần giữ đúng

- API mount dưới /api. /health trả status/timestamp, không kiểm tra DB mỗi request.
- Dashboard dùng Authorization: Bearer JWT. Frontend lưu localStorage key tiktok_admin_token, gắn header qua interceptor, trả response.data và chuyển /login khi 401.
- apiKeyAuth hiện dùng **username của user đang active** làm header x-api-key, rồi gắn req.api_owner_username. Không so với secret API_KEY trong .env như DEPLOY cũ mô tả.
- Một số API cũ accounts/jobs/Chrome không gắn apiKeyAuth riêng như API mới; kiểm tra route/controller từng endpoint trước khi sửa auth.
- utils/owner.js chuẩn hóa trim/lowercase. Dashboard scope theo req.admin.username; phone đã auth dùng req.api_owner_username; luồng cũ có body/query/default admin fallback.
- Giữ owner_username ở truy vấn, khóa, insert và unique index; accounts/Chrome dùng unique owner + username. Cẩn thận bulk/report/stats khi refactor.
- Response thường { success, message, data }; xem utils/response.js và endpoint để giữ contract.
- Route groups: auth, accounts, chrome-accounts, stats, dashboard, users, account-groups, used-accounts, settings, machine-api-configs, machine-status, device, jobs, facebook, instagram, hotmails, email-otps, export.
- Contract/payload chính xác nằm trong routes/*, controllers/*, middleware/validator.js và frontend/src/services/api.js.

## 6. Database và cron

config/database.js dùng env DB_NAME/DB_USER/DB_PASS; DB_HOST mặc định localhost, DB_PORT 3306; utf8mb4; timezone +07:00; pool max 10.

server.js authenticate, đăng ký models, sequelize.sync({ force: false, alter: false }), chạy nhiều runtime migration SQL rồi vận hành server. Sửa schema cần xem cả model và migration startup; chỉ sửa model không bảo đảm DB cũ được cập nhật. Migration thường bắt lỗi và log warning: cần phân biệt already exists với lỗi SQL thật.

Cron chạy ngay khi startup và mỗi 5 phút: accountService.runStatusTransitions, runFacebookWorkflowResets, releaseExpiredTasks; trạng thái schedulerState. Khởi động backend có thể thay đổi schema/dữ liệu, không phải thao tác đọc thuần túy.

**Không seed DB thật:** backend/seeds/seedData.js dùng Account.sync({ force: true }), xóa/tạo lại bảng accounts. Không dùng seed để tạo schema production.

## 7. Chạy và vận hành

Theo README cần Node >=18, MySQL >=8. backend/.env và backend/.env.example có sẵn trong workspace; chưa đọc/chép giá trị bí mật.

Sau khi cấu hình DB và cài dependency:

```powershell
# Từ gốc
npm run dev

# Hoặc mỗi lệnh ở một terminal
npm run dev --prefix backend
npm run dev --prefix frontend

# Build UI
npm run build --prefix frontend
```

Nếu thiếu dependency, npm install tại gốc/backend/frontend. Backend mặc định localhost:3000, frontend localhost:5173. Vite host true, proxy /api sang localhost:3000, timeout 600 giây. VITE_API_BASE_URL nếu cấu hình sẽ được wrapper thêm /api.

START.bat mở hai terminal và hardcode đường dẫn workspace Windows. Đọc SETUP.ps1 trước khi chạy vì có thể thay đổi môi trường.

Env chính: DB_*, PORT, NODE_ENV, CORS_ORIGIN, LOG_LEVEL, JWT_SECRET, ADMIN_USER/ADMIN_PASS; timeout/limit nghiệp vụ ở service/controller. Không công bố giá trị bí mật.

Docker: docker compose up -d --build. Compose lấy biến cho MySQL ở môi trường/gốc; backend dùng backend/.env và override DB_HOST=mysql. Compose hiện chỉ publish Nginx 80/443; không publish backend/MySQL trực tiếp 3000/3306 như README ghi. Có volume mysql_data, backend logs và mount /etc/letsencrypt.

PM2: backend/ecosystem.config.js. Nginx: nginx/nginx.conf, nginx/Dockerfile; frontend có Dockerfile/nginx.conf riêng. Backup: scripts/backup-db.sh. DEPLOY chỉ là hướng dẫn mẫu, không xác nhận VPS/production hiện tại.

## 8. Kiểm tra khi sửa code

```powershell
# Cú pháp file backend đã sửa
node --check backend/src/controllers/instagramController.js

# Mock check-live Instagram (từ gốc)
npm run test:instagram-check-live-mock --prefix backend

# Parser (chạy trong backend)
node scripts/testFacebookImportParser.js

# UI (từ gốc)
npm run build --prefix frontend
```

backend/scripts/testTaskDispatcher.js và testFacebookFriendSuggestions.js dùng DB, tạo/xóa dữ liệu test; đọc cleanup và dùng DB phù hợp trước khi chạy. scripts/test-concurrent-get.js gọi API cấp account đồng thời, có thể khóa account thật. Không chạy vô tình trên dữ liệu đang dùng.

Không có npm test tổng quát trong package backend/frontend; không khai báo framework test frontend. Chọn kiểm tra theo thay đổi.

Lượt tổng hợp này chỉ đọc source/Git và ghi tài liệu; chưa chạy build/test/server, chưa xác minh MySQL/API đang chạy hay production.

## 9. Trạng thái bàn giao

- Branch main, HEAD 2473129: Expand Instagram cookie checks and fallback.
- Commit trước đó: 3f04a55 sort cookie Instagram; 8e258d4 bỏ login khi đã có cookie; 6c9a2eb login cookie tuần tự; de0f9f6 sửa Facebook placeholder live detection. Đây là lịch sử Git, không phải kết quả kiểm thử hiện tại.
- Working tree sạch trước khi thêm hai file tài liệu. Có node_modules ở gốc/backend và nhiều log test/runtime; log có thể chứa dữ liệu nhạy cảm, không dùng làm hướng dẫn.
- Không tìm thấy AGENTS.md trước lượt này. Đã thêm AGENTS.md để hướng AI đọc tài liệu ngay khi vào repo.
- Chưa commit/push; chưa sửa logic, DB hoặc cấu hình ứng dụng. Yêu cầu hiện tại chỉ là tổng hợp; không có bug/tính năng dang dở được giao trong cuộc trò chuyện này.
- Tài liệu cũ khác code về phạm vi tính năng, auth API key, timeout khóa và port Docker. Ưu tiên code.

## 10. Bắt đầu cuộc trò chuyện mới

1. Đọc AGENTS.md và tài liệu này; kiểm tra git status --short/HEAD để biết thay đổi mới.
2. Chọn file theo mục 3, đối chiếu route → controller/service → model/migration → API frontend/UI của yêu cầu.
3. Giữ owner, concurrency, thống kê, report lặp và tương thích API cũ.
4. Chạy kiểm tra phù hợp, ghi rõ kết quả/giới hạn; cập nhật tài liệu khi kiến trúc hoặc luồng thay đổi.

Câu mở đầu gợi ý: “Đọc AGENTS.md và PROJECT_CONTEXT.md của QUANLY_REG rồi xử lý yêu cầu sau: …”. AI vẫn cần đọc code liên quan nhưng không cần dựng lại toàn bộ bối cảnh.

## 11. Cập nhật cài đặt Instagram (2026-10-05)

- User sửa limit IG của chính mình; admin xem/sửa bảng limit các user. API không cho user sửa owner khác.
- Reg Instagram bằng Facebook bố trí các nhãn/input cùng hàng.
- GET/PUT /api/settings/instagram-job lưu theo owner ở AppSetting key instagram_job: min_login_days và actions.like/follow (enabled, min_delay_seconds, max_delay_seconds). Delay tính bằng giây. Mặc định số ngày = 0, hai action bật và delay = 0 để giữ cách sử dụng API cũ.
- API get-login-success-account lọc login_at đủ N*24 giờ khi N>0, kể cả account DANG_LAM trả lại; thiếu login_at không đủ điều kiện. Không chặn cấp account để login hoặc nuôi. Dashboard taskEligibilityService dùng cùng mốc cho INSTAGRAM_JOB.
- API lấy account trả data.job_settings; device/next-task trả task.job_settings cho task.type = INSTAGRAM_JOB. Bot ngoài repo cần đọc cấu hình để thực thi Like/Follow và delay. Dispatcher tiếp tục task đang chạy theo cơ chế cũ.
- Build frontend đạt (cảnh báo bundle lớn); kiểm tra cú pháp backend đạt. testInstagramJobSettingsMock.js kiểm tra quyền/owner, validation, mốc đủ ngày, thiếu login_at và cấu hình API/dispatcher bằng mock, không đổi DB thật.
- Sửa lỗi Dashboard: Sequelize không nhận tham số :igMinDays khi viết sát dấu bằng. Truy vấn đã đổi sang (:igMinDays = 0 OR login_at <= :igJobAt). Test dùng injectReplacements thật của Sequelize cho cả 0 và 4 ngày, xác nhận SQL không còn tham số chưa thay thế. Test mock và kiểm tra cú pháp/diff đạt; chưa kiểm tra trực tiếp database đang chạy.

## 12. Refactor UI trang Cài đặt (2026-10-05)

- Chỉ sửa frontend và tài liệu trong lượt refactor này. Backend, route, schema và API contract giữ nguyên; các diff backend hiện có thuộc lượt sửa IG trước.
- ProxySettings.jsx vẫn điều khiển các tab TikTok/Facebook/Cài đặt chung và các hàm lưu/reset hiện có. CSS mới ở frontend/src/styles/settings.css giới hạn trong .settings-page; không thay đổi Dashboard hay danh sách account.
- InstagramSettingsPanel.jsx là UI Instagram riêng, dùng các endpoint thật đang có cho limit user, reg Facebook, job và cookie. Gọi onSaved để đồng bộ các giá trị cookie/reg được dùng bởi Save/Reset chung ở ProxySettings.
- SettingsPrimitives.jsx cung cấp SettingsCard, NumberField có đơn vị, SettingsToggle, SettingsModal (native dialog, Escape/focus), SettingsSaveBar.
- Instagram có điều hướng tới section, tổng quan cấu hình, bảng limit (user chỉ thấy chính mình, admin thấy các user), card Reg/Điều kiện, task Like/Follow với toggle và validation delay; không thêm task Comment vì backend chưa hỗ trợ.
- Cookie mặc định collapse và che nội dung; giữ chỉnh sửa textarea, check theo batch, xóa cookie die; có Hiện/Ẩn, Copy, Check/Xóa từng cookie. Copy dùng clipboard.js hiện có. Không log dữ liệu cookie.
- Editor Instagram nuôi chuyển full-width. Giữ cooldown, tạo/chọn/đổi tên/active/xóa kịch bản, generator ngẫu nhiên và field actions.newfeed/reels/story. Generator chuyển vào modal; tạo ngẫu nhiên và xóa vẫn lưu ngay như trước. Chỉnh sửa thông thường lưu qua thanh lưu chung.
- Thanh lưu xuất hiện khi có nháp và có Hủy/Lưu thay đổi. Instagram rebase từng module thành công; module lỗi giữ nháp. Các tab cũ cũng có tracking nháp và gọi lại đúng hàm save từng module. FacebookNurtureSettings chỉ thêm snapshot/ref để tham gia thanh lưu, giữ các hoạt động và generator hiện có.
- Các editor đã mở được giữ mounted khi đổi tab để không mất nháp; có beforeunload khi còn thay đổi. Reset hiện có vẫn còn, giữ phạm vi reset nhiều nền tảng của hàm cũ.
- Kiểm tra đạt: npm run build --prefix frontend, git diff --check, Chrome headless dùng API local thật qua scripts/test-settings-ui.cjs. Đã kiểm tra layout desktop 1920/laptop 1366/mobile emulation 390, không tràn ngang nội dung trang, toggle disable, validation Min/Max, dirty/discard ở bốn tab và kịch bản, modal Escape. Không ghi setting vào DB khi chạy smoke test; chưa thử save thành công/generator submit/delete trên DB thật trong lượt này.
- Build còn cảnh báo bundle >500 kB như trước; chưa thay đổi bundling. Console chức năng sạch; favicon.ico 404 không thuộc Settings được loại riêng trong smoke test.
- Ảnh render: artifacts/settings-instagram-desktop.png, settings-instagram-laptop.png, settings-instagram-mobile.png, settings-instagram-tasks.png, settings-instagram-nurture.png. Cookie trong ảnh vẫn được che.
- Smoke test cần backend/frontend local chạy ở 3000/5173, Chrome và chromedriver cache; dùng ADMIN_USER/ADMIN_PASS từ backend/.env để đăng nhập thật, không in credential/token. Chưa commit/push.


## 13. Hoàn thiện Settings hai tầng tab thật (2026-10-05)

Phần này thay thế mô tả UI/kiểm thử ở mục 12. Chỉ frontend, script kiểm thử và tài liệu được sửa trong lượt này; diff backend/API service còn lại thuộc lượt Instagram trước, không sửa thêm backend.

- Bốn platform dùng PlatformTabs. Mỗi platform có SettingsSubTabs và SettingsTabPanel thực sự, chỉ một view hiển thị. Không dùng anchor, hash, scrollIntoView hay scrollTo để chuyển tab. View được giữ mounted để giữ nháp, scenario selection và trạng thái editor; đổi platform/sub-tab không cảnh báo mất nháp. Nút Chỉnh sửa trong Tổng quan chuyển view trực tiếp. Tổng quan chỉ chứa summary.
- TikTok: Tổng quan, Account (Chrome kháng + Job), Điều kiện (min_age_days/min_videos), API máy (admin). API máy quản lý **tên cột key**, không phải giá trị secret; thêm/xóa vẫn lưu ngay. Chrome limit chỉ admin sửa; Job limit user được sửa của mình.
- Facebook: Tổng quan, Account, Reg Page (wait/reset), Nuôi Facebook (reset), Page Job (reset), Kịch bản nuôi. Admin dùng bảng limit theo user; user xem limit của mình. Editor full-width dùng đúng actions newfeed/reels/like_newfeed/friend_request/accept_friend/join_groups/like_pages. Giữ generator_config, min/max số lượng, danh sách links và page_uids, quy tắc validate và thuật toán tạo ngẫu nhiên. Generator vào modal, setup và tạo/xóa vẫn dùng API hiện có.
- Instagram: Tổng quan, Account, Reg IG, Nhiệm vụ, Điều kiện, Cookie, Kịch bản nuôi. Cookie ở tab riêng không cần collapse; mặc định che, giữ Hiện/Ẩn/Copy/Check/Xóa, check batch/xóa die và textarea chỉnh sửa. Job chỉ Like/Follow; không thêm Comment/task mới. Giữ reg, min_login_days, delay và cooldown/actions scenario.
- Cài đặt chung: Tổng quan, Điều phối tác vụ, Proxy, Tham số check. Dispatcher giữ sáu task và field priority/enabled/lock_timeout_minutes/max_retry. Proxy che mặc định, có hiện/chỉnh sửa và copy. Concurrency lưu backend cùng proxy; delayMs/batchSize tiếp tục localStorage cl_settings, không thêm field backend.
- Shared: SettingsPrimitives (Card/NumberField/Toggle/Modal/SaveBar), SettingsFields (MinMaxField/LimitSettings/TextField/SelectField/SecretTextEditor), SettingsSubTabs (tab/panel/summary), ScenarioSettings (ScenarioSelector/ScenarioActivity), PlatformTabs. Các boolean dùng switch; các khoảng Min/Max dùng một component, OFF disable input. Các platform dùng cùng CSS scope settings-page, trạng thái loading/error/empty và Toast hiện có.
- SettingsDataProvider cache promise các GET trong phiên trang để tránh gọi trùng; invalidate sau mutation thành công vì workflow và nurture có tác động chéo. Không thêm hoặc đổi endpoint/payload/JSON contract. Trang parent chỉ đọc các resource cần thiết; Instagram lazy đọc resource riêng. Retry giữ GET thành công trong cache, thử lại request lỗi.
- Nháp parent được chụp sau tải đầy đủ, trước khi cho chỉnh; lỗi load có nút retry. Thanh lưu và Hủy chỉ áp dụng platform đang mở; nháp platform khác giữ nguyên và có chấm báo trên tab. Instagram commit từng module, các platform còn lại rebase resource/row thành công. API save lỗi giữ nháp. Reset hiện có vẫn giữ phạm vi nhiều nền tảng, có confirm; không kiểm thử reset trên dữ liệu thật.
- Kiểm thử đạt: npm --prefix frontend run build (còn cảnh báo bundle >500 kB đã có), git diff --check; node scripts/test-settings-tabs.cjs (test-settings-ui.cjs chuyển sang dùng bộ này). Chrome headless đăng nhập/API thật localhost 3000/5173, không mock API: Instagram limit, TikTok Chrome limit, Facebook workflow, Common dispatcher và local delay đều edit/save/reload/khôi phục giá trị ban đầu. Đã kiểm tra draft qua cả hai tầng tab, proxy che mặc định, lỗi save khi browser offline vẫn giữ nháp và retry thành công, mỗi GET settings một lần khi mở/chuyển/revisit tab, một view/sub-tab, modal Escape và draft scenario ở FB/IG.
- Responsive đạt cho tất cả view ở 1920x1080, 1366x768 và mobile emulation 390x844, không overflow toàn trang. Không lỗi console chức năng; lỗi offline chủ động và favicon.ico được loại riêng. Ảnh hiện tại: artifacts/settings-{tiktok,facebook,instagram,common}-{1920,1366,390}.png; cookie/proxy vẫn được che. Các ảnh trước mục 12 là phiên UI cũ.
- Script đọc ADMIN_USER/ADMIN_PASS từ backend/.env nhưng không in credential/token/cookie/proxy. Chỉ thử lưu cấu hình có thể khôi phục; không chạy seed, cấp account/device task hay đổi DB schema. Chưa thử submit generator/delete/check cookie live trên dịch vụ ngoài, chưa kiểm thử bằng phiên user thường riêng (không có thông tin đăng nhập được cung cấp). Không commit/push.


## 14. Refactor Dashboard vận hành (2026-10-05)

- Chỉ sửa frontend/src/pages/Dashboard.jsx, thêm frontend/src/styles/dashboard.css và scripts/test-dashboard-ui.cjs. Backend, services/api.js, database và JSON contract không thay đổi trong lượt này.
- Nguồn duy nhất vẫn dashboardApi.getSummary() → GET /api/dashboard/summary; polling vẫn setInterval 15_000. Guard inFlight tránh request song song khi bấm Làm mới trong lúc polling. Chỉ lần tải đầu có loading; các refresh tiếp theo cập nhật snapshot, giữ search/filter/device detail. Khi lỗi, giữ snapshot thành công gần nhất và hiển thị trạng thái chưa cập nhật được; không tự thêm timeout connection mới.
- Header Live/thời điểm cập nhật, compact health strip dùng summary.online/running/idle/offline và các task.errors/scheduler.last_error. Cảnh báo Offline lọc frontend và focus vùng thiết bị. Các cảnh báo task/scheduler và KPI/task giữ đường dẫn cũ (không giả định trang đích có filter lỗi).
- Năm KPI có hierarchy số chính/nhãn/phụ, accent ở icon, cùng theme Settings. Error vẫn tổng task.errors của sáu luồng, không cộng account.errors/offline để tránh thay nghiệp vụ đếm. Workload giữ ready/running/errors chính xác và badge thống nhất; task có lỗi có chấm indicator.
- Device monitor giữ Facebook/Instagram account count, current_task/current_uid, runtime chỉ Running, next_available và last_seen. Bỏ nhãn Last Task/Last Account lặp trong từng dòng. Lọc status/task và tìm tên/ID/account/task đều từ snapshot, không request mỗi ký tự; có clear/reset/empty state. Drawer chi tiết dùng SettingsModal native dialog với CSS drawer, Escape/focus, cập nhật theo device_id từ snapshot mới và không đóng khi refresh.
- API devices.rows hiện giới hạn 100; UI ghi rõ khi summary.total lớn hơn số đã tải, filter/search chỉ trên snapshot này. next_available chỉ task_type/count, không có timestamp cooldown nên hiển thị Sẵn sàng + loại/số task, không tạo thời gian giả. Không thêm chart, API hoặc severity backend.
- Kiểm thử Chrome/API thật read-only qua node scripts/test-dashboard-ui.cjs: số chính năm KPI và ready/running/errors sáu task khớp summary; device count/status, search/empty/clear, status và task filter, alert Offline, đường dẫn card cũ; polling 15 giây giữ search và drawer; manual refresh giữ filter; một summary request lúc tải ban đầu; console chức năng sạch. Không ghi DB/cấp task/heartbeat/seed. Snapshot local hiện chỉ có Offline nên không kiểm thử trực tiếp máy Running/Idle hay cooldown timestamp chưa tồn tại. Các formatter/runtime/current fields giữ từ implementation cũ.
- Responsive đạt 1920/1366/390, toàn trang không overflow ngang; Device table có container cuộn ngang để giữ dữ liệu. Ảnh artifacts/dashboard-1920.png, dashboard-1366.png, dashboard-390.png. Build frontend đạt, vẫn cảnh báo bundle lớn từ trước; git diff --check đạt. Chưa commit/push.

## 15. Bàn giao GitHub (2026-10-05)

- Người dùng yêu cầu commit/push các thay đổi đã hoàn thiện ở các mục 11–14 lên origin/main.
- Kiểm tra trước commit: frontend build và testInstagramJobSettingsMock.js đạt; git diff --check đạt. UI Settings/Dashboard đã kiểm thử API/Chrome thật ở các lượt trên.
- artifacts/ được giữ local và ignore để không upload ảnh chứa snapshot dữ liệu vận hành. Code, tài liệu và script kiểm thử được đưa vào commit; không có .env, log hoặc build output.


## Task Management hiện hành — 2026-10-06 (v2)

Yêu cầu mới **bỏ mô hình admin phân task cho user**. Phần này và [TASK_REGISTRY.md](TASK_REGISTRY.md) thay thế hướng dẫn Task Registry v1 trước đó.

- Registry global: `task_registry`, thêm default_priority. Cấu hình cá nhân: `user_task_settings` (enabled/priority theo user). Mọi account thấy mọi task active, thiếu row mặc định OFF/default_priority; task mới default 50, không tạo hàng loạt row cho user.
- Admin chỉ quản lý loại task tồn tại/metadata/System Enabled/archive. Admin cũng tự chỉnh dispatcher của mình như user. Không user selector, phân quyền, assign/revoke, sửa priority/Enabled của người khác.
- User và admin đều tự ON/OFF và chỉnh priority; API PUT `/task-registry/mine` lấy owner từ JWT, ignore user_id/target_user_id body. Registry CRUD chỉ admin, kiểm tra role/active DB. API `/task-registry/users` và `/users/:id/tasks` đã loại bỏ (404).
- Timeout/retry vốn theo owner trong AppSetting, giữ scope và cho current user sửa. Enabled/Priority runtime từ user_task_settings, JSON task_dispatcher cũ giữ làm legacy/config backup.
- File chính: services/taskRegistryService.js, taskRegistryPolicy.js, controllers/taskRegistryController.js, routes/taskRegistry.js, middleware/taskAcquirePermission.js; frontend TaskRegistrySettings.jsx, taskRegistryApi.js, dashboardTaskRegistry.js, CommonSettingsPanel.jsx.
- Dispatcher dùng Registry + cấu hình cá nhân + System/User Enabled + capabilities/handler, priority DESC. Giữ transaction/shared lock, chống cấp trùng, retry/cooldown/account conditions. Sáu API cấp task legacy cũng chặn OFF. Report/release lượt đã chạy còn xử lý sau OFF/archive.
- Dashboard dùng Registry chung; user theo owner, admin tổng quan hệ thống. Task OFF vẫn có dòng statistics; task mới chưa có job zero. Không hard-code thêm row frontend. Không tự sinh executor: muốn chạy loại mới cần handler/device/statistics thật.
- Migration `backend/scripts/migrateTaskRegistry.js --apply` đã áp dụng v2 thành công trên DB local: backup gitignored artifacts/task-settings-backup-*.json, copy nguyên Enabled/Priority từ user_tasks cũ nếu có; cấu hình/users/history được đối chiếu giữ nguyên. Marker `task_settings_v2=complete`. Bảng user_tasks cũ chỉ giữ để chuyển đổi/đối chiếu, không dùng runtime; môi trường mới không tạo bảng permission. Không seed/drop/DDL startup.
- Kiểm tra đạt: build + syntax + policy + Instagram mock; integration fresh và `--ui --legacy` (upgrade/configs/global OFF/self priority/owner spoof/removed endpoints/one SaveBar/mobile); device cùng id hai owner đúng account/priority; priority giữa Page/Instagram READY; dispatcher race/retry/timeout/preview/OFF/report/archive/history; Dashboard và tất cả Settings tabs qua API thật (responsive/offline/nháp/save-restore).
- Chỉ fixture DB tạm có task thử. Không chạy standalone testTaskDispatcher.js trên DB đang dùng. Môi trường khác phải chạy migration chủ động theo TASK_REGISTRY.md. Phần này được đưa vào lượt bàn giao GitHub cùng Dashboard status theo yêu cầu người dùng.

## Đồng bộ Dashboard status — 2026-10-06

- Công việc realtime thêm cột Trạng thái dạng pill Đang bật/Đang tắt, nguồn `task_registry.user_enabled` của user đang đăng nhập; task chưa cấu hình OFF. Dashboard admin lấy `registry.list(owner)` cho metadata/status nhưng READY/RUNNING/ERROR giữ thống kê toàn hệ thống.
- Dashboard là monitor, không toggle; OFF vẫn hiện row/số liệu, chỉ metadata mờ nhẹ. Status không phụ thuộc ERROR; giữ chỉ báo lỗi cạnh tên. Tooltip phân biệt personal ON với System OFF.
- Giữ Registry order, không thêm priority column, không sửa thống kê hoặc schema/API endpoint. Polling 15s cập nhật state mới, giữ search/detail và không reload.
- File liên quan: backend services/dashboardService.js; frontend pages/Dashboard.jsx, services/dashboardTaskRegistry.js, styles/dashboard.css. Test cập nhật testTaskRegistryIntegration.js và test-dashboard-ui.cjs.
- Đã đạt build/syntax/diff và Chrome + API thật trên DB tạm đủ sáu ca yêu cầu: ON/OFF, OFF+READY26, ON+ERROR6, task mới OFF/zero rồi user ON sau refresh; polling giữ search/window marker, một bảng read-only, responsive. Không sửa DB đang dùng trong lượt này.


## Instagram nurture: Theo dõi chéo Username — 2026-10-06

- Mở rộng JSON AppSetting `instagram_nurture`, mỗi scenario có `actions.cross_follow = { enabled, min, max, usernames: [] }`; không thêm bảng, migration hay endpoint. Kịch bản cũ thiếu field mặc định OFF/0/0/[]; OFF giữ list và min/max đã nhập.
- Đã đối chiếu Facebook: hoạt động danh sách hiện tại là `join_groups.links` và `like_pages.page_uids`, không có activity cross_follow riêng. Tách nguyên logic count/targets vào `backend/src/utils/nurtureActionUtils.js`, dùng chung editor `ScenarioTargetActivity` trong ScenarioSettings.jsx; giữ cách lưu/response và hành vi Facebook.
- Instagram editor thêm card full width, Min/Max theo số lượng username, textarea mỗi dòng một username; trim/bỏ @/bỏ dòng rỗng/duplicate không phân biệt hoa thường khi lưu, hiển thị số hợp lệ. Frontend và backend chặn cấu hình sai: boolean, số nguyên không âm Min<=Max; ON cần list và Max<=số username; tối đa 200 mục, username chỉ chữ/số/chấm/gạch dưới, tối đa 255 ký tự. OFF disable inputs và giữ dữ liệu. Tạo mới/tạo nhanh mặc định cross_follow OFF/0/0/[]; summary chỉ liệt kê hoạt động ON. Tổng thời gian vẫn chỉ Newfeed/Reels/Story.
- GET/PUT `/api/settings/instagram-nurture` giữ JWT và owner từ phiên đăng nhập. POST `/api/instagram/nurture/get-account` trả field trong `data.scenario.actions.cross_follow`; POST `/api/device/next-task` trả trong `task.data.scenario.actions.cross_follow`. Device tự random số lượng giữa Min/Max, server không thực hiện follow.
- Khi tiếp tục NUOI_INSTAGRAM trong dispatcher, cập nhật scenario cùng id từ cấu hình mới nhất của owner vào payload, giữ nguyên task id/account/khóa; legacy get-account cũng đọc cấu hình mới mỗi lần. Nếu scenario đã bị xóa, dispatcher giữ snapshot hiện hành như trước.
- Kiểm thử đạt: `npm run build` frontend (cảnh báo chunk lớn hiện có); `node backend/scripts/testInstagramCrossFollowIntegration.js --ui` đủ 9 nhóm ca yêu cầu qua MySQL DB dùng một lần + Chrome/API thật, có kiểm tra owner spoof, lưu/đọc lại, API legacy/dispatcher/resume, thay list đang chạy, OFF retains, generator, inline validation, summary, full width/mobile và Facebook. Chạy `node backend/scripts/testTaskRegistryIntegration.js` đạt hồi quy permissions/owner/race/chống cấp trùng/retry/timeout/report/registry/dashboard. Mock Instagram chạy với `db.query=async()=>[]` trước require test để cô lập Registry, đạt. Không seed hoặc thay dữ liệu DB đang dùng.
- Test mới: `backend/scripts/testInstagramCrossFollowIntegration.js`; chạy từ backend bằng `npm run test:instagram-cross-follow` (cần MySQL CREATE/DROP cho DB test riêng, Chrome/driver như test Registry). DB test đặt tên cố định có timestamp/random và kiểm tra khác DB thật; cleanup chỉ xóa DB test do script tạo. Chưa commit/push các thay đổi của lượt này. Tool iPhone/AutoTouch ngoài repo cần đọc field mới và thực hiện activity.

## Shared Cross Target Engine — 2026-10-06

- Hoàn thiện tương tác chéo bằng `services/crossTargetService.js`, adapters facebookFriendSuggestionService.js/instagramCrossTargetService.js. Ba model/bảng mới CrossTargetCycle/Batch/History: unique scope, request id và source+target+cycle; transaction khóa account nguồn theo owner, batch/history ISSUED ngay khi cấp. Giữ SUCCESS/FAILED trong history, không tự retry target FAILED. Target normalize IG lowercase/trim/bỏ @; FB giữ UID.
- Scope IG gồm owner/platform/action/internal account id/scenario; FB giữ scope source xuyên scenario như history cũ. Facebook pool vẫn account job đủ login/live của cùng owner, loại source; không thêm activity/danh sách UID UI mới. History `facebook_friend_suggestions` giữ nguyên và nhập idempotent vào cycle 1, legacy run_id trở thành batch request_id. Tách engine chung, không còn engine anti-duplicate Facebook riêng.
- Available=current pool-current cycle history. Thêm/xóa target hoặc đổi Min/Max không reset; hết pool mới tăng cycle ở request mới kế tiếp, trả đuôi thiếu số lượng mà không trộn cycle. Empty pool/count và OFF không tăng cycle. History/cycle không phụ thuộc device; ổn định source internal id và owner.
- API POST `/api/{facebook|instagram}/nurture/targets` nhận source_account_id, scenario_id, request_id; IG có count do Device random, nếu bỏ reserve tối đa Max. Facebook giữ random count server như trước. POST `/nurture/targets/report` nhận results target/status SUCCESS/FAILED; chỉ cập nhật target thuộc batch/owner/source, report lặp cùng status OK, đổi status đã chốt 409. API cấp có guard task Enabled; report lượt đang chạy vẫn được chấp nhận sau OFF.
- API nuôi/dispatcher/random Facebook tích hợp engine, giữ field cũ Facebook. Instagram device response usernames/targets là batch, cấu hình settings vẫn là full pool. Thêm request_id/cycle_id và requested/available/issued_count. Khi không có request_id, dùng nurture_run_id để retry cùng lượt nhận batch cũ; muốn batch mới/cập nhật pool phải gửi request_id mới. Quy tắc này thay hành vi đọc list mới ngay trên cùng batch ở mục trước. Cả FB/IG dispatcher resume giữ task/account/lock và lấy lại scenario cùng id; batch cùng request không đổi.
- Tài liệu request/response, responsibilities và migration: CROSS_TARGETS.md. Migration `backend/scripts/migrateCrossTargets.js --apply` đã áp dụng thành công vào DB local, chỉ sync ba model mới/nhập old history, không force/alter/seed hoặc sửa history cũ. Môi trường khác chạy migration chủ động; import fallback theo source cũng idempotent.
- Đạt: testCrossTargetEngineIntegration.js (MySQL DB riêng, distinct/same-key races, cycle/tail, retries, pool edit, FAILED, owner/source/scenario/device isolation, DB uniqueness, migration hai lần, Node process mới, API FB/IG/dispatcher thật); testInstagramCrossFollowIntegration.js --ui (validation/OFF/generator/save/reload/mobile/Facebook UI); testTaskRegistryIntegration.js (locking/race/no duplicate/retry/report/timeout/owner/Registry/Dashboard); frontend build và syntax/diff. Các dữ liệu test chỉ trong DB tạm được xóa sau test.
- Chưa commit/push lượt này. Tool iPhone ngoài repo cần đọc batch và gửi request_id ổn định khi retry; report target riêng tùy chọn. Không thêm trang history/progress hoặc reset thủ công ngoài yêu cầu.

## Stateless TOTP API — 2026-10-06

- POST `/api/totp/generate` nhận body `{secret}`, response phẳng `{success:true,code,expires_in}`; secret sai/thiếu/rỗng 400 `{success:false,error:"INVALID_SECRET"}`. SHA1/6 số/30 giây, chờ qua window nếu còn <=3 giây. Trim/uppercase/validate Base32 canonical (padding optional), tối đa 512 ký tự normalize/body 2KB.
- Auth reuse apiKeyAuth/x-api-key: chỉ xác thực User active; không lookup account, không liên kết owner của secret, không persist secret/code/history/schema. Rate limit riêng 60 request/phút/IP, no-store. Production HTTPS; không truyền secret trong query.
- Common errorHandler có log req.body nên route TOTP được mount trong app.js trước global parsers/Morgan, dùng parser/error handler riêng, không log URL/body/OTP/secret hay exception chi tiết. Không sửa auth/logging của các API khác.
- Tách nguyên thuật toán TOTP hiện có từ instagramLoginUtils.js vào utils/totp.js; Instagram tiếp tục import/export createTotp như trước. Service mới totpService.js thêm validation và xử lý thời gian, controller/route mới totpController.js/routes/totp.js. Không thêm dependency crypto/TOTP vì tái sử dụng helper sẵn có, đã đối chiếu RFC vectors.
- AutoTouch JS helper `tools/autotouch/totp.js` cài `API._GetTOTP(secret)` bằng exec/curl POST/safeParse, trả string 6 số hoặc 0, giữ leading zero. Nhận getter URL/key từ cấu hình tool, không hardcode. User đã cung cấp lời gọi exec curl 2fa.live hiện tại; chưa có tên biến URL/API key/safeParse trong repo nên wiring được minh họa rõ trong TOTP_API.md. Không cần endpoint có account_id của đề xuất trước.
- Đã đạt testTotp.js (no DB; RFC, A/B/C, same/next window, validation, near-expiry, auth, JSON/size/error, rate limit, capture log không lộ secret/OTP, client shell escaping/parse và curl HTTP thật; timer chờ window mới trên server test con). Tài liệu TOTP_API.md có request/response và code AutoTouch thay lời gọi hiện tại. Chưa chạy trực tiếp trên iPhone, chưa commit/push lượt này.

- Kiểm tra cuối TOTP: `npm run test:totp --prefix backend` đạt cả chờ window bằng timer/curl thật; `npm run test:instagram-check-live-mock --prefix backend` đạt 7 ca hồi quy; syntax các file mới/helper và git diff --check đạt. Không chạy build frontend vì lượt này không sửa frontend, không khởi động server.js hoặc đổi DB.

## EmailTick provider — 2026-10-07

- Thêm integration backend/VPS EmailTick; phần EmailOtpOrder/Hotmail cũ chỉ quản lý dữ liệu thiết bị báo về, chưa có abstraction provider upstream nên không sửa chúng. Config tập trung `config/emailtick.js`, env example EMAILTICK_BASE_URL/TIMEOUT_MS/RETRY_COUNT/RETRY_DELAY_MS/ALLOWED_TYPES/RANDOM_TYPES.
- Provider `services/emailTickService.js`: resolver number/CSV/array/random+random_count unique, allowed list từ config; get-mailbox → validate JSON/email/code, activate-email, get-emails, timeout/retry bounded cho network/5xx, kiểm tra content-type/schema/Cloudflare trước parse, không follow redirect hoặc bypass challenge. OTP chỉ regex 6 số string từ subject sau lọc sender/provider (instagram mặc định, facebook), time/newest/message history; không nhầm provider code với OTP.
- Model EmailTickMailbox/bảng emailtick_mailboxes: public UUID unique, owner, email/mailbox_code server-only/types JSON/status/history high-water và IDs cùng timestamp. Service emailTickMailboxService.js activate xong mới ACTIVE/trả success; fail activate ghi ERROR server-side. Provider INVALID_MAILBOX đánh dấu EXPIRED. GET inbox bên ngoài transaction, claim OTP khóa row theo owner và kiểm tra lại history trước update nên không cấp cùng message cho hai request đồng thời. Không trả OTP cũ, giữ history qua restart.
- API có auth thiết bị x-api-key/apiLimiter: POST `/api/emailtick/new` nhận types/random_count, trả phẳng success/mailbox_id/email/types; GET `/api/emailtick/code?mailbox_id=<uuid>&provider=instagram` lookup owner server-side, trả WAITING+null hoặc RECEIVED+code. requested_at Unix seconds optional, không long-poll ở VPS. Client không truyền mailbox_code/email. Cấu trúc parser/controller/errors không lộ provider credential/raw HTML. App mount EmailTick trước global logging/parsers giống TOTP; model scope ẩn code, CRUD logging:false để tránh SQL debug log lộ code; structured logs whitelist operation/types/id/duration/status.
- AutoTouch `tools/autotouch/emailtick.js` cài API._EmailTick_New(types[,randomCount]) và _EmailTick_GetCode(mailboxId[,provider]), dùng exec/curl/safeParse/getters cấu hình VPS/sleep hiện tại. Không gọi trực tiếp EmailTick; GET tối đa 12 lần/sleep 5s/deadline 60s, lỗi/timeouts trả 0, code string giữ zero. Hướng dẫn API/config/migration/client: EMAILTICK.md.
- Migration `backend/scripts/migrateEmailTick.js --apply` đã áp dụng thành công vào DB local, chỉ thêm bảng mailbox, không force/alter/seed hoặc sửa bảng cũ. Môi trường VPS khác chạy `npm run migrate:emailtick --prefix backend` và restart backend sau deploy. Không lưu mailbox test vào DB đang dùng.
- Kiểm tra nhà cung cấp thật: GET read-only homepage từ máy phát triển ngày 2026-10-07 nhận HTTP403/text-html/Cloudflare challenge. Không tạo mailbox thật, không bypass hoặc spam retry. Chưa xác minh VPS production có bị chặn hay không; runtime trả EMAILTICK_CLOUDFLARE_CHALLENGE nếu gặp challenge. End-to-end dùng provider giả đúng contract được cung cấp, không xác nhận contract mới nhất bằng request tạo thật.
- Đạt testEmailTick.js (resolver/filter/zero/schema/retry/Cloudflare/AutoTouch), testEmailTickIntegration.js (HTTP provider giả→activate→MySQL riêng→VPS/curl thật, old OTP/concurrency/ties/persistence/migration/owner/auth/hidden credentials/logs). Test/migration npm scripts mới trong backend/package.json. Chưa commit/push lượt này; không thêm UI/provider setting page ngoài yêu cầu, chưa chạy trực tiếp trên iPhone.

- Final verification: npm run test:emailtick and npm run test:totp passed on 2026-10-07; includes expired-mailbox handling and config errors. Syntax checks and git diff --check passed. No frontend changes; no frontend build required.

## EmailTick without cookies - 2026-10-07

- Shared headers for get-mailbox/activate-email/get-emails now include browser User-Agent and Accept application/json, text/plain, */*, with Origin/Referer/Content-Type. No Cookie is sent or stored.
- Live empty inbox returns exactly {success:true} without emails; normalize this response to [] (VPS WAITING). Malformed emails still fail validation.
- Live check from development machine passed create, activate and get-emails without cookies. Inbox was empty; real OTP receipt and production VPS remain unverified. No real mailbox credentials were logged or stored in the application database.
- npm run test:emailtick --prefix backend passed unit/integration, including no-Cookie headers and empty-inbox response. git diff --check passed. These changes are not committed/pushed yet.

## Ghost Inbox provider + API mail chung — 2026-10-07

- Đã discovery bằng Chrome/Selenium bình thường và replay HTTP: alias do server tạo ở GET /, Shuffle ?shuffle=1, confirm-gmail-alias?email redirect inbox; inbox dùng POST /livewire/update với CSRF, cookie riêng và signed snapshot không chỉnh sửa. Message có id, sender_name/email, subject, timestamp ISO, content HTML, attachments. Mở thư GET /message/{id}; body đã có trong inbox nên không cần request mở thư cho OTP. Poll frontend khoảng 10 giây. Báo cáo GHOSTINBOX_DISCOVERY.md ghi trước implementation, không đoán API/bypass.
- GhostInboxProvider cô lập contract internal/undocumented, normalize tuple Livewire, timeout/retry bounded network/5xx, challenge/expiry/schema/429 rõ ràng. Cookie/session/CSRF/snapshot riêng từng mailbox, không expose AutoTouch; Retry-After persist. Bảng mới ghostinbox_mailboxes, giữ emailtick_mailboxes và endpoint cũ. Migration migrateGhostInbox.js --apply đã chạy local, chỉ sync bảng mới, không force/alter/seed; VPS cần migrate + restart sau deploy.
- API mới POST /api/mail/new {provider:GHOSTINBOX|EMAILTICK,types?,random_count?}, GET /api/mail/code?mailbox_id=...&service=INSTAGRAM|FACEBOOK|GENERIC&requested_at=...; reuse apiKeyAuth, owner isolation, parsing/error/logging riêng trước Morgan. Provider lấy từ record server; public UUID, không token/cookie/session trả về.
- mailOtpService dùng chung normalized selector và claim: giữ code string/zero, subject ưu tiên body/html (Ghost), EmailTick giữ subject-only. Ghost persist toàn bộ processed ID + high-water và khóa row cả session refresh/claim, không cấp trùng/race; EmailTick reuse claim nhưng giữ lịch sử tie timestamp như trước.
- AutoTouch emailtick.js vẫn standalone/chữ ký cũ và export core polling cho mail.js. API._Mail_New(provider[,types,randomCount]), API._Mail_GetOTP(id[,service]); Ghost upstream tối thiểu 10 giây/client 6 request/60 giây; EmailTick helper cũ 5 giây/12 request. MAIL_API.md có deploy/config/API/examples/wiring. Không thêm UI, random-provider hoặc health feature optional.
- Kiểm thử thật: create/inbox Ghost thành công; đọc thư test người dùng gửi bằng GENERIC, normalize ISO/HTML, string leading zero và processed ID skip đạt. Chưa test thư Instagram production, VPS/iPhone hoặc expiry/429 thực tế; trạng thái expiry là defensive classification. Không ghi dữ liệu mailbox thật vào docs/log/source, script discovery tạm đã xóa.
- test:mail đạt unit/HTTP/MySQL DB riêng/AutoTouch curl process con, race/dedupe/timestamp-change/session/owner/auth/expiry/429/challenge/migration; test:emailtick và test:totp hồi quy đạt. Không frontend changes/build; backend không có lint/typecheck/build script. Chưa commit/push lượt này.
- Kiểm tra cuối: helper standalone không CommonJS/syntax/git diff --check đạt; mỗi Ghost poll bình thường chỉ một POST Livewire, tối thiểu 10 giây, reuse signed snapshot; redirect session-expired và HTML sai schema có test riêng. AutoTouch curl thật đạt cả WAITING → RECEIVED. Danh sách file đầy đủ trong MAIL_API.md.

## Task completion chỉ-ID, dữ liệu qua API cũ — 2026-10-07

- Theo yêu cầu user, POST /api/device/task/report chỉ cập nhật DeviceTaskRun/DashboardDevice. Body tối thiểu {task_id}; status mặc định SUCCESS, device_id lấy từ run khi thiếu. Giữ x-api-key và owner isolation; nếu device_id có truyền thì kiểm tra đúng device/locked_by. Không gọi reportLegacyTask/releaseLegacyRegInstagram hoặc markInvalidAccount; result không dùng/lưu nữa.
- API nghiệp vụ cũ tiếp tục cập nhật account/claim/lock/statistics. Tool nên gửi data qua API cũ và kiểm tra thành công trước khi báo hoàn thành task, rồi lấy task tiếp. Báo task không kiểm tra thay cho kết quả nghiệp vụ, không reset/release domain lock. FAILED/error_code/message optional giữ metadata retry nhưng không tự cập nhật account.
- Một transaction READ COMMITTED, khóa device trước task giống dispatcher, chốt status/completed_at và idle device chỉ khi không có task khác đang chạy. Repeat cùng trạng thái already_reported, conflict trạng thái cuối hoặc REPORTING trả 409; không đổi FAILED/RELEASED thành SUCCESS. Giữ response shape task/retryable/data:null.
- File: controllers/deviceController.js, services/taskReportService.js; testTaskReportOnly.js mới, testTaskDispatcher.js mô phỏng API cũ trước task report, tài liệu TASK_REPORT_API.md. Không schema/UI/endpoint nghiệp vụ khác thay đổi.
- Đạt HTTP/MySQL DB riêng testTaskReportOnly: cả sáu task ID-only, zero domain writes/legacy calls, old API then complete, owner/device/auth, strict ID, idempotency/race, conflicts/failure metadata, preserve newer device task. Hồi quy testTaskRegistryIntegration đạt Registry/Dispatcher/Dashboard/priority/OFF/report in-flight/retry/timeout trên DB tạm. Không chạy seed hoặc standalone dispatcher test trên DB thật. Chưa commit/push/deploy lượt này.

## Instagram Follow chéo Account và tạo nhanh — 2026-10-07

- Activity mới `actions.cross_account_follow = {enabled,min,max}` (số nguyên 0 <= Min <= Max <= 200), thiếu field mặc định OFF/0/0. Giữ `cross_follow` là danh sách username thủ công; không thêm Like vì scenario Instagram hiện không có activity Like. Tổng thời gian chỉ Newfeed/Reels/Story.
- Instagram thêm `generator_config.actions` trong JSON AppSetting hiện có. Modal có ON/OFF cho tất cả activity, danh sách username cho cross_follow, Min/Max cho hai loại follow; tạo/lưu N scenario đầy đủ setup. Count Min/Max random theo đúng quy ước Facebook (random Min trong khoảng đã nhập, rồi random Max từ Min đến Max cấu hình). Time range phân bổ theo tỷ trọng ngẫu nhiên chỉ cho activity ON; tổng Min/Max vẫn là range người dùng nhập như Facebook. Thiếu generator_config dùng mặc định time ON, hai follow OFF. Không đổi logic generator Facebook.
- NumberField/MinMaxField dùng vùng value flex riêng, unit không co/đè số, đủ chỗ 999 và spinner; card hẹp xếp Min/Max dọc. Hai modal dùng class settings-scenario-modal, hai card/row desktop và một card/row mobile, header/footer ngoài vùng body scroll.
- Engine account follow dùng action_type ACCOUNT_CROSS_FOLLOW, tái sử dụng bảng CrossTargetCycle/Batch/History hiện có. Pool query hiện tại theo owner auth, status LOGIN_THANH_CONG/DANG_LAM/DA_CHAY_XONG (enum thật), trashed_at null, cả reg/job; dùng uid làm username, normalize/bỏ @/lowercase, bỏ rỗng/sai định dạng/dài hơn 30 ký tự, loại source internal id và cùng username, dedupe username. Không dùng device làm history key. Giữ scope scenario như engine Instagram cũ. Pool mới được query cho mỗi request_id mới; retry cùng request_id giữ nguyên batch, cycle/tail/empty/race giữ convention cũ. Hai activity reserve trong cùng transaction khi API nuôi cấp scenario.
- POST /api/instagram/nurture/targets và /targets/report thêm body `action:"cross_account_follow"`; bỏ action giữ luồng cross_follow cũ. Request/report schema khác giữ nguyên. API nuôi/next-task/resume trả actions.cross_account_follow với config, configured_min/max và batch targets/usernames/request_id/cycle_id; optional account_count dùng riêng cho follow Account, count vẫn dành follow Username. Không đổi API mail/task report.
- Không thêm bảng/cột/enum/migration, không sửa DB đang dùng hoặc seed. Môi trường đã có engine cross-target không cần migration mới; nếu chưa có bảng engine phải chạy migration cũ theo CROSS_TARGETS.md. Tool iPhone ngoài repo cần đọc activity mới, thực hiện follow và báo target với action mới.
- Kiểm tra đạt: testInstagramCrossFollowIntegration.js --ui mở rộng (MySQL DB riêng + API + Chrome): pool status/owner/source/username/kind, race/cycle/empty/phone move/report, legacy/dispatcher, 10 scenario IG có setup đầy đủ lưu/refresh/mở từng scenario, Facebook tạo 10 scenario giữ toggle/count/group/Page/time, input 0/1/5/10/20/100/999, geometry unit không overlap/overflow desktop/mobile. testCrossTargetEngineIntegration.js, testTaskRegistryIntegration.js, test:mail, test:emailtick đạt. Frontend build đạt, còn cảnh báo chunk >500 KB có sẵn. Không có lint/typecheck script ở package hiện tại. Chưa commit/push/deploy lượt này.
- File sửa: frontend/src/components/{FacebookNurtureSettings,InstagramNurtureSettings,SettingsPrimitives}.jsx, crossFollowConfig.js; frontend/src/styles/settings.css; backend/src/services/{settingsService,instagramCrossTargetService,taskDispatcherService}.js; backend/src/controllers/{crossTargetController,instagramController}.js; backend/src/utils/nurtureActionUtils.js; backend/scripts/testInstagramCrossFollowIntegration.js; CROSS_TARGETS.md và PROJECT_CONTEXT.md.

## 2026-10-07 — Global Round-Robin per user

Đã thay dispatcher chọn Priority bằng thứ tự cá nhân dispatch_order và cursor next_task_id lưu bảng user_dispatcher_state. Xem TASK_REGISTRY.md mục Round-Robin cho schema/API/migration/files. Priority DB/API được giữ, khởi tạo vòng theo priority DESC; UI ẩn Priority cá nhân, kéo thả + lên/xuống + preview, lưu atomic với toggle hiện tại. Thứ tự lấy từ Registry, không hardcode vòng; loại chưa có handler vẫn bỏ qua.

Khóa state user trước device, reservation/task run/cursor chung transaction, savepoint từng ứng viên; AsyncLocalStorage giới hạn context trong dispatcher giúp controller/helper legacy dùng cùng connection, tránh pool starvation. Resume/report/no-task không dịch cursor; quét tối đa N task, giữ owner/capabilities/eligibility. Page no-work vẫn giữ bảo trì và không để orphan lock.

Migration local đã chạy thành công; additive/idempotent, backup local gitignored, bảo toàn Enabled/Priority/history/cursor. VPS chưa deploy. Lệnh backend: npm run migrate:round-robin. Docker: build backend, compose run --rm backend npm run migrate:round-robin, rồi up -d --build. Không seed.

Đã đạt: Round-Robin API/DB/UI integration (4/50 request, 50 resume, 16 Page claim/resume, rollback, owner, reorder/archive, migration twice, process restart, drag/drop/reload/mobile); Task Registry integration UI; Instagram cross-follow UI; CrossTarget Engine; task report; frontend production build (cảnh báo chunk lớn hiện hữu). DB test riêng tự cleanup. Các chỉnh sửa kịch bản nuôi/tương tác chéo và RR đang trong working tree, chưa commit/push. Công việc còn lại: commit/push khi được yêu cầu và migration trên VPS khi triển khai.

## 2026-10-07 — Device status/capacity/pagination và MMO branding

Base đã commit/push main 7579fc7 (RR + nurture). Lượt mới sửa status source/counter/filter, capacity registration 1000/user, backend pagination/search, bỏ export UI và đổi MMO Manager + Quản lý tài nguyên MMO với logo DK đúng asset user cung cấp. Chi tiết audit, files, API và kiểm thử: DEVICE_DASHBOARD.md.

Timeout reuse 300s, config DEVICE_OFFLINE_TIMEOUT_SECONDS trong config/devices.js/.env.example. Không dùng account.updated_at làm heartbeat; giữ legacy inventory Offline khi chưa có tín hiệu device. Active run hoặc reported RUNNING + last_seen mới => Running; online không chạy => Idle. Explicit Idle/Online không bị UID cũ đẩy thành Running. Counter và filter chung source, online=running+idle. API summary nhận device_status/device_task/device_search/page/page_size; mặc định 50, 20/50/100, summary toàn dataset, next-available query page Idle, admin aggregate trước pagination.

Đăng ký heartbeat/next-task dùng ensureDevice: capacity dựa unique Dashboard + FB/IG inventory per-owner, existing device vẫn hoạt động, new device 1001 bị 409 DEVICE_LIMIT_REACHED. New registration khóa RR state theo user (không advance) để tránh FK deadlock; fallback User lock trước RR migration. Không thay luồng import/assignment resources/API report cũ. Không schema/migration mới.

Logo center-crop kỹ thuật ảnh gốc, giữ thiết kế: frontend/public/assets/dk-logo.png và dk-favicon.png. Sidebar/login/mobile header/title/meta đã đổi; /export nav/route bỏ, backend API export giữ. Platform TikTok và storage auth keys không đổi.

Đạt Device HTTP/MySQL/Chrome DB tạm test status/transition/1000/1001/race/search/filter/pages/polling/branding/logo/favicon/mobile, hồi quy RR UI (4/50/50resume/16Page), task report chỉ-ID; frontend build đạt (chunk warning hiện hữu), không lint/typecheck script. Không seed/sửa DB thật/deploy. Thay đổi mới chưa commit/push; không cần migration mới khi deploy lượt này (môi trường chưa có RR vẫn chạy migration RR cũ).

Logo cập nhật: thay DK gradient bằng đúng ảnh DK đầu ngựa xanh/nền trắng trong Downloads/logo.png người dùng gửi ngày 2026-10-07. Chỉ cắt viền trắng dư và resize, giữ toàn bộ artwork. Asset mới frontend/public/assets/dk-horse-logo.png (256px), dk-horse-favicon.png (64px); sidebar/login/mobile/favicon đổi path mới để tránh cache ảnh cũ. Không đổi chức năng/backend. Build frontend kiểm tra sau thay logo; chưa commit/push.

Logo được thay lần nữa từ bản hiện tại Downloads/logo.png theo yêu cầu tiếp theo; ảnh nguồn có nét đầu ngựa và bố cục khác bản đính kèm trước. Giữ toàn bộ ảnh nguồn, chỉ resize 256/64px, không crop để tránh cắt nét phía trái. Asset dk-logo-<source SHA256 prefix>.png và dk-favicon-<source SHA256 prefix>.png; tất cả UI/favicon dùng tên mới theo nội dung để tránh cache. Chưa commit/push.

## 2026-10-07 — Dashboard isolation (base bcfac2c đã push)

User đổi contract: admin Dashboard cũng chỉ dữ liệu của admin. Nguyên nhân global là controller truyền role admin thành system=true, service loop registry.users cộng stats/device/activity; đã xóa nhánh global ở service, không chỉ filter UI. Từng account/task/device/activity query vẫn WHERE owner_username của identity DB; task metadata global nhưng list(owner) trả user settings/order riêng. Query/body giả owner không có hiệu lực; field scope=user, scheduler=null vì reset counts/error của cron là global không thể quy owner. UI bỏ wording/alert global, giữ cards và pagination1000.

JWT middleware nay verify signature rồi đối chiếu signed id/username với active User DB, req.authenticatedUser và req.admin role canonical DB; payload thiếu/mismatch/inactive 401, ngăn owner rỗng làm service bỏ WHERE. Contract token/API key thiết bị giữ nguyên. Device capabilities GET/PUT yêu cầu device có registration/FB/IG inventory cùng owner, không thuộc mình 404. IDOR Account/Page/Instagram/task report có scope sẵn, được test; bulk ids người khác bị bỏ qua theo contract cũ, không leak/mutate.

Chi tiết files/schema/audit/tests: DASHBOARD_ISOLATION.md. Đạt testDashboardIsolation HTTP/MySQL riêng (A10/20/5/4 vs adminB100/200/50/40, Device3 1/1/1, RegIG10/2/1 vs100/20/10, own settings/activity, parallel refresh/spoof/filter/search/pages, IDOR/malformedJWT/inactive/no-store), DeviceDashboard --ui (1000/1001/race/polling/mobile/adminown2), TaskRegistry --ui (owner stats/adminPage0 vsuser26, Dispatcher/report/locks/Registry), frontend build (chunk warning cũ). Không lint/typecheck script. Không cache Dashboard mới, schema/index/migration mới, seed hoặc DB thật writes. Chưa commit/push/deploy lượt này.

## 2026-10-08 — Device Offline 30 phút

Base main 4846986 đã push (Dashboard isolation). Lượt mới chỉ đổi DEVICE_OFFLINE_TIMEOUT_SECONDS default 300=>1800 trong backend/src/config/devices.js, env example/local override và Compose backend.environment ${DEVICE_OFFLINE_TIMEOUT_SECONDS:-1800}. Runtime Node local nạp .env đã xác minh1800. Không sửa request/task timeout, Dispatcher/cooldown/reservation/lock hoặc nguồn cập nhật last_seen.

Status/filter/counter/alert Dashboard dùng backend snapshot cùngtimeout và owner auth như trước. Điều kiện >30phút: đúng30phút online, >30phút Offline cảactive task, classification không báoFAILED. Test mới backend/scripts/testDeviceOfflineTimeout.js (10/25/30/31 phút, +1ms, active/no-mutation/recovery, env override), mở rộng boundary existing DeviceDashboard integration; isolation regression DBtạm đạt. Hướng dẫn cấu hình/verificationproduction trong DEVICE_DASHBOARD.md mụcOffline2026-10-08. Không Docker CLIlocal/SSHproduction nên chưa xác minh containerVPSrunning; repoCompose cập nhật, saudeploy recreatebackend rồi check key. Không cầnmigration, chưacommit/push.



## 2026-10-08 — Giám sát farm AutoTouch 24/7 — 2026-10-08

Timeout tập trung DEVICE_OFFLINE_TIMEOUT_SECONDS=1800. Cron monitorDevices chạy ngay startup và mỗi 5 phút, độc lập với task completion, có guard chống chạy chồng trong process. Quá 30 phút không có tín hiệu hợp lệ: OFFLINE + DEVICE_UNRESPONSIVE. Đúng 30 phút còn online.

Model DeviceHealth (device_health, unique owner_username/device_id) lưu status OFFLINE, alert_code DEVICE_UNRESPONSIVE, last_seen snapshot, unresponsive_since (=last_seen+timeout), detected_at (lần đầu cron phát hiện). Server sync force:false/alter:false tạo bảng mới khi boot, không cần seed hoặc migration thủ công. Monitor khóa device/recheck last_seen; giữ first detected_at; không cập nhật last_seen hoặc task/account/khóa. Bỏ qua snapshot cảnh báo đã lưu để tránh transaction lặp.

Heartbeat/next-task/report SUCCESS hoặc FAILED hợp lệ cập nhật đúng owner/device và gỡ cảnh báo trong transaction. Report idempotent và next-task không có việc hoặc task bị OFF vẫn ghi liveness. Tín hiệu sai/report xung đột không cập nhật. Heartbeat/report khóa device cùng thứ tự chống race. Next-task resume đúng task ID cũ trước cấp mới; task OFF giữ task/khóa và trả no-task. releaseExpiredTasks chỉ monitor/trả 0, không RELEASED/TASK_TIMEOUT hoặc giải phóng account do mất heartbeat. activeTaskProtection loại trừ resource có task RUNNING/REPORTING cùng owner khỏi stale cleanup FB Job/IG Job/Reg IG; timeout cũ giữ cho resource không tracked. Global Round-Robin/cooldown/reservation/request timeout không đổi; dữ liệu nghiệp vụ vẫn báo qua API cũ.

Dashboard derive cảnh báo từ last_seen cùng timeout, hiện ngay quá hạn; cron lưu bền mỗi 5 phút. Filter device_status=DEVICE_UNRESPONSIVE (Cần xử lý), unresponsive_total tính toàn dataset của user trước pagination. Hiển thị tên máy, task/account hiện tại hoặc gần nhất, Last Seen, thời gian không tín hiệu. Row có alert_code/unresponsive_since/unresponsive_seconds (quá ngưỡng)/inactive_seconds (không tín hiệu); cột Mất phản hồi dùng inactive_seconds. last_task/last_uid từ run mới nhất cùng owner. Inventory không last_seen vẫn Offline nhưng không suy ra mất phản hồi trên 30 phút.

Repo không có vòng chạy AutoTouch chính để cài heartbeat nền. Client có thể gửi POST /api/device/heartbeat với device_id, task_id tùy chọn qua timer độc lập, không gọi lại vòng task từ timer.

Kiểm thử đạt trên DB tạm riêng, không seed/ghi DB đang dùng: testDeviceMonitoring.js (API/MySQL/callback cron, biên 10/25/30/31, warning timestamp, owner/device trùng ID, invalid signals, hold/resume 5 concurrent, task OFF, recovery/race, FAILED/idempotent, stale-lock SQL); testDeviceDashboardIntegration.js --ui (Chrome cảnh báo/filter/duration/recovery polling, capacity/search/pagination/mobile); DeviceOfflineTimeout; TaskReportOnly; TaskRegistryIntegration (kỳ vọng hold/resume); RoundRobinIntegration (50 concurrent và Page); DashboardIsolation; frontend build. Chưa deploy VPS; cấu hình local/default/Compose 1800, cần xác minh container sau deploy. Chuẩn bị commit/push main theo yêu cầu user; sửa lỗi mã hóa tiếng Việt trước commit.
