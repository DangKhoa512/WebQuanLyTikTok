const AppSetting = require('../models/AppSetting');
const { defaultOwner, normalizeOwner } = require('../utils/owner');
const { TASK_TYPES, DEFAULT_TASK_DISPATCHER } = require('./deviceTaskTypes');

const ELIGIBILITY_KEY = 'eligibility';
const CHROME_KHANG_LIMIT_KEY = 'chrome_khang_daily_limit';
const FACEBOOK_LOGIN_LIMIT_KEY = 'facebook_login_machine_limit';
const INSTAGRAM_LOGIN_LIMIT_KEY = 'instagram_login_machine_limit';
const JOB_ACCOUNT_DAILY_LIMIT_KEY = 'job_account_daily_limit';
const MACHINE_API_KEYS_KEY = 'machine_api_keys';
const FACEBOOK_CHECK_PROXIES_KEY = 'facebook_check_proxies';
const INSTAGRAM_CHECK_COOKIES_KEY = 'instagram_check_cookies';
const FACEBOOK_REG_PAGE_WAIT_KEY = 'facebook_reg_page_wait_hours';
const FACEBOOK_WORKFLOW_KEY = 'facebook_workflow';
const FACEBOOK_NURTURE_KEY = 'facebook_nurture';
const INSTAGRAM_NURTURE_KEY = 'instagram_nurture';
const INSTAGRAM_FACEBOOK_REG_KEY = 'instagram_facebook_reg';
const TASK_DISPATCHER_KEY = 'task_dispatcher';
const DEFAULT_MACHINE_API_KEYS = [
  'WEB',
  'CAPTCHA_TDS',
  'XOAY_DAPHIEN',
  'LOCAL',
  'SHOP1989',
  'CAPTCHA_TIKTOK',
  'MAC',
  'KIOTPROXY',
  'XSMM',
];
const DEFAULT_ELIGIBILITY = {
  min_age_days: 4,
  min_videos: 20,
};
const DEFAULT_CHROME_KHANG_DAILY_LIMIT = parseInt(process.env.CHROME_KHANG_DAILY_LIMIT, 10) || 8;
const DEFAULT_FACEBOOK_LOGIN_MACHINE_LIMIT = parseInt(process.env.FACEBOOK_LOGIN_MACHINE_LIMIT, 10) || 10;
const DEFAULT_INSTAGRAM_LOGIN_MACHINE_LIMIT = parseInt(process.env.INSTAGRAM_LOGIN_MACHINE_LIMIT, 10) || 10;
const DEFAULT_JOB_ACCOUNT_DAILY_LIMIT = parseInt(process.env.JOB_ACCOUNT_DAILY_LIMIT, 10) || 20;
const DEFAULT_FACEBOOK_CHECK_CONCURRENCY = 20;
const DEFAULT_FACEBOOK_REG_PAGE_WAIT_HOURS = 8;
const DEFAULT_FACEBOOK_WORKFLOW = {
  reg_page_reset_hours: 24,
  reg_page_wait_hours: DEFAULT_FACEBOOK_REG_PAGE_WAIT_HOURS,
  nurture_reset_hours: 24,
  page_job_reset_hours: 24,
};
const DEFAULT_INSTAGRAM_FACEBOOK_REG = { reuse_hours: 24, max_instagram_per_facebook: 1 };
const DEFAULT_FACEBOOK_NURTURE = {
  active_scenario_id: null,
  cooldown_hours: 24,
  scenarios: [],
};
const DEFAULT_INSTAGRAM_NURTURE = {
  active_scenario_id: null,
  cooldown_hours: 24,
  scenarios: [],
};

const normalizePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeEligibility = (data = {}) => ({
  min_age_days: normalizePositiveInt(data.min_age_days, DEFAULT_ELIGIBILITY.min_age_days),
  min_videos: normalizePositiveInt(data.min_videos, DEFAULT_ELIGIBILITY.min_videos),
});
const normalizeChromeKhangLimit = (data = {}) => ({
  limit: normalizePositiveInt(data.limit, DEFAULT_CHROME_KHANG_DAILY_LIMIT),
});
const normalizeFacebookLoginLimit = (data = {}) => ({
  limit: normalizePositiveInt(data.limit, DEFAULT_FACEBOOK_LOGIN_MACHINE_LIMIT),
});
const normalizeJobAccountDailyLimit = (data = {}) => ({
  limit: normalizePositiveInt(data.limit, DEFAULT_JOB_ACCOUNT_DAILY_LIMIT),
});
const normalizeMachineApiKeys = (keys = DEFAULT_MACHINE_API_KEYS) => {
  const source = Array.isArray(keys) ? keys : DEFAULT_MACHINE_API_KEYS;
  const normalized = source
    .map((key) => String(key || '').trim().toUpperCase())
    .filter((key) => key && key.length <= 100);
  return [...new Set(normalized)];
};
const normalizeFacebookCheckProxies = (data = {}) => {
  const source = Array.isArray(data.proxies)
    ? data.proxies
    : String(data.proxies || '').split(/\r?\n/);
  const proxies = [...new Set(source.map((proxy) => String(proxy || '').trim()).filter(Boolean))];
  const parsedConcurrency = parseInt(data.concurrency, 10);
  const concurrency = Number.isInteger(parsedConcurrency)
    ? Math.min(Math.max(parsedConcurrency, 1), 40)
    : DEFAULT_FACEBOOK_CHECK_CONCURRENCY;
  return { proxies, concurrency };
};
const normalizeInstagramCheckCookies = (data = {}) => {
  const source = Array.isArray(data.cookies)
    ? data.cookies
    : String(data.cookies || '').split(/\r?\n/);
  const cookies = [];
  let totalLength = 0;
  for (const value of source) {
    const cookie = String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 6000);
    if (!cookie || cookies.includes(cookie)) continue;
    if (cookies.length >= 200 || totalLength + cookie.length > 1200000) break;
    cookies.push(cookie);
    totalLength += cookie.length;
  }
  return { cookies };
};

const normalizeFacebookRegPageWait = (data = {}) => {
  const parsedHours = parseInt(data.hours, 10);
  const hours = Number.isInteger(parsedHours)
    ? Math.min(Math.max(parsedHours, 0), 720)
    : DEFAULT_FACEBOOK_REG_PAGE_WAIT_HOURS;
  return { hours };
};

const normalizeInstagramFacebookReg = (data = {}) => {
  const parsedHours = parseInt(data.reuse_hours, 10);
  const parsedLimit = parseInt(data.max_instagram_per_facebook, 10);
  return {
    reuse_hours: Number.isInteger(parsedHours) ? Math.min(Math.max(parsedHours, 0), 720) : DEFAULT_INSTAGRAM_FACEBOOK_REG.reuse_hours,
    max_instagram_per_facebook: Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : DEFAULT_INSTAGRAM_FACEBOOK_REG.max_instagram_per_facebook,
  };
};
const normalizeNurtureRange = (data = {}) => {
  const parsedMin = parseInt(data.min, 10);
  const parsedMax = parseInt(data.max, 10);
  const min = Number.isInteger(parsedMin) ? Math.min(Math.max(parsedMin, 0), 86400) : 0;
  const maxValue = Number.isInteger(parsedMax) ? Math.min(Math.max(parsedMax, 0), 86400) : min;
  return {
    enabled: data.enabled === true,
    min,
    max: Math.max(min, maxValue),
  };
};

const normalizeFacebookWorkflow = (data = {}) => {
  const normalizeHours = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 720) : fallback;
  };
  return {
    reg_page_reset_hours: normalizeHours(data.reg_page_reset_hours, DEFAULT_FACEBOOK_WORKFLOW.reg_page_reset_hours),
    reg_page_wait_hours: normalizeHours(data.reg_page_wait_hours, DEFAULT_FACEBOOK_WORKFLOW.reg_page_wait_hours),
    nurture_reset_hours: normalizeHours(data.nurture_reset_hours, DEFAULT_FACEBOOK_WORKFLOW.nurture_reset_hours),
    page_job_reset_hours: normalizeHours(data.page_job_reset_hours, DEFAULT_FACEBOOK_WORKFLOW.page_job_reset_hours),
  };
};

