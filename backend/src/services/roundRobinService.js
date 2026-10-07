const { QueryTypes } = require('sequelize');
const { normalizeOwner } = require('../utils/owner');
const failure = (message, statusCode=400) => Object.assign(new Error(message), { statusCode });
const createRoundRobinService = db => {
 const rows=(sql,replacements={},transaction)=>db.query(sql,{replacements,transaction,type:QueryTypes.SELECT,logging:false});
 const write=(sql,replacements={},transaction)=>db.query(sql,{replacements,transaction,logging:false});
 const ready=async()=> (await rows("SELECT setting_value FROM app_settings WHERE owner_username='__system__' AND setting_key='round_robin_v1'"))[0]?.setting_value==='complete';
 const requireReady=async()=>{if(!await ready())throw failure('Round-Robin chua duoc migration. Chay migrate:round-robin.',503);};
 const lock=async(owner,transaction)=>{
  const user=(await rows('SELECT id FROM users WHERE username=:owner AND is_active=1',{owner:normalizeOwner(owner)},transaction))[0];
  if(!user)throw failure('Invalid user',401);
  await write('INSERT INTO user_dispatcher_state (user_id,next_task_id,updated_at) VALUES (:id,NULL,NOW()) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',{id:user.id},transaction);
  return (await rows('SELECT user_id,next_task_id FROM user_dispatcher_state WHERE user_id=:id FOR UPDATE',{id:user.id},transaction))[0];
 };
 const order=tasks=>{
  const explicit=tasks.filter(t=>t.dispatch_order!=null).sort((a,b)=>a.dispatch_order-b.dispatch_order || a.id-b.id);
  const missing=tasks.filter(t=>t.dispatch_order==null).sort((a,b)=>b.priority-a.priority || a.id-b.id);
  let next=Math.max(-1,...explicit.map(t=>Number(t.dispatch_order)))+1;
  return [...explicit,...missing.map(t=>({...t,dispatch_order:next++}))];
 };
 const initialize=async(userId,tasks,transaction)=>{
  const ordered=order(tasks);
  const persisted=new Set((await rows('SELECT task_id FROM user_task_settings WHERE user_id=:id AND dispatch_order IS NOT NULL',{id:userId},transaction)).map(row=>row.task_id));
  for(const task of ordered)if(!persisted.has(task.id)){
   await write('INSERT INTO user_task_settings (user_id,task_id,enabled,priority,dispatch_order,created_at,updated_at) VALUES (:user,:task,0,:priority,:position,NOW(),NOW()) ON DUPLICATE KEY UPDATE dispatch_order=COALESCE(dispatch_order,VALUES(dispatch_order))',{user:userId,task:task.id,priority:task.priority,position:task.dispatch_order},transaction);
  }
  return ordered;
 };
 const advance=(state,next,transaction)=>write('UPDATE user_dispatcher_state SET next_task_id=:next,updated_at=NOW() WHERE user_id=:user',{next,user:state.user_id},transaction);
 const migrate=async()=>{
  const column=await rows("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_task_settings' AND COLUMN_NAME='dispatch_order'");
  if(!column.length)await write('ALTER TABLE user_task_settings ADD COLUMN dispatch_order INT UNSIGNED NULL');
  const index=await rows("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_task_settings' AND INDEX_NAME='idx_user_dispatch_order'");
  if(!index.length)await write('ALTER TABLE user_task_settings ADD INDEX idx_user_dispatch_order(user_id,dispatch_order,task_id)');
  await write('CREATE TABLE IF NOT EXISTS user_dispatcher_state (user_id INT UNSIGNED PRIMARY KEY,next_task_id INT UNSIGNED NULL,updated_at DATETIME NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(next_task_id) REFERENCES task_registry(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  for(const user of await rows('SELECT id FROM users'))await db.transaction(async transaction=>{
   await write('INSERT INTO user_dispatcher_state (user_id,next_task_id,updated_at) VALUES (:id,NULL,NOW()) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',{id:user.id},transaction);
   await rows('SELECT user_id FROM user_dispatcher_state WHERE user_id=:id FOR UPDATE',{id:user.id},transaction);
   const tasks=await rows('SELECT t.id,COALESCE(s.priority,t.default_priority) priority,s.dispatch_order FROM task_registry t LEFT JOIN user_task_settings s ON s.task_id=t.id AND s.user_id=:id WHERE t.archived_at IS NULL',{id:user.id},transaction);
   await initialize(user.id,tasks,transaction);
  });
  await write("INSERT INTO app_settings (owner_username,setting_key,setting_value,created_at,updated_at) VALUES ('__system__','round_robin_v1','complete',NOW(),NOW()) ON DUPLICATE KEY UPDATE setting_value='complete',updated_at=NOW()");
 };
 return {ready,requireReady,lock,order,initialize,advance,migrate};
};
module.exports={createRoundRobinService};
