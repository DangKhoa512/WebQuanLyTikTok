import { useState } from 'react';
import { accountApi } from '../services/api';
import { toast } from './Toast';

const EXAMPLE = `06/05/2026 15:06:00\tbi.thanh.lm769|Null|buithanhlam59o9njnae985@antttool.us|Phan9999
07/05/2026 08:30:00\tanother.user|Pass@123|user@gmail.com|mailpass456
tiktok_user003|Pass@789|user003@gmail.com|mailpass789`;

export default function ImportModal({ onClose, onSuccess }) {
  const [text,    setText]    = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [showEx,  setShowEx]  = useState(false);

  const lineCount = text.trim().split('\n').filter((l) => l.trim()).length;

  const handleImport = async () => {
    if (!text.trim()) { toast.error('Chưa nhập dữ liệu'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await accountApi.import(text);
      setResult(res.data);
      toast.success(res.message);
      if (res.data?.imported > 0) onSuccess?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position:   'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        padding:    '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:   '#fff',
        borderRadius: '14px',
        width:        '100%', maxWidth: '680px',
        boxShadow:    '0 20px 60px rgba(0,0,0,.25)',
        display:      'flex', flexDirection: 'column',
        maxHeight:    '92vh',
      }}>
        {/* Header */}
        <div style={{
          padding:      '1.25rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
              📥 Import Accounts
            </h2>
            <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: '.2rem' }}>
              Hỗ trợ có/không có datetime · Tối đa 2000 dòng
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '1.4rem',
              cursor: 'pointer', color: '#94a3b8', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>

          {/* Format hint */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem',
            fontSize: '.8rem', color: '#475569',
          }}>
            <strong>Định dạng:</strong>
            <div style={{ fontFamily: 'monospace', marginTop: '.3rem', lineHeight: 1.7 }}>
              <div>
                <span style={{ color: '#8b5cf6' }}>DD/MM/YYYY HH:MM:SS</span>
                <span style={{ color: '#94a3b8' }}>{'\t'}</span>
                <span style={{ color: '#059669' }}>username</span>
                <span style={{ color: '#94a3b8' }}>|pass|email|email_pass</span>
              </div>
              <div style={{ color: '#94a3b8' }}>
                hoặc chỉ: <span style={{ color: '#059669' }}>username</span>|pass|email|email_pass
              </div>
            </div>
            <button
              onClick={() => setShowEx((v) => !v)}
              style={{
                marginTop: '.5rem', background: 'none', border: 'none',
                color: '#3b82f6', cursor: 'pointer', fontSize: '.78rem', padding: 0,
              }}
            >
              {showEx ? '▲ Ẩn ví dụ' : '▼ Xem ví dụ'}
            </button>
            {showEx && (
              <pre style={{
                background: '#0f172a', color: '#e2e8f0',
                padding: '.75rem', borderRadius: '6px', marginTop: '.5rem',
                fontSize: '.75rem', overflowX: 'auto', lineHeight: 1.6,
              }}>
                {EXAMPLE}
              </pre>
            )}
          </div>

          {/* Textarea */}
          <div style={{ position: 'relative' }}>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              placeholder={'Dán danh sách accounts vào đây...\n\nVí dụ:\n06/05/2026 15:06:00\tbi.thanh.lm769|Null|email@antttool.us|Phan9999'}
              rows={12}
              style={{
                width:        '100%', boxSizing: 'border-box',
                padding:      '.75rem', fontFamily: 'monospace',
                fontSize:     '.82rem', lineHeight: 1.6,
                border:       '2px solid #e2e8f0', borderRadius: '8px',
                resize:       'vertical', outline: 'none',
                transition:   'border-color .15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
              onBlur={(e)  => (e.target.style.borderColor = '#e2e8f0')}
            />
            {lineCount > 0 && (
              <div style={{
                position: 'absolute', bottom: '10px', right: '12px',
                background: '#3b82f6', color: '#fff', borderRadius: '20px',
                padding: '.15rem .6rem', fontSize: '.72rem', fontWeight: 600,
              }}>
                {lineCount} dòng
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{
              marginTop: '1rem',
              background: result.imported > 0 ? '#f0fdf4' : '#fff7ed',
              border:     `1px solid ${result.imported > 0 ? '#86efac' : '#fed7aa'}`,
              borderRadius: '8px', padding: '.75rem 1rem',
              fontSize: '.85rem',
            }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span>✅ <strong style={{ color: '#16a34a' }}>{result.imported}</strong> đã import</span>
                {result.duplicates > 0 && (
                  <span>⚠️ <strong style={{ color: '#d97706' }}>{result.duplicates}</strong> trùng (bỏ qua)</span>
                )}
                {result.parse_errors > 0 && (
                  <span>❌ <strong style={{ color: '#dc2626' }}>{result.parse_errors}</strong> dòng lỗi</span>
                )}
              </div>
              {result.error_samples?.length > 0 && (
                <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: '#7c3aed' }}>
                  <strong>Dòng lỗi mẫu:</strong>
                  {result.error_samples.map((e, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', marginTop: '.1rem' }}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:    '1rem 1.5rem',
          borderTop:  '1px solid #e2e8f0',
          display:    'flex', gap: '.75rem', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '.6rem 1.25rem', borderRadius: '8px',
              border: '1px solid #e2e8f0', background: '#f8fafc',
              cursor: 'pointer', fontWeight: 600, color: '#475569',
            }}
          >
            Đóng
          </button>
          <button
            onClick={() => { setText(''); setResult(null); }}
            style={{
              padding: '.6rem 1.25rem', borderRadius: '8px',
              border: '1px solid #e2e8f0', background: '#fff',
              cursor: 'pointer', color: '#64748b',
            }}
          >
            🗑️ Xoá
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !text.trim()}
            style={{
              padding:    '.6rem 1.5rem', borderRadius: '8px',
              background: loading || !text.trim() ? '#94a3b8' : '#3b82f6',
              color: '#fff', border: 'none',
              cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '.9rem',
              transition: 'background .15s',
            }}
          >
            {loading ? '⏳ Đang import...' : `📥 Import${lineCount > 0 ? ` (${lineCount} dòng)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
