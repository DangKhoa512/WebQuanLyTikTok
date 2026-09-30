const { success, error } = require('../utils/response');
const { ownerFromAdmin, normalizeOwner } = require('../utils/owner');
const User = require('../models/User');
const {
  getEligibilitySettings,
  saveEligibilitySettings,
  getChromeKhangLimitSettings,
  saveChromeKhangLimitSettings,
  getMachineApiKeys,
  saveMachineApiKeys,
  getFacebookLoginLimitSettings,
  saveFacebookLoginLimitSettings,
  getInstagramLoginLimitSettings,
  saveInstagramLoginLimitSettings,
  getJobAccountDailyLimitSettings,
  saveJobAccountDailyLimitSettings,
  getFacebookCheckProxySettings,
  saveFacebookCheckProxySettings,
  getInstagramCheckCookieSettings,
  saveInstagramCheckCookieSettings,
  getFacebookRegPageWaitSettings,
  saveFacebookRegPageWaitSettings,
  getInstagramFacebookRegSettings,
  saveInstagramFacebookRegSettings,
  getFacebookNurtureSettings,
  saveFacebookNurtureSettings,
  getInstagramNurtureSettings,
  saveInstagramNurtureSettings,
} = require('../services/settingsService');
const { checkInstagramCookies } = require('../utils/instagramCookieCheckUtils');

const getEligibility = async (req, res, next) => {
  try {
    const settings = await getEligibilitySettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lấy cài đặt đủ điều kiện thành công');
  } catch (err) {
    next(err);
  }
};

const updateEligibility = async (req, res, next) => {
  try {
    const min_age_days = parseInt(req.body.min_age_days, 10);
    const min_videos = parseInt(req.body.min_videos, 10);
    if (!Number.isInteger(min_age_days) || min_age_days <= 0) {
      return error(res, 'Số ngày phải lớn hơn 0', 400);
    }
    if (!Number.isInteger(min_videos) || min_videos <= 0) {
      return error(res, 'Số video phải lớn hơn 0', 400);
    }

    const settings = await saveEligibilitySettings(ownerFromAdmin(req), { min_age_days, min_videos });
    return success(res, { settings }, 'Đã lưu cài đặt đủ điều kiện');
  } catch (err) {
    next(err);
  }
};

const getChromeKhangLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const targetOwner = isAdmin && req.query.owner_username
      ? normalizeOwner(req.query.owner_username)
      : ownerFromAdmin(req);
    const settings = await getChromeKhangLimitSettings(targetOwner);
    settings.owner_username = targetOwner;
    settings.editable = isAdmin;
    return success(res, { settings }, 'Lay cai dat limit Chrome khang thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateChromeKhangLimit = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc sua limit Chrome khang', 403);
    }

    const owner = normalizeOwner(req.body.owner_username || ownerFromAdmin(req));
    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      return error(res, 'Limit phai lon hon 0', 400);
    }

    const settings = await saveChromeKhangLimitSettings(owner, { limit });
    settings.owner_username = owner;
    settings.editable = true;
    return success(res, { settings }, 'Da luu limit Chrome khang');
  } catch (err) {
    next(err);
  }
};

const listChromeKhangLimits = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc xem limit Chrome khang cua user', 403);
    }

    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'is_active'],
      order: [['username', 'ASC']],
      raw: true,
    });
    const rows = await Promise.all(users.map(async (user) => {
      const settings = await getChromeKhangLimitSettings(user.username);
      return { ...user, limit: settings.limit };
    }));

    return success(res, { users: rows }, 'OK');
  } catch (err) {
    next(err);
  }
};


const getFacebookLoginLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const targetOwner = isAdmin && req.query.owner_username
      ? normalizeOwner(req.query.owner_username)
      : ownerFromAdmin(req);
    const settings = await getFacebookLoginLimitSettings(targetOwner);
    settings.owner_username = targetOwner;
    settings.editable = isAdmin;
    return success(res, { settings }, 'Lay cai dat limit Facebook login thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateFacebookLoginLimit = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc sua limit Facebook login', 403);
    }

    const owner = normalizeOwner(req.body.owner_username || ownerFromAdmin(req));
    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      return error(res, 'Limit phai lon hon 0', 400);
    }

    const settings = await saveFacebookLoginLimitSettings(owner, { limit });
    settings.owner_username = owner;
    settings.editable = true;
    return success(res, { settings }, 'Da luu limit Facebook login');
  } catch (err) {
    next(err);
  }
};

const listFacebookLoginLimits = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc xem limit Facebook login cua user', 403);
    }

    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'is_active'],
      order: [['username', 'ASC']],
      raw: true,
    });
    const rows = await Promise.all(users.map(async (user) => {
      const settings = await getFacebookLoginLimitSettings(user.username);
      return { ...user, limit: settings.limit };
    }));

    return success(res, { users: rows }, 'OK');
  } catch (err) {
    next(err);
  }
};

const getInstagramLoginLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const targetOwner = isAdmin && req.query.owner_username ? normalizeOwner(req.query.owner_username) : ownerFromAdmin(req);
    const settings = await getInstagramLoginLimitSettings(targetOwner);
    settings.owner_username = targetOwner;
    settings.editable = isAdmin;
    return success(res, { settings }, 'Lay cai dat limit Instagram login thanh cong');
  } catch (err) { next(err); }
};

const updateInstagramLoginLimit = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') return error(res, 'Chi admin duoc sua limit Instagram login', 403);
    const owner = normalizeOwner(req.body.owner_username || ownerFromAdmin(req));
    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) return error(res, 'Limit phai lon hon 0', 400);
    const settings = await saveInstagramLoginLimitSettings(owner, { limit });
    settings.owner_username = owner;
    settings.editable = true;
    return success(res, { settings }, 'Da luu limit Instagram login');
  } catch (err) { next(err); }
};

const listInstagramLoginLimits = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') return error(res, 'Chi admin duoc xem limit Instagram login cua user', 403);
    const users = await User.findAll({ attributes: ['id','username','role','is_active'], order: [['username','ASC']], raw: true });
    const rows = await Promise.all(users.map(async (user) => ({ ...user, limit: (await getInstagramLoginLimitSettings(user.username)).limit })));
    return success(res, { users: rows }, 'OK');
  } catch (err) { next(err); }
};
const getJobAccountDailyLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const targetOwner = isAdmin && req.query.owner_username
      ? normalizeOwner(req.query.owner_username)
      : ownerFromAdmin(req);
    const settings = await getJobAccountDailyLimitSettings(targetOwner);
    settings.owner_username = targetOwner;
    settings.editable = true;
    return success(res, { settings }, 'Lay cai dat limit JOB thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateJobAccountDailyLimit = async (req, res, next) => {
  try {
    const isAdmin = req.admin?.role === 'admin';
    const requestedOwner = normalizeOwner(req.body.owner_username || '');
    const owner = isAdmin && requestedOwner ? requestedOwner : ownerFromAdmin(req);
    const limit = parseInt(req.body.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      return error(res, 'Limit phai lon hon 0', 400);
    }

    const settings = await saveJobAccountDailyLimitSettings(owner, { limit });
    settings.owner_username = owner;
    settings.editable = true;
    return success(res, { settings }, 'Da luu limit JOB');
  } catch (err) {
    next(err);
  }
};

const listJobAccountDailyLimits = async (req, res, next) => {
  try {
    if (req.admin?.role !== 'admin') {
      return error(res, 'Chi admin duoc xem limit JOB cua user', 403);
    }

    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'is_active'],
      order: [['username', 'ASC']],
      raw: true,
    });
    const rows = await Promise.all(users.map(async (user) => {
      const settings = await getJobAccountDailyLimitSettings(user.username);
      return { ...user, limit: settings.limit };
    }));

    return success(res, { users: rows }, 'OK');
  } catch (err) {
    next(err);
  }
};

const getMachineApiKeysSetting = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const keys = await getMachineApiKeys(owner_username);
    return success(res, { keys, editable: true }, 'Lay danh sach key API may thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateMachineApiKeysSetting = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
    const saved = await saveMachineApiKeys(keys, owner_username);
    return success(res, { keys: saved, editable: true }, 'Da luu danh sach key API may');
  } catch (err) {
    next(err);
  }
};

