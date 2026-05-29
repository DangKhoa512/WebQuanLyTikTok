const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/exportController');
const jwtAuth    = require('../middleware/jwtAuth');

// Tất cả export đều cần JWT
router.get('/accounts', jwtAuth, ctrl.exportAccounts);
router.get('/summary',  jwtAuth, ctrl.exportSummary);

module.exports = router;
