const jwt    = require('jsonwebtoken');
const { success, error } = require('../utils/response');
const logger = require('../config/logger');

const JWT_EXPIRES = '24h';

/**
 * POST /api/auth/login
 * Validates admin credentials from .env (ADMIN_USER / ADMIN_PASS).
 * Returns a signed JWT on success.
 */
const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, 'Vui lòng nhập tên đăng nhập và mật khẩu.', 400);
  }

  // Compare against .env values (simple single-admin setup)
  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    logger.error('ADMIN_USER or ADMIN_PASS not set in environment!');
    return error(res, 'Server chưa cấu hình admin.', 500);
  }

  if (username !== validUser || password !== validPass) {
    logger.warn('Failed login attempt', { username, ip: req.ip });
    return error(res, 'Tên đăng nhập hoặc mật khẩu không đúng.', 401);
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  logger.info('Admin logged in', { username, ip: req.ip });

  return success(
    res,
    { token, expiresIn: JWT_EXPIRES, username },
    'Đăng nhập thành công'
  );
};

/**
 * GET /api/auth/me  (requires JWT)
 */
const me = (req, res) => {
  return success(res, { admin: req.admin }, 'OK');
};

module.exports = { login, me };
