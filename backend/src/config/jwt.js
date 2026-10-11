const logger = require('./logger');

const DEFAULT_JWT_SECRET = 'tiktok-manager-local-secret-change-me';

const getJwtSecret = () => {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production' && (!secret || secret === DEFAULT_JWT_SECRET)) throw new Error('JWT_SECRET must be configured in production');
  if (secret) return secret;
  logger.warn('JWT_SECRET is not set; using fallback secret. Set JWT_SECRET in production.');
  return DEFAULT_JWT_SECRET;
};

module.exports = { getJwtSecret };
