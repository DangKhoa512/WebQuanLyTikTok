const statsService = require('../services/statsService');
const { success } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const getStats = async (req, res, next) => {
  try {
    const stats = await statsService.getStats(ownerFromAdmin(req));
    return success(res, stats, 'Lấy thống kê thành công');
  } catch (err) {
    next(err);
  }
};

const getDailyStats = async (req, res, next) => {
  try {
    const days  = req.query.days || 7;
    const stats = await statsService.getDailyStats(days, ownerFromAdmin(req));
    return success(res, stats, 'Lấy thống kê theo ngày thành công');
  } catch (err) {
    next(err);
  }
};

const getDeviceStats = async (req, res, next) => {
  try {
    const devices = await statsService.getDeviceStats(ownerFromAdmin(req));
    return success(res, { devices }, 'Lấy thống kê theo máy thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getDailyStats, getDeviceStats };
