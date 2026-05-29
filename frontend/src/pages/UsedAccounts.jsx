import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { usedAccountApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';

const todayInput = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const pipeValue = (value) => value == null || value === '' ? 'null' : value;

export default function UsedAccounts() {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
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
    } catch (err) {
      toast.error(err.message || 'Check live thất bại');
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
        <button className="btn btn-primary" onClick={copyRows}>Copy trang này</button>
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
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleDeleteHistory}>🗑️ Xóa lịch sử</button>
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
                <th>Loại</th>
                <th>Username</th>
                <th>Email</th>
                <th>Status nguồn</th>
                <th>Batch</th>
                <th>Ngày lấy</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-cell">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="8" className="empty-cell">Không có lịch sử phù hợp</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className={selected.has(item.id) ? 'row-selected' : ''}>
                  <td className="cb-cell" onClick={() => toggleOne(item.id)}>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => {}} />
                  </td>
                  <td className="td-mono">{item.id}</td>
                  <td>{item.account_type === 'chrome' ? 'Chrome' : 'App'}</td>
                  <td><strong>{item.username}</strong></td>
                  <td>{item.email || '—'}</td>
                  <td>{item.source_status || '—'}</td>
                  <td className="td-mono">{item.batch_id}</td>
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
