const express = require('express');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

router.get('/eligibility', ctrl.getEligibility);
router.put('/eligibility', ctrl.updateEligibility);
router.get('/chrome-khang-limit', ctrl.getChromeKhangLimit);
router.put('/chrome-khang-limit', ctrl.updateChromeKhangLimit);

module.exports = router;
