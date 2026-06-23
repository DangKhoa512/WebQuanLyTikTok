const logger = require('./logger');

const DEFAULT_JWT_SECRET = 'tiktok-manager-local-secret-change-me';

const getJwtSecret = () => {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret) return secret;
  logger.warn('JWT_SECRET is not set; using fallback secret. Set JWT_SECRET in production.');
  return DEFAULT_JWT_SECRET;
};

module.exports = { getJwtSecret };
