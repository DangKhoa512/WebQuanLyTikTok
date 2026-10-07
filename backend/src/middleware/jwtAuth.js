const jwt    = require('jsonwebtoken');
const { error } = require('../utils/response');
const logger = require('../config/logger');
const { getJwtSecret } = require('../config/jwt');
const User=require('../models/User');
const {normalizeOwner}=require('../utils/owner');

/**
 * JWT authentication for dashboard API endpoints.
 * Frontend must send header:  Authorization: Bearer <token>
 */
const jwtAuth = async (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return error(res, 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.', 401);
  }

  const token = auth.slice(7); // strip "Bearer "

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 401);
    }
    logger.warn('Invalid JWT token', { ip: req.ip, error: err.message });
    return error(res, 'Token không hợp lệ.', 401);
  }
  // Resolve a real active tenant; malformed signed tokens must never fall back to admin/global scope.
  const id=Number(decoded?.id),username=normalizeOwner(decoded?.username);
  if(!Number.isSafeInteger(id)||id<=0||!username)return error(res,'Invalid authenticated user',401);
  try {
    const user=await User.findOne({where:{id,is_active:true},attributes:['id','username','role'],raw:true});
    if(!user||normalizeOwner(user.username)!==username)return error(res,'Invalid authenticated user',401);
    req.authenticatedUser=user;
    req.admin={...decoded,id:user.id,username:user.username,role:user.role};
    return next();
  } catch(err){return next(err);}

};

module.exports = jwtAuth;
