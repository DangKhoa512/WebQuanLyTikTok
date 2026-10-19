# QUANLY_REG — bối cảnh tiếp nối cho AI

## Email OTP tự đóng sau 5 lần — 2026-10-19

Email OTP có ngưỡng cố định MAX_EMAIL_USES=5. saveReport vẫn tăng use_count mỗi báo cáo hợp lệ theo cơ chế cũ (không dựa vào solan client); count mới >=5 chuyển DONE/Đã đóng và xóa locked_by/locked_at ngay trong transaction/row lock. Report đến muộn không mở lại email DONE, kể cả email đóng thủ công trước ngưỡng. Dưới 5 giữ mở khóa đúng máy như bản sửa trước.

getForPhone chỉ cấp/resume PENDING với use_count<5; trước khi cấp, đóng PENDING >=5 của owner hiện tại (gồm dữ liệu cũ hoặc được đặt lại Pending), xóa khóa trong transaction. Không backfill toàn DB hoặc sửa schema. Report/dashboard save dùng cùng ngưỡng; UI đã có nhãn DONE = Đã đóng nên không sửa frontend.

Test email-otp-report-lock PASS 12 nhóm trên DB tạm/HTTP API, thêm biên 4→5, không cấp sau đóng, concurrent late reports giữ DONE/counter, dữ liệu cũ >=5 không resume/cấp mới, owner isolation và DONE thủ công không mở lại. Syntax/diff check PASS. Không seed/ghi DB production; chưa restart backend, commit/push/deploy cho lượt ngưỡng 5 này.

## Email OTP report mở khóa — 2026-10-19

Sửa POST `/api/email-otps/report`: trước đây saveReport gia hạn locked_at và giữ locked_by khi máy giữ khóa báo cáo; nay reportFromPhone bật releaseOwnLock để xóa cả hai field trong cùng transaction/row lock sau lưu báo cáo thành công. Chỉ mở khóa của đúng device đang giữ email và owner đã xác thực; report từ máy cũ không mở khóa của máy mới. Giữ trạng thái PENDING, lịch sử OTP, tăng use_count mỗi report và lịch sử device-use chống máy đã dùng lấy lại. `/report-done` vẫn đóng DONE; dashboard create giữ hành vi trước đó. Không đụng khóa Proxy Reg, không đổi schema/payload/auth.

Đã tái hiện test thất bại trước sửa (locked_by vẫn phone-a). `npm run test:email-otp-report-lock --prefix backend` PASS 8 nhóm trên DB tạm, HTTP API/auth thật: own-lock release, same-device exclusion, concurrent claim chỉ cấp một lần, replay không mở khóa máy mới, owner isolation, invalid input giữ khóa, report-done và first-time report. Syntax/diff check PASS. Không seed, không đọc/ghi account thật hoặc DB production; chưa restart backend, commit/push/deploy.

## Cập nhật Proxy Reg — chuẩn hóa định dạng (2026-10-17)

Proxy Reg tự chuyển `host:port:user:pass` thành `user:pass@host:port` khi đọc/lưu settings, loại trùng sau chuyển đổi. Dữ liệu đã lưu trước đó được chuẩn hóa khi đọc, không cần migration; phone allocate nhận định dạng mới, SOCKS5 và proxy key không đổi. UI dùng response settings để hiển thị danh sách đã chuẩn hóa ngay sau lưu và cập nhật baseline tránh báo dirty sai. Không ảnh hưởng pool Proxy Check/Login.

Kiểm tra: reg-proxy-settings PASS (conversion/dedup/owner isolation); reg-proxy-leases PASS 10 nhóm DB tạm/network stub; backend syntax/diff check PASS. Frontend production build PASS ngoài sandbox sau lỗi esbuild bị chặn đọc thư mục cha, còn warning bundle lớn cũ. Không dùng proxy thật/seed/ghi DB production; chưa restart backend/commit/push/deploy.

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


## 2026-10-09 — Chặn resume account Chờ Login

Đã sửa taskDispatcherService.getNextTask: trước khi trả payload active run, đọc trạng thái account hiện tại theo id + owner_username dưới khóa transaction (FB cho NUOI_FACEBOOK/REG_PAGE/PAGE_JOB/REG_INSTAGRAM; IG cho NUOI_INSTAGRAM/INSTAGRAM_JOB). Dùng account_id, fallback entity_id account hoặc Facebook source từ Reg IG claim. Account CHO_LOGIN hoặc không còn tồn tại cùng owner: trả task:null/resumed:false (HTTP next-task code0/has_task:false), không cấp mới, không tiến cursor, không đổi task status/payload/domain lock; vẫn ghi last_seen/gỡ cảnh báo qua markDevice. Khi account trở lại Login thành công thì resume task ID cũ. Không thay bộ lọc cấp mới hoặc mở thêm trạng thái eligible khác.

instagramController.getNurtureAccount bổ sung loại trừ CHO_LOGIN cho nhánh resume DANG_NUOI theo máy; không tự reset khóa account Chờ Login. Giữ timeout/cooldown/Round-Robin/API report hiện hữu. Không schema/migration/frontend changes hoặc seed/DB thật writes.

Kiểm thử DB tạm đạt: testTaskResumeLoginState.js (6 task types, CHO_LOGIN block, 3 concurrent mỗi loại, cursor/task/payload/account lock giữ nguyên, Login thành công resume cùng ID, legacy IG resume 404); testDeviceMonitoring.js; testTaskRegistryIntegration.js; testRoundRobinIntegration.js (4/50 concurrent và Page). Syntax và git diff --check đạt. Chưa commit/push/deploy lượt này.


## 2026-10-09 — Chặn resume account Die

Base a8968ef đã push. Bổ sung taskDispatcherService resume kiểm tra trạng thái hiện tại dưới khóa theo account id + owner: CHO_LOGIN, ACCOUNT_DIE hoặc live_status=die trả no-task; không cấp mới/tiến cursor/tự kết thúc task/giải phóng khóa. Chỉ đọc id/status/live_status, không dựa vào snapshot account trong payload cũ. Không dùng page_token_status=die thay cho account Die vì token Page lỗi là trạng thái riêng.

Resume API nuôi cũ: Facebook getNurtureAccount lọc live_status khác die (vẫn cho null); Instagram lọc thêm ACCOUNT_DIE/live_status die ngoài CHO_LOGIN. Giữ bộ lọc cấp mới, cooldown, owner, khóa chống trùng. Các task/job cũ ngoài nhánh nuôi chưa mở rộng audit trong lượt này. Không schema/frontend/migration, không seed hoặc ghi DB đang dùng.

