const { Op }   = require('sequelize');
const Account  = require('../models/Account');
const logger   = require('../config/logger');
const { success, error } = require('../utils/response');
const { scopedWhere } = require('../utils/owner');

const VALID_STATUSES = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE'];

/**
 * POST /api/accounts/bulk-action
 * Thực hiện hành động hàng loạt trên danh sách account IDs.
 *
 * Body:
 * {
 *   ids:    [1, 2, 3, ...],       // bắt buộc
 *   action: "set_status"          // xem danh sách action bên dưới
 *         | "set_note"
 *         | "mark_used"           // thêm note "Đã dùng" + đổi status
 *         | "clear_note"
 *         | "clear_lock",
 *   status: "UPVIDEO",            // dùng với set_status / mark_used
 *   note:   "Ghi chú gì đó",     // dùng với set_note / mark_used
 * }
 */
const bulkAction = async (req, res, next) => {
  try {
    const { ids, action, status, note } = req.body;

    // Validate
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, 'Cần truyền mảng ids không rỗng', 400);
    }
    if (ids.length > 500) {
      return error(res, 'Tối đa 500 accounts mỗi lần', 400);
    }
    if (!action) {
      return error(res, 'Thiếu action', 400);
    }

    let updateData = {};
    let message    = '';

    switch (action) {

      // Đổi status hàng loạt
      case 'set_status':
        if (!status || !VALID_STATUSES.includes(status)) {
          return error(res, `status không hợp lệ. Dùng: ${VALID_STATUSES.join(', ')}`, 400);
        }
        updateData = { status };
        message    = `Đã đổi ${ids.length} accounts → ${status}`;
        break;

      // Ghi note hàng loạt
      case 'set_note':
        if (note === undefined) return error(res, 'Thiếu note', 400);
        updateData = { note };
        message    = `Đã cập nhật note cho ${ids.length} accounts`;
        break;

      // Đánh dấu "đã copy/dùng ở tool khác"
      case 'mark_used':
        updateData = {
          note: note || `[Đã dùng] ${new Date().toLocaleString('vi-VN')}`,
          ...(status && VALID_STATUSES.includes(status) ? { status } : {}),
        };
        message = `Đã đánh dấu ${ids.length} accounts là "Đã dùng"`;
        break;

      // Xoá note
      case 'clear_note':
        updateData = { note: null };
        message    = `Đã xoá note của ${ids.length} accounts`;
        break;

      // Xoá lock (mở khoá thủ công)
      case 'clear_lock':
        updateData = { locked_by: null, locked_at: null };
        message    = `Đã mở khoá ${ids.length} accounts`;
        break;

      // Đổi live_status
      case 'set_live':
        const validLive = ['unknown','live','die'];
        if (!req.body.live_status || !validLive.includes(req.body.live_status)) {
          return error(res, 'live_status không hợp lệ', 400);
        }
        updateData = { live_status: req.body.live_status, last_live_check_at: new Date() };
        message    = `Đã đổi live_status → ${req.body.live_status} cho ${ids.length} accounts`;
        break;

      default:
        return error(res, `action không hợp lệ: ${action}`, 400);
    }

    const [affected] = await Account.update(updateData, {
      where: scopedWhere(req, { id: { [Op.in]: ids } }),
    });

    logger.info('Bulk action', {
      action, affected, ids: ids.length,
      admin: req.admin?.username,
    });

    return success(res, { affected, ids: ids.length }, message);

  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/accounts/bulk-get
 * Lấy full data của nhiều accounts theo IDs (để copy sang tool)
 * Body: { ids: [1,2,3] }
 */
const bulkGet = async (req, res, next) => {
  try {
    const { ids, format } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, 'Cần truyền mảng ids', 400);
    }

    const accounts = await Account.findAll({
      where: scopedWhere(req, { id: { [Op.in]: ids } }),
      attributes: ['id','username','password','email','email_pass',
                   'status','live_status','video_count','proxy','device_id'],
      order: [['id','ASC']],
    });

    // format=pipe → trả plain text: user|pass|mail|passmail
    if (format === 'pipe') {
      const lines = accounts
        .filter((a) => a.username)
        .map((a) => [
          a.username   || '',
          a.password   || '',
          a.email      || '',
          a.email_pass || '',
        ].join('|'));

      return success(res, { text: lines.join('\n'), count: lines.length }, 'OK');
    }

    return success(res, { accounts, count: accounts.length }, 'OK');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/accounts/copy-unused
 * Lấy danh sách accounts chưa dùng (note IS NULL) theo status, trả về pipe format.
 * Body: { status, limit, mark_used }
 */
const copyUnused = async (req, res, next) => {
  try {
    const {
      status     = 'DAT_CHI_TIEU',
      limit      = 500,
      mark_used  = false,
    } = req.body;

    const VALID = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE'];
    if (!VALID.includes(status)) {
      return error(res, 'status không hợp lệ', 400);
    }

    const accounts = await Account.findAll({
      where:      scopedWhere(req, { status, note: null }),
      attributes: ['id','username','password','email','email_pass'],
      order:      [['id','ASC']],
      limit:      Math.min(parseInt(limit) || 500, 1000),
    });

    const lines = accounts
      .filter((a) => a.username)
      .map((a) => [
        a.username   || '',
        a.password   || '',
        a.email      || '',
        a.email_pass || '',
      ].join('|'));

    // Optionally mark as used
    if (mark_used && accounts.length > 0) {
      const ids = accounts.map((a) => a.id);
      await Account.update(
        { note: `[Đã dùng] ${new Date().toLocaleString('vi-VN')}` },
        { where: scopedWhere(req, { id: { [Op.in]: ids } }) }
      );
    }

    logger.info('Copy unused', {
      status, count: lines.length, mark_used,
      admin: req.admin?.username,
    });

    return success(res, {
      text:    lines.join('\n'),
      count:   lines.length,
      marked:  mark_used ? lines.length : 0,
    }, `${lines.length} accounts chưa dùng`);

  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/accounts/bulk-delete
 * Xóa vĩnh viễn danh sách accounts theo IDs.
 * Body: { ids: [1, 2, 3] }
 */
const bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, 'Cần truyền mảng ids không rỗng', 400);
    }
    if (ids.length > 500) {
      return error(res, 'Tối đa 500 accounts mỗi lần xóa', 400);
    }

    const deleted = await Account.destroy({
      where: scopedWhere(req, { id: { [Op.in]: ids } }),
    });

    logger.info('Bulk delete', {
      requested: ids.length, deleted, admin: req.admin?.username,
    });

    return success(res, { deleted }, `Đã xóa ${deleted} accounts`);
  } catch (err) {
    next(err);
  }
};

module.exports = { bulkAction, bulkGet, copyUnused, bulkDelete };
