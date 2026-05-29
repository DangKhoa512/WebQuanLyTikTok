import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { statsApi } from '../services/api';
import { authService } from '../services/authService';

const NAV = [
  { to: '/dashboard',       icon: '📊', label: 'Dashboard'  },
  { to: '/accounts',        icon: '👥', label: 'Acc App' },
  { to: '/chrome-accounts', icon: '🖥️', label: 'Chrome Acc' },
  { to: '/stats',           icon: '📈', label: 'Thống kê'   },
  { to: '/export',          icon: '📥', label: 'Xuất file'  },
  { to: '/proxy-settings',  icon: '⚙️', label: 'Proxy'      },
  { to: '/users',           icon: 'User', label: 'Users', adminOnly: true },
];

export default function Layout() {
  const navigate    = useNavigate();
  const [liveStats, setLiveStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await statsApi.getStats();
      setLiveStats(res.data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const handleLogout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>🎵 TikTok Manager</h2>
          <small>Account Management System</small>
        </div>

        <nav className="sidebar-nav">
          {NAV.filter((item) => !item.adminOnly || authService.getRole() === 'admin').map(({ to, icon, label }) => (
            <NavLink key={to} to={to}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Live mini-stats */}
        {liveStats && (
          <div className="sidebar-footer">
            <div className="sidebar-live-stats">
              <div className="sl-row">
                <span className="sl-label">Tổng</span>
                <span className="sl-val">{liveStats.total}</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Chờ UP</span>
                <span className="sl-val" style={{ background: 'rgba(6,182,212,.2)', color: '#67e8f9' }}>
                  {liveStats.ACC_LOGIN}
                </span>
              </div>
              <div className="sl-row">
                <span className="sl-label">UP Thành Công</span>
                <span className="sl-val" style={{ background: 'rgba(16,185,129,.25)', color: '#6ee7b7' }}>
                  {liveStats.LOGIN_THANH_CONG}
                </span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Đủ ĐK</span>
                <span className="sl-val" style={{ background: 'rgba(139,92,246,.25)', color: '#c4b5fd' }}>
                  {liveStats.ACC_DU_DK}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* User info + Logout */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid rgba(255,255,255,.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>
            👤 {authService.getUsername()}
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            style={{
              background: 'rgba(239,68,68,.15)',
              border: '1px solid rgba(239,68,68,.3)',
              color: '#fca5a5',
              borderRadius: '6px',
              padding: '.3rem .6rem',
              cursor: 'pointer',
              fontSize: '.75rem',
              transition: 'all .15s',
            }}
          >
            ⏻ Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
