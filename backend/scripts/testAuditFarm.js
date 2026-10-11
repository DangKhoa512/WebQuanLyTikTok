// Real API/SQL monitoring tests in a disposable database, never the application database.
const path=require('path'),assert=require('assert'),crypto=require('crypto');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Sequelize,Op}=require('sequelize');
const original=process.env.DB_NAME,name='quanly_monitor_test_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const safe=()=>/^quanly_monitor_test_\d+_[a-f0-9]+$/.test(name)&&name!==original;
const manager=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,dialect:'mysql',logging:false});
let db,server,created=false;
(async()=>{
 assert(safe());await manager.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');created=true;process.env.DB_NAME=name;
 process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
 db=require('../src/config/database');require('../src/config/logger').silent=true;require('../src/models');await db.sync();
 const User=require('../src/models/User'),Device=require('../src/models/DashboardDevice'),Health=require('../src/models/DeviceHealth'),Run=require('../src/models/DeviceTaskRun'),IG=require('../src/models/InstagramAccount'),FB=require('../src/models/FacebookAccount');
 const a=await User.create({username:'monitor_a',password_hash:'test-only',role:'user'}),b=await User.create({username:'monitor_b',password_hash:'test-only',role:'admin'});
 const registry=require('../src/services/taskRegistryService').createRegistryService(db);await registry.migrate();
 const tasks=await registry.list(a.username),igTask=tasks.find(t=>t.task_key==='INSTAGRAM_JOB');
 await registry.saveMine(a.username,tasks.map(t=>({task_id:t.id,enabled:t.id===igTask.id,priority:t.default_priority})));
 const {monitorDevices}=require('../src/services/deviceMonitoringService'),{offlineTimeoutSeconds}=require('../src/config/devices');assert.equal(offlineTimeoutSeconds,1800);
 const express=require('express'),jwt=require('jsonwebtoken'),app=express();app.use(express.json());app.use('/api/device',require('../src/routes/device'));app.use('/api/instagram',require('../src/routes/instagram'));app.use('/api/facebook',require('../src/routes/facebook'));app.use('/api/dashboard',require('../src/middleware/jwtAuth'),require('../src/routes/dashboard'));app.use((err,req,res,next)=>res.status(err.statusCode||500).json({success:false,message:err.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const api=async(user,url,body)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(body?{'x-api-key':user.username}:{Authorization:'Bearer '+jwt.sign({id:user.id,username:user.username,role:user.role},process.env.JWT_SECRET)})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};


 app.use('/api/system-health',require('../src/middleware/jwtAuth'),require('../src/routes/systemHealth'));
 app.use('/api/machine-api-configs',require('../src/routes/machineApiConfigs'));
 app.use('/api/settings',require('../src/middleware/jwtAuth'),require('../src/routes/settings'));
 app.use(require('../src/middleware/errorHandler').errorHandler);
 const token=u=>jwt.sign({id:u.id,username:u.username,role:u.role},process.env.JWT_SECRET);
 const health=async(u)=>{const r=await fetch(base+'/api/system-health',{headers:{Authorization:'Bearer '+token(u)}});return {status:r.status,data:await r.json()};};
 assert.equal((await fetch(base+'/api/system-health')).status,401);
 await Device.create({owner_username:b.username,device_id:'PRIVATE_B',last_seen:new Date()});
 let h=await health(a);assert.equal(h.status,200);assert.equal(h.data.data.devices.total,0);assert.equal(h.data.data.cron.status,'ADMIN_ONLY');assert.equal(h.data.data.redis.status,'NOT_CONFIGURED');
 h=await health(b);assert.equal(h.data.data.devices.total,1);assert(!JSON.stringify(h.data).includes('password_hash'));assert(!JSON.stringify(h.data).includes('last_error'));
 await require('../src/cron/scheduler').runScheduledTransitions();
 h=await health(b);assert(h.data.data.cron.last_success_at);
 const scheduler=require('../src/services/schedulerState');const successAt=scheduler.getSchedulerState().last_success_at;scheduler.markFailed({startedAt:new Date(),error:new Error('synthetic')});assert.equal(scheduler.getSchedulerState().last_success_at,successAt);
 console.log('SYSTEM_HEALTH_OK: JWT required, own devices/admin infrastructure, no raw errors, successful cron survives failed cron');
 // Inspect the existing local database metadata only; never read account rows or change its schema.
 const metadata={columns:await manager.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=:schema ORDER BY TABLE_NAME,ORDINAL_POSITION',{replacements:{schema:original},type:require('sequelize').QueryTypes.SELECT}),
 indexes:await manager.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=:schema ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',{replacements:{schema:original},type:require('sequelize').QueryTypes.SELECT}),
 constraints:await manager.query('SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=:schema',{replacements:{schema:original},type:require('sequelize').QueryTypes.SELECT})};
 const fs=require('fs');fs.mkdirSync(require('path').resolve(__dirname,'../tests/database'),{recursive:true});fs.writeFileSync(require('path').resolve(__dirname,'../tests/database/schema-observed.json'),JSON.stringify({observed_at:new Date().toISOString(),environment:'local-existing-database-metadata-only',...metadata},null,2));
 // Confirm a legacy authentication gap with synthetic data in the disposable database.
 app.use('/api/jobs',require('../src/routes/jobs'));
 const Job=require('../src/models/JobAccount');
 await Job.create({owner_username:a.username,username:'audit_only_job',password:'synthetic',raw_data:'synthetic',status:'ACCOUNT_CHAY',job_type:'chrome'});
 const unauth=await fetch(base+'/api/jobs/get-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:a.username,device_id:'UNAUTH_DEVICE',job_type:'chrome'})});
 const unauthBody=await unauth.json();
 fs.writeFileSync(require('path').resolve(__dirname,'../tests/security/legacy-auth-observed.json'),JSON.stringify({http_status:unauth.status,success:unauthBody.success,returned_account:!!unauthBody.data,expected_status:401},null,2));
 assert.equal(unauth.status,401,'Legacy phone API must require authentication');

 const spoof=await fetch(base+'/api/jobs/get-account',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':a.username},body:JSON.stringify({user:b.username,device_id:'SPOOF_DEVICE',job_type:'chrome'})});
 const spoofBody=await spoof.json();assert.equal(spoof.status,200);assert.equal(spoofBody.data.account.owner_username,a.username);
 await a.update({is_active:false});assert.equal((await api(a,'/api/device/heartbeat',{device_id:'BLOCKED'})).status,401);await a.update({is_active:true});
 console.log('LEGACY_AUTH_REGRESSION_OK: unauthenticated POST jobs/get-account HTTP '+unauth.status);
 // Virtual clients; no external provider calls. One synthetic IG account per device, no real credentials.
 await IG.bulkCreate(Array.from({length:1000},(_,i)=>({owner_username:a.username,kind:'job',uid:'farm_'+i,raw_data:'synthetic',device_id:'FARM_'+i,status:'LOGIN_THANH_CONG',live_status:'live',login_at:new Date()})));

 app.post('/api/test/commit-and-drop',require('../src/middleware/apiKeyAuth'),async(req,res,next)=>{try{await require('../src/services/taskDispatcherService').getNextTask({owner:req.api_owner_username,deviceId:'FARM_0',req});res.destroy();}catch(e){next(e);}});
 await assert.rejects(api(a,'/api/test/commit-and-drop',{device_id:'FARM_0'}));
 assert.equal(await Run.count({where:{owner_username:a.username,status:'RUNNING'}}),1);
 const committed=await Run.findOne({where:{owner_username:a.username,device_id:'FARM_0'}});
 assert.equal((await api(a,'/api/device/next-task',{device_id:'FARM_0'})).data.task.id,Number(committed.id));
 app.post('/api/test/report-and-drop',require('../src/middleware/apiKeyAuth'),async(req,res,next)=>{try{await require('../src/services/taskReportService').reportTask({owner:req.api_owner_username,taskId:req.body.task_id});res.destroy();}catch(e){next(e);}});
 const results=[],taskIds=new Map();

 const measure=async(operation,n,call)=>{const cpu=process.cpuUsage(),wall=Date.now();const durations=[];
 let position=0;const rows=new Array(n);const client=async i=>{const start=Date.now();try{const r=await call(i);durations.push(Date.now()-start);return r;}catch(e){return {status:0,data:{},transport_error:e.cause?.code||e.name};}};
 if(operation.startsWith('bounded-'))await Promise.all(Array.from({length:Math.min(50,n)},async()=>{while(position<n){const i=position++;rows[i]=await client(i);}}));else rows.splice(0,n,...await Promise.all(Array.from({length:n},(_,i)=>client(i))));
 const elapsed=Date.now()-wall,used=process.cpuUsage(cpu);durations.sort((a,b)=>a-b);
 const errors=rows.filter(r=>r.status!==200).length;
 const error_categories=Object.fromEntries([...new Set(rows.filter(r=>r.status!==200).map(r=>r.transport_error||String(r.status)))].map(key=>[key,rows.filter(r=>(r.transport_error||String(r.status))===key).length]));
 results.push({operation,clients:n,max_http_inflight:operation.startsWith('bounded-')?Math.min(50,n):n,elapsed_ms:elapsed,rps:n/(elapsed/1000),successful_rps:(n-errors)/(elapsed/1000),average_ms:durations.reduce((x,y)=>x+y,0)/durations.length,p95_ms:durations[Math.floor((durations.length-1)*.95)],p99_ms:durations[Math.floor((durations.length-1)*.99)],errors,error_categories,cpu_ms:(used.user+used.system)/1000,rss_bytes:process.memoryUsage().rss,pool_max:10});
 fs.mkdirSync(path.resolve(__dirname,'../tests/performance'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tests/performance/results.json'),JSON.stringify({environment:'isolated-local-burst-HTTP-with-retry',results},null,2));console.log('FARM_LOAD '+JSON.stringify(results.at(-1)));return rows;};
 for(const n of [1,10,50,100,200,500,1000]){
 const rows=await measure('next-task',n,i=>api(a,'/api/device/next-task',{device_id:'FARM_'+i,request_id:'audit-'+n+'-'+i,timestamp:new Date().toISOString()}));
 for(let i=0;i<rows.length;i++)if(rows[i].status!==200)rows[i]=await api(a,'/api/device/next-task',{device_id:'FARM_'+i});
 assert(rows.every(r=>r.status===200&&r.data.task),'All clients receive or resume after retry');
 const ids=rows.map(r=>r.data.task.id);assert.equal(new Set(ids).size,n);assert.equal(new Set(rows.map(r=>r.data.task.account_id)).size,n);
 rows.forEach((r,i)=>{if(taskIds.has(i))assert.equal(r.data.task.id,taskIds.get(i));taskIds.set(i,r.data.task.id);});
 await measure('heartbeat',n,i=>api(a,'/api/device/heartbeat',{device_id:'FARM_'+i}));
 }
 assert.equal(await Run.count({where:{owner_username:a.username,status:'RUNNING'}}),1000);
 assert.equal(await Device.count({where:{owner_username:a.username}}),1000);
 await assert.rejects(api(a,'/api/test/report-and-drop',{task_id:taskIds.get(0)}));
 assert.equal((await Run.findByPk(taskIds.get(0))).status,'SUCCESS');
 const reports=await measure('task-report',1000,i=>api(a,'/api/device/task/report',{task_id:taskIds.get(i)}));for(let i=0;i<reports.length;i++)if(reports[i].status!==200)reports[i]=await api(a,'/api/device/task/report',{task_id:taskIds.get(i)});assert(reports.every(r=>r.status===200));
 const duplicates=await measure('duplicate-task-report',1000,i=>api(a,'/api/device/task/report',{task_id:taskIds.get(i)}));for(let i=0;i<duplicates.length;i++)if(duplicates[i].status!==200)duplicates[i]=await api(a,'/api/device/task/report',{task_id:taskIds.get(i)});assert(duplicates.every(r=>r.status===200&&(r.data.already_reported===true||r.data.data?.already_reported===true)));

 assert.equal(await Run.count({where:{owner_username:a.username,status:'SUCCESS'}}),1000);
 const phoneConfig=async i=>{const r=await fetch(base+'/api/machine-api-configs/device/FARM_'+i,{headers:{'x-api-key':a.username}});return {status:r.status,data:await r.json()};};
 for(const n of [10,50,100,200,500,1000]){
 await Promise.all([require('../src/cron/scheduler').runScheduledTransitions(),measure('bounded-get-config',n,phoneConfig)]);
 const accounts=await measure('bounded-get-account',n,i=>api(a,'/api/instagram/job/get-login-success-account',{device_id:'FARM_'+i}));
 assert(accounts.every(r=>r.status===200&&r.data.data?.account),'Legacy account API works under bounded load');
 const dashboards=await measure('bounded-dashboard',n,()=>api(a,'/api/dashboard/summary'));
 assert(dashboards.every(r=>r.status===200&&r.data.data.devices.summary.total===1000),'Dashboard stays consistent while cron runs');
 }

 fs.mkdirSync(require('path').resolve(__dirname,'../tests/performance'),{recursive:true});fs.writeFileSync(require('path').resolve(__dirname,'../tests/performance/results.json'),JSON.stringify({environment:'local-disposable-db-real-HTTP-virtual-clients',rate_limiter:'not-mounted; route/controller/SQL benchmark',results},null,2));
 fs.mkdirSync(path.resolve(__dirname,'../tests/recovery'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tests/recovery/commit-and-drop.json'),JSON.stringify({assignment_commit_drop_resume:'PASS',report_commit_drop_retry:'PASS',unique_accounts:1000,unique_tasks:1000,terminal_success_rows:1000},null,2));
 console.log('FARM_AUDIT_OK: 1000 unique tasks/accounts, stable resume, terminal reports idempotent');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
