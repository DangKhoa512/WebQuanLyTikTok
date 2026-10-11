const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const inventory=read('backend/tests/audit/source-inventory.json'),schema=read('backend/tests/database/schema-observed.json'),results=read('backend/tests/results.json'),perf=read('backend/tests/performance/results.json');
const write=(name,s)=>fs.writeFileSync(path.join(root,name),s);
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n';
const models=inventory.models,missing=models.filter(m=>m.missing_columns.length);
const indexes=new Map();for(const r of schema.indexes){const key=r.TABLE_NAME+':'+r.INDEX_NAME;if(!indexes.has(key))indexes.set(key,{table:r.TABLE_NAME,unique:Number(r.NON_UNIQUE)===0,fields:[]});indexes.get(key).fields.push(r.COLUMN_NAME);}
const absent=[];for(const model of models)for(const index of model.indexes){const fields=index.fields.map(f=>typeof f==='string'?f:f.name||f.attribute);if(![...indexes.values()].some(i=>i.table===model.table&&i.unique===index.unique&&JSON.stringify(i.fields)===JSON.stringify(fields)))absent.push([model.table,index.name||'(generated)',fields.join(',')]);}
write('DATABASE_AUDIT.md','# Audit database local\n\nChỉ đọc INFORMATION_SCHEMA và EXPLAIN trên schema đang có; không đọc credential/account rows thật, không sync/migrate schema này. Bằng chứng: backend/tests/database/schema-observed.json, explain-observed.json.\n\n'+table(['Mục','Kết quả'],[['Bảng quan sát',new Set(schema.columns.map(c=>c.TABLE_NAME)).size],['Model Sequelize',models.length],['Column model thiếu trên schema local',models.reduce((n,m)=>n+m.missing_columns.length,0)],['Index/constraint quan sát',indexes.size+'/'+schema.constraints.length],['Index model chưa tìm thấy theo fields/unique',absent.length]])+
 '\n'+(absent.length?table(['Bảng','Index model','Fields'],absent):'Các index model đã khớp theo thứ tự fields/unique. Index SQL startup/registry cần đối chiếu riêng; không suy ra chỉ từ model.\n')+
 '\nMySQL row locks, transaction và các unique owner/device, owner/kind/uid, owner/page cùng cursor FKs có trong source/metadata. DeviceTaskRun không có constraint unique một resource active; không áp đặt unique lịch sử execution vì có thể phá lưu nhiều lượt chạy.\n\nSchema local không phải schema VPS. Chưa query duplicate/orphan account thật, chưa audit permissions/backup disk, chưa chạy toàn bộ startup migration trên bản sao production. Không có migration schema mới trong bản sửa này; AppSetting dùng snapshot cron hiện có. RR migration idempotent được kiểm tra bằng snapshot settings/cursor trong database tạm.\n\nSeed không chạy. Fixture tạo database có prefix và UUID, guard khác DB_NAME gốc, cleanup chỉ DROP database test riêng. SQL test không được trỏ vào database đang dùng.\n');
