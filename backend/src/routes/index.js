const express        = require('express');
const router         = express.Router();
const { apiLimiter } = require('../middleware/rateLimiter');
const jwtAuth        = require('../middleware/jwtAuth');

// Auth — no rate limit, has its own login limiter inside
router.use('/auth',     require('./auth'));

// Accounts (Loại 1) — mixed auth
router.use('/accounts', apiLimiter, require('./accounts'));

// Chrome Accounts (Loại 2) — mixed auth
router.use('/chrome-accounts', apiLimiter, require('./chrome'));

// Stats — JWT required for all
router.use('/stats',    apiLimiter, jwtAuth, require('./stats'));

// Users — admin JWT required inside controller
router.use('/users',    apiLimiter, jwtAuth, require('./users'));
router.use('/used-accounts', apiLimiter, jwtAuth, require('./usedAccounts'));

// Export — JWT required, no strict rate limit (file downloads)
router.use('/export',   require('./export'));

module.exports = router;
