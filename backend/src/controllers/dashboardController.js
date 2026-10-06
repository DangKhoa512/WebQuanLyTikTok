const { success } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');
const { getDashboardSummary } = require('../services/dashboardService');

const summary = async (req, res, next) => {
  try {
    const registry=require('../services/taskRegistryService').createRegistryService(require('../config/database'));
    const owner=ownerFromAdmin(req),current=await registry.identity(owner);
    if(!current)return res.status(401).json({success:false,message:'Phiên người dùng không hợp lệ'});
    return success(res, await getDashboardSummary(owner,current.role==='admin'), 'Lay Dashboard thanh cong');
  } catch (err) {
    next(err);
  }
};

module.exports = { summary };
