/**
 * chromeController.js — Loại 2 (Chrome accounts)
 *
 * Phone endpoints (API Key):
 *   POST /chrome-accounts/phone-submit  — phone gửi acc với status cụ thể
 *
 * Dashboard endpoints (JWT):
 *   GET    /chrome-accounts             — danh sách + filter
 *   GET    /chrome-accounts/:id
 *   PATCH  /chrome-accounts/:id
 *   POST   /chrome-accounts/import
 *   POST   /chrome-accounts/check-live
 *   POST   /chrome-accounts/promote-eligible
 *   POST   /chrome-accounts/bulk-action
 *   POST   /chrome-accounts/bulk-get
 *   POST   /chrome-accounts/bulk-delete
 */

const { Op }    = require('sequelize');
const ChromeAccount = require('../models/ChromeAccount');
const AccountGroup = require('../models/AccountGroup');
const logger    = require('../config/logger');
const { success, error } = require('../utils/response');
const { checkOne, batchCheckLive, parseProxy } = require('../utils/checkLiveUtils');
const { withFullData } = require('../utils/response');
const { ownerFromRequest, ownerFromAdmin, scopedWhere } = require('../utils/owner');
const { recordUsageHistory } = require('../services/usageHistoryService');

// Phone có thể set: LOGIN_THANH_CONG (login OK), ACC_LOGIN (login fail → về Chờ Login), DA_KHANG, CHUA_KHANG
const PHONE_STATUSES   = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','UPVIDEO_DONE'];
const MANUAL_STATUSES  = ['ACC_LOGIN'];
const ALL_STATUSES     = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.ACCOUNT_LOCK_TIMEOUT_MIN, 10) || 40;
const UPVIDEO_MAX_VIDEOS = 20;
const KHANG_MIN_VIDEOS = 10;
const ELIGIBLE_MIN_VIDEOS = 20;
const ELIGIBLE_MIN_AGE_DAYS = 4;

const nullify = (v) =>
  (!v || v.trim() === '' || v.trim().toLowerCase() === 'null') ? null : v.trim();
const pipeValue = (value) =>
  value === undefined || value === null || value === '' ? 'null' : String(value);
const legacyPipeValue = (value) =>
  value === undefined || value === null || value === '' ? 'Null' : String(value);
const looksLikeEmail = (value) => /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(String(value || '').trim());
const looksLikeCookie = (value) => /(^|[;\s])sid_guard=|tt_chain_token=|sessionid=|uid_tt=/.test(String(value || ''));
const chromeLegacyFields = (account) => {
  let password = account.password;
  let email = account.email;
  let emailPass = account.email_pass;
  let cookie = account.cookie;

  if (!email && looksLikeEmail(password)) {
    email = password;
    password = null;
  }
  if (looksLikeEmail(password) && email && looksLikeCookie(emailPass) && !cookie) {
    email = password;
    password = null;
    cookie = emailPass;
    emailPass = account.email;
  }

  return [account.username || '', legacyPipeValue(password), legacyPipeValue(email), legacyPipeValue(emailPass), legacyPipeValue(cookie)];
};

const availableLockWhere = () => ({
  [Op.or]: [
    { locked_by: null },
    { locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) } },
  ],
});

const isEligibleAge = (regAt) => {
  if (!regAt) return false;
  return new Date(regAt).getTime() <= Date.now() - ELIGIBLE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
};

