const {ownerFromRequest}=require('../utils/owner');
const logger=require('../config/logger');
const {createMailService}=require('../services/mailService');
const errors=new Set(['INVALID_INPUT','INVALID_PROVIDER','INVALID_SERVICE','INVALID_MAILBOX','INVALID_EMAIL_TYPE','INVALID_RANDOM_COUNT','EMAILTICK_CONFIG_ERROR','EMAILTICK_ERROR','EMAILTICK_TEMPORARY_ERROR','EMAILTICK_CLOUDFLARE_CHALLENGE','EMAILTICK_INVALID_RESPONSE','GHOSTINBOX_CONFIG_ERROR','GHOSTINBOX_ERROR','GHOSTINBOX_TEMPORARY_ERROR','GHOSTINBOX_INVALID_RESPONSE','GHOSTINBOX_ACCESS_CHALLENGE','GHOSTINBOX_SESSION_EXPIRED','GHOSTINBOX_MAILBOX_EXPIRED','GHOSTINBOX_RATE_LIMITED']);
const makeController=(factory=()=>createMailService())=>{
 const execute=operation=>async(req,res)=>{
  const started=Date.now();
  try{
   let result;
   if(operation==='CREATE_MAILBOX'){
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).some(k=>!['provider','types','random_count'].includes(k)))throw Object.assign(Error('INVALID_INPUT'),{code:'INVALID_INPUT',statusCode:400});
    result=await factory().createMailbox(ownerFromRequest(req),req.body);
   }else{
    if(Object.keys(req.query).some(k=>!['mailbox_id','service','requested_at'].includes(k)))throw Object.assign(Error('INVALID_INPUT'),{code:'INVALID_INPUT',statusCode:400});
    result=await factory().getCode(ownerFromRequest(req),req.query.mailbox_id,{service:req.query.service,requestedAt:req.query.requested_at});
   }
   logger.info('Mail operation',{operation,status:result.status||'SUCCESS',...(result.provider?{provider:result.provider}:{}),duration_ms:Date.now()-started});
   return res.json({success:true,...result});
  }catch(error){
   const known=errors.has(error.code),code=known?error.code:'PROVIDER_ERROR';
   logger.warn('Mail operation',{operation,status:code,duration_ms:Date.now()-started});
   return res.status(known?error.statusCode||502:500).json({success:false,status:code,error:code});
  }
 };
 return {createMailbox:execute('CREATE_MAILBOX'),getCode:execute('GET_MESSAGES')};
};
module.exports={makeController,...makeController()};
