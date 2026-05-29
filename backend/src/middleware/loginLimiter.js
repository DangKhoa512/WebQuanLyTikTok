const rateLimit = require('express-rate-limit');
const { error }  = require('../utils/response');

/**
 * Strict rate limiter for login endpoint — prevents brute force.
 * Max 10 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    error(res, 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.', 429),
});

module.exports = loginLimiter;
