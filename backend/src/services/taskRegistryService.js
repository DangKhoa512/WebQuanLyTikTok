const { QueryTypes } = require('sequelize');
const { BUILTIN_TASKS, effectiveTasks, migrateLegacyGrant, validateTask } = require('./taskRegistryPolicy');
const { normalizeOwner } = require('../utils/owner');
const failure = (message, statusCode=400) => Object.assign(new Error(message), { statusCode });
// No startup DDL: the separate additive migration must complete before activation.
const createRegistryService = (db) => {
  const rows = (sql, replacements={}, transaction) => db.query(sql, {replacements,type:QueryTypes.SELECT,transaction});
  const write = (sql, replacements={}, transaction) => db.query(sql, {replacements,transaction});
  const activated = async () => (await rows("SELECT setting_value FROM app_settings WHERE owner_username='__system__' AND setting_key='task_settings_v2' LIMIT 1"))[0]?.setting_value === 'complete';
  const requireReady = async () => { if(!await activated()) throw failure('Task Registry chưa được migration. Chạy migration riêng trước khi sử dụng.',503); };
  const identity = async owner => (await rows('SELECT id,username,role,is_active FROM users WHERE username=:owner AND is_active=1',{owner:normalizeOwner(owner)}))[0];
  const list = async (owner=null, includeArchived=false, transaction) => {
    await requireReady();
    const tasks=await rows(`SELECT * FROM task_registry ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY sort_order,id${transaction ? ' LOCK IN SHARE MODE' : ''}`,{},transaction);
    let settings=[];
    if(owner){
      const user=transaction ? (await rows('SELECT id FROM users WHERE username=:owner AND is_active=1 LOCK IN SHARE MODE',{owner:normalizeOwner(owner)},transaction))[0] : await identity(owner);
      if(!user)return [];
      settings=await rows(`SELECT task_id,enabled,priority FROM user_task_settings WHERE user_id=:id${transaction ? ' LOCK IN SHARE MODE' : ''}`,{id:user.id},transaction);
    }
    return tasks.map(task=>{
      const builtin=BUILTIN_TASKS.find(row=>row.task_key===task.task_key),setting=settings.find(row=>row.task_id===task.id);
      return {...task,enabled:!!task.enabled,activity_key:builtin?.activity_key || task.task_key,stats_key:builtin?.stats_key || task.task_key,route:builtin?.route || null,executable:!!builtin,user_enabled:!!setting?.enabled,priority:setting?.priority ?? task.default_priority};
    });
  };
  const effective = async (owner,transaction) => {
    if(!await activated())return null;
    const tasks=await list(owner,false,transaction);
    return effectiveTasks(tasks,tasks.map(task=>({task_id:task.id,enabled:task.user_enabled,priority:task.priority})));
  };
  const saveMine=async(owner,items)=>{
    await requireReady();
    if(!Array.isArray(items))throw failure('tasks phải là danh sách');
    return db.transaction(async transaction=>{
      const user=(await rows('SELECT id FROM users WHERE username=:owner AND is_active=1 FOR UPDATE',{owner:normalizeOwner(owner)},transaction))[0];
      if(!user)throw failure('Phiên người dùng không hợp lệ',401);
      const available=await rows('SELECT id FROM task_registry WHERE archived_at IS NULL LOCK IN SHARE MODE',{},transaction),seen=new Set();
      for(const item of items){if(!available.some(task=>task.id===item.task_id)||seen.has(item.task_id)||typeof item.enabled!=='boolean'||!Number.isInteger(item.priority)||Math.abs(item.priority)>10000)throw failure('Cấu hình task không hợp lệ');seen.add(item.task_id);}
      for(const item of items)await write('INSERT INTO user_task_settings (user_id,task_id,enabled,priority,created_at,updated_at) VALUES (:user_id,:task_id,:enabled,:priority,NOW(),NOW()) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),priority=VALUES(priority),updated_at=NOW()',{user_id:user.id,task_id:item.task_id,enabled:item.enabled,priority:item.priority},transaction);
    });
  };
  const create = async source => {
    await requireReady(); const data=validateTask(source);
    try { await write('INSERT INTO task_registry (task_key,name,platform,description,enabled,default_priority,sort_order,created_at,updated_at) VALUES (:task_key,:name,:platform,:description,:enabled,:default_priority,0,NOW(),NOW())',data); }
    catch(err){if(err.original?.code==='ER_DUP_ENTRY')throw failure('task_key đã tồn tại',409);throw err;}
    return (await rows('SELECT * FROM task_registry WHERE task_key=:task_key',data))[0];
  };
  const update = async (id,source) => {
    await requireReady(); const old=(await rows('SELECT * FROM task_registry WHERE id=:id',{id}))[0];if(!old)throw failure('Không tìm thấy task',404);
    if(source.task_key && source.task_key!==old.task_key)throw failure('Không được đổi task_key');
    const patch=validateTask({...old,enabled:!!old.enabled,...source,task_key:old.task_key});
    await write('UPDATE task_registry SET name=:name,platform=:platform,description=:description,enabled=:enabled,default_priority=:default_priority,updated_at=NOW() WHERE id=:id',{...patch,id});
    return {...old,...patch};
  };
  const archive = async id => { await requireReady(); await write('UPDATE task_registry SET enabled=0,archived_at=NOW(),updated_at=NOW() WHERE id=:id',{id}); };
  const users = () => rows('SELECT id,username,role,is_active FROM users ORDER BY username');
  const migrate=async()=>{
    await write(`CREATE TABLE IF NOT EXISTS task_registry (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,task_key VARCHAR(50) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,platform VARCHAR(30) NOT NULL,description TEXT NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,default_priority INT NOT NULL DEFAULT 50,sort_order INT NOT NULL DEFAULT 0,archived_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const legacyTable=(await rows("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_tasks'")).length>0;
    const column=await rows("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='task_registry' AND COLUMN_NAME='default_priority'");
    if(!column.length)await write('ALTER TABLE task_registry ADD COLUMN default_priority INT NOT NULL DEFAULT 50');
    await write(`CREATE TABLE IF NOT EXISTS user_task_settings (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id INT UNSIGNED NOT NULL,task_id INT UNSIGNED NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 0,priority INT NOT NULL DEFAULT 50,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_user_task_setting(user_id,task_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(task_id) REFERENCES task_registry(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.transaction(async transaction=>{
      await write("INSERT IGNORE INTO app_settings (owner_username,setting_key,setting_value,created_at,updated_at) VALUES ('__system__','task_settings_v2','pending',NOW(),NOW())",{},transaction);
      const marker=(await rows("SELECT setting_value FROM app_settings WHERE owner_username='__system__' AND setting_key='task_settings_v2' FOR UPDATE",{},transaction))[0];
      if(marker.setting_value==='complete')return;
      for(const [sort_order,task] of BUILTIN_TASKS.entries())await write("INSERT IGNORE INTO task_registry (task_key,name,platform,description,enabled,default_priority,sort_order,created_at,updated_at) VALUES (:task_key,:name,:platform,'',1,:priority,:sort_order,NOW(),NOW())",{...task,sort_order},transaction);
      for(const task of BUILTIN_TASKS)await write('UPDATE task_registry SET default_priority=:priority WHERE task_key=:task_key',{priority:task.priority,task_key:task.task_key},transaction);
      if(legacyTable){
        await write('INSERT IGNORE INTO user_task_settings (user_id,task_id,enabled,priority,created_at,updated_at) SELECT user_id,task_id,enabled,priority,created_at,updated_at FROM user_tasks',{},transaction);
      }else{
        const tasks=await rows('SELECT id,task_key FROM task_registry',{},transaction),existingUsers=await rows('SELECT id,username FROM users',{},transaction);
        for(const user of existingUsers){
          const old=(await rows("SELECT setting_value FROM app_settings WHERE owner_username=:owner AND setting_key='task_dispatcher'",{owner:normalizeOwner(user.username)},transaction))[0];
          let legacy={};if(old){try{legacy=JSON.parse(old.setting_value);}catch{throw failure('Cấu hình dispatcher cũ không hợp lệ; migration dừng',500);}}
          for(const task of tasks){const setting=migrateLegacyGrant(task,legacy);if(setting)await write('INSERT IGNORE INTO user_task_settings (user_id,task_id,enabled,priority,created_at,updated_at) VALUES (:user_id,:task_id,:enabled,:priority,NOW(),NOW())',{user_id:user.id,...setting},transaction);}
        }
      }
      await write("UPDATE app_settings SET setting_value='complete',updated_at=NOW() WHERE owner_username='__system__' AND setting_key='task_settings_v2'",{},transaction);
    });
  };
  return {activated,identity,list,effective,saveMine,create,update,archive,users,migrate};
};
module.exports={createRegistryService,failure};
