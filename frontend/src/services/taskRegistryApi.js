import api from './api';
export const taskRegistryApi = {
  list: () => api.get('/task-registry'),
  create: (task) => api.post('/task-registry',task),
  update: (id,task) => api.patch(`/task-registry/${id}`,task),
  archive: (id) => api.post(`/task-registry/${id}/archive`),
  mine: (tasks,task_ids) => api.put('/task-registry/mine',{tasks,...(task_ids ? {task_ids} : {})}),
  order: task_ids => api.put('/task-registry/order',{task_ids}),
};
