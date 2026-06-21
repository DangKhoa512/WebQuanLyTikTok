const UsedAccount = require('../models/UsedAccount');
const { Op } = require('sequelize');
const { ownerFromAdmin } = require('../utils/owner');

const makeBatchId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const recordUsageHistory = async (req, accounts, options = {}) => {
  const validAccounts = (accounts || []).filter((account) => account?.username);
  if (validAccounts.length === 0) return { batch_id: null, count: 0 };

  const now = new Date();
  const batch_id = options.batch_id || makeBatchId();
  const used_by = ownerFromAdmin(req);
  let recorded = 0;

  for (const account of validAccounts) {
    const payload = {
      account_type: options.account_type || 'app',
      account_id: account.id,
      username: account.username,
      password: account.password || null,
      email: account.email || null,
      email_pass: account.email_pass || null,
      owner_username: account.owner_username || used_by,
      used_by,
      source_status: options.source_status || account.status || null,
      group_id: account.group_id || null,
      batch_id,
      used_at: now,
    };

    const where = {
      owner_username: payload.owner_username,
      account_type: payload.account_type,
      [Op.or]: [
        { account_id: payload.account_id },
        { username: payload.username },
      ],
    };

    const existing = await UsedAccount.findOne({ where });
    if (existing) {
      await existing.update(payload);
    } else {
      try {
        await UsedAccount.create(payload);
      } catch (err) {
        if (err.name !== 'SequelizeUniqueConstraintError') throw err;
        await UsedAccount.update(payload, { where });
      }
    }
    recorded += 1;
  }

  return { batch_id, count: recorded };
};

module.exports = { recordUsageHistory };
