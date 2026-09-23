const express = require('express');
const controller = require('../controllers/instagramController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const router = express.Router();

router.post('/import-api', apiKeyAuth, controller.importApi);
router.post('/reg/report', apiKeyAuth, controller.reportRegOnly);
router.post('/job/get-account', apiKeyAuth, controller.getAccount);
router.all('/job/device-account-count', apiKeyAuth, controller.checkDeviceAccountCount);
router.all('/job/check-limit', apiKeyAuth, controller.checkDeviceAccountCount);
router.post('/job/get-login-success-account', apiKeyAuth, controller.getLoginSuccess);
router.post('/job/report', apiKeyAuth, controller.report);
router.post('/job/add-job', apiKeyAuth, controller.addInstagramJobCount);
router.get('/trash', jwtAuth, controller.listTrash);
router.post('/trash/restore', jwtAuth, controller.restore);
router.post('/trash/delete', jwtAuth, controller.deleteTrash);
router.post('/check-live', jwtAuth, controller.checkLive);
router.get('/', jwtAuth, controller.list);
router.post('/import', jwtAuth, controller.importDashboard);
router.post('/bulk-get', jwtAuth, controller.bulkGet);
router.post('/bulk-sync-to-job', jwtAuth, controller.bulkSync);
router.post('/bulk-move-group', jwtAuth, controller.bulkMove);
router.post('/bulk-action', jwtAuth, controller.bulkAction);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);

module.exports = router;