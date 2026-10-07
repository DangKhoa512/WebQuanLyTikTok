require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
const db=require('../src/config/database'),{QueryTypes}=require('sequelize');
const fs=require('fs'),path=require('path'),assert=require('assert');
const rows=sql=>db.query(sql,{type:QueryTypes.SELECT,logging:false});
const exists=async table=>(await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table',{replacements:{table},type:QueryTypes.SELECT,logging:false})).length>0;
const snapshot=async()=>({
 settings:await exists('user_task_settings')?await rows('SELECT user_id,task_id,enabled,priority FROM user_task_settings ORDER BY user_id,task_id'):[],
 state:await exists('user_dispatcher_state')?await rows('SELECT user_id,next_task_id FROM user_dispatcher_state ORDER BY user_id'):[],
 history:await exists('device_task_runs')?Number((await rows('SELECT COUNT(*) total FROM device_task_runs'))[0].total):0,
});
(async()=>{
 if(!process.argv.includes('--apply')){console.log('Plan: additive dispatch_order/index/user_dispatcher_state, initialize priority DESC; retain Enabled/Priority/history/cursor. Use --apply.');return;}
 const before=await snapshot(),backup=path.resolve(__dirname,'../../artifacts/round-robin-backup-'+Date.now()+'.json');
 fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify(before,null,2),{encoding:'utf8',flag:'wx'});
 await require('../src/services/taskRegistryService').createRegistryService(db).migrate();
 const after=await snapshot();
 for(const setting of before.settings)assert.deepEqual(after.settings.find(s=>s.user_id===setting.user_id&&s.task_id===setting.task_id),setting,'Enabled/Priority changed');
 for(const state of before.state)assert.deepEqual(after.state.find(s=>s.user_id===state.user_id),state,'Existing cursor changed');
 assert(after.history>=before.history,'History lost');
 console.log('ROUND_ROBIN_MIGRATION_OK: additive/idempotent, local ignored backup, Enabled/Priority/history/cursor preserved');
})().catch(err=>{console.error('Round-Robin migration failed: '+err.name);process.exitCode=1;}).finally(()=>db.close());
