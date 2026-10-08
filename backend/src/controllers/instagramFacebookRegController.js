const { Op, literal } = require('sequelize');
const sequelize = require('../config/database');
const FacebookAccount = require('../models/FacebookAccount');
const InstagramAccount = require('../models/InstagramAccount');
const InstagramFacebookRegClaim = require('../models/InstagramFacebookRegClaim');
const InstagramFacebookRegResult = require('../models/InstagramFacebookRegResult');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { getInstagramFacebookRegSettings } = require('../services/settingsService');
const { reportFacebookInstagramLinks } = require('../services/instagramFacebookLinkService');

const LOCK_TIMEOUT_MIN = Math.max(parseInt(process.env.INSTAGRAM_FACEBOOK_REG_LOCK_TIMEOUT_MIN, 10) || 30, 1);
const MAX_GET_COUNT = Math.max(parseInt(process.env.INSTAGRAM_FACEBOOK_REG_MAX_GET_COUNT, 10) || 3, 1);
const CLAIM_STATUSES = ['DANG_REG', 'REG_XONG', 'REG_FAIL', 'CANCELLED'];
const ELIGIBLE_FACEBOOK_STATUSES = ['LOGIN_THANH_CONG', 'DANG_LAM', 'DA_CHAY_XONG'];

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
    where: { [Op.and]: require('../services/activeTaskProtection').withoutActiveTask('instagram_facebook_reg_claims','FACEBOOK',true), owner_username, status: 'DANG_REG', locked_at: { [Op.lt]: expiredAt } },
    transaction,
  });
};

const backfillLegacyResults = async (owner_username, transaction) => {
  const escapedOwner = sequelize.escape(owner_username);
  await sequelize.query(`
    INSERT IGNORE INTO instagram_facebook_reg_results
      (owner_username, claim_id, facebook_account_id, facebook_uid, instagram_account_id, instagram_uid, device_id, reported_at, created_at, updated_at)
    SELECT claim.owner_username, claim.id, claim.facebook_account_id, claim.facebook_uid, instagram.id,
      claim.instagram_uid, claim.device_id, COALESCE(claim.completed_at, claim.updated_at), NOW(), NOW()
    FROM instagram_facebook_reg_claims AS claim
    LEFT JOIN instagram_accounts AS instagram
      ON instagram.owner_username = claim.owner_username AND instagram.kind = 'job' AND instagram.uid = claim.instagram_uid
    WHERE claim.owner_username = ${escapedOwner}
      AND claim.status = 'REG_XONG'
      AND claim.instagram_uid IS NOT NULL AND claim.instagram_uid <> ''
  `, { transaction });
};

