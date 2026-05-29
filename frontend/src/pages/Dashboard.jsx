import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { statsApi, accountApi, chromeAccountApi } from '../services/api';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '-';

const STATUS_CARDS = [
  { key: 'ACC_LOGIN', label: 'Chờ login', color: '#f59e0b', icon: '📝' },
  { key: 'LOGIN_THANH_CONG', label: 'Login xong', color: '#10b981', icon: '✅' },
  { key: 'ACC_DA_KHANG', label: 'Đã kháng', color: '#0ea5e9', icon: '🛡️' },
  { key: 'ACC_CHUA_KHANG', label: 'Chưa kháng', color: '#f97316', icon: '⚠️' },
  { key: 'ACC_DU_DK', label: 'Đủ điều kiện', color: '#8b5cf6', icon: '🎯' },
  { key: 'ACC_DIE', label: 'Die', color: '#6b7280', icon: '☠️' },
];

const TASKS = [
  {
    key: 'app',
    title: 'Accounts App',
    description: 'Bảng accounts',
    path: '/accounts',
    accent: '#10b981',
  },
  {
    key: 'chrome',
    title: 'Task Chrome',
    description: 'Bang chrome_accounts',
    path: '/chrome-accounts',
    accent: '#3b82f6',
  },
];

function LiveSummary({ data }) {
  const total = data?.total || 0;
  const items = [
    { key: 'live', label: 'Live', color: '#16a34a' },
    { key: 'die_live', label: 'Die', color: '#dc2626' },
    { key: 'unknown_live', label: 'Unknown', color: '#64748b' },
  ];

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
      {items.map(({ key, label, color }) => {
        const value = data?.[key] || 0;
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
            <span style={{ color: '#475569' }}>{label}</span>
            <strong style={{ color }}>{value}</strong>
            <span style={{ color: '#94a3b8' }}>({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusDistribution({ data }) {
  const total = data?.total || 0;
  if (!total) return null;

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="card-header">
        <h3>Phân bổ trạng thái</h3>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
          {STATUS_CARDS.map(({ key, color }) => {
            const pct = ((data[key] || 0) / total) * 100;
            return pct > 0 ? (
              <div
                key={key}
                style={{ background: color, width: `${pct}%`, transition: 'width .5s' }}
                title={`${key}: ${data[key]} (${pct.toFixed(1)}%)`}
              />
            ) : null;
          })}
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
          {STATUS_CARDS.map(({ key, color, label }) => {
            const value = data[key] || 0;
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ color: '#475569' }}>{label}</span>
                <strong>{value}</strong>
                <span style={{ color: '#94a3b8' }}>({pct}%)</span>
              </div>
            );
          })}
        </div>
        <LiveSummary data={data} />
      </div>
    </div>
  );
}

function TaskSection({ task, data }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '.8rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{task.title}</h2>
          <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.15rem' }}>
            {task.description}
          </div>
        </div>
        <Link to={task.path} className="btn btn-secondary btn-sm">Mở danh sách</Link>
      </div>

      <div className="stats-grid">
        <StatCard title="Tổng account" value={data?.total || 0} color={task.accent} icon="📊" />
        {STATUS_CARDS.map(({ key, label, color, icon }) => (
          <StatCard key={key} title={label} value={data?.[key] || 0} color={color} icon={icon} />
        ))}
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <StatCard title="Reg hôm nay" value={data?.today_reg || 0} color="#3b82f6" icon="🆕" />
        <StatCard title="Cập nhật hôm nay" value={data?.today_updated || 0} color="#10b981" icon="↻" />
        <StatCard title="Live" value={data?.live || 0} color="#16a34a" icon="●" />
      </div>

      <StatusDistribution data={data} />
    </section>
  );
}

function TaskSwitcher({ activeKey, onChange, stats }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', margin: '1rem 0 1.25rem' }}>
      {TASKS.map((task) => {
        const active = task.key === activeKey;
        const count = stats?.tasks?.[task.key]?.total || 0;
        return (
          <button
            key={task.key}
            type="button"
            onClick={() => onChange(task.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.55rem',
              border: active ? `1px solid ${task.accent}` : '1px solid #cbd5e1',
              background: active ? task.accent : '#ffffff',
              color: active ? '#ffffff' : '#0f172a',
              borderRadius: 8,
              padding: '.55rem .85rem',
              fontSize: '.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: active ? `0 6px 16px ${task.accent}33` : '0 1px 2px rgba(15,23,42,.06)',
            }}
          >
            <span>{task.title.replace('Task ', 'Acc ')}</span>
            <span
              style={{
                minWidth: 24,
                height: 22,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                background: active ? 'rgba(255,255,255,.22)' : '#e2e8f0',
                color: active ? '#ffffff' : '#334155',
                padding: '0 .45rem',
                fontSize: '.78rem',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RecentTable({ title, rows, path, emptyText }) {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
        <Link to={path} className="btn btn-secondary btn-sm">Xem tất cả</Link>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Device</th>
              <th>Status</th>
              <th>Live</th>
              <th>Videos</th>
              <th>Followers</th>
              <th>Following</th>
              <th>Reg At</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    <p>{emptyText}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((acc) => (
                <tr key={acc.id} onClick={() => navigate(`${path}/${acc.id}`)}>
                  <td className="td-mono">{acc.id}</td>
                  <td><strong>{acc.username || <span className="text-muted">N/A</span>}</strong></td>
                  <td className="td-mono">{acc.device_id || '-'}</td>
                  <td><StatusBadge status={acc.status} /></td>
                  <td><StatusBadge status={acc.live_status} /></td>
                  <td><strong style={{ color: '#047857' }}>{acc.video_count ?? 0}</strong></td>
                  <td><strong style={{ color: '#2563eb' }}>{acc.followers ?? '-'}</strong></td>
                  <td><strong style={{ color: '#7c3aed' }}>{acc.following ?? '-'}</strong></td>
                  <td className="text-muted text-sm">{fmt(acc.reg_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentApp, setRecentApp] = useState([]);
  const [recentChrome, setRecentChrome] = useState([]);
  const [activeTask, setActiveTask] = useState('app');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, appRes, chromeRes] = await Promise.all([
        statsApi.getStats(),
        accountApi.getAll({ limit: 6, page: 1 }),
        chromeAccountApi.getAll({ limit: 6, page: 1 }),
      ]);
      setStats(statsRes.data);
      setRecentApp(appRes.data?.accounts || []);
      setRecentChrome(chromeRes.data?.accounts || []);
      setError(null);
      setLastSync(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        Đang tải Dashboard...
      </div>
    );
  }

  const appStats = stats?.tasks?.app || {};
  const chromeStats = stats?.tasks?.chrome || {};
  const currentTask = TASKS.find((task) => task.key === activeTask) || TASKS[0];
  const currentStats = activeTask === 'chrome' ? chromeStats : appStats;
  const currentRows = activeTask === 'chrome' ? recentChrome : recentApp;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          {lastSync && (
            <div className="subtitle">
              Cập nhật lúc {lastSync.toLocaleTimeString('vi-VN')} - tự refresh mỗi 30 giây
            </div>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchAll}>
          Làm mới
        </button>
      </div>

      {error && <div className="error-bar">Lỗi: {error}</div>}

      <TaskSwitcher activeKey={activeTask} onChange={setActiveTask} stats={stats} />

      <TaskSection task={currentTask} data={currentStats} />

      <RecentTable
        title={activeTask === 'chrome' ? 'Account Chrome mới nhất' : 'Accounts App mới nhất'}
        rows={currentRows}
        path={currentTask.path}
        emptyText={activeTask === 'chrome' ? 'Chưa có account Chrome nào' : 'Chưa có Accounts App nào'}
      />
    </div>
  );
}
