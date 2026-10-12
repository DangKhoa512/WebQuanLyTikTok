const { Client } = require("ssh2");
const net = require("net");
function ipNumber(ip) {
  return ip.split(".").reduce((n, v) => (n * 256 + Number(v)) >>> 0, 0);
}
function inCidr(ip, cidr) {
  if (typeof cidr !== "string") return false;
  const [base, bits] = cidr.split("/");
  if (
    net.isIP(ip) !== 4 ||
    net.isIP(base) !== 4 ||
    !/^\d+$/.test(bits) ||
    Number(bits) < 0 ||
    Number(bits) > 32
  )
    return false;
  const mask =
    Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  return (ipNumber(ip) & mask) === (ipNumber(base) & mask);
}
function privateAddress(ip) {
  if (net.isIP(ip) !== 4) return false;
  const a = ip.split(".").map(Number);
  return (
    a[0] === 10 ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && a[1] === 168)
  );
}
function validateNetworks(config) {
  const ranges = [];
  if (
    !config.lan_networks ||
    typeof config.lan_networks !== "object" ||
    Array.isArray(config.lan_networks)
  )
    throw new Error("LAN_NETWORKS_REQUIRED");
  for (const [lan, networks] of Object.entries(config.lan_networks)) {
    if (!/^[1-9]\d*$/.test(lan) || !Array.isArray(networks) || !networks.length)
      throw new Error("INVALID_LAN_NETWORK");
    for (const cidr of networks) {
      const [base, bits] = String(cidr).split("/");
      if (net.isIP(base) !== 4 || !/^\d+$/.test(bits) || Number(bits) > 32)
        throw new Error("INVALID_LAN_NETWORK");
      const mask =
          Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0,
        lo = (ipNumber(base) & mask) >>> 0,
        hi = (lo | (~mask >>> 0)) >>> 0;
      const address = (n) =>
        [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
      if (!privateAddress(address(lo)) || !privateAddress(address(hi)))
        throw new Error("PUBLIC_CIDR_DENIED");
      for (const other of ranges)
        if (other.lan !== lan && lo <= other.hi && hi >= other.lo)
          throw new Error("AMBIGUOUS_LAN_ROUTING");
      ranges.push({ lan, lo, hi });
    }
  }
  return true;
}
function allowed(target, config) {
  const networks = config.lan_networks[String(target.lan_id)];
  return (
    Array.isArray(networks) &&
    privateAddress(target.ip) &&
    networks.some((c) => inCidr(target.ip, c))
  );
}
function connect(target, config, onClient = () => {}) {
  return new Promise((resolve, reject) => {
    if (!allowed(target, config))
      return reject(
        Object.assign(new Error("NETWORK_DENIED"), { code: "NETWORK_DENIED" }),
      );
    if (!/^[a-f0-9]{64}$/.test(target.host_fingerprint || ""))
      return reject(
        Object.assign(new Error("HOST_KEY_MISMATCH"), {
          code: "HOST_KEY_MISMATCH",
        }),
      );
    const client = new Client();
    onClient(client);
    let mismatch = false;
    client.once("ready", () => resolve(client));
    client.on("error", (e) => {
      client.destroy();
      reject(
        Object.assign(new Error("SSH_FAILED"), {
          code: mismatch
            ? "HOST_KEY_MISMATCH"
            : e.level === "client-authentication"
              ? "SSH_AUTH_FAILED"
              : e.level === "client-timeout"
                ? "SSH_TIMEOUT"
                : "SSH_FAILED",
        }),
      );
    });
    client.connect({
      host: target.ip,
      port: target.credentials.port || 22,
      username: target.credentials.username,
      password: target.credentials.password,
      privateKey: target.credentials.private_key,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
      hostHash: "sha256",
      hostVerifier: (hash) => {
        mismatch = hash !== target.host_fingerprint;
        return !mismatch;
      },
    });
  });
}
function exec(client, command) {
  return new Promise((resolve, reject) => {
    let result = "",
      done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => {
      client.destroy();
      finish(Object.assign(new Error("SSH_TIMEOUT"), { code: "SSH_TIMEOUT" }));
    }, 20000);
    client.exec(command, (err, stream) => {
      if (err) return finish(err);
      stream.on("data", (chunk) => {
        result += chunk.toString();
        if (result.length > 16000) {
          stream.close();
          finish(new Error("Output limit"));
        }
      });
      stream.stderr.on("data", () => {});
      stream.on("error", (e) => finish(e));
      stream.on("close", (code) =>
        code === 0
          ? finish(null, result)
          : finish(
              Object.assign(new Error("Command failed"), {
                code: "SSH_FAILED",
              }),
            ),
      );
    });
  });
}
const rootCommand =
  'for p in /var/mobile/Containers/Shared/AppGroup/.jbroot-*; do [ -d "$p" ] && printf \'%s\\n\' "$p"; done';
async function action(client, kind, adapter) {
  if (kind === "SSH_CHECK") return { success: true, ssh_connected: true };
  if (kind === "DEVICE_INFO")
    return {
      success: true,
      ssh_connected: true,
      info: (await exec(client, "uname -a; uptime")).slice(0, 1000),
    };
  if (kind === "AUTOTOUCH_CHECK") {
    const output = await exec(
      client,
      "ps -A -o comm= | grep '[A]utoTouch' || true",
    );
    return {
      success: true,
      ssh_connected: true,
      autotouch_process: !!output.trim(),
      script_status: "UNKNOWN",
    };
  }
  if (!["RESPRING", "REBOOT"].includes(kind) || adapter !== "ROOTHIDE")
    throw Object.assign(new Error("ADAPTER_UNSUPPORTED"), {
      code: "ADAPTER_UNSUPPORTED",
    });
  const roots = (await exec(client, rootCommand)).trim().split(/\r?\n/);
  if (
    roots.length !== 1 ||
    !/^\/var\/mobile\/Containers\/Shared\/AppGroup\/\.jbroot-[A-Fa-f0-9]{16}$/.test(
      roots[0],
    )
  )
    throw Object.assign(new Error("ADAPTER_UNSUPPORTED"), {
      code: "ADAPTER_UNSUPPORTED",
    });
  const root = roots[0];
  // Request is audited before dispatch; a disconnect during these commands means UNKNOWN outcome.
  const command =
    kind === "RESPRING"
      ? `test -x '${root}/usr/bin/killall' && '${root}/usr/bin/killall' -9 SpringBoard`
      : `if [ -x '${root}/usr/sbin/reboot' ]; then '${root}/usr/sbin/reboot'; elif [ -x '${root}/sbin/reboot' ]; then '${root}/sbin/reboot'; elif [ -x /sbin/reboot ]; then /sbin/reboot; else exit 127; fi`;
  await exec(client, command);
  return { success: true, ssh_connected: true };
}
module.exports = { validateNetworks, allowed, inCidr, connect, exec, action };
