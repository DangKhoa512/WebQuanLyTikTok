/**
 * importController.js
 * Bulk import accounts từ text.
 *
 * Hỗ trợ 2 định dạng trên mỗi dòng:
 *   1. Có datetime: "DD/MM/YYYY HH:MM:SS\tuser|pass|email|email_pass"
 *   2. Không datetime: "user|pass|email|email_pass"
 *
 * Giá trị "Null" / "null" / "" → null trong DB.
 * Bỏ qua username trùng (đã có trong DB).
 */
const { Op } = require('sequelize');
const Account  = require('../models/Account');
const AccountGroup = require('../models/AccountGroup');
const logger   = require('../config/logger');
const { success, error } = require('../utils/response');
const { ownerFromAdmin } = require('../utils/owner');

const VALID_STATUSES = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE'];

const nullify = (v) =>
  (!v || v.trim() === '' || v.trim().toLowerCase() === 'null') ? null : v.trim();

/**
 * Parse một dòng text → { username, password, email, email_pass, reg_at } | null
 */
const parseLine = (line) => {
  let dataPart = line;
  let reg_at   = null;

  // Detect datetime prefix: "DD/MM/YYYY HH:MM:SS\t..."
  const tabIdx = line.indexOf('\t');
  if (tabIdx > 0) {
    const prefix = line.substring(0, tabIdx).trim();
    const m = prefix.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
    );
    if (m) {
      const [, dd, MM, yyyy, hh, min, ss] = m;
      reg_at   = new Date(
        `${yyyy}-${MM.padStart(2,'0')}-${dd.padStart(2,'0')}` +
        `T${hh.padStart(2,'0')}:${min}:${ss}`
      );
      dataPart = line.substring(tabIdx + 1).trim();
    }
  }

  const parts    = dataPart.split('|');
  const username = nullify(parts[0]);
  if (!username) return null;

  return {
    username,
    password:   nullify(parts[1]),
    email:      nullify(parts[2]),
    email_pass: nullify(parts[3]),
    reg_at:     reg_at || new Date(),
  };
};

/**
 * POST /api/accounts/import
 * Body: { text: "...", status: "REG_DA_LAM" }
 */
const importAccounts = async (req, res, next) => {
  try {
    const { text, status = 'ACC_LOGIN', group_id } = req.body;
    const owner_username = ownerFromAdmin(req);

    if (!text || typeof text !== 'string') {
      return error(res, 'Thiếu trường text', 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return error(res, `status không hợp lệ. Dùng: ${VALID_STATUSES.join(', ')}`, 400);
    }
    const groupId = group_id ? parseInt(group_id, 10) : null;
    if (group_id && (!Number.isInteger(groupId) || groupId <= 0)) {
      return error(res, 'group_id khong hop le', 400);
    }
    if (groupId) {
      const group = await AccountGroup.findOne({
        where: { id: groupId, owner_username, account_type: 'app' },
      });
      if (!group) return error(res, 'Nhom import khong ton tai', 404);
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0)   return error(res, 'Không có dữ liệu', 400);
    if (lines.length > 2000)  return error(res, 'Tối đa 2000 dòng mỗi lần', 400);

    // ── Parse lines ──────────────────────────────────────────────────────────
    const parseErrors = [];
    const seenUsernames = new Map(); // de-dup within batch

    for (const line of lines) {
      try {
        const parsed = parseLine(line);
        if (!parsed) {
          parseErrors.push(`Thiếu username: "${line.substring(0, 60)}"`);
          continue;
        }
        if (!seenUsernames.has(parsed.username)) {
          seenUsernames.set(parsed.username, { ...parsed, status, owner_username, group_id: groupId });
        }
      } catch (_) {
        parseErrors.push(`Lỗi parse: "${line.substring(0, 60)}"`);
      }
    }

    const unique = [...seenUsernames.values()];

    // ── Filter out existing usernames ─────────────────────────────────────────
    let toInsert = unique;
    if (unique.length > 0) {
      const existing = await Account.findAll({
        where:      { username: { [Op.in]: unique.map((r) => r.username) }, owner_username },
        attributes: ['username'],
      });
      const existingSet = new Set(existing.map((r) => r.username));
      toInsert = unique.filter((r) => !existingSet.has(r.username));
    }

    // ── Bulk insert ───────────────────────────────────────────────────────────
    if (toInsert.length > 0) {
      await Account.bulkCreate(toInsert, {
        fields: ['username', 'password', 'email', 'email_pass', 'status', 'reg_at', 'owner_username', 'group_id'],
      });
    }

    const result = {
      imported:      toInsert.length,
      duplicates:    unique.length - toInsert.length,
      parse_errors:  parseErrors.length,
      error_samples: parseErrors.slice(0, 10),
    };

    logger.info('Import accounts', {
      ...result, status, group_id: groupId, owner_username, admin: req.admin?.username,
    });

    return success(
      res, result,
      `Đã import ${result.imported} accounts` +
      (result.duplicates   ? `, bỏ qua ${result.duplicates} trùng`   : '') +
      (result.parse_errors ? `, ${result.parse_errors} dòng lỗi`     : '')
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { importAccounts };
