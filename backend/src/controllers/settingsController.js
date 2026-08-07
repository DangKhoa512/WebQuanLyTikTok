const { success, error } = require('../utils/response');
const { ownerFromAdmin, normalizeOwner } = require('../utils/owner');
const User = require('../models/User');
const {
  getEligibilitySettings,
  saveEligibilitySettings,
  getChromeKhangLimitSettings,
  saveChromeKhangLimitSettings,
} = require('../services/settingsService');

const getEligibility = async (req, res, next) => {
  try {
    const settings = await getEligibilitySettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lấy cài đặt đủ điều kiện thành công');
  } catch (err) {
    next(err);
  }
};

const updateEligibility = async (req, res, next) => {
  try {
    const min_age_days = parseInt(req.body.min_age_days, 10);
    const min_videos = parseInt(req.body.min_videos, 10);
    if (!Number.isInteger(min_age_days) || min_age_days <= 0) {
      return error(res, 'Số ngày phải lớn hơn 0', 400);
    }
    if (!Number.isInteger(min_videos) || min_videos <= 0) {
      return error(res, 'Số video phải lớn hơn 0', 400);
    }

    const settings = await saveEligibilitySettings(ownerFromAdmin(req), { min_age_days, min_videos });
    return success(res, { settings }, 'Đã lưu cài đặt đủ điều kiện');
  } catch (err) {
    next(err);
  }
};

const getChromeKhangLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const targetOwner = isAdmin && req.query.owner_username
      ? normalizeOwner(req.query.owner_username)
      : ownerFromAdmin(req);
    const settings = await getChromeKhangLimitSettings(targetOwner);
    settings.owner_username = targetOwner;
    settings.editable = isAdmin;
    return success(res, { settings }, 'Lay cai dat limit Chrome khang thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateChromeKhangLimit = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc sua limit Chrome khang', 403);
    }

    const owner = normalizeOwner(req.body.owner_username || ownerFromAdmin(req));
    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      return error(res, 'Limit phai lon hon 0', 400);
    }

    const settings = await saveChromeKhangLimitSettings(owner, { limit });
    settings.owner_username = owner;
    settings.editable = true;
    return success(res, { settings }, 'Da luu limit Chrome khang');
  } catch (err) {
    next(err);
  }
};

const listChromeKhangLimits = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc xem limit Chrome khang cua user', 403);
    }

    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'is_active'],
      order: [['username', 'ASC']],
      raw: true,
    });
    const rows = await Promise.all(users.map(async (user) => {
      const settings = await getChromeKhangLimitSettings(user.username);
      return { ...user, limit: settings.limit };
    }));

    return success(res, { users: rows }, 'OK');
  } catch (err) {
    next(err);
  }
};

module.exports = { getEligibility, updateEligibility, getChromeKhangLimit, updateChromeKhangLimit, listChromeKhangLimits };
