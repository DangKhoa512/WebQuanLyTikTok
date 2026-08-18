import { useCallback, useEffect, useMemo, useState } from 'react';
import { machineApiConfigsApi } from '../services/api';
import { toast } from '../components/Toast';
import { authService } from '../services/authService';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const toConfigState = (keys, source = {}) => keys.reduce((acc, key) => {
  acc[key] = source[key] || '';
  return acc;
}, {});

const text = {
  title: '\uD83D\uDD0C C\u1EA5u h\u00ECnh API m\u00E1y',
  subtitle: 'Qu\u1EA3n l\u00FD API d\u00F9ng chung v\u00E0 API ri\u00EAng cho t\u1EEBng m\u00E1y.',
  refresh: 'L\u00E0m m\u1EDBi',
  loading: '\u0110ang t\u1EA3i...',
  addMachine: 'Th\u00EAm m\u00E1y',
  apiKey: 'Key API',
  common: 'C\u1EA5u h\u00ECnh chung',
  private: 'Danh s\u00E1ch m\u00E1y',
  commonHint: 'M\u00E1y n\u00E0o kh\u00F4ng set ri\u00EAng s\u1EBD t\u1EF1 \u0111\u1ED9ng d\u00F9ng gi\u00E1 tr\u1ECB chung.',
  privateHint: 'Qu\u1EA3n l\u00FD danh s\u00E1ch m\u00E1y, s\u1EEDa t\u00EAn m\u00E1y v\u00E0 config API ri\u00EAng.',
  save: 'L\u01B0u c\u1EA5u h\u00ECnh',
  saving: '\u0110ang l\u01B0u...',
  machineList: 'Danh s\u00E1ch m\u00E1y',
  selected: '\u0110ang ch\u1ECDn',
  chooseMachine: 'Ch\u1ECDn m\u00E1y \u0111\u1EC3 set API ri\u00EAng',
  mergedPreview: 'Preview config phone l\u1EA5y v\u1EC1',
};

const styles = {
  section: {
    background: '#fff',
    border: '1px solid #dbe3ef',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(15,23,42,.08)',
  },
  label: {
    color: '#475569',
    fontSize: '.72rem',
    fontWeight: 800,
    letterSpacing: '.03em',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #dbe3ef',
    borderRadius: 8,
    padding: '.6rem .75rem',
    color: '#0f172a',
    background: '#fff',
  },
};

