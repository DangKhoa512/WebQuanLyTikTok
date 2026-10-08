const cron           = require('node-cron');
const accountService = require('../services/accountService');
const { runFacebookWorkflowResets } = require('../services/facebookWorkflowService');
const schedulerState = require('../services/schedulerState');
const { monitorDevices } = require('../services/deviceMonitoringService');
const logger         = require('../config/logger');

let cronJob = null;
let running = false;

const runScheduledTransitions = async () => {
  if(running)return;
  running=true;
  const startedAt = new Date();
  schedulerState.markStarted();
  try {
    const unresponsive = await monitorDevices();
    await accountService.runStatusTransitions();
    const result = await runFacebookWorkflowResets();
    result.device_unresponsive = unresponsive;
    schedulerState.markCompleted({ startedAt, result });
  } catch (error) {
    schedulerState.markFailed({ startedAt, error });
    logger.error('CRON: scheduled transitions failed', { error: error.message });
  } finally { running=false; }
};

/**
 * Start the 5-minute status-transition cron job.
 * Also runs once immediately on startup so state is correct from the start.
 */
const startCronJobs = () => {
  // Run immediately on startup
  logger.info('CRON: initial run on startup');
  runScheduledTransitions();

  // Then every 5 minutes
  cronJob = cron.schedule('*/5 * * * *', async () => {
    logger.info('CRON: running scheduled status transitions');
    await runScheduledTransitions();
  });

  logger.info('CRON: scheduler started (every 5 minutes)');
};

const stopCronJobs = () => {
  if (cronJob) {
    cronJob.stop();
    logger.info('CRON: scheduler stopped');
  }
};

module.exports = { startCronJobs, stopCronJobs, runScheduledTransitions };
