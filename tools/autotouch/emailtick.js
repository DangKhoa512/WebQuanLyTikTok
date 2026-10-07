// AutoTouch JS: use VPS config + exec/safeParse already used by the tool.
function installEmailTick(API, options) {
 options=options||{};
 const parse=options.safeParse||function(text){try{return JSON.parse(text);}catch(_){return null;}};
 const quote=function(value){return "'"+String(value).replace(/'/g,"'\"'\"'")+"'";};
 const request=function(path,body,timeoutSeconds){
  try {
   const base=String(options.getBaseUrl()||'').replace(/\/+$/,'').replace(/\/api$/i,'');
   const key=String(options.getApiKey()||'').trim();
   if(!new RegExp('^'+(options.allowHttp?'https?':'https')+'://[^\\s?#]+$').test(base)||!key||/[\r\n]/.test(key)||typeof options.exec!=='function')return null;
   const command='curl -s --connect-timeout 10 --max-time '+timeoutSeconds+' --proto '+quote(options.allowHttp?'=http,https':'=https')
    +' -X '+(body===undefined?'GET':'POST')+' '+quote(base+'/api/emailtick'+path)
    +' -H '+quote('x-api-key: '+key)+(body===undefined?'':' -H '+quote('Content-Type: application/json')+' --data '+quote(JSON.stringify(body)));
   const raw=options.exec(command);return typeof raw==='string'?parse(raw):null;
  }catch(_){return null;}
 };
 API._EmailTick_New=function(types,randomCount){
  const body={types:types};if(randomCount!==undefined)body.random_count=randomCount;
  const result=request('/new',body,120);
  return result&&result.success===true&&typeof result.mailbox_id==='string'&&typeof result.email==='string'?{mailbox_id:result.mailbox_id,email:result.email,types:result.types}:0;
 };
 API._EmailTick_GetCode=function(mailboxId,provider){
  if(typeof mailboxId!=='string'||!mailboxId||typeof options.sleep!=='function')return 0;
  provider=provider||'instagram';
  const started=Date.now(),maxWaitMs=60000;
  for(let attempt=0;attempt<12;attempt++){
   const remaining=maxWaitMs-(Date.now()-started);if(remaining<=0)return 0;
   const result=request('/code?mailbox_id='+encodeURIComponent(mailboxId)+'&provider='+encodeURIComponent(provider),undefined,Math.max(1,Math.ceil(remaining/1000)));
   if(!result||result.success!==true)return 0;
   if(result.status==='RECEIVED')return typeof result.code==='string'&&/^\d{6}$/.test(result.code)?result.code:0;
   if(result.status!=='WAITING')return 0;
   if(attempt<11 && maxWaitMs-(Date.now()-started)>5000)options.sleep(5);else return 0;
  }
  return 0;
 };
 return API;
}
if(typeof module!=='undefined'&&module.exports)module.exports=installEmailTick;
