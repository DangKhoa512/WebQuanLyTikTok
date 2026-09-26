const express = require('express');
const controller = require('../controllers/emailOtpController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

router.post('/report', apiKeyAuth, controller.reportFromPhone);
router.post('/get', apiKeyAuth, controller.getForPhone);
router.post('/report-done', apiKeyAuth, controller.reportDone);

router.get('/', jwtAuth, controller.list);
router.post('/', jwtAuth, controller.createFromDashboard);
router.post('/bulk-status', jwtAuth, controller.bulkStatus);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);

module.exports = router;