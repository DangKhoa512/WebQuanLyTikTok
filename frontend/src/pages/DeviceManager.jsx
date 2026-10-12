import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { deviceManagerApi as api } from "../services/api";
const DeviceTerminal = lazy(() => import("../components/DeviceTerminal"));
import { toast } from "../components/Toast";
import "./DeviceManager.css";
const fmt = (v) => (v ? new Date(v).toLocaleString("vi-VN") : "—");
const uuid = () => crypto.randomUUID();
const blank = { groups: [], lans: [], gateways: [] };
export default function DeviceManager() {
  const [data, setData] = useState(null),
    [catalog, setCatalog] = useState(blank),
    [permissions, setPermissions] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState([]),
    [filters, setFilters] = useState({ page: 1, page_size: 50 }),
    [tab, setTab] = useState("devices"),
    [detail, setDetail] = useState(null),
    [detailTab, setDetailTab] = useState("overview"),
    [history, setHistory] = useState(null),
    [form, setForm] = useState({}),
    [token, setToken] = useState(null),
    [grantUser, setGrantUser] = useState(""),
    [grants, setGrants] = useState([]),
    [bulkRequest, setBulkRequest] = useState(null),
    [bulkActions, setBulkActions] = useState([]);
  const pending = useRef(false),
    generation = useRef(0);
  const can = (p) => permissions.includes(p);
  const load = useCallback(async () => {
    const requestKey = JSON.stringify(filters);
    if (pending.current?.key === requestKey) return;
    const marker = { key: requestKey };
    pending.current = marker;
    const g = generation.current;
    try {
      const [d, c, p] = await Promise.all([
        api.list(filters),
        api.catalog(),
        api.permissions(),
      ]);
      if (g !== generation.current) return;
      setData(d.data);
      setCatalog(c.data);
      setPermissions(p.data);
      setError("");
    } catch (e) {
      if (g === generation.current) setError(e.message);
    } finally {
      if (pending.current === marker) pending.current = false;
    }
  }, [filters]);
  useEffect(() => {
    generation.current++;
    load();
    const timer = setInterval(load, 15000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!detail) return;
    let active = true;
    const refresh = () =>
      Promise.all([
        api.history(detail.device_id),
        api.getDevice(detail.device_id),
      ])
        .then(([r, d]) => {
          if (active) {
            setHistory(r.data);
            setDetail(d.data);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [detail?.device_id]);
  useEffect(() => {
    if (!bulkRequest) return;
    let active = true;
    const refresh = () =>
      api
        .getActions({ request_id: bulkRequest })
        .then((r) => {
          if (active)
            setBulkActions((prior) =>
              prior.map(
                (a) => r.data.find((row) => row.device_id === a.device_id) || a,
              ),
            );
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bulkRequest]);
  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const filter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
    setSelection([]);
  };
  const open = (row) => {
    setDetail(row);
    setDetailTab("overview");
    setHistory(null);
    setForm({
      device_name: row.device_name,
      command_adapter: row.command_adapter,
      host_fingerprint: row.ssh_host_fingerprint || "",
    });
  };
  async function queue(action, ids) {
    let confirmed = false,
      confirm_running = false;
    if (["RESPRING", "REBOOT"].includes(action)) {
      confirmed = window.confirm(
        `${action}: xác nhận thao tác trên ${ids.length} thiết bị? Thao tác có thể ngắt script đang chạy.`,
      );
      if (!confirmed) return;
      const running = (data?.rows || []).filter(
        (d) =>
          ids.includes(d.device_id) &&
          (d.status === "RUNNING" || d.active_task),
      );
      if (running.length) {
        confirm_running = window.confirm(
          "Có thiết bị RUNNING. Bạn vẫn muốn tiếp tục?",
        );
        if (!confirm_running) return;
      }
    }
    await act(async () => {
      const request_id = uuid();
      setBulkRequest(request_id);
      setBulkActions(
        ids.map((device_id) => ({ device_id, status: "SUBMITTING" })),
      );
      const response = await api
        .actions({
          action,
          device_ids: ids,
          request_id,
          confirmed,
          confirm_running,
        })
        .catch((e) => {
          setBulkActions((rows) =>
            rows.map((a) =>
              a.status === "SUBMITTING" ? { ...a, status: "UNCONFIRMED" } : a,
            ),
          );
          throw new Error(
            e.message +
              " · Yêu cầu " +
              request_id +
              " đang được đối soát; kiểm tra lịch sử trước khi gửi thao tác mới.",
          );
        });
      setBulkActions(response.data.actions);
      const rejected = response.data.actions.filter(
        (a) => a.status === "REJECTED",
      );
      toast[rejected.length ? "error" : "success"](
        rejected.length
          ? `${rejected.length} thao tác bị từ chối: ${rejected[0].error_code}`
          : "Đã đưa thao tác vào hàng đợi",
      );
      if (detail) setHistory((await api.history(detail.device_id)).data);
    });
  }
  const cards = [
    ["total", "Tổng thiết bị"],
    ["online", "Online"],
    ["running", "Running"],
    ["idle", "Idle"],
    ["offline", "Offline"],
    ["ssh_online", "SSH Online"],
    ["ssh_offline", "SSH Offline"],
    ["needs_attention", "Cần xử lý"],
  ];
  return (
    <div className="dm-page">
      <header className="dm-header">
        <div>
          <h1>Quản lý thiết bị</h1>
          <p>Thiết bị, nhóm, mạng LAN và SSH Gateway · Cập nhật mỗi 15 giây</p>
        </div>
        <Link to="/machine-account-stats">Thống kê account theo máy →</Link>
      </header>
      {error && (
        <div role="alert" className="dm-error">
          {error}
          <button onClick={load}>Thử lại</button>
        </div>
      )}
      <div className="dm-cards">
        {cards.map(([key, label]) => (
          <div key={key}>
            <small>{label}</small>
            <strong>{data?.summary?.[key] ?? "—"}</strong>
          </div>
        ))}
      </div>
      <nav className="dm-tabs">
        {[
          ["devices", "Thiết bị"],
          ["groups", "Nhóm thiết bị"],
          ["lans", "Mạng LAN"],
          ["gateways", "SSH Gateway"],
          ...(can("GATEWAY_MANAGE") ? [["permissions", "Phân quyền"]] : []),
        ].map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "devices" && (
        <section className="dm-card">
          <div className="dm-toolbar">
            <input
              aria-label="Tìm thiết bị"
              placeholder="Tìm tên hoặc Device ID"
              value={filters.search || ""}
              onChange={(e) => filter("search", e.target.value)}
            />
            <select
              aria-label="Nhóm thiết bị"
              value={filters.group_id || ""}
              onChange={(e) => filter("group_id", e.target.value)}
            >
              <option value="">Tất cả nhóm</option>
              <option value="none">Chưa phân nhóm</option>
              {catalog.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Mạng LAN"
              value={filters.lan_id || ""}
              onChange={(e) => filter("lan_id", e.target.value)}
            >
              <option value="">Tất cả LAN</option>
              <option value="none">Chưa gán LAN</option>
              {catalog.lans.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Device Status"
              value={filters.status || ""}
              onChange={(e) => filter("status", e.target.value)}
            >
              <option value="">Device Status</option>
              {["RUNNING", "IDLE", "OFFLINE"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="SSH Status"
              value={filters.ssh_status || ""}
              onChange={(e) => filter("ssh_status", e.target.value)}
            >
              <option value="">SSH Status</option>
              {["ONLINE", "OFFLINE", "UNKNOWN"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              aria-label="Private IP"
              placeholder="Private IP chính xác"
              value={filters.private_ip || ""}
              onChange={(e) => filter("private_ip", e.target.value)}
            />
            <input
              aria-label="Current Task"
              placeholder="Task chính xác"
              value={filters.task || ""}
              onChange={(e) => filter("task", e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={filters.needs_attention === "true"}
                onChange={(e) =>
                  filter("needs_attention", e.target.checked ? "true" : "")
                }
              />{" "}
              Cần xử lý
            </label>
          </div>
          {selection.length > 0 && (
            <div className="dm-toolbar">
              <strong>{selection.length} máy đã chọn</strong>
              {can("DEVICE_GROUP_MANAGE") && (
                <select
                  aria-label="Chuyển nhóm"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value !== "")
                      act(() =>
                        api.move({
                          device_ids: selection,
                          group_id:
                            e.target.value === "none"
                              ? null
                              : Number(e.target.value),
                        }),
                      );
                    e.target.value = "";
                  }}
                >
                  <option value="">Chuyển nhóm...</option>
                  <option value="none">Chưa phân nhóm</option>
                  {catalog.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
              {can("DEVICE_LAN_MANAGE") && (
                <select
                  aria-label="Chuyển LAN"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value !== "")
                      act(() =>
                        api.move({
                          device_ids: selection,
                          lan_id:
                            e.target.value === "none"
                              ? null
                              : Number(e.target.value),
                        }),
                      );
                    e.target.value = "";
                  }}
                >
                  <option value="">Chuyển LAN...</option>
                  <option value="none">Chưa gán LAN</option>
                  {catalog.lans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              {can("DEVICE_BULK_ACTION") &&
                [
                  ["SSH_CHECK", "Kiểm tra SSH", "DEVICE_SSH_CHECK"],
                  ["AUTOTOUCH_CHECK", "Kiểm tra AutoTouch", "DEVICE_SSH_CHECK"],
                  ["DEVICE_INFO", "Thông tin", "DEVICE_SSH_CHECK"],
                  ["RESPRING", "Respring", "DEVICE_RESPRING"],
                  ["REBOOT", "Reboot", "DEVICE_REBOOT"],
                ]
                  .filter((a) => can(a[2]))
                  .map(([action, label]) => (
                    <button
                      disabled={busy}
                      key={action}
                      onClick={() => queue(action, selection)}
                    >
                      {label}
                    </button>
                  ))}
            </div>
          )}
          <div className="dm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Chọn cả trang"
                      type="checkbox"
                      checked={
                        !!data?.rows?.length &&
                        data.rows.every((d) => selection.includes(d.device_id))
                      }
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? (data?.rows || []).map((d) => d.device_id)
                            : [],
                        )
                      }
                    />
                  </th>
                  {[
                    "Thiết bị",
                    "Nhóm",
                    "LAN",
                    "Private IP",
                    "Gateway",
                    "Device Status",
                    "SSH Status",
                    "Task",
                    "Account",
                    "Last Seen",
                    "Chi tiết",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows?.map((d) => (
                  <tr key={d.device_id}>
                    <td>
                      <input
                        aria-label={"Chọn " + d.device_id}
                        type="checkbox"
                        checked={selection.includes(d.device_id)}
                        onChange={(e) =>
                          setSelection((s) =>
                            e.target.checked
                              ? [...s, d.device_id]
                              : s.filter((id) => id !== d.device_id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {d.device_name}
                      <small>{d.device_id}</small>
                    </td>
                    <td>{d.group_name || "—"}</td>
                    <td>{d.lan_name || "—"}</td>
                    <td>{d.private_ip || "—"}</td>
                    <td>{d.gateway_name || "—"}</td>
                    <td>
                      <span className={"dm-status " + d.status}>
                        {d.status}
                      </span>
                    </td>
                    <td>{d.ssh_status}</td>
                    <td>{d.current_task || "—"}</td>
                    <td>{d.current_uid || "—"}</td>
                    <td>{fmt(d.last_seen)}</td>
                    <td>
                      <button onClick={() => open(d)}>Chi tiết</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bulkActions.length > 0 && (
            <details open className="dm-bulk-results">
              <summary>
                Kết quả thao tác gần nhất ({bulkActions.length} thiết bị)
              </summary>
              <p>
                Request ID: {bulkRequest}. UNCONFIRMED nghĩa là chưa xác nhận
                được kết quả gửi yêu cầu.
              </p>
              <ul>
                {bulkActions.map((a) => (
                  <li key={a.device_id}>
                    {a.device_id} · {a.status} · {a.error_code || "—"}{" "}
                    <small>{a.id || ""}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!data?.rows?.length && <p>Không có thiết bị phù hợp.</p>}
          <div className="dm-toolbar">
            <span>
              {data?.total || 0} thiết bị · Trang {filters.page}
            </span>
            <button
              disabled={busy || filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Trước
            </button>
            <button
              disabled={
                busy || !data || filters.page * filters.page_size >= data.total
              }
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Sau
            </button>
          </div>
        </section>
      )}
      {["groups", "lans"].includes(tab) && (
        <section className="dm-card">
          <h2>{tab === "groups" ? "Nhóm thiết bị" : "Mạng LAN"}</h2>
          <input
            aria-label="Tìm nhóm hoặc LAN"
            placeholder="Tìm theo tên"
            value={form.collection_search || ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, collection_search: e.target.value }))
            }
          />
          {can(
            tab === "groups" ? "DEVICE_GROUP_MANAGE" : "DEVICE_LAN_MANAGE",
          ) && (
            <button
              disabled={busy}
              onClick={() => {
                const name = prompt("Tên mới");
                if (name) act(() => api.saveCollection(tab, null, { name }));
              }}
            >
              Tạo mới
            </button>
          )}
          <div className="dm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Mô tả</th>
                  <th>Số máy</th>
                  <th>Gateway</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {catalog[tab]
                  .filter((x) =>
                    x.name
                      .toLowerCase()
                      .includes((form.collection_search || "").toLowerCase()),
                  )
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{x.name}</td>
                      <td>{x.description || "—"}</td>
                      <td>{x.device_count}</td>
                      <td>
                        {tab === "lans"
                          ? catalog.gateways
                              .filter((g) => g.lan_ids.includes(x.id))
                              .map((g) => g.name)
                              .join(", ") || "—"
                          : "—"}
                      </td>
                      <td>
                        {can(
                          tab === "groups"
                            ? "DEVICE_GROUP_MANAGE"
                            : "DEVICE_LAN_MANAGE",
                        ) && (
                          <>
                            <button
                              onClick={() => {
                                const name = prompt("Tên", x.name);
                                if (name)
                                  act(() =>
                                    api.saveCollection(tab, x.id, {
                                      name,
                                      description:
                                        tab === "lans"
                                          ? prompt(
                                              "Mô tả",
                                              x.description || "",
                                            ) || ""
                                          : undefined,
                                    }),
                                  );
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => {
                                const message =
                                  tab === "lans" && x.device_count
                                    ? "LAN đang có máy. Xóa và đưa các máy về chưa gán LAN?"
                                    : "Xóa? Thiết bị và task được giữ nguyên.";
                                if (confirm(message))
                                  act(() =>
                                    api.deleteCollection(tab, x.id, {
                                      unassign: true,
                                    }),
                                  );
                              }}
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "gateways" && (
        <section className="dm-card">
          <h2>SSH Gateway</h2>
          <p>
            Gateway Windows kết nối chủ động qua WSS. SSH chưa được kiểm tra
            hiển thị UNKNOWN.
          </p>
          {can("GATEWAY_MANAGE") && (
            <button
              disabled={busy}
              onClick={() => {
                const name = prompt("Tên Gateway");
                if (name)
                  act(async () => {
                    const r = await api.createGateway({ name });
                    setToken(r.data);
                  });
              }}
            >
              Tạo Gateway
            </button>
          )}
          {token && (
            <div className="dm-error">
              <p>
                Token chỉ hiển thị lần này. Lưu vào biến môi trường
                GATEWAY_TOKEN trên máy Windows.
              </p>
              <input readOnly value={token.token} aria-label="Gateway token" />
              <button onClick={() => setToken(null)}>Đã lưu</button>
            </div>
          )}
          {catalog.gateways.map((g) => (
            <div key={g.id} className="dm-gateway">
              <strong>
                {g.name} · #{g.id} · {g.status}
              </strong>
              <p>
                Last Seen: {fmt(g.last_seen)} · Giới hạn: {g.max_connections}
              </p>
              <div className="dm-toolbar">
                {catalog.lans.map((l) => (
                  <label key={l.id}>
                    <input
                      disabled={!can("GATEWAY_MANAGE") || busy}
                      type="checkbox"
                      checked={g.lan_ids.includes(l.id)}
                      onChange={(e) =>
                        act(() =>
                          api.updateGateway(g.id, {
                            lan_ids: e.target.checked
                              ? [...g.lan_ids, l.id]
                              : g.lan_ids.filter((id) => id !== l.id),
                          }),
                        )
                      }
                    />
                    {l.name}
                  </label>
                ))}
                {can("GATEWAY_MANAGE") && (
                  <>
                    <button
                      onClick={() => {
                        const max = prompt(
                          "Số kết nối (1–20)",
                          g.max_connections,
                        );
                        if (max)
                          act(() =>
                            api.updateGateway(g.id, {
                              max_connections: Number(max),
                            }),
                          );
                      }}
                    >
                      Giới hạn
                    </button>
                    <button
                      onClick={() =>
                        act(() =>
                          api.updateGateway(g.id, { is_active: !g.is_active }),
                        )
                      }
                    >
                      {g.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm("Đổi token và ngắt kết nối Gateway hiện tại?")
                        )
                          act(async () =>
                            setToken(
                              (
                                await api.updateGateway(g.id, {
                                  rotate_token: true,
                                })
                              ).data,
                            ),
                          );
                      }}
                    >
                      Đổi token
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "permissions" && (
        <section className="dm-card">
          <h2>Quyền Device Manager</h2>
          <p>
            Chỉ admin cấp quyền. User mặc định quản lý nhóm/LAN và xem thiết bị;
            SSH và thao tác hàng loạt cần được cấp quyền.
          </p>
          <input
            placeholder="Username"
            value={grantUser}
            onChange={(e) => setGrantUser(e.target.value)}
          />
          <button
            disabled={busy || !grantUser}
            onClick={() =>
              act(async () => {
                const response = await api.getGrants(grantUser);
                setGrants(response.data.permissions);
              })
            }
          >
            Tải quyền hiện tại
          </button>
          <div className="dm-toolbar">
            {[
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
            ].map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={grants.includes(p)}
                  onChange={(e) =>
                    setGrants((v) =>
                      e.target.checked ? [...v, p] : v.filter((x) => x !== p),
                    )
                  }
                />
                {p}
              </label>
            ))}
          </div>
          <button
            disabled={busy || !grantUser}
            onClick={() => {
              if (
                confirm(
                  "Thay toàn bộ quyền Device Manager của " + grantUser + "?",
                )
              )
                act(() => api.grant(grantUser, grants));
            }}
          >
            Lưu quyền
          </button>
        </section>
      )}
      {detail && (
        <div className="dm-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={"Thiết bị " + detail.device_id}
            className="dm-dialog"
          >
            <header className="dm-header">
              <h2>
                {detail.device_name} · {detail.device_id}
              </h2>
              <button
                onClick={() => {
                  setDetail(null);
                  setToken(null);
                }}
              >
                Đóng
              </button>
            </header>
            <nav className="dm-tabs">
              {[
                ["overview", "Tổng quan"],
                ["terminal", "Terminal SSH"],
                ["logs", "Log"],
                ["history", "Lịch sử"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={detailTab === key ? "active" : ""}
                  onClick={() => setDetailTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {detailTab === "overview" && (
              <>
                <div className="dm-details">
                  {Object.entries({
                    Nhóm: detail.group_name,
                    LAN: detail.lan_name,
                    "Private IP": detail.private_ip,
                    Gateway: detail.gateway_name,
                    "Device Status": detail.status,
                    "SSH Status": detail.ssh_status,
                    Task: detail.current_task,
                    Account: detail.current_uid,
                    "Last Seen": fmt(detail.last_seen),
                    "IP Updated": fmt(detail.ip_updated_at),
                    Runtime:
                      detail.started_at &&
                      (detail.active_task || detail.status === "RUNNING")
                        ? Math.max(
                            0,
                            Math.floor(
                              (Date.now() -
                                new Date(detail.started_at).getTime()) /
                                60000,
                            ),
                          ) + " ph?t"
                        : "?",
                    "AutoTouch process": (() => {
                      const row = history?.actions?.find(
                        (a) =>
                          a.action === "AUTOTOUCH_CHECK" &&
                          a.status === "SUCCESS",
                      );
                      return typeof row?.result?.autotouch_process === "boolean"
                        ? row.result.autotouch_process
                          ? "?ang ch?y"
                          : "Kh?ng ph?t hi?n"
                        : "Ch?a ki?m tra";
                    })(),
                    "Script AutoTouch": "Ch?a c? telemetry x?c nh?n",
                  }).map(([key, value]) => (
                    <div key={key}>
                      <small>{key}</small>
                      <strong>{value || "—"}</strong>
                    </div>
                  ))}
                </div>
                <div className="dm-toolbar">
                  {[
                    ["SSH_CHECK", "Kiểm tra SSH", "DEVICE_SSH_CHECK"],
                    ["DEVICE_INFO", "Thông tin", "DEVICE_SSH_CHECK"],
                    [
                      "AUTOTOUCH_CHECK",
                      "Kiểm tra AutoTouch",
                      "DEVICE_SSH_CHECK",
                    ],
                    ["RESPRING", "Respring", "DEVICE_RESPRING"],
                    ["REBOOT", "Reboot", "DEVICE_REBOOT"],
                  ]
                    .filter((a) => can(a[2]))
                    .map(([action, label]) => (
                      <button
                        disabled={busy}
                        key={action}
                        onClick={() => queue(action, [detail.device_id])}
                      >
                        {label}
                      </button>
                    ))}
                </div>
                {can("DEVICE_EDIT") && (
                  <>
                    <label>
                      Tên thiết bị
                      <input
                        value={form.device_name || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            device_name: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api.configure(detail.device_id, {
                            device_name: form.device_name,
                          }),
                        )
                      }
                    >
                      Lưu tên
                    </button>
                    <div className="dm-toolbar">
                      <select
                        aria-label="Gán nhóm"
                        value={detail.device_group_id || ""}
                        onChange={(e) =>
                          act(async () => {
                            await api.move({
                              device_ids: [detail.device_id],
                              group_id: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                            setDetail(null);
                          })
                        }
                      >
                        <option value="">Chưa phân nhóm</option>
                        {catalog.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Gán LAN và Gateway"
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const [lan_id, gateway_id] = e.target.value
                            .split(":")
                            .map(Number);
                          act(async () => {
                            await api.move({
                              device_ids: [detail.device_id],
                              lan_id,
                              gateway_id,
                            });
                            setDetail(null);
                          });
                        }}
                      >
                        <option value="">Gán LAN + Gateway...</option>
                        {catalog.lans.flatMap((l) =>
                          catalog.gateways
                            .filter((g) => g.lan_ids.includes(l.id))
                            .map((g) => (
                              <option
                                key={l.id + ":" + g.id}
                                value={l.id + ":" + g.id}
                              >
                                {l.name} → {g.name}
                              </option>
                            )),
                        )}
                      </select>
                    </div>
                  </>
                )}
                {can("GATEWAY_MANAGE") && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(async () => {
                        const values = {
                          host_fingerprint: form.host_fingerprint,
                          command_adapter: form.command_adapter,
                        };
                        if (
                          form.ssh_user &&
                          (form.ssh_password || form.ssh_private_key)
                        )
                          values.credentials = {
                            username: form.ssh_user,
                            password: form.ssh_password,
                            private_key: form.ssh_private_key,
                            port: Number(form.ssh_port || 22),
                          };
                        await api.configure(detail.device_id, values);
                        setForm((f) => ({
                          ...f,
                          ssh_password: "",
                          ssh_private_key: "",
                        }));
                        toast.success("Đã lưu cấu hình SSH");
                      });
                    }}
                  >
                    <h3>Cấu hình SSH</h3>
                    <p>
                      Fingerprint SHA-256 dạng hex phải được xác minh trực tiếp
                      trên thiết bị. Host key thay đổi sẽ bị từ chối.
                    </p>
                    <div className="dm-toolbar">
                      <input
                        placeholder="SSH username"
                        autoComplete="off"
                        value={form.ssh_user || ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ssh_user: e.target.value }))
                        }
                      />
                      <input
                        placeholder="SSH password"
                        type="password"
                        autoComplete="new-password"
                        value={form.ssh_password || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            ssh_password: e.target.value,
                          }))
                        }
                      />
                      <input
                        placeholder="SSH port (22)"
                        type="number"
                        value={form.ssh_port || ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ssh_port: e.target.value }))
                        }
                      />
                      <input
                        placeholder="SHA-256 hex fingerprint"
                        value={form.host_fingerprint || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            host_fingerprint: e.target.value,
                          }))
                        }
                      />
                      <select
                        value={form.command_adapter || "UNCONFIGURED"}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            command_adapter: e.target.value,
                          }))
                        }
                      >
                        <option value="UNCONFIGURED">Chưa chọn adapter</option>
                        <option value="ROOTHIDE">RootHide</option>
                      </select>
                    </div>
                    <textarea
                      placeholder="SSH private key (thay cho password)"
                      value={form.ssh_private_key || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          ssh_private_key: e.target.value,
                        }))
                      }
                    />
                    <button disabled={busy}>Lưu cấu hình SSH</button>
                  </form>
                )}
              </>
            )}
            {detailTab === "terminal" &&
              (can("DEVICE_SSH_TERMINAL") ? (
                <Suspense fallback={<p>Đang tải Terminal...</p>}>
                  <DeviceTerminal deviceId={detail.device_id} />
                </Suspense>
              ) : (
                <p>Bạn chưa được cấp quyền Terminal SSH.</p>
              ))}
            {["logs", "history"].includes(detailTab) && (
              <>
                <p>
                  Log chỉ lưu kết quả kiểm tra và mã lỗi. Không lưu nội dung
                  terminal hoặc log AutoTouch chưa được tích hợp.
                </p>
                <div className="dm-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thao tác</th>
                        <th>Trạng thái</th>
                        <th>Bắt đầu</th>
                        <th>Kết thúc</th>
                        <th>Kết quả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history?.actions?.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {a.action}
                            <small>{a.id}</small>
                            <small>Gateway #{a.gateway_id || "—"}</small>
                          </td>
                          <td>{a.status}</td>
                          <td>{fmt(a.started_at)}</td>
                          <td>{fmt(a.finished_at)}</td>
                          <td>
                            {a.error_code || JSON.stringify(a.result || {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detailTab === "history" && (
                  <>
                    <h3>Task history</h3>
                    {history?.tasks?.map((t) => (
                      <p key={t.id}>
                        #{t.id} · {t.task_type} · {t.status} ·{" "}
                        {fmt(t.completed_at || t.locked_at)}
                      </p>
                    ))}
                    <h3>SSH sessions</h3>
                    {history?.sessions?.map((s) => (
                      <p key={s.id}>
                        {s.status} · {fmt(s.started_at)} · {s.error_code || "—"}
                      </p>
                    ))}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
