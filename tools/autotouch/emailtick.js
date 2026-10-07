// Shared mail transport/polling; this file remains standalone for existing AutoTouch callers.
function createMailClient(options) {
 options=options||{};
 const parse=options.safeParse||function(text){try{return JSON.parse(text);}catch(_){return null;}};
 const quote=function(value){return "'"+String(value).replace(/'/g,"'\"'\"'")+"'";};
 const request=function(path,body,timeoutSeconds){
  try{
   const base=String(options.getBaseUrl()||'').replace(/\/+$/,'').replace(/\/api$/i,'');
   const key=String(options.getApiKey()||'').trim();
   if(!new RegExp('^'+(options.allowHttp?'https?':'https')+'://[^\\s?#]+$').test(base)||!key||/[\r\n]/.test(key)||typeof options.exec!=='function')return null;
   const command='curl -s --connect-timeout 10 --max-time '+timeoutSeconds+' --proto '+quote(options.allowHttp?'=http,https':'=https')
    +' -X '+(body===undefined?'GET':'POST')+' '+quote(base+options.apiPath+path)
    +' -H '+quote('x-api-key: '+key)+(body===undefined?'':' -H '+quote('Content-Type: application/json')+' --data '+quote(JSON.stringify(body)));
   const raw=options.exec(command);return typeof raw==='string'?parse(raw):null;
  }catch(_){return null;}
 };
 return {
  newMailbox:function(body){const r=request('/new',body,body.provider==='GHOSTINBOX'?240:120);return r&&r.success===true&&typeof r.mailbox_id==='string'&&typeof r.email==='string'?r:0;},
  pollCode:function(mailboxId,service,interval){
   if(typeof mailboxId!=='string'||!mailboxId||typeof options.sleep!=='function')return 0;
   const started=Date.now(),maxWaitMs=60000,maxAttempts=Math.ceil(60/interval);
   for(let attempt=0;attempt<maxAttempts;attempt++){
    const remaining=maxWaitMs-(Date.now()-started);if(remaining<=0)return 0;
    const r=request('/code?mailbox_id='+encodeURIComponent(mailboxId)+'&'+options.serviceParam+'='+encodeURIComponent(service),undefined,Math.max(1,Math.ceil(remaining/1000)));
    if(!r||r.success!==true)return 0;
    if(r.status==='RECEIVED')return typeof r.code==='string'&&/^\d{6}$/.test(r.code)?r.code:0;
    if(r.status!=='WAITING')return 0;
    if(attempt<maxAttempts-1&&maxWaitMs-(Date.now()-started)>interval*1000)options.sleep(interval);else return 0;
   }
   return 0;
  }
 };
}


function installEmailTick(API,options){
 const factory=createMailClient;
 const config=Object.assign({},options||{},{apiPath:'/api/emailtick',serviceParam:'provider'});
 const client=factory(config);
 API._EmailTick_New=function(types,randomCount){const body={types:types};if(randomCount!==undefined)body.random_count=randomCount;const r=client.newMailbox(body);return r?{mailbox_id:r.mailbox_id,email:r.email,types:r.types}:0;};
 API._EmailTick_GetCode=function(mailboxId,provider){return client.pollCode(mailboxId,provider||'instagram',5);};
 return API;
}
if(typeof module!=='undefined'&&module.exports){module.exports=installEmailTick;module.exports.createMailClient=createMailClient;}
