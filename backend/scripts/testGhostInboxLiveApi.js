// Explicit live test: creates new public temporary mailboxes and an isolated MySQL database.
// Never logs mailbox addresses, OTPs, upstream bodies, credentials or session state.
const path=require('path'),crypto=require('crypto'),assert=require('assert');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Sequelize}=require('sequelize');
const original=process.env.DB_NAME,testDb='quanly_ghost_live_test_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const safe=()=>/^quanly_ghost_live_test_\d+_[a-f0-9]+$/.test(testDb)&&testDb!==original;
const manager=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,dialect:'mysql',logging:false});
let db,server,created=false;
(async()=>{
 assert(safe());await manager.query('CREATE DATABASE `'+testDb+'` CHARACTER SET utf8mb4');created=true;
 process.env.DB_NAME=testDb;
 // Exercise the upgrade of an existing VPS's legacy config against the real service.
 process.env.GHOSTINBOX_BASE_URL='https://temp-gmail.ghostinbox.net';
 process.env.GHOSTINBOX_WEB_BASE_URL='https://ghostinbox.net';
 process.env.GHOSTINBOX_TIMEOUT_MS='15000';process.env.GHOSTINBOX_RETRY_COUNT='0';process.env.GHOSTINBOX_POLL_INTERVAL_MS='10000';
 db=require('../src/config/database');
 const User=require('../src/models/User'),Ghost=require('../src/models/GhostInboxMailbox');
 await User.sync({logging:false});await Ghost.sync({logging:false});
 await User.create({username:'ghost_live_fixture',password_hash:'fixture-only',role:'user'},{logging:false});
 const logger=require('../src/config/logger');for(const key of ['info','warn','error','debug'])logger[key]=()=>{};
 const express=require('express'),app=express();app.use('/api/mail',require('../src/routes/mail'));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=async(endpoint,body)=>{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mail/'+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-api-key':'ghost_live_fixture'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();
  if(response.status!==200||value.success!==true)throw Error('HTTP_'+response.status+'_'+(value.error||'UNEXPECTED_RESPONSE'));
  return value;
 };
 for(const mailType of ['TEMP_GMAIL','TEMP_MAIL','TEN_MINUTE_MAIL']){
  const body=mailType==='TEMP_GMAIL'?{provider:'GHOSTINBOX'}:{provider:'GHOSTINBOX',mail_type:mailType};
  const m=await request('new',body);assert(m.mailbox_id&&m.email);
  const row=await Ghost.unscoped().findOne({where:{mailbox_id:m.mailbox_id},logging:false});assert.equal(row.provider_state.mailType,mailType);
  // Waiting a real interval ensures code calls upstream rather than the local poll gate.
  await new Promise(resolve=>setTimeout(resolve,10500));
  const result=await request('code?mailbox_id='+encodeURIComponent(m.mailbox_id)+'&service=GENERIC');
  assert(['WAITING','RECEIVED'].includes(result.status));
  console.log(mailType+': API create HTTP200 / API poll HTTP200 / '+result.status+' PASS');
 }
 console.log('GHOST_LIVE_API_OK (real upstream, isolated DB; no real OTP delivery tested)');
})().catch(error=>{console.error('GHOST_LIVE_API_FAILED: '+(error.code||error.message||'UNKNOWN'));process.exitCode=1;}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();
 process.env.DB_NAME=original;if(created&&safe())await manager.query('DROP DATABASE `'+testDb+'`');await manager.close();
});
