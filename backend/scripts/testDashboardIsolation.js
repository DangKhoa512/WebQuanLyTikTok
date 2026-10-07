const path=require('path'),assert=require('assert'),crypto=require('crypto');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Sequelize}=require('sequelize');
const original=process.env.DB_NAME,name='quanly_isolation_test_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const manager=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,dialect:'mysql',logging:false});
let db,server,created=false;
(async()=>{
 assert(/^quanly_isolation_test_\d+_[a-f0-9]+$/.test(name)&&name!==original);
 await manager.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');created=true;process.env.DB_NAME=name;
 db=require('../src/config/database');require('../src/config/logger').silent=true;require('../src/models');await db.sync();
 const User=require('../src/models/User'),Device=require('../src/models/DashboardDevice'),FB=require('../src/models/FacebookAccount');
 const registry=require('../src/services/taskRegistryService').createRegistryService(db);await registry.migrate();
 const a=await User.create({username:'tenant_alpha',password_hash:'isolated-test',role:'user'}),b=await User.create({username:'tenant_beta_admin',password_hash:'isolated-test',role:'admin'});

 const IG=require('../src/models/InstagramAccount'),Page=require('../src/models/FacebookPageJob'),Claim=require('../src/models/InstagramFacebookRegClaim'),Run=require('../src/models/DeviceTaskRun'),Log=require('../src/models/FacebookNurtureLog'),Account=require('../src/models/Account');
 const {offlineTimeoutSeconds}=require('../src/config/devices');
 const fixtures=async(user,scale)=>{
  const now=new Date(),old=new Date(Date.now()-(offlineTimeoutSeconds+10)*1000);
  const fb=await FB.bulkCreate(Array.from({length:10*scale},(_,i)=>({owner_username:user.username,kind:'job',uid:user.username+'_fb_'+i,raw_data:'isolated-test',cookies:'synthetic-test',status:'LOGIN_THANH_CONG',live_status:'live',login_at:new Date(Date.now()-10*86400000),nurture_status:i<2*scale?'NUOI_FAIL':'CHUA_NUOI',page_token_status:i<scale?'die':'unknown'})));
  const ig=await IG.bulkCreate(Array.from({length:20*scale},(_,i)=>({owner_username:user.username,kind:'job',uid:user.username+'_ig_'+i,raw_data:'isolated-test',status:i<3*scale?'LOGIN_FAIL':'LOGIN_THANH_CONG',nurture_status:i<scale?'NUOI_FAIL':'CHUA_NUOI',live_status:'live',login_at:new Date()})));
  const pages=await Page.bulkCreate(Array.from({length:5*scale},(_,i)=>({owner_username:user.username,facebook_account_id:fb[0].id,page_id:user.username+'_page_'+i,job_status:['CHUA_LAM','DANG_LAM','DA_LAM'][i%3],is_active:true})));
  await Device.bulkCreate(Array.from({length:4*scale},(_,i)=>({owner_username:user.username,device_id:user.username+'_device_'+i,reported_status:i<2*scale?'RUNNING':'IDLE',current_task:i<2*scale?'PAGE_JOB':null,last_seen:i>=3*scale?old:now})));
  await Log.create({owner_username:user.username,facebook_account_id:fb[0].id,uid:user.username+'_activity',device_id:user.username+'_device_0',run_id:'test-log',status:'DA_NUOI',completed_at:now});
  const account=await Account.create({owner_username:user.username,username:user.username+'_account',raw_data:'isolated-test'});
  return {fb,ig,pages,account};
 };
 const fa=await fixtures(a,1),fb=await fixtures(b,10);
 const taskList=await registry.list(a.username),reg=taskList.find(task=>task.task_key==='REG_INSTAGRAM');
 await registry.saveMine(a.username,[{task_id:reg.id,enabled:true,priority:321}],taskList.map(task=>task.id).reverse());
 await registry.saveMine(b.username,[{task_id:reg.id,enabled:false,priority:654}],taskList.map(task=>task.id));
 require('../src/services/schedulerState').markCompleted({startedAt:new Date(),result:{nurture_reset:999,page_job_reset:888,account_reset:777}});
 const express=require('express'),jwt=require('jsonwebtoken'),app=express();process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');app.use(express.json());
 app.use('/api/dashboard',require('../src/middleware/jwtAuth'),require('../src/routes/dashboard'));
 app.use('/api/device',require('../src/routes/device'));app.use('/api/facebook',require('../src/routes/facebook'));app.use('/api/instagram',require('../src/routes/instagram'));app.use('/api/accounts',require('../src/routes/accounts'));
 app.use('/api/stats',require('../src/middleware/jwtAuth'),require('../src/routes/stats'));
 app.use((err,req,res,next)=>res.status(err.statusCode||500).json({success:false,message:err.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const token=user=>jwt.sign({id:user.id,username:user.username,role:user.role},process.env.JWT_SECRET,{expiresIn:'1h'});
 const api=async(user,route,method='GET',body,device=false)=>{const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...(device?{'x-api-key':user.username}:{Authorization:'Bearer '+token(user)})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};};
 const summary=async(user,query='')=>{const response=await api(user,'/api/dashboard/summary'+query);assert.equal(response.status,200);assert.equal(response.cache,'private, no-store');return response.data.data;};
 const assertOwn=async(user,scale)=>{
  const d=await summary(user);assert.equal(d.scope,'user');assert.equal(d.accounts.facebook.total,10*scale);assert.equal(d.accounts.instagram.total,20*scale);assert.equal(d.accounts.pages.total,5*scale);
  assert.deepEqual(d.devices.summary,{total:4*scale,running:2*scale,idle:scale,offline:scale,online:3*scale});assert(d.devices.rows.every(row=>row.device_id.startsWith(user.username+'_')));
  assert.equal(d.tasks.nurture_facebook.errors,2*scale);assert.equal(d.tasks.reg_page.errors,scale);assert.equal(d.accounts.instagram.errors,3*scale);
  assert.equal(d.task_registry.find(t=>t.id===reg.id).user_enabled,user.id===a.id);assert.deepEqual(d.task_registry.map(t=>t.id),(await registry.list(user.username)).map(t=>t.id));
  assert.equal(d.scheduler,null);assert(d.activity.every(row=>row.uid?.startsWith(user.username+'_')));assert(!d.activity.some(row=>row.type==='CRON'));
  return d;
 };
 const initialA=await assertOwn(a,1),initialB=await assertOwn(b,10);
 assert(!JSON.stringify(initialA).includes(b.username));assert(!JSON.stringify(initialB).includes(a.username));
 await Device.destroy({where:{owner_username:a.username,device_id:a.username+'_device_1'}});
 assert.deepEqual((await summary(a)).devices.summary,{total:3,running:1,idle:1,offline:1,online:2});
 await Device.create({owner_username:a.username,device_id:a.username+'_device_1',reported_status:'RUNNING',current_task:'PAGE_JOB',last_seen:new Date()});
 const parallel=await Promise.all(Array.from({length:12},(_,i)=>summary(i%2?a:b)));assert(parallel.every((d,i)=>d.accounts.facebook.total===(i%2?10:100)),'Concurrent refreshes stay owner scoped');
 const spoof=await summary(a,'?user_id='+b.id+'&owner_id='+b.id+'&username='+b.username+'&owner_username='+b.username+'&user='+b.username+'&scope=system');assert.equal(spoof.accounts.facebook.total,10);
 assert.equal((await summary(b,'?device_search='+a.username)).devices.filtered_total,0);
 const offline=await summary(a,'?device_status=OFFLINE');assert.equal(offline.devices.filtered_total,1);assert.equal(offline.devices.rows.length,1);
 const page=await summary(b,'?page_size=20&page=2');assert.equal(page.devices.rows.length,20);assert.equal(page.devices.summary.total,40);
 const pageIds=new Set(page.devices.rows.map(row=>row.device_id));assert((await summary(b,'?page_size=20&page=1')).devices.rows.every(row=>!pageIds.has(row.device_id)));
 const found=await summary(a,'?device_search='+a.username+'_device_3');assert.equal(found.devices.filtered_total,1);
 // Actual REG_INSTAGRAM pool: 10 ready/2 running/1 error vs 100/20/10.
 for(const [user,scale] of [[a,1],[b,10]]){
  const added=await FB.bulkCreate(Array.from({length:2*scale},(_,i)=>({owner_username:user.username,kind:'job',uid:user.username+'_claimed_'+i,raw_data:'isolated-test',status:'LOGIN_THANH_CONG',live_status:'live'})));
  await Claim.bulkCreate(added.map(account=>({owner_username:user.username,facebook_account_id:account.id,facebook_uid:account.uid,device_id:user.username+'_device_0',status:'DANG_REG',locked_at:new Date()})));
  await Claim.bulkCreate(Array.from({length:scale},(_,i)=>({owner_username:user.username,facebook_account_id:added[0].id,facebook_uid:added[0].uid,device_id:user.username+'_device_0',status:'REG_FAIL',completed_at:new Date()})));
  assert.deepEqual((await summary(user)).tasks.reg_instagram,{ready:10*scale,running:2*scale,errors:scale});
 }
 // Cross-owner IDs are denied or bulk actions safely ignore them without returning/mutating resources.
 for(const [actor,target,fixture] of [[a,b,fb],[b,a,fa]]){
  assert.equal((await api(actor,'/api/accounts/'+fixture.account.id)).status,404);
  assert.equal((await api(actor,'/api/accounts/'+fixture.account.id,'PATCH',{note:'cross-user attempt'})).status,404);
  assert.equal((await api(actor,'/api/facebook/'+fixture.fb[0].id+'/pages')).status,404);
  assert.equal((await api(actor,'/api/facebook/job/page-report','POST',{page_id:fixture.pages[0].page_id,device_id:actor.username+'_device_0',status:'DA_LAM'},true)).status,404);
  assert.equal((await api(actor,'/api/device/capabilities/'+target.username+'_device_0')).status,404);
  assert.equal((await api(actor,'/api/device/capabilities/'+target.username+'_device_0','PUT',{capabilities:['PAGE_JOB']})).status,404);
  assert.equal((await api(actor,'/api/instagram/job/login-cookies','POST',{ids:[fixture.ig[0].id]})).status,404);
  for(const platform of ['facebook','instagram']){
   const id=platform==='facebook'?fixture.fb[0].id:fixture.ig[0].id;
   const get=await api(actor,'/api/'+platform+'/bulk-get','POST',{ids:[id],owner_username:target.username});assert.equal(get.status,200);assert.equal(get.data.data.count,0);
   const mutate=await api(actor,'/api/'+platform+'/bulk-action','POST',{ids:[id],action:'set_status',status:'ACCOUNT_DIE',owner_username:target.username});assert.equal(mutate.status,200);assert.equal(mutate.data.data.affected,0);
   const remove=await api(actor,'/api/'+platform+'/bulk-delete','POST',{ids:[id]});assert.equal(remove.status,200);
  }
  assert.equal((await fixture.fb[0].reload()).status,'LOGIN_THANH_CONG');assert.equal(fixture.fb[0].trashed_at,null);assert.equal((await fixture.ig[0].reload()).status,'LOGIN_FAIL');assert.equal(fixture.ig[0].trashed_at,null);
  const run=await Run.create({owner_username:target.username,device_id:target.username+'_device_0',task_type:'PAGE_JOB',entity_type:'FACEBOOK_PAGE_JOB',entity_id:fixture.pages[0].id,locked_by:target.username+'_device_0',locked_at:new Date()});
  assert.equal((await api(actor,'/api/device/task/report','POST',{task_id:run.id,owner_username:target.username},true)).status,404);assert.equal((await run.reload()).status,'RUNNING');
 }
 const stats=await api(a,'/api/stats/facebook-job');assert.equal(stats.status,200);
 const invalid=await fetch(url+'/api/dashboard/summary',{headers:{Authorization:'Bearer '+jwt.sign({id:a.id,username:b.username,role:'admin'},process.env.JWT_SECRET)}});assert.equal(invalid.status,401);

 for(const payload of [{id:a.id,role:'admin'},{username:b.username,role:'admin'},{id:a.id,username:b.username,role:'admin'}]){
  const forged=jwt.sign(payload,process.env.JWT_SECRET);
  for(const route of ['/api/dashboard/summary','/api/accounts/'+fb.account.id,'/api/device/capabilities/'+b.username+'_device_0'])assert.equal((await fetch(url+route,{headers:{Authorization:'Bearer '+forged}})).status,401);
 }
 await User.update({is_active:false},{where:{id:a.id}});assert.equal((await api(a,'/api/dashboard/summary')).status,401);await User.update({is_active:true},{where:{id:a.id}});
 assert.equal((await fetch(url+'/api/dashboard/summary')).status,401);
 const dservice=require('../src/services/dashboardService');assert.equal((await dservice.getDashboardSummary(a.username,true)).accounts.facebook.total,12);
 await assert.rejects(()=>dservice.getDashboardSummary(''),e=>e.statusCode===401);
 console.log('DASHBOARD_ISOLATION_OK: 10/20/5/4 vs 100/200/50/40, admin own scope, exact REG_IG 10/2/1 vs 100/20/10, spoof/parallel/filter/search/pages, activity/scheduler, IDOR read/update/delete/action/task reports, no-store');
})().catch(err=>{console.error(err.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();if(created&&/^quanly_isolation_test_\d+_[a-f0-9]+$/.test(name)&&name!==original)await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
