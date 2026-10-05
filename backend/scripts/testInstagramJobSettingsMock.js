// Mock-only regression checks: no database or external network calls.
const assert = require('assert');
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const AppSetting = require('../src/models/AppSetting');
const Account = require('../src/models/InstagramAccount');
const stats = require('../src/services/instagramJobStatService');
const stored = new Map();
const keyOf = (where) => where.owner_username + ':' + where.setting_key;
AppSetting.findOne = async ({where}) => stored.get(keyOf(where)) || null;
AppSetting.findOrCreate = async ({where, defaults}) => {
  const key = keyOf(where);
  if (stored.has(key)) return [stored.get(key), false];
  const row = {...defaults, update: async function(data) { Object.assign(this, data); }};
  stored.set(key, row); return [row, true];
};
sequelize.transaction = async (callback) => callback({LOCK:{UPDATE:'UPDATE'}});
Account.update = async () => [0];
stats.addInstagramAccountClaim = async () => {};
const settings = require('../src/controllers/settingsController');
const instagram = require('../src/controllers/instagramController');
const invoke = async (handler, req) => {
  let result;
  await handler(req, {status(code) {this.code=code;return this;}, json(body) {result={code:this.code || 200,body};}}, (err)=>{throw err;});
  return result;
};
const req = (body, role='user', username='alice') => ({admin:{username,role},body,query:{}});
(async () => {
  let result = await invoke(settings.updateInstagramLoginLimit, req({limit:12,owner_username:'admin'}));
  assert.equal(result.code,200);
  assert(stored.has('alice:instagram_login_machine_limit'));
  assert(!stored.has('admin:instagram_login_machine_limit'));
  assert.equal((await invoke(settings.listInstagramLoginLimits, req({}))).code,403);
  assert.equal((await invoke(settings.updateInstagramLoginLimit,req({limit:1.5}))).code,400);
  assert.equal((await invoke(settings.updateInstagramLoginLimit,req({limit:20,owner_username:'alice'},'admin','admin'))).code,200);
  const job={min_login_days:4,actions:{like:{enabled:true,min_delay_seconds:2,max_delay_seconds:5},follow:{enabled:false,min_delay_seconds:3,max_delay_seconds:7}}};
  assert.equal((await invoke(settings.updateInstagramJob,req(job))).code,200);
  assert.equal((await invoke(settings.updateInstagramJob,req({...job,min_login_days:-1}))).code,400);
  assert.equal((await invoke(settings.updateInstagramJob,req({...job,actions:{...job.actions,like:{...job.actions.like,min_delay_seconds:6}}}))).code,400);
  const now=Date.parse('2026-10-07T10:00:00+07:00'); Date.now=()=>now;
  for (const age of [4*86400000-1,4*86400000,5*86400000,null]) {
    let claimed=false;
    Account.findOne=async ({where}) => {
      assert.equal(where.owner_username,'alice');
      if (where.status==='DANG_LAM') return null;
      assert.equal(where.login_at[Op.lte].getTime(),now-4*86400000);
      if (age===null || now-age>where.login_at[Op.lte].getTime()) return null;
      return {update:async()=>{claimed=true;},toJSON:()=>({id:1,uid:'mock',status:'DANG_LAM'})};
    };
    result=await invoke(instagram.getLoginSuccess,{api_owner_username:'alice',body:{device_id:'mock-phone'},query:{}});
    assert.equal(claimed,age!==null && age>=4*86400000);
    assert.deepEqual(result.body.data.job_settings,job);
    assert.equal(result.body.data.account!==null,claimed);
  }
  const dispatcher = require('../src/services/taskDispatcherService');
  dispatcher.getNextTask = async () => ({task:{type:'INSTAGRAM_JOB',id:1},resumed:false});
  const device = require('../src/controllers/deviceController');
  result = await invoke(device.nextTask,{api_owner_username:'alice',body:{device_id:'mock-phone'},query:{}});
  assert.deepEqual(result.body.task.job_settings,job);
  const capabilities = require('../src/models/DeviceTaskCapability');
  capabilities.findAll = async () => [];
  let checkedJobQuery = false;
  sequelize.query = async (sql,{replacements}) => {
    if (sql.includes(":igMinDays = 0 OR login_at <= :igJobAt")) {
      checkedJobQuery = true;
      const { injectReplacements } = require('sequelize/lib/utils/sql');
      for (const days of [0, 4]) {
        const rendered = injectReplacements(sql, sequelize.dialect, {...replacements, igMinDays: days});
        assert(!/:igMinDays|:igJobAt|:owner|:deviceIds/.test(rendered), 'SQL must not retain named parameters');
        assert(rendered.includes('(' + days + ' = 0 OR login_at <='));
      }
      assert.equal(replacements.owner,'alice');
      assert.equal(replacements.igMinDays,4);
      assert.equal(replacements.igJobAt.getTime(),now-4*86400000);
    }
    return [];
  };
  await require('../src/services/taskEligibilityService').getDeviceTaskAvailability('alice',['mock-phone']);
  assert(checkedJobQuery);
  console.log('INSTAGRAM_JOB_SETTINGS_MOCK_OK: owner permissions, validation, age boundary, dispatcher and API settings');
})().catch((err)=>{console.error(err);process.exitCode=1;});
