import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from './Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';

export default function RegToolbar({ onRefresh }) {
  const [promoting, setPromoting] = useState(false);

  const settings   = loadCheckLiveSettings();
  const proxyCount = settings.proxies.split('\n').map((l) => l.trim()).filter(Boolean).length;

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await api.post('/accounts/promote-eligible', { min_age_days: 4, min_videos: 20 });
      toast.success(res.message);
      onRefresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={{
      background:   '#0f172a',
      borderRadius: '12px',
      padding:      '.75rem 1.25rem',
      marginBottom: '1rem',
      boxShadow:    '0 4px 16px rgba(0,0,0,.3)',
      border:       '1px solid rgba(255,255,255,.07)',
      display:      'flex',
      alignItems:   'center',
      gap:          '1rem',
      flexWrap:     'wrap',
    }}>
      {/* Proxy status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
        <span style={{ color: '#94a3b8' }}>🌐</span>
        <span style={{ color: proxyCount > 0 ? '#6ee7b7' : '#f87171', fontWeight: 600 }}>
          {proxyCount} proxy
        </span>
        <Link
          to="/proxy-settings"
          style={{
            color: '#3b82f6', textDecoration: 'none', fontSize: '.78rem',
            background: 'rgba(59,130,246,.1)', borderRadius: '6px',
            padding: '.15rem .5rem', border: '1px solid rgba(59,130,246,.2)',
          }}
        >
          ⚙ Cài đặt
        </Link>
      </div>

      <div style={{ color: '#334155', fontSize: '.75rem' }}>
        · Check Live dùng nút trong thanh chọn bên dưới ·
      </div>

      <div style={{ flex: 1 }} />

      {/* Promote */}
      <button onClick={handlePromote} disabled={promoting} style={{
        background:   promoting ? '#334155' : '#059669',
        border:       'none', color: '#fff', borderRadius: '8px',
        padding:      '.5rem 1.1rem', cursor: promoting ? 'not-allowed' : 'pointer',
        fontWeight:   700, fontSize: '.85rem', whiteSpace: 'nowrap',
        transition:   'background .15s',
      }}>
        {promoting ? '⏳ Đang chuyển...' : '🎯 Chuyển Đủ ĐK → DU_DK'}
      </button>
      <div style={{ fontSize: '.68rem', color: '#475569' }}>
        Điều kiện: Đang UP + ≥ 20 video + reg ≥ 4 ngày
      </div>
    </div>
  );
}
