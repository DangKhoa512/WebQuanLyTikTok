const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const Account = require('../models/Account');
const ChromeAccount = require('../models/ChromeAccount');

const STATUSES = [
  'ACC_LOGIN',
  'LOGIN_THANH_CONG',
  'ACC_DA_KHANG',
  'ACC_CHUA_KHANG',
  'ACC_DU_DK',
  'ACC_DA_DUNG',
  'ACC_DIE',
];

const emptyStatusCounts = () =>
  STATUSES.reduce((out, status) => ({ ...out, [status]: 0 }), {});

const getModelStats = async (Model, todayStart, todayEnd, ownerFilter = null) => {
  const tableName = Model.getTableName();
  const replacements = { todayStart, todayEnd };
  const ownerSql = ownerFilter ? 'WHERE owner_username = :owner' : '';
  if (ownerFilter) replacements.owner = ownerFilter;

  const [row = {}] = await sequelize.query(
    `SELECT
       COUNT(*) AS total,
       SUM(reg_at >= :todayStart AND reg_at < :todayEnd) AS today_reg,
       SUM(updated_at >= :todayStart AND updated_at < :todayEnd) AS today_updated,
       SUM(live_status = 'live') AS live,
       SUM(live_status = 'die') AS die_live,
       SUM(live_status = 'unknown') AS unknown_live,
       SUM(status = 'ACC_LOGIN') AS ACC_LOGIN,
       SUM(status = 'LOGIN_THANH_CONG') AS LOGIN_THANH_CONG,
       SUM(status = 'ACC_DA_KHANG') AS ACC_DA_KHANG,
       SUM(status = 'ACC_CHUA_KHANG') AS ACC_CHUA_KHANG,
       SUM(status = 'ACC_DU_DK') AS ACC_DU_DK,
       SUM(status = 'ACC_DA_DUNG') AS ACC_DA_DUNG,
       SUM(status = 'ACC_DIE') AS ACC_DIE
     FROM ${tableName}
     ${ownerSql}`,
    { replacements, type: QueryTypes.SELECT }
  );

  const stats = { ...emptyStatusCounts() };
  [
    'total',
    'today_reg',
    'today_updated',
    'live',
    'die_live',
    'unknown_live',
    ...STATUSES,
  ].forEach((key) => {
    stats[key] = parseInt(row[key], 10) || 0;
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
const getStats = async (ownerFilter = null) => {
  const now   = new Date();
  // Today = midnight local time (timezone offset handled by MySQL connection timezone)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [app, chrome] = await Promise.all([
    getModelStats(Account, todayStart, todayEnd, ownerFilter),
    getModelStats(ChromeAccount, todayStart, todayEnd, ownerFilter),
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
const getDailyStats = async (days = 7, ownerFilter = null) => {
  const daysInt = Math.min(90, Math.max(1, parseInt(days) || 7));
  const ownerSql = ownerFilter ? 'AND owner_username = :owner' : '';
  const replacements = { days: daysInt };
  if (ownerFilter) replacements.owner = ownerFilter;

  const dailyReg = await sequelize.query(
    `SELECT
       DATE(reg_at) AS \`date\`,
       COUNT(*)     AS reg_count
     FROM accounts
     WHERE reg_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       AND reg_at IS NOT NULL
       ${ownerSql}
     GROUP BY DATE(reg_at)
     ORDER BY \`date\` ASC`,
    { replacements, type: QueryTypes.SELECT }
  );

  const dailyUpload = await sequelize.query(
    `SELECT
       DATE(last_upload_at) AS \`date\`,
       COUNT(*)             AS upload_count
     FROM accounts
     WHERE last_upload_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       AND last_upload_at IS NOT NULL
       ${ownerSql}
     GROUP BY DATE(last_upload_at)
     ORDER BY \`date\` ASC`,
    { replacements, type: QueryTypes.SELECT }
  );

  const statusDist = await sequelize.query(
    `SELECT status, COUNT(*) AS cnt
     FROM accounts
     ${ownerFilter ? 'WHERE owner_username = :owner' : ''}
     GROUP BY status`,
    { replacements, type: QueryTypes.SELECT }
  );

  return { daily_reg: dailyReg, daily_upload: dailyUpload, status_dist: statusDist };
};

const zeroDeviceStats = () => ({
  total: 0,
  today_reg: 0,
  today_updated: 0,
  live: 0,
  die_live: 0,
  unknown_live: 0,
  ACC_LOGIN: 0,
  LOGIN_THANH_CONG: 0,
  ACC_DA_KHANG: 0,
  ACC_CHUA_KHANG: 0,
  ACC_DU_DK: 0,
  ACC_DA_DUNG: 0,
  ACC_DIE: 0,
});

const buildDeviceQuery = (tableName, task, hasOwner) => `
  SELECT
    device_id,
    '${task}' AS task,
    COUNT(*) AS total,
    SUM(DATE(reg_at) = CURDATE()) AS today_reg,
    SUM(DATE(updated_at) = CURDATE()) AS today_updated,
    SUM(live_status = 'live') AS live,
    SUM(live_status = 'die') AS die_live,
    SUM(live_status = 'unknown') AS unknown_live,
    SUM(status = 'ACC_LOGIN') AS ACC_LOGIN,
    SUM(status = 'LOGIN_THANH_CONG') AS LOGIN_THANH_CONG,
    SUM(status = 'ACC_DA_KHANG') AS ACC_DA_KHANG,
    SUM(status = 'ACC_CHUA_KHANG') AS ACC_CHUA_KHANG,
    SUM(status = 'ACC_DU_DK') AS ACC_DU_DK,
    SUM(status = 'ACC_DA_DUNG') AS ACC_DA_DUNG,
    SUM(status = 'ACC_DIE') AS ACC_DIE,
    MAX(updated_at) AS last_seen
  FROM ${tableName}
  WHERE device_id IS NOT NULL
    AND device_id <> ''
    ${hasOwner ? 'AND owner_username = :owner' : ''}
  GROUP BY device_id
`;

const addStats = (target, row) => {
  Object.keys(zeroDeviceStats()).forEach((key) => {
    target[key] += parseInt(row[key], 10) || 0;
  });
};

const getDeviceStats = async (ownerFilter = null) => {
  const replacements = {};
  if (ownerFilter) replacements.owner = ownerFilter;

  const rows = await sequelize.query(
    `${buildDeviceQuery('accounts', 'app', !!ownerFilter)} UNION ALL ${buildDeviceQuery('chrome_accounts', 'chrome', !!ownerFilter)}`,
    { replacements, type: QueryTypes.SELECT }
  );

  const map = new Map();
  rows.forEach((row) => {
    const deviceId = row.device_id || 'unknown';
    if (!map.has(deviceId)) {
      map.set(deviceId, {
        device_id: deviceId,
        ...zeroDeviceStats(),
        tasks: {
          app: zeroDeviceStats(),
          chrome: zeroDeviceStats(),
        },
        last_seen: null,
      });
    }

    const item = map.get(deviceId);
    const task = row.task === 'chrome' ? 'chrome' : 'app';
    addStats(item, row);
    addStats(item.tasks[task], row);

    const lastSeen = row.last_seen ? new Date(row.last_seen) : null;
    if (lastSeen && (!item.last_seen || lastSeen > new Date(item.last_seen))) {
      item.last_seen = lastSeen.toISOString();
    }
  });

  return [...map.values()].sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));
};

module.exports = { getStats, getDailyStats, getDeviceStats };