Kiểm thử DB tạm đạt: testTaskResumeLoginState.js mở rộng cả 6 loại task, status ACCOUNT_DIE riêng/live_status die khi status LOGIN_THANH_CONG, snapshot cũ hợp lệ vẫn bị chặn, lock/task/payload/cursor giữ nguyên, phục hồi account resume cùng ID, legacy FB/IG Die không trả account. testDeviceMonitoring.js và testRoundRobinIntegration.js (50 concurrent, Page16) đạt; syntax/diff check đạt. Chưa commit/push/deploy lượt mới này.


## 2026-10-09 — Bỏ task có source account không còn dữ liệu

User cho phép kết thúc task cũ khi account đã bị xóa/thùng rác để máy nhận task khác. Dispatcher kiểm tra source theo id + owner_username + kind=job + trashed_at=null dưới khóa, trước branch task OFF và resume. Source không tồn tại trong Job inventory của owner (kể cả thiếu id không resolve được): ghi task FAILED, completed_at, error_code SOURCE_ACCOUNT_UNAVAILABLE, giữ history/payload/retry_count; sau đó tiếp tục vòng cấp task hiện hữu trong cùng transaction/request. Không gọi releaseDomainLock, không sửa tài nguyên của owner khác, không tự reset account/cooldown. Cursor chỉ tiến khi cấp task mới thành công. Nếu không có việc phù hợp: trả success/code0/has_taskfalse thay vì lỗi source. Nếu account vẫn tồn tại nhưng CHO_LOGIN/ACCOUNT_DIE/live_status die: giữ nhánh block/resume đối soát như lượt trước.

Thay đổi chính ở backend/src/services/taskDispatcherService.js và testTaskResumeLoginState.js, tích hợp trên các sửa chặn Die chưa commit trước đó. Không schema/migration/frontend/seed/DB thật writes. Kiểm thử DB tạm đạt: 6 task x hard-delete/thùng rác, 3 request đồng thời mỗi case chỉ một task mới, account Die/ChờLogin vẫn block, no-next trảcode0/task cũFAILED; DeviceMonitoring; RoundRobin 50concurrent/Page16; TaskRegistryIntegration. Syntax/diffcheck đạt. Chưa commit/push/deploy toàn bộ lượt Die + missing source.


## 2026-10-11 — User tự chỉnh limit Facebook trên mỗi máy

settingsController.getFacebookLoginLimit trả editable=true cho user; PUT updateFacebookLoginLimit cho phép user chỉnh own ownerFromAdmin (bỏ qua owner_username spoof), admin giữ quyền chỉnh limit từng user. Validate Number nguyên dương, không parseInt nhận nhầm chuỗi/số thập phân. List all-user vẫn admin-only. Dùng setting facebook_login_machine_limit đã có, không schema/migration; API thiết bị tiếp tục đọc giới hạn theo owner qua getFacebookLoginLimitSettings, không giới hạn riêng từng device_id.

FacebookSettingsPanel mở ô Limit của bạn, thêm onChangeOwn; ProxySettings truyền setter facebookLoginLimit và saveLegacyChanges lưu own limit cho cả user/admin khi dirty. Lưu qua thanh lưu cài đặt hiện hữu, tổng quan phản ánh giá trị mới; giữ bảng user của admin. Không sửa Dispatcher/cooldown/reservation hay limit Instagram.

Kiểm thử testFacebookSelfLimit.js trên DB tạm/API/JWT thật đạt: GET editable, PUT own/persist/reload, owner spoof không thay user khác, user không xem list toàn bộ, admin sửa user/list, invalid limit, service cấp thiết bị đọc giá trị owner mới. Frontend production build đạt (chunk warning có sẵn), syntax/diff check đạt. Không seed/DB đang dùng writes. Chưa commit/push/deploy lượt này.

## 46. Audit hệ thống và System Health (2026-10-11)

- Lượt audit giữ thay đổi Facebook self-limit trước đó; chưa commit/push hoặc triển khai VPS.
- Inventory local: 213 file source JS/JSX, 230 method/path khai báo, 41 model; đọc metadata 47 bảng MySQL đang có, không thiếu column model. Đây là inventory, không chứng minh mọi nhánh đã kiểm thử. Không đọc credential/account rows thật và không seed/migrate database đang dùng.
- Thêm Cài đặt → System Health và GET /api/system-health (JWT/private no-store): device/task theo owner, cron/API metrics chỉ admin. Redis/queue/WebSocket trả NOT_CONFIGURED vì project không dùng. Alerts DB lỗi, cron quá hạn/lỗi, 5xx, device unresponsive, task dài và reservation conflict; không tự fail/release task. API counters là window theo worker.
- Cron vẫn mỗi 5 phút; cronLockService giữ MySQL session advisory lock riêng theo database, tránh lặp giữa PM2 workers. Snapshot tối thiểu lưu AppSetting owner __system__, key cron_health_v1; last_success_at không bị lần lỗi ghi đè. Không thêm schema.
- Cron Page/nurture reset bỏ qua active execution; riêng reset workflow giữ cả FB source của REG_INSTAGRAM. Helper mặc định cho cleanup legacy vẫn giữ semantics trước đó. TikTok transition lỗi SQL được throw cho scheduler ghi WARNING.
- Dashboard bổ sung task_failures (FAILED executions theo owner, lịch sử). Error card không còn cộng lẫn account và claim; nhóm không mất số liệu khi archive registry. REG_FAIL claim lịch sử không tự tạo cảnh báo unresolved. IG nurture READY chỉ nhận LOGIN_THANH_CONG theo controller cấp mới.
- Phone routes accounts/chrome/jobs bổ sung apiKeyAuth: tool phải gửi x-api-key trước triển khai, success payload giữ nguyên. DB lỗi trong apiKeyAuth đi next(err). **Theo trả lời của người dùng, x-api-key vẫn là username trên web nội bộ; không chuyển sang secret key.**
- Global error handler không log body/parser excerpt, JSON sai 400, >10MB 413, internal 5xx không echo lỗi nội bộ. Bỏ SQL values/query-string logging. Production thiếu/default JWT_SECRET fail closed trước migration. User update yêu cầu is_active boolean, role/password hợp lệ.
- Bộ test backend/tests theo nhóm + npm run test:audit --prefix backend. Full run: 33 scripts, 32 PASS, 1 PARTIAL (performance burst có ECONNREFUSED local dù invariant sau retry đạt). Test System Health signals bổ sung chạy PASS riêng; 1000 task/account duy nhất, duplicate report giữ 1000 SUCCESS; socket drop sau commit assignment/report resume đúng. Hai cron process/connection loss/kill worker PASS.
- Chrome: Dashboard polling/filter/recovery/mobile; System Health + 12 route smoke + 10 tab load PASS. Frontend production build PASS, vẫn cảnh báo bundle >500KB. Node syntax/diff check PASS.
- Bàn giao 10 file audit tại gốc: SYSTEM_ARCHITECTURE_AUDIT, BUSINESS_RULES, TEST_MATRIX, API_AUDIT, DATABASE_AUDIT, CONCURRENCY_REPORT, PERFORMANCE_REPORT, SECURITY_AUDIT, BUG_REPORT, FIX_CHANGELOG. JSON evidence nằm backend/tests; chi tiết log test chỉ artifacts/audit gitignored.
- Không xác nhận nghiệm thu toàn hệ thống: chưa test Linux/VPS production, mọi CRUD/bulk/error state, 100 user cùng lúc, full startup migrations production-copy, soak 24/7. Username-key là rủi ro được user yêu cầu giữ nguyên; burst 500/1000 request local không đạt. Xem TEST_MATRIX.md và PERFORMANCE_REPORT.md thay vì suy ra PASS chung.

