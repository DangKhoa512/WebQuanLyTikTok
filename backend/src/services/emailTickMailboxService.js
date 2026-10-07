const { randomUUID } = require('crypto');
const db=require('../config/database');
const {otpClaim}=require('./mailOtpService');
const Mailbox=require('../models/EmailTickMailbox');
const {createEmailTickService,providerError}=require('./emailTickService');
const invalid=code=>providerError(code,400);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createEmailTickMailboxService=({provider=createEmailTickService(),now=()=>Date.now()}={})=>({
 async createMailbox(owner,input,randomCount){
  const types=provider.resolveTypes(input,randomCount),mailbox_id=randomUUID();
  const mailbox=await provider.createMailbox(types);
  try {await provider.activateMailbox(mailbox.email,mailbox.mailboxCode);}catch(err){
   // Keep a server-only error record; an activation failure never yields a successful mailbox.
   await Mailbox.create({owner_username:owner,mailbox_id,email:mailbox.email,mailbox_code:mailbox.mailboxCode,types,status:'ERROR'},{logging:false});
   throw err;
  }
  await Mailbox.create({owner_username:owner,mailbox_id,email:mailbox.email,mailbox_code:mailbox.mailboxCode,types,status:'ACTIVE'},{logging:false});
  return {mailbox_id,email:mailbox.email,types};
 },
 async getCode(owner,mailboxId,{provider:sender='instagram',requestedAt}={}){
  if(typeof mailboxId!=='string'||!UUID.test(mailboxId))throw invalid('INVALID_MAILBOX');
  if(!['instagram','facebook','generic'].includes(sender))throw invalid('INVALID_PROVIDER');
  let since=0;
  if(requestedAt!==undefined){if(typeof requestedAt!=='string' || !/^\d+$/.test(requestedAt))throw invalid('INVALID_INPUT');since=Number(requestedAt);if(!Number.isSafeInteger(since)||since<1||since>Math.floor(now()/1000)+5)throw invalid('INVALID_INPUT');}
  const where={owner_username:owner,mailbox_id:mailboxId};
  const mailbox=await Mailbox.unscoped().findOne({where,logging:false});
  if(!mailbox||mailbox.status!=='ACTIVE')throw providerError('INVALID_MAILBOX',404);
  let emails;
  try { emails=await provider.getEmails(mailbox.email,mailbox.mailbox_code); }
  catch(err){ if(err.code==='INVALID_MAILBOX')await mailbox.update({status:'EXPIRED'},{logging:false});throw err; }
  return db.transaction({logging:false},async transaction=>{
   const current=await Mailbox.unscoped().findOne({where,transaction,lock:transaction.LOCK.UPDATE,logging:false});
   if(!current||current.status!=='ACTIVE')throw providerError('INVALID_MAILBOX',404);
   const claim=otpClaim(current,emails,provider.extractOtp,{provider:sender,minimumTime:since,nowSeconds:Math.floor(now()/1000)});
   if(claim.changes)await current.update(claim.changes,{transaction,logging:false});
   return claim.response;
  });
 }
});
module.exports={createEmailTickMailboxService};
