import { useCallback, useEffect, useMemo, useState } from 'react';
import { instagramApi, accountGroupApi } from '../services/api';
import Pagination from '../components/Pagination';
import AccountGroupPicker from '../components/AccountGroupPicker';
import InstagramFacebookRegClaims from '../components/InstagramFacebookRegClaims';
import { toast } from '../components/Toast';
import { copyText } from '../services/clipboard';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';

const TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'CHO_LOGIN', icon: '🔐', label: 'Chờ login', color: '#06b6d4' },
  { value: 'DANG_LOGIN', icon: '⚡', label: 'Đang login', color: '#8b5cf6' },
  { value: 'DANG_LAM', icon: '⚡', label: 'Đang làm', color: '#8b5cf6' },
  { value: 'LOGIN_THANH_CONG', icon: '✅', label: 'Login thành công', color: '#10b981' },
  { value: 'LOGIN_FAIL', icon: '❌', label: 'Login fail', color: '#f97316' },
  { value: 'DA_CHAY_XONG', icon: '✅', label: 'Đã làm xong', color: '#10b981' },
  { value: 'ACCOUNT_DIE', icon: '💀', label: 'Die', color: '#6b7280' },
];
const REG_TABS = [TABS[0], TABS[TABS.length - 1]];
const LIVE_STATUSES = [
  { value: '', label: 'Tất cả' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'live', label: 'Live' },
  { value: 'die', label: 'Die' },
];
const STATUS_META = Object.fromEntries(TABS.filter((tab) => tab.value).map((tab) => [tab.value, tab]));
const STATUS_COLOR = {
  CHO_LOGIN: { bg: 'rgba(6,182,212,.15)', color: '#0891b2' },
  DANG_LOGIN: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  DANG_LAM: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  LOGIN_THANH_CONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  LOGIN_FAIL: { bg: 'rgba(249,115,22,.15)', color: '#ea580c' },
  DA_CHAY_XONG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
  ACCOUNT_DIE: { bg: 'rgba(107,114,128,.16)', color: '#4b5563' },
};
const LIVE_COLOR = { live: '#10b981', die: '#ef4444', unknown: '#94a3b8' };
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const short = (value, n = 25) => value ? (String(value).length > n ? String(value).slice(0, n) + '...' : String(value)) : '-';
const fmtNumber = (value) => value == null ? '-' : Number(value).toLocaleString('vi-VN');
const groupType = (kind) => kind === 'reg' ? 'instagram_reg' : 'instagram_job';

function ImportInstagram({ kind, groups, onClose, onDone, onGroupsChanged }) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return toast.warn('Nhập account Instagram trước');
    setBusy(true);
    try {
      const res = await instagramApi.import(text, kind, kind === 'job' ? 'CHO_LOGIN' : 'LOGIN_THANH_CONG', groupId || null);
      toast.success(res.message);
      onDone();
      onClose();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return <div style={{ position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.6)',display:'grid',placeItems:'center',padding:'1rem' }}>
    <div style={{ width:'min(680px,100%)',background:'#1e293b',borderRadius:12,padding:'1.25rem',color:'#e2e8f0' }}>
      <h3>Import Instagram {kind === 'reg' ? 'Reg' : 'Job'}</h3>
      <div style={{ color:'#94a3b8',fontSize:'.8rem',marginBottom:12 }}>Tài khoản|Mật khẩu|2FA|Cookies (Cookies có thể để trống)</div>
      <AccountGroupPicker accountType={groupType(kind)} groups={groups} value={groupId} onChange={setGroupId} onGroupsChanged={onGroupsChanged} />
      <textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder="username|password|JBSWY3DPEHPK3PXP|sessionid=..." style={{ width:'100%',height:260,marginTop:12,background:'#0f172a',color:'#fff',padding:12,borderRadius:8 }} />
      <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:12 }}><button className="btn btn-secondary" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy?'Đang import...':'Import'}</button></div>
    </div>
  </div>;
}

