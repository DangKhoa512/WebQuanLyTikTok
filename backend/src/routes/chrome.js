const apiKeyAuth = require('../middleware/apiKeyAuth');
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chromeController');
const jwtAuth = require('../middleware/jwtAuth');

// ── Phone API (no auth required) ─────────────────────────────────────────────
router.post('/phone-submit', apiKeyAuth,    ctrl.phoneSubmit);
router.post('/get-cho-login', apiKeyAuth,   ctrl.getChoLogin);    // lấy acc Chờ Login
router.post('/login-success', apiKeyAuth,   ctrl.loginSuccess);   // báo login thành công
router.post('/get-account', apiKeyAuth,     ctrl.getAccount);     // lấy acc Login Thành Công → xử lý kháng
router.post('/get-can-upvideo', apiKeyAuth, ctrl.getCanUpvideo);  // lấy acc DA_KHANG/CHUA_KHANG chưa đủ video theo cài đặt
router.post('/report-upload', apiKeyAuth,   ctrl.reportUpload);   // báo đã upload video xong
router.post('/get-can-khang', apiKeyAuth,   ctrl.getCanKhang);    // lấy acc CHUA_KHANG > 10 video để kháng

// ── Dashboard API (JWT) ───────────────────────────────────────────────────────
router.post('/import',           jwtAuth, ctrl.importChromeAccounts);
router.post('/check-live',       jwtAuth, ctrl.checkLive);
router.post('/promote-eligible', jwtAuth, ctrl.promoteEligible);
router.post('/bulk-action',      jwtAuth, ctrl.bulkAction);
router.post('/bulk-get',         jwtAuth, ctrl.bulkGet);
router.post('/bulk-delete',      jwtAuth, ctrl.bulkDelete);

router.get('/khang-daily-logs', jwtAuth, ctrl.getKhangDailyLogs);
router.get('/',    jwtAuth, ctrl.getAll);
router.get('/:id', jwtAuth, ctrl.getById);
router.patch('/:id', jwtAuth, ctrl.updateAccount);

module.exports = router;
