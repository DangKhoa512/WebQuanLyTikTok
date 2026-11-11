const assert = require('assert/strict');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');
const originalDb = process.env.DB_NAME;
const testDb = `quanly_fb_appeal_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const safeDb = () => /^quanly_fb_appeal_test_\d+_[a-f0-9]+$/.test(testDb) && testDb !== originalDb;
const manager = new Sequelize('', process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql', logging: false,
});
let db, server, created = false;
const axios = require('axios');
const originalGet = axios.get;
(async () => {
  assert(safeDb());
  await manager.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4`);
  created = true;
  process.env.DB_NAME = testDb;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  db = require('../src/config/database');
  const User = require('../src/models/User');
  const Account = require('../src/models/FacebookAccount');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/facebook', require('../src/routes/facebook'));
  app.use((err, req, res, next) => res.status(500).json({ success: false }));
  await db.sync({ force: false, alter: false });
  const user = await User.create({ username: 'appeal_a', password_hash: 'fixture', role: 'user' });
  await User.create({ username: 'appeal_b', password_hash: 'fixture', role: 'user' });
  const token = require('jsonwebtoken').sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (endpoint, body, owner = 'appeal_a', jwt = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/facebook/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${token}` } : { 'x-api-key': owner }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const make = (uid, extra = {}) => Account.create({ uid, raw_data: uid, kind: 'job',
    owner_username: 'appeal_a', device_id: 'phone-a', status: 'ACCOUNT_DIE', live_status: 'die', ...extra });
  const live = await make('fixture-live');
  const dead = await make('fixture-dead');
  const unknown = await make('fixture-unknown');
  await make('other-phone', { device_id: 'phone-b' });
  await make('other-owner', { owner_username: 'appeal_b' });
  await make('reg-only', { kind: 'reg' });
  await make('trash', { trashed_at: new Date() });
  const ready = await make('ready', { status: 'LOGIN_THANH_CONG', live_status: 'live' });
  const listing = await request('job/die-accounts?device_id=phone-a');
  assert.equal(listing.status, 200);
  assert.deepEqual(listing.body.data.map(a => a.uid), [live.uid, dead.uid, unknown.uid]);
  assert.equal((await request('job/die-accounts', { device_id: 'phone-a' })).body.data.length, 3);
  assert.equal((await request('job/die-accounts')).status, 400);
  assert.equal((await request('job/die-accounts', {}, '')).status, 401);
  const report = (uid, extra = {}, owner) => request('job/report-die', { uid, device_id: 'phone-a', ...extra }, owner);
  assert.equal((await report(live.uid, {}, 'appeal_b')).status, 404);
  assert.equal((await report(live.uid, { device_id: 'phone-b' })).status, 404);
  assert.equal((await report('reg-only')).status, 404);
  assert.equal((await report('trash')).status, 404);
  assert.equal((await report(ready.uid)).status, 409);
  assert.equal((await request('job/report-die', { device_id: 'phone-a' })).status, 400);
  await live.update({ locked_by: 'phone-a', locked_at: new Date(), reg_page_locked_by: 'phone-a',
    nurture_status: 'DANG_NUOI', nurture_locked_by: 'phone-a', nurture_run_id: 'fixture-run' });
  const reports = await Promise.all([report(live.uid), report(live.uid)]);
  assert(reports.every(r => r.status === 200));
  assert.equal(reports.filter(r => r.body.data.already_reported).length, 1);
  await live.reload();
  assert.equal(live.status, 'DANG_KHANG');
  assert.equal(live.device_id, 'phone-a');
  assert.equal(live.locked_by, null);
  assert.equal(live.reg_page_locked_by, null);
  assert.equal(live.nurture_run_id, null);
  await report(dead.uid);
  await report(unknown.uid);
  axios.get = async url => {
    assert(url.startsWith('https://graph.facebook.com/'));
    if (url.includes('fixture-live')) return { status: 200, data: { data: { width: 100, height: 100 } } };
    if (url.includes('fixture-unknown')) return { status: 429, data: {} };
    return { status: 404, data: {} };
  };
  const check = ids => request('check-live', { ids, kind: 'job' }, undefined, true);
  const checked = await check([live.id, dead.id, unknown.id]);
  assert.equal(checked.status, 200);
  assert.deepEqual([checked.body.data.live, checked.body.data.die, checked.body.data.unknown], [1, 1, 1]);
  await live.reload(); await unknown.reload();
  assert.equal(live.status, 'LOGIN_THANH_CONG');
  assert.equal(live.live_status, 'live');
  assert(live.login_at);
  assert.equal(live.trashed_at, null);
  assert.equal(unknown.status, 'DANG_KHANG');
  assert.equal(unknown.trashed_at, null);
  assert.equal(await Account.findByPk(dead.id), null);
  const trashed = await Account.unscoped().findByPk(dead.id);
  assert.equal(trashed.status, 'ACCOUNT_DIE'); assert(trashed.trashed_at);
  assert.equal((await report(dead.uid)).status, 404);
  assert.equal((await report(live.uid)).status, 409);
  // Normal Die checks retain the existing flow and do not trash accounts before appeal.
  await check([ready.id]); await ready.reload();
  assert.equal(ready.status, 'ACCOUNT_DIE'); assert.equal(ready.trashed_at, null);
  // A delayed check started before phone report cannot trash the newly pending appeal.
  const race = await make('race');
  axios.get = async () => {
    assert.equal((await report(race.uid)).status, 200);
    return { status: 404, data: {} };
  };
  const stale = await check([race.id]);
  assert.equal(stale.body.data.rows[0].reason, 'ACCOUNT_CHANGED_DURING_CHECK');
  await race.reload(); assert.equal(race.status, 'DANG_KHANG'); assert.equal(race.trashed_at, null);
  console.log('Facebook appeal PASS: owner/device/kind/trash/auth, concurrent reports, live/die/unknown, legacy, stale check (temporary DB, HTTP stub)');
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(async () => {
  axios.get = originalGet;
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close();
  process.env.DB_NAME = originalDb;
  if (created && safeDb()) await manager.query(`DROP DATABASE \`${testDb}\``);
  await manager.close();
});
