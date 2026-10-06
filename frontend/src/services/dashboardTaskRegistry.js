// Task metadata comes from the server registry; unknown/new tasks require no frontend row definition.
export const dashboardTasksFromRegistry = data => (data?.task_registry || []).map(task => ({key:task.stats_key || task.task_key,title:task.name,to:task.route || null,taskKey:task.task_key,platform:task.platform,enabled:task.user_enabled===true,systemEnabled:task.enabled!==false}));
