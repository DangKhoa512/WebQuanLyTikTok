// Load emailtick.js first when these files are included directly in AutoTouch.
function installMail(API,options){
 const factory=typeof createMailClient==='function'?createMailClient:require('./emailtick').createMailClient;
 const client=factory(Object.assign({},options||{},{apiPath:'/api/mail',serviceParam:'service'}));
 const providers={};
 API._Mail_New=function(provider,types,randomCount){
  const body={provider:provider};if(types!==undefined)body.types=types;if(randomCount!==undefined)body.random_count=randomCount;
  const r=client.newMailbox(body);if(!r)return 0;providers[r.mailbox_id]=r.provider;
  return {provider:r.provider,mailbox_id:r.mailbox_id,email:r.email};
 };
 API._Mail_GetOTP=function(mailboxId,service){return client.pollCode(mailboxId,service||'INSTAGRAM',providers[mailboxId]==='EMAILTICK'?5:10);};
 return API;
}
if(typeof module!=='undefined'&&module.exports)module.exports=installMail;
