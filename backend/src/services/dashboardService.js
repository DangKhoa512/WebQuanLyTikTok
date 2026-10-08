const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardDevice = require('../models/DashboardDevice');
const DeviceTaskRun=require('../models/DeviceTaskRun');
const {warningForDevice}=require('./deviceMonitoringService');
const {classifyDevice,paginateDevices}=require('./deviceStatusService');
const FacebookNurtureLog = require('../models/FacebookNurtureLog');
const InstagramNurtureLog = require('../models/InstagramNurtureLog');
const FacebookRegPageReport = require('../models/FacebookRegPageReport');
const FacebookPageJob = require('../models/FacebookPageJob');
const InstagramFacebookRegClaim = require('../models/InstagramFacebookRegClaim');
const { getFacebookWorkflowSettings, getInstagramNurtureSettings, getTaskDispatcherSettings } = require('./settingsService');
const {normalizeOwner}=require('../utils/owner');
const { getDeviceTaskAvailability } = require('./taskEligibilityService');

const number = (value) => Number(value) || 0;
const numericRow = (row = {}) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key.endsWith('_at') ? value : number(value)]));
const one = async (sql, replacements) => {
  const [row = {}] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return numericRow(row);
};

const getAccountSummary = async (owner) => {
  const [facebook, instagram, pages] = await Promise.all([
    one(`SELECT COUNT(*) total,
      SUM(kind='job') job_total,
      SUM(kind='job' AND status='LOGIN_THANH_CONG') login_success,
      SUM(kind='job' AND status='DA_CHAY_XONG') done,
      SUM(kind='job' AND nurture_status='CHUA_NUOI') not_nurtured,
      SUM(kind='job' AND nurture_status='DA_NUOI') nurtured,
      SUM(status IN ('LOGIN_FAIL','ACCOUNT_DIE') OR live_status='die') errors
      FROM facebook_accounts WHERE owner_username=:owner AND trashed_at IS NULL`, { owner }),
    one(`SELECT COUNT(*) total,
      SUM(kind='job') job_total,
      SUM(kind='job' AND status='LOGIN_THANH_CONG') active,
      SUM(kind='job' AND nurture_status='CHUA_NUOI') not_nurtured,
      SUM(status IN ('LOGIN_FAIL','ACCOUNT_DIE') OR live_status='die') errors
      FROM instagram_accounts WHERE owner_username=:owner AND trashed_at IS NULL`, { owner }),
    one(`SELECT COUNT(*) total,
      SUM(job_status='CHUA_LAM') ready,
      SUM(job_status='DANG_LAM') running,
      SUM(job_status='DA_LAM') done
      FROM facebook_page_jobs WHERE owner_username=:owner AND is_active=1`, { owner }),
  ]);
  return { facebook, instagram, pages };
};

