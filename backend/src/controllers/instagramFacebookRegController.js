const { Op, literal } = require('sequelize');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const InstagramAccount = require('../models/InstagramAccount');
const InstagramFacebookRegClaim = require('../models/InstagramFacebookRegClaim');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');

const LOCK_TIMEOUT_MIN = Math.max(parseInt(process.env.INSTAGRAM_FACEBOOK_REG_LOCK_TIMEOUT_MIN, 10) || 30, 1);
const MAX_GET_COUNT = Math.max(parseInt(process.env.INSTAGRAM_FACEBOOK_REG_MAX_GET_COUNT, 10) || 3, 1);
const CLAIM_STATUSES = ['DANG_REG', 'REG_XONG', 'REG_FAIL', 'CANCELLED'];

const nullify = (value) => {
  const text = String(value ?? '').trim();
  return !text || text.toLowerCase() === 'null' ? null : text;
};
const deviceFromRequest = (req) => nullify(
  req.body?.device_id || req.body?.device || req.body?.phone || req.body?.may
  || req.query?.device_id || req.query?.device || req.query?.phone || req.query?.may
);
const looksLikeCookies = (value) => /(^|[;\s])(sessionid|ds_user_id|csrftoken|mid|ig_did|rur)=/i.test(String(value || ''));
const looksLikeTwoFa = (value) => /^[A-Z2-7]{8,80}$/i.test(String(value || '').replace(/\s+/g, ''));
const pipeValue = (value) => value == null || value === '' ? 'null' : String(value);

const serializeFacebook = (row) => {
  const data = row?.toJSON ? row.toJSON() : { ...row };
  const values = data.two_fa
    ? [data.uid, data.password, data.two_fa, data.cookies, data.token, data.email]
    : [data.uid, data.password, data.cookies, data.token, data.email];
  if (data.email_pass || data.refresh_token || data.client_id) {
    values.push(data.email_pass, data.refresh_token, data.client_id);
  }
  data.full_data = values.map(pipeValue).join('|');
  data.raw_data = data.full_data;
  return data;
};
const serializeInstagram = (row) => {
  const data = row?.toJSON ? row.toJSON() : { ...row };
  data.full_data = [data.uid, data.password, data.two_fa, data.cookies].map(pipeValue).join('|');
  data.raw_data = data.full_data;
  return data;
};
const parseInstagramLine = (line) => {
  const raw = nullify(line);
  if (!raw) return null;
  const parts = raw.split('|').map(nullify);
  if (!parts[0]) return null;
  const parsed = { uid: parts[0], password: parts[1], two_fa: null, cookies: null };
  for (const value of parts.slice(2).filter(Boolean)) {
    if (!parsed.cookies && looksLikeCookies(value)) parsed.cookies = value;
    else if (!parsed.two_fa && looksLikeTwoFa(value)) parsed.two_fa = value.replace(/\s+/g, '');
    else if (!parsed.cookies && /[=;]/.test(value)) parsed.cookies = value;
  }
  return parsed;
};
const instagramPayload = (req) => {
  const nested = req.body?.account && typeof req.body.account === 'object' ? req.body.account : {};
  const raw = typeof req.body?.account === 'string'
    ? req.body.account
    : req.body?.instagram_account || req.body?.account_data || req.body?.text || req.body?.raw_data;
  const parsed = parseInstagramLine(raw) || {};
  const uid = nullify(req.body?.instagram_uid || req.body?.instagram_username || req.body?.username || req.body?.uid || nested.uid || nested.username || parsed.uid);
  const password = nullify(req.body?.password || nested.password || parsed.password);
  const two_fa = nullify(req.body?.two_fa || req.body?.twofa || req.body?.['2fa'] || nested.two_fa || nested.twofa || nested['2fa'] || parsed.two_fa);
  const cookies = nullify(req.body?.cookies || nested.cookies || parsed.cookies);
  return { uid, password, two_fa, cookies, raw_data: [uid, password, two_fa, cookies].map(pipeValue).join('|') };
};
const normalizeReportStatus = (value, hasAccount) => {
  const status = String(value || (hasAccount ? 'REG_XONG' : '')).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['REG_XONG', 'SUCCESS', 'DONE', 'THANH_CONG'].includes(status)) return 'REG_XONG';
  if (['REG_FAIL', 'FAIL', 'FAILED', 'THAT_BAI'].includes(status)) return 'REG_FAIL';
  return null;
};
const vietnamDayRange = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 7 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const expireStaleClaims = async (owner_username, transaction) => {
  const expiredAt = new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000);
  await InstagramFacebookRegClaim.update({
    status: 'REG_FAIL',
    fail_reason: 'Lock timeout khi reg Instagram',
    completed_at: new Date(),
    locked_at: null,
  }, {
    where: { owner_username, status: 'DANG_REG', locked_at: { [Op.lt]: expiredAt } },
    transaction,
  });
};

