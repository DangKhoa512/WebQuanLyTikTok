const net = require("net");
const loopback = (ip) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
function tunnelPeerAllowed(socket) {
  if (loopback(socket.localAddress) && loopback(socket.remoteAddress))
    return true;
  // Optional Docker deployment: only a dedicated listener and exact trusted bridge peer.
  // Must be paired with a host-loopback-only published port; never auto-discovered.
  const allowed = String(process.env.DEVICE_MANAGER_TUNNEL_PEERS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return allowed.some(
    (ip) => net.isIP(ip) !== 0 && ip === socket.remoteAddress,
  );
}
function trustedProxy(ip) {
  if (loopback(ip)) return true;
  return String(process.env.DEVICE_MANAGER_PROXY_PEERS || "")
    .split(",")
    .some((v) => v.trim() && v.trim() === ip && net.isIP(ip) !== 0);
}
function validateUpgrade(req, path, tunnelOnly) {
  if (tunnelOnly) {
    if (path !== "/device-ws/gateway" || !tunnelPeerAllowed(req.socket))
      throw new Error("TUNNEL_GATEWAY_ONLY");
    return;
  }
  if (
    process.env.NODE_ENV === "production" &&
    !req.socket.encrypted &&
    (req.headers["x-forwarded-proto"] !== "https" ||
      !trustedProxy(req.socket.remoteAddress))
  )
    throw new Error("TLS_REQUIRED");
}
module.exports = { trustedProxy, loopback, tunnelPeerAllowed, validateUpgrade };
