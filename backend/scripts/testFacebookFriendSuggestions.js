require('dotenv').config();

const assert = require('assert');
const sequelize = require('../src/config/database');
const FacebookAccount = require('../src/models/FacebookAccount');
const FacebookFriendSuggestion = require('../src/models/FacebookFriendSuggestion');
require('../src/models');
const { allocateFriendSuggestions } = require('../src/services/facebookFriendSuggestionService');

const owner = '__friend_suggestion_test__';

const cleanup = async () => {
  await FacebookFriendSuggestion.destroy({ where: { owner_username: owner } });
  await FacebookAccount.unscoped().destroy({ where: { owner_username: owner }, force: true });
};

const main = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ force: false, alter: false });
  await cleanup();
  const accounts = await FacebookAccount.bulkCreate(
    ['source', 'target1', 'target2', 'target3', 'target4', 'target5'].map((uid) => ({
      owner_username: owner,
      kind: 'job',
      raw_data: uid + '|pass',
      uid,
      password: 'pass',
      status: 'LOGIN_THANH_CONG',
      live_status: 'live',
      cookies: 'c_user=' + uid,
    }))
  );
  const source = accounts[0];
  const action = { enabled: true, min: 3, max: 3 };
  const first = await allocateFriendSuggestions({ owner, sourceAccount: source, runId: 'run-1', action });
  const resumed = await allocateFriendSuggestions({ owner, sourceAccount: source, runId: 'run-1', action });
  const second = await allocateFriendSuggestions({ owner, sourceAccount: source, runId: 'run-2', action });

  assert.strictEqual(first.uids.length, 3);
  assert.deepStrictEqual(resumed.uids, first.uids);
  assert.strictEqual(second.uids.length, 2);
  assert.strictEqual(first.uids.includes(source.uid), false);
  assert.strictEqual(second.uids.some((uid) => first.uids.includes(uid)), false);
  assert.strictEqual(new Set([...first.uids, ...second.uids]).size, 5);

  console.log(JSON.stringify({
    ok: true,
    first: first.uids,
    resumed_same: true,
    second_without_duplicates: second.uids,
  }, null, 2));
};

main()
  .then(cleanup)
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error);
    try { await cleanup(); } catch (_) {}
    await sequelize.close();
    process.exit(1);
  });
