import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import InstagramAccounts from './InstagramAccounts';
import SocialPlatformSwitch from '../components/SocialPlatformSwitch';
import { Link } from 'react-router-dom';
import { facebookApi, accountGroupApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import AccountGroupPicker from '../components/AccountGroupPicker';
import { copyText } from '../services/clipboard';

const STATUS_TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'CHO_LOGIN', icon: '🔐', label: 'Chờ login', color: '#06b6d4' },
  { value: 'DANG_LOGIN', icon: '⚡', label: 'Đang login', color: '#8b5cf6' },
  { value: 'DANG_LAM', icon: '⚡', label: 'Đang làm', color: '#8b5cf6' },
  { value: 'LOGIN_THANH_CONG', icon: '✅', label: 'Login thành công', color: '#10b981' },
  { value: 'LOGIN_FAIL', icon: '❌', label: 'Login fail', color: '#f97316' },
  { value: 'DA_CHAY_XONG', icon: '✅', label: 'Đã làm xong', color: '#10b981' },
  { value: 'ACCOUNT_DIE', icon: '💀', label: 'Die', color: '#6b7280' },
];

const REG_TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'ACCOUNT_DIE', icon: '💀', label: 'Die', color: '#6b7280' },
];

const LIVE_STATUSES = [
  { value: '', label: 'Tất cả' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'live', label: 'Live' },
  { value: 'die', label: 'Die' },
];

const STATUS_META = Object.fromEntries(STATUS_TABS.filter((tab) => tab.value).map((tab) => [tab.value, tab]));
const STATUS_COLOR = {
  CHO_LOGIN: { bg: 'rgba(6,182,212,.15)', color: '#0891b2' },
  DANG_LOGIN: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  DANG_LAM: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  LOGIN_THANH_CONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  LOGIN_FAIL: { bg: 'rgba(249,115,22,.15)', color: '#ea580c' },
  DA_CHAY_XONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  ACCOUNT_DIE: { bg: 'rgba(107,114,128,.16)', color: '#4b5563' },
};
const LIVE_COLOR = { live: '#10b981', die: '#ef4444', unknown: '#94a3b8' };
const pageJobLabel = (status) => status === 'DA_LAM' ? 'Đã làm' : status === 'DANG_LAM' ? 'Đang làm' : 'Chưa làm';
const pageJobClass = (status) => status === 'DA_LAM' ? 'done' : status === 'DANG_LAM' ? 'working' : 'pending';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const short = (value, len = 22) => {
  const text = String(value || '');
  return text.length > len ? `${text.slice(0, len)}...` : text || '-';
};
const groupTypeForKind = (kind) => kind === 'reg' ? 'facebook_reg' : 'facebook_job';
const totalFromCounts = (counts) => Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
const statusLabel = (status) => STATUS_META[status]?.label || status || '-';
const pageTitle = (row) => {
  const pages = Array.isArray(row.pages) ? row.pages : [];
  if (pages.length) return pages.map((page) => page.name || page.id).filter(Boolean).join(', ');
  return row.last_page_check_at ? 'Đã check - 0 page' : 'Chưa check page';
};

function ImportFacebookModal({ kind, groups, onGroupsChanged, onClose, onImported }) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [importing, setImporting] = useState(false);
  const lineCount = text.trim().split('\n').filter((line) => line.trim()).length;

  const handleImport = async () => {
    if (!text.trim()) return toast.error('Nhập account trước');
    setImporting(true);
    try {
      const defaultStatus = kind === 'job' ? 'CHO_LOGIN' : 'LOGIN_THANH_CONG';
      const res = await facebookApi.import(text, kind, defaultStatus, groupId || null);
      toast.success(res.message);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '660px', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Import Facebook {kind === 'reg' ? 'Reg' : 'Job'}</h3>
            <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: '.35rem' }}>Uid|pass|2fa|cookies|token|mail</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>x</button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <AccountGroupPicker
            accountType={groupTypeForKind(kind)}
            groups={groups}
            value={groupId}
            onChange={setGroupId}
            onGroupsChanged={onGroupsChanged}
          />
        </div>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="1000001|pass|2fa|c_user=...|EAAB...|mail@example.com"
          style={{ width: '100%', height: 270, resize: 'vertical', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>{lineCount} dòng</span>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Đóng</button>
          <button className="btn btn-primary" disabled={importing} onClick={handleImport}>{importing ? 'Đang import...' : 'Import'}</button>
        </div>
      </div>
    </div>
  );
}

