const axios=require('axios');
const {randomInt}=require('crypto');
const {selectOtp,parseTime}=require('./mailOtpService');
const {getEmailTickConfig,parseTypes,invalid}=require('../config/emailtick');
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
const normalizeResponse=response=>{
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
const createEmailTickService=({config=getEmailTickConfig(),http=axios,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={})=>{
 const request=async(path,payload)=>{
  for(let attempt=0;attempt<=config.retryCount;attempt++){
   try {
    const response=await http.post(config.baseUrl+path,payload,{timeout:config.timeoutMs,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',Accept:'application/json, text/plain, */*','Content-Type':'application/json',Origin:config.baseUrl,Referer:config.baseUrl+'/'},responseType:'text',transformResponse:[data=>data],validateStatus:()=>true,maxRedirects:0,maxContentLength:1024*1024,maxBodyLength:8192});
    return normalizeResponse(response);
   }catch(err){
    const transient=err.code==='EMAILTICK_TEMPORARY_ERROR'||['ECONNRESET','ECONNABORTED','ETIMEDOUT','EAI_AGAIN'].includes(err.code);
    if(transient && attempt<config.retryCount){await sleep(config.retryDelayMs*(attempt+1));continue;}
    if(err.isEmailTickError)throw err;
    throw providerError('EMAILTICK_ERROR');
   }
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
module.exports={createEmailTickService,resolveTypes,extractOtp,detectCloudflare,normalizeResponse,parseMessageTime,providerError};
