// Bounded five-minute operational counters; never retain paths, headers or payloads.
const buckets=new Map();
const middleware=(req,res,next)=>{const start=process.hrtime.bigint();res.once('finish',()=>{
 const minute=Math.floor(Date.now()/60000);let b=buckets.get(minute);
 if(!b){b={requests:0,errors:0,total_ms:0};buckets.set(minute,b);}
 b.requests++;b.errors+=Number(res.statusCode>=500);b.total_ms+=Number(process.hrtime.bigint()-start)/1e6;
 for(const key of buckets.keys())if(key<minute-4)buckets.delete(key);
});next();};
const snapshot=()=>{const minute=Math.floor(Date.now()/60000),v={requests:0,errors:0,total_ms:0};
 for(const [key,b] of buckets)if(key>=minute-4)for(const field of Object.keys(v))v[field]+=b[field];
 return {window_seconds:300,requests:v.requests,server_errors:v.errors,error_rate:v.requests?v.errors/v.requests:0,average_latency_ms:v.requests?v.total_ms/v.requests:null};};
module.exports={middleware,snapshot};
