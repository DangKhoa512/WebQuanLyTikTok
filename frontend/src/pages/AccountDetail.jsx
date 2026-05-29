import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { accountApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—';

const STATUSES      = ['REG_DA_LAM', 'UPVIDEO', 'UPVIDEO_FAIL', 'DAT_CHI_TIEU', 'DIE'];
const LIVE_STATUSES = ['unknown', 'live', 'die'];

function Row({ label, value, mono = false }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value${mono ? ' mono' : ''}`}>
        {value ?? <span style={{ color: '#94a3b8' }}>—</span>}
      </span>
    </div>
  );
}

export default function AccountDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [account,  setAccount]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [toast,    setToast]    = useState(null);

  // Edit form state
  const [form, setForm] = useState({ note: '', status: '', live_status: '' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await accountApi.getById(id);
      const acc = res.data?.account;
      setAccount(acc);
      setForm({
        note:        acc.note        || '',
        status:      acc.status      || '',
        live_status: acc.live_status || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.note        !== (account.note        || '')) payload.note        = form.note;
      if (form.status      !== account.status)               payload.status      = form.status;
      if (form.live_status !== account.live_status)          payload.live_status = form.live_status;

      if (Object.keys(payload).length === 0) {
        showToast('Không có thay đổi nào', 'warn');
        return;
      }

      await accountApi.update(id, payload);
      showToast('Cập nhật thành công!');
      fetchAccount();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="loading-wrap">
        <div className="spinner" /> Đang tải account…
      </div>
    );

  if (error)
    return (
      <div className="page">
        <div className="error-bar">⚠️ {error}</div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Quay lại</button>
      </div>
    );

  if (!account) return null;

  return (
    <div className="page">
      {/* Toast */}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type === 'error' ? 'error' : toast.type === 'warn' ? 'warn' : ''}`}>
            {toast.type === 'success' && '✅ '}
            {toast.type === 'error'   && '❌ '}
            {toast.type === 'warn'    && '⚠️ '}
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <Link to="/accounts" className="back-link">← Danh sách account</Link>

      <div className="page-header">
        <div>
          <h1>
            {account.username || `Account #${account.id}`}
            <span style={{ marginLeft: '.75rem' }}><StatusBadge status={account.status} /></span>
          </h1>
          <div className="subtitle">
            ID: {account.id} &nbsp;·&nbsp;
            <StatusBadge status={account.live_status} />
            &nbsp;·&nbsp; {account.video_count} videos
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchAccount}>🔄 Làm mới</button>
      </div>

      <div className="detail-grid">
        {/* ── Account credentials ── */}
        <div className="detail-section">
          <h3>🔑 Thông tin tài khoản</h3>
          <Row label="ID"        value={account.id} />
          <Row label="Username"  value={account.username} />
          <Row label="Password"  value={account.password} mono />
          <Row label="2FA"       value={account.twofa} mono />
          <Row label="Email"     value={account.email} />
          <Row label="Email Pass" value={account.email_pass} mono />
          <Row label="Proxy"     value={account.proxy} mono />
          <Row label="Device ID" value={account.device_id} mono />
        </div>

        {/* ── Status & stats ── */}
        <div className="detail-section">
          <h3>📊 Trạng thái & Thống kê</h3>
          <Row label="Status"        value={<StatusBadge status={account.status} />} />
          <Row label="Live Status"   value={<StatusBadge status={account.live_status} />} />
          <Row label="Video Count"   value={<strong style={{ fontSize: '1.1rem' }}>{account.video_count}</strong>} />
          <Row label="Reg At"        value={fmt(account.reg_at)} />
          <Row label="Last Upload"   value={fmt(account.last_upload_at)} />
          <Row label="Last Live Check" value={fmt(account.last_live_check_at)} />
          <Row label="Fail Reason"   value={account.fail_reason} />
          {account.locked_by && (
            <>
              <Row label="Locked By" value={<span style={{ color: '#f59e0b' }}>🔒 {account.locked_by}</span>} />
              <Row label="Locked At" value={fmt(account.locked_at)} />
            </>
          )}
          <Row label="Created"    value={fmt(account.created_at)} />
          <Row label="Updated"    value={fmt(account.updated_at)} />
        </div>

        {/* ── Token & Cookie (collapsible-ish) ── */}
        <div className="detail-section">
          <h3>🍪 Token & Cookie</h3>
          <div style={{ marginBottom: '.75rem' }}>
            <div className="detail-label" style={{ marginBottom: '.35rem' }}>Token</div>
            <textarea
              readOnly
              value={account.token || ''}
              style={{
                width: '100%', height: 80, fontSize: '.72rem',
                fontFamily: 'monospace', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '.5rem', resize: 'vertical',
                color: '#64748b', background: '#f8fafc'
              }}
            />
          </div>
          <div>
            <div className="detail-label" style={{ marginBottom: '.35rem' }}>Cookie</div>
            <textarea
              readOnly
              value={account.cookie || ''}
              style={{
                width: '100%', height: 80, fontSize: '.72rem',
                fontFamily: 'monospace', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '.5rem', resize: 'vertical',
                color: '#64748b', background: '#f8fafc'
              }}
            />
          </div>
        </div>

        {/* ── Manual Edit ── */}
        <div className="detail-section">
          <h3>✏️ Chỉnh sửa thủ công</h3>

          <div className="form-group">
            <label>Status</label>
            <select
              className="form-control"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Live Status</label>
            <select
              className="form-control"
              value={form.live_status}
              onChange={(e) => setForm((p) => ({ ...p, live_status: e.target.value }))}
            >
              {LIVE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Note</label>
            <textarea
              className="form-control"
              placeholder="Ghi chú…"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '⏳ Đang lưu…' : '💾 Lưu thay đổi'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() =>
                setForm({
                  note:        account.note        || '',
                  status:      account.status      || '',
                  live_status: account.live_status || '',
                })
              }
            >
              ↩ Huỷ
            </button>
          </div>
        </div>
      </div>

      {/* Raw data */}
      {account.raw_data && (
        <div className="detail-section">
          <h3>📄 Raw Data</h3>
          <textarea
            readOnly
            value={account.raw_data}
            style={{
              width: '100%', height: 60, fontSize: '.78rem',
              fontFamily: 'monospace', border: '1px solid #e2e8f0',
              borderRadius: 6, padding: '.5rem',
              color: '#64748b', background: '#f8fafc'
            }}
          />
        </div>
      )}
    </div>
  );
}