const getAccount = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Can truyen device_id', 400);
    }

    await expireStaleClaims(owner_username, transaction);
    const now = new Date();
    const active = await InstagramFacebookRegClaim.findOne({
      where: { owner_username, device_id, status: 'DANG_REG' },
      order: [['locked_at', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (active && Number(active.get_count) < MAX_GET_COUNT) {
      await active.update({ get_count: Number(active.get_count) + 1, locked_at: now }, { transaction });
      const account = await FacebookAccount.unscoped().findOne({
        where: { id: active.facebook_account_id, owner_username, kind: 'job', trashed_at: null }, transaction,
      });
      if (account) {
        await transaction.commit();
        return success(res, {
          claim_id: active.id,
          device_id,
          resumed: true,
          get_count: active.get_count,
          max_get_count: MAX_GET_COUNT,
          lock_timeout_min: LOCK_TIMEOUT_MIN,
          account: serializeFacebook(account),
        }, 'Lay account Facebook de reg Instagram thanh cong');
      }
      await active.update({ status: 'REG_FAIL', fail_reason: 'Account Facebook khong con ton tai', completed_at: now, locked_at: null }, { transaction });
    } else if (active) {
      await active.update({ status: 'REG_FAIL', fail_reason: `May da get qua ${MAX_GET_COUNT} lan nhung chua bao cao`, completed_at: now, locked_at: null }, { transaction });
    }

    const escapedOwner = sequelize.escape(owner_username);
    const account = await FacebookAccount.findOne({
      where: {
        owner_username,
        kind: 'job',
        status: { [Op.in]: ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'] },
        live_status: { [Op.ne]: 'die' },
        cookies: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
        locked_by: null,
        reg_page_locked_by: null,
        nurture_locked_by: null,
        [Op.and]: literal(`NOT EXISTS (SELECT 1 FROM instagram_facebook_reg_claims AS igfrc WHERE igfrc.owner_username = ${escapedOwner} AND igfrc.facebook_account_id = FacebookAccount.id AND igfrc.status IN ('DANG_REG','REG_XONG'))`),
      },
      order: [['login_at', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (!account) {
      await transaction.commit();
      return success(res, { claim_id: null, device_id, resumed: false, account: null }, 'Khong con account Facebook du dieu kien de reg Instagram');
    }

    const claim = await InstagramFacebookRegClaim.create({
      owner_username,
      facebook_account_id: account.id,
      facebook_uid: account.uid,
      device_id,
      status: 'DANG_REG',
      locked_at: now,
      get_count: 1,
    }, { transaction });
    await transaction.commit();
    return success(res, {
      claim_id: claim.id,
      device_id,
      resumed: false,
      get_count: 1,
      max_get_count: MAX_GET_COUNT,
      lock_timeout_min: LOCK_TIMEOUT_MIN,
      account: serializeFacebook(account),
    }, 'Lay account Facebook de reg Instagram thanh cong');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const findClaim = async ({ req, owner_username, device_id, transaction, lock = false }) => {
  const claimId = parseInt(req.body?.claim_id || req.query?.claim_id, 10);
  const facebookUid = nullify(req.body?.facebook_uid || req.query?.facebook_uid);
  const where = { owner_username, device_id };
  if (Number.isInteger(claimId)) where.id = claimId;
  else if (facebookUid) where.facebook_uid = facebookUid;
  else return null;
  return InstagramFacebookRegClaim.findOne({
    where,
    order: [['id', 'DESC']],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
};

const report = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Can truyen device_id', 400);
    }
    const payload = instagramPayload(req);
    const reportStatus = normalizeReportStatus(req.body?.status || req.body?.result, Boolean(payload.uid));
    if (!reportStatus) {
      await transaction.rollback();
      return error(res, 'Trang thai bao cao phai la REG_XONG hoac REG_FAIL', 400);
    }

    const claim = await findClaim({ req, owner_username, device_id, transaction, lock: true });
    if (!claim) {
      await transaction.rollback();
      return error(res, 'Khong tim thay luot Reg IG dang lock cua may nay', 404);
    }
    if (claim.status !== 'DANG_REG') {
      await transaction.commit();
      if (claim.status === reportStatus) {
        return success(res, { claim: claim.toJSON(), already_reported: true }, 'Luot Reg Instagram da duoc bao cao truoc do');
      }
      return error(res, `Luot Reg Instagram da ket thuc voi trang thai ${claim.status}`, 409);
    }

    const now = new Date();
    if (reportStatus === 'REG_FAIL') {
      await claim.update({
        status: 'REG_FAIL',
        fail_reason: nullify(req.body?.reason || req.body?.message || req.body?.fail_reason) || 'Reg Instagram that bai',
        completed_at: now,
        locked_at: null,
      }, { transaction });
      await transaction.commit();
      return success(res, { claim: claim.toJSON() }, 'Da bao cao Reg Instagram that bai');
    }
    if (!payload.uid) {
      await transaction.rollback();
      return error(res, 'Can truyen account Instagram theo dinh dang tai_khoan|mat_khau|2fa|cookies', 400);
    }

    const accountDefaults = (kind) => ({
      kind,
      raw_data: payload.raw_data,
      uid: payload.uid,
      password: payload.password,
      two_fa: payload.two_fa,
      cookies: payload.cookies,
      owner_username,
      group_id: null,
      device_id,
      status: 'LOGIN_THANH_CONG',
      live_status: 'unknown',
      locked_by: null,
      locked_at: null,
      login_get_count: 0,
      login_at: now,
      completed_at: null,
      fail_reason: null,
      trashed_at: null,
    });
    const upsertAccount = async (kind) => {
      const [account, created] = await InstagramAccount.unscoped().findOrCreate({
        where: { owner_username, kind, uid: payload.uid },
        defaults: accountDefaults(kind),
        transaction,
      });
      if (!created) {
        await account.update({
          raw_data: payload.raw_data,
          password: payload.password || account.password,
          two_fa: payload.two_fa || account.two_fa,
          cookies: payload.cookies || account.cookies,
          device_id,
          status: 'LOGIN_THANH_CONG',
          locked_by: null,
          locked_at: null,
          login_get_count: 0,
          login_at: now,
          completed_at: null,
          fail_reason: null,
          trashed_at: null,
        }, { transaction });
      }
      return { account, created };
    };

    const reg = await upsertAccount('reg');
    const job = await upsertAccount('job');
    await claim.update({
      status: 'REG_XONG',
      instagram_uid: payload.uid,
      email_order_id: nullify(req.body?.email_order_id || req.body?.id_oder || req.body?.id_order),
      fail_reason: null,
      completed_at: now,
      locked_at: null,
    }, { transaction });
    await transaction.commit();

    return success(res, {
      claim: claim.toJSON(),
      instagram_reg: serializeInstagram(reg.account),
      instagram_job: serializeInstagram(job.account),
      reg_created: reg.created,
      job_created: job.created,
      job_status: 'LOGIN_THANH_CONG',
    }, 'Bao cao Reg Instagram thanh cong; da them vao Instagram Reg va Instagram Job');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const release = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Can truyen device_id', 400);
    }
    const claim = await findClaim({ req, owner_username, device_id, transaction, lock: true });
    if (!claim) {
      await transaction.rollback();
      return error(res, 'Khong tim thay luot Reg IG cua may nay', 404);
    }
    if (claim.status !== 'DANG_REG') {
      await transaction.commit();
      return success(res, { claim: claim.toJSON(), already_released: true }, `Luot Reg IG da o trang thai ${claim.status}`);
    }
    await claim.update({
      status: 'CANCELLED',
      fail_reason: nullify(req.body?.reason || req.body?.message) || 'May chu dong tra account',
      completed_at: new Date(),
      locked_at: null,
    }, { transaction });
    await transaction.commit();
    return success(res, { claim: claim.toJSON(), already_released: false }, 'Da tra account Facebook dang dung de reg Instagram');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const deviceStatus = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    await expireStaleClaims(owner_username);
    const { start, end } = vietnamDayRange();
    const [active, rows] = await Promise.all([
      InstagramFacebookRegClaim.findOne({ where: { owner_username, device_id, status: 'DANG_REG' }, order: [['id', 'DESC']] }),
      InstagramFacebookRegClaim.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { owner_username, device_id, completed_at: { [Op.gte]: start, [Op.lt]: end } },
        group: ['status'], raw: true,
      }),
    ]);
    const today = Object.fromEntries(CLAIM_STATUSES.map((status) => [status, 0]));
    rows.forEach((row) => { today[row.status] = Number(row.count) || 0; });
    return success(res, { device_id, active_claim: active?.toJSON() || null, today }, 'Lay trang thai Reg Instagram cua may thanh cong');
  } catch (err) { next(err); }
};

const listClaims = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const allowedSorts = ['created_at', 'device_id', 'facebook_uid', 'instagram_uid', 'status', 'get_count', 'locked_at', 'completed_at'];
    const sort_by = allowedSorts.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
    const sort_order = String(req.query.sort_order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = { owner_username };
    const status = String(req.query.status || '').trim().toUpperCase();
    if (CLAIM_STATUSES.includes(status)) where.status = status;
    const q = nullify(req.query.q);
    if (q) where[Op.or] = [
      { device_id: { [Op.like]: `%${q}%` } },
      { facebook_uid: { [Op.like]: `%${q}%` } },
      { instagram_uid: { [Op.like]: `%${q}%` } },
      { email_order_id: { [Op.like]: `%${q}%` } },
    ];
    const [result, countRows, deviceCount] = await Promise.all([
      InstagramFacebookRegClaim.findAndCountAll({
        where,
        order: [[sort_by, sort_order], ['id', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      }),
      InstagramFacebookRegClaim.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { owner_username },
        group: ['status'],
        raw: true,
      }),
      InstagramFacebookRegClaim.count({ where: { owner_username }, distinct: true, col: 'device_id' }),
    ]);
    const status_counts = Object.fromEntries(CLAIM_STATUSES.map((item) => [item, 0]));
    countRows.forEach((row) => { status_counts[row.status] = Number(row.count) || 0; });
    return success(res, {
      claims: result.rows.map((row) => row.toJSON()),
      status_counts,
      device_count: Number(deviceCount) || 0,
      pagination: { page, limit, total: result.count, totalPages: Math.ceil(result.count / limit) || 1 },
    }, 'Lay danh sach luot Reg Instagram bang Facebook thanh cong');
  } catch (err) { next(err); }
};

module.exports = { getAccount, report, release, deviceStatus, listClaims };