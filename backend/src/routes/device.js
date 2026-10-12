const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const jwtAuth = require('../middleware/jwtAuth');
const controller = require('../controllers/deviceController');

const router = express.Router();
router.post('/network/report', apiKeyAuth, require('../services/deviceManagerSecurity').httpsOnly, require('../middleware/deviceManagerReady'), (req,res,next)=>require('../controllers/deviceNetworkController')(req,res,next));
router.post('/heartbeat', apiKeyAuth, controller.heartbeat);
router.post('/next-task', apiKeyAuth, controller.nextTask);
router.post('/task/report', apiKeyAuth, controller.reportDeviceTask);
router.get('/capabilities/:device_id', jwtAuth, controller.getCapabilities);
router.put('/capabilities/:device_id', jwtAuth, controller.updateCapabilities);

module.exports = router;
