const {randomUUID}=require('crypto');
const db=require('../config/database');
const GhostMailbox=require('../models/GhostInboxMailbox');
const {createGhostInboxProvider,failure}=require('./mailProviders/GhostInboxProvider');
const {createEmailTickMailboxService}=require('./emailTickMailboxService');
const {otpClaim}=require('./mailOtpService');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const services=new Set(['INSTAGRAM','FACEBOOK','GENERIC']);
const createMailService=({ghostFactory=()=>createGhostInboxProvider(),emailTickFactory=()=>createEmailTickMailboxService(),now=()=>Date.now()}={})=>({
 async createMailbox(owner,options){
  if(!['EMAILTICK','GHOSTINBOX'].includes(options.provider))throw failure('INVALID_PROVIDER',400);
  if(options.provider==='EMAILTICK')return {provider:'EMAILTICK',...await emailTickFactory().createMailbox(owner,options.types===undefined?'random':options.types,options.random_count)};
  if(options.types!==undefined||options.random_count!==undefined)throw failure('INVALID_INPUT',400);
  const p=ghostFactory(),mail=await p.createMailbox(),mailbox_id=randomUUID();
  await GhostMailbox.create({mailbox_id,owner_username:owner,email:mail.email,provider_state:mail.providerState},{logging:false});
  return {provider:'GHOSTINBOX',mailbox_id,email:mail.email};
 },
 async getCode(owner,mailboxId,{service='INSTAGRAM',requestedAt}={}){
  if(typeof mailboxId!=='string'||!UUID.test(mailboxId))throw failure('INVALID_MAILBOX',400);
  if(!services.has(service))throw failure('INVALID_SERVICE',400);
  let since=0;if(requestedAt!==undefined){if(typeof requestedAt!=='string'||!/^\d+$/.test(requestedAt))throw failure('INVALID_INPUT',400);since=Number(requestedAt);if(!Number.isSafeInteger(since)||since<1||since>Math.floor(now()/1000)+5)throw failure('INVALID_INPUT',400);}
  const where={owner_username:owner,mailbox_id:mailboxId};
  const exists=await GhostMailbox.findOne({where,attributes:['id'],logging:false});
  if(!exists)return emailTickFactory().getCode(owner,mailboxId,{provider:service.toLowerCase(),requestedAt});
  const provider=ghostFactory();
  // Serialize session/snapshot updates and OTP claims for this mailbox only.
  const result=await db.transaction({logging:false},async transaction=>{
   const current=await GhostMailbox.unscoped().findOne({where,transaction,lock:transaction.LOCK.UPDATE,logging:false});
   if(!current||current.status!=='ACTIVE')throw failure('INVALID_MAILBOX',404);
   const state=JSON.parse(JSON.stringify(current.provider_state));
   try{
    const messages=await provider.getMessages({email:current.email,providerState:state});
    const claim=otpClaim(current,messages,provider.extractOtp,{service,minimumTime:since,nowSeconds:Math.floor(now()/1000),retainAllProcessed:true});
    await current.update({provider_state:state,...(claim.changes||{})},{transaction,logging:false});
    return {response:claim.response};
   }catch(error){
    await current.update({provider_state:state,...(['GHOSTINBOX_SESSION_EXPIRED','GHOSTINBOX_MAILBOX_EXPIRED'].includes(error.code)?{status:'EXPIRED'}:{})},{transaction,logging:false});
    return {error};
   }
  });
  if(result.error)throw result.error;return result.response;
 }
});
module.exports={createMailService};
