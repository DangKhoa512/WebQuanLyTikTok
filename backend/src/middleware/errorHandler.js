const logger = require('../config/logger');
const { error } = require('../utils/response');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', { name: err.name, type: err.type, method: req.method });

  if (err.type === 'entity.parse.failed') return error(res, 'Invalid JSON payload', 400);
  if (err.type === 'entity.too.large') return error(res, 'Payload too large', 413);

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    return error(res, err.errors.map((e) => e.message).join(', '), 400);
  }

  // Duplicate entry
  if (err.name === 'SequelizeUniqueConstraintError') {
    return error(res, 'Dữ liệu đã tồn tại (duplicate)', 409);
  }

  // Custom statusCode attached to error
  const statusCode = err.statusCode || 500;
  return error(res, statusCode >= 500 ? 'Internal Server Error' : (err.message || 'Request failed'), statusCode);
};

/**
 * 404 handler — must be AFTER all routes
 */
const notFound = (req, res, next) => {
  return error(res, `Route ${req.method} ${req.path} không tồn tại`, 404);
};

module.exports = { errorHandler, notFound };
