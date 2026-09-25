const { Op } = require('sequelize');
const { randomUUID } = require('crypto');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPageJob = require('../models/FacebookPageJob');
const FacebookRegPageReport = require('../models/FacebookRegPageReport');
const FacebookNurtureAssignment = require('../models/FacebookNurtureAssignment');
const FacebookNurtureLog = require('../models/FacebookNurtureLog');
const AccountGroup = require('../models/AccountGroup');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const {
  getFacebookLoginLimitSettings,
  getFacebookCheckProxySettings,
  getFacebookRegPageWaitSettings,
  getFacebookNurtureSettings,
} = require('../services/settingsService');
const { FACEBOOK_JOB_WEBS, normalizeFacebookJobWeb, addFacebookDailyJobs, addFacebookPageClaim } = require('../services/facebookJobStatService');
const { parseProxy } = require('../utils/checkLiveUtils');

const STATUSES = ['CHO_LOGIN', 'DANG_LOGIN', 'DANG_LAM', 'LOGIN_THANH_CONG', 'LOGIN_FAIL', 'DA_CHAY_XONG', 'ACCOUNT_DIE'];
const FINAL_STATUSES = ['LOGIN_FAIL', 'DA_CHAY_XONG', 'ACCOUNT_DIE'];
const KINDS = ['reg', 'job'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.FACEBOOK_LOCK_TIMEOUT_MIN, 10) || 120;
const MAX_LOGIN_GET_COUNT = 3;
const REG_PAGE_MAX_PAGES = 15;
const REG_PAGE_COOLDOWN_HOURS = 24;
const NURTURE_STATUSES = ['CHUA_NUOI', 'DANG_NUOI', 'DA_NUOI', 'NUOI_FAIL'];
const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const vietnamToday = () => VN_DATE_FORMATTER.format(new Date());
const parseNonNegativeInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
const nullify = (value) => {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized.toLowerCase() === 'null' ? null : normalized;
};

const splitLines = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const pipeValue = (value) => value === undefined || value === null || value === '' ? 'null' : String(value);

const normalizeKind = (value, fallback = 'job') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return KINDS.includes(normalized) ? normalized : fallback;
};

const groupTypeForKind = (kind) => kind === 'reg' ? 'facebook_reg' : 'facebook_job';

const resolveGroupId = async ({ group_id, group_name, owner_username, kind }) => {
  const numericId = parseInt(group_id, 10);
  const account_type = groupTypeForKind(kind);
  if (Number.isInteger(numericId) && numericId > 0) {
    const group = await AccountGroup.findOne({ where: { id: numericId, owner_username, account_type } });
    return group ? group.id : null;
  }
  const name = nullify(group_name);
  if (!name) return null;
  const [group] = await AccountGroup.findOrCreate({
    where: { owner_username, account_type, name },
    defaults: { owner_username, account_type, name },
  });
  return group.id;
};

const normalizeStatus = (value, fallback = 'CHO_LOGIN') => {
  const normalized = String(value || fallback).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['DIE', 'ACC_DIE', 'ACCOUNT_DIE'].includes(normalized)) return 'ACCOUNT_DIE';
  return STATUSES.includes(normalized) ? normalized : fallback;
};

const looksLikeEmail = (value) => /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(String(value || '').trim());
const looksLikeCookie = (value) => /(^|[;\s])(c_user|xs|fr|datr|sb|presence|wd|locale|m_pixel_ratio)=/i.test(String(value || ''));
const looksLikeToken = (value) => {
  const text = String(value || '').trim();
  return /^(EA[A-Za-z0-9]|EAA[A-Za-z0-9]|EAAB|EAAG)/.test(text)
    || /(^|[;\s])(access_token|token|fb_dtsg|lsd)=/i.test(text);
};
const looksLikeClientId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const looksLikeRefreshToken = (value) => {
  const text = String(value || '').trim();
  if (!text || looksLikeEmail(text) || looksLikeCookie(text) || looksLikeToken(text) || looksLikeClientId(text)) return false;
  return /^M\./i.test(text) || /MsaArtifacts/i.test(text) || (text.length > 120 && /[!*_$.-]/.test(text));
};
const looksLikeTwoFa = (value) => {
  const text = String(value || '').replace(/\s+/g, '').trim();
  if (!text || looksLikeEmail(text) || looksLikeCookie(text) || looksLikeToken(text) || looksLikeClientId(text) || looksLikeRefreshToken(text)) return false;
  if (text.length < 8 || text.length > 80) return false;
  return /^[A-Z2-7]+$/i.test(text);
};
const uidFromCookie = (value) => {
  const match = String(value || '').match(/(?:^|[;\s])c_user=(\d+)/i);
  return match ? match[1] : null;
};
const looksLikeUid = (value) => /^\d{5,30}$/.test(String(value || '').trim());

const parseFacebookLine = (line) => {
  const parts = String(line || '').split('|').map((part) => part.trim()).filter((part) => part !== '');
  if (!parts.length) return null;

  const cookiePart = parts.find(looksLikeCookie);
  const uid = nullify(looksLikeUid(parts[0]) ? parts[0] : uidFromCookie(cookiePart) || parts[0]);
  if (!uid) return null;

  const parsed = {
    raw_data: String(line || '').trim(),
    uid,
    password: null,
    two_fa: null,
    cookies: null,
    token: null,
    email: null,
    email_pass: null,
    refresh_token: null,
    client_id: null,
  };

  const firstUidIndex = parts.findIndex((part) => part === uid || uidFromCookie(part) === uid);
  let emailIndex = -1;
  const used = new Set();
  if (firstUidIndex >= 0) used.add(firstUidIndex);

  for (let i = 0; i < parts.length; i += 1) {
    if (used.has(i)) continue;
    const value = nullify(parts[i]);
    if (!value) continue;
    if (!parsed.cookies && looksLikeCookie(value)) { parsed.cookies = value; used.add(i); }
    else if (!parsed.token && looksLikeToken(value)) { parsed.token = value; used.add(i); }
    else if (!parsed.email && looksLikeEmail(value)) { parsed.email = value; emailIndex = i; used.add(i); }
    else if (!parsed.client_id && looksLikeClientId(value)) { parsed.client_id = value; used.add(i); }
    else if (!parsed.refresh_token && looksLikeRefreshToken(value)) { parsed.refresh_token = value; used.add(i); }
  }

  const passwordIndex = firstUidIndex >= 0 ? firstUidIndex + 1 : 1;
  if (passwordIndex < parts.length && !used.has(passwordIndex)) {
    const candidate = nullify(parts[passwordIndex]);
    if (candidate && !looksLikeCookie(candidate) && !looksLikeToken(candidate) && !looksLikeEmail(candidate) && !looksLikeTwoFa(candidate)) {
      parsed.password = candidate;
      used.add(passwordIndex);
    }
  }

  for (let i = 0; i < parts.length; i += 1) {
    if (used.has(i)) continue;
    const value = nullify(parts[i]);
    if (!value) continue;
    if (!parsed.two_fa && looksLikeTwoFa(value)) { parsed.two_fa = value; used.add(i); continue; }
    if (!parsed.email_pass && parsed.email && i === emailIndex + 1 && !looksLikeCookie(value) && !looksLikeToken(value) && !looksLikeEmail(value) && !looksLikeClientId(value) && !looksLikeRefreshToken(value)) {
      parsed.email_pass = value;
      used.add(i);
      continue;
    }
    if (!parsed.email_pass && parsed.email && !looksLikeCookie(value) && !looksLikeToken(value) && !looksLikeEmail(value) && !looksLikeClientId(value) && !looksLikeRefreshToken(value)) {
      parsed.email_pass = value;
      used.add(i);
      continue;
    }
    if (!parsed.password && i > firstUidIndex && !looksLikeCookie(value) && !looksLikeToken(value) && !looksLikeEmail(value)) {
      parsed.password = value;
      used.add(i);
    }
  }

  return parsed;
};

const isFacebookSessionRefresh = (parsed) => Boolean(
  parsed?.uid
  && parsed.cookies
  && parsed.token
  && !parsed.password
  && !parsed.two_fa
  && !parsed.email
  && !parsed.email_pass
  && !parsed.refresh_token
  && !parsed.client_id
);

const formatFacebookPipe = (account) => {
  const hasMailExtras = account.email_pass || account.refresh_token || account.client_id;
  const values = account.two_fa
    ? [account.uid, account.password, account.two_fa, account.cookies, account.token, account.email]
    : [account.uid, account.password, account.cookies, account.token, account.email];
  if (hasMailExtras) values.push(account.email_pass, account.refresh_token, account.client_id);
  return values.map(pipeValue).join('|');
};

const safeParseJson = (value, fallback = null) => {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
};

const hydrateFacebookData = (account) => {
  const data = account?.toJSON ? account.toJSON() : { ...account };
  const rawParsed = data.raw_data ? parseFacebookLine(data.raw_data) : null;
  if (rawParsed && (!data.uid || rawParsed.uid === data.uid)) {
    for (const field of ['password', 'two_fa', 'cookies', 'token', 'email', 'email_pass', 'refresh_token', 'client_id']) {
      if (!data[field] && rawParsed[field]) data[field] = rawParsed[field];
    }
  }
  data.pages = safeParseJson(data.pages, []);
  data.page_count = Number(data.page_count || (Array.isArray(data.pages) ? data.pages.length : 0)) || 0;
  return data;
};

const serialize = (account) => {
  const data = hydrateFacebookData(account);
  const converted = formatFacebookPipe(data);
  data.raw_data = converted;
  data.full_data = converted;
  return data;
};

const summarizePageJobs = (rows = []) => {
  const activeRows = rows.filter((row) => row.is_active !== false);
  const completed = activeRows.filter((row) => row.job_status === 'DA_LAM').length;
  const working = activeRows.filter((row) => row.job_status === 'DANG_LAM').length;
  return { total: activeRows.length, completed, working, pending: activeRows.length - completed - working };
};

const syncFacebookPageJobs = async (account, pages, transaction = null) => {
  if (!account || account.kind !== 'job' || !Array.isArray(pages)) return;
  const normalizedPages = pages
    .map((page) => ({ page_id: nullify(page?.id), page_name: nullify(page?.name) }))
    .filter((page) => page.page_id);
  const pageIds = [...new Set(normalizedPages.map((page) => page.page_id))];
  const inactiveWhere = { owner_username: account.owner_username, facebook_account_id: account.id };
  if (pageIds.length) inactiveWhere.page_id = { [Op.notIn]: pageIds };
  await FacebookPageJob.update({ is_active: false }, { where: inactiveWhere, transaction });

  for (const page of normalizedPages) {
    const [pageJob, created] = await FacebookPageJob.findOrCreate({
      where: { owner_username: account.owner_username, page_id: page.page_id },
      defaults: {
        owner_username: account.owner_username,
        facebook_account_id: account.id,
        page_id: page.page_id,
        page_name: page.page_name,
        job_status: 'CHUA_LAM',
        is_active: true,
      },
      transaction,
    });
    if (!created) {
      await pageJob.update({
        facebook_account_id: account.id,
        page_name: page.page_name || pageJob.page_name,
        is_active: true,
      }, { transaction });
    }
  }
};

const getActivePageJobs = async (account) => {
  const data = hydrateFacebookData(account);
  if (account.kind === 'job' && account.last_page_check_at) {
    await syncFacebookPageJobs(account, data.pages);
  }
  return FacebookPageJob.findAll({
    where: { owner_username: account.owner_username, facebook_account_id: account.id, is_active: true },
    order: [['id', 'ASC']],
  });
};

