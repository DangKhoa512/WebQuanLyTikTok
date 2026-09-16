import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { facebookApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const fmtNum = (value) => Number(value || 0).toLocaleString('vi-VN');
const naturalCollator = new Intl.Collator('vi-VN', { numeric: true, sensitivity: 'base' });
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
  const [sort, setSort] = useState({ field: 'device_id', direction: 'asc' });
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
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    let result = 0;
    if (sort.field === 'device_id') {
      result = naturalCollator.compare(String(a.device_id || ''), String(b.device_id || ''));
    } else if (['last_report_at', 'last_reg_at'].includes(sort.field)) {
      const aTime = a[sort.field] ? new Date(a[sort.field]).getTime() : null;
      const bTime = b[sort.field] ? new Date(b[sort.field]).getTime() : null;
      if (aTime === null || bTime === null) return aTime === null ? (bTime === null ? 0 : 1) : -1;
      result = aTime - bTime;
    } else {
      result = Number(a[sort.field] || 0) - Number(b[sort.field] || 0);
    }
    return (sort.direction === 'asc' ? result : -result)
      || naturalCollator.compare(String(a.device_id || ''), String(b.device_id || ''));
  }), [rows, sort]);

  const toggleSort = (field) => {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortLabel = (field, label) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      style={{ border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}
    >
      {label}<span aria-hidden="true" style={{ color: sort.field === field ? '#2563eb' : '#94a3b8' }}>{sort.field === field ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Thống kê Facebook Reg</h1>
          <div className="subtitle">Theo dõi account và page từ Facebook Job, cùng số page tăng qua từng lần reg.</div>
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
          <h3>Account và page Facebook Job theo máy / {rangeLabel}</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{rows.length} máy {loading ? '- đang tải...' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>{sortLabel('device_id', 'TÊN MÁY')}</th><th>{sortLabel('total', 'ACCOUNT JOB')}</th><th>{sortLabel('live', 'LIVE')}</th><th>{sortLabel('die', 'DIE')}</th><th>{sortLabel('pages', 'PAGE JOB HIỆN CÓ')}</th><th>{sortLabel('pages_registered', 'PAGE ĐÃ REG')}</th><th>{sortLabel('report_count', 'LẦN BÁO CÁO')}</th><th>{sortLabel('last_report_at', 'BÁO CÁO CUỐI')}</th><th>{sortLabel('last_reg_at', 'ACCOUNT CẬP NHẬT CUỐI')}</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có thống kê máy reg</td></tr>
              ) : sortedRows.map((row) => (
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
