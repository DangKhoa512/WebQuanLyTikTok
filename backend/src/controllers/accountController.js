const { Op }    = require('sequelize');
const Account   = require('../models/Account');
const accountService = require('../services/accountService');
const { success, error, withFullData } = require('../utils/response');
const logger = require('../config/logger');
const { ownerFromRequest, ownerFromAdmin } = require('../utils/owner');

const PHONE_STATUSES = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.ACCOUNT_LOCK_TIMEOUT_MIN, 10) || 10;

const availableLockWhere = () => ({
  [Op.or]: [
    { locked_by: null },
    { locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) } },
  ],
});

// ── Lấy acc LOGIN_THANH_CONG để xử lý kháng ──────────────────────────────────
const getAccount = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);

    const transaction = await Account.sequelize.transaction();
    try {
      const account = await Account.findOne({
        where:  { status: 'LOGIN_THANH_CONG', owner_username, ...availableLockWhere() },
        lock:   transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
        attributes: ['id','username','password','email','email_pass','twofa','cookie','token','proxy','status','video_count'],
      });
      if (!account) { await transaction.rollback(); return success(res, null, 'Không có account khả dụng'); }
      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();
      logger.info('upload get-account', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ── Phone submit status (kháng/login fail) ────────────────────────────────────
const phoneSubmit = async (req, res, next) => {
  try {
    const { username, device_id, status, note, fail_reason } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!username) return error(res, 'Thiếu username', 400);
    if (!status || !PHONE_STATUSES.includes(status)) {
      return error(res, `status không hợp lệ. Dùng: ${PHONE_STATUSES.join(', ')}`, 400);
    }
    const account = await Account.findOne({ where: { username, owner_username } });
    if (!account) return error(res, 'Account không tồn tại', 404);
    const upd = { status, locked_by: null, locked_at: null };
    if (note)        upd.note        = note;
    if (fail_reason) upd.fail_reason = fail_reason;
    await account.update(upd);
    logger.info('upload phone-submit', { username, status, device_id });
    return success(res, { account }, 'Cập nhật thành công');
  } catch (err) { next(err); }
};

// ── Lấy acc DA_KHANG/CHUA_KHANG < 20 video để upload thêm ───────────────────
const getCanUpvideo = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);
    const transaction = await Account.sequelize.transaction();
    try {
      const account = await Account.findOne({
        where: { status: { [Op.in]: ['ACC_DA_KHANG','ACC_CHUA_KHANG'] }, video_count: { [Op.lt]: 20 }, owner_username, ...availableLockWhere() },
        lock:  transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
        attributes: ['id','username','password','email','email_pass','twofa','cookie','token','proxy','status','video_count'],
      });
      if (!account) { await transaction.rollback(); return success(res, null, 'Không có account cần upvideo'); }
      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();
      logger.info('upload get-can-upvideo', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ── Báo đã upload video (cập nhật video_count, giữ nguyên status) ────────────
const reportUpload = async (req, res, next) => {
  try {
    const { username, device_id, video_count } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!username)               return error(res, 'Thiếu username', 400);
    if (!device_id)              return error(res, 'Thiếu device_id', 400);
    if (video_count === undefined) return error(res, 'Thiếu video_count', 400);
    const account = await Account.findOne({ where: { username, owner_username } });
    if (!account) return error(res, 'Account không tồn tại', 404);
    await account.update({ video_count: parseInt(video_count), locked_by: null, locked_at: null });
    logger.info('upload report-upload', { username, video_count, device_id });
    return success(res, { account }, `Cập nhật video_count = ${video_count}`);
  } catch (err) { next(err); }
};

// ── Lấy acc CHUA_KHANG ≥ 20 video để kháng ──────────────────────────────────
const getCanKhang = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const owner_username = ownerFromRequest(req);
    if (!device_id) return error(res, 'Thiếu device_id', 400);
    const transaction = await Account.sequelize.transaction();
    try {
      const account = await Account.findOne({
        where: { status: 'ACC_CHUA_KHANG', video_count: { [Op.gte]: 20 }, owner_username, ...availableLockWhere() },
        lock:  transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
        attributes: ['id','username','password','email','email_pass','twofa','cookie','token','proxy','video_count'],
      });
      if (!account) { await transaction.rollback(); return success(res, null, 'Không có account Chưa Kháng đủ điều kiện'); }
      await account.update({ locked_by: device_id, locked_at: new Date() }, { transaction });
      await transaction.commit();
      logger.info('upload get-can-khang', { id: account.id, username: account.username, device_id });
      return success(res, { account: withFullData(account) }, 'Lấy account thành công');
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

const regSubmit = async (req, res, next) => {
  try {
    const account = await accountService.regSubmit(req.body, ownerFromRequest(req));
    return success(res, { account }, 'Đăng ký account thành công', 201);
  } catch (err) {
    next(err);
  }
};

const getUpvideo = async (req, res, next) => {
  try {
    const { device_id } = req.body;
    const account = await accountService.getUpvideo(device_id, ownerFromRequest(req));

    if (!account) return success(res, null, 'Không có account UPVIDEO nào khả dụng');
    logger.info('Account locked for upload', { account_id: account.id, device_id });
    return success(res, { account: withFullData(account) }, 'Lấy account thành công');
  } catch (err) {
    next(err);
  }
};

const uploadSuccess = async (req, res, next) => {
  try {
    const { username, device_id, video_count } = req.body;
    const account = await accountService.uploadSuccess(username, device_id, video_count, ownerFromRequest(req));
    return success(res, { account }, 'Cập nhật upload thành công');
  } catch (err) {
    next(err);
  }
};

const uploadFail = async (req, res, next) => {
  try {
    const { username, device_id, reason } = req.body;
    const account = await accountService.uploadFail(username, device_id, reason, ownerFromRequest(req));
    return success(res, { account }, 'Cập nhật fail thành công');
  } catch (err) {
    next(err);
  }
};

const updateLive = async (req, res, next) => {
  try {
    const { username, live_status } = req.body;
    const account = await accountService.updateLive(username, live_status, ownerFromRequest(req));
    return success(res, { account }, 'Cập nhật live status thành công');
  } catch (err) {
    next(err);
  }
};

const getAccounts = async (req, res, next) => {
  try {
    const ownerFilter = req.admin?.role === 'admin' && !req.query.user ? null : ownerFromAdmin(req);
    const result = await accountService.getAccounts(req.query, ownerFilter);
    return success(res, result, 'Lấy danh sách account thành công');
  } catch (err) {
    next(err);
  }
};

const getAccountById = async (req, res, next) => {
  try {
    const ownerFilter = req.admin?.role === 'admin' && !req.query.user ? null : ownerFromAdmin(req);
    const account = await accountService.getAccountById(req.params.id, ownerFilter);
    return success(res, { account }, 'Lấy thông tin account thành công');
  } catch (err) {
    next(err);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    const ownerFilter = req.admin?.role === 'admin' && !req.query.user ? null : ownerFromAdmin(req);
    const account = await accountService.updateAccount(req.params.id, req.body, ownerFilter);
    return success(res, { account }, 'Cập nhật account thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  regSubmit,
  getUpvideo, getAccount, phoneSubmit,
  getCanUpvideo, reportUpload, getCanKhang,
  uploadSuccess, uploadFail, updateLive,
  getAccounts, getAccountById, updateAccount,
};
