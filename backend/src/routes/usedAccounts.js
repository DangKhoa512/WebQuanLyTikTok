const express = require('express');
const ctrl = require('../controllers/usedAccountController');

const router = express.Router();

router.get('/', ctrl.listUsedAccounts);

module.exports = router;
