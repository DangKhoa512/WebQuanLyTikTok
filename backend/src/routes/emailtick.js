const express=require('express');
const apiKeyAuth=require('../middleware/apiKeyAuth');
const {apiLimiter}=require('../middleware/rateLimiter');
const controller=require('../controllers/emailTickController');
const router=express.Router();
// Isolated route parsing/logging to keep mailbox credentials and provider payloads out of common error logs.
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(apiLimiter,(req,res,next)=>Promise.resolve(apiKeyAuth(req,res,next)).catch(next));
router.post('/new',express.json({limit:'2kb',strict:true}),controller.createMailbox);
router.get('/code',controller.getCode);
router.use((req,res)=>res.status(404).json({success:false,error:'NOT_FOUND'}));
router.use((err,req,res,next)=>res.status(err.type==='entity.too.large'?413:err.type==='entity.parse.failed'?400:500).json({success:false,error:err.type==='entity.too.large'?'PAYLOAD_TOO_LARGE':err.type==='entity.parse.failed'?'INVALID_INPUT':'EMAILTICK_ERROR'}));
module.exports=router;
