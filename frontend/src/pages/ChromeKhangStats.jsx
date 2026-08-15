import { useCallback, useEffect, useState } from 'react';
import { accountApi, chromeAccountApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString('vi-VN');

export default function ChromeKhangStats() {
  const [data, setData] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('app');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = deviceId.trim() ? { device_id: deviceId.trim() } : {};
      const api = accountType === 'chrome' ? chromeAccountApi : accountApi;
      const res = await api.getKhangDailyLogs(params);
      setData(res.data || null);
    } catch (err) {
      toast.error(err.message || 'Không tải được thống kê kháng hôm nay');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, accountType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const rows = data?.devices || [];
  const limit = accountType === 'chrome' ? (Number(data?.limit) || 8) : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{"\uD83D\uDCCA Tr\u1ea1ng Th\u00e1i M\u00e1y"}</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            {`Theo d\u00f5i s\u1ed1 acc ${accountType === 'chrome' ? 'Chrome' : 'App'} \u0111\u00e3 b\u00e1o c\u00e1o kh\u00e1ng theo t\u1eebng m\u00e1y trong ng\u00e0y h\u00f4m nay.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setAccountType('app')}
            style={{
              background: accountType === 'app' ? '#10b981' : '#fff',
              border: accountType === 'app' ? 'none' : '1px solid #dbe3ef',
              color: accountType === 'app' ? '#fff' : '#0f172a',
              borderRadius: '8px',
              padding: '.55rem 1rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Account App
          </button>
          <button
            onClick={() => setAccountType('chrome')}
            style={{
              background: accountType === 'chrome' ? '#0ea5e9' : '#fff',
              border: accountType === 'chrome' ? 'none' : '1px solid #dbe3ef',
              color: accountType === 'chrome' ? '#fff' : '#0f172a',
              borderRadius: '8px',
              padding: '.55rem 1rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Chrome Acc
          </button>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{
            background: loading ? '#94a3b8' : '#0ea5e9',
            border: 'none',
            color: '#fff',
            borderRadius: '8px',
            padding: '.55rem 1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
        >
          🔄 Làm mới
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row" style={{ alignItems: 'flex-end' }}>
            <div className="filter-group">
              <label>Tìm tên máy</label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="May1, Reg22..."
                style={{ minWidth: 220 }}
              />
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setDeviceId('')}
              disabled={!deviceId}
            >
              ✕ Xóa lọc
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', padding: '.8rem 1rem', borderBottom: '1px solid #e2e8f0',
          flexWrap: 'wrap',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>🖥️ Máy đã báo cáo kháng hôm nay</h3>
            <div style={{ color: '#64748b', fontSize: '.8rem', marginTop: '.25rem' }}>
              {loading
                ? 'Đang tải dữ liệu...'
                : `${data?.total_devices || 0} máy · ${data?.total_accounts || 0} acc đã báo cáo`}
            </div>
          </div>
          {limit && <div style={{ color: '#64748b', fontSize: '.8rem' }}>Gi\u1edbi h\u1ea1n: {limit} acc/m\u00e1y/ng\u00e0y</div>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Tên máy</th>
                <th>Đã báo cáo</th>
                <th>Đã kháng</th>
                <th>Chưa kháng</th>
                <th>Còn lại</th>
                <th>Báo cáo cuối</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                    {loading ? 'Đang tải...' : 'Chưa có máy nào báo cáo kháng hôm nay'}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const used = Number(row.total) || 0;
                const remain = limit ? Math.max(0, limit - used) : null;
                return (
                  <tr key={row.device_id}>
                    <td style={{ fontWeight: 700 }}>{row.device_id || 'unknown'}</td>
                    <td style={{ color: limit && used >= limit ? '#ef4444' : '#7c3aed', fontWeight: 800 }}>{limit ? `${used}/${limit}` : fmtNum(used)}</td>
                    <td style={{ color: '#10b981', fontWeight: 700 }}>{fmtNum(row.da_khang)}</td>
                    <td style={{ color: '#f97316', fontWeight: 700 }}>{fmtNum(row.chua_khang)}</td>
                    <td style={{ color: remain === 0 ? '#ef4444' : '#0ea5e9', fontWeight: 700 }}>{remain == null ? '\u2014' : remain}</td>
                    <td style={{ color: '#475569', whiteSpace: 'nowrap' }}>{fmt(row.latest_reported_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