Kiểm tra cuối audit: testSystemHealthSignals.js PASS riêng; Dashboard --ui rerun PASS sau sửa harness chờ pagination button enabled (lần trước click khi disabled gây timeout, không sửa logic sản phẩm). Supplemental-results.json ghi cả lần timeout và lần rerun. Validate is_active strict boolean đã có regression PASS. Không commit/push/deploy.

## 47. Device Manager — code local, chờ cấu hình triển khai (2026-10-12)

- Base Git trước lượt này là 9c5572b main đã push. Lượt Device Manager chưa commit/push/deploy. Đọc yêu cầu attachment bd577dbf và các luồng Device/JWT/API key/role/ChromeKhangStats/model/migration hiện có; không khảo sát lại mọi module.
- Nâng màn hình /chrome-khang-stats thành Quản lý thiết bị; thống kê cũ chuyển sang /machine-account-stats, component/API thống kê cũ giữ nguyên. Dashboard chính, dispatcher, account workflows, cron và offline timeout 1800 không sửa.
- Dùng chính dashboard_devices, không bảng devices mới. ManagedDevice là ORM projection trên cùng bảng, giữ nguyên DashboardDevice cũ để heartbeat không trả thêm field hoặc ciphertext. POST /api/device/network/report dùng apiKeyAuth owner hiện có, chỉ cho device tồn tại; body bắt buộc device_id/private_ip và hỗ trợ thêm public_ip/mac. Private IP là RFC1918 IPv4; public IP không nhận private/loopback/link-local/CGNAT/multicast/unspecified; MAC chuẩn hóa chữ hoa. Report giữ last_seen/status/current_task/current_uid/error/runtime/cursor/reservation và updated_at gốc; chỉ cập nhật network metadata/IP timestamps, SSH UNKNOWN khi đổi private IP; không tự gán LAN.
- 6 bảng extension: device_groups/network_lans/ssh_gateways/gateway_lan_mappings/ssh_action_logs/ssh_sessions. 13 field trên device, gồm thêm public_ip/mac_address, index filter, FK composite owner+id, token hash unique. Migration riêng scripts/migrateDeviceManager.js --apply có lock DB/idempotent; rollback chỉ xóa extension sau backup/stop module. Không auto migration startup, không seed hoặc sync force.
- Module tắt mặc định (DEVICE_MANAGER_ENABLED); lazy routes và schema guard kiểm tra đủ column/table/FK trước nạp model. DEVICE_MANAGER_MIGRATION_REQUIRED/DEVICE_MANAGER_DISABLED trả503 khi thiếu điều kiện. Backend legacy không auto đăng ký các model mới lúc app startup.
- Cài đặt quyền theo User admin/user + AppSetting device_manager_permissions; admin cấp/read quyền user, dữ liệu máy/Gateway/log/session vẫn owner đăng nhập. User default VIEW/EDIT/GROUP_MANAGE/LAN_MANAGE, SSH/bulk/Gateway cần cấp. Không sửa User Management cũ hoặc API key username (theo user trước đó).
- Gateway Node.js chạy Windows (user xác nhận), WSS outbound, token bí mật ngẫu nhiên, CIDR allowlist theo LAN, cap mặc định5 (1–20), reconnect backoff/journal chống lặp. CIDR public hoặc overlap giữa các LAN trong cùng Gateway bị từ chối; subnet trùng cần Gateway/VM routing độc lập.
- Broker là tiến trình riêng scripts/startDeviceBroker.js (port3001 nội bộ), chỉ một instance, queue database shared giữa HTTP workers. Action queued theo Gateway; target/permission revalidate, host fingerprint pin, creds AES-256-GCM bằng key32bytesbase64; snapshot không trả frontend/log. Mất kết nối/outcome chưa rõ không tự retry lệnh nguy hiểm hoặc fail task.
- WSS terminal xterm lazy chunk, one-use ticket30s/Origin, session15min/idle5min, cap10/user, không lưu nội dung. Quick actions whitelist SSH_CHECK/DEVICE_INFO/AUTOTOUCH_CHECK/RESPRING/REBOOT; RootHide tìm duy nhất .jbroot-<16hex>, kiểm tra binary. Manual destructive confirmation và cảnh báo active task kể cả Device Offline. AutoTouch process không đánh đồng script: script UNKNOWN khi thiếu telemetry.
- UI nhóm/LAN CRUD/move/bulk, filter kết hợp SQL, 8 cards tách Device/SSH, detail 4tabs/history/runtime, polling15s; bulk status5s có requestID đối soát ngay cả response bị mất. Không thay last_seen qua SSH/network.
- Automated test scripts/testDeviceManager.js --ui trên DB tạm + SSH mock: 35 nhóm PASS, gồm schema partial, migration twice/rollback/reapply giữ1000device và active task, owner/FK, IP invariants, SSH mismatch/auth/timeout, terminal/role revoke/TLS/Origin, bulk/queue/full/duplicate/reconnect/journal và drop-response-after-enqueue. Chưa chạy reboot/respring vật lý. Test JSON tại backend/tests/device-manager.
- Regression riêng PASS: DeviceMonitoring, RoundRobin (50 concurrent13/13/12/12, Page16), TaskResumeLoginState, FacebookSelfLimit, LegacyPhoneAuth. Không chạy lại toàn test:audit; benchmark PARTIAL trước đó chưa được giải quyết trong lượt này.
- Performance list SQL 10/50/100/200/500/1000device có4queries, trả tối đa100rows; chỉ local service sample, không suy ra công suất SSH/WS farm. Chrome desktop/mobile PASS, frontend build PASS (main>500KB warning vẫn có, xterm tải riêng), syntax/diffcheck PASS.
- npm audit backend17 advisory (1critical), frontend13, Gateway0; chưa nâng broad dependency để tránh thay module khác. Chưa test Windows service thật, iPhone/binary RootHide/host key thật, routing/TLS VPS, SSH/WS load1000 hoặc soak24/7.
- Automatic approval review từ chối tự gắn migration startup/bật cổng broker/sửa Nginx expose endpoint vì tác động persistent/production. Đã hoàn thiện code/manual scripts và bản cấu hình review trong DEVICE_MANAGER_DEPLOYMENT.md; chưa thay server.js/docker-compose/nginx/.env active. Cần approval cụ thể để áp dụng config local, và thông tin TLS thật trước deploy VPS.
- Tài liệu bàn giao: DEVICE_MANAGER.md, DEVICE_MANAGER_DEPLOYMENT.md, DEVICE_MANAGER_TEST_REPORT.md, gateway/README.md; giữ tài liệu audit trước như bằng chứng lịch sử có ngày riêng.

