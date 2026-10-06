import api from './api';
export const taskRegistryApi = {
  list: () => api.get('/task-registry'),
  create: (task) => api.post('/task-registry',task),
  update: (id,task) => api.patch(`/task-registry/${id}`,task),
  archive: (id) => api.post(`/task-registry/${id}/archive`),
  mine: (tasks) => api.put('/task-registry/mine',{tasks}),
};
