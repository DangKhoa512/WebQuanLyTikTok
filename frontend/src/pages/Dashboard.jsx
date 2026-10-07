import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardTasksFromRegistry } from '../services/dashboardTaskRegistry';
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

function TaskLink({to,children,...props}) {return to ? <Link to={to} {...props}>{children}</Link> : <span {...props}>{children}</span>;}
const deviceKey=row=>`${row.owner_username || ''}:${row.device_id}`;

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
  const [devicePage,setDevicePage]=useState(1);
  const [pageSize,setPageSize]=useState(50);
  const [searchQuery,setSearchQuery]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setSearchQuery(deviceSearch);setDevicePage(1);},300);return ()=>clearTimeout(timer);},[deviceSearch]);
  useEffect(()=>setDevicePage(1),[deviceStatus,deviceTask,pageSize]);
  const [selectedDevice,setSelectedDevice] = useState(null);
  const [refreshing,setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const pending=useRef(false),loadRef=useRef(null);
  const requestKey=JSON.stringify({device_status:deviceStatus,device_task:deviceTask,device_search:searchQuery,page:devicePage,page_size:pageSize});
  const currentKey=useRef(requestKey);currentKey.current=requestKey;
  const resetFilters = () => { setDeviceSearch(''); setDeviceStatus('ALL'); setDeviceTask('ALL'); };


  const load = useCallback(async () => {
    if (inFlight.current) {pending.current=true;return;}
    inFlight.current = true; setRefreshing(true);
    try {
      const response = await dashboardApi.getSummary(JSON.parse(requestKey));
      if(currentKey.current!==requestKey)return;
      setData(response.data || {});
      setError('');
    } catch (err) {
      if(currentKey.current!==requestKey)return;
      setError(err.message || 'Không tải được Dashboard');
    } finally {
      setLoading(false); setRefreshing(false); inFlight.current = false;
      if(pending.current){pending.current=false;queueMicrotask(()=>loadRef.current?.());}
    }
  }, [requestKey]);
  loadRef.current=load;

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const devices=data?.devices?.rows || [];

  if (loading) return <div className="loading-wrap"><div className="spinner" />Đang tải Dashboard...</div>;
  const accounts = data?.accounts || {};
  const fb = accounts.facebook || {};
  const ig = accounts.instagram || {};
  const pages = accounts.pages || {};
  const tasks = data?.tasks || {};
  const TASKS = dashboardTasksFromRegistry(data);
  const deviceSummary = data?.devices?.summary || {};
  const sumErrors = predicate => TASKS.filter(predicate).reduce((total,task)=>total+number(tasks[task.key]?.errors),0);
  const nurtureErrors = sumErrors(task=>task.taskKey.startsWith('NUOI_'));
  const pageErrors = sumErrors(task=>task.platform==='FACEBOOK' && !task.taskKey.startsWith('NUOI_'));
  const instagramErrors = sumErrors(task=>task.platform==='INSTAGRAM' && !task.taskKey.startsWith('NUOI_'));
  const taskErrors = sumErrors(()=>true);
  const alerts = [
    number(deviceSummary.offline) > 0 && { label: `${fmtNumber(deviceSummary.offline)} thiết bị Offline`, status:'OFFLINE' },
    ...TASKS.filter((task) => number(tasks[task.key]?.errors) > 0).map((task) => ({ label: `${fmtNumber(tasks[task.key].errors)} ${task.title} Error`, to: task.to || '#tasks' })),
    data?.scheduler?.last_error && { label: 'Scheduler đang có lỗi', to: '#tasks' },
  ].filter(Boolean);

  return <div className="page dashboard-monitor-page">
    <div className="page-header dashboard-monitor-header">
      <div><h1>Dashboard hệ thống</h1><p>Theo dõi realtime hoạt động account, task và thiết bị.{data?.scope === 'system' ? ' · Toàn hệ thống' : ''}</p></div>
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
      <div className="card-header"><div><h3>Công việc realtime</h3><small>Trạng thái bật/tắt của bạn · Số liệu hàng đợi và tác vụ đang chạy</small></div></div>
      <div className="table-container"><table className="dashboard-task-table"><thead><tr><th>Tác vụ</th><th>Trạng thái</th><th>READY</th><th>RUNNING</th><th>ERROR</th></tr></thead>
        <tbody>{TASKS.map((task) => <tr key={task.key} className={`${number(tasks[task.key]?.errors) > 0 ? 'has-errors' : ''} ${!task.enabled ? 'is-disabled' : ''}`} data-task-key={task.taskKey}>
          <td><TaskLink to={task.to}>{number(tasks[task.key]?.errors) > 0 && <span className="dashboard-problem-dot" aria-label="Có lỗi" />}{task.title}</TaskLink></td>
          <td className="dashboard-task-status-cell"><span className={`dashboard-task-status ${task.enabled?'is-enabled':'is-disabled'}`} title={task.enabled ? (task.systemEnabled?'Cấu hình Dispatcher của bạn đang bật tác vụ này.':'Cấu hình của bạn đang bật; loại tác vụ hiện bị tắt toàn hệ thống.') : 'Tác vụ này hiện đang tắt trong cấu hình Dispatcher của bạn.'}><span aria-hidden="true">●</span> {task.enabled?'Đang bật':'Đang tắt'}</span></td>
          <td><TaskLink className="dashboard-task-value is-ready" to={task.to}>{fmtNumber(tasks[task.key]?.ready)}</TaskLink></td>
          <td><TaskLink className="dashboard-task-value is-running" to={task.to}>{fmtNumber(tasks[task.key]?.running)}</TaskLink></td>
          <td><TaskLink className="dashboard-task-value is-error" to={task.to}>{fmtNumber(tasks[task.key]?.errors)}</TaskLink></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section id="devices" tabIndex={-1} className="card dashboard-device-card">
      <div className="card-header"><div><h3>Thiết bị</h3><small>Theo dõi máy và account đang hoạt động</small></div><span className="dashboard-device-scope">{fmtNumber(deviceSummary.total)}{data?.scope==='system' ? ' máy toàn hệ thống' : ` / ${fmtNumber(data?.devices?.capacity)} máy`} · Giới hạn {fmtNumber(data?.devices?.capacity)} máy/user</span></div>
      <div className="dashboard-device-filters"><div className="dashboard-status-filters">{[['ALL','Tất cả',deviceSummary.total],['RUNNING','Running',deviceSummary.running],['IDLE','Idle',deviceSummary.idle],['OFFLINE','Offline',deviceSummary.offline]].map(([value,label,count]) => <button key={value} aria-pressed={deviceStatus === value} onClick={() => setDeviceStatus(value)}>{label}<span>{fmtNumber(count)}</span></button>)}</div><div className="dashboard-filter-inputs"><label className="dashboard-search"><span className="sr-only">Tìm máy, account hoặc task</span><input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Tìm máy hoặc account..." />{deviceSearch && <button aria-label="Xóa tìm kiếm" onClick={() => setDeviceSearch('')}>×</button>}</label><label><span className="sr-only">Lọc task thiết bị</span><select aria-label="Lọc task thiết bị" value={deviceTask} onChange={(e) => setDeviceTask(e.target.value)}><option value="ALL">Tất cả task</option>{(data?.devices?.task_options || []).map((task) => <option key={task} value={task}>{task}</option>)}</select></label>{(deviceSearch || deviceStatus !== 'ALL' || deviceTask !== 'ALL') && <button className="settings-button ghost small" onClick={resetFilters}>Xóa bộ lọc</button>}</div></div>
      <div className="table-container"><table className="dashboard-device-table"><thead><tr><th>STT</th><th>Thiết bị</th><th>Facebook</th><th>Instagram</th><th>Trạng thái</th><th>Task hiện tại / gần nhất</th><th>Account</th><th>Runtime</th><th>Next available</th><th>Last Seen</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{!devices.length ? <tr><td colSpan={11} className="empty-cell">{number(deviceSummary.total)>0 ? <>Không tìm thấy thiết bị phù hợp.<button className="settings-button secondary small" onClick={resetFilters}>Xóa bộ lọc</button></> : 'Chưa có dữ liệu thiết bị'}</td></tr> : devices.map((row, index) => {
          const offline = row.status === 'OFFLINE';
          const running = row.status === 'RUNNING';
          return <tr key={deviceKey(row)} className={`dashboard-device-row is-${String(row.status || '').toLowerCase()}`}>
            <td>{(number(data?.devices?.page)-1)*number(data?.devices?.page_size)+index+1}</td><td><strong>{row.device_name || row.device_id}</strong>{data?.scope==='system' && <small className="dashboard-device-id">{row.owner_username}</small>}{row.device_name !== row.device_id && <small className="dashboard-device-id">{row.device_id}</small>}</td><td className="dashboard-account-count">{fmtNumber(row.facebook_accounts)}</td><td className="dashboard-account-count">{fmtNumber(row.instagram_accounts)}</td>
            <td><StatusBadge status={row.status} />{row.status === 'IDLE' && <small className={row.next_available ? 'dashboard-idle-ready' : 'dashboard-idle-empty'}>{row.next_available ? 'CÓ VIỆC' : 'Không có việc'}</small>}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{row.current_task || '-'}</td>
            <td className={offline ? 'dashboard-last-value' : ''}>{row.current_uid || '-'}</td>
            <td>{running ? runtime(row.started_at) : '-'}</td><td>{row.status === 'IDLE' && row.next_available ? <span className="dashboard-next-task"><b>Sẵn sàng</b><small>{row.next_available.task_type}</small><small>{fmtNumber(row.next_available.count)} task</small></span> : '-'}</td><td title={fmtDate(row.last_seen)}>{relativeTime(row.last_seen)}</td><td><button className="settings-button ghost small" aria-label={`Chi tiết ${row.device_name || row.device_id}`} onClick={() => setSelectedDevice(deviceKey(row))}>Chi tiết</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="dashboard-pagination"><span>{fmtNumber(data?.devices?.filtered_total)} máy phù hợp · Trang {data?.devices?.page || 1}/{data?.devices?.page_count || 1}</span><label>Số dòng <select aria-label="Số dòng mỗi trang" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[20,50,100].map(size=><option key={size}>{size}</option>)}</select></label><button className="settings-button secondary small" disabled={refreshing || number(data?.devices?.page)<=1} onClick={()=>setDevicePage(number(data?.devices?.page)-1)}>Trước</button><button className="settings-button secondary small" disabled={refreshing || number(data?.devices?.page)>=number(data?.devices?.page_count)} onClick={()=>setDevicePage(number(data?.devices?.page)+1)}>Sau</button></div>
    </section>
    {selectedDevice && <DeviceDetail row={(data?.devices?.rows || []).find((row) => deviceKey(row) === selectedDevice)} onClose={() => setSelectedDevice(null)} />}
  </div>;
}

function DeviceDetail({ row, onClose }) {
  return <SettingsModal title={row?.device_name || row?.device_id || 'Thiết bị'} onClose={onClose}>{row ? <><p className="settings-helper">{row.device_id}{row.owner_username ? ` · ${row.owner_username}` : ''}</p><dl className="dashboard-device-detail">{[
    ['Trạng thái',<StatusBadge status={row.status} />],['Last seen',relativeTime(row.last_seen)],['Facebook',fmtNumber(row.facebook_accounts)+' account'],['Instagram',fmtNumber(row.instagram_accounts)+' account'],['Task hiện tại / gần nhất',row.current_task || '—'],['Account',row.current_uid || '—'],['Runtime',row.status === 'RUNNING' ? runtime(row.started_at) : '—'],['Next available',row.next_available ? `${row.next_available.task_type} · ${fmtNumber(row.next_available.count)} task sẵn sàng` : '—'],['Lỗi gần nhất',row.last_error || 'Không có lỗi được báo cáo']
  ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></> : <p className="settings-helper">Thiết bị không còn trong snapshot hiện tại.</p>}</SettingsModal>;
}
