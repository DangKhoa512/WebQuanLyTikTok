const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');

const vietnamDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
});
const vietnamDate = (daysAgo = 0) => vietnamDateFormatter.format(new Date(Date.now() - daysAgo * 86400000));
const nullify = (value) => {
  const text = String(value ?? '').trim();
  return !text || text.toLowerCase() === 'null' ? null : text;
};
const normalizePlatform = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'fb') return 'facebook';
  if (text === 'ig') return 'instagram';
  return ['facebook', 'instagram'].includes(text) ? text : null;
};
const nonNegativeInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};
const normalizeRange = (value) => {
  const text = String(value || 'today').trim().toLowerCase();
  if (['7', '7d', 'week', 'weekly'].includes(text)) return { key: '7d', days: 7 };
  if (['30', '30d', 'month', 'monthly'].includes(text)) return { key: '30d', days: 30 };
  return { key: 'today', days: 1 };
};

const report = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const platform = normalizePlatform(req.body.platform || req.query.platform);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may);
    const live = nonNegativeInteger(req.body.acc_live ?? req.body.live ?? req.body.live_count ?? req.query.acc_live ?? req.query.live ?? req.query.live_count);
    const die = nonNegativeInteger(req.body.acc_die ?? req.body.die ?? req.body.die_count ?? req.query.acc_die ?? req.query.die ?? req.query.die_count);
    if (!platform) return error(res, 'platform khong hop le. Dung facebook hoac instagram', 400);
    if (!device_id) return error(res, 'Can truyen ten may qua device_id', 400);
    if (live === null || die === null) return error(res, 'acc_live va acc_die phai la so nguyen tu 0 tro len', 400);

    const stat_date = vietnamDate();
    const now = new Date();
    await sequelize.query(
      `INSERT INTO platform_machine_daily_stats
        (owner_username, platform, device_id, stat_date, live_count, die_count, report_count, last_reported_at, created_at, updated_at)
       VALUES (:owner_username, :platform, :device_id, :stat_date, :live, :die, 1, :now, :now, :now)
       ON DUPLICATE KEY UPDATE
        live_count = live_count + VALUES(live_count),
        die_count = die_count + VALUES(die_count),
        report_count = report_count + 1,
        last_reported_at = VALUES(last_reported_at),
        updated_at = VALUES(updated_at)`,
      { replacements: { owner_username, platform, device_id, stat_date, live, die, now } }
    );

    const [row] = await sequelize.query(
      `SELECT device_id, platform, stat_date, live_count AS acc_live, die_count AS acc_die,
              (live_count + die_count) AS total, report_count, last_reported_at
       FROM platform_machine_daily_stats
       WHERE owner_username=:owner_username AND platform=:platform AND device_id=:device_id AND stat_date=:stat_date
       LIMIT 1`,
      { replacements: { owner_username, platform, device_id, stat_date }, type: QueryTypes.SELECT }
    );
    return success(res, { report: row }, 'Da cong don trang thai may');
  } catch (err) { next(err); }
};

const stats = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const platform = normalizePlatform(req.query.platform);
    if (!platform) return error(res, 'platform khong hop le. Dung facebook hoac instagram', 400);
    const range = normalizeRange(req.query.range);
    const date_to = vietnamDate();
    const date_from = vietnamDate(range.days - 1);
    const device = nullify(req.query.device_id || req.query.q);
    const replacements = { owner_username, platform, date_from, date_to };
    let deviceSql = '';
    if (device) {
      replacements.device = `%${device}%`;
      deviceSql = ' AND device_id LIKE :device';
    }
    const rows = await sequelize.query(
      `SELECT device_id,
              SUM(live_count) AS acc_live,
              SUM(die_count) AS acc_die,
              SUM(live_count + die_count) AS total,
              SUM(report_count) AS report_count,
              MAX(last_reported_at) AS last_reported_at
       FROM platform_machine_daily_stats
       WHERE owner_username=:owner_username AND platform=:platform
         AND stat_date BETWEEN :date_from AND :date_to${deviceSql}
       GROUP BY device_id
       ORDER BY CHAR_LENGTH(device_id) ASC, device_id ASC`,
      { replacements, type: QueryTypes.SELECT }
    );
    const devices = rows.map((row) => ({
      ...row,
      acc_live: Number(row.acc_live) || 0,
      acc_die: Number(row.acc_die) || 0,
      total: Number(row.total) || 0,
      report_count: Number(row.report_count) || 0,
    }));
    const totals = devices.reduce((sum, row) => ({
      acc_live: sum.acc_live + row.acc_live,
      acc_die: sum.acc_die + row.acc_die,
      total: sum.total + row.total,
      report_count: sum.report_count + row.report_count,
    }), { acc_live: 0, acc_die: 0, total: 0, report_count: 0 });
    return success(res, {
      platform, range: range.key, range_days: range.days, date_from, date_to,
      total_devices: devices.length, totals, devices,
    }, 'Lay thong ke trang thai may thanh cong');
  } catch (err) { next(err); }
};

module.exports = { report, stats };