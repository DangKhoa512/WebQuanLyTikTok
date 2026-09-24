const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/machineApiConfigController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

router.get('/device/:device_id/facebook-nurture/random', apiKeyAuth, ctrl.getRandomNurtureScenario);
router.get('/device/:device_id/instagram-nurture/random', apiKeyAuth, ctrl.getRandomInstagramNurtureScenario);
router.get('/device/:device_id', apiKeyAuth, ctrl.getForDevice);

router.use(jwtAuth);
router.get('/', ctrl.listConfigs);
router.put('/', ctrl.saveConfigs);
router.post('/bulk-machines', ctrl.bulkCreateMachines);
router.post('/bulk-delete-machines', ctrl.bulkDeleteMachines);
router.post('/keys', ctrl.addConfigKey);
router.patch('/keys/:config_key', ctrl.renameConfigKey);
router.delete('/keys/:config_key', ctrl.deleteConfigKey);
router.delete('/:device_id', ctrl.deleteMachine);

module.exports = router;
