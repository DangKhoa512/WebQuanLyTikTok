const { Op, QueryTypes } = require("sequelize");
const crypto = require("crypto");
const db = require("../config/database");
const Device = require("../models/ManagedDevice");
const {
  Group,
  Lan,
  Gateway,
  Mapping,
  Action,
  Session,
} = require("../models/DeviceManager");
const { offlineTimeoutSeconds } = require("../config/devices");
const sec = require("./deviceManagerSecurity");
async function transaction(work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.transaction({ isolationLevel: "READ COMMITTED" }, work);
    } catch (e) {
      const code = e.original?.code || e.parent?.code;
      if (
        !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(code) ||
        attempt === 3
      )
        throw e;
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 50));
    }
  }
}
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { statusCode: status });
};
const publicDevice = (d) => {
  const o = d.toJSON ? d.toJSON() : { ...d };
  o.has_credentials = !!o.ssh_credentials;
  delete o.ssh_credentials;
  return o;
};
const safeGateway = (g) => {
  const o = g.toJSON ? g.toJSON() : { ...g };
  delete o.token_hash;
  return o;
};
const gatewayOnline = (g) =>
  !!g?.is_active &&
  g.last_seen &&
  Date.now() - new Date(g.last_seen).getTime() < 60000;
async function owned(Model, owner, id, t) {
  const row = await Model.findOne({
    where: { owner_username: owner, id },
    transaction: t,
    ...(t ? { lock: t.LOCK.UPDATE } : {}),
  });
  if (!row) fail("NOT_FOUND", 404);
  return row;
}
async function device(owner, deviceId, t) {
  if (typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 255)
    fail("INVALID_DEVICE_ID");
  const row = await Device.findOne({
    where: { owner_username: owner, device_id: deviceId },
    transaction: t,
    ...(t ? { lock: t.LOCK.UPDATE } : {}),
  });
  if (!row) fail("DEVICE_NOT_FOUND", 404);
  return row;
}
async function reportIp(owner, body) {
  for (const key of Object.keys(body || {}))
    if (!["device_id", "private_ip"].includes(key))
      fail("UNEXPECTED_NETWORK_FIELD");
  if (!sec.privateIp(body.private_ip)) fail("INVALID_PRIVATE_IP");
  return transaction(async (t) => {
    const row = await device(owner, body.device_id, t),
      changed = row.private_ip !== body.private_ip,
      now = new Date();
    await row.update(
      {
        private_ip: body.private_ip,
        ip_updated_at: now,
        ...(changed
          ? { ip_changed_at: now, ssh_status: "UNKNOWN", ssh_checked_at: null }
          : {}),
      },
      { transaction: t, silent: true },
    );
    return {
      device_id: row.device_id,
      private_ip: row.private_ip,
      ip_changed: changed,
    };
  });
}
const statusSql = `CASE WHEN d.last_seen IS NULL OR TIMESTAMPDIFF(MICROSECOND,d.last_seen,NOW(3)) > :timeout * 1000000 THEN 'OFFLINE' WHEN d.reported_status='RUNNING' OR EXISTS(SELECT 1 FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING')) THEN 'RUNNING' ELSE 'IDLE' END`;
const sshSql =
  "CASE WHEN d.ssh_checked_at IS NULL OR d.ssh_checked_at<DATE_SUB(NOW(),INTERVAL 5 MINUTE) OR g.last_seen IS NULL OR g.last_seen<DATE_SUB(NOW(),INTERVAL 60 SECOND) OR g.is_active=0 THEN 'UNKNOWN' ELSE d.ssh_status END";
const fromSql =
  " FROM dashboard_devices d LEFT JOIN ssh_gateways g ON g.id=d.gateway_id AND g.owner_username=d.owner_username LEFT JOIN device_groups dg ON dg.id=d.device_group_id AND dg.owner_username=d.owner_username LEFT JOIN network_lans l ON l.id=d.lan_id AND l.owner_username=d.owner_username";
