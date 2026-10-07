const { success } = require('../utils/response');
const {normalizeOwner}=require('../utils/owner');
const { getDashboardSummary } = require('../services/dashboardService');

const summary = async (req, res, next) => {
  try {
    // Ownership comes from the authenticated database identity, never request query/body/role.
    const current=req.authenticatedUser;
    if(!current)return res.status(401).json({success:false,message:'Invalid authenticated user'});
    res.set('Cache-Control','private, no-store');
    return success(res,await getDashboardSummary(normalizeOwner(current.username),req.query),'Lay Dashboard thanh cong');
  } catch (err) {
    next(err);
  }
};

module.exports = { summary };
