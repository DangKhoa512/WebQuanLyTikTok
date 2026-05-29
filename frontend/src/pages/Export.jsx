import { useState, useEffect } from 'react';
import { exportApi } from '../services/api';

const STATUSES = [
  { value: 'ALL',          label: '📋 Tất cả',        color: '#3b82f6' },
  { value: 'REG_DA_LAM',   label: '📝 REG_DA_LAM',    color: '#f59e0b' },
  { value: 'CHO_UPVIDEO',  label: '⏳ CHỜ UPVIDEO',   color: '#06b6d4' },
  { value: 'UPVIDEO',      label: '📤 UPVIDEO',       color: '#10b981' },
  { value: 'UPVIDEO_FAIL', label: '❌ UPVIDEO_FAIL',  color: '#ef4444' },
  { value: 'DAT_CHI_TIEU', label: '🎯 ĐẠT CHỈ TIÊU', color: '#8b5cf6' },
  { value: 'DIE',          label: '💀 DIE',            color: '#6b7280' },
];

const FORMATS = [
  { value: 'txt', label: '📄 TXT (pipe)',  desc: 'user|pass|mail|passmail — dùng cho phone/tool' },
  { value: 'csv', label: '📊 CSV (Excel)', desc: 'Đầy đủ cột, mở bằng Excel' },
  { value: 'json',label: '🔧 JSON (API)',  desc: 'Full data dạng JSON' },
];

export default function Export() {
  const [summary,   setSummary]   = useState({});
  const [loading,   setLoading]   = useState({});
  const [toast,     setToast]     = useState(null);
  const [format,    setFormat]    = useState('txt');
  const [fields,    setFields]    = useState('pipe');

  useEffect(() => {
    exportApi.summary()
      .then((r) => setSummary(r.data || {}))
      .catch(() => {});
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDownload = async (status) => {
    setLoading((p) => ({ ...p, [status]: true }));
    try {
      const filename = await exportApi.download(status, format, fields);
      showToast(`✅ Đã tải: ${filename}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading((p) => ({ ...p, [status]: false }));
    }
  };

  const total = STATUSES
    .filter((s) => s.value !== 'ALL')
    .reduce((sum, s) => sum + (summary[s.value] || 0), 0);

  return (
    <div className="page">
      {/* Toast */}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>
            {toast.msg}
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>📥 Xuất danh sách Account</h1>
          <div className="subtitle">Tổng {total.toLocaleString()} accounts trong hệ thống</div>
        </div>
      </div>

      {/* Format chọn */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header"><h3>⚙️ Tuỳ chọn xuất</h3></div>
        <div className="card-body">

          {/* Format */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#475569', marginBottom: '.6rem' }}>
              Định dạng file
            </div>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              {FORMATS.map((f) => (
                <label
                  key={f.value}
                  style={{
                    display:    'flex',
                    alignItems: 'flex-start',
                    gap:        '.6rem',
                    padding:    '.75rem 1rem',
                    border:     `2px solid ${format === f.value ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    cursor:     'pointer',
                    background: format === f.value ? '#eff6ff' : '#fff',
                    transition: 'all .15s',
                    minWidth:   '180px',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.value}
                    checked={format === f.value}
                    onChange={() => setFormat(f.value)}
                    style={{ marginTop: '.15rem', accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{f.label}</div>
                    <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.15rem' }}>{f.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Fields (chỉ hiện khi txt) */}
          {format === 'txt' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#475569', marginBottom: '.6rem' }}>
                Nội dung TXT
              </div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                {[
                  { value: 'pipe', label: '📱 Phone format', desc: 'user|pass|mail|passmail' },
                  { value: 'full', label: '📋 Full format',  desc: 'id|user|pass|mail|passmail|status|live|videos' },
                ].map((f) => (
                  <label
                    key={f.value}
                    style={{
                      display:    'flex',
                      alignItems: 'flex-start',
                      gap:        '.6rem',
                      padding:    '.75rem 1rem',
                      border:     `2px solid ${fields === f.value ? '#10b981' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      cursor:     'pointer',
                      background: fields === f.value ? '#f0fdf4' : '#fff',
                      transition: 'all .15s',
                      minWidth:   '200px',
                    }}
                  >
                    <input
                      type="radio"
                      name="fields"
                      value={f.value}
                      checked={fields === f.value}
                      onChange={() => setFields(f.value)}
                      style={{ marginTop: '.15rem', accentColor: '#10b981' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{f.label}</div>
                      <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.15rem', fontFamily: 'monospace' }}>
                        {f.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export buttons by status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {STATUSES.map(({ value, label, color }) => {
          const count = value === 'ALL'
            ? total
            : (summary[value] || 0);

          return (
            <div
              key={value}
              style={{
                background:   '#fff',
                borderRadius: '12px',
                padding:      '1.25rem',
                boxShadow:    '0 1px 3px rgba(0,0,0,.1)',
                borderLeft:   `4px solid ${color}`,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'space-between',
                gap:          '1rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                  {label}
                </div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: '.2rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color }}>{count.toLocaleString()}</span>
                  {' '}accounts
                </div>
              </div>

              <button
                onClick={() => handleDownload(value)}
                disabled={loading[value] || count === 0}
                style={{
                  background:   count === 0 ? '#f1f5f9' : color,
                  color:        count === 0 ? '#94a3b8' : '#fff',
                  border:       'none',
                  borderRadius: '8px',
                  padding:      '.6rem 1.1rem',
                  cursor:       count === 0 ? 'not-allowed' : 'pointer',
                  fontSize:     '.875rem',
                  fontWeight:   600,
                  whiteSpace:   'nowrap',
                  transition:   'all .15s',
                  opacity:      loading[value] ? 0.7 : 1,
                }}
              >
                {loading[value] ? '⏳...' : '⬇️ Tải xuống'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Preview format */}
      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-header"><h3>👁️ Xem trước định dạng</h3></div>
        <div className="card-body">
          {format === 'txt' && fields === 'pipe' && (
            <pre style={preStyle}>
{`tiktok_user001|Pass@123|user001@gmail.com|mailpass123
tiktok_user002|Pass@456|user002@gmail.com|mailpass456
tiktok_user003|Pass@789|user003@gmail.com|mailpass789`}
            </pre>
          )}
          {format === 'txt' && fields === 'full' && (
            <pre style={preStyle}>
{`1|tiktok_user001|Pass@123|user001@gmail.com|mailpass123|UPVIDEO|live|15
2|tiktok_user002|Pass@456|user002@gmail.com|mailpass456|UPVIDEO|live|8
3|tiktok_user003|Pass@789|user003@gmail.com|mailpass789|UPVIDEO_FAIL|die|3`}
            </pre>
          )}
          {format === 'csv' && (
            <pre style={preStyle}>
{`id,username,password,email,email_pass,twofa,proxy,device_id,status,live_status,video_count,reg_at
1,tiktok_user001,Pass@123,user001@gmail.com,mailpass123,,,iphone_01,UPVIDEO,live,15,2026-05-20T00:00:00.000Z`}
            </pre>
          )}
          {format === 'json' && (
            <pre style={preStyle}>
{`{
  "success": true,
  "total": 10,
  "status": "UPVIDEO",
  "data": [
    { "id": 1, "username": "tiktok_user001", "status": "UPVIDEO", ... }
  ]
}`}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

const preStyle = {
  background:   '#0f172a',
  color:        '#e2e8f0',
  padding:      '1rem',
  borderRadius: '8px',
  fontSize:     '.82rem',
  fontFamily:   "'Courier New', monospace",
  overflowX:    'auto',
  lineHeight:   1.6,
  margin:       0,
};