const checkAndFinalizeUpvideo = async (account, device_id, fallbackVideoCount) => {
  let stats = null;
  const proxyUrl = parseProxy(account.proxy || '');

  if (fallbackVideoCount !== undefined && fallbackVideoCount !== null && fallbackVideoCount !== '') {
    stats = {
      live: true,
      videos: parseInt(fallbackVideoCount, 10),
      followers: account.followers ?? null,
      following: account.following ?? null,
    };
  } else {
    stats = await checkOne(account.username, proxyUrl);
  }

  const updateData = {
    device_id,
    locked_by: null,
    locked_at: null,
    last_live_check_at: new Date(),
  };

  let action = 'check_unknown';
  let message = 'Không check được số video, đã mở lock để chạy lại sau';

  if (stats === null) {
    await account.update(updateData);
    return { account, stats: null, action, message };
  }

  const videoCount = Number.isFinite(Number(stats.videos)) ? Number(stats.videos) : 0;
  updateData.live_status = stats.live ? 'live' : 'die';
  updateData.video_count = videoCount;
  updateData.followers = stats.followers ?? null;
  updateData.following = stats.following ?? null;

  if (!stats.live) {
    updateData.status = 'ACC_DIE';
    action = 'die';
    message = 'Account die, đã chuyển sang ACC_DIE';
  } else if (
    account.status === 'ACC_DA_KHANG' &&
    videoCount >= ELIGIBLE_MIN_VIDEOS &&
    isEligibleAge(account.reg_at)
  ) {
    updateData.status = 'ACC_DU_DK';
    action = 'eligible';
    message = 'Đã đủ video';
  } else if (account.status === 'ACC_CHUA_KHANG' && videoCount >= ELIGIBLE_MIN_VIDEOS) {
    action = 'ready_for_khang';
    message = 'Đã đủ video, giữ ở Chưa Kháng để xử lý kháng';
  } else {
    action = 'unlock_for_retry';
    message = 'Chưa đủ video';
  }

  await account.update(updateData);
  return { account, stats, action, message };
};

const SORT_FIELDS = {
  video_count: 'video_count',
  followers:   'followers',
  following:   'following',
  reg_at:      'reg_at',
  id:          'id',
};

