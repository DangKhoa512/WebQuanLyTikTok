const path = require('path');
const fs = require('fs');
const assert = require('assert');
require('../backend/node_modules/dotenv').config({path:path.resolve(__dirname,'../backend/.env')});
const {Builder,By,Key,logging} = require('../backend/node_modules/selenium-webdriver');
const chrome = require('../backend/node_modules/selenium-webdriver/chrome');
const apiBase='http://localhost:3000/api';
(async () => {
  const login = await fetch(apiBase+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USER || 'admin',password:process.env.ADMIN_PASS})});
  const auth = await login.json();
  if (!auth.success || !auth.data?.token) throw new Error('Local login failed; credentials withheld');
  const api=async(url,body) => {
    const res=await fetch(apiBase+url,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.data.token},...(body?{body:JSON.stringify(body)}:{})});
    const data=await res.json(); if(!res.ok || !data.success) throw new Error('Settings API request failed: '+url+' (HTTP '+res.status+')'); return data.data;
  };
  const originalIgLimit=(await api('/settings/instagram-login-limit')).settings.limit;
  let restoreIg=false;
  const prefs=new logging.Preferences();prefs.setLevel(logging.Type.BROWSER,logging.Level.SEVERE);
  const driver=new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1920,1080','--disable-gpu')).setChromeService(new chrome.ServiceBuilder(path.join(process.env.USERPROFILE,'.cache/selenium/chromedriver/win64/154.0.8037.92/chromedriver.exe'))).setLoggingPrefs(prefs);
  const browser=await driver.build();
  const wait=async(script)=>browser.wait(async()=>browser.executeScript(script),20000);
  const clickText=async(selector,text)=>{
    await browser.wait(async () => {
      const els=await browser.findElements(By.css(selector));
      for(const el of els) {
        try { if(await el.isDisplayed() && (await el.getText()).trim()===text) { await el.click(); return true; } }
        catch(err) { if(!String(err.name).includes('StaleElementReference')) throw err; }
      }
      return false;
    },15000,'Visible control missing: '+text);
  };
  const platform=async(text)=>clickText('.settings-platform-tab',text);
  const sub=async(text)=>clickText('.settings-sub-tabs [role=tab]',text);
  const setInput=async(selector,value)=>{const el=await browser.findElement(By.css(selector));await el.sendKeys(Key.CONTROL,'a',Key.NULL,String(value),Key.TAB);return el;};
  const visiblePanels=async(prefix)=>browser.executeScript('return [...document.querySelectorAll(arguments[0]+" [role=tabpanel]")].filter(el=>el.getClientRects().length>0).length',prefix);
  const save=async()=>{await clickText('.settings-save-bar .primary','Lưu thay đổi');await wait('return ![...document.querySelectorAll(".settings-save-bar")].some(el=>el.getClientRects().length)');};
  const open=async()=>{await browser.get('http://localhost:5173/proxy-settings');await wait('return !!document.querySelector("#tiktok-panel-overview") && document.querySelector("#tiktok-panel-overview").getClientRects().length>0');};
  try {
    await browser.get('http://localhost:5173/login');
    await browser.executeScript('localStorage.setItem("tiktok_admin_token",arguments[0]);localStorage.setItem("tiktok_admin_user",arguments[1]);localStorage.setItem("tiktok_admin_role",arguments[2]);',auth.data.token,auth.data.username,auth.data.role);
    await open();await platform('Instagram');
    await wait('return !!document.querySelector("#instagram-panel-overview") && !!document.querySelector("#ig-nurture.settings-card")');
    assert.equal(await visiblePanels('.ig-settings-panel'),1);
    assert.equal(await browser.executeScript('return [...document.querySelectorAll("#instagram-panel-overview input")].filter(el=>el.getClientRects().length).length'),0);
    await sub('Nhiệm vụ');
    await setInput('#ig-tasks .settings-action-row:nth-child(2) .settings-field:last-child input',10);
    await sub('Cookie');await sub('Kịch bản nuôi');await sub('Nhiệm vụ');
    assert.equal(await browser.findElement(By.css('#ig-tasks .settings-action-row:nth-child(2) .settings-field:last-child input')).getAttribute('value'),'10');
    await clickText('.settings-save-bar .ghost','Hủy thay đổi');
    await sub('Account');
    const selector='#ig-account input[aria-label="Limit của '+auth.data.username+'"]';
    await setInput(selector,originalIgLimit+1);restoreIg=true;
    await save();assert.equal((await api('/settings/instagram-login-limit')).settings.limit,originalIgLimit+1);
    await open();await platform('Instagram');await wait('return !!document.querySelector("#ig-account input")');await sub('Account');
    assert.equal(Number(await browser.findElement(By.css(selector)).getAttribute('value')),originalIgLimit+1);
    await setInput(selector,originalIgLimit);await save();restoreIg=false;
    await platform('TikTok');await sub('Điều kiện');
    const condition='#tiktok-panel-conditions input';
    await setInput(condition,7);await sub('Account');await sub('Điều kiện');
    assert.equal(await browser.findElement(By.css(condition)).getAttribute('value'),'7');
    await clickText('.settings-save-bar .ghost','Hủy thay đổi');
    const chromeOriginal=(await api('/settings/chrome-khang-limit')).settings.limit;
    await sub('Account');
    const chromeSelector='#tiktok-chrome-limit input[aria-label="Limit của '+auth.data.username+'"]';
    try {
      await setInput(chromeSelector,chromeOriginal+1);await save();
      assert.equal((await api('/settings/chrome-khang-limit')).settings.limit,chromeOriginal+1);
      await open();await sub('Account');await wait('return !!document.querySelector("#tiktok-chrome-limit input")');
      assert.equal(Number(await browser.findElement(By.css(chromeSelector)).getAttribute('value')),chromeOriginal+1);
      await setInput(chromeSelector,chromeOriginal);await save();
    } finally { await api('/settings/chrome-khang-limit',{limit:chromeOriginal}); }
    await platform('Facebook');await sub('Reg Page');
    const workflowOriginal=(await api('/settings/facebook-workflow')).settings;
    const fbSelector='#facebook-panel-reg .settings-field:first-child input';
    try {
      await setInput(fbSelector,workflowOriginal.reg_page_wait_hours === 720 ? 719 : workflowOriginal.reg_page_wait_hours+1);
      await sub('Kịch bản nuôi');await sub('Reg Page');
      assert.equal(Number(await browser.findElement(By.css(fbSelector)).getAttribute('value')),workflowOriginal.reg_page_wait_hours === 720 ? 719 : workflowOriginal.reg_page_wait_hours+1);
      await save();assert.equal((await api('/settings/facebook-workflow')).settings.reg_page_wait_hours,workflowOriginal.reg_page_wait_hours === 720 ? 719 : workflowOriginal.reg_page_wait_hours+1);
      await open();await platform('Facebook');await sub('Reg Page');
      await wait('return !!document.querySelector("#facebook-panel-reg input")');
      assert.equal(Number(await browser.findElement(By.css(fbSelector)).getAttribute('value')),workflowOriginal.reg_page_wait_hours === 720 ? 719 : workflowOriginal.reg_page_wait_hours+1);
      await setInput(fbSelector,workflowOriginal.reg_page_wait_hours);await save();
    } finally { await api('/settings/facebook-workflow',workflowOriginal); }
    await platform('Cài đặt chung');await sub('Điều phối tác vụ');
    const dispatcherOriginal=(await api('/settings/task-dispatcher')).settings;
    const retrySelector='#common-dispatcher .settings-form-row .settings-field:last-child input';
    const nextRetry=dispatcherOriginal.max_retry === 20 ? 19 : dispatcherOriginal.max_retry+1;
    try {
      await setInput(retrySelector,nextRetry);await sub('Proxy');
      assert.equal(await browser.executeScript('return [...document.querySelectorAll("#common-panel-proxy textarea")].filter(el=>el.getClientRects().length).length'),0);
      await sub('Điều phối tác vụ');assert.equal(Number(await browser.findElement(By.css(retrySelector)).getAttribute('value')),nextRetry);
      await save();assert.equal((await api('/settings/task-dispatcher')).settings.max_retry,nextRetry);
      await open();await platform('Cài đặt chung');await sub('Điều phối tác vụ');
      assert.equal(Number(await browser.findElement(By.css(retrySelector)).getAttribute('value')),nextRetry);
      // Genuine browser offline failure: retain the unsaved field and retry after reconnecting.
      await setInput(retrySelector,dispatcherOriginal.max_retry);
      await browser.sendDevToolsCommand('Network.enable',{});
      await browser.sendDevToolsCommand('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      await clickText('.settings-save-bar .primary','Lưu thay đổi');
      await wait('return [...document.querySelectorAll(".settings-save-bar .primary")].some(el=>el.getClientRects().length && !el.disabled)');
      assert.equal(Number(await browser.findElement(By.css(retrySelector)).getAttribute('value')),dispatcherOriginal.max_retry);
      assert(await browser.executeScript('return [...document.querySelectorAll(".settings-save-bar")].some(el=>el.getClientRects().length)'));
      await browser.sendDevToolsCommand('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await save();assert.equal((await api('/settings/task-dispatcher')).settings.max_retry,dispatcherOriginal.max_retry);
    } finally {
      await browser.sendDevToolsCommand('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await api('/settings/task-dispatcher',dispatcherOriginal);
    }
    await sub('Tham số check');
    const delaySelector='#common-panel-check .settings-check-fields > div:nth-child(2) input[type=number]';
    const delayOriginal=await browser.findElement(By.css(delaySelector)).getAttribute('value');
    const nextDelay=Number(delayOriginal) === 5000 ? 4900 : Number(delayOriginal)+100;
    await setInput(delaySelector,nextDelay);await save();await open();await platform('Cài đặt chung');await sub('Tham số check');
    assert.equal(Number(await browser.findElement(By.css(delaySelector)).getAttribute('value')),nextDelay);
    await setInput(delaySelector,delayOriginal);await save();
    console.log('COMMON_REAL_TABS_OK: masked proxy, draft retention, dispatcher and local check save/reload, offline failure preserves draft; originals restored');
    // Fresh page: each settings GET is made at most once, even after revisiting both levels of tabs.
    await open();
    for(const name of ['Facebook','Instagram','Cài đặt chung','TikTok','Facebook','Instagram']) await platform(name);
    await wait('return !!document.querySelector("#ig-nurture.settings-card") && !!document.querySelector("#fb-nurture.settings-card")');
    const requests=await browser.executeScript('return performance.getEntriesByType("resource").filter(e=>e.initiatorType==="xmlhttprequest" && e.name.includes("/api/settings/")).map(e=>new URL(e.name).pathname)');
    const counts={};for(const url of requests) counts[url]=(counts[url] || 0)+1;
    assert(Object.values(counts).every(count=>count===1),'Settings GET duplicated on tab switches');
    await sub('Nhiệm vụ');
    const followMax='#ig-tasks .settings-action-row:nth-child(2) .settings-field:last-child input';
    const originalFollow=await browser.findElement(By.css(followMax)).getAttribute('value');
    await setInput(followMax,Number(originalFollow)+1);await platform('Facebook');await platform('Instagram');
    assert.equal(Number(await browser.findElement(By.css(followMax)).getAttribute('value')),Number(originalFollow)+1);
    await clickText('.settings-save-bar .ghost','Hủy thay đổi');
    // Summary actions switch views; all views have exactly one visible child panel.
    const viewSets={TikTok:['Tổng quan','Account','Điều kiện','API máy'],Facebook:['Tổng quan','Account','Reg Page','Nuôi Facebook','Page Job','Kịch bản nuôi'],Instagram:['Tổng quan','Account','Reg IG','Nhiệm vụ','Điều kiện','Cookie','Kịch bản nuôi'],'Cài đặt chung':['Tổng quan','Điều phối tác vụ','Proxy','Tham số check']};
    const ids={TikTok:'tiktok',Facebook:'facebook',Instagram:'instagram','Cài đặt chung':'common'};
    fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
    for(const size of [[1920,1080],[1366,768],[390,844]]) {
      if(size[0]===390) await browser.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      else await browser.manage().window().setRect({width:size[0],height:size[1]});
      for(const [name,views] of Object.entries(viewSets)) {
        await platform(name);
        for(const view of views) {
          await sub(view);
          assert.equal(await visiblePanels('#platform-panel-'+ids[name]),1,name+' / '+view+' shows multiple views');
          assert(await browser.executeScript('return document.documentElement.scrollWidth<=innerWidth'),name+' / '+view+' overflows width '+size[0]);
        }
        fs.writeFileSync(path.resolve(__dirname,'../artifacts/settings-'+ids[name]+'-'+size[0]+'.png'),await browser.takeScreenshot(),'base64');
      }
    }
    await browser.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride',{});
    await browser.manage().window().setRect({width:1920,height:1080});
    for(const name of ['Facebook','Instagram']) {
      await platform(name);await sub('Kịch bản nuôi');
      await clickText('#platform-panel-'+ids[name]+' .settings-nurture-toolbar .secondary','+ Tạo kịch bản');
      const editor='#platform-panel-'+ids[name]+' .settings-scenario-heading input';
      await setInput(editor,'Bản nháp kiểm thử');await sub('Tổng quan');await sub('Kịch bản nuôi');
      assert.equal(await browser.findElement(By.css(editor)).getAttribute('value'),'Bản nháp kiểm thử');
      await clickText('.settings-save-bar .ghost','Hủy thay đổi');
      await clickText('#platform-panel-'+ids[name]+' .settings-nurture-toolbar .primary','+ Tạo nhanh kịch bản');
      assert(await browser.executeScript('return document.querySelector("dialog").open'));
      await browser.findElement(By.css('dialog input')).sendKeys(Key.ESCAPE);
      await wait('return !document.querySelector("dialog")');
    }
    const severe=await browser.manage().logs().get(logging.Type.BROWSER);
    const unexpected=severe.filter(item=>!item.message.includes('ERR_INTERNET_DISCONNECTED') && !item.message.includes('favicon.ico'));
    assert.equal(unexpected.length,0,'Unexpected browser console errors: '+unexpected.map(item=>item.message).join(';'));
    console.log('ALL_SETTINGS_UI_OK: one view per tab, cross-platform drafts, no duplicate GET, desktop/laptop/mobile overflow, shared scenario editor and modal, no unexpected console errors');
    console.log('FACEBOOK_REAL_TABS_OK: draft retention, real workflow save and reload; original setting restored');
    console.log('TIKTOK_REAL_TABS_OK: draft retention, save and reload; original limit restored');
    console.log('INSTAGRAM_REAL_TABS_OK: one view, no form in overview, draft retention, real save and reload; original limit restored');
  } finally {
    if(restoreIg) await api('/settings/instagram-login-limit',{limit:originalIgLimit});
    await browser.quit();
  }
})().catch(err=>{console.error(err.stack);process.exitCode=1;});
