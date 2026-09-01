const express = require('express');
const controller = require('../controllers/jobController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

// Phone API
router.post('/get-account', controller.getForPhone);
router.post('/login-success', controller.loginSuccess);
router.post('/login-fail', controller.loginFail);
router.post('/add-job', controller.addJobCount);
router.post('/report', controller.reportResult);
router.post('/import-api', apiKeyAuth, controller.importAccountsApi);

// Dashboard API
router.post('/import', jwtAuth, controller.importAccounts);
router.post('/check-live', jwtAuth, controller.checkLive);
router.post('/bulk-get', jwtAuth, controller.bulkGet);
router.post('/bulk-action', jwtAuth, controller.bulkAction);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);
router.get('/', jwtAuth, controller.getAll);

module.exports = router;
