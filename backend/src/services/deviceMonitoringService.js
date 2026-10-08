const {Op}=require('sequelize');
const db=require('../config/database');
const Device=require('../models/DashboardDevice');
const Health=require('../models/DeviceHealth');
const {offlineTimeoutSeconds}=require('../config/devices');
const clearDeviceWarning=(owner,deviceId,transaction)=>Health.destroy({where:{owner_username:owner,device_id:deviceId},transaction});
const warningForDevice=(device,now=Date.now())=>{
 const seen=new Date(device.last_seen||0).getTime();
 if(!device.last_seen||!Number.isFinite(seen)||now-seen<=offlineTimeoutSeconds*1000)return {alert_code:null,unresponsive_since:null,unresponsive_seconds:0,inactive_seconds:0};
 const since=seen+offlineTimeoutSeconds*1000;
 return {alert_code:'DEVICE_UNRESPONSIVE',unresponsive_since:new Date(since),unresponsive_seconds:Math.floor((now-since)/1000),inactive_seconds:Math.floor((now-seen)/1000)};
};
// Lock and recheck each candidate: a concurrent valid signal must win over a stale scan.
const monitorDevices=async(owner=null,now=new Date())=>{
 const cutoff=new Date(now.getTime()-offlineTimeoutSeconds*1000);
 const candidates=await Device.findAll({where:{...(owner?{owner_username:owner}:{}),last_seen:{[Op.lt]:cutoff}},attributes:['id','owner_username','device_id','last_seen'],raw:true});
 const existing=await Health.findAll({where:owner?{owner_username:owner}:{},attributes:['owner_username','device_id','last_seen'],raw:true});
 const snapshots=new Map(existing.map(row=>[JSON.stringify([row.owner_username,row.device_id]),new Date(row.last_seen).getTime()]));
 let affected=0;
 for(const candidate of candidates){
  if(snapshots.get(JSON.stringify([candidate.owner_username,candidate.device_id]))===new Date(candidate.last_seen).getTime()){affected++;continue;}
  await db.transaction(async transaction=>{
  const device=await Device.findByPk(candidate.id,{transaction,lock:transaction.LOCK.UPDATE});
  if(!device||new Date(device.last_seen)>=cutoff)return;
  const warning=warningForDevice(device,now.getTime());
  const [health,created]=await Health.findOrCreate({where:{owner_username:device.owner_username,device_id:device.device_id},defaults:{status:'OFFLINE',alert_code:warning.alert_code,last_seen:device.last_seen,unresponsive_since:warning.unresponsive_since,detected_at:now},transaction});
  // Preserve the first detection of the same outage; never update device.last_seen or task locks.
  if(!created&&new Date(health.last_seen).getTime()!==new Date(device.last_seen).getTime())await health.update({last_seen:device.last_seen,unresponsive_since:warning.unresponsive_since,detected_at:now},{transaction});
  affected++;
 });
 }
 return affected;
};
module.exports={monitorDevices,clearDeviceWarning,warningForDevice};
