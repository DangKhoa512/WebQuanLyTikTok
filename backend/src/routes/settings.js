const express = require('express');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

router.get('/eligibility', ctrl.getEligibility);
router.put('/eligibility', ctrl.updateEligibility);

module.exports = router;
