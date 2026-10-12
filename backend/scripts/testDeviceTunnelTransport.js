const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const http = require("http");
const { Server, utils } = require("../../gateway/node_modules/ssh2");
const WebSocket = require("../node_modules/ws");
const { open } = require("../../gateway/src/sshTunnel");
const transport = require("../src/services/deviceBrokerTransport");
async function main() {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const req = (remote = "127.0.0.1", encrypted = false) => ({
    socket: { localAddress: "127.0.0.1", remoteAddress: remote, encrypted },
    headers: {},
  });
  transport.validateUpgrade(req(), "/device-ws/gateway", true);
  assert.throws(
    () => transport.validateUpgrade(req(), "/device-ws/terminal", true),
    /TUNNEL_GATEWAY_ONLY/,
  );
  assert.throws(() =>
    transport.validateUpgrade(req("203.0.113.8"), "/device-ws/gateway", true),
  );
  const spoof = req("203.0.113.8");
  spoof.headers["x-forwarded-proto"] = "https";
  assert.throws(
    () => transport.validateUpgrade(spoof, "/device-ws/terminal", false),
    /TLS_REQUIRED/,
  );
  transport.validateUpgrade(
    req("203.0.113.8", true),
    "/device-ws/terminal",
    false,
  );
  const security = require("../src/services/deviceManagerSecurity");
  let denied = false,
    passed = false;
  security.httpsOnly(
    spoof,
    {
      status: (code) => {
        assert.equal(code, 426);
        return { json: () => (denied = true) };
      },
    },
    () => (passed = true),
  );
  assert(denied && !passed);
  security.httpsOnly(req("203.0.113.8", true), {}, () => (passed = true));
  assert(passed);
  process.env.NODE_ENV = oldEnv || "test";
  const dir = path.resolve(__dirname, "../../artifacts/tunnel-test");
  fs.mkdirSync(dir, { recursive: true });
  const key = crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" });
  const keyFile = path.join(dir, "fixture-key.pem");
  fs.writeFileSync(keyFile, key);
  process.env.GATEWAY_TUNNEL_KEY_FILE = keyFile;
  const parsed = utils.parseKey(key),
    fingerprint = crypto
      .createHash("sha256")
      .update(parsed.getPublicSSH())
      .digest("hex");
  const clients = new Set();
  let tunnel,
    second,
    web,
    vps,
    wss,
    channels = 0;
  try {
    web = http.createServer();
    wss = new WebSocket.Server({ server: web });
    wss.on("error", () => {});
    wss.on("connection", (ws, r) => {
      assert.equal(r.headers.authorization, "Bearer fixture-token");
      ws.on("message", (m) => ws.send(m));
    });
    await new Promise((resolve, reject) =>
      web.once("error", reject).listen(3002, "127.0.0.1", resolve),
    );
    vps = new Server({ hostKeys: [key] }, (client) => {
      clients.add(client);
      client.on("error", () => {});
      client.on("close", () => clients.delete(client));
      client.on("authentication", (ctx) => {
        if (
          ctx.username !== "fixture_gateway" ||
          ctx.method !== "publickey" ||
          !ctx.key.data.equals(parsed.getPublicSSH())
        )
          return ctx.reject();
        if (
          ctx.signature &&
          !parsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo)
        )
          return ctx.reject();
        ctx.accept();
      });
      client.on("tcpip", (accept, reject, info) => {
        if (info.destIP !== "127.0.0.1" || info.destPort !== 3002)
          return reject();
        channels++;
        const stream = accept(),
          sock = net.connect(3002, "127.0.0.1");
        stream.on("error", () => sock.destroy());
        sock.on("error", () => stream.destroy());
        stream.on("close", () => sock.destroy());
        sock.on("close", () => stream.destroy());
        stream.pipe(sock).pipe(stream);
      });
    });
    await new Promise((resolve, reject) =>
      vps.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const config = {
      ssh_tunnel: {
        host: "127.0.0.1",
        port: vps.address().port,
        username: "fixture_gateway",
        host_fingerprint: fingerprint,
      },
    };
    await assert.rejects(
      open({
        ssh_tunnel: { ...config.ssh_tunnel, host_fingerprint: "0".repeat(64) },
      }),
      /VPS_HOST_KEY_MISMATCH/,
    );
    let lostResolve;
    const lost = new Promise((r) => (lostResolve = r));
    tunnel = await open(config, lostResolve);
    second = await open(config);
    const echo = async (t, value) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(t.url, {
          headers: { Authorization: "Bearer fixture-token" },
        });
        ws.on("error", reject);
        ws.on("open", () => ws.send(value));
        ws.on("message", (m) => {
          assert.equal(String(m), value);
          ws.close();
          resolve();
        });
      });
    await Promise.all([echo(tunnel, "session-a"), echo(second, "session-b")]);
    assert.equal(channels, 2);
    for (const client of clients) client.end();
    assert.equal(
      await Promise.race([
        lost,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DISCONNECT_TIMEOUT")), 5000),
        ),
      ]),
      "SSH_TUNNEL_DISCONNECTED",
    );
    const result = {
      date: new Date().toISOString(),
      transport_guards: "PASS",
      ssh_public_key_auth: "PASS",
      host_key_mismatch: "PASS",
      two_parallel_encrypted_tunnels: "PASS",
      disconnect: "PASS",
      production_changed: false,
    };
    fs.writeFileSync(
      path.resolve(__dirname, "../tests/device-manager/tunnel-results.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  } finally {
    tunnel?.close();
    second?.close();
    for (const c of clients) c.end();
    for (const ws of wss?.clients || []) ws.terminate();
    await Promise.all(
      [web, vps]
        .filter(Boolean)
        .map((s) => new Promise((r) => s.close(() => r()))),
    );
    fs.rmSync(keyFile, { force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
