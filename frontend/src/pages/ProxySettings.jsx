import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCheckLiveSettings, saveCheckLiveSettings } from '../services/checkLiveSettings';
import { SettingsDataProvider, useSettingsData } from '../components/SettingsData';
import { toast } from '../components/Toast';
import { authService } from '../services/authService';
import FacebookSettingsPanel from '../components/FacebookSettingsPanel';
import TikTokSettingsPanel from '../components/TikTokSettingsPanel';
import InstagramSettingsPanel from '../components/InstagramSettingsPanel';
import PlatformTabs from '../components/PlatformTabs';
import '../styles/settings.css';
import CommonSettingsPanel from '../components/CommonSettingsPanel';
import { SettingsSaveBar } from '../components/SettingsPrimitives';

const SETTINGS_TABS = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'common', label: 'Cài đặt chung' },
];
const DEFAULT_TASK_DISPATCHER = {lock_timeout_minutes:30,max_retry:3,tasks:{}};
function ProxySettings() {
  const { loadSettings, saveSettings } = useSettingsData();
  const init = loadCheckLiveSettings();
  const [proxies,     setProxies]     = useState(init.proxies);
  const [concurrency, setConcurrency] = useState(init.concurrency);
  const [delayMs,     setDelayMs]     = useState(init.delayMs);
  const [batchSize,   setBatchSize]   = useState(init.batchSize);
  const [minVideos,   setMinVideos]   = useState(20);
  const [minAgeDays,  setMinAgeDays]  = useState(4);
  const [khangDailyLimit, setKhangDailyLimit] = useState(8);
  const [userKhangLimits, setUserKhangLimits] = useState([]);
  const [savingLimitUser, setSavingLimitUser] = useState('');
  const [facebookLoginLimit, setFacebookLoginLimit] = useState(10);
  const [userFacebookLoginLimits, setUserFacebookLoginLimits] = useState([]);
  const [savingFacebookLimitUser, setSavingFacebookLimitUser] = useState('');
  const [jobAccountDailyLimit, setJobAccountDailyLimit] = useState(20);
  const [facebookRegPageWaitHours, setFacebookRegPageWaitHours] = useState(8);
  const [facebookRegPageResetHours, setFacebookRegPageResetHours] = useState(24);
  const [facebookNurtureResetHours, setFacebookNurtureResetHours] = useState(24);
  const [facebookPageJobResetHours, setFacebookPageJobResetHours] = useState(24);
  const [savingFacebookWorkflow, setSavingFacebookWorkflow] = useState('');
  const [savingOwnFacebookLimit, setSavingOwnFacebookLimit] = useState(false);
  const [userJobAccountDailyLimits, setUserJobAccountDailyLimits] = useState([]);
  const [savingJobLimitUser, setSavingJobLimitUser] = useState('');
  const [savingOwnJobLimit, setSavingOwnJobLimit] = useState(false);
  const [machineApiKeys, setMachineApiKeys] = useState([]);
  const [newMachineApiKey, setNewMachineApiKey] = useState('');
  const [savingMachineApiKeys, setSavingMachineApiKeys] = useState(false);
  const [taskDispatcher, setTaskDispatcher] = useState(DEFAULT_TASK_DISPATCHER);
  const [savingTaskDispatcher, setSavingTaskDispatcher] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [settingsTab, setSettingsTab] = useState('tiktok');
  const [instagramDraftState,setInstagramDraftState] = useState({dirty:false});
  const reportInstagramDraft = useCallback((state) => setInstagramDraftState(state), []);
  const [facebookVisited, setFacebookVisited] = useState(false);
  const [instagramVisited, setInstagramVisited] = useState(false);
  const [instagramPanelVersion, setInstagramPanelVersion] = useState(0);
  const isAdminUser = authService.getRole() === 'admin';

  const [dataReady,setDataReady] = useState(false);
  const [dataError,setDataError] = useState(false);
  const [reload,setReload] = useState(0);
  const [legacyBaseline, setLegacyBaseline] = useState(null);
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [facebookDraftState, setFacebookDraftState] = useState({ dirty: false, saving: false });
  const facebookNurtureRef = useRef(null);
  const registryRef=useRef(null);
  const [registryState,setRegistryState]=useState({dirty:false,saving:false});
  const reportRegistry=useCallback(state=>setRegistryState(state),[]);
  const reportFacebookDraft = useCallback((state) => setFacebookDraftState(state), []);
  const legacyValues = { proxies, concurrency, delayMs, batchSize, minVideos, minAgeDays, userKhangLimits, facebookLoginLimit, userFacebookLoginLimits, jobAccountDailyLimit, userJobAccountDailyLimits, facebookRegPageWaitHours, facebookRegPageResetHours, facebookNurtureResetHours, facebookPageJobResetHours, taskDispatcher };
  const legacySetters = { proxies: setProxies, concurrency: setConcurrency, delayMs: setDelayMs, batchSize: setBatchSize, minVideos: setMinVideos, minAgeDays: setMinAgeDays, userKhangLimits: setUserKhangLimits, facebookLoginLimit: setFacebookLoginLimit, userFacebookLoginLimits: setUserFacebookLoginLimits, jobAccountDailyLimit: setJobAccountDailyLimit, userJobAccountDailyLimits: setUserJobAccountDailyLimits, facebookRegPageWaitHours: setFacebookRegPageWaitHours, facebookRegPageResetHours: setFacebookRegPageResetHours, facebookNurtureResetHours: setFacebookNurtureResetHours, facebookPageJobResetHours: setFacebookPageJobResetHours, taskDispatcher: setTaskDispatcher };
  const comparable = (value) => JSON.stringify(value, (_key, item) => typeof item === 'string' && item.trim() !== '' && Number.isFinite(Number(item)) ? Number(item) : item);
  const legacyChanged = (key) => legacyBaseline !== null && comparable(legacyValues[key]) !== comparable(legacyBaseline[key]);
  const platformKeys = {
    tiktok:['minVideos','minAgeDays','userKhangLimits','jobAccountDailyLimit','userJobAccountDailyLimits'],
    facebook:['facebookLoginLimit','userFacebookLoginLimits','facebookRegPageWaitHours','facebookRegPageResetHours','facebookNurtureResetHours','facebookPageJobResetHours'],
    common:['proxies','concurrency','delayMs','batchSize','taskDispatcher'],
  };
  const legacyDirty = Object.keys(legacyValues).some(legacyChanged);
  const activeDirty = (platformKeys[settingsTab] || []).some(legacyChanged);
  const markLegacySaved = (patch) => setLegacyBaseline((old) => old ? { ...old, ...JSON.parse(JSON.stringify(patch)) } : old);
  const markLegacyRowSaved = (key, username, limit) => setLegacyBaseline((old) => old ? { ...old, [key]: old[key].map((row) => row.username === username ? { ...row, limit } : row) } : old);
  const globalKeys = ['proxies','concurrency','delayMs','batchSize','minVideos','minAgeDays','facebookRegPageWaitHours','facebookRegPageResetHours','facebookNurtureResetHours','facebookPageJobResetHours'];
  const discardLegacy = () => {
    if (legacyBaseline) (platformKeys[settingsTab] || []).forEach((key) => legacySetters[key]?.(JSON.parse(JSON.stringify(legacyBaseline[key]))));
    if (settingsTab === 'facebook') facebookNurtureRef.current?.discard();
    if (settingsTab === 'common') registryRef.current?.discard();
  };
  useEffect(() => {
    if (!legacyDirty && !facebookDraftState.dirty && !registryState.dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [legacyDirty, facebookDraftState.dirty,registryState.dirty]);

  useEffect(() => {
    let mounted = true;
    setDataReady(false); setDataError(false);
    loadSettings('getEligibility')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setMinVideos(settings.min_videos || 20);
        setMinAgeDays(settings.min_age_days || 4);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cài đặt đủ điều kiện'));
    loadSettings('getFacebookCheckProxies')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        const savedProxies = settings.proxies || [];
        if (savedProxies.length || !init.proxies.trim()) setProxies(savedProxies.join('\n'));
        if (settings.concurrency) setConcurrency(settings.concurrency);
      })
      .catch((err) => toast.error(err.message || 'Không tải được proxy check Facebook'));
    loadSettings('getFacebookWorkflow')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        if (Number.isInteger(settings.reg_page_reset_hours)) setFacebookRegPageResetHours(settings.reg_page_reset_hours);
        if (Number.isInteger(settings.reg_page_wait_hours)) setFacebookRegPageWaitHours(settings.reg_page_wait_hours);
        if (Number.isInteger(settings.nurture_reset_hours)) setFacebookNurtureResetHours(settings.nurture_reset_hours);
        if (Number.isInteger(settings.page_job_reset_hours)) setFacebookPageJobResetHours(settings.page_job_reset_hours);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cấu hình luồng Facebook'));
    loadSettings('getChromeKhangLimit')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setKhangDailyLimit(settings.limit || 8);
      })
      .catch((err) => toast.error(err.message || 'Không tải được limit Chrome kháng'));
    loadSettings('getFacebookLoginLimit')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setFacebookLoginLimit(settings.limit || 10);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc limit Facebook login'));
    loadSettings('getJobAccountDailyLimit')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setJobAccountDailyLimit(settings.limit || 20);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc limit JOB'));
    loadSettings('getTaskDispatcher')
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings;
        if (settings) setTaskDispatcher(settings);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc cau hinh Task Dispatcher'));
    if (isAdminUser) {
      loadSettings('getChromeKhangLimits')
        .then((res) => {
          if (!mounted) return;
          setUserKhangLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Không tải được limit user'));
      loadSettings('getFacebookLoginLimits')
        .then((res) => {
          if (!mounted) return;
          setUserFacebookLoginLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Khong tai duoc limit Facebook login user'));
      loadSettings('getJobAccountDailyLimits')
        .then((res) => {
          if (!mounted) return;
          setUserJobAccountDailyLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Khong tai duoc limit JOB user'));
    }
    if (isAdminUser) loadSettings('getMachineApiKeys').then((res) => { if (mounted) setMachineApiKeys(res.data?.keys || []); }).catch(() => {});
    const names = ['getEligibility','getFacebookCheckProxies','getFacebookWorkflow','getChromeKhangLimit','getFacebookLoginLimit','getJobAccountDailyLimit','getTaskDispatcher', ...(isAdminUser ? ['getChromeKhangLimits','getFacebookLoginLimits','getJobAccountDailyLimits','getMachineApiKeys'] : [])];
    Promise.allSettled(names.map(loadSettings)).then((results) => { if (mounted) { setDataError(results.some((result) => result.status === 'rejected')); setDataReady(true); } });
    return () => { mounted = false; };
  }, [isAdminUser,reload]);
  useEffect(() => { if (dataReady && !dataError) setLegacyBaseline(JSON.parse(JSON.stringify(legacyValues))); }, [dataReady,dataError]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settingsTab === 'tiktok' && ['minAgeDays','minVideos'].some(legacyChanged)) {
        const age = parseInt(minAgeDays,10), videos = parseInt(minVideos,10);
        if (!Number.isInteger(age) || age <= 0 || !Number.isInteger(videos) || videos <= 0) throw new Error('Điều kiện phải là số nguyên lớn hơn 0.');
        await saveSettings('updateEligibility',age,videos);
        markLegacySaved({minAgeDays:age,minVideos:videos});
      }
      if (settingsTab === 'facebook' && ['facebookRegPageWaitHours','facebookRegPageResetHours','facebookNurtureResetHours','facebookPageJobResetHours'].some(legacyChanged)) {
        if (!await handleSaveFacebookWorkflow('all')) return false;
      }
      if (settingsTab === 'common' && ['proxies','concurrency','delayMs','batchSize'].some(legacyChanged)) {
        const valid = (value,min,max) => value !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
        if (!valid(concurrency,1,40) || !valid(delayMs,0,5000) || !valid(batchSize,10,200)) throw new Error('Luồng phải từ 1–40, delay 0–5000 ms và batch 10–200 account.');
        if (['proxies','concurrency'].some(legacyChanged)) await saveSettings('updateFacebookCheckProxies',proxies,parseInt(concurrency,10));
        saveCheckLiveSettings({proxies,concurrency:parseInt(concurrency,10),delayMs:parseInt(delayMs,10),batchSize:parseInt(batchSize,10)});
        markLegacySaved({proxies,concurrency,delayMs,batchSize});
      }
      toast.success('Đã lưu cài đặt'); return true;
    } catch (err) { toast.error(err.message || 'Lưu cài đặt thất bại'); return false; }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    setSaving(true);
    return Promise.all([
      saveSettings('updateEligibility', 4, 20),
      saveSettings('updateFacebookCheckProxies', '', 20),
      saveSettings('updateInstagramCheckCookies', ''),
      saveSettings('updateFacebookWorkflow', { reg_page_reset_hours: 24, reg_page_wait_hours: 8, nurture_reset_hours: 24, page_job_reset_hours: 24 }),
      saveSettings('updateInstagramFacebookReg', 24, 1),
    ])
      .then(() => {
    setProxies('');
    setConcurrency(20);
    setDelayMs(200);
    setBatchSize(60);
    setMinVideos(20);
    setMinAgeDays(4);
    setKhangDailyLimit(8);
    setFacebookLoginLimit(10);
    setJobAccountDailyLimit(20);
    setFacebookRegPageWaitHours(8);
    setFacebookRegPageResetHours(24);
    setFacebookNurtureResetHours(24);
    setFacebookPageJobResetHours(24);
    saveCheckLiveSettings({ proxies: '', concurrency: 20, delayMs: 200, batchSize: 60 });

      setReload((old) => old + 1); setInstagramPanelVersion((old) => old + 1); toast.success('Đã reset cài đặt'); })
      .catch((err) => { toast.error(err.message || 'Reset cài đặt thất bại'); throw err; }).finally(() => setSaving(false));
  };

  const handleSaveUserLimit = async (username) => {
    const row = userKhangLimits.find((item) => item.username === username);
    if (!row) return;

    const limit = parseInt(row.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit phải lớn hơn 0');
      return;
    }

    setSavingLimitUser(username);
    try {
      const res = await saveSettings('updateChromeKhangLimit', limit, username);
      const saved = res.data?.settings || {};
      setUserKhangLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setKhangDailyLimit(saved.limit || limit);
      }
      markLegacyRowSaved('userKhangLimits', username, saved.limit || limit);
      toast.success(`Đã lưu limit cho ${username}`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Lưu limit thất bại');
      return false;
    } finally {
      setSavingLimitUser('');
    }
  };


  const handleSaveFacebookUserLimit = async (username) => {
    const row = userFacebookLoginLimits.find((item) => item.username === username);
    if (!row) return;

    const limit = parseInt(row.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit phai lon hon 0');
      return;
    }

    setSavingFacebookLimitUser(username);
    try {
      const res = await saveSettings('updateFacebookLoginLimit', limit, username);
      const saved = res.data?.settings || {};
      setUserFacebookLoginLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setFacebookLoginLimit(saved.limit || limit);
      }
      markLegacyRowSaved('userFacebookLoginLimits', username, saved.limit || limit);
      if (username === authService.getUsername().toLowerCase()) markLegacySaved({ facebookLoginLimit: saved.limit || limit });
      toast.success(`Da luu limit Facebook cho ${username}`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Luu limit Facebook that bai');
      return false;
    } finally {
      setSavingFacebookLimitUser('');
    }
  };

  const handleSaveOwnFacebookLimit = async () => {
    const limit = parseInt(facebookLoginLimit, 10);
    if (!Number.isInteger(limit) || limit <= 0) return toast.error('Limit Login phải lớn hơn 0');
    setSavingOwnFacebookLimit(true);
    try {
      const res = await saveSettings('updateFacebookLoginLimit', limit, authService.getUsername());
      setFacebookLoginLimit(res.data?.settings?.limit || limit);
      markLegacySaved({ facebookLoginLimit: res.data?.settings?.limit || limit });
      toast.success('Đã lưu Limit Login Facebook');
      return true;
    } catch (err) {
      toast.error(err.message || 'Lưu Limit Login Facebook thất bại');
      return false;
    } finally {
      setSavingOwnFacebookLimit(false);
    }
  };

  const handleSaveFacebookWorkflow = async (field) => {
    const payload = {
      reg_page_reset_hours: parseInt(facebookRegPageResetHours, 10),
      reg_page_wait_hours: parseInt(facebookRegPageWaitHours, 10),
      nurture_reset_hours: parseInt(facebookNurtureResetHours, 10),
      page_job_reset_hours: parseInt(facebookPageJobResetHours, 10),
    };
    if (Object.values(payload).some((value) => !Number.isInteger(value) || value < 0 || value > 720)) {
      return toast.error('Thời gian phải từ 0 đến 720 giờ');
    }
    setSavingFacebookWorkflow(field);
    try {
      const res = await saveSettings('updateFacebookWorkflow', payload);
      const saved = res.data?.settings || payload;
      setFacebookRegPageResetHours(saved.reg_page_reset_hours);
      setFacebookRegPageWaitHours(saved.reg_page_wait_hours);
      setFacebookNurtureResetHours(saved.nurture_reset_hours);
      setFacebookPageJobResetHours(saved.page_job_reset_hours);
      markLegacySaved({ facebookRegPageResetHours: saved.reg_page_reset_hours, facebookRegPageWaitHours: saved.reg_page_wait_hours, facebookNurtureResetHours: saved.nurture_reset_hours, facebookPageJobResetHours: saved.page_job_reset_hours });
      toast.success('Đã lưu cấu hình Facebook');
      return true;
    } catch (err) {
      toast.error(err.message || 'Lưu cấu hình Facebook thất bại');
      return false;
    } finally {
      setSavingFacebookWorkflow('');
    }
  };

  const handleSaveOwnJobLimit = async () => {
    const limit = parseInt(jobAccountDailyLimit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit JOB phai lon hon 0');
      return;
    }
    setSavingOwnJobLimit(true);
    try {
      const res = await saveSettings('updateJobAccountDailyLimit', limit);
      const saved = res.data?.settings || {};
      setJobAccountDailyLimit(saved.limit || limit);
      markLegacySaved({ jobAccountDailyLimit: saved.limit || limit });
      toast.success('Da luu limit JOB');
      return true;
    } catch (err) {
      toast.error(err.message || 'Luu limit JOB that bai');
      return false;
    } finally {
      setSavingOwnJobLimit(false);
    }
  };

  const handleSaveJobUserLimit = async (username) => {
    const row = userJobAccountDailyLimits.find((item) => item.username === username);
    if (!row) return;
    const limit = parseInt(row.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit JOB phai lon hon 0');
      return;
    }
    setSavingJobLimitUser(username);
    try {
      const res = await saveSettings('updateJobAccountDailyLimit', limit, username);
      const saved = res.data?.settings || {};
      setUserJobAccountDailyLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setJobAccountDailyLimit(saved.limit || limit);
      }
      markLegacyRowSaved('userJobAccountDailyLimits', username, saved.limit || limit);
      if (username === authService.getUsername().toLowerCase()) markLegacySaved({ jobAccountDailyLimit: saved.limit || limit });
      toast.success('Da luu limit JOB cho ' + username);
      return true;
    } catch (err) {
      toast.error(err.message || 'Luu limit JOB that bai');
      return false;
    } finally {
      setSavingJobLimitUser('');
    }
  };

  const normalizeMachineApiKey = (value) => String(value || '').trim().toUpperCase();

  const handleSaveTaskDispatcher = async () => {
    const valid = (value,min,max) => value !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
    if (!valid(taskDispatcher.lock_timeout_minutes,5,1440) || !valid(taskDispatcher.max_retry,0,20) || Object.values(taskDispatcher.tasks || {}).some((task) => !valid(task.priority,-10000,10000))) { toast.error('Timeout phải từ 5–1440 phút, retry 0–20 và priority -10000–10000.'); return false; }
    setSavingTaskDispatcher(true);
    try {
      const res = await saveSettings('updateTaskDispatcher', taskDispatcher);
      setTaskDispatcher(res.data?.settings || taskDispatcher);
      markLegacySaved({ taskDispatcher: res.data?.settings || taskDispatcher });
      toast.success('Da luu cau hinh Task Dispatcher');
      return true;
    } catch (err) {
      toast.error(err.message || 'Luu Task Dispatcher that bai');
      return false;
    } finally {
      setSavingTaskDispatcher(false);
    }
  };

  const saveMachineApiKeys = async (keys) => {
    setSavingMachineApiKeys(true);
    try {
      const res = await saveSettings('updateMachineApiKeys', keys);
      setMachineApiKeys(res.data?.keys || keys);
      setNewMachineApiKey('');
      toast.success('Đã lưu danh sách key API máy');
    } catch (err) {
      toast.error(err.message || 'Luu key API may that bai');
    } finally {
      setSavingMachineApiKeys(false);
    }
  };

  const handleAddMachineApiKey = () => {
    const key = normalizeMachineApiKey(newMachineApiKey);
    if (!key) {
      toast.error('Nhap ten key API truoc');
      return;
    }
    if (machineApiKeys.includes(key)) {
      toast.error('Key API da ton tai');
      return;
    }
    saveMachineApiKeys([...machineApiKeys, key]);
  };

  const handleRemoveMachineApiKey = (key) => {
    if (!confirm('Xoa key API ' + key + '?')) return;
    saveMachineApiKeys(machineApiKeys.filter((item) => item !== key));
  };

  const saveLegacyChanges = async () => {
    setSavingLegacy(true);
    try {
      if (globalKeys.filter((key) => platformKeys[settingsTab]?.includes(key)).some(legacyChanged) && !await handleSave()) return;
      for (const [key, handler] of (settingsTab === 'tiktok' ? [['userKhangLimits',handleSaveUserLimit],['userJobAccountDailyLimits',handleSaveJobUserLimit]] : settingsTab === 'facebook' ? [['userFacebookLoginLimits',handleSaveFacebookUserLimit]] : [])) {
        if (legacyChanged(key)) for (const row of legacyValues[key]) {
          const old = legacyBaseline[key].find((item) => item.username === row.username);
          if (Number(row.limit) !== Number(old?.limit) && !await handler(row.username)) return;
        }
      }
      if (settingsTab === 'facebook' && isAdminUser && legacyChanged('facebookLoginLimit') && !await handleSaveOwnFacebookLimit()) return;
      if (settingsTab === 'tiktok' && !isAdminUser && legacyChanged('jobAccountDailyLimit') && !await handleSaveOwnJobLimit()) return;
      if (settingsTab === 'common' && legacyChanged('taskDispatcher') && !await handleSaveTaskDispatcher()) return;
      if (settingsTab === 'common' && registryState.dirty && !await registryRef.current?.save()) return;
      if (settingsTab === 'facebook' && facebookDraftState.dirty && !await facebookNurtureRef.current?.save()) return;
    } finally { setSavingLegacy(false); }
  };

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h1>Cài đặt</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Cấu hình hệ thống và từng nền tảng
          </p>
        </div>
      </div>

      <PlatformTabs tabs={SETTINGS_TABS} activeTab={settingsTab} dirty={{tiktok:platformKeys.tiktok.some(legacyChanged),facebook:platformKeys.facebook.some(legacyChanged) || facebookDraftState.dirty,instagram:instagramDraftState.dirty,common:platformKeys.common.some(legacyChanged) || registryState.dirty}} onChange={(key) => { if (key === 'instagram') setInstagramVisited(true); if (key === 'facebook') setFacebookVisited(true); setSettingsTab(key); }} />

      {!dataReady && <div className="settings-loading" aria-busy="true">Đang tải cài đặt...</div>}
      {dataError && <div className="settings-error" role="alert">Không tải đầy đủ cài đặt. Vui lòng thử lại.<button className="settings-button secondary" onClick={() => setReload((old) => old + 1)}>Thử lại</button></div>}
      <div role="tabpanel" id="platform-panel-instagram" aria-labelledby="platform-tab-instagram" hidden={!dataReady || dataError || settingsTab !== 'instagram'}>{instagramVisited && <InstagramSettingsPanel key={instagramPanelVersion} visible={settingsTab === 'instagram'} onStateChange={reportInstagramDraft} onReset={handleReset} />}</div>
      <div hidden={!dataReady || dataError || settingsTab === 'instagram'} className='settings-columns'>
        <div className={'settings-left-column settings-tabbed-content'} data-settings-tab={settingsTab} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

        <div role="tabpanel" id="platform-panel-tiktok" aria-labelledby="platform-tab-tiktok" hidden={settingsTab !== 'tiktok'}><TikTokSettingsPanel isAdmin={isAdminUser} saved={legacyBaseline} busy={savingLegacy || saving || !!savingLimitUser || !!savingJobLimitUser || savingOwnJobLimit || savingMachineApiKeys} model={{minAgeDays,minVideos,khangDailyLimit,jobAccountDailyLimit,userKhangLimits,userJobAccountDailyLimits,machineApiKeys,newMachineApiKey,savingLimitUser,savingJobLimitUser,savingMachineApiKeys}} setters={{minAgeDays:setMinAgeDays,minVideos:setMinVideos,userKhangLimits:setUserKhangLimits,userJobAccountDailyLimits:setUserJobAccountDailyLimits,jobAccountDailyLimit:setJobAccountDailyLimit,newMachineApiKey:setNewMachineApiKey}} actions={{saveChromeLimit:handleSaveUserLimit,saveJobLimit:handleSaveJobUserLimit,addKey:handleAddMachineApiKey,removeKey:handleRemoveMachineApiKey}} /></div>
        <div role="tabpanel" id="platform-panel-facebook" aria-labelledby="platform-tab-facebook" hidden={settingsTab !== 'facebook'}>{facebookVisited && <FacebookSettingsPanel isAdmin={isAdminUser} saved={legacyBaseline} busy={savingLegacy || !!savingFacebookLimitUser || !!savingFacebookWorkflow || facebookDraftState.saving} nurtureRef={facebookNurtureRef} onNurtureState={reportFacebookDraft} activeScenario={facebookDraftState.activeName} model={{facebookLoginLimit,userFacebookLoginLimits,savingFacebookLimitUser,facebookRegPageWaitHours,facebookRegPageResetHours,facebookNurtureResetHours,facebookPageJobResetHours}} setters={{userFacebookLoginLimits:setUserFacebookLoginLimits,facebookRegPageWaitHours:setFacebookRegPageWaitHours,facebookRegPageResetHours:setFacebookRegPageResetHours,facebookNurtureResetHours:setFacebookNurtureResetHours,facebookPageJobResetHours:setFacebookPageJobResetHours}} actions={{saveLimit:handleSaveFacebookUserLimit}} />}</div>

        <div role="tabpanel" id="platform-panel-common" aria-labelledby="platform-tab-common" hidden={settingsTab !== 'common'}><CommonSettingsPanel registryRef={registryRef} onRegistryState={reportRegistry} visible={settingsTab==='common'} busy={savingLegacy || saving || savingTaskDispatcher} model={{proxies,concurrency,delayMs,batchSize,taskDispatcher}} setters={{proxies:setProxies,concurrency:setConcurrency,delayMs:setDelayMs,batchSize:setBatchSize,taskDispatcher:setTaskDispatcher}} /></div>
        <div className="settings-footer-note"><span>Các thay đổi được lưu riêng theo nền tảng.</span><button className="settings-button ghost small" disabled={savingLegacy || saving} onClick={() => { if (confirm('Reset cấu hình chung, điều kiện TikTok, workflow Facebook, cookie và Reg Instagram về mặc định?')) handleReset().catch(() => {}); }}>Reset cài đặt mặc định</button></div>
        </div>


      </div>
      {settingsTab !== 'instagram' && <SettingsSaveBar dirty={activeDirty || (settingsTab==='common' && registryState.dirty) || (settingsTab === 'facebook' && facebookDraftState.dirty)} saving={savingLegacy || saving || savingTaskDispatcher || facebookDraftState.saving || registryState.saving} onDiscard={discardLegacy} onSave={saveLegacyChanges} />}
    </div>
  );
}

export default function SettingsPage() { return <SettingsDataProvider><ProxySettings /></SettingsDataProvider>; }
