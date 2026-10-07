import { useEffect, useRef } from 'react';

export function SettingsCard({ id, title, description, children, action, className = '' }) {
  return <section id={id} tabIndex={-1} className={`settings-card ${className}`}>
    <header className="settings-card-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>
    {children}
  </section>;
}

export function NumberField({ label, unit, error, className = '', ...props }) {
  return <label className={`settings-field ${className}`}><span>{label}</span><span className={`settings-input-unit${error ? ' invalid' : ''}`}>
    <input type="number" aria-invalid={!!error} {...props} /><span>{unit}</span>
  </span>{error && <small className="settings-field-error">{error}</small>}</label>;
}

export function SettingsToggle({ checked, onChange, label, disabled = false }) {
  return <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} className={`settings-toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}

export function SettingsModal({ title, children, onClose, className = '' }) {
  const dialog = useRef(null);
  const returnFocus = useRef(null);
  useEffect(() => {
    returnFocus.current = document.activeElement;
    dialog.current.showModal();
    return () => returnFocus.current?.focus?.();
  }, []);
  return <dialog ref={dialog} className={`settings-modal ${className}`} aria-labelledby="settings-modal-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="settings-modal-content"><header><h2 id="settings-modal-title">{title}</h2><button type="button" className="settings-button ghost" aria-label="Đóng" onClick={onClose}>×</button></header>{children}</div>
  </dialog>;
}

export function SettingsSaveBar({ dirty, saving, onDiscard, onSave, disabled = false, label = 'Bạn có thay đổi chưa lưu' }) {
  if (!dirty) return null;
  return <div className="settings-save-bar" role="region" aria-label="Thay đổi chưa lưu"><span><i />{saving ? 'Đang lưu thay đổi...' : label}</span><div className="settings-button-group"><button type="button" className="settings-button ghost" disabled={saving || disabled} onClick={onDiscard}>Hủy thay đổi</button><button type="button" className="settings-button primary" disabled={saving || disabled} onClick={onSave}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div></div>;
}
