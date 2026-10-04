const express = require('express');
const controller = require('../controllers/dashboardController');

const router = express.Router();
router.get('/summary', controller.summary);

module.exports = router;
