const { Op } = require('sequelize');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const AccountGroup = require('../models/AccountGroup');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');

const STATUSES = ['CHO_LOGIN', 'DANG_LOGIN', 'LOGIN_THANH_CONG', 'LOGIN_FAIL', 'ACCOUNT_DIE'];
const KINDS = ['reg', 'job'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.FACEBOOK_LOCK_TIMEOUT_MIN, 10) || 120;

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
const looksLikeTwoFa = (value) => {
  const text = String(value || '').replace(/\s+/g, '').trim();
  if (!text || looksLikeEmail(text) || looksLikeCookie(text) || looksLikeToken(text)) return false;
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
  };

  const firstUidIndex = parts.findIndex((part) => part === uid || uidFromCookie(part) === uid);
  const used = new Set();
  if (firstUidIndex >= 0) used.add(firstUidIndex);

  for (let i = 0; i < parts.length; i += 1) {
    if (used.has(i)) continue;
    const value = nullify(parts[i]);
    if (!value) continue;
    if (!parsed.cookies && looksLikeCookie(value)) { parsed.cookies = value; used.add(i); }
    else if (!parsed.token && looksLikeToken(value)) { parsed.token = value; used.add(i); }
    else if (!parsed.email && looksLikeEmail(value)) { parsed.email = value; used.add(i); }
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
    if (!parsed.password && i > firstUidIndex && !looksLikeCookie(value) && !looksLikeToken(value) && !looksLikeEmail(value)) {
      parsed.password = value;
      used.add(i);
    }
  }

  return parsed;
};

const formatFacebookPipe = (account) => {
  const values = account.two_fa
    ? [account.uid, account.password, account.two_fa, account.cookies, account.token, account.email]
    : [account.uid, account.password, account.cookies, account.token, account.email];
  return values.map(pipeValue).join('|');
};

const serialize = (account) => {
  const data = account?.toJSON ? account.toJSON() : { ...account };
  data.full_data = formatFacebookPipe(data);
  return data;
};

const importFacebookAccounts = async ({ text, owner_username, kind = 'job', status = 'CHO_LOGIN', groupId = null }) => {
  const lines = splitLines(text);
  const result = { total: lines.length, created: 0, duplicated: 0, invalid: 0 };

  for (const line of lines) {
    const parsed = parseFacebookLine(line);
    if (!parsed) {
      result.invalid += 1;
      continue;
    }

    const [account, created] = await FacebookAccount.findOrCreate({
      where: { owner_username, kind, uid: parsed.uid },
      defaults: { ...parsed, owner_username, kind, status, group_id: groupId },
    });

    if (created) result.created += 1;
    else {
      result.duplicated += 1;
      await account.update({ ...parsed, group_id: groupId ?? account.group_id, status: account.status || status });
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
    const liveStatus = String(req.query.live_status || '').trim().toLowerCase();
    if (['unknown', 'live', 'die'].includes(liveStatus)) where.live_status = liveStatus;
    const groupId = parseInt(req.query.group_id, 10);
    if (Number.isInteger(groupId) && groupId > 0) where.group_id = groupId;
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

    const { rows, count } = await FacebookAccount.findAndCountAll({
      where,
      order: [['updated_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return success(res, {
      accounts: rows.map(serialize),
      status_counts,
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
    const status = normalizeStatus(req.body.status || req.query.status, kind === 'reg' ? 'LOGIN_THANH_CONG' : 'CHO_LOGIN');
    const text = req.body.text || req.body.accounts || req.body.data || req.body.account || '';
    const groupId = await resolveGroupId({ group_id: req.body.group_id || req.query.group_id, group_name: req.body.group_name || req.query.group_name, owner_username, kind });
    const result = await importFacebookAccounts({ text, owner_username, kind, status, groupId });
    return success(res, result, `Da nhan ${result.created}/${result.total} account Facebook`);
  } catch (err) {
    next(err);
  }
};

const getJobForPhone = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.query.device_id || req.query.device || req.query.phone);
    if (!device_id) return error(res, 'Can truyen device_id', 400);

    await FacebookAccount.update(
      { status: 'CHO_LOGIN', locked_by: null, locked_at: null },
      {
        where: {
          owner_username,
          kind: 'job',
          status: 'DANG_LOGIN',
          locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) },
        },
      }
    );

    const account = await sequelize.transaction(async (t) => {
      const active = await FacebookAccount.findOne({
        where: { owner_username, kind: 'job', status: 'DANG_LOGIN', locked_by: device_id },
        order: [['locked_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (active) return active;

      const nextAccount = await FacebookAccount.findOne({
        where: { owner_username, kind: 'job', status: 'CHO_LOGIN' },
        order: [['id', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!nextAccount) return null;
      await nextAccount.update({ status: 'DANG_LOGIN', locked_by: device_id, locked_at: new Date(), device_id }, { transaction: t });
      return nextAccount;
    });

    if (!account) return success(res, { account: null }, 'Het account Facebook JOB');
    return success(res, { account: serialize(account), lock_timeout_min: LOCK_TIMEOUT_MIN }, 'Lay account Facebook JOB thanh cong');
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
      update.locked_by = device_id || account.locked_by || account.device_id;
      update.locked_at = account.locked_at || new Date();
    }
    if (status === 'ACCOUNT_DIE') update.live_status = 'die';
    await account.update(update);
    return success(res, { account: serialize(account) }, 'Bao cao Facebook thanh cong');
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
      await account.update({ live_status, last_live_check_at: new Date() });
      rows.push({ id: account.id, uid: account.uid, result: live_status });
    }

    return success(res, { live, die, unknown, rows }, 'Check live Facebook thanh cong');
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
    const text = accounts.map((account) => formatFacebookPipe(account)).join('\n');
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
      { where: { id: { [Op.in]: ids }, owner_username, kind } }
    );
    return success(res, { affected, group }, 'Da chuyen ' + affected + ' account sang nhom ' + group.name);
  } catch (err) {
    next(err);
  }
};

const bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    if (!ids.length) return error(res, 'Can truyen danh sach ids', 400);
    const deleted = await FacebookAccount.destroy({ where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) } });
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
  report,
  checkLive,
  bulkGet,
  bulkMoveGroup,
  bulkDelete,
};