const serializeForPhone = async (account, currentPageJob = null) => {
  const data = serialize(account);
  const pageJobs = await getActivePageJobs(account);
  const graphPages = new Map(data.pages.map((page) => [String(page.id), page]));
  data.job_pages = pageJobs.map((row) => {
    const page = row.toJSON();
    const graphPage = graphPages.get(String(page.page_id));
    return {
      page_id: page.page_id,
      page_name: page.page_name,
      status: page.job_status,
      access_token: graphPage?.access_token || null,
      tasks: Array.isArray(graphPage?.tasks) ? graphPage.tasks : [],
    };
  });
  data.page_job_summary = summarizePageJobs(pageJobs.map((row) => row.toJSON()));
  data.current_page = currentPageJob
    ? data.job_pages.find((page) => page.page_id === currentPageJob.page_id) || null
    : null;
  return data;
};

const claimPageForPhone = async ({ account, device_id }) => {
  const data = hydrateFacebookData(account);
  if (account.last_page_check_at) await syncFacebookPageJobs(account, data.pages);

  return sequelize.transaction(async (transaction) => {
    const lockedAccount = await FacebookAccount.findOne({
      where: { id: account.id, owner_username: account.owner_username, kind: 'job' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedAccount) return null;

    let pageJob = await FacebookPageJob.findOne({
      where: {
        owner_username: account.owner_username,
        facebook_account_id: account.id,
        is_active: true,
        job_status: 'DANG_LAM',
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (pageJob) {
      if (pageJob.device_id !== device_id) await pageJob.update({ device_id }, { transaction });
      return pageJob;
    }

    pageJob = await FacebookPageJob.findOne({
      where: {
        owner_username: account.owner_username,
        facebook_account_id: account.id,
        is_active: true,
        job_status: 'CHUA_LAM',
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (!pageJob) return null;
    await pageJob.update({ job_status: 'DANG_LAM', device_id }, { transaction });
    await addFacebookPageClaim({ owner_username: account.owner_username, device_id, stat_date: vietnamToday(), transaction });
    return pageJob;
  });
};

const countDeviceFacebookLoginActive = async ({ owner_username, device_id, groupId = null, transaction = null }) => {
  const where = {
    owner_username,
    kind: 'job',
    status: { [Op.in]: ['DANG_LOGIN', 'LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'] },
    [Op.and]: [
      { [Op.or]: [{ device_id }, { locked_by: device_id }] },
      { [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }] },
    ],
  };
  if (groupId) where.group_id = groupId;
  return FacebookAccount.count({ where, transaction });
};

const getDeviceFacebookAccountSummary = async ({ owner_username, device_id, groupId = null }) => {
  const deviceWhere = {
    owner_username,
    kind: 'job',
    [Op.or]: [{ device_id }, { locked_by: device_id }],
  };
  if (groupId) deviceWhere.group_id = groupId;
  const activeLiveWhere = {
    ...deviceWhere,
    [Op.and]: [{ [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }] }],
  };
  const [rows, used, loginSuccess] = await Promise.all([
    FacebookAccount.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: deviceWhere,
      group: ['status'],
      raw: true,
    }),
    countDeviceFacebookLoginActive({ owner_username, device_id, groupId }),
    FacebookAccount.count({
      where: {
        ...activeLiveWhere,
        status: { [Op.in]: ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'] },
      },
    }),
  ]);
  const status_counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count) || 0]));
  const total = Object.values(status_counts).reduce((sum, value) => sum + value, 0);
  const settings = await getFacebookLoginLimitSettings(owner_username);
  return {
    device_id,
    group_id: groupId || null,
    total,
    login_success: loginSuccess,
    pending_login: status_counts.DANG_LOGIN || 0,
    used,
    limit: settings.limit,
    remaining: Math.max(settings.limit - used, 0),
    full: used >= settings.limit,
    status_counts,
  };
};
const resolveJobGroupIdForRequest = async (req, owner_username) => {
  const rawGroupId = req.body.group_id ?? req.query.group_id;
  const groupId = parseInt(rawGroupId, 10);
  if (rawGroupId !== undefined && rawGroupId !== null && String(rawGroupId).trim().toLowerCase() !== 'null' && String(rawGroupId).trim() !== '') {
    if (!Number.isInteger(groupId) || groupId <= 0) return false;
    const group = await AccountGroup.findOne({ where: { id: groupId, owner_username, account_type: 'facebook_job' } });
    return group ? group.id : false;
  }
  const groupName = nullify(req.body.group_name || req.query.group_name);
  if (groupName) {
    const group = await AccountGroup.findOne({ where: { name: groupName, owner_username, account_type: 'facebook_job' } });
    return group ? group.id : false;
  }
  return null;
};

const syncRegAccountToJob = async (regAccount, { toWaitingLogin = false } = {}) => {
  const source = hydrateFacebookData(regAccount);
  const now = new Date();
  const defaults = {
    raw_data: source.raw_data,
    uid: source.uid,
    password: source.password,
    two_fa: source.two_fa,
    cookies: source.cookies,
    token: source.token,
    email: source.email,
    email_pass: source.email_pass,
    refresh_token: source.refresh_token,
    client_id: source.client_id,
    page_count: source.page_count || 0,
    pages: source.pages?.length ? JSON.stringify(source.pages) : null,
    last_page_check_at: source.last_page_check_at,
    page_token_status: source.page_token_status || 'unknown',
    page_token_error: source.page_token_error,
    owner_username: source.owner_username,
    kind: 'job',
    device_id: toWaitingLogin ? null : source.device_id,
    status: toWaitingLogin ? 'CHO_LOGIN' : 'LOGIN_THANH_CONG',
    live_status: source.live_status || 'unknown',
    login_at: toWaitingLogin ? null : now,
    note: 'Tu dong dong bo tu Facebook Reg',
  };

  const [jobAccount, created] = await FacebookAccount.unscoped().findOrCreate({
    where: { owner_username: source.owner_username, kind: 'job', uid: source.uid },
    defaults,
  });
  if (created) return { created: true, account: jobAccount };

  const update = {};
  for (const field of ['raw_data', 'password', 'two_fa', 'cookies', 'token', 'email', 'email_pass', 'refresh_token', 'client_id', 'pages', 'last_page_check_at', 'page_token_status', 'page_token_error', 'live_status']) {
    if (defaults[field] !== undefined && defaults[field] !== null) update[field] = defaults[field];
  }
  if (source.last_page_check_at) update.page_count = defaults.page_count;

  const preserveWorkflow = ['DANG_LOGIN', 'DANG_LAM', 'DA_CHAY_XONG'].includes(jobAccount.status);
  if (toWaitingLogin) {
    Object.assign(update, {
      status: 'CHO_LOGIN',
      device_id: null,
      locked_by: null,
      locked_at: null,
      login_get_count: 0,
      completed_at: null,
      login_at: null,
      fail_reason: null,
      trashed_at: null,
    });
  } else if (!preserveWorkflow) {
    update.status = 'LOGIN_THANH_CONG';
    update.device_id = source.device_id;
    update.locked_by = null;
    update.locked_at = null;
    update.completed_at = null;
    update.login_at = now;
  }
  await jobAccount.update(update);
  return { created: false, account: jobAccount };
};

const importFacebookAccounts = async ({ text, owner_username, kind = 'job', status = 'CHO_LOGIN', groupId = null, device_id = null, syncToJob = true, jobSyncMode = 'login_success' }) => {
  const lines = splitLines(text);
  const result = { total: lines.length, created: 0, updated: 0, duplicated: 0, invalid: 0, job_created: 0, job_updated: 0 };

  for (const line of lines) {
    const parsed = parseFacebookLine(line);
    if (!parsed) {
      result.invalid += 1;
      continue;
    }

    const baseData = { ...parsed, owner_username, kind, status, group_id: groupId };
    if (device_id) baseData.device_id = device_id;
    if (kind === 'reg') baseData.login_at = new Date();
    if (parsed.token) {
      baseData.page_token_status = 'unknown';
      baseData.page_token_error = null;
    }

    const [account, created] = await FacebookAccount.unscoped().findOrCreate({
      where: { owner_username, kind, uid: parsed.uid },
      defaults: baseData,
    });

    if (created) result.created += 1;
    else {
      if (isFacebookSessionRefresh(parsed)) {
        await account.update({
          cookies: parsed.cookies,
          token: parsed.token,
          page_token_status: 'unknown',
          page_token_error: null,
        });
        result.updated += 1;
        if (syncToJob && kind === 'reg' && status === 'LOGIN_THANH_CONG') {
          const jobSync = await syncRegAccountToJob(account, { toWaitingLogin: jobSyncMode === 'waiting_login' });
          if (jobSync.created) result.job_created += 1;
          else result.job_updated += 1;
        }
        continue;
      }

      result.duplicated += 1;
      const duplicateUpdate = { ...parsed, group_id: groupId ?? account.group_id, status };
      if (device_id) duplicateUpdate.device_id = device_id;
      if (kind === 'reg') duplicateUpdate.login_at = new Date();
      if (parsed.token) {
        duplicateUpdate.page_token_status = 'unknown';
        duplicateUpdate.page_token_error = null;
      }
      if (status === 'CHO_LOGIN') {
        if (!device_id) duplicateUpdate.device_id = null;
        duplicateUpdate.locked_by = null;
        duplicateUpdate.locked_at = null;
        duplicateUpdate.login_get_count = 0;
        duplicateUpdate.login_at = null;
        duplicateUpdate.completed_at = null;
      }
      await account.update(duplicateUpdate);
    }

    if (syncToJob && kind === 'reg' && status === 'LOGIN_THANH_CONG') {
      const jobSync = await syncRegAccountToJob(account, { toWaitingLogin: jobSyncMode === 'waiting_login' });
      if (jobSync.created) result.job_created += 1;
      else result.job_updated += 1;
    }
  }

  return result;
};

const list = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const kind = normalizeKind(req.query.kind, 'job');
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const sortBy = ['device_id', 'page_count', 'reg_page_locked_by'].includes(req.query.sort_by) ? req.query.sort_by : null;
    const sortDirection = String(req.query.sort_order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = { owner_username, kind };

    const status = normalizeStatus(req.query.status, '');
    const date_from = String(req.query.date_from || '').trim();
    const date_to = String(req.query.date_to || '').trim();
    const soakDays = parseNonNegativeInt(req.query.soak_days);
    const liveStatus = String(req.query.live_status || '').trim().toLowerCase();
    if (['unknown', 'live', 'die'].includes(liveStatus)) where.live_status = liveStatus;
    const groupId = parseInt(req.query.group_id, 10);
    if (Number.isInteger(groupId) && groupId > 0) where.group_id = groupId;
    const deviceId = nullify(req.query.device_id);
    if (deviceId) where.device_id = deviceId;
    if (date_from || date_to) {
      const dateField = status === 'DA_CHAY_XONG' ? 'completed_at' : 'created_at';
      where[dateField] = {};
      if (date_from) where[dateField][Op.gte] = new Date(date_from);
      if (date_to) where[dateField][Op.lte] = new Date(`${date_to}T23:59:59`);
    }
    if (soakDays !== null && soakDays > 0) {
      const soakCutoff = new Date(Date.now() - soakDays * 24 * 60 * 60 * 1000);
      const completedAtWhere = where.completed_at && typeof where.completed_at === 'object' ? where.completed_at : {};
      const currentLte = completedAtWhere[Op.lte];
      completedAtWhere[Op.lte] = currentLte && currentLte < soakCutoff ? currentLte : soakCutoff;
      where.completed_at = completedAtWhere;
    }

    const q = nullify(req.query.q || req.query.uid);
    if (q) {
      where[Op.or] = [
        { uid: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { device_id: { [Op.like]: `%${q}%` } },
        { locked_by: { [Op.like]: `%${q}%` } },
      ];
    }

    const countWhere = { ...where };
    if (status) where.status = status;

    const statusRows = await FacebookAccount.findAll({
      attributes: ['status', [FacebookAccount.sequelize.fn('COUNT', FacebookAccount.sequelize.col('id')), 'count']],
      where: countWhere,
      group: ['status'],
      raw: true,
    });
    const status_counts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count) || 0]));
    const trash_count = kind === 'job'
      ? await FacebookAccount.unscoped().count({
        where: { owner_username, kind: 'job', trashed_at: { [Op.ne]: null } },
      })
      : 0;

    let machine_stats = [];
    if (kind === 'reg') {
      const machineRows = await FacebookAccount.findAll({
        attributes: [
          'device_id',
          [FacebookAccount.sequelize.fn('COUNT', FacebookAccount.sequelize.col('id')), 'total'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN live_status = 'live' THEN 1 ELSE 0 END")), 'live'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN live_status = 'die' THEN 1 ELSE 0 END")), 'die'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.col('page_count')), 'pages'],
          [FacebookAccount.sequelize.fn('MAX', FacebookAccount.sequelize.col('created_at')), 'last_reg_at'],
        ],
        where: countWhere,
        group: ['device_id'],
        raw: true,
      });
      machine_stats = machineRows
        .map((row) => ({
          device_id: row.device_id || '-',
          total: Number(row.total) || 0,
          live: Number(row.live) || 0,
          die: Number(row.die) || 0,
          pages: Number(row.pages) || 0,
          last_reg_at: row.last_reg_at || null,
        }))
        .sort((a, b) => b.total - a.total || String(a.device_id).localeCompare(String(b.device_id)));
    }
    if (kind === 'job') {
      const machineRows = await FacebookAccount.findAll({
        attributes: [
          'device_id',
          [FacebookAccount.sequelize.fn('COUNT', FacebookAccount.sequelize.col('id')), 'total'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND (live_status <> 'die' OR live_status IS NULL) THEN 1 ELSE 0 END")), 'successful_total'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status = 'CHO_LOGIN' THEN 1 ELSE 0 END")), 'waiting_login'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status = 'DANG_LOGIN' THEN 1 ELSE 0 END")), 'logging_in'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status = 'LOGIN_THANH_CONG' THEN 1 ELSE 0 END")), 'login_success'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status = 'DANG_LAM' THEN 1 ELSE 0 END")), 'working'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status = 'DA_CHAY_XONG' THEN 1 ELSE 0 END")), 'done'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status IN ('LOGIN_FAIL','ACCOUNT_DIE') THEN 1 ELSE 0 END")), 'failed'],
          [FacebookAccount.sequelize.fn('SUM', FacebookAccount.sequelize.literal("CASE WHEN status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND (live_status <> 'die' OR live_status IS NULL) THEN page_count ELSE 0 END")), 'pages'],
          [FacebookAccount.sequelize.fn('MAX', FacebookAccount.sequelize.literal("CASE WHEN status IN ('LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG') AND (live_status <> 'die' OR live_status IS NULL) THEN updated_at ELSE NULL END")), 'last_updated_at'],
        ],
        where: { owner_username, kind: 'job' },
        group: ['device_id'],
        raw: true,
      });
      machine_stats = machineRows
        .filter((row) => nullify(row.device_id) && Number(row.successful_total) > 0)
        .map((row) => ({
          device_id: row.device_id,
          total: Number(row.successful_total) || 0,
          waiting_login: Number(row.waiting_login) || 0,
          logging_in: Number(row.logging_in) || 0,
          login_success: Number(row.login_success) || 0,
          working: Number(row.working) || 0,
          done: Number(row.done) || 0,
          failed: Number(row.failed) || 0,
          pages: Number(row.pages) || 0,
          last_updated_at: row.last_updated_at || null,
        }))
        .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id), 'vi', { numeric: true, sensitivity: 'base' }));
    }


    let order = status === 'DA_CHAY_XONG' ? [['completed_at', 'DESC'], ['id', 'DESC']] : [['updated_at', 'DESC'], ['id', 'DESC']];
    if (sortBy === 'page_count') {
      order = [['page_count', sortDirection], ['id', 'DESC']];
    } else if (sortBy === 'device_id') {
      order = [
        [FacebookAccount.sequelize.literal("CASE WHEN device_id IS NULL OR device_id = '' THEN 1 ELSE 0 END"), 'ASC'],
        [FacebookAccount.sequelize.fn('CHAR_LENGTH', FacebookAccount.sequelize.col('device_id')), sortDirection],
        ['device_id', sortDirection],
        ['id', 'DESC'],
      ];
    } else if (sortBy === 'reg_page_locked_by' && kind === 'job') {
      order = [
        [FacebookAccount.sequelize.literal("CASE WHEN reg_page_locked_by IS NULL OR reg_page_locked_by = '' THEN 0 ELSE 1 END"), sortDirection],
        ['reg_page_locked_at', sortDirection],
        ['id', 'DESC'],
      ];
    }
    const { rows, count } = await FacebookAccount.findAndCountAll({
      where,
      order,
      limit,
      offset: (page - 1) * limit,
    });

    const pageSummaryByAccount = new Map();
    if (kind === 'job' && rows.length) {
      const pageJobs = await FacebookPageJob.findAll({
        where: {
          owner_username,
          facebook_account_id: { [Op.in]: rows.map((row) => row.id) },
          is_active: true,
        },
      });
      for (const pageJob of pageJobs) {
        const current = pageSummaryByAccount.get(pageJob.facebook_account_id) || [];
        current.push(pageJob.toJSON());
        pageSummaryByAccount.set(pageJob.facebook_account_id, current);
      }
    }

    return success(res, {
      accounts: rows.map((account) => {
        const data = serialize(account);
        if (kind === 'job') {
          const tracked = summarizePageJobs(pageSummaryByAccount.get(account.id) || []);
          const total = Math.max(tracked.total, data.page_count || 0);
          data.page_job_summary = {
            total,
            completed: tracked.completed,
            working: tracked.working,
            pending: Math.max(total - tracked.completed - tracked.working, 0),
          };
        }
        return data;
      }),
      status_counts,
      trash_count,
      machine_stats,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    }, 'Lay danh sach Facebook thanh cong');
  } catch (err) {
    next(err);
  }
};

