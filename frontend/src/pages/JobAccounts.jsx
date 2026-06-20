import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { accountGroupApi, jobApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';
import { copyText } from '../services/clipboard';
import AccountGroupPicker from '../components/AccountGroupPicker';
import { useEligibilitySettings } from '../services/eligibilitySettings';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtNum = (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN');

const STATUS_TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'ACCOUNT_CHAY', icon: '🚀', label: 'Account chạy', color: '#06b6d4' },
  { value: 'DANG_LAM', icon: '⚡', label: 'Đang làm', color: '#8b5cf6' },
  { value: 'DUOI_50_JOB', icon: '📉', label: 'Dưới 50 job', color: '#f59e0b' },
  { value: 'FAIL_AVT', icon: '🖼️', label: 'Fail AVT', color: '#ef4444' },
  { value: 'LOI_CAU_HINH', icon: '⚠️', label: 'Cấu hình lỗi', color: '#f97316' },
  { value: 'DA_CHAY_XONG', icon: '✅', label: 'Đã chạy xong', color: '#10b981' },
  { value: 'ACCOUNT_DIE', icon: '💀', label: 'Die', color: '#6b7280' },
];

const STATUS_COLOR = {
  ACCOUNT_CHAY: { bg: 'rgba(6,182,212,.15)', color: '#0891b2' },
  DANG_LAM: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  DUOI_50_JOB: { bg: 'rgba(245,158,11,.16)', color: '#b45309' },
  FAIL_AVT: { bg: 'rgba(239,68,68,.15)', color: '#dc2626' },
  LOI_CAU_HINH: { bg: 'rgba(249,115,22,.15)', color: '#ea580c' },
  DA_CHAY_XONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  ACCOUNT_DIE: { bg: 'rgba(107,114,128,.16)', color: '#4b5563' },
};

const LIVE_COLOR = { live: '#4ade80', die: '#f87171', unknown: '#94a3b8' };
const STATUS_META = Object.fromEntries(STATUS_TABS.filter((tab) => tab.value).map((tab) => [tab.value, tab]));
const LIVE_LABEL = {
  live: '• live',
  die: '• die',
  unknown: '• unknown',
};

const statusLabel = (status) => STATUS_META[status]?.label || status || '—';
const liveLabel = (status) => LIVE_LABEL[status] || '• unknown';

