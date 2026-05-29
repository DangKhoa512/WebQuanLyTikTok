const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { success, error } = require('../utils/response');

const requireAdmin = (req, res) => {
  if (req.admin?.role === 'admin') return true;
  error(res, 'Chỉ admin được phép quản lý user', 403);
  return false;
};

const listUsers = async (req, res, next) => {
  if (!requireAdmin(req, res)) return;
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'is_active', 'created_at', 'updated_at'],
      order: [['id', 'ASC']],
    });
    return success(res, { users }, 'OK');
  } catch (err) { next(err); }
};

const createUser = async (req, res, next) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username || !password) return error(res, 'Thiếu username hoặc password', 400);
    if (!['admin', 'user'].includes(role)) return error(res, 'role không hợp lệ', 400);

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim(), password_hash, role });
    return success(
      res,
      { user: { id: user.id, username: user.username, role: user.role, is_active: user.is_active } },
      'Tạo user thành công',
      201
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return error(res, 'Username đã tồn tại', 409);
    }
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  if (!requireAdmin(req, res)) return;
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return error(res, 'User không tồn tại', 404);

    const updates = {};
    if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 10);
    if (req.body.role && ['admin', 'user'].includes(req.body.role)) updates.role = req.body.role;
    if (req.body.is_active !== undefined) updates.is_active = !!req.body.is_active;

    await user.update(updates);
    return success(res, {
      user: { id: user.id, username: user.username, role: user.role, is_active: user.is_active },
    }, 'Cập nhật user thành công');
  } catch (err) { next(err); }
};

module.exports = { listUsers, createUser, updateUser };