async function list(owner, q = {}) {
  const replacements = { owner, timeout: offlineTimeoutSeconds };
  const clauses = ["d.owner_username=:owner"];
  for (const [input, col] of [
    ["group_id", "d.device_group_id"],
    ["lan_id", "d.lan_id"],
  ])
    if (q[input] !== undefined && q[input] !== "") {
      if (q[input] === "none") clauses.push(col + " IS NULL");
      else {
        if (!/^\d+$/.test(String(q[input]))) fail("INVALID_FILTER");
        clauses.push(col + "=:" + input);
        replacements[input] = Number(q[input]);
      }
    }
  if (q.device_id) {
    clauses.push("d.device_id=:device_id");
    replacements.device_id = String(q.device_id);
  }
  if (q.status) {
    if (!["OFFLINE", "RUNNING", "IDLE"].includes(q.status))
      fail("INVALID_STATUS");
    clauses.push(statusSql + "=:status");
    replacements.status = q.status;
  }
  if (q.ssh_status) {
    if (!["UNKNOWN", "ONLINE", "OFFLINE"].includes(q.ssh_status))
      fail("INVALID_SSH_STATUS");
    clauses.push(sshSql + "=:ssh");
    replacements.ssh = q.ssh_status;
  }
  if (q.private_ip) {
    if (!sec.privateIp(q.private_ip)) fail("INVALID_PRIVATE_IP");
    clauses.push("d.private_ip=:ip");
    replacements.ip = q.private_ip;
  }
  if (q.task) {
    clauses.push(
      "COALESCE((SELECT r.task_type FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING') ORDER BY r.id DESC LIMIT 1),d.current_task)=:task",
    );
    replacements.task = String(q.task).slice(0, 100);
  }
  if (q.search) {
    clauses.push("(d.device_id LIKE :search OR d.device_name LIKE :search)");
    replacements.search = "%" + String(q.search).slice(0, 100) + "%";
  }
  if (q.needs_attention === "true")
    clauses.push(
      "EXISTS(SELECT 1 FROM device_health h WHERE h.owner_username=d.owner_username AND h.device_id=d.device_id)",
    );
  const where = " WHERE " + clauses.join(" AND ");
  const size = Math.min(
      100,
      Math.max(1, Math.floor(Number(q.page_size) || 50)),
    ),
    page = Math.max(1, Math.min(100000, Math.floor(Number(q.page) || 1)));
  const [count] = await db.query("SELECT COUNT(*) total" + fromSql + where, {
    replacements,
    type: QueryTypes.SELECT,
  });
  const rows = await db.query(
    `SELECT d.id,d.device_id,COALESCE(d.device_name,d.device_id) device_name,d.private_ip,d.ip_updated_at,d.ip_changed_at,d.device_group_id,d.lan_id,d.gateway_id,d.last_seen,COALESCE((SELECT r.locked_at FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING') ORDER BY r.id DESC LIMIT 1),d.started_at) started_at,d.command_adapter,d.ssh_host_fingerprint,EXISTS(SELECT 1 FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING')) active_task,(d.ssh_credentials IS NOT NULL) has_credentials,dg.name group_name,l.name lan_name,g.name gateway_name,${statusSql} status,${sshSql} ssh_status,
 COALESCE((SELECT r.task_type FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING') ORDER BY r.id DESC LIMIT 1),d.current_task) current_task,
 COALESCE((SELECT COALESCE(r.uid,r.username) FROM device_task_runs r WHERE r.owner_username=d.owner_username AND r.device_id=d.device_id AND r.status IN ('RUNNING','REPORTING') ORDER BY r.id DESC LIMIT 1),d.current_uid) current_uid${fromSql}${where} ORDER BY d.id LIMIT :limit OFFSET :offset`,
    {
      replacements: {
        ...replacements,
        limit: Math.floor(size),
        offset: Math.floor((page - 1) * size),
      },
      type: QueryTypes.SELECT,
    },
  );
  const summaries = await db.query(
    `SELECT state.device_state status,state.ssh_state ssh_status,COUNT(*) count FROM (SELECT ${statusSql} device_state,${sshSql} ssh_state${fromSql} WHERE d.owner_username=:owner) state GROUP BY state.device_state,state.ssh_state`,
    {
      replacements: { owner, timeout: offlineTimeoutSeconds },
      type: QueryTypes.SELECT,
    },
  );
  const summary = {
    total: 0,
    online: 0,
    running: 0,
    idle: 0,
    offline: 0,
    ssh_online: 0,
    ssh_offline: 0,
    needs_attention: 0,
  };
  for (const r of summaries) {
    const n = Number(r.count);
    summary.total += n;
    summary[r.status.toLowerCase()] += n;
    if (r.status !== "OFFLINE") summary.online += n;
    if (r.ssh_status !== "UNKNOWN")
      summary["ssh_" + r.ssh_status.toLowerCase()] += n;
  }
  const Health = require("../models/DeviceHealth");
  summary.needs_attention = await Health.count({
    where: { owner_username: owner },
  });
  return {
    rows,
    total: Number(count.total),
    page: Math.floor(page),
    page_size: Math.floor(size),
    summary,
    offline_timeout_seconds: offlineTimeoutSeconds,
  };
}
async function catalog(owner) {
  const [groups, lans, gateways, mappings] = await Promise.all([
    Group.findAll({
      where: { owner_username: owner },
      order: [["name", "ASC"]],
      raw: true,
    }),
    Lan.findAll({
      where: { owner_username: owner },
      order: [["name", "ASC"]],
      raw: true,
    }),
    Gateway.findAll({ where: { owner_username: owner }, raw: true }),
    Mapping.findAll({ where: { owner_username: owner }, raw: true }),
  ]);
  const runningActions = await Action.findAll({
    where: { owner_username: owner, status: "RUNNING" },
    attributes: ["gateway_id"],
    raw: true,
  });
  const runningSessions = await Session.findAll({
    where: { owner_username: owner, status: "CONNECTED" },
    attributes: ["gateway_id"],
    raw: true,
  });
  const counts = await Device.findAll({
    where: { owner_username: owner },
    attributes: ["device_group_id", "lan_id"],
    raw: true,
  });
  for (const g of groups)
    g.device_count = counts.filter((d) => d.device_group_id === g.id).length;
  for (const l of lans)
    l.device_count = counts.filter((d) => d.lan_id === l.id).length;
  return {
    groups,
    lans,
    gateways: gateways.map((g) => ({
      ...safeGateway(g),
      status: gatewayOnline(g) ? "ONLINE" : "OFFLINE",
      current_connections:
        runningActions.filter((a) => a.gateway_id === g.id).length +
        runningSessions.filter((a) => a.gateway_id === g.id).length,
      lan_ids: mappings
        .filter((m) => m.gateway_id === g.id)
        .map((m) => m.lan_id),
    })),
  };
}
function name(body) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 100
  )
    fail("INVALID_NAME");
  return body.name.trim();
}
async function saveCollection(owner, kind, id, body) {
  const M = kind === "groups" ? Group : Lan;
  const values = {
    name: name(body),
    ...(kind === "lans"
      ? { description: String(body.description || "").slice(0, 500) }
      : {}),
  };
  return transaction(async (t) => {
    if (id) {
      const row = await owned(M, owner, id, t);
      return row.update(values, { transaction: t });
    }
    return M.create({ owner_username: owner, ...values }, { transaction: t });
  });
}
async function deleteCollection(owner, kind, id, body = {}) {
  return transaction(async (t) => {
    const M = kind === "groups" ? Group : Lan;
    const row = await owned(M, owner, id, t);
    if (kind === "lans") {
      const count = await Device.count({
        where: { owner_username: owner, lan_id: row.id },
        transaction: t,
      });
      if (count && body.unassign !== true && !body.move_to)
        fail("LAN_HAS_DEVICES", 409);
      if (body.move_to) {
        if (Number(body.move_to) === row.id) fail("INVALID_DESTINATION");
        await owned(Lan, owner, body.move_to, t);
      }
      await Device.update(
        {
          lan_id: body.move_to || null,
          gateway_id: null,
          ssh_status: "UNKNOWN",
          ssh_checked_at: null,
        },
        {
          where: { owner_username: owner, lan_id: row.id },
          transaction: t,
          silent: true,
        },
      );
      await Mapping.destroy({
        where: { owner_username: owner, lan_id: row.id },
        transaction: t,
      });
    } else
      await Device.update(
        { device_group_id: null },
        {
          where: { owner_username: owner, device_group_id: row.id },
          transaction: t,
          silent: true,
        },
      );
    await row.destroy({ transaction: t });
    return { deleted: true };
  });
}
async function move(owner, body) {
  if (
    !Array.isArray(body.device_ids) ||
    !body.device_ids.length ||
    body.device_ids.length > 1000 ||
    new Set(body.device_ids).size !== body.device_ids.length
  )
    fail("INVALID_DEVICE_IDS");
  const hasGroup = Object.hasOwn(body, "group_id"),
    hasLan = Object.hasOwn(body, "lan_id");
  if (hasGroup === hasLan) fail("CHOOSE_GROUP_OR_LAN");
  return transaction(async (t) => {
    const updates = {};
    if (hasGroup) {
      if (body.group_id !== null) await owned(Group, owner, body.group_id, t);
      updates.device_group_id = body.group_id;
    } else {
      if (body.lan_id !== null) await owned(Lan, owner, body.lan_id, t);
      let gateway = null;
      if (body.gateway_id) {
        const g = await owned(Gateway, owner, body.gateway_id, t);
        const m = await Mapping.findOne({
          where: {
            owner_username: owner,
            gateway_id: g.id,
            lan_id: body.lan_id,
          },
          transaction: t,
        });
        if (!m) fail("GATEWAY_LAN_DENIED");
        gateway = g.id;
      }
      updates.lan_id = body.lan_id;
      updates.gateway_id = gateway;
      updates.ssh_status = "UNKNOWN";
      updates.ssh_checked_at = null;
    }
    const rows = await Device.findAll({
      where: { owner_username: owner, device_id: { [Op.in]: body.device_ids } },
      order: [["id", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (rows.length !== body.device_ids.length) fail("DEVICE_NOT_FOUND", 404);
    await Device.update(updates, {
      where: { owner_username: owner, device_id: { [Op.in]: body.device_ids } },
      transaction: t,
      silent: true,
    });
    const request = crypto.randomUUID();
    await Action.bulkCreate(
      rows.map((d) => ({
        owner_username: owner,
        device_id: d.device_id,
        action: hasGroup ? "MOVE_GROUP" : "MOVE_LAN",
        request_key: request,
        status: "SUCCESS",
        started_at: new Date(),
        finished_at: new Date(),
        result: updates,
      })),
      { transaction: t },
    );
    return { updated: rows.length };
  });
}
async function configure(owner, id, body) {
  return transaction(async (t) => {
    const row = await device(owner, id, t);
    const values = {};
    if (body.device_name !== undefined) {
      if (typeof body.device_name !== "string" || body.device_name.length > 255)
        fail("INVALID_DEVICE_NAME");
      values.device_name = body.device_name.trim();
    }
    if (body.credentials) {
      const c = body.credentials;
      if (
        typeof c.username !== "string" ||
        !c.username.trim() ||
        c.username.length > 100 ||
        (c.password !== undefined && typeof c.password !== "string") ||
        (c.private_key !== undefined && typeof c.private_key !== "string") ||
        !Number.isInteger(Number(c.port || 22)) ||
        (!c.password && !c.private_key) ||
        Number(c.port || 22) < 1 ||
        Number(c.port || 22) > 65535
      )
        fail("INVALID_SSH_CREDENTIALS");
      if (
        (c.password && String(c.password).length > 1000) ||
        (c.private_key && String(c.private_key).length > 16000)
      )
        fail("INVALID_SSH_CREDENTIALS");
      values.ssh_status = "UNKNOWN";
      values.ssh_checked_at = null;
      values.ssh_credentials = sec.seal({
        username: c.username,
        password: c.password,
        private_key: c.private_key,
        port: Number(c.port || 22),
      });
    }
    if (body.host_fingerprint !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(body.host_fingerprint))
        fail("INVALID_HOST_FINGERPRINT");
      values.ssh_host_fingerprint = body.host_fingerprint;
      values.ssh_status = "UNKNOWN";
      values.ssh_checked_at = null;
    }
    if (body.command_adapter !== undefined) {
      if (!["UNCONFIGURED", "ROOTHIDE"].includes(body.command_adapter))
        fail("INVALID_COMMAND_ADAPTER");
      values.command_adapter = body.command_adapter;
    }
    await row.update(values, { transaction: t, silent: true });
    return publicDevice(row);
  });
}
async function createGateway(owner, body) {
  const token = crypto.randomBytes(32).toString("base64url");
  const max = Number(body.max_connections ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 20)
    fail("INVALID_CONNECTION_LIMIT");
  const g = await Gateway.create({
    owner_username: owner,
    name: name(body),
    token_hash: sec.hash(token),
    max_connections: max,
  });
  return { ...safeGateway(g), token };
}
async function updateGateway(owner, id, body) {
  return transaction(async (t) => {
    const g = await owned(Gateway, owner, id, t),
      values = {};
    if (body.name !== undefined) values.name = name(body);
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") fail("INVALID_ACTIVE");
      values.is_active = body.is_active;
    }
    if (body.max_connections !== undefined) {
      const max = Number(body.max_connections);
      if (!Number.isInteger(max) || max < 1 || max > 20)
        fail("INVALID_CONNECTION_LIMIT");
      values.max_connections = max;
    }
    let token;
    if (body.rotate_token === true) {
      token = crypto.randomBytes(32).toString("base64url");
      values.token_hash = sec.hash(token);
    }
    await g.update(values, { transaction: t });
    if (body.lan_ids !== undefined) {
      if (!Array.isArray(body.lan_ids) || body.lan_ids.length > 100)
        fail("INVALID_LAN_IDS");
      const ids = [...new Set(body.lan_ids.map(Number))];
      for (const id of ids) await owned(Lan, owner, id, t);
      const removed = await Mapping.findAll({
        where: {
          owner_username: owner,
          gateway_id: g.id,
          lan_id: { [Op.notIn]: ids.length ? ids : [0] },
        },
        transaction: t,
      });
      if (removed.length)
        await Device.update(
          { gateway_id: null, ssh_status: "UNKNOWN", ssh_checked_at: null },
          {
            where: {
              owner_username: owner,
              gateway_id: g.id,
              lan_id: { [Op.in]: removed.map((m) => m.lan_id) },
            },
            transaction: t,
            silent: true,
          },
        );
      await Mapping.destroy({
        where: { owner_username: owner, gateway_id: g.id },
        transaction: t,
      });
      await Mapping.bulkCreate(
        ids.map((lan_id) => ({
          owner_username: owner,
          gateway_id: g.id,
          lan_id,
        })),
        { transaction: t },
      );
    }
    return { ...safeGateway(g), ...(token ? { token } : {}) };
  });
}
async function history(owner, id) {
  await device(owner, id);
  const [actions, sessions, tasks] = await Promise.all([
    Action.findAll({
      where: { owner_username: owner, device_id: id },
      attributes: { exclude: ["snapshot"] },
      order: [["created_at", "DESC"]],
      limit: 100,
      raw: true,
    }),
    Session.findAll({
      where: { owner_username: owner, device_id: id },
      attributes: { exclude: ["ticket_hash"] },
      order: [["created_at", "DESC"]],
      limit: 50,
      raw: true,
    }),
    require("../models/DeviceTaskRun").findAll({
      where: { owner_username: owner, device_id: id },
      attributes: ["id", "task_type", "status", "locked_at", "completed_at"],
      order: [["id", "DESC"]],
      limit: 50,
      raw: true,
    }),
  ]);
  return { actions, sessions, tasks };
}
module.exports = {
  transaction,
  fail,
  owned,
  device,
  reportIp,
  list,
  catalog,
  saveCollection,
  deleteCollection,
  move,
  configure,
  createGateway,
  updateGateway,
  history,
  gatewayOnline,
  safeGateway,
  publicDevice,
};
