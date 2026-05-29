const logger = require('../config/logger');
const { error } = require('../utils/response');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: req.body,
  });

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
  return error(res, err.message || 'Internal Server Error', statusCode);
};

/**
 * 404 handler — must be AFTER all routes
 */
const notFound = (req, res, next) => {
  return error(res, `Route ${req.method} ${req.path} không tồn tại`, 404);
};

module.exports = { errorHandler, notFound };