## 48. Compose/Nginx Device Manager sau phê duyệt (2026-10-12)

User đã đồng ý áp dụng cấu hình local sau khi xác nhận không xóa DB. docker-compose.yml thêm device_broker profile device-manager, nội bộ3001 không ports/volume; ba service mysql/backend/nginx và mysql_data giữ nguyên semantic so với HEAD. .env.example thêm flagfalse/keyblank/Originblank; không sửa .env thật hoặc tự bật module. Nginx HTTP thêm /device-ws/ trả426; snippet nginx/device-ws.conf dùng biến upstream + resolver Docker, copy vào image cùng HTTPS example nhưng example không auto-load. Không gắn migration/broker vào startup.

User cung cấp http://vn1.ip3s.net:45473; HTTPS cùng port probe TLS handshake fail curl35. Chưa có đường dẫn cert/cổngHTTPS xác nhận, giữ HTTP hiện tại; example chỉ set server_name vn1.ip3s.net, certpaths mẫu cần kiểm chứng. Broker profile phải bật sau backup/manualmigration/key/origin và HTTPS routing.

YAML parse + so sánh ba service/DB volume PASS; nginx1.27.5 Windows native -t HTTP/WSS snippet/TLS example PASS, dùng cert tạm trong artifacts gitignored. Docker engine/compose config runtime chưa chạy do CLI không có; chưa test TLS Linux/live. Bằng chứng backend/tests/device-manager/configuration.json. Không DB writes, seed, migration, down -v, commit/push/deploy lượt này. Deployment doc cập nhật phê duyệt supersede trạng thái chờ ở section47.

## 49. Khớp port forwarding web theo ảnh (2026-10-12)

User cung cấp ảnh TCP45473→8080 và TCP33194→22. Đã sửa docker-compose Nginx ports từ80:80 thành8080:80; giữ443:443, service/volumeMySQL, backend/broker và các cấu hình khác. 33194 là SSH quản trị VPS, không phải tunnel Gateway. YAML parse và kiểm tra diff cấu trúc chỉ thay HTTP hostport PASS. Chưa deploy/restart/migrate, chưa xác nhận mapping HTTPS hoặc certificate. Section48 equality mô tả trạng thái trước sửa hostport này.

## 50. Gateway SSH Tunnel, nhiều user/Terminal (2026-10-12)

- User yêu cầu LAN Gateway outbound SSH tunnel, WS loopback bên trong, website Terminal HTTPS/WSS hoặc VPN; không tự thay production. Giữ mọi thay đổi Device Manager local trước đó, không commit/push/deploy.
- gateway/src/sshTunnel.js thêm SSH public-key auth + pin VPS hostkey, forwarding cố định remote127.0.0.1:3002, local127 ephemeral, cleanup/reconnect. index.js thêm transport ssh_tunnel, giữ WSS cũ/token/CIDR/journal. Config mẫu không chứa secret.
- deviceBrokerTransport.js kiểm tra listener tunnel chỉ Gateway, loopback hoặc exact trusted peer; HTTPS forwarded chỉ tin proxy exact/loopback. deviceGatewayBroker.js optional listener3002 dùng chung maps/queue/auth/session vớimain3001, default tunneloff. frontend DeviceTerminal chặn productionHTTP, cleanup theo deviceId.
- .env.example thêm flagfalse/bindloopback/peerblank; không sửa .env thật/Compose/Nginx active trong lượt này. Docker cần manual review bindcontainer+hostloopback portpublish và exactpeers; chưa deploy.
- Test tunnel thật với SSH2 mock/publickeysignature/hostkeymismatch/2encryptedtunnels/disconnect/transportguards PASS. DeviceManager35groups PASS (không --ui), thêm3sessions/2users/2Gateways outputisolated/foreign404/sessionidspoof và Gateway-onlylistener. FrontendbuildPASS, bundlewarningcũ. DBtạm riêng, không seed/DBthật hoặc lệnh vật lý.
- Triển khai còn chờ HTTPS IPcertificate/privateCA hoặc VPN+HTTPS, SSH user/key restriction và cấu hìnhDockerthật. Chưa nghiệm thu WSS/Linux/Windows/iPhone thực, tảiTerminal/soak24h. Xem DEVICE_MANAGER_SSH_TUNNEL.md và JSONtestevidence. Heartbeat/Dispatcher/PrivateIPAPI không đổi.

HTTPS check trong deviceManagerSecurity.js va routes/deviceManager.js cung dung exact trusted proxy; khong tin req.secure do forwarded header tu peer la. Test spoof public HTTPS header tren HTTP middleware PASS.

