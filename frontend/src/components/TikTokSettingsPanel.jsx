import { useState } from 'react';
import SettingsSubTabs, { SettingsTabPanel, SettingsOverview } from './SettingsSubTabs';
import { SettingsCard, NumberField } from './SettingsPrimitives';
import { LimitSettings, TextField, numberValue } from './SettingsFields';

export default function TikTokSettingsPanel({ model, saved, setters, isAdmin, actions, busy = false }) {
  const [activeTab, setActiveTab] = useState('overview');
  const tabs=[{id:'overview',label:'Tổng quan'},{id:'account',label:'Account'},{id:'conditions',label:'Điều kiện'},...(isAdmin ? [{id:'api',label:'API máy'}] : [])];
  return <div className="settings-platform-panel" data-platform="tiktok">
    <SettingsSubTabs id="tiktok" label="Cài đặt TikTok" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
    <fieldset className="settings-workspace" disabled={busy}>
      <SettingsTabPanel id="tiktok" tab="overview" activeTab={activeTab}><SettingsOverview title="Tổng quan TikTok" description="Quản lý giới hạn account và điều kiện chuyển trạng thái." onEdit={setActiveTab} items={[
        {id:'account',title:'Account',value:`Chrome kháng: ${model.khangDailyLimit} · Job: ${model.jobAccountDailyLimit}`,description:'Giới hạn account trên mỗi máy mỗi ngày.'},
        {id:'conditions',title:'Điều kiện',value:`${model.minAgeDays} ngày · ${model.minVideos} video`,description:'Áp dụng cho App Acc và Chrome Acc.'},
        ...(isAdmin ? [{id:'api',title:'API máy',value:`${model.machineApiKeys.length} tên key cấu hình`,description:'Danh sách cột sử dụng tại trang API Máy.',action:'Quản lý'}] : []),
      ]} /></SettingsTabPanel>
      <SettingsTabPanel id="tiktok" tab="account" activeTab={activeTab}>
        <div className="settings-view-stack">
          <LimitSettings id="tiktok-chrome-limit" title="Limit Chrome kháng" description="Số account mỗi máy được làm trong ngày cho từng user." isAdmin={isAdmin} users={model.userKhangLimits} savedUsers={saved?.userKhangLimits || model.userKhangLimits} currentLimit={model.khangDailyLimit} editableOwn={false} unit="account/máy/ngày" onChangeUsers={setters.userKhangLimits} onSaveUser={actions.saveChromeLimit} savingUser={model.savingLimitUser} helper="Admin được chỉnh limit; user xem limit của chính mình." />
          <LimitSettings id="tiktok-job-limit" title="Limit account Job" description="Giới hạn số account Job mỗi máy được lấy trong ngày." isAdmin={isAdmin} users={model.userJobAccountDailyLimits} savedUsers={saved?.userJobAccountDailyLimits || model.userJobAccountDailyLimits} currentLimit={model.jobAccountDailyLimit} unit="account/máy/ngày" onChangeOwn={setters.jobAccountDailyLimit} onChangeUsers={setters.userJobAccountDailyLimits} onSaveUser={actions.saveJobLimit} savingUser={model.savingJobLimitUser} helper="Gọi lại account đang giữ không tính thêm vào limit. User được sửa limit của chính mình." />
        </div>
      </SettingsTabPanel>
      <SettingsTabPanel id="tiktok" tab="conditions" activeTab={activeTab}><SettingsCard id="tiktok-conditions" title="Điều kiện chuyển trạng thái" description="Áp dụng cho App Acc và Chrome Acc khi chuyển sang Đủ điều kiện."><div className="settings-form-grid"><NumberField label="Video tối thiểu" unit="video" min={1} value={model.minVideos} onChange={(e) => setters.minVideos(numberValue(e))} /><NumberField label="Tuổi account tối thiểu" unit="ngày" min={1} value={model.minAgeDays} onChange={(e) => setters.minAgeDays(numberValue(e))} /></div></SettingsCard></SettingsTabPanel>
      {isAdmin && <SettingsTabPanel id="tiktok" tab="api" activeTab={activeTab}><SettingsCard id="tiktok-api-keys" title="Tên key cấu hình API máy" description="Admin thêm/xóa các tên cột cấu hình. Trang API Máy sử dụng danh sách này."><div className="settings-add-row"><TextField label="Tên key mới" value={model.newMachineApiKey} placeholder="API_NAME" onChange={(e) => setters.newMachineApiKey(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); actions.addKey(); } }} /><button type="button" className="settings-button primary" disabled={model.savingMachineApiKeys} onClick={actions.addKey}>{model.savingMachineApiKeys ? 'Đang lưu...' : 'Thêm key'}</button></div><div className="settings-name-list">{model.machineApiKeys.map((key) => <div className="settings-name-row" key={key}><span>{key}</span><button type="button" className="settings-button danger small" disabled={model.savingMachineApiKeys} onClick={() => actions.removeKey(key)}>Xóa</button></div>)}{!model.machineApiKeys.length && <p className="settings-empty">Chưa có key API.</p>}</div><p className="settings-helper">Thêm và xóa key được lưu ngay theo chức năng hiện có. Danh sách này là tên cấu hình, không chứa giá trị API key bí mật.</p></SettingsCard></SettingsTabPanel>}
    </fieldset>
  </div>;
}
