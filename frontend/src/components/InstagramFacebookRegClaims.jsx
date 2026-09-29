import { useCallback, useEffect, useMemo, useState } from 'react';
import { instagramApi } from '../services/api';
import Pagination from './Pagination';
import { toast } from './Toast';

const CLAIM_STATUS = {
  CHUA_REG: { label: 'Chưa reg', color: '#0284c7', bg: 'rgba(14,165,233,.11)' },
  DANG_REG: { label: 'Đang reg', color: '#7c3aed', bg: 'rgba(124,58,237,.12)' },
  REG_XONG: { label: 'Reg thành công', color: '#059669', bg: 'rgba(5,150,105,.12)' },
  REG_FAIL: { label: 'Reg thất bại', color: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  CANCELLED: { label: 'Đã hủy', color: '#64748b', bg: 'rgba(100,116,139,.12)' },
};

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12:false }) : '-';
const short = (value, size = 32) => value ? (String(value).length > size ? `${String(value).slice(0, size)}...` : String(value)) : '-';
const number = (value) => Number(value || 0).toLocaleString('vi-VN');

function SummaryCard({ label, value, icon, color, active = false, onClick = null }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag {...(onClick ? { type:'button', onClick } : {})} className={'ig-fb-claim-summary' + (onClick ? ' clickable' : '')} style={{ borderLeftColor:color, outline:active ? `2px solid ${color}` : 'none' }}>
    <span className="ig-fb-claim-summary-icon" style={{ color, background:`${color}18` }}>{icon}</span>
    <span><strong>{number(value)}</strong><small>{label}</small></span>
  </Tag>;
}

