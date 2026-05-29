const { Op } = require('sequelize');
const Account  = require('../models/Account');
const logger   = require('../config/logger');
const { scopedWhere } = require('../utils/owner');

const VALID_STATUSES = ['REG_DA_LAM', 'UPVIDEO', 'UPVIDEO_FAIL', 'DAT_CHI_TIEU', 'DIE', 'ALL'];

/**
 * GET /api/export/accounts
 *
 * Query params:
 *   status  = REG_DA_LAM | UPVIDEO | UPVIDEO_FAIL | DAT_CHI_TIEU | DIE | ALL
 *   format  = txt | csv | json   (default: txt)
 *   fields  = pipe | full        (txt mode: pipe = user|pass|mail|passmail, full = tất cả)
 *
 * Yêu cầu JWT (header Authorization: Bearer <token>)
 */
const exportAccounts = async (req, res) => {
  try {
    const status  = (req.query.status  || 'ALL').toUpperCase();
    const format  = (req.query.format  || 'txt').toLowerCase();
    const fields  = (req.query.fields  || 'pipe').toLowerCase();

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status không hợp lệ. Dùng: ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Build where clause
    const where = scopedWhere(req);
    if (status !== 'ALL') where.status = status;

    const accounts = await Account.findAll({
      where,
      order: [['reg_at', 'ASC']],
      attributes: [
        'id','username','password','email','email_pass',
        'twofa','cookie','token','proxy','device_id',
        'status','live_status','video_count',
        'reg_at','last_upload_at','fail_reason','note',
        'created_at',
      ],
    });

    const label    = status === 'ALL' ? 'all' : status.toLowerCase();
    const dateStr  = new Date().toISOString().slice(0,10);
    const count    = accounts.length;

    logger.info('Export requested', {
      status, format, fields, count,
      admin: req.admin?.username,
    });

    // ── JSON ──────────────────────────────────────────────────────────────────
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="accounts_${label}_${dateStr}.json"`
      );
      return res.json({ success: true, total: count, status, data: accounts });
    }

    // ── CSV ───────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const header = [
        'id','username','password','email','email_pass',
        'twofa','proxy','device_id',
        'status','live_status','video_count',
        'reg_at','last_upload_at','fail_reason','note',
      ].join(',');

      const rows = accounts.map((a) =>
        [
          a.id,
          csvEscape(a.username),
          csvEscape(a.password),
          csvEscape(a.email),
          csvEscape(a.email_pass),
          csvEscape(a.twofa),
          csvEscape(a.proxy),
          csvEscape(a.device_id),
          a.status,
          a.live_status,
          a.video_count,
          a.reg_at         ? a.reg_at.toISOString()         : '',
          a.last_upload_at ? a.last_upload_at.toISOString() : '',
          csvEscape(a.fail_reason),
          csvEscape(a.note),
        ].join(',')
      );

      const csv = [header, ...rows].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="accounts_${label}_${dateStr}.csv"`
      );
      // BOM cho Excel đọc được tiếng Việt
      return res.send('﻿' + csv);
    }

    // ── TXT (default) ─────────────────────────────────────────────────────────
    let lines;

    if (fields === 'pipe') {
      // Format phone: username|password|email|email_pass
      lines = accounts
        .filter((a) => a.username)
        .map((a) =>
          [
            a.username   || '',
            a.password   || '',
            a.email      || '',
            a.email_pass || '',
          ].join('|')
        );
    } else {
      // Full format: id|username|password|email|email_pass|status|live_status|video_count
      lines = accounts.map((a) =>
        [
          a.id,
          a.username    || '',
          a.password    || '',
          a.email       || '',
          a.email_pass  || '',
          a.status,
          a.live_status,
          a.video_count,
        ].join('|')
      );
    }

    const txt = lines.join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounts_${label}_${dateStr}.txt"`
    );
    return res.send(txt);

  } catch (err) {
    logger.error('Export error', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/export/summary
 * Trả về số lượng từng trạng thái (không cần download)
 */
const exportSummary = async (req, res) => {
  try {
    const rows = await Account.findAll({
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total'],
      ],
      group: ['status'],
      where: scopedWhere(req),
      raw: true,
    });

    const summary = {};
    rows.forEach((r) => { summary[r.status] = parseInt(r.total); });

    return res.json({ success: true, data: summary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const csvEscape = (val) => {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

module.exports = { exportAccounts, exportSummary };
