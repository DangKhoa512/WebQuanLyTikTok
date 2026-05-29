const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/statsController');

// NOTE: /daily must be registered before any :param route
router.get('/daily', ctrl.getDailyStats);
router.get('/',      ctrl.getStats);

module.exports = router;
