const { Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardDevice = require('../models/DashboardDevice');
const DeviceTaskRun = require('../models/DeviceTaskRun');
const DeviceTaskCapability = require('../models/DeviceTaskCapability');
const FacebookAccount = require('../models/FacebookAccount');
const InstagramAccount = require('../models/InstagramAccount');
const FacebookPageJob = require('../models/FacebookPageJob');
const InstagramFacebookRegClaim = require('../models/InstagramFacebookRegClaim');
const { getTaskDispatcherSettings } = require('./settingsService');
const { TASK_TYPES } = require('./deviceTaskTypes');
const { acquireLegacyTask } = require('./legacyTaskAdapter');

const text = (value, max = 255) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'null' ? normalized.slice(0, max) : null;
};

const taskDataFromLegacy = (taskType, response) => {
  if (!response?.payload?.success) return null;
  const data = response.payload.data || {};
  const account = data.account || null;
  if (!account) return null;
  const currentPage = account.current_page || null;
  if (taskType === 'PAGE_JOB' && !currentPage?.page_id) return null;
  const entity = {
    NUOI_FACEBOOK: ['FACEBOOK_ACCOUNT', account.id],
    NUOI_INSTAGRAM: ['INSTAGRAM_ACCOUNT', account.id],
    REG_PAGE: ['FACEBOOK_ACCOUNT', account.id],
    REG_INSTAGRAM: ['INSTAGRAM_REG_CLAIM', data.claim_id],
    PAGE_JOB: ['FACEBOOK_PAGE_JOB', currentPage?.id || currentPage?.page_id],
    INSTAGRAM_JOB: ['INSTAGRAM_ACCOUNT', account.id],
  }[taskType];
  if (!entity?.[1]) return null;
  return {
    entity_type: entity[0],
    entity_id: entity[1],
    account_id: account.id || null,
    uid: account.uid || null,
    username: account.username || account.uid || null,
    page_id: currentPage?.page_id || null,
    payload: data,
  };
};

const serializeTask = (run, resumed = false) => ({
  id: Number(run.id),
  type: run.task_type,
  priority: Number(run.priority) || 0,
  account_id: run.account_id == null ? null : Number(run.account_id),
  uid: run.uid || null,
  username: run.username || null,
  page_id: run.page_id || null,
  device_id: run.device_id,
  started_at: run.locked_at,
  resumed,
  data: run.payload || null,
});

const getCapabilities = async ({ owner, deviceId, requested }) => {
  const stored = await DeviceTaskCapability.findAll({
    where: { owner_username: owner, device_id: deviceId },
    raw: true,
  });
  if (stored.length) return new Set(stored.filter((row) => row.enabled).map((row) => row.task_type));
  const requestedTypes = Array.isArray(requested)
    ? requested.map((value) => String(value || '').trim().toUpperCase()).filter((value) => TASK_TYPES.includes(value))
    : [];
  return new Set(requestedTypes.length ? requestedTypes : TASK_TYPES);
};

const markDevice = async ({ owner, deviceId, task = null, transaction }) => {
  const now = new Date();
  const [device] = await DashboardDevice.findOrCreate({
    where: { owner_username: owner, device_id: deviceId },
    defaults: {
      owner_username: owner,
      device_id: deviceId,
      device_name: deviceId,
      reported_status: task ? 'RUNNING' : 'IDLE',
      current_task: task?.task_type || null,
      current_uid: task?.uid || task?.username || null,
      started_at: task?.locked_at || null,
      last_seen: now,
    },
    transaction,
  });
  await device.reload({ transaction, lock: transaction.LOCK.UPDATE });
  await device.update({
    reported_status: task ? 'RUNNING' : 'IDLE',
    current_task: task?.task_type || null,
    current_uid: task?.uid || task?.username || null,
    started_at: task?.locked_at || null,
    last_seen: now,
    ...(task ? { last_error: null } : {}),
  }, { transaction });
  return device;
};

const releaseDomainLock = async (run, transaction = null) => {
  const options = transaction ? { transaction } : {};
  if (run.task_type === 'NUOI_FACEBOOK') {
    await FacebookAccount.update({
      nurture_status: 'NUOI_FAIL', nurture_locked_by: null, nurture_locked_at: null,
      nurture_run_id: null, nurture_scenario_id: null,
    }, { where: { id: run.account_id, nurture_locked_by: run.device_id }, ...options });
  } else if (run.task_type === 'NUOI_INSTAGRAM') {
    await InstagramAccount.update({
      nurture_status: 'NUOI_FAIL', nurture_locked_by: null, nurture_locked_at: null,
      nurture_run_id: null, nurture_scenario_id: null,
    }, { where: { id: run.account_id, nurture_locked_by: run.device_id }, ...options });
  } else if (run.task_type === 'REG_PAGE') {
    await FacebookAccount.update(
      { reg_page_locked_by: null, reg_page_locked_at: null },
      { where: { id: run.account_id, reg_page_locked_by: run.device_id }, ...options }
    );
  } else if (run.task_type === 'PAGE_JOB') {
    await FacebookPageJob.update(
      { job_status: 'CHUA_LAM', device_id: null },
      { where: { owner_username: run.owner_username, page_id: run.page_id, job_status: 'DANG_LAM', device_id: run.device_id }, ...options }
    );
    await FacebookAccount.update(
      { status: 'LOGIN_THANH_CONG', locked_by: null, locked_at: null },
      { where: { id: run.account_id, locked_by: run.device_id }, ...options }
    );
  } else if (run.task_type === 'REG_INSTAGRAM') {
    await InstagramFacebookRegClaim.update({
      status: 'REG_FAIL', fail_reason: 'Dispatcher timeout', completed_at: new Date(), locked_at: null,
    }, { where: { id: run.entity_id, device_id: run.device_id, status: 'DANG_REG' }, ...options });
  } else if (run.task_type === 'INSTAGRAM_JOB') {
    await InstagramAccount.update(
      { status: 'LOGIN_THANH_CONG', locked_by: null, locked_at: null },
      { where: { id: run.account_id, locked_by: run.device_id, status: 'DANG_LAM' }, ...options }
    );
  }
};

