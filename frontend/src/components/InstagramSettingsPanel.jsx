import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsData } from './SettingsData';
import { authService } from '../services/authService';
import { copyText } from '../services/clipboard';
import { toast } from './Toast';
import { LimitSettings, MinMaxField } from './SettingsFields';
import SettingsSubTabs, { SettingsOverview, SettingsTabPanel } from './SettingsSubTabs';
import InstagramNurtureSettings from './InstagramNurtureSettings';
import { SettingsCard, NumberField, SettingsToggle, SettingsSaveBar } from './SettingsPrimitives';

const clone = (value) => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const defaultJob = { min_login_days: 0, actions: { like: { enabled: true, min_delay_seconds: 0, max_delay_seconds: 0 }, follow: { enabled: true, min_delay_seconds: 0, max_delay_seconds: 0 } } };
const cookieLines = (text) => [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, 200);
const subTabs = [{id:'overview',label:'Tổng quan'},{id:'account',label:'Account'},{id:'reg',label:'Reg IG'},{id:'tasks',label:'Nhiệm vụ'},{id:'conditions',label:'Điều kiện'},{id:'cookies',label:'Cookie'},{id:'scenario',label:'Kịch bản nuôi'}];

export default function InstagramSettingsPanel({ onSaved, onReset, onStateChange, visible = true }) {
  const { loadSettings, saveSettings } = useSettingsData();
  const isAdmin = authService.getRole() === 'admin';
  const [draft, setDraft] = useState({ limit: 10, users: [], reg: { reuse_hours: 24, max_instagram_per_facebook: 1 }, job: clone(defaultJob), cookies: '' });
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRow, setSavingRow] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [reload, setReload] = useState(0);
  const [cookieEdit, setCookieEdit] = useState(false);
  const [revealed, setRevealed] = useState(new Set());
  const [cookieResults, setCookieResults] = useState([]);
  const [checking, setChecking] = useState(false);
  const [nurtureState, setNurtureState] = useState({ dirty: false, saving: false, loading: true, activeName: '' });
  const nurtureRef = useRef(null);
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const reportNurture = useCallback((state) => setNurtureState(state), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([loadSettings('getInstagramLoginLimit'), isAdmin ? loadSettings('getInstagramLoginLimits') : Promise.resolve({ data: { users: [] } }), loadSettings('getInstagramFacebookReg'), loadSettings('getInstagramJob'), loadSettings('getInstagramCheckCookies')])
      .then(([limit, users, reg, job, cookies]) => {
        if (!alive) return;
        const value = { limit: limit.data.settings.limit, users: users.data.users || [], reg: reg.data.settings, job: job.data.settings, cookies: (cookies.data.settings.cookies || []).join('\n') };
        setDraft(clone(value)); setSaved(clone(value)); onSavedRef.current?.(value);
      }).catch((err) => alive && setError(err.message || 'Không tải được cài đặt Instagram'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [isAdmin, reload]);
  const dirty = saved !== null && !equal(draft, saved);
  const anyDirty = dirty || nurtureState.dirty;
  useEffect(() => { onStateChange?.({dirty:anyDirty}); }, [anyDirty,onStateChange]);
  const busy = saving || !!savingRow || checking || nurtureState.saving;
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);
  const update = (patch) => setDraft((old) => ({ ...old, ...patch }));
  const updateAction = (key, field, value) => setDraft((old) => ({ ...old, job: { ...old.job, actions: { ...old.job.actions, [key]: { ...old.job.actions[key], [field]: value } } } }));
  const cookies = cookieLines(draft.cookies);
  const rowDirty = (user) => saved && Number(user.limit) !== Number(saved.users.find((row) => row.username === user.username)?.limit);
  const invalidDelay = (action) => action.min_delay_seconds === '' || action.max_delay_seconds === '' || !Number.isFinite(Number(action.min_delay_seconds)) || !Number.isFinite(Number(action.max_delay_seconds)) || Number(action.min_delay_seconds) < 0 || Number(action.max_delay_seconds) > 86400 || Number(action.min_delay_seconds) > Number(action.max_delay_seconds);
  const normalizeJob = () => ({ ...draft.job, min_login_days: Number(draft.job.min_login_days), actions: Object.fromEntries(['like','follow'].map((key) => [key, { ...draft.job.actions[key], min_delay_seconds: Number(draft.job.actions[key].min_delay_seconds), max_delay_seconds: Number(draft.job.actions[key].max_delay_seconds) }])) });
  const validate = () => {
    if (Object.values(draft.job.actions).some(invalidDelay)) return 'Delay phải thỏa 0 ≤ Min ≤ Max ≤ 86400 giây.';
    if (draft.job.min_login_days === '' || !Number.isInteger(Number(draft.job.min_login_days)) || Number(draft.job.min_login_days) < 0 || Number(draft.job.min_login_days) > 3650) return 'Tuổi account phải là số nguyên từ 0 đến 3650 ngày.';
    if (!Number.isInteger(Number(draft.reg.reuse_hours)) || draft.reg.reuse_hours === '' || Number(draft.reg.reuse_hours) < 0 || Number(draft.reg.reuse_hours) > 720) return 'Thời gian mở lại phải từ 0 đến 720 giờ.';
    if (!Number.isInteger(Number(draft.reg.max_instagram_per_facebook)) || Number(draft.reg.max_instagram_per_facebook) < 1 || Number(draft.reg.max_instagram_per_facebook) > 100) return 'Giới hạn IG / Facebook phải từ 1 đến 100.';
    const limits = isAdmin ? draft.users.map((row) => row.limit) : [draft.limit];
    if (limits.some((limit) => !Number.isInteger(Number(limit)) || Number(limit) < 1)) return 'Limit phải là số nguyên lớn hơn 0.';
    return '';
  };
  const commitSection = (key, value) => {
    setDraft((old) => ({ ...old, [key]: value }));
    setSaved((old) => ({ ...old, [key]: clone(value) }));
  };
  const saveLimit = async (user = null) => {
    const limit = Number(user ? user.limit : draft.limit);
    if (!Number.isInteger(limit) || limit < 1) { toast.error('Limit phải là số nguyên lớn hơn 0'); return false; }
    const name = user?.username || authService.getUsername();
    setSavingRow(name);
    try {
      const res = await saveSettings('updateInstagramLoginLimit', limit, user?.username || null);
      const value = res.data.settings.limit;
      if (user) {
        setDraft((old) => ({ ...old, users: old.users.map((row) => row.username === name ? { ...row, limit: value } : row), limit: name === authService.getUsername().toLowerCase() ? value : old.limit }));
        setSaved((old) => ({ ...old, users: old.users.map((row) => row.username === name ? { ...row, limit: value } : row), limit: name === authService.getUsername().toLowerCase() ? value : old.limit }));
      } else commitSection('limit', value);
      onSavedRef.current?.({ limit: name === authService.getUsername().toLowerCase() ? value : undefined });
      return true;
    } catch (err) { setError(err.message); toast.error(err.message); return false; }
    finally { setSavingRow(''); }
  };
  const saveAll = async () => {
    const message = validate();
    if (message) { setError(message); toast.error(message); return; }
    if (nurtureState.dirty && !nurtureRef.current?.validate()) return;
    setSaving(true); setError('');
    try {
      // Keep the existing module endpoints; mark each successful module saved independently.
      if (isAdmin) {
        for (const user of draft.users.filter(rowDirty)) if (!await saveLimit(user)) return;
      } else if (Number(draft.limit) !== Number(saved.limit) && !await saveLimit()) return;
      if (!equal(draft.reg, saved.reg)) {
        const res = await saveSettings('updateInstagramFacebookReg', Number(draft.reg.reuse_hours), Number(draft.reg.max_instagram_per_facebook));
        commitSection('reg', res.data.settings); onSavedRef.current?.({ reg: res.data.settings });
      }
      if (!equal(draft.job, saved.job)) {
        const res = await saveSettings('updateInstagramJob', normalizeJob());
        commitSection('job', res.data.settings); onSavedRef.current?.({ job: res.data.settings });
      }
      if (draft.cookies !== saved.cookies) {
        const res = await saveSettings('updateInstagramCheckCookies', draft.cookies);
        const value = (res.data?.settings?.cookies || cookies).join('\n');
        commitSection('cookies', value); onSavedRef.current?.({ cookies: value });
      }
      if (nurtureState.dirty && !await nurtureRef.current.save()) return;
      toast.success('Đã lưu thay đổi');
    } catch (err) { setError(err.message); toast.error(err.message || 'Không lưu được cài đặt'); }
    finally { setSaving(false); }
  };
  const discard = () => { setDraft(clone(saved)); nurtureRef.current?.discard(); setError(''); setCookieEdit(false); setRevealed(new Set()); setCookieResults([]); };
  const removeCookie = (index) => { update({ cookies: cookies.filter((_, i) => i !== index).join('\n') }); setCookieResults([]); setRevealed(new Set()); };
  const checkCookies = async (onlyIndex = null) => {
    setChecking(true); setCookieResults([]);
    try {
      const indices = onlyIndex === null ? cookies.map((_, i) => i) : [onlyIndex];
      const results = [];
      for (let offset = 0; offset < indices.length; offset += 20) {
        const batch = indices.slice(offset, offset + 20);
        const res = await saveSettings('checkInstagramCheckCookies', batch.map((i) => cookies[i]));
        results.push(...(res.data?.results || []).map((result, i) => ({ ...result, index: batch[result.index ?? i] })));
        if (mounted.current) setCookieResults([...results]);
      }
      toast.success('Đã kiểm tra ' + results.length + ' cookie');
    } catch (err) { toast.error(err.message); }
    finally { if (mounted.current) setChecking(false); }
  };
  if (loading) return <div className="ig-settings-panel" aria-busy="true"><div className="settings-loading"><span className="settings-loading-dot" />Đang tải cài đặt Instagram...</div></div>;
  if (!saved) return <div className="ig-settings-panel"><div className="settings-error" role="alert">{error}<button className="settings-button secondary" onClick={() => setReload((old) => old + 1)}>Thử lại</button></div></div>;
  return <div className="ig-settings-panel">
    <SettingsSubTabs id="instagram" label="Cài đặt Instagram" tabs={subTabs} activeTab={activeTab} onChange={setActiveTab} />
    {error && <div className="settings-error" role="alert">{error}<button className="settings-button ghost" aria-label="Đóng thông báo" onClick={() => setError('')}>×</button></div>}
    <fieldset className="settings-workspace" disabled={busy}>
      <SettingsTabPanel id="instagram" tab="overview" activeTab={activeTab}>
        <SettingsOverview title="Tổng quan Instagram" description="Cấu hình account, nhiệm vụ và kịch bản của bạn." onEdit={setActiveTab} items={[
          {id:'account',title:'Account',value:`${draft.users.find((user) => user.username === authService.getUsername().toLowerCase())?.limit ?? draft.limit} account / máy`,description:'Giới hạn account trên từng thiết bị.'},
          {id:'reg',title:'Reg Instagram',value:`${draft.reg.reuse_hours} giờ · ${draft.reg.max_instagram_per_facebook} IG / Facebook`,description:'Thời gian mở lại và giới hạn tài khoản nguồn.'},
          {id:'tasks',title:'Nhiệm vụ',value:['like','follow'].map((key) => `${key === 'like' ? 'Like' : 'Follow'} ${draft.job.actions[key].enabled ? 'ON' : 'OFF'}`).join(' · ')},
          {id:'conditions',title:'Điều kiện',value:`${draft.job.min_login_days || 0} ngày sau login`,description:'Tuổi account tối thiểu để nhận job.'},
          {id:'cookies',title:'Cookie',value:`${cookies.length} cookie dự phòng`,action:'Quản lý'},
          {id:'scenario',title:'Kịch bản nuôi',value:nurtureState.loading ? 'Đang tải...' : nurtureState.activeName || 'Chưa chọn kịch bản',description:nurtureState.activeName ? '● Đang sử dụng' : 'Tạo và chọn kịch bản cho thiết bị.'},
        ]} />
      </SettingsTabPanel>
      <SettingsTabPanel id="instagram" tab="account" activeTab={activeTab}>
      <LimitSettings id="ig-account" title="Limit account theo máy" description="Giới hạn số lượng account Instagram được giữ trên từng thiết bị." isAdmin={isAdmin} users={draft.users} savedUsers={saved.users} currentLimit={draft.limit} onChangeOwn={(limit) => update({limit})} onChangeUsers={(users) => update({users})} savingUser={savingRow} onSaveUser={async (username) => { if (await saveLimit(draft.users.find((user) => user.username === username))) toast.success('Đã lưu limit cho ' + username); }} helper="Khi đủ limit, API trả Full limit. Account die hoặc chuyển khỏi máy sẽ mở slot." />
      </SettingsTabPanel>
      <SettingsTabPanel id="instagram" tab="reg" activeTab={activeTab}>
        <SettingsCard id="ig-reg" title="Instagram Reg bằng Facebook" description="Quản lý thời gian tái sử dụng tài khoản nguồn.">
          <div className="settings-form-grid"><NumberField label="Mở lại sau" unit="giờ" min={0} max={720} value={draft.reg.reuse_hours} onChange={(e) => update({ reg: { ...draft.reg, reuse_hours: e.target.value === '' ? '' : Number(e.target.value) } })} /><NumberField label="Giới hạn IG / Facebook" unit="account" min={1} max={100} value={draft.reg.max_instagram_per_facebook} onChange={(e) => update({ reg: { ...draft.reg, max_instagram_per_facebook: e.target.value === '' ? '' : Number(e.target.value) } })} /></div>
          <p className="settings-helper">Facebook account chỉ được sử dụng lại sau thời gian chờ và khi chưa đạt giới hạn Instagram. Nút Reset ở trang Instagram Reg có thể mở lại ngay.</p>
        </SettingsCard>
      </SettingsTabPanel>
      <SettingsTabPanel id="instagram" tab="conditions" activeTab={activeTab}>
        <SettingsCard id="ig-condition" title="Điều kiện chạy account" description="Chọn thời điểm account được phép nhận job."><NumberField label="Tuổi account tối thiểu" unit="ngày" min={0} max={3650} value={draft.job.min_login_days} onChange={(e) => update({ job: { ...draft.job, min_login_days: e.target.value === '' ? '' : Number(e.target.value) } })} /><p className="settings-helper">Tính từ lần login, mỗi ngày đủ 24 giờ. Account chưa đủ điều kiện sẽ không được API cấp job.</p></SettingsCard>
      </SettingsTabPanel>
      <SettingsTabPanel id="instagram" tab="tasks" activeTab={activeTab}>
      <SettingsCard id="ig-tasks" title="Nhiệm vụ chạy" description="Bật nhiệm vụ và chọn khoảng delay giữa các lần thực hiện.">
        <div className="settings-action-list">{['like','follow'].map((key) => { const action = draft.job.actions[key]; return <div className="settings-action-row" key={key}><div className="settings-action-heading"><strong>{key === 'like' ? 'Like' : 'Follow'}</strong><div className="settings-switch-label"><SettingsToggle label={'Bật ' + key} checked={action.enabled} onChange={(value) => updateAction(key,'enabled',value)} /><span>{action.enabled ? 'ON' : 'OFF'}</span></div></div><MinMaxField unit="giây" step="any" maximum={86400} min={action.min_delay_seconds} max={action.max_delay_seconds} disabled={!action.enabled} onChange={(bound,value) => updateAction(key,bound + '_delay_seconds',value)} /></div>; })}</div>
      </SettingsCard>
      </SettingsTabPanel>
      <SettingsTabPanel id="instagram" tab="cookies" activeTab={activeTab}>
      <SettingsCard id="ig-cookies" title="Cookie dự phòng Instagram" description="Chỉ sử dụng khi API check thông thường trả về unknown." action={<span className="settings-badge">{cookies.length} cookie</span>}>
        <div className="settings-cookie-content"><div className="settings-button-group"><button type="button" className="settings-button secondary" onClick={() => { setCookieEdit(!cookieEdit); setRevealed(new Set()); }}>{cookieEdit ? 'Đóng chỉnh sửa' : 'Thêm / chỉnh sửa cookie'}</button><button type="button" className="settings-button secondary" disabled={checking || !cookies.length} onClick={() => checkCookies()}>{checking ? 'Đang check ' + cookieResults.length + '/' + cookies.length : 'Check tất cả'}</button><button type="button" className="settings-button danger" disabled={!cookieResults.some((result) => result.status === 'die')} onClick={() => { const dead = new Set(cookieResults.filter((result) => result.status === 'die').map((result) => result.index)); update({ cookies: cookies.filter((_,index) => !dead.has(index)).join('\n') }); setCookieResults([]); setRevealed(new Set()); }}>Xóa cookie die</button></div>
          {cookieEdit && <label className="settings-field"><span>Mỗi cookie một dòng · tối đa 200 cookie</span><textarea rows={5} spellCheck={false} aria-label="Chỉnh sửa cookie Instagram" value={draft.cookies} onChange={(e) => { update({ cookies: e.target.value }); setCookieResults([]); setRevealed(new Set()); }} /></label>}
          {!cookies.length && <p className="settings-empty">Chưa có cookie dự phòng. Thêm cookie để bắt đầu.</p>}
          <div className="settings-cookie-list">{cookies.map((cookie,index) => { const result = cookieResults.find((item) => item.index === index); return <div className="settings-cookie-row" key={index}><div><strong>Cookie #{index + 1}</strong>{revealed.has(index) ? <textarea rows={2} readOnly aria-label={'Cookie #' + (index + 1)} value={cookie} /> : <div className="settings-cookie-mask">••••••••••••••••••••••••</div>}{result && <p className="settings-cookie-result"><span className={'settings-badge ' + (result.status === 'live' ? 'success' : result.status === 'die' ? 'danger' : 'warning')}>{result.status}</span> {result.username ? '@' + result.username + ' · ' : ''}{result.reason}</p>}</div><div className="settings-button-group"><button type="button" className="settings-button ghost small" onClick={() => setRevealed((old) => { const next = new Set(old); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>{revealed.has(index) ? 'Ẩn' : 'Hiện'}</button><button type="button" className="settings-button ghost small" onClick={async () => { try { await copyText(cookie); toast.success('Đã copy cookie'); } catch (err) { toast.error(err.message); } }}>Copy</button><button type="button" className="settings-button secondary small" disabled={checking} onClick={() => checkCookies(index)}>Check</button><button type="button" className="settings-button danger small" onClick={() => removeCookie(index)}>Xóa</button></div></div>; })}</div><p className="settings-helper">Cookie được lưu riêng cho user đang đăng nhập. Hệ thống xoay vòng tối đa 3 cookie cho một account.</p>
        </div>
      </SettingsCard>
      </SettingsTabPanel>
    </fieldset>
    <SettingsTabPanel id="instagram" tab="scenario" activeTab={activeTab}>
    <InstagramNurtureSettings ref={nurtureRef} onStateChange={reportNurture} externalSaving={saving} />
    </SettingsTabPanel>
    <div className="settings-footer-note"><div>Cấu hình được lưu riêng theo tài khoản đăng nhập.{onReset && <button type="button" className="settings-button ghost small" disabled={busy} onClick={async () => { if (confirm('Khôi phục cài đặt mặc định? Thao tác Reset hiện có áp dụng cho cài đặt chung và cấu hình các nền tảng.')) { setSaving(true); try { await onReset(); } catch { /* Parent reports the API error and retains drafts. */ } finally { setSaving(false); } } }}>↺ Reset cài đặt</button>}</div><span>{anyDirty ? 'Chưa lưu thay đổi' : 'Đã đồng bộ cài đặt'}</span></div>
    {visible && <SettingsSaveBar dirty={anyDirty} saving={saving || !!savingRow || nurtureState.saving} disabled={loading || !!nurtureState.loading || checking} label={checking ? 'Đang kiểm tra cookie...' : 'Bạn có thay đổi chưa lưu'} onDiscard={discard} onSave={saveAll} />}
  </div>;
}
