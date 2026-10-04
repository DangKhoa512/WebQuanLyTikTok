const facebookController = require('../controllers/facebookController');
const instagramController = require('../controllers/instagramController');
const instagramFacebookRegController = require('../controllers/instagramFacebookRegController');

const acquireHandlers = {
  NUOI_FACEBOOK: facebookController.getNurtureAccount,
  NUOI_INSTAGRAM: instagramController.getNurtureAccount,
  REG_PAGE: facebookController.getRegPageAccount,
  REG_INSTAGRAM: instagramFacebookRegController.getAccount,
  PAGE_JOB: facebookController.getLoginSuccessJobForPhone,
  INSTAGRAM_JOB: instagramController.getLoginSuccess,
};

const reportHandlers = {
  NUOI_FACEBOOK: facebookController.reportNurtureAccount,
  NUOI_INSTAGRAM: instagramController.reportNurtureAccount,
  REG_PAGE: facebookController.reportRegPage,
  REG_INSTAGRAM: instagramFacebookRegController.report,
  PAGE_JOB: facebookController.reportPageJob,
  INSTAGRAM_JOB: instagramController.report,
};

const invokeController = (handler, req, body = {}) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (value, isError = false) => {
    if (settled) return;
    settled = true;
    if (isError) reject(value);
    else resolve(value);
  };
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      finish({ statusCode: this.statusCode, payload });
      return payload;
    },
  };
  const innerRequest = {
    ...req,
    body: { ...(req.body || {}), ...body },
    query: { ...(req.query || {}) },
  };
  Promise.resolve(handler(innerRequest, response, (err) => finish(err, true)))
    .then(() => {
      if (!settled) finish(new Error('Legacy task handler did not return a response'), true);
    })
    .catch((err) => finish(err, true));
});

const acquireLegacyTask = (taskType, req, deviceId) => {
  const handler = acquireHandlers[taskType];
  if (!handler) throw new Error('Unsupported task type: ' + taskType);
  return invokeController(handler, req, { device_id: deviceId });
};

const reportLegacyTask = (taskType, req, body) => {
  const handler = reportHandlers[taskType];
  if (!handler) throw new Error('Unsupported task type: ' + taskType);
  return invokeController(handler, req, body);
};

const releaseLegacyRegInstagram = (req, body) => invokeController(
  instagramFacebookRegController.release,
  req,
  body
);

module.exports = { acquireLegacyTask, reportLegacyTask, releaseLegacyRegInstagram };
