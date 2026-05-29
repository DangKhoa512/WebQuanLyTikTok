const { Op } = require('sequelize');
const UsedAccount = require('../models/UsedAccount');
const { success, error } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const parseDateRange = (date) => {
  if (!date) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { [Op.gte]: start, [Op.lt]: end };
};

const listUsedAccounts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(10, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const accountType = req.query.account_type;
    const dateRange = parseDateRange(req.query.date);

    if (dateRange === null) return error(res, 'Ngay loc khong hop le', 400);
    if (accountType && !['app', 'chrome'].includes(accountType)) {
      return error(res, 'account_type khong hop le', 400);
    }

    const where = { owner_username: ownerFromAdmin(req) };
    if (accountType) where.account_type = accountType;
    if (dateRange && Object.keys(dateRange).length > 0) where.used_at = dateRange;
    if (req.query.username) where.username = { [Op.like]: `%${req.query.username}%` };

    const { rows, count } = await UsedAccount.findAndCountAll({
      where,
      order: [['used_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    return success(res, {
      items: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    }, 'OK');
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsedAccounts };
