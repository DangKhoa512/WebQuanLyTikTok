require('dotenv').config();

const app        = require('./app');
const sequelize  = require('./config/database');
const { startCronJobs, stopCronJobs } = require('./cron/scheduler');
const logger     = require('./config/logger');
const bcrypt     = require('bcryptjs');
const User       = require('./models/User');

// Ensure all models are registered before sync
require('./models/index');

const PORT = parseInt(process.env.PORT) || 3000;
const normalizedAdminUser = () => (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
const adminOwner = () => normalizedAdminUser().replace(/'/g, "''");

const startServer = async () => {
  try {
    // 1. Verify DB connection
    await sequelize.authenticate();
    logger.info('✅ Database connection established');

    // 2. Sync tables (create if not exists, do NOT alter in production)
    await sequelize.sync({ force: false, alter: false });
    logger.info('✅ Database tables synchronised');

    // 3a. Runtime migrations (idempotent — safe to run every boot)
    try {
      await sequelize.query(`
        ALTER TABLE accounts
        ADD COLUMN owner_username VARCHAR(100) NOT NULL DEFAULT '${adminOwner()}'
      `);
      logger.info('✅ accounts owner_username column added');
    } catch (e) {
      logger.warn('Migration accounts owner skipped:', e.message);
    }

    try {
      await sequelize.query(`
        ALTER TABLE chrome_accounts
        ADD COLUMN owner_username VARCHAR(100) NOT NULL DEFAULT '${adminOwner()}'
      `);
      logger.info('✅ chrome_accounts owner_username column added');
    } catch (e) {
      logger.warn('Migration chrome_accounts owner skipped:', e.message);
    }

    try {
      await sequelize.query('ALTER TABLE accounts ADD INDEX idx_accounts_owner_username (owner_username)');
      logger.info('âœ… accounts owner_username index ready');
    } catch (e) {
      logger.warn('Migration accounts owner index skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts DROP INDEX uq_username');
    } catch (e) {
      logger.warn('Migration accounts old unique skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts ADD UNIQUE INDEX uq_accounts_owner_username (owner_username, username)');
      logger.info('âœ… accounts owner+username unique index ready');
    } catch (e) {
      logger.warn('Migration accounts owner unique skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE chrome_accounts ADD INDEX idx_chrome_owner_username (owner_username)');
      logger.info('âœ… chrome_accounts owner_username index ready');
    } catch (e) {
      logger.warn('Migration chrome owner index skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE chrome_accounts DROP INDEX uq_chrome_username');
    } catch (e) {
      logger.warn('Migration chrome old unique skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE chrome_accounts ADD UNIQUE INDEX uq_chrome_owner_username (owner_username, username)');
      logger.info('âœ… chrome_accounts owner+username unique index ready');
    } catch (e) {
      logger.warn('Migration chrome owner unique skipped:', e.message);
    }

    try {
      await sequelize.query('ALTER TABLE used_accounts DROP INDEX uq_used_owner_type_account');
    } catch (e) {
      logger.warn('Migration used_accounts old account unique skipped:', e.message);
    }

    try {
      await sequelize.query('ALTER TABLE used_accounts DROP INDEX uq_used_owner_type_username');
    } catch (e) {
      logger.warn('Migration used_accounts old username unique skipped:', e.message);
    }

    try {
      await sequelize.query('DROP TEMPORARY TABLE IF EXISTS tmp_used_accounts_keep');
      await sequelize.query(`
        CREATE TEMPORARY TABLE tmp_used_accounts_keep AS
        SELECT MAX(id) AS keep_id
        FROM used_accounts
        GROUP BY owner_username, account_type, username
      `);
      await sequelize.query(`
        DELETE FROM used_accounts
        WHERE id NOT IN (SELECT keep_id FROM tmp_used_accounts_keep)
      `);
      await sequelize.query('DROP TEMPORARY TABLE IF EXISTS tmp_used_accounts_keep');
      logger.info('used_accounts duplicate rows cleaned');
    } catch (e) {
      logger.warn('Migration used_accounts dedupe skipped:', e.message);
    }

    try {
      await sequelize.query('ALTER TABLE used_accounts ADD UNIQUE INDEX uq_used_owner_type_username (owner_username, account_type, username)');
      logger.info('used_accounts owner+type+username unique index ready');
    } catch (e) {
      logger.warn('Migration used_accounts unique skipped:', e.message);
    }

    try {
      const adminUser = normalizedAdminUser();
      const adminPass = process.env.ADMIN_PASS;
      if (adminPass) {
        const [user, created] = await User.findOrCreate({
          where: { username: adminUser },
          defaults: {
            username: adminUser,
            password_hash: await bcrypt.hash(adminPass, 10),
            role: 'admin',
            is_active: true,
          },
        });
        if (created || user.role !== 'admin') {
          await user.update({ role: 'admin', is_active: true });
        }
        logger.info(`✅ admin user ready: ${adminUser}`);
      }
    } catch (e) {
      logger.warn('Seed admin user skipped:', e.message);
    }

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
