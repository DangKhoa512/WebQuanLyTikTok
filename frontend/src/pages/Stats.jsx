import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer,
} from 'recharts';
import { statsApi } from '../services/api';

const DAYS_OPTIONS = [7, 14, 30];

const PIE_COLORS = {
  REG_DA_LAM:   '#f59e0b',
  CHO_UPVIDEO:  '#06b6d4',
  UPVIDEO:      '#10b981',
  UPVIDEO_FAIL: '#ef4444',
  DAT_CHI_TIEU: '#8b5cf6',
  DIE:          '#6b7280',
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' })
    : d;

export default function Stats() {
  const [days,       setDays]       = useState(7);
  const [stats,      setStats]      = useState(null);
  const [daily,      setDaily]      = useState(null);
  const [deviceStats,setDeviceStats]= useState([]);
  const [deviceSearch,setDeviceSearch]= useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, dailyRes, deviceRes] = await Promise.all([
        statsApi.getStats(),
        statsApi.getDailyStats(days),
        statsApi.getDeviceStats(),
      ]);
      setStats(statsRes.data);
      setDaily(dailyRes.data);
      setDeviceStats(deviceRes.data?.devices || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build merged daily chart data
  const buildDailyData = () => {
    if (!daily) return [];
    const map = {};

    (daily.daily_reg || []).forEach(({ date, reg_count }) => {
      map[date] = { date: fmtDate(date), reg: parseInt(reg_count) || 0, upload: 0 };
    });
    (daily.daily_upload || []).forEach(({ date, upload_count }) => {
      const d = fmtDate(date);
      if (map[date]) {
        map[date].upload = parseInt(upload_count) || 0;
      } else {
        map[date] = { date: d, reg: 0, upload: parseInt(upload_count) || 0 };
      }
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  };

  const buildPieData = () => {
    if (!stats) return [];
    return [
      { name: 'REG_DA_LAM',   value: stats.REG_DA_LAM   || 0 },
      { name: 'UPVIDEO',      value: stats.UPVIDEO      || 0 },
      { name: 'UPVIDEO_FAIL', value: stats.UPVIDEO_FAIL || 0 },
      { name: 'DAT_CHI_TIEU', value: stats.DAT_CHI_TIEU || 0 },
      { name: 'DIE',          value: stats.DIE           || 0 },
    ].filter((d) => d.value > 0);
  };

  const dailyData = buildDailyData();
  const pieData   = buildPieData();
  const filteredDevices = deviceStats.filter((device) =>
    device.device_id.toLowerCase().includes(deviceSearch.trim().toLowerCase())
  );
  const deviceTotals = deviceStats.reduce((acc, device) => ({
    machines: acc.machines + 1,
    total: acc.total + (device.total || 0),
    today_updated: acc.today_updated + (device.today_updated || 0),
    live: acc.live + (device.live || 0),
  }), { machines: 0, total: 0, today_updated: 0, live: 0 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📈 Thống kê chi tiết</h1>
          <div className="subtitle">Tổng quan hoạt động hệ thống</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '.4rem .85rem',
                borderRadius: 8,
                border: `1px solid ${days === d ? '#3b82f6' : '#e2e8f0'}`,
                background: days === d ? '#3b82f6' : '#fff',
                color: days === d ? '#fff' : '#475569',
                cursor: 'pointer',
                fontSize: '.82rem',
                fontWeight: 600,
                transition: 'all .15s',
              }}
            >
              {d} ngày
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>🔄</button>
        </div>
      </div>

      {error && <div className="error-bar">⚠️ {error}</div>}

      {loading ? (
        <div className="loading-wrap">
          <div className="spinner" /> Đang tải thống kê…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {stats && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              {[
                { key: 'total',        label: 'Tổng',       color: '#3b82f6' },
                { key: 'REG_DA_LAM',   label: 'REG_DA_LAM', color: '#f59e0b' },
                { key: 'UPVIDEO',      label: 'UPVIDEO',    color: '#10b981' },
                { key: 'UPVIDEO_FAIL', label: 'FAIL',       color: '#ef4444' },
                { key: 'DAT_CHI_TIEU', label: 'ĐẠT CT',     color: '#8b5cf6' },
                { key: 'DIE',          label: 'DIE',         color: '#6b7280' },
                { key: 'today_reg',    label: 'Reg hôm nay',color: '#3b82f6' },
                { key: 'today_upload', label: 'Up hôm nay', color: '#10b981' },
                { key: 'today_fail',   label: 'Fail hôm nay',color: '#ef4444'},
              ].map(({ key, label, color }) => (
                <div
                  key={key}
                  style={{
                    background: '#fff',
                    borderRadius: 10,
                    padding: '1rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,.1)',
                    borderLeft: `4px solid ${color}`,
                  }}
                >
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
                    {(stats[key] || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600, marginTop: '.2rem' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Device progress */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-header">
              <div>
                <h3>🖥️ Tiến độ theo máy</h3>
                <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: '.2rem' }}>
                  {deviceTotals.machines.toLocaleString()} máy · {deviceTotals.total.toLocaleString()} account · {deviceTotals.today_updated.toLocaleString()} cập nhật hôm nay · {deviceTotals.live.toLocaleString()} live
                </div>
              </div>
              <input
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Tìm tên máy..."
                style={{
                  width: 240,
                  maxWidth: '100%',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '.45rem .75rem',
                  fontSize: '.85rem',
                }}
              />
            </div>
            <div className="table-container" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>Máy</th>
                    <th>Tổng</th>
                    <th>App</th>
                    <th>Chrome</th>
                    <th>Hôm nay</th>
                    <th>Live</th>
                    <th>Chờ/Login</th>
                    <th>Đủ ĐK</th>
                    <th>Die</th>
                    <th>Hoạt động cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.length === 0 ? (
                    <tr><td colSpan="10" className="empty-cell">Chưa có dữ liệu theo máy</td></tr>
                  ) : filteredDevices.map((device) => {
                    const appTotal = device.tasks?.app?.total || 0;
                    const chromeTotal = device.tasks?.chrome?.total || 0;
                    const active = (device.ACC_LOGIN || 0) + (device.LOGIN_THANH_CONG || 0);
                    return (
                      <tr key={device.device_id}>
                        <td>
                          <strong style={{ fontSize: '.85rem' }}>{device.device_id}</strong>
                          <div style={{ color: '#64748b', fontSize: '.72rem', marginTop: 2 }}>
                            App {appTotal.toLocaleString()} · Chrome {chromeTotal.toLocaleString()}
                          </div>
                        </td>
                        <td><strong>{(device.total || 0).toLocaleString()}</strong></td>
                        <td style={{ color: '#2563eb', fontWeight: 700 }}>{appTotal.toLocaleString()}</td>
                        <td style={{ color: '#7c3aed', fontWeight: 700 }}>{chromeTotal.toLocaleString()}</td>
                        <td style={{ color: '#0f766e', fontWeight: 700 }}>{(device.today_updated || 0).toLocaleString()}</td>
                        <td style={{ color: '#16a34a', fontWeight: 700 }}>{(device.live || 0).toLocaleString()}</td>
                        <td>{active.toLocaleString()}</td>
                        <td style={{ color: '#8b5cf6', fontWeight: 700 }}>{(device.ACC_DU_DK || 0).toLocaleString()}</td>
                        <td style={{ color: '#dc2626', fontWeight: 700 }}>{(device.ACC_DIE || 0).toLocaleString()}</td>
                        <td style={{ color: '#64748b', fontSize: '.75rem', whiteSpace: 'nowrap' }}>
                          {device.last_seen ? new Date(device.last_seen).toLocaleString('vi-VN', { hour12: false }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts grid */}
          <div className="charts-grid">
            {/* Bar chart: Reg & Upload per day */}
            <div className="chart-card">
              <div className="chart-title">📅 Reg & Upload theo ngày ({days} ngày)</div>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="reg"    name="Đăng ký"  fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="upload" name="Upload"   fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-icon">📊</div>
                  <p>Chưa có dữ liệu</p>
                </div>
              )}
            </div>

            {/* Pie chart: Status distribution */}
            <div className="chart-card">
              <div className="chart-title">🍰 Phân bố trạng thái</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name.replace('_', ' ')}: ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [val.toLocaleString(), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-icon">🍕</div>
                  <p>Chưa có dữ liệu</p>
                </div>
              )}
            </div>
          </div>

          {/* Line chart: trend */}
          {dailyData.length > 0 && (
            <div className="chart-card">
              <div className="chart-title">📉 Xu hướng đăng ký ({days} ngày gần nhất)</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="reg"
                    name="Đăng ký"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="upload"
                    name="Upload"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Status distribution table */}
          {daily?.status_dist && (
            <div className="card">
              <div className="card-header">
                <h3>📋 Chi tiết phân bố</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Số lượng</th>
                      <th>Tỷ lệ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.status_dist.map((row) => {
                      const total = stats?.total || 1;
                      const pct = ((row.cnt / total) * 100).toFixed(1);
                      return (
                        <tr key={row.status}>
                          <td>
                            <span
                              className="badge"
                              style={{ background: PIE_COLORS[row.status] || '#94a3b8' }}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td><strong>{parseInt(row.cnt).toLocaleString()}</strong></td>
                          <td>{pct}%</td>
                          <td style={{ width: '40%' }}>
                            <div
                              style={{
                                height: 8,
                                background: '#f1f5f9',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: PIE_COLORS[row.status] || '#94a3b8',
                                  borderRadius: 4,
                                  transition: 'width .5s',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
