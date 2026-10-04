const { success } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');
const { getDashboardSummary } = require('../services/dashboardService');

const summary = async (req, res, next) => {
  try {
    return success(res, await getDashboardSummary(ownerFromAdmin(req)), 'Lay Dashboard thanh cong');
  } catch (err) {
    next(err);
  }
};

module.exports = { summary };
