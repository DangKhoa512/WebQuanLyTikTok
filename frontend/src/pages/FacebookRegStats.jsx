import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { facebookApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';

export default function FacebookRegStats() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await facebookApi.getAll({ kind: 'reg', limit: 1, q });
      setRows(res.data?.machine_stats || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const total = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const live = rows.reduce((sum, row) => sum + (Number(row.live) || 0), 0);
  const die = rows.reduce((sum, row) => sum + (Number(row.die) || 0), 0);
  const pages = rows.reduce((sum, row) => sum + (Number(row.pages) || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Thống kê Facebook Reg</h1>
          <div className="subtitle">Theo dõi máy nào đã reg account để backup và kiểm tra lại.</div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Link to="/facebook-reg" className="btn btn-secondary btn-sm">Facebook Reg</Link>
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-sm">{loading ? 'Đang tải...' : 'Làm mới'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 220px))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="stat-card" style={{ borderLeftColor: '#06b6d4' }}><div className="stat-icon" style={{ background: 'rgba(6,182,212,.15)', color: '#0891b2' }}>FB</div><div className="stat-info"><div className="stat-value">{total}</div><div className="stat-title">Tổng Account</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#10b981' }}><div className="stat-icon" style={{ background: 'rgba(16,185,129,.15)', color: '#059669' }}>OK</div><div className="stat-info"><div className="stat-value">{live}</div><div className="stat-title">Live</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#ef4444' }}><div className="stat-icon" style={{ background: 'rgba(239,68,68,.15)', color: '#dc2626' }}>Die</div><div className="stat-info"><div className="stat-value">{die}</div><div className="stat-title">Die</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#0ea5e9' }}><div className="stat-icon" style={{ background: 'rgba(14,165,233,.15)', color: '#0284c7' }}>Pg</div><div className="stat-info"><div className="stat-value">{pages}</div><div className="stat-title">Page</div></div></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group" style={{ minWidth: 260 }}>
              <label>Tìm tên máy</label>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="May1, Reg1..." />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setQ('')}>Xóa lọc</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <h3>Máy đã reg account</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{rows.length} máy {loading ? '- đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>TÊN MÁY</th><th>ACCOUNT</th><th>LIVE</th><th>DIE</th><th>PAGE</th><th>REG CUỐI</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có thống kê máy reg</td></tr>
              ) : rows.map((row) => (
                <tr key={row.device_id}>
                  <td><strong>{row.device_id || '-'}</strong></td>
                  <td style={{ color: '#7c3aed', fontWeight: 800 }}>{row.total || 0}</td>
                  <td style={{ color: '#10b981', fontWeight: 800 }}>{row.live || 0}</td>
                  <td style={{ color: '#ef4444', fontWeight: 800 }}>{row.die || 0}</td>
                  <td style={{ color: '#0ea5e9', fontWeight: 800 }}>{row.pages || 0}</td>
                  <td>{fmt(row.last_reg_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
