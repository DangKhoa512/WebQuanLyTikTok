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
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS account_groups (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          owner_username VARCHAR(100) NOT NULL DEFAULT '${adminOwner()}',
          account_type ENUM('app','chrome','job') NOT NULL,
          name VARCHAR(100) NOT NULL,
          note VARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_groups_owner_type_name (owner_username, account_type, name),
          KEY idx_groups_owner (owner_username),
          KEY idx_groups_type (account_type)
        )
      `);
      logger.info('account_groups table ready');
    } catch (e) {
      logger.warn('Migration account_groups table skipped:', e.message);
    }

    try {
      await sequelize.query(`
        ALTER TABLE account_groups
        MODIFY COLUMN account_type ENUM('app','chrome','job') NOT NULL
      `);
      logger.info('account_groups job type ready');
    } catch (e) {
      logger.warn('Migration account_groups job type skipped:', e.message);
    }

    try {
      await sequelize.query('ALTER TABLE accounts ADD COLUMN group_id INT UNSIGNED NULL');
      logger.info('accounts group_id column added');
    } catch (e) {
      logger.warn('Migration accounts group_id skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts ADD INDEX idx_accounts_group_id (group_id)');
      logger.info('accounts group_id index ready');
    } catch (e) {
      logger.warn('Migration accounts group_id index skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts ADD COLUMN refresh_token LONGTEXT NULL');
      logger.info('accounts refresh_token column added');
    } catch (e) {
      logger.warn('Migration accounts refresh_token skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts ADD COLUMN client_id VARCHAR(255) NULL');
      logger.info('accounts client_id column added');
    } catch (e) {
      logger.warn('Migration accounts client_id skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE accounts ADD COLUMN `local` VARCHAR(255) NULL');
      logger.info('accounts local column added');
    } catch (e) {
      logger.warn('Migration accounts local skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE chrome_accounts ADD COLUMN group_id INT UNSIGNED NULL');
      logger.info('chrome_accounts group_id column added');
    } catch (e) {
      logger.warn('Migration chrome group_id skipped:', e.message);
    }
    try {
      await sequelize.query('ALTER TABLE chrome_accounts ADD INDEX idx_chrome_group_id (group_id)');
      logger.info('chrome_accounts group_id index ready');
    } catch (e) {
      logger.warn('Migration chrome group_id index skipped:', e.message);
    }

    const jobColumnMigrations = [
      ["ALTER TABLE job_accounts MODIFY COLUMN status ENUM('ACCOUNT_CHAY','DANG_LAM','DUOI_50_JOB','FAIL_AVT','LOI_CAU_HINH','DA_CHAY_XONG','ACCOUNT_DIE') NOT NULL DEFAULT 'ACCOUNT_CHAY'", 'job_accounts status enum ready'],
      ['ALTER TABLE job_accounts ADD COLUMN group_id INT UNSIGNED NULL', 'job_accounts group_id column added'],
      ["ALTER TABLE job_accounts ADD COLUMN live_status ENUM('unknown','live','die') NOT NULL DEFAULT 'unknown'", 'job_accounts live_status column added'],
      ['ALTER TABLE job_accounts ADD COLUMN video_count INT UNSIGNED NULL', 'job_accounts video_count column added'],
      ['ALTER TABLE job_accounts ADD COLUMN followers INT UNSIGNED NULL', 'job_accounts followers column added'],
      ['ALTER TABLE job_accounts ADD COLUMN following INT UNSIGNED NULL', 'job_accounts following column added'],
      ['ALTER TABLE job_accounts ADD COLUMN last_live_check_at DATETIME NULL', 'job_accounts last_live_check_at column added'],
      ['ALTER TABLE job_accounts ADD COLUMN login_fail_count INT UNSIGNED NOT NULL DEFAULT 0', 'job_accounts login_fail_count column added'],
      ['ALTER TABLE job_accounts ADD COLUMN last_login_fail_at DATETIME NULL', 'job_accounts last_login_fail_at column added'],
      ['ALTER TABLE job_accounts ADD INDEX idx_job_group_id (group_id)', 'job_accounts group_id index ready'],
      ['ALTER TABLE job_accounts ADD INDEX idx_job_live_status (live_status)', 'job_accounts live_status index ready'],
    ];
    for (const [sql, message] of jobColumnMigrations) {
      try {
        await sequelize.query(sql);
        logger.info(message);
      } catch (e) {
        logger.warn(`Migration ${message} skipped:`, e.message);
      }
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
          ENUM('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE')
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
          ENUM('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE')
          NOT NULL DEFAULT 'ACC_LOGIN'
      `);
      logger.info('✅ chrome_accounts ENUM migrated');
    } catch (e) {
      logger.warn('Migration chrome_accounts ENUM skipped:', e.message);
    }

    try {
      await sequelize.query(`UPDATE accounts SET status='ACC_DA_DUNG' WHERE status='ACC_DU_DK' AND note LIKE '[Đã dùng]%'`);
      await sequelize.query(`UPDATE chrome_accounts SET status='ACC_DA_DUNG' WHERE status='ACC_DU_DK' AND note LIKE '[Đã dùng]%'`);
      logger.info('used source accounts moved to ACC_DA_DUNG');
    } catch (e) {
      logger.warn('Migration used source status skipped:', e.message);
    }

    try {
      await sequelize.query('DROP TEMPORARY TABLE IF EXISTS tmp_chrome_legacy_format');
      await sequelize.query(`
        CREATE TEMPORARY TABLE tmp_chrome_legacy_format AS
        SELECT id, password AS old_email, email AS old_email_pass, email_pass AS old_cookie
        FROM chrome_accounts
        WHERE password REGEXP '^[^[:space:]@|]+@[^[:space:]@|]+[.][^[:space:]@|]+$'
          AND (
            email_pass IS NULL
            OR email_pass = ''
            OR email_pass LIKE 'sid_guard=%'
            OR email_pass LIKE '%;sid_guard=%'
            OR email_pass LIKE 'sessionid=%'
            OR email_pass LIKE 'uid_tt=%'
            OR email_pass LIKE 'tt_chain_token=%'
          )
      `);
      const [, metadata] = await sequelize.query(`
        UPDATE chrome_accounts AS current
        INNER JOIN tmp_chrome_legacy_format AS legacy ON legacy.id = current.id
        SET
          current.password = NULL,
          current.email = legacy.old_email,
          current.email_pass = legacy.old_email_pass,
          current.cookie = COALESCE(NULLIF(current.cookie, ''), NULLIF(legacy.old_cookie, ''))
      `);
      await sequelize.query('DROP TEMPORARY TABLE IF EXISTS tmp_chrome_legacy_format');
      logger.info(`chrome legacy account format normalized: ${metadata?.affectedRows || 0}`);
    } catch (e) {
      try {
        await sequelize.query('DROP TEMPORARY TABLE IF EXISTS tmp_chrome_legacy_format');
      } catch (_) {
        // Ignore cleanup errors and preserve the original migration failure.
      }
      logger.warn('Migration chrome legacy format skipped:', e.message);
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