const buildSortOrder = (sort_by, sort_dir) => {
  const field = SORT_FIELDS[sort_by] || 'id';
  const dir = String(sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const order = [[field, dir]];
  if (field !== 'id') order.push(['id', 'DESC']);
  return order;
};

// ── Phone endpoint ──────────────────────────────────────────────────────────
const phoneSubmit = async (req, res, next) => {
  try {
    const { username, password, email, email_pass, device_id, status, note, twofa, cookie, proxy, fail_reason, video_count } = req.body;
    const owner_username = ownerFromRequest(req);

    if (!username) return error(res, 'Thiếu username', 400);
    if (status === 'UPVIDEO_DONE' || req.body.action === 'upvideo_done') {
      if (!device_id) return error(res, 'Thiếu device_id', 400);
      const account = await ChromeAccount.findOne({ where: { username, owner_username } });
      if (!account) return error(res, 'Account không tồn tại', 404);
      const result = await checkAndFinalizeUpvideo(account, device_id, video_count);
      logger.info('chrome phone-submit upvideo-done', { username, device_id, action: result.action, videos: result.stats?.videos ?? null });
      return success(res, { account: result.account, check: result.stats, action: result.action }, result.message);
    }
    if (!status || !PHONE_STATUSES.includes(status)) {
      return error(res, `status không hợp lệ. Phone dùng: ${PHONE_STATUSES.join(', ')}`, 400);
    }

    const [account, created] = await ChromeAccount.findOrCreate({
      where:    { username, owner_username },
      defaults: {
        username, password: nullify(password), email: nullify(email),
        email_pass: nullify(email_pass), twofa: nullify(twofa),
        cookie: nullify(cookie), proxy: nullify(proxy),
        device_id: nullify(device_id), status, note: nullify(note),
        fail_reason: nullify(fail_reason), reg_at: new Date(), owner_username,
      },
    });

    if (!created) {
      const upd = { status, locked_by: null, locked_at: null }; // clear lock khi phone gửi kết quả
      if (device_id)   upd.device_id   = device_id;
      if (note)        upd.note        = note;
      if (fail_reason) upd.fail_reason = fail_reason;
      if (password)    upd.password    = password;
      if (cookie)      upd.cookie      = cookie;
      await account.update(upd);
    }

    logger.info('chrome phone-submit', { username, status, device_id, created });
    return success(res, { account }, created ? 'Tạo mới thành công' : 'Cập nhật thành công', created ? 201 : 200);
  } catch (err) {
    next(err);
  }
};

// ── Phone: Lấy account từ ACC_LOGIN (Chờ Login) ─────────────────────────────
const getChoLogin = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const sequelize   = ChromeAccount.sequelize;
    const transaction = await sequelize.transaction();

    try {
      const account = await ChromeAccount.findOne({
        where:  { status: 'ACC_LOGIN', owner_username, ...availableLockWhere() },
        lock:   transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
        attributes: ['id','username','password','email','email_pass','twofa','cookie','token','proxy','device_id'],
      });

      if (!account) {
        await transaction.rollback();
        return success(res, null, 'Không có account Chờ Login khả dụng');
      }

      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();

      logger.info('chrome get-cho-login', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ── Phone: Báo cáo login thành công ──────────────────────────────────────────
const loginSuccess = async (req, res, next) => {
  try {
    const { username, device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!username)  return error(res, 'Thiếu username', 400);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const account = await ChromeAccount.findOne({ where: { username, owner_username } });
    if (!account) return error(res, 'Account không tồn tại', 404);

    await account.update({ status: 'LOGIN_THANH_CONG', device_id, locked_by: null, locked_at: null });

    logger.info('chrome login-success', { id: account.id, username, device_id });
    return success(res, { account }, 'Cập nhật Login Thành Công');
  } catch (err) { next(err); }
};

// ── Phone: Lấy account từ LOGIN_THANH_CONG ───────────────────────────────────
const getAccount = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const sequelize  = ChromeAccount.sequelize;
    const transaction = await sequelize.transaction();

    try {
      const account = await ChromeAccount.findOne({
        where:  { status: 'LOGIN_THANH_CONG', owner_username, ...availableLockWhere() },
        lock:   transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
      });

      if (!account) {
        await transaction.rollback();
        return success(res, null, 'Không có account khả dụng');
      }

      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();

      logger.info('chrome get-account', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ── Dashboard: List ──────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { status, live_status, search, device_id, group_id, date_from, date_to, video_max, video_min, sort_by, sort_dir, page = 1, limit = 20 } = req.query;
    const where = scopedWhere(req);
    if (status)      where.status      = status;
    if (live_status) where.live_status = live_status;
    if (device_id)   where.device_id   = device_id;
    if (group_id)    where.group_id    = parseInt(group_id, 10);
    if (search)      where.username    = { [Op.like]: `%${search}%` };
    if (date_from || date_to) {
      where.reg_at = {};
      if (date_from) where.reg_at[Op.gte] = new Date(date_from);
      if (date_to)   where.reg_at[Op.lte] = new Date(date_to + 'T23:59:59');
    }
    if (video_min !== undefined || video_max !== undefined) {
      where.video_count = {};
      if (video_min !== undefined) where.video_count[Op.gte] = parseInt(video_min);
      if (video_max !== undefined) where.video_count[Op.lte] = parseInt(video_max);
    }

    const pageNum   = Math.max(1, parseInt(page));
    const pageLimit = Math.min(100, parseInt(limit) || 20);
    const offset    = (pageNum - 1) * pageLimit;

    const { count, rows } = await ChromeAccount.findAndCountAll({
      where, order: buildSortOrder(sort_by, sort_dir), limit: pageLimit, offset,
    });

    return success(res, {
      accounts:   rows,
      pagination: { total: count, page: pageNum, limit: pageLimit, pages: Math.ceil(count / pageLimit) },
    }, 'OK');
  } catch (err) { next(err); }
};

// ── Dashboard: Detail ────────────────────────────────────────────────────────
const getById = async (req, res, next) => {
  try {
    const account = await ChromeAccount.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!account) return error(res, 'Không tìm thấy account', 404);
    return success(res, { account }, 'OK');
  } catch (err) { next(err); }
};

// ── Dashboard: Update single ─────────────────────────────────────────────────
const updateAccount = async (req, res, next) => {
  try {
    const account = await ChromeAccount.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!account) return error(res, 'Không tìm thấy account', 404);

    const allowed = ['username','password','email','email_pass','twofa','proxy','device_id','group_id','note','status','live_status','cookie','token'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await account.update(updates);
    logger.info('chrome update', { id: req.params.id, updates, admin: req.admin?.username });
    return success(res, { account }, 'Cập nhật thành công');
  } catch (err) { next(err); }
};

// ── Dashboard: Import ────────────────────────────────────────────────────────
const parseLine = (line) => {
  let dataPart = line;
  let reg_at   = null;

  const tabIdx = line.indexOf('\t');
  if (tabIdx > 0) {
    const prefix = line.substring(0, tabIdx).trim();
    const m = prefix.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, dd, MM, yyyy, hh, min, ss] = m;
      reg_at   = new Date(`${yyyy}-${MM.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min}:${ss}`);
      dataPart = line.substring(tabIdx + 1).trim();
    }
  }

  const parts    = dataPart.split('|');
  const username = nullify(parts[0]);
  if (!username) return null;
  const legacyChromeImport = looksLikeEmail(parts[1])
    && (parts.length === 3 || looksLikeCookie(parts[3]));

  return {
    username,
    password:   legacyChromeImport ? null : nullify(parts[1]),
    email:      legacyChromeImport ? nullify(parts[1]) : nullify(parts[2]),
    email_pass: legacyChromeImport ? nullify(parts[2]) : nullify(parts[3]),
    cookie:     legacyChromeImport ? nullify(parts[3]) : null,
    token:      legacyChromeImport ? nullify(parts[4]) : null,
    reg_at:     reg_at || new Date(),
  };
};

