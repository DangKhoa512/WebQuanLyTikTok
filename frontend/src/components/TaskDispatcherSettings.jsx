import { SettingsCard, NumberField, SettingsToggle } from './SettingsPrimitives';
export default function TaskDispatcherSettings({ settings, setSettings }) {
  const changeTask = (type,patch) => setSettings((old) => ({...old,tasks:{...old.tasks,[type]:{...old.tasks[type],...patch}}}));
  return <SettingsCard id="common-dispatcher" title="Task Dispatcher" description="Cấu hình thứ tự ưu tiên, tác vụ được chạy, timeout lock và retry.">
    <div className="settings-form-row"><NumberField label="Timeout lock" unit="phút" min={5} max={1440} value={settings.lock_timeout_minutes} onChange={(e) => setSettings((old) => ({...old,lock_timeout_minutes:e.target.value}))} /><NumberField label="Retry tối đa" unit="lần" min={0} max={20} value={settings.max_retry} onChange={(e) => setSettings((old) => ({...old,max_retry:e.target.value}))} /></div>
    <div className="settings-dispatcher-list">{Object.entries(settings.tasks || {}).map(([type,task]) => <div className="settings-dispatcher-row" key={type}><strong>{type}</strong><div className="settings-switch-label"><span>{task.enabled !== false ? 'ON' : 'OFF'}</span><SettingsToggle label={type} checked={task.enabled !== false} onChange={(value) => changeTask(type,{enabled:value})} /></div><NumberField label="Priority" aria-label={`Priority ${type}`} unit="" min={-10000} max={10000} value={task.priority} onChange={(e) => changeTask(type,{priority:e.target.value})} /></div>)}</div>
  </SettingsCard>;
}
