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
 const get=async(user=a)=>{const r=await fetch(base+'/api/system-health',{headers:{Authorization:'Bearer '+jwt.sign({id:user.id,username:user.username,role:user.role},process.env.JWT_SECRET)}});return {status:r.status,data:(await r.json()).data};};
 await Device.bulkCreate([{owner_username:a.username,device_id:'HEALTH_A',last_seen:new Date(Date.now()-31*60000)},{owner_username:a.username,device_id:'HEALTH_B',last_seen:new Date()},{owner_username:b.username,device_id:'FOREIGN',last_seen:new Date()}]);
 for(const device_id of ['HEALTH_A','HEALTH_B'])await Run.create({owner_username:a.username,device_id,task_type:'PAGE_JOB',entity_type:'facebook_account',entity_id:1,account_id:1,locked_by:device_id,locked_at:new Date(Date.now()-40*60000),status:'RUNNING'});
 let h=await get();assert.equal(h.status,200);assert.equal(h.data.devices.total,2);assert.equal(h.data.tasks.running,2);assert.equal(h.data.tasks.long_running,2);assert.equal(h.data.tasks.reservation_conflicts,1);for(const code of ['DEVICE_UNRESPONSIVE','LONG_RUNNING_TASK','RESERVATION_CONFLICT'])assert(h.data.alerts.some(a=>a.code===code));
 await Run.update({task_type:'INSTAGRAM_JOB'},{where:{owner_username:a.username,device_id:'HEALTH_B'}});h=await get();assert.equal(h.data.tasks.reservation_conflicts,0,'FB id 1 and IG id 1 are distinct resources');
 const metrics=require('../src/services/apiHealthMetrics'),EventEmitter=require('events');for(let i=0;i<20;i++){const res=new EventEmitter();res.statusCode=i<5?500:200;metrics.middleware({},res,()=>{});res.emit('finish');}
 assert(!(await get()).data.alerts.some(a=>a.code==='API_ERRORS'),'User cannot see global error metrics');assert((await get(b)).data.alerts.some(a=>a.code==='API_ERRORS'));
 const authenticate=db.authenticate;db.authenticate=async()=>{throw new Error('Synthetic failure');};try{h=await get();assert.equal(h.data.database.status,'ERROR');assert(h.data.alerts.some(a=>a.code==='DATABASE_UNAVAILABLE'));}finally{db.authenticate=authenticate;}
 console.log('SYSTEM_HEALTH_SIGNALS_OK: owner metrics, long-task/resource/offline alerts, cross-platform IDs, admin-only error rate, DB unavailable');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