## 51. Commit handoff (2026-10-12)

User requested stopping VPS deployment and committing/pushing completed Device Manager, Gateway and SSH tunnel work. Production remains undeployed; migration/module enable/TLS remain manual prerequisites. Phone network endpoint is POST /api/device/network/report, x-api-key owner auth, body device_id/private_ip và tùy chọn public_ip/mac; production HTTPS required, module/schema guard required. HTTP-only current VPS cannot call it successfully until HTTPS is configured (426). Network report never updates heartbeat last_seen hoặc tự gán LAN. Verified tests and known limitations are in sections47-50 and Device Manager reports.

## 52. Task switches chỉ điều khiển Dispatcher (2026-10-12)

- Theo yêu cầu mới, API riêng ngoài luồng vẫn được phép chạy khi tác vụ cá nhân/hệ thống tắt. taskAcquirePermission chỉ kiểm tra Registry khi req.dispatch_transaction do Dispatcher gắn nội bộ; request HTTP/body không thể bật context này. Các wrapper/controller/routes hiện hữu giữ nguyên.
- /api/device/next-task tiếp tục chọn enabled hệ thống + enabled user, capabilities, eligibility và Round-Robin. Không sửa resume, cooldown, domain lock, owner hoặc API report; chạy riêng không tự tạo DeviceTaskRun mới.
- TestTaskRegistryIntegration trên DB tạm PASS: sáu API standalone không bị403 bởi task switchOFF, PageJob trả account đủ điều kiện khi personal/globalOFF, owner spoof không đổi account; DispatcherOFF không cấp, ON cấp, concurrency/resume/report/history giữ nguyên.
- Ghi chú này thay semantics cũ ở sectionTaskRegistry (APIlegacychặnOFF). Chưa commit/push/deploy lượt sửa này.

Additional verification: testTaskRegistryIntegration.js --legacy PASS; testRoundRobinIntegration.js PASS (50 concurrent requests, Page16). Syntax and git diff --check PASS.

## 53. Instagram credentials riêng + lazy detail (2026-10-12)

- Đọc attachment f5754bd4 và Lua user. Bỏ suy đoán/khôi phục hexadecimal/sessionid, literal Lua "%%3A" không phải encoding đúng. Lua helper mới giữ cookie và trả bearer ở return thứ2, không log secrets; chưa test iPhone/tweak/active-account identity.
- Thêm instagramCredentials/instagramCredentialService/instagramCredentialMigration; model nullable token/token_updated_at, optional AES256GCM cho cookie/token/raw_data bằng INSTAGRAM_CREDENTIAL_ENCRYPTION_KEY (blank mặc định, không .env thật changes/backfill).
- /instagram/job/report mở rộng cookie/token; không status thì credentials-only, có status giữ report cũ. /import-api hỗ trợ structuredexistingcredential và pipepayload+optionaltoken. Empty không xóa, validation trước write, sync RegJob không wipe trường rỗng.
- JWT owner-only GET /instagram/accounts/:id/credentials?field=cookies|token, no-store/auditmetadata. Default list/trash/nurture SQLexclude credentials/rawdata/full data; UI COOKIES+TOKEN buttons/modalfullvalue, khônglocalStorage/logvalues.
- Manual migration script add2columns/idempotent/advisorylock. Phải migrate trước backend mới, chưa deploy/DBthật write/seed/commit/push. Không Heartbeat/Dispatcher/Jobworkflow changes.
- Tests:14groups --ui PASS DBtạm/Chrome,1000list~90ms; Registry/RoundRobin50concurrent/Page16 PASS; frontendbuildPASS warningchunkcũ. Chưa testLua/Instagramcredentialsvalidthật. Evidence backend/tests/instagram-credentials/results.json; doc INSTAGRAM_CREDENTIALS.md.

## 54. Sửa lỗi 500 do thiếu schema Instagram local (2026-10-12)

Sau ảnh Internal Server Error, read-only describeTable xác nhận DB local thiếu token/token_updated_at. Đã chạy migrateInstagramCredentials.js --apply trên DB local, chỉ thêm hai cột nullable, không seed/xóa/ghi đè account. Kiểm tra read-only controller list/listTrash/listNurtureAccounts đều success200, row có presence flags nhưng không cookies/token. Chưa migration/deploy VPS, chưa commit/push. Section53 ghi trạng thái trước lượt migration local này.

## 55. Chuẩn hóa signature session theo mẫu user (2026-10-12)

User cung cấp cặp input/output cụ thể, yêu cầu Instagram Job đáp ứng. Bổ sung normalization hẹp trong validateCookies: chỉ signature 0X1.0FDAB1AP-1042 / 0X0P+0 / 0X1.FB5D8CE8P-1042, ds_user_id khớp UID đầu session, các phần auth bắt đầu bằng chữ/_/-; không chứa marker khác. Chuyển 3 marker thành %3A, giữ numeric segment ngay sau marker0 (ví dụ17), phần auth kể cả "-" và "_". Header xuất dấu "; " và ";" cuối. Chuỗi đã %3A không encode lại. Pattern khác, prefix UID mismatch hoặc phần auth bắt đầu số không được tự sửa, giữ cảnh báo. Chưa xác minh nguồn gây float (cần tweak/string.format code), chưa xác minh session live.
API structured save và parseLine pipe dùng giá trị đã normalize; không bulk rewrite DB cũ. Test15groups --ui PASS DBtạm, gồm signature/unknown/id-mismatch/idempotence/pipe; dùng fixtures không dữ liệu thật user. Các account đã lưu phải gửi lại cookie để cập nhật. Chưa commit/push/deploy.

## 56. Đối soát hexadecimal bằng payload IGT (2026-10-12)
User cung cấp mẫu mới có hexfloat đầu khác signature cũ và token IGT2 chứa session encode. Không ghi dữ liệu thật vào repo. recoverFromIgt chỉ chạy khi cookie có hexfloat và token Bearer IGT:2. Strict base64/base64url/JSON/UID numeric,4segments percent3A, authparts alnum/_/-, numeric segment. Xác minh cookie raw bằng UID và toàn bộ authsegments từtoken +3hexmarkers (middle0X0P+0). Case auth phải khớp. Lấy nguyên sessionid trongtoken, không decode/reencode session. Token/cookieUID hoặc authsegments lệch/malformed trả400, giữ DB.
Chấp nhận thiếu "=" riêng ds_user_id<digits> khi đối soát token thành công. parseLine nhận Bearer token ở cột pipe cuối và validate/save riêng. Cookie khôngtoken giữ policy cũ; token-only không tự đổi cookie. Lua helper nhận thêm shorthand ds_user_id để giữ cookies/token cùng gửi.
Test16groups --ui PASS DBtạm/Chrome, gồmvariant marker/numericsegment2/taildigit, malformedpayload/UID/sessionmismatchatomic/pipe. Không xác minh token live hoặc nguyên nhânfloat trongtweak. Không migrationmới, chưa commit/push/deploy.

