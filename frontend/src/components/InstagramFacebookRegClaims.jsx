import { useCallback, useEffect, useMemo, useState } from 'react';
import { instagramApi } from '../services/api';
import Pagination from './Pagination';
import { toast } from './Toast';

const CLAIM_STATUS = {
  DANG_REG: { label: 'Đang reg', color: '#7c3aed', bg: 'rgba(124,58,237,.12)' },
  REG_XONG: { label: 'Reg thành công', color: '#059669', bg: 'rgba(5,150,105,.12)' },
  REG_FAIL: { label: 'Reg thất bại', color: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  CANCELLED: { label: 'Đã hủy', color: '#64748b', bg: 'rgba(100,116,139,.12)' },
};

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
const short = (value, size = 32) => value ? (String(value).length > size ? `${String(value).slice(0, size)}...` : String(value)) : '-';
const number = (value) => Number(value || 0).toLocaleString('vi-VN');

function SummaryCard({ label, value, icon, color, active, onClick }) {
  return <button type="button" className="ig-fb-claim-summary" onClick={onClick} style={{ borderLeftColor:color, outline:active ? `2px solid ${color}` : 'none' }}>
    <span className="ig-fb-claim-summary-icon" style={{ color, background:`${color}18` }}>{icon}</span>
    <span><strong>{number(value)}</strong><small>{label}</small></span>
  </button>;
}

export default function InstagramFacebookRegClaims() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({});
  const [deviceCount, setDeviceCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ field:'created_at', direction:'desc' });
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => ({
    page,
    limit,
    status: status || undefined,
    q: q.trim() || undefined,
    sort_by: sort.field,
    sort_order: sort.direction,
  }), [page, limit, status, q, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await instagramApi.getFacebookRegClaims(params);
      setRows(response.data?.claims || []);
      setCounts(response.data?.status_counts || {});
      setDeviceCount(response.data?.device_count || 0);
      setPagination(response.data?.pagination || null);
    } catch (err) {
      toast.error(err.message || 'Không tải được lịch sử Reg IG bằng Facebook');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const filterStatus = (value) => { setStatus(value); setPage(1); };
  const clearFilters = () => { setQ(''); setStatus(''); setPage(1); setLimit(50); setSort({ field:'created_at', direction:'desc' }); };
  const sortHeader = (field, label) => <th><button type="button" className={'ig-fb-claim-sort' + (sort.field === field ? ' active' : '')} onClick={() => {
    setSort((current) => ({ field, direction:current.field === field && current.direction === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  }}><span>{label}</span><span>{sort.field === field ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>;

  return <section className="ig-fb-claims">
    <style>{`
      .ig-fb-claim-summary-grid { display:grid; grid-template-columns:repeat(5,minmax(150px,1fr)); gap:.8rem; margin-bottom:1rem; }
      .ig-fb-claim-summary { min-width:0; display:flex; align-items:center; gap:.75rem; text-align:left; padding:.9rem 1rem; border:1px solid #dbe3ee; border-left:4px solid; border-radius:11px; background:#fff; box-shadow:0 1px 3px rgba(15,23,42,.08); cursor:pointer; }
      .ig-fb-claim-summary:hover { transform:translateY(-1px); box-shadow:0 5px 14px rgba(15,23,42,.10); }
      .ig-fb-claim-summary-icon { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:9px; font-weight:900; font-size:.85rem; }
      .ig-fb-claim-summary strong { display:block; color:#0f172a; font-size:1.25rem; line-height:1.1; }
      .ig-fb-claim-summary small { display:block; color:#64748b; font-size:.68rem; font-weight:800; margin-top:.3rem; text-transform:uppercase; }
      .ig-fb-claim-sort { display:inline-flex; align-items:center; gap:.3rem; padding:0; border:0; background:transparent; color:inherit; font:inherit; font-weight:inherit; cursor:pointer; white-space:nowrap; }
      .ig-fb-claim-sort span:last-child { color:#94a3b8; font-size:.65rem; }
      .ig-fb-claim-sort.active span:last-child { color:#db2777; }
      .ig-fb-claim-status { display:inline-flex; align-items:center; border-radius:999px; padding:.25rem .55rem; font-size:.72rem; font-weight:800; white-space:nowrap; }
      .ig-fb-claim-table tbody tr:hover { background:rgba(236,72,153,.035); }
      @media (max-width:1100px) { .ig-fb-claim-summary-grid { grid-template-columns:repeat(3,minmax(150px,1fr)); } }
      @media (max-width:700px) { .ig-fb-claim-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .ig-fb-claim-summary { padding:.7rem; } }
    `}</style>

    <div className="ig-fb-claim-summary-grid">
      <SummaryCard label="Tổng lượt reg" value={total} icon="IG" color="#db2777" active={!status} onClick={() => filterStatus('')} />
      <SummaryCard label="Đang reg" value={counts.DANG_REG} icon="RUN" color="#7c3aed" active={status === 'DANG_REG'} onClick={() => filterStatus('DANG_REG')} />
      <SummaryCard label="Reg thành công" value={counts.REG_XONG} icon="OK" color="#10b981" active={status === 'REG_XONG'} onClick={() => filterStatus('REG_XONG')} />
      <SummaryCard label="Reg thất bại" value={counts.REG_FAIL} icon="FAIL" color="#ef4444" active={status === 'REG_FAIL'} onClick={() => filterStatus('REG_FAIL')} />
      <SummaryCard label="Máy đã tham gia" value={deviceCount} icon="MÁY" color="#0ea5e9" active={false} onClick={() => {}} />
    </div>

    <div className="card" style={{ marginBottom:'1rem', overflow:'visible' }}>
      <div className="filter-bar" style={{ margin:0, boxShadow:'none' }}><div className="filter-row">
        <div className="filter-group" style={{ minWidth:260, flex:'1 1 320px' }}><label>Tìm máy / UID Facebook / tài khoản IG</label><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Reg4, UID Facebook, username IG..." /></div>
        <div className="filter-group"><label>Trạng thái lượt reg</label><select value={status} onChange={(event) => filterStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(CLAIM_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
        <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>{[20,50,100,200,500].map((value) => <option key={value} value={value}>{value} dòng</option>)}</select></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Xóa bộ lọc</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
      </div></div>
    </div>

    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <div className="card-header"><div><h3>🔗 Lượt Reg Instagram bằng Facebook</h3><div style={{ color:'#64748b', fontSize:'.76rem', marginTop:'.2rem' }}>Theo dõi máy đang giữ account Facebook và account Instagram đã tạo</div></div><span style={{ color:'#64748b', fontSize:'.8rem' }}>{number(pagination?.total)} lượt {loading ? '- đang tải...' : ''}</span></div>
      <div style={{ overflowX:'auto' }}><table className="data-table ig-fb-claim-table"><thead><tr>
        <th>STT</th>{sortHeader('device_id','MÁY')}{sortHeader('facebook_uid','UID FACEBOOK')}{sortHeader('instagram_uid','ACCOUNT IG')}{sortHeader('status','TRẠNG THÁI')}{sortHeader('get_count','LẦN GET')}<th>EMAIL ORDER</th>{sortHeader('locked_at','LOCK LÚC')}{sortHeader('created_at','BẮT ĐẦU')}{sortHeader('completed_at','HOÀN TẤT')}<th>GHI CHÚ / LỖI</th>
      </tr></thead><tbody>
        {!rows.length ? <tr><td colSpan={11} style={{ textAlign:'center', color:'#94a3b8', padding:38 }}>{loading ? 'Đang tải dữ liệu...' : 'Chưa có lượt Reg Instagram bằng Facebook'}</td></tr> : rows.map((row, index) => {
          const meta = CLAIM_STATUS[row.status] || { label:row.status || '-', color:'#64748b', bg:'rgba(100,116,139,.12)' };
          return <tr key={row.id}>
            <td style={{ color:'#94a3b8' }}>{(page - 1) * limit + index + 1}</td>
            <td><strong style={{ color:'#0f172a' }}>{row.device_id || '-'}</strong></td>
            <td><strong style={{ color:'#2563eb' }}>{row.facebook_uid || '-'}</strong></td>
            <td><strong style={{ color:row.instagram_uid ? '#db2777' : '#94a3b8' }}>{row.instagram_uid || 'Chưa báo cáo'}</strong></td>
            <td><span className="ig-fb-claim-status" style={{ color:meta.color, background:meta.bg }}>{meta.label}</span></td>
            <td style={{ color:Number(row.get_count) >= 3 ? '#dc2626' : '#7c3aed', fontWeight:850 }}>{number(row.get_count)}</td>
            <td title={row.email_order_id || ''}>{short(row.email_order_id, 20)}</td>
            <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmt(row.locked_at)}</td>
            <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmt(row.created_at)}</td>
            <td style={{ whiteSpace:'nowrap', color:row.completed_at ? '#059669' : '#94a3b8' }}>{fmt(row.completed_at)}</td>
            <td title={row.fail_reason || ''} style={{ color:row.fail_reason ? '#dc2626' : '#94a3b8', maxWidth:260 }}>{short(row.fail_reason, 44)}</td>
          </tr>;
        })}
      </tbody></table></div>
    </div>
    <Pagination pagination={pagination} onPageChange={setPage} itemLabel="lượt reg" />
  </section>;
}