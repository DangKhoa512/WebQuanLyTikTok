import { useState } from 'react';
import SettingsSubTabs, { SettingsTabPanel, SettingsOverview } from './SettingsSubTabs';
import { SettingsCard, NumberField } from './SettingsPrimitives';
import { LimitSettings } from './SettingsFields';
import FacebookNurtureSettings from './FacebookNurtureSettings';

const tabs = [{id:'overview',label:'Tổng quan'},{id:'account',label:'Account'},{id:'reg',label:'Reg Page'},{id:'nurture',label:'Nuôi Facebook'},{id:'page',label:'Page Job'},{id:'scenario',label:'Kịch bản nuôi'}];
export default function FacebookSettingsPanel({ isAdmin, model, saved, setters, actions, busy, nurtureRef, onNurtureState, activeScenario }) {
  const [activeTab,setActiveTab] = useState('overview');
  const panel = (tab,children) => <SettingsTabPanel id="facebook" tab={tab} activeTab={activeTab}>{children}</SettingsTabPanel>;
  const field = (key,label,description) => <div><NumberField label={label} unit="giờ" min={0} max={720} value={model[key]} onChange={(e) => setters[key](e.target.value)} /><p className="settings-helper">{description}</p></div>;
  return <div className="settings-platform-panel">
    <SettingsSubTabs id="facebook" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} label="Cài đặt Facebook" />
    {panel('overview',<SettingsOverview title="Tổng quan Facebook" description="Tóm tắt các cấu hình đang sử dụng." onEdit={setActiveTab} items={[
      {id:'account',title:'Account',value:`${model.facebookLoginLimit} account/máy`,description:'Giới hạn account login trên mỗi máy.'},
      {id:'reg',title:'Reg Page',value:`Chờ ${model.facebookRegPageWaitHours} giờ`,description:`Reset sau ${model.facebookRegPageResetHours} giờ.`},
      {id:'nurture',title:'Nuôi Facebook',value:`Reset sau ${model.facebookNurtureResetHours} giờ`,description:'Mở lại account đã nuôi.'},
      {id:'page',title:'Page Job',value:`Reset sau ${model.facebookPageJobResetHours} giờ`,description:'Mở lại account và Page đã làm xong.'},
      {id:'scenario',title:'Kịch bản nuôi',value:activeScenario || 'Chưa chọn kịch bản',description:'Kịch bản đang sử dụng.'}
    ]} />)}
    <fieldset className="settings-workspace" disabled={busy}>
      {panel('account',<LimitSettings id="facebook-account" title="Limit Facebook login" description="Giới hạn account login thành công, đang làm và đã xong trên mỗi máy. Chỉ admin được chỉnh sửa limit Facebook." isAdmin={isAdmin} users={model.userFacebookLoginLimits} savedUsers={saved?.userFacebookLoginLimits} currentLimit={model.facebookLoginLimit} onChangeUsers={setters.userFacebookLoginLimits} onSaveUser={actions.saveLimit} savingUser={model.savingFacebookLimitUser} editableOwn={false} />)}
      {panel('reg',<SettingsCard title="Reg Page" description="Thời gian chờ sau login và thời gian mở lại account đã Reg Page."><div className="settings-form-row">{field('facebookRegPageWaitHours','Chờ sau login','Nhập 0 để lấy account ngay sau login thành công.')}{field('facebookRegPageResetHours','Reset Reg Page','Account đã báo cáo Reg Page được mở lại sau thời gian này.')}</div></SettingsCard>)}
      {panel('nurture',<SettingsCard title="Nuôi Facebook" description="Thời gian mở lại account để nuôi tiếp.">{field('facebookNurtureResetHours','Thời gian reset Nuôi','Chuyển Đã nuôi về Chưa nuôi sau thời gian này.')}</SettingsCard>)}
      {panel('page',<SettingsCard title="Page Job" description="Thời gian mở lại account và Page sau khi làm Job.">{field('facebookPageJobResetHours','Thời gian reset Page Job','Chuyển account Đã làm xong về Login thành công và Page về Chưa làm.')}</SettingsCard>)}
    </fieldset>
    {panel('scenario',<FacebookNurtureSettings ref={nurtureRef} onStateChange={onNurtureState} externalSaving={busy} />)}
  </div>;
}
