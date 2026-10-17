const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const originalDbName = process.env.DB_NAME;
const testDbName = `quanly_reg_proxy_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const manager = new Sequelize('', process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  logging: false,
});

let db;
let server;
let created = false;
const results = [];
const check = async (name, work) => {
  await work();
  results.push({ name, status: 'PASS' });
};

const makeDevice = (DashboardDevice, owner, deviceId) => DashboardDevice.create({
  owner_username: owner,
  device_id: deviceId,
  device_name: deviceId,
  reported_status: 'IDLE',
  last_seen: new Date(),
});

(async () => {
  await manager.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4`);
  created = true;
  process.env.DB_NAME = testDbName;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

  db = require('../src/config/database');
  require('../src/models');
  await db.sync({ force: false, alter: false, logging: false });
  const migration = require('../src/services/regProxyLeaseMigration');
  await migration.up();
  await migration.up();

  const User = require('../src/models/User');
  const DashboardDevice = require('../src/models/DashboardDevice');
  const RegProxyLease = require('../src/models/RegProxyLease');
  const settings = require('../src/services/settingsService');
  const leases = require('../src/services/regProxyLeaseService');

  const users = {};
  for (const owner of ['proxy_owner_a', 'proxy_owner_b', 'proxy_owner_same_ip', 'proxy_owner_private', 'proxy_owner_http']) {
    users[owner] = await User.create({ username: owner, password_hash: 'synthetic', role: 'user' });
  }
  for (const [owner, deviceIds] of Object.entries({
    proxy_owner_a: ['phone-a1', 'phone-a2', 'phone-a3'],
    proxy_owner_b: ['phone-b1'],
    proxy_owner_same_ip: ['phone-s1', 'phone-s2'],
    proxy_owner_private: ['phone-private'],
    proxy_owner_http: ['phone-http'],
  })) {
    for (const id of deviceIds) await makeDevice(DashboardDevice, owner, id);
  }

  const exitByPort = {
    '8101': '192.0.2.101',
    '8102': '192.0.2.102',
    '8201': '198.51.100.101',
    '8301': '203.0.113.101',
    '8302': '203.0.113.101',
    '8401': '198.51.100.201',
  };
  const fixtureHealthCheck = async (candidate) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const port = new URL(candidate.url).port;
    const exitIp = exitByPort[port];
    return exitIp ? { ok: true, exit_ip: exitIp } : { ok: false, code: 'FIXTURE_PROXY_DOWN' };
  };
  leases._setHealthCheckForTests(fixtureHealthCheck);

  await check('REG checker uses SOCKS5 with pinned proxy host and remote destination DNS', async () => {
    const axios = require('axios');
    const originalGet = axios.get;
    const { SocksProxyAgent } = require('socks-proxy-agent');
    for (const input of ['192.0.2.10:8101', '192.0.2.10:8101:fixture-user:fixture-pass', 'fixture-user:fixture-pass@192.0.2.10:8101', 'socks5://fixture-user:fixture-pass@192.0.2.10:8101']) {
      const candidate = leases.normalizeCandidate(input);
      assert.ok(candidate.url.startsWith('socks5h://'));
      assert.equal(candidate.key, leases.normalizeCandidate(candidate.url).key);
    }
    await settings.saveRegProxySettings('proxy_owner_a', { proxies: ['192.0.2.10:8101:fixture-user:fixture-pass'] });
    let calls = 0;
    axios.get = async (_url, options) => {
      calls += 1;
      assert.ok(options.httpsAgent instanceof SocksProxyAgent);
      assert.equal(options.httpsAgent.proxy.type, 5);
      assert.equal(options.httpsAgent.proxy.host, '192.0.2.10');
      assert.equal(options.httpsAgent.proxy.userId, 'fixture-user');
      assert.equal(options.httpsAgent.proxy.password, 'fixture-pass');
      assert.equal(options.httpsAgent.shouldLookup, false);
      assert.equal(options.proxy, false);
      assert.equal(options.maxRedirects, 0);
      return { data: { ip: '192.0.2.101' } };
    };
    leases._setHealthCheckForTests(null);
    try {
      const allocated = await leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a1' });
      assert.equal(calls, 1);
      await leases.releaseActiveForDevice({ owner: 'proxy_owner_a', deviceId: 'phone-a1' });
      assert.equal(allocated.proxy_exit_ip, '192.0.2.101');
    } finally {
      axios.get = originalGet;
      leases._setHealthCheckForTests(fixtureHealthCheck);
    }
  });

  await settings.saveRegProxySettings('proxy_owner_a', {
    proxies: ['192.0.2.10:8101', '192.0.2.11:8102'],
  });
  await check('concurrent phones receive different proxy and exit IP', async () => {
    const [first, second] = await Promise.all([
      leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a1' }),
      leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a2' }),
    ]);
    assert.notEqual(first.proxy, second.proxy);
    assert.notEqual(first.proxy_exit_ip, second.proxy_exit_ip);
    assert.equal(await RegProxyLease.count({ where: { owner_username: 'proxy_owner_a', status: 'IN_USE' } }), 2);
  });

  await check('allocate retry reuses the same session', async () => {
    const first = await leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a1' });
    const second = await leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a1' });
    assert.equal(first.session_id, second.session_id);
    assert.equal(second.reused, true);
  });

  await check('pool exhaustion never steals an active proxy', async () => {
    await assert.rejects(
      () => leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a3' }),
      (error) => error.code === 'PROXY_UNAVAILABLE',
    );
  });

  await check('session token protects explicit release', async () => {
    const active = await leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a1' });
    await assert.rejects(
      () => leases.release({ owner: 'proxy_owner_a', deviceId: 'phone-a1', sessionId: active.session_id, token: 'wrong' }),
      (error) => error.code === 'LEASE_ACCESS_DENIED',
    );
    const released = await leases.release({
      owner: 'proxy_owner_a',
      deviceId: 'phone-a1',
      sessionId: active.session_id,
      token: active.session_token,
    });
    assert.equal(released.already_released, false);
    const repeated = await leases.release({
      owner: 'proxy_owner_a',
      deviceId: 'phone-a1',
      sessionId: active.session_id,
      token: active.session_token,
    });
    assert.equal(repeated.already_released, true);
    const next = await leases.allocate({ owner: 'proxy_owner_a', deviceId: 'phone-a3' });
    assert.equal(next.proxy, active.proxy);
  });

  await settings.saveRegProxySettings('proxy_owner_b', { proxies: ['192.0.2.20:8201'] });
  await check('lease uniqueness is isolated by owner', async () => {
    const allocated = await leases.allocate({ owner: 'proxy_owner_b', deviceId: 'phone-b1' });
    assert.equal(allocated.proxy_exit_ip, '198.51.100.101');
  });

  await check('successful REG report can release the active device lease', async () => {
    const active = await RegProxyLease.findOne({
      where: { owner_username: 'proxy_owner_b', active_device_id: 'phone-b1' },
    });
    const released = await leases.releaseActiveForDevice({
      owner: 'proxy_owner_b',
      deviceId: 'phone-b1',
      reason: 'REG_REPORT_COMPLETED',
    });
    assert.equal(released.released, true);
    const allocatedAgain = await leases.allocate({ owner: 'proxy_owner_b', deviceId: 'phone-b1' });
    assert.notEqual(allocatedAgain.session_id, active.session_id);
  });

  await settings.saveRegProxySettings('proxy_owner_same_ip', {
    proxies: ['192.0.2.30:8301', '192.0.2.31:8302'],
  });
  await check('different proxy endpoints cannot lease the same exit IP concurrently', async () => {
    const first = await leases.allocate({ owner: 'proxy_owner_same_ip', deviceId: 'phone-s1' });
    assert.equal(first.proxy_exit_ip, '203.0.113.101');
    await assert.rejects(
      () => leases.allocate({ owner: 'proxy_owner_same_ip', deviceId: 'phone-s2' }),
      (error) => error.code === 'PROXY_UNAVAILABLE',
    );
    assert.equal(await RegProxyLease.count({
      where: { owner_username: 'proxy_owner_same_ip', status: 'IN_USE' },
    }), 1);
  });

  await settings.saveRegProxySettings('proxy_owner_private', { proxies: ['127.0.0.1:8999'] });
  await check('proxy checker rejects private proxy hosts without making an outbound request', async () => {
    leases._setHealthCheckForTests(null);
    try {
      await assert.rejects(
        () => leases.allocate({ owner: 'proxy_owner_private', deviceId: 'phone-private' }),
        (error) => error.code === 'PROXY_UNAVAILABLE',
      );
    } finally {
      leases._setHealthCheckForTests(fixtureHealthCheck);
    }
  });

  await settings.saveRegProxySettings('proxy_owner_http', { proxies: ['192.0.2.40:8401'] });
  await check('phone HTTP allocate, REG report and idempotent release contract', async () => {
    const app = require('../src/app');
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (endpoint, body) => fetch(base + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'proxy_owner_http' },
      body: JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, body: await response.json(), headers: response.headers }));
    const allocated = await request('/proxy/allocate', { device_id: 'phone-http' });
    assert.equal(allocated.status, 200);
    assert.equal(allocated.body.success, true);
    assert.equal(allocated.body.proxy_exit_ip, '198.51.100.201');
    assert.equal(allocated.headers.get('cache-control'), 'no-store');
    const reported = await request('/facebook/reg/report', {
      device_id: 'phone-http',
      text: '1000000008401|fixture-password',
    });
    assert.equal(reported.status, 200);
    assert.equal('proxy_released' in reported.body.data, false);
    assert.equal('proxy_release_status' in reported.body.data, false);
    const stored = await RegProxyLease.findOne({ where: { session_id: allocated.body.session_id } });
    assert.equal(stored.status, 'RELEASED');
    assert.equal(stored.active_device_id, null);
    const heartbeat = await request('/proxy/heartbeat', { device_id: 'phone-http' });
    assert.equal(heartbeat.status, 404);
    const instagramLease = await request('/proxy/allocate', { device_id: 'phone-http' });
    const instagramReport = await request('/instagram/reg/report', {
      device_id: 'phone-http', text: 'fixture_proxy_ig|fixture-password',
    });
    assert.equal(instagramReport.status, 200);
    assert.equal('proxy_released' in instagramReport.body.data, false);
    assert.equal('proxy_release_status' in instagramReport.body.data, false);
    const igStored = await RegProxyLease.findOne({ where: { session_id: instagramLease.body.session_id } });
    assert.equal(igStored.status, 'RELEASED');
    const released = await request('/proxy/release', {
      device_id: 'phone-http',
      session_id: allocated.body.session_id,
      session_token: allocated.body.session_token,
      result: 'SUCCESS',
    });
    assert.equal(released.status, 200);
    assert.equal(released.body.status, 'ALREADY_RELEASED');
    await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  console.log(`Reg proxy leases: ${results.length} groups PASS`);
})()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    leasesReset();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.close();
    process.env.DB_NAME = originalDbName;
    if (created) {
      try { await manager.query(`DROP DATABASE \`${testDbName}\``); } catch (_) {}
    }
    await manager.close();
  });

function leasesReset() {
  try { require('../src/services/regProxyLeaseService')._setHealthCheckForTests(null); } catch (_) {}
}
