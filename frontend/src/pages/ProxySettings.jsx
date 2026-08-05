import { useEffect, useState } from 'react';
import { loadCheckLiveSettings, saveCheckLiveSettings } from '../services/checkLiveSettings';
import { settingsApi } from '../services/api';
import { toast } from '../components/Toast';
import { authService } from '../services/authService';

export default function ProxySettings() {
  const init = loadCheckLiveSettings();
  const [proxies,     setProxies]     = useState(init.proxies);
  const [concurrency, setConcurrency] = useState(init.concurrency);
  const [delayMs,     setDelayMs]     = useState(init.delayMs);
  const [batchSize,   setBatchSize]   = useState(init.batchSize);
  const [minVideos,   setMinVideos]   = useState(20);
  const [minAgeDays,  setMinAgeDays]  = useState(4);
  const [khangDailyLimit, setKhangDailyLimit] = useState(8);
  const [canEditKhangLimit, setCanEditKhangLimit] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const isAdminUser = authService.getUsername().toLowerCase() === 'admin';

  const proxyList = proxies.split('\n').map((l) => l.trim()).filter(Boolean);

  useEffect(() => {
    let mounted = true;
    settingsApi.getEligibility()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setMinVideos(settings.min_videos || 20);
        setMinAgeDays(settings.min_age_days || 4);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cài đặt đủ điều kiện'));
    settingsApi.getChromeKhangLimit()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setKhangDailyLimit(settings.limit || 8);
        setCanEditKhangLimit(!!settings.editable);
      })
      .catch((err) => toast.error(err.message || 'Không tải được limit Chrome kháng'));
    return () => { mounted = false; };
  }, []);

  const handleSave = () => {
    setSaving(true);
    Promise.resolve()
      .then(() => {
        saveCheckLiveSettings({
          proxies,
          concurrency: parseInt(concurrency, 10),
          delayMs: parseInt(delayMs, 10),
          batchSize: parseInt(batchSize, 10),
        });
        return settingsApi.updateEligibility(parseInt(minAgeDays, 10), parseInt(minVideos, 10));
      })
      .then(() => canEditKhangLimit ? settingsApi.updateChromeKhangLimit(parseInt(khangDailyLimit, 10)) : null)
      .then(() => toast.success('Đã lưu cài đặt'))
      .catch((err) => toast.error(err.message || 'Lưu cài đặt thất bại'))
      .finally(() => setSaving(false));
  };

  const handleReset = () => {
    setProxies('');
    setConcurrency(12);
    setDelayMs(200);
    setBatchSize(60);
    setMinVideos(20);
    setMinAgeDays(4);
    setKhangDailyLimit(8);
    saveCheckLiveSettings({ proxies: '', concurrency: 12, delayMs: 200, batchSize: 60 });
    settingsApi.updateEligibility(4, 20)
      .then(() => canEditKhangLimit ? settingsApi.updateChromeKhangLimit(8) : null)
      .then(() => toast.success('Đã reset cài đặt'))
      .catch((err) => toast.error(err.message || 'Reset cài đặt thất bại'));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>⚙️ Cài đặt</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Cấu hình proxy check live và điều kiện chuyển account đủ điều kiện.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            🎯 Setup đủ điều kiện
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.85rem', display: 'block', marginBottom: '.4rem' }}>
                Video tối thiểu
              </label>
              <input
                type="number"
                min={1}
                value={minVideos}
                onChange={(e) => setMinVideos(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.85rem', display: 'block', marginBottom: '.4rem' }}>
                Tuổi acc tối thiểu
              </label>
              <input
                type="number"
                min={1}
                value={minAgeDays}
                onChange={(e) => setMinAgeDays(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: '.65rem', color: '#64748b', fontSize: '.76rem' }}>
            Áp dụng cho App Acc và Chrome Acc khi chuyển sang Đủ điều kiện.
          </div>
        </div>

        {isAdminUser && (
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              ⚡ Limit Chrome kháng
            </h3>
            <div style={{ maxWidth: 240 }}>
              <label style={{ color: '#94a3b8', fontSize: '.85rem', display: 'block', marginBottom: '.4rem' }}>
                Số acc / máy / ngày
              </label>
              <input
                type="number"
                min={1}
                value={khangDailyLimit}
                disabled={!canEditKhangLimit}
                onChange={(e) => setKhangDailyLimit(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                  opacity: canEditKhangLimit ? 1 : 0.6,
                }}
              />
            </div>
            <div style={{ marginTop: '.65rem', color: '#64748b', fontSize: '.76rem' }}>
              Chỉ áp dụng cho key admin. Các key khác luôn giữ mặc định 8 acc/máy/ngày.
            </div>
          </div>
        )}

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
                type="range" min={1} max={50} value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>1 (chậm, an toàn)</span><span>50 (rất nhanh)</span>
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
          <button onClick={handleSave} disabled={saving} style={{
            background: saving ? '#334155' : '#2563eb', border: 'none', color: '#fff',
            borderRadius: '8px', padding: '.65rem 1.75rem',
            cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '.9rem',
          }}>
            {saving ? '⏳ Đang lưu...' : '💾 Lưu cài đặt'}
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
