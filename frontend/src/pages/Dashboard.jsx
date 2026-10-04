import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';

const number = (value) => Number(value) || 0;
const fmtNumber = (value) => number(value).toLocaleString('vi-VN');
const fmtDate = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const fmtTime = (value) => value ? new Date(value).toLocaleTimeString('vi-VN', { hour12: false }) : '-';
const relativeTime = (value) => {
  if (!value) return '-';
  const seconds = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 1000), 0);
  if (seconds < 10) return 'Vừa xong';
  if (seconds < 60) return `${seconds} giây trước`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
};
const runtime = (startedAt) => {
  if (!startedAt) return '-';
  const seconds = Math.max(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000), 0);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const STATUS_COLOR = { RUNNING: '#7c3aed', IDLE: '#0284c7', OFFLINE: '#64748b', ONLINE: '#059669' };

const TASKS = [
  { key: 'nurture_facebook', title: 'Nuôi Facebook', to: '/facebook-nurture' },
  { key: 'nurture_instagram', title: 'Nuôi Instagram', to: '/facebook-nurture?platform=instagram' },
  { key: 'reg_page', title: 'Reg Page', to: '/facebook-jobs' },
  { key: 'page_job', title: 'Page Job', to: '/facebook-jobs' },
  { key: 'reg_instagram', title: 'Reg Instagram', to: '/facebook-reg' },
  { key: 'instagram_job', title: 'Instagram Job', to: '/facebook-jobs?platform=instagram' },
];

