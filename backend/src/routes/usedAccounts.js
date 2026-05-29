const express = require('express');
const ctrl = require('../controllers/usedAccountController');

const router = express.Router();

router.get('/', ctrl.listUsedAccounts);
router.post('/bulk-delete', ctrl.bulkDeleteUsedAccounts);

module.exports = router;
