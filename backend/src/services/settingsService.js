const AppSetting = require('../models/AppSetting');
const { defaultOwner, normalizeOwner } = require('../utils/owner');

const ELIGIBILITY_KEY = 'eligibility';
const CHROME_KHANG_LIMIT_KEY = 'chrome_khang_daily_limit';
const DEFAULT_ELIGIBILITY = {
  min_age_days: 4,
  min_videos: 20,
};
const DEFAULT_CHROME_KHANG_DAILY_LIMIT = parseInt(process.env.CHROME_KHANG_DAILY_LIMIT, 10) || 8;

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

const isDefaultAdminOwner = (owner_username = 'admin') =>
  normalizeOwner(owner_username) === defaultOwner();

const getChromeKhangLimitSettings = async (owner_username = 'admin') => {
  if (!isDefaultAdminOwner(owner_username)) {
    return { limit: DEFAULT_CHROME_KHANG_DAILY_LIMIT, editable: false };
  }

  const stored = await getSetting(defaultOwner(), CHROME_KHANG_LIMIT_KEY);
  const normalized = normalizeChromeKhangLimit(stored || { limit: DEFAULT_CHROME_KHANG_DAILY_LIMIT });
  return { ...normalized, editable: true };
};

const saveChromeKhangLimitSettings = async (owner_username = 'admin', data = {}) => {
  if (!isDefaultAdminOwner(owner_username)) {
    return { limit: DEFAULT_CHROME_KHANG_DAILY_LIMIT, editable: false };
  }

  const normalized = normalizeChromeKhangLimit(data);
  await saveSetting(defaultOwner(), CHROME_KHANG_LIMIT_KEY, normalized);
  return { ...normalized, editable: true };
};

module.exports = {
  DEFAULT_ELIGIBILITY,
  DEFAULT_CHROME_KHANG_DAILY_LIMIT,
  getEligibilitySettings,
  saveEligibilitySettings,
  getChromeKhangLimitSettings,
  saveChromeKhangLimitSettings,
};
