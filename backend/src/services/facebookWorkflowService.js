const { Op } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../config/logger');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPageJob = require('../models/FacebookPageJob');
const { getFacebookWorkflowSettings } = require('./settingsService');

const resetExpiredNurtureStates = async ({ owner_username, resetHours }) => {
  const resetBefore = new Date(Date.now() - resetHours * 60 * 60 * 1000);
  const [affected] = await FacebookAccount.update({
    nurture_status: 'CHUA_NUOI',
    nurture_locked_by: null,
    nurture_locked_at: null,
    nurture_run_id: null,
    nurture_scenario_id: null,
  }, {
    where: {
      owner_username,
      kind: 'job',
      nurture_status: 'DA_NUOI',
      last_nurture_at: { [Op.lte]: resetBefore },
    },
  });
  return affected;
};

const resetExpiredPageJobStates = async ({ owner_username, resetHours }) => sequelize.transaction(async (transaction) => {
  const resetBefore = new Date(Date.now() - resetHours * 60 * 60 * 1000);
  const completedAccounts = await FacebookAccount.findAll({
    attributes: ['id'],
    where: {
      owner_username,
      kind: 'job',
      status: 'DA_CHAY_XONG',
      completed_at: { [Op.lte]: resetBefore },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const completedIds = completedAccounts.map((account) => account.id);
  if (!completedIds.length) return { accounts: 0, pages: 0 };

  const pageRows = await FacebookPageJob.findAll({
    attributes: ['facebook_account_id'],
    where: { owner_username, facebook_account_id: { [Op.in]: completedIds }, is_active: true },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const accountIds = [...new Set(pageRows.map((row) => row.facebook_account_id))];
  if (!accountIds.length) return { accounts: 0, pages: 0 };

  const [pages] = await FacebookPageJob.update({
    job_status: 'CHUA_LAM',
    device_id: null,
    completed_at: null,
    last_report_at: null,
  }, {
    where: { owner_username, facebook_account_id: { [Op.in]: accountIds }, is_active: true },
    transaction,
  });
  const [accounts] = await FacebookAccount.update({
    status: 'LOGIN_THANH_CONG',
    locked_by: null,
    locked_at: null,
    completed_at: null,
  }, {
    where: { owner_username, kind: 'job', id: { [Op.in]: accountIds }, status: 'DA_CHAY_XONG' },
    transaction,
  });
  return { accounts, pages };
});

const runFacebookWorkflowResets = async () => {
  const totals = { nurture_reset: 0, page_job_reset: 0, account_reset: 0 };
  try {
    const owners = await FacebookAccount.findAll({
      attributes: ['owner_username'],
      where: { kind: 'job' },
      group: ['owner_username'],
      raw: true,
    });
    for (const { owner_username } of owners) {
      const settings = await getFacebookWorkflowSettings(owner_username);
      const [nurtureAccounts, pageJobResult] = await Promise.all([
        resetExpiredNurtureStates({ owner_username, resetHours: settings.nurture_reset_hours }),
        resetExpiredPageJobStates({ owner_username, resetHours: settings.page_job_reset_hours }),
      ]);
      totals.nurture_reset += nurtureAccounts;
      totals.page_job_reset += pageJobResult.pages;
      totals.account_reset += pageJobResult.accounts;
      if (nurtureAccounts || pageJobResult.accounts || pageJobResult.pages) {
        logger.info('CRON: reset Facebook workflow states', {
          owner_username,
          nurture_accounts: nurtureAccounts,
          page_job_accounts: pageJobResult.accounts,
          page_jobs: pageJobResult.pages,
        });
      }
    }
  } catch (err) {
    logger.error('CRON runFacebookWorkflowResets error', { error: err.message, stack: err.stack });
    throw err;
  }
  return totals;
};

module.exports = {
  resetExpiredNurtureStates,
  resetExpiredPageJobStates,
  runFacebookWorkflowResets,
};
