import { useState } from 'react';
import { loadCheckLiveSettings, saveCheckLiveSettings } from '../services/checkLiveSettings';
import { toast } from '../components/Toast';

export default function ProxySettings() {
  const init = loadCheckLiveSettings();
  const [proxies,     setProxies]     = useState(init.proxies);
  const [concurrency, setConcurrency] = useState(init.concurrency);
  const [delayMs,     setDelayMs]     = useState(init.delayMs);
  const [batchSize,   setBatchSize]   = useState(init.batchSize);

  const proxyList = proxies.split('\n').map((l) => l.trim()).filter(Boolean);

  const handleSave = () => {
    saveCheckLiveSettings({
      proxies,
      concurrency: parseInt(concurrency),
      delayMs: parseInt(delayMs),
      batchSize: parseInt(batchSize),
    });
    toast.success(`Đã lưu ${proxyList.length} proxy`);
  };

  const handleReset = () => {
    setProxies('');
    setConcurrency(5);
    setDelayMs(1000);
    setBatchSize(50);
    saveCheckLiveSettings({ proxies: '', concurrency: 5, delayMs: 1000, batchSize: 50 });
    toast.success('Đã reset cài đặt');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>⚙️ Cài đặt Proxy Check Live</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Cấu hình proxy pool và tham số check live dùng chung cho tất cả các bảng
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Proxy pool */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            🌐 Danh sách Proxy
            <span style={{
              marginLeft: '.75rem', background: proxyList.length > 0 ? '#064e3b' : '#1e293b',
              color: proxyList.length > 0 ? '#6ee7b7' : '#94a3b8',
              borderRadius: '12px', padding: '.15rem .6rem', fontSize: '.78rem', fontWeight: 700,
            }}>
              {proxyList.length} proxy
            </span>
          </h3>
          <textarea
            value={proxies}
            onChange={(e) => setProxies(e.target.value)}
            placeholder={'ip:port\nip:port:user:pass\nuser:pass@ip:port\n...'}
            rows={10}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1e293b', color: '#e2e8f0',
              border: '1px solid #334155', borderRadius: '8px',
              padding: '.6rem .85rem', fontFamily: 'monospace',
              fontSize: '.8rem', lineHeight: 1.6, resize: 'vertical', outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e)  => (e.target.style.borderColor = '#334155')}
          />
          <div style={{ fontSize: '.72rem', color: '#475569', marginTop: '.35rem' }}>
            Mỗi proxy 1 dòng · Hỗ trợ: ip:port &nbsp;·&nbsp; ip:port:user:pass &nbsp;·&nbsp; user:pass@ip:port
          </div>
        </div>

        {/* Sliders */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', color: '#e2e8f0' }}>
            ⚡ Tham số check
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Luồng song song</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{concurrency}</span>
              </div>
              <input
                type="range" min={1} max={30} value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>1 (chậm, an toàn)</span><span>20 (nhanh)</span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Delay giữa batch</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{delayMs} ms</span>
              </div>
              <input
                type="range" min={0} max={5000} step={100} value={delayMs}
                onChange={(e) => setDelayMs(e.target.value)}
                style={{ width: '100%', accentColor: '#8b5cf6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>0ms (không delay)</span><span>5000ms</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Số acc mỗi lượt</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{batchSize}</span>
              </div>
              <input
                type="range" min={10} max={200} step={10} value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>10 (ổn định)</span><span>200 (nhanh)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={handleSave} style={{
            background: '#2563eb', border: 'none', color: '#fff',
            borderRadius: '8px', padding: '.65rem 1.75rem',
            cursor: 'pointer', fontWeight: 700, fontSize: '.9rem',
          }}>
            💾 Lưu cài đặt
          </button>
          <button onClick={handleReset} style={{
            background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
            borderRadius: '8px', padding: '.65rem 1.25rem',
            cursor: 'pointer', fontWeight: 600, fontSize: '.9rem',
          }}>
            ↺ Reset
          </button>
        </div>
      </div>
    </div>
  );
}
