const express = require('express');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

router.get('/eligibility', ctrl.getEligibility);
router.put('/eligibility', ctrl.updateEligibility);
router.get('/chrome-khang-limit', ctrl.getChromeKhangLimit);
router.put('/chrome-khang-limit', ctrl.updateChromeKhangLimit);
router.get('/chrome-khang-limits', ctrl.listChromeKhangLimits);
router.get('/facebook-login-limit', ctrl.getFacebookLoginLimit);
router.put('/facebook-login-limit', ctrl.updateFacebookLoginLimit);
router.get('/facebook-login-limits', ctrl.listFacebookLoginLimits);
router.get('/job-account-daily-limit', ctrl.getJobAccountDailyLimit);
router.put('/job-account-daily-limit', ctrl.updateJobAccountDailyLimit);
router.get('/job-account-daily-limits', ctrl.listJobAccountDailyLimits);
router.get('/machine-api-keys', ctrl.getMachineApiKeysSetting);
router.put('/machine-api-keys', ctrl.updateMachineApiKeysSetting);

module.exports = router;
