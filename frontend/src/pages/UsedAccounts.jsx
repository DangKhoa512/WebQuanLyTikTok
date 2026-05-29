import { useEffect, useState } from 'react';
import { usedAccountApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';

const todayInput = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const pipeValue = (value) => value == null || value === '' ? 'null' : value;

export default function UsedAccounts() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [filters, setFilters] = useState({
    date: todayInput(),
    account_type: '',
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
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const copyRows = async () => {
    if (items.length === 0) {
      toast.error('Không có account để copy');
      return;
    }
    const text = items.map((item) => [
      item.username || '',
      pipeValue(item.password),
      pipeValue(item.email),
      pipeValue(item.email_pass),
    ].join('|')).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${items.length} account`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📦 Acc đã sử dụng</h1>
          <p className="subtitle">Lịch sử account đã lấy ra và đánh dấu theo ngày.</p>
        </div>
        <button className="btn btn-primary" onClick={copyRows}>Copy trang này</button>
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

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
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
                <tr><td colSpan="7" className="empty-cell">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="7" className="empty-cell">Không có lịch sử phù hợp</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
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
