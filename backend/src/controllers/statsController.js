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
    const days = req.query.days || 7;
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

const getJobStats = async (req, res, next) => {
  try {
    const stats = await statsService.getJobStats(ownerFromAdmin(req), req.query.web);
    return success(res, stats, 'Lấy thống kê JOB thành công');
  } catch (err) {
    next(err);
  }
};

const getJobDailyStats = async (req, res, next) => {
  try {
    const days = req.query.days || 30;
    const stats = await statsService.getJobDailyStats(days, ownerFromAdmin(req), req.query.web);
    return success(res, stats, 'Lấy thống kê JOB theo ngày thành công');
  } catch (err) {
    next(err);
  }
};

const getJobDeviceStats = async (req, res, next) => {
  try {
    const devices = await statsService.getJobDeviceStats(ownerFromAdmin(req), req.query.web);
    return success(res, { devices }, 'Lấy thống kê JOB theo máy thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getDailyStats,
  getDeviceStats,
  getJobStats,
  getJobDailyStats,
  getJobDeviceStats,
};
