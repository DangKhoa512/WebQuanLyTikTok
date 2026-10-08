const {literal}=require('sequelize');
// Table names are internal constants. Legacy expiry still applies to untracked resources.
const withoutActiveTask=(table,platform,claim=false)=>{
 const match=claim
  ? `held.task_type='REG_INSTAGRAM' AND held.entity_id=${table}.id`
  : `held.task_type IN (${platform==='FACEBOOK'?"'NUOI_FACEBOOK','REG_PAGE','PAGE_JOB'":"'NUOI_INSTAGRAM','INSTAGRAM_JOB'"}) AND held.account_id=${table}.id`;
 return literal(`NOT EXISTS (SELECT 1 FROM device_task_runs AS held WHERE held.owner_username=${table}.owner_username AND held.status IN ('RUNNING','REPORTING') AND ${match})`);
};
module.exports={withoutActiveTask};
