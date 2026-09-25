const { Op, literal } = require('sequelize');
const sequelize = require('../config/database');
const EmailOtpOrder = require('../models/EmailOtpOrder');
const EmailOtpDeviceUse = require('../models/EmailOtpDeviceUse');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');

const STATUSES = ['PENDING', 'PAUSED', 'DONE'];
const LOCK_TIMEOUT_MIN = parseInt(process.env.EMAIL_OTP_LOCK_TIMEOUT_MIN, 10) || 30;

const nullify = (value) => {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized.toLowerCase() === 'null' ? null : normalized;
};
const normalizeSite = (value) => nullify(value)?.toUpperCase() || null;
const normalizeStatus = (value, fallback = 'PENDING') => {
  const status = String(value || fallback).trim().toUpperCase();
  return STATUSES.includes(status) ? status : fallback;
};
const normalizeEmail = (value) => {
  const raw = nullify(value);
  if (!raw) return null;
  const mailto = raw.match(/mailto:([^\s)]+)/i);
  const candidate = (mailto?.[1] || raw).replace(/^<|>$/g, '').trim().toLowerCase();
  const match = candidate.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};
const normalizePositiveInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};
const otpValues = (value) => {
  if (Array.isArray(value)) return value.flatMap(otpValues);
  const text = nullify(value);
  if (!text) return [];
  return text.split(/[\r\n,|]+/).map((item) => item.trim()).filter(Boolean);
};
const appendOtpHistory = (existing, incoming) => {
  const values = [...otpValues(existing), ...otpValues(incoming)];
  return [...new Set(values)].join('\n') || null;
};
const payloadFromRequest = (req) => ({
  site: normalizeSite(req.body.site || req.query.site),
  gmail: normalizeEmail(req.body.gmail || req.body.email || req.query.gmail || req.query.email),
  order_id: nullify(req.body.id_oder || req.body.id_order || req.body.order_id || req.query.id_oder || req.query.id_order || req.query.order_id),
  otp_history: req.body.otp_history ?? req.body.otp ?? req.query.otp_history ?? req.query.otp,
  solan: normalizePositiveInt(req.body.solan ?? req.body.use_count ?? req.query.solan ?? req.query.use_count, 0),
  device_id: nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may),
});
const serialize = (row) => {
  const data = row?.toJSON ? row.toJSON() : { ...row };
  data.id_oder = data.order_id;
  data.solan = Number(data.use_count) || 0;
  return data;
};

const saveReport = async ({ owner_username, payload, source = 'PURCHASED' }) => {
  if (!payload.site) throw Object.assign(new Error('Can truyen site'), { statusCode: 400 });
  if (!payload.gmail) throw Object.assign(new Error('Gmail khong hop le'), { statusCode: 400 });
  if (!payload.order_id) throw Object.assign(new Error('Can truyen id_oder'), { statusCode: 400 });

  return sequelize.transaction(async (transaction) => {
    const [foundOrder, created] = await EmailOtpOrder.findOrCreate({
      where: { owner_username, site: payload.site, order_id: payload.order_id },
      defaults: {
        owner_username,
        site: payload.site,
        gmail: payload.gmail,
        order_id: payload.order_id,
        otp_history: appendOtpHistory(null, payload.otp_history),
        use_count: 0,
        status: 'PENDING',
        source_device_id: payload.device_id,
        last_used_at: payload.device_id ? new Date() : null,
      },
      transaction,
    });
    const order = await EmailOtpOrder.findByPk(foundOrder.id, { transaction, lock: transaction.LOCK.UPDATE });

    let newDeviceUse = false;
    if (payload.device_id) {
      const [, useCreated] = await EmailOtpDeviceUse.findOrCreate({
        where: { email_order_id: order.id, device_id: payload.device_id },
        defaults: {
          owner_username,
          email_order_id: order.id,
          device_id: payload.device_id,
          otp: nullify(payload.otp_history),
          source,
          used_at: new Date(),
        },
        transaction,
      });
      newDeviceUse = useCreated;
      if (!useCreated && payload.otp_history) {
        await EmailOtpDeviceUse.update({ otp: nullify(payload.otp_history), used_at: new Date() }, {
          where: { email_order_id: order.id, device_id: payload.device_id }, transaction,
        });
      }
    }

    // So lan duoc tinh theo so request bao cao: ban ghi moi = 1, moi lan gui lai +1.
    const nextCount = (Number(order.use_count) || 0) + 1;
    const refreshOwnLock = payload.device_id && order.locked_by === payload.device_id;
    await order.update({
      gmail: payload.gmail,
      otp_history: appendOtpHistory(order.otp_history, payload.otp_history),
      use_count: nextCount,
      status: 'PENDING',
      source_device_id: order.source_device_id || payload.device_id,
      ...(payload.device_id ? { last_used_at: new Date() } : {}),
      ...(refreshOwnLock ? { locked_at: new Date() } : {}),
    }, { transaction });
    return { order, created, new_device_use: newDeviceUse };
  });
};

