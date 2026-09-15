import { useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../services/api';
import { toast } from './Toast';

const emptyActions = () => ({
  newfeed: { enabled: false, min: 30, max: 60 },
  reels: { enabled: false, min: 20, max: 40 },
  like_newfeed: { enabled: false, min: 1, max: 3 },
});

const actionRows = [
  { key: 'newfeed', label: 'Lướt bảng tin', unit: 'giây' },
  { key: 'reels', label: 'Xem Reels', unit: 'giây' },
  { key: 'like_newfeed', label: 'Thích bài viết', unit: 'lượt' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#fff', color: '#0f172a',
  border: '1px solid #cbd5e1', borderRadius: 8, padding: '.6rem .7rem', fontWeight: 700,
  fontFamily: "'Segoe UI', Arial, sans-serif", outline: 'none',
};

const cardStyle = {
  padding: '1.1rem', border: '1px solid #dbe3ef', color: '#0f172a',
  fontFamily: "'Segoe UI', Arial, sans-serif",
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default function FacebookNurtureSettings() {
  const [settings, setSettings] = useState({ active_scenario_id: null, scenarios: [] });
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatorCount, setGeneratorCount] = useState(10);
  const [generatorMinMinutes, setGeneratorMinMinutes] = useState(15);
  const [generatorMaxMinutes, setGeneratorMaxMinutes] = useState(30);

  useEffect(() => {
    let mounted = true;
    settingsApi.getFacebookNurture()
      .then((res) => {
        if (!mounted) return;
        const value = res.data?.settings || { active_scenario_id: null, scenarios: [] };
        setSettings(value);
        setSelectedId(value.active_scenario_id || value.scenarios?.[0]?.id || '');
      })
      .catch((err) => toast.error(err.message || 'Không tải được cấu hình nuôi Facebook'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const selected = useMemo(
    () => settings.scenarios.find((scenario) => scenario.id === selectedId) || null,
    [settings.scenarios, selectedId]
  );
  const selectedDuration = useMemo(() => {
    if (!selected) return { min: 0, max: 0 };
    return ['newfeed', 'reels'].reduce((total, key) => {
      const action = selected.actions[key];
      if (!action?.enabled) return total;
      total.min += parseInt(action.min, 10) || 0;
      total.max += parseInt(action.max, 10) || 0;
      return total;
    }, { min: 0, max: 0 });
  }, [selected]);

  const addScenario = () => {
    const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const scenario = {
      id,
      name: `Kịch bản ${settings.scenarios.length + 1}`,
      actions: emptyActions(),
    };
    setSettings((current) => ({ ...current, scenarios: [...current.scenarios, scenario] }));
    setSelectedId(id);
  };

  const generateRandomScenarios = async () => {
    const count = parseInt(generatorCount, 10);
    const minMinutes = parseInt(generatorMinMinutes, 10);
    const maxMinutes = parseInt(generatorMaxMinutes, 10);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      toast.error('Số kịch bản cần tạo phải từ 1 đến 50');
      return;
    }
    if (!Number.isInteger(minMinutes) || !Number.isInteger(maxMinutes)
      || minMinutes < 1 || maxMinutes < minMinutes || maxMinutes > 1440) {
      toast.error('Thời gian phải từ 1 đến 1440 phút và Max không nhỏ hơn Min');
      return;
    }
    const availableSlots = 50 - settings.scenarios.length;
    if (availableSlots <= 0) {
      toast.error('Đã đạt tối đa 50 kịch bản');
      return;
    }
    if (count > availableSlots) {
      toast.error(`Chỉ còn có thể tạo thêm ${availableSlots} kịch bản`);
      return;
    }

    const generatedAt = Date.now();
    const totalMinSeconds = minMinutes * 60;
    const totalMaxSeconds = maxMinutes * 60;
    const generated = Array.from({ length: count }, (_, index) => {
      let newfeedEnabled = Math.random() < .8;
      let reelsEnabled = Math.random() < .65;
      if (!newfeedEnabled && !reelsEnabled) newfeedEnabled = true;

      let newfeedMin = 0;
      let newfeedMax = 0;
      let reelsMin = 0;
      let reelsMax = 0;
      if (newfeedEnabled && reelsEnabled) {
        const newfeedRatio = randomInt(55, 75) / 100;
        newfeedMin = Math.round(totalMinSeconds * newfeedRatio);
        newfeedMax = Math.round(totalMaxSeconds * newfeedRatio);
        reelsMin = totalMinSeconds - newfeedMin;
        reelsMax = totalMaxSeconds - newfeedMax;
      } else if (newfeedEnabled) {
        newfeedMin = totalMinSeconds;
        newfeedMax = totalMaxSeconds;
      } else {
        reelsMin = totalMinSeconds;
        reelsMax = totalMaxSeconds;
      }

      const likeMin = randomInt(1, 3);
      const actions = {
        newfeed: { enabled: newfeedEnabled, min: newfeedMin, max: newfeedMax },
        reels: { enabled: reelsEnabled, min: reelsMin, max: reelsMax },
        like_newfeed: { enabled: Math.random() < .35, min: likeMin, max: likeMin + randomInt(0, 3) },
      };
      return {
        id: `auto-${generatedAt}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Kịch bản ${minMinutes}-${maxMinutes} phút #${settings.scenarios.length + index + 1}`,
        actions,
      };
    });
    const nextSettings = {
      active_scenario_id: settings.active_scenario_id || generated[0].id,
      scenarios: [...settings.scenarios, ...generated],
    };

    setSaving(true);
    try {
      const res = await settingsApi.updateFacebookNurture(nextSettings);
      const saved = res.data?.settings || nextSettings;
      setSettings(saved);
      setSelectedId(generated[0].id);
      toast.success(`Đã tạo và lưu ${count} kịch bản ngẫu nhiên`);
    } catch (err) {
      toast.error(err.message || 'Tạo kịch bản ngẫu nhiên thất bại');
    } finally {
      setSaving(false);
    }
  };

  const updateScenario = (updater) => {
    setSettings((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => (
        scenario.id === selectedId ? updater(scenario) : scenario
      )),
    }));
  };

  const updateAction = (actionKey, field, value) => {
    updateScenario((scenario) => ({
      ...scenario,
      actions: {
        ...scenario.actions,
        [actionKey]: { ...scenario.actions[actionKey], [field]: value },
      },
    }));
  };

  const removeScenario = () => {
    if (!selected || !confirm(`Xóa ${selected.name}?`)) return;
    const remaining = settings.scenarios.filter((scenario) => scenario.id !== selected.id);
    setSettings((current) => ({
      ...current,
      active_scenario_id: current.active_scenario_id === selected.id ? null : current.active_scenario_id,
      scenarios: remaining,
    }));
    setSelectedId(remaining[0]?.id || '');
  };

  const save = async () => {
    for (const scenario of settings.scenarios) {
      if (!String(scenario.name || '').trim()) {
        toast.error('Tên kịch bản không được để trống');
        return;
      }
      for (const action of Object.values(scenario.actions)) {
        const min = parseInt(action.min, 10);
        const max = parseInt(action.max, 10);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
          toast.error('Giá trị min/max không hợp lệ');
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res = await settingsApi.updateFacebookNurture(settings);
      const saved = res.data?.settings || settings;
      setSettings(saved);
      setSelectedId((current) => (
        saved.scenarios.some((scenario) => scenario.id === current)
          ? current
          : saved.active_scenario_id || saved.scenarios[0]?.id || ''
      ));
      toast.success('Đã lưu cấu hình nuôi Facebook');
    } catch (err) {
      toast.error(err.message || 'Lưu cấu hình nuôi Facebook thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={'card'} style={{ ...cardStyle, color: '#475569' }}>Đang tải cấu hình nuôi Facebook...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div className={'card'} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', marginBottom: '.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>Cấu hình nuôi Facebook</h3>
            <div style={{ color: '#475569', fontSize: '.8rem', marginTop: '.3rem' }}>
              Tạo nhiều kịch bản và chọn một kịch bản để điện thoại lấy qua API.
            </div>
          </div>
          <button
            onClick={addScenario}
            style={{ background: '#10b981', border: 'none', color: '#fff', borderRadius: 8, padding: '.55rem .8rem', cursor: 'pointer', fontWeight: 800, whiteSpace: 'nowrap' }}
          >
            + Thêm kịch bản
          </button>
        </div>

        {settings.scenarios.length === 0 ? (
          <div style={{ padding: '1.5rem', border: '1px dashed #94a3b8', borderRadius: 8, textAlign: 'center', color: '#475569', background: '#f8fafc' }}>
            Chưa có kịch bản. Bấm “Thêm kịch bản” để bắt đầu.
          </div>
        ) : (
          <>
            <label style={{ color: '#334155', fontSize: '.8rem', fontWeight: 700, display: 'block', marginBottom: '.4rem' }}>Kịch bản đang chỉnh sửa</label>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={inputStyle}>
              {settings.scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}{settings.active_scenario_id === scenario.id ? ' - Đang sử dụng' : ''}
                </option>
              ))}
            </select>
          </>
        )}

        <div style={{ marginTop: '1rem', padding: '.9rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
          <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '.9rem' }}>Tạo nhanh kịch bản ngẫu nhiên</div>
          <div style={{ color: '#475569', fontSize: '.78rem', margin: '.25rem 0 .7rem' }}>
            Nhập tổng thời gian một phiên. Web sẽ chia hợp lý cho Bảng tin và Reels, sau đó lưu ngay.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.6rem', marginBottom: '.65rem' }}>
            <label style={{ color: '#334155', fontSize: '.75rem', fontWeight: 700 }}>
              Số kịch bản
              <input type={'number'} min={1} max={50} value={generatorCount} onChange={(event) => setGeneratorCount(event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
            </label>
            <label style={{ color: '#334155', fontSize: '.75rem', fontWeight: 700 }}>
              Tổng Min (phút)
              <input type={'number'} min={1} max={1440} value={generatorMinMinutes} onChange={(event) => setGeneratorMinMinutes(event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
            </label>
            <label style={{ color: '#334155', fontSize: '.75rem', fontWeight: 700 }}>
              Tổng Max (phút)
              <input type={'number'} min={1} max={1440} value={generatorMaxMinutes} onChange={(event) => setGeneratorMaxMinutes(event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
            </label>
          </div>
          <div>
            <button
              onClick={generateRandomScenarios}
              disabled={saving || settings.scenarios.length >= 50}
              style={{ width: '100%', background: saving ? '#334155' : '#8b5cf6', border: 'none', color: '#fff', borderRadius: 8, padding: '.58rem .8rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}
            >
              {saving ? 'Đang tạo...' : 'Tạo và lưu ngẫu nhiên'}
            </button>
          </div>
          <div style={{ color: '#64748b', fontSize: '.74rem', marginTop: '.5rem' }}>
            Đang có {settings.scenarios.length}/50 kịch bản. Kịch bản cũ không bị xóa.
          </div>
        </div>
      </div>

      {selected && (
        <div className={'card'} style={cardStyle}>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginBottom: '1rem' }}>
            <input
              value={selected.name}
              maxLength={100}
              onChange={(event) => updateScenario((scenario) => ({ ...scenario, name: event.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
              placeholder={'Tên kịch bản'}
            />
            <button
              onClick={() => setSettings((current) => ({ ...current, active_scenario_id: selected.id }))}
              style={{ background: settings.active_scenario_id === selected.id ? '#064e3b' : '#2563eb', border: 'none', color: '#fff', borderRadius: 8, padding: '.55rem .8rem', cursor: 'pointer', fontWeight: 800, whiteSpace: 'nowrap' }}
            >
              {settings.active_scenario_id === selected.id ? 'Đang sử dụng' : 'Sử dụng'}
            </button>
          </div>
          <div style={{ margin: '-.35rem 0 .85rem', color: '#475569', fontSize: '.8rem' }}>
            Tổng thời gian: <b style={{ color: '#0f172a' }}>{(selectedDuration.min / 60).toFixed(1)} - {(selectedDuration.max / 60).toFixed(1)} phút</b>
            {' '}(không tính số lượt thích)
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            {actionRows.map((row, index) => {
              const action = selected.actions[row.key];
              return (
                <div key={row.key} style={{ padding: '.9rem', borderTop: index ? '1px solid #e2e8f0' : 'none', background: index % 2 ? '#f8fafc' : '#fff' }}>
                  <label style={{ display: 'flex', gap: '.55rem', alignItems: 'center', color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}>
                    <input
                      type={'checkbox'}
                      checked={action.enabled}
                      onChange={(event) => updateAction(row.key, 'enabled', event.target.checked)}
                    />
                    {row.label}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem', marginTop: '.7rem', opacity: action.enabled ? 1 : .5 }}>
                    <label style={{ color: '#475569', fontSize: '.76rem', fontWeight: 600 }}>
                      Min ({row.unit})
                      <input type={'number'} min={0} disabled={!action.enabled} value={action.min} onChange={(event) => updateAction(row.key, 'min', event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
                    </label>
                    <label style={{ color: '#475569', fontSize: '.76rem', fontWeight: 600 }}>
                      Max ({row.unit})
                      <input type={'number'} min={0} disabled={!action.enabled} value={action.max} onChange={(event) => updateAction(row.key, 'max', event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', marginTop: '1rem' }}>
            <button onClick={removeScenario} style={{ background: '#fff1f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '.58rem .9rem', cursor: 'pointer', fontWeight: 700 }}>
              Xóa kịch bản
            </button>
            <button onClick={save} disabled={saving} style={{ background: saving ? '#334155' : '#10b981', border: 'none', color: '#fff', borderRadius: 8, padding: '.58rem 1.1rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
              {saving ? 'Đang lưu...' : 'Lưu kịch bản'}
            </button>
          </div>
        </div>
      )}

      {!selected && settings.scenarios.length === 0 && (
        <button onClick={save} disabled={saving} style={{ background: saving ? '#334155' : '#2563eb', border: 'none', color: '#fff', borderRadius: 8, padding: '.65rem 1rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
          {saving ? 'Đang lưu...' : 'Lưu cấu hình trống'}
        </button>
      )}
    </div>
  );
}
