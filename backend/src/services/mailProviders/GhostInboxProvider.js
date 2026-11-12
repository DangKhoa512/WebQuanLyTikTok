const axios=require('axios');
const {load}=require('cheerio');
const {selectOtp,parseTime}=require('../mailOtpService');
const {detectCloudflare}=require('../emailTickService');
const failure=(code,statusCode=502)=>Object.assign(new Error(code),{code,statusCode});
const unwrap=value=>{
 if(Array.isArray(value)&&value.length===2&&value[1]&&typeof value[1]==='object'&&typeof value[1].s==='string')return unwrap(value[0]);
 if(Array.isArray(value))return value.map(unwrap);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unwrap(v)]));
 return value;
};
const MAIL_TYPES=['TEMP_GMAIL','TEMP_MAIL','TEN_MINUTE_MAIL'];
function config(env=process.env,mailType='TEMP_GMAIL'){
 if(!MAIL_TYPES.includes(mailType))throw failure('INVALID_INPUT',400);
 const baseUrl=mailType==='TEMP_GMAIL'?(env.GHOSTINBOX_BASE_URL||'https://temp-gmail.ghostinbox.net'):(env.GHOSTINBOX_WEB_BASE_URL||'https://ghostinbox.net');
 let url;try{url=new URL(baseUrl);}catch(_){throw failure('GHOSTINBOX_CONFIG_ERROR',503);}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw failure('GHOSTINBOX_CONFIG_ERROR',503);
 const integer=(key,def,min,max)=>{const n=Number(env[key]??def);if(!Number.isSafeInteger(n)||n<min||n>max)throw failure('GHOSTINBOX_CONFIG_ERROR',503);return n;};
 return {baseUrl:url.origin,timeoutMs:integer('GHOSTINBOX_TIMEOUT_MS',15000,100,60000),retryCount:integer('GHOSTINBOX_RETRY_COUNT',2,0,3),pollIntervalMs:Math.max(10000,integer('GHOSTINBOX_POLL_INTERVAL_MS',10000,1000,60000))};
}
function mergeCookies(state,headers,baseUrl,now){
 for(const line of headers['set-cookie']||[]){
  if(typeof line!=='string'||line.length>16384)throw failure('GHOSTINBOX_INVALID_RESPONSE');
  const parts=line.split(';').map(s=>s.trim()),separator=parts[0].indexOf('=');if(separator<1)continue;
  const name=parts[0].slice(0,separator),value=parts[0].slice(separator+1);
  if(!['XSRF-TOKEN','ghostinbox_session'].includes(name))continue;
  const attrs=Object.fromEntries(parts.slice(1).map(p=>{const i=p.indexOf('=');return i<0?[p.toLowerCase(),true]:[p.slice(0,i).toLowerCase(),p.slice(i+1)];}));
  const domain=String(attrs.domain||new URL(baseUrl).hostname).replace(/^\./,'');
  if(new URL(baseUrl).hostname!==domain&&!new URL(baseUrl).hostname.endsWith('.'+domain))continue;
  const expiresAt=attrs['max-age']!==undefined?now+Number(attrs['max-age'])*1000:attrs.expires?Date.parse(attrs.expires):null;
  if(value===''||expiresAt!==null&&expiresAt<=now)delete state.cookies[name];
  else state.cookies[name]={value,expiresAt:Number.isFinite(expiresAt)?expiresAt:null,path:attrs.path||'/',secure:!!attrs.secure};
 }
}
function normalizeMessages(raw){
 const items=unwrap(raw);
 if(!Array.isArray(items)||items.length>1000)throw failure('GHOSTINBOX_INVALID_RESPONSE');
 return items.map(m=>{
  if(!m||typeof m.id!=='string'||m.id.length>255||!m.id||typeof m.subject!=='string'||typeof m.sender_name!=='string'||typeof m.sender_email!=='string'||!parseTime(m.timestamp)||typeof m.content!=='string')throw failure('GHOSTINBOX_INVALID_RESPONSE');
  return {id:m.id,from:m.sender_email,fromName:m.sender_name,subject:m.subject,bodyHtml:m.content,receivedAt:parseTime(m.timestamp),provider:'GHOSTINBOX'};
 });
}
function createGhostInboxProvider({mailType='TEMP_GMAIL',settings=config(process.env,mailType),http=axios,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!MAIL_TYPES.includes(mailType))throw failure('INVALID_INPUT',400);
 const prefix=mailType==='TEN_MINUTE_MAIL'?'/10-minute-mail':'',inboxPath=prefix+'/inbox';
 const request=async(state,method,path,body,json=false)=>{
  if(state.retryAfterAt>now())throw failure('GHOSTINBOX_RATE_LIMITED',429);
  for(let attempt=0;attempt<=settings.retryCount;attempt++){
   try{
    const cookie=Object.entries(state.cookies).filter(([,c])=>(c.expiresAt===null||c.expiresAt>now())&&path.startsWith(c.path)&&(!c.secure||settings.baseUrl.startsWith('https:'))).map(([k,c])=>k+'='+c.value).join('; ');
    const response=await http.request({method,url:settings.baseUrl+path,data:body,timeout:settings.timeoutMs,maxRedirects:0,maxContentLength:4*1024*1024,maxBodyLength:4*1024*1024,responseType:'text',transformResponse:[x=>x],validateStatus:()=>true,headers:{'User-Agent':'QUANLY_REG-MailProvider/1.0',Accept:json?'*/*':'text/html',Referer:settings.baseUrl+(method==='POST'?inboxPath:(prefix||'/')),...(method==='POST'?{Origin:settings.baseUrl,'Content-Type':'application/json','X-Livewire':''}:{}),...(cookie?{Cookie:cookie}:{})}});
    mergeCookies(state,response.headers,settings.baseUrl,now());
    if(detectCloudflare(response.data)||response.headers['cf-mitigated']==='challenge'||response.status===403)throw failure('GHOSTINBOX_ACCESS_CHALLENGE');
    if(response.status===429){const retry=response.headers['retry-after'];const seconds=/^\d+$/.test(String(retry))?Number(retry):null;const retryAt=seconds!==null?now()+seconds*1000:Date.parse(retry);state.retryAfterAt=Math.max(now()+settings.pollIntervalMs,Number.isFinite(retryAt)?retryAt:0);throw failure('GHOSTINBOX_RATE_LIMITED',429);}
    if([401,419].includes(response.status))throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
    if(response.status===404)throw failure('GHOSTINBOX_MAILBOX_EXPIRED',410);
    if(response.status>=500)throw failure('GHOSTINBOX_TEMPORARY_ERROR');
    if(response.status<200||response.status>=400)throw failure('GHOSTINBOX_ERROR');
    if(json){
     if(response.status>=300)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
     if(!/application\/(?:[\w.-]+\+)?json/i.test(response.headers['content-type']||''))throw failure('GHOSTINBOX_INVALID_RESPONSE');
     try{response.data=typeof response.data==='string'?JSON.parse(response.data):response.data;}catch(_){throw failure('GHOSTINBOX_INVALID_RESPONSE');}
    }
    return response;
   }catch(error){
    if((error.code==='GHOSTINBOX_TEMPORARY_ERROR'||['ETIMEDOUT','ECONNABORTED','ECONNRESET','EAI_AGAIN'].includes(error.code))&&attempt<settings.retryCount){await sleep(250*(attempt+1));continue;}
    if(error.code?.startsWith('GHOSTINBOX_'))throw error;
    throw failure('GHOSTINBOX_ERROR');
   }
  }
 };
 const bootstrap=async(state,email)=>{
  const response=await request(state,'GET',inboxPath);
  if(response.status>=300)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
  if(!/text\/html/i.test(response.headers['content-type']||''))throw failure('GHOSTINBOX_INVALID_RESPONSE');
  const $=load(response.data),element=$('[wire\\:snapshot]').filter((_,el)=>{try{return JSON.parse($(el).attr('wire:snapshot')).memo.name==='frontend.app';}catch(_){return false;}}).first();
  state.snapshot=element.attr('wire:snapshot');state.csrf=$('script[data-csrf]').attr('data-csrf')||$('meta[name="csrf-token"]').attr('content');
  let snapshot;try{snapshot=JSON.parse(state.snapshot);}catch(_){throw failure('GHOSTINBOX_INVALID_RESPONSE');}
  if(!state.csrf||!state.cookies.ghostinbox_session||snapshot.data.email!==email)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
  if(mailType==='TEN_MINUTE_MAIL'){
   const raw=$('#expiryCountdown').attr('data-remaining'),seconds=Number(raw);
   if(raw===undefined||!Number.isSafeInteger(seconds)||seconds<0||seconds>600)throw failure('GHOSTINBOX_INVALID_RESPONSE');
   if(seconds===0)throw failure('GHOSTINBOX_MAILBOX_EXPIRED',410);
   // Never extend a saved mailbox merely by bootstrapping it again.
   state.expiresAt=Math.min(state.expiresAt||Infinity,now()+seconds*1000);
  }
  return snapshot;
 };
 const refresh=async(state,email,initial=false)=>{
  let snapshot;try{snapshot=JSON.parse(state.snapshot);}catch(_){throw failure('GHOSTINBOX_INVALID_RESPONSE');}
  if(snapshot.data.email!==email)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
  const calls=[...(initial?[{path:'',method:'__dispatch',params:['syncEmail',{email}]}]:[]),{path:'',method:'__dispatch',params:['fetchMessages',{}]}];
  const response=await request(state,'POST','/livewire/update',{_token:state.csrf,components:[{snapshot:state.snapshot,updates:{},calls}]},true);
  const c=response.data?.components;if(!Array.isArray(c)||c.length!==1||typeof c[0].snapshot!=='string')throw failure('GHOSTINBOX_INVALID_RESPONSE');
  let next;try{next=JSON.parse(c[0].snapshot);}catch(_){throw failure('GHOSTINBOX_INVALID_RESPONSE');}
  if(next.memo?.name!=='frontend.app'||next.memo.id!==snapshot.memo.id||next.data?.email!==email)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
  if(typeof next.data.error!=='string'||next.data.error)throw failure('GHOSTINBOX_ERROR');
  const messages=normalizeMessages(next.data.messages);state.snapshot=c[0].snapshot;state.lastPolledAt=now();return messages;
 };
 return {
  pollIntervalMs:settings.pollIntervalMs,
  async createMailbox(){
   const state={cookies:{},retryAfterAt:0,lastPolledAt:0,mailType};
   const page=await request(state,'GET',prefix||'/');
   if(page.status!==200||!/text\/html/i.test(page.headers['content-type']||''))throw failure('GHOSTINBOX_INVALID_RESPONSE');
   const $=load(page.data);
   let email,confirmPath;
   if(mailType==='TEMP_GMAIL'){
    email=$('#heroUser').attr('value');
    if(typeof email!=='string'||email.length>255||!/^[^\s@]+@(?:gmail|googlemail)\.com$/i.test(email))throw failure('GHOSTINBOX_INVALID_RESPONSE');
    confirmPath='/confirm-gmail-alias?email='+encodeURIComponent(email);
   }else{
    const user=$('#heroUser').text().trim().toLowerCase(),domain=$('#addrDomainText').text().trim().toLowerCase();
    const domains=$('#domainList [data-domain]').map((_,el)=>$(el).attr('data-domain')).get();
    if(!/^[a-z0-9]+$/.test(user)||!domains.includes(domain)||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw failure('GHOSTINBOX_INVALID_RESPONSE');
    email=user+'@'+domain;
    if(email.length>255)throw failure('GHOSTINBOX_INVALID_RESPONSE');
    confirmPath=prefix+'/set-custom-email?user='+encodeURIComponent(user)+'&domain='+encodeURIComponent(domain);
   }
   const confirm=await request(state,'GET',confirmPath);
   if(confirm.status!==302||new URL(confirm.headers.location,settings.baseUrl).href!==settings.baseUrl+inboxPath)throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
   await bootstrap(state,email);await refresh(state,email,true);
   return {email,providerState:state};
  },
  async getMessages(mailbox){
   const state=mailbox.providerState,email=mailbox.email;
   if(mailType==='TEN_MINUTE_MAIL'&&(!Number.isFinite(state.expiresAt)||state.expiresAt<=now()))throw failure('GHOSTINBOX_MAILBOX_EXPIRED',410);
   const session=state.cookies?.ghostinbox_session;
   if(!session||session.expiresAt!==null&&session.expiresAt<=now())throw failure('GHOSTINBOX_SESSION_EXPIRED',410);
   if(state.lastPolledAt+settings.pollIntervalMs>now())return [];
   // Reuse the unmodified server-signed snapshot just like the frontend (one POST per poll).
   if(!state.snapshot||!state.csrf)await bootstrap(state,email);
   return refresh(state,email);
  },
  getMessage:(messages,id)=>messages.find(m=>m.id===id)||null,
  extractOtp:selectOtp
 };
}
module.exports={createGhostInboxProvider,config,normalizeMessages,unwrap,failure,mergeCookies,MAIL_TYPES};
