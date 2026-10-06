const { Op } = require('sequelize');
const { randomInt } = require('crypto');
const db = require('../config/database');
const Cycle = require('../models/CrossTargetCycle');
const Batch = require('../models/CrossTargetBatch');
const History = require('../models/CrossTargetHistory');
const logger = require('../config/logger');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const normalizeTarget = (platform, value) => platform === 'INSTAGRAM' ? String(value).trim().replace(/^@/, '').toLowerCase() : String(value).trim();
const getScope = ({ owner, platform, sourceAccountId, scenarioId = '', actionType = platform === 'FACEBOOK' ? 'CROSS_FRIEND' : 'CROSS_FOLLOW' }) => ({ owner_username: owner, platform, action_type: actionType, source_account_id: sourceAccountId, scenario_id: platform === 'FACEBOOK' && actionType === 'CROSS_FRIEND' ? '' : scenarioId });
// Import only this source's old Facebook deliveries, once, under the same source row lock.
// Facebook historically shared history across scenarios; keep that scope and retain the old table.
const importLegacy = async (scope, cycle, transaction) => {
 if (scope.platform !== 'FACEBOOK' || scope.action_type !== 'CROSS_FRIEND' || cycle.legacy_imported) return;
 const Legacy = require('../models/FacebookFriendSuggestion');
 const rows = await Legacy.findAll({ where: { owner_username: scope.owner_username, source_account_id: scope.source_account_id }, order: [['id','ASC']], raw: true, transaction });
 const groups = new Map();
 for (const row of rows) { if (!groups.has(row.run_id)) groups.set(row.run_id, []); groups.get(row.run_id).push(row); }
 for (const [request_id, targets] of groups) {
  const [batch] = await Batch.findOrCreate({ where: { ...scope, request_id }, defaults: { ...scope, request_id, cycle_id: 1, requested_count: targets.length, available_count: targets.length, issued_count: targets.length, issued_at: targets[0].delivered_at }, transaction });
  await History.bulkCreate(targets.map(row => ({ ...scope, cycle_id: 1, target_key: normalizeTarget('FACEBOOK',row.target_uid), batch_id: batch.id, issued_at: row.delivered_at })), { transaction, ignoreDuplicates: true });
 }
 await cycle.update({ legacy_imported: true }, { transaction });
};
const reserveTargets = async ({ owner, platform, sourceAccountId, scenarioId = '', actionType, requestId, action, requestedCount, getPool, transaction: outerTransaction }) => {
 if (!['FACEBOOK','INSTAGRAM'].includes(platform) || !Number.isSafeInteger(sourceAccountId) || sourceAccountId < 1) throw fail('Platform/source_account_id không hợp lệ.');
 if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw fail('request_id phải là chuỗi từ 1 đến 100 ký tự.');
 if (!Number.isInteger(requestedCount) || requestedCount < 0 || requestedCount > 200) throw fail('count phải là số nguyên từ 0 đến 200.');
 if (action?.enabled && requestedCount > Number(action.max)) throw fail('count không được lớn hơn Max của hoạt động.');
 const scope = getScope({ owner, platform, sourceAccountId, scenarioId, actionType });
 const execute = async transaction => {
  const Account = require(platform === 'FACEBOOK' ? '../models/FacebookAccount' : '../models/InstagramAccount');
  const source = await Account.unscoped().findOne({ where: { id: sourceAccountId, owner_username: owner, kind: 'job', trashed_at: null }, transaction, lock: transaction.LOCK.UPDATE });
  if (!source) throw fail('Không tìm thấy source account của user.', 404);
  const empty = { request_id: requestId, cycle_id: null, requested_count: requestedCount, available_count: 0, issued_count: 0, targets: [] };
  if (!action?.enabled) return empty;
  const [cycle] = await Cycle.findOrCreate({ where: scope, defaults: scope, transaction });
  await importLegacy(scope, cycle, transaction);
  const existing = await Batch.findOne({ where: { ...scope, request_id: requestId }, transaction });
  if (existing) {
   const rows = await History.findAll({ where: { ...scope, batch_id: existing.id }, order: [['id','ASC']], raw: true, transaction });
   return { ...empty, cycle_id: existing.cycle_id, requested_count: existing.requested_count, available_count: existing.available_count, issued_count: rows.length, targets: rows.map(row => row.target_key), resumed: true };
  }
  const pool = [...new Set((await getPool(source, transaction)).map(value => normalizeTarget(platform, value)).filter(Boolean))];
  const history = await History.findAll({ attributes: ['target_key'], where: { ...scope, cycle_id: cycle.cycle_id }, raw: true, transaction });
  const used = new Set(history.map(row => normalizeTarget(platform,row.target_key)));
  let available = pool.filter(target => !used.has(target));
  // Empty pool/count does not advance the cycle; a short tail never mixes two cycles.
  if (pool.length && requestedCount && !available.length && history.length) { await cycle.update({ cycle_id: cycle.cycle_id + 1 }, { transaction }); available = [...pool]; }
  const availableCount = available.length;
  const count = Math.min(requestedCount, availableCount);
  for (let i = 0; i < count; i++) { const index = randomInt(i,available.length); [available[i],available[index]] = [available[index],available[i]]; }
  const targets = available.slice(0,count);
  const batch = await Batch.create({ ...scope, request_id: requestId, cycle_id: cycle.cycle_id, requested_count: requestedCount, available_count: availableCount, issued_count: targets.length }, { transaction });
  if (targets.length) await History.bulkCreate(targets.map(target_key => ({ ...scope, cycle_id: cycle.cycle_id, target_key, batch_id: batch.id })), { transaction });
  logger.debug('Cross target batch', { platform, action_type: scope.action_type, source_account_id: sourceAccountId, scenario_id: scope.scenario_id, cycle_id: cycle.cycle_id, requested_count: requestedCount, available_count: availableCount, issued_count: targets.length });
  return { ...empty, cycle_id: cycle.cycle_id, available_count: availableCount, issued_count: targets.length, targets };
 };
 return outerTransaction ? execute(outerTransaction) : db.transaction(execute);
};
const markTargets = async ({ owner, platform, sourceAccountId, scenarioId, actionType, requestId, results }) => {
 if (!Array.isArray(results) || results.length > 200 || results.some(row => !row || typeof row.target !== 'string' || !['SUCCESS','FAILED'].includes(row.status))) throw fail('results cần target và status SUCCESS/FAILED, tối đa 200 mục.');
 const scope = getScope({ owner, platform, sourceAccountId, scenarioId, actionType });
 return db.transaction(async transaction => {
  const batch = await Batch.findOne({ where: { ...scope, request_id: requestId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!batch) throw fail('Không tìm thấy batch của source/user.',404);
  const rows = await History.findAll({ where: { ...scope, batch_id: batch.id }, transaction, lock: transaction.LOCK.UPDATE });
  for (const result of results) if (!rows.some(row => normalizeTarget(platform,row.target_key) === normalizeTarget(platform,result.target))) throw fail('Target chưa được cấp trong request này.');
  for (const result of results) { const row = rows.find(row => normalizeTarget(platform,row.target_key) === normalizeTarget(platform,result.target)); if (row.status === 'ISSUED') await row.update({ status: result.status },{ transaction }); else if (row.status !== result.status) throw fail('Target đã được báo cáo với kết quả khác.',409); }
  return { reported_count: results.length };
 });
};
module.exports = { reserveTargets, markTargets, importLegacy, getScope, normalizeTarget };
