const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/accountController');
const bulkCtrl   = require('../controllers/bulkController');
const { importAccounts }                   = require('../controllers/importController');
const { checkLive, promoteEligible }       = require('../controllers/liveCheckController');
const { validate, schemas } = require('../middleware/validator');
const { regLimiter } = require('../middleware/rateLimiter');
const jwtAuth    = require('../middleware/jwtAuth');

// ── Phone API (no auth required) ──────────────────────────────────────────────
router.post('/reg-submit',      regLimiter, validate(schemas.regSubmit),   ctrl.regSubmit);
router.post('/get-upvideo',                 validate(schemas.getUpvideo),  ctrl.getUpvideo);
router.post('/upload-success',              validate(schemas.uploadSuccess),ctrl.uploadSuccess);
router.post('/upload-fail',                 validate(schemas.uploadFail),  ctrl.uploadFail);
router.post('/update-live',                 validate(schemas.updateLive),  ctrl.updateLive);
// Giống Chrome: kháng flow
router.post('/get-account',     ctrl.getAccount);      // lấy LOGIN_THANH_CONG để xử lý kháng
router.post('/phone-submit',    ctrl.phoneSubmit);     // báo DA_KHANG / CHUA_KHANG / về ACC_LOGIN
router.post('/get-can-upvideo', ctrl.getCanUpvideo);   // lấy DA_KHANG/CHUA_KHANG < 20 video
router.post('/report-upload',   ctrl.reportUpload);    // báo đã upload xong
router.post('/get-can-khang',   ctrl.getCanKhang);     // lấy CHUA_KHANG ≥ 20 video để kháng

// ── Dashboard Bulk API  (require JWT Bearer token) ────────────────────────────
router.post('/import',           jwtAuth, importAccounts);
router.post('/check-live',       jwtAuth, checkLive);
router.post('/promote-eligible', jwtAuth, promoteEligible);
router.post('/bulk-action',      jwtAuth, bulkCtrl.bulkAction);
router.post('/bulk-get',         jwtAuth, bulkCtrl.bulkGet);
router.post('/copy-unused',      jwtAuth, bulkCtrl.copyUnused);
router.post('/bulk-delete',      jwtAuth, bulkCtrl.bulkDelete);

// ── Dashboard API  (require JWT Bearer token) ──────────────────────────────────
router.get('/',    jwtAuth, ctrl.getAccounts);
router.get('/:id', jwtAuth, ctrl.getAccountById);
router.patch('/:id', jwtAuth, validate(schemas.updateAccount), ctrl.updateAccount);

module.exports = router;
