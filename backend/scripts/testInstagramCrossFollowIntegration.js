// Full integration uses a disposable database, never the application's database.
const path = require('path'), assert = require('assert'), crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');
const originalDb = process.env.DB_NAME;
const testDb = 'quanly_cross_follow_test_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
const safeDb = () => /^quanly_cross_follow_test_[0-9]+_[a-f0-9]+$/.test(testDb) && testDb !== originalDb;
if (!safeDb()) throw new Error('Unsafe test database');
const manager = new Sequelize('', process.env.DB_USER, process.env.DB_PASS, { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false });
let db, server, created = false;
(async () => {
  await manager.query('CREATE DATABASE `' + testDb + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); created = true;
  process.env.DB_NAME = testDb; process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  db = require('../src/config/database'); require('../src/models');
  await db.sync();
  const User = require('../src/models/User'), AppSetting = require('../src/models/AppSetting'), Account = require('../src/models/InstagramAccount');
  const user = await User.create({ username: 'cross_test_user', password_hash: 'test-only', role: 'user' });
  const other = await User.create({ username: 'cross_test_other', password_hash: 'test-only', role: 'user' });
  const registry = require('../src/services/taskRegistryService').createRegistryService(db);
  await registry.migrate();
  const task = (await registry.list()).find(task => task.task_key === 'NUOI_INSTAGRAM');
  await registry.saveMine(user.username, [{ task_id: task.id, enabled: true, priority: 100 }]);
  const express = require('express'), jwt = require('jsonwebtoken'), app = express(); app.use(express.json());
  app.use('/api/settings', require('../src/middleware/jwtAuth'), require('../src/routes/settings'));
  app.use('/api/instagram', require('../src/routes/instagram'));
  app.use('/api/device', require('../src/routes/device'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  const request = async (url, method = 'GET', body, device = false) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(device ? { 'x-api-key': user.username } : { Authorization: 'Bearer ' + token }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const defaults = { enabled: false, min: 0, max: 0, usernames: [] };
  const config = action => ({ active_scenario_id: 'test', cooldown_hours: 24, owner_username: other.username, scenarios: [{ id: 'test', name: 'Cross follow test', actions: { newfeed: { enabled: true, min: 30, max: 60 }, reels: { enabled: false, min: 0, max: 0 }, story: { enabled: false, min: 0, max: 0 }, ...(action === undefined ? {} : { cross_follow: action }) } }] });
  const save = value => request('/api/settings/instagram-nurture', 'PUT', value);
  const current = async () => (await request('/api/settings/instagram-nurture')).data.data.settings;
  assert.equal((await save(config())).status, 200);
  assert.deepEqual((await current()).scenarios[0].actions.cross_follow, defaults, 'Old scenarios default OFF');
  assert.equal(await AppSetting.count({ where: { owner_username: other.username } }), 0, 'Owner cannot be spoofed');
  const action = { enabled: true, min: 2, max: 5, usernames: Array.from({ length: 10 }, (_, i) => 'user' + i) };
  assert.equal((await save(config(action))).status, 200);
  assert.deepEqual((await current()).scenarios[0].total_duration_seconds, { min: 30, max: 60 }, 'Follow counts are not duration');
  const valid = await current();
  for (const bad of [{ ...action, min: 5, max: 2 }, { ...action, max: 10, usernames: action.usernames.slice(0, 5) }, { ...action, min: 1.5 }, { ...action, enabled: 'true' }, { ...action, usernames: [] }, { ...action, usernames: ['bad username'] }, { ...action, usernames: Array(201).fill('user') }, { ...action, min: -1 }, { ...action, min: '2' }]) {
    assert.equal((await save(config(bad))).status, 400, 'Reject invalid backend config');
    assert.deepEqual(await current(), valid, 'Invalid writes leave saved config unchanged');
  }
  const deduped = { enabled: true, min: 1, max: 2, usernames: [' @user1 ', 'user1', 'USER1', '', 'user2'] };
  assert.equal((await save(config(deduped))).status, 200);
  assert.deepEqual((await current()).scenarios[0].actions.cross_follow.usernames, ['user1', 'user2']);
  const off = { ...action, enabled: false };
  assert.equal((await save(config(off))).status, 200);
  assert.deepEqual((await current()).scenarios[0].actions.cross_follow, off, 'OFF retains list and range');
  await Account.create({ owner_username: user.username, uid: 'test_account', raw_data: 'isolated', device_id: 'CROSS_TEST', kind: 'job', status: 'LOGIN_THANH_CONG', live_status: 'live' });
  let acquired = await request('/api/instagram/nurture/get-account', 'POST', { device_id: 'CROSS_TEST' }, true);
  assert.equal(acquired.status, 200); assert.equal(acquired.data.data.scenario.actions.cross_follow.enabled, false); assert.deepEqual(acquired.data.data.scenario.actions.cross_follow.usernames, []);
  assert.equal((await save(config(action))).status, 200);
  acquired = await request('/api/instagram/nurture/get-account', 'POST', { device_id: 'CROSS_TEST' }, true);
  assert.equal(acquired.status, 200); assert.equal(acquired.data.data.scenario.actions.cross_follow.usernames.length, 5); assert(acquired.data.data.scenario.actions.cross_follow.usernames.every(name => action.usernames.includes(name)));
  const run = acquired.data.data.run_id;
  const updated = { ...action, usernames: action.usernames.map(name => name + '_new') };
  await save(config(updated));
  acquired = await request('/api/instagram/nurture/get-account', 'POST', { device_id: 'CROSS_TEST', request_id: 'edited-list' }, true);
  assert.equal(acquired.data.data.run_id, run); assert.equal(acquired.data.data.resumed, true);
  assert(acquired.data.data.scenario.actions.cross_follow.usernames.every(name => updated.usernames.includes(name)), 'New request uses latest pool');
  const dispatch = await request('/api/device/next-task', 'POST', { device_id: 'CROSS_TEST', capabilities: ['NUOI_INSTAGRAM'], request_id: 'dispatch-edited' }, true);
  assert.equal(dispatch.status, 200); assert(dispatch.data.task.data.scenario.actions.cross_follow.usernames.every(name => updated.usernames.includes(name)));
  const resumedConfig = { ...updated, usernames: updated.usernames.map(name => name + '_latest') };
  await save(config(resumedConfig));
  const resumedDispatch = await request('/api/device/next-task', 'POST', { device_id: 'CROSS_TEST', capabilities: ['NUOI_INSTAGRAM'], request_id: 'resume-edited' }, true);
  assert.equal(resumedDispatch.data.task.id, dispatch.data.task.id);
  assert.equal(resumedDispatch.data.task.resumed, true);
  assert(resumedDispatch.data.task.data.scenario.actions.cross_follow.usernames.every(name => resumedConfig.usernames.includes(name)));
  await save(config(updated));
  const fb = { cooldown_hours: 24, scenarios: [{ id: 'fb', name: 'Facebook regression', actions: { newfeed: { enabled: true, min: 30, max: 60 }, join_groups: { enabled: true, min: 1, max: 2, links: [' group1 ', 'group1', 'group2'] }, like_pages: { enabled: false, min: 1, max: 1, page_uids: ['page1'] } } }] };
  assert.equal((await request('/api/settings/facebook-nurture', 'PUT', fb)).status, 200);
  const fbSaved = (await request('/api/settings/facebook-nurture')).data.data.settings;
  assert.deepEqual(fbSaved.scenarios[0].actions.join_groups, { enabled: true, min: 1, max: 2, links: ['group1', 'group2'] });
  assert.deepEqual(fbSaved.scenarios[0].actions.like_pages, { enabled: false, min: 1, max: 1, page_uids: ['page1'] });
  assert.deepEqual(fbSaved.scenarios[0].total_duration_seconds, { min: 30, max: 60 });
  // Account targets use the same engine with a distinct action scope and live database pool.
  const source = await Account.findOne({ where: { owner_username: user.username, uid: 'test_account' } });
  const makeTarget = (uid,status,owner=user.username,extra={}) => Account.create({ owner_username: owner, kind: 'job', uid, raw_data: 'isolated', status, ...extra });
  const b = await makeTarget('ig_b','DANG_LAM'), c = await makeTarget('ig_c','DA_CHAY_XONG');
  const excluded = await Promise.all([makeTarget('ig_d','LOGIN_FAIL'), makeTarget('','LOGIN_THANH_CONG'), makeTarget('bad username','LOGIN_THANH_CONG'), makeTarget('other_owner','LOGIN_THANH_CONG',other.username), makeTarget('trashed','LOGIN_THANH_CONG',user.username,{trashed_at:new Date()}), makeTarget('reg_only','CHO_LOGIN',user.username,{kind:'reg'})]);
  const accountConfig = config(action); accountConfig.scenarios[0].actions.cross_account_follow = {enabled:true,min:1,max:6};
  assert.equal((await save(accountConfig)).status,200);
  const targetReq = (id,count=1,extra={}) => request('/api/instagram/nurture/targets','POST',{source_account_id:source.id,scenario_id:'test',request_id:id,action:'cross_account_follow',count,...extra},true);
  const batches = await Promise.all([targetReq('account-a'),targetReq('account-b')]);
  assert(batches.every(row=>row.status===200));
  assert.deepEqual(batches.flatMap(row=>row.data.data.targets).sort(),['ig_b','ig_c']);
  assert.deepEqual((await targetReq('account-a')).data.data.targets,batches[0].data.data.targets,'Stable retry');
  await source.update({device_id:'OTHER_PHONE'});
  assert.deepEqual((await targetReq('account-a')).data.data.targets,batches[0].data.data.targets,'History follows source, not phone');
  await b.update({status:'ACCOUNT_DIE'});
  const next = await targetReq('account-current',6); assert.equal(next.status,200); assert.deepEqual(next.data.data.targets,['ig_c']);
  await c.update({status:'LOGIN_FAIL'});
  const empty = await targetReq('account-empty',6); assert.equal(empty.status,200); assert.deepEqual(empty.data.data.targets,[]);
  assert.equal((await targetReq('account-owner',1,{source_account_id:excluded[3].id})).status,404);
  await c.update({status:'LOGIN_THANH_CONG'});
  const restored = await targetReq('account-restored'); assert.deepEqual(restored.data.data.targets,['ig_c']);
  const reportBody={source_account_id:source.id,scenario_id:'test',request_id:'account-restored',action:'cross_account_follow',results:[{target:'ig_c',status:'SUCCESS'}]};
  assert.equal((await request('/api/instagram/nurture/targets/report','POST',reportBody,true)).status,200);
  assert.equal((await request('/api/instagram/nurture/targets/report','POST',reportBody,true)).status,200);
  assert.equal((await request('/api/instagram/nurture/targets/report','POST',{...reportBody,action:'cross_follow'},true)).status,404,'Separate manual/account history');
  assert.equal((await targetReq('bad-action',1,{action:'unknown'})).status,400);
  for (const bad of [{enabled:true,min:3,max:2},{enabled:true,min:-1,max:2},{enabled:true,min:0,max:201},{enabled:'true',min:0,max:2},{enabled:true,min:1.5,max:2}]) {
    const invalid=structuredClone(accountConfig); invalid.scenarios[0].actions.cross_account_follow=bad;
    assert.equal((await save(invalid)).status,400);
  }
  await excluded[5].update({status:'LOGIN_THANH_CONG'});
  const regPool=await targetReq('account-reg-kind',6);assert.deepEqual(regPool.data.data.targets,['reg_only'],'Both account kinds qualify by current status; username pool deduplicates');
  await excluded[5].update({status:'CHO_LOGIN'});
  await source.update({device_id:'CROSS_TEST'});
  const deviceResult = await request('/api/instagram/nurture/get-account','POST',{device_id:'CROSS_TEST',request_id:'account-device'},true);
  assert.equal(deviceResult.status,200); assert.equal(deviceResult.data.data.scenario.actions.cross_account_follow.enabled,true); assert.deepEqual(deviceResult.data.data.scenario.actions.cross_account_follow.targets,['ig_c']);
  const dispatchResult=await request('/api/device/next-task','POST',{device_id:'CROSS_TEST',request_id:'account-dispatch',capabilities:['NUOI_INSTAGRAM']},true);
  assert.equal(dispatchResult.data.task.data.scenario.actions.cross_account_follow.enabled,true);
  assert.deepEqual(dispatchResult.data.task.data.scenario.actions.cross_account_follow.targets,['ig_c']);
  await save(config(updated));
  console.log('PASS account follow: live status/owner/username/self filters, races, cycle/empty pool, phone move, reports, validation, legacy/dispatcher');
  console.log('PASS backend: old scenarios/OFF, save/read DB, validation, normalization, device/resume/dispatcher, owner isolation, Facebook regression');
  if (process.argv.includes('--ui')) {
    const esbuild = require('../../frontend/node_modules/esbuild'), fs = require('fs');
    const contents = `import React,{useRef} from 'react';import {createRoot} from 'react-dom/client';import IG from './components/InstagramNurtureSettings';import FB from './components/FacebookNurtureSettings';import {SettingsDataProvider} from './components/SettingsData';import Toast from './components/Toast';function Preview(){const ref=useRef();return <SettingsDataProvider><div className="settings-page settings-platform-panel" style={{padding:24}}><IG ref={ref}/><button id="save-test" onClick={()=>ref.current.save()}>Save</button><FB/><Toast/></div></SettingsDataProvider>}createRoot(document.getElementById('root')).render(<Preview/>);`;
    const bundle = esbuild.buildSync({ stdin: { contents, resolveDir: path.resolve(__dirname, '../../frontend/src'), loader: 'jsx' }, bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'import.meta.env.VITE_API_BASE_URL': 'undefined' } }).outputFiles[0].text;
    app.get('/preview.js', (req, res) => res.type('js').send(bundle));
    app.get('/preview.css', (req, res) => res.type('css').send(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/styles/settings.css'), 'utf8')));
    app.get('/bootstrap', (req, res) => res.send('<html></html>'));
    app.get('/preview', (req, res) => res.send('<html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/preview.js"></script></html>'));
    const { Builder, By, Key } = require('selenium-webdriver'), chrome = require('selenium-webdriver/chrome');
    const browser = await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new', '--window-size=1366,900')).setChromeService(new chrome.ServiceBuilder(path.join(process.env.USERPROFILE, '.cache/selenium/chromedriver/win64/154.0.8037.92/chromedriver.exe'))).build();
    const wait = script => browser.wait(() => browser.executeScript(script), 15000);
    const clickText = async (selector, text) => { for (const el of await browser.findElements(By.css(selector))) if (await el.isDisplayed() && (await el.getText()) === text) return el.click(); throw new Error('Missing control: ' + text); };
    const edit = async (element, value) => { await element.sendKeys(Key.CONTROL, 'a', Key.NULL, String(value)); };
    try {
      await browser.get(base + '/bootstrap'); await browser.executeScript('localStorage.setItem("tiktok_admin_token",arguments[0]);', token); await browser.get(base + '/preview');
      await wait('return !!document.querySelector(".settings-activity-cross-follow textarea")');
      const card = () => browser.findElement(By.css('.settings-activity-cross-follow'));
      const numbers = () => browser.findElements(By.css('.settings-activity-cross-follow input[type=number]'));
      let fields = await numbers(); await edit(fields[0], 5); await edit(fields[1], 2);
      await wait('return document.querySelector(".settings-activity-cross-follow [role=alert]").textContent.includes("Min/Max")');
      await browser.findElement(By.id('save-test')).click(); assert.deepEqual((await current()).scenarios[0].actions.cross_follow, updated, 'UI blocks invalid range');
      await edit(fields[0], 2); await edit(fields[1], 10);
      await edit(await browser.findElement(By.css('.settings-activity-cross-follow textarea')), 'user1\nuser2\nuser3\nuser4\nuser5');
      await wait('return document.querySelector(".settings-activity-cross-follow [role=alert]").textContent.includes("Max không")');
      await browser.findElement(By.id('save-test')).click(); assert.deepEqual((await current()).scenarios[0].actions.cross_follow, updated, 'UI blocks too many targets');
      await edit(fields[0], 1); await edit(fields[1], 2); await edit(await browser.findElement(By.css('.settings-activity-cross-follow textarea')), '@user1\nuser1\nuser2');
      await wait('return document.querySelector(".settings-activity-cross-follow .settings-helper").textContent.includes("2 username")');
      await (await card()).findElement(By.css('[role=switch]')).click();
      assert.equal(await (await numbers())[0].isEnabled(), false); assert.equal(await browser.findElement(By.css('.settings-activity-cross-follow textarea')).isEnabled(), false);
      await (await card()).findElement(By.css('[role=switch]')).click(); assert.equal(await browser.findElement(By.css('.settings-activity-cross-follow textarea')).getAttribute('value'), '@user1\nuser1\nuser2');
      await browser.findElement(By.id('save-test')).click(); await browser.wait(async () => JSON.stringify((await current()).scenarios[0].actions.cross_follow.usernames) === JSON.stringify(['user1','user2']), 15000);
      await wait('return document.querySelector(".settings-activity-cross-follow textarea").value === "user1\\nuser2"');
      assert(await browser.executeScript('return document.querySelector("#ig-nurture .settings-duration").textContent.includes("Theo dõi chéo") && !document.querySelector("#ig-nurture .settings-duration").textContent.includes("Xem Story")'));
      await browser.get(base + '/preview'); await wait('return !!document.querySelector(".settings-activity-cross-follow textarea")');
      assert.equal(await browser.findElement(By.css('.settings-activity-cross-follow textarea')).getAttribute('value'), 'user1\nuser2', 'UI reload preserves normalized list');
      await clickText('#ig-nurture .settings-button', '+ Tạo nhanh kịch bản'); await clickText('dialog button', 'Tạo kịch bản');
      await browser.wait(async () => (await current()).scenarios.length === 11, 15000);
      const generated = (await current()).scenarios.slice(1); assert(generated.every(scenario => JSON.stringify(scenario.actions.cross_follow) === JSON.stringify(defaults)));
      await wait('return !document.querySelector("dialog")');
      assert.equal(await (await numbers())[0].isEnabled(), false);
      assert(await browser.executeScript('const c=document.querySelector(".settings-activity-cross-follow").getBoundingClientRect(),g=document.querySelector("#ig-nurture .settings-activities").getBoundingClientRect();return Math.abs(c.width-g.width)<2;'));
      assert.equal(await browser.findElement(By.css('#fb-nurture textarea')).getAttribute('value'), 'group1\ngroup2', 'Shared FB target editor preserved');
      await clickText('#ig-nurture .settings-button', '+ Tạo nhanh kịch bản');
      const modalCard = async label => { for(const el of await browser.findElements(By.css('dialog .settings-activity'))) if((await el.findElement(By.css('h3')).getText()) === label) return el; throw new Error('Missing activity '+label); };
      await (await modalCard('Xem Story (STR)')).findElement(By.css('[role=switch]')).click();
      let manual=await modalCard('Theo dõi chéo Username'); await manual.findElement(By.css('[role=switch]')).click();
      let range=await manual.findElements(By.css('input')); await edit(range[0],2); await edit(range[1],5);
      await edit(await manual.findElement(By.css('textarea')),'u1\nu2\nu3\nu4\nu5');
      let account=await modalCard('Follow chéo Account'); await account.findElement(By.css('[role=switch]')).click();
      range=await account.findElements(By.css('input')); await edit(range[0],3); await edit(range[1],6);
      assert.equal((await account.findElements(By.css('textarea'))).length,0);
      await clickText('dialog button','Tạo kịch bản');
      await browser.wait(async()=>(await current()).scenarios.length===21,15000);
      const setupSaved=await current(); const configured=setupSaved.scenarios.slice(11);
      assert.equal(configured.length,10);
      for(const scenario of configured){
        const a=scenario.actions;
        assert(a.newfeed.enabled && a.reels.enabled && !a.story.enabled);
        assert.deepEqual(scenario.total_duration_seconds,{min:900,max:1800});
        assert(a.cross_follow.enabled && a.cross_follow.min>=2 && a.cross_follow.max<=5 && a.cross_follow.min<=a.cross_follow.max);
        assert.deepEqual(a.cross_follow.usernames,['u1','u2','u3','u4','u5']);
        assert(a.cross_account_follow.enabled && a.cross_account_follow.min>=3 && a.cross_account_follow.max<=6 && a.cross_account_follow.min<=a.cross_account_follow.max);
      }
      assert.equal(setupSaved.generator_config.actions.story.enabled,false);
      await browser.get(base+'/preview'); await wait('return !!document.querySelector(".settings-activity-cross-account")');
      for(const scenario of configured){
        await browser.findElement(By.css('#ig-nurture select option[value="'+scenario.id+'"]')).click();
        const values=await browser.findElements(By.css('#ig-nurture .settings-activity-cross-account input'));
        assert.equal(Number(await values[0].getAttribute('value')),scenario.actions.cross_account_follow.min);
        assert.equal(Number(await values[1].getAttribute('value')),scenario.actions.cross_account_follow.max);
      }
      await clickText('#ig-nurture .settings-button','+ Tạo nhanh kịch bản');
      assert.equal(await (await modalCard('Xem Story (STR)')).findElement(By.css('[role=switch]')).getAttribute('aria-checked'),'false');
      assert.equal(await (await modalCard('Follow chéo Account')).findElement(By.css('[role=switch]')).getAttribute('aria-checked'),'true');
      await clickText('dialog button','Hủy');
      await clickText('#fb-nurture .settings-button','+ Tạo nhanh kịch bản');
      for(const label of ['Thích bài viết','Kết bạn ngẫu nhiên','Tham gia nhóm']){
        const card=await modalCard(label);const toggle=await card.findElement(By.css('[role=switch]'));
        if(await toggle.getAttribute('aria-checked')==='false') await toggle.click();
        const input=await card.findElement(By.css('input'));
        for(const value of [0,1,5,10,20,100,999]){await edit(input,value);assert.equal(await input.getAttribute('value'),String(value));}
      }
      const checkGeometry=async()=>assert(await browser.executeScript(`return [...document.querySelectorAll('dialog .settings-input-unit')].every(w=>{const i=w.querySelector('input'),u=w.querySelector('span'),a=i.getBoundingClientRect(),b=u.getBoundingClientRect(),r=w.getBoundingClientRect(),c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(i).font;return a.right<=b.left+1 && b.right<=r.right+1 && a.width>=c.measureText('999').width+36;});`),'Dedicated input value area fits 999 plus padding/spinner, no unit overlap/overflow');
      await checkGeometry();
      assert(await browser.executeScript('return getComputedStyle(document.querySelector("dialog .settings-activities")).gridTemplateColumns.split(" ").length===2'),'Two desktop cards per row');
      await browser.sendDevToolsCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await checkGeometry();
      assert(await browser.executeScript('return document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),'No modal overflow');
      const fbBefore=(await request('/api/settings/facebook-nurture')).data.data.settings;
      await clickText('dialog button','Tạo và lưu ngẫu nhiên');
      assert.deepEqual((await request('/api/settings/facebook-nurture')).data.data.settings,fbBefore,'Invalid FB generator range does not save');
      for(const label of ['Thích bài viết','Kết bạn ngẫu nhiên','Đồng ý kết bạn','Tham gia nhóm','Like Page']){
        const card=await modalCard(label);const toggle=await card.findElement(By.css('[role=switch]'));
        if(await toggle.getAttribute('aria-checked')==='false') await toggle.click();
        const fields=await card.findElements(By.css('input'));await edit(fields[0],1);await edit(fields[1],2);
        const texts=await card.findElements(By.css('textarea'));
        if(texts.length) await browser.executeScript("Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(arguments[0],arguments[1]);arguments[0].dispatchEvent(new Event('input',{bubbles:true}));",texts[0],label==='Like Page'?'page1\npage2':'group1\ngroup2');
      }
      await clickText('dialog button','Tạo và lưu ngẫu nhiên');
      await browser.wait(async()=>(await request('/api/settings/facebook-nurture')).data.data.settings.scenarios.length===11,15000);
      const facebookCreated=(await request('/api/settings/facebook-nurture')).data.data.settings.scenarios.slice(1);
      for(const scenario of facebookCreated){
        assert.deepEqual(scenario.total_duration_seconds,{min:900,max:1800});
        for(const key of ['like_newfeed','friend_request','accept_friend','join_groups','like_pages']){const a=scenario.actions[key];assert(a.enabled && a.min>=1 && a.max<=2 && a.min<=a.max);}
        assert.deepEqual(scenario.actions.join_groups.links,['group1','group2']);assert.deepEqual(scenario.actions.like_pages.page_uids,['page1','page2']);
      }
      console.log('PASS Facebook quick-create: validation, 10 scenarios, toggles/count ranges/groups/pages/time persistence unchanged');
      console.log('PASS quick scenarios: 10 configured scenarios persisted/reloaded/editable; enabled-only time allocation; separate follow sources; desktop/mobile unit geometry and all number samples');
      await browser.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert(await browser.executeScript('return document.documentElement.scrollWidth <= innerWidth'), 'No mobile overflow');
      console.log('PASS browser: inline validation/save blocking, normalize/reload, OFF retains data, quick generation OFF, dynamic summary, full-width/mobile layout, Facebook editor');
    } finally { await browser.quit(); }
  }
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close();
  if (created && safeDb()) await manager.query('DROP DATABASE `' + testDb + '`');
  await manager.close();
});
