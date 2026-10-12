const fs = require("fs");
const net = require("net");
const { Client } = require("ssh2");
function validate(config) {
  const t = config.ssh_tunnel;
  if (
    !t ||
    typeof t.host !== "string" ||
    !t.host.trim() ||
    typeof t.username !== "string" ||
    !t.username.trim() ||
    !Number.isInteger(Number(t.port || 22)) ||
    Number(t.port || 22) < 1 ||
    Number(t.port || 22) > 65535
  )
    throw new Error("INVALID_TUNNEL_CONFIG");
  if (!/^[a-f0-9]{64}$/.test(t.host_fingerprint || ""))
    throw new Error("VPS_HOST_FINGERPRINT_REQUIRED");
  if (!process.env.GATEWAY_TUNNEL_KEY_FILE)
    throw new Error("GATEWAY_TUNNEL_KEY_FILE_REQUIRED");
  return t;
}
function open(config, onLost = () => {}) {
  const t = validate(config);
  const privateKey = fs.readFileSync(process.env.GATEWAY_TUNNEL_KEY_FILE);
  return new Promise((resolve, reject) => {
    const ssh = new Client(),
      peers = new Set();
    let server,
      closed = false,
      ready = false,
      mismatch = false;
    const close = () => {
      if (closed) return;
      closed = true;
      for (const p of peers) p.destroy();
      server?.close();
      ssh.destroy();
    };
    const fail = (code) => {
      close();
      if (!ready) reject(Object.assign(new Error(code), { code }));
      else onLost(code);
    };
    ssh.on("error", () =>
      fail(mismatch ? "VPS_HOST_KEY_MISMATCH" : "SSH_TUNNEL_FAILED"),
    );
    ssh.on("close", () => {
      if (!closed) fail("SSH_TUNNEL_DISCONNECTED");
    });
    ssh.once("ready", () => {
      server = net.createServer((local) => {
        if (closed || peers.size >= 32) {
          local.destroy();
          return;
        }
        peers.add(local);
        local.on("error", () => local.destroy());
        local.on("close", () => peers.delete(local));
        ssh.forwardOut(
          "127.0.0.1",
          local.remotePort || 0,
          "127.0.0.1",
          3002,
          (error, channel) => {
            if (error || closed || local.destroyed) {
              channel?.destroy();
              local.destroy();
              return;
            }
            channel.on("error", () => local.destroy());
            channel.on("close", () => local.destroy());
            local.on("close", () => channel.destroy());
            local.pipe(channel).pipe(local);
          },
        );
      });
      server.on("error", () => fail("SSH_TUNNEL_BIND_FAILED"));
      server.listen(0, "127.0.0.1", () => {
        ready = true;
        resolve({
          url: "ws://127.0.0.1:" + server.address().port + "/device-ws/gateway",
          close,
        });
      });
    });
    try {
      ssh.connect({
        host: t.host,
        port: Number(t.port || 22),
        username: t.username,
        privateKey,
        passphrase: process.env.GATEWAY_TUNNEL_KEY_PASSPHRASE,
        hostHash: "sha256",
        hostVerifier: (hash) => {
          mismatch = hash !== t.host_fingerprint;
          return !mismatch;
        },
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
      });
    } catch {
      fail("SSH_TUNNEL_FAILED");
    }
  });
}
module.exports = { validate, open };
