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

 await registry.saveMine(a.username,tasks.map(t=>({task_id:t.id,enabled:true,priority:t.default_priority})));
 for(const type of ['NUOI_FACEBOOK','REG_PAGE','PAGE_JOB','REG_INSTAGRAM','NUOI_INSTAGRAM','INSTAGRAM_JOB']){
  const facebook=['NUOI_FACEBOOK','REG_PAGE','PAGE_JOB','REG_INSTAGRAM'].includes(type),model=facebook?FB:IG,device='RESUME_'+type;
  assert.equal((await api(a,'/api/device/heartbeat',{device_id:device})).status,200);
  const account=await model.create({owner_username:a.username,kind:'job',uid:'synthetic_'+type,raw_data:'test-only',device_id:device,status:'DANG_LAM',locked_by:device,locked_at:new Date(),nurture_status:type.startsWith('NUOI_')?'DANG_NUOI':'CHUA_NUOI',nurture_locked_by:type.startsWith('NUOI_')?device:null});
  const run=await Run.create({owner_username:a.username,device_id:device,task_type:type,entity_type:facebook?'FACEBOOK_ACCOUNT':'INSTAGRAM_ACCOUNT',entity_id:account.id,account_id:account.id,uid:account.uid,locked_by:device,locked_at:new Date(),payload:{account:{id:account.id,status:'DANG_LAM',uid:account.uid}}});
  await account.update({status:'CHO_LOGIN'});
  const before=await Run.count();const payload=run.payload;
  const results=await Promise.all(Array.from({length:3},()=>api(a,'/api/device/next-task',{device_id:device})));
  for(const result of results){assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.has_task,false);assert.equal(result.data.task,null);}
  await run.reload();await account.reload();assert.equal(run.status,'RUNNING');assert.equal(account.status,'CHO_LOGIN');assert.equal(account.locked_by,device);assert.deepEqual(run.payload,payload);assert.equal(await Run.count(),before);
  const [cursorBefore]=await db.query('SELECT next_task_id FROM user_dispatcher_state WHERE user_id=:id',{replacements:{id:a.id}});
  await api(a,'/api/device/next-task',{device_id:device});
  const [cursorAfter]=await db.query('SELECT next_task_id FROM user_dispatcher_state WHERE user_id=:id',{replacements:{id:a.id}});assert.deepEqual(cursorAfter,cursorBefore);
  for(const state of [{status:'ACCOUNT_DIE',live_status:'unknown'},{status:'LOGIN_THANH_CONG',live_status:'die'}]){
   await account.update(state);
   const blocked=await api(a,'/api/device/next-task',{device_id:device});assert.equal(blocked.status,200);assert.equal(blocked.data.has_task,false);assert.equal(blocked.data.task,null);
   await run.reload();await account.reload();assert.equal(run.status,'RUNNING');assert.equal(account.locked_by,device);assert.equal(await Run.count(),before);assert.deepEqual(run.payload,payload);
  }
  await account.update({status:'LOGIN_THANH_CONG',live_status:'unknown'});
  const resumed=await api(a,'/api/device/next-task',{device_id:device});assert.equal(resumed.status,200,JSON.stringify(resumed.data));assert.equal(resumed.data.task.id,Number(run.id));assert.equal(resumed.data.task.resumed,true);
 }

 // Deleted/trashed sources must be retired atomically before another task is claimed.
 for(const type of ['NUOI_FACEBOOK','REG_PAGE','PAGE_JOB','REG_INSTAGRAM','NUOI_INSTAGRAM','INSTAGRAM_JOB'])for(const deletion of ['hard','trash']){
  const facebook=['NUOI_FACEBOOK','REG_PAGE','PAGE_JOB','REG_INSTAGRAM'].includes(type),model=facebook?FB:IG,device='MISSING_'+type+'_'+deletion;
  await api(a,'/api/device/heartbeat',{device_id:device});
  const source=await model.create({owner_username:a.username,kind:'job',uid:'synthetic_missing_'+type+'_'+deletion,raw_data:'test-only',device_id:device,status:'LOGIN_THANH_CONG',locked_by:device,locked_at:new Date()});
  const stale=await Run.create({owner_username:a.username,device_id:device,task_type:type,entity_type:facebook?'FACEBOOK_ACCOUNT':'INSTAGRAM_ACCOUNT',entity_id:source.id,account_id:source.id,uid:source.uid,locked_by:device,locked_at:new Date(),payload:{account:{id:source.id,status:'LOGIN_THANH_CONG'}}});
  if(deletion==='hard')await source.destroy();else await source.update({trashed_at:new Date()});
  const next=await IG.create({owner_username:a.username,kind:'job',uid:'synthetic_next_'+type+'_'+deletion,raw_data:'test-only',device_id:device,status:'LOGIN_THANH_CONG',login_at:new Date(Date.now()-10*86400000)});
  const claimed=await Promise.all(Array.from({length:3},()=>api(a,'/api/device/next-task',{device_id:device,capabilities:['INSTAGRAM_JOB']})));
  for(const result of claimed){assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.has_task,true);assert.equal(result.data.task.account_id,next.id);assert.notEqual(result.data.task.id,Number(stale.id));}
  assert.equal(new Set(claimed.map(r=>r.data.task.id)).size,1);
  await stale.reload();assert.equal(stale.status,'FAILED');assert.equal(stale.error_code,'SOURCE_ACCOUNT_UNAVAILABLE');assert(stale.completed_at);
  assert.equal(await Run.count({where:{owner_username:a.username,device_id:device,status:'RUNNING'}}),1);
  if(deletion==='trash'){const retained=await model.unscoped().findByPk(source.id);assert(retained.trashed_at);assert.equal(retained.locked_by,device);}
 }

 const emptyDevice='MISSING_NO_NEXT';await api(a,'/api/device/heartbeat',{device_id:emptyDevice});
 const emptyRun=await Run.create({owner_username:a.username,device_id:emptyDevice,task_type:'INSTAGRAM_JOB',entity_type:'INSTAGRAM_ACCOUNT',entity_id:99999999,account_id:99999999,locked_by:emptyDevice,locked_at:new Date(),payload:{account:{id:99999999}}});
 const empty=await api(a,'/api/device/next-task',{device_id:emptyDevice,capabilities:['INSTAGRAM_JOB']});assert.equal(empty.status,200);assert.equal(empty.data.code,0);assert.equal(empty.data.has_task,false);await emptyRun.reload();assert.equal(emptyRun.status,'FAILED');assert.equal(emptyRun.error_code,'SOURCE_ACCOUNT_UNAVAILABLE');
 const settings=require('../src/services/settingsService');
 await settings.saveInstagramNurtureSettings(a.username,{active_scenario_id:'resume',scenarios:[{id:'resume',name:'Resume test',actions:{newfeed:{enabled:true,min:30,max:60}}}]});
 const invalid=await IG.create({owner_username:a.username,kind:'job',uid:'synthetic_legacy_resume',raw_data:'test-only',device_id:'LEGACY_RESUME',status:'CHO_LOGIN',nurture_status:'DANG_NUOI',nurture_locked_by:'LEGACY_RESUME',nurture_locked_at:new Date()});
 const legacy=await api(a,'/api/instagram/nurture/get-account',{device_id:'LEGACY_RESUME'});assert.equal(legacy.status,404,JSON.stringify(legacy.data));assert.equal(legacy.data.data.account,null);await invalid.reload();assert.equal(invalid.status,'CHO_LOGIN');assert.equal(invalid.nurture_locked_by,'LEGACY_RESUME');
 for(const state of [{status:'ACCOUNT_DIE',live_status:'unknown'},{status:'LOGIN_THANH_CONG',live_status:'die'}]){
  await invalid.update(state);const rejected=await api(a,'/api/instagram/nurture/get-account',{device_id:'LEGACY_RESUME'});assert.equal(rejected.status,404);assert.equal(rejected.data.data.account,null);
 }
 await settings.saveFacebookNurtureSettings(a.username,{active_scenario_id:'resume',scenarios:[{id:'resume',name:'Resume test',actions:{newfeed:{enabled:true,min:30,max:60}}}]});
 const deadFB=await FB.create({owner_username:a.username,kind:'job',uid:'synthetic_fb_legacy_die',raw_data:'test-only',device_id:'FB_LEGACY_DIE',status:'LOGIN_THANH_CONG',live_status:'die',nurture_status:'DANG_NUOI',nurture_locked_by:'FB_LEGACY_DIE',nurture_locked_at:new Date()});
 const fbRejected=await api(a,'/api/facebook/nurture/get-account',{device_id:'FB_LEGACY_DIE'});assert.equal(fbRejected.status,404,JSON.stringify(fbRejected.data));assert.equal(fbRejected.data.data.account,null);await deadFB.reload();assert.equal(deadFB.nurture_locked_by,'FB_LEGACY_DIE');
 console.log('TASK_RESUME_LOGIN_STATE_OK: missing sources 6 types hard/trash -> next task, concurrency no duplicate; ACCOUNT_DIE/live_status die blocked; 6 task types, CHO_LOGIN blocked, concurrent requests, no new task/cursor/payload/domain changes, login restored resumes same id, legacy IG resume blocked');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
