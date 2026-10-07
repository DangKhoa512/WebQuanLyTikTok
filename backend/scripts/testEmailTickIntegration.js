const path=require('path'),crypto=require('crypto'),assert=require('assert');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Sequelize}=require('sequelize');
const original=process.env.DB_NAME,testDb='quanly_emailtick_test_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const safe=()=>/^quanly_emailtick_test_[0-9]+_[a-f0-9]+$/.test(testDb)&&testDb!==original;
if(!safe())throw Error('Unsafe database');
const manager=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,dialect:'mysql',logging:false});
let db,server,providerServer,created=false;
const logger=require('../src/config/logger'),oldLogs={},logs=[];
for(const key of ['info','warn','error','debug']){oldLogs[key]=logger[key];logger[key]=(...args)=>logs.push(args);}
(async()=>{
 await manager.query('CREATE DATABASE `'+testDb+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');created=true;
 process.env.DB_NAME=testDb;
 const express=require('express'),mock=express();mock.use(express.json());
 let sequence=0,mode='normal',emails=[],providerCalls=[],mailboxCodes=[];
 mock.post('/get-mailbox',(req,res)=>{providerCalls.push({path:req.path,body:req.body,origin:req.headers.origin,referer:req.headers.referer});if(mode==='cloudflare')return res.status(403).type('html').send('<title>Just a moment...</title>Enable JavaScript and cookies to continue');if(mode==='bad-schema')return res.json({success:true,email:'invalid',code:'fake'});const code='synthetic-private-mailbox-'+(++sequence);mailboxCodes.push(code);res.json({success:true,email:'test'+sequence+'@example.test',code});});
 mock.post('/activate-email',(req,res)=>{providerCalls.push({path:req.path,body:req.body});res.json({success:mode!=='activate-fail'});});
 mock.post('/get-emails',(req,res)=>{providerCalls.push({path:req.path,body:req.body});if(mode==='cloudflare')return res.status(403).type('html').send('<title>Just a moment...</title>challenge-platform');if(mode==='expired')return res.json({success:false,error:'INVALID_MAILBOX'});return res.json({success:true,emails});});
 providerServer=mock.listen(0,'127.0.0.1');await new Promise(resolve=>providerServer.once('listening',resolve));
 process.env.EMAILTICK_BASE_URL='http://127.0.0.1:'+providerServer.address().port;process.env.EMAILTICK_TIMEOUT_MS='500';process.env.EMAILTICK_RETRY_COUNT='1';process.env.EMAILTICK_RETRY_DELAY_MS='1';process.env.EMAILTICK_ALLOWED_TYPES='1,2,3,4,5';process.env.EMAILTICK_RANDOM_TYPES='3,4,5';
 db=require('../src/config/database');const User=require('../src/models/User'),Mailbox=require('../src/models/EmailTickMailbox');await User.sync({logging:false});await Mailbox.sync({logging:false});
 const owner=await User.create({username:'emailtick_test_user',password_hash:'test-only',role:'user'},{logging:false});const other=await User.create({username:'emailtick_test_other',password_hash:'test-only',role:'user'},{logging:false});
 const app=require('../src/app');server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let base='http://127.0.0.1:'+server.address().port;
 const request=async(url,body,username=owner.username)=>{const response=await fetch(base+'/api/emailtick'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(username===null?{}:{'x-api-key':username})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json()};};
 assert.equal((await request('/new',{types:1},null)).status,401);assert.equal(providerCalls.length,0);
 for(const types of [1,2,'1,2',[1,2],'1,2,2','random']){const response=await request('/new',{types});assert.equal(response.status,200);assert(response.data.success);assert(response.data.mailbox_id.match(/^[0-9a-f-]{36}$/));assert(!('mailbox_code' in response.data));assert(!('code' in response.data));}
 let result=await request('/new',{types:'random',random_count:2});assert.equal(result.data.types.length,2);assert.equal(new Set(result.data.types).size,2);
 const mailboxId=result.data.mailbox_id,codeUrl='/code?mailbox_id='+mailboxId;
 const saved=await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false});assert.equal(saved.status,'ACTIVE');assert(saved.mailbox_code.startsWith('synthetic-private-mailbox-'));
 const hidden=await Mailbox.findOne({where:{mailbox_id:mailboxId},logging:false});assert.equal(hidden.toJSON().mailbox_code,undefined);
 assert(providerCalls.filter(call=>call.path==='/get-mailbox').every(call=>Array.isArray(call.body.types)&&call.origin===process.env.EMAILTICK_BASE_URL&&call.referer===process.env.EMAILTICK_BASE_URL+'/'));
 let count=providerCalls.length;assert.equal((await request('/new',{types:999})).status,400);assert.equal(providerCalls.length,count);
 assert.equal((await request('/new',{types:'random',random_count:0})).status,400);
 assert.equal((await request('/code?mailbox_id='+mailboxId,undefined,other.username)).status,404);assert.equal(providerCalls.length,count);
 assert.equal((await request('/code?mailbox_id=invalid')).status,400);
 assert.equal((await request(codeUrl+'&provider=invalid')).status,400);
 assert.equal((await request(codeUrl+'&mailbox_code=synthetic-do-not-log')).status,400);
 assert.deepEqual((await request(codeUrl)).data,{success:true,status:'WAITING',code:null});
 const time=Math.floor(Date.now()/1000);
 emails=[{code:'older',fromName:'Instagram',subject:'111111 is your code',time:time-1000},{code:'wrong-sender',fromName:'Shop',subject:'222222',time:time+2},{code:'latest',fromName:'Instagram',subject:'041374 is your Instagram code',time:time+1}];
 result=await request(codeUrl);assert.deepEqual(result.data,{success:true,status:'RECEIVED',code:'041374'});assert.equal(typeof result.data.code,'string');
 assert.deepEqual((await request(codeUrl)).data,{success:true,status:'WAITING',code:null});
 emails.push({code:'race-message',fromName:'Instagram',subject:'000009 is your code',time:time+2});
 const race=await Promise.all([request(codeUrl),request(codeUrl)]);assert.equal(race.filter(row=>row.data.status==='RECEIVED').length,1);assert.equal(race.filter(row=>row.data.status==='WAITING').length,1);
 emails=[{code:'tie-a',fromName:'Instagram',subject:'000010',time:time+3},{code:'tie-b',fromName:'Instagram',subject:'000011',time:time+3}];
 assert.equal((await request(codeUrl)).data.status,'RECEIVED');assert.equal((await request(codeUrl)).data.status,'RECEIVED');assert.equal((await request(codeUrl)).data.status,'WAITING');
 // New process/connection can read persisted last-message state; migration reruns preserve it.
 const before=(await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false})).toJSON();
 const {spawnSync}=require('child_process');for(let i=0;i<2;i++){const migration=spawnSync(process.execPath,[path.resolve(__dirname,'migrateEmailTick.js'),'--apply'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);}
 const after=(await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false})).toJSON();assert.deepEqual(after,before,'Idempotent migration retains credentials/history');
 await new Promise(resolve=>server.close(resolve));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;assert.equal((await request(codeUrl)).data.status,'WAITING');
 mode='activate-fail';const activeBefore=await Mailbox.count({where:{status:'ACTIVE'},logging:false});result=await request('/new',{types:1});assert.equal(result.status,502);assert.equal(result.data.success,false);assert.equal(await Mailbox.count({where:{status:'ACTIVE'},logging:false}),activeBefore);assert.equal(await Mailbox.count({where:{status:'ERROR'},logging:false}),1);
 mode='cloudflare';count=providerCalls.length;result=await request('/new',{types:1});assert.equal(result.data.error,'EMAILTICK_CLOUDFLARE_CHALLENGE');assert.equal(providerCalls.length,count+1,'No challenge retry');assert(!JSON.stringify(result.data).includes('<title>'));
 result=await request(codeUrl);assert.equal(result.data.error,'EMAILTICK_CLOUDFLARE_CHALLENGE');
 mode='expired';assert.equal((await request(codeUrl)).status,410);assert.equal((await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false})).status,'EXPIRED');
 mode='bad-schema';assert.equal((await request('/new',{types:1})).data.error,'EMAILTICK_INVALID_RESPONSE');mode='normal';
 const text=JSON.stringify(logs);for(const secret of mailboxCodes)assert(!text.includes(secret),'No mailbox credentials in logs, including SQL');for(const otp of ['041374','000009','000010','000011'])assert(!text.includes(otp),'No OTP in logs');assert(!text.includes('synthetic-do-not-log'));
 // Exercise the AutoTouch client with its real POSIX curl against a child API/provider and test DB.
 const {fork}=require('child_process');const child=fork(path.resolve(__dirname,'emailTickHttpTestServer.js'),[],{silent:true,env:process.env});
 try {
  const address=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Test child exited '+code)));});
  const API={},install=require('../../tools/autotouch/emailtick');install(API,{getBaseUrl:()=>address.url,getApiKey:()=>owner.username,allowHttp:true,safeParse:JSON.parse,sleep:()=>{},exec:cmd=>{const result=spawnSync(cmd,{shell:process.platform==='win32'?path.join(process.env.ProgramFiles||'C:/Program Files','Git/bin/bash.exe'):'/bin/sh',encoding:'utf8',timeout:35000});return result.status===0?result.stdout:'';}});
  const createdMailbox=API._EmailTick_New('random',2);assert(createdMailbox.mailbox_id);assert(createdMailbox.email);assert.equal(API._EmailTick_GetCode(createdMailbox.mailbox_id),'041374');
  child.send('stop');await new Promise(resolve=>child.once('exit',resolve));
 }finally{if(!child.killed)child.kill();}
 console.log('EMAILTICK_INTEGRATION_OK: real HTTP provider->activate->MySQL->VPS/curl, hidden credentials, random types, sender/newest/old OTP, same-time messages, concurrency, persistence/migration, owner/auth, activation errors and Cloudflare');
})().catch(err=>{console.error(err.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(providerServer)await new Promise(resolve=>providerServer.close(resolve));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+testDb+'`');await manager.close();for(const key of Object.keys(oldLogs))logger[key]=oldLogs[key];});
