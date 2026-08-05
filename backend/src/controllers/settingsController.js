const { success, error } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');
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
    const settings = await getChromeKhangLimitSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lấy cài đặt limit Chrome kháng thành công');
  } catch (err) {
    next(err);
  }
};

const updateChromeKhangLimit = async (req, res, next) => {
  try {
    const owner = ownerFromAdmin(req);
    const current = await getChromeKhangLimitSettings(owner);
    if (!current.editable) {
      return error(res, 'Chỉ admin được sửa limit Chrome kháng', 403);
    }

    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      return error(res, 'Limit phải lớn hơn 0', 400);
    }

    const settings = await saveChromeKhangLimitSettings(owner, { limit });
    return success(res, { settings }, 'Đã lưu limit Chrome kháng');
  } catch (err) {
    next(err);
  }
};

module.exports = { getEligibility, updateEligibility, getChromeKhangLimit, updateChromeKhangLimit };
