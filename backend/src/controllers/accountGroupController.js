const AccountGroup = require('../models/AccountGroup');
const Account = require('../models/Account');
const ChromeAccount = require('../models/ChromeAccount');
const JobAccount = require('../models/JobAccount');
const { success, error } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const TYPES = ['app', 'chrome', 'job'];
const JOB_TYPES = ['chrome', 'hotmail'];
const cleanName = (value) => String(value || '').trim();

const listGroups = async (req, res, next) => {
  try {
    const accountType = req.query.account_type;
    if (accountType && !TYPES.includes(accountType)) {
      return error(res, 'account_type khong hop le', 400);
    }

    const where = { owner_username: ownerFromAdmin(req) };
    if (accountType) where.account_type = accountType;
    if (accountType === 'job' && req.query.job_type) {
      const jobType = cleanName(req.query.job_type).toLowerCase();
      if (!JOB_TYPES.includes(jobType)) return error(res, 'job_type khong hop le', 400);
      where.job_type = jobType;
    }

    const groups = await AccountGroup.findAll({
      where,
      order: [['account_type', 'ASC'], ['name', 'ASC']],
    });

    return success(res, { groups }, 'OK');
  } catch (err) {
    next(err);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const account_type = req.body.account_type;
    const name = cleanName(req.body.name);
    const job_type = account_type === 'job' ? cleanName(req.body.job_type || 'chrome').toLowerCase() : null;

    if (!TYPES.includes(account_type)) return error(res, 'account_type khong hop le', 400);
    if (account_type === 'job' && !JOB_TYPES.includes(job_type)) return error(res, 'job_type khong hop le', 400);
    if (!name) return error(res, 'Thieu ten nhom', 400);
    if (name.length > 100) return error(res, 'Ten nhom toi da 100 ky tu', 400);

    const [group, created] = await AccountGroup.findOrCreate({
      where: { owner_username: ownerFromAdmin(req), account_type, job_type, name },
      defaults: {
        owner_username: ownerFromAdmin(req),
        account_type,
        job_type,
        name,
        note: req.body.note || null,
      },
    });

    return success(res, { group, created }, created ? 'Da tao nhom' : 'Nhom da ton tai', created ? 201 : 200);
  } catch (err) {
    next(err);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const group = await AccountGroup.findOne({
      where: { id: req.params.id, owner_username: ownerFromAdmin(req) },
    });
    if (!group) return error(res, 'Khong tim thay nhom', 404);

    const updates = {};
    if (req.body.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) return error(res, 'Thieu ten nhom', 400);
      if (name.length > 100) return error(res, 'Ten nhom toi da 100 ky tu', 400);
      updates.name = name;
    }
    if (req.body.note !== undefined) updates.note = req.body.note || null;

    await group.update(updates);
    return success(res, { group }, 'Da cap nhat nhom');
  } catch (err) {
    next(err);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    const group = await AccountGroup.findOne({
      where: { id: req.params.id, owner_username: ownerFromAdmin(req) },
    });
    if (!group) return error(res, 'Khong tim thay nhom', 404);

    const Model = group.account_type === 'chrome' ? ChromeAccount : group.account_type === 'job' ? JobAccount : Account;
    await Model.update(
      { group_id: null },
      { where: { group_id: group.id, owner_username: ownerFromAdmin(req) } }
    );
    await group.destroy();

    return success(res, { deleted: 1 }, 'Da xoa nhom');
  } catch (err) {
    next(err);
  }
};

module.exports = { listGroups, createGroup, updateGroup, deleteGroup };
