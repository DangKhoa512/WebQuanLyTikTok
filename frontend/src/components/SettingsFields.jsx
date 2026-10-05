import { useState } from 'react';
import { NumberField, SettingsCard } from './SettingsPrimitives';
import { copyText } from '../services/clipboard';
import { toast } from './Toast';

export const numberValue = (event) => event.target.value === '' ? '' : Number(event.target.value);

export function MinMaxField({ min, max, onChange, unit = 'giây', disabled = false, minLabel = 'Min', maxLabel = 'Max', minimum = 0, maximum, step = 1 }) {
  const error = min !== '' && max !== '' && Number(min) > Number(max) ? 'Max không được nhỏ hơn Min.' : '';
  return <div className="settings-min-max"><NumberField label={minLabel} unit={unit} value={min} min={minimum} max={maximum} step={step} disabled={disabled} onChange={(e) => onChange('min', numberValue(e))} /><span className="settings-range-arrow" aria-hidden="true">→</span><NumberField label={maxLabel} unit={unit} value={max} min={minimum} max={maximum} step={step} disabled={disabled} error={error} onChange={(e) => onChange('max', numberValue(e))} /></div>;
}

export function LimitSettings({ id, title, description, isAdmin, users = [], savedUsers = [], currentLimit, onChangeOwn, onChangeUsers, onSaveUser, savingUser = '', editableOwn = true, unit = 'account', helper }) {
  const dirty = (user) => Number(user.limit) !== Number(savedUsers.find((row) => row.username === user.username)?.limit);
  return <SettingsCard id={id} title={title} description={description} action={<span className="settings-badge">{isAdmin ? 'Quản trị viên' : 'Tài khoản của bạn'}</span>}>
    {isAdmin ? <div className="settings-limit-table"><table><thead><tr><th>User</th><th>Role</th><th>Trạng thái</th><th>Limit / {unit.includes('/ngày') ? 'ngày' : 'máy'}</th><th>Thao tác</th></tr></thead><tbody>{users.map((user) => <tr key={user.username}><td data-label="User"><strong>{user.username}</strong></td><td data-label="Role">{user.role === 'admin' ? 'Admin' : 'User'}</td><td data-label="Trạng thái"><span className={`settings-badge ${user.is_active ? 'success' : 'muted'}`}>● {user.is_active ? 'Đang bật' : 'Đã tắt'}</span></td><td data-label="Limit"><input aria-label={'Limit của ' + user.username} type="number" min={1} value={user.limit} onChange={(e) => onChangeUsers(users.map((row) => row.username === user.username ? { ...row, limit: numberValue(e) } : row))} /><span className="settings-unsaved">{dirty(user) ? 'Chưa lưu' : ''}</span></td><td data-label="Thao tác"><button type="button" className="settings-button secondary small" disabled={!dirty(user) || !!savingUser} onClick={() => onSaveUser(user.username)}>{savingUser === user.username ? 'Đang lưu...' : 'Lưu'}</button></td></tr>)}</tbody></table>{!users.length && <p className="settings-empty">Chưa có user để hiển thị.</p>}</div> : <NumberField label="Limit của bạn" unit={unit} min={1} disabled={!editableOwn} value={currentLimit} onChange={(e) => onChangeOwn?.(numberValue(e))} />}
    {helper && <p className="settings-helper">{helper}</p>}
  </SettingsCard>;
}

export function TextField({ label, description, multiline = false, ...props }) {
  return <label className="settings-field"><span>{label}</span>{multiline ? <textarea {...props} /> : <input {...props} />}{description && <small className="settings-helper">{description}</small>}</label>;
}

export function SelectField({ label, options = [], children, ...props }) {
  return <label className="settings-field"><span>{label}</span><select {...props}>{children}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function SecretTextEditor({ label, value, onChange, placeholder, helper }) {
  const [revealed, setRevealed] = useState(false);
  return <div className="settings-secret-editor"><div className="settings-secret-heading"><span>{label}</span><div className="settings-button-group"><button type="button" className="settings-button ghost small" onClick={() => setRevealed((old) => !old)}>{revealed ? 'Ẩn' : 'Hiện / chỉnh sửa'}</button><button type="button" className="settings-button secondary small" disabled={!value} onClick={async () => { try { await copyText(value); toast.success('Đã copy'); } catch (err) { toast.error(err.message); } }}>Copy</button></div></div>{revealed ? <TextField label={label} multiline rows={6} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <div className="settings-secret-mask">{value ? '••••••••••••••••••••••••' : 'Chưa có dữ liệu'}</div>}{helper && <p className="settings-helper">{helper}</p>}</div>;
}
