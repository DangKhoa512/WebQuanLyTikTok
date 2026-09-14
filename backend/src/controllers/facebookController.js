const { Op } = require('sequelize');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPageJob = require('../models/FacebookPageJob');
const AccountGroup = require('../models/AccountGroup');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { getFacebookLoginLimitSettings } = require('../services/settingsService');

const STATUSES = ['CHO_LOGIN', 'DANG_LOGIN', 'DANG_LAM', 'LOGIN_THANH_CONG', 'LOGIN_FAIL', 'DA_CHAY_XONG', 'ACCOUNT_DIE'];
const FINAL_STATUSES = ['LOGIN_FAIL', 'DA_CHAY_XONG', 'ACCOUNT_DIE'];
const KINDS = ['reg', 'job'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.FACEBOOK_LOCK_TIMEOUT_MIN, 10) || 120;
const REG_PAGE_MAX_PAGES = 15;
const REG_PAGE_COOLDOWN_HOURS = 24;
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
    if (!parsed.email_pass && parsed.email && i === emailIndex + 1 && !looksLikeCookie(value) && !looksLikeToken(value) && !looksLikeEmail(value) && !looksLikeClientId(value) && !looksLikeRefreshToken(value)) {
      parsed.email_pass = value;
      used.add(i);
      continue;
    }
    if (!parsed.two_fa && looksLikeTwoFa(value)) { parsed.two_fa = value; used.add(i); continue; }
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

const importFacebookAccounts = async ({ text, owner_username, kind = 'job', status = 'CHO_LOGIN', groupId = null, device_id = null }) => {
  const lines = splitLines(text);
  const result = { total: lines.length, created: 0, duplicated: 0, invalid: 0 };

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

    const [account, created] = await FacebookAccount.findOrCreate({
      where: { owner_username, kind, uid: parsed.uid },
      defaults: baseData,
    });

    if (created) result.created += 1;
    else {
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
        duplicateUpdate.login_at = null;
        duplicateUpdate.completed_at = null;
      }
      await account.update(duplicateUpdate);
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
    const where = { owner_username, kind };

    const status = normalizeStatus(req.query.status, '');
    const date_from = String(req.query.date_from || '').trim();
    const date_to = String(req.query.date_to || '').trim();
    const soakDays = parseNonNegativeInt(req.query.soak_days);
    const liveStatus = String(req.query.live_status || '').trim().toLowerCase();
    if (['unknown', 'live', 'die'].includes(liveStatus)) where.live_status = liveStatus;
    const groupId = parseInt(req.query.group_id, 10);
    if (Number.isInteger(groupId) && groupId > 0) where.group_id = groupId;
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

    const { rows, count } = await FacebookAccount.findAndCountAll({
      where,
      order: status === 'DA_CHAY_XONG' ? [['completed_at', 'DESC'], ['id', 'DESC']] : [['updated_at', 'DESC'], ['id', 'DESC']],
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
    return success(res, result, `Da nhan ${result.created}/${result.total} account Facebook`);
  } catch (err) {
    next(err);
  }
};

const releaseStaleFacebookLocks = async ({ owner_username, groupId, status, releaseStatus }) => {
  const staleWhere = {
    owner_username,
    kind: 'job',
    status,
    locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) },
  };
  if (groupId) staleWhere.group_id = groupId;
  await FacebookAccount.update(
    { status: releaseStatus, locked_by: null, locked_at: null },
    { where: staleWhere }
  );
};