function Chip({ color, label }) {
  return (
    <span style={{ background: `${color}22`, color, borderRadius: '12px', padding: '.2rem .65rem', fontSize: '.78rem', fontWeight: 700, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function CheckLiveResults({ results, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const { live, die, unknown, rows } = results;
  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', padding: '.75rem 1.25rem', borderBottom: expanded ? '1px solid #1e293b' : 'none' }}>
        <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>Kết quả Check Live:</span>
        <Chip color="#4ade80" label={`${live} live`} />
        <Chip color="#f87171" label={`${die} die`} />
        <Chip color="#94a3b8" label={`${unknown} unknown`} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded((v) => !v)} className="btn btn-secondary btn-sm">{expanded ? '▲ Thu gọn' : '▼ Xem chi tiết'}</button>
        <button onClick={onClose} className="btn btn-secondary btn-sm">✕ Đóng</button>
      </div>
      {expanded && rows.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
            <thead>
              <tr style={{ background: '#1e293b', position: 'sticky', top: 0 }}>
                {['#', 'Username', 'Kết quả', 'Followers', 'Following', 'Videos', 'Likes', 'Proxy'].map((h) => (
                  <th key={h} style={{ padding: '.4rem .6rem', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #334155' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #1e293b', background: index % 2 === 0 ? '#0f172a' : '#111827' }}>
                  <td style={{ padding: '.35rem .6rem', color: '#475569' }}>{row.id}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{row.username}</td>
                  <td style={{ padding: '.35rem .6rem', color: LIVE_COLOR[row.result] || '#94a3b8', fontWeight: 700 }}>{liveLabel(row.result)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(row.followers)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(row.following)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(row.videos)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(row.likes)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#475569', fontFamily: 'monospace', fontSize: '.7rem' }}>{row.proxy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobToolbar({ onCheckAll, checking }) {
  const settings = loadCheckLiveSettings();
  const proxyCount = settings.proxies.split('\n').map((line) => line.trim()).filter(Boolean).length;
  return (
    <div style={{
      background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem',
      marginBottom: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
        <span style={{ color: '#94a3b8' }}>🌐 Proxy</span>
        <span style={{ color: proxyCount > 0 ? '#6ee7b7' : '#f87171', fontWeight: 700 }}>{proxyCount}</span>
        <Link to="/proxy-settings" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '.78rem', background: 'rgba(59,130,246,.1)', borderRadius: '6px', padding: '.15rem .5rem', border: '1px solid rgba(59,130,246,.2)' }}>
          ⚙ Cài đặt
        </Link>
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onCheckAll} disabled={checking} className="btn btn-primary btn-sm">
        🔍 {checking ? 'Đang check...' : 'Check live toàn bộ'}
      </button>
      <div style={{ fontSize: '.68rem', color: '#475569' }}>Dùng proxy trong phần cài đặt giống Chrome Acc</div>
    </div>
  );
}

function JobBulkBar({ selected, onClear, onRefresh, onCheckLive, clChecking }) {
  const [busy, setBusy] = useState(false);
  const [statusPick, setStatusPick] = useState('');
  const [showStatusDlg, setShowStatusDlg] = useState(false);
  const ids = [...selected];

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => run(async () => {
    const res = await jobApi.bulkGet(ids, 'pipe');
    await copyText(res.data?.text || '');
    toast.success(`Đã copy ${res.data?.count || ids.length} account JOB`);
  });

  const handleClearLock = () => run(async () => {
    const res = await jobApi.bulkAction(ids, 'clear_lock');
    toast.success(res.message);
    onClear();
  });

  const handleSetStatus = () => run(async () => {
    if (!statusPick) return;
    const res = await jobApi.bulkAction(ids, 'set_status', { status: statusPick });
    toast.success(res.message);
    setShowStatusDlg(false);
    onClear();
  });

  const handleDelete = async () => {
    if (!confirm(`Xóa vĩnh viễn ${ids.length} account JOB?`)) return;
    if (ids.length > 20 && !confirm(`Xác nhận lần 2: xóa ${ids.length} account JOB?`)) return;
    await run(async () => {
      const res = await jobApi.bulkDelete(ids);
      toast.success(res.message);
      onClear();
    });
  };

  const anyBusy = busy || clChecking;
  const BB = ({ label, onClick, color }) => (
    <button onClick={onClick} disabled={anyBusy} style={{
      background: color, border: 'none', color: '#fff', borderRadius: '7px', padding: '.4rem .85rem',
      cursor: anyBusy ? 'not-allowed' : 'pointer', fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap',
      opacity: anyBusy ? .65 : 1,
    }}>{label}</button>
  );

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100, background: '#1e293b', color: '#f8fafc',
      borderRadius: '10px', padding: '.75rem 1rem', marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)', animation: 'slideDown .2s ease',
    }}>
      <div style={{ background: '#06b6d4', borderRadius: '20px', padding: '.25rem .75rem', fontWeight: 700, fontSize: '.875rem' }}>
        ✓ {ids.length} đã chọn
      </div>
      <div style={{ flex: 1 }} />
      <BB label={clChecking ? '🔍 Đang check...' : '🔍 Check Live'} onClick={() => onCheckLive(ids)} color="#0ea5e9" />
      <BB label="📋 Copy" onClick={handleCopy} color="#3b82f6" />
      <BB label="🔓 Mở lock" onClick={handleClearLock} color="#f59e0b" />
      <BB label="🗑️ Xóa" onClick={handleDelete} color="#dc2626" />
      <div style={{ position: 'relative' }}>
        <BB label="🔄 Đổi trạng thái" onClick={() => setShowStatusDlg((value) => !value)} color="#10b981" />
        {showStatusDlg && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#fff',
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '1rem',
            minWidth: 230, zIndex: 200, color: '#0f172a',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '.5rem', fontSize: '.85rem' }}>Chọn trạng thái</div>
            <select value={statusPick} onChange={(e) => setStatusPick(e.target.value)} style={{ width: '100%', padding: '.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '.75rem' }}>
              <option value="">-- Chọn --</option>
              {STATUS_TABS.filter((tab) => tab.value).map((tab) => <option key={tab.value} value={tab.value}>{tab.icon} {tab.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button onClick={handleSetStatus} disabled={!statusPick || anyBusy} className="btn btn-success btn-sm" style={{ flex: 1 }}>Xác nhận</button>
              <button onClick={() => setShowStatusDlg(false)} className="btn btn-secondary btn-sm">Hủy</button>
            </div>
          </div>
        )}
      </div>
      <button onClick={onClear} disabled={anyBusy} className="btn btn-secondary btn-sm">✕ Bỏ chọn</button>
    </div>
  );
}

function ImportJobModal({ onClose, onImported, groups, onGroupCreated }) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const lineCount = text.trim().split('\n').filter((line) => line.trim()).length;

  const handleImport = async () => {
    if (!text.trim()) {
      toast.error('Nhập dữ liệu trước');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await jobApi.import(text, groupId || null);
      setResult(res.data);
      toast.success(res.message);
      onImported();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '620px', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>📥 Import JOB Accounts</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <AccountGroupPicker accountType="job" groups={groups} value={groupId} onChange={setGroupId} onGroupsChanged={onGroupCreated} />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'username|password|email|email_pass\nusername2|password2|email2|email_pass2'}
          rows={12}
          style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '.6rem .85rem', fontFamily: 'monospace', fontSize: '.8rem', lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
        />
        {result && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '8px', padding: '.65rem .85rem', marginTop: '.85rem', fontSize: '.82rem' }}>
            Đã import: <strong style={{ color: '#6ee7b7' }}>{result.imported}</strong>
            {' '} Trùng: <strong style={{ color: '#fbbf24' }}>{result.duplicates}</strong>
            {' '} Lỗi: <strong style={{ color: '#f87171' }}>{result.invalid}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>{lineCount} dòng</span>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button onClick={onClose} className="btn btn-secondary">Đóng</button>
            <button onClick={() => { setText(''); setResult(null); }} className="btn btn-secondary">🗑️ Xóa</button>
            <button onClick={handleImport} disabled={importing || !text.trim()} className="btn btn-primary">
              {importing ? 'Đang import...' : `📥 Import${lineCount ? ` (${lineCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobAccounts() {
  const eligibility = useEligibilitySettings();
  const [sp, setSp] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [clChecking, setClChecking] = useState(false);
  const [clResults, setClResults] = useState(null);
  const [clProgress, setClProgress] = useState(null);
  const [groups, setGroups] = useState([]);

  const [filters, setFilters] = useState({
    status: sp.get('status') || '',
    live_status: sp.get('live_status') || '',
    device_id: sp.get('device_id') || '',
    group_id: sp.get('group_id') || '',
    search: sp.get('search') || '',
    date_from: sp.get('date_from') || '',
    date_to: sp.get('date_to') || '',
    soak_days: sp.get('soak_days') || '',
    video_min: sp.get('video_min') || '',
    video_max: sp.get('video_max') || '',
    sort_by: sp.get('sort_by') || '',
    sort_dir: sp.get('sort_dir') || '',
    page: parseInt(sp.get('page') || '1', 10),
    limit: parseInt(sp.get('limit') || '20', 10),
  });

  const fetchAccounts = useCallback(async (nextFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value !== '' && value !== null && value !== undefined));
      const res = await jobApi.getAll(params);
      setAccounts(res.data?.accounts || []);
      setCounts(res.data?.counts || {});
      setPagination(res.data?.pagination || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await accountGroupApi.getAll('job');
      setGroups(res.data?.groups || []);
    } catch (err) {
      toast.error(err.message || 'Không tải được nhóm JOB');
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    fetchAccounts(filters);
    const params = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = value;
    });
    setSp(params, { replace: true });
    setSelected(new Set());
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const setPage = (page) => setFilters((prev) => ({ ...prev, page }));
  const setSort = (field) => setFilters((prev) => ({
    ...prev,
    sort_by: field,
    sort_dir: prev.sort_by === field && prev.sort_dir === 'desc' ? 'asc' : 'desc',
    page: 1,
  }));
  const SortTh = ({ field, children }) => {
    const active = filters.sort_by === field;
    return (
      <th>
        <button type="button" className={`sort-th${active ? ' active' : ''}`} onClick={() => setSort(field)}>
          <span>{children}</span>
          <span>{active ? (filters.sort_dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };

  const allPageIds = accounts.map((account) => account.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selected.has(id));
  const someSelected = allPageIds.some((id) => selected.has(id));
  const rowOffset = ((pagination?.page || filters.page || 1) - 1) * (pagination?.limit || filters.limit || 20);
  const currentStatus = filters.status;

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    allPageSelected ? allPageIds.forEach((id) => next.delete(id)) : allPageIds.forEach((id) => next.add(id));
    return next;
  });
  const toggleOne = (id, event) => {
    event.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCheckLive = async (ids) => {
    if (ids.length === 0) {
      toast.error('Tick chọn account cần check trước');
      return;
    }
    const settings = loadCheckLiveSettings();
    setClChecking(true);
    setClResults(null);
    setClProgress(null);
    try {
      const { rows, live, die, unknown } = await checkLiveInBatches('/jobs/check-live', ids, settings, setClProgress);
      setClResults({ live, die, unknown, rows: rows || [] });
      toast.success(`Check xong: ${live} live - ${die} die - ${unknown} unknown`);
      fetchAccounts(filters);
    } catch (err) {
      toast.error(err.message || 'Check live thất bại');
    } finally {
      setClChecking(false);
      setClProgress(null);
    }
  };

  const collectAllFilteredIds = async () => {
    const pageLimit = 100;
    let page = 1;
    let pages = 1;
    const ids = [];
    do {
      const params = Object.fromEntries(Object.entries({ ...filters, page, limit: pageLimit }).filter(([, value]) => value !== '' && value !== null && value !== undefined));
      const res = await jobApi.getAll(params);
      ids.push(...(res.data?.accounts || []).map((account) => account.id));
      const p = res.data?.pagination || {};
      pages = p.totalPages || p.pages || 1;
      page += 1;
    } while (page <= pages);
    return ids;
  };

  const handleCheckLiveAll = async () => {
    setClChecking(true);
    setClResults(null);
    setClProgress(null);
    try {
      const ids = await collectAllFilteredIds();
      if (ids.length === 0) {
        toast.error('Không có account nào trong bảng hiện tại');
        return;
      }
      await handleCheckLive(ids);
    } catch (err) {
      toast.error(err.message || 'Không lấy được danh sách account để check');
    } finally {
      setClChecking(false);
    }
  };

  return (
    <div className="page">
      <style>{`
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .job-row:hover { background: rgba(6,182,212,.05) !important; cursor: default; }
        .job-row.row-selected { background: rgba(6,182,212,.08) !important; }
        .cb-cell { width: 40px; padding: 0 8px !important; text-align: center; }
        .sort-th { display: inline-flex; align-items: center; gap: .35rem; border: 0; background: transparent; padding: 0; color: inherit; font: inherit; font-weight: inherit; letter-spacing: inherit; cursor: pointer; text-transform: inherit; }
        .sort-th span:last-child { color: #94a3b8; font-size: .68rem; line-height: 1; }
        .sort-th.active span:last-child { color: #2563eb; }
      `}</style>

      <div className="page-header">
        <div>
          <h1>⚡ JOB Accounts <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>Phone job</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={() => setShowImport(true)} style={{ background: '#06b6d4', border: 'none', color: '#fff', borderRadius: '8px', padding: '.55rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '.875rem' }}>
            📥 Import
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button key={tab.value || 'ALL'} onClick={() => setFilter('status', tab.value)} style={{
            background: currentStatus === tab.value ? tab.color : 'rgba(255,255,255,.06)',
            color: currentStatus === tab.value ? '#fff' : '#94a3b8',
            border: currentStatus === tab.value ? 'none' : '1px solid rgba(255,255,255,.1)',
            borderRadius: '8px', padding: '.4rem .85rem', cursor: 'pointer',
            fontWeight: currentStatus === tab.value ? 700 : 400, fontSize: '.82rem', whiteSpace: 'nowrap',
          }}>
            {tab.icon} {tab.label} {tab.value ? `(${counts[tab.value] || 0})` : ''}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group">
              <label>Tìm username</label>
              <input type="text" placeholder="username..." value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Trạng thái live</label>
              <select value={filters.live_status} onChange={(e) => setFilter('live_status', e.target.value)}>
                <option value="">Tất cả</option>
                <option value="unknown">Unknown</option>
                <option value="live">Live</option>
                <option value="die">Die</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Video từ</label>
              <input type="number" min={0} placeholder="0" value={filters.video_min} onChange={(e) => setFilter('video_min', e.target.value)} style={{ minWidth: 70, maxWidth: 80 }} />
            </div>
            <div className="filter-group">
              <label>Video đến</label>
              <input type="number" min={0} placeholder="-" value={filters.video_max} onChange={(e) => setFilter('video_max', e.target.value)} style={{ minWidth: 70, maxWidth: 80 }} />
            </div>
            <div className="filter-group">
              <label>Nhóm</label>
              <select value={filters.group_id} onChange={(e) => setFilter('group_id', e.target.value)}>
                <option value="">Tất cả nhóm</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Device ID</label>
              <input type="text" placeholder="device_id..." value={filters.device_id} onChange={(e) => setFilter('device_id', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Từ ngày</label>
              <input type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Đến ngày</label>
              <input type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Ngâm tối thiểu</label>
              <select value={filters.soak_days} onChange={(e) => setFilter('soak_days', e.target.value)}>
                <option value="">Tất cả</option>
                <option value="1">Trên 1 ngày</option>
                <option value="2">Trên 2 ngày</option>
                <option value="3">Trên 3 ngày</option>
                <option value="4">Trên 4 ngày</option>
                <option value="7">Trên 7 ngày</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Số dòng</label>
              <select value={filters.limit} onChange={(e) => setFilter('limit', parseInt(e.target.value, 10))}>
                {[10, 20, 50, 100, 200].map((value) => <option key={value} value={value}>{value} dòng</option>)}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', live_status: '', device_id: '', group_id: '', search: '', date_from: '', date_to: '', soak_days: '', video_min: '', video_max: '', sort_by: '', sort_dir: '', page: 1, limit: filters.limit })}>
              ✕ Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      <JobToolbar onCheckAll={handleCheckLiveAll} checking={clChecking} />

      {selected.size > 0 && (
        <JobBulkBar
          selected={selected}
          onClear={() => setSelected(new Set())}
          onRefresh={() => fetchAccounts(filters)}
          onCheckLive={handleCheckLive}
          clChecking={clChecking}
        />
      )}
      {clProgress && (
        <div className="info-bar">
          Đang check live: {clProgress.done}/{clProgress.total} - {clProgress.live} live - {clProgress.die} die - {clProgress.unknown} unknown
        </div>
      )}
      {clResults && <CheckLiveResults results={clResults} onClose={() => setClResults(null)} />}
      {error && <div className="error-bar">{error}</div>}

      <div className="card">
        <div className="table-container">
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /> Đang tải...</div>
          ) : accounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⚡</div>
              <p>Không tìm thấy account JOB nào</p>
              <button onClick={() => setShowImport(true)} style={{ marginTop: '1rem', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>
                📥 Import account ngay
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="cb-cell">
                    <input type="checkbox" checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = someSelected && !allPageSelected; }} onChange={toggleAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  </th>
                  <th>STT</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Máy</th>
                  <th>Trạng thái</th>
                  <th>Live</th>
                  <SortTh field="job_count">Jobs</SortTh>
                  <SortTh field="video_count">Videos</SortTh>
                  <SortTh field="followers">Followers</SortTh>
                  <SortTh field="following">Following</SortTh>
                  <th>Lock</th>
                  <th>Ghi chú</th>
                  <SortTh field="completed_at">Ngày báo</SortTh>
                  <SortTh field="created_at">Ngày tạo</SortTh>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account, index) => {
                  const sc = STATUS_COLOR[account.status] || { bg: 'rgba(100,116,139,.1)', color: '#94a3b8' };
                  return (
                    <tr key={account.id} className={`job-row${selected.has(account.id) ? ' row-selected' : ''}`}>
                      <td className="cb-cell" onClick={(event) => toggleOne(account.id, event)}>
                        <input type="checkbox" checked={selected.has(account.id)} onChange={() => {}} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                      </td>
                      <td className="td-mono" style={{ color: '#94a3b8' }}>{rowOffset + index + 1}</td>
                      <td>
                        <strong style={{ fontSize: '.85rem' }}>{account.username || <span style={{ color: '#94a3b8' }}>N/A</span>}</strong>
                        {account.fail_reason && <div style={{ fontSize: '.7rem', color: '#ef4444', marginTop: 2 }}>{account.fail_reason}</div>}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '.78rem', fontFamily: 'monospace' }}>
                        {account.email ? account.email.substring(0, 22) + (account.email.length > 22 ? '...' : '') : '-'}
                      </td>
                      <td style={{ color: '#475569', fontSize: '.75rem', fontFamily: 'monospace' }}>
                        {account.device_id ? `${account.device_id}`.substring(0, 12) + (`${account.device_id}`.length > 12 ? '...' : '') : '-'}
                      </td>
                      <td>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {STATUS_META[account.status]?.icon} {statusLabel(account.status)}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: LIVE_COLOR[account.live_status] || '#94a3b8', fontWeight: 700, fontSize: '.78rem' }}>
                          {liveLabel(account.live_status)}
                        </span>
                      </td>
                      <td style={{ color: account.job_count != null && account.job_count < 50 ? '#b45309' : '#475569', fontWeight: 800 }}>{account.job_count ?? '-'}</td>
                      <td style={{ color: account.video_count > 0 ? '#047857' : '#64748b', fontWeight: account.video_count >= eligibility.min_videos ? 800 : 700 }}>
                        {account.video_count ?? 0}
                        {account.video_count >= eligibility.min_videos && <span style={{ color: '#22c55e', marginLeft: '.3rem', fontSize: '.7rem' }}>✓</span>}
                      </td>
                      <td style={{ color: '#2563eb', fontWeight: 700 }}>{fmtNum(account.followers)}</td>
                      <td style={{ color: '#7c3aed', fontWeight: 700 }}>{fmtNum(account.following)}</td>
                      <td style={{ color: '#64748b', fontSize: '.72rem', whiteSpace: 'nowrap' }}>
                        {account.locked_by ? `🔒 ${account.locked_by} - ${fmt(account.locked_at)}` : '—'}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '.75rem' }}>
                        {account.note ? `${account.note}`.substring(0, 25) + (`${account.note}`.length > 25 ? '...' : '') : '—'}
                      </td>
                      <td style={{ color: '#475569', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmt(account.completed_at)}</td>
                      <td style={{ color: '#475569', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmt(account.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {pagination && (pagination.totalPages || pagination.pages) > 1 && (
          <Pagination pagination={{ ...pagination, totalPages: pagination.totalPages || pagination.pages }} onPageChange={setPage} />
        )}
      </div>

      {showImport && (
        <ImportJobModal
          onClose={() => setShowImport(false)}
          onImported={() => fetchAccounts(filters)}
          groups={groups}
          onGroupCreated={() => fetchGroups()}
        />
      )}
    </div>
  );
}
