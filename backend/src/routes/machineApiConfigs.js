const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/machineApiConfigController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

router.get('/device/:device_id', apiKeyAuth, ctrl.getForDevice);

router.use(jwtAuth);
router.get('/', ctrl.listConfigs);
router.put('/', ctrl.saveConfigs);
router.delete('/:device_id', ctrl.deleteMachine);

module.exports = router;
