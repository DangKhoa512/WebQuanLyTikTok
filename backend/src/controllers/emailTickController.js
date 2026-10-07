const {ownerFromRequest}=require('../utils/owner');
const logger=require('../config/logger');
const {createEmailTickMailboxService}=require('../services/emailTickMailboxService');
const allowedErrors=new Set(['INVALID_EMAIL_TYPE','INVALID_RANDOM_COUNT','INVALID_INPUT','INVALID_PROVIDER','INVALID_MAILBOX','EMAILTICK_CONFIG_ERROR','EMAILTICK_ERROR','EMAILTICK_TEMPORARY_ERROR','EMAILTICK_CLOUDFLARE_CHALLENGE','EMAILTICK_INVALID_RESPONSE']);
const makeController=(serviceFactory=()=>createEmailTickMailboxService())=>{
 const execute=operation=>async(req,res)=>{
  const started=Date.now();let mailboxId;
  try {
   let value;
   if(operation==='CREATE_MAILBOX'){
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).some(key=>!['types','random_count'].includes(key)))throw Object.assign(new Error('INVALID_INPUT'),{code:'INVALID_INPUT',statusCode:400});
    value=await serviceFactory().createMailbox(ownerFromRequest(req),req.body.types,req.body.random_count);mailboxId=value.mailbox_id;
   }else{
    if(Object.keys(req.query).some(key=>!['mailbox_id','provider','requested_at'].includes(key)))throw Object.assign(new Error('INVALID_INPUT'),{code:'INVALID_INPUT',statusCode:400});
    mailboxId=req.query.mailbox_id;
    value=await serviceFactory().getCode(ownerFromRequest(req),mailboxId,{provider:req.query.provider,requestedAt:req.query.requested_at});
   }
   logger.info('EmailTick operation',{provider:'EMAILTICK',operation,duration_ms:Date.now()-started,status:value.status||'SUCCESS',...(operation==='CREATE_MAILBOX'?{types:value.types}:{}),mailbox_id:mailboxId});
   return res.json({success:true,...value});
  }catch(err){
   const code=allowedErrors.has(err.code)?err.code:'EMAILTICK_ERROR';
   const statusCode=allowedErrors.has(err.code)?err.statusCode||502:500;
   logger.warn('EmailTick operation',{provider:'EMAILTICK',operation,duration_ms:Date.now()-started,status:code});
   return res.status(statusCode).json({success:false,status:code,error:code});
  }
 };
 return{createMailbox:execute('CREATE_MAILBOX'),getCode:execute('GET_EMAILS')};
};
module.exports={...makeController(),makeController};
