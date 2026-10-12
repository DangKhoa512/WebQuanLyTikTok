const path = require("path"),
  fs = require("fs"),
  crypto = require("crypto"),
  assert = require("assert");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Sequelize, Op } = require("sequelize");
const original = process.env.DB_NAME,
  name =
    "quanly_dm_test_" +
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
  wsServer,
  tunnelServer,
  broker,
  sshServer,
  gateway,
  created = false;
const events = [],
  sockets = [],
  results = [];
const record = (test, fn) => async () => {
  await fn();
  results.push({ test, status: "PASS" });
};
const wait = async (fn, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Condition timed out");
};
(async () => {
  assert(/^quanly_dm_test_\d+_[a-f0-9]+$/.test(name) && name !== original);
  await manager.query(
    "CREATE DATABASE `" +
      name +
      "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  created = true;
  process.env.DB_NAME = name;
  process.env.NODE_ENV = "test";
  process.env.DEVICE_MANAGER_ENABLED = "true";
  process.env.DEVICE_MANAGER_ENCRYPTION_KEY = crypto
    .randomBytes(32)
    .toString("base64");
  db = require("../src/config/database");
  require("../src/config/logger").silent = true;
  // Build old device table first to prove additive migration preserves existing rows.
  await db.query(
    "CREATE TABLE dashboard_devices(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,owner_username VARCHAR(100) NOT NULL,device_id VARCHAR(255) NOT NULL,device_name VARCHAR(255),current_task VARCHAR(100),current_uid VARCHAR(255),reported_status ENUM('ONLINE','RUNNING','IDLE') NOT NULL DEFAULT 'IDLE',started_at DATETIME,last_seen DATETIME NOT NULL,last_error VARCHAR(1000),created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_dashboard_device_owner(owner_username,device_id))",
  );
  await db.query(
    "INSERT INTO dashboard_devices(owner_username,device_id,reported_status,last_seen,created_at,updated_at) VALUES('dm_a','legacy','RUNNING',DATE_SUB(NOW(),INTERVAL 31 MINUTE),NOW(),NOW())",
  );
  require("../src/models");
  await db.sync({ alter: false, force: false });
  const migration = require("../src/services/deviceManagerMigration");
  const readyMiddleware = require("../src/middleware/deviceManagerReady");
  const checkReady = async () => {
    let status = 200,
      next = false;
    const response = {
      status(code) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await readyMiddleware({}, response, () => {
      next = true;
    });
    return { status, next };
  };
  assert.equal((await checkReady()).status, 503);
  await migration.up();
  await migration.up();
  await db
    .getQueryInterface()
    .removeConstraint("ssh_sessions", "fk_dm_session_owner_gateway");
  assert.equal((await checkReady()).status, 503);
  await migration.up();
  assert.equal((await checkReady()).next, true);
  results.push({
    test: "Schema guard rejects missing columns or tenant FK before enabling management",
    status: "PASS",
  });
  const Device = require("../src/models/ManagedDevice"),
    User = require("../src/models/User"),
    Run = require("../src/models/DeviceTaskRun"),
    {
      Group,
      Lan,
      Gateway,
      Mapping,
      Action,
      Session,
    } = require("../src/models/DeviceManager");
  const sec = require("../src/services/deviceManagerSecurity"),
    dm = require("../src/services/deviceManagerService");
  const a = await User.create({
      username: "dm_a",
      password_hash: "synthetic",
      role: "admin",
    }),
    b = await User.create({
      username: "dm_b",
      password_hash: "synthetic",
      role: "user",
    });
  await Device.bulkCreate([
    {
      owner_username: a.username,
      device_id: "run",
      last_seen: new Date(),
      reported_status: "RUNNING",
      current_task: "NUOI_FACEBOOK",
      current_uid: "synthetic",
    },
    { owner_username: b.username, device_id: "foreign", last_seen: new Date() },
  ]);
  const run = await Run.create({
    owner_username: a.username,
    device_id: "run",
    task_type: "NUOI_FACEBOOK",
    entity_type: "FACEBOOK_ACCOUNT",
    entity_id: 1,
    locked_by: "run",
    locked_at: new Date(),
    status: "RUNNING",
  });
  const express = require("express"),
    jwt = require("jsonwebtoken");
  const app = express();
  app.use(express.json());
  app.use("/api/device", require("../src/routes/device"));
  app.use("/api/device-manager", require("../src/routes/deviceManager"));
  app.use(
    "/api/stats",
    require("../src/middleware/jwtAuth"),
    require("../src/routes/stats"),
  );
  app.use((e, req, res, next) => {
    console.error("TEST_ERROR", e.name, e.message);
    next(e);
  });
  app.use(require("../src/middleware/errorHandler").errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const token = (u) =>
    jwt.sign(
      { id: u.id, username: u.username, role: u.role },
      require("../src/config/jwt").getJwtSecret(),
      { expiresIn: "1h" },
    );
  const request = async (u, url, method = "GET", body, phone = false) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(phone
          ? { "x-api-key": u ? u.username : "missing" }
          : { Authorization: "Bearer " + (u ? token(u) : "invalid") }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  const ok = async (...args) => {
    const r = await request(...args);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data;
  };
  await record(
    "Migration twice preserves legacy last_seen/status/task",
    async () => {
      const d = await dm.device(a.username, "legacy");
      assert.equal(d.reported_status, "RUNNING");
      assert.equal(
        require("../src/services/deviceStatusService").classifyDevice(d),
        "OFFLINE",
      );
      assert.equal(d.private_ip, null);
    },
  )();
  let group, lan1, lan2, g;
  await record(
    "Group create/edit/delete/bulk move and owner protection",
    async () => {
      group = await ok(a, "/api/device-manager/groups", "POST", {
        name: "Farm",
      });
      group = await ok(a, "/api/device-manager/groups/" + group.id, "PATCH", {
        name: "Farm A",
      });
      assert.equal(group.name, "Farm A");
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy", "run"],
        group_id: group.id,
      });
      assert.equal(
        (await dm.device(a.username, "run")).device_group_id,
        group.id,
      );
      assert.equal(
        (
          await request(b, "/api/device-manager/groups/" + group.id, "PATCH", {
            name: "stolen",
          })
        ).status,
        404,
      );
      const temp = await ok(a, "/api/device-manager/groups", "POST", {
        name: "Temp",
      });
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy"],
        group_id: temp.id,
      });
      await ok(a, "/api/device-manager/groups/" + temp.id, "DELETE", {});
      assert.equal(
        (await dm.device(a.username, "legacy")).device_group_id,
        null,
      );
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy"],
        group_id: group.id,
      });
    },
  )();
  await record(
    "LAN CRUD, occupied delete requires explicit unassign, same IP independent",
    async () => {
      lan1 = await ok(a, "/api/device-manager/lans", "POST", { name: "LAN 1" });
      lan2 = await ok(a, "/api/device-manager/lans", "POST", { name: "LAN 2" });
      await ok(a, "/api/device-manager/lans/" + lan2.id, "PATCH", {
        name: "LAN 2 renamed",
        description: "test",
      });
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy"],
        lan_id: lan1.id,
      });
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["run"],
        lan_id: lan2.id,
      });
      assert.equal(
        (await request(a, "/api/device-manager/lans/" + lan1.id, "DELETE", {}))
          .status,
        409,
      );
      const temp = await ok(a, "/api/device-manager/lans", "POST", {
        name: "Temp LAN",
      });
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy"],
        lan_id: temp.id,
      });
      await ok(a, "/api/device-manager/lans/" + temp.id, "DELETE", {
        unassign: true,
      });
      assert.equal((await dm.device(a.username, "legacy")).lan_id, null);
      await ok(a, "/api/device-manager/move", "POST", {
        device_ids: ["legacy"],
        lan_id: lan1.id,
      });
    },
  )();
  await record(
    "Private IP first/same/new + offline/running invariants",
    async () => {
      const before = (await dm.device(a.username, "legacy")).toJSON(),
        beforeRun = (await dm.device(a.username, "run")).toJSON();
      const first = await ok(
        a,
        "/api/device/network/report",
        "POST",
        { device_id: "legacy", private_ip: "192.168.1.105" },
        true,
      );
      assert.equal(first.ip_changed, true);
      const initial = (await dm.device(a.username, "legacy")).toJSON();
      const same = await ok(
        a,
        "/api/device/network/report",
        "POST",
        { device_id: "legacy", private_ip: "192.168.1.105" },
        true,
      );
      assert.equal(same.ip_changed, false);
      assert.equal(
        +(await dm.device(a.username, "legacy")).ip_changed_at,
        +initial.ip_changed_at,
      );
      await ok(
        a,
        "/api/device/network/report",
        "POST",
        { device_id: "legacy", private_ip: "192.168.1.106" },
        true,
      );
      await ok(
        a,
        "/api/device/network/report",
        "POST",
        { device_id: "run", private_ip: "192.168.1.106" },
        true,
      );
      for (const [id, prior] of [
        ["legacy", before],
        ["run", beforeRun],
      ]) {
        const after = (await dm.device(a.username, id)).toJSON();
        for (const key of [
          "last_seen",
          "started_at",
          "current_task",
          "current_uid",
          "reported_status",
          "last_error",
          "lan_id",
          "gateway_id",
          "updated_at",
        ])
          assert.equal(
            JSON.stringify(after[key]),
            JSON.stringify(prior[key]),
            key,
          );
      }
      assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
    },
  )();
  await record(
    "Private/public/loopback/multicast/unspecified/invalid + spoof/missing auth/device rejected",
    async () => {
      for (const ip of [
        "8.8.8.8",
        "127.0.0.1",
        "224.1.1.1",
        "0.0.0.0",
        "172.15.0.1",
        "172.32.0.1",
        "192.168.01.1",
        "foo",
        "::1",
      ])
        assert.equal(
          (
            await request(
              a,
              "/api/device/network/report",
              "POST",
              { device_id: "run", private_ip: ip },
              true,
            )
          ).status,
          400,
        );
      for (const ip of [
        "10.0.0.1",
        "172.16.0.1",
        "172.31.255.254",
        "192.168.1.106",
      ])
        await ok(
          a,
          "/api/device/network/report",
          "POST",
          { device_id: "run", private_ip: ip },
          true,
        );
      assert.equal(
        (
          await request(
            a,
            "/api/device/network/report",
            "POST",
            { device_id: "run", private_ip: "10.0.0.1", lan_id: lan1.id },
            true,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            a,
            "/api/device/network/report",
            "POST",
            { device_id: "missing", private_ip: "10.0.0.1" },
            true,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            b,
            "/api/device/network/report",
            "POST",
            { device_id: "run", private_ip: "10.0.0.1" },
            true,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            null,
            "/api/device/network/report",
            "POST",
            { device_id: "run", private_ip: "10.0.0.1" },
            true,
          )
        ).status,
        401,
      );
    },
  )();
  await record(
    "SQL combined filters + group counts + own-only devices",
    async () => {
      const rows = await ok(
        a,
        "/api/device-manager?lan_id=" +
          lan1.id +
          "&group_id=" +
          group.id +
          "&status=OFFLINE&ssh_status=UNKNOWN&private_ip=192.168.1.106",
      );
      assert.equal(rows.total, 1);
      assert.equal(rows.rows[0].device_id, "legacy");
      assert.equal(rows.rows[0].ssh_status, "UNKNOWN");
      assert.equal((await ok(b, "/api/device-manager")).summary.total, 1);
      assert(!JSON.stringify(rows).includes("ssh_credentials"));
    },
  )();
  await record(
    "Permission deny at backend; grants use existing admin + AppSetting",
    async () => {
      assert.equal(
        (
          await request(b, "/api/device-manager/gateways", "POST", {
            name: "Denied",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(b, "/api/device-manager/permissions/dm_a", "PUT", {
            permissions: ["DEVICE_VIEW"],
          })
        ).status,
        403,
      );
      await ok(a, "/api/device-manager/permissions/dm_b", "PUT", {
        permissions: ["DEVICE_VIEW"],
      });
      assert.equal(
        (
          await request(b, "/api/device-manager/groups", "POST", {
            name: "Denied",
          })
        ).status,
        403,
      );
    },
  )();
  await record(
    "Gateway token hash/non-retrieval; mapping owner and fresh-only status",
    async () => {
      g = await ok(a, "/api/device-manager/gateways", "POST", {
        name: "Windows",
        max_connections: 2,
      });
      assert(g.token.length >= 32);
      assert(!g.token_hash);
      assert(
        !JSON.stringify(await ok(a, "/api/device-manager/catalog")).includes(
          g.token,
        ),
      );
      await ok(a, "/api/device-manager/gateways/" + g.id, "PATCH", {
        lan_ids: [lan1.id, lan2.id],
      });
      const foreign = await Lan.create({
        owner_username: b.username,
        name: "Other",
      });
      assert.equal(
        (
          await request(a, "/api/device-manager/gateways/" + g.id, "PATCH", {
            lan_ids: [foreign.id],
          })
        ).status,
        404,
      );
      assert.equal(
        (await ok(a, "/api/device-manager/catalog")).gateways[0].status,
        "OFFLINE",
      );
      assert.equal(
        (
          await request(a, "/api/device-manager/actions", "POST", {
            device_ids: ["run"],
            action: "SSH_CHECK",
            request_id: crypto.randomUUID(),
          })
        ).body.data.actions[0].error_code,
        "DEVICE_NETWORK_NOT_CONFIGURED",
      );
    },
  )();
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const hostKey = privateKey.export({ type: "pkcs1", format: "pem" });
  const ssh2 = require("../../gateway/node_modules/ssh2");
  let observedFingerprint,
    authCount = 0;
  sshServer = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      if (
        ctx.username === "synthetic" &&
        ctx.password === "synthetic-password"
      ) {
        authCount++;
        ctx.accept();
      } else ctx.reject();
    });
    client.on("ready", () =>
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (accept) => accept());
        session.on("window-change", (accept) => accept && accept());
        session.on("shell", (accept) => {
          const stream = accept();
          stream.write("synthetic shell\r\n");
          stream.on("data", (chunk) => stream.write(chunk));
        });
        session.on("exec", (accept, reject, info) => {
          events.push(info.command);
          const stream = accept();
          if (info.command.includes("Shared/AppGroup"))
            stream.write(
              "/var/mobile/Containers/Shared/AppGroup/.jbroot-AC87784A1614A5BE\n",
            );
          else if (info.command.includes("ps -A")) stream.write("AutoTouch\n");
          else if (info.command.includes("uname"))
            stream.write("mock iPhone\n");
          stream.exit(0);
          stream.end();
        });
      }),
    );
  });
  await new Promise((r) => sshServer.listen(0, "127.0.0.1", r));
  // Only in this isolated test, transport goes to localhost; production adapter still routes private IP.
  const originalConnect = ssh2.Client.prototype.connect;
  ssh2.Client.prototype.connect = function (config) {
    const verifier = config.hostVerifier;
    return originalConnect.call(this, {
      ...config,
      host: "127.0.0.1",
      port: sshServer.address().port,
      hostVerifier: (hash) => {
        observedFingerprint = hash;
        return verifier(hash);
      },
    });
  };
  // Obtain mock server fingerprint from a trusted test handshake (not production auto-trust).
  const probe = new ssh2.Client();
  await new Promise((resolve, reject) => {
    probe.once("ready", () => {
      probe.end();
      resolve();
    });
    probe.once("error", reject);
    probe.connect({
      host: "127.0.0.1",
      port: sshServer.address().port,
      username: "synthetic",
      password: "synthetic-password",
      hostHash: "sha256",
      hostVerifier: (hash) => {
        observedFingerprint = hash;
        return true;
      },
    });
  });
  await ok(
    a,
    "/api/device/network/report",
    "POST",
    { device_id: "run", private_ip: "10.10.0.106" },
    true,
  );
  for (const id of ["legacy", "run"]) {
    await ok(a, "/api/device-manager/move", "POST", {
      device_ids: [id],
      lan_id: id === "legacy" ? lan1.id : lan2.id,
      gateway_id: g.id,
    });
    await ok(a, "/api/device-manager/devices/" + id, "PATCH", {
      credentials: { username: "synthetic", password: "synthetic-password" },
      host_fingerprint: observedFingerprint,
      command_adapter: "ROOTHIDE",
    });
  }
  await record(
    "Encrypted credentials at rest; no frontend disclosure",
    async () => {
      assert.deepEqual(
        (await ok(a, "/api/device-manager/permissions/dm_b")).permissions,
        ["DEVICE_VIEW"],
      );
      assert.equal(
        (await request(b, "/api/device-manager/permissions/dm_a")).status,
        403,
      );
      const stored = (await dm.device(a.username, "run")).ssh_credentials;
      assert(!stored.includes("synthetic-password"));
      assert.equal(sec.unseal(stored).password, "synthetic-password");
      const payload = await ok(a, "/api/device-manager/devices/run", "PATCH", {
        device_name: "RUN",
      });
      assert(!JSON.stringify(payload).includes("synthetic-password"));
      assert(!payload.ssh_credentials);
    },
  )();
  const http = require("http");
  wsServer = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  tunnelServer = http.createServer((req, res) => {
    res.writeHead(403);
    res.end();
  });
  broker = require("../src/services/deviceGatewayBroker").attach(wsServer, {
    gatewayTunnelServer: tunnelServer,
  });
  await new Promise((r) => tunnelServer.listen(0, "127.0.0.1", r));
  const tunnelBase = "ws://127.0.0.1:" + tunnelServer.address().port;
  await new Promise((r) => wsServer.listen(0, "127.0.0.1", r));
  const wsBase = "ws://127.0.0.1:" + wsServer.address().port;
  const { WebSocket } = require("../node_modules/ws");
  process.env.GATEWAY_ALLOW_LOCAL_TEST = "true";
  const journal = path.resolve(
    __dirname,
    "../../artifacts/dm-test-journal-" + crypto.randomUUID() + ".json",
  );
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  gateway = require("../../gateway/src").start(
    {
      server_url: wsBase + "/device-ws/gateway",
      lan_networks: {
        [lan1.id]: ["192.168.1.0/24"],
        [lan2.id]: ["10.10.0.0/24"],
      },
      max_connections: 2,
      journal_path: journal,
    },
    g.token,
  );
  await wait(() => broker.gateways.has(g.id));
  await wait(async () => (await dm.owned(Gateway, a.username, g.id)).last_seen);
  await record(
    "Gateway invalid authentication rejected; actual reverse connection online",
    async () => {
      const bad = new WebSocket(wsBase + "/device-ws/gateway", {
        headers: {
          Authorization: "Bearer " + crypto.randomBytes(32).toString("hex"),
        },
      });
      await new Promise((r) => {
        bad.on("unexpected-response", (_, res) => {
          assert.equal(res.statusCode, 403);
          res.destroy();
          bad.terminate();
          r();
        });
        bad.on("error", () => {});
      });
      assert.equal(
        (await ok(a, "/api/device-manager/catalog")).gateways[0].status,
        "ONLINE",
      );
    },
  )();
  await record(
    "Automatic Gateway reconnect after backend socket close",
    async () => {
      const previous = broker.gateways.get(g.id);
      previous.socket.close();
      await wait(() => !broker.gateways.has(g.id));
      await wait(() => broker.gateways.has(g.id));
      assert(broker.gateways.get(g.id) !== previous);
    },
  )();
  const enqueue = async (action, ids = ["run"], extra = {}) =>
    (
      await ok(a, "/api/device-manager/actions", "POST", {
        action,
        device_ids: ids,
        request_id: crypto.randomUUID(),
        ...extra,
      })
    ).actions;
  const actionDone = async (id) => {
    await wait(
      async () =>
        !["QUEUED", "RUNNING"].includes((await Action.findByPk(id)).status),
    );
    return Action.findByPk(id);
  };
  await record(
    "Actual mock SSH check + AutoTouch process/script distinction",
    async () => {
      const [check] = await enqueue("SSH_CHECK");
      const done = await actionDone(check.id);
      assert.equal(done.status, "SUCCESS");
      const d = await dm.device(a.username, "run");
      assert.equal(d.ssh_status, "ONLINE");
      const [auto] = await enqueue("AUTOTOUCH_CHECK");
      const autoDone = await actionDone(auto.id);
      assert.equal(autoDone.result.autotouch_process, true);
      assert.equal(autoDone.result.script_status, "UNKNOWN");
      assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
    },
  )();
  await record(
    "Host-key mismatch blocks and does not become online",
    async () => {
      await ok(a, "/api/device-manager/devices/run", "PATCH", {
        host_fingerprint: "0".repeat(64),
      });
      const [job] = await enqueue("SSH_CHECK");
      const row = await actionDone(job.id);
      assert.equal(row.error_code, "HOST_KEY_MISMATCH");
      assert.equal((await dm.device(a.username, "run")).ssh_status, "UNKNOWN");
      await ok(a, "/api/device-manager/devices/run", "PATCH", {
        host_fingerprint: observedFingerprint,
      });
    },
  )();
  await record(
    "SSH authentication failure is tracked without leaking credentials",
    async () => {
      await ok(a, "/api/device-manager/devices/run", "PATCH", {
        credentials: { username: "synthetic", password: "wrong" },
      });
      const [job] = await enqueue("SSH_CHECK");
      const row = await actionDone(job.id);
      assert.equal(row.error_code, "SSH_AUTH_FAILED");
      assert(
        !JSON.stringify(await dm.history(a.username, "run")).includes("wrong"),
      );
      await ok(a, "/api/device-manager/devices/run", "PATCH", {
        credentials: { username: "synthetic", password: "synthetic-password" },
      });
    },
  )();
  await record(
    "Respring/Reboot confirmation/RUNNING warning and mock-only execution",
    async () => {
      assert.equal(
        (
          await request(a, "/api/device-manager/actions", "POST", {
            action: "REBOOT",
            device_ids: ["run"],
            request_id: crypto.randomUUID(),
          })
        ).status,
        409,
      );
      const denied = await enqueue("RESPRING", ["run"], { confirmed: true });
      assert.equal(
        denied[0].error_code,
        "RUNNING_DEVICE_CONFIRMATION_REQUIRED",
      );
      for (const action of ["RESPRING", "REBOOT"]) {
        const [job] = await enqueue(action, ["run"], {
          confirmed: true,
          confirm_running: true,
        });
        assert.equal((await actionDone(job.id)).status, "SUCCESS");
      }
      assert(events.some((c) => c.includes("killall")));
      assert(events.some((c) => c.includes("/sbin/reboot")));
    },
  )();
  await record(
    "Bulk routes both LANs, partial failure, queue concurrency and duplicate idempotency",
    async () => {
      const key = crypto.randomUUID();
      const jobs = await ok(a, "/api/device-manager/actions", "POST", {
        action: "DEVICE_INFO",
        device_ids: ["legacy", "run", "missing"],
        request_id: key,
      });
      assert.equal(jobs.actions[2].status, "REJECTED");
      for (const job of jobs.actions.slice(0, 2))
        assert.equal((await actionDone(job.id)).status, "SUCCESS");
      const duplicated = await ok(a, "/api/device-manager/actions", "POST", {
        action: "DEVICE_INFO",
        device_ids: ["legacy", "run"],
        request_id: key,
      });
      assert.equal(duplicated.actions[0].id, jobs.actions[0].id);
      assert.equal(await Action.count({ where: { request_key: key } }), 2);
      const count = events.filter((c) => c.includes("uname")).length;
      await broker.tick();
      assert.equal(events.filter((c) => c.includes("uname")).length, count);
    },
  )();
  await record(
    "Bulk SSH check/Respring/Reboot split by LAN with mock commands only",
    async () => {
      for (const action of ["SSH_CHECK", "RESPRING", "REBOOT"]) {
        const jobs = await enqueue(action, ["legacy", "run"], {
          confirmed: true,
          confirm_running: true,
        });
        for (const job of jobs)
          assert.equal((await actionDone(job.id)).status, "SUCCESS");
      }
      const recorded = await Action.findOne({
        where: {
          owner_username: a.username,
          action: "RESPRING",
          status: "SUCCESS",
        },
      });
      const before = events.filter((c) => c.includes("killall")).length;
      broker.gateways.get(g.id).socket.send(
        JSON.stringify({
          type: "action",
          id: recorded.id,
          action: "RESPRING",
          target: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(events.filter((c) => c.includes("killall")).length, before);
    },
  )();
  await record(
    "Wrong gateway-LAN mapping cannot be assigned by backend",
    async () => {
      const other = await ok(a, "/api/device-manager/gateways", "POST", {
        name: "Wrong network gateway",
      });
      await ok(a, "/api/device-manager/gateways/" + other.id, "PATCH", {
        lan_ids: [lan1.id],
      });
      assert.equal(
        (
          await request(a, "/api/device-manager/move", "POST", {
            device_ids: ["run"],
            lan_id: lan2.id,
            gateway_id: other.id,
          })
        ).status,
        400,
      );
      assert.equal((await dm.device(a.username, "run")).gateway_id, g.id);
    },
  )();
  await record(
    "Response lost after enqueue: retry same request_id executes once",
    async () => {
      app.post(
        "/test/drop-action-response",
        require("../src/middleware/jwtAuth"),
        async (req, res) => {
          await require("../src/services/deviceSshService").enqueue(
            req.authenticatedUser,
            req.body,
          );
          res.destroy();
        },
      );
      const request_id = crypto.randomUUID(),
        body = { device_ids: ["run"], action: "DEVICE_INFO", request_id };
      const before = events.filter((c) => c.includes("uname")).length;
      await assert.rejects(
        fetch(base + "/test/drop-action-response", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token(a),
          },
          body: JSON.stringify(body),
        }),
      );
      const retried = await ok(a, "/api/device-manager/actions", "POST", body);
      assert.equal((await actionDone(retried.actions[0].id)).status, "SUCCESS");
      assert.equal(
        await Action.count({
          where: { owner_username: a.username, request_key: request_id },
        }),
        1,
      );
      assert.equal(
        events.filter((c) => c.includes("uname")).length,
        before + 1,
      );
    },
  )();
  await record(
    "Gateway cannot route unapproved LAN/subnet; private IP duplicates remain independent",
    async () => {
      const adapter = require("../../gateway/src/sshAdapter");
      assert(
        adapter.allowed(
          { lan_id: lan1.id, ip: "192.168.1.106" },
          { lan_networks: { [lan1.id]: ["192.168.1.0/24"] } },
        ),
      );
      assert(
        !adapter.allowed(
          { lan_id: lan2.id, ip: "192.168.1.106" },
          { lan_networks: { [lan1.id]: ["192.168.1.0/24"] } },
        ),
      );
      assert.throws(
        () =>
          adapter.validateNetworks({
            lan_networks: {
              [lan1.id]: ["192.168.1.0/24"],
              [lan2.id]: ["192.168.1.0/24"],
            },
          }),
        /AMBIGUOUS_LAN_ROUTING/,
      );
      assert.throws(
        () =>
          adapter.validateNetworks({
            lan_networks: { [lan1.id]: ["0.0.0.0/0"] },
          }),
        /PUBLIC_CIDR_DENIED/,
      );
      assert(
        !adapter.allowed(
          { lan_id: lan1.id, ip: "8.8.8.8" },
          { lan_networks: { [lan1.id]: ["192.168.1.0/24"] } },
        ),
      );
    },
  )();
  await record(
    "Terminal real mock connect/input/output/resize/disconnect; one-use ticket",
    async () => {
      const ticket = await ok(
        a,
        "/api/device-manager/devices/run/terminal",
        "POST",
        {},
      );
      const ws = new WebSocket(wsBase + ticket.path, {
        headers: { Origin: "http://127.0.0.1" },
      });
      sockets.push(ws);
      let output = "",
        ready = false;
      ws.on("message", (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "ready") ready = true;
        if (m.type === "data") output += m.data;
      });
      await new Promise((r) => ws.once("open", r));
      ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      await wait(() => ready);
      ws.send(JSON.stringify({ type: "input", data: "hello synthetic\r\n" }));
      ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
      await wait(() => output.includes("hello synthetic"));
      ws.close();
      await wait(
        async () => (await Session.findByPk(ticket.id)).status === "CLOSED",
      );
      const reused = new WebSocket(wsBase + ticket.path, {
        headers: { Origin: "http://127.0.0.1" },
      });
      sockets.push(reused);
      await new Promise((r) => reused.once("open", r));
      reused.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      await new Promise((r) => reused.once("close", r));
    },
  )();

  await record(
    "Concurrent browser sessions across two users and gateways remain isolated",
    async () => {
      await ok(a, "/api/device-manager/permissions/dm_b", "PUT", {
        permissions: ["DEVICE_VIEW", "DEVICE_SSH_TERMINAL"],
      });
      const otherLan = await Lan.create({
        owner_username: b.username,
        name: "Terminal LAN",
      });
      const other = await dm.createGateway(b.username, {
        name: "Other Windows",
        max_connections: 2,
      });
      await dm.updateGateway(b.username, other.id, { lan_ids: [otherLan.id] });
      await Device.update(
        {
          private_ip: "192.168.2.106",
          lan_id: otherLan.id,
          gateway_id: other.id,
          ssh_credentials: sec.seal({
            username: "synthetic",
            password: "synthetic-password",
          }),
          ssh_host_fingerprint: observedFingerprint,
          command_adapter: "ROOTHIDE",
        },
        { where: { owner_username: b.username, device_id: "foreign" } },
      );
      const otherAgent = require("../../gateway/src").start(
        {
          server_url: tunnelBase + "/device-ws/gateway",
          lan_networks: { [otherLan.id]: ["192.168.2.0/24"] },
          max_connections: 2,
          journal_path: journal + ".other",
        },
        other.token,
      );
      const opened = [];
      try {
        await wait(() => broker.gateways.has(other.id));
        const blocked = new WebSocket(tunnelBase + "/device-ws/terminal", {
          headers: { Origin: "http://127.0.0.1", "x-forwarded-proto": "https" },
        });
        sockets.push(blocked);
        await new Promise((resolve, reject) => {
          blocked.on("open", () =>
            reject(new Error("TUNNEL_BROWSER_ACCEPTED")),
          );
          blocked.on("error", resolve);
        });
        assert.equal(
          (
            await request(
              a,
              "/api/device-manager/devices/foreign/terminal",
              "POST",
              {},
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              b,
              "/api/device-manager/devices/run/terminal",
              "POST",
              {},
            )
          ).status,
          404,
        );
        for (const [owner, id, marker] of [
          [a, "legacy", "only-session-a"],
          [a, "run", "only-session-b"],
          [b, "foreign", "only-session-c"],
        ]) {
          const ticket = await ok(
            owner,
            "/api/device-manager/devices/" + id + "/terminal",
            "POST",
            {},
          );
          const ws = new WebSocket(wsBase + ticket.path, {
            headers: { Origin: "http://127.0.0.1" },
          });
          sockets.push(ws);
          const item = { ws, ticket, marker, ready: false, output: "" };
          opened.push(item);
          ws.on("message", (raw) => {
            const m = JSON.parse(raw);
            if (m.type === "ready") item.ready = true;
            if (m.type === "data") item.output += m.data;
          });
          await new Promise((r) => ws.once("open", r));
          ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
        }
        await wait(() => opened.every((v) => v.ready));
        assert.equal(broker.sessions.size, 3);
        for (const item of opened)
          item.ws.send(
            JSON.stringify({
              type: "input",
              id: opened[2].ticket.id,
              data: item.marker + "\r\n",
            }),
          );
        await wait(() => opened.every((v) => v.output.includes(v.marker)));
        for (const item of opened)
          for (const otherItem of opened)
            if (item !== otherItem)
              assert(!item.output.includes(otherItem.marker));
        const rows = await Promise.all(
          opened.map((v) => Session.findByPk(v.ticket.id)),
        );
        assert.equal(rows[0].owner_username, a.username);
        assert.equal(rows[1].gateway_id, g.id);
        assert.equal(rows[2].owner_username, b.username);
        assert.equal(rows[2].gateway_id, other.id);
      } finally {
        for (const v of opened) v.ws.close();
        await wait(() =>
          opened.every((v) => !broker.sessions.has(v.ticket.id)),
        );
        otherAgent.close();
        await wait(() => !broker.gateways.has(other.id));
        await ok(a, "/api/device-manager/permissions/dm_b", "PUT", {
          permissions: ["DEVICE_VIEW"],
        });
      }
    },
  )();
  await record(
    "Terminal permission denied and expired session ends without task effects",
    async () => {
      assert.equal(
        (
          await request(
            b,
            "/api/device-manager/devices/foreign/terminal",
            "POST",
            {},
          )
        ).status,
        403,
      );
      const ticket = await ok(
        a,
        "/api/device-manager/devices/run/terminal",
        "POST",
        {},
      );
      const ws = new WebSocket(wsBase + ticket.path, {
        headers: { Origin: "http://127.0.0.1" },
      });
      sockets.push(ws);
      await new Promise((r) => ws.once("open", r));
      ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      await wait(() => broker.sessions.has(ticket.id));
      broker.sessions.get(ticket.id).created = Date.now() - 900001;
      await broker.tick();
      await wait(
        async () => (await Session.findByPk(ticket.id)).status === "CLOSED",
      );
      assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
    },
  )();
  await record(
    "Gateway disconnect/reconnect remains separate from Device heartbeat",
    async () => {
      const before = +(await dm.device(a.username, "legacy")).last_seen;
      gateway.close();
      await wait(() => !broker.gateways.has(g.id));
      assert.equal(
        (await ok(a, "/api/device-manager/catalog")).gateways[0].status,
        "OFFLINE",
      );
      assert.equal(+(await dm.device(a.username, "legacy")).last_seen, before);
      gateway = require("../../gateway/src").start(
        {
          server_url: wsBase + "/device-ws/gateway",
          lan_networks: {
            [lan1.id]: ["192.168.1.0/24"],
            [lan2.id]: ["10.10.0.0/24"],
          },
          max_connections: 2,
          journal_path: journal,
        },
        g.token,
      );
      await wait(() => broker.gateways.has(g.id));
    },
  )();
  await record(
    "Heartbeat response remains unchanged after management models load",
    async () => {
      const response = await ok(
        b,
        "/api/device/heartbeat",
        "POST",
        { device_id: "foreign", status: "IDLE" },
        true,
      );
      assert(response.device.last_seen);
      for (const field of [
        "private_ip",
        "ssh_credentials",
        "lan_id",
        "gateway_id",
        "ssh_status",
        "command_adapter",
      ])
        assert(!Object.hasOwn(response.device, field), field);
    },
  )();
  await record("Permission revocation rejects queued SSH", async () => {
    await require("../src/models/AppSetting").upsert({
      owner_username: a.username,
      setting_key: "device_manager_permissions",
      setting_value: JSON.stringify(["DEVICE_VIEW"]),
    });
    await a.update({ role: "user" });
    const queued = await Action.create({
      owner_username: a.username,
      device_id: "run",
      gateway_id: g.id,
      action: "SSH_CHECK",
      request_key: crypto.randomUUID(),
      status: "QUEUED",
      snapshot: sec.seal({}),
    });
    await broker.tick();
    await wait(
      async () => (await Action.findByPk(queued.id)).status === "REJECTED",
    );
    assert.equal(
      (await Action.findByPk(queued.id)).error_code,
      "PERMISSION_DENIED",
    );
    await a.update({ role: "admin" });
  })();
  await record(
    "SSH handshake timeout is tracked against mock blackhole only",
    async () => {
      const net = require("net"),
        peers = [];
      const blackhole = net.createServer((s) => {
        peers.push(s);
      });
      await new Promise((r) => blackhole.listen(0, "127.0.0.1", r));
      const patch = ssh2.Client.prototype.connect;
      ssh2.Client.prototype.connect = function (config) {
        return originalConnect.call(this, {
          ...config,
          host: "127.0.0.1",
          port: blackhole.address().port,
          readyTimeout: 1000,
        });
      };
      try {
        const adapter = require("../../gateway/src/sshAdapter");
        await assert.rejects(
          adapter.connect(
            {
              ip: "192.168.1.106",
              lan_id: lan1.id,
              host_fingerprint: observedFingerprint,
              credentials: {
                username: "synthetic",
                password: "synthetic-password",
              },
            },
            { lan_networks: { [lan1.id]: ["192.168.1.0/24"] } },
          ),
          (e) => e.code === "SSH_TIMEOUT",
        );
      } finally {
        ssh2.Client.prototype.connect = patch;
        for (const p of peers) p.destroy();
        blackhole.close();
      }
    },
  )();
  await record(
    "Feature off/HTTPS/origin fail closed; no automatic model loading at app startup",
    async () => {
      const before = +(await dm.device(a.username, "legacy")).last_seen;
      process.env.DEVICE_MANAGER_ENABLED = "false";
      assert.equal(
        (
          await request(
            a,
            "/api/device/network/report",
            "POST",
            { device_id: "legacy", private_ip: "192.168.1.106" },
            true,
          )
        ).status,
        503,
      );
      process.env.DEVICE_MANAGER_ENABLED = "true";
      assert.equal(+(await dm.device(a.username, "legacy")).last_seen, before);
      const oldSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
      process.env.NODE_ENV = "production";
      try {
        assert.equal(
          (await request(a, "/api/device-manager/catalog")).status,
          426,
        );
        assert.equal(
          (
            await request(
              a,
              "/api/device/network/report",
              "POST",
              { device_id: "legacy", private_ip: "192.168.1.106" },
              true,
            )
          ).status,
          426,
        );
      } finally {
        process.env.NODE_ENV = "test";
        if (oldSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = oldSecret;
      }
      const child = require("child_process").spawnSync(
        process.execPath,
        [
          "-e",
          "require('./backend/src/app');const db=require('./backend/src/config/database');if(db.models.DeviceGroup||db.models.ManagedDashboardDevice)process.exit(1);db.close();",
        ],
        {
          cwd: path.resolve(__dirname, "../.."),
          encoding: "utf8",
          env: { ...process.env, DEVICE_MANAGER_ENABLED: "false" },
        },
      );
      assert.equal(child.status, 0, "Startup eagerly loaded management models");
      process.env.DEVICE_MANAGER_ORIGIN = "http://127.0.0.1";
      const bad = new WebSocket(wsBase + "/device-ws/terminal", {
        headers: { Origin: "https://invalid.example" },
      });
      await new Promise((r) => {
        bad.on("unexpected-response", (_, res) => {
          assert.equal(res.statusCode, 403);
          res.destroy();
          bad.terminate();
          r();
        });
        bad.on("error", () => {});
      });
      delete process.env.DEVICE_MANAGER_ORIGIN;
    },
  )();
  await record(
    "Active terminal closes when permission is revoked",
    async () => {
      const ticket = await ok(
        a,
        "/api/device-manager/devices/run/terminal",
        "POST",
        {},
      );
      const ws = new WebSocket(wsBase + ticket.path, {
        headers: { Origin: "http://127.0.0.1" },
      });
      sockets.push(ws);
      await new Promise((r) => ws.once("open", r));
      ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      await wait(() => broker.sessions.has(ticket.id));
      await a.update({ role: "user" });
      try {
        await broker.tick();
        await wait(
          async () => (await Session.findByPk(ticket.id)).status === "CLOSED",
        );
      } finally {
        await a.update({ role: "admin" });
      }
    },
  )();
  await record(
    "Gateway queue full rejects extra job; broker command timeout is UNKNOWN, never resets task",
    async () => {
      const queueGateway = await Gateway.create({
        owner_username: a.username,
        name: "Queue fixture",
        token_hash: sec.hash(crypto.randomUUID()),
        last_seen: new Date(),
        max_connections: 2,
      });
      await Mapping.create({
        owner_username: a.username,
        gateway_id: queueGateway.id,
        lan_id: lan2.id,
      });
      await dm.move(a.username, {
        device_ids: ["run"],
        lan_id: lan2.id,
        gateway_id: queueGateway.id,
      });
      const queued = [];
      for (let i = 0; i < 1000; i++)
        queued.push({
          owner_username: a.username,
          device_id: "legacy",
          gateway_id: queueGateway.id,
          action: "SSH_CHECK",
          request_key: crypto.randomUUID(),
          status: "QUEUED",
        });
      await Action.bulkCreate(queued);
      const over = await enqueue("SSH_CHECK");
      assert.equal(over[0].error_code, "GATEWAY_QUEUE_FULL");
      await Action.destroy({
        where: {
          gateway_id: queueGateway.id,
          status: "QUEUED",
          snapshot: null,
        },
      });
      await dm.move(a.username, {
        device_ids: ["run"],
        lan_id: lan2.id,
        gateway_id: g.id,
      });
      await queueGateway.destroy();
      const stale = await Action.create({
        owner_username: a.username,
        device_id: "legacy",
        gateway_id: g.id,
        action: "SSH_CHECK",
        request_key: crypto.randomUUID(),
        status: "RUNNING",
        started_at: new Date(Date.now() - 46000),
      });
      await broker.tick();
      await wait(
        async () => (await Action.findByPk(stale.id)).status === "UNKNOWN",
      );
      assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
    },
  )();
  await record(
    "Duplicate destructive request and explicit safe retry",
    async () => {
      const key = crypto.randomUUID();
      const before = events.filter((c) => c.includes("killall")).length;
      const calls = await Promise.all(
        Array.from({ length: 3 }, () =>
          ok(a, "/api/device-manager/actions", "POST", {
            action: "RESPRING",
            device_ids: ["run"],
            request_id: key,
            confirmed: true,
            confirm_running: true,
          }),
        ),
      );
      assert.equal(new Set(calls.map((r) => r.actions[0].id)).size, 1);
      await actionDone(calls[0].actions[0].id);
      assert.equal(
        events.filter((c) => c.includes("killall")).length,
        before + 1,
      );
      const retry = (await enqueue("SSH_CHECK"))[0];
      assert.equal((await actionDone(retry.id)).status, "SUCCESS");
    },
  )();
  await record(
    "Migration adds foreign keys to existing device table",
    async () => {
      assert(
        (await Device.count({ where: { owner_username: a.username } })) > 0,
      );
      const constraints = await db
        .getQueryInterface()
        .getForeignKeyReferencesForTable("dashboard_devices");
      assert(constraints.some((c) => c.columnName === "lan_id"));
      const foreign = await Group.create({
        owner_username: b.username,
        name: "FK other tenant",
      });
      await assert.rejects(
        Device.update(
          { device_group_id: foreign.id },
          { where: { owner_username: a.username, device_id: "run" } },
        ),
        (e) => e.name === "SequelizeForeignKeyConstraintError",
      );
    },
  )();
  await record(
    "Performance SQL list 10/50/100/200/500/1000 devices on disposable DB",
    async () => {
      const perf = [];
      for (const count of [10, 50, 100, 200, 500, 1000]) {
        const existing = await Device.count({
          where: { owner_username: a.username },
        });
        if (existing < count)
          await Device.bulkCreate(
            Array.from({ length: count - existing }, (_, i) => ({
              owner_username: a.username,
              device_id: "load_" + existing + "_" + i,
              last_seen: new Date(),
            })),
          );
        const cpu = process.cpuUsage(),
          start = performance.now();
        const queryTimes = [];
        const originalQuery = db.query.bind(db);
        db.query = async (...args) => {
          const at = performance.now();
          try {
            return await originalQuery(...args);
          } finally {
            queryTimes.push(performance.now() - at);
          }
        };
        const data = await dm.list(a.username, { page: 1, page_size: 100 });
        db.query = originalQuery;
        perf.push({
          sql_queries: queryTimes.length,
          sql_time_ms: Math.round(queryTimes.reduce((a, b) => a + b, 0)),
          devices: count,
          latency_ms: Math.round(performance.now() - start),
          rss_bytes: process.memoryUsage().rss,
          cpu_us: process.cpuUsage(cpu).user,
          rows: data.rows.length,
        });
        assert.equal(data.summary.total, count);
        assert(data.rows.length <= 100);
      }
      fs.mkdirSync(path.resolve(__dirname, "../tests/device-manager"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.resolve(__dirname, "../tests/device-manager/performance.json"),
        JSON.stringify(
          {
            scope:
              "Local SQL/API service; one mock Gateway, not real farm capacity",
            samples: perf,
          },
          null,
          2,
        ),
      );
    },
  )();
  assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
  assert.equal(
    +(await dm.device(a.username, "legacy")).last_seen < Date.now() - 1800000,
    true,
  );
  if (process.argv.includes("--ui")) {
    const esbuild = require("../../frontend/node_modules/esbuild");
    const bundle = esbuild.buildSync({
      stdin: {
        contents:
          "import React from 'react';import{createRoot}from'react-dom/client';import App from './App';import './index.css';createRoot(document.getElementById('root')).render(<App/>);",
        resolveDir: path.resolve(__dirname, "../../frontend/src"),
        loader: "jsx",
      },
      bundle: true,
      write: false,
      outfile: "preview.js",
      jsx: "automatic",
      format: "iife",
      define: { "import.meta.env.VITE_API_BASE_URL": "undefined" },
    });
    app.get("/preview.js", (req, res) =>
      res
        .type("js")
        .send(bundle.outputFiles.find((f) => f.path.endsWith(".js")).text),
    );
    app.get("/preview.css", (req, res) =>
      res
        .type("css")
        .send(bundle.outputFiles.find((f) => f.path.endsWith(".css")).text),
    );
    app.use(
      "/assets",
      express.static(path.resolve(__dirname, "../../frontend/public/assets")),
    );
    const html = fs
      .readFileSync(
        path.resolve(__dirname, "../../frontend/index.html"),
        "utf8",
      )
      .replace(
        '<script type="module" src="/src/main.jsx"></script>',
        '<link rel="stylesheet" href="/preview.css"><script src="/preview.js"></script>',
      );
    app.get(["/login", "/chrome-khang-stats"], (req, res) => res.send(html));
    const { Builder, By, logging } = require("selenium-webdriver"),
      chrome = require("selenium-webdriver/chrome");
    const prefs = new logging.Preferences();
    prefs.setLevel(logging.Type.BROWSER, logging.Level.SEVERE);
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
      .setLoggingPrefs(prefs)
      .build();
    try {
      await browser.get(base + "/login");
      await browser.executeScript(
        'localStorage.setItem("tiktok_admin_token",arguments[0]);localStorage.setItem("tiktok_admin_user","dm_a");localStorage.setItem("tiktok_admin_role","admin");',
        token(a),
      );
      await browser.get(base + "/chrome-khang-stats");
      const waitJs = async (code) => {
        try {
          return await browser.wait(() => browser.executeScript(code), 20000);
        } catch (e) {
          e.message += " Selector: " + code;
          throw e;
        }
      };
      await waitJs(
        'return document.querySelectorAll(".dm-card tbody tr").length===50',
      );
      assert.equal(
        await browser.findElement(By.css(".dm-header h1")).getText(),
        "Quản lý thiết bị",
      );
      await browser
        .findElement(By.css('input[aria-label="Tìm thiết bị"]'))
        .sendKeys("legacy");
      await waitJs(
        'return document.querySelectorAll(".dm-card tbody tr").length===1',
      );
      await browser.findElement(By.css(".dm-card tbody tr button")).click();
      await waitJs('return !!document.querySelector(".dm-dialog")');
      assert(
        (await browser.findElement(By.css(".dm-dialog")).getText()).includes(
          "OFFLINE",
        ),
      );
      await browser
        .findElement(By.css(".dm-dialog .dm-tabs button:nth-child(3)"))
        .click();
      await waitJs(
        'return document.querySelector(".dm-dialog").textContent.includes("SSH_CHECK")',
      );
      await browser.findElement(By.css(".dm-dialog .dm-header button")).click();
      await browser
        .findElement(By.css(".dm-page > .dm-tabs button:nth-child(2)"))
        .click();
      await waitJs(
        'return document.querySelector(".dm-card").textContent.includes("Farm A")',
      );
      await browser
        .findElement(By.css(".dm-page > .dm-tabs button:nth-child(3)"))
        .click();
      await waitJs(
        'return document.querySelector(".dm-card").textContent.includes("LAN 1")',
      );
      await browser
        .findElement(By.css(".dm-page > .dm-tabs button:nth-child(4)"))
        .click();
      await waitJs(
        'return document.querySelector(".dm-card").textContent.includes("Windows")',
      );
      await browser.sendDevToolsCommand("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert(
        await browser.executeScript(
          "return document.documentElement.scrollWidth<=innerWidth",
        ),
        "Mobile overflow",
      );
      fs.writeFileSync(
        path.resolve(__dirname, "../../artifacts/device-manager-mobile.png"),
        await browser.takeScreenshot(),
        "base64",
      );
      const logs = await browser.manage().logs().get(logging.Type.BROWSER);
      assert.equal(logs.length, 0, JSON.stringify(logs.map((l) => l.message)));
      results.push({
        test: "Real Chrome Device Manager filter/detail/history/group/LAN/Gateway/mobile",
        status: "PASS",
      });
      console.log("DEVICE_MANAGER_UI_OK");
    } finally {
      await browser.quit();
    }
  }
  gateway.close();
  gateway = null;
  await broker.close();
  broker = null;
  await record(
    "Actual rollback/reapply preserves 1000 devices and running task",
    async () => {
      await migration.down();
      const [rows] = await db.query(
        "SELECT COUNT(*) total FROM dashboard_devices WHERE owner_username=:owner",
        { replacements: { owner: a.username } },
      );
      assert.equal(Number(rows[0].total), 1000);
      const cols = await db
        .getQueryInterface()
        .describeTable("dashboard_devices");
      assert(!cols.private_ip);
      assert.equal((await Run.findByPk(run.id)).status, "RUNNING");
      await migration.up();
      assert.equal(
        await Device.count({ where: { owner_username: a.username } }),
        1000,
      );
    },
  )();
  fs.writeFileSync(
    path.resolve(__dirname, "../tests/device-manager/results.json"),
    JSON.stringify(
      {
        results,
        mock_ssh: true,
        real_reboot_respring: false,
        ssh_authentications: authCount,
      },
      null,
      2,
    ),
  );
  console.log(
    "DEVICE_MANAGER_OK " +
      results.length +
      " test groups; no physical commands or production writes",
  );
})()
  .catch((err) => {
    console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of sockets) s.terminate();
    gateway?.close();
    if (broker) await broker.close();
    if (wsServer) wsServer.close();
    if (tunnelServer) tunnelServer.close();
    if (sshServer) sshServer.close();
    if (server) await new Promise((r) => server.close(r));
    if (db) await db.close();
    if (
      created &&
      /^quanly_dm_test_\d+_[a-f0-9]+$/.test(name) &&
      name !== original
    )
      await manager.query("DROP DATABASE `" + name + "`");
    await manager.close();
  });
