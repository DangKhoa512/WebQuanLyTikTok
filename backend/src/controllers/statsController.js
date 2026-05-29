const statsService = require('../services/statsService');
const { success } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const ownerFilterForStats = (req) =>
  req.admin?.role === 'admin' && !req.query.user ? null : ownerFromAdmin(req);

const getStats = async (req, res, next) => {
  try {
    const stats = await statsService.getStats(ownerFilterForStats(req));
    return success(res, stats, 'Lấy thống kê thành công');
  } catch (err) {
    next(err);
  }
};

const getDailyStats = async (req, res, next) => {
  try {
    const days  = req.query.days || 7;
    const stats = await statsService.getDailyStats(days, ownerFilterForStats(req));
    return success(res, stats, 'Lấy thống kê theo ngày thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getDailyStats };