export default function InstagramFacebookRegClaims() {
  const [view, setView] = useState('machines');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [machines, setMachines] = useState([]);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({});
  const [deviceCount, setDeviceCount] = useState(0);
  const [regSettings, setRegSettings] = useState({ reuse_hours:24, max_instagram_per_facebook:1 });
  const [resettingId, setResettingId] = useState(null);
  const [resettingBulk, setResettingBulk] = useState(false);
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ field:'last_activity_at', direction:'desc' });
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => view === 'machines' ? {
    page, limit, q:q.trim() || undefined, sort_by:sort.field, sort_order:sort.direction,
  } : {
    page, limit, device_id:selectedDevice, status:status || undefined, q:q.trim() || undefined,
    sort_by:sort.field, sort_order:sort.direction,
  }, [view, page, limit, selectedDevice, status, q, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = view === 'machines'
        ? await instagramApi.getFacebookRegMachines(params)
        : await instagramApi.getFacebookRegClaims(params);
      if (view === 'machines') setMachines(response.data?.machines || []);
      else {
        setRows(response.data?.claims || []);
        setSelectedUids(new Set());
      }
      setCounts(response.data?.status_counts || {});
      setDeviceCount(response.data?.device_count || 0);
      setRegSettings(response.data?.reg_settings || { reuse_hours:24, max_instagram_per_facebook:1 });
      setPagination(response.data?.pagination || null);
    } catch (err) {
      toast.error(err.message || 'Không tải được dữ liệu Reg IG bằng Facebook');
    } finally {
      setLoading(false);
    }
  }, [params, view]);

  useEffect(() => { load(); }, [load]);

  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const selectableRows = useMemo(() => rows.filter((row) => row.facebook_uid), [rows]);
  const allRowsSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedUids.has(row.facebook_uid));
  const openMachine = (deviceId) => {
    setSelectedDevice(deviceId);
    setView('claims');
    setPage(1);
    setLimit(20);
    setQ('');
    setStatus('');
    setSort({ field:'login_at', direction:'desc' });
    setSelectedUids(new Set());
  };
  const backToMachines = () => {
    setView('machines');
    setSelectedDevice('');
    setPage(1);
    setQ('');
    setStatus('');
    setSort({ field:'last_activity_at', direction:'desc' });
  };
  const clearFilters = () => {
    setQ(''); setStatus(''); setPage(1); setLimit(20);
    setSort(view === 'machines' ? { field:'last_activity_at', direction:'desc' } : { field:'login_at', direction:'desc' });
  };
  const setStatusFilter = (value) => { if (view === 'claims') { setStatus(value); setPage(1); } };
  const sortHeader = (field, label) => <th><button type="button" className={'ig-fb-claim-sort' + (sort.field === field ? ' active' : '')} onClick={() => {
    setSort((current) => ({ field, direction:current.field === field && current.direction === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  }}><span>{label}</span><span>{sort.field === field ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>;
  const resetEligibility = async (row) => {
    if (!confirm('Mở lại Facebook ' + row.facebook_uid + ' để Reg Instagram từ đầu chu kỳ?')) return;
    setResettingId(row.id);
    try {
      const response = await instagramApi.resetFacebookRegEligibility({ facebook_uid:row.facebook_uid });
      toast.success(response.message || 'Đã reset chu kỳ Reg IG');
      await load();
    } catch (err) {
      toast.error(err.message || 'Reset chu kỳ Reg IG thất bại');
    } finally {
      setResettingId(null);
    }
  };
  const toggleSelected = (uid) => setSelectedUids((current) => {
    const next = new Set(current);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });
  const toggleAllRows = () => setSelectedUids(() => (
    allRowsSelected ? new Set() : new Set(selectableRows.map((row) => row.facebook_uid))
  ));
  const resetSelected = async () => {
    const facebook_uids = [...selectedUids];
    if (!facebook_uids.length || !confirm('Reset chu kỳ Reg IG cho ' + facebook_uids.length + ' account Facebook đã chọn?')) return;
    setResettingBulk(true);
    try {
      const response = await instagramApi.resetFacebookRegEligibility({ facebook_uids });
      toast.success(response.message || ('Đã reset ' + facebook_uids.length + ' account'));
      setSelectedUids(new Set());
      await load();
    } catch (err) {
      toast.error(err.message || 'Reset các account đã chọn thất bại');
    } finally {
      setResettingBulk(false);
    }
  };

  return <section className="ig-fb-claims">
    <style>{`
      .ig-fb-claim-summary-grid { display:grid; grid-template-columns:repeat(5,minmax(150px,1fr)); gap:.8rem; margin-bottom:1rem; }
      .ig-fb-claim-summary { min-width:0; display:flex; align-items:center; gap:.75rem; text-align:left; padding:.9rem 1rem; border:1px solid #dbe3ee; border-left:4px solid; border-radius:11px; background:#fff; box-shadow:0 1px 3px rgba(15,23,42,.08); }
      .ig-fb-claim-summary.clickable { cursor:pointer; }
      .ig-fb-claim-summary.clickable:hover { transform:translateY(-1px); box-shadow:0 5px 14px rgba(15,23,42,.10); }
      .ig-fb-claim-summary-icon { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:9px; font-weight:900; font-size:.8rem; }
      .ig-fb-claim-summary strong { display:block; color:#0f172a; font-size:1.25rem; line-height:1.1; }
      .ig-fb-claim-summary small { display:block; color:#64748b; font-size:.68rem; font-weight:800; margin-top:.3rem; text-transform:uppercase; }
      .ig-fb-claim-sort { display:inline-flex; align-items:center; gap:.3rem; padding:0; border:0; background:transparent; color:inherit; font:inherit; font-weight:inherit; cursor:pointer; white-space:nowrap; }
      .ig-fb-claim-sort span:last-child { color:#94a3b8; font-size:.65rem; }
      .ig-fb-claim-sort.active span:last-child { color:#db2777; }
      .ig-fb-claim-status { display:inline-flex; align-items:center; border-radius:999px; padding:.25rem .55rem; font-size:.72rem; font-weight:800; white-space:nowrap; }
      .ig-fb-machine-row { cursor:pointer; }
      .ig-fb-machine-row:hover, .ig-fb-claim-table tbody tr:hover { background:rgba(236,72,153,.045); }
      @media (max-width:1100px) { .ig-fb-claim-summary-grid { grid-template-columns:repeat(3,minmax(150px,1fr)); } }
      @media (max-width:700px) { .ig-fb-claim-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .ig-fb-claim-summary { padding:.7rem; } }
    `}</style>

    <div className="ig-fb-claim-summary-grid">
      <SummaryCard label={view === 'claims' ? 'Tổng account' : 'Tổng lượt reg'} value={total} icon="IG" color="#db2777" />
      {view === 'claims' && <SummaryCard label="Chưa reg" value={counts.CHUA_REG} icon="NEW" color="#0284c7" active={status === 'CHUA_REG'} onClick={() => setStatusFilter('CHUA_REG')} />}
      <SummaryCard label="Đang reg" value={counts.DANG_REG} icon="RUN" color="#7c3aed" active={status === 'DANG_REG'} onClick={view === 'claims' ? () => setStatusFilter('DANG_REG') : null} />
      <SummaryCard label="Reg thành công" value={counts.REG_XONG} icon="OK" color="#10b981" active={status === 'REG_XONG'} onClick={view === 'claims' ? () => setStatusFilter('REG_XONG') : null} />
      <SummaryCard label="Reg thất bại" value={counts.REG_FAIL} icon="FAIL" color="#ef4444" active={status === 'REG_FAIL'} onClick={view === 'claims' ? () => setStatusFilter('REG_FAIL') : null} />
      <SummaryCard label="Máy đã tham gia" value={deviceCount} icon="MÁY" color="#0ea5e9" />
    </div>

    <div style={{ display:'flex', alignItems:'center', gap:'.75rem', flexWrap:'wrap', marginBottom:'1rem', padding:'.75rem 1rem', border:'1px solid rgba(219,39,119,.18)', borderRadius:10, background:'rgba(236,72,153,.055)', color:'#475569', fontSize:'.8rem' }}>
      <strong style={{ color:'#be185d' }}>Cấu hình đang áp dụng:</strong>
      <span>Mở lại sau <b>{number(regSettings.reuse_hours)} giờ</b></span><span>·</span>
      <span>Tối đa <b>{number(regSettings.max_instagram_per_facebook)} IG / 1 Facebook</b> trong mỗi chu kỳ</span><span>·</span>
      <span>Reset thủ công sẽ mở ngay và bắt đầu chu kỳ mới.</span>
    </div>

    {view === 'claims' && <div style={{ display:'flex', alignItems:'center', gap:'.65rem', marginBottom:'1rem', flexWrap:'wrap' }}>
      <span style={{ background:'rgba(219,39,119,.10)', color:'#be185d', border:'1px solid rgba(219,39,119,.22)', borderRadius:20, padding:'.38rem .75rem', fontSize:'.8rem', fontWeight:800 }}>Đang xem máy: {selectedDevice}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={backToMachines}>← Danh sách máy</button>
    </div>}

    <div className="card" style={{ marginBottom:'1rem', overflow:'visible' }}>
      <div className="filter-bar" style={{ margin:0, boxShadow:'none' }}><div className="filter-row">
        <div className="filter-group" style={{ minWidth:260, flex:'1 1 320px' }}><label>{view === 'machines' ? 'Tìm tên máy' : 'Tìm UID Facebook / tài khoản IG'}</label><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder={view === 'machines' ? 'May1, Reg4...' : 'UID Facebook, username IG...'} /></div>
        {view === 'claims' && <div className="filter-group"><label>Trạng thái lượt reg</label><select value={status} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(CLAIM_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>}
        <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>{[20,50,100].map((value) => <option key={value} value={value}>{value} dòng</option>)}</select></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Xóa bộ lọc</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
      </div></div>
    </div>

    {view === 'machines' ? <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-header"><div><h3>🖥️ Reg Instagram theo máy</h3><div style={{ color:'#64748b', fontSize:'.76rem', marginTop:'.2rem' }}>Mỗi máy một hàng · Bấm vào máy để xem account và trạng thái Reg</div></div><span style={{ color:'#64748b', fontSize:'.8rem' }}>{number(pagination?.total)} máy {loading ? '- đang tải...' : ''}</span></div>
      <div style={{ overflowX:'auto' }}><table className="data-table"><thead><tr>
        <th>STT</th>{sortHeader('device_id','MÁY')}{sortHeader('facebook_count','FB ACCOUNT')}{sortHeader('instagram_count','IG ĐÃ REG')}{sortHeader('active_count','ĐANG REG')}{sortHeader('success_count','THÀNH CÔNG')}{sortHeader('fail_count','THẤT BẠI')}{sortHeader('cancelled_count','ĐÃ HỦY')}{sortHeader('total_claims','TỔNG LƯỢT')}{sortHeader('last_report_at','BÁO CÁO CUỐI')}{sortHeader('last_activity_at','HOẠT ĐỘNG CUỐI')}
      </tr></thead><tbody>
        {!machines.length ? <tr><td colSpan={11} style={{ textAlign:'center', color:'#94a3b8', padding:38 }}>{loading ? 'Đang tải dữ liệu...' : 'Chưa có máy Reg Instagram bằng Facebook'}</td></tr> : machines.map((machine, index) => <tr key={machine.device_id} className="ig-fb-machine-row" onClick={() => openMachine(machine.device_id)}>
          <td style={{ color:'#94a3b8' }}>{(page - 1) * limit + index + 1}</td>
          <td><strong style={{ color:'#0f172a' }}>{machine.device_id}</strong></td>
          <td style={{ color:'#2563eb', fontWeight:850 }}>{number(machine.facebook_count)}</td>
          <td style={{ color:'#db2777', fontWeight:850 }}>{number(machine.instagram_count)}</td>
          <td style={{ color:'#7c3aed', fontWeight:850 }}>{number(machine.active_count)}</td>
          <td style={{ color:'#059669', fontWeight:850 }}>{number(machine.success_count)}</td>
          <td style={{ color:'#dc2626', fontWeight:850 }}>{number(machine.fail_count)}</td>
          <td style={{ color:'#64748b', fontWeight:750 }}>{number(machine.cancelled_count)}</td>
          <td style={{ fontWeight:850 }}>{number(machine.total_claims)}</td>
          <td style={{ whiteSpace:'nowrap', color:'#059669' }}>{fmt(machine.last_report_at)}</td>
          <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmt(machine.last_activity_at)}</td>
        </tr>)}
      </tbody></table></div>
    </div> : <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-header"><div><h3>🔗 Account và trạng thái Reg của {selectedDevice}</h3><div style={{ color:'#64748b', fontSize:'.76rem', marginTop:'.2rem' }}>Toàn bộ account Facebook hợp lệ của máy và trạng thái Reg gần nhất</div></div><span style={{ color:'#64748b', fontSize:'.8rem' }}>{number(pagination?.total)} account {loading ? '- đang tải...' : ''}</span></div>
      <div style={{ display:'flex', alignItems:'center', gap:'.55rem', flexWrap:'wrap', padding:'.65rem 1rem', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
        <strong style={{ color:'#334155', fontSize:'.8rem' }}>{selectedUids.size} account đã chọn</strong>
        <button type="button" className="btn btn-primary btn-sm" disabled={!selectedUids.size || resettingBulk} onClick={resetSelected}>{resettingBulk ? 'Đang reset...' : 'Reset account đã chọn'}</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedUids.size || resettingBulk} onClick={() => setSelectedUids(new Set())}>Bỏ chọn</button>
        <span style={{ color:'#64748b', fontSize:'.74rem' }}>Có thể chọn mọi account; hệ thống sẽ mở lại chu kỳ và giải phóng phiên đang Reg.</span>
      </div>
      <div style={{ overflowX:'auto' }}><table className="data-table ig-fb-claim-table"><thead><tr>
        <th><input type="checkbox" aria-label="Chọn tất cả account có thể reset" checked={allRowsSelected} onChange={toggleAllRows} disabled={!selectableRows.length || resettingBulk} /></th><th>STT</th>{sortHeader('facebook_uid','UID FACEBOOK')}{sortHeader('instagram_uid','ACCOUNT IG')}{sortHeader('status','TRẠNG THÁI')}{sortHeader('get_count','LẦN GET')}<th>EMAIL ORDER</th>{sortHeader('locked_at','LOCK LÚC')}{sortHeader('created_at','BẮT ĐẦU')}{sortHeader('completed_at','HOÀN TẤT')}<th>CHU KỲ</th><th>GHI CHÚ / LỖI</th><th>THAO TÁC</th>
      </tr></thead><tbody>
        {!rows.length ? <tr><td colSpan={13} style={{ textAlign:'center', color:'#94a3b8', padding:38 }}>{loading ? 'Đang tải dữ liệu...' : `Máy ${selectedDevice} chưa có lượt Reg`}</td></tr> : rows.map((row, index) => {
          const meta = CLAIM_STATUS[row.status] || { label:row.status || '-', color:'#64748b', bg:'rgba(100,116,139,.12)' };
          return <tr key={row.id || ('fb-' + row.facebook_account_id)} style={selectedUids.has(row.facebook_uid) ? { background:'rgba(14,165,233,.06)' } : undefined}>
            <td><input type="checkbox" aria-label={'Chọn ' + row.facebook_uid} checked={selectedUids.has(row.facebook_uid)} disabled={resettingBulk} onChange={() => toggleSelected(row.facebook_uid)} /></td>
            <td style={{ color:'#94a3b8' }}>{(page - 1) * limit + index + 1}</td>
            <td><strong style={{ color:'#2563eb' }}>{row.facebook_uid || '-'}</strong></td>
            <td><strong style={{ color:row.instagram_uid ? '#db2777' : '#94a3b8' }}>{row.instagram_uid || 'Chưa báo cáo'}</strong></td>
            <td><span className="ig-fb-claim-status" style={{ color:meta.color, background:meta.bg }}>{meta.label}</span></td>
            <td style={{ color:Number(row.get_count) >= 3 ? '#dc2626' : '#7c3aed', fontWeight:850 }}>{number(row.get_count)}</td>
            <td title={row.email_order_id || ''}>{short(row.email_order_id, 20)}</td>
            <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmt(row.locked_at)}</td>
            <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmt(row.created_at)}</td>
            <td style={{ whiteSpace:'nowrap', color:row.completed_at ? '#059669' : '#94a3b8' }}>{fmt(row.completed_at)}</td>
            <td style={{ whiteSpace:'nowrap' }}>{row.eligibility_reset_at ? <span className="ig-fb-claim-status" style={{ color:'#0284c7', background:'rgba(14,165,233,.11)' }}>Đã reset {fmt(row.eligibility_reset_at)}</span> : row.can_reset ? <span style={{ color:'#7c3aed', fontWeight:750 }}>Đang tính limit</span> : '-'}</td>
            <td title={row.fail_reason || ''} style={{ color:row.fail_reason ? '#dc2626' : '#94a3b8', maxWidth:260 }}>{short(row.fail_reason, 44)}</td>
            <td>{row.can_reset ? <button type="button" className="btn btn-secondary btn-sm" disabled={resettingId === row.id} onClick={() => resetEligibility(row)}>{resettingId === row.id ? 'Đang reset...' : 'Reset mở lại'}</button> : '-'}</td>
          </tr>;
        })}
      </tbody></table></div>
    </div>}
    <Pagination pagination={pagination} onPageChange={setPage} itemLabel={view === 'machines' ? 'máy' : 'account'} />
  </section>;
}