const getTaskSummary = async (owner, facebookWorkflow, instagramNurture) => {
  const now = Date.now();
  const replacements = {
    owner,
    regResetAt: new Date(now - facebookWorkflow.reg_page_reset_hours * 3600000),
    regWaitAt: new Date(now - facebookWorkflow.reg_page_wait_hours * 3600000),
    nurtureResetAt: new Date(now - facebookWorkflow.nurture_reset_hours * 3600000),
    pageResetAt: new Date(now - facebookWorkflow.page_job_reset_hours * 3600000),
    igNurtureResetAt: new Date(now - instagramNurture.cooldown_hours * 3600000),
  };
  const [nurtureFacebook, nurtureInstagram, regPage, pageJob, regInstagram, instagramJob] = await Promise.all([
    one(`SELECT
      SUM(status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND COALESCE(live_status,'unknown')<>'die'
        AND nurture_locked_by IS NULL AND reg_page_locked_by IS NULL AND cookies IS NOT NULL
        AND (nurture_status IN ('CHUA_NUOI','NUOI_FAIL') OR (nurture_status='DA_NUOI' AND last_nurture_at<=:nurtureResetAt))) ready,
      SUM(nurture_status='DANG_NUOI') running,
      SUM(nurture_status='NUOI_FAIL') errors
      FROM facebook_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL`, replacements),
    one(`SELECT
      SUM(status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND COALESCE(live_status,'unknown')<>'die'
        AND nurture_locked_by IS NULL AND cookies IS NOT NULL
        AND (nurture_status IN ('CHUA_NUOI','NUOI_FAIL') OR (nurture_status='DA_NUOI' AND last_nurture_at<=:igNurtureResetAt))) ready,
      SUM(nurture_status='DANG_NUOI') running,
      SUM(nurture_status='NUOI_FAIL') errors
      FROM instagram_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL`, replacements),
    one(`SELECT
      SUM(status IN ('LOGIN_THANH_CONG','DA_CHAY_XONG') AND COALESCE(live_status,'unknown')<>'die'
        AND page_token_status<>'die' AND page_count<15 AND login_at<=:regWaitAt AND reg_page_locked_by IS NULL
        AND (last_reg_page_at IS NULL OR last_reg_page_at<=:regResetAt)) ready,
      SUM(reg_page_locked_by IS NOT NULL) running,
      SUM(page_token_status='die' OR live_status='die') errors
      FROM facebook_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL`, replacements),
    one(`SELECT
      SUM(job_status='CHUA_LAM' OR (job_status='DA_LAM' AND completed_at<=:pageResetAt)) ready,
      SUM(job_status='DANG_LAM') running,
      0 errors
      FROM facebook_page_jobs WHERE owner_username=:owner AND is_active=1`, replacements),
    one(`SELECT
      (SELECT COUNT(*) FROM facebook_accounts f WHERE f.owner_username=:owner AND f.kind='job' AND f.trashed_at IS NULL
        AND f.status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND COALESCE(f.live_status,'unknown')<>'die'
        AND NOT EXISTS (SELECT 1 FROM instagram_facebook_reg_claims c WHERE c.owner_username=:owner AND c.facebook_account_id=f.id AND c.status='DANG_REG')) ready,
      SUM(status='DANG_REG') running,
      SUM(status='REG_FAIL') errors
      FROM instagram_facebook_reg_claims WHERE owner_username=:owner`, replacements),
    one(`SELECT
      SUM(status='LOGIN_THANH_CONG' AND COALESCE(live_status,'unknown')<>'die') ready,
      SUM(status='DANG_LAM') running,
      SUM(status IN ('LOGIN_FAIL','ACCOUNT_DIE') OR live_status='die') errors
      FROM instagram_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL`, replacements),
  ]);
  return { nurture_facebook: nurtureFacebook, nurture_instagram: nurtureInstagram, reg_page: regPage, page_job: pageJob, reg_instagram: regInstagram, instagram_job: instagramJob };
};

