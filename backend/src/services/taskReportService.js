const sequelize = require('../config/database');
const DeviceTaskRun = require('../models/DeviceTaskRun');
const DashboardDevice = require('../models/DashboardDevice');
const FacebookAccount = require('../models/FacebookAccount');
const InstagramAccount = require('../models/InstagramAccount');
const { getTaskDispatcherSettings } = require('./settingsService');
const { RETRYABLE_ERRORS, NON_RETRYABLE_ERRORS } = require('./deviceTaskTypes');
const { reportLegacyTask, releaseLegacyRegInstagram } = require('./legacyTaskAdapter');

const reportBody = ({ run, success, retryable, result, errorCode, message }) => {
  const base = { device_id: run.device_id, message, ...result };
  if (run.task_type === 'NUOI_FACEBOOK' || run.task_type === 'NUOI_INSTAGRAM') {
    return { ...base, uid: run.uid, status: success ? 'DA_NUOI' : 'NUOI_FAIL' };
  }
  if (run.task_type === 'REG_PAGE') {
    return { ...base, uid: run.uid, status: success ? 'REG_XONG' : 'REG_FAIL' };
  }
  if (run.task_type === 'PAGE_JOB') {
    return { ...base, page_id: run.page_id, status: success ? 'DA_LAM' : 'CHUA_LAM' };
  }
  if (run.task_type === 'REG_INSTAGRAM') {
    return {
      ...base,
      claim_id: Number(run.entity_id),
      status: success ? 'REG_XONG' : 'REG_FAIL',
      instagram_account: result.instagram_account || result.account || result.raw_data,
      reason: message,
    };
  }
  if (run.task_type === 'INSTAGRAM_JOB') {
    const failedStatus = retryable ? 'LOGIN_THANH_CONG' : NON_RETRYABLE_ERRORS.has(errorCode) ? 'ACCOUNT_DIE' : 'LOGIN_FAIL';
    return { ...base, uid: run.uid, status: success ? 'DA_CHAY_XONG' : failedStatus };
  }
  return base;
};

const markInvalidAccount = async (run, errorCode) => {
  if (!NON_RETRYABLE_ERRORS.has(errorCode)) return;
  const update = { status: 'ACCOUNT_DIE', live_status: 'die', locked_by: null, locked_at: null };
  if (run.entity_type === 'FACEBOOK_ACCOUNT') await FacebookAccount.update(update, { where: { id: run.account_id } });
  if (run.entity_type === 'INSTAGRAM_ACCOUNT') await InstagramAccount.update(update, { where: { id: run.account_id } });
};

const reportTask = async ({ owner, deviceId, taskId, status, result, errorCode, message, req }) => {
  const settings = await getTaskDispatcherSettings(owner);
  const run = await sequelize.transaction(async (transaction) => {
    const row = await DeviceTaskRun.findOne({
      where: { id: taskId, owner_username: owner },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) {
      const err = new Error('Khong tim thay task');
      err.statusCode = 404;
      throw err;
    }
    if (row.locked_by !== deviceId) {
      const err = new Error('Task khong thuoc device nay');
      err.statusCode = 409;
      throw err;
    }
    if (['SUCCESS', 'FAILED', 'RELEASED'].includes(row.status)) return row;
    if (row.status !== 'RUNNING') {
      const err = new Error('Task dang duoc bao cao');
      err.statusCode = 409;
      throw err;
    }
    await row.update({ status: 'REPORTING' }, { transaction });
    return row;
  });

  if (['SUCCESS', 'FAILED', 'RELEASED'].includes(run.status)) {
    return { run, already_reported: true, legacy: null };
  }

  const normalizedStatus = String(status || '').trim().toUpperCase();
  const isSuccess = ['SUCCESS', 'DONE', 'DA_XONG'].includes(normalizedStatus);
  const normalizedError = String(errorCode || (isSuccess ? '' : 'UNKNOWN_ERROR')).trim().toUpperCase();
  const nextRetry = Number(run.retry_count) + (isSuccess ? 0 : 1);
  const retryable = !isSuccess && RETRYABLE_ERRORS.has(normalizedError) && nextRetry <= settings.max_retry;
  const body = reportBody({
    run,
    success: isSuccess,
    retryable,
    result: result && typeof result === 'object' ? result : {},
    errorCode: normalizedError,
    message,
  });

  let legacyResponse;
  try {
    if (run.task_type === 'REG_INSTAGRAM' && retryable) {
      legacyResponse = await releaseLegacyRegInstagram(req, {
        device_id: deviceId,
        claim_id: Number(run.entity_id),
        reason: message || normalizedError,
      });
    } else {
      legacyResponse = await reportLegacyTask(run.task_type, req, body);
    }
    if (!legacyResponse?.payload?.success) {
      const err = new Error(legacyResponse?.payload?.message || 'Business report failed');
      err.statusCode = legacyResponse?.statusCode || 422;
      throw err;
    }
    if (!isSuccess) await markInvalidAccount(run, normalizedError);
  } catch (err) {
    await DeviceTaskRun.update({ status: 'RUNNING' }, { where: { id: run.id, status: 'REPORTING' } });
    throw err;
  }

  const completed = await sequelize.transaction(async (transaction) => {
    const locked = await DeviceTaskRun.findOne({
      where: { id: run.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    await locked.update({
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      completed_at: new Date(),
      retry_count: nextRetry,
      error_code: isSuccess ? null : normalizedError,
      error_message: isSuccess ? null : (message || legacyResponse.payload.message),
      result: result && typeof result === 'object' ? result : null,
    }, { transaction });
    await DashboardDevice.update({
      reported_status: 'IDLE',
      current_task: null,
      current_uid: null,
      started_at: null,
      last_seen: new Date(),
      last_error: isSuccess ? null : (message || normalizedError),
    }, { where: { owner_username: owner, device_id: deviceId }, transaction });
    return locked;
  });
  return { run: completed, already_reported: false, legacy: legacyResponse.payload.data || null, retryable };
};

module.exports = { reportTask };