const getJobForPhone = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    const groupId = await resolveJobGroupIdForRequest(req, owner_username);
    if (groupId === false) return error(res, 'Nhom Facebook JOB khong hop le', 400);

    await releaseStaleFacebookLocks({ owner_username, groupId, status: 'DANG_LOGIN', releaseStatus: 'CHO_LOGIN' });

    const account = await sequelize.transaction(async (t) => {
      const activeWhere = { owner_username, kind: 'job', status: 'DANG_LOGIN', locked_by: device_id };
      if (groupId) activeWhere.group_id = groupId;
      const active = await FacebookAccount.findOne({
        where: activeWhere,
        order: [['locked_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (active) return active;

      const used = await countDeviceFacebookLoginActive({ owner_username, device_id, groupId, transaction: t });
      const loginLimit = await getFacebookLoginLimitSettings(owner_username);
      if (used >= loginLimit.limit) {
        return { __fullLimit: true, limit: loginLimit.limit, used };
      }

      const nextWhere = { owner_username, kind: 'job', status: 'CHO_LOGIN' };
      if (groupId) nextWhere.group_id = groupId;
      const nextAccount = await FacebookAccount.findOne({
        where: nextWhere,
        order: [['id', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!nextAccount) return null;
      await nextAccount.update({ status: 'DANG_LOGIN', locked_by: device_id, locked_at: new Date(), device_id, completed_at: null }, { transaction: t });
      return nextAccount;
    });

    if (account?.__fullLimit) {
      return success(res, { limit: account.limit, used: account.used }, 'Full limit');
    }
    if (!account) return success(res, { account: null }, 'Het account Facebook JOB cho login');
    return success(res, { account: await serializeForPhone(account), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay account Facebook JOB thanh cong');
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

    const account = await sequelize.transaction(async (t) => {
      const activeWhere = {
        owner_username,
        kind: 'job',
        status: 'DANG_LAM',
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
        [Op.or]: [{ device_id }, { locked_by: device_id }],
      };
      if (groupId) nextWhere.group_id = groupId;
      const nextAccount = await FacebookAccount.findOne({
        where: nextWhere,
        order: [['login_at', 'ASC'], ['id', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!nextAccount) return null;
      await nextAccount.update({ status: 'DANG_LAM', locked_by: device_id, locked_at: new Date(), device_id, completed_at: null }, { transaction: t });
      return nextAccount;
    });

    if (!account) return success(res, { account: null }, 'Het account Facebook JOB login thanh cong');
    const currentPage = await claimPageForPhone({ account, device_id });
    return success(res, { account: await serializeForPhone(account, currentPage), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay account Facebook JOB login thanh cong');
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

const checkFacebookUidLive = async (uid) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(uid)}/picture?redirect=false`, { signal: controller.signal });
    const json = await response.json();
    return json?.data?.height != null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
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
    const rows = [];
    let live = 0;
    let die = 0;
    let unknown = 0;

    for (const account of accounts) {
      const result = await checkFacebookUidLive(account.uid);
      const live_status = result === true ? 'live' : result === false ? 'die' : 'unknown';
      if (live_status === 'live') live += 1;
      else if (live_status === 'die') die += 1;
      else unknown += 1;
      const updates = { live_status, last_live_check_at: new Date() };
      if (live_status === 'die') updates.status = 'ACCOUNT_DIE';
      await account.update(updates);
      rows.push({ id: account.id, uid: account.uid, result: live_status });
    }

    return success(res, { live, die, unknown, rows }, 'Check live Facebook thanh cong');
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

const checkFacebookPagesByToken = async (token) => {
  const accessToken = normalizeGraphAccessToken(token);
  if (!accessToken) return { ok: false, message: 'NO_TOKEN', pages: [], token_status: 'die', error_code: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = new URL('https://graph.facebook.com/v26.0/me/accounts');
    url.searchParams.set('fields', 'id,name,access_token,tasks');
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, { signal: controller.signal });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) {
      const message = json?.error?.message || 'GRAPH_ERROR';
      const errorCode = Number(json?.error?.code) || null;
      const tokenDie = errorCode === 190 || /validating access token|session has been invalidated/i.test(message);
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
    return { ok: false, message: err.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED', pages: [], token_status: 'unknown', error_code: null };
  } finally {
    clearTimeout(timeout);
  }
};

const regPageBaseWhere = ({ owner_username, device_id }) => ({
  owner_username,
  device_id,
  page_count: { [Op.lt]: REG_PAGE_MAX_PAGES },
  page_token_status: { [Op.ne]: 'die' },
  status: { [Op.in]: ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'] },
  [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }],
});

const getRegPageAccount = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    // Neu tool dung giua chung, lan goi tiep theo phai tra lai dung account dang lock.
    let account = await FacebookAccount.findOne({
      where: { ...regPageBaseWhere({ owner_username, device_id }), reg_page_locked_by: device_id },
      order: [['reg_page_locked_at', 'DESC'], ['id', 'ASC']],
    });

    if (!account) {
      account = await sequelize.transaction(async (transaction) => {
        const commonWhere = {
          ...regPageBaseWhere({ owner_username, device_id }),
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
      });
    }

    const data = hydrateFacebookData(account);
    const pageResult = await checkFacebookPagesByToken(data.token);
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
      page_check: { ok: true, page_count, max_pages: REG_PAGE_MAX_PAGES },
      cooldown_hours: REG_PAGE_COOLDOWN_HOURS,
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

    const account = await FacebookAccount.findOne({
      where: { owner_username, uid, device_id, reg_page_locked_by: device_id },
      order: [['reg_page_locked_at', 'DESC'], ['id', 'DESC']],
    });
    if (!account) return error(res, 'Khong tim thay account dang lock reg Page cua may ' + device_id + ' voi UID ' + uid, 404);

    const update = { reg_page_locked_by: null, reg_page_locked_at: null };
    if (reportStatus === 'REG_XONG') update.last_reg_page_at = new Date();
    await account.update(update);

    return success(res, {
      account: serialize(account),
      reg_page_status: reportStatus,
      cooldown_hours: REG_PAGE_COOLDOWN_HOURS,
    }, reportStatus === 'REG_XONG' ? 'Da bao cao reg Page xong' : 'Da bao cao reg Page that bai');
  } catch (err) {
    next(err);
  }
};

const checkPageToken = async (req, res, next) => {
  try {
    const token = req.body.token || req.body.access_token || req.query.token || req.query.access_token;
    const result = await checkFacebookPagesByToken(token);
    return success(res, {
      ok: result.ok,
      message: result.message,
      token_status: result.token_status,
      error_code: result.error_code,
      page_count: result.ok ? result.pages.length : null,
      pages: result.pages,
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
    const rows = [];
    let checked = 0;
    let successCount = 0;
    let tokenDieCount = 0;
    let totalPages = 0;

    for (const account of accounts) {
      const data = hydrateFacebookData(account);
      const result = await checkFacebookPagesByToken(data.token);
      const pageCount = result.pages.length;
      checked += 1;
      if (result.ok) successCount += 1;
      if (result.ok) totalPages += pageCount;
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
        if (result.token_status === 'die') tokenDieCount += 1;
        await account.update({
          last_page_check_at: new Date(),
          page_token_status: result.token_status,
          page_token_error: result.message,
        });
      }
      rows.push({
        id: account.id,
        uid: account.uid,
        ok: result.ok,
        message: result.message,
        token_status: result.token_status,
        page_count: result.ok ? pageCount : null,
        pages: result.pages,
      });
    }

    return success(res, { checked, success: successCount, token_die: tokenDieCount, page_count: totalPages, rows }, 'Check page Facebook thanh cong');
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
    await account.update({
      status: 'DANG_LAM',
      device_id: deviceId,
      locked_by: deviceId,
      locked_at: now,
      completed_at: null,
    });
    return success(res, {
      page: pageJob.toJSON(),
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

    const [affected] = await FacebookPageJob.update({
      job_status: 'CHUA_LAM',
      device_id: null,
      completed_at: null,
      last_report_at: null,
    }, { where });
    return success(res, { affected }, 'Da reset ' + affected + ' Page ve chua lam');
  } catch (err) {
    next(err);
  }
};

const bulkGet = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const accounts = await FacebookAccount.findAll({
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) },
      order: [['id', 'ASC']],
    });
    const text = accounts.map((account) => formatFacebookPipe(hydrateFacebookData(account))).join('\n');
    return success(res, { text, count: accounts.length }, `Da lay ${accounts.length} account Facebook`);
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
      update.completed_at = null;
    } else if (status === 'LOGIN_THANH_CONG') {
      update.locked_by = null;
      update.locked_at = null;
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

    const [affected] = await FacebookAccount.update(update, { where: { id: { [Op.in]: ids }, owner_username } });
    return success(res, { affected }, `Da chuyen ${affected} account sang ${status}`);
  } catch (err) {
    next(err);
  }
};

const bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const owner_username = ownerFromAdmin(req);
    const transaction = await sequelize.transaction();
    let deleted;
    try {
      await FacebookPageJob.destroy({ where: { facebook_account_id: { [Op.in]: ids }, owner_username }, transaction });
      deleted = await FacebookAccount.destroy({ where: { id: { [Op.in]: ids }, owner_username }, transaction });
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
    return success(res, { deleted }, `Da xoa ${deleted} account Facebook`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  importFromDashboard,
  importFromApi,
  getJobForPhone,
  getLoginSuccessJobForPhone,
  report,
  checkLive,
  checkPageToken,
  checkPages,
  getAccountPages,
  reportPageJob,
  getRegPageAccount,
  reportRegPage,
  resetPageJobs,
  bulkGet,
  bulkMoveGroup,
  bulkAction,
  bulkDelete,
};