write('TEST_MATRIX.md','# Ma trận kiểm thử\n\nNguồn máy đọc: backend/tests/results.json. PASS của một script chỉ áp dụng assertions của script; không đồng nghĩa mọi yêu cầu trong module hoặc toàn hệ thống PASS.\n\n'+table(['Nhóm','Script','Assertions','Thời gian ms'],results.results.map(r=>[r.group,r.script,r.status,r.elapsed_ms]))+
 '\nKiểm tra bổ sung đã chạy riêng: testDashboardFailureCounts.js (đối soát 17 metrics độc lập + IG READY), testLegacyPhoneAuth.js (owner spoof/inactive), testSystemHealthUI.js (Chrome smoke + 10 tab), testDeviceDashboardIntegration.js --ui, build production frontend và node --check/diff.\n\n'+table(['Yêu cầu','Kết quả','Bằng chứng / giới hạn'],[
 ['10/25/30/31 phút và +1ms biên','PASS','testDeviceOfflineTimeout/testDeviceMonitoring; >1800 mới Offline'],
 ['Owner/admin own scope/IDOR','PASS phạm vi fixtures','testDashboardIsolation; không thay thế mọi endpoint'],
 ['999/1000/1001, last-slot race','PASS','testDeviceDashboardIntegration'],
 ['RR rollback/cursor/restart/no work','PASS','testRoundRobinIntegration'],
 ['Source thiếu/Chờ Login/Die','PASS','testTaskResumeLoginState sáu task'],
 ['Report id-only/duplicate/final conflict','PASS','testTaskReportOnly và farm 1000 terminal rows'],
 ['Cron active/resource protection','PASS','testCronActiveProtection'],
 ['Cron hai process/connection loss/kill worker','PASS','testCronDistributedLock'],
 ['Socket drop sau commit assignment/report','PASS','tests/recovery/commit-and-drop.json'],
 ['1/10/50/100/200 device burst','PASS trong lần đo','latency/zero errors trong performance JSON'],
 ['500/1000 device burst không lỗi','FAIL','ECONNREFUSED; invariants sau retry PASS'],
 ['Get account/config/dashboard 10..1000 clients','PASS có giới hạn','max 50 HTTP in-flight, cron chạy cùng get-config'],
 ['Chrome Settings Health + 12 route smoke','PASS','frontend-smoke.json; không phải toàn bộ CRUD'],
 ['2/10 tab cùng user','PASS load','tabs.json; Dashboard polling recovery riêng đã PASS; chưa soak memory'],
 ['100 user đồng thời với JWT riêng','NOT_RUN','Không suy ra từ 1000 device chung một owner'],
 ['Redis/Queue/WebSocket restart/rooms','N/A','Project không dùng các dịch vụ này'],
 ['Subscription/API key expiry','N/A','Không có mô hình expiry, key username giữ nguyên'],
 ['Mọi CRUD/bulk/modal/error-state từng trang','NOT_RUN đầy đủ','Smoke + suites chọn lọc; chưa phủ mọi workflow'],
 ['Linux VPS/Nginx/PM2 load và container restart','NOT_RUN','Không có quyền truy cập production từ phiên này'],
 ['DB restart/packet loss/deadlock chaos dài hạn','NOT_RUN đầy đủ','Connection loss cron + transaction rollback đã chạy riêng'],
 ['Startup migrations production-copy/no-loss','NOT_RUN','Chỉ registry migration có fixture idempotency'],
 ['Dependency CVE/penetration/full SQLi-XSS','NOT_RUN','Source audit và regression security chọn lọc'],
 ['Soak 24/7 / memory leak chứng minh','NOT_RUN','RSS burst không chứng minh leak hoặc độ ổn định 24/7']
 ])+'\nKết luận nghiệm thu: CHƯA ĐẠT TOÀN BỘ. Giữ rủi ro API key theo quyết định user, burst cao FAIL và các hạng mục NOT_RUN. Không triển khai database thật, không tự commit/push.\n');
const f=n=>Number.isFinite(n)?n.toFixed(1):'N/A';
write('PERFORMANCE_REPORT.md','# Performance local — virtual clients\n\nNguồn: backend/tests/performance/results.json; testAuditFarm.js. HTTP thật và SQL thật trong DB tạm, synthetic account, không external traffic. Client và server cùng tiến trình Node trên Windows: CPU/RSS là số đo tổng của harness, không phải riêng backend/VPS; pool max 10, không đo peak DB connections/slow-query-log/CPU MySQL. API limiter không mount trong benchmark; không đại diện production/Nginx rate limit.\n\n'+table(['Operation','Clients','Max in-flight','RPS thành công','Avg ms','P95 ms','P99 ms','Lỗi/lượt','CPU ms','RSS MiB'],perf.results.map(r=>[r.operation,r.clients,r.max_http_inflight||r.clients,f(r.successful_rps??((r.clients-r.errors)/(r.elapsed_ms/1000))),f(r.average_ms),f(r.p95_ms),f(r.p99_ms),r.errors+'/'+r.clients,f(r.cpu_ms),f(r.rss_bytes/1048576)]))+
 '\nRPS attempt bao gồm lỗi; bảng dùng RPS thành công. P95/P99 tính trên request có latency ghi được; transport refused bị loại khỏi latency, vẫn tính error rate. Các lượt tăng dần reuse device và gồm resume; không phải toàn bộ claim mới.\n\nBurst >=500 có ECONNREFUSED: FAIL yêu cầu không lỗi, root cause hạ tầng/client/server socket chưa tách riêng. Retry là phép kiểm tra consistency, không biến error rate thành 0. Bounded-get-* giới hạn 50 HTTP in-flight; mức clients là tổng virtual clients, không phải mức đồng thời. Cron chạy đồng thời ở get-config.\n\nGET TASK/heartbeat/report burst và get-account/config/dashboard bounded đã đo tới 1000; đa user 100 users, sustained production throughput, CPU/RAM DB, Linux network backlog và soak 24/7 chưa đo. Không tự tăng pool/rate/timeout hoặc sửa Dispatcher để che kết quả. Cần staging Linux với Nginx, pacing/jitter giống AutoTouch và limiter thực tế để kết luận sức chứa VPS.\n');
