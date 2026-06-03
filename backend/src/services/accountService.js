/**
 * accountService.js
 * Core business logic for TikTok account management.
 *
 * Race-condition protection:
 *  - getUpvideo uses a MySQL transaction + SELECT FOR UPDATE SKIP LOCKED
 *    → requires MySQL 8.0+
 *  - All status transitions use bulk UPDATE (atomic at DB level)
 */

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Account = require('../models/Account');
const logger = require('../config/logger');

// ── Constants ────────────────────────────────────────────────────────────────
const LOCK_TIMEOUT_MIN    = parseInt(process.env.ACCOUNT_LOCK_TIMEOUT_MIN, 10) || 40;  // minutes before a lock expires
const CHO_UP_LOW_THRESHOLD = 10; // replenish CHO_UP from UP_FAIL when below this

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse pipe-separated raw string into account fields.
 * Format: username|password|email|email_pass
 * Ví dụ: tiktok_abc|Pass@123|abc@gmail.com|mailpass123
 */
const parseRawData = (rawStr) => {
  const parts = rawStr.split('|');
  return {
    username:   parts[0]?.trim() || null,
    password:   parts[1]?.trim() || null,
    email:      parts[2]?.trim() || null,
    email_pass: parts[3]?.trim() || null,
  };
};

/** Throw a structured error with an HTTP status code. */
const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const SORT_FIELDS = {
  video_count: 'video_count',
  followers:   'followers',
  following:   'following',
  reg_at:      'reg_at',
  created_at:  'created_at',
};

