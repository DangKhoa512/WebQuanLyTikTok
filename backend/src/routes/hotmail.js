const express = require('express');
const controller = require('../controllers/hotmailController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

router.post('/get', apiKeyAuth, controller.getForPhone);
router.post('/report-used', apiKeyAuth, controller.reportUsed);

router.get('/', jwtAuth, controller.list);
router.post('/import', jwtAuth, controller.importFromDashboard);
router.post('/bulk-get', jwtAuth, controller.bulkGet);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);

module.exports = router;