function PrimaryButton({ children, onClick, disabled, color = '#0ea5e9' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#94a3b8' : color,
        border: 'none',
        color: '#fff',
        borderRadius: 8,
        padding: '.62rem 1rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function ApiRows({ keys, configs, common, mode, onChange }) {
  if (!keys.length) {
    return <div style={{ padding: '1.25rem', textAlign: 'center', color: '#94a3b8' }}>Chua co key API nao</div>;
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      {keys.map((key, index) => {
        const fallback = common?.[key] || '';
        const value = configs[key] || '';
        return (
          <div
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: '220px minmax(0, 1fr)',
              gap: 0,
              borderTop: index ? '1px solid #e2e8f0' : 'none',
              background: index % 2 ? '#fbfdff' : '#fff',
            }}
          >
            <div style={{ padding: '.85rem 1rem', borderRight: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontWeight: 900, color: '#0f172a', wordBreak: 'break-word' }}>{key}</div>
              {mode === 'private' && fallback && !value && (
                <div style={{ marginTop: '.25rem', color: '#64748b', fontSize: '.72rem' }}>Dang dung cau hinh chung</div>
              )}
            </div>
            <div style={{ padding: '.55rem .75rem' }}>
              <textarea
                value={value}
                onChange={(event) => onChange(key, event.target.value)}
                rows={2}
                placeholder={mode === 'private' && fallback ? 'De trong de dung gia tri chung...' : 'Nhap API hoac gia tri config...'}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: 52,
                  border: '1px solid #dbe3ef',
                  borderRadius: 8,
                  padding: '.55rem .7rem',
                  fontSize: '.82rem',
                  lineHeight: 1.45,
                  fontFamily: 'monospace',
                  color: '#0f172a',
                  background: '#fff',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MachineApiConfigs() {
  const [keys, setKeys] = useState([]);
  const [common, setCommon] = useState({});
  const [machines, setMachines] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [machineConfigs, setMachineConfigs] = useState({});
  const [newDevice, setNewDevice] = useState('');
  const [activeTab, setActiveTab] = useState('common');
  const [machineSearch, setMachineSearch] = useState('');
  const [editDevice, setEditDevice] = useState('');
  const [editDeviceName, setEditDeviceName] = useState('');
  const [editConfigs, setEditConfigs] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingCommon, setSavingCommon] = useState(false);
  const [addingMachine, setAddingMachine] = useState(false);

  const filteredMachines = useMemo(() => {
    const keyword = machineSearch.trim().toLowerCase();
    if (!keyword) return machines;
    return machines.filter((machine) => machine.device_id.toLowerCase().includes(keyword));
  }, [machines, machineSearch]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await machineApiConfigsApi.getAll();
      const data = res.data || {};
      const nextKeys = data.keys || [];
      const nextMachines = data.machines || [];
      setKeys(nextKeys);
      setCommon(toConfigState(nextKeys, data.common || {}));
      setMachines(nextMachines);
      if (!selectedDevice && nextMachines.length) {
        setSelectedDevice(nextMachines[0].device_id);
        setMachineConfigs(toConfigState(nextKeys, nextMachines[0].configs || {}));
      } else if (selectedDevice) {
        const current = nextMachines.find((machine) => machine.device_id === selectedDevice);
        setMachineConfigs(toConfigState(nextKeys, current?.configs || {}));
      }
    } catch (err) {
      toast.error(err.message || 'Khong tai duoc cau hinh API may');
    } finally {
      setLoading(false);
    }
  }, [selectedDevice]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const selectMachine = (machine) => {
    setSelectedDevice(machine.device_id);
    setMachineConfigs(toConfigState(keys, machine.configs || {}));
    setActiveTab('private');
  };

  const handleAddMachine = async () => {
    const deviceId = newDevice.trim();
    if (!deviceId) {
      toast.error('Nhap ten may truoc');
      return;
    }
    setAddingMachine(true);
    try {
      const existing = machines.find((machine) => machine.device_id === deviceId);
      await machineApiConfigsApi.save(deviceId, existing?.configs || {});
      setSelectedDevice(deviceId);
      setMachineConfigs(toConfigState(keys, existing?.configs || {}));
      setNewDevice('');
      setActiveTab('private');
      toast.success(existing ? 'May da co trong danh sach' : 'Da them may ' + deviceId);
      await fetchConfigs();
    } catch (err) {
      toast.error(err.message || 'Them may that bai');
    } finally {
      setAddingMachine(false);
    }
  };

  const saveCommon = async () => {
    setSavingCommon(true);
    try {
      await machineApiConfigsApi.save('__COMMON__', common);
      toast.success('Da luu API dung chung');
      fetchConfigs();
    } catch (err) {
      toast.error(err.message || 'Luu API dung chung that bai');
    } finally {
      setSavingCommon(false);
    }
  };

  const openEditMachine = (machine) => {
    setSelectedDevice(machine.device_id);
    setMachineConfigs(toConfigState(keys, machine.configs || {}));
    setEditDevice(machine.device_id);
    setEditDeviceName(machine.device_id);
    setEditConfigs(toConfigState(keys, machine.configs || {}));
  };

  const saveEditMachine = async () => {
    if (!editDevice) return;
    const nextDevice = editDeviceName.trim();
    if (!nextDevice) {
      toast.error('Nhap ten may truoc');
      return;
    }
    setSavingEdit(true);
    try {
      await machineApiConfigsApi.save(nextDevice, editConfigs);
      if (nextDevice !== editDevice) {
        await machineApiConfigsApi.deleteMachine(editDevice);
      }
      toast.success('Da luu API cho may ' + nextDevice);
      setSelectedDevice(nextDevice);
      setMachineConfigs(toConfigState(keys, editConfigs));
      setEditDevice('');
      setEditDeviceName('');
      setEditConfigs({});
      fetchConfigs();
    } catch (err) {
      toast.error(err.message || 'Luu API may that bai');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteMachine = async (deviceId) => {
    if (!confirm('Xoa toan bo cau hinh cua may ' + deviceId + '?')) return;
    try {
      await machineApiConfigsApi.deleteMachine(deviceId);
      toast.success('Da xoa cau hinh may');
      if (selectedDevice === deviceId) {
        setSelectedDevice('');
        setMachineConfigs(toConfigState(keys));
      }
      fetchConfigs();
    } catch (err) {
      toast.error(err.message || 'Xoa cau hinh may that bai');
    }
  };

  const configuredCount = (configs = {}) => keys.reduce((sum, key) => sum + (String(configs[key] || '').trim() ? 1 : 0), 0);
  const mergedPreview = keys.reduce((acc, key) => {
    acc[key] = machineConfigs[key] || common[key] || '';
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p style={{ color: '#64748b', fontSize: '.9rem', margin: '.25rem 0 0' }}>{text.subtitle}</p>
        </div>
        <PrimaryButton onClick={fetchConfigs} disabled={loading}>{loading ? text.loading : text.refresh}</PrimaryButton>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(180px, 260px) auto', gap: '.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ ...styles.label, display: 'block', marginBottom: '.35rem' }}>{text.addMachine}</label>
            <input
              value={newDevice}
              onChange={(event) => setNewDevice(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleAddMachine()}
              placeholder="Reg1, May15..."
              style={styles.input}
            />
          </div>
          <div>
            <label style={{ ...styles.label, display: 'block', marginBottom: '.35rem' }}>{text.apiKey}</label>
            <input value={authService.getUsername()} readOnly style={{ ...styles.input, background: '#f8fafc', color: '#64748b', fontWeight: 800 }} />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <PrimaryButton onClick={handleAddMachine} disabled={addingMachine} color="#10b981">
              {addingMachine ? text.saving : text.addMachine}
            </PrimaryButton>
          </div>
        </div>
      </div>

      <div style={{ ...styles.section, marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {[
              ['common', text.common, '#0ea5e9'],
              ['private', text.private, '#10b981'],
            ].map(([tab, label, color]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  border: activeTab === tab ? 'none' : '1px solid #cbd5e1',
                  background: activeTab === tab ? color : '#fff',
                  color: activeTab === tab ? '#fff' : '#0f172a',
                  borderRadius: 8,
                  padding: '.7rem 1.1rem',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                {label}
                <span style={{ marginLeft: '.5rem', padding: '.12rem .45rem', borderRadius: 999, background: activeTab === tab ? 'rgba(255,255,255,.22)' : '#e2e8f0' }}>
                  {tab === 'common' ? configuredCount(common) : machines.length}
                </span>
              </button>
            ))}
          </div>
          {activeTab === 'common' && (
            <PrimaryButton onClick={saveCommon} disabled={savingCommon} color="#0ea5e9">
              {savingCommon ? text.saving : text.save}
            </PrimaryButton>
          )}
        </div>

        {activeTab === 'private' && (
          <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.7rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{text.machineList}</h3>
                <div style={{ marginTop: '.25rem', color: '#64748b', fontSize: '.78rem' }}>
                  {filteredMachines.length}/{machines.length} may - {keys.length} key API
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={machineSearch}
                  onChange={(event) => setMachineSearch(event.target.value)}
                  placeholder="Tim may..."
                  style={{ ...styles.input, width: 180, padding: '.52rem .7rem' }}
                />
                <div style={{ color: '#64748b', fontSize: '.82rem' }}>
                  Bam icon sua de sua ten may va API rieng
                </div>
              </div>
            </div>
            <div style={{ border: '1px solid #dbe3ef', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '34%' }}>Ten may</th>
                      <th>Da set</th>
                      <th>Cap nhat</th>
                      <th style={{ width: 120, textAlign: 'center' }}>Thao tac</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMachines.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                          Chua co may nao - hay them may o ben tren
                        </td>
                      </tr>
                    )}
                    {filteredMachines.map((machine) => (
                      <tr key={machine.device_id} style={{ background: selectedDevice === machine.device_id ? 'rgba(16,185,129,.08)' : undefined }}>
                        <td style={{ fontWeight: 900, color: '#0f172a' }}>{machine.device_id}</td>
                        <td style={{ color: '#7c3aed', fontWeight: 900 }}>{configuredCount(machine.configs)}/{keys.length}</td>
                        <td style={{ color: '#64748b', fontSize: '.78rem' }}>{fmt(machine.updated_at)}</td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => openEditMachine(machine)}
                            title="Sua cau hinh rieng"
                            style={{ border: '1px solid rgba(14,165,233,.25)', background: '#e0f2fe', color: '#0369a1', borderRadius: 7, width: 34, height: 32, cursor: 'pointer', fontWeight: 900, marginRight: '.35rem' }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => deleteMachine(machine.device_id)}
                            title="Xoa cau hinh rieng"
                            style={{ border: '1px solid rgba(239,68,68,.25)', background: '#fee2e2', color: '#dc2626', borderRadius: 7, width: 34, height: 32, cursor: 'pointer', fontWeight: 900 }}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        )}

        {activeTab === 'common' && (
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>{text.common}</h3>
                <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: '.25rem' }}>{text.commonHint}</div>
              </div>
            </div>
            <ApiRows
              keys={keys}
              configs={common}
              common={common}
              mode={activeTab}
              onChange={(key, value) => setCommon((prev) => ({ ...prev, [key]: value }))}
            />
          </div>
        )}
      </div>


      {editDevice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: 'min(980px, 96vw)', maxHeight: '88vh', overflow: 'hidden', background: '#fff', borderRadius: 10, boxShadow: '0 24px 60px rgba(15,23,42,.25)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem' }}>Sua may: {editDevice}</h3>
                <div style={{ marginTop: '.25rem', color: '#64748b', fontSize: '.78rem' }}>Doi ten may va set API rieng. De trong config neu muon dung API chung.</div>
              </div>
              <button
                onClick={() => { setEditDevice(''); setEditDeviceName(''); setEditConfigs({}); }}
                style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: 8, width: 36, height: 34, cursor: 'pointer', fontWeight: 900 }}
                title="Dong"
              >
                {'\u00D7'}
              </button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ ...styles.label, display: 'block', marginBottom: '.35rem' }}>Ten may</label>
                <input
                  value={editDeviceName}
                  onChange={(event) => setEditDeviceName(event.target.value)}
                  placeholder="Reg1, May15..."
                  style={styles.input}
                />
              </div>
              <ApiRows
                keys={keys}
                configs={editConfigs}
                common={common}
                mode="private"
                onChange={(key, value) => setEditConfigs((prev) => ({ ...prev, [key]: value }))}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem', padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button
                onClick={() => { setEditDevice(''); setEditDeviceName(''); setEditConfigs({}); }}
                style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: 8, padding: '.62rem 1rem', cursor: 'pointer', fontWeight: 800 }}
              >
                Dong
              </button>
              <PrimaryButton onClick={saveEditMachine} disabled={savingEdit} color="#10b981">
                {savingEdit ? text.saving : text.save}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
