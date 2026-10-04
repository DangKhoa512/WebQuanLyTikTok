import { useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../services/api';
import { toast } from './Toast';

const emptyActions = () => ({
  newfeed: { enabled: false, min: 30, max: 60 },
  reels: { enabled: false, min: 20, max: 40 },
  like_newfeed: { enabled: false, min: 1, max: 3 },
  friend_request: { enabled: false, min: 1, max: 3 },
  accept_friend: { enabled: false, min: 1, max: 3 },
  join_groups: { enabled: false, min: 1, max: 1, links: [] },
  like_pages: { enabled: false, min: 1, max: 1, page_uids: [] },
});

const emptyGeneratorConfig = () => ({
  actions: {
    ...emptyActions(),
    newfeed: { enabled: true },
    reels: { enabled: true },
    like_newfeed: { enabled: true, min: 1, max: 3 },
  },
});

const actionRows = [
  { key: 'newfeed', label: 'Lướt bảng tin', unit: 'giây' },
  { key: 'reels', label: 'Xem Reels', unit: 'giây' },
  { key: 'like_newfeed', label: 'Thích bài viết', unit: 'lượt' },
  { key: 'friend_request', label: 'Kết bạn ngẫu nhiên', unit: 'người' },
  { key: 'accept_friend', label: 'Đồng ý kết bạn', unit: 'người' },
];

const targetActionRows = [
  { key: 'join_groups', label: 'Tham gia nhóm', field: 'links', itemLabel: 'link nhóm', placeholder: 'https://www.facebook.com/groups/...\nhttps://www.facebook.com/groups/...' },
  { key: 'like_pages', label: 'Like Page', field: 'page_uids', itemLabel: 'UID Page', placeholder: '1000123456789\n1000987654321' },
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
const randomCountAction = (action = {}) => {
  const configuredMin = Math.max(parseInt(action.min, 10) || 0, 0);
  const configuredMax = Math.max(parseInt(action.max, 10) || configuredMin, configuredMin);
  const min = randomInt(configuredMin, configuredMax);
  return { enabled: action.enabled === true, min, max: randomInt(min, configuredMax) };
};

const validateGeneratorSetup = (actions = {}) => {
  if (!actions.newfeed?.enabled && !actions.reels?.enabled) {
    return 'Setup ngẫu nhiên cần bật Lướt bảng tin hoặc Xem Reels';
  }
  for (const row of [...actionRows.filter((item) => !['newfeed', 'reels'].includes(item.key)), ...targetActionRows]) {
    const action = actions[row.key];
    if (!action?.enabled) continue;
    const min = parseInt(action.min, 10);
    const max = parseInt(action.max, 10);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      return `Khoảng min/max của ${row.label} không hợp lệ`;
    }
    if (row.field) {
      const targets = Array.isArray(action[row.field]) ? action[row.field] : [];
      if (!targets.length || max > targets.length) {
        return `${row.label} cần danh sách và Max không lớn hơn số mục hiện có`;
      }
    }
  }
  return null;
};

export default function FacebookNurtureSettings() {
  const [settings, setSettings] = useState({ active_scenario_id: null, cooldown_hours: 24, generator_config: emptyGeneratorConfig(), scenarios: [] });
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatorCount, setGeneratorCount] = useState(10);
  const [generatorMinMinutes, setGeneratorMinMinutes] = useState(15);
  const [generatorMaxMinutes, setGeneratorMaxMinutes] = useState(30);
  const [generatorSetupOpen, setGeneratorSetupOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    settingsApi.getFacebookNurture()
      .then((res) => {
        if (!mounted) return;
        const value = res.data?.settings || { active_scenario_id: null, cooldown_hours: 24, generator_config: emptyGeneratorConfig(), scenarios: [] };
        if (!value.generator_config) value.generator_config = emptyGeneratorConfig();
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
  const generatorSetupActions = settings.generator_config?.actions || emptyGeneratorConfig().actions;
  const generatorEnabledCount = Object.values(generatorSetupActions).filter((action) => action?.enabled).length;

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

  const updateGeneratorAction = (actionKey, field, value) => {
    setSettings((current) => {
      const generatorConfig = current.generator_config || emptyGeneratorConfig();
      const action = generatorConfig.actions?.[actionKey] || emptyGeneratorConfig().actions[actionKey];
      return {
        ...current,
        generator_config: {
          ...generatorConfig,
          actions: {
            ...generatorConfig.actions,
            [actionKey]: { ...action, [field]: value },
          },
        },
      };
    });
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
    const generatorConfig = settings.generator_config || emptyGeneratorConfig();
    const generatorActions = generatorConfig.actions || emptyGeneratorConfig().actions;
    const generatorError = validateGeneratorSetup(generatorActions);
    if (generatorError) {
      toast.error(generatorError);
      return;
    }

    const generatedAt = Date.now();
    const totalMinSeconds = minMinutes * 60;
    const totalMaxSeconds = maxMinutes * 60;
    const generated = Array.from({ length: count }, (_, index) => {
      const newfeedEnabled = generatorActions.newfeed?.enabled === true;
      const reelsEnabled = generatorActions.reels?.enabled === true;

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

      const actions = {
        ...emptyActions(),
        newfeed: { enabled: newfeedEnabled, min: newfeedMin, max: newfeedMax },
        reels: { enabled: reelsEnabled, min: reelsMin, max: reelsMax },
        like_newfeed: randomCountAction(generatorActions.like_newfeed),
        friend_request: randomCountAction(generatorActions.friend_request),
        accept_friend: randomCountAction(generatorActions.accept_friend),
        join_groups: { ...randomCountAction(generatorActions.join_groups), links: [...(generatorActions.join_groups?.links || [])] },
        like_pages: { ...randomCountAction(generatorActions.like_pages), page_uids: [...(generatorActions.like_pages?.page_uids || [])] },
      };
      return {
        id: `auto-${generatedAt}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Kịch bản ${minMinutes}-${maxMinutes} phút #${settings.scenarios.length + index + 1}`,
        actions,
      };
    });
    const nextSettings = {
      ...settings,
      active_scenario_id: settings.active_scenario_id || generated[0].id,
      cooldown_hours: settings.cooldown_hours || 24,
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

  const removeScenario = async () => {
    if (!selected || saving || !confirm(`Xóa ${selected.name}?`)) return;
    const remaining = settings.scenarios.filter((scenario) => scenario.id !== selected.id);
    const nextSettings = {
      ...settings,
      active_scenario_id: settings.active_scenario_id === selected.id
        ? remaining[0]?.id || null
        : settings.active_scenario_id,
      scenarios: remaining,
    };
    setSaving(true);
    try {
      const res = await settingsApi.updateFacebookNurture(nextSettings);
      const saved = res.data?.settings || nextSettings;
      setSettings(saved);
      setSelectedId(saved.active_scenario_id || saved.scenarios[0]?.id || '');
      toast.success('Đã xóa kịch bản');
    } catch (err) {
      toast.error(err.message || 'Xóa kịch bản thất bại');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const generatorError = validateGeneratorSetup(settings.generator_config?.actions || emptyGeneratorConfig().actions);
    if (generatorError) {
      toast.error(generatorError);
      return;
    }
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
      for (const row of targetActionRows) {
        const action = scenario.actions[row.key];
        const targets = Array.isArray(action?.[row.field]) ? action[row.field] : [];
        if (action?.enabled && targets.length === 0) {
          toast.error(`${row.label} cần ít nhất một ${row.itemLabel}`);
          return;
        }
        if (action?.enabled && parseInt(action.max, 10) > targets.length) {
          toast.error(`Max của ${row.label} không được lớn hơn ${targets.length} ${row.itemLabel}`);
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
            Chọn các tính năng trong Setup, nhập khoảng số lượng và danh sách đích. Web sẽ tạo kịch bản ngẫu nhiên từ cấu hình đó.
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
          <button
            type={'button'}
            onClick={() => setGeneratorSetupOpen((open) => !open)}
            style={{ width: '100%', marginBottom: '.65rem', background: generatorSetupOpen ? '#1e293b' : '#fff', color: generatorSetupOpen ? '#fff' : '#334155', border: '1px solid #94a3b8', borderRadius: 8, padding: '.58rem .8rem', cursor: 'pointer', fontWeight: 800 }}
          >
            ⚙ Setup tính năng ngẫu nhiên ({generatorEnabledCount}/7) {generatorSetupOpen ? '▲' : '▼'}
          </button>
          {generatorSetupOpen && <div style={{ marginBottom: '.75rem', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
            {['newfeed', 'reels'].map((key, index) => {
              const labels = { newfeed: 'Lướt bảng tin', reels: 'Xem Reels' };
              const action = generatorSetupActions[key] || { enabled: true };
              return <label key={key} style={{ display: 'flex', gap: '.55rem', alignItems: 'center', padding: '.75rem', borderTop: index ? '1px solid #e2e8f0' : 0, color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}>
                <input type={'checkbox'} checked={action.enabled} onChange={(event) => updateGeneratorAction(key, 'enabled', event.target.checked)} />
                {labels[key]} <span style={{ color: '#64748b', fontSize: '.72rem', fontWeight: 600 }}>(chia theo tổng thời gian phiên)</span>
              </label>;
            })}
            {actionRows.filter((row) => !['newfeed', 'reels'].includes(row.key)).map((row) => {
              const action = generatorSetupActions[row.key] || emptyGeneratorConfig().actions[row.key];
              return <div key={row.key} style={{ padding: '.75rem', borderTop: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', gap: '.55rem', alignItems: 'center', color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}>
                  <input type={'checkbox'} checked={action.enabled} onChange={(event) => updateGeneratorAction(row.key, 'enabled', event.target.checked)} />
                  {row.label}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginTop: '.55rem', opacity: action.enabled ? 1 : .5 }}>
                  <input aria-label={`Min ${row.label}`} type={'number'} min={0} disabled={!action.enabled} value={action.min} onChange={(event) => updateGeneratorAction(row.key, 'min', event.target.value)} style={inputStyle} placeholder={'Min'} />
                  <input aria-label={`Max ${row.label}`} type={'number'} min={0} disabled={!action.enabled} value={action.max} onChange={(event) => updateGeneratorAction(row.key, 'max', event.target.value)} style={inputStyle} placeholder={'Max'} />
                </div>
              </div>;
            })}
            {targetActionRows.map((row) => {
              const action = generatorSetupActions[row.key] || emptyGeneratorConfig().actions[row.key];
              const targets = Array.isArray(action[row.field]) ? action[row.field] : [];
              return <div key={row.key} style={{ padding: '.75rem', borderTop: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', gap: '.55rem', alignItems: 'center', color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}>
                  <input type={'checkbox'} checked={action.enabled} onChange={(event) => updateGeneratorAction(row.key, 'enabled', event.target.checked)} />
                  {row.label}
                </label>
                <textarea
                  disabled={!action.enabled}
                  value={targets.join('\n')}
                  onChange={(event) => updateGeneratorAction(row.key, row.field, event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))}
                  placeholder={row.placeholder}
                  rows={3}
                  style={{ ...inputStyle, marginTop: '.55rem', resize: 'vertical', fontFamily: 'monospace', opacity: action.enabled ? 1 : .5 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginTop: '.55rem', opacity: action.enabled ? 1 : .5 }}>
                  <input aria-label={`Min ${row.label}`} type={'number'} min={0} max={targets.length || 0} disabled={!action.enabled} value={action.min} onChange={(event) => updateGeneratorAction(row.key, 'min', event.target.value)} style={inputStyle} placeholder={'Min'} />
                  <input aria-label={`Max ${row.label}`} type={'number'} min={0} max={targets.length || 0} disabled={!action.enabled} value={action.max} onChange={(event) => updateGeneratorAction(row.key, 'max', event.target.value)} style={inputStyle} placeholder={'Max'} />
                </div>
                <div style={{ color: '#64748b', fontSize: '.7rem', marginTop: '.3rem' }}>{targets.length} {row.itemLabel}</div>
              </div>;
            })}
            <div style={{ padding: '.75rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button
                type={'button'}
                onClick={save}
                disabled={saving}
                style={{ width: '100%', background: saving ? '#64748b' : '#0f766e', border: 'none', color: '#fff', borderRadius: 8, padding: '.58rem .8rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}
              >
                {saving ? 'Đang lưu...' : 'Lưu setup tính năng'}
              </button>
            </div>
          </div>}
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
            {' '}(không tính các hành động theo số lượng)
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            {actionRows.map((row, index) => {
              const action = selected.actions[row.key] || emptyActions()[row.key];
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
            {targetActionRows.map((row, rowIndex) => {
              const action = selected.actions[row.key] || emptyActions()[row.key];
              const targets = Array.isArray(action[row.field]) ? action[row.field] : [];
              const index = actionRows.length + rowIndex;
              return (
                <div key={row.key} style={{ padding: '.9rem', borderTop: '1px solid #e2e8f0', background: index % 2 ? '#f8fafc' : '#fff' }}>
                  <label style={{ display: 'flex', gap: '.55rem', alignItems: 'center', color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}>
                    <input type={'checkbox'} checked={action.enabled} onChange={(event) => updateAction(row.key, 'enabled', event.target.checked)} />
                    {row.label}
                  </label>
                  <div style={{ marginTop: '.7rem', opacity: action.enabled ? 1 : .5 }}>
                    <label style={{ color: '#475569', fontSize: '.76rem', fontWeight: 600 }}>
                      Danh sách {row.itemLabel} ({targets.length})
                      <textarea
                        disabled={!action.enabled}
                        value={targets.join('\n')}
                        onChange={(event) => updateAction(row.key, row.field, event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))}
                        placeholder={row.placeholder}
                        rows={4}
                        style={{ ...inputStyle, marginTop: '.3rem', resize: 'vertical', fontFamily: 'monospace', fontWeight: 600 }}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem', marginTop: '.7rem' }}>
                      <label style={{ color: '#475569', fontSize: '.76rem', fontWeight: 600 }}>
                        Min (số lượng)
                        <input type={'number'} min={0} max={targets.length || 0} disabled={!action.enabled} value={action.min} onChange={(event) => updateAction(row.key, 'min', event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
                      </label>
                      <label style={{ color: '#475569', fontSize: '.76rem', fontWeight: 600 }}>
                        Max (số lượng)
                        <input type={'number'} min={0} max={targets.length || 0} disabled={!action.enabled} value={action.max} onChange={(event) => updateAction(row.key, 'max', event.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }} />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', marginTop: '1rem' }}>
            <button onClick={removeScenario} disabled={saving} style={{ background: '#fff1f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '.58rem .9rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {saving ? 'Đang xử lý...' : 'Xóa kịch bản'}
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
