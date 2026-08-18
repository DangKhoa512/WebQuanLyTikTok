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
  const [userKhangLimits, setUserKhangLimits] = useState([]);
  const [savingLimitUser, setSavingLimitUser] = useState('');
  const [machineApiKeys, setMachineApiKeys] = useState([]);
  const [newMachineApiKey, setNewMachineApiKey] = useState('');
  const [savingMachineApiKeys, setSavingMachineApiKeys] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const isAdminUser = authService.getRole() === 'admin';

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
      })
      .catch((err) => toast.error(err.message || 'Không tải được limit Chrome kháng'));
    if (isAdminUser) {
      settingsApi.getChromeKhangLimits()
        .then((res) => {
          if (!mounted) return;
          setUserKhangLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Không tải được limit user'));
    }
    return () => { mounted = false; };
  }, [isAdminUser]);

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
      .then(() => toast.success('Đã reset cài đặt'))
      .catch((err) => toast.error(err.message || 'Reset cài đặt thất bại'));
  };

  const handleSaveUserLimit = async (username) => {
    const row = userKhangLimits.find((item) => item.username === username);
    if (!row) return;

    const limit = parseInt(row.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit phải lớn hơn 0');
      return;
    }

    setSavingLimitUser(username);
    try {
      const res = await settingsApi.updateChromeKhangLimit(limit, username);
      const saved = res.data?.settings || {};
      setUserKhangLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setKhangDailyLimit(saved.limit || limit);
      }
      toast.success(`Đã lưu limit cho ${username}`);
    } catch (err) {
      toast.error(err.message || 'Lưu limit thất bại');
    } finally {
      setSavingLimitUser('');
    }
  };


  const normalizeMachineApiKey = (value) => String(value || '').trim().toUpperCase();

  const saveMachineApiKeys = async (keys) => {
    setSavingMachineApiKeys(true);
    try {
      const res = await settingsApi.updateMachineApiKeys(keys);
      setMachineApiKeys(res.data?.keys || keys);
      toast.success('Da luu danh sach key API may');
    } catch (err) {
      toast.error(err.message || 'Luu key API may that bai');
    } finally {
      setSavingMachineApiKeys(false);
    }
  };

  const handleAddMachineApiKey = () => {
    const key = normalizeMachineApiKey(newMachineApiKey);
    if (!key) {
      toast.error('Nhap ten key API truoc');
      return;
    }
    if (machineApiKeys.includes(key)) {
      toast.error('Key API da ton tai');
      return;
    }
    setNewMachineApiKey('');
    saveMachineApiKeys([...machineApiKeys, key]);
  };

  const handleRemoveMachineApiKey = (key) => {
    if (!confirm('Xoa key API ' + key + '?')) return;
    saveMachineApiKeys(machineApiKeys.filter((item) => item !== key));
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
              {'\uD83D\uDD0C Key cau hinh API may'}
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Chi admin duoc them/xoa cac bang cau hinh API may. Trang API May se dung danh sach key nay.
            </div>
            <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.85rem' }}>
              <input
                value={newMachineApiKey}
                onChange={(e) => setNewMachineApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMachineApiKey()}
                placeholder="API_NAME"
                style={{
                  flex: 1, boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
              <button
                onClick={handleAddMachineApiKey}
                disabled={savingMachineApiKeys}
                style={{
                  background: savingMachineApiKeys ? '#334155' : '#10b981',
                  border: 'none', color: '#fff', borderRadius: '8px',
                  padding: '.6rem 1rem', cursor: savingMachineApiKeys ? 'not-allowed' : 'pointer',
                  fontWeight: 800, whiteSpace: 'nowrap',
                }}
              >
                Them key
              </button>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
              {machineApiKeys.length === 0 ? (
                <div style={{ padding: '1rem', color: '#94a3b8', textAlign: 'center' }}>Chua co key API nao</div>
              ) : machineApiKeys.map((key, index) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 48px', alignItems: 'center', borderTop: index ? '1px solid #334155' : 'none' }}>
                  <div style={{ padding: '.75rem 1rem', fontWeight: 900, color: '#e2e8f0', background: '#0f172a' }}>{key}</div>
                  <button
                    onClick={() => handleRemoveMachineApiKey(key)}
                    disabled={savingMachineApiKeys}
                    title="Xoa key API"
                    style={{ height: '100%', minHeight: 44, border: 'none', borderLeft: '1px solid #334155', background: '#1e293b', color: '#fca5a5', cursor: savingMachineApiKeys ? 'not-allowed' : 'pointer', fontWeight: 900 }}
                  >
                    {'\uD83D\uDDD1'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdminUser ? (
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              ⚡ Limit Chrome kháng theo user
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Admin có thể chỉnh giới hạn số acc mỗi máy được làm trong ngày cho từng user.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Trạng thái</th>
                    <th>Limit acc/máy/ngày</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userKhangLimits.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                        Chưa tải được danh sách user
                      </td>
                    </tr>
                  )}
                  {userKhangLimits.map((user) => (
                    <tr key={user.username}>
                      <td style={{ fontWeight: 700 }}>{user.username}</td>
                      <td>{user.role}</td>
                      <td style={{ color: user.is_active ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {user.is_active ? 'Đang bật' : 'Đã tắt'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={user.limit}
                          onChange={(e) => setUserKhangLimits((prev) => prev.map((item) =>
                            item.username === user.username ? { ...item, limit: e.target.value } : item
                          ))}
                          style={{
                            width: 120, boxSizing: 'border-box',
                            background: '#1e293b', color: '#e2e8f0',
                            border: '1px solid #334155', borderRadius: '8px',
                            padding: '.45rem .6rem', fontWeight: 700,
                          }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleSaveUserLimit(user.username)}
                          disabled={savingLimitUser === user.username}
                          style={{
                            background: savingLimitUser === user.username ? '#334155' : '#2563eb',
                            border: 'none', color: '#fff', borderRadius: '7px',
                            padding: '.45rem .85rem', cursor: savingLimitUser === user.username ? 'not-allowed' : 'pointer',
                            fontWeight: 700, whiteSpace: 'nowrap',
                          }}
                        >
                          {savingLimitUser === user.username ? 'Đang lưu...' : 'Lưu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              ⚡ Limit Chrome kháng
            </h3>
            <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>
              Limit hiện tại của bạn: <b style={{ color: '#e2e8f0' }}>{khangDailyLimit}</b> acc/máy/ngày
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
