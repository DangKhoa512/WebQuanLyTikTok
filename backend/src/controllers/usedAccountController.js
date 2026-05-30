const { Op, fn, col, where: sqlWhere } = require('sequelize');
const UsedAccount = require('../models/UsedAccount');
const Account = require('../models/Account');
const ChromeAccount = require('../models/ChromeAccount');
const { success, error } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const parseDateFilter = (date) => {
  if (!date) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return sqlWhere(fn('DATE', col('used_at')), date);
};

const mapById = (rows) => {
  const out = new Map();
  rows.forEach((row) => out.set(row.id, row));
  return out;
};

const currentAttributes = [
  'id','username','password','email','email_pass','proxy','device_id',
  'status','live_status','video_count','followers','following','note','reg_at',
];

const listUsedAccounts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(10, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const accountType = req.query.account_type;
    const dateFilter = parseDateFilter(req.query.date);

    if (dateFilter === null) return error(res, 'Ngay loc khong hop le', 400);
    if (accountType && !['app', 'chrome'].includes(accountType)) {
      return error(res, 'account_type khong hop le', 400);
    }

    const where = { owner_username: ownerFromAdmin(req) };
    if (accountType) where.account_type = accountType;
    if (dateFilter) where[Op.and] = [dateFilter];
    if (req.query.username) where.username = { [Op.like]: `%${req.query.username}%` };

    const { rows, count } = await UsedAccount.findAndCountAll({
      where,
      order: [['used_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    const plainRows = rows.map((row) => row.toJSON());
    const appIds = plainRows.filter((row) => row.account_type === 'app').map((row) => row.account_id);
    const chromeIds = plainRows.filter((row) => row.account_type === 'chrome').map((row) => row.account_id);
    const owner = ownerFromAdmin(req);

    const [appAccounts, chromeAccounts] = await Promise.all([
      appIds.length > 0
        ? Account.findAll({ where: { id: { [Op.in]: appIds }, owner_username: owner }, attributes: currentAttributes })
        : [],
      chromeIds.length > 0
        ? ChromeAccount.findAll({ where: { id: { [Op.in]: chromeIds }, owner_username: owner }, attributes: currentAttributes })
        : [],
    ]);

    const appMap = mapById(appAccounts.map((row) => row.toJSON()));
    const chromeMap = mapById(chromeAccounts.map((row) => row.toJSON()));
    const items = plainRows.map((row) => {
      const current = row.account_type === 'chrome' ? chromeMap.get(row.account_id) : appMap.get(row.account_id);
      return {
        ...row,
        ...(current || {}),
        id: row.id,
        history_id: row.id,
        account_id: row.account_id,
        source_status: row.source_status,
        used_at: row.used_at,
        batch_id: row.batch_id,
        account_type: row.account_type,
        original_exists: !!current,
      };
    });

    return success(res, {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    }, 'OK');
  } catch (err) {
    next(err);
  }
};

const bulkDeleteUsedAccounts = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return error(res, 'Can truyen mang ids', 400);
    }
    if (ids.length > 500) {
      return error(res, 'Toi da 500 dong moi lan', 400);
    }

    const deleted = await UsedAccount.destroy({
      where: {
        id: { [Op.in]: ids },
        owner_username: ownerFromAdmin(req),
      },
    });

    return success(res, { deleted }, `Da xoa ${deleted} dong lich su`);
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsedAccounts, bulkDeleteUsedAccounts };
