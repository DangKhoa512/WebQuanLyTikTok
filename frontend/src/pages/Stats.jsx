import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { statsApi } from '../services/api';

const RANGE_OPTIONS = [
  { label: 'Hôm nay', value: 'today', days: 1 },
  { label: '7 ngày', value: 7, days: 7 },
  { label: '30 ngày', value: 30, days: 30 },
  { label: '90 ngày', value: 90, days: 90 },
];

const fmtNum = (value) => Number(value || 0).toLocaleString('vi-VN');
const fmtXu = (value) => `${fmtNum(value)} xu`;
const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : value;
const fmtDateTime = (value) =>
  value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const piePercent = (value, total) => `${total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'}%`;
const naturalCollator = new Intl.Collator('vi-VN', { numeric: true, sensitivity: 'base' });

function SummaryCard({ title, value, color, icon, suffix = '' }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      padding: '1rem 1.1rem',
      boxShadow: '0 1px 3px rgba(15,23,42,.12)',
      borderLeft: `4px solid ${color}`,
      minHeight: 96,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: `${color}22`,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          flex: '0 0 38px',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '1.45rem', fontWeight: 850, color: '#0f172a', lineHeight: 1 }}>
            {fmtNum(value)}{suffix}
          </div>
          <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700, marginTop: '.3rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {title}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Stats() {
  const [range, setRange] = useState('today');
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceSort, setDeviceSort] = useState({ field: 'device_id', dir: 'asc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const selectedRange = RANGE_OPTIONS.find((item) => item.value === range) || RANGE_OPTIONS[2];
    try {
      const [statsRes, dailyRes, deviceRes] = await Promise.all([
        statsApi.getJobStats(),
        statsApi.getJobDailyStats(selectedRange.days),
        statsApi.getJobDeviceStats(),
      ]);
      setStats(statsRes.data || {});
      setDaily(dailyRes.data || {});
      setDevices(deviceRes.data?.devices || []);
    } catch (err) {
      setError(err.message || 'Không tải được thống kê JOB');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dailyData = useMemo(() => (
    (daily?.daily_job || []).map((row) => ({
      date: fmtDate(row.date),
      rawDate: row.date,
      xu: Number(row.total_xu || 0),
      jobs: Number(row.total_jobs || 0),
      done: Number(row.done_accounts || 0),
      fail: Number(row.failed_accounts || 0),
      config: Number(row.config_error_accounts || 0),
      working: Number(row.working_accounts || 0),
      total: Number(row.completed_accounts || 0),
    }))
  ), [daily]);

  const monthlyData = useMemo(() => (
    (daily?.monthly_job || []).map((row) => ({
      month: row.month,
      xu: Number(row.total_xu || 0),
      total: Number(row.completed_accounts || 0),
    }))
  ), [daily]);

  const statusPieData = useMemo(() => {
    const totals = dailyData.reduce((acc, row) => ({
      active: acc.active + row.done + row.working,
      under50: acc.under50 + row.fail,
      config: acc.config + row.config,
    }), { active: 0, under50: 0, config: 0 });
    return [
      { key: 'active', name: 'Chạy xong + đang chạy', value: totals.active, color: '#10b981' },
      { key: 'under50', name: 'Dưới 50 job', value: totals.under50, color: '#ef4444' },
      { key: 'config', name: 'Cấu hình fail', value: totals.config, color: '#f97316' },
    ].filter((item) => item.value > 0);
  }, [dailyData]);
  const statusPieTotal = statusPieData.reduce((sum, item) => sum + item.value, 0);

  const isTodayRange = range === 'today';
  const activeRange = RANGE_OPTIONS.find((item) => item.value === range) || RANGE_OPTIONS[2];

  const deviceValue = useCallback((device, field) => {
    const todayMap = {
      device_id: device.device_id || '',
      account_count: device.today_accounts,
      failed: device.today_failed_accounts,
      config: device.today_config_error_accounts,
      working_or_done: device.today_working_accounts,
      done_or_today_xu: device.today_done_accounts,
      jobs_or_month_xu: device.today_jobs,
      xu: device.today_xu,
      last_seen: device.last_seen,
    };
    const allMap = {
      device_id: device.device_id || '',
      account_count: device.login_success,
      failed: device.failed_accounts,
      config: device.config_error_accounts,
      working_or_done: device.done_accounts,
      done_or_today_xu: device.today_xu,
      jobs_or_month_xu: device.month_xu,
      xu: device.total_xu,
      last_seen: device.last_seen,
    };
    return (isTodayRange ? todayMap : allMap)[field];
  }, [isTodayRange]);

  const filteredDevices = useMemo(() => {
    const search = deviceSearch.trim().toLowerCase();
    return [...devices]
      .filter((device) => String(device.device_id || '').toLowerCase().includes(search))
      .sort((a, b) => {
        const aValue = deviceValue(a, deviceSort.field);
        const bValue = deviceValue(b, deviceSort.field);
        let result;
        if (deviceSort.field === 'device_id') {
          result = naturalCollator.compare(String(aValue || ''), String(bValue || ''));
        } else if (deviceSort.field === 'last_seen') {
          result = new Date(aValue || 0) - new Date(bValue || 0);
        } else {
          result = Number(aValue || 0) - Number(bValue || 0);
        }
        return deviceSort.dir === 'asc' ? result : -result;
      });
  }, [devices, deviceSearch, deviceSort, deviceValue]);

  const setDeviceSortField = (field) => {
    setDeviceSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortTh = ({ field, children }) => (
    <th
      onClick={() => setDeviceSortField(field)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title="Bấm để sắp xếp"
    >
      {children} {deviceSort.field === field ? (deviceSort.dir === 'asc' ? '↑' : '↓') : '↕'}
    </th>
  );

  const deviceTotals = devices.reduce((acc, device) => ({
    machines: acc.machines + 1,
    login_success: acc.login_success + Number(device.login_success || 0),
    failed_accounts: acc.failed_accounts + Number(device.failed_accounts || 0),
    config_error_accounts: acc.config_error_accounts + Number(device.config_error_accounts || 0),
    total_xu: acc.total_xu + Number((isTodayRange ? device.today_xu : device.total_xu) || 0),
    today_xu: acc.today_xu + Number(device.today_xu || 0),
    month_xu: acc.month_xu + Number(device.month_xu || 0),
    today_accounts: acc.today_accounts + Number(device.today_accounts || 0),
    today_working_accounts: acc.today_working_accounts + Number(device.today_working_accounts || 0),
    today_failed_accounts: acc.today_failed_accounts + Number(device.today_failed_accounts || 0),
    today_config_error_accounts: acc.today_config_error_accounts + Number(device.today_config_error_accounts || 0),
    today_done_accounts: acc.today_done_accounts + Number(device.today_done_accounts || 0),
  }), {
    machines: 0,
    login_success: 0,
    failed_accounts: 0,
    config_error_accounts: 0,
    total_xu: 0,
    today_xu: 0,
    month_xu: 0,
    today_accounts: 0,
    today_working_accounts: 0,
    today_failed_accounts: 0,
    today_config_error_accounts: 0,
    today_done_accounts: 0,
  });
  const summaryFailed = isTodayRange ? deviceTotals.today_failed_accounts : stats?.failed;
  const summaryConfigError = isTodayRange ? deviceTotals.today_config_error_accounts : stats?.config_error;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📊 Thống kê JOB</h1>
          <div className="subtitle">Theo dõi account chạy job, lỗi và tổng xu theo máy/ngày/tháng.</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              style={{
                padding: '.42rem .85rem',
                borderRadius: 8,
                border: `1px solid ${range === option.value ? '#06b6d4' : '#e2e8f0'}`,
                background: range === option.value ? '#06b6d4' : '#fff',
                color: range === option.value ? '#fff' : '#475569',
                cursor: 'pointer',
                fontSize: '.82rem',
                fontWeight: 700,
              }}
            >
              {option.label}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>🔄 Làm mới</button>
        </div>
      </div>

      {error && <div className="error-bar">⚠️ {error}</div>}

      {loading ? (
        <div className="loading-wrap">
          <div className="spinner" /> Đang tải thống kê JOB...
        </div>
      ) : (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            <SummaryCard title="Acc còn lại" value={stats?.ACCOUNT_CHAY} color="#06b6d4" icon="🚀" />
            <SummaryCard
              title={isTodayRange ? 'Acc đang làm' : 'Acc đã lấy ra'}
              value={isTodayRange ? stats?.DANG_LAM : deviceTotals.login_success}
              color="#10b981"
              icon="⚡"
            />
            {isTodayRange && <SummaryCard title="Tổng acc hôm nay" value={deviceTotals.today_accounts} color="#2563eb" icon="✅" />}
            <SummaryCard title="Account fail" value={summaryFailed} color="#ef4444" icon="❌" />
            <SummaryCard title="Cấu hình lỗi" value={summaryConfigError} color="#f97316" icon="⚠️" />
            <SummaryCard title="Xu hôm nay" value={stats?.today_xu} color="#0ea5e9" icon="💎" />
            <SummaryCard title="Xu tháng này" value={stats?.month_xu} color="#8b5cf6" icon="🏆" />
            {!isTodayRange && <SummaryCard title="Tổng xu" value={stats?.total_xu} color="#14b8a6" icon="💰" />}
          </div>

          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-header">
              <div>
                <h3>🖥️ {isTodayRange ? 'Thống kê theo máy hôm nay' : 'Thống kê theo máy'}</h3>
                <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: '.2rem' }}>
                  {isTodayRange
                    ? `${fmtNum(deviceTotals.machines)} máy · ${fmtNum(deviceTotals.today_accounts)} acc đã chạy hôm nay · ${fmtNum(deviceTotals.today_working_accounts)} acc đang chạy · ${fmtNum(deviceTotals.today_failed_accounts)} acc fail · ${fmtXu(deviceTotals.today_xu)}`
                    : `${fmtNum(deviceTotals.machines)} máy · ${fmtNum(deviceTotals.login_success)} acc login thành công · ${fmtNum(deviceTotals.failed_accounts)} acc fail · ${fmtXu(deviceTotals.total_xu)}`}
                </div>
              </div>
              <input
                value={deviceSearch}
                onChange={(event) => setDeviceSearch(event.target.value)}
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
            <div className="table-container" style={{ maxHeight: 540, overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <SortTh field="device_id">Tên máy</SortTh>
                    <SortTh field="account_count">{isTodayRange ? 'Acc đã chạy hôm nay' : 'Acc login thành công'}</SortTh>
                    <SortTh field="failed">Acc fail</SortTh>
                    <SortTh field="config">Cấu hình lỗi</SortTh>
                    <SortTh field="working_or_done">{isTodayRange ? 'Đang chạy' : 'Đã chạy xong'}</SortTh>
                    <SortTh field="done_or_today_xu">{isTodayRange ? 'Đã chạy xong' : 'Xu hôm nay'}</SortTh>
                    <SortTh field="jobs_or_month_xu">{isTodayRange ? 'Job hôm nay' : 'Xu tháng'}</SortTh>
                    <SortTh field="xu">{isTodayRange ? 'Xu hôm nay' : 'Tổng xu'}</SortTh>
                    <SortTh field="last_seen">Hoạt động cuối</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.length === 0 ? (
                    <tr><td colSpan="9" className="empty-cell">Chưa có dữ liệu JOB theo máy</td></tr>
                  ) : filteredDevices.map((device) => (
                    <tr key={device.device_id}>
                      <td>
                        <strong style={{ fontSize: '.86rem' }}>{device.device_id}</strong>
                        <div style={{ color: '#94a3b8', fontSize: '.7rem', marginTop: 2 }}>
                          {isTodayRange ? `Đã chạy hôm nay: ${fmtNum(device.today_accounts)}` : `Tổng acc: ${fmtNum(device.total_accounts)}`}
                        </div>
                      </td>
                      <td style={{ color: '#059669', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_accounts : device.login_success)}</td>
                      <td style={{ color: '#dc2626', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_failed_accounts : device.failed_accounts)}</td>
                      <td style={{ color: '#ea580c', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_config_error_accounts : device.config_error_accounts)}</td>
                      <td style={{ color: '#8b5cf6', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_working_accounts : device.done_accounts)}</td>
                      <td style={{ color: '#2563eb', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_done_accounts : device.today_xu)}</td>
                      <td style={{ color: '#7c3aed', fontWeight: 800 }}>{fmtNum(isTodayRange ? device.today_jobs : device.month_xu)}</td>
                      <td style={{ color: '#0f766e', fontWeight: 900 }}>{fmtXu(isTodayRange ? device.today_xu : device.total_xu)}</td>
                      <td style={{ color: '#64748b', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmtDateTime(device.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">💎 Tổng xu theo ngày ({activeRange.label})</div>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(value, name) => [fmtNum(value), name === 'xu' ? 'Tổng xu' : name]} />
                    <Legend />
                    <Bar dataKey="xu" name="Tổng xu" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}><p>Chưa có dữ liệu xu theo ngày</p></div>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-title">📆 Tổng xu theo tháng</div>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthlyData} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(value, name) => [fmtNum(value), name === 'xu' ? 'Tổng xu' : name]} />
                    <Legend />
                    <Line type="monotone" dataKey="xu" name="Tổng xu" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}><p>Chưa có dữ liệu xu theo tháng</p></div>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">📊 Kết quả account theo ngày</div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="working" name="Đang làm" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="done" name="Đã chạy xong" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="fail" name="Fail/Die" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="config" name="Cấu hình lỗi" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}><p>Chưa có dữ liệu kết quả theo ngày</p></div>
            )}
          </div>

          <div className="chart-card">
            <div className="chart-title">🎯 Tỷ lệ kết quả theo ngày ({activeRange.label})</div>
            {statusPieData.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(220px, .8fr)', gap: '1rem', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={105}
                      paddingAngle={3}
                      label={({ value }) => piePercent(value, statusPieTotal)}
                    >
                      {statusPieData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${fmtNum(value)} acc (${piePercent(value, statusPieTotal)})`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'grid', gap: '.65rem' }}>
                  {statusPieData.map((item) => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', border: '1px solid #e2e8f0', borderRadius: 8, padding: '.65rem .8rem', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                        <span style={{ fontWeight: 800, color: '#334155', fontSize: '.82rem' }}>{item.name}</span>
                      </div>
                      <strong style={{ color: item.color, whiteSpace: 'nowrap' }}>{fmtNum(item.value)} · {piePercent(item.value, statusPieTotal)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}><p>Chưa có dữ liệu tỷ lệ kết quả</p></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
