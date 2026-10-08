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
 const heartbeat=(user=a,body={})=>api(user,'/api/device/heartbeat',{device_id:'SAME_DEVICE',...body});
 await heartbeat();await heartbeat(b);
 const clock=new Date(Math.floor(Date.now()/1000)*1000),stale=new Date(clock-31*60000);
 for(const minutes of [10,25,30,31]){
  await Device.update({last_seen:new Date(clock-minutes*60000)},{where:{owner_username:a.username}});
  assert.equal(await monitorDevices(a.username,clock),minutes>30?1:0);
  assert.equal(await Health.count({where:{owner_username:a.username}}),minutes>30?1:0);
 }
 const health=await Health.findOne({where:{owner_username:a.username}});assert.equal(health.status,'OFFLINE');assert.equal(health.alert_code,'DEVICE_UNRESPONSIVE');assert.equal(+health.unresponsive_since,+stale+1800000);
 const firstDetected=+health.detected_at;await monitorDevices(a.username,new Date(+clock+5000));await health.reload();assert.equal(+health.detected_at,firstDetected);
 await require('../src/cron/scheduler').runScheduledTransitions();
 assert.equal(require('../src/services/schedulerState').getSchedulerState().status,'ONLINE');
 await Health.sync({force:false,alter:false});await Health.sync({force:false,alter:false});assert.equal(await Health.count(),1);
 assert.equal(await Health.count({where:{owner_username:b.username}}),0);
 let summary=await api(a,'/api/dashboard/summary?device_status=DEVICE_UNRESPONSIVE');assert.equal(summary.data.data.devices.filtered_total,1);assert.equal(summary.data.data.devices.unresponsive_total,1);assert.equal(summary.data.data.devices.rows[0].status,'OFFLINE');assert(summary.data.data.devices.rows[0].unresponsive_seconds>=60);
 assert.equal((await api(b,'/api/dashboard/summary?device_status=DEVICE_UNRESPONSIVE')).data.data.devices.filtered_total,0);
 // Invalid signals never clear an alert or refresh last_seen.
 assert.equal((await heartbeat(a,{task_id:999999})).status,409);assert.equal((await api(a,'/api/device/task/report',{task_id:999999})).status,404);
 assert.equal(+((await Device.findOne({where:{owner_username:a.username}})).last_seen),+stale);assert.equal(await Health.count(),1);
 assert.equal((await heartbeat()).status,200);assert.equal(await Health.count(),0);assert.equal((await api(a,'/api/dashboard/summary')).data.data.devices.rows[0].status,'IDLE');
 // A long-running task keeps its reservation even after losing all signals.
 const account=await IG.create({owner_username:a.username,kind:'job',uid:'synthetic_monitor',raw_data:'test-only',device_id:'SAME_DEVICE',status:'DANG_LAM',locked_by:'SAME_DEVICE',locked_at:stale,login_at:new Date(clock-86400000)});
 const run=await Run.create({owner_username:a.username,device_id:'SAME_DEVICE',task_type:'INSTAGRAM_JOB',entity_type:'INSTAGRAM_ACCOUNT',entity_id:account.id,account_id:account.id,uid:account.uid,locked_by:'SAME_DEVICE',locked_at:stale,payload:{account:{id:account.id,uid:account.uid}}});
 await Device.update({last_seen:stale,reported_status:'RUNNING'},{where:{owner_username:a.username}});
 const dispatcher=require('../src/services/taskDispatcherService');assert.equal(await dispatcher.releaseExpiredTasks(a.username),0);await run.reload();await account.reload();assert.equal(run.status,'RUNNING');assert.equal(account.status,'DANG_LAM');assert.equal(account.locked_by,'SAME_DEVICE');
 summary=await api(a,'/api/dashboard/summary?device_status=DEVICE_UNRESPONSIVE');assert.equal(summary.data.data.devices.rows[0].current_uid,account.uid);assert.equal(summary.data.data.devices.rows[0].current_task,'INSTAGRAM_JOB');
 // A separate legacy acquire must not expire the account held by the offline dispatcher task.
 const other=await api(a,'/api/instagram/job/get-login-success-account',{device_id:'OTHER_DEVICE'});assert.equal(other.status,200,JSON.stringify(other.data));await account.reload();assert.equal(account.status,'DANG_LAM');assert.equal(account.locked_by,'SAME_DEVICE');
 // GET TASK resumes the old id before attempting any new dispatch; cursor stays unchanged.
 const cursor=async()=>{const [rows]=await db.query('SELECT next_task_id FROM user_dispatcher_state WHERE user_id=:id',{replacements:{id:a.id}});return rows[0]?.next_task_id;};
 const requests=await Promise.all(Array.from({length:5},()=>api(a,'/api/device/next-task',{device_id:'SAME_DEVICE',capabilities:['INSTAGRAM_JOB']})));
 for(const result of requests){assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.task.id,Number(run.id));assert.equal(result.data.task.resumed,true);}
 assert.equal(await Run.count({where:{owner_username:a.username,status:'RUNNING'}}),1);assert.equal(await Health.count(),0);
 const before=await cursor();await api(a,'/api/device/next-task',{device_id:'SAME_DEVICE'});assert.equal(await cursor(),before);
 assert.equal((await api(a,'/api/dashboard/summary')).data.data.devices.rows[0].status,'RUNNING');
 // Disabled task still blocks new dispatch, but the valid request refreshes liveness.
 await registry.saveMine(a.username,[{task_id:igTask.id,enabled:false,priority:50}]);await Device.update({last_seen:stale},{where:{owner_username:a.username}});await monitorDevices(a.username);
 const disabled=await api(a,'/api/device/next-task',{device_id:'SAME_DEVICE'});assert.equal(disabled.data.has_task,false);assert.equal(await Health.count(),0);await run.reload();assert.equal(run.status,'RUNNING');assert.equal((await api(a,'/api/dashboard/summary')).data.data.devices.summary.running,1);
 // Heartbeat/report/cron concurrency does not leave stale warnings or duplicate tasks.
 await Device.update({last_seen:stale},{where:{owner_username:a.username}});await monitorDevices(a.username);
 await Promise.all([monitorDevices(a.username),heartbeat(a,{status:'IDLE'}),monitorDevices(a.username)]);assert.equal(await Health.count(),0);await run.reload();assert.equal(run.status,'RUNNING');
 // Failure is explicit, not inferred from the outage. ID-only reporting leaves domain data intact.
 await Device.update({last_seen:stale},{where:{owner_username:a.username}});await monitorDevices(a.username);
 const reported=await api(a,'/api/device/task/report',{task_id:run.id,status:'FAILED',error_code:'NETWORK_ERROR'});assert.equal(reported.status,200);assert.equal(await Health.count(),0);await account.reload();assert.equal(account.status,'DANG_LAM');assert.equal(account.locked_by,'SAME_DEVICE');
 summary=await api(a,'/api/dashboard/summary');assert.equal(summary.data.data.devices.rows[0].status,'IDLE');assert.equal(summary.data.data.devices.rows[0].last_task,'INSTAGRAM_JOB');
 await Device.update({last_seen:stale},{where:{owner_username:a.username}});await monitorDevices(a.username);assert.equal((await api(a,'/api/device/task/report',{task_id:run.id,status:'FAILED'})).status,200);assert.equal(await Health.count(),0);
 // The same device id of another user remains isolated during recovery/reporting.
 await Device.update({last_seen:stale},{where:{owner_username:b.username}});await monitorDevices(b.username);await heartbeat();assert.equal(await Health.count({where:{owner_username:b.username}}),1);
 assert.equal((await api(b,'/api/device/task/report',{task_id:run.id})).status,404);assert.equal(await Health.count({where:{owner_username:b.username}}),1);
 // Check all stale-lock predicates using real SQL, including registration claims.
 const {withoutActiveTask}=require('../src/services/activeTaskProtection');
 const facebook=await FB.create({owner_username:a.username,kind:'job',uid:'synthetic_fb',raw_data:'test-only',status:'DANG_LAM',locked_by:'SAME_DEVICE',locked_at:stale});
 const fbRun=await Run.create({owner_username:a.username,device_id:'SAME_DEVICE',task_type:'PAGE_JOB',entity_type:'FACEBOOK_PAGE_JOB',entity_id:5,account_id:facebook.id,locked_by:'SAME_DEVICE',locked_at:stale});
 assert.equal((await FB.update({locked_by:null},{where:{id:facebook.id,[Op.and]:withoutActiveTask('facebook_accounts','FACEBOOK')}}))[0],0);
 const Claim=require('../src/models/InstagramFacebookRegClaim');
 const claim=await Claim.create({owner_username:a.username,device_id:'SAME_DEVICE',facebook_account_id:facebook.id,facebook_uid:facebook.uid,status:'DANG_REG',locked_at:stale});
 await Run.create({owner_username:a.username,device_id:'SAME_DEVICE',task_type:'REG_INSTAGRAM',entity_type:'INSTAGRAM_REG_CLAIM',entity_id:claim.id,account_id:facebook.id,locked_by:'SAME_DEVICE',locked_at:stale});
 assert.equal((await Claim.update({status:'REG_FAIL'},{where:{id:claim.id,[Op.and]:withoutActiveTask('instagram_facebook_reg_claims','FACEBOOK',true)}}))[0],0);
 await fbRun.update({status:'SUCCESS'});assert.equal((await FB.update({locked_by:null},{where:{id:facebook.id,[Op.and]:withoutActiveTask('facebook_accounts','FACEBOOK')}}))[0],1);
 console.log('DEVICE_MONITORING_OK: 10/25/30/31-minute boundary; independent cron scan; first outage timestamp; warning/filter/user isolation; invalid signals; hold account/task; resume/idempotency/concurrent recovery; explicit failure; legacy stale-lock protection');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
