import axios from 'axios';

const TOKEN_KEY = 'tiktok_admin_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL + '/api'
    : '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: auto-attach JWT ─────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: unwrap body, handle 401 ────────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data, // returns { success, message, data }
  (err) => {
    // Token expired or invalid → force logout
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login') {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/login';
      }
    }
    const message =
      err.response?.data?.message || err.message || 'Có lỗi xảy ra';
    return Promise.reject(new Error(message));
  }
);

// ── Auth endpoints ────────────────────────────────────────────────────────────
export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me:    ()                   => api.get('/auth/me'),
};

// ── Account endpoints ─────────────────────────────────────────────────────────
export const accountApi = {
  getAll:  (params)       => api.get('/accounts', { params }),
  getById: (id)           => api.get(`/accounts/${id}`),
  update:  (id, data)     => api.patch(`/accounts/${id}`, data),
  // Import
  import: (text, status = 'REG_DA_LAM', group_id = null) =>
    api.post('/accounts/import', { text, status, group_id }),
  // Live check & promote
  checkLive: (ids = [], proxies = [], concurrency = 5, delay_ms = 1000) =>
    api.post('/accounts/check-live', { ids, proxies, concurrency, delay_ms }, { timeout: 600_000 }),
  promoteEligible: (min_age_days = 4, min_videos = 10) =>
    api.post('/accounts/promote-eligible', { min_age_days, min_videos }),
  // Bulk operations
  bulkAction: (ids, action, opts = {}) =>
    api.post('/accounts/bulk-action', { ids, action, ...opts }),
  bulkGet: (ids, format = 'pipe') =>
    api.post('/accounts/bulk-get', { ids, format }),
  bulkDelete: (ids) =>
    api.post('/accounts/bulk-delete', { ids }),
  copyUnused: (status = 'DAT_CHI_TIEU', mark_used = false, limit = 500) =>
    api.post('/accounts/copy-unused', { status, mark_used, limit }),
};

// ── Chrome Account endpoints (Loại 2) ────────────────────────────────────────
export const chromeAccountApi = {
  getAll:  (params)       => api.get('/chrome-accounts', { params }),
  getById: (id)           => api.get(`/chrome-accounts/${id}`),
  update:  (id, data)     => api.patch(`/chrome-accounts/${id}`, data),
  import:  (text, status = 'ACC_LOGIN', group_id = null) =>
    api.post('/chrome-accounts/import', { text, status, group_id }),
  checkLive: (ids, proxies, concurrency, delay_ms) =>
    api.post('/chrome-accounts/check-live', { ids, proxies, concurrency, delay_ms }, { timeout: 600_000 }),
  promoteEligible: (min_age_days = 4, min_videos = 10) =>
    api.post('/chrome-accounts/promote-eligible', { min_age_days, min_videos }),
  bulkAction: (ids, action, opts = {}) =>
    api.post('/chrome-accounts/bulk-action', { ids, action, ...opts }),
  bulkGet: (ids, format = 'pipe') =>
    api.post('/chrome-accounts/bulk-get', { ids, format }),
  bulkDelete: (ids) =>
    api.post('/chrome-accounts/bulk-delete', { ids }),
};

// ── Stats endpoints ───────────────────────────────────────────────────────────
export const statsApi = {
  getStats:      ()     => api.get('/stats', { timeout: 60_000 }),
  getDailyStats: (days) => api.get('/stats/daily', { params: { days }, timeout: 60_000 }),
  getDeviceStats: ()    => api.get('/stats/devices', { timeout: 60_000 }),
  getJobStats:      ()     => api.get('/stats/job', { timeout: 60_000 }),
  getJobDailyStats: (days) => api.get('/stats/job/daily', { params: { days }, timeout: 60_000 }),
  getJobDeviceStats: ()    => api.get('/stats/job/devices', { timeout: 60_000 }),
};

export const userApi = {
  getAll:  ()         => api.get('/users'),
  create:  (data)     => api.post('/users', data),
  update:  (id, data) => api.patch(`/users/${id}`, data),
};

export const usedAccountApi = {
  getAll: (params) => api.get('/used-accounts', { params }),
  bulkDelete: (ids) => api.post('/used-accounts/bulk-delete', { ids }),
};

export const jobApi = {
  getAll: (params) => api.get('/jobs', { params }),
  import: (text, group_id = null) => api.post('/jobs/import', { text, group_id }),
  checkLive: (ids, proxies, concurrency, delay_ms) =>
    api.post('/jobs/check-live', { ids, proxies, concurrency, delay_ms }, { timeout: 600_000 }),
  bulkAction: (ids, action, opts = {}) =>
    api.post('/jobs/bulk-action', { ids, action, ...opts }),
  bulkGet: (ids, format = 'pipe') =>
    api.post('/jobs/bulk-get', { ids, format }),
  bulkDelete: (ids) => api.post('/jobs/bulk-delete', { ids }),
};

export const accountGroupApi = {
  getAll: (account_type) => api.get('/account-groups', { params: { account_type } }),
  create: (account_type, name, note = '') => api.post('/account-groups', { account_type, name, note }),
  update: (id, data) => api.patch(`/account-groups/${id}`, data),
  delete: (id) => api.delete(`/account-groups/${id}`),
};

// ── Export endpoints ──────────────────────────────────────────────────────────
export const exportApi = {
  summary: () => api.get('/export/summary'),

  /**
   * Download file — không dùng axios interceptor,
   * dùng fetch trực tiếp để lấy blob
   */
  download(status = 'ALL', format = 'txt', fields = 'pipe') {
    const token   = localStorage.getItem('tiktok_admin_token');
    const base    = import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL + '/api'
      : '/api';
    const url = `${base}/export/accounts?status=${status}&format=${format}&fields=${fields}`;

    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) throw new Error('Export thất bại');
      const blob        = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match       = disposition.match(/filename="?([^"]+)"?/);
      const filename    = match ? match[1] : `accounts_${status}_${format}`;

      // Trigger browser download
      const link  = document.createElement('a');
      link.href   = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      return filename;
    });
  },
};

export default api;
