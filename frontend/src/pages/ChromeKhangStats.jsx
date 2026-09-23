import { useCallback, useEffect, useState } from 'react';
import { accountApi, chromeAccountApi, machineStatusApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtNum = (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN');
const VIEWS = [
  { value: 'app', label: 'Account App', active: '#10b981' },
  { value: 'chrome', label: 'Chrome Acc', active: '#0ea5e9' },
  { value: 'facebook', label: 'Facebook', active: '#1877f2' },
  { value: 'instagram', label: 'Instagram', active: '#db2777' },
];
const RANGES = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

export default function ChromeKhangStats() {
  const [data, setData] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('app');
  const [range, setRange] = useState('today');
  const isPlatform = accountType === 'facebook' || accountType === 'instagram';

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      if (accountType === 'facebook' || accountType === 'instagram') {
        res = await machineStatusApi.getStats({
          platform: accountType,
          range,
          ...(deviceId.trim() ? { device_id: deviceId.trim() } : {}),
        });
      } else {
        const params = deviceId.trim() ? { device_id: deviceId.trim() } : {};
        const sourceApi = accountType === 'chrome' ? chromeAccountApi : accountApi;
        res = await sourceApi.getKhangDailyLogs(params);
      }
      setData(res.data || null);
    } catch (err) {
      toast.error(err.message || 'Không tải được trạng thái máy');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, accountType, range]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const rows = data?.devices || [];
  const limit = accountType === 'chrome' ? (Number(data?.limit) || 8) : null;
  const totals = data?.totals || { acc_live: 0, acc_die: 0, total: 0, report_count: 0 };
  const description = isPlatform
    ? `Tổng hợp số account Live/Die do phone báo cáo cho ${accountType === 'facebook' ? 'Facebook' : 'Instagram'} và cộng dồn theo từng máy.`
    : `Theo dõi số acc ${accountType === 'chrome' ? 'Chrome' : 'App'} đã báo cáo kháng theo từng máy trong ngày hôm nay.`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📊 Trạng Thái Máy</h1>
          <p style={{ color: '#64748b', fontSize: '.85rem', margin: '.25rem 0 0' }}>{description}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
          🔄 {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {VIEWS.map((item) => {
          const active = accountType === item.value;
          return <button key={item.value} type="button" onClick={() => { setAccountType(item.value); setData(null); }} style={{
            background: active ? item.active : '#fff', border: active ? '1px solid transparent' : '1px solid #cbd5e1',
            color: active ? '#fff' : '#0f172a', borderRadius: 8, padding: '.55rem 1rem', cursor: 'pointer',
            fontWeight: 700, fontSize: '.82rem', boxShadow: active ? `0 5px 14px ${item.active}2f` : 'none',
          }}>{item.label}</button>;
        })}
      </div>

      {isPlatform && <>
        <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {RANGES.map((item) => <button key={item.value} type="button" className={range === item.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setRange(item.value)}>{item.label}</button>)}
        </div>
        <div className="stats-grid" style={{ marginBottom: '1rem' }}>
          <div className="stat-card" style={{ borderLeftColor: '#10b981' }}><div className="stat-icon" style={{ background: 'rgba(16,185,129,.13)', color: '#059669' }}>✓</div><div className="stat-info"><div className="stat-value">{fmtNum(totals.acc_live)}</div><div className="stat-title">ACC LIVE</div></div></div>
          <div className="stat-card" style={{ borderLeftColor: '#ef4444' }}><div className="stat-icon" style={{ background: 'rgba(239,68,68,.13)', color: '#dc2626' }}>✕</div><div className="stat-info"><div className="stat-value">{fmtNum(totals.acc_die)}</div><div className="stat-title">ACC DIE</div></div></div>
          <div className="stat-card" style={{ borderLeftColor: '#7c3aed' }}><div className="stat-icon" style={{ background: 'rgba(124,58,237,.12)', color: '#7c3aed' }}>Σ</div><div className="stat-info"><div className="stat-value">{fmtNum(totals.total)}</div><div className="stat-title">TỔNG BÁO CÁO</div></div></div>
        </div>
      </>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row" style={{ alignItems: 'flex-end' }}>
            <div className="filter-group"><label>Tìm tên máy</label><input type="text" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="May1, Reg22..." style={{ minWidth: 220 }} /></div>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeviceId('')} disabled={!deviceId}>✕ Xóa lọc</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '.8rem 1rem', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>🖥️ {isPlatform ? `${accountType === 'facebook' ? 'Facebook' : 'Instagram'} theo máy` : 'Máy đã báo cáo kháng hôm nay'}</h3>
            <div style={{ color: '#64748b', fontSize: '.8rem', marginTop: '.25rem' }}>{loading ? 'Đang tải dữ liệu...' : `${data?.total_devices || 0} máy · ${isPlatform ? fmtNum(totals.total) : data?.total_accounts || 0} acc đã báo cáo`}</div>
          </div>
          {limit && <div style={{ color: '#64748b', fontSize: '.8rem' }}>Giới hạn: {limit} acc/máy/ngày</div>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          {isPlatform ? <table className="table" style={{ margin: 0 }}>
            <thead><tr><th>Tên máy</th><th>Acc Live</th><th>Acc Die</th><th>Tổng</th><th>Lần báo cáo</th><th>Báo cáo cuối</th></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>{loading ? 'Đang tải...' : 'Chưa có máy gửi báo cáo trong khoảng này'}</td></tr>}
              {rows.map((row) => <tr key={row.device_id}><td style={{ fontWeight: 800 }}>{row.device_id}</td><td style={{ color: '#059669', fontWeight: 800 }}>{fmtNum(row.acc_live)}</td><td style={{ color: '#dc2626', fontWeight: 800 }}>{fmtNum(row.acc_die)}</td><td style={{ color: '#7c3aed', fontWeight: 800 }}>{fmtNum(row.total)}</td><td style={{ color: '#2563eb', fontWeight: 700 }}>{fmtNum(row.report_count)}</td><td style={{ color: '#475569', whiteSpace: 'nowrap' }}>{fmt(row.last_reported_at)}</td></tr>)}
            </tbody>
          </table> : <table className="table" style={{ margin: 0 }}>
            <thead><tr><th>Tên máy</th><th>Đã báo cáo</th><th>Đã kháng</th><th>Chưa kháng</th><th>Còn lại</th><th>Báo cáo cuối</th></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>{loading ? 'Đang tải...' : 'Chưa có máy nào báo cáo kháng hôm nay'}</td></tr>}
              {rows.map((row) => { const used = Number(row.total) || 0; const remain = limit ? Math.max(0, limit - used) : null; return <tr key={row.device_id}><td style={{ fontWeight: 700 }}>{row.device_id || 'unknown'}</td><td style={{ color: limit && used >= limit ? '#ef4444' : '#7c3aed', fontWeight: 800 }}>{limit ? `${used}/${limit}` : fmtNum(used)}</td><td style={{ color: '#10b981', fontWeight: 700 }}>{fmtNum(row.da_khang)}</td><td style={{ color: '#f97316', fontWeight: 700 }}>{fmtNum(row.chua_khang)}</td><td style={{ color: remain === 0 ? '#ef4444' : '#0ea5e9', fontWeight: 700 }}>{remain == null ? '—' : remain}</td><td style={{ color: '#475569', whiteSpace: 'nowrap' }}>{fmt(row.latest_reported_at)}</td></tr>; })}
            </tbody>
          </table>}
        </div>
      </div>
    </div>
  );
}