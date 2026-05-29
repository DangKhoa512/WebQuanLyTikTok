const statsService = require('../services/statsService');
const { success } = require('../utils/response');

const getStats = async (req, res, next) => {
  try {
    const stats = await statsService.getStats();
    return success(res, stats, 'Lấy thống kê thành công');
  } catch (err) {
    next(err);
  }
};

const getDailyStats = async (req, res, next) => {
  try {
    const days  = req.query.days || 7;
    const stats = await statsService.getDailyStats(days);
    return success(res, stats, 'Lấy thống kê theo ngày thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getDailyStats };
