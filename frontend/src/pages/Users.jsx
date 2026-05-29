import { useEffect, useState } from 'react';
import { userApi } from '../services/api';
import { authService } from '../services/authService';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await userApi.getAll();
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Nhap username va password.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await userApi.create({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      });
      setForm({ username: '', password: '', role: 'user' });
      setMessage('Da tao user.');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (user, data) => {
    setError('');
    setMessage('');
    try {
      await userApi.update(user.id, data);
      setMessage('Da cap nhat user.');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  if (authService.getRole() !== 'admin') {
    return (
      <div style={styles.page}>
        <h1 style={styles.title}>Cap user</h1>
        <div style={styles.notice}>Chi admin moi duoc quan ly user.</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Cap user</h1>
          <p style={styles.sub}>Moi user chi thay va quan ly account cua user do.</p>
        </div>
        <button style={styles.refreshBtn} onClick={loadUsers}>Lam moi</button>
      </div>

      {(error || message) && (
        <div style={error ? styles.error : styles.message}>{error || message}</div>
      )}

      <form style={styles.form} onSubmit={handleCreate}>
        <input
          style={styles.input}
          placeholder="username"
          value={form.username}
          onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
        />
        <select
          style={styles.select}
          value={form.role}
          onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button style={styles.primaryBtn} disabled={saving}>
          {saving ? 'Dang tao...' : 'Tao user'}
        </button>
      </form>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Username</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Trang thai</th>
              <th style={styles.th}>Ngay tao</th>
              <th style={styles.th}>Thao tac</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={styles.td} colSpan="6">Dang tai...</td></tr>
            ) : users.length === 0 ? (
              <tr><td style={styles.td} colSpan="6">Chua co user.</td></tr>
            ) : users.map((user) => (
              <tr key={user.id}>
                <td style={styles.td}>{user.id}</td>
                <td style={styles.td}><b>{user.username}</b></td>
                <td style={styles.td}>
                  <select
                    style={styles.smallSelect}
                    value={user.role}
                    onChange={(e) => updateUser(user, { role: e.target.value })}
                    disabled={user.username === authService.getUsername()}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td style={styles.td}>
                  <span style={user.is_active ? styles.active : styles.inactive}>
                    {user.is_active ? 'Active' : 'Locked'}
                  </span>
                </td>
                <td style={styles.td}>{user.created_at ? new Date(user.created_at).toLocaleString('vi-VN') : '-'}</td>
                <td style={styles.td}>
                  <button
                    style={user.is_active ? styles.warnBtn : styles.okBtn}
                    onClick={() => updateUser(user, { is_active: !user.is_active })}
                    disabled={user.username === authService.getUsername()}
                  >
                    {user.is_active ? 'Khoa' : 'Mo'}
                  </button>
                  <button
                    style={styles.secondaryBtn}
                    onClick={() => {
                      const password = window.prompt(`Password moi cho ${user.username}`);
                      if (password) updateUser(user, { password });
                    }}
                  >
                    Doi pass
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '1.5rem', color: '#0f172a' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' },
  title: { margin: 0, fontSize: '1.5rem', fontWeight: 800 },
  sub: { margin: '.25rem 0 0', color: '#64748b', fontSize: '.9rem' },
  notice: { background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', padding: '1rem', borderRadius: 8 },
  error: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '.75rem 1rem', borderRadius: 8, marginBottom: '1rem' },
  message: { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '.75rem 1rem', borderRadius: 8, marginBottom: '1rem' },
  form: { display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(160px, 1fr) 120px 120px', gap: '.75rem', marginBottom: '1rem' },
  input: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '.65rem .75rem', fontSize: '.9rem' },
  select: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '.65rem .75rem', fontSize: '.9rem', background: '#fff' },
  smallSelect: { border: '1px solid #cbd5e1', borderRadius: 6, padding: '.35rem .5rem', background: '#fff' },
  primaryBtn: { border: 0, borderRadius: 8, padding: '.65rem .9rem', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  refreshBtn: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '.55rem .8rem', background: '#fff', cursor: 'pointer' },
  tableWrap: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' },
  th: { textAlign: 'left', padding: '.75rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' },
  td: { padding: '.75rem', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' },
  active: { color: '#047857', background: '#d1fae5', borderRadius: 999, padding: '.2rem .55rem', fontWeight: 700 },
  inactive: { color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '.2rem .55rem', fontWeight: 700 },
  warnBtn: { border: 0, borderRadius: 6, padding: '.4rem .7rem', background: '#f97316', color: '#fff', fontWeight: 700, cursor: 'pointer', marginRight: '.5rem' },
  okBtn: { border: 0, borderRadius: 6, padding: '.4rem .7rem', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', marginRight: '.5rem' },
  secondaryBtn: { border: '1px solid #cbd5e1', borderRadius: 6, padding: '.4rem .7rem', background: '#fff', cursor: 'pointer' },
};