const importChromeAccounts = async (req, res, next) => {
  try {
    const { text, status = 'ACC_LOGIN', group_id } = req.body;
    const owner_username = ownerFromAdmin(req);

    if (!text || typeof text !== 'string') return error(res, 'Thiếu trường text', 400);
    if (!ALL_STATUSES.includes(status)) {
      return error(res, `status không hợp lệ. Dùng: ${ALL_STATUSES.join(', ')}`, 400);
    }
    const groupId = group_id ? parseInt(group_id, 10) : null;
    if (group_id && (!Number.isInteger(groupId) || groupId <= 0)) {
      return error(res, 'group_id khong hop le', 400);
    }
    if (groupId) {
      const group = await AccountGroup.findOne({
        where: { id: groupId, owner_username, account_type: 'chrome' },
      });
      if (!group) return error(res, 'Nhom import khong ton tai', 404);
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0)  return error(res, 'Không có dữ liệu', 400);
    if (lines.length > 2000) return error(res, 'Tối đa 2000 dòng mỗi lần', 400);

    const parseErrors   = [];
    const seenUsernames = new Map();

    for (const line of lines) {
      try {
        const parsed = parseLine(line);
        if (!parsed) { parseErrors.push(`Thiếu username: "${line.substring(0, 60)}"`); continue; }
        if (!seenUsernames.has(parsed.username)) seenUsernames.set(parsed.username, { ...parsed, status, owner_username, group_id: groupId });
      } catch (_) {
        parseErrors.push(`Lỗi parse: "${line.substring(0, 60)}"`);
      }
    }

    const unique = [...seenUsernames.values()];
    let toInsert = unique;

    if (unique.length > 0) {
      const existing = await ChromeAccount.findAll({
        where:      { username: { [Op.in]: unique.map((r) => r.username) }, owner_username },
        attributes: ['username'],
      });
      const existingSet = new Set(existing.map((r) => r.username));
      toInsert = unique.filter((r) => !existingSet.has(r.username));
    }

    if (toInsert.length > 0) {
      await ChromeAccount.bulkCreate(toInsert, {
        fields: ['username','password','email','email_pass','cookie','token','status','reg_at','owner_username','group_id'],
      });
    }

    const result = { imported: toInsert.length, duplicates: unique.length - toInsert.length, parse_errors: parseErrors.length, error_samples: parseErrors.slice(0, 10) };
    logger.info('chrome import', { ...result, status, group_id: groupId, owner_username, admin: req.admin?.username });

    return success(res, result,
      `Đã import ${result.imported} accounts` +
      (result.duplicates   ? `, bỏ qua ${result.duplicates} trùng`   : '') +
      (result.parse_errors ? `, ${result.parse_errors} dòng lỗi`     : '')
    );
  } catch (err) { next(err); }
};

// ── Dashboard: Check Live ────────────────────────────────────────────────────
const checkLive = async (req, res, next) => {
  req.socket?.setTimeout?.(600_000);
  try {
    let { ids, proxies = [], concurrency = 12, delay_ms = 200 } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return error(res, 'Cần truyền mảng ids', 400);
    if (ids.length > 1000) return error(res, 'Tối đa 1000 accounts/lần', 400);

    const proxyPool = (Array.isArray(proxies) ? proxies : String(proxies).split('\n'))
      .map(parseProxy).filter(Boolean);

    concurrency = Math.max(1, Math.min(50,   parseInt(concurrency) || 12));
    delay_ms    = Math.max(0, Math.min(10000, parseInt(delay_ms)   || 200));

    const accounts = await ChromeAccount.findAll({
      where:      scopedWhere(req, { id: { [Op.in]: ids }, username: { [Op.ne]: null } }),
      attributes: ['id','username'],
      order:      [['id','ASC']],
    });

    if (accounts.length === 0) return success(res, { results: [], live: 0, die: 0, unknown: 0 }, 'Không có account');

    const results = await batchCheckLive(accounts, proxyPool, concurrency, delay_ms);
    const live    = results.filter((r) => r.result === 'live').length;
    const die     = results.filter((r) => r.result === 'die').length;
    const unknown = results.filter((r) => r.result === 'unknown').length;

    logger.info('chrome check-live done', { total: results.length, live, die, unknown, admin: req.admin?.username });
    return success(res, { results, live, die, unknown }, `Checked ${results.length}: ${live} live · ${die} die · ${unknown} unknown`);
  } catch (err) { next(err); }
};

