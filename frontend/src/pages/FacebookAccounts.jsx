import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
  onDelete,
  onClear,
}) {
  const [showGroupDlg, setShowGroupDlg] = useState(false);
  const [showStatusDlg, setShowStatusDlg] = useState(false);
  const busy = checking || checkingPages || copying || movingGroup || changingStatus;
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

export default function FacebookAccounts({ kind = 'job' }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
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

  const isReg = kind === 'reg';
  const tabs = isReg ? REG_TABS : STATUS_TABS;
  const title = isReg ? 'Facebook Reg' : 'Facebook Job';
  const subtitle = isReg
    ? 'Quản lý account Facebook do máy push lên sau khi reg/login.'
    : 'Phone job lấy account, khóa lock theo máy và báo cáo trạng thái.';
  const params = useMemo(() => ({ kind, page, limit, status, live_status: liveStatus, group_id: groupId, q, date_from: dateFrom, date_to: dateTo, soak_days: soakDays }), [kind, page, limit, status, liveStatus, groupId, q, dateFrom, dateTo, soakDays]);

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
      const res = await facebookApi.getAll(params);
      setRows(res.data?.accounts || []);
      setStatusCounts(res.data?.status_counts || {});
      setPagination(res.data?.pagination || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => { fetchData(); }, [fetchData]);

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

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
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
    if (!confirm(`Xóa ${selectedIds.length} account Facebook?`)) return;
    try {
      const res = await facebookApi.bulkDelete(selectedIds);
      toast.success(res.message);
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
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
      `}</style>

      <div className="page-header">
        <div>
          <h1>{title} <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>{isReg ? 'Account reg' : 'Phone job'}</span></h1>
          <div className="subtitle">{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          {isReg && <Link to="/facebook-reg-stats" className="btn btn-secondary btn-sm">Thống kê</Link>}
          <button onClick={() => setShowImport(true)} className="btn btn-primary btn-sm">Import</button>
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-sm">{loading ? 'Đang tải...' : 'Làm mới'}</button>
        </div>
      </div>

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

      <div className="fb-status-tabs">
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
      </div>

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
            {!isReg && (
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
            <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus(''); setLiveStatus(''); setGroupId(''); setDateFrom(''); setDateTo(''); setSoakDays(''); setPage(1); resetSelection(); }}>Xóa bộ lọc</button>
          </div>
        </div>
      </div>

      <FacebookToolbar
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
        onDelete={handleDelete}
        onClear={() => setSelected(new Set())}
      />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <h3>Danh sách account</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} account {loading ? '- đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>STT</th><th>UID</th><th>PASS</th><th>2FA</th><th>COOKIES</th><th>TOKEN</th><th>MAIL</th><th>PAGE</th><th>NHÓM</th><th>MÁY</th><th>TRẠNG THÁI</th><th>LIVE</th><th>LOCK</th><th>REGPAGE LOCK</th><th>{isReg ? 'NGÀY PUSH' : 'LOGIN AT'}</th><th>NGÀY XONG</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={17} style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có account Facebook</td></tr>
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
                      ) : !isReg && row.last_page_check_at ? (
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
                    <td>{fmt(row.completed_at)}</td>
                  </tr>
                  {!isReg && expandedAccountId === row.id && <FacebookPageDetails row={row} details={details} loading={loadingPageAccountId === row.id} resetting={resettingPages} onReset={handleResetPages} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination pagination={pagination} onPageChange={handlePageChange} />
      {showImport && <ImportFacebookModal kind={kind} groups={groups} onGroupsChanged={fetchGroups} onClose={() => setShowImport(false)} onImported={fetchData} />}
    </div>
  );
}
