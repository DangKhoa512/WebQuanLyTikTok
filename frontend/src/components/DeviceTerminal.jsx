import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { deviceManagerApi } from "../services/api";
export default function DeviceTerminal({ deviceId }) {
  const host = useRef(null),
    cleanup = useRef(() => {}),
    [state, setState] = useState("Chưa kết nối");
  useEffect(() => () => cleanup.current(), [deviceId]);
  async function connect() {
    cleanup.current();
    setState("Đang kết nối...");
    let disposed = false,
      ws,
      term,
      fit,
      observer,
      input;
    cleanup.current = () => {
      disposed = true;
      observer?.disconnect();
      input?.dispose();
      ws?.close();
      term?.dispose();
    };
    try {
      const localDev =
        import.meta.env.DEV &&
        ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !localDev)
        throw new Error(
          "Terminal cần mở website bằng HTTPS (qua Internet hoặc VPN bảo mật).",
        );
      const apiBase = new URL(
        import.meta.env.VITE_API_BASE_URL || window.location.origin,
      );
      if (apiBase.protocol !== "https:" && !localDev)
        throw new Error("API Terminal cần HTTPS.");
      const response = await deviceManagerApi.terminal(deviceId);
      if (disposed) return;
      const session = response.data;
      const base = new URL(
        import.meta.env.VITE_API_BASE_URL || window.location.origin,
      );
      base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
      base.pathname = session.path;
      base.search = "";
      term = new Terminal({
        cursorBlink: true,
        convertEol: false,
        scrollback: 1000,
        fontSize: 13,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();
      ws = new WebSocket(base.toString());
      let ready = false;
      const resize = () => {
        if (disposed) return;
        fit.fit();
        if (ready && ws.readyState === 1)
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: Math.min(300, Math.max(20, term.cols)),
              rows: Math.min(100, Math.max(5, term.rows)),
            }),
          );
      };
      observer = new ResizeObserver(resize);
      observer.observe(host.current);
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: "auth", ticket: session.ticket }));
      ws.onmessage = (event) => {
        try {
          const m = JSON.parse(event.data);
          if (m.type === "ready") {
            ready = true;
            setState("Đã kết nối");
            resize();
            term.focus();
          }
          if (m.type === "data") term.write(m.data);
        } catch {
          ws.close();
        }
      };
      input = term.onData((data) => {
        if (ready && ws.readyState === 1)
          ws.send(JSON.stringify({ type: "input", data }));
      });
      ws.onerror = () => setState("Không kết nối được Gateway/Terminal");
      ws.onclose = () => {
        if (!disposed) setState("Đã ngắt kết nối");
        ready = false;
      };
    } catch (e) {
      if (!disposed) setState(e.message);
    }
  }
  return (
    <div>
      <p>
        Terminal cho phép chạy lệnh trực tiếp. Nội dung phiên không được lưu vào
        lịch sử.
      </p>
      <div className="dm-toolbar">
        <button onClick={connect}>Kết nối</button>
        <button
          onClick={() => {
            cleanup.current();
            setState("Đã ngắt kết nối");
          }}
        >
          Ngắt kết nối
        </button>
        <span role="status">{state}</span>
      </div>
      <div ref={host} className="dm-terminal" />
    </div>
  );
}