const importFromDashboard = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const kind = normalizeKind(req.body.kind, 'job');
    const status = normalizeStatus(req.body.status, 'CHO_LOGIN');
    const groupId = await resolveGroupId({ group_id: req.body.group_id, group_name: req.body.group_name, owner_username, kind });
    const result = await importFacebookAccounts({ text: req.body.text, owner_username, kind, status, groupId });
    return success(res, result, `Da import ${result.created}/${result.total} account Facebook`);
  } catch (err) {
    next(err);
  }
};

const importFromApi = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const kind = normalizeKind(req.body.kind || req.query.kind, 'reg');
    const status = normalizeStatus(req.body.status || req.query.status, kind === 'job' ? 'CHO_LOGIN' : 'LOGIN_THANH_CONG');
    const text = req.body.text || req.body.accounts || req.body.data || req.body.account || '';
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may);
    const groupId = await resolveGroupId({ group_id: req.body.group_id || req.query.group_id, group_name: req.body.group_name || req.query.group_name, owner_username, kind });
    const result = await importFacebookAccounts({ text, owner_username, kind, status, groupId, device_id });
    return success(res, result, `Da nhan ${result.created + result.updated}/${result.total} account Facebook`);
  } catch (err) {
    next(err);
  }
};

const reportRegOnly = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const status = normalizeStatus(req.body.status || req.query.status, 'LOGIN_THANH_CONG');
    const text = req.body.text || req.body.accounts || req.body.data || req.body.account || '';
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may);
    const groupId = await resolveGroupId({
      group_id: req.body.group_id || req.query.group_id,
      group_name: req.body.group_name || req.query.group_name,
      owner_username,
      kind: 'reg',
    });
    const result = await importFacebookAccounts({
      text,
      owner_username,
      kind: 'reg',
      status,
      groupId,
      device_id,
      syncToJob: true,
      jobSyncMode: 'waiting_login',
    });
    return success(res, {
      ...result,
      reported: result.total - result.invalid,
      kept_in_reg: result.total - result.invalid,
      synced_to_job: result.job_created + result.job_updated,
    }, `Da bao cao ${result.total - result.invalid}/${result.total} account Facebook Reg va chuyen sang Job Cho Login`);
  } catch (err) {
    next(err);
  }
};
const releaseStaleFacebookLocks = async ({ owner_username, groupId, status, releaseStatus, failReason = null }) => {
  const staleWhere = {
    owner_username,
    kind: 'job',
    status,
    locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) },
  };
  if (groupId) staleWhere.group_id = groupId;
  const update = { status: releaseStatus, locked_by: null, locked_at: null };
  if (FINAL_STATUSES.includes(releaseStatus)) update.completed_at = new Date();
  if (failReason) update.fail_reason = failReason;
  await FacebookAccount.update(update, { where: staleWhere });
};

