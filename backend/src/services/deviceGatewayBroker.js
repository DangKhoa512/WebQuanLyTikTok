const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");
const { Op, fn, col } = require("sequelize");
const db = require("../config/database");
const {
  Gateway,
  Mapping,
  Action,
  Session,
} = require("../models/DeviceManager");
const Device = require("../models/ManagedDevice"),
  User = require("../models/User");
const sec = require("./deviceManagerSecurity"),
  dm = require("./deviceManagerService"),
  ssh = require("./deviceSshService");
const send = (socket, value) => {
  if (
    socket.readyState === WebSocket.OPEN &&
    socket.bufferedAmount < 1024 * 1024
  )
    socket.send(JSON.stringify(value));
  else socket.close(1013, "Backpressure");
};
function attach(server, options = {}) {
  const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 65536,
      perMessageDeflate: false,
    }),
    gateways = new Map(),
    sessions = new Map();
  let stopping = false,
    ticking = false;
  const finish = async (g, id, result = {}) => {
    const a = await Action.findOne({
      where: {
        id,
        gateway_id: g.id,
        owner_username: g.owner_username,
        status: "RUNNING",
      },
    });
    if (!a) return;
    const allowedErrors = [
      "SSH_TIMEOUT",
      "SSH_AUTH_FAILED",
      "HOST_KEY_MISMATCH",
      "NETWORK_DENIED",
      "ADAPTER_UNSUPPORTED",
      "SSH_FAILED",
      "GATEWAY_DISCONNECTED",
      "UNKNOWN_OUTCOME",
    ];
    const code =
      result.success === true
        ? null
        : allowedErrors.includes(result.error_code)
          ? result.error_code
          : "SSH_FAILED";
    const safe = {
      ssh_connected: result.ssh_connected === true,
      autotouch_process:
        typeof result.autotouch_process === "boolean"
          ? result.autotouch_process
          : null,
      script_status: "UNKNOWN",
      info:
        typeof result.info === "string"
          ? result.info.replace(/[\x00-\x08]/g, "").slice(0, 1000)
          : null,
    };
    const snapshot = sec.unseal(a.snapshot);
    await db.transaction(async (t) => {
      const d = await Device.findOne({
        where: { device_id: a.device_id, owner_username: a.owner_username },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      await a.update(
        {
          status:
            result.success === true
              ? "SUCCESS"
              : code === "UNKNOWN_OUTCOME"
                ? "UNKNOWN"
                : "FAILED",
          error_code: code,
          result: safe,
          finished_at: new Date(),
          snapshot: null,
        },
        { transaction: t },
      );
      if (
        d &&
        d.private_ip === snapshot.ip &&
        d.lan_id === snapshot.lan_id &&
        d.gateway_id === a.gateway_id &&
        d.ssh_host_fingerprint === snapshot.host_fingerprint &&
        sec.hash(d.ssh_credentials || "") === snapshot.credentials_hash
      )
        await d.update(
          {
            ssh_status: safe.ssh_connected
              ? "ONLINE"
              : code === "HOST_KEY_MISMATCH"
                ? "UNKNOWN"
                : "OFFLINE",
            ssh_checked_at: new Date(),
          },
          { transaction: t, silent: true },
        );
    });
  };
  const endSession = async (id, code = "DISCONNECTED") => {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    send(s.gateway, { type: "terminal_close", id });
    s.browser.close(1000, code);
    await Session.update(
      { status: "CLOSED", finished_at: new Date(), error_code: code },
      { where: { id, status: "CONNECTED" } },
    );
  };
  const connectedCount = (id) =>
    [...sessions.values()].filter((s) => s.gatewayId === id).length;
  async function tick() {
    if (ticking || stopping) return;
    ticking = true;
    try {
      const now = Date.now();
      const ids = [...gateways.keys()],
        owners = [
          ...new Set([...gateways.values()].map((g) => g.owner_username)),
        ];
      const [gatewayRows, userRows, actionCounts, sessionCounts] = ids.length
        ? await Promise.all([
            Gateway.findAll({ where: { id: { [Op.in]: ids } }, raw: true }),
            User.findAll({
              where: { username: { [Op.in]: owners }, is_active: true },
              raw: true,
            }),
            Action.findAll({
              where: {
                gateway_id: { [Op.in]: ids },
                status: { [Op.in]: ["QUEUED", "RUNNING"] },
              },
              attributes: [
                "gateway_id",
                "status",
                [fn("COUNT", col("id")), "count"],
              ],
              group: ["gateway_id", "status"],
              raw: true,
            }),
            Session.findAll({
              where: { gateway_id: { [Op.in]: ids }, status: "CONNECTED" },
              attributes: ["gateway_id", [fn("COUNT", col("id")), "count"]],
              group: ["gateway_id"],
              raw: true,
            }),
          ])
        : [[], [], [], []];
      const freshMap = new Map(gatewayRows.map((g) => [g.id, g])),
        userMap = new Map(userRows.map((u) => [u.username, u]));
      const counts = new Map(
          actionCounts.map((a) => [
            a.gateway_id + ":" + a.status,
            Number(a.count),
          ]),
        ),
        sessionMap = new Map(
          sessionCounts.map((s) => [s.gateway_id, Number(s.count)]),
        );
      for (const [id, g] of gateways) {
        const fresh = freshMap.get(id),
          user = userMap.get(g.owner_username);
        if (
          !fresh?.is_active ||
          !user ||
          fresh.token_hash !== g.tokenHash ||
          now - g.pongAt > 45000
        ) {
          g.socket.close(1008, "Gateway unavailable");
          continue;
        }
        if (now - (g.lastPingAt || 0) >= 15000) {
          g.socket.ping();
          g.lastPingAt = now;
        }
        g.max = Math.min(
          fresh.max_connections,
          g.reportedMax || fresh.max_connections,
        );
        const inFlight = counts.get(id + ":RUNNING") || 0;
        const liveSessions = sessionMap.get(id) || 0;
        let slots = Math.max(0, g.max - inFlight - liveSessions);
        if (!slots || !counts.get(id + ":QUEUED")) continue;
        const queued = await Action.findAll({
          where: {
            gateway_id: id,
            owner_username: g.owner_username,
            status: "QUEUED",
          },
          order: [["created_at", "ASC"]],
          limit: slots,
        });
        for (const a of queued) {
          try {
            const p = await sec.permissions(user);
            if (!p.includes(ssh.ACTIONS[a.action]))
              dm.fail("PERMISSION_DENIED", 403);
            const { device: d } = await ssh.target(
              g.owner_username,
              a.device_id,
            );
            const snapshot = sec.unseal(a.snapshot);
            if (
              snapshot.ip !== d.private_ip ||
              snapshot.lan_id !== d.lan_id ||
              snapshot.host_fingerprint !== d.ssh_host_fingerprint ||
              snapshot.adapter !== d.command_adapter ||
              snapshot.credentials_hash !== sec.hash(d.ssh_credentials)
            )
              dm.fail("TARGET_CHANGED", 409);
            if (
              ["RESPRING", "REBOOT"].includes(a.action) &&
              !snapshot.confirm_running
            ) {
              const active = await require("../models/DeviceTaskRun").count({
                where: {
                  owner_username: g.owner_username,
                  device_id: a.device_id,
                  status: { [Op.in]: ["RUNNING", "REPORTING"] },
                },
              });
              if (
                require("./deviceStatusService").classifyDevice({
                  ...d.toJSON(),
                  active_task: active > 0,
                }) === "RUNNING" ||
                active > 0
              )
                dm.fail("RUNNING_DEVICE_CONFIRMATION_REQUIRED", 409);
            }
            const [claimed] = await Action.update(
              { status: "RUNNING", started_at: new Date() },
              { where: { id: a.id, status: "QUEUED" } },
            );
            if (claimed)
              send(g.socket, {
                type: "action",
                id: a.id,
                action: a.action,
                target: snapshot,
                timeout_seconds: 30,
              });
          } catch (e) {
            await Action.update(
              {
                status: "REJECTED",
                error_code: e.statusCode ? e.message : "CONFIGURATION_ERROR",
                finished_at: new Date(),
                snapshot: null,
              },
              { where: { id: a.id, status: "QUEUED" } },
            );
          }
        }
      }
      const expired = await Action.findAll({
        where: {
          status: "RUNNING",
          started_at: { [Op.lt]: new Date(now - 45000) },
        },
      });
      for (const a of expired) {
        const g = gateways.get(a.gateway_id);
        if (g) send(g.socket, { type: "cancel", id: a.id });
        await Action.update(
          {
            status: "UNKNOWN",
            error_code: "UNKNOWN_OUTCOME",
            finished_at: new Date(),
            snapshot: null,
          },
          { where: { id: a.id, status: "RUNNING" } },
        );
      }
      for (const [id, s] of sessions) {
        const user = await User.findOne({
          where: { username: s.owner, is_active: true },
          raw: true,
        });
        const gateway = await Gateway.findByPk(s.gatewayId);
        const d = await Device.findOne({
          where: { owner_username: s.owner, device_id: s.deviceId },
        });
        const mapping =
          d &&
          (await Mapping.findOne({
            where: {
              owner_username: s.owner,
              gateway_id: s.gatewayId,
              lan_id: d.lan_id,
            },
          }));
        if (
          now - s.created > 900000 ||
          now - s.lastInput > 300000 ||
          !user ||
          !(await sec.permissions(user)).includes("DEVICE_SSH_TERMINAL") ||
          !gateway?.is_active ||
          !mapping ||
          d?.private_ip !== s.ip ||
          d?.gateway_id !== s.gatewayId
        )
          await endSession(id, "SESSION_ENDED");
      }
    } catch {
      /* Minimal logging: never emit frames, credentials, or terminal contents. */
    } finally {
      ticking = false;
    }
  }
  const interval = setInterval(tick, 1000);
  interval.unref();
  const upgrade = (tunnelOnly) => async (req, socket, head) => {
    try {
      if (wss.clients.size >= 1020) throw new Error("Connection limit");
      const path = new URL(req.url, "http://local").pathname;
      if (!["/device-ws/gateway", "/device-ws/terminal"].includes(path)) {
        socket.destroy();
        return;
      }
      require("./deviceBrokerTransport").validateUpgrade(req, path, tunnelOnly);
      let g;
      if (path.endsWith("/gateway")) {
        const header = req.headers.authorization || "",
          token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (token.length < 32) throw new Error("Invalid gateway");
        g = await Gateway.findOne({
          where: { token_hash: sec.hash(token), is_active: true },
          raw: true,
        });
        if (
          !g ||
          !(await User.findOne({
            where: { username: g.owner_username, is_active: true },
          })) ||
          gateways.has(g.id)
        )
          throw new Error("Invalid gateway");
      } else {
        const origin = req.headers.origin;
        if (!origin) throw new Error("Origin required");
        const expected = process.env.DEVICE_MANAGER_ORIGIN;
        if (!expected && process.env.NODE_ENV === "production")
          throw new Error("Origin not configured");
        if (expected && origin !== expected) throw new Error("Invalid origin");
        if (sessions.size >= 1000) throw new Error("Session limit");
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("error", () => {});
        if (g) {
          const connection = {
            id: g.id,
            owner_username: g.owner_username,
            socket: ws,
            max: g.max_connections,
            tokenHash: g.token_hash,
            pongAt: Date.now(),
          };
          gateways.set(g.id, connection);
          Gateway.update(
            { last_connected_at: new Date(), last_seen: new Date() },
            { where: { id: g.id } },
          ).catch(() => ws.close());
          ws.on("pong", () => {
            connection.pongAt = Date.now();
            Gateway.update(
              { last_seen: new Date() },
              {
                where: { id: g.id, is_active: true, token_hash: g.token_hash },
              },
            ).catch(() => ws.close());
          });
          ws.on("message", async (raw) => {
            try {
              const m = JSON.parse(raw);
              if (m.type === "hello") {
                if (
                  Number.isInteger(m.max_connections) &&
                  m.max_connections >= 1 &&
                  m.max_connections <= 20
                ) {
                  connection.reportedMax = m.max_connections;
                  connection.max = Math.min(connection.max, m.max_connections);
                }
                await Gateway.update(
                  {
                    version:
                      typeof m.version === "string"
                        ? m.version.slice(0, 50)
                        : null,
                  },
                  { where: { id: g.id, token_hash: g.token_hash } },
                );
              } else if (m.type === "result") await finish(g, m.id, m.result);
              else if (
                m.type === "terminal_data" ||
                m.type === "terminal_ready" ||
                m.type === "terminal_error"
              ) {
                const s = sessions.get(m.id);
                if (s && s.gatewayId === g.id) {
                  if (m.type === "terminal_error") {
                    await endSession(m.id, "SSH_CONNECTION_FAILED");
                  } else if (m.type === "terminal_ready") {
                    send(s.browser, { type: "ready" });
                  } else if (
                    typeof m.data === "string" &&
                    m.data.length <= 32768
                  )
                    send(s.browser, { type: "data", data: m.data });
                }
              }
            } catch {
              ws.close(1008, "Invalid message");
            }
          });
          ws.on("close", async () => {
            if (gateways.get(g.id) !== connection) return;
            gateways.delete(g.id);
            try {
              await Gateway.update(
                { last_seen: new Date(0) },
                { where: { id: g.id, token_hash: g.token_hash } },
              );
              for (const [id, s] of sessions)
                if (s.gatewayId === g.id)
                  await endSession(id, "GATEWAY_DISCONNECTED");
              await Action.update(
                {
                  status: "UNKNOWN",
                  error_code: "GATEWAY_DISCONNECTED",
                  finished_at: new Date(),
                  snapshot: null,
                },
                { where: { gateway_id: g.id, status: "RUNNING" } },
              );
            } catch {}
          });
          send(ws, {
            type: "welcome",
            gateway_id: g.id,
            max_connections: g.max_connections,
          });
          tick();
        } else {
          let sessionId = null,
            authenticating = false,
            windowAt = Date.now(),
            bytes = 0;
          const authTimer = setTimeout(
            () => ws.close(1008, "Authentication timeout"),
            5000,
          );
          ws.on("message", async (raw) => {
            try {
              const m = JSON.parse(raw);
              if (!sessionId) {
                if (authenticating) throw new Error("Already authenticating");
                authenticating = true;
                if (m.type !== "auth" || typeof m.ticket !== "string")
                  throw new Error("Invalid ticket");
                const session = await db.transaction(async (t) => {
                  const row = await Session.findOne({
                    where: {
                      ticket_hash: sec.hash(m.ticket),
                      status: "CREATED",
                      ticket_expires_at: { [Op.gt]: new Date() },
                    },
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                  });
                  if (!row) throw new Error("Expired ticket");
                  const user = await User.findOne({
                    where: { username: row.owner_username, is_active: true },
                    raw: true,
                    transaction: t,
                  });
                  if (
                    !user ||
                    !(await sec.permissions(user)).includes(
                      "DEVICE_SSH_TERMINAL",
                    )
                  )
                    throw new Error("Permission");
                  const { device: d, gateway: gw } = await ssh.target(
                    row.owner_username,
                    row.device_id,
                    t,
                  );
                  const local = gateways.get(gw.id);
                  if (!local) throw new Error("Gateway offline");
                  const running = await Action.count({
                    where: { gateway_id: gw.id, status: "RUNNING" },
                    transaction: t,
                  });
                  if (
                    running +
                      (await Session.count({
                        where: { gateway_id: gw.id, status: "CONNECTED" },
                        transaction: t,
                      })) >=
                    Math.min(gw.max_connections, local.max)
                  )
                    throw new Error("Gateway full");
                  await row.update(
                    {
                      status: "CONNECTED",
                      ticket_hash: null,
                      started_at: new Date(),
                    },
                    { transaction: t },
                  );
                  return { row, d, local };
                });
                sessionId = session.row.id;
                clearTimeout(authTimer);
                sessions.set(sessionId, {
                  browser: ws,
                  gateway: session.local.socket,
                  gatewayId: session.local.id,
                  owner: session.row.owner_username,
                  deviceId: session.row.device_id,
                  ip: session.d.private_ip,
                  created: Date.now(),
                  lastInput: Date.now(),
                });
                send(session.local.socket, {
                  type: "terminal_open",
                  id: sessionId,
                  target: {
                    ip: session.d.private_ip,
                    lan_id: session.d.lan_id,
                    host_fingerprint: session.d.ssh_host_fingerprint,
                    credentials: sec.unseal(session.d.ssh_credentials),
                  },
                });
                if (ws.readyState !== WebSocket.OPEN)
                  await endSession(sessionId);
                return;
              }
              const s = sessions.get(sessionId);
              if (!s) return;
              if (Date.now() - windowAt > 1000) {
                windowAt = Date.now();
                bytes = 0;
              }
              bytes += raw.length;
              if (bytes > 65536) throw new Error("Rate limit");
              s.lastInput = Date.now();
              if (
                m.type === "input" &&
                typeof m.data === "string" &&
                m.data.length <= 8192
              )
                send(s.gateway, {
                  type: "terminal_input",
                  id: sessionId,
                  data: m.data,
                });
              else if (
                m.type === "resize" &&
                Number.isInteger(m.cols) &&
                Number.isInteger(m.rows) &&
                m.cols >= 20 &&
                m.cols <= 300 &&
                m.rows >= 5 &&
                m.rows <= 100
              )
                send(s.gateway, {
                  type: "terminal_resize",
                  id: sessionId,
                  cols: m.cols,
                  rows: m.rows,
                });
              else throw new Error("Invalid terminal message");
            } catch {
              ws.close(1008, "Session rejected");
            }
          });
          ws.on("close", () => {
            clearTimeout(authTimer);
            if (sessionId) endSession(sessionId).catch(() => {});
          });
        }
      });
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  };
  server.on("upgrade", upgrade(false));
  if (options.gatewayTunnelServer)
    options.gatewayTunnelServer.on("upgrade", upgrade(true));
  return {
    gateways,
    sessions,
    close: async () => {
      stopping = true;
      clearInterval(interval);
      for (const id of [...sessions.keys()])
        await endSession(id, "SERVER_SHUTDOWN");
      for (const g of gateways.values()) g.socket.close();
      wss.close();
    },
    tick,
  };
}
async function start() {
  if (process.env.DEVICE_MANAGER_SSH_ENABLED !== "true") return null;
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== "0")
    return null;
  sec.seal({ probe: true });
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.DEVICE_MANAGER_ORIGIN
  )
    throw new Error("DEVICE_MANAGER_ORIGIN required");
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const tunnelEnabled =
    process.env.DEVICE_MANAGER_GATEWAY_TUNNEL_ENABLED === "true";
  const gatewayTunnelServer = tunnelEnabled
    ? http.createServer((req, res) => {
        res.writeHead(403);
        res.end();
      })
    : null;
  const broker = attach(server, { gatewayTunnelServer });
  await Action.update(
    {
      status: "UNKNOWN",
      error_code: "BROKER_RESTART",
      finished_at: new Date(),
      snapshot: null,
    },
    { where: { status: "RUNNING" } },
  );
  await Session.update(
    {
      status: "CLOSED",
      error_code: "BROKER_RESTART",
      finished_at: new Date(),
      ticket_hash: null,
    },
    { where: { status: "CONNECTED" } },
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      Number(process.env.DEVICE_MANAGER_WS_PORT) || 3001,
      "0.0.0.0",
      resolve,
    );
  });
  if (gatewayTunnelServer)
    try {
      await new Promise((resolve, reject) => {
        gatewayTunnelServer.once("error", reject);
        gatewayTunnelServer.listen(
          3002,
          process.env.DEVICE_MANAGER_TUNNEL_BIND || "127.0.0.1",
          resolve,
        );
      });
    } catch (e) {
      await broker.close();
      server.close();
      throw e;
    }
  return {
    close: async () => {
      gatewayTunnelServer?.close();
      await broker.close();
      server.close();
    },
  };
}
module.exports = { attach, start };
