const axios=require('axios');
const {randomInt,createHash}=require('crypto');
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
const parseMessageTime=value=>{const time=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;return Number.isSafeInteger(time)&&time>0?(time>=1000000000000?Math.floor(time/1000):time):null;};
const senderFilters={instagram:name=>name.toLowerCase().includes('instagram'),facebook:name=>name.toLowerCase().includes('facebook')};
const extractOtp=(emails,{provider='instagram',minimumTime=0,lastEmailTime=0,processedMessageCodes=[],lastMessageCode=null,nowSeconds=Math.floor(Date.now()/1000)}={})=>{
 const filter=senderFilters[provider];if(!filter)throw invalid('INVALID_PROVIDER');
 const seen=new Set(processedMessageCodes);
 const candidates=emails.map(message=>{
  if(!message||typeof message!=='object'||typeof message.fromName!=='string'||typeof message.subject!=='string'||!filter(message.fromName))return null;
  const time=parseMessageTime(message.time);
  if(!time || time<minimumTime || time<Number(lastEmailTime||0) || time>nowSeconds+300)return null;
  const messageCode=typeof message.code==='string'&&message.code.trim()&&message.code.length<=255?message.code.trim():createHash('sha256').update(JSON.stringify([message.fromName,message.subject,time])).digest('hex');
  if(messageCode===lastMessageCode || time===Number(lastEmailTime||0)&&seen.has(messageCode))return null;
  const code=message.subject.match(/\b(\d{6})\b/)?.[1];
  return code?{code,messageCode,time}:null;
 }).filter(Boolean).sort((a,b)=>b.time-a.time || a.messageCode.localeCompare(b.messageCode));
 return candidates[0]||null;
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