const getJobForPhone = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    const groupId = await resolveJobGroupIdForRequest(req, owner_username);
    if (groupId === false) return error(res, 'Nhom Facebook JOB khong hop le', 400);

    await releaseStaleFacebookLocks({
      owner_username,
      groupId,
      status: 'DANG_LOGIN',
      releaseStatus: 'LOGIN_FAIL',
      failReason: 'Qua thoi gian lock login nhung may chua bao cao',
    });

    const claimResult = await sequelize.transaction(async (t) => {
      const activeWhere = { owner_username, kind: 'job', status: 'DANG_LOGIN', locked_by: device_id, nurture_status: { [Op.ne]: 'DANG_NUOI' } };
      if (groupId) activeWhere.group_id = groupId;
      const active = await FacebookAccount.findOne({
        where: activeWhere,
        order: [['locked_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      let autoFailedAccount = null;
      if (active) {
        const currentGetCount = Math.max(Number(active.login_get_count) || 0, 1);
        const nextGetCount = currentGetCount + 1;
        if (nextGetCount <= MAX_LOGIN_GET_COUNT) {
          await active.update({
            login_get_count: nextGetCount,
            locked_at: new Date(),
          }, { transaction: t });
          return { account: active, autoFailedAccount: null };
        }
        await active.update({
          status: 'LOGIN_FAIL',
          login_get_count: nextGetCount,
          locked_by: null,
          locked_at: null,
          completed_at: new Date(),
          fail_reason: 'May get account qua 3 lan nhung chua bao cao login',
        }, { transaction: t });
        autoFailedAccount = {
          id: active.id,
          uid: active.uid,
          device_id,
          login_get_count: nextGetCount,
        };
      }

      const used = await countDeviceFacebookLoginActive({ owner_username, device_id, groupId, transaction: t });
      const loginLimit = await getFacebookLoginLimitSettings(owner_username);
      if (used >= loginLimit.limit) {
        return { __fullLimit: true, limit: loginLimit.limit, used, autoFailedAccount };
      }

      const nextWhere = { owner_username, kind: 'job', status: 'CHO_LOGIN', nurture_status: { [Op.ne]: 'DANG_NUOI' } };
      if (groupId) nextWhere.group_id = groupId;
      const nextAccount = await FacebookAccount.findOne({
        where: nextWhere,
        order: [['id', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!nextAccount) return { account: null, autoFailedAccount };
      await nextAccount.update({
        status: 'DANG_LOGIN',
        locked_by: device_id,
        locked_at: new Date(),
        login_get_count: 1,
        device_id,
        completed_at: null,
        fail_reason: null,
      }, { transaction: t });
      return { account: nextAccount, autoFailedAccount };
    });

    if (claimResult?.__fullLimit) {
      return success(res, {
        limit: claimResult.limit,
        used: claimResult.used,
        auto_failed_account: claimResult.autoFailedAccount,
      }, 'Full limit');
    }
    if (!claimResult?.account) {
      return success(res, {
        account: null,
        auto_failed_account: claimResult?.autoFailedAccount || null,
      }, 'Het account Facebook JOB cho login');
    }
    return success(res, {
      account: await serializeForPhone(claimResult.account),
      login_get_count: Number(claimResult.account.login_get_count) || 1,
      max_login_get_count: MAX_LOGIN_GET_COUNT,
      auto_failed_account: claimResult.autoFailedAccount,
      lock_timeout_min: LOCK_TIMEOUT_MIN,
    }, 'Lay account Facebook JOB thanh cong');
  } catch (err) {
    next(err);
  }
};

const checkDeviceAccountCount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    const groupId = await resolveJobGroupIdForRequest(req, owner_username);
    if (groupId === false) return error(res, 'Nhom Facebook JOB khong hop le', 400);
    const summary = await getDeviceFacebookAccountSummary({ owner_username, device_id, groupId });
    return success(res, summary, summary.full ? 'Full limit' : 'Available slots');
  } catch (err) {
    next(err);
  }
};
const getLoginSuccessJobForPhone = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    const groupId = await resolveJobGroupIdForRequest(req, owner_username);
    if (groupId === false) return error(res, 'Nhom Facebook JOB khong hop le', 400);

    await releaseStaleFacebookLocks({ owner_username, groupId, status: 'DANG_LAM', releaseStatus: 'LOGIN_THANH_CONG' });

    // Bo qua account da hoan thanh tat ca Page va tra account ke tiep ngay trong cung request.
    // Gioi han de request khong chay qua lau neu du lieu cu co qua nhieu account da het Page.
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const account = await sequelize.transaction(async (t) => {
        const activeWhere = {
          owner_username,
          kind: 'job',
          status: 'DANG_LAM',
          nurture_status: { [Op.ne]: 'DANG_NUOI' },
          reg_page_locked_by: null,
          [Op.or]: [{ locked_by: device_id }, { device_id }],
        };
        if (groupId) activeWhere.group_id = groupId;
        const active = await FacebookAccount.findOne({
          where: activeWhere,
          order: [['locked_at', 'DESC'], ['id', 'DESC']],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (active) {
          await active.update({ locked_by: device_id, locked_at: new Date(), device_id }, { transaction: t });
          return active;
        }

        const nextWhere = {
          owner_username,
          kind: 'job',
          status: 'LOGIN_THANH_CONG',
          nurture_status: { [Op.ne]: 'DANG_NUOI' },
          reg_page_locked_by: null,
          [Op.or]: [{ device_id }, { locked_by: device_id }],
        };
        if (groupId) nextWhere.group_id = groupId;
        const nextAccount = await FacebookAccount.findOne({
          where: nextWhere,
          order: [
            [sequelize.literal('CASE WHEN page_count > 0 THEN 0 ELSE 1 END'), 'ASC'],
            ['login_at', 'ASC'],
            ['id', 'ASC'],
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!nextAccount) return null;
        await nextAccount.update({ status: 'DANG_LAM', locked_by: device_id, locked_at: new Date(), device_id, completed_at: null }, { transaction: t });
        return nextAccount;
      });

      if (!account) return success(res, { account: null }, 'Het account Facebook JOB login thanh cong');

      const currentPage = await claimPageForPhone({ account, device_id });
      if (currentPage) {
        return success(res, { account: await serializeForPhone(account, currentPage), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay account Facebook JOB login thanh cong');
      }

      const pageJobs = await getActivePageJobs(account);
      const pageSummary = summarizePageJobs(pageJobs.map((row) => row.toJSON()));
      if (pageSummary.total > 0 && pageSummary.completed === pageSummary.total) {
        await account.update({
          status: 'DA_CHAY_XONG',
          locked_by: null,
          locked_at: null,
          completed_at: new Date(),
        });
        continue;
      }

      // Account khong co Page van duoc tra ve sau khi da uu tien het account co Page.
      return success(res, { account: await serializeForPhone(account), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay account Facebook JOB login thanh cong');
    }

    return success(res, { account: null }, 'Da chuyen 500 account het Page sang da chay xong, vui long goi lai');
  } catch (err) {
    next(err);
  }
};

const getEligibleNurtureScenarios = (settings) => settings.scenarios.filter(
  (scenario) => Object.values(scenario.actions || {}).some((action) => action.enabled)
);

const pickNurtureScenario = async ({ owner_username, device_id, scenarios, transaction }) => {
  const assignments = await FacebookNurtureAssignment.findAll({
    where: { owner_username },
    order: [['id', 'ASC']],
    transaction,
  });
  const current = assignments.find((row) => row.device_id === device_id) || null;
  const eligibleIds = new Set(scenarios.map((scenario) => scenario.id));
  const counts = new Map(scenarios.map((scenario) => [scenario.id, 0]));
  assignments.forEach((row) => {
    if (eligibleIds.has(row.scenario_id)) counts.set(row.scenario_id, (counts.get(row.scenario_id) || 0) + 1);
  });

  let candidates = scenarios;
  if (scenarios.length > 1 && current && eligibleIds.has(current.scenario_id)) {
    candidates = scenarios.filter((scenario) => scenario.id !== current.scenario_id);
  }
  const minimumUsage = Math.min(...candidates.map((scenario) => counts.get(scenario.id) || 0));
  const balanced = candidates.filter((scenario) => (counts.get(scenario.id) || 0) === minimumUsage);
  const scenario = balanced[Math.floor(Math.random() * balanced.length)];
  if (current) await current.update({ scenario_id: scenario.id }, { transaction });
  else {
    await FacebookNurtureAssignment.create({ owner_username, device_id, scenario_id: scenario.id }, { transaction });
  }
  return scenario;
};

const getNurtureAccount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    const settings = await getFacebookNurtureSettings(owner_username);
    const scenarios = getEligibleNurtureScenarios(settings);
    if (!scenarios.length) return error(res, 'Chua co kich ban Facebook nao duoc bat', 404, { account: null });
    const cooldownAt = new Date(Date.now() - settings.cooldown_hours * 60 * 60 * 1000);
    await FacebookNurtureAssignment.findOrCreate({
      where: { owner_username, device_id },
      defaults: { owner_username, device_id, scenario_id: scenarios[0].id },
    });

    const claimed = await sequelize.transaction(async (transaction) => {
      await FacebookNurtureAssignment.findOne({
        where: { owner_username, device_id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      let account = await FacebookAccount.findOne({
        where: {
          owner_username,
          kind: 'job',
          device_id,
          nurture_status: 'DANG_NUOI',
          nurture_locked_by: device_id,
        },
        order: [['nurture_locked_at', 'DESC'], ['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (account) {
        let scenario = scenarios.find((item) => item.id === account.nurture_scenario_id) || null;
        if (!scenario) {
          scenario = await pickNurtureScenario({ owner_username, device_id, scenarios, transaction });
          await account.update({ nurture_scenario_id: scenario.id }, { transaction });
        }
        return { account, scenario, resumed: true };
      }

      account = await FacebookAccount.findOne({
        where: {
          owner_username,
          kind: 'job',
          device_id,
          status: 'LOGIN_THANH_CONG',
          nurture_locked_by: null,
          reg_page_locked_by: null,
          cookies: { [Op.ne]: null },
          [Op.and]: [
            { [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }] },
            {
              [Op.or]: [
                { nurture_status: 'CHUA_NUOI' },
                { nurture_status: 'NUOI_FAIL' },
                { nurture_status: 'DA_NUOI', last_nurture_at: { [Op.lte]: cooldownAt } },
              ],
            },
          ],
        },
        order: [
          [sequelize.literal("CASE nurture_status WHEN 'CHUA_NUOI' THEN 0 WHEN 'NUOI_FAIL' THEN 1 ELSE 2 END"), 'ASC'],
          ['last_nurture_at', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      if (!account) return null;

      const scenario = await pickNurtureScenario({ owner_username, device_id, scenarios, transaction });
      const run_id = randomUUID();
      await account.update({
        nurture_status: 'DANG_NUOI',
        nurture_locked_by: device_id,
        nurture_locked_at: new Date(),
        nurture_run_id: run_id,
        nurture_scenario_id: scenario.id,
      }, { transaction });
      return { account, scenario, resumed: false };
    });

    if (!claimed) {
      return error(res, 'Het account Facebook co the nuoi luc nay', 404, {
        account: null,
        device_id,
        cooldown_hours: settings.cooldown_hours,
      });
    }
    return success(res, {
      run_id: claimed.account.nurture_run_id,
      account: serialize(claimed.account),
      scenario: claimed.scenario,
      resumed: claimed.resumed,
      cooldown_hours: settings.cooldown_hours,
    }, claimed.resumed ? 'Tiep tuc account Facebook dang nuoi' : 'Lay account Facebook nuoi thanh cong');
  } catch (err) {
    next(err);
  }
};

const reportNurtureAccount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const uid = nullify(req.body.uid || req.body.username || req.query.uid || req.query.username);
    const reportStatus = String(req.body.status || req.query.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!uid) return error(res, 'Can truyen uid account', 400);
    if (!['DA_NUOI', 'NUOI_FAIL'].includes(reportStatus)) return error(res, 'status chi nhan DA_NUOI hoac NUOI_FAIL', 400);

    const account = await FacebookAccount.findOne({
      where: {
        owner_username,
        kind: 'job',
        uid,
        nurture_status: 'DANG_NUOI',
      },
    });
    if (!account) return error(res, 'Khong tim thay account dang nuoi voi UID ' + uid, 404);
    const device_id = account.nurture_locked_by || account.device_id;
    if (!device_id) return error(res, 'Account dang nuoi khong co thong tin may', 422);
    const run_id = account.nurture_run_id || randomUUID();

    const completedAt = new Date();
    const requestedDuration = parseNonNegativeInt(req.body.duration_seconds || req.query.duration_seconds);
    const computedDuration = account.nurture_locked_at
      ? Math.max(Math.round((completedAt.getTime() - new Date(account.nurture_locked_at).getTime()) / 1000), 0)
      : null;
    const duration_seconds = Math.min(requestedDuration ?? computedDuration ?? 0, 7 * 24 * 60 * 60);
    const message = nullify(req.body.message || req.body.note || req.query.message || req.query.note);
    const startedAt = account.nurture_locked_at;
    const scenarioId = account.nurture_scenario_id;

    const transaction = await sequelize.transaction();
    try {
      await FacebookNurtureLog.create({
        owner_username,
        facebook_account_id: account.id,
        uid: account.uid,
        device_id,
        scenario_id: scenarioId,
        run_id,
        status: reportStatus,
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds,
        message,
      }, { transaction });
      await account.update({
        nurture_status: reportStatus,
        nurture_locked_by: null,
        nurture_locked_at: null,
        nurture_run_id: null,
        nurture_count: (Number(account.nurture_count) || 0) + 1,
        ...(reportStatus === 'DA_NUOI' ? { last_nurture_at: completedAt } : {}),
      }, { transaction });
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }

    return success(res, {
      uid: account.uid,
      device_id,
      status: reportStatus,
      scenario_id: scenarioId,
      duration_seconds,
      nurture_count: Number(account.nurture_count) || 0,
      last_nurture_at: account.last_nurture_at,
    }, reportStatus === 'DA_NUOI' ? 'Da bao cao nuoi Facebook thanh cong' : 'Da bao cao nuoi Facebook that bai');
  } catch (err) {
    next(err);
  }
};

const listNurtureAccounts = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const where = { owner_username, kind: 'job', status: 'LOGIN_THANH_CONG' };
    const nurtureStatus = String(req.query.status || '').trim().toUpperCase();
    if (NURTURE_STATUSES.includes(nurtureStatus)) where.nurture_status = nurtureStatus;
    const q = nullify(req.query.q);
    if (q) {
      where[Op.or] = [
        { uid: { [Op.like]: '%' + q + '%' } },
        { device_id: { [Op.like]: '%' + q + '%' } },
        { email: { [Op.like]: '%' + q + '%' } },
      ];
    }

    const [{ rows, count }, countRows, settings] = await Promise.all([
      FacebookAccount.findAndCountAll({
        where,
        order: [
          [sequelize.literal("CASE nurture_status WHEN 'DANG_NUOI' THEN 0 WHEN 'CHUA_NUOI' THEN 1 WHEN 'NUOI_FAIL' THEN 2 ELSE 3 END"), 'ASC'],
          ['last_nurture_at', 'DESC'],
          ['id', 'DESC'],
        ],
        limit,
        offset: (page - 1) * limit,
      }),
      FacebookAccount.findAll({
        attributes: ['nurture_status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { owner_username, kind: 'job', status: 'LOGIN_THANH_CONG' },
        group: ['nurture_status'],
        raw: true,
      }),
      getFacebookNurtureSettings(owner_username),
    ]);
    const status_counts = Object.fromEntries(NURTURE_STATUSES.map((status) => [status, 0]));
    countRows.forEach((row) => { status_counts[row.nurture_status || 'CHUA_NUOI'] = Number(row.count) || 0; });
    return success(res, {
      accounts: rows.map(serialize),
      status_counts,
      cooldown_hours: settings.cooldown_hours,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    }, 'Lay danh sach Facebook Nuoi thanh cong');
  } catch (err) {
    next(err);
  }
};

const listNurtureLogs = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const where = { owner_username };
    const device_id = nullify(req.query.device_id);
    const uid = nullify(req.query.uid);
    if (device_id) where.device_id = device_id;
    if (uid) where.uid = uid;
    const { rows, count } = await FacebookNurtureLog.findAndCountAll({
      where,
      order: [['completed_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return success(res, {
      logs: rows.map((row) => row.toJSON()),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    }, 'Lay lich su Facebook Nuoi thanh cong');
  } catch (err) {
    next(err);
  }
};
const resetNurtureAccounts = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (!ids.length) return error(res, 'Can truyen danh sach account can reset', 400);

    const [affected] = await FacebookAccount.update({
      nurture_status: 'CHUA_NUOI',
      nurture_locked_by: null,
      nurture_locked_at: null,
      nurture_run_id: null,
      nurture_scenario_id: null,
    }, {
      where: {
        id: { [Op.in]: ids },
        owner_username,
        kind: 'job',
        status: 'LOGIN_THANH_CONG',
      },
    });

    return success(res, { affected }, 'Da reset trang thai nuoi cua ' + affected + ' account');
  } catch (err) {
    next(err);
  }
};
const findForReport = async (req, owner_username) => {
  const id = parseInt(req.body.id || req.query.id, 10);
  if (Number.isInteger(id) && id > 0) return FacebookAccount.findOne({ where: { id, owner_username } });
  const uid = nullify(req.body.uid || req.body.username || req.query.uid || req.query.username);
  if (!uid) return null;
  return FacebookAccount.findOne({ where: { uid, owner_username }, order: [['id', 'DESC']] });
};

const report = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const account = await findForReport(req, owner_username);
    if (!account) return error(res, 'Khong tim thay account Facebook', 404);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    const status = normalizeStatus(req.body.status || req.body.trang_thai || req.query.status, 'LOGIN_THANH_CONG');
    const update = {
      status,
      device_id: device_id || account.device_id,
      locked_by: null,
      locked_at: null,
      login_get_count: 0,
      fail_reason: nullify(req.body.reason || req.body.note || req.body.message) || account.fail_reason,
    };
    if (status === 'LOGIN_THANH_CONG') {
      update.login_at = new Date();
      update.locked_by = null;
      update.locked_at = null;
      update.completed_at = null;
    } else if (status === 'DANG_LAM') {
      update.locked_by = device_id || account.locked_by || account.device_id;
      update.locked_at = account.locked_at || new Date();
      update.completed_at = null;
    }
    if (FINAL_STATUSES.includes(status)) update.completed_at = new Date();
    if (status === 'ACCOUNT_DIE') update.live_status = 'die';
    await account.update(update);
    const message = update.status === 'LOGIN_THANH_CONG'
      ? 'Login thanh cong, account chuyen sang LOGIN_THANH_CONG'
      : update.status === 'DANG_LAM'
        ? 'Account dang lam'
        : update.status === 'DA_CHAY_XONG'
          ? 'Account da chay xong'
          : update.status === 'ACCOUNT_DIE'
            ? 'Account da chuyen sang Die'
            : 'Bao cao Facebook thanh cong';
    return success(res, { account: serialize(account) }, message);
  } catch (err) {
    next(err);
  }
};

const loadFacebookCheckConfig = async (owner_username) => {
  const settings = await getFacebookCheckProxySettings(owner_username);
  const rawProxies = Array.isArray(settings.proxies) ? settings.proxies : [];
  const proxyPool = rawProxies.map(parseProxy).filter(Boolean);
  if (rawProxies.length && !proxyPool.length) throw new Error('Cau hinh proxy Facebook khong hop le');
  const concurrency = Math.min(Math.max(parseInt(settings.concurrency, 10) || 20, 1), 40);
  return { proxyPool, concurrency };
};

const loadFacebookProxyPool = async (owner_username) => (await loadFacebookCheckConfig(owner_username)).proxyPool;

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

const pickFacebookProxy = (proxyPool, stableKey) => {
  if (!proxyPool.length) return null;
  const hash = String(stableKey || '').split('').reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return proxyPool[hash % proxyPool.length];
};

const maskProxy = (proxyUrl) => proxyUrl
  ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@')
  : 'direct';

const facebookGet = async (url, proxyUrl, timeout) => {
  const config = { timeout, validateStatus: () => true };
  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false;
  }
  return axios.get(url, config);
};

const checkFacebookUidLive = async (uid, proxyUrl = null) => {
  try {
    const response = await facebookGet(`https://graph.facebook.com/${encodeURIComponent(uid)}/picture?redirect=false`, proxyUrl, 10000);
    const json = response.data;
    return json?.data?.height != null;
  } catch (_) {
    return null;
  }
};

const checkLive = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    const where = { owner_username };
    if (ids.length) where.id = { [Op.in]: ids };
    if (req.body.kind || req.query.kind) where.kind = normalizeKind(req.body.kind || req.query.kind, 'job');

    const accounts = await FacebookAccount.findAll({ where, limit: ids.length ? undefined : 500, order: [['id', 'ASC']] });
    const { proxyPool, concurrency } = await loadFacebookCheckConfig(owner_username);
    const rows = await mapWithConcurrency(accounts, concurrency, async (account) => {
      const proxyUrl = pickFacebookProxy(proxyPool, account.uid);
      const result = await checkFacebookUidLive(account.uid, proxyUrl);
      const live_status = result === true ? 'live' : result === false ? 'die' : 'unknown';
      const updates = { live_status, last_live_check_at: new Date() };
      if (live_status === 'die') updates.status = 'ACCOUNT_DIE';
      await account.update(updates);
      return { id: account.id, uid: account.uid, result: live_status, proxy: maskProxy(proxyUrl) };
    });
    const live = rows.filter((row) => row.result === 'live').length;
    const die = rows.filter((row) => row.result === 'die').length;
    const unknown = rows.length - live - die;

    return success(res, { live, die, unknown, concurrency, rows }, 'Check live Facebook thanh cong');
  } catch (err) {
    next(err);
  }
};


const normalizeGraphAccessToken = (value) => {
  const raw = nullify(value);
  if (!raw) return null;
  const match = raw.match(/(?:^|[?&;\s])access_token=([^&;\s]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }
  return raw;
};

const checkFacebookPagesByToken = async (token, proxyUrl = null) => {
  const accessToken = normalizeGraphAccessToken(token);
  if (!accessToken) return { ok: false, message: 'NO_TOKEN', pages: [], token_status: 'die', error_code: null };

  try {
    const url = new URL('https://graph.facebook.com/v26.0/me/accounts');
    url.searchParams.set('fields', 'id,name,access_token,tasks');
    url.searchParams.set('access_token', accessToken);
    const response = await facebookGet(url.toString(), proxyUrl, 15000);
    const json = response.data;
    if (response.status < 200 || response.status >= 300 || json?.error) {
      const message = json?.error?.message || 'GRAPH_ERROR';
      const errorCode = Number(json?.error?.code) || null;
      const tokenDie = [190, 459].includes(errorCode)
        || /validating access token|session has been invalidated|checkpointed/i.test(message);
      return { ok: false, message, pages: [], token_status: tokenDie ? 'die' : 'unknown', error_code: errorCode };
    }
    const pages = Array.isArray(json?.data) ? json.data.map((page) => ({
      id: page.id || null,
      name: page.name || null,
      access_token: page.access_token || null,
      tasks: Array.isArray(page.tasks) ? page.tasks : [],
    })) : [];
    return { ok: true, message: 'OK', pages, token_status: 'live', error_code: null };
  } catch (err) {
    return { ok: false, message: err.code === 'ECONNABORTED' ? 'TIMEOUT' : 'REQUEST_FAILED', pages: [], token_status: 'unknown', error_code: null };
  }
};

const regPageBaseWhere = ({ owner_username, device_id, eligibleLoginBefore }) => ({
  owner_username,
  kind: 'job',
  device_id,
  login_at: { [Op.lte]: eligibleLoginBefore },
  page_count: { [Op.lt]: REG_PAGE_MAX_PAGES },
  page_token_status: { [Op.ne]: 'die' },
  status: { [Op.in]: ['LOGIN_THANH_CONG', 'DA_CHAY_XONG'] },
  nurture_status: { [Op.ne]: 'DANG_NUOI' },
  [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }],
});

const getRegPageAccount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    const waitSettings = await getFacebookRegPageWaitSettings(owner_username);
    const eligibleLoginBefore = new Date(Date.now() - waitSettings.hours * 60 * 60 * 1000);

    // Neu tool dung giua chung, lan goi tiep theo phai tra lai dung account dang lock.
    let account = await FacebookAccount.findOne({
      where: { ...regPageBaseWhere({ owner_username, device_id, eligibleLoginBefore }), reg_page_locked_by: device_id },
      order: [['reg_page_locked_at', 'DESC'], ['id', 'ASC']],
    });

    if (!account) {
      account = await sequelize.transaction(async (transaction) => {
        const commonWhere = {
          ...regPageBaseWhere({ owner_username, device_id, eligibleLoginBefore }),
          reg_page_locked_by: null,
        };

        // Duyet het account chua tung reg Page truoc khi quay vong 24 gio.
        let candidate = await FacebookAccount.findOne({
          where: { ...commonWhere, last_reg_page_at: null },
          order: [['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
          skipLocked: true,
        });

        if (!candidate) {
          const cooldownAt = new Date(Date.now() - REG_PAGE_COOLDOWN_HOURS * 60 * 60 * 1000);
          candidate = await FacebookAccount.findOne({
            where: { ...commonWhere, last_reg_page_at: { [Op.lte]: cooldownAt } },
            order: [['last_reg_page_at', 'ASC'], ['id', 'ASC']],
            transaction,
            lock: transaction.LOCK.UPDATE,
            skipLocked: true,
          });
        }

        if (!candidate) return null;
        await candidate.update({ reg_page_locked_by: device_id, reg_page_locked_at: new Date() }, { transaction });
        return candidate;
      });
    } else {
      await account.update({ reg_page_locked_at: new Date() });
    }

    if (!account) {
      return error(res, 'Het account co the reg Page luc nay', 404, {
        account: null,
        max_pages: REG_PAGE_MAX_PAGES,
        cooldown_hours: REG_PAGE_COOLDOWN_HOURS,
        min_login_age_hours: waitSettings.hours,
        eligible_login_before: eligibleLoginBefore,
      });
    }

    const data = hydrateFacebookData(account);
    const proxyPool = await loadFacebookProxyPool(owner_username);
    const proxyUrl = pickFacebookProxy(proxyPool, account.uid);
    const pageResult = await checkFacebookPagesByToken(data.token, proxyUrl);
    if (!pageResult.ok) {
      const tokenDie = pageResult.token_status === 'die';
      await account.update({
        page_token_status: pageResult.token_status,
        page_token_error: pageResult.message,
        last_page_check_at: new Date(),
        ...(tokenDie ? { reg_page_locked_by: null, reg_page_locked_at: null } : {}),
      });
      if (tokenDie) return getRegPageAccount(req, res, next);
      return error(res, `Khong check duoc Page cua UID ${account.uid}: ${pageResult.message}`, 422);
    }

    const page_count = pageResult.pages.length;
    await account.update({
      page_count,
      pages: JSON.stringify(pageResult.pages),
      last_page_check_at: new Date(),
      page_token_status: 'live',
      page_token_error: null,
    });

    if (page_count >= REG_PAGE_MAX_PAGES) {
      await account.update({ reg_page_locked_by: null, reg_page_locked_at: null });
      return getRegPageAccount(req, res, next);
    }

    return success(res, {
      account: serialize(account),
      page_check: { ok: true, page_count, max_pages: REG_PAGE_MAX_PAGES, proxy: maskProxy(proxyUrl) },
      cooldown_hours: REG_PAGE_COOLDOWN_HOURS,
      min_login_age_hours: waitSettings.hours,
      eligible_login_before: eligibleLoginBefore,
    }, 'Lay account reg Page thanh cong');
  } catch (err) {
    next(err);
  }
};

const reportRegPage = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    const uid = nullify(req.body.uid || req.body.username || req.query.uid || req.query.username);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    if (!uid) return error(res, 'Can truyen uid account', 400);

    const reportStatus = String(req.body.status || req.query.status || 'REG_XONG').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!['REG_XONG', 'REG_FAIL'].includes(reportStatus)) {
      return error(res, 'status chi nhan REG_XONG hoac REG_FAIL', 400);
    }

    let reportSource = 'reg_page_lock';
    let account = await FacebookAccount.findOne({
      where: { owner_username, kind: 'job', uid, device_id, reg_page_locked_by: device_id },
      order: [['reg_page_locked_at', 'DESC'], ['id', 'DESC']],
    });

    // Cho phep may dung ngay account vua nuoi xong de reg Page ma khong can goi get-account lan nua.
    // Bao cao nuoi thanh cong phai moi hon lan bao cao reg Page gan nhat, nen moi phien nuoi chi duoc dung mot lan.
    if (!account && reportStatus === 'REG_XONG') {
      const nurtureAccount = await FacebookAccount.findOne({
        where: {
          owner_username,
          kind: 'job',
          uid,
          device_id,
          status: { [Op.in]: ['LOGIN_THANH_CONG', 'DA_CHAY_XONG'] },
          nurture_status: 'DA_NUOI',
        },
        order: [['id', 'DESC']],
      });
      if (nurtureAccount) {
        const nurtureWhere = {
          owner_username,
          facebook_account_id: nurtureAccount.id,
          device_id,
          status: 'DA_NUOI',
        };
        if (nurtureAccount.last_reg_page_at) {
          nurtureWhere.completed_at = { [Op.gt]: nurtureAccount.last_reg_page_at };
        }
        const completedNurture = await FacebookNurtureLog.findOne({
          where: nurtureWhere,
          order: [['completed_at', 'DESC'], ['id', 'DESC']],
        });
        if (completedNurture) {
          account = nurtureAccount;
          reportSource = 'nurture';
        }
      }
    }

    if (!account) return error(res, 'Khong tim thay REGPAGE LOCK hoac phien nuoi moi cua may ' + device_id + ' voi UID ' + uid, 404);

    let pageCheck = null;
    if (reportStatus === 'REG_XONG') {
      const previousPageCount = Number(account.page_count) || 0;
      const proxyPool = await loadFacebookProxyPool(owner_username);
      const proxyUrl = pickFacebookProxy(proxyPool, account.uid);
      const pageResult = await checkFacebookPagesByToken(hydrateFacebookData(account).token, proxyUrl);
      if (!pageResult.ok) {
        const tokenDie = pageResult.token_status === 'die';
        await account.update({
          page_token_status: pageResult.token_status,
          page_token_error: pageResult.message,
          last_page_check_at: new Date(),
          ...(tokenDie ? { reg_page_locked_by: null, reg_page_locked_at: null } : {}),
        });
        return error(res, `Bao cao REG_XONG nhung khong check duoc Page cua UID ${uid}: ${pageResult.message}`, 422, {
          uid,
          device_id,
          token_status: pageResult.token_status,
          error_code: pageResult.error_code,
          proxy: maskProxy(proxyUrl),
        });
      }

      const currentPageCount = pageResult.pages.length;
      const pageDifference = currentPageCount - previousPageCount;
      const pagesAdded = Math.max(pageDifference, 0);
      const checkedAt = new Date();
      const transaction = await sequelize.transaction();
      try {
        const pageUpdate = {
          page_count: currentPageCount,
          pages: JSON.stringify(pageResult.pages),
          last_page_check_at: checkedAt,
          page_token_status: 'live',
          page_token_error: null,
          last_reg_page_at: checkedAt,
          reg_page_locked_by: null,
          reg_page_locked_at: null,
        };
        await account.update(pageUpdate, { transaction });
        await syncFacebookPageJobs(account, pageResult.pages, transaction);
        await FacebookAccount.update(pageUpdate, {
          where: { owner_username, kind: 'reg', uid },
          transaction,
        });
        await FacebookRegPageReport.create({
          owner_username,
          facebook_account_id: account.id,
          uid,
          device_id,
          stat_date: vietnamToday(),
          previous_page_count: previousPageCount,
          current_page_count: currentPageCount,
          page_difference: pageDifference,
          pages_added: pagesAdded,
        }, { transaction });
        await transaction.commit();
      } catch (err) {
        if (!transaction.finished) await transaction.rollback();
        throw err;
      }
      pageCheck = {
        ok: true,
        previous_page_count: previousPageCount,
        current_page_count: currentPageCount,
        page_difference: pageDifference,
        pages_added: pagesAdded,
        proxy: maskProxy(proxyUrl),
      };
    } else {
      await account.update({ reg_page_locked_by: null, reg_page_locked_at: null });
    }

    return success(res, {
      account: serialize(account),
      reg_page_status: reportStatus,
      report_source: reportSource,
      page_check: pageCheck,
      cooldown_hours: REG_PAGE_COOLDOWN_HOURS,
    }, reportStatus === 'REG_XONG' ? 'Da bao cao reg Page xong' : 'Da bao cao reg Page that bai');
  } catch (err) {
    next(err);
  }
};

const getRegPageStats = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const range = ['today', '7', '30', 'all'].includes(String(req.query.range || '').toLowerCase())
      ? String(req.query.range).toLowerCase()
      : 'all';
    const q = nullify(req.query.q);
    const accountWhere = { owner_username, kind: 'job' };
    const reportWhere = { owner_username };
    if (q) {
      accountWhere.device_id = { [Op.like]: `%${q}%` };
      reportWhere.device_id = { [Op.like]: `%${q}%` };
    }
    if (range === 'today') reportWhere.stat_date = { [Op.eq]: sequelize.literal('CURDATE()') };
    if (range === '7') reportWhere.stat_date = { [Op.gte]: sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 6 DAY)') };
    if (range === '30') reportWhere.stat_date = { [Op.gte]: sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 29 DAY)') };

    const [accountRows, reportRows] = await Promise.all([
      FacebookAccount.findAll({
        attributes: [
          'device_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN live_status = 'live' THEN 1 ELSE 0 END")), 'live'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN live_status = 'die' THEN 1 ELSE 0 END")), 'die'],
          [sequelize.fn('SUM', sequelize.col('page_count')), 'pages'],
          [sequelize.fn('MAX', sequelize.col('created_at')), 'last_reg_at'],
          [sequelize.fn('MAX', sequelize.col('last_page_check_at')), 'last_page_check_at'],
        ],
        where: accountWhere,
        group: ['device_id'],
        raw: true,
      }),
      FacebookRegPageReport.findAll({
        attributes: [
          'device_id',
          [sequelize.fn('SUM', sequelize.col('pages_added')), 'pages_registered'],
          [sequelize.fn('SUM', sequelize.col('page_difference')), 'page_difference'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'report_count'],
          [sequelize.fn('MAX', sequelize.col('created_at')), 'last_report_at'],
        ],
        where: reportWhere,
        group: ['device_id'],
        raw: true,
      }),
    ]);

    const machines = new Map();
    for (const row of accountRows) {
      const device = row.device_id || '-';
      machines.set(device, {
        device_id: device,
        total: Number(row.total) || 0,
        live: Number(row.live) || 0,
        die: Number(row.die) || 0,
        pages: Number(row.pages) || 0,
        page_account_count: Number(row.total) || 0,
        pages_registered: 0,
        page_difference: 0,
        report_count: 0,
        last_reg_at: row.last_reg_at || null,
        last_page_check_at: row.last_page_check_at || null,
        last_report_at: null,
      });
    }
    for (const row of reportRows) {
      const device = row.device_id || '-';
      const current = machines.get(device) || { device_id: device, total: 0, live: 0, die: 0, pages: 0, page_account_count: 0, last_reg_at: null };
      machines.set(device, {
        ...current,
        pages_registered: Number(row.pages_registered) || 0,
        page_difference: Number(row.page_difference) || 0,
        report_count: Number(row.report_count) || 0,
        last_report_at: row.last_report_at || null,
      });
    }

    const rows = [...machines.values()].sort((a, b) => String(a.device_id).localeCompare(String(b.device_id), 'vi', { numeric: true, sensitivity: 'base' }));
    const summary = rows.reduce((total, row) => ({
      total_accounts: total.total_accounts + row.total,
      live: total.live + row.live,
      die: total.die + row.die,
      total_pages: total.total_pages + row.pages,
      pages_registered: total.pages_registered + row.pages_registered,
      report_count: total.report_count + row.report_count,
    }), { total_accounts: 0, live: 0, die: 0, total_pages: 0, pages_registered: 0, report_count: 0 });

    return success(res, { range, summary, machines: rows }, 'Lay thong ke reg Page thanh cong');
  } catch (err) {
    next(err);
  }
};

