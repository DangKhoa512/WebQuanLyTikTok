const express = require('express');
const controller = require('../controllers/facebookController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

router.post('/import-api', apiKeyAuth, controller.importFromApi);
router.post('/reg/report', apiKeyAuth, controller.reportRegOnly);
router.post('/job/get-account', apiKeyAuth, controller.getJobForPhone);
router.post('/job/get-login-success-account', apiKeyAuth, controller.getLoginSuccessJobForPhone);
router.post('/job/report', apiKeyAuth, controller.report);
router.post('/job/page-report', apiKeyAuth, controller.reportPageJob);
router.post('/job/add-job', apiKeyAuth, controller.addFacebookJobCount);
router.post('/reg-page/get-account', apiKeyAuth, controller.getRegPageAccount);
router.post('/reg-page/report', apiKeyAuth, controller.reportRegPage);
router.post('/nurture/get-account', apiKeyAuth, controller.getNurtureAccount);
router.post('/nurture/report', apiKeyAuth, controller.reportNurtureAccount);
router.post('/check-page-token', apiKeyAuth, controller.checkPageToken);
router.get('/reg-page/stats', jwtAuth, controller.getRegPageStats);
router.get('/trash', jwtAuth, controller.listTrash);
router.post('/trash/restore', jwtAuth, controller.restoreTrash);
router.post('/trash/delete', jwtAuth, controller.deleteTrash);
router.get('/nurture/accounts', jwtAuth, controller.listNurtureAccounts);
router.get('/nurture/logs', jwtAuth, controller.listNurtureLogs);
router.post('/nurture/reset', jwtAuth, controller.resetNurtureAccounts);

router.get('/', jwtAuth, controller.list);
router.get('/:accountId/pages', jwtAuth, controller.getAccountPages);
router.post('/import', jwtAuth, controller.importFromDashboard);
router.post('/check-live', jwtAuth, controller.checkLive);
router.post('/check-pages', jwtAuth, controller.checkPages);
router.post('/pages/reset', jwtAuth, controller.resetPageJobs);
router.post('/bulk-get', jwtAuth, controller.bulkGet);
router.post('/bulk-sync-to-job', jwtAuth, controller.bulkSyncRegToJob);
router.post('/bulk-move-group', jwtAuth, controller.bulkMoveGroup);
router.post('/bulk-action', jwtAuth, controller.bulkAction);
router.post('/bulk-delete', jwtAuth, controller.bulkDelete);

module.exports = router;
