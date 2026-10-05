const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const DeviceTaskCapability = require('../models/DeviceTaskCapability');
const {
  getInstagramJobSettings,
  getTaskDispatcherSettings,
  getFacebookWorkflowSettings,
  getInstagramFacebookRegSettings,
  getFacebookNurtureSettings,
  getInstagramNurtureSettings,
} = require('./settingsService');
const { TASK_TYPES } = require('./deviceTaskTypes');

const numericMap = (rows) => new Map(rows.map((row) => [String(row.device_id), Number(row.task_count) || 0]));

const getDeviceTaskAvailability = async (owner, deviceIds = []) => {
  const ids = [...new Set(deviceIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const [dispatcher, workflow, regIg, fbNurture, igNurture, igJob, capabilities] = await Promise.all([
    getTaskDispatcherSettings(owner),
    getFacebookWorkflowSettings(owner),
    getInstagramFacebookRegSettings(owner),
    getFacebookNurtureSettings(owner),
    getInstagramNurtureSettings(owner),
    getInstagramJobSettings(owner),
    DeviceTaskCapability.findAll({
      where: { owner_username: owner, device_id: ids },
      raw: true,
    }),
  ]);
  const now = Date.now();
  const replacements = {
    owner,
    igMinDays: igJob.min_login_days,
    igJobAt: new Date(now - igJob.min_login_days * 86400000),
    deviceIds: ids,
    fbNurtureAt: new Date(now - workflow.nurture_reset_hours * 3600000),
    igNurtureAt: new Date(now - igNurture.cooldown_hours * 3600000),
    regWaitAt: new Date(now - workflow.reg_page_wait_hours * 3600000),
    regResetAt: new Date(now - workflow.reg_page_reset_hours * 3600000),
    pageResetAt: new Date(now - workflow.page_job_reset_hours * 3600000),
    regIgResetAt: new Date(now - regIg.reuse_hours * 3600000),
    regIgLimit: regIg.max_instagram_per_facebook,
  };
  const query = (sql) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const [fbNurtureRows, igNurtureRows, regPageRows, pageJobRows, regIgRows, igJobRows] = await Promise.all([
    fbNurture.scenarios.some((scenario) => Object.values(scenario.actions || {}).some((action) => action.enabled))
      ? query(`SELECT device_id, COUNT(*) task_count FROM facebook_accounts
          WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IN (:deviceIds)
            AND status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG')
            AND COALESCE(live_status,'unknown')<>'die' AND cookies IS NOT NULL AND cookies<>''
            AND nurture_locked_by IS NULL AND reg_page_locked_by IS NULL
            AND (nurture_status IN ('CHUA_NUOI','NUOI_FAIL') OR (nurture_status='DA_NUOI' AND last_nurture_at<=:fbNurtureAt))
          GROUP BY device_id`)
      : [],
    igNurture.scenarios.some((scenario) => Object.values(scenario.actions || {}).some((action) => action.enabled))
      ? query(`SELECT device_id, COUNT(*) task_count FROM instagram_accounts
          WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IN (:deviceIds)
            AND status='LOGIN_THANH_CONG' AND COALESCE(live_status,'unknown')<>'die'
            AND nurture_locked_by IS NULL
            AND (nurture_status IN ('CHUA_NUOI','NUOI_FAIL') OR (nurture_status='DA_NUOI' AND last_nurture_at<=:igNurtureAt))
          GROUP BY device_id`)
      : [],
    query(`SELECT device_id, COUNT(*) task_count FROM facebook_accounts
      WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IN (:deviceIds)
        AND status IN ('LOGIN_THANH_CONG','DA_CHAY_XONG') AND COALESCE(live_status,'unknown')<>'die'
        AND login_at<=:regWaitAt AND page_count<15 AND page_token_status<>'die'
        AND nurture_status<>'DANG_NUOI' AND reg_page_locked_by IS NULL
        AND (last_reg_page_at IS NULL OR last_reg_page_at<=:regResetAt)
      GROUP BY device_id`),
    query(`SELECT account.device_id, COUNT(*) task_count
      FROM facebook_page_jobs page
      INNER JOIN facebook_accounts account ON account.id=page.facebook_account_id
      WHERE page.owner_username=:owner AND page.is_active=1 AND account.owner_username=:owner
        AND account.kind='job' AND account.trashed_at IS NULL AND account.device_id IN (:deviceIds)
        AND account.status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG')
        AND COALESCE(account.live_status,'unknown')<>'die' AND account.nurture_status<>'DANG_NUOI'
        AND account.reg_page_locked_by IS NULL
        AND (page.job_status='CHUA_LAM' OR (page.job_status='DA_LAM' AND page.completed_at<=:pageResetAt))
      GROUP BY account.device_id`),
    query(`SELECT account.device_id, COUNT(*) task_count FROM facebook_accounts account
      WHERE account.owner_username=:owner AND account.kind='job' AND account.trashed_at IS NULL
        AND account.device_id IN (:deviceIds) AND account.status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG')
        AND COALESCE(account.live_status,'unknown')<>'die' AND account.cookies IS NOT NULL AND account.cookies<>''
        AND NOT EXISTS (
          SELECT 1 FROM instagram_facebook_reg_claims active_claim
          WHERE active_claim.owner_username=:owner AND active_claim.facebook_account_id=account.id AND active_claim.status='DANG_REG'
        )
        AND NOT EXISTS (
          SELECT 1 FROM instagram_facebook_reg_claims cooldown_claim
          WHERE cooldown_claim.owner_username=:owner AND cooldown_claim.facebook_account_id=account.id
            AND cooldown_claim.status IN ('REG_XONG','REG_FAIL') AND cooldown_claim.eligibility_reset_at IS NULL
            AND cooldown_claim.completed_at>:regIgResetAt
        )
      GROUP BY account.device_id`),
    query(`SELECT device_id, COUNT(*) task_count FROM instagram_accounts
      WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IN (:deviceIds)
        AND status='LOGIN_THANH_CONG' AND COALESCE(live_status,'unknown')<>'die'
        AND nurture_status<>'DANG_NUOI'
        AND (:igMinDays = 0 OR login_at <= :igJobAt)
      GROUP BY device_id`),
  ]);

  const counts = {
    NUOI_FACEBOOK: numericMap(fbNurtureRows),
    NUOI_INSTAGRAM: numericMap(igNurtureRows),
    REG_PAGE: numericMap(regPageRows),
    REG_INSTAGRAM: numericMap(regIgRows),
    PAGE_JOB: numericMap(pageJobRows),
    INSTAGRAM_JOB: numericMap(igJobRows),
  };
  const capabilityMap = new Map();
  capabilities.forEach((row) => {
    if (!capabilityMap.has(row.device_id)) capabilityMap.set(row.device_id, new Map());
    capabilityMap.get(row.device_id).set(row.task_type, row.enabled === true || row.enabled === 1);
  });
  const ordered = TASK_TYPES
    .filter((type) => dispatcher.tasks[type]?.enabled)
    .sort((a, b) => dispatcher.tasks[b].priority - dispatcher.tasks[a].priority);
  return new Map(ids.map((deviceId) => {
    const configured = capabilityMap.get(deviceId);
    const taskType = ordered.find((type) => (!configured || configured.get(type) !== false) && (counts[type].get(deviceId) || 0) > 0);
    return [deviceId, taskType ? {
      task_type: taskType,
      count: counts[taskType].get(deviceId) || 0,
      priority: dispatcher.tasks[taskType].priority,
    } : null];
  }));
};

module.exports = { getDeviceTaskAvailability };
