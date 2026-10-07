const path=require('path'),crypto=require('crypto'),assert=require('assert');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Sequelize}=require('sequelize');
const original=process.env.DB_NAME,testDb='quanly_task_report_test_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const safe=()=>/^quanly_task_report_test_[0-9]+_[a-f0-9]+$/.test(testDb)&&testDb!==original;
if(!safe())throw Error('Unsafe database');
const manager=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,dialect:'mysql',logging:false});let db,server,created=false;
(async()=>{
 await manager.query('CREATE DATABASE `'+testDb+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');created=true;process.env.DB_NAME=testDb;
 db=require('../src/config/database');require('../src/models');await db.sync({logging:false});
 const User=require('../src/models/User'),Run=require('../src/models/DeviceTaskRun'),Device=require('../src/models/DashboardDevice'),IG=require('../src/models/InstagramAccount');
 await User.bulkCreate([{username:'task_report_fixture',password_hash:'fixture',role:'user'},{username:'task_report_other',password_hash:'fixture',role:'user'}],{logging:false});
 const ig=await IG.create({owner_username:'task_report_fixture',kind:'job',uid:'fixture_ig',raw_data:'fixture-only',status:'DANG_LAM',device_id:'DEVICE_DATA',locked_by:'DEVICE_DATA',locked_at:new Date(),live_status:'live'},{logging:false});
 const legacy=require('../src/services/legacyTaskAdapter');let legacyCalls=0;legacy.reportLegacyTask=legacy.releaseLegacyRegInstagram=async()=>{legacyCalls++;throw Error('Task-only report must never call legacy reporting');};
 const app=require('../src/app');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,body,key='task_report_fixture')=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(key===null?{}:{'x-api-key':key})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const report=(body,key)=>post('/api/device/task/report',body,key);
 const make=async(type='INSTAGRAM_JOB',deviceId='DEVICE_'+crypto.randomBytes(3).toString('hex'))=>{await Device.findOrCreate({where:{owner_username:'task_report_fixture',device_id:deviceId},defaults:{device_name:deviceId,current_task:type,current_uid:'fixture_ig',reported_status:'RUNNING',started_at:new Date(),last_seen:new Date()},logging:false});return Run.create({owner_username:'task_report_fixture',device_id:deviceId,task_type:type,entity_type:'INSTAGRAM_ACCOUNT',entity_id:ig.id,account_id:ig.id,uid:'fixture_ig',locked_by:deviceId,locked_at:new Date(),status:'RUNNING'},{logging:false});};
 const pathReport='/api/device/task/report';assert.equal((await report({task_id:1},null)).status,401);
 for(const task_id of [undefined,0,-1,'1abc',true,{},9007199254740992])assert.equal((await report({task_id})).status,400);
 assert.equal((await report({task_id:99999999})).status,404);
 const initial=JSON.stringify((await ig.reload({logging:false})).toJSON());
 for(const type of ['NUOI_FACEBOOK','NUOI_INSTAGRAM','REG_PAGE','REG_INSTAGRAM','PAGE_JOB','INSTAGRAM_JOB']){
  const run=await make(type),r=await report({task_id:run.id});assert.equal(r.status,200);assert.equal(r.data.task.status,'SUCCESS');assert.equal(r.data.already_reported,false);assert.equal(r.data.data,null);
  const done=await Run.findByPk(run.id,{logging:false});assert(done.completed_at);assert.equal(done.result,null);assert.equal((await Device.findOne({where:{device_id:run.device_id},logging:false})).reported_status,'IDLE');
  const completed=done.completed_at.getTime();const duplicate=await report({task_id:run.id});assert.equal(duplicate.data.already_reported,true);assert.equal((await Run.findByPk(run.id,{logging:false})).completed_at.getTime(),completed);
 }
 assert.equal(legacyCalls,0);assert.equal(JSON.stringify((await ig.reload({logging:false})).toJSON()),initial,'Task reporting must not modify account/locks');
 const owned=await make();assert.equal((await report({task_id:owned.id},'task_report_other')).status,404);assert.equal((await report({task_id:owned.id,device_id:'WRONG_DEVICE'})).status,409);assert.equal((await report({task_id:owned.id,owner_username:'task_report_other'})).status,200,'Authenticated owner overrides body');
 const race=await make();const responses=await Promise.all(Array.from({length:5},()=>report({task_id:race.id})));assert(responses.every(r=>r.status===200));assert.equal(responses.filter(r=>!r.data.already_reported).length,1,'Exactly one completion under race');
 const failed=await make();const failResult=await report({task_id:failed.id,status:'FAILED',error_code:'NETWORK_ERROR',message:'fixture failure'});assert.equal(failResult.data.task.status,'FAILED');assert.equal(failResult.data.retryable,true);assert.equal(failResult.data.task.retry_count,1);assert.equal((await report({task_id:failed.id,status:'FAILED'})).data.already_reported,true);assert.equal((await report({task_id:failed.id})).status,409);
 const released=await make();await released.update({status:'RELEASED'},{logging:false});assert.equal((await report({task_id:released.id})).status,409);
 const reporting=await make();await reporting.update({status:'REPORTING'},{logging:false});assert.equal((await report({task_id:reporting.id})).status,409);
 const same='DEVICE_LATE_REPORT',older=await make('INSTAGRAM_JOB',same),newer=await make('NUOI_INSTAGRAM',same);const d=await Device.findOne({where:{device_id:same},logging:false});await d.update({current_task:newer.task_type,current_uid:'new_fixture',reported_status:'RUNNING'},{logging:false});assert.equal((await report({task_id:older.id})).status,200);assert.equal((await d.reload({logging:false})).current_task,newer.task_type);await report({task_id:newer.id});assert.equal((await d.reload({logging:false})).reported_status,'IDLE');
 const dataRun=await make('INSTAGRAM_JOB','DEVICE_DATA');const old=await post('/api/instagram/job/report',{uid:'fixture_ig',device_id:'DEVICE_DATA',status:'DA_CHAY_XONG'});assert.equal(old.data.success,true);const afterLegacy=JSON.stringify((await ig.reload({logging:false})).toJSON());assert.equal((await report({task_id:dataRun.id,result:{instagram_account:'fixture-do-not-store'}})).status,200);assert.equal(JSON.stringify((await ig.reload({logging:false})).toJSON()),afterLegacy,'Legacy data report must not execute twice');assert.equal((await Run.findByPk(dataRun.id,{logging:false})).result,null);assert.equal(legacyCalls,0);
 console.log('TASK_REPORT_ONLY_OK: real HTTP/MySQL; ID-only default SUCCESS across 6 types, no legacy/domain writes, old API then completion, auth/owner/device, validation, idempotency/races, failure/retry metadata, final-status conflicts, preserve newer device task');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+testDb+'`');await manager.close();});
