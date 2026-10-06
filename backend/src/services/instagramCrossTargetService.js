const { reserveTargets } = require('./crossTargetService');
const allocateInstagramTargets = async ({ owner, sourceAccountId, scenario, requestId, requestedCount, transaction }) => {
 const action = scenario.actions.cross_follow || { enabled: false, min: 0, max: 0, usernames: [] };
 // Instagram retains device-side random counts. With no explicit count, reserve up to Max.
 const count = requestedCount === undefined ? (action.enabled ? action.max : 0) : requestedCount;
 const batch = await reserveTargets({ owner, platform: 'INSTAGRAM', sourceAccountId: Number(sourceAccountId), scenarioId: scenario.id, requestId, action, requestedCount: count, transaction, getPool: async () => action.usernames });
 return { ...action, configured_min: action.min, configured_max: action.max, min: Math.min(action.min,batch.targets.length), max: Math.min(action.max,batch.targets.length), ...batch, usernames: batch.targets };
};
module.exports = { allocateInstagramTargets };
