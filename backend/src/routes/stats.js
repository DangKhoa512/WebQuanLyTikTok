const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/statsController');

// NOTE: /daily must be registered before any :param route
router.get('/job/daily', ctrl.getJobDailyStats);
router.get('/job/devices', ctrl.getJobDeviceStats);
router.get('/job', ctrl.getJobStats);
router.get('/daily', ctrl.getDailyStats);
router.get('/devices', ctrl.getDeviceStats);
router.get('/',      ctrl.getStats);

module.exports = router;
