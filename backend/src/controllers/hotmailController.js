const { Op } = require('sequelize');
const HotmailAccount = require('../models/HotmailAccount');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');

const STATUSES = ['CHUA_SU_DUNG', 'DANG_SU_DUNG', 'DA_SU_DUNG'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.HOTMAIL_LOCK_TIMEOUT_MIN, 10) || 30;

const nullify = (value) => {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized.toLowerCase() === 'null' ? null : normalized;
};
const splitLines = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const normalizeStatus = (value, fallback = '') => {
  const normalized = String(value || fallback).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return STATUSES.includes(normalized) ? normalized : fallback;
};
const parseLine = (line) => {
  const parts = String(line || '').split('|').map((part) => part.trim());
  const email = nullify(parts[0]);
  if (!email || !email.includes('@')) return null;
  return { raw_data: String(line || '').trim(), email, password: nullify(parts[1]) };
};
const serialize = (row) => row?.toJSON ? row.toJSON() : { ...row };

const importHotmails = async ({ text, owner_username }) => {
  const lines = splitLines(text);
  const result = { total: lines.length, created: 0, duplicated: 0, invalid: 0 };
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) { result.invalid += 1; continue; }
    const [account, created] = await HotmailAccount.findOrCreate({
      where: { owner_username, email: parsed.email },
      defaults: { ...parsed, owner_username, status: 'CHUA_SU_DUNG' },
    });
    if (created) result.created += 1;
    else {
      result.duplicated += 1;
      await account.update({
        ...parsed,
        status: 'CHUA_SU_DUNG',
        device_id: null,
        locked_by: null,
        locked_at: null,
        used_at: null,
      });
    }
  }
  return result;
};

const list = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const where = { owner_username };
    const status = normalizeStatus(req.query.status, '');
    if (status) where.status = status;
    const q = nullify(req.query.q);
    if (q) {
      where[Op.or] = [
        { email: { [Op.like]: '%' + q + '%' } },
        { device_id: { [Op.like]: '%' + q + '%' } },
        { locked_by: { [Op.like]: '%' + q + '%' } },
      ];
    }

    const countWhere = { owner_username };
    const statusRows = await HotmailAccount.findAll({
      attributes: ['status', [HotmailAccount.sequelize.fn('COUNT', HotmailAccount.sequelize.col('id')), 'count']],
      where: countWhere,
      group: ['status'],
      raw: true,
    });
    const status_counts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count) || 0]));

    const { rows, count } = await HotmailAccount.findAndCountAll({
      where,
      order: status === 'DA_SU_DUNG' ? [['used_at', 'DESC'], ['id', 'DESC']] : [['id', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });
    return success(res, {
      accounts: rows.map(serialize),
      status_counts,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    }, 'Lay danh sach Hotmail thanh cong');
  } catch (err) { next(err); }
};

const importFromDashboard = async (req, res, next) => {
  try {
    const result = await importHotmails({ text: req.body.text, owner_username: ownerFromAdmin(req) });
    return success(res, result, 'Da import ' + result.created + '/' + result.total + ' hotmail');
  } catch (err) { next(err); }
};

const getForPhone = async (req, res, next) => {
  const transaction = await HotmailAccount.sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Can truyen device_id', 400);
    }

    const expiredAt = new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000);
    await HotmailAccount.update(
      { status: 'CHUA_SU_DUNG', locked_by: null, locked_at: null },
      { where: { owner_username, status: 'DANG_SU_DUNG', locked_at: { [Op.lt]: expiredAt } }, transaction }
    );

    const active = await HotmailAccount.findOne({
      where: { owner_username, status: 'DANG_SU_DUNG', locked_by: device_id },
      order: [['locked_at', 'DESC'], ['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (active) {
      await transaction.commit();
      return success(res, { account: serialize(active), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay hotmail thanh cong');
    }

    const account = await HotmailAccount.findOne({
      where: { owner_username, status: 'CHUA_SU_DUNG' },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    if (!account) {
      await transaction.commit();
      return success(res, { account: null }, 'Het hotmail kha dung');
    }
    await account.update({ status: 'DANG_SU_DUNG', device_id, locked_by: device_id, locked_at: new Date() }, { transaction });
    await transaction.commit();
    return success(res, { account: serialize(account), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay hotmail thanh cong');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const reportUsed = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    const id = parseInt(req.body.id || req.query.id, 10);
    const email = nullify(req.body.email || req.query.email);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    if (!Number.isInteger(id) && !email) return error(res, 'Can truyen id hoac email', 400);

    const where = Number.isInteger(id) ? { id, owner_username } : { email, owner_username };
    const account = await HotmailAccount.findOne({ where });
    if (!account) return error(res, 'Khong tim thay hotmail', 404);
    if (account.locked_by && account.locked_by !== device_id) {
      return error(res, 'Hotmail dang duoc khoa boi may ' + account.locked_by, 409);
    }
    await account.update({
      status: 'DA_SU_DUNG',
      device_id,
      locked_by: null,
      locked_at: null,
      used_at: new Date(),
    });
    return success(res, { account: serialize(account) }, 'Da bao cao hotmail da su dung');
  } catch (err) { next(err); }
};

const bulkGet = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const rows = await HotmailAccount.findAll({ where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) }, order: [['id', 'ASC']] });
    return success(res, { text: rows.map((row) => row.raw_data).join('\n'), count: rows.length }, 'Da lay hotmail');
  } catch (err) { next(err); }
};

const bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const deleted = await HotmailAccount.destroy({ where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) } });
    return success(res, { deleted }, 'Da xoa ' + deleted + ' hotmail');
  } catch (err) { next(err); }
};

module.exports = { list, importFromDashboard, getForPhone, reportUsed, bulkGet, bulkDelete };