const upsertInstagramResultAccounts = async ({ payload, owner_username, device_id, now, transaction }) => {
  const accountDefaults = (kind) => ({
    kind, raw_data: payload.raw_data, uid: payload.uid, password: payload.password,
    two_fa: payload.two_fa, cookies: payload.cookies, owner_username, group_id: null,
    device_id, status: 'LOGIN_THANH_CONG', live_status: 'unknown', locked_by: null,
    locked_at: null, login_get_count: 0, login_at: now, completed_at: null,
    fail_reason: null, trashed_at: null,
  });
  const upsert = async (kind) => {
    const [account, created] = await InstagramAccount.unscoped().findOrCreate({
      where: { owner_username, kind, uid: payload.uid }, defaults: accountDefaults(kind), transaction,
    });
    if (!created) await account.update({
      raw_data: payload.raw_data, password: payload.password || account.password,
      two_fa: payload.two_fa || account.two_fa, cookies: payload.cookies || account.cookies,
      device_id, status: 'LOGIN_THANH_CONG', locked_by: null, locked_at: null,
      login_get_count: 0, login_at: now, completed_at: null, fail_reason: null, trashed_at: null,
    }, { transaction });
    return { account, created };
  };
  return { reg: await upsert('reg'), job: await upsert('job') };
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

    const regSettings = await getInstagramFacebookRegSettings(owner_username);
    await backfillLegacyResults(owner_username, transaction);
    await expireStaleClaims(owner_username, transaction);
    const now = new Date();
    const active = await InstagramFacebookRegClaim.findOne({
      where: { owner_username, device_id, status: 'DANG_REG' },
      order: [['locked_at', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (active && Number(active.get_count) < MAX_GET_COUNT) {
      const account = await FacebookAccount.unscoped().findOne({
        where: { id: active.facebook_account_id, owner_username, kind: 'job', trashed_at: null }, transaction,
      });
      const belongsToDevice = account && String(account.device_id || '').trim().toLowerCase() === device_id.toLowerCase();
      const remainsEligible = belongsToDevice
        && ELIGIBLE_FACEBOOK_STATUSES.includes(account.status)
        && account.live_status !== 'die'
        && Boolean(String(account.cookies || '').trim());
      if (remainsEligible) {
        const registered_count = await InstagramFacebookRegResult.count({ where: { owner_username, claim_id: active.id }, transaction });
        await active.update({ get_count: Number(active.get_count) + 1, locked_at: now }, { transaction });
        await transaction.commit();
        return success(res, {
          claim_id: active.id,
          device_id,
          resumed: true,
          registered_count,
          remaining: Math.max(regSettings.max_instagram_per_facebook - registered_count, 0),
          get_count: active.get_count,
          max_get_count: MAX_GET_COUNT,
          lock_timeout_min: LOCK_TIMEOUT_MIN,
          reg_settings: regSettings,
          account: serializeFacebook(account),
        }, 'Lay account Facebook de reg Instagram thanh cong');
      }
      const reason = account
        ? `Account Facebook khong con thuoc may ${device_id}; hien thuoc may ${account.device_id || '-'}`
        : 'Account Facebook khong con ton tai';
      await active.update({ status: 'REG_FAIL', fail_reason: reason, completed_at: now, locked_at: null }, { transaction });
    } else if (active) {
      await active.update({ status: 'REG_FAIL', fail_reason: `May da get qua ${MAX_GET_COUNT} lan nhung chua bao cao`, completed_at: now, locked_at: null }, { transaction });
    }

    const escapedOwner = sequelize.escape(owner_username);
    const account = await FacebookAccount.findOne({
      where: {
        owner_username,
        kind: 'job',
        device_id,
        status: { [Op.in]: ELIGIBLE_FACEBOOK_STATUSES },
        live_status: { [Op.ne]: 'die' },
        cookies: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },

        [Op.and]: [
          literal(`NOT EXISTS (SELECT 1 FROM instagram_facebook_reg_claims AS active_claim WHERE active_claim.owner_username = ${escapedOwner} AND active_claim.facebook_account_id = FacebookAccount.id AND active_claim.status = 'DANG_REG')`),
          literal(`(SELECT COUNT(*) FROM instagram_facebook_reg_results AS reg_result INNER JOIN instagram_facebook_reg_claims AS success_claim ON success_claim.id = reg_result.claim_id WHERE success_claim.owner_username = ${escapedOwner} AND success_claim.facebook_account_id = FacebookAccount.id AND success_claim.status = 'REG_XONG' AND success_claim.eligibility_reset_at IS NULL AND success_claim.completed_at > ${sequelize.escape(new Date(now.getTime() - regSettings.reuse_hours * 60 * 60 * 1000))}) < ${regSettings.max_instagram_per_facebook}`),
          literal(`NOT EXISTS (SELECT 1 FROM instagram_facebook_reg_claims AS cooldown_claim WHERE cooldown_claim.owner_username = ${escapedOwner} AND cooldown_claim.facebook_account_id = FacebookAccount.id AND cooldown_claim.status IN ('REG_XONG','REG_FAIL') AND cooldown_claim.eligibility_reset_at IS NULL AND cooldown_claim.completed_at > ${sequelize.escape(new Date(now.getTime() - regSettings.reuse_hours * 60 * 60 * 1000))})`),
        ],
      },
      order: [['login_at', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (!account) {
      await transaction.commit();
      return success(res, { claim_id: null, device_id, resumed: false, registered_count: 0, remaining: 0, reg_settings: regSettings, account: null }, 'Khong con account Facebook du dieu kien trong may nay de reg Instagram');
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
      registered_count: 0,
      remaining: regSettings.max_instagram_per_facebook,
      get_count: 1,
      max_get_count: MAX_GET_COUNT,
      lock_timeout_min: LOCK_TIMEOUT_MIN,
      reg_settings: regSettings,
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
  else where.status = 'DANG_REG';
  return InstagramFacebookRegClaim.findOne({
    where,
    order: [['id', 'DESC']],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
};

const reportInstagram = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    const payload = instagramPayload(req);
    if (!device_id) { await transaction.rollback(); return error(res, 'Can truyen device_id', 400); }
    if (!payload.uid) { await transaction.rollback(); return error(res, 'Can truyen instagram_account theo dinh dang tai_khoan|mat_khau|2fa|cookies', 400); }

    const claim = await findClaim({ req, owner_username, device_id, transaction, lock: true });
    if (!claim) { await transaction.rollback(); return error(res, 'Khong tim thay phien Reg IG dang lock cua may nay', 404); }
    const existingResult = await InstagramFacebookRegResult.findOne({
      where: { owner_username, claim_id: claim.id, instagram_uid: payload.uid }, transaction,
    });
    if (claim.status !== 'DANG_REG') {
      await transaction.commit();
      if (existingResult) return success(res, { claim: claim.toJSON(), result: existingResult.toJSON(), already_reported: true }, 'Instagram account da duoc bao cao trong phien nay');
      return error(res, `Phien Reg IG da ket thuc voi trang thai ${claim.status}`, 409);
    }

    const regSettings = await getInstagramFacebookRegSettings(owner_username);
    const sourceAccount = await FacebookAccount.unscoped().findOne({
      where: { id: claim.facebook_account_id, owner_username, kind: 'job', trashed_at: null },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    const belongsToDevice = sourceAccount && String(sourceAccount.device_id || '').trim().toLowerCase() === device_id.toLowerCase();
    if (!belongsToDevice) {
      const reason = sourceAccount ? `Account Facebook hien thuoc may ${sourceAccount.device_id || '-'}, khong phai ${device_id}` : 'Account Facebook nguon khong con ton tai';
      await transaction.rollback();
      return error(res, reason, 409);
    }

    const now = new Date();
    const { reg, job } = await upsertInstagramResultAccounts({ payload, owner_username, device_id, now, transaction });
    await reportFacebookInstagramLinks({
      owner_username, facebookAccount: sourceAccount, facebook_uid: sourceAccount.uid,
      device_id, instagramUsernames: [payload.uid], transaction,
    });
    const [result, created] = await InstagramFacebookRegResult.findOrCreate({
      where: { owner_username, claim_id: claim.id, instagram_uid: payload.uid },
      defaults: {
        owner_username, claim_id: claim.id, facebook_account_id: sourceAccount.id,
        facebook_uid: sourceAccount.uid, instagram_account_id: job.account.id,
        instagram_uid: payload.uid, device_id, reported_at: now,
      }, transaction,
    });
    if (!created) await result.update({ instagram_account_id: job.account.id, device_id, reported_at: now }, { transaction });
    await claim.update({ instagram_uid: payload.uid, email_order_id: nullify(req.body?.email_order_id || req.body?.id_oder || req.body?.id_order) || claim.email_order_id, locked_at: now }, { transaction });
    const registered_count = await InstagramFacebookRegResult.count({ where: { owner_username, claim_id: claim.id }, transaction });
    await transaction.commit();
    return success(res, {
      claim_id: claim.id, facebook_uid: sourceAccount.uid, device_id,
      session_status: 'DANG_REG', registered_count,
      max_instagram_per_facebook: regSettings.max_instagram_per_facebook,
      remaining: Math.max(regSettings.max_instagram_per_facebook - registered_count, 0),
      can_report_more_in_session: true,
      limit_applies_after_finish: true,
      already_reported: !created,
      instagram_reg: serializeInstagram(reg.account), instagram_job: serializeInstagram(job.account),
      reg_created: reg.created, job_created: job.created,
    }, created ? 'Da ghi Instagram vao Facebook UID; phien Reg van dang mo' : 'Instagram account da duoc cap nhat; phien Reg van dang mo');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const finish = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = deviceFromRequest(req);
    if (!device_id) { await transaction.rollback(); return error(res, 'Can truyen device_id', 400); }
    const finishStatus = normalizeReportStatus(req.body?.status || req.body?.result || 'REG_XONG', false);
    if (!finishStatus) { await transaction.rollback(); return error(res, 'Trang thai ket thuc phai la REG_XONG hoac REG_FAIL', 400); }
    const claim = await findClaim({ req, owner_username, device_id, transaction, lock: true });
    if (!claim) { await transaction.rollback(); return error(res, 'Khong tim thay phien Reg IG cua may nay', 404); }
    const results = await InstagramFacebookRegResult.findAll({
      where: { owner_username, claim_id: claim.id }, order: [['reported_at', 'ASC'], ['id', 'ASC']], transaction,
    });
    if (claim.status !== 'DANG_REG') {
      await transaction.commit();
      if (claim.status === finishStatus) return success(res, { claim: claim.toJSON(), registered_count: results.length, instagram_usernames: results.map((row) => row.instagram_uid), already_finished: true }, 'Phien Reg IG da duoc ket thuc truoc do');
      return error(res, `Phien Reg IG da ket thuc voi trang thai ${claim.status}`, 409);
    }
    if (finishStatus === 'REG_XONG' && !results.length) {
      await transaction.rollback();
      return error(res, 'Chua co Instagram account nao duoc bao cao trong phien nay', 400);
    }
    const now = new Date();
    const lastResult = results[results.length - 1];
    await claim.update({
      status: finishStatus,
      instagram_uid: lastResult?.instagram_uid || claim.instagram_uid,
      fail_reason: finishStatus === 'REG_FAIL' ? (nullify(req.body?.reason || req.body?.message || req.body?.fail_reason) || 'Ket thuc Reg Instagram that bai') : null,
      completed_at: now,
      locked_at: null,
    }, { transaction });
    await transaction.commit();
    return success(res, {
      claim: claim.toJSON(), registered_count: results.length,
      instagram_usernames: results.map((row) => row.instagram_uid), already_finished: false,
    }, finishStatus === 'REG_XONG' ? 'Da ket thuc phien Reg Instagram thanh cong' : 'Da ket thuc phien Reg Instagram that bai');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
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

    const requestedClaimId = parseInt(req.body?.claim_id || req.query?.claim_id, 10);
    const requestedFacebookUid = nullify(req.body?.facebook_uid || req.query?.facebook_uid);
    const hasClaimReference = Number.isInteger(requestedClaimId) || Boolean(requestedFacebookUid);
    const claim = await findClaim({ req, owner_username, device_id, transaction, lock: true });
    if (!claim && !hasClaimReference && reportStatus === 'REG_XONG' && payload.uid) {
      const completedClaim = await InstagramFacebookRegClaim.findOne({
        where: { owner_username, device_id, instagram_uid: payload.uid, status: 'REG_XONG' },
        order: [['completed_at', 'DESC'], ['id', 'DESC']],
        transaction,
      });
      if (completedClaim) {
        await transaction.commit();
        return success(res, { claim: completedClaim.toJSON(), already_reported: true }, 'Luot Reg Instagram da duoc bao cao truoc do');
      }
    }

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

    const sourceAccount = await FacebookAccount.unscoped().findOne({
      where: { id: claim.facebook_account_id, owner_username, kind: 'job', trashed_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const sourceBelongsToDevice = sourceAccount
      && String(sourceAccount.device_id || '').trim().toLowerCase() === device_id.toLowerCase();
    if (!sourceBelongsToDevice) {
      const reason = sourceAccount
        ? `Account Facebook khong con thuoc may ${device_id}; hien thuoc may ${sourceAccount.device_id || '-'}`
        : 'Account Facebook nguon khong con ton tai';
      await claim.update({ status: 'REG_FAIL', fail_reason: reason, completed_at: now, locked_at: null }, { transaction });
      await transaction.commit();
      return error(res, reason, 409);
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
    await reportFacebookInstagramLinks({
      owner_username,
      facebookAccount: sourceAccount,
      facebook_uid: sourceAccount.uid,
      device_id,
      instagramUsernames: [payload.uid],
      transaction,
    });
    await InstagramFacebookRegResult.findOrCreate({
      where: { owner_username, claim_id: claim.id, instagram_uid: payload.uid },
      defaults: {
        owner_username, claim_id: claim.id, facebook_account_id: sourceAccount.id,
        facebook_uid: sourceAccount.uid, instagram_account_id: job.account.id,
        instagram_uid: payload.uid, device_id, reported_at: now,
      },
      transaction,
    });
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

const resetEligibility = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromAdmin(req);
    const claimIds = [...new Set([
      ...(Array.isArray(req.body?.claim_ids) ? req.body.claim_ids : []),
      req.body?.claim_id,
    ].map((value) => parseInt(value, 10)).filter(Number.isInteger))];
    const facebookUids = [...new Set([
      ...(Array.isArray(req.body?.facebook_uids) ? req.body.facebook_uids : []),
      req.body?.facebook_uid,
    ].map(nullify).filter(Boolean))];
    if (!claimIds.length && !facebookUids.length) {
      await transaction.rollback();
      return error(res, 'Can truyen claim_id hoac facebook_uid can reset', 400);
    }

    const selectedWhere = { owner_username };
    const selectors = [];
    if (claimIds.length) selectors.push({ id: { [Op.in]: claimIds } });
    if (facebookUids.length) selectors.push({ facebook_uid: { [Op.in]: facebookUids } });
    selectedWhere[Op.or] = selectors;
    const selectedClaims = await InstagramFacebookRegClaim.findAll({
      attributes: ['facebook_account_id', 'facebook_uid', 'status'],
      where: selectedWhere,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const accountIds = [...new Set(selectedClaims.map((row) => row.facebook_account_id).filter(Boolean))];
    if (!accountIds.length) {
      await transaction.rollback();
      return error(res, 'Khong tim thay account Facebook can reset', 404);
    }

    const resetAt = new Date();
    const [eligibility_affected] = await InstagramFacebookRegClaim.update({ eligibility_reset_at: resetAt }, {
      where: {
        owner_username,
        facebook_account_id: { [Op.in]: accountIds },
        status: { [Op.in]: ['REG_XONG', 'REG_FAIL'] },
        eligibility_reset_at: null,
      },
      transaction,
    });
    const [active_released] = await InstagramFacebookRegClaim.update({
      status: 'CANCELLED',
      fail_reason: 'Admin reset thu cong',
      completed_at: resetAt,
      locked_at: null,
    }, {
      where: {
        owner_username,
        facebook_account_id: { [Op.in]: accountIds },
        status: 'DANG_REG',
      },
      transaction,
    });
    await transaction.commit();
    return success(res, {
      affected: eligibility_affected + active_released,
      eligibility_affected,
      active_released,
      account_count: accountIds.length,
      facebook_uids: [...new Set(selectedClaims.map((row) => row.facebook_uid))],
      reset_at: resetAt,
    }, 'Da reset account de Reg Instagram lai');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};
const listMachines = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const allowedSorts = ['device_id', 'total_claims', 'active_count', 'success_count', 'fail_count', 'cancelled_count', 'facebook_count', 'instagram_count', 'last_report_at', 'last_activity_at'];
    const sort_by = allowedSorts.includes(req.query.sort_by) ? req.query.sort_by : 'last_activity_at';
    const sort_order = String(req.query.sort_order || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const q = nullify(req.query.q);
    const accountWhere = {
      owner_username,
      kind: 'job',
      device_id: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      status: { [Op.in]: ELIGIBLE_FACEBOOK_STATUSES },
      live_status: { [Op.ne]: 'die' },
    };
    if (q) accountWhere.device_id = { [Op.like]: `%${q}%` };

    const escapedOwner = sequelize.escape(owner_username);
    const latestIds = literal(`(SELECT MAX(latest_claim.id) FROM instagram_facebook_reg_claims AS latest_claim WHERE latest_claim.owner_username = ${escapedOwner} GROUP BY latest_claim.device_id, latest_claim.facebook_account_id)`);
    const claimWhere = { owner_username, id: { [Op.in]: latestIds } };
    if (q) claimWhere.device_id = { [Op.like]: `%${q}%` };

    const [accountRows, claimRows, instagramRows, countRows, reg_settings] = await Promise.all([
      FacebookAccount.findAll({
        attributes: [
          'device_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'facebook_count'],
          [sequelize.fn('MAX', sequelize.col('updated_at')), 'last_account_at'],
        ],
        where: accountWhere,
        group: ['device_id'],
        raw: true,
      }),
      InstagramFacebookRegClaim.findAll({
        attributes: [
          'device_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_claims'],
          [sequelize.fn('SUM', literal("CASE WHEN status = 'DANG_REG' THEN 1 ELSE 0 END")), 'active_count'],
          [sequelize.fn('SUM', literal("CASE WHEN status = 'REG_XONG' THEN 1 ELSE 0 END")), 'success_count'],
          [sequelize.fn('SUM', literal("CASE WHEN status = 'REG_FAIL' THEN 1 ELSE 0 END")), 'fail_count'],
          [sequelize.fn('SUM', literal("CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END")), 'cancelled_count'],
          [sequelize.fn('MAX', literal("CASE WHEN status = 'REG_XONG' THEN completed_at ELSE NULL END")), 'last_report_at'],
          [sequelize.fn('MAX', sequelize.col('updated_at')), 'last_claim_at'],
        ],
        where: claimWhere,
        group: ['device_id'],
        raw: true,
      }),
      InstagramFacebookRegResult.findAll({
        attributes: ['device_id', [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('instagram_uid'))), 'instagram_count']],
        where: { owner_username, ...(q ? { device_id: { [Op.like]: `%${q}%` } } : {}) },
        group: ['device_id'],
        raw: true,
      }),
      InstagramFacebookRegClaim.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { owner_username, id: { [Op.in]: latestIds } },
        group: ['status'],
        raw: true,
      }),
      getInstagramFacebookRegSettings(owner_username),
    ]);

    const claimByDevice = new Map(claimRows.map((row) => [String(row.device_id), row]));
    const instagramByDevice = new Map(instagramRows.map((row) => [String(row.device_id), Number(row.instagram_count) || 0]));
    const machines = accountRows.map((accountRow) => {
      const deviceId = String(accountRow.device_id);
      const claim = claimByDevice.get(deviceId) || {};
      const lastAccountAt = accountRow.last_account_at || null;
      const lastClaimAt = claim.last_claim_at || null;
      const lastActivityAt = !lastAccountAt ? lastClaimAt : !lastClaimAt ? lastAccountAt
        : new Date(lastAccountAt) > new Date(lastClaimAt) ? lastAccountAt : lastClaimAt;
      return {
        device_id: deviceId,
        facebook_count: Number(accountRow.facebook_count) || 0,
        instagram_count: instagramByDevice.get(deviceId) || 0,
        total_claims: Number(claim.total_claims) || 0,
        active_count: Number(claim.active_count) || 0,
        success_count: Number(claim.success_count) || 0,
        fail_count: Number(claim.fail_count) || 0,
        cancelled_count: Number(claim.cancelled_count) || 0,
        last_report_at: claim.last_report_at || null,
        last_activity_at: lastActivityAt,
      };
    });
    const valueForSort = (row) => row[sort_by];
    machines.sort((a, b) => {
      const av = valueForSort(a);
      const bv = valueForSort(b);
      let compared;
      if (sort_by === 'device_id') compared = String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true, sensitivity: 'base' });
      else if (sort_by.includes('_at')) compared = (av ? new Date(av).getTime() : 0) - (bv ? new Date(bv).getTime() : 0);
      else compared = Number(av || 0) - Number(bv || 0);
      return (sort_order === 'asc' ? compared : -compared)
        || String(a.device_id).localeCompare(String(b.device_id), undefined, { numeric: true, sensitivity: 'base' });
    });
    const total = machines.length;
    const pagedMachines = machines.slice((page - 1) * limit, page * limit);
    const status_counts = Object.fromEntries(CLAIM_STATUSES.map((item) => [item, 0]));
    countRows.forEach((row) => { status_counts[row.status] = Number(row.count) || 0; });
    return success(res, {
      machines: pagedMachines,
      status_counts,
      device_count: total,
      reg_settings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    }, 'Lay tong hop Reg Instagram theo may thanh cong');
  } catch (err) { next(err); }
};

const listClaims = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const allowedSorts = ['created_at', 'device_id', 'facebook_uid', 'instagram_uid', 'status', 'get_count', 'locked_at', 'completed_at', 'login_at'];
    const sort_by = allowedSorts.includes(req.query.sort_by) ? req.query.sort_by : 'login_at';
    const sort_order = String(req.query.sort_order || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const device_id = nullify(req.query.device_id);
    const status = String(req.query.status || '').trim().toUpperCase();
    const q = nullify(req.query.q)?.toLowerCase();
    const reg_settings = await getInstagramFacebookRegSettings(owner_username);
    const accountWhere = {
      owner_username,
      kind: 'job',
      status: { [Op.in]: ELIGIBLE_FACEBOOK_STATUSES },
      live_status: { [Op.ne]: 'die' },
      ...(device_id ? { device_id } : {}),
    };
    const accounts = await FacebookAccount.findAll({ where: accountWhere, order: [['login_at', 'DESC'], ['id', 'DESC']], raw: true });
    const accountIds = accounts.map((row) => row.id);
    const escapedOwner = sequelize.escape(owner_username);
    const claims = accountIds.length ? await InstagramFacebookRegClaim.findAll({
      where: {
        owner_username,
        facebook_account_id: { [Op.in]: accountIds },
        id: { [Op.in]: literal(`(SELECT MAX(latest_claim.id) FROM instagram_facebook_reg_claims AS latest_claim WHERE latest_claim.owner_username = ${escapedOwner} GROUP BY latest_claim.facebook_account_id)`) },
      },
      raw: true,
    }) : [];
    const resettableClaims = accountIds.length ? await InstagramFacebookRegClaim.findAll({
      attributes: ['facebook_account_id'],
      where: {
        owner_username,
        facebook_account_id: { [Op.in]: accountIds },
        status: { [Op.in]: ['REG_XONG', 'REG_FAIL'] },
        eligibility_reset_at: null,
        completed_at: { [Op.gt]: new Date(Date.now() - reg_settings.reuse_hours * 60 * 60 * 1000) },
      },
      raw: true,
    }) : [];
    const resettableAccountIds = new Set(resettableClaims.map((row) => Number(row.facebook_account_id)));
    const claimByAccount = new Map(claims.map((row) => [Number(row.facebook_account_id), row]));
    let rows = accounts.map((account) => {
      const claim = claimByAccount.get(Number(account.id));
      return {
        ...(claim || {}),
        id: claim?.id || null,
        facebook_account_id: account.id,
        facebook_uid: account.uid,
        device_id: account.device_id,
        facebook_status: account.status,
        login_at: account.login_at,
        status: claim?.status || 'CHUA_REG',
        can_reset: resettableAccountIds.has(Number(account.id)),
      };
    });
    if (status && [...CLAIM_STATUSES, 'CHUA_REG'].includes(status)) rows = rows.filter((row) => row.status === status);
    if (q) rows = rows.filter((row) => [row.device_id, row.facebook_uid, row.instagram_uid, row.email_order_id]
      .some((value) => String(value || '').toLowerCase().includes(q)));
    rows.sort((a, b) => {
      const av = a[sort_by];
      const bv = b[sort_by];
      let compared;
      if (['get_count'].includes(sort_by)) compared = Number(av || 0) - Number(bv || 0);
      else if (['created_at', 'locked_at', 'completed_at', 'login_at'].includes(sort_by)) compared = (av ? new Date(av).getTime() : 0) - (bv ? new Date(bv).getTime() : 0);
      else compared = String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true, sensitivity: 'base' });
      return (sort_order === 'asc' ? compared : -compared)
        || Number(b.facebook_account_id || 0) - Number(a.facebook_account_id || 0);
    });
    const status_counts = Object.fromEntries([...CLAIM_STATUSES, 'CHUA_REG'].map((item) => [item, 0]));
    accounts.forEach((account) => {
      const claimStatus = claimByAccount.get(Number(account.id))?.status || 'CHUA_REG';
      status_counts[claimStatus] = Number(status_counts[claimStatus] || 0) + 1;
    });
    const total = rows.length;
    const deviceCount = await FacebookAccount.count({
      where: { owner_username, kind: 'job', status: { [Op.in]: ELIGIBLE_FACEBOOK_STATUSES }, live_status: { [Op.ne]: 'die' } },
      distinct: true,
      col: 'device_id',
    });
    return success(res, {
      claims: rows.slice((page - 1) * limit, page * limit),
      status_counts,
      device_count: Number(deviceCount) || 0,
      reg_settings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    }, 'Lay danh sach account va trang thai Reg Instagram bang Facebook thanh cong');
  } catch (err) { next(err); }
};
module.exports = { getAccount, reportInstagram, finish, report, release, deviceStatus, resetEligibility, listMachines, listClaims };

const taskAcquirePermission=require('../middleware/taskAcquirePermission');
module.exports.getAccount=taskAcquirePermission('REG_INSTAGRAM',module.exports.getAccount);
