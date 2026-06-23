const jwt    = require('jsonwebtoken');
const { error } = require('../utils/response');
const logger = require('../config/logger');
const { getJwtSecret } = require('../config/jwt');

/**
 * JWT authentication for dashboard API endpoints.
 * Frontend must send header:  Authorization: Bearer <token>
 */
const jwtAuth = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return error(res, 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.', 401);
  }

  const token = auth.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 401);
    }
    logger.warn('Invalid JWT token', { ip: req.ip, error: err.message });
    return error(res, 'Token không hợp lệ.', 401);
  }
};

module.exports = jwtAuth;
