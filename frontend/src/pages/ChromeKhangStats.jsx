import { useCallback, useEffect, useState } from 'react';
import { chromeAccountApi } from '../services/api';
import { toast } from '../components/Toast';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString('vi-VN');

export default function ChromeKhangStats() {
  const [data, setData] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = deviceId.trim() ? { device_id: deviceId.trim() } : {};
      const res = await chromeAccountApi.getKhangDailyLogs(params);
      setData(res.data || null);
    } catch (err) {
      toast.error(err.message || 'Không tải được thống kê kháng hôm nay');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const rows = data?.devices || [];
  const limit = Number(data?.limit) || 8;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📊 Thống kê kháng</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Theo dõi số acc Chrome đã báo cáo kháng theo từng máy trong ngày hôm nay.
          </p>
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
          <div style={{ color: '#64748b', fontSize: '.8rem' }}>Giới hạn: {limit} acc/máy/ngày</div>
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
                const remain = Math.max(0, limit - used);
                return (
                  <tr key={row.device_id}>
                    <td style={{ fontWeight: 700 }}>{row.device_id || 'unknown'}</td>
                    <td style={{ color: used >= limit ? '#ef4444' : '#7c3aed', fontWeight: 800 }}>{used}/{limit}</td>
                    <td style={{ color: '#10b981', fontWeight: 700 }}>{fmtNum(row.da_khang)}</td>
                    <td style={{ color: '#f97316', fontWeight: 700 }}>{fmtNum(row.chua_khang)}</td>
                    <td style={{ color: remain === 0 ? '#ef4444' : '#0ea5e9', fontWeight: 700 }}>{remain}</td>
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
