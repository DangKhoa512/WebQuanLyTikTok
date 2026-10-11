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


 const account=await FB.create({owner_username:a.username,kind:'job',uid:'cron_synthetic',raw_data:'synthetic',status:'DA_CHAY_XONG',completed_at:new Date(Date.now()-48*3600000),locked_by:'CRON_DEVICE',locked_at:new Date()});
 const Page=require('../src/models/FacebookPageJob');const page=await Page.create({owner_username:a.username,facebook_account_id:account.id,page_id:'cron_page',job_status:'DA_LAM',completed_at:new Date(Date.now()-48*3600000)});
 const run=await Run.create({owner_username:a.username,device_id:'CRON_DEVICE',task_type:'PAGE_JOB',entity_type:'facebook_account',entity_id:account.id,account_id:account.id,locked_by:'CRON_DEVICE',locked_at:new Date(),status:'RUNNING'});
 const workflow=require('../src/services/facebookWorkflowService');
 await workflow.runFacebookWorkflowResets();await account.reload();await page.reload();assert.equal(account.status,'DA_CHAY_XONG','Cron must retain domain state while task is active');assert.equal(account.locked_by,'CRON_DEVICE');assert.equal(page.job_status,'DA_LAM');
 await run.update({status:'SUCCESS'});await Promise.all([workflow.runFacebookWorkflowResets(),workflow.runFacebookWorkflowResets()]);await account.reload();await page.reload();assert.equal(account.status,'LOGIN_THANH_CONG');assert.equal(page.job_status,'CHUA_LAM');

 await account.update({status:'DA_CHAY_XONG',completed_at:new Date(Date.now()-48*3600000),locked_by:'REG_DEVICE'});await page.update({job_status:'DA_LAM'});
 const regRun=await Run.create({owner_username:a.username,device_id:'REG_DEVICE',task_type:'REG_INSTAGRAM',entity_type:'instagram_facebook_reg_claim',entity_id:1,account_id:account.id,locked_by:'REG_DEVICE',locked_at:new Date(),status:'RUNNING'});
 await workflow.runFacebookWorkflowResets();await account.reload();assert.equal(account.status,'DA_CHAY_XONG','Cron must retain FB source of active REG_INSTAGRAM');
 await regRun.update({status:'SUCCESS'});
 console.log('CRON_ACTIVE_PROTECTION_OK: active task retained, terminal task cooldown resets, concurrent reset idempotent');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
