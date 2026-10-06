const path=require('path'),fs=require('fs'),assert=require('assert');
require('../backend/node_modules/dotenv').config({path:path.resolve(__dirname,'../backend/.env')});
const {Builder,By,Key,logging}=require('../backend/node_modules/selenium-webdriver');
const chrome=require('../backend/node_modules/selenium-webdriver/chrome');
(async()=>{
 const auth=await (await fetch('http://localhost:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USER||'admin',password:process.env.ADMIN_PASS})})).json();
 assert(auth.success&&auth.data.token,'Local login failed; credentials withheld');
 const snapshot=await (await fetch('http://localhost:3000/api/dashboard/summary',{headers:{Authorization:'Bearer '+auth.data.token}})).json();assert(snapshot.success,'Real dashboard API failed');
 const prefs=new logging.Preferences();prefs.setLevel(logging.Type.BROWSER,logging.Level.SEVERE);
 const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1920,1080')).setChromeService(new chrome.ServiceBuilder(path.join(process.env.USERPROFILE,'.cache/selenium/chromedriver/win64/154.0.8037.92/chromedriver.exe'))).setLoggingPrefs(prefs).build();
 const wait=async(script)=>browser.wait(()=>browser.executeScript(script),25000);
 try {
  await browser.get('http://localhost:5173/login');await browser.executeScript('localStorage.setItem("tiktok_admin_token",arguments[0]);localStorage.setItem("tiktok_admin_user",arguments[1]);localStorage.setItem("tiktok_admin_role",arguments[2]);',auth.data.token,auth.data.username,auth.data.role);
  await browser.get('http://localhost:5173/dashboard');await wait('return !!document.querySelector(".dashboard-summary-card")');
  assert.equal(await browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.name.includes("/dashboard/summary")).length'),1,'Duplicate initial summary request');
  const nums=await browser.executeScript('return [...document.querySelectorAll(".dashboard-summary-head strong")].map(e=>Number(e.textContent.replaceAll(".","")))');
  const d=snapshot.data,taskErrors=Object.values(d.tasks).reduce((n,t)=>n+Number(t.errors||0),0);
  assert.deepEqual(nums,[d.accounts.facebook.total,d.accounts.pages.total,d.accounts.instagram.total,d.devices.summary.total,taskErrors]);
  const statusLabels=await browser.executeScript('return [...document.querySelectorAll(".dashboard-task-status")].map(el=>el.textContent.trim())');
  assert.deepEqual(statusLabels,snapshot.data.task_registry.map(task=>task.user_enabled?'● Đang bật':'● Đang tắt'));
  assert.equal((await browser.findElements(By.css('.dashboard-task-table [role=switch],.dashboard-task-table input'))).length,0,'Dashboard task status must be read only');
  const workloads=await browser.executeScript('return [...document.querySelectorAll(".dashboard-task-table tbody tr")].map(tr=>[...tr.querySelectorAll("td:nth-child(n+3)")].map(td=>Number(td.textContent.replaceAll(".",""))))');
  d.task_registry.map(task=>task.stats_key || task.task_key).forEach((key,i)=>assert.deepEqual(workloads[i],[d.tasks[key].ready,d.tasks[key].running,d.tasks[key].errors]));
  assert.equal((await browser.findElements(By.css('.dashboard-device-row'))).length,d.devices.rows.length);
  const search=await browser.findElement(By.css('.dashboard-search input'));await search.sendKeys('no-device-match-qa');
  assert.equal((await browser.findElements(By.css('.dashboard-device-row'))).length,0);
  assert((await browser.findElement(By.css('.empty-cell')).getText()).includes('Không tìm thấy') || !d.devices.rows.length);
  await browser.findElement(By.css('.dashboard-search button')).click();
  if(d.devices.rows.length) {
   const row=d.devices.rows[0];await search.sendKeys(row.device_id);assert((await browser.findElements(By.css('.dashboard-device-row'))).length>=1);
   await browser.findElement(By.css('.dashboard-device-row button')).click();assert(await browser.executeScript('return document.querySelector("dialog").open'));
   const initial=await browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.name.includes("/dashboard/summary")).length');
   await browser.wait(async()=>await browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.name.includes("/dashboard/summary")).length')>initial,20000);
   assert(await browser.executeScript('return document.querySelector("dialog").open'));
   assert.equal(await search.getAttribute('value'),row.device_id);
   await browser.findElement(By.css('dialog button')).sendKeys(Key.ESCAPE);await wait('return !document.querySelector("dialog")');
   await browser.findElement(By.css('.dashboard-search button')).click();
  }
  const taskTypes=[...new Set(d.devices.rows.map(row=>row.current_task).filter(Boolean))];
  if(taskTypes.length) {
   await browser.executeScript('const el=document.querySelector(".dashboard-filter-inputs select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(el,arguments[0]);el.dispatchEvent(new Event("change",{bubbles:true}));',taskTypes[0]);
   const filtered=await browser.executeScript('return [...document.querySelectorAll(".dashboard-device-row")].map(row=>row.querySelectorAll("td")[5].textContent)');assert(filtered.every(task=>task===taskTypes[0]));
   await browser.findElement(By.css('.dashboard-filter-inputs .settings-button')).click();
  }
  await browser.findElement(By.css('.dashboard-status-filters button:last-child')).click();
  const statuses=await browser.executeScript('return [...document.querySelectorAll(".dashboard-device-row .dashboard-status")].map(e=>e.textContent)');assert(statuses.every(s=>s==='OFFLINE'));
  const beforeRefresh=await browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.name.includes("/dashboard/summary")).length');
  await browser.findElement(By.css('.dashboard-header-actions button')).click();
  await browser.wait(()=>browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.name.includes("/dashboard/summary")).length').then(count=>count>beforeRefresh),10000);
  assert.equal(await browser.findElement(By.css('.dashboard-status-filters button:last-child')).getAttribute('aria-pressed'),'true');
  await browser.findElement(By.css('.dashboard-status-filters button:first-child')).click();
  const offlineAlert=await browser.findElements(By.css('.dashboard-alerts button'));if(offlineAlert.length){await offlineAlert[0].click();assert.equal(await browser.findElement(By.css('.dashboard-status-filters button:last-child')).getAttribute('aria-pressed'),'true');await browser.findElement(By.css('.dashboard-status-filters button:first-child')).click();}
  const links=await browser.executeScript('return [...document.querySelectorAll(".dashboard-summary-card")].map(e=>e.getAttribute("href"))');assert.deepEqual(links,['/facebook-jobs','/facebook-jobs','/facebook-jobs?platform=instagram','/dashboard#devices','/dashboard#tasks']);
  for(const width of [1920,1366,390]) {
   if(width===390) await browser.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});else await browser.manage().window().setRect({width,height:1080});
      assert(await browser.executeScript('return document.documentElement.scrollWidth<=innerWidth'),'Page horizontal overflow '+width);
   await browser.executeScript('window.scrollTo(0,0)');
   fs.writeFileSync(path.resolve(__dirname,'../artifacts/dashboard-'+width+'.png'),await browser.takeScreenshot(),'base64');
  }
  const errors=(await browser.manage().logs().get(logging.Type.BROWSER)).filter(e=>!e.message.includes('favicon.ico'));assert.equal(errors.length,0,'Unexpected console error');
  console.log('DASHBOARD_REAL_API_OK: KPI/workload/device counts, search/filters/alerts, original links, 15s refresh keeps search/detail, responsive widths, console clean');
 } finally {await browser.quit();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
