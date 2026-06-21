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

const JOB_STATUSES = [
  'ACCOUNT_CHAY',
  'DANG_LAM',
  'DUOI_50_JOB',
  'FAIL_AVT',
  'LOI_CAU_HINH',
  'DA_CHAY_XONG',
  'ACCOUNT_DIE',
];
const XU_PER_JOB = parseInt(process.env.JOB_XU_PER_JOB, 10) || 1400;
const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const emptyStatusCounts = () =>
  STATUSES.reduce((out, status) => ({ ...out, [status]: 0 }), {});

const ownerWhere = (ownerFilter, prefix = 'WHERE') =>
  ownerFilter ? `${prefix} owner_username = :owner` : '';

const numeric = (row, key) => Number(row?.[key]) || 0;
const vietnamToday = () => VN_DATE_FORMATTER.format(new Date());
const jobTouchedWhere = `
  AND (
    device_id IS NOT NULL
    OR locked_by IS NOT NULL
    OR login_at IS NOT NULL
    OR completed_at IS NOT NULL
    OR COALESCE(job_count, 0) > 0
  )
`;
const jobActivityAt = `
  CASE
    WHEN status = 'DANG_LAM' AND COALESCE(job_count, 0) > 0 THEN updated_at
    WHEN completed_at IS NOT NULL THEN completed_at
    WHEN COALESCE(job_count, 0) > 0 THEN updated_at
    WHEN login_at IS NOT NULL THEN login_at
    ELSE updated_at
  END
`;

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
    stats[key] = numeric(row, key);
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

const getStats = async (ownerFilter = null) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [app, chrome] = await Promise.all([
    getModelStats(Account, todayStart, todayEnd, ownerFilter),
    getModelStats(ChromeAccount, todayStart, todayEnd, ownerFilter),
  ]);

  return {
    ...combineStats(app, chrome),
    tasks: { app, chrome },
  };
};

const getDailyStats = async (days = 7, ownerFilter = null) => {
  const daysInt = Math.min(90, Math.max(1, parseInt(days, 10) || 7));
  const ownerSql = ownerFilter ? 'AND owner_username = :owner' : '';
  const replacements = { days: daysInt };
  if (ownerFilter) replacements.owner = ownerFilter;

  const dailyReg = await sequelize.query(
    `SELECT
       DATE(reg_at) AS \`date\`,
       COUNT(*) AS reg_count
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
       COUNT(*) AS upload_count
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
     ${ownerWhere(ownerFilter)}
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
    target[key] += numeric(row, key);
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

const getJobStats = async (ownerFilter = null) => {
  const replacements = { todayDate: vietnamToday() };
  if (ownerFilter) replacements.owner = ownerFilter;

  const [row = {}] = await sequelize.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'ACCOUNT_CHAY') AS ACCOUNT_CHAY,
       SUM(status = 'DANG_LAM') AS DANG_LAM,
       SUM(status = 'DUOI_50_JOB') AS DUOI_50_JOB,
       SUM(status = 'FAIL_AVT') AS FAIL_AVT,
       SUM(status = 'LOI_CAU_HINH') AS LOI_CAU_HINH,
       SUM(status = 'DA_CHAY_XONG') AS DA_CHAY_XONG,
       SUM(status = 'ACCOUNT_DIE') AS ACCOUNT_DIE,
       SUM(login_at IS NOT NULL) AS login_success,
       SUM(status = 'DUOI_50_JOB') AS failed,
       SUM(status = 'LOI_CAU_HINH') AS config_error,
       COALESCE(SUM(job_count), 0) AS total_jobs,
       COALESCE(SUM(job_count), 0) * :xuPerJob AS total_xu,
       COALESCE(SUM(CASE WHEN DATE(${jobActivityAt}) = :todayDate THEN job_count ELSE 0 END), 0) AS today_jobs,
       COALESCE(SUM(CASE WHEN DATE(${jobActivityAt}) = :todayDate THEN job_count ELSE 0 END), 0) * :xuPerJob AS today_xu,
       COALESCE(SUM(CASE WHEN YEAR(${jobActivityAt}) = YEAR(CURDATE()) AND MONTH(${jobActivityAt}) = MONTH(CURDATE()) THEN job_count ELSE 0 END), 0) AS month_jobs,
       COALESCE(SUM(CASE WHEN YEAR(${jobActivityAt}) = YEAR(CURDATE()) AND MONTH(${jobActivityAt}) = MONTH(CURDATE()) THEN job_count ELSE 0 END), 0) * :xuPerJob AS month_xu,
       SUM(DATE(login_at) = :todayDate) AS today_login_success,
       SUM(DATE(completed_at) = :todayDate AND status = 'DUOI_50_JOB') AS today_failed,
       SUM(DATE(completed_at) = :todayDate AND status = 'LOI_CAU_HINH') AS today_config_error,
       SUM(live_status = 'live') AS live,
       SUM(live_status = 'die') AS die_live,
       SUM(live_status = 'unknown') AS unknown_live
     FROM job_accounts
     ${ownerWhere(ownerFilter)}`,
    { replacements: { ...replacements, xuPerJob: XU_PER_JOB }, type: QueryTypes.SELECT }
  );

  const stats = {};
  [
    'total',
    ...JOB_STATUSES,
    'login_success',
    'failed',
    'config_error',
    'total_jobs',
    'total_xu',
    'today_jobs',
    'today_xu',
    'month_jobs',
    'month_xu',
    'today_login_success',
    'today_failed',
    'today_config_error',
    'live',
    'die_live',
    'unknown_live',
  ].forEach((key) => {
    stats[key] = numeric(row, key);
  });

  return stats;
};

