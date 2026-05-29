require('dotenv').config();

const app        = require('./app');
const sequelize  = require('./config/database');
const { startCronJobs, stopCronJobs } = require('./cron/scheduler');
const logger     = require('./config/logger');

// Ensure all models are registered before sync
require('./models/index');

const PORT = parseInt(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    // 1. Verify DB connection
    await sequelize.authenticate();
    logger.info('✅ Database connection established');

    // 2. Sync tables (create if not exists, do NOT alter in production)
    await sequelize.sync({ force: false, alter: false });
    logger.info('✅ Database tables synchronised');

    // 3a. Runtime migrations (idempotent — safe to run every boot)

    // Migration: accounts — dùng chung status với Chrome
    try {
      await sequelize.query(`UPDATE accounts SET status='ACC_LOGIN'        WHERE status IN ('REG_DA_LAM','CHO_UPVIDEO','CHO_UP','UP_FAIL','UPVIDEO_FAIL')`);
      await sequelize.query(`UPDATE accounts SET status='LOGIN_THANH_CONG' WHERE status IN ('UPVIDEO','DANG_UP')`);
      await sequelize.query(`UPDATE accounts SET status='ACC_DU_DK'        WHERE status IN ('DAT_CHI_TIEU','DU_DK')`);
      await sequelize.query(`UPDATE accounts SET status='ACC_DIE'          WHERE status='DIE'`);
      await sequelize.query(`
        ALTER TABLE accounts
        MODIFY COLUMN status
          ENUM('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE')
          NOT NULL DEFAULT 'LOGIN_THANH_CONG'
      `);
      logger.info('✅ accounts ENUM migrated (dùng chung với Chrome)');
    } catch (e) {
      logger.warn('Migration accounts ENUM skipped:', e.message);
    }

    // Migration: chrome_accounts ENUM
    try {
      await sequelize.query(`
        ALTER TABLE chrome_accounts
        MODIFY COLUMN status
          ENUM('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE')
          NOT NULL DEFAULT 'ACC_LOGIN'
      `);
      logger.info('✅ chrome_accounts ENUM migrated');
    } catch (e) {
      logger.warn('Migration chrome_accounts ENUM skipped:', e.message);
    }

    // 3. Start background jobs
    startCronJobs();

    // 4. Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      stopCronJobs();
      server.close(() => {
        sequelize.close();
        logger.info('Server closed');
        process.exit(0);
      });
      // Force exit after 10 s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('❌ Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

startServer();
