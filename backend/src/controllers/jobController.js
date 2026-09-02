const { Op, fn, col } = require('sequelize');
const JobAccount = require('../models/JobAccount');
const AccountGroup = require('../models/AccountGroup');
const logger = require('../config/logger');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { checkOne, parseProxy } = require('../utils/checkLiveUtils');
const { addDailyJobs } = require('../services/jobDailyStatService');

const STATUSES = [
  'ACCOUNT_CHAY',
  'DANG_LAM',
  'DUOI_50_JOB',
  'FAIL_AVT',
  'LOI_CAU_HINH',
  'DA_CHAY_XONG',
  'ACCOUNT_DIE',
];
const FINAL_STATUSES = ['DUOI_50_JOB', 'FAIL_AVT', 'LOI_CAU_HINH', 'DA_CHAY_XONG', 'ACCOUNT_DIE'];
const JOB_TYPES = ['chrome', 'hotmail'];
const JOB_WEBS = ['TDS', 'XSMM'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.JOB_LOCK_TIMEOUT_MIN, 10) || 120;
const XU_PER_JOB = parseInt(process.env.JOB_XU_PER_JOB, 10) || 1400;
const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const SORT_FIELDS = {
  video_count: 'video_count',
  followers: 'followers',
  following: 'following',
  job_count: 'job_count',
  created_at: 'created_at',
  login_at: 'login_at',
  completed_at: 'completed_at',
  id: 'id',
};

const nullify = (value) => {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized.toLowerCase() === 'null' ? null : normalized;
};
const pipeValue = (value) =>
  value === undefined || value === null || value === '' ? 'null' : String(value);
const looksLikeTokenData = (value) => {
  const normalized = nullify(value);
  if (!normalized) return false;
  return /(^|[;\s])(sessionid|sid_guard|uid_tt|ttwid|passport_csrf_token|tt_csrf_token|odin_tt|mstoken|x-web-secsdk-uid|store-country-sign|store-country-code|tt-target-idc)=/i.test(normalized)
    || normalized.length > 255;
};
const pad2 = (value) => String(value).padStart(2, '0');
const buildLocalDate = ({ dd, MM, yyyy, hh = '0', min = '0', ss = '0' }) => {
  const date = new Date(
    Number(yyyy),
    Number(MM) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );
  const isValid =
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(MM) - 1 &&
    date.getDate() === Number(dd);
  return isValid ? date : null;
};

const normalizeJobStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['DIE', 'ACC_DIE', 'ACCOUNT_DIE'].includes(normalized)) return 'ACCOUNT_DIE';
  return normalized;
};

