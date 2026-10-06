import { useCallback, useState } from 'react';
import SettingsSubTabs, { SettingsTabPanel, SettingsOverview } from './SettingsSubTabs';
import { SettingsCard, NumberField } from './SettingsPrimitives';
import { SecretTextEditor } from './SettingsFields';
import TaskRegistrySettings from './TaskRegistrySettings';
import { taskRegistryApi } from '../services/taskRegistryApi';
import { useEffect } from 'react';
import TaskDispatcherSettings from './TaskDispatcherSettings';
const tabs = [{id:'overview',label:'Tổng quan'},{id:'dispatcher',label:'Điều phối tác vụ'},{id:'proxy',label:'Proxy'},{id:'check',label:'Tham số check'}];
export default function CommonSettingsPanel({ model, setters, busy, registryRef, onRegistryState, visible=true }) {
  const [registrySnapshot,setRegistrySnapshot]=useState(null);
  const registryReady=!!registrySnapshot?.ready;
  const [ownEnabledCount,setOwnEnabledCount]=useState(null);
  const reportRegistry=useCallback(state=>{setOwnEnabledCount(state.enabledCount);onRegistryState?.(state);},[onRegistryState]);
  useEffect(()=>{taskRegistryApi.list().then(response=>setRegistrySnapshot(response.data)).catch(()=>{});},[]);
  const [activeTab,setActiveTab] = useState('overview');
  const panel = (tab,children) => <SettingsTabPanel id="common" tab={tab} activeTab={activeTab}>{children}</SettingsTabPanel>;
  const proxyCount = model.proxies.split('\n').filter((line) => line.trim()).length;
  return <div className="settings-platform-panel"><SettingsSubTabs id="common" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} label="Cài đặt chung" />
    {panel('overview',<SettingsOverview title="Tổng quan cài đặt chung" description="Cấu hình dùng chung cho hệ thống và công cụ check." onEdit={setActiveTab} items={[
      {id:'dispatcher',title:'Điều phối tác vụ',value:`${ownEnabledCount ?? Object.values(model.taskDispatcher.tasks || {}).filter((task) => task.enabled !== false).length} tác vụ đang bật`,description:`Timeout ${model.taskDispatcher.lock_timeout_minutes} phút · Retry ${model.taskDispatcher.max_retry}.`},
      {id:'proxy',title:'Proxy',value:`${proxyCount} proxy`,description:'Danh sách proxy check Facebook.'},
      {id:'check',title:'Tham số check',value:`${model.concurrency} luồng`,description:`${model.delayMs} ms giữa batch · ${model.batchSize} account/lượt.`}
    ]} />)}
    <fieldset className="settings-workspace" disabled={busy}>
      {panel('dispatcher',registryReady ? <div className="settings-view-stack"><SettingsCard id="common-dispatcher" title="Cấu hình dispatcher" description="Timeout và retry giữ cấu hình hiện tại của owner."><div className="settings-form-row"><NumberField label="Timeout lock" unit="phút" min={5} max={1440} value={model.taskDispatcher.lock_timeout_minutes} onChange={e=>setters.taskDispatcher(old=>({...old,lock_timeout_minutes:e.target.value}))} /><NumberField label="Retry tối đa" unit="lần" min={0} max={20} value={model.taskDispatcher.max_retry} onChange={e=>setters.taskDispatcher(old=>({...old,max_retry:e.target.value}))} /></div></SettingsCard><TaskRegistrySettings initialData={registrySnapshot} ref={registryRef} onStateChange={reportRegistry} externalSaving={busy} visible={!registryRef && visible && activeTab==='dispatcher'} /></div> : <TaskDispatcherSettings settings={model.taskDispatcher} setSettings={setters.taskDispatcher} />)}
      {panel('proxy',<SettingsCard title="Danh sách Proxy" description="Dữ liệu được che mặc định để bảo vệ thông tin đăng nhập." action={<span className="settings-badge">{proxyCount} proxy</span>}><SecretTextEditor label="Proxy pool" value={model.proxies} onChange={setters.proxies} placeholder={'ip:port\nip:port:user:pass\nuser:pass@ip:port'} helper="Mỗi proxy một dòng. Hỗ trợ ip:port, ip:port:user:pass và user:pass@ip:port." /></SettingsCard>)}
      {panel('check',<SettingsCard title="Tham số check" description="Luồng song song được lưu cùng proxy; delay và batch được lưu trên trình duyệt này."><div className="settings-check-fields">{[
        {key:'concurrency',label:'Luồng song song',unit:'luồng',min:1,max:40,step:1},
        {key:'delayMs',label:'Delay giữa batch',unit:'ms',min:0,max:5000,step:100},
        {key:'batchSize',label:'Số account mỗi lượt',unit:'account',min:10,max:200,step:10}
      ].map((field) => <div key={field.key}><NumberField label={field.label} unit={field.unit} min={field.min} max={field.max} step={field.step} value={model[field.key]} onChange={(e) => setters[field.key](e.target.value)} /><input aria-label={`Điều chỉnh ${field.label}`} type="range" min={field.min} max={field.max} step={field.step} value={model[field.key]} onChange={(e) => setters[field.key](e.target.value)} /></div>)}</div></SettingsCard>)}
    </fieldset>
  </div>;
}
