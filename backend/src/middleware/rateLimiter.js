const rateLimit = require('express-rate-limit');
const { error } = require('../utils/response');

const makeHandler = (message) => (req, res) => error(res, message, 429);

/**
 * General API rate limit: 120 req / min
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Quá nhiều request, vui lòng thử lại sau 1 phút'),
});

/**
 * Registration endpoint: 60 req / min per IP
 */
const regLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: makeHandler('Quá nhiều request đăng ký, vui lòng thử lại sau'),
});

module.exports = { apiLimiter, regLimiter };