const addFacebookJobCount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    const web = normalizeFacebookJobWeb(req.body.web || req.body.label || req.body.nhan || req.query.web || req.query.label || req.query.nhan);
    const rawCount = req.body.jobs ?? req.body.job_count ?? req.body.count ?? req.body.so_luong ?? req.query.jobs ?? req.query.job_count ?? req.query.count;
    const rawXu = req.body.xu ?? req.body.xu_count ?? req.body.coins ?? req.query.xu ?? req.query.xu_count ?? req.query.coins;
    const xu = rawXu === undefined || rawXu === null || rawXu === '' ? 0 : parseInt(rawXu, 10);
    const defaultJobs = xu > 0 ? 0 : 1;
    const jobs = rawCount === undefined || rawCount === null || rawCount === '' ? defaultJobs : parseInt(rawCount, 10);

    if (!device_id) return error(res, 'Can truyen device_id', 400);
    if (!web) return error(res, `Nhan web khong hop le. Dung: ${FACEBOOK_JOB_WEBS.join(', ')}`, 400);
    if (!Number.isInteger(jobs) || jobs < 0) return error(res, 'jobs phai la so nguyen >= 0', 400);
    if (!Number.isInteger(xu) || xu < 0) return error(res, 'xu phai la so nguyen >= 0', 400);
    if (jobs === 0 && xu === 0) return error(res, 'Can truyen jobs hoac xu lon hon 0', 400);

    await addFacebookDailyJobs({ owner_username, device_id, stat_date: vietnamToday(), web, jobs, xu });
    return success(res, { device_id, web, added_jobs: jobs, added_xu: xu, stat_date: vietnamToday() }, `Da ghi them ${jobs} job va ${xu} xu Facebook ${web}`);
  } catch (err) {
    next(err);
  }
};