## 57. Token pipe cho account đã tồn tại (2026-10-13)

Sau báo cáo user không nhận Token, xác nhận parseLine đã nhận token nhưng importRows nhánh update thiếu parsed.token/token_updated_at. Bổ sung patch chỉ khi parsed.token không rỗng; không đổi owner/status/cooldown logic. Test17groups --ui PASS DBtạm/Chrome, thêm existingaccount pipe update và omission preserves. Không lưu dữ liệu thật user, không migration mới/DBproduction writes. Chưa commit/push/deploy.

## 58. Tự lấy csrftoken cho cookie Instagram từ phone (2026-10-14)

Thêm instagramCsrfService: sau validate/normalize, các luồng phone import-api, reg/report và job/report có cookie thiếu csrftoken sẽ GET URL Instagram cố định `/accounts/login/`, gửi cookie hiện có và lấy csrftoken từ Set-Cookie/HTML. Token hợp lệ được nối vào header cookie chuẩn trước khi lưu; cookie đã có csrftoken không gọi mạng và giữ nguyên. Request nằm ngoài transaction/row lock, timeout mặc định8giây qua INSTAGRAM_CSRF_FETCH_TIMEOUT_MS, bật mặc định qua INSTAGRAM_CSRF_FETCH_ENABLED. Không log credential/CSRF.

Lấy CSRF là best-effort để không làm mất account khi Instagram timeout/chặn: response warning CSRF_TOKEN_FETCHED, CSRF_TOKEN_NOT_RECEIVED hoặc CSRF_TOKEN_FETCH_FAILED; hai lỗi sau vẫn lưu cookie đã làm sạch. Không backfill account cũ, không đổi schema/owner/task/lock/status semantics. Test credentials17groups PASS trên DB tạm với axios stub, gồm job/report, import pipe, đã có token không gọi lại và failure giữ cookie; không gọi Instagram thật, không DB production write. Syntax các file sửa và git diff --check PASS. Chưa commit/push/deploy.

## 59. Import Instagram giao diện web tự lấy csrftoken (2026-10-14)

Bật enrichCsrf cho importDashboard (POST /api/instagram/import, JWT owner). Import pipe trên web dùng cùng validate/normalize và lấy CSRF best-effort như phone, áp dụng cả tạo mới và cập nhật account. Cookie có csrftoken không gọi mạng; lỗi lấy token vẫn lưu cookie và trả credential_warnings. Không đổi schema/owner/status/dispatcher hoặc backfill.

Kiểm thử testInstagramCredentials.js: 17 nhóm PASS trên DB tạm biệt lập, thêm web import tạo mới khi fetch lỗi, cập nhật lấy token thành công và giữ cookie đã có token không gọi mạng. HTTP Instagram giả lập, không dùng dữ liệu thật hoặc gọi Instagram thật. Node syntax và git diff --check PASS. Chưa commit/push/deploy.
## 60. CSRF Instagram ưu tiên proxy + bổ sung cookie cũ (2026-10-14)

Theo yêu cầu user, giữ fetch trên VPS nhưng chọn luân phiên proxy pool web của owner (getFacebookCheckProxySettings, Cài đặt chung/Proxy). Tự bổ sung ở phone import/reg/job và web import dùng proxy khi có; chưa cấu hình giữ direct, cấu hình sai/proxy lỗi/settings lỗi không fallback direct. Chỉ nhận HTTP200, không theo redirect. Không đổi owner/schema/task/status.

Thêm JWT POST /api/instagram/csrf/fetch-missing, tối đa5 IDs/request, proxy bắt buộc, network tuần tự ngoài transaction, row lock recheck cookie+token chống ghi đè dữ liệu mới. Bỏ qua already-present/no-cookie, trả metadata không secret/no-store; manual vẫn chạy khi auto flag OFF. Web Reg/Job có nút cho đã chọn hoặc trang hiện tại, chia batch5/progress/result. Không backfill tự động toàn DB.

TestInstagramCredentials --ui PASS19groups trên DB tạm/Chrome với HTTP stub: owner proxy agent/no direct fallback/invalid settings, backfill success/skip/failure/owner/strictIDs/race, UI encrypted-cookie save/no leaks. Build frontend PASS sau chạy ngoài sandbox (lần đầu esbuild bị chặn đọc thư mục cha), cảnh báo chunk lớn cũ. Backend syntax/git diff --check PASS. Không gửi account thật/Instagram thật, không DBproduction writes/seed/migration/deploy. 3b4ff4b đã push trước lượt này; thay đổi proxy/backfill hiện chưa commit/push.
## 61. Rà soát CSRF sau ảnh lỗi (2026-10-14)

Ảnh user: ID29 không nhận token, ID28/30 đã có token. Phát hiện code chỉ nhậnHTTP200 nên bỏ lỡ Set-Cookie trên302 và gộp mọi HTTP lỗi thành NOT_RECEIVED. Sửa đọc token redirect hợp lệ; tối đa2follow HTTPS exactInstagramhosts, giữproxy/cookie, deadlinechung, khôngdomainoutside/HTTP/missingLocation/challenge/checkpoint/suspended. Không retry khi429/challenge. Phân loại HTTP429/401/403/407/other, timeout, redirectlimit và no-token; web hiện username/HTTPstatus, khôngURL/credential. Không suy ra nguyên nhân account29 thật từ ảnh.

TestInstagramCredentials --ui PASS20groups trênDBtạm/Chrome/HTTPstub, thêmredirectcookie/HTML/blocked/challenge/loop/errors/timeout. FrontendbuildPASS (chunkwarningcũ), syntax/diffPASS. Không gọiInstagram/proxythật, khôngDBthậtwrites. Chưacommit/push/deploy. Phần này thay mô tả chỉHTTP200/khôngredirect ởsection60.
## 62. Phân biệt lỗi kết nối sau redirect CSRF (2026-10-14)

