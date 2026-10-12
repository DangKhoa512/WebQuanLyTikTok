const crypto = require("crypto");
const { Op } = require("sequelize");
const db = require("../config/database");
const {
  Gateway,
  Mapping,
  Action,
  Session,
} = require("../models/DeviceManager");
const sec = require("./deviceManagerSecurity");
const dm = require("./deviceManagerService");
const ACTIONS = {
  SSH_CHECK: "DEVICE_SSH_CHECK",
  DEVICE_INFO: "DEVICE_SSH_CHECK",
  AUTOTOUCH_CHECK: "DEVICE_SSH_CHECK",
  RESPRING: "DEVICE_RESPRING",
  REBOOT: "DEVICE_REBOOT",
};
async function target(owner, id, t) {
  const d = await dm.device(owner, id, t);
  if (!d.lan_id || !d.gateway_id || !sec.privateIp(d.private_ip))
    dm.fail("DEVICE_NETWORK_NOT_CONFIGURED", 409);
  const g = await dm.owned(Gateway, owner, d.gateway_id, t);
  if (!dm.gatewayOnline(g)) dm.fail("GATEWAY_OFFLINE", 409);
  const mapping = await Mapping.findOne({
    where: { owner_username: owner, lan_id: d.lan_id, gateway_id: g.id },
    transaction: t,
  });
  if (!mapping) dm.fail("GATEWAY_LAN_DENIED", 403);
  if (!d.ssh_credentials || !d.ssh_host_fingerprint)
    dm.fail("SSH_CREDENTIALS_OR_HOST_KEY_REQUIRED", 409);
  return { device: d, gateway: g };
}
async function enqueue(user, body) {
  if (!ACTIONS[body.action]) dm.fail("INVALID_ACTION");
  const allowed = await sec.permissions(user);
  if (!allowed.includes(ACTIONS[body.action]))
    dm.fail("PERMISSION_DENIED", 403);
  if (
    !Array.isArray(body.device_ids) ||
    !body.device_ids.length ||
    body.device_ids.length > 1000 ||
    body.device_ids.some((id) => typeof id !== "string") ||
    new Set(body.device_ids).size !== body.device_ids.length
  )
    dm.fail("INVALID_DEVICE_IDS");
  if (body.device_ids.length > 1 && !allowed.includes("DEVICE_BULK_ACTION"))
    dm.fail("PERMISSION_DENIED", 403);
  if (
    typeof body.request_id !== "string" ||
    !/^[-a-zA-Z0-9_]{8,100}$/.test(body.request_id)
  )
    dm.fail("REQUEST_ID_REQUIRED");
  const destructive = ["RESPRING", "REBOOT"].includes(body.action);
  if (destructive && body.confirmed !== true)
    dm.fail("CONFIRMATION_REQUIRED", 409);
  const results = [];
  for (const id of body.device_ids) {
    try {
      const row = await dm.transaction(async (t) => {
        await dm.device(user.username, id, t);
        const existing = await Action.findOne({
          where: {
            owner_username: user.username,
            device_id: id,
            request_key: body.request_id,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (existing) {
          if (existing.action !== body.action)
            dm.fail("REQUEST_ID_CONFLICT", 409);
          return existing;
        }
        const { device: d, gateway: g } = await target(user.username, id, t);
        if (destructive && d.command_adapter === "UNCONFIGURED")
          dm.fail("COMMAND_ADAPTER_REQUIRED", 409);
        const active = await require("../models/DeviceTaskRun").count({
          where: {
            owner_username: user.username,
            device_id: id,
            status: { [Op.in]: ["RUNNING", "REPORTING"] },
          },
          transaction: t,
        });
        const online = require("./deviceStatusService").classifyDevice({
          ...d.toJSON(),
          active_task: active > 0,
        });
        if (
          destructive &&
          (online === "RUNNING" || active > 0) &&
          body.confirm_running !== true
        )
          dm.fail("RUNNING_DEVICE_CONFIRMATION_REQUIRED", 409);
        if (
          (await Action.count({
            where: { gateway_id: g.id, status: "QUEUED" },
            transaction: t,
          })) >= 1000
        )
          dm.fail("GATEWAY_QUEUE_FULL", 429);
        return Action.create(
          {
            owner_username: user.username,
            requested_by: user.username,
            device_id: id,
            gateway_id: g.id,
            action: body.action,
            request_key: body.request_id,
            status: "QUEUED",
            snapshot: sec.seal({
              ip: d.private_ip,
              lan_id: d.lan_id,
              host_fingerprint: d.ssh_host_fingerprint,
              adapter: d.command_adapter,
              credentials: sec.unseal(d.ssh_credentials),
              credentials_hash: sec.hash(d.ssh_credentials),
              confirm_running: body.confirm_running === true,
            }),
          },
          { transaction: t },
        );
      });
      results.push({ device_id: id, id: row.id, status: row.status });
    } catch (e) {
      if (e.name === "SequelizeUniqueConstraintError") {
        const row = await Action.findOne({
          where: {
            owner_username: user.username,
            device_id: id,
            request_key: body.request_id,
          },
        });
        if (row.action !== body.action)
          results.push({
            device_id: id,
            status: "REJECTED",
            error_code: "REQUEST_ID_CONFLICT",
          });
        else results.push({ device_id: id, id: row.id, status: row.status });
      } else if (e.statusCode)
        results.push({
          device_id: id,
          status: "REJECTED",
          error_code: e.message,
        });
      else throw e;
    }
  }
  return { actions: results };
}
async function terminal(user, id) {
  if (!(await sec.permissions(user)).includes("DEVICE_SSH_TERMINAL"))
    dm.fail("PERMISSION_DENIED", 403);
  return dm.transaction(async (t) => {
    const { gateway: g } = await target(user.username, id, t);
    const active = await Session.count({
      where: {
        owner_username: user.username,
        status: { [Op.in]: ["CREATED", "CONNECTED"] },
        created_at: { [Op.gt]: new Date(Date.now() - 900000) },
      },
      transaction: t,
    });
    if (active >= 10) dm.fail("SESSION_LIMIT", 429);
    const ticket = crypto.randomBytes(32).toString("base64url"),
      session = await Session.create(
        {
          owner_username: user.username,
          device_id: id,
          gateway_id: g.id,
          ticket_hash: sec.hash(ticket),
          ticket_expires_at: new Date(Date.now() + 30000),
        },
        { transaction: t },
      );
    return {
      id: session.id,
      ticket,
      path: "/device-ws/terminal",
      expires_in: 30,
    };
  });
}
module.exports = { ACTIONS, target, enqueue, terminal };