function FacebookToolbar({
  isReg,
  selectedCount,
  groups,
  statusOptions,
  moveGroupId,
  movingGroup,
  statusPick,
  changingStatus,
  onStatusChange,
  onSetStatus,
  onMoveGroupChange,
  onMoveGroup,
  onCheckLive,
  checking,
  onCheckPages,
  checkingPages,
  onCopy,
  copying,
  onSyncToJob,
  syncingJob,
  onDelete,
  onClear,
}) {
  const [showGroupDlg, setShowGroupDlg] = useState(false);
  const [showStatusDlg, setShowStatusDlg] = useState(false);
  const busy = checking || checkingPages || copying || syncingJob || movingGroup || changingStatus;
  const popupStyle = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,.16)',
    padding: '1rem',
    minWidth: 230,
    zIndex: 200,
    color: '#0f172a',
  };
  const BB = ({ children, onClick, disabled, color = '#3b82f6' }) => (
    <button onClick={onClick} disabled={busy || disabled} style={{
      background: color,
      border: 'none',
      color: '#fff',
      borderRadius: '7px',
      padding: '.4rem .85rem',
      cursor: busy || disabled ? 'not-allowed' : 'pointer',
      fontSize: '.8rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      opacity: busy || disabled ? .65 : 1,
    }}>{children}</button>
  );

  const submitMoveGroup = () => {
    onMoveGroup();
    setShowGroupDlg(false);
  };

  const submitStatus = () => {
    onSetStatus();
    setShowStatusDlg(false);
  };

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      padding: '.75rem 1.25rem',
      marginBottom: '1rem',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      border: '1px solid rgba(255,255,255,.07)',
      display: 'flex',
      alignItems: 'center',
      gap: '.75rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#cbd5e1' }}>
        <span>Facebook Graph</span>
        <span style={{ color: '#6ee7b7', fontWeight: 800 }}>picture</span>
        <span style={{ color: '#93c5fd', fontWeight: 800 }}>me/accounts</span>
      </div>
      <div style={{ flex: 1 }} />
      {selectedCount > 0 && (
        <>
          <span style={{ background: '#06b6d4', borderRadius: '20px', color: '#fff', padding: '.25rem .75rem', fontWeight: 800, fontSize: '.82rem' }}>
            {selectedCount} đã chọn
          </span>
          {isReg && <BB onClick={onSyncToJob} color={'#8b5cf6'}>{syncingJob ? 'Đang chuyển sang Job...' : 'Chuyển sang Facebook Job'}</BB>}
          <div style={{ position: 'relative' }}>
            <BB onClick={() => { setShowGroupDlg((value) => !value); setShowStatusDlg(false); }} color="#f59e0b">Chuyển nhóm</BB>
            {showGroupDlg && (
              <div style={popupStyle}>
                <div style={{ fontWeight: 800, marginBottom: '.5rem', fontSize: '.85rem' }}>Chọn nhóm chuyển</div>
                <select value={moveGroupId} onChange={(event) => onMoveGroupChange(event.target.value)} style={{ width: '100%', padding: '.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '.75rem' }}>
                  <option value="">-- Chọn nhóm --</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button onClick={submitMoveGroup} disabled={!moveGroupId || busy} className="btn btn-success btn-sm" style={{ flex: 1 }}>Xác nhận</button>
                  <button onClick={() => setShowGroupDlg(false)} className="btn btn-secondary btn-sm">Hủy</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <BB onClick={() => { setShowStatusDlg((value) => !value); setShowGroupDlg(false); }} color="#10b981">Đổi trạng thái</BB>
            {showStatusDlg && (
              <div style={popupStyle}>
                <div style={{ fontWeight: 800, marginBottom: '.5rem', fontSize: '.85rem' }}>Chọn trạng thái</div>
                <select value={statusPick} onChange={(event) => onStatusChange(event.target.value)} style={{ width: '100%', padding: '.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '.75rem' }}>
                  <option value="">-- Chọn --</option>
                  {statusOptions.map((tab) => <option key={tab.value} value={tab.value}>{tab.icon} {tab.label}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button onClick={submitStatus} disabled={!statusPick || busy} className="btn btn-success btn-sm" style={{ flex: 1 }}>Xác nhận</button>
                  <button onClick={() => setShowStatusDlg(false)} className="btn btn-secondary btn-sm">Hủy</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <BB onClick={onCheckLive} color="#0ea5e9">{checking ? 'Đang check live...' : selectedCount ? 'Check live đã chọn' : 'Check live'}</BB>
      <BB onClick={onCheckPages} color="#3b82f6">{checkingPages ? 'Đang check page...' : selectedCount ? 'Check page đã chọn' : 'Check page'}</BB>
      {selectedCount > 0 && <BB onClick={onCopy} color="#3b82f6">Copy</BB>}
      {selectedCount > 0 && <BB onClick={onDelete} color="#dc2626">Xóa</BB>}
      {selectedCount > 0 && <button onClick={onClear} disabled={busy} className="btn btn-secondary btn-sm">✕ Bỏ chọn</button>}
    </div>
  );
}

function FacebookPageTable({ row, pages, resetting, onReset }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={'data-table fb-page-table'}>
        <thead><tr><th>ID PAGE</th><th>TÊN PAGE</th><th>TRẠNG THÁI LÀM</th><th>THAO TÁC</th></tr></thead>
        <tbody>{pages.map((pageItem) => (
          <tr key={pageItem.page_id}>
            <td><strong>{pageItem.page_id}</strong></td>
            <td>{pageItem.page_name || '-'}</td>
            <td><span className={`fb-page-status ${pageJobClass(pageItem.job_status)}`}>{pageJobLabel(pageItem.job_status)}</span></td>
            <td>{pageItem.job_status !== 'CHUA_LAM' ? <button type={'button'} className={'btn btn-warning btn-sm'} disabled={resetting} onClick={() => onReset(row.id, [pageItem.page_id])}>Reset</button> : '-'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function FacebookPageDetails({ row, details, loading, resetting, onReset }) {
  return (
    <tr className={'fb-page-detail-row'}>
      <td colSpan={17}>
        <div className={'fb-page-detail-head'}>
          <strong>Page của UID {row.uid}</strong>
          {details && <span>Tổng: {details.summary.total} - Đã làm: {details.summary.completed} - Đang làm: {details.summary.working || 0} - Chưa làm: {details.summary.pending}</span>}
          <button type={'button'} className={'btn btn-warning btn-sm'} disabled={resetting || !details?.pages?.length} onClick={() => onReset(row.id)}>Reset tất cả</button>
        </div>
        {loading ? <div>Đang tải danh sách Page...</div> : !details?.pages?.length ? <div>Account chưa có Page.</div> : <FacebookPageTable row={row} pages={details.pages} resetting={resetting} onReset={onReset} />}
      </td>
    </tr>
  );
}

function SortableTh({ field, label, sort, onSort }) {
  const active = sort.field === field;
  return (
    <th>
      <button type={'button'} className={`fb-sort-th${active ? ' active' : ''}`} onClick={() => onSort(field)}>
        <span>{label}</span>
        <span>{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
function FacebookJobMachinePanel({ machines, selectedDevice, onSelect }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState({ field: 'device_id', direction: 'asc' });

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const result = keyword
      ? machines.filter((machine) => String(machine.device_id || '').toLowerCase().includes(keyword))
      : machines;
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return [...result].sort((left, right) => {
      if (sort.field === 'device_id') {
        return String(left.device_id || '').localeCompare(String(right.device_id || ''), 'vi', { numeric: true, sensitivity: 'base' }) * multiplier;
      }
      if (sort.field === 'last_updated_at') {
        return ((left.last_updated_at ? new Date(left.last_updated_at).getTime() : 0) - (right.last_updated_at ? new Date(right.last_updated_at).getTime() : 0)) * multiplier;
      }
      return (Number(left[sort.field] || 0) - Number(right[sort.field] || 0)) * multiplier;
    });
  }, [machines, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, totalPages);
  const visibleMachines = useMemo(
    () => filtered.slice((currentPage - 1) * limit, currentPage * limit),
    [filtered, currentPage, limit],
  );
  const machinePagination = { page: currentPage, limit, total: filtered.length, totalPages };

  useEffect(() => { setPage(1); }, [query, limit, sort.field, sort.direction]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSort = (field) => {
    setSort((current) => current.field === field
      ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { field, direction: field === 'device_id' ? 'asc' : 'desc' });
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
      <div className="card-header" style={{ gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3>🖥️ Quản lý account theo máy</h3>
          <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: '.2rem' }}>
            {machines.length} máy đã có account{selectedDevice ? ' · Đang xem ' + selectedDevice : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
          {selectedDevice && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect('')}>Tất cả máy</button>}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên máy..." style={{ width: 210, maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '.45rem .75rem' }} />
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Số máy mỗi trang" style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '.45rem .65rem', background: '#fff' }}>
            {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value} dòng</option>)}
          </select>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr>
            <SortableTh field="device_id" label="MÁY" sort={sort} onSort={handleSort} />
            <SortableTh field="total" label="ACCOUNT" sort={sort} onSort={handleSort} />
            <SortableTh field="waiting_login" label="CHỜ LOGIN" sort={sort} onSort={handleSort} />
            <SortableTh field="logging_in" label="ĐANG LOGIN" sort={sort} onSort={handleSort} />
            <SortableTh field="login_success" label="LOGIN THÀNH CÔNG" sort={sort} onSort={handleSort} />
            <SortableTh field="working" label="ĐANG LÀM" sort={sort} onSort={handleSort} />
            <SortableTh field="done" label="ĐÃ XONG" sort={sort} onSort={handleSort} />
            <SortableTh field="failed" label="FAIL / DIE" sort={sort} onSort={handleSort} />
            <SortableTh field="pages" label="PAGE" sort={sort} onSort={handleSort} />
            <SortableTh field="last_updated_at" label="CẬP NHẬT CUỐI" sort={sort} onSort={handleSort} />
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 28 }}>Chưa có máy phù hợp</td></tr>
            ) : visibleMachines.map((machine) => {
              const active = selectedDevice === machine.device_id;
              return (
                <tr key={machine.device_id} onClick={() => onSelect(active ? '' : machine.device_id)} style={{ cursor: 'pointer', background: active ? 'rgba(37,99,235,.10)' : undefined }}>
                  <td><strong style={{ color: active ? '#2563eb' : '#0f172a' }}>{machine.device_id}</strong></td>
                  <td style={{ color: '#7c3aed', fontWeight: 800 }}>{machine.total}</td>
                  <td>{machine.waiting_login}</td><td>{machine.logging_in}</td>
                  <td style={{ color: '#059669', fontWeight: 750 }}>{machine.login_success}</td>
                  <td style={{ color: '#7c3aed', fontWeight: 750 }}>{machine.working}</td>
                  <td style={{ color: '#2563eb', fontWeight: 750 }}>{machine.done}</td>
                  <td style={{ color: '#ef4444', fontWeight: 750 }}>{machine.failed}</td>
                  <td style={{ color: '#0284c7', fontWeight: 800 }}>{machine.pages}</td>
                  <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmt(machine.last_updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination pagination={machinePagination} onPageChange={setPage} itemLabel="máy" />
    </div>
  );
}

function FacebookAccountPanel({ kind = 'job', platformSwitch = null }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [machineStats, setMachineStats] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [viewMode, setViewMode] = useState('accounts');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkingPages, setCheckingPages] = useState(false);
  const [copying, setCopying] = useState(false);
  const [syncingJob, setSyncingJob] = useState(false);
  const [movingGroup, setMovingGroup] = useState(false);
  const [moveGroupId, setMoveGroupId] = useState('');
  const [statusPick, setStatusPick] = useState('LOGIN_THANH_CONG');
  const [changingStatus, setChangingStatus] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [soakDays, setSoakDays] = useState('');
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [pageDetails, setPageDetails] = useState({});
  const [loadingPageAccountId, setLoadingPageAccountId] = useState(null);
  const [resettingPages, setResettingPages] = useState(false);
  const [sort, setSort] = useState({ field: null, direction: 'asc' });
  const [trashMode, setTrashMode] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [deletingPermanently, setDeletingPermanently] = useState(false);

  const isReg = kind === 'reg';
  const tabs = isReg ? REG_TABS : STATUS_TABS;
  const title = isReg ? 'Facebook Reg' : 'Facebook Job';
  const subtitle = isReg
    ? 'Quản lý account Facebook do máy push lên sau khi reg/login.'
    : 'Phone job lấy account, khóa lock theo máy và báo cáo trạng thái.';
  const params = useMemo(() => ({ kind, page, limit, status, live_status: liveStatus, group_id: groupId, device_id: !isReg && selectedDevice ? selectedDevice : undefined, q, date_from: dateFrom, date_to: dateTo, soak_days: soakDays, sort_by: sort.field || undefined, sort_order: sort.field ? sort.direction : undefined }), [kind, page, limit, status, liveStatus, groupId, selectedDevice, q, dateFrom, dateTo, soakDays, sort, isReg]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await accountGroupApi.getAll(groupTypeForKind(kind));
      setGroups(res.data?.groups || []);
    } catch (err) {
      toast.error(err.message || 'Không tải được nhóm Facebook');
    }
  }, [kind]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = trashMode
        ? await facebookApi.getTrash(params)
        : await facebookApi.getAll(params);
      setRows(res.data?.accounts || []);
      if (!trashMode) {
        setStatusCounts(res.data?.status_counts || {});
        setMachineStats(res.data?.machine_stats || []);
        setTrashCount(res.data?.trash_count || 0);
      } else {
        setTrashCount(res.data?.pagination?.total || 0);
      }
      setPagination(res.data?.pagination || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params, trashMode, page, limit, q]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (isReg && trashMode) setTrashMode(false);
  }, [isReg, trashMode]);

  const selectedIds = [...selected];
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const totalCount = totalFromCounts(statusCounts);
  const dieCount = statusCounts.ACCOUNT_DIE || 0;
  const rowOffset = (page - 1) * limit;

  const resetSelection = () => {
    setSelected(new Set());
    setMoveGroupId('');
  };

  const setFilter = (setter, value) => {
    setter(value);
    setPage(1);
    resetSelection();
  };

  const handleMachineSelect = (deviceId) => {
    setSelectedDevice(deviceId);
    setViewMode('accounts');
    setStatus('');
    setLiveStatus('');
    setGroupId('');
    setQ('');
    setDateFrom('');
    setDateTo('');
    setSoakDays('');
    setPage(1);
    setSort({ field: null, direction: 'asc' });
    resetSelection();
    setExpandedAccountId(null);
  };

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    resetSelection();
  };

  const handleSort = (field) => {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
    resetSelection();
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) rows.forEach((row) => next.delete(row.id));
      else rows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCheckLive = async () => {
    const ids = selectedIds.length ? selectedIds : rows.map((row) => row.id);
    if (!ids.length) return toast.warn('Chưa có account để check');
    setChecking(true);
    try {
      const res = await facebookApi.checkLive(ids, kind);
      toast.success(`${res.data?.live || 0} live - ${res.data?.die || 0} die - ${res.data?.unknown || 0} unknown`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckPages = async () => {
    const ids = selectedIds.length ? selectedIds : rows.map((row) => row.id);
    if (!ids.length) return toast.warn('Chưa có account để check page');
    setCheckingPages(true);
    try {
      const res = await facebookApi.checkPages(ids, kind);
      toast.success(`Đã check ${res.data?.checked || 0} acc - ${res.data?.page_count || 0} page - ${res.data?.token_die || 0} token die`);
      setPageDetails({});
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingPages(false);
    }
  };

  const loadAccountPages = async (accountId) => {
    setLoadingPageAccountId(accountId);
    try {
      const res = await facebookApi.getAccountPages(accountId);
      setPageDetails((current) => ({
        ...current,
        [accountId]: {
          pages: res.data?.pages || [],
          summary: res.data?.summary || { total: 0, completed: 0, working: 0, pending: 0 },
        },
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingPageAccountId(null);
    }
  };

  const togglePageDetails = (accountId) => {
    if (expandedAccountId === accountId) {
      setExpandedAccountId(null);
      return;
    }
    setExpandedAccountId(accountId);
    if (!pageDetails[accountId]) loadAccountPages(accountId);
  };

  const handleResetPages = async (accountId, pageIds = null) => {
    const resetAll = !pageIds;
    if (!confirm(resetAll ? 'Reset tất cả Page của account này về Chưa làm?' : 'Reset Page này về Chưa làm?')) return;
    setResettingPages(true);
    try {
      const res = await facebookApi.resetPageJobs(resetAll
        ? { account_id: accountId, reset_all: true }
        : { page_ids: pageIds });
      toast.success(res.message);
      await loadAccountPages(accountId);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResettingPages(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedIds.length) return toast.warn('Chọn account cần copy');
    setCopying(true);
    try {
      const res = await facebookApi.bulkGet(selectedIds);
      await copyText(res.data?.text || '');
      toast.success(`Đã copy ${res.data?.count || selectedIds.length} account Facebook`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCopying(false);
    }
  };

  const handleSyncToJob = async () => {
    if (!selectedIds.length) return toast.warn('Chọn account Reg cần chuyển sang Job');
    if (!confirm(`Chuyển ${selectedIds.length} account đã chọn sang Facebook Job theo máy?`)) return;
    setSyncingJob(true);
    try {
      const res = await facebookApi.bulkSyncToJob(selectedIds);
      const data = res.data || {};
      toast.success(`Đã chuyển ${data.created || 0} mới, cập nhật ${data.updated || 0}, bỏ qua ${data.skipped || 0}`);
      resetSelection();
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncingJob(false);
    }
  };

  const handleMoveGroup = async () => {
    if (!selectedIds.length) return toast.warn('Chọn account cần chuyển nhóm');
    if (!moveGroupId) return toast.warn('Chọn nhóm cần chuyển tới');
    setMovingGroup(true);
    try {
      const res = await facebookApi.bulkMoveGroup(selectedIds, moveGroupId, kind);
      toast.success(res.message || 'Đã chuyển nhóm account Facebook');
      resetSelection();
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMovingGroup(false);
    }
  };

  const handleSetStatus = async () => {
    if (!selectedIds.length) return toast.warn('Chọn account cần đổi trạng thái');
    setChangingStatus(true);
    try {
      const res = await facebookApi.bulkAction(selectedIds, 'set_status', { status: statusPick });
      toast.success(res.message || 'Đã đổi trạng thái account Facebook');
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedIds.length) return;
    const question = isReg
      ? 'Xóa vĩnh viễn ' + selectedIds.length + ' account Facebook Reg?'
      : 'Chuyển ' + selectedIds.length + ' account Facebook Job vào Thùng rác?';
    if (!confirm(question)) return;
    try {
      const res = await facebookApi.bulkDelete(selectedIds);
      toast.success(res.message);
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRestore = async () => {
    if (!selectedIds.length) return;
    if (!confirm('Khôi phục ' + selectedIds.length + ' account Facebook Job?')) return;
    setRestoring(true);
    try {
      const res = await facebookApi.restoreTrash(selectedIds);
      toast.success(res.message);
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestoring(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm('Xóa vĩnh viễn ' + selectedIds.length + ' account Facebook Job? Dữ liệu này không thể khôi phục.')) return;
    setDeletingPermanently(true);
    try {
      const res = await facebookApi.deleteTrash(selectedIds);
      toast.success(res.message);
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingPermanently(false);
    }
  };

  const toggleTrashMode = () => {
    setTrashMode((current) => !current);
    setViewMode('accounts');
    setPage(1);
    setQ('');
    setStatus('');
    setSelectedDevice('');
    setLiveStatus('');
    setGroupId('');
    setDateFrom('');
    setDateTo('');
    setSoakDays('');
    setSelected(new Set());
    setExpandedAccountId(null);
  };

  return (
    <div className="page">
      <style>{`
        .fb-row:hover { background: rgba(6,182,212,.05) !important; }
        .fb-row.row-selected { background: rgba(6,182,212,.08) !important; }
        .fb-status-tabs { display:flex; gap:.4rem; margin-bottom:1rem; flex-wrap:wrap; }
        .fb-stat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(185px, 220px)); gap:1rem; margin-bottom:1rem; }
        .fb-page-detail-row > td { padding:1rem 1.25rem !important; background:rgba(15,23,42,.035); border-top:2px solid rgba(14,165,233,.2); border-bottom:2px solid rgba(14,165,233,.2); }
        .fb-page-detail-head { display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem; flex-wrap:wrap; }
        .fb-page-detail-head span { color:#64748b; font-size:.8rem; }
        .fb-page-detail-head button { margin-left:auto; }
        .fb-page-table { background:#fff; }
        .fb-page-status { display:inline-flex; padding:.2rem .55rem; border-radius:6px; font-weight:800; font-size:.75rem; }
        .fb-page-status.done { background:rgba(16,185,129,.15); color:#059669; }
        .fb-page-status.working { background:rgba(139,92,246,.15); color:#7c3aed; }
        .fb-page-status.pending { background:rgba(245,158,11,.15); color:#d97706; }
        .fb-sort-th { display:inline-flex; align-items:center; gap:.35rem; border:0; background:transparent; padding:0; color:inherit; font:inherit; font-weight:inherit; letter-spacing:inherit; cursor:pointer; text-transform:inherit; white-space:nowrap; }
        .fb-sort-th span:last-child { color:#94a3b8; font-size:.68rem; line-height:1; }
        .fb-sort-th.active span:last-child { color:#2563eb; }
      `}</style>

      <div className="page-header">
        <div>
          <h1>{trashMode ? 'Facebook Job - Thùng rác' : title} <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>{isReg ? 'Account reg' : trashMode ? 'Dữ liệu đã xóa' : 'Phone job'}</span></h1>
          <div className="subtitle">{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          {isReg && <Link to="/facebook-reg-stats" className="btn btn-secondary btn-sm">Thống kê</Link>}
          {!isReg && !trashMode && <>
            <button type="button" onClick={() => setViewMode('accounts')} className={viewMode === 'accounts' ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'}>Danh sách account</button>
            <button type="button" onClick={() => setViewMode('machines')} className={viewMode === 'machines' ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'}>Theo máy ({machineStats.length})</button>
          </>}
          {!isReg && <button onClick={toggleTrashMode} className="btn btn-secondary btn-sm">{trashMode ? 'Quay lại Facebook Job' : 'Thùng rác (' + trashCount + ')'}</button>}
          {!trashMode && <button onClick={() => setShowImport(true)} className="btn btn-primary btn-sm">Import</button>}
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-sm">{loading ? 'Đang tải...' : 'Làm mới'}</button>
        </div>
      </div>

      {platformSwitch && <div style={{ marginBottom: '1rem' }}>{platformSwitch}</div>}

      {isReg && (
        <div className="fb-stat-grid">
          <div className="stat-card" style={{ borderLeftColor: '#06b6d4' }}>
            <div className="stat-icon" style={{ background: 'rgba(6,182,212,.15)', color: '#0891b2' }}>FB</div>
            <div className="stat-info"><div className="stat-value">{totalCount}</div><div className="stat-title">Tổng Account</div></div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#6b7280' }}>
            <div className="stat-icon" style={{ background: 'rgba(107,114,128,.16)', color: '#4b5563' }}>Die</div>
            <div className="stat-info"><div className="stat-value">{dieCount}</div><div className="stat-title">Account Die</div></div>
          </div>
        </div>
      )}

      {!isReg && !trashMode && viewMode === 'accounts' && selectedDevice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
          <span style={{ background: 'rgba(37,99,235,.10)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,.22)', borderRadius: 20, padding: '.38rem .75rem', fontSize: '.8rem', fontWeight: 750 }}>Đang xem máy: {selectedDevice}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMachineSelect('')}>Bỏ lọc máy</button>
        </div>
      )}

      {!trashMode && (isReg || viewMode === 'accounts') && <div className="fb-status-tabs">
        {tabs.map((tab) => (
          <button key={tab.value || 'ALL'} onClick={() => setFilter(setStatus, tab.value)} style={{
            background: status === tab.value ? tab.color : 'rgba(255,255,255,.06)',
            color: status === tab.value ? '#fff' : '#64748b',
            border: status === tab.value ? 'none' : '1px solid rgba(148,163,184,.25)',
            borderRadius: '8px', padding: '.45rem .9rem', cursor: 'pointer',
            fontWeight: status === tab.value ? 700 : 500, fontSize: '.82rem', whiteSpace: 'nowrap',
          }}>
            {tab.icon} {tab.label} {tab.value ? `(${statusCounts[tab.value] || 0})` : `(${totalCount})`}
          </button>
        ))}
      </div>}


      {!isReg && !trashMode && viewMode === 'machines' && (
        <FacebookJobMachinePanel
          machines={machineStats}
          selectedDevice={selectedDevice}
          onSelect={handleMachineSelect}
        />
      )}
      {(isReg || trashMode || viewMode === 'accounts') && <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group" style={{ minWidth: 240, flex: '1 1 260px' }}>
              <label>Tìm UID / Mail / Máy</label>
              <input type="text" placeholder="uid, mail, phone..." value={q} onChange={(event) => setFilter(setQ, event.target.value)} />
            </div>
            <div className="filter-group">
              <label>Nhóm</label>
              <select value={groupId} onChange={(event) => setFilter(setGroupId, event.target.value)}>
                <option value="">Tất cả nhóm</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Trạng thái live</label>
              <select value={liveStatus} onChange={(event) => setFilter(setLiveStatus, event.target.value)}>
                {LIVE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            {!isReg && !trashMode && (
              <>
                <div className="filter-group">
                  <label>Từ ngày</label>
                  <input type="date" value={dateFrom} onChange={(event) => setFilter(setDateFrom, event.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Đến ngày</label>
                  <input type="date" value={dateTo} onChange={(event) => setFilter(setDateTo, event.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Ngâm</label>
                  <select value={soakDays} onChange={(event) => setFilter(setSoakDays, event.target.value)}>
                    <option value="">Tất cả</option>
                    {[1, 2, 3, 5, 7, 14, 30].map((n) => <option key={n} value={n}>{'Ngâm >= ' + n + ' ngày'}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="filter-group">
              <label>Số dòng</label>
              <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); resetSelection(); }}>
                {[20, 50, 100, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} dòng</option>)}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus(''); setLiveStatus(''); setGroupId(''); setSelectedDevice(''); setDateFrom(''); setDateTo(''); setSoakDays(''); setPage(1); resetSelection(); }}>Xóa bộ lọc</button>
          </div>
        </div>
      </div>

      {trashMode ? (
        <div style={{ background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <strong style={{ color: '#e2e8f0' }}>{selectedIds.length} account đã chọn</strong>
          <button className="btn btn-success btn-sm" disabled={!selectedIds.length || restoring || deletingPermanently} onClick={handleRestore}>
            {restoring ? 'Đang khôi phục...' : 'Khôi phục đã chọn'}
          </button>
          <button className="btn btn-primary btn-sm" disabled={!selectedIds.length || copying || restoring || deletingPermanently} onClick={handleCopy}>
            {copying ? 'Đang copy...' : 'Copy đã chọn'}
          </button>
          <button className="btn btn-danger btn-sm" disabled={!selectedIds.length || deletingPermanently || restoring || copying} onClick={handlePermanentDelete}>
            {deletingPermanently ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
          </button>
          {selectedIds.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Bỏ chọn</button>}
        </div>
      ) : <FacebookToolbar
        isReg={isReg}
        selectedCount={selectedIds.length}
        statusOptions={tabs.filter((tab) => tab.value)}
        groups={groups}
        moveGroupId={moveGroupId}
        movingGroup={movingGroup}
        statusPick={statusPick}
        changingStatus={changingStatus}
        onStatusChange={setStatusPick}
        onSetStatus={handleSetStatus}
        onMoveGroupChange={setMoveGroupId}
        onMoveGroup={handleMoveGroup}
        onCheckLive={handleCheckLive}
        checking={checking}
        onCheckPages={handleCheckPages}
        checkingPages={checkingPages}
        onCopy={handleCopy}
        copying={copying}
        onSyncToJob={handleSyncToJob}
        syncingJob={syncingJob}
        onDelete={handleDelete}
        onClear={() => setSelected(new Set())}
      />}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <h3>{trashMode ? 'Thùng rác Facebook Job' : 'Danh sách account'}</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} account {loading ? '- đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>STT</th><th>UID</th><th>PASS</th><th>2FA</th><th>COOKIES</th><th>TOKEN</th><th>MAIL</th><SortableTh field={'page_count'} label={'PAGE'} sort={sort} onSort={handleSort} /><th>NHÓM</th><SortableTh field={'device_id'} label={'MÁY'} sort={sort} onSort={handleSort} /><th>TRẠNG THÁI</th><th>LIVE</th><th>LOCK</th>{isReg ? <th>REGPAGE LOCK</th> : <SortableTh field={'reg_page_locked_by'} label={'REGPAGE LOCK'} sort={sort} onSort={handleSort} />}<th>{isReg ? 'NGÀY PUSH' : 'LOGIN AT'}</th>{trashMode ? <SortableTh field={'trashed_at'} label={'NGÀY XÓA'} sort={sort} onSort={handleSort} /> : <th>NGÀY XONG</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={17} style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>{trashMode ? 'Thùng rác đang trống' : 'Chưa có account Facebook'}</td></tr>
              ) : rows.map((row, idx) => {
                const sc = STATUS_COLOR[row.status] || { bg: 'rgba(100,116,139,.1)', color: '#64748b' };
                const group = groups.find((item) => String(item.id) === String(row.group_id));
                const pageSummary = row.page_job_summary || { total: row.page_count || 0, completed: 0, working: 0, pending: row.page_count || 0 };
                const pageTotal = Number(pageSummary.total) || 0;
                const pageCompleted = Number(pageSummary.completed) || 0;
                const pageColor = pageTotal > 0 && pageCompleted === pageTotal
                  ? { background: 'rgba(16,185,129,.15)', color: '#059669' }
                  : pageCompleted > 0
                    ? { background: 'rgba(245,158,11,.15)', color: '#d97706' }
                    : { background: 'rgba(14,165,233,.14)', color: '#0284c7' };
                const details = pageDetails[row.id];
                return (
                  <Fragment key={row.id}>
                  <tr className={`fb-row${selected.has(row.id) ? ' row-selected' : ''}`}>
                    <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td>
                    <td style={{ color: '#94a3b8' }}>{rowOffset + idx + 1}</td>
                    <td><strong>{row.uid}</strong></td>
                    <td>{short(row.password, 18)}</td>
                    <td>{short(row.two_fa, 18)}</td>
                    <td title={row.cookies || ''}>{short(row.cookies, 26)}</td>
                    <td title={row.token || ''}>{short(row.token, 26)}</td>
                    <td>{short(row.email, 24)}</td>
                    <td title={pageTitle(row)}>
                      {row.page_token_status === 'die' ? (
                        <span title={row.page_token_error || 'Token die'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 68, padding: '.18rem .45rem', borderRadius: 6, background: 'rgba(239,68,68,.14)', color: '#dc2626', fontWeight: 800, fontSize: '.78rem' }}>
                          token die
                        </span>
                      ) : !trashMode && !isReg && row.last_page_check_at ? (
                        <button type={'button'} onClick={() => togglePageDetails(row.id)} aria-expanded={expandedAccountId === row.id} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 82, padding: '.22rem .5rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '.78rem', ...pageColor }}>
                          {pageCompleted}/{pageTotal} đã làm
                        </button>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 58, padding: '.18rem .45rem', borderRadius: 6, background: row.last_page_check_at ? ((row.page_count || 0) > 0 ? 'rgba(14,165,233,.14)' : 'rgba(148,163,184,.14)') : 'transparent', color: row.last_page_check_at ? ((row.page_count || 0) > 0 ? '#0284c7' : '#64748b') : '#94a3b8', fontWeight: 800, fontSize: '.78rem' }}>
                          {row.last_page_check_at ? (row.page_count || 0) + ' page' : '-'}
                        </span>
                      )}
                    </td>
                    <td>{group?.name || '-'}</td>
                    <td>{row.device_id || '-'}</td>
                    <td><span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{statusLabel(row.status)}</span></td>
                    <td style={{ color: LIVE_COLOR[row.live_status] || '#94a3b8', fontWeight: 700 }}>{row.live_status || 'unknown'}</td>
                    <td>{row.locked_by ? `${row.locked_by} - ${fmt(row.locked_at)}` : '-'}</td>
                    <td>{row.reg_page_locked_by ? `${row.reg_page_locked_by} - ${fmt(row.reg_page_locked_at)}` : '-'}</td>
                    <td>{fmt(row.login_at)}</td>
                    <td>{fmt(trashMode ? row.trashed_at : row.completed_at)}</td>
                  </tr>
                  {!trashMode && !isReg && expandedAccountId === row.id && <FacebookPageDetails row={row} details={details} loading={loadingPageAccountId === row.id} resetting={resettingPages} onReset={handleResetPages} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination pagination={pagination} onPageChange={handlePageChange} />
      </>}
      {showImport && <ImportFacebookModal kind={kind} groups={groups} onGroupsChanged={fetchGroups} onClose={() => setShowImport(false)} onImported={fetchData} />}
    </div>
  );
}

export default function FacebookAccounts({ kind = 'job' }) {
  const [platform, setPlatform] = useState('facebook');
  useEffect(() => { setPlatform('facebook'); }, [kind]);
  const platformSwitch = <SocialPlatformSwitch active={platform} onChange={setPlatform} />;
  return platform === 'instagram'
    ? <InstagramAccounts kind={kind} platformSwitch={platformSwitch} />
    : <FacebookAccountPanel kind={kind} platformSwitch={platformSwitch} />;
}