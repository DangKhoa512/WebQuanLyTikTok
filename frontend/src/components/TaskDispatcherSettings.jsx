export default function TaskDispatcherSettings({ settings, setSettings, saving, onSave }) {
  const changeTask = (type, patch) => setSettings((old) => ({
    ...old,
    tasks: { ...old.tasks, [type]: { ...old.tasks[type], ...patch } },
  }));
  return <section className={'card settings-section settings-section-common dispatcher-settings'}>
    <h3>Task Dispatcher</h3>
    <p>Cau hinh priority, task duoc chay, timeout lock va retry.</p>
    <div className={'dispatcher-settings-summary'}>
      <label>Timeout lock (phut)<input type={'number'} min={5} max={1440} value={settings.lock_timeout_minutes} onChange={(e) => setSettings((old) => ({ ...old, lock_timeout_minutes: e.target.value }))} /></label>
      <label>Retry toi da<input type={'number'} min={0} max={20} value={settings.max_retry} onChange={(e) => setSettings((old) => ({ ...old, max_retry: e.target.value }))} /></label>
    </div>
    <div className={'dispatcher-settings-tasks'}>
      {Object.entries(settings.tasks || {}).map(([type, task]) => <div className={'dispatcher-settings-task'} key={type}>
        <strong>{type}</strong>
        <label>
          <input type={'checkbox'} checked={task.enabled !== false} onChange={(e) => changeTask(type, { enabled: e.target.checked })} />
          Bat
        </label>
        <input
          aria-label={'Priority ' + type}
          title={'Priority cao chay truoc'}
          type={'number'}
          min={-10000}
          max={10000}
          value={task.priority}
          onChange={(e) => changeTask(type, { priority: e.target.value })}
        />
      </div>)}
    </div>
    <button type={'button'} onClick={onSave} disabled={saving}>{saving ? 'Dang luu...' : 'Luu Task Dispatcher'}</button>
  </section>;
}
