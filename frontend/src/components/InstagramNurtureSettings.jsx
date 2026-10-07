import { emptyCrossAccountFollow, crossAccountFollowError, emptyCrossFollow, normalizeUsernameList, crossFollowError, serializeCrossFollowSettings } from './crossFollowConfig';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useSettingsData } from './SettingsData';
import { ScenarioActivity, ScenarioSelector, ScenarioTargetActivity } from './ScenarioSettings';
import { toast } from './Toast';
import { MinMaxField } from './SettingsFields';
import { SettingsCard, NumberField, SettingsModal } from './SettingsPrimitives';

const emptyActions = () => ({
  cross_follow: emptyCrossFollow(),
  cross_account_follow: emptyCrossAccountFollow(),
  newfeed: { enabled: false, min: 30, max: 60 },
  reels: { enabled: false, min: 20, max: 40 },
  story: { enabled: false, min: 15, max: 30 },
});

const actionRows = [
  { key: 'newfeed', label: 'Lướt Newfeed', unit: 'giây' },
  { key: 'reels', label: 'Xem Reels', unit: 'giây' },
  { key: 'story', label: 'Xem Story (STR)', unit: 'giây' },
];

const emptyGeneratorConfig = () => ({ actions: { ...emptyActions(), ...Object.fromEntries(actionRows.map(row => [row.key, { enabled: true }])) } });
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const InstagramNurtureSettings = forwardRef(function InstagramNurtureSettings({ onStateChange, externalSaving = false }, ref) {
  const { loadSettings, saveSettings } = useSettingsData();
  const [settings, setSettings] = useState({ active_scenario_id: null, cooldown_hours: 24, scenarios: [] });
  const generatorActions = settings.generator_config?.actions || emptyGeneratorConfig().actions;
  const updateGenerator = (key, field, value) => setSettings(current => ({ ...current, generator_config: { actions: { ...(current.generator_config?.actions || emptyGeneratorConfig().actions), [key]: { ...(current.generator_config?.actions || emptyGeneratorConfig().actions)[key], [field]: value } } } }));
  const [savedSettings, setSavedSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatorCount, setGeneratorCount] = useState(10);
  const [generatorMinMinutes, setGeneratorMinMinutes] = useState(15);
  const [generatorMaxMinutes, setGeneratorMaxMinutes] = useState(30);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setLoadError('');
    loadSettings('getInstagramNurture')
      .then((res) => {
        if (!mounted) return;
        const value = res.data?.settings || { active_scenario_id: null, cooldown_hours: 24, scenarios: [] };
        setSettings(value);
        setSavedSettings(JSON.parse(JSON.stringify(value)));
        setSelectedId(value.active_scenario_id || value.scenarios?.[0]?.id || '');
      })
      .catch((err) => { if (mounted) setLoadError(err.message || 'Không tải được cấu hình nuôi Instagram'); })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [reload]);

  const selected = useMemo(
    () => settings.scenarios.find((scenario) => scenario.id === selectedId) || null,
    [settings.scenarios, selectedId]
  );
  const selectedDuration = useMemo(() => {
    if (!selected) return { min: 0, max: 0 };
    return ['newfeed', 'reels', 'story'].reduce((total, key) => {
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
    if (!validate()) return;
    if (!actionRows.some(row => generatorActions[row.key]?.enabled)) { toast.error('Bật ít nhất một hoạt động theo thời gian'); return; }
    const setupError = crossFollowError(generatorActions.cross_follow) || crossAccountFollowError(generatorActions.cross_account_follow);
    if (setupError) { toast.error(setupError); return; }
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
      const enabledKeys = actionRows.filter(row => generatorActions[row.key]?.enabled).map(row => row.key);
      const weights = Object.fromEntries(enabledKeys.map((key) => [key, randomInt(20, 100)]));
      const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
      const allocate = (totalSeconds) => {
        let remaining = totalSeconds;
        return Object.fromEntries(enabledKeys.map((key, keyIndex) => {
          const seconds = keyIndex === enabledKeys.length - 1
            ? remaining
            : Math.max(Math.round(totalSeconds * weights[key] / weightTotal), 1);
          remaining -= seconds;
          return [key, Math.max(seconds, 0)];
        }));
      };
      const minTimes = allocate(totalMinSeconds);
      const maxTimes = allocate(totalMaxSeconds);
      const actions = Object.fromEntries(['newfeed','reels','story'].map((key) => [key, {
        enabled: enabledKeys.includes(key),
        min: minTimes[key] || 0,
        max: Math.max(maxTimes[key] || 0, minTimes[key] || 0),
      }]));
      for (const key of ['cross_follow', 'cross_account_follow']) {
        const configured = generatorActions[key];
        const min = randomInt(configured.min, configured.max);
        actions[key] = { ...configured, min, max: randomInt(min, configured.max), ...(key === 'cross_follow' ? { usernames: normalizeUsernameList(configured.usernames) } : {}) };
      }
      return {
        id: `auto-${generatedAt}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Kịch bản ${minMinutes}-${maxMinutes} phút #${settings.scenarios.length + index + 1}`,
        actions,
      };
    });
    const nextSettings = {
      ...settings,
      generator_config: { actions: generatorActions },
      active_scenario_id: settings.active_scenario_id || generated[0].id,
      cooldown_hours: settings.cooldown_hours || 24,
      scenarios: [...settings.scenarios, ...generated],
    };

    setSaving(true);
    try {
      const res = await saveSettings('updateInstagramNurture', serializeCrossFollowSettings(nextSettings));
      const saved = res.data?.settings || nextSettings;
      setSettings(saved);
      setSavedSettings(JSON.parse(JSON.stringify(saved)));
      setSelectedId(generated[0].id);
      setGeneratorOpen(false);
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
        [actionKey]: { ...(actionKey === 'cross_follow' ? emptyCrossFollow() : {}), ...scenario.actions[actionKey], [field]: value },
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
      const res = await saveSettings('updateInstagramNurture', serializeCrossFollowSettings(nextSettings));
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

  const validate = () => {
    if (settings.cooldown_hours === '' || !Number.isInteger(Number(settings.cooldown_hours)) || Number(settings.cooldown_hours) < 1 || Number(settings.cooldown_hours) > 720) { toast.error('Khoảng nghỉ phải là số nguyên từ 1 đến 720 giờ'); return false; }
    for (const scenario of settings.scenarios) {
      if (!String(scenario.name || '').trim()) {
        toast.error('Tên kịch bản không được để trống');
        return false;
      }
      const followError = crossFollowError(scenario.actions.cross_follow) || crossAccountFollowError(scenario.actions.cross_account_follow);
      if (followError) { toast.error(`${scenario.name}: ${followError}`); setSelectedId(scenario.id); return false; }
      for (const key of ['newfeed', 'reels', 'story']) {
        const action = scenario.actions[key];
        const min = parseInt(action.min, 10);
        const max = parseInt(action.max, 10);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
          toast.error('Giá trị min/max không hợp lệ');
          return false;
        }
      }
    }
    return true;
  };
  const save = async () => {
    if (!validate()) return false;
    setSaving(true);
    try {
      const res = await saveSettings('updateInstagramNurture', serializeCrossFollowSettings(settings));
      const saved = res.data?.settings || settings;
      setSettings(saved);
      setSavedSettings(JSON.parse(JSON.stringify(saved)));
      setSelectedId((current) => (
        saved.scenarios.some((scenario) => scenario.id === current)
          ? current
          : saved.active_scenario_id || saved.scenarios[0]?.id || ''
      ));
      toast.success('Đã lưu cấu hình nuôi Instagram');
      return true;
    } catch (err) {
      toast.error(err.message || 'Lưu cấu hình nuôi Instagram thất bại');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const dirty = savedSettings !== null && JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const activeName = settings.scenarios.find((scenario) => scenario.id === settings.active_scenario_id)?.name || '';
  useEffect(() => {
    onStateChange?.({ dirty, saving, loading, activeName });
  }, [dirty, saving, loading, activeName, onStateChange]);
  useImperativeHandle(ref, () => ({
    save, validate,
    discard: () => {
      if (!savedSettings) return;
      setSettings(JSON.parse(JSON.stringify(savedSettings)));
      setSelectedId(savedSettings.active_scenario_id || savedSettings.scenarios[0]?.id || '');
      setGeneratorOpen(false);
    },
  }));
  const busy = saving || externalSaving;
  if (loading) return <div id="ig-nurture" className="settings-loading" aria-busy="true">Đang tải kịch bản nuôi Instagram...</div>;
  if (loadError) return <div id="ig-nurture" className="settings-error" role="alert">{loadError}<button className="settings-button secondary" onClick={() => setReload((old) => old + 1)}>Thử lại</button></div>;
  return <SettingsCard id="ig-nurture" title="Kịch bản nuôi Instagram" description="Chọn kịch bản điện thoại sẽ lấy qua API và điều chỉnh từng hoạt động." action={<span className="settings-badge">{settings.scenarios.length} / 50 kịch bản</span>}>
    <fieldset className="settings-workspace" disabled={busy}>
      <ScenarioSelector scenarios={settings.scenarios} selectedId={selectedId} activeId={settings.active_scenario_id} onSelect={setSelectedId} onCreate={addScenario} onGenerate={() => setGeneratorOpen(true)} />
      <div className="settings-nurture-cooldown"><NumberField label="Khoảng nghỉ trước khi nuôi lại" unit="giờ" min={1} max={720} value={settings.cooldown_hours ?? 24} onChange={(e) => setSettings((old) => ({ ...old, cooldown_hours: e.target.value === '' ? '' : Number(e.target.value) }))} /><p className="settings-helper">Account đã nuôi vẫn được chạy Job. Khoảng nghỉ chỉ áp dụng cho lần nuôi tiếp theo.</p></div>
      {!selected && <div className="settings-empty">Chưa có kịch bản. Tạo kịch bản mới hoặc dùng trình tạo nhanh để bắt đầu.</div>}
      {selected && <>
        <div className="settings-scenario-heading"><label className="settings-field"><span>Tên kịch bản</span><input value={selected.name} maxLength={100} aria-label="Tên kịch bản" placeholder="Tên kịch bản" onChange={(e) => updateScenario((scenario) => ({ ...scenario, name: e.target.value }))} /></label>{settings.active_scenario_id === selected.id ? <span className="settings-badge success">● Đang sử dụng</span> : <button type="button" className="settings-button secondary" onClick={() => setSettings((old) => ({ ...old, active_scenario_id: selected.id }))}>Sử dụng kịch bản</button>}</div>
        <div className="settings-duration" title="Tổng thời gian chỉ tính hoạt động theo thời gian; theo dõi chéo tính theo số lượng.">Tổng thời gian <strong>{(selectedDuration.min / 60).toFixed(1)} – {(selectedDuration.max / 60).toFixed(1)} phút</strong><span>{[...actionRows, { key: 'cross_follow', label: 'Theo dõi chéo' }, { key: 'cross_account_follow', label: 'Follow chéo Account' }].filter(row => selected.actions[row.key]?.enabled).map(row => row.label).join(' + ') || 'Chưa bật hoạt động'}</span></div>
        <div className="settings-activities">{actionRows.map((row) => {
          const action = selected.actions[row.key];
          return <ScenarioActivity key={row.key} label={row.label} enabled={action.enabled} onToggle={(value) => updateAction(row.key,'enabled',value)}><MinMaxField minLabel="Thời gian tối thiểu" maxLabel="Thời gian tối đa" min={action.min} max={action.max} unit={row.unit} disabled={!action.enabled} onChange={(bound,value) => updateAction(row.key,bound,value)} /></ScenarioActivity>;
        })}
          <ScenarioActivity className="settings-activity-cross-account" label="Follow chéo Account" enabled={selected.actions.cross_account_follow?.enabled} onToggle={value => updateAction('cross_account_follow', 'enabled', value)}>
            <MinMaxField min={(selected.actions.cross_account_follow || emptyCrossAccountFollow()).min} max={(selected.actions.cross_account_follow || emptyCrossAccountFollow()).max} maximum={200} unit="người" disabled={!selected.actions.cross_account_follow?.enabled} onChange={(bound, value) => updateAction('cross_account_follow', bound, value)} />
            <p className="settings-helper">Nguồn: Account Instagram đủ điều kiện trong hệ thống.</p>
            {crossAccountFollowError(selected.actions.cross_account_follow) && <p className="settings-field-error" role="alert">{crossAccountFollowError(selected.actions.cross_account_follow)}</p>}
          </ScenarioActivity>
          <ScenarioTargetActivity className="settings-activity-cross-follow" label="Theo dõi chéo Username" action={selected.actions.cross_follow || emptyCrossFollow()} onToggle={(value) => updateAction('cross_follow', 'enabled', value)} onRangeChange={(bound, value) => updateAction('cross_follow', bound, value)} listLabel="Danh sách Username (mỗi dòng 1 username)" placeholder={'username1\nusername2\nusername3'} value={(selected.actions.cross_follow?.usernames || []).join('\n')} onTextChange={(value) => updateAction('cross_follow', 'usernames', value.split(/\r?\n/))} count={normalizeUsernameList(selected.actions.cross_follow?.usernames).filter(value => value.length <= 255 && /^[a-zA-Z0-9._]+$/.test(value)).length} error={crossFollowError(selected.actions.cross_follow)} />
        </div>
        <div className="settings-nurture-footer"><span className={dirty ? 'settings-unsaved' : 'settings-helper'}>{dirty ? 'Kịch bản có thay đổi chưa lưu' : 'Đã đồng bộ kịch bản'}</span><button type="button" className="settings-button danger" onClick={removeScenario}>Xóa kịch bản</button></div>
      </>}
    </fieldset>
    {generatorOpen && <SettingsModal className="settings-scenario-modal" title="Tạo nhanh kịch bản Instagram" onClose={() => { if (!saving) setGeneratorOpen(false); }}>
      <p className="settings-helper">Chia tổng thời gian cho các hoạt động đang ON. Số lượng follow được random trong khoảng đã nhập, giống Facebook.</p>
      <fieldset className="settings-workspace" disabled={busy}><div className="settings-scenario-scroll">
        <div className="settings-generator-fields">
          <NumberField label="Số kịch bản" unit="kịch bản" min={1} max={50} value={generatorCount} onChange={e => setGeneratorCount(e.target.value)} />
          <MinMaxField minLabel="Tổng thời gian Min" maxLabel="Tổng thời gian Max" min={generatorMinMinutes} max={generatorMaxMinutes} minimum={1} maximum={1440} unit="phút" onChange={(bound,value) => bound === 'min' ? setGeneratorMinMinutes(value) : setGeneratorMaxMinutes(value)} />
        </div>
        <h3>Setup tính năng ngẫu nhiên</h3>
        <div className="settings-activities">
          {actionRows.map(row => <ScenarioActivity key={row.key} label={row.label} enabled={generatorActions[row.key]?.enabled} onToggle={value => updateGenerator(row.key, 'enabled', value)}><p className="settings-helper">Chia theo tổng thời gian phiên khi ON.</p></ScenarioActivity>)}
          <ScenarioTargetActivity className="settings-activity-cross-follow" label="Theo dõi chéo Username" action={generatorActions.cross_follow} onToggle={value => updateGenerator('cross_follow','enabled',value)} onRangeChange={(bound,value) => updateGenerator('cross_follow',bound,value)} unit="người" listLabel="Danh sách Username (mỗi dòng 1 username)" value={generatorActions.cross_follow.usernames.join('\n')} onTextChange={value => updateGenerator('cross_follow','usernames',value.split(/\r?\n/))} count={normalizeUsernameList(generatorActions.cross_follow.usernames).length} error={crossFollowError(generatorActions.cross_follow)} />
          <ScenarioActivity label="Follow chéo Account" enabled={generatorActions.cross_account_follow.enabled} onToggle={value => updateGenerator('cross_account_follow','enabled',value)}>
            <MinMaxField min={generatorActions.cross_account_follow.min} max={generatorActions.cross_account_follow.max} maximum={200} unit="người" disabled={!generatorActions.cross_account_follow.enabled} onChange={(bound,value) => updateGenerator('cross_account_follow',bound,value)} />
            <p className="settings-helper">Nguồn: Account đủ điều kiện.</p>
            {crossAccountFollowError(generatorActions.cross_account_follow) && <p className="settings-field-error" role="alert">{crossAccountFollowError(generatorActions.cross_account_follow)}</p>}
          </ScenarioActivity>
        </div>
        <p className="settings-helper">Đang có {settings.scenarios.length}/50 kịch bản.{dirty ? ' Thao tác này cũng lưu các chỉnh sửa hiện tại.' : ''}</p>
        </div><footer className="settings-button-group"><button type="button" className="settings-button ghost" onClick={() => setGeneratorOpen(false)}>Hủy</button><button type="button" className="settings-button primary" onClick={generateRandomScenarios}>{saving ? 'Đang tạo...' : 'Tạo kịch bản'}</button></footer>
      </fieldset>
    </SettingsModal>}

  </SettingsCard>;
});
export default InstagramNurtureSettings;