const reportFromPhone = async (req, res, next) => {
  try {
    const payload = payloadFromRequest(req);
    if (!payload.device_id) return error(res, 'Can truyen device_id de tranh may lay lai Email da dung', 400);
    const result = await saveReport({ owner_username: ownerFromRequest(req), payload });
    return success(res, {
      email: serialize(result.order),
      created: result.created,
      first_use_on_device: result.new_device_use,
    }, result.created ? 'Da ghi Email OTP vao trang thai Pending' : 'Da cap nhat Email OTP');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const createFromDashboard = async (req, res, next) => {
  try {
    const result = await saveReport({ owner_username: ownerFromAdmin(req), payload: payloadFromRequest(req) });
    return success(res, { email: serialize(result.order), created: result.created }, result.created ? 'Da them Email OTP' : 'Da cap nhat Email OTP');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getForPhone = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id || req.body.device || req.body.phone || req.body.may || req.query.device_id || req.query.device || req.query.phone || req.query.may);
    if (!device_id) {
      await transaction.rollback();
      return error(res, 'Can truyen device_id', 400);
    }

    const now = new Date();
    const expiredAt = new Date(now.getTime() - LOCK_TIMEOUT_MIN * 60 * 1000);
    await EmailOtpOrder.update({ locked_by: null, locked_at: null }, {
      where: { owner_username, status: 'PENDING', locked_at: { [Op.lt]: expiredAt } },
      transaction,
    });

    // May goi lai trong thoi gian lock luon nhan dung Email dang su dung.
    const active = await EmailOtpOrder.findOne({
      where: { owner_username, status: 'PENDING', locked_by: device_id },
      order: [['locked_at', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (active) {
      await active.update({ locked_at: now, last_used_at: now }, { transaction });
      await transaction.commit();
      return success(res, {
        email: serialize(active),
        device_id,
        resumed: true,
        lock_timeout_min: LOCK_TIMEOUT_MIN,
      }, 'Tiep tuc Email OTP Pending dang lock');
    }

    const escapedDevice = sequelize.escape(device_id);
    const order = await EmailOtpOrder.findOne({
      where: {
        owner_username,
        status: 'PENDING',
        locked_by: null,
        [Op.and]: literal(`NOT EXISTS (SELECT 1 FROM email_otp_device_uses AS used_email WHERE used_email.email_order_id = EmailOtpOrder.id AND used_email.device_id = ${escapedDevice})`),
      },
      order: [['last_used_at', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });

    if (!order) {
      await transaction.commit();
      return success(res, { email: null, device_id, resumed: false }, 'Khong con Email Pending kha dung cho may nay');
    }

    await EmailOtpDeviceUse.create({
      owner_username,
      email_order_id: order.id,
      device_id,
      source: 'CLAIMED',
      used_at: now,
    }, { transaction });
    await order.update({ locked_by: device_id, locked_at: now, last_used_at: now }, { transaction });
    await transaction.commit();

    return success(res, {
      email: serialize(order),
      device_id,
      resumed: false,
      lock_timeout_min: LOCK_TIMEOUT_MIN,
    }, 'Lay Email OTP Pending thanh cong');
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};
const list = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const where = { owner_username };
    const status = normalizeStatus(req.query.status, '');
    if (status) where.status = status;
    const q = nullify(req.query.q);
    if (q) where[Op.or] = [
      { gmail: { [Op.like]: `%${q}%` } },
      { site: { [Op.like]: `%${q}%` } },
      { order_id: { [Op.like]: `%${q}%` } },
      { source_device_id: { [Op.like]: `%${q}%` } },
    ];

    const [result, countRows] = await Promise.all([
      EmailOtpOrder.findAndCountAll({
        attributes: {
          include: [
            [literal('(SELECT COUNT(*) FROM email_otp_device_uses AS eu WHERE eu.email_order_id = EmailOtpOrder.id)'), 'used_device_count'],
            [literal('(SELECT GROUP_CONCAT(eu.device_id ORDER BY eu.used_at SEPARATOR ", ") FROM email_otp_device_uses AS eu WHERE eu.email_order_id = EmailOtpOrder.id)'), 'used_devices'],
          ],
        },
        where,
        order: [['updated_at', 'DESC'], ['id', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      }),
      EmailOtpOrder.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { owner_username }, group: ['status'], raw: true,
      }),
    ]);
    const status_counts = Object.fromEntries(STATUSES.map((item) => [item, 0]));
    countRows.forEach((row) => { status_counts[row.status] = Number(row.count) || 0; });
    return success(res, {
      emails: result.rows.map(serialize),
      status_counts,
      pagination: { page, limit, total: result.count, totalPages: Math.ceil(result.count / limit) || 1 },
    }, 'Lay danh sach Email OTP thanh cong');
  } catch (err) { next(err); }
};

const bulkStatus = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean))] : [];
    const status = normalizeStatus(req.body.status, '');
    if (!ids.length) return error(res, 'Can chon Email', 400);
    if (!status) return error(res, 'Trang thai khong hop le', 400);
    const [affected] = await EmailOtpOrder.update({ status, locked_by: null, locked_at: null }, { where: { id: { [Op.in]: ids }, owner_username: ownerFromAdmin(req) } });
    return success(res, { affected }, `Da cap nhat ${affected} Email sang ${status}`);
  } catch (err) { next(err); }
};

const bulkDelete = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean))] : [];
    const owner_username = ownerFromAdmin(req);
    if (!ids.length) {
      await transaction.rollback();
      return error(res, 'Can chon Email', 400);
    }
    const rows = await EmailOtpOrder.findAll({ attributes: ['id'], where: { id: { [Op.in]: ids }, owner_username }, transaction });
    const allowedIds = rows.map((row) => row.id);
    await EmailOtpDeviceUse.destroy({ where: { email_order_id: { [Op.in]: allowedIds }, owner_username }, transaction });
    const deleted = await EmailOtpOrder.destroy({ where: { id: { [Op.in]: allowedIds }, owner_username }, transaction });
    await transaction.commit();
    return success(res, { deleted }, `Da xoa ${deleted} Email OTP`);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

module.exports = { reportFromPhone, getForPhone, list, createFromDashboard, bulkStatus, bulkDelete };