const requestValue = (req, ...keys) => {
  for (const key of keys) {
    const value = req.body?.[key] ?? req.query?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const isDieReportRequest = (req) => {
  const status = normalizeJobStatus(requestValue(req, 'status', 'trang_thai', 'state'));
  const liveStatus = String(requestValue(req, 'live_status', 'live', 'result')).trim().toLowerCase();
  const reason = String(requestValue(req, 'reason', 'note', 'message')).trim().toLowerCase();
  return status === 'ACCOUNT_DIE' || liveStatus === 'die' || /\bdie\b/.test(reason);
};
const parseRegAt = (value) => {
  const normalized = nullify(value);
  if (!normalized) return null;
  const timeFirst = normalized.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );
  if (timeFirst) {
    const [, hh, min, ss = '0', dd, MM, yyyy] = timeFirst;
    return buildLocalDate({ dd, MM, yyyy, hh, min, ss });
  }
  const dayFirst = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dayFirst) {
    const [, dd, MM, yyyy, hh = '0', min = '0', ss = '0'] = dayFirst;
    return buildLocalDate({ dd, MM, yyyy, hh, min, ss });
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatRegAt = (value) => {
  if (!value) return 'null';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pipeValue(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};
const trimTrailingNulls = (values) => {
  const out = values.map((value) => pipeValue(value));
  while (out.length > 4 && out[out.length - 1] === 'null') out.pop();
  return out;
};
const formatJobPipe = (account) => {
  const rawData = String(account.raw_data || '').trim();
  const rawParts = rawData.split('|');
  if (rawParts.length === 4 && looksLikeTokenData(rawParts[3])) return rawData;
  if (account.job_type === 'hotmail' && rawData.split('|').length > 4) return rawData;

  const values = [
    account.username || '',
    account.password,
    account.email,
    account.email_pass,
  ];
  if (account.refresh_token || account.client_id || account.reg_at) {
    values.push(account.refresh_token, account.client_id, formatRegAt(account.reg_at));
  }
  return trimTrailingNulls(values).join('|');
};
const serializeJobAccount = (account) => {
  const data = account?.toJSON ? account.toJSON() : { ...account };
  if (data.job_type === 'hotmail' && data.raw_data) {
    const parts = String(data.raw_data).split('|');
    if (parts.length > 4) {
      data.refresh_token = data.refresh_token || nullify(parts[4]);
      data.client_id = data.client_id || nullify(parts[5]);
      data.reg_at = data.reg_at || parseRegAt(parts[6]);
    }
  }
  return data;
};

const parseNonNegativeInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
const parseXuInput = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
const addedXuFromRequest = (req, currentXu, addedJobs, jobWeb) => {
  const totalXu = parseXuInput(req.body.xulive ?? req.body.total_xu ?? req.body.total_coin ?? req.body.total_coins);
  if (totalXu !== null) {
    return { addedXu: Math.max(totalXu - currentXu, 0), nextXu: totalXu };
  }

  const addXu = parseXuInput(
    req.body.xu ?? req.body.xu_count ?? req.body.xu_nhan ?? req.body.coin ?? req.body.coins ?? req.body.money
  );
  if (addXu !== null) {
    return { addedXu: addXu, nextXu: currentXu + addXu };
  }

  if (jobWeb === 'XSMM') return null;
  const computedXu = addedJobs * XU_PER_JOB;
  return { addedXu: computedXu, nextXu: currentXu + computedXu };
};
const parseJobType = (value, fallback = 'chrome') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return JOB_TYPES.includes(normalized) ? normalized : null;
};
const parseJobWeb = (value, fallback = 'TDS') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (normalized === 'XSMB') return 'XSMM';
  return JOB_WEBS.includes(normalized) ? normalized : fallback;
};
const xuPerJobForWeb = (web) => (web === 'XSMM' ? 1 : XU_PER_JOB);
const vietnamToday = () => VN_DATE_FORMATTER.format(new Date());
const todayJobUpdate = (account, addedJobs) => {
  const today = vietnamToday();
  const storedDate = account.today_job_date ? String(account.today_job_date).slice(0, 10) : null;
  const currentTodayJobs = storedDate === today ? Number(account.today_job_count) || 0 : 0;
  return {
    today_job_date: today,
    today_job_count: currentTodayJobs + Math.max(0, addedJobs),
  };
};

const buildSortOrder = (sortBy, sortDir, status = '') => {
  if (!sortBy && status === 'DA_CHAY_XONG') {
    return [['completed_at', 'DESC'], ['id', 'DESC']];
  }

  const field = SORT_FIELDS[sortBy] || 'id';
  const dir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const order = [[field, dir]];
  if (field !== 'id') order.push(['id', 'DESC']);
  return order;
};

const accountWhere = (req, owner_username) => {
  const id = parseInt(req.body.id ?? req.query.id, 10);
  if (Number.isInteger(id) && id > 0) return { id, owner_username };
  const username = nullify(req.body.username ?? req.query.username);
  return username ? { username, owner_username } : null;
};

const resolveJobGroupId = async (req, owner_username, job_type = null) => {
  const groupId = parseInt(req.body.group_id ?? req.query.group_id, 10);
  const where = { owner_username, account_type: 'job' };
  if (job_type) where.job_type = job_type;
  if (Number.isInteger(groupId) && groupId > 0) {
    const group = await AccountGroup.findOne({
      where: { ...where, id: groupId },
      attributes: ['id'],
    });
    return group ? group.id : false;
  }

  const groupName = nullify(req.body.group_name ?? req.query.group_name);
  if (groupName) {
    const group = await AccountGroup.findOne({
      where: { ...where, name: groupName },
      attributes: ['id'],
    });
    return group ? group.id : false;
  }

  return null;
};

const assertDeviceOwnership = (account, deviceId) => {
  if (account.locked_by && account.locked_by !== deviceId) {
    const err = new Error(`Account dang duoc khoa boi may ${account.locked_by}`);
    err.statusCode = 409;
    throw err;
  }
};

const importJobAccounts = async ({ text, owner_username, jobType, groupId }) => {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    const err = new Error('Khong co account de import');
    err.statusCode = 400;
    throw err;
  }
  if (lines.length > 5000) {
    const err = new Error('Toi da 5000 account moi lan');
    err.statusCode = 400;
    throw err;
  }

  const unique = new Map();
  const invalid = [];
  for (const line of lines) {
    const parts = line.split('|');
    const username = nullify(parts[0]);
    if (!username) {
      invalid.push(line.slice(0, 80));
      continue;
    }
    if (!unique.has(username)) {
      const fourthValue = nullify(parts[3]);
      const fourthIsToken = looksLikeTokenData(fourthValue);
      unique.set(username, {
        raw_data: line,
        username,
        password: nullify(parts[1]),
        email: nullify(parts[2]),
        email_pass: fourthIsToken ? null : fourthValue,
        refresh_token: fourthIsToken ? fourthValue : nullify(parts[4]),
        client_id: nullify(parts[5]),
        reg_at: parseRegAt(parts[6]),
        owner_username,
        group_id: groupId,
        job_type: jobType,
        status: 'ACCOUNT_CHAY',
      });
    }
  }

  const rows = [...unique.values()];
  const existing = rows.length
    ? await JobAccount.findAll({
        where: { owner_username, username: { [Op.in]: rows.map((row) => row.username) } },
        attributes: ['username'],
      })
    : [];
  const existingNames = new Set(existing.map((row) => row.username));
  const toInsert = rows.filter((row) => !existingNames.has(row.username));
  if (toInsert.length) await JobAccount.bulkCreate(toInsert);

  return {
    imported: toInsert.length,
    duplicates: rows.length - toInsert.length,
    invalid: invalid.length,
    invalid_samples: invalid.slice(0, 10),
  };
};