function SummaryCard({ title, value, rows, color, icon, to }) {
  return <Link className="dashboard-summary-card" style={{ '--summary-color': color }} to={to || '#'}>
    <div className="dashboard-summary-head">
      <span className="dashboard-summary-icon" style={{ background: `${color}14`, color }}>{icon}</span>
      <span><small>{title}</small><strong>{fmtNumber(value)}</strong></span>
    </div>
    <div className="dashboard-summary-details">
      {rows.map((row) => <span key={row.label}><em>{row.label}</em><b className={row.danger ? 'is-danger' : ''}>{fmtNumber(row.value)}</b></span>)}
    </div>
  </Link>;
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.OFFLINE;
  return <span className="dashboard-status" style={{ color, background: `${color}12` }}><i style={{ background: color }} />{status}</span>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await dashboardApi.getSummary();
      setData(response.data || {});
      setError('');
    } catch (err) {
      setError(err.message || 'Không tải được Dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const devices = useMemo(() => {
    const search = deviceSearch.trim().toLowerCase();
    return (data?.devices?.rows || []).filter((row) => !search || `${row.device_name} ${row.device_id} ${row.current_uid}`.toLowerCase().includes(search));
  }, [data, deviceSearch]);

  if (loading) return <div className="loading-wrap"><div className="spinner" />Đang tải Dashboard...</div>;
  const accounts = data?.accounts || {};
  const fb = accounts.facebook || {};
  const ig = accounts.instagram || {};
  const pages = accounts.pages || {};
  const tasks = data?.tasks || {};
  const deviceSummary = data?.devices?.summary || {};
  const nurtureErrors = number(tasks.nurture_facebook?.errors) + number(tasks.nurture_instagram?.errors);
  const pageErrors = number(tasks.reg_page?.errors) + number(tasks.page_job?.errors);
  const instagramErrors = number(tasks.reg_instagram?.errors) + number(tasks.instagram_job?.errors);
  const taskErrors = nurtureErrors + pageErrors + instagramErrors;
  const alerts = [
    number(deviceSummary.offline) > 0 && { label: `${fmtNumber(deviceSummary.offline)} thiết bị Offline`, to: '#devices' },
    ...TASKS.filter((task) => number(tasks[task.key]?.errors) > 0).map((task) => ({ label: `${fmtNumber(tasks[task.key].errors)} ${task.title} Error`, to: task.to })),
    data?.scheduler?.last_error && { label: 'Scheduler đang có lỗi', to: '#tasks' },
  ].filter(Boolean);

  return <div className="page dashboard-monitor-page">
    <div className="page-header dashboard-monitor-header">
      <div><h1>📊 Dashboard hệ thống</h1><p>Giám sát gần realtime · cập nhật mỗi 15 giây</p></div>
      <div className="dashboard-last-sync" title={fmtDate(data?.generated_at)}><span className="dashboard-live-dot" />Dữ liệu lúc {fmtTime(data?.generated_at)}</div>
    </div>
    {error && <div className="error-bar">{error}</div>}

    {alerts.length > 0 && <div className="dashboard-alerts" aria-label="Cảnh báo nhanh">
      {alerts.map((alert) => <Link key={alert.label} to={alert.to}><span>⚠</span>{alert.label}</Link>)}
    </div>}

    <section>
      <div className="dashboard-section-title"><h2>Tổng quan</h2><span>Chọn card để mở danh sách</span></div>
      <div className="dashboard-summary-grid-main">
        <SummaryCard icon="f" title="Facebook" value={fb.total} color="#1877f2" to="/facebook-jobs" rows={[
          { label: 'Login thành công', value: fb.login_success }, { label: 'Chưa nuôi', value: fb.not_nurtured }, { label: 'Lỗi', value: fb.errors, danger: true },
        ]} />
        <SummaryCard icon="P" title="Page" value={pages.total} color="#d97706" to="/facebook-jobs" rows={[
          { label: 'Chưa làm', value: pages.ready }, { label: 'Đang chạy', value: pages.running }, { label: 'Đã xong', value: pages.done },
        ]} />
        <SummaryCard icon="IG" title="Instagram" value={ig.total} color="#db2777" to="/facebook-jobs?platform=instagram" rows={[
          { label: 'Active', value: ig.active }, { label: 'Chưa nuôi', value: ig.not_nurtured }, { label: 'Lỗi', value: ig.errors, danger: true },
        ]} />
        <SummaryCard icon="▣" title="Device" value={deviceSummary.total} color="#0284c7" to="#devices" rows={[
          { label: 'Running', value: deviceSummary.running }, { label: 'Idle', value: deviceSummary.idle }, { label: 'Offline', value: deviceSummary.offline, danger: true },
        ]} />
        <SummaryCard icon="!" title="Error" value={taskErrors} color="#dc2626" to="#tasks" rows={[
          { label: 'Nuôi account', value: nurtureErrors, danger: true }, { label: 'Page', value: pageErrors, danger: true }, { label: 'Instagram', value: instagramErrors, danger: true },
        ]} />
      </div>
    </section>

    <section id="tasks" className="card dashboard-task-section">
      <div className="card-header"><div><h3>Công việc realtime</h3><small>Trạng thái hiện tại của từng luồng</small></div></div>
      <div className="table-container"><table className="dashboard-task-table"><thead><tr><th>Công việc</th><th>READY</th><th>RUNNING</th><th>ERROR</th></tr></thead>
        <tbody>{TASKS.map((task) => <tr key={task.key}>
          <td><Link to={task.to}>{task.title}</Link></td>
          <td><Link className="dashboard-task-value is-ready" to={task.to}>{fmtNumber(tasks[task.key]?.ready)}</Link></td>
          <td><Link className="dashboard-task-value is-running" to={task.to}>{fmtNumber(tasks[task.key]?.running)}</Link></td>
          <td><Link className="dashboard-task-value is-error" to={task.to}>{fmtNumber(tasks[task.key]?.errors)}</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section id="devices" className="card dashboard-device-card">
      <div className="card-header"><div><h3>🖥 Thiết bị</h3><small>{fmtNumber(deviceSummary.running)} running · {fmtNumber(deviceSummary.idle)} idle · {fmtNumber(deviceSummary.offline)} offline</small></div><input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Tìm máy hoặc account..." /></div>
      <div className="table-container"><table className="dashboard-device-table"><thead><tr><th>STT</th><th>Thiết bị</th><th>Facebook</th><th>Instagram</th><th>Trạng thái</th><th>Task</th><th>Account</th><th>Runtime</th><th>Next available</th><th>Last Seen</th></tr></thead>
        <tbody>{!devices.length ? <tr><td colSpan={10} className="empty-cell">Chưa có dữ liệu thiết bị</td></tr> : devices.map((row, index) => {
          const offline = row.status === 'OFFLINE';
          const running = row.status === 'RUNNING';
          return <tr key={row.device_id} className={`dashboard-device-row is-${String(row.status || '').toLowerCase()}`}>
            <td>{index + 1}</td><td><strong>{row.device_name || row.device_id}</strong>{row.device_name !== row.device_id && <small className="dashboard-device-id">{row.device_id}</small>}</td><td className="dashboard-account-count">{fmtNumber(row.facebook_accounts)}</td><td className="dashboard-account-count">{fmtNumber(row.instagram_accounts)}</td>
            <td><StatusBadge status={row.status} />{row.status === 'IDLE' && <small className={row.next_available ? 'dashboard-idle-ready' : 'dashboard-idle-empty'}>{row.next_available ? 'CÓ VIỆC' : 'Không có việc'}</small>}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{offline && row.current_task && <small>Last Task</small>}{row.current_task || '-'}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{offline && row.current_uid && <small>Last Account</small>}{row.current_uid || '-'}</td>
            <td>{running ? runtime(row.started_at) : '-'}</td><td>{row.status === 'IDLE' && row.next_available ? <span className="dashboard-next-task"><b>{row.next_available.task_type}</b><small>{fmtNumber(row.next_available.count)} task</small></span> : '-'}</td><td title={fmtDate(row.last_seen)}>{relativeTime(row.last_seen)}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
  </div>;
}
