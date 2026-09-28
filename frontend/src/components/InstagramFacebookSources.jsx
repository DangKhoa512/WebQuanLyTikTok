import { useCallback, useEffect, useState } from 'react';
import { instagramApi } from '../services/api';
import Pagination from './Pagination';
import { toast } from './Toast';

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12:false }) : '-';
const num = (value) => Number(value || 0).toLocaleString('vi-VN');
const STATUS_LABELS = { CHO_LOGIN:'Chờ login', DANG_LOGIN:'Đang login', LOGIN_THANH_CONG:'Login thành công', DANG_LAM:'Đang làm', DA_CHAY_XONG:'Đã xong', LOGIN_FAIL:'Login fail', ACCOUNT_DIE:'Account die' };

export default function InstagramFacebookSources() {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ field:'last_reported_at', direction:'desc' });
  const [loading, setLoading] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await instagramApi.getFacebookInstagramSources({ page, limit, q:q.trim() || undefined, sort_by:sort.field, sort_order:sort.direction });
      setSources(response.data?.sources || []);
      setPagination(response.data?.pagination || null);
    } catch (error) { toast.error(error.message || 'Không tải được danh sách Facebook chứa Instagram'); }
    finally { setLoading(false); }
  }, [page, limit, q, sort]);

  useEffect(() => { if (!selected) loadSources(); }, [selected, loadSources]);

  const openSource = async (source) => {
    setSelected(source);
    setLoading(true);
    try {
      const response = await instagramApi.getFacebookInstagramAccounts(source.facebook_uid);
      setDetails(response.data?.instagram_accounts || []);
    } catch (error) {
      toast.error(error.message || 'Không tải được Instagram username');
      setSelected(null);
    } finally { setLoading(false); }
  };
  const sortHeader = (field, label) => <th><button type="button" className={'ig-fb-source-sort' + (sort.field === field ? ' active' : '')} onClick={() => { setSort((current) => ({ field, direction:current.field === field && current.direction === 'asc' ? 'desc' : 'asc' })); setPage(1); }}><span>{label}</span><span>{sort.field === field ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>;

  if (selected) return <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:'1rem' }}>
    <div className="card-header" style={{ gap:'.75rem', flexWrap:'wrap' }}>
      <div><h3>🔗 Instagram của Facebook UID {selected.facebook_uid}</h3><div style={{ color:'#64748b', fontSize:'.78rem', marginTop:'.2rem' }}>Máy: {selected.device_id || '-'} · {details.length} Instagram username</div></div>
      <div style={{ display:'flex', gap:'.5rem' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelected(null); setDetails([]); }}>← Danh sách Facebook UID</button><button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => openSource(selected)}>Làm mới</button></div>
    </div>
    <div style={{ overflowX:'auto' }}><table className="data-table"><thead><tr><th>STT</th><th>INSTAGRAM USERNAME</th><th>TRẠNG THÁI JOB</th><th>LIVE</th><th>POST</th><th>FOLLOWERS</th><th>FOLLOWING</th><th>MÁY IG</th><th>LẦN BÁO CÁO</th><th>BÁO CÁO ĐẦU</th><th>BÁO CÁO CUỐI</th></tr></thead><tbody>
      {!details.length ? <tr><td colSpan={11} style={{ textAlign:'center', color:'#94a3b8', padding:34 }}>{loading ? 'Đang tải...' : 'Facebook UID chưa có Instagram username'}</td></tr> : details.map((link, index) => { const account=link.account; return <tr key={link.id}>
        <td style={{ color:'#94a3b8' }}>{index + 1}</td><td><strong style={{ color:'#db2777' }}>@{link.instagram_uid}</strong></td><td>{account ? STATUS_LABELS[account.status] || account.status : 'Chưa có trong Instagram Job'}</td><td style={{ color:account?.live_status === 'live' ? '#059669' : account?.live_status === 'die' ? '#dc2626' : '#94a3b8', fontWeight:800 }}>{account?.live_status || 'unknown'}</td><td>{account?.post_count ?? '-'}</td><td>{account?.followers ?? '-'}</td><td>{account?.following ?? '-'}</td><td>{account?.device_id || '-'}</td><td style={{ color:'#7c3aed', fontWeight:800 }}>{num(link.report_count)}</td><td style={{ whiteSpace:'nowrap' }}>{fmt(link.first_reported_at)}</td><td style={{ whiteSpace:'nowrap' }}>{fmt(link.last_reported_at)}</td>
      </tr>; })}
    </tbody></table></div>
  </div>;

  return <div>
    <style>{`.ig-fb-source-sort{display:inline-flex;align-items:center;gap:.3rem;border:0;background:transparent;padding:0;color:inherit;font:inherit;font-weight:inherit;cursor:pointer;white-space:nowrap}.ig-fb-source-sort span:last-child{color:#94a3b8;font-size:.68rem}.ig-fb-source-sort.active span:last-child{color:#db2777}.ig-fb-source-row{cursor:pointer}.ig-fb-source-row:hover{background:rgba(236,72,153,.045)}`}</style>
    <div className="card" style={{ marginBottom:'1rem', overflow:'visible' }}><div className="filter-bar" style={{ margin:0, boxShadow:'none' }}><div className="filter-row">
      <div className="filter-group" style={{ minWidth:260, flex:'1 1 320px' }}><label>Tìm Facebook UID / Máy</label><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Facebook UID, May1..." /></div>
      <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>{[20,50,100].map((value) => <option key={value} value={value}>{value} dòng</option>)}</select></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setPage(1); setLimit(20); setSort({ field:'last_reported_at', direction:'desc' }); }}>Xóa bộ lọc</button><button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={loadSources}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
    </div></div></div>
    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-header"><div><h3>📘 Facebook UID chứa Instagram</h3><div style={{ color:'#64748b', fontSize:'.78rem', marginTop:'.2rem' }}>Mỗi Facebook UID một hàng · Bấm vào số lượng để xem username</div></div><span style={{ color:'#64748b', fontSize:'.8rem' }}>{num(pagination?.total)} Facebook UID</span></div>
      <div style={{ overflowX:'auto' }}><table className="data-table"><thead><tr><th>STT</th>{sortHeader('facebook_uid','FACEBOOK UID')}{sortHeader('device_id','MÁY')}{sortHeader('instagram_count','SỐ IG')}{sortHeader('report_count','LẦN BÁO CÁO')}<th>BÁO CÁO ĐẦU</th>{sortHeader('last_reported_at','BÁO CÁO CUỐI')}</tr></thead><tbody>
        {!sources.length ? <tr><td colSpan={7} style={{ textAlign:'center', color:'#94a3b8', padding:36 }}>{loading ? 'Đang tải...' : 'Chưa có báo cáo Facebook UID chứa Instagram'}</td></tr> : sources.map((source,index)=><tr key={source.facebook_uid} className="ig-fb-source-row" onClick={()=>openSource(source)}><td style={{ color:'#94a3b8' }}>{(page-1)*limit+index+1}</td><td><strong style={{ color:'#2563eb' }}>{source.facebook_uid}</strong></td><td>{source.device_id || '-'}</td><td><button type="button" className="btn btn-sm" style={{ background:'#fce7f3', color:'#be185d', border:'1px solid #fbcfe8', fontWeight:900 }} onClick={(event)=>{event.stopPropagation();openSource(source);}}>IG {num(source.instagram_count)}</button></td><td style={{ color:'#7c3aed', fontWeight:800 }}>{num(source.report_count)}</td><td style={{ whiteSpace:'nowrap' }}>{fmt(source.first_reported_at)}</td><td style={{ whiteSpace:'nowrap', color:'#059669' }}>{fmt(source.last_reported_at)}</td></tr>)}
      </tbody></table></div>
    </div>
    <Pagination pagination={pagination} onPageChange={setPage} itemLabel="Facebook UID" />
  </div>;
}