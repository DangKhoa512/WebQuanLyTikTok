const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),results=[];
for(const group of fs.readdirSync(__dirname)){
 const manifest=path.join(__dirname,group,'manifest.json');if(!fs.existsSync(manifest))continue;
 for(const script of JSON.parse(fs.readFileSync(manifest)).scripts){
 const started=Date.now(),r=spawnSync(process.execPath,[path.resolve(root,'scripts',script)],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
 const benchmarkError=group==='performance'&&r.status===0&&JSON.parse(fs.readFileSync(path.join(__dirname,'performance/results.json'))).results.some(row=>row.errors>0);
 const result={group,script,status:r.status!==0?'FAIL':benchmarkError?'PARTIAL':'PASS',elapsed_ms:Date.now()-started,error:r.error?.code||null};
 results.push(result);console.log(JSON.stringify(result));
 // Detailed output stays in ignored local artifacts; it is never copied into handover documents.
 const folder=path.resolve(root,'../artifacts/audit');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,path.basename(script)+'.log'),(r.stdout||'')+(r.stderr||''));
 fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({executed_at:new Date().toISOString(),results},null,2));
 }
}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
