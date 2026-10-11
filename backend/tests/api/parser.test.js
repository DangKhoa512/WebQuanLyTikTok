const assert=require('assert');require('../../src/config/logger').silent=true;
const app=require('../../src/app');
(async()=>{const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
try{
const invalid=await fetch(base+'/api/device/task/report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"task_id":undefined,"password":"synthetic-secret"}'});assert.equal(invalid.status,400);assert(!(await invalid.text()).includes('synthetic-secret'));
const large=await fetch(base+'/api/device/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:'x'.repeat(11*1024*1024)})});assert.equal(large.status,413);
for(const route of ['/api/accounts/get-account','/api/chrome-accounts/get-account','/api/jobs/get-account']){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);}
console.log('API_PARSER_AUTH_OK: invalid JSON 400/no excerpt, oversized 413, legacy missing auth 401');
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
