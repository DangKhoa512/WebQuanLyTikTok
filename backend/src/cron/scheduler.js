const cron           = require('node-cron');
const accountService = require('../services/accountService');
const logger         = require('../config/logger');

let cronJob = null;

/**
 * Start the 5-minute status-transition cron job.
 * Also runs once immediately on startup so state is correct from the start.
 */
const startCronJobs = () => {
  // Run immediately on startup
  logger.info('CRON: initial run on startup');
  accountService.runStatusTransitions();

  // Then every 5 minutes
  cronJob = cron.schedule('*/5 * * * *', async () => {
    logger.info('CRON: running scheduled status transitions');
    await accountService.runStatusTransitions();
  });

  logger.info('CRON: scheduler started (every 5 minutes)');
};

const stopCronJobs = () => {
  if (cronJob) {
    cronJob.stop();
    logger.info('CRON: scheduler stopped');
  }
};

module.exports = { startCronJobs, stopCronJobs };
