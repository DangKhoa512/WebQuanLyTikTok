export default function SettingsSubTabs({ tabs, activeTab, onChange, label = 'Nhóm cấu hình', id = 'settings' }) {
  const select = (index, element) => {
    onChange(tabs[index].id);
    element.parentElement.children[index]?.focus({ preventScroll: true });
  };
  return <div className="settings-sub-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.id} id={`${id}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${id}-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={(event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); select(next, event.currentTarget);
    }}>{tab.label}{tab.dirty && <span className="settings-tab-dot" aria-label="Chưa lưu" />}</button>)}
  </div>;
}

export function SettingsTabPanel({ id = 'settings', tab, activeTab, children }) {
  // Keep the view mounted to retain drafts, selection and editor state.
  return <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} hidden={tab !== activeTab} className="settings-tab-panel">{children}</div>;
}

export function SettingsOverview({ title, description, items, onEdit }) {
  return <section className="settings-overview"><header><h2>{title}</h2><p>{description}</p></header><div className="settings-overview-cards">{items.map((item) => <article className="settings-card settings-summary-card" key={item.id}><span className="settings-eyebrow">{item.title}</span><div className="settings-summary-value">{item.value}</div>{item.description && <p className="settings-helper">{item.description}</p>}<button type="button" className="settings-button secondary small" onClick={() => onEdit(item.id)}>{item.action || 'Chỉnh sửa'} <span aria-hidden="true">→</span></button></article>)}</div></section>;
}
