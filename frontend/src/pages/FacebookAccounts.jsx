import { useCallback, useEffect, useMemo, useState } from 'react';
import { facebookApi, accountGroupApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import AccountGroupPicker from '../components/AccountGroupPicker';
import { copyText } from '../services/clipboard';

const STATUS_TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'CHO_LOGIN', icon: '🔐', label: 'Chờ login', color: '#06b6d4' },
  { value: 'DANG_LOGIN', icon: '⚡', label: 'Đang login', color: '#8b5cf6' },
  { value: 'LOGIN_THANH_CONG', icon: '✅', label: 'Login thành công', color: '#10b981' },
  { value: 'LOGIN_FAIL', icon: '❌', label: 'Login fail', color: '#f97316' },
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
  LOGIN_THANH_CONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  LOGIN_FAIL: { bg: 'rgba(249,115,22,.15)', color: '#ea580c' },
  ACCOUNT_DIE: { bg: 'rgba(107,114,128,.16)', color: '#4b5563' },
};
const LIVE_COLOR = { live: '#10b981', die: '#ef4444', unknown: '#94a3b8' };

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const short = (value, len = 22) => {
  const text = String(value || '');
  return text.length > len ? `${text.slice(0, len)}...` : text || '—';
};
const groupTypeForKind = (kind) => kind === 'reg' ? 'facebook_reg' : 'facebook_job';
const totalFromCounts = (counts) => Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
const statusLabel = (status) => STATUS_META[status]?.label || status || '—';

function ImportFacebookModal({ kind, groups, onGroupsChanged, onClose, onImported }) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [importing, setImporting] = useState(false);
  const lineCount = text.trim().split('\n').filter((line) => line.trim()).length;

  const handleImport = async () => {
    if (!text.trim()) return toast.error('Nhập account trước');
    setImporting(true);
    try {
      const res = await facebookApi.import(text, kind, kind === 'reg' ? 'LOGIN_THANH_CONG' : 'CHO_LOGIN', groupId || null);
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
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '660px', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>📥 Import Facebook {kind === 'reg' ? 'Reg' : 'Job'}</h3>
            <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: '.35rem' }}>Uid|pass|2fa|cookies|Token|Mail nếu có</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
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
          onChange={(e) => setText(e.target.value)}
          placeholder="1000001|pass|2fa|c_user=...|EAAB...|mail@example.com"
          style={{ width: '100%', height: 270, resize: 'vertical', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>{lineCount} dòng</span>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Đóng</button>
          <button className="btn btn-primary" disabled={importing} onClick={handleImport}>📥 {importing ? 'Đang import...' : 'Import'}</button>
        </div>
      </div>
    </div>
  );
}

