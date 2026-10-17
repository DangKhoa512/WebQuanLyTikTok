const service = require('../services/regProxyLeaseService');
const { ownerFromRequest } = require('../utils/owner');

const deviceId = (req) => req.body.device_id || req.body.device || req.body.phone || req.body.may;

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  status: error.code || 'PROXY_SERVICE_ERROR',
  error: error.code || 'PROXY_SERVICE_ERROR',
  ...(error.details || {}),
});

const allocate = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await service.allocate({
      owner: ownerFromRequest(req),
      deviceId: deviceId(req),
      taskId: req.body.task_id,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

const release = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await service.release({
      owner: ownerFromRequest(req),
      deviceId: deviceId(req),
      sessionId: req.body.session_id,
      token: req.body.session_token,
      result: req.body.result || req.body.status,
      reason: req.body.reason || req.body.error_code,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = { allocate, release };
