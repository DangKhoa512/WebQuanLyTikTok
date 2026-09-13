const express = require('express');
const controller = require('../controllers/facebookController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

router.post('/import-api', apiKeyAuth, controller.importFromApi);
router.post('/job/get-account', apiKeyAuth, controller.getJobForPhone);
router.post('/job/get-login-success-account', apiKeyAuth, controller.getLoginSuccessJobForPhone);
router.post('/job/report', apiKeyAuth, controller.report);
router.post('/check-page-token', apiKeyAuth, controller.checkPageToken);

router.get('/', jwtAuth, controller.list);
router.post('/import', jwtAuth, controller.importFromDashboard);
router.post('/check-live', jwtAuth, controller.checkLive);
router.post('/check-pages', jwtAuth, controller.checkPages);
router.post('/bulk-get', jwtAuth, controller.bulkGet);
router.post('/bulk-move-group', jwtAuth, controller.bulkMoveGroup);
router.post('/bulk-action', jwtAuth, controller.bulkAction);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);

module.exports = router;