const checkPageToken = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const token = req.body.token || req.body.access_token || req.query.token || req.query.access_token;
    const proxyPool = await loadFacebookProxyPool(owner_username);
    const proxyUrl = pickFacebookProxy(proxyPool, normalizeGraphAccessToken(token));
    const result = await checkFacebookPagesByToken(token, proxyUrl);
    return success(res, {
      ok: result.ok,
      message: result.message,
      token_status: result.token_status,
      error_code: result.error_code,
      page_count: result.ok ? result.pages.length : null,
      pages: result.pages,
      proxy: maskProxy(proxyUrl),
    }, result.ok ? 'Check page token thanh cong' : 'Check page token that bai');
  } catch (err) {
    next(err);
  }
};

const checkPages = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    const where = { owner_username };
    if (ids.length) where.id = { [Op.in]: ids };
    if (req.body.kind || req.query.kind) where.kind = normalizeKind(req.body.kind || req.query.kind, 'reg');

    const accounts = await FacebookAccount.findAll({ where, limit: ids.length ? undefined : 300, order: [['id', 'ASC']] });
    const { proxyPool, concurrency } = await loadFacebookCheckConfig(owner_username);
    const rows = await mapWithConcurrency(accounts, concurrency, async (account) => {
      const data = hydrateFacebookData(account);
      const proxyUrl = pickFacebookProxy(proxyPool, account.uid);
      const result = await checkFacebookPagesByToken(data.token, proxyUrl);
      const pageCount = result.pages.length;
      if (result.ok) {
        await account.update({
          page_count: pageCount,
          pages: JSON.stringify(result.pages),
          last_page_check_at: new Date(),
          page_token_status: 'live',
          page_token_error: null,
        });
        await syncFacebookPageJobs(account, result.pages);
      } else {
        await account.update({
          last_page_check_at: new Date(),
          page_token_status: result.token_status,
          page_token_error: result.message,
        });
      }
      return {
        id: account.id,
        uid: account.uid,
        ok: result.ok,
        message: result.message,
        token_status: result.token_status,
        page_count: result.ok ? pageCount : null,
        pages: result.pages,
        proxy: maskProxy(proxyUrl),
      };
    });
    const checked = rows.length;
    const successCount = rows.filter((row) => row.ok).length;
    const tokenDieCount = rows.filter((row) => row.token_status === 'die').length;
    const totalPages = rows.reduce((total, row) => total + (row.ok ? row.page_count : 0), 0);

    return success(res, { checked, success: successCount, token_die: tokenDieCount, page_count: totalPages, concurrency, rows }, 'Check page Facebook thanh cong');
  } catch (err) {
    next(err);
  }
};