const getFacebookCheckProxies = async (req, res, next) => {
  try {
    const settings = await getFacebookCheckProxySettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay proxy check Facebook thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateFacebookCheckProxies = async (req, res, next) => {
  try {
    const settings = await saveFacebookCheckProxySettings(ownerFromAdmin(req), {
      proxies: req.body.proxies,
      concurrency: req.body.concurrency,
    });
    return success(res, { settings }, 'Da luu proxy check Facebook');
  } catch (err) {
    next(err);
  }
};

const getInstagramCheckCookies = async (req, res, next) => {
  try {
    const settings = await getInstagramCheckCookieSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay cookie check Instagram thanh cong');
  } catch (err) { next(err); }
};

const updateInstagramCheckCookies = async (req, res, next) => {
  try {
    const settings = await saveInstagramCheckCookieSettings(ownerFromAdmin(req), { cookies: req.body.cookies });
    return success(res, { settings }, 'Da luu cookie check Instagram');
  } catch (err) { next(err); }
};

const checkInstagramCheckCookies = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const [cookieSettings, proxySettings] = await Promise.all([
      getInstagramCheckCookieSettings(owner_username),
      getFacebookCheckProxySettings(owner_username),
    ]);
    const requestedCookies = req.body.cookies === undefined
      ? cookieSettings.cookies
      : Array.isArray(req.body.cookies) ? req.body.cookies : String(req.body.cookies || '').split(String.fromCharCode(10));
    const cookies = [...new Set(requestedCookies.map((item) => String(item || '').split(String.fromCharCode(10)).join(' ').split(String.fromCharCode(13)).join(' ').trim()).filter(Boolean))].slice(0, 30);
    if (!cookies.length) return error(res, 'Chua co cookie Instagram de kiem tra', 400);
    const checked = await checkInstagramCookies(cookies, proxySettings.proxies || [], Math.min(proxySettings.concurrency || 5, 10));
    const live = checked.results.filter((item) => item.status === 'live').length;
    const die = checked.results.filter((item) => item.status === 'die').length;
    const unknown = checked.results.length - live - die;
    return success(res, {
      live,
      die,
      unknown,
      checked_at: new Date().toISOString(),
      engine: checked.engine,
      proxy_count: checked.proxy_count,
      invalid_proxy_count: checked.invalid_proxy_count,
      results: checked.results,
    }, 'Da kiem tra cookie Instagram');
  } catch (err) { next(err); }
};
const getFacebookRegPageWait = async (req, res, next) => {
  try {
    const settings = await getFacebookRegPageWaitSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay thoi gian cho reg Page thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateFacebookRegPageWait = async (req, res, next) => {
  try {
    const hours = parseInt(req.body.hours, 10);
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) {
      return error(res, 'So gio cho reg Page phai tu 0 den 720', 400);
    }
    const settings = await saveFacebookRegPageWaitSettings(ownerFromAdmin(req), { hours });
    return success(res, { settings }, 'Da luu thoi gian cho reg Page');
  } catch (err) {
    next(err);
  }
};

const getInstagramFacebookReg = async (req, res, next) => {
  try {
    const settings = await getInstagramFacebookRegSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay cau hinh Reg Instagram bang Facebook thanh cong');
  } catch (err) { next(err); }
};

const updateInstagramFacebookReg = async (req, res, next) => {
  try {
    const reuse_hours = parseInt(req.body.reuse_hours, 10);
    const max_instagram_per_facebook = parseInt(req.body.max_instagram_per_facebook, 10);
    if (!Number.isInteger(reuse_hours) || reuse_hours < 0 || reuse_hours > 720) {
      return error(res, 'So gio mo lai phai tu 0 den 720', 400);
    }
    if (!Number.isInteger(max_instagram_per_facebook) || max_instagram_per_facebook < 1 || max_instagram_per_facebook > 100) {
      return error(res, 'Limit Instagram tren moi Facebook phai tu 1 den 100', 400);
    }
    const settings = await saveInstagramFacebookRegSettings(ownerFromAdmin(req), { reuse_hours, max_instagram_per_facebook });
    return success(res, { settings }, 'Da luu cau hinh Reg Instagram bang Facebook');
  } catch (err) { next(err); }
};
const getFacebookNurture = async (req, res, next) => {
  try {
    const settings = await getFacebookNurtureSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay cau hinh nuoi Facebook thanh cong');
  } catch (err) {
    next(err);
  }
};

const updateFacebookNurture = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.scenarios)) {
      return error(res, 'scenarios phai la danh sach', 400);
    }
    const settings = await saveFacebookNurtureSettings(ownerFromAdmin(req), req.body);
    return success(res, { settings }, 'Da luu cau hinh nuoi Facebook');
  } catch (err) {
    next(err);
  }
};

const getInstagramNurture = async (req, res, next) => {
  try {
    const settings = await getInstagramNurtureSettings(ownerFromAdmin(req));
    return success(res, { settings }, 'Lay cau hinh nuoi Instagram thanh cong');
  } catch (err) { next(err); }
};

const updateInstagramNurture = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.scenarios)) return error(res, 'scenarios phai la danh sach', 400);
    const settings = await saveInstagramNurtureSettings(ownerFromAdmin(req), req.body);
    return success(res, { settings }, 'Da luu cau hinh nuoi Instagram');
  } catch (err) { next(err); }
};
module.exports = { getEligibility, updateEligibility, getChromeKhangLimit, updateChromeKhangLimit, listChromeKhangLimits, getFacebookLoginLimit, updateFacebookLoginLimit, listFacebookLoginLimits, getInstagramLoginLimit, updateInstagramLoginLimit, listInstagramLoginLimits, getJobAccountDailyLimit, updateJobAccountDailyLimit, listJobAccountDailyLimits, getMachineApiKeysSetting, updateMachineApiKeysSetting, getFacebookCheckProxies, updateFacebookCheckProxies, getInstagramCheckCookies, updateInstagramCheckCookies, checkInstagramCheckCookies, getFacebookRegPageWait, updateFacebookRegPageWait, getInstagramFacebookReg, updateInstagramFacebookReg, getFacebookNurture, updateFacebookNurture, getInstagramNurture, updateInstagramNurture };
