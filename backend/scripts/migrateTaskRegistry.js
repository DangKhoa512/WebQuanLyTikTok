// Explicit additive migration; never imported by server startup.
require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
const path=require('path'),fs=require('fs'),assert=require('assert');
const db=require('../src/config/database');
const {QueryTypes}=require('sequelize');
const {createRegistryService}=require('../src/services/taskRegistryService');
const select=sql=>db.query(sql,{type:QueryTypes.SELECT,logging:false});
const tableRows=async table=>{
 const exists=await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table',{replacements:{table},type:QueryTypes.SELECT,logging:false});
 return exists.length ? select('SELECT user_id,task_id,enabled,priority FROM '+table+' ORDER BY user_id,task_id') : [];
};
const snapshot=async()=>({
 users:await select('SELECT id,username,role,is_active FROM users ORDER BY id'),
 dispatcher:await select("SELECT owner_username,setting_value FROM app_settings WHERE setting_key='task_dispatcher' ORDER BY owner_username"),
 legacy_settings:await tableRows('user_tasks'),
 current_settings:await tableRows('user_task_settings'),
 ready:await createRegistryService(db).activated(),
 history_count:Number((await select('SELECT COUNT(*) total FROM device_task_runs'))[0].total)
});
(async()=>{
 if(!process.argv.includes('--apply')){console.log('Plan: add default_priority/user_task_settings; preserve old Enabled/Priority and history, global task visibility with default OFF. --apply backs up old settings locally. No seed or startup DDL.');return;}
 const before=await snapshot(),destination=path.resolve(__dirname,'../../artifacts/task-settings-backup-'+Date.now()+'.json');
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(before,null,2),{encoding:'utf8',flag:'wx'});
 await createRegistryService(db).migrate();const after=await snapshot();
 assert.deepEqual(after.dispatcher,before.dispatcher,'Legacy dispatcher config changed');assert.deepEqual(after.users,before.users,'User identity/role changed');
 assert.deepEqual(after.legacy_settings,before.legacy_settings,'Old settings changed');
 for(const old of before.current_settings)assert.deepEqual(after.current_settings.find(row=>row.user_id===old.user_id && row.task_id===old.task_id),old,'Current settings reset');
 if(!before.ready)for(const old of before.legacy_settings)assert.deepEqual(after.current_settings.find(row=>row.user_id===old.user_id && row.task_id===old.task_id),old,'Legacy Enabled/Priority not preserved');
 assert(after.history_count>=before.history_count,'Task history decreased');assert(after.ready);
 console.log('TASK_SETTINGS_MIGRATION_OK: ignored local backup created; old Enabled/Priority/config/users/history preserved; self settings activated');
})().catch(err=>{console.error('Task settings migration failed: '+(err.statusCode ? err.message : err.name)+'. Inspect local diagnostics without exposing credentials.');process.exitCode=1;}).finally(()=>db.close());
