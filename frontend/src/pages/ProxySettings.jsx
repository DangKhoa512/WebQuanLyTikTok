import { useEffect, useState } from 'react';
import { loadCheckLiveSettings, saveCheckLiveSettings } from '../services/checkLiveSettings';
import { settingsApi } from '../services/api';
import { toast } from '../components/Toast';
import { authService } from '../services/authService';
import FacebookNurtureSettings from '../components/FacebookNurtureSettings';
import InstagramNurtureSettings from '../components/InstagramNurtureSettings';
import TaskDispatcherSettings from '../components/TaskDispatcherSettings';

const SETTINGS_TABS = [
  { key: 'tiktok', label: 'TikTok', color: '#111827' },
  { key: 'facebook', label: 'Facebook', color: '#1877f2' },
  { key: 'instagram', label: 'Instagram', color: '#ec4899' },
  { key: 'common', label: 'Cài đặt chung', color: '#10b981' },
];
const TASK_DISPATCHER_TYPES = [
  'PAGE_JOB',
  'INSTAGRAM_JOB',
  'REG_PAGE',
  'REG_INSTAGRAM',
  'NUOI_FACEBOOK',
  'NUOI_INSTAGRAM',
];
const DEFAULT_TASK_DISPATCHER = {
  lock_timeout_minutes: 30,
  max_retry: 3,
  tasks: {
    PAGE_JOB: { priority: 100, enabled: true },
    INSTAGRAM_JOB: { priority: 90, enabled: true },
    REG_PAGE: { priority: 80, enabled: true },
    REG_INSTAGRAM: { priority: 70, enabled: true },
    NUOI_FACEBOOK: { priority: 60, enabled: true },
    NUOI_INSTAGRAM: { priority: 50, enabled: true },
  },
};
function MachineLoginLimitCard({ isAdmin, title, description, currentLimit, users, setUsers, savingUser, onSaveUser }) {
  if (!isAdmin) return <div className="card"><h3 style={{marginTop:0,marginBottom:'.75rem',fontSize:'1rem',color:'#e2e8f0'}}>{title}</h3><div style={{color:'#94a3b8',fontSize:'.85rem'}}>Limit hiện tại: <b style={{color:'#e2e8f0'}}>{currentLimit}</b> account/máy</div></div>;
  return <div className="card"><h3 style={{marginTop:0,marginBottom:'.75rem',fontSize:'1rem',color:'#e2e8f0'}}>{title} theo user</h3><div style={{color:'#64748b',fontSize:'.78rem',marginBottom:'.85rem'}}>{description}</div><div style={{overflowX:'auto'}}><table className="table" style={{margin:0}}><thead><tr><th>User</th><th>Role</th><th>Trạng thái</th><th>Limit account/máy</th><th></th></tr></thead><tbody>{users.length===0?<tr><td colSpan={5} style={{textAlign:'center',color:'#94a3b8',padding:'1rem'}}>Chưa tải được danh sách user</td></tr>:users.map((user)=><tr key={user.username}><td style={{fontWeight:700}}>{user.username}</td><td>{user.role}</td><td style={{color:user.is_active?'#10b981':'#ef4444',fontWeight:700}}>{user.is_active?'Đang bật':'Đã tắt'}</td><td><input type="number" min={1} value={user.limit} onChange={(e)=>setUsers((prev)=>prev.map((item)=>item.username===user.username?{...item,limit:e.target.value}:item))} style={{width:120,boxSizing:'border-box',background:'#1e293b',color:'#e2e8f0',border:'1px solid #334155',borderRadius:8,padding:'.45rem .6rem',fontWeight:700}}/></td><td><button onClick={()=>onSaveUser(user.username)} disabled={savingUser===user.username} style={{background:savingUser===user.username?'#334155':'#ec4899',border:'none',color:'#fff',borderRadius:7,padding:'.45rem .85rem',cursor:savingUser===user.username?'not-allowed':'pointer',fontWeight:700,whiteSpace:'nowrap'}}>{savingUser===user.username?'Đang lưu...':'Lưu'}</button></td></tr>)}</tbody></table></div></div>;
}

