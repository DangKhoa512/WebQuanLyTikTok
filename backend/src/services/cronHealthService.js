const AppSetting=require('../models/AppSetting');
const scheduler=require('./schedulerState');
const where={owner_username:'__system__',setting_key:'cron_health_v1'};
const readCronHealth=async()=>{
 const row=await AppSetting.findOne({where,raw:true});
 let state=scheduler.getSchedulerState();if(row)try{state=JSON.parse(row.setting_value);}catch{}
 const age=Date.now()-new Date(state.status==='RUNNING'?state.started_at:state.last_run_at).getTime();
 if(!Number.isFinite(age)||age>600000)state={...state,status:'WARNING'};
 return state;
};
const publishCronHealth=async()=>{
 const previous=await readCronHealth(),current=scheduler.getSchedulerState();
 const safe={status:current.status,started_at:current.started_at,last_run_at:current.last_run_at,last_success_at:current.last_success_at||previous.last_success_at||null,next_run_at:current.next_run_at,duration_ms:current.duration_ms};
 const [row]=await AppSetting.findOrCreate({where,defaults:{...where,setting_value:JSON.stringify(safe)}});
 await row.update({setting_value:JSON.stringify(safe)});
};
module.exports={readCronHealth,publishCronHealth};
