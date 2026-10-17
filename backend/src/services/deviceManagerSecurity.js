const crypto = require("crypto");
const net = require("net");
const AppSetting = require("../models/AppSetting");
const PERMISSIONS = [
  "DEVICE_VIEW",
  "DEVICE_EDIT",
  "DEVICE_GROUP_MANAGE",
  "DEVICE_LAN_MANAGE",
  "DEVICE_SSH_CHECK",
  "DEVICE_SSH_TERMINAL",
  "DEVICE_RESPRING",
  "DEVICE_REBOOT",
  "DEVICE_BULK_ACTION",
  "GATEWAY_MANAGE",
];
const DEFAULT = [
  "DEVICE_VIEW",
  "DEVICE_EDIT",
  "DEVICE_GROUP_MANAGE",
  "DEVICE_LAN_MANAGE",
];
const hash = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
function privateIp(ip) {
  if (typeof ip !== "string" || net.isIP(ip) !== 4) return false;
  const a = ip.split(".").map(Number);
  return (
    a[0] === 10 ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && a[1] === 168)
  );
}
function publicIp(ip) {
  if (typeof ip !== "string") return false;
  const value = ip.trim();
  const version = net.isIP(value);
  if (version === 4) {
    const a = value.split(".").map(Number);
    return !(
      privateIp(value) ||
      a[0] === 0 ||
      a[0] === 127 ||
      (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
      (a[0] === 169 && a[1] === 254) ||
      a[0] >= 224
    );
  }
  if (version !== 6) return false;
  const lower = value.toLowerCase();
  return !(
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("::ffff:") ||
    /^(fc|fd)/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff")
  );
}
function normalizeMac(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[:-]/g, "");
  if (!/^[0-9a-f]{12}$/i.test(compact)) return null;
  return compact
    .toUpperCase()
    .match(/.{2}/g)
    .join(":");
}
function key() {
  const k = Buffer.from(
    process.env.DEVICE_MANAGER_ENCRYPTION_KEY || "",
    "base64",
  );
  if (k.length !== 32)
    throw Object.assign(
      new Error("DEVICE_MANAGER_ENCRYPTION_KEY must be 32 bytes base64"),
      { statusCode: 503 },
    );
  return k;
}
function seal(value) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
function unseal(value) {
  const o = JSON.parse(value),
    c = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(o.iv, "base64"),
    );
  c.setAuthTag(Buffer.from(o.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      c.update(Buffer.from(o.data, "base64")),
      c.final(),
    ]).toString(),
  );
}
async function permissions(user) {
  if (user.role === "admin") return PERMISSIONS;
  const row = await AppSetting.findOne({
    where: {
      owner_username: user.username,
      setting_key: "device_manager_permissions",
    },
  });
  if (!row) return DEFAULT;
  try {
    const p = JSON.parse(row.setting_value);
    return Array.isArray(p) ? p.filter((x) => PERMISSIONS.includes(x)) : [];
  } catch {
    return [];
  }
}
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const allowed = await permissions(req.authenticatedUser);
      if (!allowed.includes(permission))
        return res
          .status(403)
          .json({ success: false, message: "PERMISSION_DENIED" });
      req.devicePermissions = allowed;
      next();
    } catch (e) {
      next(e);
    }
  };
}
function httpsOnly(req, res, next) {
  if (
    process.env.NODE_ENV === "production" &&
    !req.socket.encrypted &&
    (req.headers["x-forwarded-proto"] !== "https" ||
      !require("./deviceBrokerTransport").trustedProxy(
        req.socket.remoteAddress,
      ))
  )
    return res.status(426).json({ success: false, message: "HTTPS_REQUIRED" });
  next();
}
module.exports = {
  PERMISSIONS,
  DEFAULT,
  hash,
  privateIp,
  publicIp,
  normalizeMac,
  seal,
  unseal,
  permissions,
  requirePermission,
  httpsOnly,
};
