const AppSetting = require('../models/AppSetting');
const { defaultOwner, normalizeOwner } = require('../utils/owner');

const ELIGIBILITY_KEY = 'eligibility';
const CHROME_KHANG_LIMIT_KEY = 'chrome_khang_daily_limit';
const FACEBOOK_LOGIN_LIMIT_KEY = 'facebook_login_machine_limit';
const INSTAGRAM_LOGIN_LIMIT_KEY = 'instagram_login_machine_limit';
const JOB_ACCOUNT_DAILY_LIMIT_KEY = 'job_account_daily_limit';
const MACHINE_API_KEYS_KEY = 'machine_api_keys';
const FACEBOOK_CHECK_PROXIES_KEY = 'facebook_check_proxies';
const FACEBOOK_REG_PAGE_WAIT_KEY = 'facebook_reg_page_wait_hours';
const FACEBOOK_NURTURE_KEY = 'facebook_nurture';
const INSTAGRAM_NURTURE_KEY = 'instagram_nurture';
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
const normalizeFacebookRegPageWait = (data = {}) => {
  const parsedHours = parseInt(data.hours, 10);
  const hours = Number.isInteger(parsedHours)
    ? Math.min(Math.max(parsedHours, 0), 720)
    : DEFAULT_FACEBOOK_REG_PAGE_WAIT_HOURS;
  return { hours };
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

const getFacebookNurtureSettings = async (owner_username = 'admin') => {
  const owner = normalizeOwner(owner_username) || defaultOwner();
  const stored = await getSetting(owner, FACEBOOK_NURTURE_KEY);
  return normalizeFacebookNurture(stored || DEFAULT_FACEBOOK_NURTURE);
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
module.exports = {
  DEFAULT_ELIGIBILITY,
  DEFAULT_CHROME_KHANG_DAILY_LIMIT,
  DEFAULT_FACEBOOK_LOGIN_MACHINE_LIMIT,
  DEFAULT_INSTAGRAM_LOGIN_MACHINE_LIMIT,
  DEFAULT_JOB_ACCOUNT_DAILY_LIMIT,
  DEFAULT_MACHINE_API_KEYS,
  DEFAULT_FACEBOOK_NURTURE,
  DEFAULT_INSTAGRAM_NURTURE,
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
  getFacebookRegPageWaitSettings,
  saveFacebookRegPageWaitSettings,
  getFacebookNurtureSettings,
  saveFacebookNurtureSettings,
  getInstagramNurtureSettings,
  saveInstagramNurtureSettings,
};
