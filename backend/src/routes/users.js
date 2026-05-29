const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');

router.get('/', ctrl.listUsers);
router.post('/', ctrl.createUser);
router.patch('/:id', ctrl.updateUser);

module.exports = router;
