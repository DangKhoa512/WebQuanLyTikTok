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


 app.use('/api/accounts',require('../src/routes/accounts'));app.use('/api/chrome-accounts',require('../src/routes/chrome'));app.use('/api/jobs',require('../src/routes/jobs'));
 const Job=require('../src/models/JobAccount');await Job.create({owner_username:a.username,username:'audit_only_job',password:'synthetic',raw_data:'synthetic',status:'ACCOUNT_CHAY',job_type:'chrome'});
 for(const route of ['/api/accounts/get-account','/api/chrome-accounts/get-account','/api/jobs/get-account']){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);}
 const spoof=await fetch(base+'/api/jobs/get-account',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':a.username},body:JSON.stringify({user:b.username,device_id:'SPOOF_DEVICE',job_type:'chrome'})});const body=await spoof.json();assert.equal(spoof.status,200);assert.equal(body.data.account.owner_username,a.username);
 await a.update({is_active:false});assert.equal((await api(a,'/api/device/heartbeat',{device_id:'BLOCKED'})).status,401);assert.equal(await Device.count({where:{owner_username:a.username,device_id:'BLOCKED'}}),0);
 console.log('LEGACY_PHONE_AUTH_OK: no key rejected, key owner overrides spoofed owner, blocked user cannot register/heartbeat');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
