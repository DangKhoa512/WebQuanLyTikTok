// Public RFC test fixtures only. No real secrets or database connections.
const assert = require('assert');
const { createTotp } = require('../src/utils/totp');
const service = require('../src/services/totpService');
const { createTotp: instagramTotp } = require('../src/utils/instagramLoginUtils');
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
(async () => {
  for (const [seconds, expected] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']]) {
    assert.equal(createTotp(RFC_SECRET, seconds * 1000), expected);
    assert.equal(instagramTotp(RFC_SECRET, seconds * 1000), expected, 'Instagram helper export stays compatible');
  }
  for (const [padded,unpadded] of [['MY======','MY'],['MZXQ====','MZXQ'],['MZXW6===','MZXW6'],['MZXW6YQ=','MZXW6YQ'],['MZXW6YTB','MZXW6YTB']]) assert.equal(service.normalizeSecret(padded),unpadded);
  for (const invalid of [undefined,null,0,{},[], '', '  ', 'ABC!DEF', 'ABC1DEF', 'A', 'AAA','AAAAAA','MZ','MY=', 'MY=======','MZXW6YTB=', 'AB CD','ßY', 'A'.repeat(513)]) await assert.rejects(() => service.generate(invalid),err => err.code === 'INVALID_SECRET');
  const sameWindow = service.createTotpService({now:()=>45000});
  const a = await sameWindow.generate(RFC_SECRET),a2=await sameWindow.generate(' '+RFC_SECRET.toLowerCase()+' ');
  assert.deepEqual(a,a2);assert.equal(a.expiresIn,15);assert.equal(a.code,'287082');
  const secondWindow=await service.createTotpService({now:()=>65000}).generate(RFC_SECRET);assert.notEqual(secondWindow.code,a.code);
  for (const remaining of [3000,2000,1]) {
    let timestamp=60000-remaining;let delay;
    const result=await service.createTotpService({now:()=>timestamp,sleep:async ms=>{delay=ms;timestamp+=ms;}}).generate(RFC_SECRET);
    assert.equal(delay,remaining+25);assert.equal(result.code,createTotp(RFC_SECRET,60025));assert.equal(result.expiresIn,30);
  }
  const secrets=[RFC_SECRET,'MZXW6YTB','JBSWY3DPEHPK3PXP'];
  const results=await Promise.all(secrets.map(secret=>sameWindow.generate(secret)));for(let i=0;i<3;i++)assert.equal(results[i].code,createTotp(secrets[i],45000));
  const logs=[];const logger=require('../src/config/logger');const originals={info:logger.info,warn:logger.warn,error:logger.error};for(const key of Object.keys(originals))logger[key]=(...args)=>logs.push(args);
  const User=require('../src/models/User');const oldFind=User.findOne;
  let authQueries=0,authFails=false;
  User.findOne=async ({where})=>{authQueries++;if(authFails)throw new Error('Auth database failure');return where.username==='totp_test_user'?{username:where.username,is_active:true}:null;};
  const db=require('../src/config/database');const oldQuery=db.query;
  db.query=async()=>{throw Error('TOTP must never query account tables or persist data');};
  const oldNow=Date.now;Date.now=()=>45000;
  const app=require('../src/app');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async({body={secret:RFC_SECRET},key='totp_test_user',method='POST',path='/api/totp/generate',raw}={})=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(key===null?{}:{'x-api-key':key})},...(method==='POST'?{body:raw===undefined?JSON.stringify(body):raw}:{})});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  try {
    const generated=await request();assert.equal(generated.status,200);assert.deepEqual(generated.data,{success:true,code:'287082',expires_in:15});assert.equal(generated.headers.get('cache-control'),'no-store');
    assert.deepEqual((await request()).data,generated.data);
    for (const secret of secrets) assert.equal((await request({body:{secret}})).data.code,createTotp(secret,45000));
    for(const body of [{},{secret:''},{secret:'BAD!SECRET'},{secret:123},{secret:[]},{secret:{}}]) {const result=await request({body});assert.equal(result.status,400);assert.deepEqual(result.data,{success:false,error:'INVALID_SECRET'});}
    assert.equal((await request({key:null})).status,401);assert.equal((await request({key:'unknown_test_user'})).status,401);
    assert.equal((await request({method:'GET'})).status,405);
    assert.equal((await request({path:'/api/totp/generate?secret='+RFC_SECRET})).status,400);
    assert.equal((await request({raw:'{"secret":"'+RFC_SECRET+'",'})).status,400);
    assert.equal((await request({body:{secret:'A'.repeat(3000)}})).status,413);
    authFails=true;assert.equal((await request()).status,500);authFails=false;
    const oldGenerate=service.generate;service.generate=async()=>{throw new Error('Synthetic secret error '+RFC_SECRET);};
    try {assert.deepEqual((await request()).data,{success:false,error:'TOTP_GENERATION_FAILED'});} finally {service.generate=oldGenerate;}
    const responses=await Promise.all(Array.from({length:65},()=>request({body:{secret:'BAD!SECRET'}})));assert(responses.some(res=>res.status===429));
    const logged=JSON.stringify(logs);for(const secret of secrets)assert(!logged.includes(secret));assert(!logged.includes('287082'));assert(!logged.includes('BAD!SECRET'));assert(authQueries>0);
  } finally {
    Date.now=oldNow;User.findOne=oldFind;db.query=oldQuery;for(const key of Object.keys(originals))logger[key]=originals[key];await new Promise(resolve=>server.close(resolve));
  }
  const install=require('../../tools/autotouch/totp');const API={};let command;
  const options={getBaseUrl:()=>"https://server.example/api/",getApiKey:()=>"test'key",exec:cmd=>{command=cmd;return JSON.stringify({success:true,code:'005924',expires_in:20});},safeParse:text=>JSON.parse(text)};
  install(API,options);assert.equal(API._GetTOTP(RFC_SECRET),'005924');assert(command.includes('/api/totp/generate'));assert(!command.includes('?secret='));assert(command.includes('--data'));assert(command.includes("'\"'\"'"));
  options.exec=()=>'{broken';install(API,options);assert.equal(API._GetTOTP(RFC_SECRET),0);
  for(const response of [{success:false},{success:true,code:123456},{success:true,code:'12345'},{success:true,code:'1234567'}]){options.exec=()=>JSON.stringify(response);install(API,options);assert.equal(API._GetTOTP(RFC_SECRET),0);}
  options.exec=()=>{throw Error('Network failure');};install(API,options);assert.equal(API._GetTOTP(RFC_SECRET),0);assert.equal(API._GetTOTP('$(touch injected)'),0);assert.equal(API._GetTOTP(null),0);
  // Drive the real HTTP endpoint via the same synchronous curl command used by AutoTouch.
  // Separate process serves requests so blocking curl cannot deadlock this test process.
  const {fork,spawnSync}=require('child_process');
  const child=fork(pathJoin('totpHttpTestServer.js'),[],{silent:true});
  try {
    const address=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Test server exited '+code)));});
    const client={};install(client,{getBaseUrl:()=>address.url,getApiKey:()=> 'totp_test_user',allowHttp:true,exec:cmd=>{const result=spawnSync(cmd,{shell:process.platform === 'win32' ? require('path').join(process.env.ProgramFiles || 'C:/Program Files','Git/bin/bash.exe') : '/bin/sh',encoding:'utf8',timeout:35000});return result.status===0?result.stdout:'';},safeParse:JSON.parse});
    assert.equal(client._GetTOTP(RFC_SECRET),'287082');assert.equal(client._GetTOTP('INVALID!SECRET'),0);
    const clockReady=new Promise(resolve=>child.once('message',resolve));child.send('near');await clockReady;
    assert.equal(client._GetTOTP(RFC_SECRET),createTotp(RFC_SECRET,60000),'Real HTTP request waits until next window');
    child.send('stop');await new Promise(resolve=>child.once('exit',resolve));
  } finally {if(!child.killed)child.kill();}
  console.log('TOTP_API_OK: RFC vectors, Base32 validation, expiry/wait, stateless independent requests, auth/errors/rate limit, no secret/OTP logs, Instagram reuse, AutoTouch JS and real curl HTTP');
})().catch(err=>{console.error(err.stack);process.exitCode=1;});
function pathJoin(file){return require('path').join(__dirname,file);}
