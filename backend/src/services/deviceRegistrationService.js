const {QueryTypes,Transaction}=require('sequelize');
const db=require('../config/database');
const User=require('../models/User');
const Device=require('../models/DashboardDevice');
const {capacity}=require('../config/devices');
const roundRobin=require('./roundRobinService').createRoundRobinService(db);
// Serialize new registrations per owner, including legacy account-assigned devices.
const ensureDevice=async(owner,deviceId,defaults={})=>{
 const known=await Device.findOne({where:{owner_username:owner,device_id:deviceId}});if(known)return known;
 const ready=await roundRobin.ready();
 return db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED},async transaction=>{
 if(ready)await roundRobin.lock(owner,transaction);
 const user=await User.findOne({where:{username:owner},transaction,...(!ready?{lock:transaction.LOCK.UPDATE}:{})});
 if(!user){const err=new Error('INVALID_DEVICE_OWNER');err.statusCode=401;throw err;}
 const existing=await Device.findOne({where:{owner_username:owner,device_id:deviceId},transaction});
 if(existing)return existing;
 const [count]=await db.query(`SELECT COUNT(*) total,MAX(device_id=:deviceId) known FROM (
 SELECT device_id FROM dashboard_devices WHERE owner_username=:owner
 UNION SELECT device_id FROM facebook_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IS NOT NULL AND device_id<>''
 UNION SELECT device_id FROM instagram_accounts WHERE owner_username=:owner AND kind='job' AND trashed_at IS NULL AND device_id IS NOT NULL AND device_id<>''
 ) devices`,{replacements:{owner,deviceId},type:QueryTypes.SELECT,transaction});
 if(!Number(count.known)&&Number(count.total)>=capacity){const err=new Error('DEVICE_LIMIT_REACHED');err.statusCode=409;throw err;}
 return Device.create({owner_username:owner,device_id:deviceId,device_name:deviceId,last_seen:new Date(),...defaults},{transaction});
});
};
const hasOwnedDevice=async(owner,deviceId)=>{
 if(await Device.findOne({where:{owner_username:owner,device_id:deviceId},attributes:['id']}))return true;
 for(const model of [require('../models/FacebookAccount'),require('../models/InstagramAccount')])
  if(await model.findOne({where:{owner_username:owner,device_id:deviceId,kind:'job',trashed_at:null},attributes:['id']}))return true;
 return false;
};
module.exports={ensureDevice,hasOwnedDevice};
