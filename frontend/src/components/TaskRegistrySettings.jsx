import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { taskRegistryApi } from '../services/taskRegistryApi';
import { authService } from '../services/authService';
import { SettingsCard, SettingsModal, SettingsToggle, SettingsSaveBar, NumberField } from './SettingsPrimitives';
import { TextField, SelectField } from './SettingsFields';
import { toast } from './Toast';
const clone=value=>JSON.parse(JSON.stringify(value));
const config=tasks=>tasks.map(task=>({task_id:task.id,enabled:!!task.user_enabled,priority:task.priority}));
const emptyTask=()=>({task_key:'',name:'',platform:'FACEBOOK',description:'',enabled:true,default_priority:50});
const platforms=['FACEBOOK','INSTAGRAM','TIKTOK','COMMON'];
const TaskRegistrySettings=forwardRef(function TaskRegistrySettings({visible=true,onStateChange,externalSaving=false,initialData=null},ref){
  const admin=authService.getRole()==='admin';
  const [registry,setRegistry]=useState([]),[draft,setDraft]=useState([]),[saved,setSaved]=useState([]);
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [dragId,setDragId]=useState(null);
  const [busy,setBusy]=useState(false),[editor,setEditor]=useState(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
  const enabledCount=registry.filter(task=>task.enabled && draft.find(row=>row.task_id===task.id)?.enabled).length;
  const apply=tasks=>{setRegistry(tasks);const values=config(tasks);setDraft(values);setSaved(clone(values));};
  const load=async(snapshot=null)=>{setLoading(true);setError('');try{const response=snapshot?{data:snapshot}:await taskRegistryApi.list();setReady(response.data.ready);apply(response.data.tasks || []);}catch(err){setError(err.message);}finally{setLoading(false);}};
  useEffect(()=>{load(initialData);},[]);
  useEffect(()=>{onStateChange?.({dirty,saving:busy,enabledCount});},[dirty,busy,enabledCount,onStateChange]);
  useEffect(()=>{if(!dirty)return;const warn=event=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const update=(id,patch)=>setDraft(old=>old.map(row=>row.task_id===id?{...row,...patch}:row));
  const save=async()=>{
    if(draft.some(row=>!Number.isInteger(Number(row.priority))||Math.abs(Number(row.priority))>10000)){toast.error('Priority phải là số nguyên từ -10000 đến 10000');return false;}
    const changed=draft.filter(row=>JSON.stringify(row)!==JSON.stringify(saved.find(old=>old.task_id===row.task_id))).map(row=>({...row,priority:Number(row.priority)}));
    if(!changed.length)return true;
    setBusy(true);setError('');try{const response=await taskRegistryApi.mine(changed,draft.map(row=>row.task_id));apply(response.data.tasks);toast.success('Đã lưu cấu hình tác vụ của bạn');return true;}catch(err){setError(err.message);toast.error(err.message);return false;}finally{setBusy(false);}
  };
  const reorder=async(id,beforeId)=>{
    if(id===beforeId||busy||externalSaving)return;
    const previous=clone(draft),next=clone(draft),from=next.findIndex(row=>row.task_id===id),to=next.findIndex(row=>row.task_id===beforeId);
    if(from<0||to<0)return;
    const [moved]=next.splice(from,1);next.splice(to,0,moved);
    setDraft(next);setBusy(true);setError('');
    try{const response=await taskRegistryApi.mine(next,next.map(row=>row.task_id));apply(response.data.tasks);toast.success('Đã lưu thứ tự luân phiên');}
    catch(err){setDraft(previous);setError(err.message);toast.error(err.message);}
    finally{setBusy(false);setDragId(null);}
  };
  const orderedRegistry=draft.map(row=>registry.find(task=>task.id===row.task_id)).filter(Boolean);
  const sequence=orderedRegistry.filter(task=>task.enabled && draft.find(row=>row.task_id===task.id)?.enabled).map(task=>task.name);
  useImperativeHandle(ref,()=>({save,discard:()=>setDraft(clone(saved))}));
  const refreshRegistry=async()=>{
    const response=await taskRegistryApi.list(),tasks=response.data.tasks,values=config(tasks);setRegistry(tasks);
    // Preserve unsaved settings for existing tasks when metadata changes; new tasks start OFF.
    setDraft(old=>values.map(row=>{const current=old.find(value=>value.task_id===row.task_id);return current && JSON.stringify(current)!==JSON.stringify(saved.find(value=>value.task_id===row.task_id)) ? current : row;}));
    setSaved(clone(values));
  };
  const saveTask=async()=>{setBusy(true);setError('');try{const task={...editor,task_key:editor.task_key.trim().toUpperCase(),default_priority:Number(editor.default_priority)};if(editor.id)await taskRegistryApi.update(editor.id,task);else await taskRegistryApi.create(task);await refreshRegistry();setEditor(null);toast.success('Đã lưu loại tác vụ');}catch(err){setError(err.message);toast.error(err.message);}finally{setBusy(false);}};
  const archive=async task=>{if(!confirm(`Archive ${task.name}? Lịch sử vẫn được giữ.`))return;setBusy(true);try{await taskRegistryApi.archive(task.id);await refreshRegistry();toast.success('Đã archive loại tác vụ');}catch(err){setError(err.message);toast.error(err.message);}finally{setBusy(false);}};
  if(loading)return <div className="settings-loading" aria-busy="true">Đang tải Task Registry...</div>;
  if(!ready)return <div className="settings-error" role="alert">{error || 'Task Registry chưa được migration.'}<button className="settings-button secondary" onClick={()=>load()}>Thử lại</button></div>;
  return <div className="settings-view-stack task-registry-settings">
    {error && <div className="settings-error" role="alert">{error}</div>}
    <SettingsCard title="Tác vụ của bạn" description="Máy nào rảnh sẽ nhận tác vụ tiếp theo trong chuỗi. Tác vụ đang tắt hoặc không còn công việc sẽ tự động được bỏ qua." action={admin && <button className="settings-button primary" disabled={busy||externalSaving} onClick={()=>setEditor(emptyTask())}>+ Thêm tác vụ</button>}>
      <fieldset className="settings-workspace" disabled={busy||externalSaving}>
        <div className="settings-limit-table"><table><thead><tr><th>Tác vụ</th><th>Platform</th><th>Enabled</th><th>Thứ tự luân phiên</th>{admin && <th>Loại tác vụ</th>}</tr></thead><tbody>{orderedRegistry.map((task,index)=>{const value=draft.find(row=>row.task_id===task.id);return <tr key={task.id} data-task-id={task.id} className={dragId===task.id?'task-order-dragging':''} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();reorder(Number(e.dataTransfer.getData('text/plain')),task.id);}}>
          <td data-label="Tác vụ"><strong>{task.name}</strong><small className="settings-helper task-registry-key">{task.task_key}</small>{!task.enabled && <span className="settings-badge warning">System OFF</span>}{!task.executable && <span className="settings-badge muted">Chưa có handler</span>}</td>
          <td data-label="Platform">{task.platform}</td><td data-label="Enabled"><SettingsToggle label={`Bật ${task.name}`} checked={!!value?.enabled} onChange={enabled=>update(task.id,{enabled})} /></td>
          <td data-label="Thứ tự luân phiên"><div className="task-order-controls"><button type="button" className="settings-button ghost small task-drag-handle" draggable={!busy&&!externalSaving} aria-label={`Kéo sắp xếp ${task.name}`} onDragStart={e=>{setDragId(task.id);e.dataTransfer.setData('text/plain',String(task.id));e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragId(null)}>☰</button><span>{index+1}</span><button type="button" className="settings-button ghost small" aria-label={`Đưa ${task.name} lên`} disabled={index===0} onClick={()=>reorder(task.id,orderedRegistry[index-1].id)}>↑</button><button type="button" className="settings-button ghost small" aria-label={`Đưa ${task.name} xuống`} disabled={index===orderedRegistry.length-1} onClick={()=>reorder(task.id,orderedRegistry[index+1].id)}>↓</button></div></td>
          {admin && <td data-label="Loại tác vụ"><div className="settings-button-group"><button className="settings-button secondary small" onClick={()=>setEditor({...task})}>Sửa loại</button><button className="settings-button danger small" onClick={()=>archive(task)}>Archive</button></div></td>}
        </tr>;})}</tbody></table></div>
        <p className="settings-helper">Kéo thả hoặc dùng nút lên/xuống để đổi thứ tự. Thứ tự và thay đổi bật/tắt hiện tại sẽ được lưu khi sắp xếp.</p>
        <div className="task-order-preview" aria-live="polite"><strong>Chuỗi điều phối hiện tại</strong><p>{sequence.length ? [...sequence,'Lặp lại'].join(' → ') : 'Chưa bật tác vụ'}</p></div>
        {!registry.length && <p className="settings-empty">Chưa có loại tác vụ.</p>}
      </fieldset>
    </SettingsCard>
    {visible && <SettingsSaveBar dirty={dirty} saving={busy} onDiscard={()=>setDraft(clone(saved))} onSave={save} />}
    {editor && <SettingsModal title={editor.id?'Sửa loại tác vụ':'Thêm tác vụ'} onClose={()=>{if(!busy)setEditor(null);}}><fieldset className="settings-workspace" disabled={busy||externalSaving}>
      <TextField label="Tên tác vụ" value={editor.name} maxLength={100} onChange={e=>setEditor(old=>({...old,name:e.target.value}))} /><TextField label="Task Key" value={editor.task_key} disabled={!!editor.id} maxLength={50} onChange={e=>setEditor(old=>({...old,task_key:e.target.value}))} />
      <SelectField label="Platform" value={editor.platform} onChange={e=>setEditor(old=>({...old,platform:e.target.value}))}>{platforms.map(platform=><option key={platform}>{platform}</option>)}</SelectField><TextField label="Mô tả" multiline rows={3} value={editor.description} maxLength={2000} onChange={e=>setEditor(old=>({...old,description:e.target.value}))} />
      <NumberField label="Priority mặc định" unit="" min={-10000} max={10000} value={editor.default_priority} onChange={e=>setEditor(old=>({...old,default_priority:e.target.value}))} />
      <div className="settings-switch-label"><span>System Enabled</span><SettingsToggle label="System Enabled" checked={editor.enabled} onChange={enabled=>setEditor(old=>({...old,enabled}))} /></div>
      <footer className="settings-button-group"><button className="settings-button ghost" onClick={()=>setEditor(null)}>Hủy</button><button className="settings-button primary" onClick={saveTask}>{busy?'Đang lưu...':editor.id?'Lưu loại tác vụ':'Thêm tác vụ'}</button></footer>
    </fieldset></SettingsModal>}
  </div>;
});
export default TaskRegistrySettings;
