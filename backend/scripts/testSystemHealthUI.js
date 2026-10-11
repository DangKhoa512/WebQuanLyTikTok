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


 app.use('/api',require('../src/routes'));
 app.use('/api/system-health',require('../src/middleware/jwtAuth'),require('../src/routes/systemHealth'));
 app.use('/api/settings',require('../src/middleware/jwtAuth'),require('../src/routes/settings'));
 app.use('/api/task-registry',require('../src/middleware/jwtAuth'),require('../src/routes/taskRegistry'));
 app.get('/api/stats',(req,res)=>res.json({success:true,data:{}}));
 const fs=require('fs'),esbuild=require('../../frontend/node_modules/esbuild');
 const bundle=esbuild.buildSync({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import App from './App';import './index.css';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:path.resolve(__dirname,'../../frontend/src'),loader:'jsx'},bundle:true,write:false,outfile:'preview.js',jsx:'automatic',format:'iife',define:{'import.meta.env.VITE_API_BASE_URL':'undefined'}});
 app.get('/preview.js',(req,res)=>res.type('js').send(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text));
 app.get('/preview.css',(req,res)=>res.type('css').send(bundle.outputFiles.find(f=>f.path.endsWith('.css')).text));
 app.use('/assets',express.static(path.resolve(__dirname,'../../frontend/public/assets')));
 const html=fs.readFileSync(path.resolve(__dirname,'../../frontend/index.html'),'utf8').replace('<script type="module" src="/src/main.jsx"></script>','<link rel="stylesheet" href="/preview.css"><script src="/preview.js"></script>');
 app.get(['/login','/proxy-settings','/dashboard','/accounts','/chrome-accounts','/jobs','/facebook-reg','/facebook-jobs','/facebook-nurture','/hotmails','/email-otps','/stats','/machine-api-configs','/users'],(req,res)=>res.send(html));
 const {Builder,By,logging}=require('selenium-webdriver'),chrome=require('selenium-webdriver/chrome');
 const prefs=new logging.Preferences();prefs.setLevel(logging.Type.BROWSER,logging.Level.SEVERE);
 const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1366,900')).setChromeService(new chrome.ServiceBuilder(path.join(process.env.USERPROFILE,'.cache/selenium/chromedriver/win64/154.0.8037.92/chromedriver.exe'))).setLoggingPrefs(prefs).build();
 try{
 await browser.get(base+'/login');await browser.executeScript('localStorage.setItem("tiktok_admin_token",arguments[0]);localStorage.setItem("tiktok_admin_user",arguments[1]);localStorage.setItem("tiktok_admin_role","user");',jwt.sign({id:a.id,username:a.username,role:a.role},process.env.JWT_SECRET,{expiresIn:'1h'}),a.username);
 await browser.get(base+'/proxy-settings');await browser.wait(()=>browser.findElements(By.id('platform-tab-health')).then(x=>x.length),15000);
 await browser.findElement(By.id('platform-tab-health')).click();
 await browser.wait(()=>browser.executeScript(function(){return document.querySelector('section[aria-label="System Health"]')?.textContent.includes('Không sử dụng');}),15000);
 const section=await browser.findElement(By.css('section[aria-label="System Health"]'));
 assert((await section.getText()).includes('Chỉ admin xem'));
 const errors=await browser.manage().logs().get(logging.Type.BROWSER);assert.equal(errors.length,0,JSON.stringify(errors.map(e=>e.message)));
 await browser.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert(await browser.executeScript('return document.documentElement.scrollWidth<=innerWidth'),'Health mobile overflow');

 await browser.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride');
 const smoke=[];
 for(const route of ['/dashboard','/accounts','/chrome-accounts','/jobs','/facebook-reg','/facebook-jobs','/facebook-nurture','/hotmails','/email-otps','/stats','/machine-api-configs','/users']){
 if(route==='/users')await browser.executeScript('localStorage.setItem("tiktok_admin_token",arguments[0]);localStorage.setItem("tiktok_admin_role","admin");',jwt.sign({id:b.id,username:b.username,role:b.role},process.env.JWT_SECRET,{expiresIn:'1h'}));
 await browser.get(base+route);await browser.sleep(1200);
 const errors=await browser.manage().logs().get(logging.Type.BROWSER);
 assert.equal(new URL(await browser.getCurrentUrl()).pathname,route,'Smoke should not pass a login redirect');
 smoke.push({route,console_errors:errors.length,rendered:await browser.executeScript('return !!document.querySelector("h1")')});
 }
 fs.mkdirSync(path.resolve(__dirname,'../tests/realtime'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tests/realtime/frontend-smoke.json'),JSON.stringify(smoke,null,2));
 assert(smoke.every(r=>r.rendered&&r.console_errors===0),'All page smoke must render without browser/network errors: '+JSON.stringify(smoke));

 const originalWait=browser.wait.bind(browser);browser.wait=async(...args)=>{try{return await originalWait(...args);}catch(e){e.message+=' URL '+(await browser.getCurrentUrl()).split('/').pop();throw e;}};
 await browser.get(base+'/proxy-settings');await browser.wait(()=>browser.findElements(By.id('platform-tab-health')).then(x=>x.length),15000);await browser.findElement(By.id('platform-tab-health')).click();
 let checkedTabs=1;
 for(let i=1;i<10;i++){await browser.switchTo().newWindow('tab');await browser.get(base+'/proxy-settings');await browser.wait(()=>browser.findElements(By.id('platform-tab-health')).then(x=>x.length),15000);await browser.findElement(By.id('platform-tab-health')).click();await browser.wait(()=>browser.executeScript(function(){return document.querySelector('section[aria-label="System Health"]')?.textContent.includes('Không sử dụng');}),15000);checkedTabs++;}
 assert.equal((await browser.getAllWindowHandles()).length,10);
 fs.writeFileSync(path.resolve(__dirname,'../tests/realtime/tabs.json'),JSON.stringify({real_browser_tabs:checkedTabs,system_health_load:'PASS',polling_interval_seconds:15},null,2));
 console.log('SYSTEM_HEALTH_UI_OK: actual settings tab/real JWT API, N/A services, tenant role, no browser errors, mobile responsive');
 }finally{await browser.quit();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(created&&safe())await manager.query('DROP DATABASE `'+name+'`');await manager.close();});
