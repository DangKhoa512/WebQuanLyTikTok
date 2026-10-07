const invalid = (code='INVALID_EMAIL_TYPE') => Object.assign(new Error(code),{code,statusCode:code==='EMAILTICK_CONFIG_ERROR'?503:400});
const parseTypes = input => {
 const source = Array.isArray(input) ? input : typeof input === 'number' ? [input] : typeof input === 'string' ? input.split(',').map(value=>value.trim()) : [];
 if(!source.length || source.length>100)throw invalid();
 const types=source.map(value=>{
  if(typeof value==='string' && !/^\d+$/.test(value))throw invalid();
  if(typeof value!=='string' && typeof value!=='number')throw invalid();
  const number=Number(value);if(!Number.isSafeInteger(number)||number<1)throw invalid();return number;
 });
 return [...new Set(types)];
};
const readInt = (value,fallback,min,max) => {if(value===undefined||value==='')return fallback;const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw invalid('EMAILTICK_CONFIG_ERROR');return number;};
const parseConfiguredTypes = value => { try{return parseTypes(value);}catch(_){throw invalid('EMAILTICK_CONFIG_ERROR');} };
const getEmailTickConfig = (env=process.env) => {
 let base;try {base=new URL(env.EMAILTICK_BASE_URL || 'https://emailtick.com');}catch(_){throw invalid('EMAILTICK_CONFIG_ERROR');}
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw invalid('EMAILTICK_CONFIG_ERROR');
 const allowedTypes=parseConfiguredTypes(env.EMAILTICK_ALLOWED_TYPES || '1,2,3,4,5');
 const randomTypes=parseConfiguredTypes(env.EMAILTICK_RANDOM_TYPES || '3,4,5');
 if(randomTypes.some(value=>!allowedTypes.includes(value)))throw invalid('EMAILTICK_CONFIG_ERROR');
 return {baseUrl:base.origin,allowedTypes,randomTypes,timeoutMs:readInt(env.EMAILTICK_TIMEOUT_MS,15000,100,60000),retryCount:readInt(env.EMAILTICK_RETRY_COUNT,2,0,3),retryDelayMs:readInt(env.EMAILTICK_RETRY_DELAY_MS,250,0,5000)};
};
module.exports={getEmailTickConfig,parseTypes,invalid};
