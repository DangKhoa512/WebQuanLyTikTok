const {createHash}=require('crypto');
const {load}=require('cheerio');
function parseTime(value) {
 if(typeof value==='string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
  const time=Date.parse(value);return Number.isFinite(time)?Math.floor(time/1000):null;
 }
 const n=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
 return Number.isSafeInteger(n)&&n>0?(n>=1e12?Math.floor(n/1000):n):null;
}
function htmlText(html) {
 if(typeof html!=='string')return '';
 const $=load(html);$('script,style,iframe,object,embed,noscript').remove();
 $('br').replaceWith('\n');$('p,div,li,td').append('\n');return $.root().text();
}
function selectOtp(messages,{service='INSTAGRAM',minimumTime=0,lastEmailTime=0,processedMessageCodes=[],lastMessageCode=null,nowSeconds=Math.floor(Date.now()/1000),allowBody=true}={}) {
 const filters={INSTAGRAM:m=>/instagram/i.test(m.fromName||'')||/@(?:[^@\s]+\.)?instagram\.com$/i.test(m.from||''),FACEBOOK:m=>/facebook/i.test(m.fromName||'')||/@(?:[^@\s]+\.)?facebookmail\.com$/i.test(m.from||''),GENERIC:()=>true};
 if(!filters[service])throw Object.assign(new Error('INVALID_SERVICE'),{code:'INVALID_SERVICE',statusCode:400});
 const seen=new Set(processedMessageCodes||[]);
 return messages.map(m=>{
  if(!m||typeof m.subject!=='string'||!filters[service](m))return null;
  const time=parseTime(m.receivedAt);
  if(!time||time<minimumTime||time<Number(lastEmailTime||0)||time>nowSeconds+300)return null;
  const messageCode=typeof m.id==='string'&&m.id.trim()&&m.id.length<=255?m.id.trim():createHash('sha256').update(JSON.stringify([m.fromName,m.subject,time])).digest('hex');
  if(messageCode===lastMessageCode||seen.has(messageCode))return null;
  const match=m.subject.match(/\b(\d{6})\b/) || (allowBody&&(String(m.bodyText||'').match(/\b(\d{6})\b/)||htmlText(m.bodyHtml).match(/\b(\d{6})\b/)));
  return match?{code:match[1],messageCode,time}:null;
 }).filter(Boolean).sort((a,b)=>b.time-a.time||a.messageCode.localeCompare(b.messageCode))[0]||null;
}
function otpClaim(current,messages,extract,options={}) {
 const selected=extract(messages,{...options,minimumTime:Math.max(Math.floor(new Date(current.created_at).getTime()/1000),options.minimumTime||0),lastEmailTime:current.last_email_time,processedMessageCodes:current.processed_message_codes,lastMessageCode:current.last_message_code});
 if(!selected)return {response:{status:'WAITING',code:null},changes:null};
 const seen=options.retainAllProcessed||selected.time===Number(current.last_email_time)?current.processed_message_codes:[];
 return {response:{status:'RECEIVED',code:selected.code},changes:{last_email_time:selected.time,last_message_code:selected.messageCode,processed_message_codes:[...new Set([...seen,selected.messageCode])]}};
}
module.exports={parseTime,htmlText,selectOtp,otpClaim};
