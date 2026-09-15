import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { facebookApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const fmtNum = (value) => Number(value || 0).toLocaleString('vi-VN');
const RANGES = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: 'all', label: 'Tất cả' },
];

export default function FacebookRegStats() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [summary, setSummary] = useState({ total_accounts: 0, live: 0, die: 0, total_pages: 0, pages_registered: 0, report_count: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await facebookApi.getRegPageStats(range, q);
      setRows(res.data?.machines || []);
      setSummary(res.data?.summary || { total_accounts: 0, live: 0, die: 0, total_pages: 0, pages_registered: 0, report_count: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rangeLabel = RANGES.find((item) => item.value === range)?.label || 'Tất cả';

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="stat-card" style={{ borderLeftColor: '#06b6d4' }}><div className="stat-icon" style={{ background: 'rgba(6,182,212,.15)', color: '#0891b2' }}>FB</div><div className="stat-info"><div className="stat-value">{fmtNum(summary.total_accounts)}</div><div className="stat-title">Tổng Account</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#10b981' }}><div className="stat-icon" style={{ background: 'rgba(16,185,129,.15)', color: '#059669' }}>OK</div><div className="stat-info"><div className="stat-value">{fmtNum(summary.live)}</div><div className="stat-title">Live</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#ef4444' }}><div className="stat-icon" style={{ background: 'rgba(239,68,68,.15)', color: '#dc2626' }}>Die</div><div className="stat-info"><div className="stat-value">{fmtNum(summary.die)}</div><div className="stat-title">Die</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#0ea5e9' }}><div className="stat-icon" style={{ background: 'rgba(14,165,233,.15)', color: '#0284c7' }}>Pg</div><div className="stat-info"><div className="stat-value">{fmtNum(summary.total_pages)}</div><div className="stat-title">Tổng page hiện có</div></div></div>
        <div className="stat-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="stat-icon" style={{ background: 'rgba(139,92,246,.15)', color: '#7c3aed' }}>+Pg</div><div className="stat-info"><div className="stat-value">{fmtNum(summary.pages_registered)}</div><div className="stat-title">Page reg / {rangeLabel}</div></div></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {RANGES.map((item) => (
          <button key={item.value} type="button" onClick={() => setRange(item.value)} style={{ padding: '.48rem .9rem', borderRadius: 8, border: `1px solid ${range === item.value ? '#06b6d4' : '#cbd5e1'}`, background: range === item.value ? '#06b6d4' : '#fff', color: range === item.value ? '#fff' : '#475569', cursor: 'pointer', fontWeight: 750 }}>
            {item.label}
          </button>
        ))}
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
          <h3>Máy đã reg account và page / {rangeLabel}</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{rows.length} máy {loading ? '- đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>TÊN MÁY</th><th>ACCOUNT</th><th>LIVE</th><th>DIE</th><th>PAGE HIỆN CÓ</th><th>PAGE ĐÃ REG</th><th>LẦN BÁO CÁO</th><th>BÁO CÁO CUỐI</th><th>REG ACC CUỐI</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có thống kê máy reg</td></tr>
              ) : rows.map((row) => (
                <tr key={row.device_id}>
                  <td><strong>{row.device_id || '-'}</strong></td>
                  <td style={{ color: '#7c3aed', fontWeight: 800 }}>{row.total || 0}</td>
                  <td style={{ color: '#10b981', fontWeight: 800 }}>{row.live || 0}</td>
                  <td style={{ color: '#ef4444', fontWeight: 800 }}>{row.die || 0}</td>
                  <td style={{ color: '#0ea5e9', fontWeight: 800 }}>{fmtNum(row.pages)}</td>
                  <td style={{ color: '#8b5cf6', fontWeight: 800 }}>{fmtNum(row.pages_registered)}</td>
                  <td style={{ color: '#475569', fontWeight: 700 }}>{fmtNum(row.report_count)}</td>
                  <td>{fmt(row.last_report_at)}</td>
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
