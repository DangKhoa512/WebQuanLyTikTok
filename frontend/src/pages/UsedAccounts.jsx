import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { accountApi, accountGroupApi, chromeAccountApi, usedAccountApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';
import { copyText } from '../services/clipboard';
import { useEligibilitySettings } from '../services/eligibilitySettings';

const todayInput = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const pipeValue = (value) => value == null || value === '' ? 'null' : value;
const fmtNum = (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN');
const STATUS_OPTIONS = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE'];
const STATUS_COLOR = {
  ACC_LOGIN:        { bg: 'rgba(6,182,212,.15)',   color: '#67e8f9'  },
  LOGIN_THANH_CONG: { bg: 'rgba(16,185,129,.15)',  color: '#6ee7b7'  },
  ACC_DA_KHANG:     { bg: 'rgba(139,92,246,.15)',  color: '#c4b5fd'  },
  ACC_CHUA_KHANG:   { bg: 'rgba(249,115,22,.15)',  color: '#fdba74'  },
  ACC_DU_DK:        { bg: 'rgba(34,197,94,.15)',   color: '#86efac'  },
  ACC_DA_DUNG:      { bg: 'rgba(100,116,139,.18)', color: '#cbd5e1'  },
  ACC_DIE:          { bg: 'rgba(107,114,128,.15)', color: '#9ca3af'  },
};

function UsedToolbar({ isChrome }) {
  const eligibility = useEligibilitySettings();
  const settings = loadCheckLiveSettings();
  const proxyCount = settings.proxies.split('\n').map((line) => line.trim()).filter(Boolean).length;

  return (
    <div style={{
      background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem',
      marginBottom: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
        <span style={{ color: '#94a3b8' }}>🌐</span>
        <span style={{ color: proxyCount > 0 ? '#6ee7b7' : '#f87171', fontWeight: 600 }}>{proxyCount} proxy</span>
        <Link to="/proxy-settings" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '.78rem', background: 'rgba(59,130,246,.1)', borderRadius: '6px', padding: '.15rem .5rem', border: '1px solid rgba(59,130,246,.2)' }}>
          ⚙ Cài đặt
        </Link>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: '.68rem', color: '#475569' }}>
        Điều kiện đủ ĐK: ≥ {eligibility.min_videos} video + reg ≥ {eligibility.min_age_days} ngày
      </div>
    </div>
  );
}

