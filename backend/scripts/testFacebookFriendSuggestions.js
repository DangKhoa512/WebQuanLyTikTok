require('dotenv').config();

const assert = require('assert');
const sequelize = require('../src/config/database');
const FacebookAccount = require('../src/models/FacebookAccount');
const FacebookFriendSuggestion = require('../src/models/FacebookFriendSuggestion');
const FacebookNurtureAssignment = require('../src/models/FacebookNurtureAssignment');
const AppSetting = require('../src/models/AppSetting');
require('../src/models');
const { allocateFriendSuggestions } = require('../src/services/facebookFriendSuggestionService');
const { saveFacebookNurtureSettings } = require('../src/services/settingsService');
const { getRandomNurtureScenario } = require('../src/controllers/machineApiConfigController');

const owner = '__friend_suggestion_test__';

const cleanup = async () => {
  await FacebookFriendSuggestion.destroy({ where: { owner_username: owner } });
  await FacebookNurtureAssignment.destroy({ where: { owner_username: owner } });
  await FacebookAccount.unscoped().destroy({ where: { owner_username: owner }, force: true });
  await AppSetting.destroy({ where: { owner_username: owner } });
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

  await FacebookFriendSuggestion.destroy({ where: { owner_username: owner } });
  await source.update({
    device_id: 'MayCode',
    nurture_status: 'DANG_NUOI',
    nurture_locked_by: 'MayCode',
    nurture_locked_at: new Date(),
    nurture_run_id: 'api-run-1',
  });
  await saveFacebookNurtureSettings(owner, {
    active_scenario_id: 'api-scenario',
    scenarios: [{
      id: 'api-scenario',
      name: 'API scenario',
      actions: {
        friend_request: { enabled: true, min: 2, max: 2 },
      },
    }],
  });
  let apiPayload;
  await getRandomNurtureScenario(
    { api_owner_username: owner, params: { device_id: 'MayCode' }, query: {}, body: {} },
    {
      status() { return this; },
      json(payload) { apiPayload = payload; return payload; },
    },
    (error) => { throw error; }
  );
  const apiFriendRequest = apiPayload?.value?.scenario?.actions?.friend_request;
  assert.strictEqual(apiPayload?.status, true);
  assert.strictEqual(apiFriendRequest?.uids?.length, 2);
  assert.strictEqual(apiPayload?.value?.friend_candidates?.length, 2);
  assert.strictEqual(apiFriendRequest?.source_uid, source.uid);

  console.log(JSON.stringify({
    ok: true,
    first: first.uids,
    resumed_same: true,
    second_without_duplicates: second.uids,
    random_api_uids: apiFriendRequest.uids,
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
