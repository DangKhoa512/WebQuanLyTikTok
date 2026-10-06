const { randomUUID } = require('crypto');
const { ownerFromRequest } = require('../utils/owner');
const { success } = require('../utils/response');
const settings = require('../services/settingsService');
const { allocateInstagramTargets } = require('../services/instagramCrossTargetService');
const { allocateFriendSuggestions } = require('../services/facebookFriendSuggestionService');
const { markTargets } = require('../services/crossTargetService');
const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const input = req => {
 const sourceAccountId = req.body.source_account_id;
 if (!Number.isSafeInteger(sourceAccountId) || sourceAccountId < 1) throw fail('source_account_id phải là số nguyên dương.');
 const scenarioId = req.body.scenario_id;
 if (typeof scenarioId !== 'string' || !scenarioId || scenarioId.length > 100) throw fail('scenario_id không hợp lệ.');
 const requestId = req.body.request_id ?? randomUUID();
 if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw fail('request_id không hợp lệ.');
 return { owner: ownerFromRequest(req), sourceAccountId, scenarioId, requestId };
};
const getTargets = platform => async (req,res,next) => {
 try {
  const args = input(req);
  const config = await (platform === 'FACEBOOK' ? settings.getFacebookNurtureSettings(args.owner) : settings.getInstagramNurtureSettings(args.owner));
  const scenario = config.scenarios.find(row => row.id === args.scenarioId);
  if (!scenario) throw Object.assign(new Error('Không tìm thấy kịch bản của user.'),{statusCode:404});
  let batch;
  if (platform === 'INSTAGRAM') batch = await allocateInstagramTargets({ ...args, scenario, requestedCount: req.body.count });
  else batch = await allocateFriendSuggestions({ owner: args.owner, sourceAccount: {id: args.sourceAccountId}, runId: args.requestId, action: scenario.actions.friend_request });
  return success(res, batch, 'Đã cấp target tương tác chéo');
 } catch(err) { next(err); }
};
const reportTargets = platform => async (req,res,next) => {
 try { const args=input(req); if(req.body.request_id === undefined) throw fail('Report cần request_id của batch đã cấp.'); return success(res, await markTargets({ ...args, platform, results: req.body.results }), 'Đã ghi nhận kết quả target'); } catch(err) { next(err); }
};
module.exports = { getTargets, reportTargets };
