const axios=require('axios');
const {randomInt}=require('crypto');
const {selectOtp,parseTime}=require('./mailOtpService');
const {getEmailTickConfig,parseTypes,invalid}=require('../config/emailtick');
const {createProxySession}=require('./emailTickProxyTransport');
const EMAILTICK_USER_AGENTS=Object.freeze([
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
]);
const providerError=(code,statusCode=502)=>Object.assign(new Error(code),{code,statusCode,isEmailTickError:true});
const resolveTypes=(input,randomCount,config=getEmailTickConfig())=>{
 if(typeof input==='string' && input.trim().toLowerCase()==='random'){
  if(randomCount!==undefined && (!Number.isSafeInteger(randomCount)||randomCount<1))throw invalid('INVALID_RANDOM_COUNT');
  const pool=[...config.randomTypes],count=Math.min(randomCount ?? 1,pool.length);
  for(let i=0;i<count;i++){const selected=randomInt(i,pool.length);[pool[i],pool[selected]]=[pool[selected],pool[i]];}
  return pool.slice(0,count);
 }
 const types=parseTypes(input);if(types.some(value=>!config.allowedTypes.includes(value)))throw invalid();return types;
};
const detectCloudflare = data => typeof data==='string' && /just a moment|enable javascript and cookies|challenge-platform|cf-chl-|cloudflare.*challenge/i.test(data);
const parseRetryAfter=(value,now=Date.now())=>{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const text=String(value).trim();
 if(/^\d+$/.test(text)){const seconds=Number(text);return Number.isSafeInteger(seconds)?seconds:null;}
 // Accept HTTP dates, never forward the upstream header verbatim.
 if(!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text))return null;
 const date=Date.parse(text);return Number.isFinite(date)?Math.max(0,Math.ceil((date-now)/1000)):null;
};
const normalizeResponse=response=>{
 if(response.status===429){
  const err=providerError('EMAILTICK_RATE_LIMITED',429);
  const seconds=parseRetryAfter(response.headers?.['retry-after']);
  if(seconds!==null)err.retry_after_seconds=seconds;
  throw err;
 }
 const raw=response.data;if(detectCloudflare(raw))throw providerError('EMAILTICK_CLOUDFLARE_CHALLENGE');
 if(response.status>=500)throw providerError('EMAILTICK_TEMPORARY_ERROR');
 if(response.status<200||response.status>=300)throw providerError('EMAILTICK_ERROR');
 const contentType=String(response.headers?.['content-type']||'');
 if(!/application\/(?:[\w.-]+\+)?json/i.test(contentType))throw providerError('EMAILTICK_INVALID_RESPONSE');
 let data=raw;
 if(typeof raw==='string'){try {data=JSON.parse(raw);}catch(_){throw providerError('EMAILTICK_INVALID_RESPONSE');}}
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.success!=='boolean')throw providerError('EMAILTICK_INVALID_RESPONSE');
 if(data.success!==true){if(data.error==='INVALID_MAILBOX')throw providerError('INVALID_MAILBOX',410);throw providerError('EMAILTICK_ERROR');}
 return data;
};
const parseMessageTime=parseTime;
const extractOtp=(emails,options={})=>{
 const provider=options.provider||'instagram';
 if(!['instagram','facebook','generic'].includes(provider))throw invalid('INVALID_PROVIDER');
 return selectOtp(emails.map(m=>m&&({id:m.code,fromName:m.fromName,subject:m.subject,receivedAt:m.time})),{...options,service:provider.toUpperCase(),allowBody:false});
};
const createEmailTickService=({config=getEmailTickConfig(),http=axios,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=randomInt,proxies=[],now=Date.now,lookup}={})=>{
 // One browser identity per service instance, shared by create/activate and any retries.
 const userAgent=EMAILTICK_USER_AGENTS[random(EMAILTICK_USER_AGENTS.length)];
 const proxySession=createProxySession({proxies,config,random,now,lookup});
 const request=async(path,payload)=>{
  let attempt=0;
  while(true){
   let transport;
   try {
    if(proxySession)transport=await proxySession.options();
    const response=await http.post(config.baseUrl+path,payload,{timeout:config.timeoutMs,headers:{'User-Agent':userAgent,Accept:'application/json, text/plain, */*','Content-Type':'application/json',Origin:config.baseUrl,Referer:config.baseUrl+'/'},responseType:'text',transformResponse:[data=>data],validateStatus:()=>true,maxRedirects:0,maxContentLength:1024*1024,maxBodyLength:8192,...(transport?.config||{})});
    if(proxySession&&response.status!==429&&(transport.connectFailed||response.status===407)){
     proxySession.advance();continue;
    }
    return normalizeResponse(response);
   }catch(err){
    if(proxySession&&!err.isEmailTickError){proxySession.advance();continue;}
    const transient=err.code==='EMAILTICK_TEMPORARY_ERROR'||['ECONNRESET','ECONNABORTED','ETIMEDOUT','EAI_AGAIN'].includes(err.code);
    if(transient && attempt<config.retryCount){attempt++;transport?.cleanup();transport=null;await sleep(Math.min(config.retryDelayMs*attempt,proxySession?proxySession.remainingMs():Infinity));continue;}
    if(err.isEmailTickError)throw err;
    throw providerError('EMAILTICK_ERROR');
   }finally{transport?.cleanup();}
  }
 };
 return {
  resolveTypes:(input,count)=>resolveTypes(input,count,config),
  async createMailbox(types){const data=await request('/get-mailbox',{types});if(typeof data.email!=='string'||data.email.length>255||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)||typeof data.code!=='string'||!data.code.trim()||data.code.length>4096)throw providerError('EMAILTICK_INVALID_RESPONSE');return{email:data.email,mailboxCode:data.code};},
  async activateMailbox(email,mailboxCode){await request('/activate-email',{email,code:mailboxCode});},
  async getEmails(email,mailboxCode){const data=await request('/get-emails',{email,code:mailboxCode});if(!Object.prototype.hasOwnProperty.call(data,'emails') && Object.keys(data).length===1)return [];if(!Array.isArray(data.emails)||data.emails.length>1000)throw providerError('EMAILTICK_INVALID_RESPONSE');return data.emails;},
  extractOtp,
 };
};
const createOwnerEmailTickService=async(owner,{getProxySettings=(name)=>require('./settingsService').getFacebookCheckProxySettings(name,{strict:true}),...options}={})=>{
 const normalizedOwner=require('../utils/owner').normalizeOwner(owner);
 if(!normalizedOwner)throw providerError('EMAILTICK_PROXY_SETTINGS_ERROR',503);
 let settings;
 try{settings=await getProxySettings(normalizedOwner);}catch(_){throw providerError('EMAILTICK_PROXY_SETTINGS_ERROR',503);}
 if(!settings||!Array.isArray(settings.proxies))throw providerError('EMAILTICK_PROXY_SETTINGS_ERROR',503);
 return createEmailTickService({...options,proxies:settings.proxies});
};
module.exports={createEmailTickService,createOwnerEmailTickService,resolveTypes,extractOtp,detectCloudflare,normalizeResponse,parseMessageTime,providerError,parseRetryAfter,EMAILTICK_USER_AGENTS};
