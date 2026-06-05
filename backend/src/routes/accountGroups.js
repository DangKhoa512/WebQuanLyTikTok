const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/accountGroupController');

router.get('/', ctrl.listGroups);
router.post('/', ctrl.createGroup);
router.patch('/:id', ctrl.updateGroup);
router.delete('/:id', ctrl.deleteGroup);

module.exports = router;