// ── Phone: Lấy acc cần UPVIDEO (DA_KHANG hoặc CHUA_KHANG mà < 20 video) ──────
const getCanUpvideo = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const sequelize   = ChromeAccount.sequelize;
    const transaction = await sequelize.transaction();
    try {
      const account = await ChromeAccount.findOne({
        where: {
          status:      { [Op.in]: ['ACC_DA_KHANG', 'ACC_CHUA_KHANG'] },
          video_count: { [Op.lt]: UPVIDEO_MAX_VIDEOS },
          owner_username,
          ...availableLockWhere(),
        },
        lock:        transaction.LOCK.UPDATE,
        skipLocked:  true,
        transaction,
        attributes:  ['id','username','password','email','email_pass','twofa','cookie','token','proxy','status','video_count'],
      });

      if (!account) { await transaction.rollback(); return success(res, null, 'Không có account cần upvideo'); }

      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();

      logger.info('chrome get-can-upvideo', { id: account.id, username: account.username, status: account.status, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ── Phone: Báo đã upvideo xong (cập nhật video_count, giữ nguyên status) ─────
const reportUpload = async (req, res, next) => {
  try {
    const { username, device_id, video_count } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!username)    return error(res, 'Thiếu username', 400);
    if (!device_id)   return error(res, 'Thiếu device_id', 400);

    const account = await ChromeAccount.findOne({ where: { username, owner_username } });
    if (!account) return error(res, 'Account không tồn tại', 404);

    const result = await checkAndFinalizeUpvideo(account, device_id, video_count);
    logger.info('chrome report-upload', { id: account.id, username, device_id, action: result.action, videos: result.stats?.videos ?? video_count ?? null });
    return success(res, { account: result.account, check: result.stats, action: result.action }, result.message);
  } catch (err) { next(err); }
};

// ── Phone: Lấy acc CHUA_KHANG > 10 video để đi kháng ────────────────────────
const getCanKhang = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const sequelize   = ChromeAccount.sequelize;
    const transaction = await sequelize.transaction();
    try {
      const account = await ChromeAccount.findOne({
        where: {
          status:      'ACC_CHUA_KHANG',
          video_count: { [Op.gt]: KHANG_MIN_VIDEOS },
          owner_username,
          ...availableLockWhere(),
        },
        lock:        transaction.LOCK.UPDATE,
        skipLocked:  true,
        transaction,
        attributes:  ['id','username','password','email','email_pass','twofa','cookie','token','proxy','video_count'],
      });

      if (!account) { await transaction.rollback(); return success(res, null, 'Không có account Chưa Kháng đủ điều kiện'); }

      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();

      logger.info('chrome get-can-khang', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ── Dashboard: Promote Eligible ──────────────────────────────────────────────
// Chỉ promote ACC_DA_KHANG có >= 20 video và reg >= 4 ngày → ACC_DU_DK
const promoteEligible = async (req, res, next) => {
  try {
    const { min_age_days = ELIGIBLE_MIN_AGE_DAYS, min_videos = ELIGIBLE_MIN_VIDEOS } = req.body;
    const cutoff = new Date(Date.now() - min_age_days * 24 * 60 * 60 * 1000);

    const [affected] = await ChromeAccount.update(
      { status: 'ACC_DU_DK' },
      {
        where: {
          status:      'ACC_DA_KHANG',
          video_count: { [Op.gte]: min_videos },
          reg_at:      { [Op.lte]: cutoff },
          ...scopedWhere(req),
        },
      }
    );

    logger.info('chrome promote-eligible', { affected, min_age_days, min_videos, admin: req.admin?.username });
    return success(res, { affected },
      affected > 0
        ? `Đã chuyển ${affected} accounts đủ điều kiện → ACC_DU_DK`
        : `Không có account đủ điều kiện (cần: Đã Kháng + ≥ ${min_videos} video + reg ≥ ${min_age_days} ngày)`
    );
  } catch (err) { next(err); }
};

// ── Dashboard: Bulk Action ───────────────────────────────────────────────────
const bulkAction = async (req, res, next) => {
  try {
    const { ids, action, status, note } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return error(res, 'Cần truyền mảng ids không rỗng', 400);
    if (ids.length > 500) return error(res, 'Tối đa 500 accounts mỗi lần', 400);
    if (!action) return error(res, 'Thiếu action', 400);

    let updateData = {};
    let message    = '';

    switch (action) {
      case 'set_status':
        if (!status || !ALL_STATUSES.includes(status)) return error(res, `status không hợp lệ. Dùng: ${ALL_STATUSES.join(', ')}`, 400);
        updateData = { status };
        message    = `Đã đổi ${ids.length} accounts → ${status}`;
        break;
      case 'set_note':
        if (note === undefined) return error(res, 'Thiếu note', 400);
        updateData = { note };
        message    = `Đã cập nhật note cho ${ids.length} accounts`;
        break;
      case 'mark_used':
        {
          const usedAccounts = await ChromeAccount.findAll({
            where: scopedWhere(req, { id: { [Op.in]: ids } }),
            attributes: ['id','username','password','email','email_pass','status','owner_username'],
          });
          await recordUsageHistory(req, usedAccounts, { account_type: 'chrome' });
        }
        updateData = {
          note: note || `[Đã dùng] ${new Date().toLocaleString('vi-VN')}`,
          status: status && ALL_STATUSES.includes(status) ? status : 'ACC_DA_DUNG',
        };
        message    = `Đã đánh dấu ${ids.length} accounts là "Đã dùng"`;
        break;
      case 'clear_note':
        updateData = { note: null };
        message    = `Đã xoá note của ${ids.length} accounts`;
        break;
      case 'clear_lock':
        updateData = { locked_by: null, locked_at: null };
        message    = `Đã mở khoá ${ids.length} accounts`;
        break;
      default:
        return error(res, `action không hợp lệ: ${action}`, 400);
    }

    const [affected] = await ChromeAccount.update(updateData, { where: scopedWhere(req, { id: { [Op.in]: ids } }) });
    logger.info('chrome bulk-action', { action, affected, admin: req.admin?.username });
    return success(res, { affected, ids: ids.length }, message);
  } catch (err) { next(err); }
};

// ── Dashboard: Bulk Get ──────────────────────────────────────────────────────
const bulkGet = async (req, res, next) => {
  try {
    const { ids, format } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return error(res, 'Cần truyền mảng ids', 400);

    const accounts = await ChromeAccount.findAll({
      where:      scopedWhere(req, { id: { [Op.in]: ids } }),
      attributes: ['id','username','password','email','email_pass','cookie','status','live_status','video_count','proxy','device_id'],
      order:      [['id','ASC']],
    });

    if (format === 'legacy_pipe') {
      const lines = accounts.filter((a) => a.username).map((a) => chromeLegacyFields(a).join('|'));
      return success(res, { text: lines.join('\n'), count: lines.length }, 'OK');
    }

    if (format === 'pipe') {
      const lines = accounts.filter((a) => a.username).map((a) =>
        [a.username || '', pipeValue(a.password), pipeValue(a.email), pipeValue(a.email_pass)].join('|')
      );
      return success(res, { text: lines.join('\n'), count: lines.length }, 'OK');
    }

    return success(res, { accounts, count: accounts.length }, 'OK');
  } catch (err) { next(err); }
};

// ── Dashboard: Bulk Delete ───────────────────────────────────────────────────
const bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return error(res, 'Cần truyền mảng ids không rỗng', 400);
    if (ids.length > 500) return error(res, 'Tối đa 500 accounts mỗi lần xóa', 400);

    const deleted = await ChromeAccount.destroy({ where: scopedWhere(req, { id: { [Op.in]: ids } }) });
    logger.info('chrome bulk-delete', { requested: ids.length, deleted, admin: req.admin?.username });
    return success(res, { deleted }, `Đã xóa ${deleted} accounts`);
  } catch (err) { next(err); }
};

module.exports = {
  phoneSubmit, getChoLogin, loginSuccess, getAccount,
  getCanUpvideo, reportUpload, getCanKhang,
  getAll, getById, updateAccount,
  importChromeAccounts,
  checkLive, promoteEligible,
  bulkAction, bulkGet, bulkDelete,
};
