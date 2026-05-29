import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { accountApi, chromeAccountApi, usedAccountApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';

const todayInput = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const pipeValue = (value) => value == null || value === '' ? 'null' : value;
const fmtNum = (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN');
const LIVE_COLOR = { live: '#16a34a', die: '#dc2626', unknown: '#64748b' };
const STATUS_OPTIONS = ['ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE'];

export default function UsedAccounts() {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [statusPick, setStatusPick] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [filters, setFilters] = useState({
    date: todayInput(),
    account_type: sp.get('account_type') || 'app',
    username: '',
    page: 1,
    limit: 50,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    await navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${rows.length} account`);
  };

  const selectedRows = items.filter((item) => selected.has(item.id));
  const allPageSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = items.some((item) => selected.has(item.id));

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📦 Acc đã sử dụng</h1>
          <p className="subtitle">Lịch sử account đã lấy ra và đánh dấu theo ngày.</p>
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
        <div className="filters-grid">
          <div>
            <label>Ngày lấy</label>
            <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
          </div>
          <div>
            <label>Loại account</label>
            <select value={filters.account_type} onChange={(e) => setFilter('account_type', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="app">Accounts App</option>
              <option value="chrome">Chrome Acc</option>
            </select>
          </div>
          <div>
            <label>Tìm username</label>
            <input value={filters.username} onChange={(e) => setFilter('username', e.target.value)} placeholder="username..." />
          </div>
          <div>
            <label>Số dòng</label>
            <select value={filters.limit} onChange={(e) => setFilter('limit', Number(e.target.value))}>
              {[20, 50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="error-bar">⚠️ {error}</div>}
      <div className="info-bar">Tổng: {meta.total} account</div>

      {selected.size > 0 && (
        <div className="bulk-lite-bar">
          <div className="bulk-lite-count">✓ {selected.size} đã chọn</div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleCheckLive}>🔍 Check Live</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => copyRows(selectedRows)}>📋 Copy đã chọn</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleCopyAndMark}>📋✅ Copy & Đánh dấu</button>
          <button className="btn btn-warning btn-sm" disabled={busy} onClick={handleMarkUsed}>🏷️ Đánh dấu Đã dùng</button>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleDeleteOriginals}>🗑️ Xóa</button>
          <select className="used-status-select" value={statusPick} onChange={(e) => setStatusPick(e.target.value)} disabled={busy}>
            <option value="">Đổi trạng thái</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button className="btn btn-success btn-sm" disabled={busy || !statusPick} onClick={handleSetStatus}>Xác nhận</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleDeleteHistory}>Xóa lịch sử</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setSelected(new Set())}>✕ Bỏ chọn</button>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
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
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Proxy</th>
                <th>Device</th>
                <th>Status</th>
                <th>Live</th>
                <th>Videos</th>
                <th>Followers</th>
                <th>Following</th>
                <th>Note</th>
                <th>Ngày lấy</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="empty-cell">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="13" className="empty-cell">Không có lịch sử phù hợp</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className={selected.has(item.id) ? 'row-selected' : ''}>
                  <td className="cb-cell" onClick={() => toggleOne(item.id)}>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => {}} />
                  </td>
                  <td className="td-mono">{item.id}</td>
                  <td>
                    <strong>{item.username}</strong>
                    <div style={{ fontSize: '.7rem', color: '#8b5cf6', marginTop: 2 }}>
                      📝 {item.account_type === 'chrome' ? 'Chrome' : 'App'} · {fmt(item.used_at)}
                    </div>
                  </td>
                  <td>{item.email || '—'}</td>
                  <td className="td-mono">{item.proxy ? item.proxy.split('@').pop()?.substring(0, 18) : '—'}</td>
                  <td className="td-mono">{item.device_id ? `${item.device_id}`.substring(0, 12) : '—'}</td>
                  <td><span className="status-pill">{item.status || item.source_status || '—'}</span></td>
                  <td style={{ color: LIVE_COLOR[item.live_status] || LIVE_COLOR.unknown, fontWeight: 700 }}>• {item.live_status || 'unknown'}</td>
                  <td style={{ color: item.video_count >= 20 ? '#047857' : '#64748b', fontWeight: 800 }}>
                    {item.video_count ?? 0}{item.video_count >= 20 && <span style={{ color: '#22c55e', marginLeft: '.3rem' }}>✓</span>}
                  </td>
                  <td style={{ color: '#2563eb', fontWeight: 700 }}>{fmtNum(item.followers)}</td>
                  <td style={{ color: '#7c3aed', fontWeight: 700 }}>{fmtNum(item.following)}</td>
                  <td>{item.note ? `${item.note}`.substring(0, 28) : '—'}</td>
                  <td>{fmt(item.used_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination pagination={meta} onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))} />
      </div>
    </div>
  );
}
