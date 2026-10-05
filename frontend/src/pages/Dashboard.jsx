import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import { SettingsModal } from '../components/SettingsPrimitives';
import '../styles/settings.css';
import '../styles/dashboard.css';

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

function SummaryCard({ title, value, rows, color, icon, to, subtitle }) {
  return <Link className="dashboard-summary-card" style={{ '--summary-color': color }} to={to || '#'}>
    <div className="dashboard-summary-head">
      <span className="dashboard-summary-icon" style={{ background: `${color}14`, color }}>{icon}</span>
      <span><small>{title}</small><strong>{fmtNumber(value)}</strong><span className="dashboard-metric-caption">{subtitle || (title === 'Page' ? 'Tổng Page' : title === 'Device' ? 'Tổng thiết bị' : title === 'Error' ? 'Lỗi tác vụ cần xử lý' : 'Tổng account')}</span></span>
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
  const [deviceStatus,setDeviceStatus] = useState('ALL');
  const [deviceTask,setDeviceTask] = useState('ALL');
  const [selectedDevice,setSelectedDevice] = useState(null);
  const [refreshing,setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const resetFilters = () => { setDeviceSearch(''); setDeviceStatus('ALL'); setDeviceTask('ALL'); };


  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setRefreshing(true);
    try {
      const response = await dashboardApi.getSummary();
      setData(response.data || {});
      setError('');
    } catch (err) {
      setError(err.message || 'Không tải được Dashboard');
    } finally {
      setLoading(false); setRefreshing(false); inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const devices = useMemo(() => {
    const search = deviceSearch.trim().toLowerCase();
    return (data?.devices?.rows || []).filter((row) => (deviceStatus === 'ALL' || row.status === deviceStatus) && (deviceTask === 'ALL' || row.current_task === deviceTask) && (!search || `${row.device_name || ''} ${row.device_id || ''} ${row.current_uid || ''} ${row.current_task || ''}`.toLowerCase().includes(search)));
  }, [data, deviceSearch, deviceStatus, deviceTask]);

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
    number(deviceSummary.offline) > 0 && { label: `${fmtNumber(deviceSummary.offline)} thiết bị Offline`, status:'OFFLINE' },
    ...TASKS.filter((task) => number(tasks[task.key]?.errors) > 0).map((task) => ({ label: `${fmtNumber(tasks[task.key].errors)} ${task.title} Error`, to: task.to })),
    data?.scheduler?.last_error && { label: 'Scheduler đang có lỗi', to: '#tasks' },
  ].filter(Boolean);

  return <div className="page dashboard-monitor-page">
    <div className="page-header dashboard-monitor-header">
      <div><h1>Dashboard hệ thống</h1><p>Theo dõi realtime hoạt động account, task và thiết bị.</p></div>
      <div className="dashboard-header-actions"><div className="dashboard-last-sync" title={fmtDate(data?.generated_at)}><span className={`dashboard-live-dot${error ? ' warning' : ''}`} /><strong>{error ? 'Chưa cập nhật được' : refreshing ? 'Đang cập nhật...' : data ? 'Live' : 'Chưa có dữ liệu'}</strong><small>Cập nhật {fmtTime(data?.generated_at)} · mỗi 15 giây</small></div><button className="settings-button secondary small" disabled={refreshing} onClick={load}>↻ Làm mới</button></div>
    </div>
    {error && <div className="dashboard-fetch-error" role="alert">{error}{data && <span>Đang hiển thị dữ liệu từ lần cập nhật thành công gần nhất.</span>}</div>}
    <div className={`dashboard-health${alerts.length || error ? ' attention' : ''}`} role="status"><strong>{error ? 'Không thể xác nhận tình trạng hiện tại' : !data ? 'Chưa có dữ liệu hệ thống' : alerts.length ? 'Hệ thống cần chú ý' : 'Hệ thống hoạt động bình thường'}</strong><span>{fmtNumber(deviceSummary.online)} Online · {fmtNumber(deviceSummary.running)} Running · {fmtNumber(deviceSummary.idle)} Idle · {fmtNumber(deviceSummary.offline)} Offline</span></div>
    {alerts.length > 0 ? <div className="dashboard-alerts" aria-label="Cảnh báo nhanh">{alerts.map((alert) => alert.status ? <button key={alert.label} onClick={() => { setDeviceStatus(alert.status); setDeviceTask('ALL'); setDeviceSearch(''); document.getElementById('devices')?.focus(); }}><span>⚠</span>{alert.label}</button> : <Link key={alert.label} to={alert.to}><span>⚠</span>{alert.label}<span aria-hidden="true">↗</span></Link>)}</div> : data && !error && <p className="dashboard-all-clear">✓ Không có lỗi cần xử lý.</p>}

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

    <section id="tasks" tabIndex={-1} className="card dashboard-task-section">
      <div className="card-header"><div><h3>Công việc realtime</h3><small>Trạng thái hàng đợi và tác vụ đang chạy</small></div></div>
      <div className="table-container"><table className="dashboard-task-table"><thead><tr><th>Công việc</th><th>READY</th><th>RUNNING</th><th>ERROR</th></tr></thead>
        <tbody>{TASKS.map((task) => <tr key={task.key} className={number(tasks[task.key]?.errors) > 0 ? 'has-errors' : ''}>
          <td><Link to={task.to}>{number(tasks[task.key]?.errors) > 0 && <span className="dashboard-problem-dot" aria-label="Có lỗi" />}{task.title}</Link></td>
          <td><Link className="dashboard-task-value is-ready" to={task.to}>{fmtNumber(tasks[task.key]?.ready)}</Link></td>
          <td><Link className="dashboard-task-value is-running" to={task.to}>{fmtNumber(tasks[task.key]?.running)}</Link></td>
          <td><Link className="dashboard-task-value is-error" to={task.to}>{fmtNumber(tasks[task.key]?.errors)}</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section id="devices" tabIndex={-1} className="card dashboard-device-card">
      <div className="card-header"><div><h3>Thiết bị</h3><small>Theo dõi máy và account đang hoạt động</small></div><span className="dashboard-device-scope">{devices.length} / {(data?.devices?.rows || []).length} máy trong dữ liệu đã tải{number(deviceSummary.total) > (data?.devices?.rows || []).length && ' · API giới hạn 100 máy'}</span></div>
      <div className="dashboard-device-filters"><div className="dashboard-status-filters">{[['ALL','Tất cả',deviceSummary.total],['RUNNING','Running',deviceSummary.running],['IDLE','Idle',deviceSummary.idle],['OFFLINE','Offline',deviceSummary.offline]].map(([value,label,count]) => <button key={value} aria-pressed={deviceStatus === value} onClick={() => setDeviceStatus(value)}>{label}<span>{fmtNumber(count)}</span></button>)}</div><div className="dashboard-filter-inputs"><label className="dashboard-search"><span className="sr-only">Tìm máy, account hoặc task</span><input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Tìm máy hoặc account..." />{deviceSearch && <button aria-label="Xóa tìm kiếm" onClick={() => setDeviceSearch('')}>×</button>}</label><label><span className="sr-only">Lọc task thiết bị</span><select aria-label="Lọc task thiết bị" value={deviceTask} onChange={(e) => setDeviceTask(e.target.value)}><option value="ALL">Tất cả task</option>{[...new Set((data?.devices?.rows || []).map((row) => row.current_task).filter(Boolean))].sort().map((task) => <option key={task} value={task}>{task}</option>)}</select></label>{(deviceSearch || deviceStatus !== 'ALL' || deviceTask !== 'ALL') && <button className="settings-button ghost small" onClick={resetFilters}>Xóa bộ lọc</button>}</div></div>
      <div className="table-container"><table className="dashboard-device-table"><thead><tr><th>STT</th><th>Thiết bị</th><th>Facebook</th><th>Instagram</th><th>Trạng thái</th><th>Task hiện tại / gần nhất</th><th>Account</th><th>Runtime</th><th>Next available</th><th>Last Seen</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{!devices.length ? <tr><td colSpan={11} className="empty-cell">{(data?.devices?.rows || []).length ? <>Không tìm thấy thiết bị phù hợp.<button className="settings-button secondary small" onClick={resetFilters}>Xóa bộ lọc</button></> : 'Chưa có dữ liệu thiết bị'}</td></tr> : devices.map((row, index) => {
          const offline = row.status === 'OFFLINE';
          const running = row.status === 'RUNNING';
          return <tr key={row.device_id} className={`dashboard-device-row is-${String(row.status || '').toLowerCase()}`}>
            <td>{index + 1}</td><td><strong>{row.device_name || row.device_id}</strong>{row.device_name !== row.device_id && <small className="dashboard-device-id">{row.device_id}</small>}</td><td className="dashboard-account-count">{fmtNumber(row.facebook_accounts)}</td><td className="dashboard-account-count">{fmtNumber(row.instagram_accounts)}</td>
            <td><StatusBadge status={row.status} />{row.status === 'IDLE' && <small className={row.next_available ? 'dashboard-idle-ready' : 'dashboard-idle-empty'}>{row.next_available ? 'CÓ VIỆC' : 'Không có việc'}</small>}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{row.current_task || '-'}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{row.current_uid || '-'}</td>
            <td>{running ? runtime(row.started_at) : '-'}</td><td>{row.status === 'IDLE' && row.next_available ? <span className="dashboard-next-task"><b>Sẵn sàng</b><small>{row.next_available.task_type}</small><small>{fmtNumber(row.next_available.count)} task</small></span> : '-'}</td><td title={fmtDate(row.last_seen)}>{relativeTime(row.last_seen)}</td><td><button className="settings-button ghost small" aria-label={`Chi tiết ${row.device_name || row.device_id}`} onClick={() => setSelectedDevice(row.device_id)}>Chi tiết</button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    {selectedDevice && <DeviceDetail row={(data?.devices?.rows || []).find((row) => row.device_id === selectedDevice)} onClose={() => setSelectedDevice(null)} />}
  </div>;
}

function DeviceDetail({ row, onClose }) {
  return <SettingsModal title={row?.device_name || row?.device_id || 'Thiết bị'} onClose={onClose}>{row ? <><p className="settings-helper">{row.device_id}</p><dl className="dashboard-device-detail">{[
    ['Trạng thái',<StatusBadge status={row.status} />],['Last seen',relativeTime(row.last_seen)],['Facebook',fmtNumber(row.facebook_accounts)+' account'],['Instagram',fmtNumber(row.instagram_accounts)+' account'],['Task hiện tại / gần nhất',row.current_task || '—'],['Account',row.current_uid || '—'],['Runtime',row.status === 'RUNNING' ? runtime(row.started_at) : '—'],['Next available',row.next_available ? `${row.next_available.task_type} · ${fmtNumber(row.next_available.count)} task sẵn sàng` : '—'],['Lỗi gần nhất',row.last_error || 'Không có lỗi được báo cáo']
  ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></> : <p className="settings-helper">Thiết bị không còn trong snapshot hiện tại.</p>}</SettingsModal>;
}
