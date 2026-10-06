const { Op } = require('sequelize');
const Account = require('../models/FacebookAccount');
const { reserveTargets } = require('./crossTargetService');
const getRequestedCount = (action = {}) => {
 if (action.enabled !== true) return 0;
 const min = Math.min(Math.max(parseInt(action.min,10) || 0,0),100);
 const max = Math.min(Math.max(parseInt(action.max,10) || min,min),100);
 return min === max ? min : min + Math.floor(Math.random() * (max-min+1));
};
const allocateFriendSuggestions = async ({ owner, sourceAccount, runId, action, transaction }) => {
 const requestedCount = getRequestedCount(action);
 if (!sourceAccount?.id || !runId) return { requested_count: requestedCount, uids: [] };
 const batch = await reserveTargets({ owner, platform: 'FACEBOOK', sourceAccountId: Number(sourceAccount.id), requestId: runId, action, requestedCount, transaction,
  getPool: async (source, tx) => (await Account.unscoped().findAll({ attributes: ['uid'], where: {
   owner_username: owner, kind: 'job', trashed_at: null, id: { [Op.ne]: source.id },
   status: { [Op.in]: ['LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG'] },
   [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }],
  }, raw: true, transaction: tx })).map(row => row.uid).filter(Boolean)
 });
 return { ...batch, uids: batch.targets };
};
module.exports = { allocateFriendSuggestions, getRequestedCount };
