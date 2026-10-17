const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { Op, Transaction } = require('sequelize');
const sequelize = require('../config/database');
const DashboardDevice = require('../models/DashboardDevice');
const DeviceTaskRun = require('../models/DeviceTaskRun');
const RegProxyLease = require('../models/RegProxyLease');
const { getRegProxySettings } = require('./settingsService');
const { parseProxy } = require('../utils/checkLiveUtils');
const { publicIp } = require('./deviceManagerSecurity');
const { getJwtSecret } = require('../config/jwt');

const ACTIVE_STATUSES = ['RESERVED', 'IN_USE'];
const FINAL_STATUSES = ['RELEASED', 'FAILED', 'EXPIRED'];

const failure = (code, statusCode = 400, details = {}) =>
  Object.assign(new Error(code), { code, statusCode, details });

const cleanText = (value, max = 255) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'null'
    ? normalized.slice(0, max)
    : null;
};

const leaseTtlMs = () => {
  const seconds = Number(process.env.REG_PROXY_LEASE_TTL_SECONDS);
  const safeSeconds = Number.isInteger(seconds) ? Math.min(Math.max(seconds, 60), 86400) : 1800;
  return safeSeconds * 1000;
};

const checkTimeoutMs = () => {
  const value = Number(process.env.REG_PROXY_CHECK_TIMEOUT_MS);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1000), 30000) : 8000;
};

const maxChecksPerAllocate = () => {
  const value = Number(process.env.REG_PROXY_MAX_CHECKS_PER_ALLOCATE);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), 10) : 2;
};

const proxyKey = (proxyUrl) => crypto.createHash('sha256').update(proxyUrl).digest('hex');