const getJobDailyStats = async (days = 30, ownerFilter = null) => {
  const daysInt = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
  const replacements = { days: daysInt };
  if (ownerFilter) replacements.owner = ownerFilter;
  const ownerAnd = ownerFilter ? 'AND owner_username = :owner' : '';

  const daily = await sequelize.query(
    `SELECT
       DATE(${jobActivityAt}) AS date,
       COUNT(*) AS completed_accounts,
       SUM(status = 'DA_CHAY_XONG') AS done_accounts,
       SUM(status = 'DUOI_50_JOB') AS failed_accounts,
       SUM(status = 'LOI_CAU_HINH') AS config_error_accounts,
       SUM(status = 'DANG_LAM') AS working_accounts,
       COALESCE(SUM(job_count), 0) AS total_jobs,
       COALESCE(SUM(job_count), 0) * :xuPerJob AS total_xu
     FROM job_accounts
     WHERE ${jobActivityAt} >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       ${jobTouchedWhere}
       ${ownerAnd}
     GROUP BY DATE(${jobActivityAt})
     ORDER BY date ASC`,
    { replacements: { ...replacements, xuPerJob: XU_PER_JOB }, type: QueryTypes.SELECT }
  );

  const monthly = await sequelize.query(
    `SELECT
       DATE_FORMAT(${jobActivityAt}, '%Y-%m') AS month,
       COUNT(*) AS completed_accounts,
       COALESCE(SUM(job_count), 0) AS total_jobs,
       COALESCE(SUM(job_count), 0) * :xuPerJob AS total_xu
     FROM job_accounts
     WHERE ${jobActivityAt} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       ${jobTouchedWhere}
       ${ownerAnd}
     GROUP BY DATE_FORMAT(${jobActivityAt}, '%Y-%m')
     ORDER BY month ASC`,
    { replacements: { ...replacements, xuPerJob: XU_PER_JOB }, type: QueryTypes.SELECT }
  );

  const statusDist = await sequelize.query(
    `SELECT status, COUNT(*) AS cnt
     FROM job_accounts
     ${ownerWhere(ownerFilter)}
     GROUP BY status
     ORDER BY cnt DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  return { daily_job: daily, monthly_job: monthly, status_dist: statusDist };
};

const getJobDeviceStats = async (ownerFilter = null) => {
  const replacements = { todayDate: vietnamToday() };
  if (ownerFilter) replacements.owner = ownerFilter;

  return sequelize.query(
    `SELECT
       COALESCE(NULLIF(device_id, ''), NULLIF(locked_by, ''), 'unknown') AS device_id,
       COUNT(*) AS total_accounts,
       SUM(login_at IS NOT NULL) AS login_success,
       SUM(status = 'DUOI_50_JOB') AS failed_accounts,
       SUM(status = 'LOI_CAU_HINH') AS config_error_accounts,
       SUM(status = 'DA_CHAY_XONG') AS done_accounts,
       SUM(DATE(login_at) = :todayDate) AS today_accounts,
       SUM(DATE(login_at) = :todayDate AND status = 'DANG_LAM') AS today_working_accounts,
       SUM(DATE(${jobActivityAt}) = :todayDate AND status = 'DUOI_50_JOB') AS today_failed_accounts,
       SUM(DATE(${jobActivityAt}) = :todayDate AND status = 'LOI_CAU_HINH') AS today_config_error_accounts,
       SUM(DATE(${jobActivityAt}) = :todayDate AND status = 'DA_CHAY_XONG') AS today_done_accounts,
       COALESCE(SUM(job_count), 0) AS total_jobs,
       COALESCE(SUM(job_count), 0) * :xuPerJob AS total_xu,
       COALESCE(SUM(CASE WHEN DATE(${jobActivityAt}) = :todayDate THEN job_count ELSE 0 END), 0) AS today_jobs,
       COALESCE(SUM(CASE WHEN DATE(${jobActivityAt}) = :todayDate THEN job_count ELSE 0 END), 0) * :xuPerJob AS today_xu,
       COALESCE(SUM(CASE WHEN YEAR(${jobActivityAt}) = YEAR(CURDATE()) AND MONTH(${jobActivityAt}) = MONTH(CURDATE()) THEN job_count ELSE 0 END), 0) AS month_jobs,
       COALESCE(SUM(CASE WHEN YEAR(${jobActivityAt}) = YEAR(CURDATE()) AND MONTH(${jobActivityAt}) = MONTH(CURDATE()) THEN job_count ELSE 0 END), 0) * :xuPerJob AS month_xu,
       MAX(${jobActivityAt}) AS last_seen
     FROM job_accounts
     ${ownerWhere(ownerFilter)}
       ${ownerFilter ? jobTouchedWhere : jobTouchedWhere.replace('AND', 'WHERE')}
     GROUP BY COALESCE(NULLIF(device_id, ''), NULLIF(locked_by, ''), 'unknown')
     ORDER BY total_xu DESC, login_success DESC`,
    { replacements: { ...replacements, xuPerJob: XU_PER_JOB }, type: QueryTypes.SELECT }
  );
};

module.exports = {
  getStats,
  getDailyStats,
  getDeviceStats,
  getJobStats,
  getJobDailyStats,
  getJobDeviceStats,
};
