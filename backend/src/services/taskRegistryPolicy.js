const BUILTIN_TASKS = [
  { task_key: 'PAGE_JOB', name: 'Page Job', platform: 'FACEBOOK', priority: 100, stats_key: 'page_job', route: '/facebook-jobs' },
  { task_key: 'INSTAGRAM_JOB', name: 'Instagram Job', platform: 'INSTAGRAM', priority: 90, stats_key: 'instagram_job', route: '/facebook-jobs?platform=instagram' },
  { task_key: 'REG_PAGE', name: 'Reg Page', platform: 'FACEBOOK', priority: 80, stats_key: 'reg_page', route: '/facebook-jobs' },
  { task_key: 'REG_INSTAGRAM', name: 'Reg Instagram', platform: 'INSTAGRAM', priority: 70, activity_key:'REG_IG', stats_key: 'reg_instagram', route: '/facebook-reg' },
  { task_key: 'NUOI_FACEBOOK', name: 'Nuôi Facebook', platform: 'FACEBOOK', priority: 60, activity_key:'NUOI_FB', stats_key: 'nurture_facebook', route: '/facebook-nurture' },
  { task_key: 'NUOI_INSTAGRAM', name: 'Nuôi Instagram', platform: 'INSTAGRAM', priority: 50, activity_key:'NUOI_IG', stats_key: 'nurture_instagram', route: '/facebook-nurture?platform=instagram' },
];
const effectiveTasks = (registry, settings) => Object.fromEntries(registry.filter(task=>!task.archived_at).map(task=>{
  const setting=settings.find(row=>row.task_id===task.id);
  return [task.task_key,{enabled:task.enabled===true && setting?.enabled===true,priority:setting?.priority ?? task.default_priority ?? 50}];
}));
const migrateLegacyGrant = (task, legacy = {}) => {
  const defaults = BUILTIN_TASKS.find(row => row.task_key === task.task_key);
  if (!defaults) return null;
  const source = legacy.tasks?.[task.task_key] || {};
  const priority = parseInt(source.priority, 10);
  return { task_id: task.id, enabled: source.enabled === undefined ? true : source.enabled === true, priority: Number.isInteger(priority) ? Math.min(10000, Math.max(-10000, priority)) : defaults.priority };
};
const validateTask = (source) => {
  const task_key = String(source.task_key || '').trim().toUpperCase();
  const name = String(source.name || '').trim();
  if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(task_key) || !name || name.length > 100) throw Object.assign(new Error('Tên và task key hợp lệ là bắt buộc'),{statusCode:400});
  if (!['FACEBOOK','INSTAGRAM','TIKTOK','COMMON'].includes(source.platform) || typeof source.enabled !== 'boolean') throw Object.assign(new Error('Platform hoặc enabled không hợp lệ'),{statusCode:400});
  const default_priority=source.default_priority ?? 50;
  if(!Number.isInteger(default_priority)||Math.abs(default_priority)>10000)throw Object.assign(new Error('Priority mặc định không hợp lệ'),{statusCode:400});
  return { default_priority, task_key, name, platform: source.platform, enabled: source.enabled, description: String(source.description || '').slice(0,2000) };
};
module.exports = { BUILTIN_TASKS, effectiveTasks, migrateLegacyGrant, validateTask };
