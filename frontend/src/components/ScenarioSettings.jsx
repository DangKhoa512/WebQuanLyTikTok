import { SelectField } from './SettingsFields';
import { SettingsToggle } from './SettingsPrimitives';

export function ScenarioActivity({ label, enabled, onToggle, children }) {
  return <section className={`settings-activity${!enabled ? ' off' : ''}`}><header><h3>{label}</h3><div className="settings-switch-label"><span>{enabled ? 'ON' : 'OFF'}</span><SettingsToggle label={label} checked={enabled} onChange={onToggle} /></div></header>{children}</section>;
}

export function ScenarioSelector({ scenarios, selectedId, activeId, onSelect, onCreate, onGenerate }) {
  return <div className="settings-nurture-toolbar"><SelectField label="Kịch bản đang chỉnh sửa" value={selectedId} onChange={(e) => onSelect(e.target.value)}><option value="" disabled>Chọn kịch bản</option>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}{activeId === scenario.id ? ' · Đang sử dụng' : ''}</option>)}</SelectField><div className="settings-button-group"><button type="button" className="settings-button secondary" onClick={onCreate}>+ Tạo kịch bản</button><button type="button" className="settings-button primary" disabled={scenarios.length >= 50} onClick={onGenerate}>+ Tạo nhanh kịch bản</button></div></div>;
}
