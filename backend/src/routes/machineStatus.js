const express = require('express');
const controller = require('../controllers/machineStatusController');
const jwtAuth = require('../middleware/jwtAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();
router.post('/report', apiKeyAuth, controller.report);
router.get('/stats', jwtAuth, controller.stats);

module.exports = router;