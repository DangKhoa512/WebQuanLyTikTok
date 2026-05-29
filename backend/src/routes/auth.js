const express      = require('express');
const router       = express.Router();
const authCtrl     = require('../controllers/authController');
const jwtAuth      = require('../middleware/jwtAuth');
const loginLimiter = require('../middleware/loginLimiter');

// Public
router.post('/login', loginLimiter, authCtrl.login);

// Protected — verify own token
router.get('/me', jwtAuth, authCtrl.me);

module.exports = router;