const normalizeCandidate = (raw) => {
  const value = String(raw || '').trim();
  const parsed = /^socks5h?:\/\//i.test(value) ? value : parseProxy(value);
  if (!parsed) return null;
  try {
    const url = new URL(parsed);
    const authority = parsed.match(/^(?:https?|socks5h?):\/\/([^/?#]+)/i)?.[1] || '';
    const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
    const portText = url.port || hostPort.match(/:(\d+)$/)?.[1];
    if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) || !url.hostname || !portText) return null;
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    // Reg proxies always use SOCKS5, including legacy host:port settings.
    const normalized = `socks5h://${url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : ''}${url.hostname}:${port}`;
    return { raw: value, url: normalized, key: proxyKey(normalized), hostname: url.hostname.replace(/^\[|\]$/g, '') };
  } catch (_) {
    return null;
  }
};

const safeProxyLookup = async (candidate) => {
  if (net.isIP(candidate.hostname)) {
    return publicIp(candidate.hostname)
      ? { address: candidate.hostname, family: net.isIP(candidate.hostname) }
      : null;
  }
  let addresses;
  try {
    addresses = await dns.lookup(candidate.hostname, { all: true, verbatim: true });
  } catch (_) {
    return null;
  }
  if (!addresses.length || addresses.some((entry) => !publicIp(entry.address))) return null;
  return addresses[0];
};

const parseExitIp = (data) => {
  if (typeof data === 'string') {
    const value = data.trim();
    if (publicIp(value)) return value;
    try { return parseExitIp(JSON.parse(value)); } catch (_) { return null; }
  }
  for (const value of [data?.ip, data?.query, data?.origin]) {
    const candidate = String(value || '').split(',')[0].trim();
    if (publicIp(candidate)) return candidate;
  }
  return null;
};

const defaultHealthCheck = async (candidate) => {
  const rawCheckUrl = process.env.REG_PROXY_CHECK_URL || 'https://api.ipify.org?format=json';
  let checkUrl;
  try {
    checkUrl = new URL(rawCheckUrl);
  } catch (_) {
    return { ok: false, code: 'CHECK_URL_INVALID' };
  }
  if (checkUrl.protocol !== 'https:') return { ok: false, code: 'CHECK_URL_INVALID' };
  try {
    const resolved = await safeProxyLookup(candidate);
    if (!resolved) return { ok: false, code: 'PROXY_HOST_NOT_PUBLIC' };
    const pinnedUrl = new URL(candidate.url);
    pinnedUrl.hostname = resolved.family === 6 ? `[${resolved.address}]` : resolved.address;
    const agent = new SocksProxyAgent(pinnedUrl, { timeout: checkTimeoutMs() });
    const response = await axios.get(checkUrl.toString(), {
      httpsAgent: agent,
      proxy: false,
      timeout: checkTimeoutMs(),
      maxRedirects: 0,
      maxContentLength: 64 * 1024,
      maxBodyLength: 64 * 1024,
      validateStatus: (status) => status === 200,
      headers: { Accept: 'application/json,text/plain;q=0.9' },
    });
    const exitIp = parseExitIp(response.data);
    return exitIp ? { ok: true, exit_ip: exitIp } : { ok: false, code: 'EXIT_IP_NOT_RECEIVED' };
  } catch (_) {
    return { ok: false, code: 'PROXY_CHECK_FAILED' };
  }
};

let healthCheck = defaultHealthCheck;

const sessionToken = (row) => crypto
  .createHmac('sha256', process.env.REG_PROXY_SESSION_SECRET || getJwtSecret())
  .update(`${row.owner_username}|${row.device_id}|${row.session_id}`)
  .digest('base64url');

const validSessionToken = (row, token) => {
  const expected = Buffer.from(sessionToken(row));
  const supplied = Buffer.from(String(token || ''));
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

const expireStale = async (owner) => RegProxyLease.update({
  status: 'EXPIRED',
  active_device_id: null,
  active_proxy_key: null,
  active_exit_ip: null,
  released_at: new Date(),
  release_reason: 'LEASE_TIMEOUT',
}, {
  where: {
    owner_username: owner,
    status: { [Op.in]: ACTIVE_STATUSES },
    expires_at: { [Op.lt]: new Date() },
  },
});

const ensureOwnedDevice = async (owner, deviceId, transaction = null, lock = null) => {
  const row = await DashboardDevice.findOne({
    where: { owner_username: owner, device_id: deviceId },
    transaction,
    ...(lock ? { lock } : {}),
  });
  if (!row) throw failure('DEVICE_NOT_FOUND', 404);
  return row;
};

const validateTask = async (owner, deviceId, taskId) => {
  if (taskId == null || taskId === '') return null;
  const id = Number(taskId);
  if (!Number.isSafeInteger(id) || id <= 0) throw failure('TASK_ID_INVALID', 400);
  const task = await DeviceTaskRun.findOne({
    where: {
      id,
      owner_username: owner,
      device_id: deviceId,
      locked_by: deviceId,
      status: { [Op.in]: ['RUNNING', 'REPORTING'] },
    },
  });
  if (!task) throw failure('TASK_NOT_OWNED_BY_DEVICE', 409);
  return id;
};

const configuredCandidates = async (owner) => {
  const settings = await getRegProxySettings(owner);
  const seen = new Set();
  const candidates = [];
  let invalidCount = 0;
  for (const raw of settings.proxies || []) {
    const candidate = normalizeCandidate(raw);
    if (!candidate) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    candidates.push(candidate);
  }
  return { candidates, invalidCount, configuredCount: (settings.proxies || []).length };
};

const candidateForLease = (candidates, lease) => candidates.find((item) => item.key === lease.proxy_key);

const serializeLease = (lease, candidate, reused = false) => ({
  status: reused ? 'LEASE_REUSED' : 'ALLOCATED',
  proxy: candidate.raw,
  proxy_exit_ip: lease.exit_ip,
  session_id: lease.session_id,
  session_token: sessionToken(lease),
  lease_status: lease.status,
  expires_at: lease.expires_at,
  reused,
});

const markFailed = async (leaseId, reason) => {
  await RegProxyLease.update({
    status: 'FAILED',
    active_device_id: null,
    active_proxy_key: null,
    active_exit_ip: null,
    released_at: new Date(),
    release_reason: cleanText(reason, 100) || 'PROXY_CHECK_FAILED',
  }, {
    where: { id: leaseId, status: { [Op.in]: ACTIVE_STATUSES } },
  });
};

const reserveCandidate = async ({ owner, deviceId, taskId, candidate }) => {
  try {
    return await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
      await ensureOwnedDevice(owner, deviceId, transaction, transaction.LOCK.UPDATE);
      const existing = await RegProxyLease.findOne({
        where: { owner_username: owner, active_device_id: deviceId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing) return { existing };
      const now = new Date();
      const lease = await RegProxyLease.create({
        owner_username: owner,
        device_id: deviceId,
        task_id: taskId,
        proxy_key: candidate.key,
        session_id: crypto.randomUUID(),
        status: 'RESERVED',
        active_device_id: deviceId,
        active_proxy_key: candidate.key,
        active_exit_ip: null,
        allocated_at: now,
        last_heartbeat_at: now,
        expires_at: new Date(now.getTime() + leaseTtlMs()),
      }, { transaction });
      return { lease };
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return { collision: true };
    throw error;
  }
};

const activateLease = async (leaseId, exitIp) => {
  try {
    return await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
      const lease = await RegProxyLease.findByPk(leaseId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lease || lease.status !== 'RESERVED') throw failure('LEASE_NOT_RESERVED', 409);
      await lease.update({
        status: 'IN_USE',
        exit_ip: exitIp,
        active_exit_ip: exitIp,
        last_heartbeat_at: new Date(),
      }, { transaction });
      return lease;
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return null;
    throw error;
  }
};

const allocate = async ({ owner, deviceId, taskId = null }) => {
  const normalizedOwner = cleanText(owner, 100)?.toLowerCase();
  const normalizedDevice = cleanText(deviceId, 255);
  if (!normalizedOwner) throw failure('OWNER_REQUIRED', 401);
  if (!normalizedDevice) throw failure('DEVICE_ID_REQUIRED', 400);
  await ensureOwnedDevice(normalizedOwner, normalizedDevice);
  const normalizedTaskId = await validateTask(normalizedOwner, normalizedDevice, taskId);
  await expireStale(normalizedOwner);
  const { candidates, invalidCount, configuredCount } = await configuredCandidates(normalizedOwner);
  if (!configuredCount) throw failure('PROXY_POOL_EMPTY', 409, { retry_after_seconds: 15 });
  if (!candidates.length) throw failure('PROXY_CONFIGURATION_INVALID', 400, { invalid_proxy_count: invalidCount });

  const active = await RegProxyLease.findOne({
    where: { owner_username: normalizedOwner, active_device_id: normalizedDevice },
  });
  if (active) {
    if (active.status === 'RESERVED') throw failure('PROXY_ALLOCATION_PENDING', 409, { retry_after_seconds: 2 });
    const candidate = candidateForLease(candidates, active);
    if (!candidate) throw failure('ACTIVE_PROXY_REMOVED_FROM_SETTINGS', 409);
    return serializeLease(active, candidate, true);
  }

  const activeRows = await RegProxyLease.findAll({
    where: { owner_username: normalizedOwner, status: { [Op.in]: ACTIVE_STATUSES } },
    attributes: ['active_proxy_key'],
    raw: true,
  });
  const busyKeys = new Set(activeRows.map((row) => row.active_proxy_key).filter(Boolean));

  const start = candidates.length > 1 ? crypto.randomInt(candidates.length) : 0;
  const orderedCandidates = candidates.slice(start).concat(candidates.slice(0, start));
  let checkedCount = 0;
  for (const candidate of orderedCandidates) {
    if (checkedCount >= maxChecksPerAllocate()) break;
    if (busyKeys.has(candidate.key)) continue;
    const reserved = await reserveCandidate({
      owner: normalizedOwner,
      deviceId: normalizedDevice,
      taskId: normalizedTaskId,
      candidate,
    });
    if (reserved.existing) {
      if (reserved.existing.status === 'RESERVED') throw failure('PROXY_ALLOCATION_PENDING', 409, { retry_after_seconds: 2 });
      const existingCandidate = candidateForLease(candidates, reserved.existing);
      if (!existingCandidate) throw failure('ACTIVE_PROXY_REMOVED_FROM_SETTINGS', 409);
      return serializeLease(reserved.existing, existingCandidate, true);
    }
    if (!reserved.lease) continue;
    checkedCount += 1;

    let checked;
    try {
      checked = await healthCheck(candidate);
    } catch (_) {
      checked = { ok: false, code: 'PROXY_CHECK_FAILED' };
    }
    if (!checked?.ok || !publicIp(checked.exit_ip)) {
      await markFailed(reserved.lease.id, checked?.code || 'PROXY_CHECK_FAILED');
      continue;
    }
    const activated = await activateLease(reserved.lease.id, checked.exit_ip);
    if (!activated) {
      await markFailed(reserved.lease.id, 'EXIT_IP_ALREADY_IN_USE');
      continue;
    }
    return serializeLease(activated, candidate, false);
  }

  throw failure('PROXY_UNAVAILABLE', 409, {
    retry_after_seconds: 15,
    configured_proxy_count: configuredCount,
    invalid_proxy_count: invalidCount,
  });
};

const release = async ({ owner, deviceId, sessionId, token, result = 'SUCCESS', reason = null }) => {
  const normalizedOwner = cleanText(owner, 100)?.toLowerCase();
  const normalizedDevice = cleanText(deviceId, 255);
  const normalizedSession = cleanText(sessionId, 36);
  if (!normalizedDevice || !normalizedSession) throw failure('SESSION_INPUT_REQUIRED', 400);
  return sequelize.transaction(async (transaction) => {
    const lease = await RegProxyLease.findOne({
      where: { owner_username: normalizedOwner, session_id: normalizedSession },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lease) throw failure('LEASE_NOT_FOUND', 404);
    if (lease.device_id !== normalizedDevice || !validSessionToken(lease, token)) throw failure('LEASE_ACCESS_DENIED', 403);
    if (FINAL_STATUSES.includes(lease.status)) {
      return { status: 'ALREADY_RELEASED', session_id: lease.session_id, lease_status: lease.status, already_released: true };
    }
    const success = String(result || '').trim().toUpperCase() !== 'FAILED';
    const status = success ? 'RELEASED' : 'FAILED';
    await lease.update({
      status,
      active_device_id: null,
      active_proxy_key: null,
      active_exit_ip: null,
      released_at: new Date(),
      release_reason: cleanText(reason, 100) || (success ? 'PHONE_REPORTED_DONE' : 'PHONE_REPORTED_FAILED'),
    }, { transaction });
    return { status: 'RELEASED', session_id: lease.session_id, lease_status: status, already_released: false };
  });
};

const releaseActiveForDevice = async ({ owner, deviceId, reason = 'REG_REPORT_COMPLETED' }) => {
  const normalizedOwner = cleanText(owner, 100)?.toLowerCase();
  const normalizedDevice = cleanText(deviceId, 255);
  if (!normalizedOwner || !normalizedDevice) return { released: false };
  return sequelize.transaction(async (transaction) => {
    const lease = await RegProxyLease.findOne({
      where: { owner_username: normalizedOwner, active_device_id: normalizedDevice },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lease) return { released: false };
    await lease.update({
      status: 'RELEASED',
      active_device_id: null,
      active_proxy_key: null,
      active_exit_ip: null,
      released_at: new Date(),
      release_reason: cleanText(reason, 100),
    }, { transaction });
    return { released: true, session_id: lease.session_id };
  });
};

module.exports = {
  allocate,
  release,
  releaseActiveForDevice,
  expireStale,
  normalizeCandidate,
  _setHealthCheckForTests: (checker) => { healthCheck = checker || defaultHealthCheck; },
};