const resolveImportJobGroupId = async ({ group_id, group_name, owner_username, jobType }) => {
  const groupId = group_id ? parseInt(group_id, 10) : null;
  if (group_id && (!Number.isInteger(groupId) || groupId <= 0)) {
    const err = new Error('group_id khong hop le');
    err.statusCode = 400;
    throw err;
  }

  const where = { owner_username, account_type: 'job', job_type: jobType };
  if (groupId) where.id = groupId;
  if (!groupId && nullify(group_name)) where.name = nullify(group_name);
  if (!groupId && !where.name) return null;

  const group = await AccountGroup.findOne({ where, attributes: ['id'] });
  if (!group) {
    const err = new Error('Nhom JOB khong ton tai');
    err.statusCode = 404;
    throw err;
  }
  return group.id;
};

const importAccounts = async (req, res, next) => {
  try {
    const { text, group_id } = req.body;
    const jobType = parseJobType(req.body.job_type, 'chrome');
    const owner_username = ownerFromAdmin(req);
    if (!text || typeof text !== 'string') return error(res, 'Thieu du lieu import', 400);
    if (!jobType) return error(res, 'job_type khong hop le', 400);

    const groupId = await resolveImportJobGroupId({ group_id, owner_username, jobType });
    const data = await importJobAccounts({ text, owner_username, jobType, groupId });
    logger.info('job accounts imported', { ...data, group_id: groupId, job_type: jobType, owner_username });
    return success(res, data, `Da import ${data.imported} account JOB`);
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const importAccountsApi = async (req, res, next) => {
  try {
    const text = req.body.text || req.body.accounts || req.body.data || req.body.account || req.query.text;
    const jobType = parseJobType(req.body.job_type ?? req.query.job_type, 'chrome');
    const owner_username = ownerFromRequest(req);
    if (!text || typeof text !== 'string') return error(res, 'Thieu du lieu import', 400);
    if (!jobType) return error(res, 'job_type khong hop le', 400);

    const groupId = await resolveImportJobGroupId({
      group_id: req.body.group_id ?? req.query.group_id,
      group_name: req.body.group_name ?? req.query.group_name,
      owner_username,
      jobType,
    });
    const data = await importJobAccounts({ text, owner_username, jobType, groupId });
    logger.info('job accounts imported by api', { ...data, group_id: groupId, job_type: jobType, owner_username });
    return success(res, data, `Da import ${data.imported} account JOB`);
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getForPhone = async (req, res, next) => {
  const transaction = await JobAccount.sequelize.transaction();
  try {
    const device_id = nullify(req.body.device_id);
    const owner_username = ownerFromRequest(req);
    const jobType = parseJobType(req.body.job_type ?? req.query.job_type, 'chrome');
    if ((req.body.job_type || req.query.job_type) && !jobType) {
      await transaction.rollback();
      return error(res, 'job_type khong hop le', 400);
    }
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Thieu device_id', 400);
    }

    const groupId = await resolveJobGroupId(req, owner_username, jobType);
    if (groupId === false) {
      await transaction.rollback();
      return error(res, 'Nhom JOB khong ton tai', 404);
    }

    const workingWhere = { owner_username, device_id, status: 'DANG_LAM' };
    if (jobType) workingWhere.job_type = jobType;
    if (groupId) workingWhere.group_id = groupId;
    const workingAccount = await JobAccount.findOne({
      where: workingWhere,
      order: [['updated_at', 'DESC'], ['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (workingAccount) {
      await workingAccount.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();
      return success(res, { account: serializeJobAccount(workingAccount) }, 'May dang co account JOB DANG_LAM, tra lai account cu');
    }

    const lockExpiredAt = new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000);
    const activeLockedWhere = {
      owner_username,
      status: 'ACCOUNT_CHAY',
      locked_by: device_id,
      locked_at: { [Op.gte]: lockExpiredAt },
    };
    if (jobType) activeLockedWhere.job_type = jobType;
    if (groupId) activeLockedWhere.group_id = groupId;
    const activeLockedAccount = await JobAccount.findOne({
      where: activeLockedWhere,
      order: [['locked_at', 'DESC'], ['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (activeLockedAccount) {
      await transaction.commit();
      return success(res, { account: serializeJobAccount(activeLockedAccount) }, 'Lay account JOB thanh cong');
    }

    const where = {
      owner_username,
      status: 'ACCOUNT_CHAY',
      [Op.or]: [{ locked_by: null }, { locked_at: { [Op.lt]: lockExpiredAt } }],
    };
    if (jobType) where.job_type = jobType;
    if (groupId) where.group_id = groupId;

    const account = await JobAccount.findOne({
      where,
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });

    if (!account) {
      await transaction.rollback();
      return success(res, null, 'Khong con account JOB kha dung');
    }

    await account.update({ locked_by: device_id, locked_at: new Date(), device_id }, { transaction });
    await transaction.commit();
    return success(res, { account: serializeJobAccount(account) }, 'Lay account JOB thanh cong');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const loginSuccess = async (req, res, next) => {
  try {
    const device_id = nullify(req.body.device_id);
    const jobWeb = parseJobWeb(req.body.web);
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thieu device_id', 400);
    const where = accountWhere(req, owner_username);
    if (!where) return error(res, 'Can truyen id hoac username', 400);

    const account = await JobAccount.findOne({ where });
    if (!account) return error(res, 'Account JOB khong ton tai', 404);
    assertDeviceOwnership(account, device_id);
    if (account.status !== 'ACCOUNT_CHAY') {
      return error(res, `Account khong o trang thai ACCOUNT_CHAY (${account.status})`, 409);
    }

    await account.update({
      status: 'DANG_LAM',
      device_id,
      job_web: jobWeb,
      locked_by: device_id,
      locked_at: new Date(),
      login_at: new Date(),
      fail_reason: null,
    });
    return success(res, { account }, 'Login thanh cong, account chuyen sang DANG_LAM');
  } catch (err) {
    next(err);
  }
};

const loginFail = async (req, res, next) => {
  try {
    const device_id = nullify(req.body.device_id);
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thieu device_id', 400);
    const where = accountWhere(req, owner_username);
    if (!where) return error(res, 'Can truyen id hoac username', 400);

    const account = await JobAccount.findOne({ where });
    if (!account) return error(res, 'Account JOB khong ton tai', 404);
    const isDieReport = isDieReportRequest(req);
    if (!isDieReport) assertDeviceOwnership(account, device_id);

    await account.update({
      status: isDieReport ? 'ACCOUNT_DIE' : 'ACCOUNT_CHAY',
      device_id,
      ...(isDieReport ? { live_status: 'die', last_live_check_at: new Date(), completed_at: new Date() } : {}),
      locked_by: null,
      locked_at: null,
      fail_reason: nullify(req.body.reason),
    });
    return success(
      res,
      { account },
      isDieReport ? 'Da chuyen account sang ACCOUNT_DIE va mo lock' : 'Da mo lock de phone khac lay lai'
    );
  } catch (err) {
    next(err);
  }
};

const reportResult = async (req, res, next) => {
  try {
    const device_id = nullify(req.body.device_id);
    const status = normalizeJobStatus(requestValue(req, 'status', 'trang_thai', 'state'));
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thieu device_id', 400);
    if (!FINAL_STATUSES.includes(status)) {
      return error(res, `Trang thai khong hop le. Dung: ${FINAL_STATUSES.join(', ')}`, 400);
    }
    const where = accountWhere(req, owner_username);
    if (!where) return error(res, 'Can truyen id hoac username', 400);

    const account = await JobAccount.findOne({ where });
    if (!account) return error(res, 'Account JOB khong ton tai', 404);
    const jobWeb = parseJobWeb(req.body.web ?? req.query.web ?? account.job_web);
    const xuPerJob = xuPerJobForWeb(jobWeb);
    const isDieReport = status === 'ACCOUNT_DIE';
    if (!isDieReport) {
      assertDeviceOwnership(account, device_id);
      if (account.status !== 'DANG_LAM') {
        return error(res, `Account khong o trang thai DANG_LAM (${account.status})`, 409);
      }
    }

    const jobLive = parseNonNegativeInt(req.body.joblive ?? req.body.jobs ?? req.body.job_count);
    const currentJobs = Number(account.job_count) || 0;
    const nextJobs = jobLive !== null ? jobLive : currentJobs;
    const addedJobs = jobLive !== null ? Math.max(nextJobs - currentJobs, 0) : 0;
    const currentXu = Number(account.xu_count) || 0;
    const xuResult = addedJobs > 0 ? addedXuFromRequest(req, currentXu, addedJobs, jobWeb) : { addedXu: 0, nextXu: currentXu };
    if (!xuResult) {
      return error(res, 'XSMM can truyen them xu hoac xu_count', 400);
    }
    if (addedJobs > 0) {
      await addDailyJobs({
        owner_username,
        device_id,
        stat_date: vietnamToday(),
        jobs: addedJobs,
        xu: xuResult.addedXu,
        web: jobWeb,
      });
    }
    await account.update({
      status,
      device_id,
      job_web: jobWeb,
      job_count: nextJobs,
      xu_count: xuResult.nextXu,
      ...(addedJobs > 0 ? todayJobUpdate(account, addedJobs) : {}),
      fail_reason: nullify(req.body.reason),
      note: nullify(req.body.note),
      completed_at: new Date(),
      ...(isDieReport ? { live_status: 'die', last_live_check_at: new Date() } : {}),
      locked_by: null,
      locked_at: null,
    });

    return success(res, {
      account,
      jobs: jobLive,
      added_jobs: addedJobs,
      web: jobWeb,
      xu_per_job: xuPerJob,
      added_xu: xuResult.addedXu,
      total_xu: xuResult.nextXu,
    }, `Da chuyen account sang ${status}`);
  } catch (err) {
    next(err);
  }
};

const addJobCount = async (req, res, next) => {
  try {
    const device_id = nullify(req.body.device_id);
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thieu device_id', 400);
    const where = accountWhere(req, owner_username);
    if (!where) return error(res, 'Can truyen id hoac username', 400);

    const account = await JobAccount.findOne({ where });
    if (!account) return error(res, 'Account JOB khong ton tai', 404);
    const jobWeb = parseJobWeb(req.body.web ?? req.query.web ?? account.job_web);
    const xuPerJob = xuPerJobForWeb(jobWeb);
    assertDeviceOwnership(account, device_id);
    if (account.status !== 'DANG_LAM') {
      return error(res, `Account khong o trang thai DANG_LAM (${account.status})`, 409);
    }

    const rawCount = req.body.joblive ?? req.body.jobs ?? req.body.count;
    const addJobs = parseNonNegativeInt(rawCount);
    if (addJobs === null) {
      return error(res, 'joblive phai la so job >= 0', 400);
    }

    const currentJobs = Number(account.job_count) || 0;
    const totalJobs = currentJobs + addJobs;
    const currentXu = Number(account.xu_count) || 0;
    const xuResult = addJobs > 0 ? addedXuFromRequest(req, currentXu, addJobs, jobWeb) : { addedXu: 0, nextXu: currentXu };
    if (!xuResult) {
      return error(res, 'XSMM can truyen them xu hoac xu_count', 400);
    }
    if (addJobs > 0) {
      await addDailyJobs({
        owner_username,
        device_id,
        stat_date: vietnamToday(),
        jobs: addJobs,
        xu: xuResult.addedXu,
        web: jobWeb,
      });
    }
    await account.update({
      device_id,
      job_web: jobWeb,
      job_count: totalJobs,
      xu_count: xuResult.nextXu,
      ...todayJobUpdate(account, addJobs),
      locked_by: device_id,
      locked_at: new Date(),
    });

    return success(res, {
      account,
      added_jobs: addJobs,
      web: jobWeb,
      added_xu: xuResult.addedXu,
      xu_per_job: xuPerJob,
      total_jobs: totalJobs,
      total_xu: xuResult.nextXu,
    }, `Da cong them ${addJobs} job`);
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const status = String(req.query.status || '').trim().toUpperCase();
    const live_status = String(req.query.live_status || '').trim();
    const jobType = parseJobType(req.query.job_type, 'chrome');
    const device_id = String(req.query.device_id || '').trim();
    const group_id = req.query.group_id ? parseInt(req.query.group_id, 10) : null;
    const search = String(req.query.search || '').trim();
    const date_from = String(req.query.date_from || '').trim();
    const date_to = String(req.query.date_to || '').trim();
    const soakDays = parseNonNegativeInt(req.query.soak_days);
    const where = { owner_username };
    if (!jobType) return error(res, 'job_type khong hop le', 400);

    where.job_type = jobType;
    if (status && STATUSES.includes(status)) where.status = status;
    if (['unknown', 'live', 'die'].includes(live_status)) where.live_status = live_status;
    if (device_id) where.device_id = device_id;
    if (Number.isInteger(group_id) && group_id > 0) where.group_id = group_id;
    if (search) where.username = { [Op.like]: `%${search}%` };
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = new Date(date_from);
      if (date_to) where.created_at[Op.lte] = new Date(`${date_to}T23:59:59`);
    }
    if (soakDays !== null && soakDays > 0) {
      where.completed_at = { [Op.lte]: new Date(Date.now() - soakDays * 24 * 60 * 60 * 1000) };
    }
    if (req.query.video_min !== undefined || req.query.video_max !== undefined) {
      where.video_count = {};
      if (req.query.video_min !== '') where.video_count[Op.gte] = parseInt(req.query.video_min, 10);
      if (req.query.video_max !== '') where.video_count[Op.lte] = parseInt(req.query.video_max, 10);
    }

    const { rows, count } = await JobAccount.findAndCountAll({
      where,
      order: buildSortOrder(req.query.sort_by, req.query.sort_dir, status),
      limit,
      offset: (page - 1) * limit,
    });
    const grouped = await JobAccount.findAll({
      where: { owner_username, job_type: jobType },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    });
    const counts = Object.fromEntries(STATUSES.map((key) => [key, 0]));
    grouped.forEach((row) => {
      counts[row.status] = Number(row.count);
    });
    const typeGrouped = await JobAccount.findAll({
      where: { owner_username },
      attributes: ['job_type', [fn('COUNT', col('id')), 'count']],
      group: ['job_type'],
      raw: true,
    });
    const type_counts = Object.fromEntries(JOB_TYPES.map((type) => [type, 0]));
    typeGrouped.forEach((row) => {
      type_counts[row.job_type] = Number(row.count);
    });

    return success(res, {
      accounts: rows,
      counts,
      type_counts,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit), totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const checkLive = async (req, res, next) => {
  req.socket?.setTimeout?.(600_000);
  try {
    let { ids, proxies = [], concurrency = 12, delay_ms = 200 } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return error(res, 'Can truyen mang ids', 400);
    if (ids.length > 1000) return error(res, 'Toi da 1000 accounts/lan', 400);

    const proxyPool = (Array.isArray(proxies) ? proxies : String(proxies).split('\n')).map(parseProxy).filter(Boolean);
    concurrency = Math.max(1, Math.min(50, parseInt(concurrency, 10) || 12));
    delay_ms = Math.max(0, Math.min(10000, parseInt(delay_ms, 10) || 200));

    const accounts = await JobAccount.findAll({
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req), username: { [Op.ne]: null } },
      attributes: ['id', 'username'],
      order: [['id', 'ASC']],
    });

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const results = [];
    let proxyIdx = 0;
    const nextProxy = () => (proxyPool.length > 0 ? proxyPool[proxyIdx++ % proxyPool.length] : null);

    for (let i = 0; i < accounts.length; i += concurrency) {
      const batch = accounts.slice(i, i + concurrency);
      const out = await Promise.all(batch.map(async (account) => {
        const proxyUrl = nextProxy();
        let stats = null;
        try {
          stats = await checkOne(account.username, proxyUrl);
        } catch (_) {
          stats = null;
        }
        const liveStatus = stats ? (stats.live ? 'live' : 'die') : 'unknown';
        const updateData = { live_status: liveStatus, last_live_check_at: new Date() };
        if (stats) {
          updateData.followers = stats.followers ?? null;
          updateData.following = stats.following ?? null;
          updateData.video_count = stats.videos ?? null;
        }
        if (liveStatus === 'die') {
          updateData.status = 'ACCOUNT_DIE';
          updateData.locked_by = null;
          updateData.locked_at = null;
          updateData.completed_at = new Date();
        }
        await account.update(updateData);
        return {
          id: account.id,
          username: account.username,
          result: liveStatus,
          followers: stats?.followers ?? null,
          following: stats?.following ?? null,
          videos: stats?.videos ?? null,
          likes: stats?.likes ?? null,
          private: stats?.private ?? false,
          verified: stats?.verified ?? false,
          proxy: proxyUrl ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@') : 'direct',
        };
      }));
      results.push(...out);
      if (i + concurrency < accounts.length && delay_ms > 0) await sleep(delay_ms);
    }

    const live = results.filter((row) => row.result === 'live').length;
    const die = results.filter((row) => row.result === 'die').length;
    const unknown = results.filter((row) => row.result === 'unknown').length;
    return success(res, { results, live, die, unknown }, `Checked ${results.length}: ${live} live - ${die} die - ${unknown} unknown`);
  } catch (err) {
    next(err);
  }
};

const bulkGet = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Number.isInteger) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const accounts = await JobAccount.findAll({
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) },
      order: [['id', 'ASC']],
    });
    const text = accounts
      .filter((account) => account.username)
      .map(formatJobPipe)
      .join('\n');
    return success(res, { text, count: accounts.length }, 'OK');
  } catch (err) {
    next(err);
  }
};

const bulkAction = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Number.isInteger) : [];
    const action = String(req.body.action || '').trim();
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    if (ids.length > 500) return error(res, 'Toi da 500 account moi lan', 400);
    if (!action) return error(res, 'Thieu action', 400);

    let updateData = {};
    let message = '';
    switch (action) {
      case 'set_status': {
        const status = String(req.body.status || '').trim().toUpperCase();
        if (!STATUSES.includes(status)) return error(res, `Trang thai khong hop le. Dung: ${STATUSES.join(', ')}`, 400);
        updateData = { status };
        if (FINAL_STATUSES.includes(status)) {
          updateData.completed_at = new Date();
          updateData.locked_by = null;
          updateData.locked_at = null;
        }
        message = `Da doi ${ids.length} account JOB sang ${status}`;
        break;
      }
      case 'set_note':
        updateData = { note: nullify(req.body.note) };
        message = `Da cap nhat note cho ${ids.length} account JOB`;
        break;
      case 'clear_note':
        updateData = { note: null };
        message = `Da xoa note cua ${ids.length} account JOB`;
        break;
      case 'clear_lock':
        updateData = { locked_by: null, locked_at: null };
        message = `Da mo lock ${ids.length} account JOB`;
        break;
      default:
        return error(res, `action khong hop le: ${action}`, 400);
    }

    const [affected] = await JobAccount.update(updateData, {
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) },
    });
    return success(res, { affected }, message);
  } catch (err) {
    next(err);
  }
};

const bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id))
      : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const deleted = await JobAccount.destroy({
      where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) },
    });
    return success(res, { deleted }, `Da xoa ${deleted} account JOB`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  importAccounts,
  importAccountsApi,
  getForPhone,
  loginSuccess,
  loginFail,
  addJobCount,
  reportResult,
  getAll,
  checkLive,
  bulkGet,
  bulkAction,
  bulkDelete,
};
