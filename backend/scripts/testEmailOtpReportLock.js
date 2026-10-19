const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const originalDb = process.env.DB_NAME;
const testDb = `quanly_email_lock_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const safeDb = () => /^quanly_email_lock_test_\d+_[a-f0-9]+$/.test(testDb) && testDb !== originalDb;
const manager = new Sequelize('', process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql', logging: false,
});
let db;
let server;
let created = false;
let passed = 0;

(async () => {
  assert(safeDb());
  await manager.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4`);
  created = true;
  process.env.DB_NAME = testDb;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  db = require('../src/config/database');
  const User = require('../src/models/User');
  const Order = require('../src/models/EmailOtpOrder');
  const Use = require('../src/models/EmailOtpDeviceUse');
  await db.sync({ force: false, alter: false });
  for (const owner of ['email_owner_a', 'email_owner_b']) {
    await User.create({ username: owner, password_hash: 'fixture-only', role: 'user' });
  }
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/email-otps', require('../src/routes/emailOtp'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (endpoint, body, owner = 'email_owner_a') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/email-otps/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': owner },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const payload = { site: 'FIXTURE', id_oder: 'fixture-order', gmail: 'fixture@example.com', device_id: 'phone-a', otp: '111111' };
  const seeded = await Order.create({ owner_username: 'email_owner_a', site: payload.site,
    order_id: payload.id_oder, gmail: payload.gmail, otp_history: '000000' });

  // Reproduce the actual phone sequence, not a direct call to the save helper.
  const claimed = await request('get', { device_id: 'phone-a' });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.data.email.id, seeded.id);
  assert.equal(claimed.body.data.email.locked_by, 'phone-a');
  const report = await request('report', payload);
  assert.equal(report.status, 200);
  assert.equal(report.body.data.email.locked_by, null);
  assert.equal(report.body.data.email.locked_at, null);
  assert.equal(report.body.data.email.status, 'PENDING');
  await seeded.reload();
  assert.equal(seeded.locked_by, null);
  assert.equal(seeded.use_count, 1);
  assert.equal(seeded.otp_history, '000000\n111111');
  assert.equal(await Use.count({ where: { email_order_id: seeded.id, device_id: 'phone-a' } }), 1);
  passed += 1;

  // A used email cannot be taken by the reporting phone again.
  const samePhone = await request('get', { device_id: 'phone-a' });
  assert.equal(samePhone.body.data.email, null);
  passed += 1;

  // Concurrent consumers can claim the released email only once.
  const claims = await Promise.all(['phone-b', 'phone-c'].map((device_id) => request('get', { device_id })));
  assert(claims.every((entry) => entry.status === 200));
  assert.equal(claims.filter((entry) => entry.body.data.email?.id === seeded.id).length, 1);
  await seeded.reload();
  const currentDevice = seeded.locked_by;
  const lockTime = seeded.locked_at.getTime();
  passed += 1;

  // Replayed reports from the old phone do not release the new phone's lock.
  assert.equal((await request('report', payload)).status, 200);
  await seeded.reload();
  assert.equal(seeded.locked_by, currentDevice);
  assert.equal(seeded.locked_at.getTime(), lockTime);
  passed += 1;

  // Identical order/device identifiers under another owner remain isolated.
  const otherOrder = await Order.create({ owner_username: 'email_owner_b', site: payload.site,
    order_id: payload.id_oder, gmail: payload.gmail, locked_by: currentDevice, locked_at: new Date() });
  const doneReport = await request('report', { ...payload, device_id: currentDevice, otp: '222222' });
  assert.equal(doneReport.status, 200);
  await seeded.reload();
  await otherOrder.reload();
  assert.equal(seeded.locked_by, null);
  assert.equal(otherOrder.locked_by, currentDevice);
  assert.equal(otherOrder.use_count, 0);
  passed += 1;

  // Validation failures must not unlock the current email.
  await seeded.update({ locked_by: 'phone-d', locked_at: new Date() });
  for (const body of [{ ...payload, device_id: 'phone-d', gmail: 'invalid' }, { ...payload, device_id: null }]) {
    assert.equal((await request('report', body)).status, 400);
    await seeded.reload();
    assert.equal(seeded.locked_by, 'phone-d');
  }
  passed += 1;

  // Legacy finalization still closes the email permanently.
  assert.equal((await request('report-done', { id: seeded.id, device_id: 'phone-d' })).status, 200);
  await seeded.reload();
  assert.equal(seeded.status, 'DONE');
  assert.equal(seeded.locked_by, null);
  assert.equal(seeded.locked_at, null);
  passed += 1;

  // First-time purchased email reports keep the existing create contract.
  const purchased = await request('report', { ...payload, id_oder: 'new-order', device_id: 'phone-new' });
  assert.equal(purchased.status, 200);
  assert.equal(purchased.body.data.created, true);
  assert.equal(purchased.body.data.email.status, 'PENDING');
  assert.equal(purchased.body.data.email.locked_by, null);
  assert.equal(purchased.body.data.email.solan, 1);
  passed += 1;

  // The fifth report closes the email atomically and removes its device lock.
  await Order.update({ status: 'PAUSED' }, { where: { owner_username: 'email_owner_a', status: 'PENDING' } });
  const capped = await Order.create({ owner_username: 'email_owner_a', site: payload.site,
    order_id: 'capped-order', gmail: 'capped@example.com', use_count: 3, locked_by: 'phone-cap', locked_at: new Date() });
  const capPayload = { ...payload, id_oder: capped.order_id, gmail: capped.gmail, device_id: 'phone-cap' };
  const fourth = await request('report', capPayload);
  assert.equal(fourth.body.data.email.solan, 4);
  assert.equal(fourth.body.data.email.status, 'PENDING');
  const capClaim = await request('get', { device_id: 'phone-cap-next' });
  assert.equal(capClaim.body.data.email.id, capped.id);
  const fifth = await request('report', { ...capPayload, device_id: 'phone-cap-next' });
  assert.equal(fifth.status, 200);
  assert.equal(fifth.body.data.email.solan, 5);
  assert.equal(fifth.body.data.email.status, 'DONE');
  assert.equal(fifth.body.data.email.locked_by, null);
  assert.equal(fifth.body.data.email.locked_at, null);
  assert.equal((await request('get', { device_id: 'phone-after-cap' })).body.data.email, null);
  passed += 1;

  // Concurrent late reports keep DONE and do not lose the request counter increments.
  const lateReports = await Promise.all([request('report', capPayload), request('report', capPayload)]);
  assert(lateReports.every((entry) => entry.status === 200 && entry.body.data.email.status === 'DONE'));
  await capped.reload();
  assert.equal(capped.use_count, 7);
  assert.equal(capped.locked_by, null);
  passed += 1;

  // Legacy PENDING data at/above five uses cannot be resumed or newly allocated.
  for (const [count, device] of [[5, 'phone-old'], [6, null]]) {
    const old = await Order.create({ owner_username: 'email_owner_a', site: payload.site,
      order_id: `old-${count}`, gmail: 'old@example.com', use_count: count,
      locked_by: device, locked_at: device ? new Date() : null });
    assert.equal((await request('get', { device_id: device || 'phone-fresh' })).body.data.email, null);
    await old.reload();
    assert.equal(old.status, 'DONE');
    assert.equal(old.locked_by, null);
    assert.equal(old.locked_at, null);
  }
  await otherOrder.reload();
  assert.equal(otherOrder.status, 'PENDING');
  assert.equal(otherOrder.locked_by, currentDevice);
  passed += 1;

  // A later report must not reopen an email explicitly finalized before five uses.
  assert.equal((await request('report', payload)).body.data.email.status, 'DONE');
  passed += 1;
  console.log(`Email OTP report lock: ${passed} groups PASS (temporary database)`);
})().catch((err) => {
  console.error(err.stack);
  process.exitCode = 1;
}).finally(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
  process.env.DB_NAME = originalDb;
  if (created && safeDb()) await manager.query(`DROP DATABASE \`${testDb}\``);
  await manager.close();
});
