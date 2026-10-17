const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { httpsOnly } = require('../services/deviceManagerSecurity');
const controller = require('../controllers/regProxyController');

const router = express.Router();
router.use(apiKeyAuth, httpsOnly);
router.post('/allocate', controller.allocate);
router.post('/release', controller.release);

module.exports = router;