Ảnh mới có failure +HTTP302: code giữ status của phản hồi trước khi request kế tiếp throw. Sửa resetHTTP trước mỗi request, trả previous_http_status/request_stage, phân loại DNS/refused/reset/TLS/timeout bằng whitelist mã lỗi, không rawerror/URL. Web hiển thị sau chuyển hướng + chưa nhậnHTTPmới/trướcđó302. Không suy ra proxy chết hay accountcheckpoint từ ảnh. TestInstagramCredentials --ui PASS20groups mở rộng redirect rồi4networkerrors/noerrorleak, frontendbuild/syntax/diffPASS. Không gọiproxy/Instagramthật/ghiDBthật, chưacommit/push/deploy.
## 63. Chẩn đoán CSRF với dữ liệu local (2026-10-14)

User yêu cầu test dữ liệu local. Thêm scripts/diagnoseInstagramCsrf.js: mặc định chỉ đọc DB, kiểm tra presence/format/proxy metadata; --live mới gọi mạng, không ghi DB hoặc in credential/raw error/body. Kiểm tra local read-only và syntax PASS, không đưa dữ liệu tài khoản thật vào tài liệu. Request sandbox gặp EACCES; automatic approval review từ chối escalation gọi Instagram qua proxy với cookie account thật vì cần xác nhận xuất credential cụ thể. Chưa có kết quả Instagram/proxy thật, chưa lưu CSRF vào DB; cần user xác nhận hành động này trước khi thử lại. Không bypass hoặc retry sau rejection.
## 64. Xác định và sửa giới hạn HTML CSRF bằng thử nghiệm thật (2026-10-14)

User xác nhận cho phép gửi cookie account được chỉ định qua proxy đã lưu tớiInstagram đểdiagnose, khôngghiDB. Lần đầu302 rồi ERR_BAD_RESPONSE/maxContentLength1MB. Sau tăng8MB, lầnthửlại302→200 HTML~1.35MB, fetchedtrue. Khôngin/lưucredential/proxy/body vàooutput hoặc tài liệu. Thêm CSRF_RESPONSE_TOO_LARGE để phân biệt oversize với proxyfailure. User có thể bấm lấyCSRF trênUI sau backendreload; diagnose chưa lưu token vàoDB.

TestInstagramCredentials --ui PASS20groups DBtạm/Chrome, thêm kiểm tra8MB và oversizeclassification; frontendbuildPASS/cảnhbáochunkcũ, syntax/diffPASS. Chưacommit/push/deploy. Xác nhận cụ thể của user giải quyết blocker auto-review ởsection63; không nghiệm thu toàn bộ account/proxy.
## 65. Bàn giao GitHub CSRF proxy (2026-10-14)

User yêu cầu commit/push toàn bộ phần CSRF ưu tiên proxy, bulk bổ sung token, username/HTTP diagnostics và sửa giới hạnHTML8MB. Kiểm tra đã chạy:20groups --ui PASS, frontendbuild/syntax/diffPASS; chẩn đoánInstagramthật qua proxy lấytoken thànhcông nhưng khôngghiDB. Không đưa .env thật/log/artifacts/credential vào commit; chưadeployVPS, không cầnmigrationmới.

## 66. Device network report thêm Public IP và MAC (2026-10-15)

Theo yêu cầu người dùng tự chia nhóm LAN, mở rộng POST /api/device/network/report để nhận device_id/private_ip và tùy chọn public_ip/mac. Giữ apiKeyAuth và owner scope/row lock hiện có; chỉ device đã tồn tại mới được báo cáo. API từ chối group_id/lan_id/gateway_id nên không tự gán LAN. Client cũ chỉ gửi private_ip vẫn tương thích. Public IP kiểm tra cú pháp IPv4/IPv6 và từ chối private/loopback/link-local/CGNAT/multicast/unspecified; MAC nhận 12 hex hoặc dấu hai chấm/gạch ngang rồi lưu dạng chữ hoa AA:BB:CC:DD:EE:FF.

Thêm public_ip STRING(45) và mac_address STRING(17) vào migration idempotent, ManagedDevice và schema guard; dashboard_devices tổng cộng 13 field extension. Network report không đổi last_seen/status/task/account/runtime/cursor/reservation/updated_at và không thay LAN; chỉ private_ip đổi mới reset SSH UNKNOWN. Danh sách/detail UI thêm cột Public IP và MAC. DashboardDevice heartbeat legacy giữ projection cũ nên không lộ field mới.

Kiểm thử npm run test:device-manager PASS 35 nhóm và test:device-manager:ui PASS 36 nhóm trên database tạm/SSH mock/Chrome; gồm migration twice/rollback-reapply, old client, normalization/validation, owner isolation, LAN spoof, heartbeat response và UI columns. Frontend production build PASS, còn warning chunk lớn cũ; syntax và git diff --check PASS. Không chạy seed, không ghi DB production, chưa chạy migration/deploy/commit/push. Khi triển khai phải chạy migrateDeviceManager.js --apply trước khi restart backend vì schema guard mới yêu cầu đủ hai cột.

Theo yêu cầu thêm data mẫu, bổ sung scripts/addDeviceManagerSampleData.js và npm script sample:device-manager. Script mặc định dry-run, chỉ ghi khi có --apply; dùng ba ID cố định sample-device-01..03, IP public thuộc dải tài liệu, MAC locally administered, không xóa dữ liệu và không gán/ghi đè group/LAN/Gateway. Đã chạy migration Device Manager idempotent trên DB local rồi apply cho owner admin: tạo 3 máy mẫu, không cập nhật máy cũ. Dry-run sau ghi xác nhận 3/3 đủ network data và 3/3 chưa gán LAN. Không dùng seedData.js, không ghi DB production; phần code vẫn chưa commit/push/deploy.

## 67. Mở rộng dữ liệu mẫu Device Manager (2026-10-17)

Theo yêu cầu thêm vài mẫu để kiểm tra UI mới, mở rộng fixture local thành sample-device-01..08. Bổ sung Public IPv6, thiếu MAC, thiếu Public IP, chỉ có Private IP và thêm một máy Offline; các mẫu đầy đủ tiếp tục dùng dải public dành cho tài liệu và MAC locally administered. Tất cả mẫu giữ group/LAN/Gateway null để người dùng tự chia; rerun chỉ refresh field mẫu và không ghi đè ba field phân nhóm. Đã apply DB local owner admin: tạo thêm 5, refresh 3 mẫu cũ. Dry-run xác nhận 8 mẫu, 5 đủ network data, 2 thiếu public, 2 thiếu MAC, 2 Offline và 8 chưa gán LAN. Không dùng seed force hoặc DB production; chưa commit/push/deploy.