const getAccountPages = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const accountId = parseInt(req.params.accountId, 10);
    if (!Number.isInteger(accountId) || accountId <= 0) return error(res, 'account_id khong hop le', 400);
    const account = await FacebookAccount.findOne({ where: { id: accountId, owner_username, kind: 'job' } });
    if (!account) return error(res, 'Khong tim thay account Facebook JOB', 404);

    const pageJobs = await getActivePageJobs(account);
    const pages = pageJobs.map((row) => {
      const page = row.toJSON();
      return {
        page_id: page.page_id,
        page_name: page.page_name,
        job_status: page.job_status,
        device_id: page.device_id,
        completed_at: page.completed_at,
        last_report_at: page.last_report_at,
      };
    });
    return success(res, { pages, summary: summarizePageJobs(pages.map((page) => ({ ...page, is_active: true }))) }, 'Lay danh sach Page thanh cong');
  } catch (err) {
    next(err);
  }
};

const reportPageJob = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const pageId = nullify(req.body.page_id || req.query.page_id);
    const deviceId = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    const status = String(req.body.status || req.query.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!pageId) return error(res, 'Can truyen page_id', 400);
    if (!deviceId) return error(res, 'Can truyen device_id', 400);
    if (!['CHUA_LAM', 'DA_LAM'].includes(status)) return error(res, 'status Page khong hop le', 400);

    const pageJob = await FacebookPageJob.findOne({ where: { owner_username, page_id: pageId, is_active: true } });
    if (!pageJob) return error(res, 'Khong tim thay Page Facebook JOB', 404);
    const account = await FacebookAccount.findOne({ where: { id: pageJob.facebook_account_id, owner_username, kind: 'job' } });
    if (!account) return error(res, 'Khong tim thay account Facebook JOB', 404);
    if (account.locked_by && account.locked_by !== deviceId) {
      return error(res, 'Account dang duoc khoa boi may ' + account.locked_by, 409);
    }
    if (!account.locked_by && account.device_id && account.device_id !== deviceId) {
      return error(res, 'Account dang thuoc may ' + account.device_id, 409);
    }

    const now = new Date();
    await pageJob.update({
      job_status: status,
      device_id: status === 'DA_LAM' ? deviceId : null,
      completed_at: status === 'DA_LAM' ? now : null,
      last_report_at: now,
    });
    const remainingPages = await FacebookPageJob.count({
      where: {
        owner_username,
        facebook_account_id: account.id,
        is_active: true,
        job_status: { [Op.ne]: 'DA_LAM' },
      },
    });
    const totalPages = await FacebookPageJob.count({
      where: { owner_username, facebook_account_id: account.id, is_active: true },
    });
    const allPagesCompleted = totalPages > 0 && remainingPages === 0;
    await account.update({
      status: allPagesCompleted ? 'DA_CHAY_XONG' : 'DANG_LAM',
      device_id: deviceId,
      locked_by: allPagesCompleted ? null : deviceId,
      locked_at: allPagesCompleted ? null : now,
      completed_at: allPagesCompleted ? now : null,
    });
    return success(res, {
      page: pageJob.toJSON(),
      account_status: allPagesCompleted ? 'DA_CHAY_XONG' : 'DANG_LAM',
      remaining_pages: remainingPages,
    }, status === 'DA_LAM' ? 'Da bao cao Page da lam' : 'Da bao cao Page chua lam');
  } catch (err) {
    next(err);
  }
};

const resetPageJobs = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const accountId = parseInt(req.body.account_id, 10);
    const pageIds = Array.isArray(req.body.page_ids)
      ? [...new Set(req.body.page_ids.map((value) => nullify(value)).filter(Boolean))]
      : [];
    const where = { owner_username, is_active: true };

    if (req.body.reset_all === true) {
      if (!Number.isInteger(accountId) || accountId <= 0) return error(res, 'account_id khong hop le', 400);
      const account = await FacebookAccount.findOne({ where: { id: accountId, owner_username, kind: 'job' } });
      if (!account) return error(res, 'Khong tim thay account Facebook JOB', 404);
      where.facebook_account_id = account.id;
    } else {
      if (!pageIds.length) return error(res, 'Can truyen danh sach page_ids', 400);
      where.page_id = { [Op.in]: pageIds };
    }

    const affectedPageRows = await FacebookPageJob.findAll({
      attributes: ['facebook_account_id'],
      where,
      raw: true,
    });
    const affectedAccountIds = [...new Set(affectedPageRows.map((row) => row.facebook_account_id).filter(Boolean))];

    const [affected] = await FacebookPageJob.update({
      job_status: 'CHUA_LAM',
      device_id: null,
      completed_at: null,
      last_report_at: null,
    }, { where });
    let requeuedAccounts = 0;
    if (affected > 0 && affectedAccountIds.length) {
      [requeuedAccounts] = await FacebookAccount.update({
        status: 'LOGIN_THANH_CONG',
        locked_by: null,
        locked_at: null,
        completed_at: null,
      }, {
        where: {
          id: { [Op.in]: affectedAccountIds },
          owner_username,
          kind: 'job',
          status: 'DA_CHAY_XONG',
        },
      });
    }
    return success(res, { affected, requeued_accounts: requeuedAccounts }, 'Da reset ' + affected + ' Page ve chua lam');
  } catch (err) {
    next(err);
  }
};

const bulkGet = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const accounts = await FacebookAccount.unscoped().findAll({
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) },
      order: [['id', 'ASC']],
    });
    const text = accounts.map((account) => formatFacebookPipe(hydrateFacebookData(account))).join('\n');
    return success(res, { text, count: accounts.length }, `Da lay ${accounts.length} account Facebook`);
  } catch (err) {
    next(err);
  }
};