export default function InstagramAccounts({ kind = 'job', platformSwitch = null }) {
  const isReg = kind === 'reg';
  const tabs = isReg ? REG_TABS : TABS;
  const [rows,setRows]=useState([]),[pagination,setPagination]=useState(null),[counts,setCounts]=useState({}),[machines,setMachines]=useState([]),[groups,setGroups]=useState([]);
  const [page,setPage]=useState(1),[limit,setLimit]=useState(50),[status,setStatus]=useState(''),[q,setQ]=useState(''),[groupId,setGroupId]=useState(''),[device,setDevice]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[soakDays,setSoakDays]=useState(''),[liveStatus,setLiveStatus]=useState('');
  const [sort,setSort]=useState({field:'login_at',direction:'desc'}),[selected,setSelected]=useState(new Set()),[loading,setLoading]=useState(false),[importing,setImporting]=useState(false);
  const [checking,setChecking]=useState(false),[checkProgress,setCheckProgress]=useState(null);
  const [trash,setTrash]=useState(false),[trashCount,setTrashCount]=useState(0),[machineView,setMachineView]=useState(false);
  const [bulkStatus,setBulkStatus]=useState(''),[bulkGroup,setBulkGroup]=useState('');
  const [regView,setRegView]=useState('accounts');
  const params=useMemo(()=>({kind,page,limit,status,q,group_id:groupId,device_id:device||undefined,live_status:liveStatus||undefined,date_from:dateFrom||undefined,date_to:dateTo||undefined,soak_days:soakDays||undefined,sort_by:sort.field||undefined,sort_order:sort.direction}),[kind,page,limit,status,q,groupId,device,dateFrom,dateTo,soakDays,liveStatus,sort]);
  const loadGroups=useCallback(async()=>{try{const r=await accountGroupApi.getAll(groupType(kind));setGroups(r.data?.groups||[]);}catch(e){toast.error(e.message);}},[kind]);
  const load=useCallback(async()=>{setLoading(true);try{const r=trash?await instagramApi.getTrash(params):await instagramApi.getAll(params);setRows(r.data?.accounts||[]);setPagination(r.data?.pagination||null);if(!trash){setCounts(r.data?.status_counts||{});setMachines(r.data?.machine_stats||[]);setTrashCount(r.data?.trash_count||0);}else setTrashCount(r.data?.pagination?.total||0);}catch(e){toast.error(e.message);}finally{setLoading(false);}},[params,trash]);
  useEffect(()=>{loadGroups();},[loadGroups]); useEffect(()=>{load();},[load]);
  const ids=[...selected],all=rows.length>0&&rows.every((r)=>selected.has(r.id)),total=Object.values(counts).reduce((a,b)=>a+Number(b||0),0);
  const reset=()=>setSelected(new Set());
  const toggleAll=()=>setSelected((s)=>{const n=new Set(s);rows.forEach((r)=>all?n.delete(r.id):n.add(r.id));return n;});
  const action=async(fn,confirmText)=>{if(!ids.length)return toast.warn('Chọn account trước');if(confirmText&&!confirm(confirmText))return;try{const r=await fn();toast.success(r.message);reset();load();}catch(e){toast.error(e.message);}};
  const handleCheckLive=async()=>{
    const targetIds=ids.length?ids:rows.map((row)=>row.id);
    if(!targetIds.length)return toast.warn('Không có account Instagram để kiểm tra');
    setChecking(true);setCheckProgress({done:0,total:targetIds.length,live:0,die:0,unknown:0});
    try{
      const result=await checkLiveInBatches('/instagram/check-live',targetIds,loadCheckLiveSettings(),setCheckProgress);
      const postsChecked=result.rows.filter((row)=>row.result==='live'&&row.posts!==null&&row.posts!==undefined).length;
      toast.success(`Đã check ${targetIds.length} account: ${result.live} live, ${result.die} die, ${result.unknown} unknown · ${postsChecked}/${result.live} live có số post · ${result.proxyCount > 0 ? result.proxyCount + ' proxy' : 'mạng chính'}`);
      reset();await load();
    }catch(e){toast.error(e.message||'Check live Instagram thất bại');}
    finally{setChecking(false);setCheckProgress(null);}
  };
  const sortHeader=(field,label)=><th><button type="button" className={'ig-sort-th'+(sort.field===field?' active':'')} onClick={()=>setSort((current)=>({field,direction:current.field===field&&current.direction==='asc'?'desc':'asc'}))}><span>{label}</span><span>{sort.field===field?(sort.direction==='asc'?'▲':'▼'):'↕'}</span></button></th>;
  const switchTrash=()=>{setTrash((v)=>!v);setPage(1);setMachineView(false);reset();};
  const setFilter=(setter,value)=>{setter(value);setPage(1);reset();};
  const statusColor=(value)=>value==='LOGIN_THANH_CONG'||value==='DA_CHAY_XONG'?'#059669':value==='LOGIN_FAIL'||value==='ACCOUNT_DIE'?'#dc2626':'#7c3aed';

  return (
    <div className="page">
      <style>{`
        .ig-row:hover { background: rgba(236,72,153,.045) !important; }
        .ig-row.row-selected { background: rgba(236,72,153,.08) !important; }
        .ig-status-tabs { display:flex; gap:.4rem; margin-bottom:1rem; flex-wrap:wrap; }
        .ig-stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(185px,220px)); gap:1rem; margin-bottom:1rem; }
        .ig-toolbar-select { border:1px solid #334155; border-radius:7px; padding:.38rem .65rem; background:#fff; color:#0f172a; font-size:.8rem; min-width:150px; }
        .ig-sort-th { display:inline-flex; align-items:center; gap:.35rem; border:0; background:transparent; padding:0; color:inherit; font:inherit; font-weight:inherit; letter-spacing:inherit; cursor:pointer; text-transform:inherit; white-space:nowrap; }
        .ig-sort-th span:last-child { color:#94a3b8; font-size:.68rem; }
        .ig-sort-th.active span:last-child { color:#db2777; }
        @media (max-width: 768px) { .ig-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      `}</style>

      <div className="page-header">
        <div>
          <h1>{trash ? 'Instagram Job - Thùng rác' : isReg ? 'Instagram Reg' : 'Instagram Job'} <span style={{fontSize:'.75rem',color:'#94a3b8',fontWeight:400}}>{isReg ? 'Account reg' : trash ? 'Dữ liệu đã xóa' : 'Phone job'}</span></h1>
          <div className="subtitle">{isReg ? 'Quản lý account Instagram do máy push lên sau khi reg/login.' : 'Phone job lấy account Instagram, khóa lock theo máy và báo cáo trạng thái.'}</div>
        </div>
        <div style={{display:'flex',gap:'.75rem',flexWrap:'wrap'}}>
          {isReg && <>
            <button type="button" className={regView === 'accounts' ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'} onClick={()=>setRegView('accounts')}>Danh sách account</button>
            <button type="button" className={regView === 'facebook' ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'} onClick={()=>setRegView('facebook')}>Reg IG bằng Facebook</button>
          </>}
          {!isReg && !trash && <>
            <button type="button" className={!machineView ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'} onClick={()=>setMachineView(false)}>Danh sách account</button>
            <button type="button" className={machineView ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'} onClick={()=>setMachineView(true)}>Theo máy ({machines.length})</button>
          </>}
          {!isReg && <button type="button" className="btn btn-secondary btn-sm" onClick={switchTrash}>{trash ? 'Quay lại Instagram Job' : 'Thùng rác (' + trashCount + ')'}</button>}
          {!trash && (!isReg || regView === 'accounts') && <button type="button" className="btn btn-primary btn-sm" onClick={()=>setImporting(true)}>Import</button>}
          {(!isReg || regView === 'accounts') && <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}
        </div>
      </div>

      {platformSwitch && <div style={{marginBottom:'1rem'}}>{platformSwitch}</div>}

      {isReg && !trash && regView === 'accounts' && <div className="ig-stat-grid">
        <div className="stat-card" style={{borderLeftColor:'#ec4899'}}>
          <div className="stat-icon" style={{background:'rgba(236,72,153,.14)',color:'#db2777'}}>IG</div>
          <div className="stat-info"><div className="stat-value">{total}</div><div className="stat-title">Tổng Account</div></div>
        </div>
        <div className="stat-card" style={{borderLeftColor:'#6b7280'}}>
          <div className="stat-icon" style={{background:'rgba(107,114,128,.16)',color:'#4b5563'}}>Die</div>
          <div className="stat-info"><div className="stat-value">{counts.ACCOUNT_DIE || 0}</div><div className="stat-title">Account Die</div></div>
        </div>
      </div>}

      {!isReg && !trash && !machineView && device && <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'1rem'}}>
        <span style={{background:'rgba(219,39,119,.10)',color:'#be185d',border:'1px solid rgba(219,39,119,.22)',borderRadius:20,padding:'.38rem .75rem',fontSize:'.8rem',fontWeight:750}}>Đang xem máy: {device}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setFilter(setDevice,'')}>Bỏ lọc máy</button>
      </div>}

      {!trash && !machineView && (!isReg || regView === 'accounts') && <div className="ig-status-tabs">
        {tabs.map((tab)=><button key={tab.value || 'all'} type="button" onClick={()=>setFilter(setStatus,tab.value)} style={{
          background:status===tab.value ? tab.color : 'rgba(255,255,255,.06)',
          color:status===tab.value ? '#fff' : '#64748b',
          border:status===tab.value ? 'none' : '1px solid rgba(148,163,184,.25)',
          borderRadius:8,padding:'.45rem .9rem',cursor:'pointer',fontWeight:status===tab.value?700:500,fontSize:'.82rem',whiteSpace:'nowrap'
        }}>{tab.icon} {tab.label} ({tab.value ? counts[tab.value] || 0 : total})</button>)}
      </div>}

      {isReg && regView === 'facebook' ? <InstagramFacebookRegClaims /> : !trash && machineView ? <div className="card" style={{padding:0,overflow:'hidden',marginBottom:'1rem'}}>
        <div className="card-header" style={{gap:'.75rem',flexWrap:'wrap'}}>
          <div><h3>🖥️ Quản lý account theo máy</h3><div style={{color:'#64748b',fontSize:'.78rem',marginTop:'.2rem'}}>{machines.length} máy đã có account</div></div>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Tìm tên máy..." style={{width:210,maxWidth:'100%',border:'1px solid #cbd5e1',borderRadius:8,padding:'.45rem .75rem'}} />
        </div>
        <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>MÁY</th><th>ACCOUNT</th><th>CHỜ LOGIN</th><th>ĐANG LOGIN</th><th>LOGIN THÀNH CÔNG</th><th>ĐANG LÀM</th><th>ĐÃ XONG</th><th>FAIL / DIE</th><th>CẬP NHẬT CUỐI</th></tr></thead><tbody>
          {!machines.filter((m)=>!q.trim() || String(m.device_id).toLowerCase().includes(q.trim().toLowerCase())).length ? <tr><td colSpan={9} style={{textAlign:'center',color:'#94a3b8',padding:28}}>Chưa có máy phù hợp</td></tr> : machines.filter((m)=>!q.trim() || String(m.device_id).toLowerCase().includes(q.trim().toLowerCase())).map((m)=><tr key={m.device_id} style={{cursor:'pointer',background:device===m.device_id?'rgba(219,39,119,.08)':undefined}} onClick={()=>{setDevice(m.device_id);setQ('');setMachineView(false);setPage(1);}}><td><strong style={{color:device===m.device_id?'#db2777':'#0f172a'}}>{m.device_id}</strong></td><td style={{color:'#7c3aed',fontWeight:800}}>{m.total}</td><td>{m.waiting_login}</td><td>{m.logging_in}</td><td style={{color:'#059669',fontWeight:750}}>{m.login_success}</td><td style={{color:'#7c3aed',fontWeight:750}}>{m.working}</td><td style={{color:'#2563eb',fontWeight:750}}>{m.done}</td><td style={{color:'#ef4444',fontWeight:750}}>{m.failed}</td><td style={{color:'#64748b',whiteSpace:'nowrap'}}>{fmt(m.last_updated_at)}</td></tr>)}
        </tbody></table></div>
      </div> : <>
        <div className="card" style={{marginBottom:'1rem',overflow:'visible'}}><div className="filter-bar" style={{margin:0,boxShadow:'none'}}><div className="filter-row">
          <div className="filter-group" style={{minWidth:240,flex:'1 1 260px'}}><label>Tìm tài khoản / Máy</label><input value={q} onChange={(e)=>setFilter(setQ,e.target.value)} placeholder="username, May1..." /></div>
          <div className="filter-group"><label>Nhóm</label><select value={groupId} onChange={(e)=>setFilter(setGroupId,e.target.value)}><option value="">Tất cả nhóm</option>{groups.map((g)=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="filter-group"><label>Trạng thái live</label><select value={liveStatus} onChange={(e)=>setFilter(setLiveStatus,e.target.value)}>{LIVE_STATUSES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          {!isReg && !trash && <><div className="filter-group"><label>Từ ngày</label><input type="date" value={dateFrom} onChange={(e)=>setFilter(setDateFrom,e.target.value)} /></div><div className="filter-group"><label>Đến ngày</label><input type="date" value={dateTo} onChange={(e)=>setFilter(setDateTo,e.target.value)} /></div><div className="filter-group"><label>Ngâm</label><select value={soakDays} onChange={(e)=>setFilter(setSoakDays,e.target.value)}><option value="">Tất cả</option>{[1,2,3,5,7,14,30].map((n)=><option key={n} value={n}>{'Ngâm >= '+n+' ngày'}</option>)}</select></div></>}
          <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(e)=>setFilter(setLimit,Number(e.target.value))}>{[20,50,100,500,1000,2000].map((n)=><option key={n} value={n}>{n} dòng</option>)}</select></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{setQ('');setStatus('');setGroupId('');setDevice('');setLiveStatus('');setDateFrom('');setDateTo('');setSoakDays('');setPage(1);reset();}}>Xóa bộ lọc</button>
        </div></div></div>

        <div style={{background:'#0f172a',borderRadius:12,padding:'.75rem 1.25rem',marginBottom:'1rem',boxShadow:'0 4px 16px rgba(0,0,0,.3)',border:'1px solid rgba(255,255,255,.07)',display:'flex',alignItems:'center',gap:'.75rem',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:'.5rem',fontSize:'.85rem',color:'#cbd5e1'}}><span>Instagram</span><span style={{color:'#f9a8d4',fontWeight:800}}>session</span><span style={{color:'#93c5fd',fontWeight:800}}>account</span></div>
          <div style={{flex:1}} />
          {!trash && <button className="btn btn-sm" style={{background:'#0ea5e9',color:'#fff'}} disabled={checking||loading||!rows.length} onClick={handleCheckLive}>{checking?`Đang check ${checkProgress?.done||0}/${checkProgress?.total||0}`:(ids.length?'Check live đã chọn':'Check live trang này')}</button>}
          {ids.length>0 && <span style={{background:'#ec4899',borderRadius:20,color:'#fff',padding:'.25rem .75rem',fontWeight:800,fontSize:'.82rem'}}>{ids.length} đã chọn</span>}
          {!trash && ids.length>0 && <>
            {isReg && <button className="btn btn-sm" style={{background:'#8b5cf6',color:'#fff'}} onClick={()=>action(()=>instagramApi.bulkSyncToJob(ids),'Chuyển sang Instagram Job?')}>Chuyển sang Instagram Job</button>}
            <select className="ig-toolbar-select" value={bulkGroup} onChange={(e)=>{const value=e.target.value;setBulkGroup(value);if(value)action(()=>instagramApi.bulkMoveGroup(ids,value,kind)).finally(()=>setBulkGroup(''));}}><option value="">Chuyển nhóm...</option>{groups.map((g)=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <select className="ig-toolbar-select" value={bulkStatus} onChange={(e)=>{const value=e.target.value;setBulkStatus(value);if(value)action(()=>instagramApi.bulkAction(ids,'set_status',{status:value})).finally(()=>setBulkStatus(''));}}><option value="">Đổi trạng thái...</option>{tabs.filter((t)=>t.value).map((t)=><option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <button className="btn btn-primary btn-sm" onClick={()=>action(async()=>{const r=await instagramApi.bulkGet(ids);await copyText(r.data?.text||'');return r;})}>Copy</button>
            <button className="btn btn-danger btn-sm" onClick={()=>action(()=>instagramApi.bulkDelete(ids),'Xóa account đã chọn?')}>Xóa</button>
          </>}
          {trash && ids.length>0 && <><button className="btn btn-success btn-sm" onClick={()=>action(()=>instagramApi.restoreTrash(ids),'Khôi phục account đã chọn?')}>Khôi phục đã chọn</button><button className="btn btn-primary btn-sm" onClick={()=>action(async()=>{const r=await instagramApi.bulkGet(ids);await copyText(r.data?.text||'');return r;})}>Copy đã chọn</button><button className="btn btn-danger btn-sm" onClick={()=>action(()=>instagramApi.deleteTrash(ids),'Xóa vĩnh viễn?')}>Xóa vĩnh viễn</button></>}
          {ids.length>0 && <button className="btn btn-secondary btn-sm" onClick={reset}>✕ Bỏ chọn</button>}
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="card-header"><h3>{trash ? 'Thùng rác Instagram Job' : 'Danh sách account'}</h3><span style={{color:'#64748b',fontSize:'.8rem'}}>{pagination?.total || 0} account {loading ? '- đang tải...' : ''}</span></div>
          <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th style={{width:40}}><input type="checkbox" checked={all} onChange={toggleAll}/></th><th>STT</th><th>TÀI KHOẢN</th><th>PASS</th><th>2FA</th><th>COOKIES</th><th>NHÓM</th><th><button type="button" className={'ig-sort-th' + (sort.field==='device_id'?' active':'')} onClick={()=>setSort((s)=>({field:'device_id',direction:s.field==='device_id'&&s.direction==='asc'?'desc':'asc'}))}><span>MÁY</span><span>{sort.field==='device_id'?(sort.direction==='asc'?'▲':'▼'):'↕'}</span></button></th><th>TRẠNG THÁI</th><th>LIVE</th>{sortHeader('post_count','POST')}{sortHeader('followers','FOLLOWERS')}{sortHeader('following','FOLLOWING')}{sortHeader('last_live_check_at','CHECK CUỐI')}<th>LOCK</th>{sortHeader('login_at','LOGIN AT')}<th>{trash ? 'NGÀY XÓA' : 'NGÀY XONG'}</th></tr></thead><tbody>
            {!rows.length ? <tr><td colSpan={17} style={{textAlign:'center',color:'#94a3b8',padding:36}}>{trash ? 'Thùng rác đang trống' : 'Chưa có account Instagram'}</td></tr> : rows.map((r,i)=>{const sc=STATUS_COLOR[r.status]||{bg:'rgba(100,116,139,.1)',color:'#64748b'};return <tr key={r.id} className={'ig-row' + (selected.has(r.id)?' row-selected':'')}><td><input type="checkbox" checked={selected.has(r.id)} onChange={()=>setSelected((s)=>{const n=new Set(s);n.has(r.id)?n.delete(r.id):n.add(r.id);return n;})}/></td><td style={{color:'#94a3b8'}}>{(page-1)*limit+i+1}</td><td><strong>{r.uid}</strong></td><td>{short(r.password,18)}</td><td>{short(r.two_fa,18)}</td><td title={r.cookies||''}>{short(r.cookies,26)}</td><td>{groups.find((g)=>String(g.id)===String(r.group_id))?.name||'-'}</td><td>{r.device_id||'-'}</td><td><span style={{background:sc.bg,color:sc.color,borderRadius:6,padding:'.2rem .5rem',fontSize:'.72rem',fontWeight:800,whiteSpace:'nowrap'}}>{STATUS_META[r.status]?.label||r.status||'-'}</span></td><td style={{color:LIVE_COLOR[r.live_status]||'#94a3b8',fontWeight:700}}>{r.live_status||'unknown'}</td><td style={{color:'#db2777',fontWeight:750}}>{fmtNumber(r.post_count)}</td><td style={{color:'#2563eb',fontWeight:750}}>{fmtNumber(r.followers)}</td><td style={{color:'#7c3aed',fontWeight:750}}>{fmtNumber(r.following)}</td><td style={{color:'#64748b',whiteSpace:'nowrap'}}>{fmt(r.last_live_check_at)}</td><td>{r.locked_by?r.locked_by+' - '+fmt(r.locked_at):'-'}</td><td>{fmt(r.login_at)}</td><td>{fmt(trash?r.trashed_at:r.completed_at)}</td></tr>;})}
          </tbody></table></div>
        </div>
        <Pagination pagination={pagination} onPageChange={(p)=>{setPage(p);reset();}} />
      </>}
      {importing&&<ImportInstagram kind={kind} groups={groups} onClose={()=>setImporting(false)} onDone={load} onGroupsChanged={loadGroups}/>}
    </div>
  );
}