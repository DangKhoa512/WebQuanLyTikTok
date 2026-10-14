const assert = require("assert"),
  path = require("path"),
  crypto = require("crypto"),
  fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
// External Instagram requests are opt-in inside this isolated test. Individual
// cases below use a deterministic request stub.
process.env.INSTAGRAM_CSRF_FETCH_ENABLED = "false";
process.env.INSTAGRAM_CSRF_FETCH_TIMEOUT_MS = "8000";
const { Sequelize } = require("sequelize");
const original = process.env.DB_NAME,
  name =
    "quanly_ig_credentials_test_" +
    Date.now() +
    "_" +
    crypto.randomBytes(4).toString("hex");
const manager = new Sequelize("", process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  dialect: "mysql",
  logging: false,
});
let db,
  server,
  created = false;
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push({ test: name, status: "PASS" });
};
(async () => {
  await manager.query("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4");
  created = true;
  process.env.DB_NAME = name;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  db = require("../src/config/database");
  require("../src/models");
  await db.sync({ force: false, alter: false, logging: false });
  const Account = require("../src/models/InstagramAccount"),
    User = require("../src/models/User");
  const a = await User.create({
      username: "ig_fixture_a",
      password_hash: "synthetic",
      role: "user",
    }),
    b = await User.create({
      username: "ig_fixture_b",
      password_hash: "synthetic",
      role: "admin",
    });
  const cookie =
    "ds_user_id=123456; sessionid=123456%3AfixtureAb%3A1%3AfixtureZ;";
  let account = await Account.create({
    owner_username: a.username,
    kind: "job",
    uid: "fixture_account",
    raw_data: "fixture_account|fixture-pass|null|" + cookie,
    cookies: cookie,
    device_id: "FixturePhone",
    status: "DANG_LAM",
    locked_by: "FixturePhone",
    locked_at: new Date(),
  });
  await account.reload();
  const originalStatus = account.status,
    originalLock = +account.locked_at;
  await check(
    "additive migration twice preserves existing account",
    async () => {
      const qi = db.getQueryInterface();
      await qi.removeColumn("instagram_accounts", "token");
      await qi.removeColumn("instagram_accounts", "token_updated_at");
      const migration = require("../src/services/instagramCredentialMigration");
      await migration.migrate(db);
      await migration.migrate(db);
      assert.equal((await Account.findByPk(account.id)).cookies, cookie);
    },
  );
  const logger = require("../src/config/logger"),
    logs = [];
  for (const k of ["info", "warn", "error", "debug"])
    logger[k] = (...x) => logs.push(x);
  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port,
    jwt = require("jsonwebtoken"),
    auth = (u) =>
      jwt.sign({ id: u.id, username: u.username }, process.env.JWT_SECRET);
  async function request(url, { body, user = a, phone = false } = {}) {
    const res = await fetch(base + "/api" + url, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(phone
          ? { "x-api-key": user.username }
          : { Authorization: "Bearer " + auth(user) }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json(), headers: res.headers };
  }
  const update = (body) =>
    request("/instagram/job/report", {
      phone: true,
      body: { uid: account.uid, device_id: "FixturePhone", ...body },
    });
  const token = "Bearer IGT:2:fixture_opaque_token";
  const csrf = "FixtureCsrfToken_1234567890";
  await check(
    "missing csrftoken is fetched once and appended without exposing cookies",
    async () => {
      const axios = require("axios");
      const originalGet = axios.get;
      let calls = 0;
      process.env.INSTAGRAM_CSRF_FETCH_ENABLED = "true";
      axios.get = async (url, config) => {
        calls += 1;
        assert.equal(url, "https://www.instagram.com/accounts/login/");
        assert.equal(config.headers.Cookie, cookie);
        assert(config.timeout > 0 && config.timeout <= 8000);
        return {
          status: 200,
          headers: { "set-cookie": [`csrftoken=${csrf}; Path=/; Secure`] },
          data: "",
        };
      };
      try {
        const fetched = await update({ cookies: cookie });
        assert.equal(fetched.status, 200);
        assert(fetched.json.data.warnings.includes("CSRF_TOKEN_FETCHED"));
        assert.equal(
          (await Account.findByPk(account.id)).cookies,
          cookie.replace(/;$/, "; csrftoken=" + csrf + ";"),
        );

        const imported = await request("/instagram/import-api", {
          phone: true,
          body: {
            kind: "job",
            device_id: "FixturePhone",
            data: "csrf_import_fixture|pass|null|" + cookie,
            token,
          },
        });
        assert.equal(imported.status, 200);
        assert(
          imported.json.data.credential_warnings.includes(
            "CSRF_TOKEN_FETCHED",
          ),
        );
        assert.equal(
          (
            await Account.findOne({ where: { uid: "csrf_import_fixture" } })
          ).cookies,
          cookie.replace(/;$/, "; csrftoken=" + csrf + ";"),
        );

        const withCsrf = cookie.replace(/;$/, "; csrftoken=AlreadyPresent123;");
        await update({ cookies: withCsrf });
        assert.equal(calls, 2);
        assert.equal((await Account.findByPk(account.id)).cookies, withCsrf);

        axios.get = async () => {
          throw new Error("synthetic timeout");
        };
        const failed = await update({ cookies: cookie });
        assert.equal(failed.status, 200);
        assert(failed.json.data.warnings.includes("CSRF_TOKEN_FETCH_FAILED"));
        assert.equal((await Account.findByPk(account.id)).cookies, cookie);
        const webFailed = await request("/instagram/import", {
          body: { kind: "job", text: "web_csrf_fixture|pass|null|" + cookie },
        });
        assert.equal(webFailed.status, 200);
        assert(webFailed.json.data.credential_warnings.includes("CSRF_TOKEN_FETCH_FAILED"));
        assert.equal((await Account.findOne({ where: { uid: "web_csrf_fixture", owner_username: a.username } })).cookies, cookie);
        axios.get = async () => {
          calls += 1;
          return { status: 200, headers: { "set-cookie": [`csrftoken=${csrf}; Path=/`] }, data: "" };
        };
        const webUpdated = await request("/instagram/import", {
          body: { kind: "job", text: "web_csrf_fixture|pass|null|" + cookie },
        });
        assert.equal(webUpdated.status, 200);
        assert.equal(webUpdated.json.data.updated, 1);
        assert(webUpdated.json.data.credential_warnings.includes("CSRF_TOKEN_FETCHED"));
        assert.equal((await Account.findOne({ where: { uid: "web_csrf_fixture", owner_username: a.username } })).cookies, cookie.replace(/;$/, "; csrftoken=" + csrf + ";"));
        const callsBeforeExisting = calls;
        const webExisting = await request("/instagram/import", {
          body: { kind: "job", text: "web_csrf_fixture|pass|null|" + withCsrf },
        });
        assert.equal(webExisting.status, 200);
        assert.equal(calls, callsBeforeExisting);
        assert.equal((await Account.findOne({ where: { uid: "web_csrf_fixture", owner_username: a.username } })).cookies, withCsrf);
        await Account.destroy({ where: { uid: "web_csrf_fixture", owner_username: a.username } });
      } finally {
        axios.get = originalGet;
        process.env.INSTAGRAM_CSRF_FETCH_ENABLED = "false";
      }
    },
  );
  await check("CSRF redirects and HTTP failures are classified without leaking credentials", async () => {
    const service = require('../src/services/instagramCsrfService');
    const run = request => service.enrich(cookie, { enabled: true, request, proxyUrl: 'http://127.0.0.1:12345' });
    const redirectToken = await run(async () => ({ status: 302, headers: { location: '/', 'set-cookie': [`csrftoken=${csrf}; Path=/`] } }));
    assert(redirectToken.fetched);
    let calls = 0;
    const followed = await run(async (url, config) => {
      assert(config.httpsAgent);assert.equal(config.proxy,false);assert.equal(config.maxRedirects,0);
      assert.equal(config.headers.Cookie,cookie);
      calls++;
      if(calls===1)return {status:302,headers:{location:'/'}};
      assert.equal(url,'https://www.instagram.com/');
      return {status:200,headers:{},data:JSON.stringify({csrf_token:csrf})};
    });
    assert(followed.fetched);assert.equal(calls,2);
    for(const [status,warning] of [[429,'CSRF_RATE_LIMITED'],[403,'CSRF_ACCESS_DENIED'],[407,'CSRF_PROXY_AUTH_REQUIRED'],[503,'CSRF_HTTP_ERROR'],[200,'CSRF_TOKEN_NOT_RECEIVED']]){
      const result=await run(async()=>({status,headers:{},data:''}));
      assert.equal(result.warning,warning);assert.equal(result.http_status,status);assert.equal(result.cookies,cookie);
    }
    for(const [location,warning] of [[undefined,'CSRF_REDIRECT_BLOCKED'],['https://example.com/','CSRF_REDIRECT_BLOCKED'],['http://www.instagram.com/','CSRF_REDIRECT_BLOCKED'],['/challenge/','CSRF_CHALLENGE_REQUIRED']]){
      let count=0;
      const result=await run(async()=>{count++;return {status:302,headers:{location,'set-cookie':[`csrftoken=${csrf};`]}};});
      assert.equal(result.warning,warning);assert.equal(count,1);assert.equal(result.cookies,cookie);
    }
    calls=0;
    const loop=await run(async()=>{calls++;return {status:302,headers:{location:'/'}};});
    assert.equal(loop.warning,'CSRF_REDIRECT_LIMIT');assert.equal(calls,3);
    const timeout=await run(async()=>{throw Object.assign(new Error('synthetic'),{code:'ETIMEDOUT'});});
    assert.equal(timeout.warning,'CSRF_FETCH_TIMEOUT');
    const oversized = await run(async (_, config) => {
      assert.equal(config.maxContentLength, 8 * 1024 * 1024);
      throw Object.assign(new Error('maxContentLength size exceeded'), { code: 'ERR_BAD_RESPONSE' });
    });
    assert.equal(oversized.warning, 'CSRF_RESPONSE_TOO_LARGE');
    for(const [code,warning] of [['ENOTFOUND','CSRF_DNS_FAILED'],['ECONNREFUSED','CSRF_CONNECTION_REFUSED'],['ECONNRESET','CSRF_CONNECTION_RESET'],['EPROTO','CSRF_TLS_FAILED']]){
      let count=0;
      const result=await run(async()=>{
        if(++count===1)return {status:302,headers:{location:'/'}};
        throw Object.assign(new Error('synthetic-secret-must-not-leak'),{code});
      });
      assert.equal(result.warning,warning);
      assert.equal(result.http_status,null);
      assert.equal(result.previous_http_status,302);
      assert.equal(result.request_stage,'redirect');
      assert(!JSON.stringify(result).includes('synthetic-secret-must-not-leak'));
    }
  });
  await check("owner proxy routing and missing CSRF backfill preserve newer credentials", async () => {
    const settings = require('../src/services/settingsService');
    const axios = require('axios');
    const originalGet = axios.get;
    const originalCookie = (await Account.findByPk(account.id)).cookies;
    const csrfService = require('../src/services/instagramCsrfService');
    let calls = 0;
    const endpoint = '/instagram/csrf/fetch-missing';
    try {
      assert.equal((await request(endpoint, { body: { ids: [account.id] } })).status, 400);
      await settings.saveFacebookCheckProxySettings(a.username, { proxies: ['127.0.0.1:12345'] });
      await settings.saveFacebookCheckProxySettings(b.username, { proxies: ['127.0.0.1:23456'] });
      axios.get = async (url, config) => {
        calls++;
        assert(config.httpsAgent);
        assert.equal(config.httpsAgent.proxy.port, '12345');
        assert.equal(config.proxy, false);
        assert.equal(config.maxRedirects, 0);
        return { status: 200, headers: { 'set-cookie': [`csrftoken=${csrf}; Path=/`] }, data: '' };
      };
      await Account.findByPk(account.id).then(row => row.update({ cookies: cookie }));
      let response = await request(endpoint, { body: { ids: [account.id] } });
      assert.equal(response.status, 200);
      assert.equal(response.json.data.success, 1);
      assert(!JSON.stringify(response.json).includes(csrf));
      let row = await Account.findByPk(account.id);
      assert(csrfService.cookieValue(row.cookies, 'csrftoken'));
      assert.equal(row.status, originalStatus);
      assert.equal(+row.locked_at, originalLock);
      const count = calls;
      response = await request(endpoint, { body: { ids: [account.id] } });
      assert.equal(response.json.data.skipped, 1);
      assert.equal(calls, count);
      response = await request(endpoint, { user: b, body: { ids: [account.id] } });
      assert.deepEqual(response.json.data.results, []);
      assert.equal(calls, count);
      assert.equal((await request(endpoint, { body: { ids: ['1'] } })).status, 400);
      assert.equal((await request(endpoint, { body: { ids: [1,2,3,4,5,6] } })).status, 400);
      process.env.INSTAGRAM_CSRF_FETCH_ENABLED = 'true';
      await update({ cookies: cookie });
      assert.equal(calls, count + 1);
      await settings.saveFacebookCheckProxySettings(a.username, { proxies: ['invalid'] });
      const invalid = await update({ cookies: cookie });
      assert(invalid.json.data.warnings.includes('CSRF_PROXY_INVALID'));
      assert.equal(calls, count + 1);
      await settings.saveFacebookCheckProxySettings(a.username, { proxies: ['127.0.0.1:12345'] });
      axios.get = async () => { throw new Error('synthetic proxy timeout'); };
      response = await request(endpoint, { body: { ids: [account.id] } });
      assert.equal(response.json.data.failed, 1);
      assert.equal((await Account.findByPk(account.id)).cookies, cookie);
      const newer = cookie.replace('fixtureAb', 'newerFixture');
      axios.get = async () => {
        await Account.findByPk(account.id).then(row => row.update({ cookies: newer }));
        return { status: 200, headers: { 'set-cookie': [`csrftoken=${csrf}; Path=/`] } };
      };
      response = await request(endpoint, { body: { ids: [account.id] } });
      assert.equal(response.json.data.results[0].reason, 'COOKIE_CHANGED');
      assert.equal((await Account.findByPk(account.id)).cookies, newer);
    } finally {
      axios.get = originalGet;
      process.env.INSTAGRAM_CSRF_FETCH_ENABLED = 'false';
      await settings.saveFacebookCheckProxySettings(a.username, { proxies: [] });
      await settings.saveFacebookCheckProxySettings(b.username, { proxies: [] });
      await Account.findByPk(account.id).then(row => row.update({ cookies: originalCookie }));
    }
  });
  await check(
    "legacy cookies only report preserves status and lock",
    async () => {
      assert.equal((await update({ cookies: cookie })).status, 200);
      const row = await Account.findByPk(account.id);
      assert.equal(row.status, originalStatus);
      assert.equal(+row.locked_at, originalLock);
    },
  );
  await check(
    "cookies and token separate, encoded values unchanged",
    async () => {
      assert.equal((await update({ cookies: cookie, token })).status, 200);
      account = await Account.findByPk(account.id);
      assert.equal(account.cookies, cookie);
      assert.equal(account.token, token);
      assert(account.token_updated_at);
    },
  );
  await check(
    "partial/empty updates preserve existing credentials",
    async () => {
      await update({ cookies: "sessionid=raw:fixture; ds_user_id=123456;" });
      assert.equal((await Account.findByPk(account.id)).token, token);
      await update({ token: "Bearer fixture-second" });
      assert.equal(
        (await Account.findByPk(account.id)).cookies,
        "sessionid=raw:fixture; ds_user_id=123456;",
      );
      await update({ cookies: "", token: null });
      await update({ cookies: "  ", token: "" });
      assert.equal(
        (await Account.findByPk(account.id)).token,
        "Bearer fixture-second",
      );
    },
  );
  await check("hex patterns preserved and warning returned", async () => {
    const value = "ds_user_id=123456; sessionid=1230X1.AFP-2abc%3Azzz;";
    const r = await update({ cookies: value });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data.warnings, ["SESSION_HEX_PATTERN_UNVERIFIED"]);
    assert.equal((await Account.findByPk(account.id)).cookies, value);
  });

  await check(
    "user-confirmed hexadecimal signature normalizes without losing segments",
    async () => {
      const raw =
        "ds_user_id=123456;sessionid=1234560X1.0FDAB1AP-1042FixturePart0X0P+0170X1.FB5D8CE8P-1042FixtureTail-with_dash";
      const expected =
        "ds_user_id=123456; sessionid=123456%3AFixturePart%3A17%3AFixtureTail-with_dash;";
      const r = await update({ cookies: raw });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.data.warnings, [
        "SESSION_CONFIRMED_SIGNATURE_NORMALIZED",
      ]);
      assert.equal((await Account.findByPk(account.id)).cookies, expected);
      const validation = require("../src/services/instagramCredentials");
      assert.equal(validation.validateCookies(expected).value, expected);
      for (const other of [
        raw.replace("0FDAB1A", "ABCDE"),
        raw.replace("ds_user_id=123456", "ds_user_id=654321"),
        raw.replace("FixtureTail", "9FixtureTail"),
      ])
        assert.equal(validation.validateCookies(other).value, other);
      await update({ cookies: cookie });
      const pipe = await request("/instagram/import-api", {
        phone: true,
        body: {
          kind: "job",
          device_id: "FixturePhone",
          data: "normalized_pipe|pass|null|" + raw,
          token,
        },
      });
      assert.equal(pipe.status, 200);
      assert.equal(
        (await Account.findOne({ where: { uid: "normalized_pipe" } })).cookies,
        expected,
      );
    },
  );

  await check(
    "IGT payload recovery validates exact UID/session and supports pipe token",
    async () => {
      const originalCredentials = await Account.findByPk(account.id);
      const raw =
        "ds_user_id123456;sessionid=1234560X1.1679E1BP-1042FixturePart0X0P+020X1.FB5D8CE8P-10429FixtureTail-_";
      const session = "123456%3AFixturePart%3A2%3A9FixtureTail-_";
      const expected = "ds_user_id=123456; sessionid=" + session + ";";
      const makeToken = (uid, value) =>
        "Bearer IGT:2:" +
        Buffer.from(
          JSON.stringify({ ds_user_id: uid, sessionid: value }),
        ).toString("base64");
      const realShape = makeToken("123456", session);
      const r = await update({ cookies: raw, token: realShape });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.data.warnings, [
        "SESSION_RECOVERED_FROM_IGT_PAYLOAD",
      ]);
      assert.equal((await Account.findByPk(account.id)).cookies, expected);
      const before = await Account.findByPk(account.id);
      for (const invalid of [
        makeToken("654321", session.replace("123456", "654321")),
        makeToken("123456", session.replace("FixturePart", "Different")),
        "Bearer IGT:2:not_valid_json",
      ]) {
        assert.equal(
          (await update({ cookies: raw, token: invalid })).status,
          400,
        );
        assert.equal(
          (await Account.findByPk(account.id)).cookies,
          before.cookies,
        );
        assert.equal((await Account.findByPk(account.id)).token, before.token);
      }
      const validation = require("../src/services/instagramCredentials");
      assert.equal(
        validation.patch({
          cookies: raw.replace("ds_user_id123456", "ds_user_id=123456"),
          token: realShape,
        }).values.cookies,
        expected,
      );
      const pipe = await request("/instagram/import-api", {
        phone: true,
        body: {
          kind: "job",
          device_id: "FixturePhone",
          data: "igt_pipe|pass|null|" + raw + "|" + realShape,
        },
      });
      assert.equal(pipe.status, 200);
      const row = await Account.findOne({ where: { uid: "igt_pipe" } });
      assert.equal(row.cookies, expected);
      assert.equal(row.token, realShape);
      await update({ cookies: cookie, token: originalCredentials.token });
    },
  );
  await check("invalid input atomic, old data preserved", async () => {
    const before = (await Account.findByPk(account.id)).cookies;
    for (const value of [
      "sessionid=bad%%3A",
      "sessionid=bad%ZZ",
      "sessionid=bad\r\nX: bad",
      "sessionid=bad%0A",
      "bad",
      "sessionid=x; sessionid=y",
    ]) {
      const r = await update({ cookies: value, token: "Bearer must-not-save" });
      assert.equal(r.status, 400);
      assert.equal((await Account.findByPk(account.id)).cookies, before);
      assert.equal(
        (await Account.findByPk(account.id)).token,
        "Bearer fixture-second",
      );
    }
    assert.equal((await update({ cookies: before, token: 42 })).status, 400);
  });
  await check(
    "import endpoint accepts structured credentials without status mutation",
    async () => {
      const r = await request("/instagram/import-api", {
        phone: true,
        body: {
          uid: account.uid,
          device_id: "FixturePhone",
          cookies: cookie,
          token,
        },
      });
      assert.equal(r.status, 200);
      assert.equal((await Account.findByPk(account.id)).status, originalStatus);
    },
  );
  await check(
    "owner/device isolation, active auth, exact detail no-store",
    async () => {
      const path =
        "/instagram/accounts/" + account.id + "/credentials?field=token";
      assert.equal((await request(path, { user: b })).status, 404);
      const unauth = await fetch(base + "/api" + path);
      assert.equal(unauth.status, 401);
      const wrong = await request("/instagram/job/report", {
        phone: true,
        user: b,
        body: {
          uid: account.uid,
          device_id: "FixturePhone",
          token: "Bearer wrong-owner",
        },
      });
      assert.equal(wrong.status, 404);
      assert.equal(
        (
          await request("/instagram/job/report", {
            phone: true,
            body: {
              uid: account.uid,
              device_id: "WrongPhone",
              token: "Bearer wrong-device",
            },
          })
        ).status,
        409,
      );
      const detail = await request(path);
      assert.equal(detail.json.data.value, token);
      assert.equal(detail.headers.get("cache-control"), "no-store");
    },
  );
  await check(
    "1000-account list excludes secrets and raw/full data at SQL projection",
    async () => {
      await Account.bulkCreate(
        Array.from({ length: 997 }, (_, i) => ({
          owner_username: a.username,
          kind: "job",
          uid: "fixture-" + i,
          raw_data: "synthetic-raw-sensitive",
          cookies: cookie,
          token,
          device_id: "FixturePhone",
          status: "LOGIN_THANH_CONG",
        })),
      );
      const started = Date.now();
      const r = await request("/instagram?kind=job&limit=1000");
      assert.equal(r.status, 200);
      assert.equal(r.json.data.accounts.length, 1000);
      for (const row of r.json.data.accounts) {
        assert(!Object.hasOwn(row, "cookies"));
        assert(!Object.hasOwn(row, "token"));
        assert(!Object.hasOwn(row, "raw_data"));
        assert(!Object.hasOwn(row, "full_data"));
        assert.equal(row.has_cookies, 1);
        assert.equal(row.has_token, 1);
      }
      console.log("LIST_1000_LOCAL_MS=" + String(Date.now() - started));
    },
  );
  await check("existing account pipe import updates token and preserves it when omitted",async()=>{
    const endpoint="/instagram/import-api";
    const send=(suffix)=>request(endpoint,{phone:true,body:{kind:"job",device_id:"FixturePhone",data:account.uid+"|pass|null|"+cookie+suffix}});
    const supplied="Bearer IGT:2:fixture-replacement";
    const r=await send("|"+supplied);assert.equal(r.status,200);assert.equal(r.json.data.updated,1);
    let row=await Account.findByPk(account.id);assert.equal(row.token,supplied);assert(row.token_updated_at);
    await send("");row=await Account.findByPk(account.id);assert.equal(row.token,supplied);
    await update({token});
  });
  await check("legacy pipe import and status report still work", async () => {
    const r = await request("/instagram/import-api", {
      phone: true,
      body: {
        kind: "job",
        device_id: "FixturePhone",
        data: "legacy_fixture|testpass|null|" + cookie,
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.created, 1);
    const status = await update({ status: "DA_CHAY_XONG", token });
    assert.equal(status.status, 200);
    assert.equal((await Account.findByPk(account.id)).status, "DA_CHAY_XONG");
  });

  await check(
    "legacy pipe payload accepts optional token; bulk sync does not erase existing credentials",
    async () => {
      const r = await request("/instagram/import-api", {
        phone: true,
        body: {
          kind: "job",
          device_id: "FixturePhone",
          data: "pipe_with_token|pass|null|" + cookie,
          token,
        },
      });
      assert.equal(r.status, 200);
      const pipe = await Account.findOne({ where: { uid: "pipe_with_token" } });
      assert.equal(pipe.token, token);
      const reg = await Account.create({
        owner_username: a.username,
        kind: "reg",
        uid: account.uid,
        raw_data: "fixture_account|pass|null|null",
        status: "LOGIN_THANH_CONG",
      });
      const sync = await request("/instagram/bulk-sync-to-job", {
        body: { ids: [reg.id] },
      });
      assert.equal(sync.status, 200);
      const row = await Account.findByPk(account.id);
      assert.equal(row.cookies, cookie);
      assert.equal(row.token, token);
    },
  );
  await check(
    "optional AES-GCM storage and legacy plaintext remain readable",
    async () => {
      process.env.INSTAGRAM_CREDENTIAL_ENCRYPTION_KEY = crypto
        .randomBytes(32)
        .toString("base64");
      const r = await update({ cookies: cookie, token });
      assert.equal(r.status, 200);
      const [rows] = await db.query(
        "SELECT cookies,token FROM instagram_accounts WHERE id=:id",
        { replacements: { id: account.id }, logging: false },
      );
      assert(rows[0].cookies.startsWith("igenc:v1:"));
      assert(rows[0].token.startsWith("igenc:v1:"));
      assert(!rows[0].cookies.includes("fixtureAb"));
      assert.equal((await Account.findByPk(account.id)).cookies, cookie);
      assert.equal(
        (
          await request(
            "/instagram/accounts/" + account.id + "/credentials?field=token",
          )
        ).json.data.value,
        token,
      );
      const imported = await Account.create({
        owner_username: a.username,
        kind: "job",
        uid: "encrypted_fixture",
        raw_data: "encrypted_fixture|pass|null|" + cookie,
        cookies: cookie,
      });
      assert(imported.getDataValue("raw_data").startsWith("igenc:v1:"));
      const legacy = await Account.findOne({
        where: { uid: "legacy_fixture" },
      });
      assert.equal(legacy.cookies, cookie);
    },
  );

  if (process.argv.includes("--ui"))
    await check(
      "Chrome table hides credentials; modal shows exact strings and clears on close",
      async () => {
        const esbuild = require("../../frontend/node_modules/esbuild"),
          express = require("express");
        const bundle = esbuild.buildSync({
          stdin: {
            contents:
              "import React from 'react';import {createRoot} from 'react-dom/client';import Accounts from './pages/InstagramAccounts';createRoot(document.getElementById('root')).render(<Accounts kind='job'/>);",
            resolveDir: path.resolve(__dirname, "../../frontend/src"),
            loader: "jsx",
          },
          bundle: true,
          write: false,
          jsx: "automatic",
          format: "iife",
          define: { "import.meta.env.VITE_API_BASE_URL": "undefined" },
        }).outputFiles[0].text;
        app.get("/ig-preview.js", (_, res) => res.type("js").send(bundle));
        app.get("/ig-preview", (_, res) =>
          res
            .type("html")
            .send(
              '<div id="root"></div><script src="/ig-preview.js"></script>',
            ),
        );
        app._router.stack.splice(2, 0, ...app._router.stack.splice(-2));
        const { Builder, By } = require("selenium-webdriver"),
          chrome = require("selenium-webdriver/chrome");
        const browser = await new Builder()
          .forBrowser("chrome")
          .setChromeOptions(
            new chrome.Options().addArguments(
              "--headless=new",
              "--window-size=1366,900",
            ),
          )
          .setChromeService(
            new chrome.ServiceBuilder(
              path.join(
                process.env.USERPROFILE,
                ".cache/selenium/chromedriver/win64/154.0.8037.92/chromedriver.exe",
              ),
            ),
          )
          .build();
        try {
          await browser.get(base + "/health");
          await browser.executeScript(
            'localStorage.setItem("tiktok_admin_token",arguments[0]);',
            auth(a),
          );
          await browser.get(base + "/ig-preview");
          await browser.wait(
            async () =>
              await browser.executeScript(
                'return [...document.querySelectorAll("button")].some(b=>b.textContent==="Xem Token");',
              ),
            15000,
          );
          assert(!(await browser.getPageSource()).includes(token));
          await browser
            .findElement(By.xpath('//button[text()="Xem Token"]'))
            .click();
          await browser.wait(
            async () =>
              await browser.executeScript(
                'return !!document.querySelector("[role=dialog] textarea");',
              ),
            10000,
          );
          assert.equal(
            await browser
              .findElement(By.css("[role=dialog] textarea"))
              .getAttribute("value"),
            token,
          );
          await browser
            .findElement(
              By.xpath('//section[@role="dialog"]//button[text()="Đóng"]'),
            )
            .click();
          assert.equal(
            (await browser.findElements(By.css("[role=dialog]"))).length,
            0,
          );
          await browser
            .findElement(By.xpath('//button[text()="Xem Cookies"]'))
            .click();
          await browser.wait(
            async () =>
              await browser.executeScript(
                'return !!document.querySelector("[role=dialog] textarea");',
              ),
            10000,
          );
          assert.equal(
            await browser
              .findElement(By.css("[role=dialog] textarea"))
              .getAttribute("value"),
            cookie,
          );
          const saved = await browser.executeScript(
            "return JSON.stringify(localStorage);",
          );
          assert(!saved.includes(cookie));
          assert(!saved.includes(token));
          await browser.findElement(By.xpath('//section[@role="dialog"]//button[text()="Đóng"]')).click();
          const axios = require('axios'), originalGet = axios.get;
          const settings = require('../src/services/settingsService');
          await settings.saveFacebookCheckProxySettings(a.username, { proxies: ['127.0.0.1:12345'] });
          axios.get = async (_, config) => {
            assert(config.httpsAgent);
            return { status: 200, headers: { 'set-cookie': [`csrftoken=${csrf}; Path=/`] } };
          };
          try {
            await browser.findElement(By.css('input[placeholder="username, May1..."]')).sendKeys('fixture_account');
            await browser.wait(async()=>await browser.executeScript('return document.querySelectorAll("tr.ig-row").length===1;'),10000);
            await browser.findElement(By.css('tr.ig-row input[type=checkbox]')).click();
            await browser.findElement(By.xpath('//button[text()="Lấy CSRF thiếu đã chọn"]')).click();
            await browser.wait(async()=>await browser.executeScript('return document.body.textContent.includes("Đã bổ sung token");'),15000);
            assert.equal(require('../src/services/instagramCsrfService').cookieValue((await Account.findByPk(account.id)).cookies,'csrftoken'),csrf);
            assert(!(await browser.getPageSource()).includes(csrf));
          } finally {
            axios.get = originalGet;
            await settings.saveFacebookCheckProxySettings(a.username, { proxies: [] });
          }
        } finally {
          await browser.quit();
        }
      },
    );
  await check("audit contains metadata only", async () => {
    const all = JSON.stringify(logs);
    assert(all.includes("Instagram credential viewed"));
    assert(all.includes("Instagram credentials updated"));
    for (const secret of [cookie, token, csrf, "fixture-second", "must-not-save"])
      assert(!all.includes(secret));
  });
  fs.mkdirSync(path.resolve(__dirname, "../tests/instagram-credentials"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(__dirname, "../tests/instagram-credentials/results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        results,
        real_instagram_token_verified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "INSTAGRAM_CREDENTIALS_OK " +
      results.length +
      " groups; isolated DB; no production writes",
  );
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (db) await db.close();
    if (
      created &&
      /^quanly_ig_credentials_test_\d+_[a-f0-9]+$/.test(name) &&
      name !== original
    )
      await manager.query("DROP DATABASE `" + name + "`");
    await manager.close();
  });