function FacebookToolbar({ selectedCount, groups, moveGroupId, movingGroup, onMoveGroupChange, onMoveGroup, onCheckLive, checking, onCopy, copying, onDelete, onClear }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem', marginBottom: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#94a3b8' }}>
        <span>🌐 Facebook Graph</span>
        <span style={{ color: '#6ee7b7', fontWeight: 700 }}>picture</span>
      </div>
      <div style={{ flex: 1 }} />
      {selectedCount > 0 && (
        <>
          <select value={moveGroupId} onChange={(e) => onMoveGroupChange(e.target.value)} disabled={movingGroup} style={{ minWidth: 170, height: 34, borderRadius: 8, border: '1px solid rgba(148,163,184,.35)', background: '#fff', color: '#0f172a', padding: '0 .6rem', fontSize: '.8rem' }}>
            <option value="">Chọn nhóm chuyển</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button onClick={onMoveGroup} disabled={movingGroup || !moveGroupId} className="btn btn-warning btn-sm">📦 {movingGroup ? 'Đang chuyển...' : 'Chuyển nhóm'}</button>
        </>
      )}
      <button onClick={onCheckLive} disabled={checking || copying || movingGroup} className="btn btn-primary btn-sm">🔍 {checking ? 'Đang check...' : selectedCount ? 'Check live đã chọn' : 'Check live trang này'}</button>
      {selectedCount > 0 && <button onClick={onCopy} disabled={copying || checking || movingGroup} className="btn btn-success btn-sm">📋 {copying ? 'Đang copy...' : 'Copy account'}</button>}
      {selectedCount > 0 && <button onClick={onDelete} className="btn btn-danger btn-sm">🗑️ Xóa</button>}
      {selectedCount > 0 && <button onClick={onClear} className="btn btn-secondary btn-sm">✕ Bỏ chọn</button>}
      <div style={{ fontSize: '.68rem', color: '#475569' }}>Live khi Graph trả data.height</div>
    </div>
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
  const [copying, setCopying] = useState(false);
  const [movingGroup, setMovingGroup] = useState(false);
  const [moveGroupId, setMoveGroupId] = useState('');

  const isReg = kind === 'reg';
  const tabs = isReg ? REG_TABS : STATUS_TABS;
  const title = isReg ? 'Facebook Reg' : 'Facebook Job';
  const subtitle = isReg ? 'Máy push account sau khi reg/login.' : 'Phone job lấy account, khóa lock theo máy và báo cáo trạng thái.';
  const params = useMemo(() => ({ kind, page, limit, status, live_status: liveStatus, group_id: groupId, q }), [kind, page, limit, status, liveStatus, groupId, q]);

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
      setSelected(new Set());
      setMoveGroupId('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMovingGroup(false);
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
      `}</style>

      <div className="page-header">
        <div>
          <h1>📘 {title} <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>{isReg ? 'Account reg' : 'Phone job'}</span></h1>
          <div className="subtitle">{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={() => setShowImport(true)} style={{ background: '#06b6d4', border: 'none', color: '#fff', borderRadius: '8px', padding: '.55rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '.875rem' }}>📥 Import</button>
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-sm">🔄 Làm mới</button>
        </div>
      </div>

      {isReg && (
        <div className="fb-stat-grid">
          <div className="stat-card" style={{ borderLeftColor: '#06b6d4' }}>
            <div className="stat-icon" style={{ background: 'rgba(6,182,212,.15)', color: '#0891b2' }}>📋</div>
            <div className="stat-info"><div className="stat-value">{totalCount}</div><div className="stat-title">Tổng Account</div></div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#6b7280' }}>
            <div className="stat-icon" style={{ background: 'rgba(107,114,128,.16)', color: '#4b5563' }}>💀</div>
            <div className="stat-info"><div className="stat-value">{dieCount}</div><div className="stat-title">Die</div></div>
          </div>
        </div>
      )}

      <div className="fb-status-tabs">
        {tabs.map((tab) => (
          <button key={tab.value || 'ALL'} onClick={() => setFilter(setStatus, tab.value)} style={{
            background: status === tab.value ? tab.color : 'rgba(255,255,255,.06)',
            color: status === tab.value ? '#fff' : '#94a3b8',
            border: status === tab.value ? 'none' : '1px solid rgba(255,255,255,.1)',
            borderRadius: '8px', padding: '.4rem .85rem', cursor: 'pointer',
            fontWeight: status === tab.value ? 700 : 400, fontSize: '.82rem', whiteSpace: 'nowrap',
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
              <input type="text" placeholder="uid, mail, phone..." value={q} onChange={(e) => setFilter(setQ, e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Nhóm</label>
              <select value={groupId} onChange={(e) => setFilter(setGroupId, e.target.value)}>
                <option value="">Tất cả nhóm</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Trạng thái live</label>
              <select value={liveStatus} onChange={(e) => setFilter(setLiveStatus, e.target.value)}>
                {LIVE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Số dòng</label>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); resetSelection(); }}>
                {[20, 50, 100, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} dòng</option>)}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus(''); setLiveStatus(''); setGroupId(''); setPage(1); resetSelection(); }}>✕ Xóa bộ lọc</button>
          </div>
        </div>
      </div>

      <FacebookToolbar selectedCount={selectedIds.length} groups={groups} moveGroupId={moveGroupId} movingGroup={movingGroup} onMoveGroupChange={setMoveGroupId} onMoveGroup={handleMoveGroup} onCheckLive={handleCheckLive} checking={checking} onCopy={handleCopy} copying={copying} onDelete={handleDelete} onClear={() => setSelected(new Set())} />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <h3>📋 Danh sách account</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} account {loading ? '• đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>STT</th><th>UID</th><th>PASS</th><th>2FA</th><th>COOKIES</th><th>TOKEN</th><th>MAIL</th><th>NHÓM</th><th>MÁY</th><th>TRẠNG THÁI</th><th>LIVE</th><th>LOCK</th><th>LOGIN AT</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="14" style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có account Facebook</td></tr>
              ) : rows.map((row, idx) => {
                const sc = STATUS_COLOR[row.status] || { bg: 'rgba(100,116,139,.1)', color: '#64748b' };
                const group = groups.find((item) => String(item.id) === String(row.group_id));
                return (
                  <tr key={row.id} className={`fb-row${selected.has(row.id) ? ' row-selected' : ''}`}>
                    <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td>
                    <td style={{ color: '#94a3b8' }}>{rowOffset + idx + 1}</td>
                    <td><strong>{row.uid}</strong></td>
                    <td>{short(row.password, 18)}</td>
                    <td>{short(row.two_fa, 18)}</td>
                    <td title={row.cookies || ''}>{short(row.cookies, 26)}</td>
                    <td title={row.token || ''}>{short(row.token, 26)}</td>
                    <td>{short(row.email, 24)}</td>
                    <td>{group?.name || '—'}</td>
                    <td>{row.device_id || '—'}</td>
                    <td><span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{STATUS_META[row.status]?.icon} {statusLabel(row.status)}</span></td>
                    <td style={{ color: LIVE_COLOR[row.live_status] || '#94a3b8', fontWeight: 700 }}>• {row.live_status || 'unknown'}</td>
                    <td>{row.locked_by ? `🔒 ${row.locked_by} - ${fmt(row.locked_at)}` : '—'}</td>
                    <td>{fmt(row.login_at)}</td>
                  </tr>
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
