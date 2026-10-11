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


 const counterSQL="INSERT INTO app_settings (owner_username,setting_key,setting_value,created_at,updated_at) VALUES ('__audit__','cron_counter','1',NOW(),NOW()) ON DUPLICATE KEY UPDATE setting_value=CAST(setting_value AS UNSIGNED)+1";
 const code="const db=require('./src/config/database');require('./src/config/logger').silent=true;require('./src/models');const account=require('./src/services/accountService');account.runStatusTransitions=async()=>{await db.query("+JSON.stringify(counterSQL)+");await new Promise(r=>setTimeout(r,2000));};require('./src/cron/scheduler').runScheduledTransitions().finally(()=>db.close());";
 const child=()=>new Promise((resolve,reject)=>{const p=require('child_process').spawn(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'ignore'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(new Error('Cron child failed')));});
 await Promise.all([child(),child()]);
 const [row]=await db.query("SELECT setting_value FROM app_settings WHERE owner_username='__audit__' AND setting_key='cron_counter'",{type:require('sequelize').QueryTypes.SELECT});assert.equal(Number(row.setting_value),1,'Independent Node workers must not execute cron concurrently');

 const mutex=require('../src/services/cronLockService');
 await assert.rejects(mutex.withCronLock(async connection=>{connection.destroy();throw new Error('Synthetic connection loss');}),/Synthetic connection loss/);
 assert.equal((await mutex.withCronLock(async()=>{})).executed,true,'Connection loss releases DB mutex');
 const holderCode="const db=require('./src/config/database');require('./src/config/logger').silent=true;require('./src/services/cronLockService').withCronLock(async()=>{console.log('LOCKED');await new Promise(()=>{});});setInterval(()=>{},1000);";
 const holder=require('child_process').spawn(process.execPath,['-e',holderCode],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:['ignore','pipe','ignore']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Holder startup timeout')),10000);holder.stdout.on('data',chunk=>{if(String(chunk).includes('LOCKED')){clearTimeout(timer);resolve();}});holder.on('error',reject);});
 assert.equal((await mutex.withCronLock(async()=>{})).executed,false,'Live worker keeps mutex');
 holder.kill();await new Promise(r=>holder.once('exit',r));
 let reacquired=false;for(let i=0;i<20&&!reacquired;i++){reacquired=(await mutex.withCronLock(async()=>{})).executed;if(!reacquired)await new Promise(r=>setTimeout(r,100));}
 assert(reacquired,'Killed worker releases MySQL session lock');
 console.log('CRON_DISTRIBUTED_LOCK_OK: two real Node processes, one committed cron execution');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
