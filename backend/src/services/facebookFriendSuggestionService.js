const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookFriendSuggestion = require('../models/FacebookFriendSuggestion');

const ELIGIBLE_STATUSES = ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'];

const getRequestedCount = (action = {}) => {
  if (action.enabled !== true) return 0;
  const parsedMin = parseInt(action.min, 10);
  const parsedMax = parseInt(action.max, 10);
  const min = Number.isInteger(parsedMin) ? Math.min(Math.max(parsedMin, 0), 100) : 0;
  const max = Number.isInteger(parsedMax) ? Math.min(Math.max(parsedMax, min), 100) : min;
  return min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
};

const selectCandidates = async ({ owner, sourceAccountId, pivot, limit, wrap, transaction }) => {
  if (limit <= 0) return [];
  const comparator = wrap ? '<' : '>=';
  return sequelize.query(
    `SELECT candidate.id, candidate.uid
       FROM facebook_accounts candidate
       WHERE candidate.owner_username = :owner
         AND candidate.kind = 'job'
         AND candidate.trashed_at IS NULL
         AND candidate.id <> :sourceAccountId
         AND candidate.id ${comparator} :pivot
         AND candidate.status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG')
         AND COALESCE(candidate.live_status, 'unknown') <> 'die'
         AND candidate.uid IS NOT NULL
         AND candidate.uid <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM facebook_friend_suggestions history
           WHERE history.owner_username = :owner
             AND history.source_account_id = :sourceAccountId
             AND history.target_uid = candidate.uid
         )
       ORDER BY candidate.id ASC
       LIMIT :limit`,
    {
      replacements: { owner, sourceAccountId, pivot, limit },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
};

const allocateFriendSuggestions = async ({ owner, sourceAccount, runId, action }) => {
  const requestedCount = getRequestedCount(action);
  if (!requestedCount || !sourceAccount?.id || !sourceAccount?.uid || !runId) {
    return { requested_count: requestedCount, uids: [] };
  }

  const rows = await sequelize.transaction(async (transaction) => {
    await FacebookAccount.unscoped().findOne({
      where: { id: sourceAccount.id, owner_username: owner, kind: 'job' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const existing = await FacebookFriendSuggestion.findAll({
      where: {
        owner_username: owner,
        source_account_id: sourceAccount.id,
        run_id: runId,
      },
      order: [['id', 'ASC']],
      transaction,
      raw: true,
    });
    if (existing.length) return existing;

    const maxId = Number(await FacebookAccount.unscoped().max('id', {
      where: {
        owner_username: owner,
        kind: 'job',
        trashed_at: null,
        status: { [Op.in]: ELIGIBLE_STATUSES },
        [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }],
      },
      transaction,
    })) || 0;
    if (!maxId) return [];

    const pivot = 1 + Math.floor(Math.random() * maxId);
    const first = await selectCandidates({
      owner,
      sourceAccountId: sourceAccount.id,
      pivot,
      limit: requestedCount,
      wrap: false,
      transaction,
    });
    const second = first.length < requestedCount
      ? await selectCandidates({
        owner,
        sourceAccountId: sourceAccount.id,
        pivot,
        limit: requestedCount - first.length,
        wrap: true,
        transaction,
      })
      : [];
    const selected = [...first, ...second];
    if (!selected.length) return [];

    await FacebookFriendSuggestion.bulkCreate(selected.map((target) => ({
      owner_username: owner,
      source_account_id: sourceAccount.id,
      source_uid: sourceAccount.uid,
      target_account_id: target.id,
      target_uid: target.uid,
      run_id: runId,
      delivered_at: new Date(),
    })), { transaction, ignoreDuplicates: true });

    return FacebookFriendSuggestion.findAll({
      where: {
        owner_username: owner,
        source_account_id: sourceAccount.id,
        run_id: runId,
      },
      order: [['id', 'ASC']],
      transaction,
      raw: true,
    });
  });

  return {
    requested_count: requestedCount,
    uids: rows.map((row) => row.target_uid).filter(Boolean),
  };
};

module.exports = { allocateFriendSuggestions, getRequestedCount };
