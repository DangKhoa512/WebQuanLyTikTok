export default function PlatformTabs({ tabs, activeTab, onChange, dirty = {} }) {
  return <div className="settings-platform-tabs" role="tablist" aria-label="Nền tảng cài đặt">{tabs.map((tab,index) => <button key={tab.key} type="button" role="tab" id={`platform-tab-${tab.key}`} aria-controls={`platform-panel-${tab.key}`} aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} className={`settings-platform-tab${activeTab === tab.key ? ' active' : ''}`} onClick={() => onChange(tab.key)} onKeyDown={(event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index+1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index+tabs.length-1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length-1;
    else return;
    event.preventDefault(); onChange(tabs[next].key); event.currentTarget.parentElement.children[next]?.focus({preventScroll:true});
  }}>{tab.label}{dirty[tab.key] && <span className="settings-tab-dot" aria-label="Chưa lưu" />}</button>)}</div>;
}