const bulkSyncRegToJob = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean))] : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);

    const owner_username = ownerFromAdmin(req);
    const accounts = await FacebookAccount.findAll({
      where: { id: { [Op.in]: ids }, owner_username, kind: 'reg' },
      order: [['id', 'ASC']],
    });
    const result = { selected: ids.length, created: 0, updated: 0, skipped: ids.length - accounts.length, rows: [] };

    for (const account of accounts) {
      if (!account.device_id) {
        result.skipped += 1;
        result.rows.push({ id: account.id, uid: account.uid, result: 'skipped', reason: 'CHUA_CO_MAY' });
        continue;
      }
      if (!['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'].includes(account.status) || account.live_status === 'die') {
        result.skipped += 1;
        result.rows.push({ id: account.id, uid: account.uid, device_id: account.device_id, result: 'skipped', reason: 'ACCOUNT_CHUA_SAN_SANG' });
        continue;
      }

      const synced = await syncRegAccountToJob(account);
      if (synced.created) result.created += 1;
      else result.updated += 1;
      result.rows.push({
        id: account.id,
        uid: account.uid,
        device_id: account.device_id,
        job_account_id: synced.account.id,
        result: synced.created ? 'created' : 'updated',
      });
    }

    return success(res, result, `Da chuyen ${result.created + result.updated}/${result.selected} account Reg sang Facebook Job`);
  } catch (err) {
    next(err);
  }
};

const bulkMoveGroup = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);

    const kind = normalizeKind(req.body.kind, 'job');
    const groupId = parseInt(req.body.group_id, 10);
    if (!Number.isInteger(groupId) || groupId <= 0) return error(res, 'group_id khong hop le', 400);

    const owner_username = ownerFromAdmin(req);
    const group = await AccountGroup.findOne({
      where: { id: groupId, owner_username, account_type: groupTypeForKind(kind) },
    });
    if (!group) return error(res, 'Khong tim thay nhom Facebook', 404);

    const [affected] = await FacebookAccount.update(
      { group_id: group.id },
      { where: { id: { [Op.in]: ids }, owner_username } }
    );
    return success(res, { affected, group }, 'Da chuyen ' + affected + ' account sang nhom ' + group.name);
  } catch (err) {
    next(err);
  }
};

const bulkAction = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);

    const action = String(req.body.action || '').trim();
    if (action !== 'set_status') return error(res, 'Action khong hop le', 400);

    const status = normalizeStatus(req.body.status, '');
    if (!status) return error(res, `Trang thai khong hop le. Dung: ${STATUSES.join(', ')}`, 400);

    const owner_username = ownerFromAdmin(req);
    const update = { status };
    if (status === 'CHO_LOGIN') {
      update.locked_by = null;
      update.locked_at = null;
      update.login_get_count = 0;
      update.completed_at = null;
    } else if (status === 'LOGIN_THANH_CONG') {
      update.locked_by = null;
      update.locked_at = null;
      update.login_get_count = 0;
      update.login_at = new Date();
      update.completed_at = null;
    } else if (status === 'DANG_LAM') {
      update.completed_at = null;
    } else if (FINAL_STATUSES.includes(status)) {
      update.locked_by = null;
      update.locked_at = null;
      update.completed_at = new Date();
    }
    if (status === 'ACCOUNT_DIE') update.live_status = 'die';

    const actionWhere = { id: { [Op.in]: ids }, owner_username };
    if (status === 'DANG_LAM') {
      actionWhere.nurture_status = { [Op.ne]: 'DANG_NUOI' };
      actionWhere.reg_page_locked_by = null;
    }
    if (status !== 'LOGIN_THANH_CONG') {
      const [affected] = await FacebookAccount.update(update, { where: actionWhere });
      return success(res, { affected }, `Da chuyen ${affected} account sang ${status}`);
    }

    const result = await sequelize.transaction(async (transaction) => {
      const completedJobs = await FacebookAccount.findAll({
        attributes: ['id'],
        where: { ...actionWhere, kind: 'job', status: 'DA_CHAY_XONG' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const completedJobIds = completedJobs.map((account) => account.id);

      const [affected] = await FacebookAccount.update(update, { where: actionWhere, transaction });
      let resetPages = 0;
      if (completedJobIds.length) {
        [resetPages] = await FacebookPageJob.update({
          job_status: 'CHUA_LAM',
          device_id: null,
          completed_at: null,
          last_report_at: null,
        }, {
          where: { owner_username, facebook_account_id: { [Op.in]: completedJobIds }, is_active: true },
          transaction,
        });
      }
      return { affected, reset_pages: resetPages };
    });
    return success(res, result, result.reset_pages
      ? `Da chuyen ${result.affected} account sang ${status}, reset ${result.reset_pages} Page`
      : `Da chuyen ${result.affected} account sang ${status}`);
  } catch (err) {
    next(err);
  }
};

const bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const owner_username = ownerFromAdmin(req);
    const accounts = await FacebookAccount.findAll({
      attributes: ['id', 'kind'],
      where: { id: { [Op.in]: ids }, owner_username },
    });
    const jobIds = accounts.filter((account) => account.kind === 'job').map((account) => account.id);
    const regIds = accounts.filter((account) => account.kind === 'reg').map((account) => account.id);
    const transaction = await sequelize.transaction();
    let trashed = 0;
    let deleted = 0;
    try {
      if (jobIds.length) {
        [trashed] = await FacebookAccount.update({
          trashed_at: new Date(),
          locked_by: null,
          locked_at: null,
          reg_page_locked_by: null,
          reg_page_locked_at: null,
          nurture_status: sequelize.literal("CASE WHEN nurture_status = 'DANG_NUOI' THEN 'NUOI_FAIL' ELSE nurture_status END"),
          nurture_locked_by: null,
          nurture_locked_at: null,
          nurture_run_id: null,
        }, {
          where: { id: { [Op.in]: jobIds }, owner_username, kind: 'job' },
          transaction,
        });
      }
      if (regIds.length) {
        await FacebookPageJob.destroy({ where: { facebook_account_id: { [Op.in]: regIds }, owner_username }, transaction });
        deleted = await FacebookAccount.destroy({
          where: { id: { [Op.in]: regIds }, owner_username, kind: 'reg' },
          transaction,
        });
      }
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
    return success(res, { trashed, deleted }, 'Da chuyen ' + trashed + ' account Job vao Thung rac' + (deleted ? ' va xoa ' + deleted + ' account Reg' : ''));
  } catch (err) {
    next(err);
  }
};

const listTrash = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const sortBy = ['device_id', 'page_count', 'reg_page_locked_by', 'trashed_at'].includes(req.query.sort_by) ? req.query.sort_by : null;
    const sortDirection = String(req.query.sort_order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = {
      owner_username,
      kind: 'job',
      trashed_at: { [Op.ne]: null },
    };
    const groupId = parseInt(req.query.group_id, 10);
    if (Number.isInteger(groupId) && groupId > 0) where.group_id = groupId;
    const liveStatus = String(req.query.live_status || '').trim().toLowerCase();
    if (['unknown', 'live', 'die'].includes(liveStatus)) where.live_status = liveStatus;
    const q = nullify(req.query.q || req.query.uid);
    if (q) {
      where[Op.or] = [
        { uid: { [Op.like]: '%' + q + '%' } },
        { email: { [Op.like]: '%' + q + '%' } },
        { device_id: { [Op.like]: '%' + q + '%' } },
      ];
    }
    let order = [['trashed_at', 'DESC'], ['id', 'DESC']];
    if (sortBy === 'page_count') {
      order = [['page_count', sortDirection], ['id', 'DESC']];
    } else if (sortBy === 'device_id') {
      order = [
        [sequelize.literal("CASE WHEN device_id IS NULL OR device_id = '' THEN 1 ELSE 0 END"), 'ASC'],
        [sequelize.fn('CHAR_LENGTH', sequelize.col('device_id')), sortDirection],
        ['device_id', sortDirection],
        ['id', 'DESC'],
      ];
    } else if (sortBy === 'reg_page_locked_by') {
      order = [
        [sequelize.literal("CASE WHEN reg_page_locked_by IS NULL OR reg_page_locked_by = '' THEN 0 ELSE 1 END"), sortDirection],
        ['reg_page_locked_at', sortDirection],
        ['id', 'DESC'],
      ];
    } else if (sortBy === 'trashed_at') {
      order = [['trashed_at', sortDirection], ['id', 'DESC']];
    }
    const { rows, count } = await FacebookAccount.unscoped().findAndCountAll({
      where,
      order,
      limit,
      offset: (page - 1) * limit,
    });
    return success(res, {
      accounts: rows.map(serialize),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    }, 'Lay Thung rac Facebook Job thanh cong');
  } catch (err) {
    next(err);
  }
};

const restoreTrash = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean))] : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const owner_username = ownerFromAdmin(req);
    const transaction = await sequelize.transaction();
    let restored = 0;
    try {
      await FacebookAccount.unscoped().update({
        status: 'CHO_LOGIN',
        login_get_count: 0,
        locked_by: null,
        locked_at: null,
        completed_at: null,
      }, {
        where: {
          id: { [Op.in]: ids },
          owner_username,
          kind: 'job',
          trashed_at: { [Op.ne]: null },
          status: 'DANG_LOGIN',
        },
        transaction,
      });
      await FacebookAccount.unscoped().update({
        status: 'LOGIN_THANH_CONG',
        locked_by: null,
        locked_at: null,
        completed_at: null,
      }, {
        where: {
          id: { [Op.in]: ids },
          owner_username,
          kind: 'job',
          trashed_at: { [Op.ne]: null },
          status: 'DANG_LAM',
        },
        transaction,
      });
      [restored] = await FacebookAccount.unscoped().update({
        trashed_at: null,
        reg_page_locked_by: null,
        reg_page_locked_at: null,
        nurture_locked_by: null,
        nurture_locked_at: null,
        nurture_run_id: null,
      }, {
        where: {
          id: { [Op.in]: ids },
          owner_username,
          kind: 'job',
          trashed_at: { [Op.ne]: null },
        },
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
    return success(res, { restored }, 'Da khoi phuc ' + restored + ' account Facebook Job');
  } catch (err) {
    next(err);
  }
};

const deleteTrash = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean))] : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const owner_username = ownerFromAdmin(req);
    const transaction = await sequelize.transaction();
    let deleted = 0;
    try {
      const trashedAccounts = await FacebookAccount.unscoped().findAll({
        attributes: ['id'],
        where: {
          id: { [Op.in]: ids },
          owner_username,
          kind: 'job',
          trashed_at: { [Op.ne]: null },
        },
        transaction,
      });
      const accountIds = trashedAccounts.map((account) => account.id);
      if (accountIds.length) {
        await FacebookPageJob.destroy({
          where: { owner_username, facebook_account_id: { [Op.in]: accountIds } },
          transaction,
        });
        deleted = await FacebookAccount.unscoped().destroy({
          where: {
            id: { [Op.in]: accountIds },
            owner_username,
            kind: 'job',
            trashed_at: { [Op.ne]: null },
          },
          transaction,
        });
      }
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
    return success(res, { deleted }, 'Da xoa vinh vien ' + deleted + ' account Facebook Job');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  importFromDashboard,
  importFromApi,
  reportRegOnly,
  getJobForPhone,
  checkDeviceAccountCount,
  getLoginSuccessJobForPhone,
  report,
  checkLive,
  checkPageToken,
  checkPages,
  getAccountPages,
  reportPageJob,
  getRegPageAccount,
  reportRegPage,
  getNurtureAccount,
  reportNurtureAccount,
  listNurtureAccounts,
  listNurtureLogs,
  resetNurtureAccounts,
  getRegPageStats,
  addFacebookJobCount,
  resetPageJobs,
  bulkGet,
  bulkSyncRegToJob,
  bulkMoveGroup,
  bulkAction,
  bulkDelete,
  listTrash,
  restoreTrash,
  deleteTrash,
};
