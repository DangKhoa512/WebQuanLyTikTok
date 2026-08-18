const { error } = require('../utils/response');
const logger = require('../config/logger');
const User = require('../models/User');
const { normalizeOwner } = require('../utils/owner');

/**
 * API Key authentication for phone/AutoTouch endpoints.
 * Phone sends username as API key, for example: x-api-key: admin
 */
const apiKeyAuth = async (req, res, next) => {
  const username = normalizeOwner(req.headers['x-api-key']);

  if (!username) {
    logger.warn('API key missing', { ip: req.ip, path: req.path });
    return error(res, 'Thieu API key. Them header: x-api-key la tai khoan user', 401);
  }

  const user = await User.findOne({ where: { username, is_active: true }, raw: true });
  if (!user) {
    logger.warn('Invalid user API key attempt', { ip: req.ip, path: req.path, username });
    return error(res, 'API key khong hop le', 401);
  }

  req.api_owner_username = username;
  return next();
};

module.exports = apiKeyAuth;
