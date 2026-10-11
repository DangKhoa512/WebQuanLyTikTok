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


 for(const [user,type] of [[a,'NUOI_FACEBOOK'],[a,'REG_INSTAGRAM'],[b,'INSTAGRAM_JOB']])await Run.create({owner_username:user.username,device_id:'TEST',task_type:type,entity_type:'test',entity_id:1,locked_by:'TEST',locked_at:new Date(),status:'FAILED'});
 const result=await api(a,'/api/dashboard/summary');assert.equal(result.status,200);assert(result.data.data.task_failures,'Dashboard must separate failed executions from account/claim errors');
 assert.equal(result.data.data.task_failures.total,2);assert.equal(result.data.data.task_failures.by_type.NUOI_FACEBOOK,1);assert.equal(result.data.data.task_failures.by_type.REG_INSTAGRAM,1);assert(!result.data.data.task_failures.by_type.INSTAGRAM_JOB);

 await IG.bulkCreate(['LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG'].map((status,i)=>({owner_username:a.username,kind:'job',uid:'ready_'+i,device_id:'READY',raw_data:'synthetic',status,cookies:'synthetic'})));
 const ready=await api(a,'/api/dashboard/summary');assert.equal(ready.data.data.tasks.nurture_instagram.ready,1,'New IG nurture inventory must require LOGIN_THANH_CONG');

 const fbFixtures=await FB.bulkCreate([{kind:'job',status:'LOGIN_THANH_CONG'},{kind:'job',status:'DA_CHAY_XONG',nurture_status:'DA_NUOI'},{kind:'reg',status:'CHO_LOGIN'},{kind:'job',status:'ACCOUNT_DIE',live_status:'die'},{kind:'job',status:'LOGIN_THANH_CONG',trashed_at:new Date()}].map((row,i)=>({owner_username:a.username,uid:'reconcile_'+i,raw_data:'synthetic',...row})));
 const Page=require('../src/models/FacebookPageJob');await Page.bulkCreate(['CHUA_LAM','DANG_LAM','DA_LAM'].map((job_status,i)=>({owner_username:a.username,facebook_account_id:fbFixtures[0].id,page_id:'p_'+i,job_status})));
 await Device.bulkCreate([{device_id:'SEEN_10',reported_status:'RUNNING',last_seen:new Date(Date.now()-10*60000)},{device_id:'SEEN_25',reported_status:'IDLE',last_seen:new Date(Date.now()-25*60000)},{device_id:'SEEN_31',reported_status:'RUNNING',last_seen:new Date(Date.now()-31*60000)}].map(d=>({...d,owner_username:a.username})));
 const snapshot=(await api(a,'/api/dashboard/summary')).data.data;
 // Independent fixture reads and JavaScript predicates, not dashboard SQL reused.
 const fbRows=await FB.findAll({where:{owner_username:a.username},attributes:['kind','status','live_status','nurture_status','trashed_at'],raw:true});
 const igRows=await IG.findAll({where:{owner_username:a.username},attributes:['kind','status','live_status','nurture_status','trashed_at'],raw:true});
 const pageRows=await Page.findAll({where:{owner_username:a.username},attributes:['is_active','job_status'],raw:true});
 const checks=[];
 const check=(metric,expected,actual)=>{checks.push({metric,expected,actual,difference:actual-expected,status:actual===expected?'PASS':'FAIL'});assert.equal(actual,expected,metric);};
 for(const [platform,rows] of [['facebook',fbRows],['instagram',igRows]]){const live=rows.filter(r=>!r.trashed_at);check(platform+'.total',live.length,snapshot.accounts[platform].total);check(platform+'.'+(platform==='facebook'?'login_success':'active'),live.filter(r=>r.kind==='job'&&r.status==='LOGIN_THANH_CONG').length,snapshot.accounts[platform][platform==='facebook'?'login_success':'active']);check(platform+'.not_nurtured',live.filter(r=>r.kind==='job'&&r.nurture_status==='CHUA_NUOI').length,snapshot.accounts[platform].not_nurtured);check(platform+'.errors',live.filter(r=>['LOGIN_FAIL','ACCOUNT_DIE'].includes(r.status)||r.live_status==='die').length,snapshot.accounts[platform].errors);}
 check('page.total',pageRows.filter(r=>r.is_active).length,snapshot.accounts.pages.total);for(const [metric,status] of [['ready','CHUA_LAM'],['running','DANG_LAM'],['done','DA_LAM']])check('page.'+metric,pageRows.filter(r=>r.is_active&&r.job_status===status).length,snapshot.accounts.pages[metric]);
 for(const [metric,value] of [['total',4],['running',1],['idle',1],['offline',2]])check('device.'+metric,value,snapshot.devices.summary[metric]);
 check('task_failed_history',2,snapshot.task_failures.total);
 const fs=require('fs');fs.mkdirSync(path.resolve(__dirname,'../tests/dashboard'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tests/dashboard/reconciliation.json'),JSON.stringify({fixture:'synthetic-owner-A-independent-reads',checks},null,2));
 console.log('DASHBOARD_FAILURE_COUNTS_OK: independent execution count, no foreign user, no mixed unit sum');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
