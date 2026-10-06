import { MinMaxField, SelectField, TextField } from './SettingsFields';
import { SettingsToggle } from './SettingsPrimitives';

export function ScenarioActivity({ label, enabled, onToggle, children, className = '' }) {
  return <section className={`settings-activity${!enabled ? ' off' : ''} ${className}`}><header><h3>{label}</h3><div className="settings-switch-label"><span>{enabled ? 'ON' : 'OFF'}</span><SettingsToggle label={label} checked={enabled} onChange={onToggle} /></div></header>{children}</section>;
}

export function ScenarioSelector({ scenarios, selectedId, activeId, onSelect, onCreate, onGenerate }) {
  return <div className="settings-nurture-toolbar"><SelectField label="Kịch bản đang chỉnh sửa" value={selectedId} onChange={(e) => onSelect(e.target.value)}><option value="" disabled>Chọn kịch bản</option>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}{activeId === scenario.id ? ' · Đang sử dụng' : ''}</option>)}</SelectField><div className="settings-button-group"><button type="button" className="settings-button secondary" onClick={onCreate}>+ Tạo kịch bản</button><button type="button" className="settings-button primary" disabled={scenarios.length >= 50} onClick={onGenerate}>+ Tạo nhanh kịch bản</button></div></div>;
}

// Shared editor for count-based activities with a target list (Facebook and Instagram).
export function ScenarioTargetActivity({ label, action, onToggle, onRangeChange, value, onTextChange, listLabel, placeholder, count, error, unit = 'username', countLabel = 'username hợp lệ', rows = 6, showCount = true, className = '' }) {
  return <ScenarioActivity label={label} enabled={action.enabled} onToggle={onToggle} className={className}>
    <MinMaxField min={action.min} max={action.max} unit={unit} maximum={count} disabled={!action.enabled} onChange={onRangeChange} />
    <TextField label={listLabel} multiline rows={rows} disabled={!action.enabled} value={value} placeholder={placeholder} onChange={(e) => onTextChange(e.target.value)} />
    {showCount && <p className="settings-helper">{count} {countLabel}</p>}
    {error && <p className="settings-field-error" role="alert">{error}</p>}
  </ScenarioActivity>;
}
