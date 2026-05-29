const { error } = require('../utils/response');
const logger    = require('../config/logger');

/**
 * API Key authentication for phone/AutoTouch endpoints.
 * Phone must send header:  x-api-key: <API_KEY from .env>
 */
const apiKeyAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];

  if (!key) {
    logger.warn('API key missing', { ip: req.ip, path: req.path });
    return error(res, 'Thiếu API key. Thêm header: x-api-key', 401);
  }

  if (key !== process.env.API_KEY) {
    logger.warn('Invalid API key attempt', { ip: req.ip, path: req.path });
    return error(res, 'API key không hợp lệ', 401);
  }

  next();
};

module.exports = apiKeyAuth;