const normalizeTaskDispatcher = (data = {}) => {
  const timeout = parseInt(data.lock_timeout_minutes, 10);
  const maxRetry = parseInt(data.max_retry, 10);
  const sourceTasks = data.tasks && typeof data.tasks === 'object' ? data.tasks : {};
  return {
    lock_timeout_minutes: Number.isInteger(timeout) ? Math.min(Math.max(timeout, 5), 1440) : DEFAULT_TASK_DISPATCHER.lock_timeout_minutes,
    max_retry: Number.isInteger(maxRetry) ? Math.min(Math.max(maxRetry, 0), 20) : DEFAULT_TASK_DISPATCHER.max_retry,
    tasks: Object.fromEntries(TASK_TYPES.map((taskType) => {
      const source = sourceTasks[taskType] || {};
      const priority = parseInt(source.priority, 10);
      return [taskType, {
        priority: Number.isInteger(priority)
          ? Math.min(Math.max(priority, -10000), 10000)
          : DEFAULT_TASK_DISPATCHER.tasks[taskType].priority,
        enabled: source.enabled === undefined
          ? DEFAULT_TASK_DISPATCHER.tasks[taskType].enabled
          : source.enabled === true,
      }];
    })),
  };
};

const normalizeNurtureCount = (data = {}, maxLimit = 100) => {
  const parsedMin = parseInt(data.min, 10);
  const parsedMax = parseInt(data.max, 10);
  const min = Number.isInteger(parsedMin) ? Math.min(Math.max(parsedMin, 0), maxLimit) : 0;
  const maxValue = Number.isInteger(parsedMax) ? Math.min(Math.max(parsedMax, 0), maxLimit) : min;
  return { enabled: data.enabled === true, min, max: Math.max(min, maxValue) };
};

const normalizeNurtureTargets = (data = {}, field) => {
  const raw = Array.isArray(data[field]) ? data[field] : String(data[field] || '').split(/\r?\n|,/);
  const targets = [...new Set(raw.map((value) => String(value || '').trim()).filter(Boolean))]
    .slice(0, 200)
    .map((value) => value.slice(0, 500));
  const count = normalizeNurtureCount(data, targets.length || 200);
  return { ...count, enabled: count.enabled && targets.length > 0, [field]: targets };
};

const normalizeFacebookNurtureGenerator = (data = {}) => ({
  actions: {
    newfeed: { enabled: data?.actions?.newfeed?.enabled !== false },
    reels: { enabled: data?.actions?.reels?.enabled !== false },
    like_newfeed: normalizeNurtureCount(data?.actions?.like_newfeed || { enabled: true, min: 1, max: 3 }),
    friend_request: normalizeNurtureCount(data?.actions?.friend_request || { enabled: false, min: 1, max: 3 }),
    accept_friend: normalizeNurtureCount(data?.actions?.accept_friend || { enabled: false, min: 1, max: 3 }),
    join_groups: normalizeNurtureTargets(data?.actions?.join_groups || { enabled: false, min: 1, max: 1, links: [] }, 'links'),
    like_pages: normalizeNurtureTargets(data?.actions?.like_pages || { enabled: false, min: 1, max: 1, page_uids: [] }, 'page_uids'),
  },
});

