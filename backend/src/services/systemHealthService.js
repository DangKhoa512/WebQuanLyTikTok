const db=require('../config/database');
const {Op}=require('sequelize');
const Run=require('../models/DeviceTaskRun');
const {getDevices}=require('./dashboardService');
const metrics=require('./apiHealthMetrics');
const {offlineTimeoutSeconds}=require('../config/devices');
const getSystemHealth=async(owner,isAdmin)=>{
 const start=Date.now();let database={status:'ONLINE'};
 try{await db.authenticate();database.latency_ms=Date.now()-start;}catch{database={status:'ERROR'};}
 const out={generated_at:new Date().toISOString(),scope:'user',backend:{status:'ONLINE'},database,offline_timeout_seconds:offlineTimeoutSeconds,
 redis:{status:'NOT_CONFIGURED'},queue:{status:'NOT_CONFIGURED'},websocket:{status:'NOT_CONFIGURED'},cron:isAdmin?null:{status:'ADMIN_ONLY'},api:isAdmin?metrics.snapshot():{status:'ADMIN_ONLY'},devices:null,tasks:null,alerts:[]};
 if(database.status==='ERROR'){out.alerts.push({code:'DATABASE_UNAVAILABLE',message:'Không kết nối được database.'});return out;}
 const [devices,running,failed]=await Promise.all([getDevices(owner),Run.count({where:{owner_username:owner,status:{[Op.in]:['RUNNING','REPORTING']}}}),Run.count({where:{owner_username:owner,status:'FAILED'}})]);
 out.devices=devices.summary;out.tasks={running,failed_history:failed};
 const settings=await require('./settingsService').getTaskDispatcherSettings(owner);
 const active=await Run.findAll({where:{owner_username:owner,status:{[Op.in]:['RUNNING','REPORTING']}},attributes:['device_id','task_type','account_id','locked_at'],raw:true});
 const long=active.filter(r=>Date.now()-new Date(r.locked_at).getTime()>settings.lock_timeout_minutes*60000).length;
 const resources=new Map();for(const r of active)if(r.account_id){const id=(['NUOI_INSTAGRAM','INSTAGRAM_JOB'].includes(r.task_type)?'IG:':'FB:')+String(r.account_id);if(!resources.has(id))resources.set(id,new Set());resources.get(id).add(r.device_id);}
 const anomalies=[...resources.values()].filter(devices=>devices.size>1).length;
 out.tasks.long_running=long;out.tasks.reservation_conflicts=anomalies;
 if(long)out.alerts.push({code:'LONG_RUNNING_TASK',count:long,message:'Task vượt thời gian khóa cấu hình; cần đối soát, không tự kết luận thất bại.'});
 if(anomalies)out.alerts.push({code:'RESERVATION_CONFLICT',count:anomalies,message:'Có account được nhiều thiết bị ghi nhận đang chạy; cần đối soát.'});
 const offline=devices.rows.filter(d=>d.alert_code==='DEVICE_UNRESPONSIVE').length;
 if(offline)out.alerts.push({code:'DEVICE_UNRESPONSIVE',count:offline,message:'Thiết bị mất phản hồi trên 30 phút.'});
 if(isAdmin){const cron=await require('./cronHealthService').readCronHealth();out.cron={status:cron.status,last_run_at:cron.last_run_at,last_success_at:cron.last_success_at||null,next_run_at:cron.next_run_at,duration_ms:cron.duration_ms};
 if(cron.status==='WARNING')out.alerts.push({code:'CRON_UNHEALTHY',message:'Cron lỗi hoặc chưa hoàn thành trong thời hạn giám sát.'});
 if(out.api.requests>=20&&out.api.error_rate>0.05)out.alerts.push({code:'API_ERRORS',message:'Tỷ lệ HTTP 5xx trong 5 phút vượt 5%.'});}
 return out;
};
module.exports={getSystemHealth};