const buildSortOrder = (sort_by, sort_dir) => {
  const field = SORT_FIELDS[sort_by] || 'created_at';
  const dir = String(sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const order = [[field, dir]];
  if (field !== 'created_at') order.push(['created_at', 'DESC']);
  return order;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new TikTok account received from a phone.
 * Server sets: status, live_status, video_count, reg_at.
 * Does NOT accept timestamps from the phone.
 */
const regSubmit = async (body, owner_username) => {
  let accountData = {};

  if (body.data) {
    // Raw pipe-separated string
    accountData = { raw_data: body.data, ...parseRawData(body.data) };
  } else {
    // JSON fields
    accountData = {
      username:   body.username   || null,
      password:   body.password   || null,
      twofa:      body.twofa      || null,
      email:      body.email      || null,
      email_pass: body.email_pass || null,
      cookie:     body.cookie     || null,
      token:      body.token      || null,
      proxy:      body.proxy      || null,
      device_id:  body.device_id  || null,
    };
  }
  accountData.owner_username = owner_username || body.user || body.owner_username || process.env.ADMIN_USER || 'admin';

  // Guard: check duplicate username (username can be null → MySQL allows multiple NULLs)
  if (accountData.username) {
    const existing = await Account.findOne({
      where: { username: accountData.username, owner_username: accountData.owner_username },
      attributes: ['id'],
    });
    if (existing) {
      throw httpError(`Account "${accountData.username}" đã tồn tại trong hệ thống`, 409);
    }
  }

  const account = await Account.create({
    ...accountData,
    status:      'LOGIN_THANH_CONG',
    live_status: 'unknown',
    video_count: 0,
    reg_at:      new Date(),
  });

  logger.info('Account registered', { id: account.id, username: account.username });
  return account;
};

/**
 * Claim one UPVIDEO account for a phone.
 *
 * Uses SELECT … FOR UPDATE SKIP LOCKED inside a transaction so concurrent
 * phones never get the same account row — no application-level locking needed.
 *
 * Returns null when no eligible account is available.
 */
const getUpvideo = async (device_id, owner_username) => {
  return sequelize.transaction(async (t) => {
    const lockCutoff = new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000);

    const account = await Account.findOne({
      where: {
        status: 'LOGIN_THANH_CONG',
        video_count: { [Op.lt]: 20 },
        owner_username,
        [Op.or]: [
          { locked_by: null },
          { locked_at: { [Op.lt]: lockCutoff } },
        ],
      },
      order: [['reg_at', 'ASC']],
      lock: t.LOCK.UPDATE, // SELECT … FOR UPDATE
      skipLocked: true,    // SKIP LOCKED  — requires MySQL 8.0+
      transaction: t,
    });

    if (!account) return null;

    await account.update(
      { locked_by: device_id, locked_at: new Date() },
      { transaction: t }
    );

    return account;
  });
};

/**
 * Mark an upload as successful.
 * Increments video_count (or sets it explicitly), updates last_upload_at, clears lock.
 */
const uploadSuccess = async (username, device_id, video_count, owner_username) => {
  const account = await Account.findOne({ where: { username, owner_username } });
  if (!account) throw httpError('Account không tồn tại', 404);

  const newCount =
    video_count !== undefined && video_count !== null
      ? parseInt(video_count)
      : account.video_count + 1;

  await account.update({
    video_count:    newCount,
    status:         'LOGIN_THANH_CONG',
    last_upload_at: new Date(),
    device_id,
    locked_by:      null,
    locked_at:      null,
  });

  return account;
};

/**
 * Mark an upload as failed → status UPVIDEO_FAIL, clear lock.
 */
const uploadFail = async (username, device_id, reason, owner_username) => {
  const account = await Account.findOne({ where: { username, owner_username } });
  if (!account) throw httpError('Account không tồn tại', 404);

  await account.update({
    status:      'LOGIN_THANH_CONG',   // upload fail → về lại Upload Thành Công
    fail_reason: reason || null,
    device_id,
    locked_by:   null,
    locked_at:   null,
  });

  return account;
};

/**
 * Update live status from an external check.
 */
const updateLive = async (username, live_status, owner_username) => {
  const account = await Account.findOne({ where: { username, owner_username } });
  if (!account) throw httpError('Account không tồn tại', 404);

  await account.update({
    live_status,
    last_live_check_at: new Date(),
  });

  return account;
};

/**
 * List accounts with flexible filtering and pagination.
 */
const getAccounts = async (query, ownerFilter = null) => {
  const {
    status, live_status, device_id, search,
    date_from, date_to, video_min, video_max,
    sort_by, sort_dir,
    page  = 1,
    limit = 20,
  } = query;

  const where = {};

  if (ownerFilter) where.owner_username = ownerFilter;
  if (status)      where.status      = status;
  if (live_status) where.live_status = live_status;
  if (device_id)   where.device_id   = device_id;
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

  const pageNum  = Math.max(1, parseInt(page)  || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset   = (pageNum - 1) * limitNum;

  const { count, rows } = await Account.findAndCountAll({
    where,
    order: buildSortOrder(sort_by, sort_dir),
    limit:  limitNum,
    offset,
  });

  return {
    accounts: rows,
    pagination: {
      total:      count,
      page:       pageNum,
      limit:      limitNum,
      pages:      Math.ceil(count / limitNum),
      totalPages: Math.ceil(count / limitNum),
    },
  };
};

/**
 * Get a single account by PK.
 */
const getAccountById = async (id, ownerFilter = null) => {
  const where = { id };
  if (ownerFilter) where.owner_username = ownerFilter;
  const account = await Account.findOne({ where });
  if (!account) throw httpError('Account không tồn tại', 404);
  return account;
};

/**
 * Manual update from the dashboard (note, status, live_status, proxy, device_id).
 */
const updateAccount = async (id, data, ownerFilter = null) => {
  const where = { id };
  if (ownerFilter) where.owner_username = ownerFilter;
  const account = await Account.findOne({ where });
  if (!account) throw httpError('Account không tồn tại', 404);

  const allowed = ['note', 'status', 'live_status', 'proxy', 'device_id'];
  const updateData = {};
  allowed.forEach((field) => {
    if (data[field] !== undefined) updateData[field] = data[field];
  });

  await account.update(updateData);
  return account;
};

// ── Cron logic ────────────────────────────────────────────────────────────────

/**
 * Auto status transition — called every 5 minutes by the cron scheduler.
 *
 * Order matters:
 *  1. Unlock expired locks
 *  2. Die accounts → DIE
 *  3. REG_DA_LAM (soaked + live) → UPVIDEO
 *  4. UPVIDEO (goal reached) → DAT_CHI_TIEU
 *  5. Replenish UPVIDEO from UPVIDEO_FAIL when count is low
 */
const runStatusTransitions = async () => {
  const now = new Date();
  try {
    // ── Step 1: Unlock timed-out locks ──────────────────────────────────
    const lockCutoff = new Date(now - LOCK_TIMEOUT_MIN * 60 * 1000);
    const [unlocked] = await Account.update(
      { locked_by: null, locked_at: null },
      { where: { locked_by: { [Op.ne]: null }, locked_at: { [Op.lt]: lockCutoff } } }
    );
    if (unlocked > 0) logger.info(`CRON: unlocked ${unlocked} expired locks`);

    // ── Step 2: live_status = die → ACC_DIE ────────────────────────────
    const [died] = await Account.update(
      { status: 'ACC_DIE' },
      { where: { live_status: 'die', status: { [Op.ne]: 'ACC_DIE' } } }
    );
    if (died > 0) logger.info(`CRON: ${died} accounts → ACC_DIE`);
  } catch (err) {
    logger.error('CRON runStatusTransitions error', { error: err.message, stack: err.stack });
  }
};

module.exports = {
  regSubmit,
  getUpvideo,
  uploadSuccess,
  uploadFail,
  updateLive,
  getAccounts,
  getAccountById,
  updateAccount,
  runStatusTransitions,
};