const normalizeFacebookNurture = (data = {}) => {
  const parsedCooldownHours = parseInt(data.cooldown_hours, 10);
  const cooldown_hours = Number.isInteger(parsedCooldownHours)
    ? Math.min(Math.max(parsedCooldownHours, 1), 720)
    : DEFAULT_FACEBOOK_NURTURE.cooldown_hours;
  const source = Array.isArray(data.scenarios) ? data.scenarios.slice(0, 50) : [];
  const usedIds = new Set();
  const scenarios = source.map((scenario, index) => {
    const rawId = String(scenario?.id || `scenario-${index + 1}`).trim().slice(0, 100);
    let id = rawId || `scenario-${index + 1}`;
    let duplicateSuffix = index + 1;
    while (usedIds.has(id)) {
      id = `${(rawId || 'scenario').slice(0, 90)}-${duplicateSuffix}`;
      duplicateSuffix += 1;
    }
    usedIds.add(id);
    const actions = {
      newfeed: normalizeNurtureRange(scenario?.actions?.newfeed),
      reels: normalizeNurtureRange(scenario?.actions?.reels),
      like_newfeed: normalizeNurtureRange(scenario?.actions?.like_newfeed),
      friend_request: normalizeNurtureCount(scenario?.actions?.friend_request),
      accept_friend: normalizeNurtureCount(scenario?.actions?.accept_friend),
      join_groups: normalizeNurtureTargets(scenario?.actions?.join_groups, 'links'),
      like_pages: normalizeNurtureTargets(scenario?.actions?.like_pages, 'page_uids'),
    };
    return {
      id,
      name: String(scenario?.name || `Kich ban ${index + 1}`).trim().slice(0, 100) || `Kich ban ${index + 1}`,
      total_duration_seconds: {
        min: (actions.newfeed.enabled ? actions.newfeed.min : 0)
          + (actions.reels.enabled ? actions.reels.min : 0),
        max: (actions.newfeed.enabled ? actions.newfeed.max : 0)
          + (actions.reels.enabled ? actions.reels.max : 0),
      },
      actions,
    };
  });
  const requestedActiveId = String(data.active_scenario_id || '').trim();
  return {
    active_scenario_id: scenarios.some((scenario) => scenario.id === requestedActiveId)
      ? requestedActiveId
      : null,
    cooldown_hours,
    generator_config: normalizeFacebookNurtureGenerator(data.generator_config),
    scenarios,
  };
};

const normalizeInstagramNurture = (data = {}) => {
  const parsedCooldownHours = parseInt(data.cooldown_hours, 10);
  const cooldown_hours = Number.isInteger(parsedCooldownHours)
    ? Math.min(Math.max(parsedCooldownHours, 1), 720)
    : DEFAULT_INSTAGRAM_NURTURE.cooldown_hours;
  const source = Array.isArray(data.scenarios) ? data.scenarios.slice(0, 50) : [];
  const usedIds = new Set();
  const scenarios = source.map((scenario, index) => {
    const rawId = String(scenario?.id || `scenario-${index + 1}`).trim().slice(0, 100);
    let id = rawId || `scenario-${index + 1}`;
    let duplicateSuffix = index + 1;
    while (usedIds.has(id)) {
      id = `${(rawId || 'scenario').slice(0, 90)}-${duplicateSuffix}`;
      duplicateSuffix += 1;
    }
    usedIds.add(id);
    const actions = {
      newfeed: normalizeNurtureRange(scenario?.actions?.newfeed),
      reels: normalizeNurtureRange(scenario?.actions?.reels),
      story: normalizeNurtureRange(scenario?.actions?.story || scenario?.actions?.str),
    };
    return {
      id,
      name: String(scenario?.name || `Kich ban ${index + 1}`).trim().slice(0, 100) || `Kich ban ${index + 1}`,
      total_duration_seconds: {
        min: Object.values(actions).reduce((sum, action) => sum + (action.enabled ? action.min : 0), 0),
        max: Object.values(actions).reduce((sum, action) => sum + (action.enabled ? action.max : 0), 0),
      },
      actions,
    };
  });
  const requestedActiveId = String(data.active_scenario_id || '').trim();
  return {
    active_scenario_id: scenarios.some((scenario) => scenario.id === requestedActiveId) ? requestedActiveId : null,
    cooldown_hours,
    scenarios,
  };
};
const getSetting = async (owner_username, setting_key) => {
  const row = await AppSetting.findOne({ where: { owner_username, setting_key } });
  if (!row) return null;
  try {
    return JSON.parse(row.setting_value);
  } catch (_) {
    return null;
  }
};

const saveSetting = async (owner_username, setting_key, value) => {
  const setting_value = JSON.stringify(value);
  const [row, created] = await AppSetting.findOrCreate({
    where: { owner_username, setting_key },
    defaults: { owner_username, setting_key, setting_value },
  });
  if (!created) await row.update({ setting_value });
  return value;
};

const getEligibilitySettings = async (owner_username = 'admin') => {
  const stored = await getSetting(owner_username, ELIGIBILITY_KEY);
  return normalizeEligibility(stored || DEFAULT_ELIGIBILITY);
};

const saveEligibilitySettings = async (owner_username = 'admin', data = {}) => {
  const normalized = normalizeEligibility(data);
  return saveSetting(owner_username, ELIGIBILITY_KEY, normalized);
};

const getChromeKhangLimitSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, CHROME_KHANG_LIMIT_KEY);
  const normalized = normalizeChromeKhangLimit(stored || { limit: DEFAULT_CHROME_KHANG_DAILY_LIMIT });
  return normalized;
};

const saveChromeKhangLimitSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeChromeKhangLimit(data);
  await saveSetting(owner, CHROME_KHANG_LIMIT_KEY, normalized);
  return normalized;
};

const getFacebookLoginLimitSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, FACEBOOK_LOGIN_LIMIT_KEY);
  return normalizeFacebookLoginLimit(stored || { limit: DEFAULT_FACEBOOK_LOGIN_MACHINE_LIMIT });
};

const saveFacebookLoginLimitSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookLoginLimit(data);
  await saveSetting(owner, FACEBOOK_LOGIN_LIMIT_KEY, normalized);
  return normalized;
};

const getInstagramLoginLimitSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, INSTAGRAM_LOGIN_LIMIT_KEY);
  return normalizeFacebookLoginLimit(stored || { limit: DEFAULT_INSTAGRAM_LOGIN_MACHINE_LIMIT });
};

const saveInstagramLoginLimitSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookLoginLimit(data);
  await saveSetting(owner, INSTAGRAM_LOGIN_LIMIT_KEY, normalized);
  return normalized;
};
const getJobAccountDailyLimitSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, JOB_ACCOUNT_DAILY_LIMIT_KEY);
  return normalizeJobAccountDailyLimit(stored || { limit: DEFAULT_JOB_ACCOUNT_DAILY_LIMIT });
};

const saveJobAccountDailyLimitSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeJobAccountDailyLimit(data);
  await saveSetting(owner, JOB_ACCOUNT_DAILY_LIMIT_KEY, normalized);
  return normalized;
};

const getMachineApiKeys = async (owner_username = defaultOwner()) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, MACHINE_API_KEYS_KEY);
  return stored && Array.isArray(stored.keys)
    ? normalizeMachineApiKeys(stored.keys)
    : [...DEFAULT_MACHINE_API_KEYS];
};

const saveMachineApiKeys = async (keys = DEFAULT_MACHINE_API_KEYS, owner_username = defaultOwner()) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeMachineApiKeys(keys);
  await saveSetting(owner, MACHINE_API_KEYS_KEY, { keys: normalized });
  return normalized;
};

const getFacebookCheckProxySettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, FACEBOOK_CHECK_PROXIES_KEY);
  return normalizeFacebookCheckProxies(stored || { proxies: [] });
};

const saveFacebookCheckProxySettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookCheckProxies(data);
  await saveSetting(owner, FACEBOOK_CHECK_PROXIES_KEY, normalized);
  return normalized;
};

const getInstagramCheckCookieSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, INSTAGRAM_CHECK_COOKIES_KEY);
  return normalizeInstagramCheckCookies(stored || { cookies: [] });
};

const saveInstagramCheckCookieSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeInstagramCheckCookies(data);
  await saveSetting(owner, INSTAGRAM_CHECK_COOKIES_KEY, normalized);
  return normalized;
};

const getFacebookRegPageWaitSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, FACEBOOK_REG_PAGE_WAIT_KEY);
  return normalizeFacebookRegPageWait(stored || { hours: DEFAULT_FACEBOOK_REG_PAGE_WAIT_HOURS });
};

const saveFacebookRegPageWaitSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookRegPageWait(data);
  await saveSetting(owner, FACEBOOK_REG_PAGE_WAIT_KEY, normalized);
  return normalized;
};

const getFacebookWorkflowSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, FACEBOOK_WORKFLOW_KEY);
  if (stored) return normalizeFacebookWorkflow(stored);
  const [legacyWait, legacyNurture] = await Promise.all([
    getSetting(owner, FACEBOOK_REG_PAGE_WAIT_KEY),
    getSetting(owner, FACEBOOK_NURTURE_KEY),
  ]);
  return normalizeFacebookWorkflow({
    reg_page_wait_hours: legacyWait?.hours,
    nurture_reset_hours: legacyNurture?.cooldown_hours,
  });
};

const saveFacebookWorkflowSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookWorkflow(data);
  await saveSetting(owner, FACEBOOK_WORKFLOW_KEY, normalized);
  await saveSetting(owner, FACEBOOK_REG_PAGE_WAIT_KEY, { hours: normalized.reg_page_wait_hours });
  const storedNurture = await getSetting(owner, FACEBOOK_NURTURE_KEY);
  if (storedNurture) {
    const nurture = normalizeFacebookNurture({ ...storedNurture, cooldown_hours: normalized.nurture_reset_hours });
    await saveSetting(owner, FACEBOOK_NURTURE_KEY, nurture);
  }
  return normalized;
};

const getInstagramFacebookRegSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, INSTAGRAM_FACEBOOK_REG_KEY);
  return normalizeInstagramFacebookReg(stored || DEFAULT_INSTAGRAM_FACEBOOK_REG);
};

const saveInstagramFacebookRegSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeInstagramFacebookReg(data);
  await saveSetting(owner, INSTAGRAM_FACEBOOK_REG_KEY, normalized);
  return normalized;
};
const getFacebookNurtureSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const [stored, workflow] = await Promise.all([
    getSetting(owner, FACEBOOK_NURTURE_KEY),
    getFacebookWorkflowSettings(owner),
  ]);
  return normalizeFacebookNurture({
    ...(stored || DEFAULT_FACEBOOK_NURTURE),
    cooldown_hours: workflow.nurture_reset_hours,
  });
};

const saveFacebookNurtureSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeFacebookNurture(data);
  await saveSetting(owner, FACEBOOK_NURTURE_KEY, normalized);
  return normalized;
};

const getInstagramNurtureSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, INSTAGRAM_NURTURE_KEY);
  return normalizeInstagramNurture(stored || DEFAULT_INSTAGRAM_NURTURE);
};

const saveInstagramNurtureSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeInstagramNurture(data);
  await saveSetting(owner, INSTAGRAM_NURTURE_KEY, normalized);
  return normalized;
};

const getTaskDispatcherSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, TASK_DISPATCHER_KEY);
  return normalizeTaskDispatcher(stored || DEFAULT_TASK_DISPATCHER);
};

const saveTaskDispatcherSettings = async (owner_username = 'admin', data = {}) => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const normalized = normalizeTaskDispatcher(data);
  await saveSetting(owner, TASK_DISPATCHER_KEY, normalized);
  return normalized;
};
module.exports = {
  DEFAULT_ELIGIBILITY,
  DEFAULT_CHROME_KHANG_DAILY_LIMIT,
  DEFAULT_FACEBOOK_LOGIN_MACHINE_LIMIT,
  DEFAULT_INSTAGRAM_LOGIN_MACHINE_LIMIT,
  DEFAULT_JOB_ACCOUNT_DAILY_LIMIT,
  DEFAULT_MACHINE_API_KEYS,
  DEFAULT_FACEBOOK_NURTURE,
  DEFAULT_INSTAGRAM_NURTURE,
  DEFAULT_INSTAGRAM_FACEBOOK_REG,
  DEFAULT_FACEBOOK_WORKFLOW,
  DEFAULT_TASK_DISPATCHER,
  getEligibilitySettings,
  saveEligibilitySettings,
  getChromeKhangLimitSettings,
  saveChromeKhangLimitSettings,
  getFacebookLoginLimitSettings,
  saveFacebookLoginLimitSettings,
  getInstagramLoginLimitSettings,
  saveInstagramLoginLimitSettings,
  getJobAccountDailyLimitSettings,
  saveJobAccountDailyLimitSettings,
  getMachineApiKeys,
  saveMachineApiKeys,
  getFacebookCheckProxySettings,
  saveFacebookCheckProxySettings,
  getInstagramCheckCookieSettings,
  saveInstagramCheckCookieSettings,
  getFacebookRegPageWaitSettings,
  saveFacebookRegPageWaitSettings,
  getFacebookWorkflowSettings,
  saveFacebookWorkflowSettings,
  getInstagramFacebookRegSettings,
  saveInstagramFacebookRegSettings,
  getFacebookNurtureSettings,
  saveFacebookNurtureSettings,
  getInstagramNurtureSettings,
  saveInstagramNurtureSettings,
  getTaskDispatcherSettings,
  saveTaskDispatcherSettings,
};