export default function ProxySettings() {
  const init = loadCheckLiveSettings();
  const [proxies,     setProxies]     = useState(init.proxies);
  const [concurrency, setConcurrency] = useState(init.concurrency);
  const [instagramCheckCookies, setInstagramCheckCookies] = useState('');
  const [instagramCookieCheckResults, setInstagramCookieCheckResults] = useState([]);
  const [checkingInstagramCookies, setCheckingInstagramCookies] = useState(false);
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
  const [instagramLoginLimit, setInstagramLoginLimit] = useState(10);
  const [userInstagramLoginLimits, setUserInstagramLoginLimits] = useState([]);
  const [savingInstagramLimitUser, setSavingInstagramLimitUser] = useState('');
  const [jobAccountDailyLimit, setJobAccountDailyLimit] = useState(20);
  const [facebookRegPageWaitHours, setFacebookRegPageWaitHours] = useState(8);
  const [facebookRegPageResetHours, setFacebookRegPageResetHours] = useState(24);
  const [facebookNurtureResetHours, setFacebookNurtureResetHours] = useState(24);
  const [facebookPageJobResetHours, setFacebookPageJobResetHours] = useState(24);
  const [savingFacebookWorkflow, setSavingFacebookWorkflow] = useState('');
  const [savingOwnFacebookLimit, setSavingOwnFacebookLimit] = useState(false);
  const [instagramFacebookReuseHours, setInstagramFacebookReuseHours] = useState(24);
  const [instagramPerFacebookLimit, setInstagramPerFacebookLimit] = useState(1);
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
  const isAdminUser = authService.getRole() === 'admin';

  const proxyList = proxies.split('\n').map((l) => l.trim()).filter(Boolean);
  const instagramCookieList = instagramCheckCookies.split('\n').map((line) => line.trim()).filter(Boolean);
  const facebookWorkflowRows = [
    {
      key: 'reg_page_reset_hours',
      label: 'Thời gian Reset REG PAGE',
      description: 'Account đã báo cáo Reg Page được mở lại để reg sau thời gian này.',
      value: facebookRegPageResetHours,
      setter: setFacebookRegPageResetHours,
    },
    {
      key: 'reg_page_wait_hours',
      label: 'Thời gian chờ được Reg Page sau login',
      description: 'Account mới login thành công phải chờ đủ thời gian này mới được lấy để Reg Page.',
      value: facebookRegPageWaitHours,
      setter: setFacebookRegPageWaitHours,
    },
    {
      key: 'nurture_reset_hours',
      label: 'Thời gian reset Nuôi',
      description: 'Tự động chuyển trạng thái Đã nuôi về Chưa nuôi sau thời gian này.',
      value: facebookNurtureResetHours,
      setter: setFacebookNurtureResetHours,
    },
    {
      key: 'page_job_reset_hours',
      label: 'Thời gian reset Page làm JOB',
      description: 'Tự động chuyển account Đã làm xong về Login thành công và Page về Chưa làm.',
      value: facebookPageJobResetHours,
      setter: setFacebookPageJobResetHours,
    },
  ];

  useEffect(() => {
    let mounted = true;
    settingsApi.getEligibility()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setMinVideos(settings.min_videos || 20);
        setMinAgeDays(settings.min_age_days || 4);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cài đặt đủ điều kiện'));
    settingsApi.getFacebookCheckProxies()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        const savedProxies = settings.proxies || [];
        if (savedProxies.length || !init.proxies.trim()) setProxies(savedProxies.join('\n'));
        if (settings.concurrency) setConcurrency(settings.concurrency);
      })
      .catch((err) => toast.error(err.message || 'Không tải được proxy check Facebook'));
    settingsApi.getInstagramCheckCookies()
      .then((res) => {
        if (!mounted) return;
        setInstagramCheckCookies((res.data?.settings?.cookies || []).join('\n'));
      })
      .catch((err) => toast.error(err.message || 'Không tải được cookie check Instagram'));
    settingsApi.getFacebookWorkflow()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        if (Number.isInteger(settings.reg_page_reset_hours)) setFacebookRegPageResetHours(settings.reg_page_reset_hours);
        if (Number.isInteger(settings.reg_page_wait_hours)) setFacebookRegPageWaitHours(settings.reg_page_wait_hours);
        if (Number.isInteger(settings.nurture_reset_hours)) setFacebookNurtureResetHours(settings.nurture_reset_hours);
        if (Number.isInteger(settings.page_job_reset_hours)) setFacebookPageJobResetHours(settings.page_job_reset_hours);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cấu hình luồng Facebook'));
    settingsApi.getInstagramFacebookReg()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        if (Number.isInteger(settings.reuse_hours)) setInstagramFacebookReuseHours(settings.reuse_hours);
        if (Number.isInteger(settings.max_instagram_per_facebook)) setInstagramPerFacebookLimit(settings.max_instagram_per_facebook);
      })
      .catch((err) => toast.error(err.message || 'Không tải được cấu hình Reg IG bằng Facebook'));
    settingsApi.getChromeKhangLimit()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setKhangDailyLimit(settings.limit || 8);
      })
      .catch((err) => toast.error(err.message || 'Không tải được limit Chrome kháng'));
    settingsApi.getFacebookLoginLimit()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setFacebookLoginLimit(settings.limit || 10);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc limit Facebook login'));
    settingsApi.getInstagramLoginLimit()
      .then((res) => {
        if (!mounted) return;
        setInstagramLoginLimit(res.data?.settings?.limit || 10);
      })
      .catch((err) => toast.error(err.message || 'Không tải được limit Instagram'));
    settingsApi.getJobAccountDailyLimit()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings || {};
        setJobAccountDailyLimit(settings.limit || 20);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc limit JOB'));
    settingsApi.getTaskDispatcher()
      .then((res) => {
        if (!mounted) return;
        const settings = res.data?.settings;
        if (settings) setTaskDispatcher(settings);
      })
      .catch((err) => toast.error(err.message || 'Khong tai duoc cau hinh Task Dispatcher'));
    if (isAdminUser) {
      settingsApi.getChromeKhangLimits()
        .then((res) => {
          if (!mounted) return;
          setUserKhangLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Không tải được limit user'));
      settingsApi.getFacebookLoginLimits()
        .then((res) => {
          if (!mounted) return;
          setUserFacebookLoginLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Khong tai duoc limit Facebook login user'));
      settingsApi.getInstagramLoginLimits()
        .then((res) => {
          if (!mounted) return;
          setUserInstagramLoginLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Không tải được limit Instagram theo user'));
      settingsApi.getJobAccountDailyLimits()
        .then((res) => {
          if (!mounted) return;
          setUserJobAccountDailyLimits(res.data?.users || []);
        })
        .catch((err) => toast.error(err.message || 'Khong tai duoc limit JOB user'));
    }
    return () => { mounted = false; };
  }, [isAdminUser]);

  const handleSave = () => {
    setSaving(true);
    Promise.resolve()
      .then(() => {
        saveCheckLiveSettings({
          proxies,
          concurrency: parseInt(concurrency, 10),
          delayMs: parseInt(delayMs, 10),
          batchSize: parseInt(batchSize, 10),
        });
        return Promise.all([
          settingsApi.updateEligibility(parseInt(minAgeDays, 10), parseInt(minVideos, 10)),
          settingsApi.updateFacebookCheckProxies(proxies, parseInt(concurrency, 10)),
          settingsApi.updateInstagramCheckCookies(instagramCheckCookies),
          settingsApi.updateFacebookWorkflow({
            reg_page_reset_hours: parseInt(facebookRegPageResetHours, 10),
            reg_page_wait_hours: parseInt(facebookRegPageWaitHours, 10),
            nurture_reset_hours: parseInt(facebookNurtureResetHours, 10),
            page_job_reset_hours: parseInt(facebookPageJobResetHours, 10),
          }),
          settingsApi.updateInstagramFacebookReg(parseInt(instagramFacebookReuseHours, 10), parseInt(instagramPerFacebookLimit, 10)),
        ]);
      })
      .then(() => toast.success('Đã lưu cài đặt'))
      .catch((err) => toast.error(err.message || 'Lưu cài đặt thất bại'))
      .finally(() => setSaving(false));
  };

  const handleCheckInstagramCookies = async () => {
    const cookies = [...new Set(instagramCookieList)];
    if (!cookies.length) {
      toast.error('Chua co cookie Instagram de kiem tra');
      return;
    }
    setCheckingInstagramCookies(true);
    setInstagramCheckCookies(cookies.join(String.fromCharCode(10)));
    try {
      const res = await settingsApi.checkInstagramCheckCookies(cookies);
      const data = res.data || {};
      setInstagramCookieCheckResults(data.results || []);
      toast.success('Cookie IG: ' + (data.live || 0) + ' live - ' + (data.die || 0) + ' die - ' + (data.unknown || 0) + ' unknown');
    } catch (err) {
      toast.error(err.message || 'Khong kiem tra duoc cookie Instagram');
    } finally {
      setCheckingInstagramCookies(false);
    }
  };

  const removeInstagramCookie = (index) => {
    setInstagramCheckCookies(instagramCookieList.filter((_, cookieIndex) => cookieIndex !== index).join(String.fromCharCode(10)));
    setInstagramCookieCheckResults([]);
  };

  const removeDeadInstagramCookies = () => {
    const deadIndexes = new Set(instagramCookieCheckResults.filter((item) => item.status === 'die').map((item) => item.index));
    if (!deadIndexes.size) return;
    setInstagramCheckCookies(instagramCookieList.filter((_, index) => !deadIndexes.has(index)).join(String.fromCharCode(10)));
    setInstagramCookieCheckResults([]);
    toast.success('Da loai ' + deadIndexes.size + ' cookie die; hay them cookie moi va bam Luu cai dat');
  };
  const handleReset = () => {
    setProxies('');
    setConcurrency(20);
    setInstagramCheckCookies('');
    setDelayMs(200);
    setBatchSize(60);
    setMinVideos(20);
    setMinAgeDays(4);
    setKhangDailyLimit(8);
    setFacebookLoginLimit(10);
    setInstagramLoginLimit(10);
    setJobAccountDailyLimit(20);
    setFacebookRegPageWaitHours(8);
    setFacebookRegPageResetHours(24);
    setFacebookNurtureResetHours(24);
    setFacebookPageJobResetHours(24);
    setInstagramFacebookReuseHours(24);
    setInstagramPerFacebookLimit(1);
    saveCheckLiveSettings({ proxies: '', concurrency: 20, delayMs: 200, batchSize: 60 });
    Promise.all([
      settingsApi.updateEligibility(4, 20),
      settingsApi.updateFacebookCheckProxies('', 20),
      settingsApi.updateInstagramCheckCookies(''),
      settingsApi.updateFacebookWorkflow({ reg_page_reset_hours: 24, reg_page_wait_hours: 8, nurture_reset_hours: 24, page_job_reset_hours: 24 }),
      settingsApi.updateInstagramFacebookReg(24, 1),
    ])
      .then(() => toast.success('Đã reset cài đặt'))
      .catch((err) => toast.error(err.message || 'Reset cài đặt thất bại'));
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
      const res = await settingsApi.updateChromeKhangLimit(limit, username);
      const saved = res.data?.settings || {};
      setUserKhangLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setKhangDailyLimit(saved.limit || limit);
      }
      toast.success(`Đã lưu limit cho ${username}`);
    } catch (err) {
      toast.error(err.message || 'Lưu limit thất bại');
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
      const res = await settingsApi.updateFacebookLoginLimit(limit, username);
      const saved = res.data?.settings || {};
      setUserFacebookLoginLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setFacebookLoginLimit(saved.limit || limit);
      }
      toast.success(`Da luu limit Facebook cho ${username}`);
    } catch (err) {
      toast.error(err.message || 'Luu limit Facebook that bai');
    } finally {
      setSavingFacebookLimitUser('');
    }
  };

  const handleSaveOwnFacebookLimit = async () => {
    const limit = parseInt(facebookLoginLimit, 10);
    if (!Number.isInteger(limit) || limit <= 0) return toast.error('Limit Login phải lớn hơn 0');
    setSavingOwnFacebookLimit(true);
    try {
      const res = await settingsApi.updateFacebookLoginLimit(limit, authService.getUsername());
      setFacebookLoginLimit(res.data?.settings?.limit || limit);
      toast.success('Đã lưu Limit Login Facebook');
    } catch (err) {
      toast.error(err.message || 'Lưu Limit Login Facebook thất bại');
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
      const res = await settingsApi.updateFacebookWorkflow(payload);
      const saved = res.data?.settings || payload;
      setFacebookRegPageResetHours(saved.reg_page_reset_hours);
      setFacebookRegPageWaitHours(saved.reg_page_wait_hours);
      setFacebookNurtureResetHours(saved.nurture_reset_hours);
      setFacebookPageJobResetHours(saved.page_job_reset_hours);
      toast.success('Đã lưu cấu hình Facebook');
    } catch (err) {
      toast.error(err.message || 'Lưu cấu hình Facebook thất bại');
    } finally {
      setSavingFacebookWorkflow('');
    }
  };

  const handleSaveInstagramUserLimit = async (username) => {
    const row = userInstagramLoginLimits.find((item) => item.username === username);
    const limit = parseInt(row?.limit, 10);
    if (!row || !Number.isInteger(limit) || limit <= 0) return toast.error('Limit Instagram phải lớn hơn 0');
    setSavingInstagramLimitUser(username);
    try {
      const res = await settingsApi.updateInstagramLoginLimit(limit, username);
      const saved = res.data?.settings || {};
      setUserInstagramLoginLimits((prev) => prev.map((item) => item.username === username ? { ...item, limit: saved.limit || limit } : item));
      if (username === authService.getUsername().toLowerCase()) setInstagramLoginLimit(saved.limit || limit);
      toast.success('Đã lưu limit Instagram cho ' + username);
    } catch (err) { toast.error(err.message || 'Lưu limit Instagram thất bại'); }
    finally { setSavingInstagramLimitUser(''); }
  };
  const handleSaveOwnJobLimit = async () => {
    const limit = parseInt(jobAccountDailyLimit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      toast.error('Limit JOB phai lon hon 0');
      return;
    }
    setSavingOwnJobLimit(true);
    try {
      const res = await settingsApi.updateJobAccountDailyLimit(limit);
      const saved = res.data?.settings || {};
      setJobAccountDailyLimit(saved.limit || limit);
      toast.success('Da luu limit JOB');
    } catch (err) {
      toast.error(err.message || 'Luu limit JOB that bai');
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
      const res = await settingsApi.updateJobAccountDailyLimit(limit, username);
      const saved = res.data?.settings || {};
      setUserJobAccountDailyLimits((prev) => prev.map((item) =>
        item.username === username ? { ...item, limit: saved.limit || limit } : item
      ));
      if (username === authService.getUsername().toLowerCase()) {
        setJobAccountDailyLimit(saved.limit || limit);
      }
      toast.success('Da luu limit JOB cho ' + username);
    } catch (err) {
      toast.error(err.message || 'Luu limit JOB that bai');
    } finally {
      setSavingJobLimitUser('');
    }
  };

  const normalizeMachineApiKey = (value) => String(value || '').trim().toUpperCase();

  const handleSaveTaskDispatcher = async () => {
    setSavingTaskDispatcher(true);
    try {
      const res = await settingsApi.updateTaskDispatcher(taskDispatcher);
      setTaskDispatcher(res.data?.settings || taskDispatcher);
      toast.success('Da luu cau hinh Task Dispatcher');
    } catch (err) {
      toast.error(err.message || 'Luu Task Dispatcher that bai');
    } finally {
      setSavingTaskDispatcher(false);
    }
  };

  const saveMachineApiKeys = async (keys) => {
    setSavingMachineApiKeys(true);
    try {
      const res = await settingsApi.updateMachineApiKeys(keys);
      setMachineApiKeys(res.data?.keys || keys);
      toast.success('Da luu danh sach key API may');
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
    setNewMachineApiKey('');
    saveMachineApiKeys([...machineApiKeys, key]);
  };

  const handleRemoveMachineApiKey = (key) => {
    if (!confirm('Xoa key API ' + key + '?')) return;
    saveMachineApiKeys(machineApiKeys.filter((item) => item !== key));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>⚙️ Cài đặt</h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Cấu hình được chia theo từng nền tảng để dễ theo dõi và chỉnh sửa.
          </p>
        </div>
      </div>

      <div className={'settings-platform-tabs'} role={'tablist'} aria-label={'Nhóm cài đặt'}>
        {SETTINGS_TABS.map((tab) => {
          const active = settingsTab === tab.key;
          return <button
            key={tab.key}
            type={'button'}
            role={'tab'}
            aria-selected={active}
            className={'settings-platform-tab' + (active ? ' active' : '')}
            onClick={() => setSettingsTab(tab.key)}
            style={active ? { background: tab.color, borderColor: tab.color, color: '#fff' } : undefined}
          >{tab.label}</button>;
        })}
      </div>

      <div className={'settings-columns' + (['facebook', 'instagram'].includes(settingsTab) ? ' settings-columns-with-aside' : '')}>
        <div className={'settings-left-column settings-tabbed-content'} data-settings-tab={settingsTab} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

        <div className="card settings-section settings-section-tiktok">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            🎯 Setup đủ điều kiện
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.85rem', display: 'block', marginBottom: '.4rem' }}>
                Video tối thiểu
              </label>
              <input
                type="number"
                min={1}
                value={minVideos}
                onChange={(e) => setMinVideos(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.85rem', display: 'block', marginBottom: '.4rem' }}>
                Tuổi acc tối thiểu
              </label>
              <input
                type="number"
                min={1}
                value={minAgeDays}
                onChange={(e) => setMinAgeDays(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: '.65rem', color: '#64748b', fontSize: '.76rem' }}>
            Áp dụng cho App Acc và Chrome Acc khi chuyển sang Đủ điều kiện.
          </div>
        </div>


        {isAdminUser && (
          <div className="card settings-section settings-section-tiktok">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              {'\uD83D\uDD0C Key cau hinh API may'}
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Chi admin duoc them/xoa cac bang cau hinh API may. Trang API May se dung danh sach key nay.
            </div>
            <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.85rem' }}>
              <input
                value={newMachineApiKey}
                onChange={(e) => setNewMachineApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMachineApiKey()}
                placeholder="API_NAME"
                style={{
                  flex: 1, boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.6rem .75rem', fontWeight: 700,
                }}
              />
              <button
                onClick={handleAddMachineApiKey}
                disabled={savingMachineApiKeys}
                style={{
                  background: savingMachineApiKeys ? '#334155' : '#10b981',
                  border: 'none', color: '#fff', borderRadius: '8px',
                  padding: '.6rem 1rem', cursor: savingMachineApiKeys ? 'not-allowed' : 'pointer',
                  fontWeight: 800, whiteSpace: 'nowrap',
                }}
              >
                Them key
              </button>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
              {machineApiKeys.length === 0 ? (
                <div style={{ padding: '1rem', color: '#94a3b8', textAlign: 'center' }}>Chua co key API nao</div>
              ) : machineApiKeys.map((key, index) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 48px', alignItems: 'center', borderTop: index ? '1px solid #334155' : 'none' }}>
                  <div style={{ padding: '.75rem 1rem', fontWeight: 900, color: '#e2e8f0', background: '#0f172a' }}>{key}</div>
                  <button
                    onClick={() => handleRemoveMachineApiKey(key)}
                    disabled={savingMachineApiKeys}
                    title="Xoa key API"
                    style={{ height: '100%', minHeight: 44, border: 'none', borderLeft: '1px solid #334155', background: '#1e293b', color: '#fca5a5', cursor: savingMachineApiKeys ? 'not-allowed' : 'pointer', fontWeight: 900 }}
                  >
                    {'\uD83D\uDDD1'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdminUser ? (
          <div className="card settings-section settings-section-tiktok">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              ⚡ Limit Chrome kháng theo user
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Admin có thể chỉnh giới hạn số acc mỗi máy được làm trong ngày cho từng user.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Trạng thái</th>
                    <th>Limit acc/máy/ngày</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userKhangLimits.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                        Chưa tải được danh sách user
                      </td>
                    </tr>
                  )}
                  {userKhangLimits.map((user) => (
                    <tr key={user.username}>
                      <td style={{ fontWeight: 700 }}>{user.username}</td>
                      <td>{user.role}</td>
                      <td style={{ color: user.is_active ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {user.is_active ? 'Đang bật' : 'Đã tắt'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={user.limit}
                          onChange={(e) => setUserKhangLimits((prev) => prev.map((item) =>
                            item.username === user.username ? { ...item, limit: e.target.value } : item
                          ))}
                          style={{
                            width: 120, boxSizing: 'border-box',
                            background: '#1e293b', color: '#e2e8f0',
                            border: '1px solid #334155', borderRadius: '8px',
                            padding: '.45rem .6rem', fontWeight: 700,
                          }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleSaveUserLimit(user.username)}
                          disabled={savingLimitUser === user.username}
                          style={{
                            background: savingLimitUser === user.username ? '#334155' : '#2563eb',
                            border: 'none', color: '#fff', borderRadius: '7px',
                            padding: '.45rem .85rem', cursor: savingLimitUser === user.username ? 'not-allowed' : 'pointer',
                            fontWeight: 700, whiteSpace: 'nowrap',
                          }}
                        >
                          {savingLimitUser === user.username ? 'Đang lưu...' : 'Lưu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card settings-section settings-section-tiktok">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              ⚡ Limit Chrome kháng
            </h3>
            <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>
              Limit hiện tại của bạn: <b style={{ color: '#e2e8f0' }}>{khangDailyLimit}</b> acc/máy/ngày
            </div>
          </div>
        )}

        {isAdminUser ? (
          <div className="card settings-section settings-section-obsolete">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              📘 Limit Facebook login theo user
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Neu may dang giu du so account login thanh cong thi API lay account Facebook Job se tra Full limit. Chuyen nhom, xoa, hoac check live die se mo slot.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Trang thai</th>
                    <th>Limit login/may</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userFacebookLoginLimits.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                        Chua tai duoc danh sach user
                      </td>
                    </tr>
                  )}
                  {userFacebookLoginLimits.map((user) => (
                    <tr key={user.username}>
                      <td style={{ fontWeight: 700 }}>{user.username}</td>
                      <td>{user.role}</td>
                      <td style={{ color: user.is_active ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {user.is_active ? 'Dang bat' : 'Da tat'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={user.limit}
                          onChange={(e) => setUserFacebookLoginLimits((prev) => prev.map((item) =>
                            item.username === user.username ? { ...item, limit: e.target.value } : item
                          ))}
                          style={{
                            width: 120, boxSizing: 'border-box',
                            background: '#1e293b', color: '#e2e8f0',
                            border: '1px solid #334155', borderRadius: '8px',
                            padding: '.45rem .6rem', fontWeight: 700,
                          }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleSaveFacebookUserLimit(user.username)}
                          disabled={savingFacebookLimitUser === user.username}
                          style={{
                            background: savingFacebookLimitUser === user.username ? '#334155' : '#06b6d4',
                            border: 'none', color: '#fff', borderRadius: '7px',
                            padding: '.45rem .85rem', cursor: savingFacebookLimitUser === user.username ? 'not-allowed' : 'pointer',
                            fontWeight: 700, whiteSpace: 'nowrap',
                          }}
                        >
                          {savingFacebookLimitUser === user.username ? 'Dang luu...' : 'Luu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card settings-section settings-section-obsolete">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              📘 Limit Facebook login
            </h3>
            <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>
              Limit hien tai cua ban: <b style={{ color: '#e2e8f0' }}>{facebookLoginLimit}</b> acc/may
            </div>
          </div>
        )}

        <div className="card settings-section settings-section-facebook facebook-workflow-settings">
          <h3 style={{ marginTop: 0, marginBottom: '.35rem', fontSize: '1rem', color: '#0f172a' }}>
            ⚙ Luồng Facebook
          </h3>
          <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.75rem' }}>
            Cấu hình được áp dụng riêng cho tài khoản <b>{authService.getUsername()}</b>. Đơn vị thời gian là giờ.
          </div>

          <div className="facebook-workflow-row">
            <div className="facebook-workflow-row-info">
              <strong>Limit Login</strong>
              <span>Số account Login thành công + Đang làm + Đã xong tối đa trên mỗi máy.</span>
            </div>
            <div className="facebook-workflow-row-control">
              <input type="number" min={1} value={facebookLoginLimit} disabled={!isAdminUser} onChange={(event) => setFacebookLoginLimit(event.target.value)} />
              <span>account</span>
              {isAdminUser
                ? <button type="button" disabled={savingOwnFacebookLimit} onClick={handleSaveOwnFacebookLimit}>{savingOwnFacebookLimit ? 'Đang lưu...' : 'Lưu'}</button>
                : <span className="facebook-workflow-readonly">Chỉ admin được sửa</span>}
            </div>
          </div>

          {facebookWorkflowRows.map((row) => <div className="facebook-workflow-row" key={row.key}>
            <div className="facebook-workflow-row-info">
              <strong>{row.label}</strong>
              <span>{row.description}</span>
            </div>
            <div className="facebook-workflow-row-control">
              <input type="number" min={0} max={720} value={row.value} onChange={(event) => row.setter(event.target.value)} />
              <span>giờ</span>
              <button type="button" disabled={savingFacebookWorkflow === row.key} onClick={() => handleSaveFacebookWorkflow(row.key)}>
                {savingFacebookWorkflow === row.key ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>)}
        </div>

        <div className={'settings-section settings-section-instagram'}><MachineLoginLimitCard
          isAdmin={isAdminUser}
          title="📸 Limit Instagram login"
          description="Khi máy đang giữ đủ account Instagram, API lấy account mới sẽ trả Full limit. Account die hoặc chuyển khỏi máy sẽ mở slot."
          currentLimit={instagramLoginLimit}
          users={userInstagramLoginLimits}
          setUsers={setUserInstagramLoginLimits}
          savingUser={savingInstagramLimitUser}
          onSaveUser={handleSaveInstagramUserLimit}
        /></div>

        {isAdminUser ? (
          <div className="card settings-section settings-section-tiktok">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              JOB limit account/ngay theo user
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Moi may moi ngay chi duoc lay account JOB theo limit da set. Goi lai account dang giu se khong tinh them.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Trang thai</th>
                    <th>Limit acc/may/ngay</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userJobAccountDailyLimits.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                        Chua tai duoc danh sach user
                      </td>
                    </tr>
                  )}
                  {userJobAccountDailyLimits.map((user) => (
                    <tr key={user.username}>
                      <td style={{ fontWeight: 700 }}>{user.username}</td>
                      <td>{user.role}</td>
                      <td style={{ color: user.is_active ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {user.is_active ? 'Dang bat' : 'Da tat'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={user.limit}
                          onChange={(e) => setUserJobAccountDailyLimits((prev) => prev.map((item) =>
                            item.username === user.username ? { ...item, limit: e.target.value } : item
                          ))}
                          style={{
                            width: 120, boxSizing: 'border-box',
                            background: '#1e293b', color: '#e2e8f0',
                            border: '1px solid #334155', borderRadius: '8px',
                            padding: '.45rem .6rem', fontWeight: 700,
                          }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleSaveJobUserLimit(user.username)}
                          disabled={savingJobLimitUser === user.username}
                          style={{
                            background: savingJobLimitUser === user.username ? '#334155' : '#10b981',
                            border: 'none', color: '#fff', borderRadius: '7px',
                            padding: '.45rem .85rem', cursor: savingJobLimitUser === user.username ? 'not-allowed' : 'pointer',
                            fontWeight: 700, whiteSpace: 'nowrap',
                          }}
                        >
                          {savingJobLimitUser === user.username ? 'Dang luu...' : 'Luu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card settings-section settings-section-tiktok">
            <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
              JOB limit account/ngay
            </h3>
            <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
              Moi may moi ngay chi duoc lay account JOB theo limit nay.
            </div>
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={1}
                value={jobAccountDailyLimit}
                onChange={(e) => setJobAccountDailyLimit(e.target.value)}
                style={{
                  width: 140, boxSizing: 'border-box',
                  background: '#1e293b', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px',
                  padding: '.55rem .75rem', fontWeight: 700,
                }}
              />
              <button
                onClick={handleSaveOwnJobLimit}
                disabled={savingOwnJobLimit}
                style={{
                  background: savingOwnJobLimit ? '#334155' : '#10b981',
                  border: 'none', color: '#fff', borderRadius: '8px',
                  padding: '.55rem 1rem', cursor: savingOwnJobLimit ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {savingOwnJobLimit ? 'Dang luu...' : 'Luu limit'}
              </button>
            </div>
          </div>
        )}

        <div className="card settings-section settings-section-obsolete">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            Facebook Reg Page - thời gian chờ sau login
          </h3>
          <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
            Account chỉ được máy lấy để reg Page sau khi login thành công đủ số giờ này. Nhập 0 để lấy ngay.
          </div>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number"
              min={0}
              max={720}
              value={facebookRegPageWaitHours}
              onChange={(e) => setFacebookRegPageWaitHours(e.target.value)}
              style={{
                width: 140, boxSizing: 'border-box',
                background: '#1e293b', color: '#e2e8f0',
                border: '1px solid #334155', borderRadius: '8px',
                padding: '.55rem .75rem', fontWeight: 700,
              }}
            />
            <span style={{ color: '#94a3b8', fontSize: '.85rem' }}>giờ</span>
          </div>
        </div>

        <div className="card settings-section settings-section-instagram">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            Instagram Reg bằng Facebook
          </h3>
          <div style={{ color: '#64748b', fontSize: '.78rem', marginBottom: '.85rem' }}>
            Sau khi Reg IG thành công, Facebook account chỉ được lấy lại khi đủ thời gian chờ và chưa đạt limit trong chu kỳ. Có thể mở lại ngay bằng nút Reset tại trang Instagram Reg.
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: '.4rem', color: '#94a3b8', fontSize: '.78rem', fontWeight: 700 }}>
              Mở lại sau
              <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <input type="number" min={0} max={720} value={instagramFacebookReuseHours} onChange={(e) => setInstagramFacebookReuseHours(e.target.value)} style={{ width: 120, boxSizing: 'border-box', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '.55rem .75rem', fontWeight: 700 }} />
                <span>giờ</span>
              </span>
            </label>
            <label style={{ display: 'grid', gap: '.4rem', color: '#94a3b8', fontSize: '.78rem', fontWeight: 700 }}>
              Limit IG / 1 Facebook
              <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <input type="number" min={1} max={100} value={instagramPerFacebookLimit} onChange={(e) => setInstagramPerFacebookLimit(e.target.value)} style={{ width: 120, boxSizing: 'border-box', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '.55rem .75rem', fontWeight: 700 }} />
                <span>account IG</span>
              </span>
            </label>
          </div>
        </div>
        <TaskDispatcherSettings
          settings={taskDispatcher}
          setSettings={setTaskDispatcher}
          saving={savingTaskDispatcher}
          onSave={handleSaveTaskDispatcher}
        />

        {/* Proxy pool */}
        <div className="card settings-section settings-section-common">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            🌐 Danh sách Proxy
            <span style={{
              marginLeft: '.75rem', background: proxyList.length > 0 ? '#064e3b' : '#1e293b',
              color: proxyList.length > 0 ? '#6ee7b7' : '#94a3b8',
              borderRadius: '12px', padding: '.15rem .6rem', fontSize: '.78rem', fontWeight: 700,
            }}>
              {proxyList.length} proxy
            </span>
          </h3>
          <textarea
            value={proxies}
            onChange={(e) => setProxies(e.target.value)}
            placeholder={'ip:port\nip:port:user:pass\nuser:pass@ip:port\n...'}
            rows={10}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1e293b', color: '#e2e8f0',
              border: '1px solid #334155', borderRadius: '8px',
              padding: '.6rem .85rem', fontFamily: 'monospace',
              fontSize: '.8rem', lineHeight: 1.6, resize: 'vertical', outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e)  => (e.target.style.borderColor = '#334155')}
          />
          <div style={{ fontSize: '.72rem', color: '#475569', marginTop: '.35rem' }}>
            Mỗi proxy 1 dòng · Hỗ trợ: ip:port &nbsp;·&nbsp; ip:port:user:pass &nbsp;·&nbsp; user:pass@ip:port
          </div>
        </div>

        <div className="card settings-section settings-section-instagram">
          <h3 style={{ marginTop: 0, marginBottom: '.75rem', fontSize: '1rem', color: '#e2e8f0' }}>
            🍪 Cookie dự phòng check Instagram
            <span style={{ marginLeft: '.75rem', background: instagramCookieList.length > 0 ? '#831843' : '#1e293b', color: instagramCookieList.length > 0 ? '#fbcfe8' : '#94a3b8', borderRadius: 12, padding: '.15rem .6rem', fontSize: '.78rem', fontWeight: 700 }}>
              {instagramCookieList.length} cookie
            </span>
          </h3>
          <div style={{ color: '#94a3b8', fontSize: '.78rem', marginBottom: '.75rem', lineHeight: 1.55 }}>
            Chỉ sử dụng khi lần check thông thường trả về <b style={{ color: '#fbcfe8' }}>unknown</b>. Mỗi cookie một dòng; hệ thống xoay vòng tối đa 3 cookie cho một account và không hiển thị cookie trong kết quả check.
          </div>
          <textarea
            value={instagramCheckCookies}
            onChange={(event) => { setInstagramCheckCookies(event.target.value); setInstagramCookieCheckResults([]); }}
            placeholder={'sessionid=...; csrftoken=...; ds_user_id=...\nsessionid=...; csrftoken=...; ds_user_id=...'}
            rows={8}
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '.7rem .85rem', fontFamily: 'monospace', fontSize: '.78rem', lineHeight: 1.55, resize: 'vertical', outline: 'none' }}
            onFocus={(event) => (event.target.style.borderColor = '#ec4899')}
            onBlur={(event) => (event.target.style.borderColor = '#334155')}
          />
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', marginTop: '.7rem' }}>
            <button type="button" onClick={handleCheckInstagramCookies} disabled={checkingInstagramCookies || !instagramCookieList.length} style={{ background: checkingInstagramCookies ? '#475569' : '#ec4899', border: 0, color: '#fff', borderRadius: 7, padding: '.48rem .8rem', cursor: checkingInstagramCookies ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
              {checkingInstagramCookies ? 'Dang check...' : 'Check cookie'}
            </button>
            <button type="button" onClick={removeDeadInstagramCookies} disabled={!instagramCookieCheckResults.some((item) => item.status === 'die')} style={{ background: '#7f1d1d', border: 0, color: '#fecaca', borderRadius: 7, padding: '.48rem .8rem', cursor: 'pointer', fontWeight: 800, opacity: instagramCookieCheckResults.some((item) => item.status === 'die') ? 1 : .45 }}>
              Xoa cookie die
            </button>
          </div>
          {instagramCookieCheckResults.length > 0 && <div style={{ marginTop: '.75rem', border: '1px solid #334155', borderRadius: 8, overflow: 'hidden' }}>
            {instagramCookieCheckResults.map((result) => {
              const cookie = instagramCookieList[result.index] || '';
              const cookieParts = Object.fromEntries(cookie.split(';').map((part) => { const [name, ...values] = part.trim().split('='); return [String(name || '').toLowerCase(), values.join('=')]; }));
              const dsUserId = cookieParts.ds_user_id || result.ds_user_id || '-';
              const sessionId = cookieParts.sessionid || '';
              const preview = '#' + (result.index + 1) + ' - UID ' + dsUserId + (sessionId ? ' - sessionid=***' + sessionId.slice(-6) : '');
              const color = result.status === 'live' ? '#34d399' : result.status === 'die' ? '#f87171' : '#fbbf24';
              return <div key={result.index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: '.65rem', padding: '.55rem .7rem', borderBottom: result.index + 1 < instagramCookieCheckResults.length ? '1px solid #334155' : 0, background: '#0f172a' }}>
                <div style={{ minWidth: 0 }}><div style={{ color: '#cbd5e1', fontFamily: 'monospace', fontSize: '.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div><div style={{ color: '#64748b', fontSize: '.68rem', marginTop: '.15rem' }}>{result.username ? '@' + result.username + ' - ' : ''}{result.reason || '-'}</div></div>
                <span style={{ color, border: '1px solid ' + color, borderRadius: 12, padding: '.12rem .48rem', fontSize: '.7rem', fontWeight: 850, textTransform: 'uppercase' }}>{result.status}</span>
                <button type="button" onClick={() => removeInstagramCookie(result.index)} style={{ background: 'transparent', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 6, padding: '.25rem .48rem', cursor: 'pointer', fontSize: '.7rem' }}>Xoa</button>
              </div>;
            })}
          </div>}
          <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: '.4rem' }}>
            Tối đa 30 cookie. Cookie được lưu riêng theo tài khoản đăng nhập trên web.
          </div>
        </div>

        {/* Sliders */}
        <div className="card settings-section settings-section-common">
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', color: '#e2e8f0' }}>
            ⚡ Tham số check
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Luồng song song</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{concurrency}</span>
              </div>
              <input
                type="range" min={1} max={40} value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>1 (chậm, an toàn)</span><span>40 (rất nhanh)</span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Delay giữa batch</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{delayMs} ms</span>
              </div>
              <input
                type="range" min={0} max={5000} step={100} value={delayMs}
                onChange={(e) => setDelayMs(e.target.value)}
                style={{ width: '100%', accentColor: '#8b5cf6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>0ms (không delay)</span><span>5000ms</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '.85rem' }}>Số acc mỗi lượt</label>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '.95rem' }}>{batchSize}</span>
              </div>
              <input
                type="range" min={10} max={200} step={10} value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569', marginTop: '.2rem' }}>
                <span>10 (ổn định)</span><span>200 (nhanh)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={handleSave} disabled={saving} style={{
            background: saving ? '#334155' : '#2563eb', border: 'none', color: '#fff',
            borderRadius: '8px', padding: '.65rem 1.75rem',
            cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '.9rem',
          }}>
            {saving ? '⏳ Đang lưu...' : '💾 Lưu cài đặt'}
          </button>
          <button onClick={handleReset} style={{
            background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
            borderRadius: '8px', padding: '.65rem 1.25rem',
            cursor: 'pointer', fontWeight: 600, fontSize: '.9rem',
          }}>
            ↺ Reset
          </button>
        </div>
        </div>
        {settingsTab === 'facebook' && <aside className="settings-right-column"><FacebookNurtureSettings /></aside>}
        {settingsTab === 'instagram' && <aside className="settings-right-column"><InstagramNurtureSettings /></aside>}
      </div>
    </div>
  );
}