const getDevices = async (owner) => {
  const [heartbeats, aggregates] = await Promise.all([
    DashboardDevice.findAll({ where: { owner_username: owner }, order: [['last_seen', 'DESC']], raw: true }),
    sequelize.query(`SELECT device_id,
      SUM(facebook_accounts) facebook_accounts, SUM(instagram_accounts) instagram_accounts,
      SUM(ready_count) ready_count, MAX(last_activity_at) last_activity_at,
      MAX(current_task) inferred_task, MAX(current_uid) inferred_uid
      FROM (
        SELECT device_id, COUNT(*) facebook_accounts, 0 instagram_accounts,
          SUM(status IN ('LOGIN_THANH_CONG','DA_CHAY_XONG')) ready_count, MAX(updated_at) last_activity_at,
          MAX(CASE WHEN nurture_status='DANG_NUOI' THEN 'NUOI_FB' WHEN reg_page_locked_by IS NOT NULL THEN 'REG_PAGE' WHEN status='DANG_LAM' THEN 'PAGE_JOB' END) current_task,
          MAX(CASE WHEN nurture_status='DANG_NUOI' OR reg_page_locked_by IS NOT NULL OR status='DANG_LAM' THEN uid END) current_uid
        FROM facebook_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IS NOT NULL AND device_id<>'' GROUP BY device_id
        UNION ALL
        SELECT device_id, 0, COUNT(*), SUM(status='LOGIN_THANH_CONG'), MAX(updated_at),
          MAX(CASE WHEN nurture_status='DANG_NUOI' THEN 'NUOI_IG' WHEN status='DANG_LAM' THEN 'IG_JOB' END),
          MAX(CASE WHEN nurture_status='DANG_NUOI' OR status='DANG_LAM' THEN uid END)
        FROM instagram_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IS NOT NULL AND device_id<>'' GROUP BY device_id
      ) source GROUP BY device_id`, { replacements: { owner }, type: QueryTypes.SELECT }),
  ]);
  const latest=await sequelize.query(`SELECT r.device_id,r.task_type,r.uid,r.username,r.locked_at,r.status FROM device_task_runs r
    JOIN (SELECT device_id,MAX(id) id FROM device_task_runs WHERE owner_username=:owner GROUP BY device_id) latest ON latest.id=r.id
    WHERE r.owner_username=:owner`,{replacements:{owner},type:QueryTypes.SELECT});
  const latestMap=new Map(latest.map(run=>[run.device_id,run]));
  const active=await DeviceTaskRun.findAll({where:{owner_username:owner,status:{[Op.in]:['RUNNING','REPORTING']}},attributes:['device_id','task_type','uid','username','locked_at'],raw:true});
  const activeMap=new Map(active.map(run=>[run.device_id,run]));
  const map = new Map(aggregates.map((row) => [row.device_id, {
    device_id: row.device_id, device_name: row.device_id,
    facebook_accounts: number(row.facebook_accounts), instagram_accounts: number(row.instagram_accounts), ready_count: number(row.ready_count),
    current_task: row.inferred_task || null, current_uid: row.inferred_uid || null,
    started_at: null, last_seen: null, last_activity_at: row.last_activity_at, last_error: null,
  }]));
  heartbeats.forEach((row) => {
    const current = map.get(row.device_id) || { device_id: row.device_id, facebook_accounts: 0, instagram_accounts: 0, ready_count: 0 };
    map.set(row.device_id, { ...current, device_name: row.device_name || row.device_id, current_task: row.current_task, current_uid: row.current_uid, started_at: row.started_at, reported_status: row.reported_status, last_seen: row.last_seen, last_error: row.last_error });
  });
  const now = Date.now();
  const devices = [...map.values()].map((device) => {
    const last=latestMap.get(device.device_id);
    Object.assign(device,{last_task:last?.task_type||device.current_task||null,last_uid:last?.uid||last?.username||device.current_uid||null});
    const run=activeMap.get(device.device_id);
    if(run)Object.assign(device,{active_task:true,current_task:run.task_type,current_uid:run.uid||run.username,started_at:run.locked_at});
    const status=classifyDevice(device,now);
    return { ...device, ...warningForDevice(device,now), status, idle_with_work: status === 'IDLE' && device.ready_count > 0 };
  }).sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));
  const enrichedDevices=devices;
  const summary = enrichedDevices.reduce((out, device) => ({ ...out, total: out.total + 1, [device.status.toLowerCase()]: out[device.status.toLowerCase()] + 1 }), { total: 0, running: 0, idle: 0, offline: 0 });
  summary.online = summary.running + summary.idle;
  return { summary, rows: enrichedDevices };
};

