import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../services/api';
import { authService } from '../services/authService';

export default function Login() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/dashboard';

  const [form,    setForm]    = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError('Vui lòng nhập đầy đủ thông tin.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await authApi.login(form.username, form.password);
      authService.saveToken(res.data.token, res.data.username);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🎵</div>
          <h1 style={styles.logoTitle}>TikTok Manager</h1>
          <p style={styles.logoSub}>Hệ thống quản lý tài khoản</p>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Tên đăng nhập</label>
            <input
              type="text"
              style={styles.input}
              placeholder="admin"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mật khẩu</label>
            <input
              type="password"
              style={styles.input}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            style={{
              ...styles.btn,
              opacity: loading ? 0.7 : 1,
              cursor:  loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? '⏳ Đang đăng nhập…' : '🔐 Đăng nhập'}
          </button>
        </form>

        <p style={styles.hint}>
          Chỉ admin mới được phép truy cập hệ thống này.
        </p>
      </div>
    </div>
  );
}

// ── Inline styles (no extra CSS dependency) ───────────────────────────────────
const styles = {
  page: {
    minHeight:       '100vh',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    background:      'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
    padding:         '1rem',
  },
  card: {
    background:    '#ffffff',
    borderRadius:  '16px',
    padding:       '2.5rem 2rem',
    width:         '100%',
    maxWidth:      '400px',
    boxShadow:     '0 25px 50px rgba(0,0,0,0.4)',
  },
  logo: {
    textAlign:     'center',
    marginBottom:  '2rem',
  },
  logoIcon: {
    fontSize:      '3rem',
    marginBottom:  '0.5rem',
  },
  logoTitle: {
    fontSize:      '1.5rem',
    fontWeight:    '800',
    color:         '#0f172a',
    margin:        '0 0 0.25rem',
  },
  logoSub: {
    fontSize:      '0.85rem',
    color:         '#64748b',
    margin:        0,
  },
  errorBox: {
    background:    '#fef2f2',
    border:        '1px solid #fecaca',
    color:         '#b91c1c',
    padding:       '0.75rem 1rem',
    borderRadius:  '8px',
    fontSize:      '0.875rem',
    marginBottom:  '1.25rem',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '1.1rem',
  },
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.35rem',
  },
  label: {
    fontSize:      '0.78rem',
    fontWeight:    '600',
    color:         '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    border:        '1px solid #e2e8f0',
    borderRadius:  '8px',
    padding:       '0.7rem 0.9rem',
    fontSize:      '0.95rem',
    color:         '#1e293b',
    outline:       'none',
    transition:    'border-color 0.15s',
    fontFamily:    'inherit',
    width:         '100%',
    boxSizing:     'border-box',
  },
  btn: {
    background:    '#3b82f6',
    color:         '#fff',
    border:        'none',
    borderRadius:  '8px',
    padding:       '0.8rem',
    fontSize:      '1rem',
    fontWeight:    '600',
    marginTop:     '0.5rem',
    transition:    'background 0.15s',
    fontFamily:    'inherit',
    width:         '100%',
  },
  hint: {
    textAlign:     'center',
    fontSize:      '0.75rem',
    color:         '#94a3b8',
    marginTop:     '1.5rem',
    marginBottom:  0,
  },
};
