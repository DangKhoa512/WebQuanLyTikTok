const fs = require("fs"),
  path = require("path"),
  { WebSocket } = require("ws");
const adapter = require("./sshAdapter");
function start(config, token) {
  adapter.validateNetworks(config);
  const tunneled = config.transport === "ssh_tunnel";
  if (config.transport && !["wss", "ssh_tunnel"].includes(config.transport))
    throw new Error("INVALID_TRANSPORT");
  if (tunneled) require("./sshTunnel").validate(config);
  else {
    const url = new URL(config.server_url);
    if (url.username || url.password || url.search || url.hash)
      throw new Error("INVALID_GATEWAY_URL");
    if (
      url.protocol !== "wss:" &&
      !(
        process.env.GATEWAY_ALLOW_LOCAL_TEST === "true" &&
        url.protocol === "ws:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      throw new Error("WSS_REQUIRED");
  }
  if (typeof token !== "string" || token.length < 32)
    throw new Error("GATEWAY_TOKEN_REQUIRED");
  let tunnel, reconnectTimer;
  let socket,
    stopped = false,
    retry = 1000,
    limit = Math.min(20, Math.max(1, Number(config.max_connections) || 5));
  const disconnect = (client) =>
    new Promise((resolve) => {
      if (!client) return resolve();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        client.destroy();
        done();
      }, 1000);
      client.once("close", done);
      client.end();
    });
  const clients = new Map(),
    journalPath = path.resolve(config.journal_path || "gateway-journal.json");
  let journal = {};
  if (fs.existsSync(journalPath))
    journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  for (const id of Object.keys(journal))
    if (journal[id].state === "STARTED")
      journal[id] = {
        state: "FINISHED",
        result: { success: false, error_code: "UNKNOWN_OUTCOME" },
      };
  const persist = () => {
    const temp = journalPath + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(journal), { mode: 0o600 });
    fs.renameSync(temp, journalPath);
  };
  persist();
  const send = (data) => {
    if (
      socket?.readyState === WebSocket.OPEN &&
      socket.bufferedAmount < 1024 * 1024
    )
      socket.send(JSON.stringify(data));
    else socket?.close();
  };
  async function message(raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      socket.close();
      return;
    }
    if (m.type === "welcome") {
      limit = Math.min(limit, Number(m.max_connections) || 5);
      return;
    }
    if (m.type === "cancel" || m.type === "terminal_close") {
      const c = clients.get(m.id);
      c?.client?.destroy();
      clients.delete(m.id);
      return;
    }
    if (m.type === "terminal_input") {
      const c = clients.get(m.id);
      if (c?.stream && typeof m.data === "string" && m.data.length <= 8192)
        c.stream.write(m.data);
      return;
    }
    if (m.type === "terminal_resize") {
      const c = clients.get(m.id);
      if (c?.stream && Number.isInteger(m.rows) && Number.isInteger(m.cols))
        c.stream.setWindow(m.rows, m.cols, 0, 0);
      return;
    }
    if (
      !["action", "terminal_open"].includes(m.type) ||
      typeof m.id !== "string" ||
      !m.target
    )
      return;
    if (m.type === "action" && journal[m.id]) {
      if (journal[m.id].state === "FINISHED")
        send({ type: "result", id: m.id, result: journal[m.id].result });
      return;
    }
    if (clients.has(m.id)) return;
    if (clients.size >= limit) {
      send(
        m.type === "action"
          ? {
              type: "result",
              id: m.id,
              result: { success: false, error_code: "SSH_TIMEOUT" },
            }
          : { type: "terminal_error", id: m.id },
      );
      return;
    }
    if (m.type === "action") {
      journal[m.id] = { state: "STARTED" };
      try {
        persist();
      } catch {
        socket.close();
        return;
      }
    }
    const entry = { client: null, stream: null };
    clients.set(m.id, entry);
    let result;
    try {
      const client = await adapter.connect(m.target, config, (client) => {
        entry.client = client;
      });
      entry.client = client;
      if (socket.readyState !== WebSocket.OPEN || !clients.has(m.id)) {
        client.destroy();
        return;
      }
      if (m.type === "terminal_open") {
        client.shell(
          { term: "xterm-256color", cols: 80, rows: 24 },
          (err, stream) => {
            if (err) {
              send({ type: "terminal_error", id: m.id });
              client.end();
              clients.delete(m.id);
              return;
            }
            entry.stream = stream;
            send({ type: "terminal_ready", id: m.id });
            stream.on("data", (chunk) => {
              const text = chunk.toString();
              for (let i = 0; i < text.length; i += 16000)
                send({
                  type: "terminal_data",
                  id: m.id,
                  data: text.slice(i, i + 16000),
                });
            });
            stream.stderr.on("data", () => {});
            stream.on("close", () => {
              send({ type: "terminal_error", id: m.id });
              client.end();
              clients.delete(m.id);
            });
          },
        );
        return;
      }
      result = await adapter.action(client, m.action, m.target.adapter);
    } catch (e) {
      result = {
        success: false,
        error_code: [
          "NETWORK_DENIED",
          "HOST_KEY_MISMATCH",
          "SSH_AUTH_FAILED",
          "SSH_TIMEOUT",
          "ADAPTER_UNSUPPORTED",
        ].includes(e.code)
          ? e.code
          : ["RESPRING", "REBOOT"].includes(m.action)
            ? "UNKNOWN_OUTCOME"
            : "SSH_FAILED",
      };
    } finally {
      if (m.type === "action") {
        await disconnect(entry.client);
        clients.delete(m.id);
      }
    }
    if (m.type === "action") {
      journal[m.id] = { state: "FINISHED", result };
      persist();
      send({ type: "result", id: m.id, result });
    } else {
      clients.delete(m.id);
      send({ type: "terminal_error", id: m.id });
    }
  }
  const schedule = () => {
    if (stopped || reconnectTimer) return;
    const delay = retry + Math.random() * 500;
    retry = Math.min(30000, retry * 2);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };
  async function connect() {
    if (stopped) return;
    let url = config.server_url;
    if (tunneled) {
      try {
        tunnel = await require("./sshTunnel").open(config, () => {
          socket?.terminate();
          schedule();
        });
        if (stopped) {
          tunnel.close();
          return;
        }
        url = tunnel.url;
      } catch (error) {
        console.warn("Gateway tunnel unavailable: " + (error.code || "SSH_TUNNEL_FAILED"));
        schedule();
        return;
      }
    }
    socket = new WebSocket(url, {
      headers: { Authorization: "Bearer " + token },
      maxPayload: 65536,
      perMessageDeflate: false,
    });
    socket.on("open", () => {
      retry = 1000;
      console.log("Gateway connected");
      send({ type: "hello", version: "1.0.0", max_connections: limit });
    });
    socket.on("error", () => {});
    socket.on("message", (raw) => {
      message(raw).catch(() => socket.close());
    });
    socket.on("close", () => {
      for (const c of clients.values()) c.client?.destroy();
      clients.clear();
      if (!stopped) {
        tunnel?.close();
        tunnel = null;
        schedule();
      }
    });
  }
  connect();
  return {
    close: () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      tunnel?.close();
      socket?.close();
      for (const c of clients.values()) c.client?.destroy();
    },
  };
}
if (require.main === module) {
  const config = JSON.parse(
    fs.readFileSync(
      process.env.GATEWAY_CONFIG || path.resolve(__dirname, "../config.json"),
      "utf8",
    ),
  );
  const g = start(config, process.env.GATEWAY_TOKEN);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      g.close();
      setTimeout(() => process.exit(0), 500);
    });
}
module.exports = { start };
