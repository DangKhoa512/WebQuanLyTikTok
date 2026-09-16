import { useCallback, useEffect, useMemo, useState } from 'react';
import { facebookApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';

const TABS = [
  { value: '', label: 'Tất cả', color: '#64748b' },
  { value: 'CHUA_NUOI', label: 'Chưa nuôi', color: '#0ea5e9' },
  { value: 'DANG_NUOI', label: 'Đang nuôi', color: '#8b5cf6' },
  { value: 'DA_NUOI', label: 'Đã nuôi', color: '#10b981' },
  { value: 'NUOI_FAIL', label: 'Nuôi fail', color: '#ef4444' },
];

const STATUS_STYLE = {
  CHUA_NUOI: { label: 'Chưa nuôi', color: '#0284c7', bg: 'rgba(14,165,233,.14)' },
  DANG_NUOI: { label: 'Đang nuôi', color: '#7c3aed', bg: 'rgba(139,92,246,.14)' },
  DA_NUOI: { label: 'Đã nuôi', color: '#059669', bg: 'rgba(16,185,129,.14)' },
  NUOI_FAIL: { label: 'Nuôi fail', color: '#dc2626', bg: 'rgba(239,68,68,.14)' },
};

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const short = (value, max = 24) => {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) + '...' : text || '-';
};

export default function FacebookNurture() {
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState(null);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => ({ page, limit, status, q }), [page, limit, status, q]);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountRes, logRes] = await Promise.all([
        facebookApi.getNurtureAccounts(params),
        facebookApi.getNurtureLogs({ page: 1, limit: 20 }),
      ]);
      setRows(accountRes.data?.accounts || []);
      setCounts(accountRes.data?.status_counts || {});
      setPagination(accountRes.data?.pagination || null);
      setCooldownHours(accountRes.data?.cooldown_hours || 24);
      setLogs(logRes.data?.logs || []);
    } catch (err) {
      toast.error(err.message || 'Không tải được dữ liệu Facebook Nuôi');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🌱 Facebook Nuôi</h1>
          <div className="subtitle">Chỉ lấy account Facebook Job đã login thành công, khóa theo máy và theo dõi từng phiên nuôi.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
          {loading ? 'Đang tải...' : '🔄 Làm mới'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {TABS.map((tab) => {
          const count = tab.value ? (counts[tab.value] || 0) : total;
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className="btn btn-sm"
              style={{ background: active ? tab.color : '#fff', color: active ? '#fff' : '#334155', border: `1px solid ${active ? tab.color : '#cbd5e1'}`, fontWeight: 800 }}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
          <label className="filter-group">
            <span>Tìm UID / Mail / Máy</span>
            <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="UID, email, May1..." />
          </label>
          <label className="filter-group">
            <span>Số dòng</span>
            <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              {[20, 50, 100, 500].map((item) => <option key={item} value={item}>{item} dòng</option>)}
            </select>
          </label>
          <div style={{ color: '#475569', fontSize: '.82rem', paddingBottom: '.55rem' }}>
            Nuôi lại sau: <b>{cooldownHours} giờ</b>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <div className="card-header">
          <h3>Danh sách account nuôi</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} account</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>STT</th><th>UID</th><th>MÁY</th><th>JOB</th><th>NUÔI</th><th>KỊCH BẢN</th><th>TỔNG LẦN</th><th>LẦN CUỐI</th><th>LOCK NUÔI</th><th>COOKIES</th></tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>Chưa có account Facebook Nuôi</td></tr>
              ) : rows.map((row, index) => {
                const current = STATUS_STYLE[row.nurture_status] || STATUS_STYLE.CHUA_NUOI;
                return (
                  <tr key={row.id}>
                    <td>{(page - 1) * limit + index + 1}</td>
                    <td><strong>{row.uid}</strong></td>
                    <td>{row.device_id || '-'}</td>
                    <td>{row.status || '-'}</td>
                    <td><span style={{ color: current.color, background: current.bg, borderRadius: 6, padding: '.22rem .5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{current.label}</span></td>
                    <td title={row.nurture_scenario_id || ''}>{short(row.nurture_scenario_id)}</td>
                    <td style={{ fontWeight: 800 }}>{row.nurture_count || 0}</td>
                    <td>{fmt(row.last_nurture_at)}</td>
                    <td>{row.nurture_locked_by ? `${row.nurture_locked_by} - ${fmt(row.nurture_locked_at)}` : '-'}</td>
                    <td title={row.cookies || ''}>{short(row.cookies, 30)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination pagination={pagination} onPageChange={setPage} />

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '1rem' }}>
        <div className="card-header"><h3>20 báo cáo nuôi gần nhất</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>UID</th><th>MÁY</th><th>KỊCH BẢN</th><th>KẾT QUẢ</th><th>THỜI GIAN</th><th>HOÀN THÀNH</th><th>GHI CHÚ</th></tr></thead>
            <tbody>
              {!logs.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Chưa có báo cáo nuôi</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.uid}</strong></td><td>{log.device_id}</td><td>{short(log.scenario_id)}</td>
                  <td style={{ color: log.status === 'DA_NUOI' ? '#059669' : '#dc2626', fontWeight: 800 }}>{log.status === 'DA_NUOI' ? 'Đã nuôi' : 'Nuôi fail'}</td>
                  <td>{Math.round((Number(log.duration_seconds) || 0) / 60)} phút</td><td>{fmt(log.completed_at)}</td><td>{short(log.message, 40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}