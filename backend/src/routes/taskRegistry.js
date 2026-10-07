const router=require('express').Router();
const c=require('../controllers/taskRegistryController');
router.use(c.authenticate);
router.get('/',c.list);router.put('/mine',c.mine);router.put('/order',c.order);
router.post('/',c.admin,c.create);

router.patch('/:id',c.admin,c.update);router.post('/:id/archive',c.admin,c.archive);
module.exports=router;
