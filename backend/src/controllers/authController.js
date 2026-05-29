const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { success, error } = require('../utils/response');
const logger = require('../config/logger');
const User   = require('../models/User');

const JWT_EXPIRES = '24h';

/**
 * POST /api/auth/login
 * Validates admin credentials from .env (ADMIN_USER / ADMIN_PASS).
 * Returns a signed JWT on success.
 */
const login = async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, 'Vui lòng nhập tên đăng nhập và mật khẩu.', 400);
  }

  try {
    const user = await User.findOne({ where: { username, is_active: true } });
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!ok) {
      logger.warn('Failed login attempt', { username, ip: req.ip });
      return error(res, 'Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    logger.info('User logged in', { username: user.username, role: user.role, ip: req.ip });

    return success(
      res,
      { token, expiresIn: JWT_EXPIRES, username: user.username, role: user.role },
      'Đăng nhập thành công'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me  (requires JWT)
 */
const me = (req, res) => {
  return success(res, { admin: req.admin }, 'OK');
};

module.exports = { login, me };
