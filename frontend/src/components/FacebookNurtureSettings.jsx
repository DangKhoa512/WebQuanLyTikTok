import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useSettingsData } from './SettingsData';
import { SettingsCard, SettingsModal, NumberField } from './SettingsPrimitives';
import { MinMaxField, TextField } from './SettingsFields';
import { ScenarioActivity, ScenarioSelector } from './ScenarioSettings';
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

const FacebookNurtureSettings = forwardRef(function FacebookNurtureSettings({ onStateChange, externalSaving = false }, ref) {
  const { loadSettings, saveSettings } = useSettingsData();
  const [settings, setSettings] = useState({ active_scenario_id: null, cooldown_hours: 24, generator_config: emptyGeneratorConfig(), scenarios: [] });
  const [savedSettings, setSavedSettings] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatorCount, setGeneratorCount] = useState(10);
  const [generatorMinMinutes, setGeneratorMinMinutes] = useState(15);
  const [generatorMaxMinutes, setGeneratorMaxMinutes] = useState(30);
  const [generatorSetupOpen, setGeneratorSetupOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setLoadError('');
    loadSettings('getFacebookNurture')
      .then((res) => {
        if (!mounted) return;
        const value = res.data?.settings || { active_scenario_id: null, cooldown_hours: 24, generator_config: emptyGeneratorConfig(), scenarios: [] };
        if (!value.generator_config) value.generator_config = emptyGeneratorConfig();
        setSettings(value);
        setSavedSettings(JSON.parse(JSON.stringify(value)));
        setSelectedId(value.active_scenario_id || value.scenarios?.[0]?.id || '');
      })
      .catch(() => mounted && setLoadError('Không tải được cấu hình nuôi Facebook. Vui lòng thử lại.'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [reload]);

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
      const res = await saveSettings('updateFacebookNurture', nextSettings);
      const saved = res.data?.settings || nextSettings;
      setSettings(saved);
      setSavedSettings(JSON.parse(JSON.stringify(saved)));
      setSelectedId(generated[0].id);
      setGeneratorSetupOpen(false);
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
      const res = await saveSettings('updateFacebookNurture', nextSettings);
      const saved = res.data?.settings || nextSettings;
      setSettings(saved);
      setSavedSettings(JSON.parse(JSON.stringify(saved)));
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
      const res = await saveSettings('updateFacebookNurture', settings);
      const saved = res.data?.settings || settings;
      setSettings(saved);
      setSavedSettings(JSON.parse(JSON.stringify(saved)));
      setSelectedId((current) => (
        saved.scenarios.some((scenario) => scenario.id === current)
          ? current
          : saved.active_scenario_id || saved.scenarios[0]?.id || ''
      ));
      toast.success('Đã lưu cấu hình nuôi Facebook');
      return true;
    } catch (err) {
      toast.error(err.message || 'Lưu cấu hình nuôi Facebook thất bại');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const dirty = savedSettings !== null && JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const activeName = settings.scenarios.find((item) => item.id === settings.active_scenario_id)?.name || '';
  useEffect(() => { onStateChange?.({ dirty, saving, loading, activeName }); }, [dirty, saving, loading, activeName, onStateChange]);
  useImperativeHandle(ref, () => ({ save, discard: () => {
    if (!savedSettings) return;
    setSettings(JSON.parse(JSON.stringify(savedSettings)));
    setSelectedId(savedSettings.active_scenario_id || savedSettings.scenarios[0]?.id || '');
  } }));
  const busy = saving || externalSaving;
  const renderActions = (actions, update, generator = false) => [...actionRows, ...targetActionRows].map((row) => {
    const action = actions[row.key] || emptyActions()[row.key];
    const timeOnly = generator && ['newfeed','reels'].includes(row.key);
    const targets = row.field ? (action[row.field] || []) : null;
    return <ScenarioActivity key={row.key} label={row.label} enabled={action.enabled} onToggle={(value) => update(row.key,'enabled',value)}>
      {timeOnly ? <p className="settings-helper">Chia theo tổng thời gian phiên.</p> : <MinMaxField min={action.min} max={action.max} unit={row.unit || 'mục'} maximum={targets ? targets.length : undefined} disabled={!action.enabled} onChange={(bound,value) => update(row.key,bound,value)} />}
      {targets && <TextField label={`Danh sách ${row.itemLabel} (${targets.length})`} multiline rows={4} disabled={!action.enabled} value={targets.join('\n')} placeholder={row.placeholder} onChange={(e) => update(row.key,row.field,e.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />}
    </ScenarioActivity>;
  });
  if (loading) return <div className="settings-loading" aria-busy="true">Đang tải kịch bản nuôi Facebook...</div>;
  if (loadError) return <div className="settings-error" role="alert">{loadError}<button className="settings-button secondary" onClick={() => setReload((old) => old + 1)}>Thử lại</button></div>;
  return <SettingsCard id="fb-nurture" title="Kịch bản nuôi Facebook" description="Chọn kịch bản điện thoại sẽ lấy qua API và điều chỉnh từng hoạt động." action={<span className="settings-badge">{settings.scenarios.length} / 50 kịch bản</span>}>
    <fieldset className="settings-workspace" disabled={busy}>
      <ScenarioSelector scenarios={settings.scenarios} selectedId={selectedId} activeId={settings.active_scenario_id} onSelect={setSelectedId} onCreate={addScenario} onGenerate={() => setGeneratorSetupOpen(true)} />
      {!selected && <div className="settings-empty">Chưa có kịch bản. Tạo kịch bản mới hoặc dùng trình tạo nhanh để bắt đầu.</div>}
      {selected && <>
        <div className="settings-scenario-heading"><TextField label="Tên kịch bản" value={selected.name} maxLength={100} onChange={(e) => updateScenario((scenario) => ({ ...scenario, name:e.target.value }))} />{settings.active_scenario_id === selected.id ? <span className="settings-badge success">● Đang sử dụng</span> : <button className="settings-button secondary" onClick={() => setSettings((old) => ({ ...old, active_scenario_id:selected.id }))}>Sử dụng kịch bản</button>}</div>
        <div className="settings-duration">Tổng thời gian <strong>{(selectedDuration.min / 60).toFixed(1)} – {(selectedDuration.max / 60).toFixed(1)} phút</strong><span>Newfeed + Reels; không tính hành động theo số lượng</span></div>
        <div className="settings-activities">{renderActions(selected.actions, updateAction)}</div>
        <div className="settings-nurture-footer"><span className={dirty ? 'settings-unsaved' : 'settings-helper'}>{dirty ? 'Kịch bản có thay đổi chưa lưu' : 'Đã đồng bộ kịch bản'}</span><button className="settings-button danger" onClick={removeScenario}>Xóa kịch bản</button></div>
      </>}
    </fieldset>
    {generatorSetupOpen && <SettingsModal title="Tạo nhanh kịch bản Facebook" onClose={() => { if (!busy) setGeneratorSetupOpen(false); }}>
      <p className="settings-helper">Tạo và lưu kịch bản từ các tính năng bên dưới. Kịch bản cũ được giữ nguyên; thao tác này cũng lưu các chỉnh sửa kịch bản hiện tại.</p>
      <fieldset className="settings-workspace" disabled={busy}>
        <NumberField label="Số kịch bản" min={1} max={50} unit="kịch bản" value={generatorCount} onChange={(e) => setGeneratorCount(e.target.value)} />
        <MinMaxField minLabel="Tổng thời gian Min" maxLabel="Tổng thời gian Max" min={generatorMinMinutes} max={generatorMaxMinutes} minimum={1} maximum={1440} unit="phút" onChange={(bound,value) => bound === 'min' ? setGeneratorMinMinutes(value) : setGeneratorMaxMinutes(value)} />
        <p className="settings-helper">Setup tính năng ngẫu nhiên ({generatorEnabledCount}/7)</p>
        <div className="settings-activities">{renderActions(generatorSetupActions,updateGeneratorAction,true)}</div>
        <footer className="settings-button-group"><button className="settings-button ghost" onClick={() => setGeneratorSetupOpen(false)}>Đóng</button><button className="settings-button secondary" onClick={save}>Lưu setup tính năng</button><button className="settings-button primary" onClick={generateRandomScenarios}>{saving ? 'Đang tạo...' : 'Tạo và lưu ngẫu nhiên'}</button></footer>
      </fieldset>
    </SettingsModal>}
  </SettingsCard>;
});
export default FacebookNurtureSettings;
