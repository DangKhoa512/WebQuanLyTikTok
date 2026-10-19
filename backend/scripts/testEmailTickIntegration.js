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
 mock.post('/get-mailbox',(req,res)=>{providerCalls.push({path:req.path,body:req.body,origin:req.headers.origin,referer:req.headers.referer});if(mode==='rate-get')return res.status(429).set('Retry-After','120').json({message:'synthetic-limit-do-not-log'});if(mode==='cloudflare')return res.status(403).type('html').send('<title>Just a moment...</title>Enable JavaScript and cookies to continue');if(mode==='bad-schema')return res.json({success:true,email:'invalid',code:'fake'});const code='synthetic-private-mailbox-'+(++sequence);mailboxCodes.push(code);res.json({success:true,email:'test'+sequence+'@example.test',code});});
 mock.post('/activate-email',(req,res)=>{providerCalls.push({path:req.path,body:req.body});if(mode==='rate-activate')return res.status(429).set('Retry-After','30').json({message:'synthetic-limit-do-not-log'});res.json({success:mode!=='activate-fail'});});
 mock.post('/get-emails',(req,res)=>{providerCalls.push({path:req.path,body:req.body});if(mode==='rate-get')return res.status(429).set('Retry-After','120').json({message:'synthetic-limit-do-not-log'});if(mode==='cloudflare')return res.status(403).type('html').send('<title>Just a moment...</title>challenge-platform');if(mode==='expired')return res.json({success:false,error:'INVALID_MAILBOX'});return res.json({success:true,emails});});
 providerServer=mock.listen(0,'127.0.0.1');await new Promise(resolve=>providerServer.once('listening',resolve));
 process.env.EMAILTICK_BASE_URL='http://127.0.0.1:'+providerServer.address().port;process.env.EMAILTICK_TIMEOUT_MS='500';process.env.EMAILTICK_RETRY_COUNT='1';process.env.EMAILTICK_RETRY_DELAY_MS='1';process.env.EMAILTICK_ALLOWED_TYPES='1,2,3,4,5';process.env.EMAILTICK_RANDOM_TYPES='3,4,5';
 db=require('../src/config/database');await require('../src/models/AppSetting').sync({logging:false});const User=require('../src/models/User'),Mailbox=require('../src/models/EmailTickMailbox');await User.sync({logging:false});await Mailbox.sync({logging:false});
 const owner=await User.create({username:'emailtick_test_user',password_hash:'test-only',role:'user'},{logging:false});const other=await User.create({username:'emailtick_test_other',password_hash:'test-only',role:'user'},{logging:false});
 // Upgrade a populated legacy table, then verify the migration is safe to repeat.
 const legacyRow=await Mailbox.create({owner_username:owner.username,mailbox_id:crypto.randomUUID(),email:'legacy@example.test',mailbox_code:'synthetic-legacy-key',types:[4],status:'ERROR'},{logging:false});
 await db.getQueryInterface().removeColumn('emailtick_mailboxes','transport_context',{logging:false});
 await require('../src/services/emailTickMigration').up();await require('../src/services/emailTickMigration').up();
 const migratedRow=await Mailbox.unscoped().findByPk(legacyRow.id,{logging:false});
 assert.equal(migratedRow.mailbox_code,'synthetic-legacy-key');assert.equal(migratedRow.transport_context,null);assert.equal(migratedRow.status,'ERROR');
 const app=require('../src/app');server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let base='http://127.0.0.1:'+server.address().port;
 const request=async(url,body,username=owner.username)=>{const response=await fetch(base+'/api/emailtick'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(username===null?{}:{'x-api-key':username})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json()};};
 assert.equal((await request('/new',{types:1},null)).status,401);assert.equal(providerCalls.length,0);
 for(const types of [1,2,'1,2',[1,2],'1,2,2','random']){const response=await request('/new',{types});assert.equal(response.status,200);assert(response.data.success);assert(response.data.mailbox_id.match(/^[0-9a-f-]{36}$/));assert(!('mailbox_code' in response.data));assert(!('code' in response.data));}
 let result=await request('/new',{types:'random',random_count:2});assert.equal(result.data.types.length,2);assert.equal(new Set(result.data.types).size,2);
 const mailboxId=result.data.mailbox_id,codeUrl='/code?mailbox_id='+mailboxId;
 const saved=await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false});assert.equal(saved.status,'ACTIVE');assert(saved.mailbox_code.startsWith('synthetic-private-mailbox-'));
 const hidden=await Mailbox.findOne({where:{mailbox_id:mailboxId},logging:false});assert.equal(hidden.toJSON().mailbox_code,undefined);
 assert.equal(hidden.toJSON().transport_context,undefined);
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
 // 429 is preserved for legacy and common APIs; no automatic provider retry.
 for(const rateMode of ['rate-get','rate-activate']){
  mode=rateMode;
  const beforeRate=providerCalls.length;
  const activeCount=await Mailbox.count({where:{status:'ACTIVE'},logging:false});
  const rateResponse=await fetch(base+'/api/emailtick/new',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':owner.username},body:JSON.stringify({types:4})});
  assert.equal(rateResponse.status,429);
  const seconds=rateMode==='rate-get'?120:30;
  assert.equal(rateResponse.headers.get('retry-after'),String(seconds));
  assert.deepEqual(await rateResponse.json(),{success:false,status:'EMAILTICK_RATE_LIMITED',error:'EMAILTICK_RATE_LIMITED',retry_after_seconds:seconds});
  assert.equal(providerCalls.length,beforeRate+(rateMode==='rate-get'?1:2));
  assert.equal(await Mailbox.count({where:{status:'ACTIVE'},logging:false}),activeCount);
  const commonResponse=await fetch(base+'/api/mail/new',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':owner.username},body:JSON.stringify({provider:'EMAILTICK',types:4})});
  assert.equal(commonResponse.status,429);
  assert.equal(commonResponse.headers.get('retry-after'),String(seconds));
  assert.equal((await commonResponse.json()).retry_after_seconds,seconds);
 }
 mode='rate-get';
 const rateInbox=await request(codeUrl);
 assert.equal(rateInbox.status,429);
 assert.equal(rateInbox.data.error,'EMAILTICK_RATE_LIMITED');
 assert.equal((await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false})).status,'ACTIVE');
 mode='normal';
 mode='activate-fail';const errorsBefore=await Mailbox.count({where:{status:'ERROR'},logging:false});const activeBefore=await Mailbox.count({where:{status:'ACTIVE'},logging:false});result=await request('/new',{types:1});assert.equal(result.status,502);assert.equal(result.data.success,false);assert.equal(await Mailbox.count({where:{status:'ACTIVE'},logging:false}),activeBefore);assert.equal(await Mailbox.count({where:{status:'ERROR'},logging:false}),errorsBefore+1);
 mode='cloudflare';count=providerCalls.length;result=await request('/new',{types:1});assert.equal(result.data.error,'EMAILTICK_CLOUDFLARE_CHALLENGE');assert.equal(providerCalls.length,count+1,'No challenge retry');assert(!JSON.stringify(result.data).includes('<title>'));
 result=await request(codeUrl);assert.equal(result.data.error,'EMAILTICK_CLOUDFLARE_CHALLENGE');
 mode='expired';assert.equal((await request(codeUrl)).status,410);assert.equal((await Mailbox.unscoped().findOne({where:{mailbox_id:mailboxId},logging:false})).status,'EXPIRED');
 mode='bad-schema';assert.equal((await request('/new',{types:1})).data.error,'EMAILTICK_INVALID_RESPONSE');mode='normal';
 // Real authenticated API + owner settings + proxy agents; external network is stubbed.
 const axios=require('axios'),originalPost=axios.post;
 const settings=require('../src/services/settingsService');
 const proxyCalls=[];let failFirst=true,allDead=false;
 await settings.saveFacebookCheckProxySettings(owner.username,{proxies:['192.0.2.10:8100:fixture:synthetic-proxy-secret','192.0.2.11:8101:fixture:synthetic-proxy-secret']});
 await settings.saveFacebookCheckProxySettings(other.username,{proxies:['192.0.2.20:8200']});
 axios.post=async(url,payload,options)=>{
  assert.equal(options.proxy,false);assert(options.httpsAgent,'Configured owner must use a proxy');
  const hostname=options.httpsAgent.proxy.hostname;
  proxyCalls.push({hostname,path:new URL(url).pathname,ua:options.headers['User-Agent']});
  if(failFirst||allDead){failFirst=false;throw Object.assign(Error('synthetic-proxy-secret'),{code:'ETIMEDOUT'});}
  return originalPost(url,payload,{...options,httpAgent:undefined,httpsAgent:undefined});
 };
 try{
  let response=await request('/new',{types:4});assert.equal(response.status,200);
  const proxyMailbox=response.data.mailbox_id;
  assert.equal(proxyCalls.length,3);
  assert.notEqual(proxyCalls[0].hostname,proxyCalls[1].hostname);
  assert.equal(proxyCalls[1].hostname,proxyCalls[2].hostname,'Activation keeps the working proxy');
  assert(proxyCalls.every(call=>['192.0.2.10','192.0.2.11'].includes(call.hostname)));
  assert.equal(new Set(proxyCalls.map(call=>call.ua)).size,1);
  const createdContext=(await Mailbox.unscoped().findOne({where:{mailbox_id:proxyMailbox},logging:false})).transport_context;
  assert(/^[a-f0-9]{64}$/.test(createdContext.proxy_key));assert.equal(createdContext.user_agent,proxyCalls[2].ua);
  assert(!JSON.stringify(createdContext).includes('synthetic-proxy-secret'));
  assert(!Object.prototype.hasOwnProperty.call(response.data,'transport_context'));
  // Reverse settings order; the saved proxy is selected by key instead of pool index.
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:['192.0.2.11:8101:fixture:synthetic-proxy-secret','192.0.2.10:8100:fixture:synthetic-proxy-secret']});
  const common=await fetch(base+'/api/mail/new',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':other.username},body:JSON.stringify({provider:'EMAILTICK',types:4})});
  assert.equal(common.status,200);assert(proxyCalls.slice(3).every(call=>call.hostname==='192.0.2.20'));
  let before=proxyCalls.length;
  assert.equal((await request('/code?mailbox_id='+proxyMailbox,undefined,other.username)).status,404);assert.equal(proxyCalls.length,before);
  // Getcode must also fail over a dead proxy and preserve the leading-zero OTP.
  failFirst=true;
  emails=[{code:'proxy-otp-legacy',fromName:'Instagram',subject:'000012 is your Instagram code',time:Math.floor(Date.now()/1000)}];
  before=proxyCalls.length;
  const legacyOtp=await request('/code?mailbox_id='+proxyMailbox);
  assert.equal(legacyOtp.status,200);
  assert.deepEqual(legacyOtp.data,{success:true,status:'RECEIVED',code:'000012'});
  const legacyProxyCalls=proxyCalls.slice(before);
  assert.equal(legacyProxyCalls.length,2);
  assert(legacyProxyCalls.every(call=>call.path==='/get-emails'&&['192.0.2.10','192.0.2.11'].includes(call.hostname)));
  assert.notEqual(legacyProxyCalls[0].hostname,legacyProxyCalls[1].hostname);
  assert.equal(legacyProxyCalls[0].hostname,proxyCalls[2].hostname);
  assert(legacyProxyCalls.every(call=>call.ua===createdContext.user_agent));
  const failoverContext=(await Mailbox.unscoped().findOne({where:{mailbox_id:proxyMailbox},logging:false})).transport_context;
  assert.notEqual(failoverContext.proxy_key,createdContext.proxy_key);
  await require('../src/models/GhostInboxMailbox').sync({logging:false});
  failFirst=true;
  emails=[{code:'proxy-otp-common',fromName:'Instagram',subject:'000013 is your Instagram code',time:Math.floor(Date.now()/1000)}];
  before=proxyCalls.length;
  const commonInbox=await fetch(base+'/api/mail/code?mailbox_id='+proxyMailbox,{headers:{'x-api-key':owner.username}});
  assert.equal(commonInbox.status,200);
  assert.deepEqual(await commonInbox.json(),{success:true,status:'RECEIVED',code:'000013'});
  const commonProxyCalls=proxyCalls.slice(before);
  assert.equal(commonProxyCalls.length,2);
  assert(commonProxyCalls.every(call=>call.path==='/get-emails'&&['192.0.2.10','192.0.2.11'].includes(call.hostname)));
  assert.notEqual(commonProxyCalls[0].hostname,commonProxyCalls[1].hostname);
  assert.equal(commonProxyCalls[0].hostname,legacyProxyCalls[1].hostname);
  assert(commonProxyCalls.every(call=>call.ua===createdContext.user_agent));
  assert.equal((await request('/code?mailbox_id='+proxyMailbox)).data.status,'WAITING','Proxy failover must not replay claimed OTP');
  // Exhausting the inbox proxy pool neither falls back direct nor expires a valid mailbox.
  allDead=true;before=proxyCalls.length;
  const deadInbox=await request('/code?mailbox_id='+proxyMailbox);
  assert.equal(deadInbox.status,502);assert.equal(deadInbox.data.error,'EMAILTICK_PROXY_UNAVAILABLE');
  assert.equal(proxyCalls.length,before+2);
  assert.equal((await Mailbox.unscoped().findOne({where:{mailbox_id:proxyMailbox},logging:false})).status,'ACTIVE');
  allDead=false;
  assert(!JSON.stringify(logs).includes('000012'));assert(!JSON.stringify(logs).includes('000013'));
  // Legacy records can adopt a context after the first successful inbox request.
  const bootstrap=await Mailbox.create({owner_username:owner.username,mailbox_id:crypto.randomUUID(),email:'legacy-context@example.test',mailbox_code:'synthetic-bootstrap-key',types:[4],status:'ACTIVE',transport_context:null},{logging:false});
  assert.equal((await request('/code?mailbox_id='+bootstrap.mailbox_id)).status,200);
  const bootstrapped=(await Mailbox.unscoped().findByPk(bootstrap.id,{logging:false})).transport_context;
  assert(bootstrapped.user_agent);assert(/^[a-f0-9]{64}$/.test(bootstrapped.proxy_key));
  const bootstrapHost=proxyCalls.at(-1).hostname;
  assert.equal((await request('/code?mailbox_id='+bootstrap.mailbox_id)).status,200);
  assert.equal(proxyCalls.at(-1).hostname,bootstrapHost);
  assert.equal(proxyCalls.at(-1).ua,bootstrapped.user_agent);
  // Removing the entire pool must not turn an existing proxied mailbox into a direct call.
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:[]});
  before=proxyCalls.length;
  const removedPool=await request('/code?mailbox_id='+proxyMailbox);
  assert.equal(removedPool.data.error,'EMAILTICK_PROXY_UNAVAILABLE');assert.equal(proxyCalls.length,before);
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:['192.0.2.10:8100:fixture:synthetic-proxy-secret','192.0.2.11:8101:fixture:synthetic-proxy-secret']});
  // A slower poll cannot undo the newer poll's successful persisted failover.
  const raceRow=await Mailbox.create({owner_username:owner.username,mailbox_id:crypto.randomUUID(),email:'context-race@example.test',mailbox_code:'synthetic-race-key',types:[4],status:'ACTIVE',transport_context:createdContext},{logging:false});
  let arrived,releaseSlow,order=0;
  const arrival=new Promise(resolve=>{arrived=resolve;});const gate=new Promise(resolve=>{releaseSlow=resolve;});
  const raceService=require('../src/services/emailTickMailboxService').createEmailTickMailboxService({providerFactory:async(name,options)=>{
   assert.equal(name,owner.username);assert.deepEqual(options.transportContext,createdContext);
   const slow=++order===1;
   return {getEmails:async()=>{if(slow){arrived();await gate;}return [];},extractOtp:require('../src/services/emailTickService').extractOtp,getTransportContext:()=>slow?createdContext:failoverContext};
  }});
  const slowPoll=raceService.getCode(owner.username,raceRow.mailbox_id);
  await arrival;
  try{await raceService.getCode(owner.username,raceRow.mailbox_id);}finally{releaseSlow();}
  await slowPoll;
  assert.deepEqual((await Mailbox.unscoped().findByPk(raceRow.id,{logging:false})).transport_context,failoverContext);
  // A malformed stored setting must not silently enable direct access.
  const Setting=require('../src/models/AppSetting');
  await Setting.update({setting_value:'not-json'},{where:{owner_username:owner.username,setting_key:'facebook_check_proxies'}});
  before=proxyCalls.length;response=await request('/new',{types:4});assert.equal(response.status,503);assert.equal(response.data.error,'EMAILTICK_PROXY_SETTINGS_ERROR');assert.equal(proxyCalls.length,before);
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:['ftp://192.0.2.10:8000']});
  response=await request('/new',{types:4});assert.equal(response.status,503);assert.equal(response.data.error,'EMAILTICK_PROXY_CONFIG_ERROR');assert.equal(proxyCalls.length,before);
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:['192.0.2.10:8100','192.0.2.11:8101']});
  allDead=true;response=await request('/new',{types:4});assert.equal(response.status,502);assert.equal(response.data.error,'EMAILTICK_PROXY_UNAVAILABLE');assert.equal(proxyCalls.length,before+2);
  assert(!JSON.stringify(response).includes('synthetic-proxy-secret'));
 }finally{
  axios.post=originalPost;
  await settings.saveFacebookCheckProxySettings(owner.username,{proxies:[]});
  await settings.saveFacebookCheckProxySettings(other.username,{proxies:[]});
 }
 assert(!JSON.stringify(logs).includes('synthetic-proxy-secret'));
 const text=JSON.stringify(logs);for(const secret of mailboxCodes)assert(!text.includes(secret),'No mailbox credentials in logs, including SQL');for(const otp of ['041374','000009','000010','000011'])assert(!text.includes(otp),'No OTP in logs');assert(!text.includes('synthetic-do-not-log'));assert(!text.includes('synthetic-limit-do-not-log'));
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
