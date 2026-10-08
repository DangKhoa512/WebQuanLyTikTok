const assert=require('assert');
const {execFileSync}=require('child_process');
const path=require('path');
const config=path.resolve(__dirname,'../src/config/devices');
const env={...process.env};delete env.DEVICE_OFFLINE_TIMEOUT_SECONDS;
assert.equal(execFileSync(process.execPath,['-e',`process.stdout.write(String(require(${JSON.stringify(config)}).offlineTimeoutSeconds))`],{env,encoding:'utf8'}),'1800');
assert.equal(execFileSync(process.execPath,['-e',`process.stdout.write(String(require(${JSON.stringify(config)}).offlineTimeoutSeconds))`],{env:{...env,DEVICE_OFFLINE_TIMEOUT_SECONDS:'2400'},encoding:'utf8'}),'2400');
process.env.DEVICE_OFFLINE_TIMEOUT_SECONDS='1800';
const {classifyDevice,paginateDevices}=require('../src/services/deviceStatusService');
const now=Date.UTC(2026,9,8,0,0,0);
const device=(minutes,active=false)=>({device_id:'test',last_seen:new Date(now-minutes*60000),reported_status:active?'RUNNING':'IDLE',active_task:active});
for(const minutes of [10,25,30]){assert.equal(classifyDevice(device(minutes),now),'IDLE');assert.equal(classifyDevice(device(minutes,true),now),'RUNNING');}
assert.equal(classifyDevice({...device(30),last_seen:new Date(now-1800001)},now),'OFFLINE');
assert.equal(classifyDevice(device(31),now),'OFFLINE');assert.equal(classifyDevice(device(31,true),now),'OFFLINE');
const stale=device(31,true),before=JSON.stringify(stale);classifyDevice(stale,now);assert.equal(JSON.stringify(stale),before,'Classification does not mutate task/device');
assert.equal(classifyDevice({...stale,last_seen:new Date(now)},now),'RUNNING');assert.equal(classifyDevice({...stale,last_seen:new Date(now),active_task:false,reported_status:'IDLE'},now),'IDLE');
const rows=[device(10,true),device(25),device(31,true)].map((row,i)=>({...row,device_id:String(i),status:classifyDevice(row,now)}));
const filtered=paginateDevices(rows,{device_status:'OFFLINE'});assert.equal(filtered.rows.length,1);assert.equal(filtered.offline_timeout_seconds,1800);
console.log('DEVICE_OFFLINE_TIMEOUT_OK: default/env override, 10/25/30 minutes online, >30 minutes offline, active task offline without mutation, heartbeat recovery, shared filter metadata');