Ảnh UI sau đó vẫn hiện 0 do backend local chưa có DEVICE_MANAGER_ENABLED. Đã xác nhận HTTP /api/device-manager trả503, thêm DEVICE_MANAGER_ENABLED=true vào backend/.env local (gitignored), dừng tiến trình cũ và khởi động lại backend ẩn. Health trả200 và endpoint không JWT chuyển sang401, xác nhận module/schema guard đã sẵn sàng; browser có JWT sẽ nhận dữ liệu sau reload/poll. Không thay .env.example hoặc production.

## 68. Proxy Reg trong Cài đặt chung (2026-10-17)

Thêm mục Proxy Reg riêng trong Cài đặt chung, hiển thị số lượng và dùng cùng các định dạng `ip:port`, `ip:port:user:pass`, `user:pass@ip:port`. Proxy Reg không trộn với pool Proxy Check/Login hiện có; UI hỗ trợ tải, sửa, lưu, hoàn tác và reset cùng cơ chế settings hiện tại.

Backend thêm GET/PUT `/api/settings/reg-proxies`, lưu dưới setting key `reg_proxies` theo `owner_username`; dữ liệu được trim, bỏ dòng rỗng và loại trùng. API dùng JWT/owner của settings router nên user không thể chỉ định hoặc đọc owner khác. Chưa gắn danh sách này vào dispatcher hay payload phone vì lượt này chỉ bổ sung cấu hình; luồng cấp proxy cho REG sẽ dùng API/setting riêng này khi được nối tiếp.

Kiểm tra `test:reg-proxy-settings` PASS với hai owner giả lập, bao gồm chuẩn hóa và cách ly dữ liệu. Backend syntax PASS, frontend production build PASS; còn cảnh báo chunk lớn cũ. Không chạy seed, không ghi DB production và không đưa proxy thật vào mã/test/tài liệu.

## 69. Lease Proxy Reg cho phone (2026-10-17)

Nối Proxy Reg ở section 68 vào phone API bằng lease lưu MySQL. Thêm bảng `reg_proxy_leases` với session UUID, owner/device/task tùy chọn, proxy hash, IP thoát, TTL và các active guard nullable. Unique `(owner, active_device_id)`, `(owner, active_proxy_key)` và `(owner, active_exit_ip)` cùng transaction/row lock ngăn một phone có hai lease hoặc hai phone cùng owner nhận trùng proxy/IP thoát. Credential proxy không được chép vào bảng lease/history hoặc log; lease chỉ giữ SHA-256 key và IP thoát.

Thêm phone API có `apiKeyAuth`, HTTPS guard ở production và `Cache-Control: no-store`: POST `/api/proxy/allocate`, `/api/proxy/heartbeat`, `/api/proxy/release`. Allocate xác minh device thuộc owner, giữ proxy nguyên tử, gọi HTTPS IP-check qua chính proxy rồi mới trả proxy/session. Private/loopback/link-local proxy host bị chặn; domain được resolve và pin vào địa chỉ public để tránh DNS rebinding. Mỗi request mặc định kiểm tra tối đa hai proxy, 8 giây/proxy và đổi vị trí bắt đầu ngẫu nhiên để nằm trong timeout client 20 giây. Gọi allocate lại từ cùng phone trả lease cũ; hết pool trả `PROXY_UNAVAILABLE` và không đổi task. Session token là HMAC ràng buộc owner/device/session; heartbeat gia hạn TTL mặc định 30 phút; release kiểm tra token và idempotent. Lease quá hạn được chuyển EXPIRED và mở các active guard.

`/api/facebook/reg/report` và `/api/instagram/reg/report` nhận thêm `proxy_session_id`/`proxy_session_token`. Chỉ sau khi account hợp lệ được nhận và session đúng owner/device/token, controller mới release proxy; response có `proxy_released` và `proxy_release_status`. Client cũ không gửi session vẫn báo account như trước và có thể gọi `/api/proxy/release` riêng. Hợp đồng phone và ví dụ nằm trong `REG_PROXY_LEASE.md`.

Thêm model/migration/script `migrate:reg-proxy-leases`; đã apply migration cộng thêm trên DB local, xác nhận 18 cột và bốn unique guard, restart backend local, health 200 và route không API key trả 401. `test:reg-proxy-leases` PASS 9 nhóm trên database tạm với network stub: migration hai lần, concurrent allocation, owner isolation, trùng exit IP, pool exhaustion, retry session, token/heartbeat/double release, chặn private host và Facebook REG report tự release. `test:reg-proxy-settings` PASS; `test:instagram-credentials` PASS 19 nhóm; backend syntax/diff check PASS. Không gọi proxy thật, không chạy seed và không ghi DB production. VPS phải chạy `npm run migrate:reg-proxy-leases` trước khi restart backend mới.

## 70. Proxy Reg report simplification (2026-10-17)

Facebook/Instagram reg/report releases the current lease by authenticated owner + device_id after accepting valid account data. No session fields required; response omits proxy_released/proxy_release_status. Removed Proxy Reg heartbeat route/controller/service (404). TTL remains 30 minutes; explicit release still requires session token. Complete report before allocating a new round: delayed/repeated report affects the current device lease. No schema change.

## 71. SOCKS5 Proxy Reg (2026-10-17)

IP health check uses SocksProxyAgent (^8.0.5 direct dependency), socks5h destination DNS, validated/pinned public proxy address, HTTPS verification and existing timeout/owner/transaction guards. No direct/HTTP fallback. Settings normalize host:port:user:pass to user:pass@host:port, including old values on read; UI displays normalized save response. See REG_PROXY_LEASE.md for current contract.

## 72. GitHub handoff (2026-10-17)

Preparing commit/push of pending Device Manager network fields/sample fixtures and Proxy Reg settings/leases/SOCKS5/report/format conversion. Reg proxy settings PASS; leases PASS 10 groups on isolated temporary database/network stub. Frontend build PASS (existing large chunk warning). No .env, real credentials, logs or local artifacts included. No VPS deployment or production migration.
