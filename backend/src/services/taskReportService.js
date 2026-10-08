const {Op,Transaction}=require('sequelize');
const sequelize=require('../config/database');
const DeviceTaskRun=require('../models/DeviceTaskRun');
const DashboardDevice=require('../models/DashboardDevice');
const {getTaskDispatcherSettings}=require('./settingsService');
const {RETRYABLE_ERRORS}=require('./deviceTaskTypes');
const {clearDeviceWarning}=require('./deviceMonitoringService');
const refreshDevice=async(device,run,transaction,error=null)=>{
 if(!device)return;
 const active=await DeviceTaskRun.findOne({where:{owner_username:run.owner_username,device_id:run.device_id,status:{[Op.in]:['RUNNING','REPORTING']}},order:[['id','DESC']],transaction});
 await device.update({reported_status:active?'RUNNING':'IDLE',current_task:active?.task_type||null,current_uid:active?.uid||active?.username||null,started_at:active?.locked_at||null,last_seen:new Date(),last_error:error},{transaction});
 await clearDeviceWarning(run.owner_username,run.device_id,transaction);
};
const fail=(message,statusCode)=>Object.assign(new Error(message),{statusCode});

// Task bookkeeping only. Account data, domain locks and statistics belong to the legacy APIs.
const reportTask=async({owner,deviceId,taskId,status='SUCCESS',errorCode,message})=>{
 const normalizedStatus=String(status).trim().toUpperCase();
 if(!['SUCCESS','FAILED','DONE','DA_XONG'].includes(normalizedStatus))throw fail('status chi nhan SUCCESS hoac FAILED',400);
 const finalStatus=normalizedStatus==='FAILED'?'FAILED':'SUCCESS';
 const normalizedError=String(errorCode||'UNKNOWN_ERROR').trim().toUpperCase().slice(0,100);
 const settings=finalStatus==='FAILED'?await getTaskDispatcherSettings(owner):null;
 return sequelize.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED},async transaction=>{
  const where={id:taskId,owner_username:owner};
  const initial=await DeviceTaskRun.findOne({where,transaction});
  if(!initial)throw fail('Khong tim thay task',404);
  if(deviceId&&(initial.device_id!==deviceId||initial.locked_by!==deviceId))throw fail('Task khong thuoc device nay',409);
  // Match dispatcher lock order: device first, then task. No legacy controller is called.
  const device=await DashboardDevice.findOne({where:{owner_username:owner,device_id:initial.device_id},transaction,lock:transaction.LOCK.UPDATE});
  const run=await DeviceTaskRun.findOne({where,transaction,lock:transaction.LOCK.UPDATE});
  if(!run)throw fail('Khong tim thay task',404);
  if(['SUCCESS','FAILED','RELEASED'].includes(run.status)){
   if(run.status!==finalStatus)throw fail('Task da ket thuc voi trang thai '+run.status,409);
   await refreshDevice(device,run,transaction);
   return {run,already_reported:true,legacy:null,retryable:false};
  }
  if(run.status!=='RUNNING')throw fail('Task dang duoc bao cao',409);
  const retries=Number(run.retry_count)+(finalStatus==='FAILED'?1:0);
  const retryable=finalStatus==='FAILED'&&RETRYABLE_ERRORS.has(normalizedError)&&retries<=settings.max_retry;
  const completedAt=new Date();
  await run.update({status:finalStatus,completed_at:completedAt,retry_count:retries,error_code:finalStatus==='SUCCESS'?null:normalizedError,error_message:finalStatus==='SUCCESS'?null:(message||normalizedError)},{transaction});
  await refreshDevice(device,run,transaction,finalStatus==='SUCCESS'?null:(message||normalizedError));
  return {run,already_reported:false,legacy:null,retryable};
 });
};
module.exports={reportTask};
