const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const Account = require('../models/Account');
const ChromeAccount = require('../models/ChromeAccount');

const STATUSES = [
  'ACC_LOGIN',
  'LOGIN_THANH_CONG',
  'ACC_DA_KHANG',
  'ACC_CHUA_KHANG',
  'ACC_DU_DK',
  'ACC_DIE',
];

const emptyStatusCounts = () =>
  STATUSES.reduce((out, status) => ({ ...out, [status]: 0 }), {});

const getModelStats = async (Model, todayStart, todayEnd) => {
  const statusCounts = await Promise.all(
    STATUSES.map((status) => Model.count({ where: { status } }))
  );

  const stats = {
    total: await Model.count(),
    ...emptyStatusCounts(),
    today_reg: await Model.count({
      where: { reg_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
    }),
    today_updated: await Model.count({
      where: { updated_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
    }),
    live: await Model.count({ where: { live_status: 'live' } }),
    die_live: await Model.count({ where: { live_status: 'die' } }),
    unknown_live: await Model.count({ where: { live_status: 'unknown' } }),
  };

  STATUSES.forEach((status, idx) => {
    stats[status] = statusCounts[idx];
  });

  return stats;
};

const combineStats = (app, chrome) => {
  const combined = {
    total: app.total + chrome.total,
    today_reg: app.today_reg + chrome.today_reg,
    today_updated: app.today_updated + chrome.today_updated,
    live: app.live + chrome.live,
    die_live: app.die_live + chrome.die_live,
    unknown_live: app.unknown_live + chrome.unknown_live,
  };

  STATUSES.forEach((status) => {
    combined[status] = app[status] + chrome[status];
  });

  return combined;
};

/**
 * Returns overall system statistics.
 */
const getStats = async () => {
  const now   = new Date();
  // Today = midnight local time (timezone offset handled by MySQL connection timezone)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [app, chrome] = await Promise.all([
    getModelStats(Account, todayStart, todayEnd),
    getModelStats(ChromeAccount, todayStart, todayEnd),
  ]);

  const combined = combineStats(app, chrome);

  return {
    ...combined,
    tasks: { app, chrome },
  };
};

/**
 * Returns per-day registration and upload counts for the past N days.
 */
const getDailyStats = async (days = 7) => {
  const daysInt = Math.min(90, Math.max(1, parseInt(days) || 7));

  const dailyReg = await sequelize.query(
    `SELECT
       DATE(reg_at) AS \`date\`,
       COUNT(*)     AS reg_count
     FROM accounts
     WHERE reg_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       AND reg_at IS NOT NULL
     GROUP BY DATE(reg_at)
     ORDER BY \`date\` ASC`,
    { replacements: { days: daysInt }, type: QueryTypes.SELECT }
  );

  const dailyUpload = await sequelize.query(
    `SELECT
       DATE(last_upload_at) AS \`date\`,
       COUNT(*)             AS upload_count
     FROM accounts
     WHERE last_upload_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       AND last_upload_at IS NOT NULL
     GROUP BY DATE(last_upload_at)
     ORDER BY \`date\` ASC`,
    { replacements: { days: daysInt }, type: QueryTypes.SELECT }
  );

  const statusDist = await sequelize.query(
    `SELECT status, COUNT(*) AS cnt
     FROM accounts
     GROUP BY status`,
    { type: QueryTypes.SELECT }
  );

  return { daily_reg: dailyReg, daily_upload: dailyUpload, status_dist: statusDist };
};

module.exports = { getStats, getDailyStats };