export default function UsedAccounts() {
  const eligibility = useEligibilitySettings();
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [statusPick, setStatusPick] = useState('');
  const [showStatusDlg, setShowStatusDlg] = useState(false);
  const [groups, setGroups] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [filters, setFilters] = useState({
    date: sp.get('date') || todayInput(),
    account_type: sp.get('account_type') || 'app',
    username: sp.get('username') || '',
    live_status: sp.get('live_status') || '',
    video_min: sp.get('video_min') || '',
    video_max: sp.get('video_max') || '',
    group_id: sp.get('group_id') || '',
    device_id: sp.get('device_id') || '',
    sort_by: sp.get('sort_by') || '',
    sort_dir: sp.get('sort_dir') || '',
    page: parseInt(sp.get('page') || '1'),
    limit: parseInt(sp.get('limit') || '50'),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadGroups = async () => {
      try {
        if (filters.account_type === 'app' || filters.account_type === 'chrome') {
          const res = await accountGroupApi.getAll(filters.account_type);
          if (mounted) setGroups(res.data?.groups || []);
          return;
        }
        const [appRes, chromeRes] = await Promise.all([
          accountGroupApi.getAll('app'),
          accountGroupApi.getAll('chrome'),
        ]);
        if (mounted) {
          setGroups([
            ...(appRes.data?.groups || []).map((group) => ({ ...group, labelPrefix: 'App' })),
            ...(chromeRes.data?.groups || []).map((group) => ({ ...group, labelPrefix: 'Chrome' })),
          ]);
        }
      } catch (err) {
        if (mounted) toast.error(err.message || 'Không tải được nhóm');
      }
    };
    loadGroups();
    return () => { mounted = false; };
  }, [filters.account_type]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value != null) params[key] = value;
      });
      const res = await usedAccountApi.getAll(params);
      setItems(res.data.items || []);
      setMeta({
        total: res.data.total || 0,
        page: res.data.page || 1,
        limit: res.data.limit || 50,
        totalPages: res.data.totalPages || 1,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setSelected(new Set());
    const params = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value != null) params[key] = value;
    });
    setSp(params, { replace: true });
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };
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

  const copyRows = async (rows = items) => {
    if (rows.length === 0) {
      toast.error('Không có account để copy');
      return;
    }
    const text = rows.map((item) => [
      item.username || '',
      pipeValue(item.password),
      pipeValue(item.email),
      pipeValue(item.email_pass),
    ].join('|')).join('\n');
    await copyText(text);
    toast.success(`Đã copy ${rows.length} account`);
  };

  const selectedRows = items.filter((item) => selected.has(item.id));
  const allPageSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = items.some((item) => selected.has(item.id));
  const rowOffset = ((meta.page || filters.page || 1) - 1) * (meta.limit || filters.limit || 50);

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      allPageSelected ? items.forEach((item) => next.delete(item.id)) : items.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const splitOriginalIds = (rows) => ({
    app: rows.filter((item) => item.account_type === 'app' && item.original_exists).map((item) => item.account_id),
    chrome: rows.filter((item) => item.account_type === 'chrome' && item.original_exists).map((item) => item.account_id),
  });

  const runForOriginals = async (rows, fn) => {
    const ids = splitOriginalIds(rows);
    if (ids.app.length > 0) await fn(accountApi, ids.app);
    if (ids.chrome.length > 0) await fn(chromeAccountApi, ids.chrome);
  };

  const handleCheckLive = async () => {
    if (selectedRows.length === 0) return;
    setBusy(true);
    try {
      const settings = loadCheckLiveSettings();
      const appIds = selectedRows.filter((item) => item.account_type === 'app').map((item) => item.account_id);
      const chromeIds = selectedRows.filter((item) => item.account_type === 'chrome').map((item) => item.account_id);
      let live = 0;
      let die = 0;
      let unknown = 0;

      if (appIds.length > 0) {
        const res = await checkLiveInBatches('/accounts/check-live', appIds, settings);
        live += res.live; die += res.die; unknown += res.unknown;
      }
      if (chromeIds.length > 0) {
        const res = await checkLiveInBatches('/chrome-accounts/check-live', chromeIds, settings);
        live += res.live; die += res.die; unknown += res.unknown;
      }

      toast.success(`Check xong: ${live} live · ${die} die · ${unknown} unknown`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Check live thất bại');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAndMark = async () => {
    if (selectedRows.length === 0) return;
    setBusy(true);
    try {
      await copyRows(selectedRows);
      await runForOriginals(selectedRows, (api, ids) => api.bulkAction(ids, 'mark_used'));
      toast.success(`Đã đánh dấu ${selectedRows.length} account`);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkUsed = async () => {
    if (selectedRows.length === 0) return;
    setBusy(true);
    try {
      await runForOriginals(selectedRows, (api, ids) => api.bulkAction(ids, 'mark_used'));
      toast.success(`Đã đánh dấu ${selectedRows.length} account`);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetStatus = async () => {
    if (!statusPick || selectedRows.length === 0) return;
    setBusy(true);
    try {
      await runForOriginals(selectedRows, (api, ids) => api.bulkAction(ids, 'set_status', { status: statusPick }));
      toast.success(`Đã đổi trạng thái ${selectedRows.length} account`);
      setStatusPick('');
      setShowStatusDlg(false);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMoveEligible = async () => {
    if (selectedRows.length === 0) return;
    setBusy(true);
    try {
      await runForOriginals(selectedRows, (api, ids) => api.bulkAction(ids, 'set_status', { status: 'ACC_DU_DK' }));
      toast.success(`Đã chuyển ${selectedRows.length} account sang đủ ĐK`);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOriginals = async () => {
    if (selectedRows.length === 0) return;
    if (!confirm(`Xóa account gốc của ${selectedRows.length} dòng đã chọn?`)) return;
    setBusy(true);
    try {
      await runForOriginals(selectedRows, (api, ids) => api.bulkDelete(ids));
      toast.success(`Đã xóa account gốc`);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHistory = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Xóa ${ids.length} dòng lịch sử đã sử dụng? Account gốc không bị xóa.`)) return;
    setBusy(true);
    try {
      const res = await usedAccountApi.bulkDelete(ids);
      toast.success(res.message);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const isChrome = filters.account_type === 'chrome';
  const basePath = isChrome ? '/chrome-accounts' : '/accounts';
  const bulkBtn = (label, onClick, color) => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: color, border: 'none', color: '#fff',
        borderRadius: '7px', padding: '.4rem .85rem',
        cursor: busy ? 'not-allowed' : 'pointer',
        fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap',
        opacity: busy ? 0.65 : 1, transition: 'opacity .15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="page">
      <style>{`
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .used-row:hover { background: rgba(59,130,246,.05) !important; cursor: default; }
        .used-row.row-selected { background: rgba(59,130,246,.08) !important; }
        .cb-cell { width: 40px; padding: 0 8px !important; text-align: center; }
        .used-filter-row .filter-group { flex: 1 1 220px; }
        .used-filter-row .filter-group input,
        .used-filter-row .filter-group select { width: 100%; }
        .sort-th { display: inline-flex; align-items: center; gap: .35rem; border: 0; background: transparent; padding: 0; color: inherit; font: inherit; font-weight: inherit; letter-spacing: inherit; cursor: pointer; text-transform: inherit; }
        .sort-th span:last-child { color: #94a3b8; font-size: .68rem; line-height: 1; }
        .sort-th.active span:last-child { color: #2563eb; }
      `}</style>

      <div className="page-header">
        <div>
          <h1>{isChrome ? '🖥️ Chrome Accounts' : '📤 Accounts App'}</h1>
          <p className="subtitle">Đang xem tab Đã sử dụng theo ngày.</p>
        </div>
        <button className="btn btn-primary" onClick={() => copyRows()}>Copy trang này</button>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Link to={basePath} className="usage-tab">📋 Tất cả</Link>
        <Link to={`${basePath}?status=LOGIN_THANH_CONG`} className="usage-tab">{isChrome ? '✅ Login Thành Công' : '📤 Upload Thành Công'}</Link>
        <Link to={`${basePath}?status=ACC_DA_KHANG`} className="usage-tab">🛡️ Đã Kháng</Link>
        <Link to={`${basePath}?status=ACC_CHUA_KHANG`} className="usage-tab">⚠️ Chưa Kháng</Link>
        <Link to={`${basePath}?status=ACC_DU_DK`} className="usage-tab">🎯 Đủ Điều Kiện</Link>
        <span className="usage-tab active">📦 Đã sử dụng</span>
        <Link to={`${basePath}?status=ACC_DIE`} className="usage-tab">💀 Die</Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row used-filter-row">
            <div className="filter-group">
              <label>Ngày lấy</label>
              <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Loại account</label>
              <select value={filters.account_type} onChange={(e) => setFilters((prev) => ({ ...prev, account_type: e.target.value, group_id: '', page: 1 }))}>
                <option value="">Tất cả</option>
                <option value="app">Accounts App</option>
                <option value="chrome">Chrome Acc</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Tìm username</label>
              <input value={filters.username} onChange={(e) => setFilter('username', e.target.value)} placeholder="username..." />
            </div>
            <div className="filter-group">
              <label>Live status</label>
              <select value={filters.live_status} onChange={(e) => setFilter('live_status', e.target.value)}>
                <option value="">Tất cả</option>
                <option value="unknown">Unknown</option>
                <option value="live">Live</option>
                <option value="die">Die</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Video từ</label>
              <input type="number" min={0} placeholder="0" value={filters.video_min} onChange={(e) => setFilter('video_min', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Video đến</label>
              <input type="number" min={0} placeholder="-" value={filters.video_max} onChange={(e) => setFilter('video_max', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Nhóm</label>
              <select value={filters.group_id} onChange={(e) => setFilter('group_id', e.target.value)}>
                <option value="">Tất cả nhóm</option>
                {groups.map((group) => (
                  <option key={`${group.labelPrefix || filters.account_type || 'group'}-${group.id}`} value={group.id}>
                    {group.labelPrefix ? `${group.labelPrefix} - ${group.name}` : group.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Device ID</label>
              <input value={filters.device_id} onChange={(e) => setFilter('device_id', e.target.value)} placeholder="device_id..." />
            </div>
            <div className="filter-group">
              <label>Số dòng</label>
              <select value={filters.limit} onChange={(e) => setFilter('limit', Number(e.target.value))}>
                {[20, 50, 100, 200, 500, 1000, 2000].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ date: todayInput(), account_type: filters.account_type, username: '', live_status: '', video_min: '', video_max: '', group_id: '', device_id: '', sort_by: '', sort_dir: '', page: 1, limit: filters.limit })}>
              ✕ Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-bar">⚠️ {error}</div>}

      <UsedToolbar isChrome={isChrome} />

      {selected.size > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100, background: '#1e293b', color: '#f8fafc',
          borderRadius: '10px', padding: '.75rem 1rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(0,0,0,.25)', animation: 'slideDown .2s ease',
        }}>
          <div style={{ background: '#3b82f6', borderRadius: '20px', padding: '.25rem .75rem', fontWeight: 700, fontSize: '.875rem' }}>
            ✓ {selected.size} đã chọn
          </div>
          <div style={{ flex: 1 }} />
          {bulkBtn('🔍 Check Live', handleCheckLive, '#0ea5e9')}
          {bulkBtn('🎯 Chuyển đủ ĐK', handleMoveEligible, '#8b5cf6')}
          {bulkBtn('📋 Copy', () => copyRows(selectedRows), '#3b82f6')}
          {bulkBtn('📋✅ Copy & Đánh dấu', handleCopyAndMark, '#8b5cf6')}
          {bulkBtn('🏷️ Đánh dấu Đã dùng', handleMarkUsed, '#f59e0b')}
          {bulkBtn('🗑️ Xóa', handleDeleteOriginals, '#dc2626')}
          <div style={{ position: 'relative' }}>
            {bulkBtn('🔄 Đổi trạng thái', () => setShowStatusDlg((v) => !v), '#10b981')}
            {showStatusDlg && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: '#fff', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                padding: '1rem', minWidth: '220px', zIndex: 200, color: '#0f172a',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '.5rem', fontSize: '.85rem' }}>Chọn trạng thái:</div>
                <select
                  value={statusPick}
                  onChange={(e) => setStatusPick(e.target.value)}
                  style={{ width: '100%', padding: '.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '.75rem' }}
                >
                  <option value="">-- Chọn --</option>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button onClick={handleSetStatus} disabled={!statusPick || busy} style={{ flex: 1, padding: '.5rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Xác nhận</button>
                  <button onClick={() => setShowStatusDlg(false)} style={{ padding: '.5rem .75rem', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Huỷ</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleDeleteHistory} disabled={busy} style={{ background: '#f1f5f9', border: 'none', color: '#475569', borderRadius: '7px', padding: '.4rem .85rem', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap', opacity: busy ? .65 : 1 }}>Xóa lịch sử</button>
          <button onClick={() => setSelected(new Set())} disabled={busy} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: '#94a3b8', borderRadius: '6px', padding: '.35rem .65rem', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '.8rem' }}>✕ Bỏ chọn</button>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="cb-cell">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allPageSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th>STT</th>
                <th>Username</th>
                <th>Email</th>
                <th>Proxy</th>
                <th>Device</th>
                <th>Status</th>
                <th>Live</th>
                <SortTh field="video_count">Videos</SortTh>
                <SortTh field="followers">Followers</SortTh>
                <SortTh field="following">Following</SortTh>
                <th>Note</th>
                <SortTh field="used_at">Ngày lấy</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="empty-cell">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="13" className="empty-cell">Không có lịch sử phù hợp</td></tr>
              ) : items.map((item, index) => {
                const sc = STATUS_COLOR[item.status || item.source_status] || { bg: 'rgba(100,116,139,.1)', color: '#94a3b8' };
                return (
                <tr key={item.id} className={`used-row${selected.has(item.id) ? ' row-selected' : ''}`}>
                  <td className="cb-cell" onClick={() => toggleOne(item.id)}>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => {}} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  </td>
                  <td className="td-mono" style={{ color: '#94a3b8' }}>{rowOffset + index + 1}</td>
                  <td>
                    <strong style={{ fontSize: '.85rem' }}>{item.username || <span style={{ color: '#94a3b8' }}>N/A</span>}</strong>
                    <div style={{ fontSize: '.7rem', color: '#8b5cf6', marginTop: 2 }}>
                      📝 {item.account_type === 'chrome' ? 'Chrome' : 'App'} · {fmt(item.used_at)}
                    </div>
                  </td>
                  <td style={{ color: '#64748b', fontSize: '.78rem', fontFamily: 'monospace' }}>
                    {item.email ? item.email.substring(0, 20) + (item.email.length > 20 ? '…' : '') : '—'}
                  </td>
                  <td style={{ color: '#475569', fontSize: '.75rem', fontFamily: 'monospace' }}>
                    {item.proxy ? item.proxy.split('@').pop()?.substring(0, 16) : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={{ color: '#475569', fontSize: '.75rem', fontFamily: 'monospace' }}>
                    {item.device_id ? `${item.device_id}`.substring(0, 10) + '…' : '—'}
                  </td>
                  <td>
                    <span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {item.status || item.source_status || '—'}
                    </span>
                  </td>
                  <td>
                    {item.live_status === 'live'
                      ? <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '.78rem' }}>• live</span>
                      : item.live_status === 'die'
                      ? <span style={{ color: '#f87171', fontWeight: 700, fontSize: '.78rem' }}>• die</span>
                      : <span style={{ color: '#475569', fontSize: '.78rem' }}>• unknown</span>}
                  </td>
                  <td style={{ color: item.video_count > 0 ? '#047857' : '#64748b', fontWeight: item.video_count >= eligibility.min_videos ? 800 : 700 }}>
                    {item.video_count ?? 0}
                    {item.video_count >= eligibility.min_videos && <span style={{ color: '#22c55e', marginLeft: '.3rem', fontSize: '.7rem' }}>✓</span>}
                  </td>
                  <td style={{ color: '#2563eb', fontWeight: 700 }}>{fmtNum(item.followers)}</td>
                  <td style={{ color: '#7c3aed', fontWeight: 700 }}>{fmtNum(item.following)}</td>
                  <td style={{ color: '#64748b', fontSize: '.75rem' }}>
                    {item.note ? `${item.note}`.substring(0, 25) + (`${item.note}`.length > 25 ? '…' : '') : '—'}
                  </td>
                  <td style={{ color: '#475569', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmt(item.used_at)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination pagination={meta} onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))} />
      </div>
    </div>
  );
}
