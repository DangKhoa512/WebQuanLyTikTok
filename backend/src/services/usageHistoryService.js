const UsedAccount = require('../models/UsedAccount');
const { ownerFromAdmin } = require('../utils/owner');

const makeBatchId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const recordUsageHistory = async (req, accounts, options = {}) => {
  const validAccounts = (accounts || []).filter((account) => account?.username);
  if (validAccounts.length === 0) return { batch_id: null, count: 0 };

  const now = new Date();
  const batch_id = options.batch_id || makeBatchId();
  const used_by = ownerFromAdmin(req);

  await UsedAccount.bulkCreate(validAccounts.map((account) => ({
    account_type: options.account_type || 'app',
    account_id: account.id,
    username: account.username,
    password: account.password || null,
    email: account.email || null,
    email_pass: account.email_pass || null,
    owner_username: account.owner_username || used_by,
    used_by,
    source_status: options.source_status || account.status || null,
    batch_id,
    used_at: now,
  })));

  return { batch_id, count: validAccounts.length };
};

module.exports = { recordUsageHistory };