const getActivity = async (owner) => {
  const [fbNurture, igNurture, regPages, regIg, pageJobs] = await Promise.all([
    FacebookNurtureLog.findAll({ where: { owner_username: owner }, order: [['completed_at', 'DESC']], limit: 12, raw: true }),
    InstagramNurtureLog.findAll({ where: { owner_username: owner }, order: [['completed_at', 'DESC']], limit: 12, raw: true }),
    FacebookRegPageReport.findAll({ where: { owner_username: owner }, order: [['created_at', 'DESC']], limit: 12, raw: true }),
    InstagramFacebookRegClaim.findAll({ where: { owner_username: owner, status: { [Op.in]: ['REG_XONG','REG_FAIL'] } }, order: [['completed_at', 'DESC']], limit: 12, raw: true }),
    FacebookPageJob.findAll({ where: { owner_username: owner, last_report_at: { [Op.ne]: null } }, order: [['last_report_at', 'DESC']], limit: 12, raw: true }),
  ]);
  return [
    ...fbNurture.map((row) => ({ type: 'NUOI_FB', status: row.status === 'DA_NUOI' ? 'SUCCESS' : 'FAIL', device_id: row.device_id, uid: row.uid, message: row.message, at: row.completed_at })),
    ...igNurture.map((row) => ({ type: 'NUOI_IG', status: row.status === 'DA_NUOI' ? 'SUCCESS' : 'FAIL', device_id: row.device_id, uid: row.uid, message: row.message, at: row.completed_at })),
    ...regPages.map((row) => ({ type: 'REG_PAGE', status: row.pages_added > 0 ? 'SUCCESS' : 'INFO', device_id: row.device_id, uid: row.uid, message: `Thêm ${row.pages_added} Page`, at: row.created_at })),
    ...regIg.map((row) => ({ type: 'REG_IG', status: row.status === 'REG_XONG' ? 'SUCCESS' : 'FAIL', device_id: row.device_id, uid: row.facebook_uid, message: row.fail_reason || row.instagram_uid, at: row.completed_at })),
    ...pageJobs.map((row) => ({ type: 'PAGE_JOB', status: row.job_status === 'DA_LAM' ? 'SUCCESS' : 'INFO', device_id: row.device_id, uid: row.page_id, message: row.page_name, at: row.last_report_at })),
  ].filter((row) => row.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
};

const getOwnerDashboardSummary = async (owner) => {
  const [facebookWorkflow, instagramNurture] = await Promise.all([getFacebookWorkflowSettings(owner), getInstagramNurtureSettings(owner)]);
  const [accounts, tasks, devices, activity] = await Promise.all([
    getAccountSummary(owner), getTaskSummary(owner, facebookWorkflow, instagramNurture), getDevices(owner), getActivity(owner),
  ]);
  const registry=require('./taskRegistryService').createRegistryService(sequelize);
  const registryActive=await registry.activated();
  const legacyDispatcher=registryActive ? null : await getTaskDispatcherSettings(owner);
  const task_registry=registryActive ? await registry.list(owner) : require('./taskRegistryPolicy').BUILTIN_TASKS.map(task=>({...task,user_enabled:!!legacyDispatcher.tasks[task.task_key]?.enabled,priority:legacyDispatcher.tasks[task.task_key]?.priority ?? task.priority}));
  const visibleTasks=Object.fromEntries(task_registry.map(task=>[task.stats_key,tasks[task.stats_key] || {ready:0,running:0,errors:0}]));
  // Scheduler totals/errors are global and cannot be attributed to this owner.
  const scheduler = null;
  const visibleActivityTypes=new Set(task_registry.map(task=>task.activity_key || task.task_key));
  const visibleActivity=registryActive ? activity.filter(row=>visibleActivityTypes.has(row.type)) : activity;
  return { accounts, tasks:visibleTasks, task_registry, devices, scheduler, activity: visibleActivity.slice(0, 30), generated_at: new Date().toISOString() };
};

const getDashboardSummary=async(owner,query={},legacyQuery)=>{
 // Legacy callers may pass a boolean; it no longer enables global aggregation.
 if(typeof query==='boolean')query=legacyQuery||{};
 owner=normalizeOwner(owner);
 const registry=require('./taskRegistryService').createRegistryService(sequelize);
 if(!owner||!await registry.identity(owner))throw Object.assign(new Error('Invalid dashboard owner'),{statusCode:401});
 const result=await getOwnerDashboardSummary(owner);
 result.scope='user';
 result.devices={summary:result.devices.summary,...paginateDevices(result.devices.rows,query)};
 const idle=result.devices.rows.filter(row=>row.status==='IDLE');
 const available=await getDeviceTaskAvailability(owner,idle.map(row=>row.device_id));
 for(const row of result.devices.rows)row.next_available=row.status==='IDLE'?available.get(row.device_id)||null:null;
 return result;
};
module.exports = { getDashboardSummary,getDevices };
