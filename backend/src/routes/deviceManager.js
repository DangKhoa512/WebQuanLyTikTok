const express = require("express"),
  rateLimit = require("express-rate-limit");
const router = express.Router(),
  sec = require("../services/deviceManagerSecurity"),
  dm = require("../services/deviceManagerService"),
  ssh = require("../services/deviceSshService");
const { success, error } = require("../utils/response");
router.use(
  require("../middleware/jwtAuth"),
  sec.httpsOnly,
  (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  },
);
const wrap = (fn) => async (req, res, next) => {
  try {
    return success(res, await fn(req));
  } catch (e) {
    if (e.statusCode) return error(res, e.message, e.statusCode);
    if (e.name === "SequelizeUniqueConstraintError")
      return error(res, "DUPLICATE_NAME", 409);
    next(e);
  }
};
const permit = sec.requirePermission;
router.get(
  "/permissions",
  wrap((req) => sec.permissions(req.authenticatedUser)),
);
router.get(
  "/permissions/:username",
  wrap(async (req) => {
    if (req.authenticatedUser.role !== "admin") dm.fail("ADMIN_ONLY", 403);
    const user = await require("../models/User").findOne({
      where: { username: req.params.username, is_active: true },
      raw: true,
    });
    if (!user) dm.fail("USER_NOT_FOUND", 404);
    return {
      username: user.username,
      role: user.role,
      permissions: await sec.permissions(user),
    };
  }),
);
router.put(
  "/permissions/:username",
  sec.httpsOnly,
  wrap(async (req) => {
    if (req.authenticatedUser.role !== "admin") dm.fail("ADMIN_ONLY", 403);
    const user = await require("../models/User").findOne({
      where: { username: req.params.username, is_active: true },
    });
    if (!user) dm.fail("USER_NOT_FOUND", 404);
    if (
      !Array.isArray(req.body.permissions) ||
      req.body.permissions.some((p) => !sec.PERMISSIONS.includes(p))
    )
      dm.fail("INVALID_PERMISSIONS");
    await require("../models/AppSetting").upsert({
      owner_username: user.username,
      setting_key: "device_manager_permissions",
      setting_value: JSON.stringify([...new Set(req.body.permissions)]),
    });
    return { updated: true };
  }),
);
router.get(
  "/",
  permit("DEVICE_VIEW"),
  wrap((req) => dm.list(req.authenticatedUser.username, req.query)),
);
router.get(
  "/actions",
  permit("DEVICE_VIEW"),
  wrap(async (req) => {
    const where = { owner_username: req.authenticatedUser.username };
    if (req.query.request_id)
      where.request_key = String(req.query.request_id).slice(0, 100);
    return require("../models/DeviceManager").Action.findAll({
      where,
      attributes: { exclude: ["snapshot"] },
      order: [["created_at", "DESC"]],
      limit: req.query.request_id ? 1000 : 100,
      raw: true,
    });
  }),
);
router.get(
  "/catalog",
  permit("DEVICE_VIEW"),
  wrap((req) => dm.catalog(req.authenticatedUser.username)),
);
for (const kind of ["groups", "lans"]) {
  const permission =
    kind === "groups" ? "DEVICE_GROUP_MANAGE" : "DEVICE_LAN_MANAGE";
  router.post(
    "/" + kind,
    permit(permission),
    wrap((req) =>
      dm.saveCollection(req.authenticatedUser.username, kind, null, req.body),
    ),
  );
  router.patch(
    "/" + kind + "/:id",
    permit(permission),
    wrap((req) =>
      dm.saveCollection(
        req.authenticatedUser.username,
        kind,
        req.params.id,
        req.body,
      ),
    ),
  );
  router.delete(
    "/" + kind + "/:id",
    permit(permission),
    wrap((req) =>
      dm.deleteCollection(
        req.authenticatedUser.username,
        kind,
        req.params.id,
        req.body,
      ),
    ),
  );
}
router.post(
  "/move",
  permit("DEVICE_EDIT"),
  wrap(async (req) => {
    const p = await sec.permissions(req.authenticatedUser);
    if (req.body.device_ids?.length > 1 && !p.includes("DEVICE_BULK_ACTION"))
      dm.fail("PERMISSION_DENIED", 403);
    if (
      !p.includes(
        Object.hasOwn(req.body, "group_id")
          ? "DEVICE_GROUP_MANAGE"
          : "DEVICE_LAN_MANAGE",
      )
    )
      dm.fail("PERMISSION_DENIED", 403);
    return dm.move(req.authenticatedUser.username, req.body);
  }),
);
router.post(
  "/gateways",
  sec.httpsOnly,
  permit("GATEWAY_MANAGE"),
  wrap((req) => dm.createGateway(req.authenticatedUser.username, req.body)),
);
router.patch(
  "/gateways/:id",
  sec.httpsOnly,
  permit("GATEWAY_MANAGE"),
  wrap((req) =>
    dm.updateGateway(req.authenticatedUser.username, req.params.id, req.body),
  ),
);
router.get(
  "/devices/:device_id",
  permit("DEVICE_VIEW"),
  wrap(async (req) => {
    const result = await dm.list(req.authenticatedUser.username, {
      device_id: req.params.device_id,
    });
    if (!result.rows.length) dm.fail("DEVICE_NOT_FOUND", 404);
    return result.rows[0];
  }),
);
router.get(
  "/devices/:device_id/history",
  permit("DEVICE_VIEW"),
  wrap((req) =>
    dm.history(req.authenticatedUser.username, req.params.device_id),
  ),
);
router.patch(
  "/devices/:device_id",
  permit("DEVICE_EDIT"),
  wrap(async (req) => {
    if (
      req.body.credentials ||
      req.body.host_fingerprint !== undefined ||
      req.body.command_adapter !== undefined
    ) {
      if (
        !(await sec.permissions(req.authenticatedUser)).includes(
          "GATEWAY_MANAGE",
        )
      )
        dm.fail("PERMISSION_DENIED", 403);
      if (
        process.env.NODE_ENV === "production" &&
        !req.socket.encrypted &&
        (req.headers["x-forwarded-proto"] !== "https" ||
          !require("../services/deviceBrokerTransport").trustedProxy(
            req.socket.remoteAddress,
          ))
      )
        dm.fail("HTTPS_REQUIRED", 426);
    }
    return dm.configure(
      req.authenticatedUser.username,
      req.params.device_id,
      req.body,
    );
  }),
);
const controlLimit = rateLimit({
  windowMs: 60000,
  max: 60,
  keyGenerator: (req) => req.authenticatedUser.username,
  standardHeaders: true,
  legacyHeaders: false,
});
router.post(
  "/actions",
  sec.httpsOnly,
  controlLimit,
  wrap((req) => ssh.enqueue(req.authenticatedUser, req.body)),
);
router.post(
  "/devices/:device_id/terminal",
  sec.httpsOnly,
  controlLimit,
  permit("DEVICE_SSH_TERMINAL"),
  wrap((req) => ssh.terminal(req.authenticatedUser, req.params.device_id)),
);
module.exports = router;