const releaseExpiredTasks = async (owner = null) => {
  const owners = owner
    ? [owner]
    : await DeviceTaskRun.findAll({ attributes: ['owner_username'], where: { status: 'RUNNING' }, group: ['owner_username'], raw: true })
      .then((rows) => rows.map((row) => row.owner_username));
  let released = 0;
  for (const ownerUsername of owners) {
    const settings = await getTaskDispatcherSettings(ownerUsername);
    const cutoff = new Date(Date.now() - settings.lock_timeout_minutes * 60 * 1000);
    const stale = await DeviceTaskRun.findAll({
      where: { owner_username: ownerUsername, status: 'RUNNING', locked_at: { [Op.lt]: cutoff } },
      order: [['locked_at', 'ASC']],
      limit: 500,
    });
    for (const run of stale) {
      const device = await DashboardDevice.findOne({
        where: { owner_username: ownerUsername, device_id: run.device_id },
        raw: true,
      });
      if (device?.last_seen && new Date(device.last_seen) >= cutoff) continue;
      await sequelize.transaction(async (transaction) => {
        const lockedRun = await DeviceTaskRun.findOne({
          where: { id: run.id, status: 'RUNNING' },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!lockedRun) return;
        await releaseDomainLock(lockedRun, transaction);
        await lockedRun.update({
          status: 'RELEASED',
          completed_at: new Date(),
          error_code: 'TASK_TIMEOUT',
          error_message: 'Device mat heartbeat qua thoi gian lock',
        }, { transaction });
        await markDevice({ owner: ownerUsername, deviceId: run.device_id, transaction });
        released += 1;
      });
    }
  }
  return released;
};

const getNextTask = async ({ owner, deviceId, requestedCapabilities, req }) => {
  await releaseExpiredTasks(owner);
  const [settings, capabilities] = await Promise.all([
    getTaskDispatcherSettings(owner),
    getCapabilities({ owner, deviceId, requested: requestedCapabilities }),
  ]);
  await DashboardDevice.findOrCreate({
    where: { owner_username: owner, device_id: deviceId },
    defaults: { owner_username: owner, device_id: deviceId, device_name: deviceId, last_seen: new Date() },
  });

  return sequelize.transaction(async (transaction) => {
    await DashboardDevice.findOne({
      where: { owner_username: owner, device_id: deviceId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const active = await DeviceTaskRun.findOne({
      where: { owner_username: owner, device_id: deviceId, status: { [Op.in]: ['RUNNING', 'REPORTING'] } },
      order: [['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (active) {
      await markDevice({ owner, deviceId, task: active, transaction });
      return { task: serializeTask(active, true), resumed: true };
    }

    const ordered = TASK_TYPES
      .filter((type) => capabilities.has(type) && settings.tasks[type]?.enabled)
      .sort((a, b) => settings.tasks[b].priority - settings.tasks[a].priority);

    for (const taskType of ordered) {
      const legacyResponse = await acquireLegacyTask(taskType, req, deviceId);
      const claimed = taskDataFromLegacy(taskType, legacyResponse);
      if (!claimed) continue;
      const previousRetry = await DeviceTaskRun.max('retry_count', {
        where: {
          owner_username: owner,
          task_type: taskType,
          entity_type: claimed.entity_type,
          entity_id: claimed.entity_id,
        },
        transaction,
      });
      const run = await DeviceTaskRun.create({
        owner_username: owner,
        device_id: deviceId,
        task_type: taskType,
        priority: settings.tasks[taskType].priority,
        ...claimed,
        status: 'RUNNING',
        locked_by: deviceId,
        locked_at: new Date(),
        retry_count: Number(previousRetry) || 0,
      }, { transaction });
      await markDevice({ owner, deviceId, task: run, transaction });
      return { task: serializeTask(run), resumed: false };
    }

    await markDevice({ owner, deviceId, transaction });
    return { task: null, resumed: false };
  });
};

module.exports = {
  getNextTask,
  releaseExpiredTasks,
  releaseDomainLock,
  serializeTask,
  getCapabilities,
  text,
};
