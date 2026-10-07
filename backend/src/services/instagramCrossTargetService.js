const { reserveTargets } = require('./crossTargetService');
const allocateInstagramTargets = async ({ owner, sourceAccountId, scenario, requestId, requestedCount, transaction, actionKey = 'cross_follow' }) => {
 const action = scenario.actions[actionKey] || { enabled: false, min: 0, max: 0, usernames: [] };
 // Instagram retains device-side random counts. With no explicit count, reserve up to Max.
 const accountPool = actionKey === 'cross_account_follow';
 const count = requestedCount === undefined ? (action.enabled ? action.max : 0) : requestedCount;
 const batch = await reserveTargets({ owner, platform: 'INSTAGRAM', sourceAccountId: Number(sourceAccountId), scenarioId: scenario.id, requestId, action, actionType: accountPool ? 'ACCOUNT_CROSS_FOLLOW' : 'CROSS_FOLLOW', requestedCount: count, transaction, getPool: async (source, tx) => {
  if (!accountPool) return action.usernames;
  const { Op } = require('sequelize');
  const Account = require('../models/InstagramAccount');
  const rows = await Account.unscoped().findAll({ attributes: ['uid'], where: { owner_username: owner, trashed_at: null, id: { [Op.ne]: source.id }, status: { [Op.in]: ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'] } }, raw: true, transaction: tx });
  const own = String(source.uid || '').trim().replace(/^@/, '').toLowerCase();
  return rows.map(row => String(row.uid || '').trim().replace(/^@/, '').toLowerCase()).filter(uid => uid !== own && uid.length <= 30 && /^[a-zA-Z0-9._]+$/.test(uid) && /[a-zA-Z0-9_]/.test(uid));
 } });
 return { ...action, configured_min: action.min, configured_max: action.max, min: Math.min(action.min,batch.targets.length), max: Math.min(action.max,batch.targets.length), ...batch, usernames: batch.targets };
};
module.exports = { allocateInstagramTargets };

const allocateInstagramScenarioTargets = async (args) => {
 const execute = async transaction => {
  const cross_follow = await allocateInstagramTargets({ ...args, transaction });
  const cross_account_follow = await allocateInstagramTargets({ ...args, transaction, actionKey: 'cross_account_follow', requestedCount: args.accountRequestedCount });
  return { ...args.scenario, actions: { ...args.scenario.actions, cross_follow, cross_account_follow } };
 };
 return args.transaction ? execute(args.transaction) : require('../config/database').transaction(execute);
};
module.exports.allocateInstagramScenarioTargets = allocateInstagramScenarioTargets;
