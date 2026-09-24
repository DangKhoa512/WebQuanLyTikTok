import { useCallback, useEffect, useMemo, useState } from 'react';
import { facebookApi, instagramApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';

const TABS = [
  { value: '', label: 'Tất cả', color: '#64748b' },
  { value: 'CHUA_NUOI', label: 'Chưa nuôi', color: '#0ea5e9' },
  { value: 'DANG_NUOI', label: 'Đang nuôi', color: '#8b5cf6' },
  { value: 'DA_NUOI', label: 'Đã nuôi', color: '#10b981' },
  { value: 'NUOI_FAIL', label: 'Nuôi fail', color: '#ef4444' },
];

const STATUS_STYLE = {
  CHUA_NUOI: { label: 'Chưa nuôi', color: '#0284c7', bg: 'rgba(14,165,233,.14)' },
  DANG_NUOI: { label: 'Đang nuôi', color: '#7c3aed', bg: 'rgba(139,92,246,.14)' },
  DA_NUOI: { label: 'Đã nuôi', color: '#059669', bg: 'rgba(16,185,129,.14)' },
  NUOI_FAIL: { label: 'Nuôi fail', color: '#dc2626', bg: 'rgba(239,68,68,.14)' },
};

const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const short = (value, max = 24) => {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) + '...' : text || '-';
};

export default function FacebookNurture() {
  const [platform, setPlatform] = useState('facebook');
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState(null);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [resetting, setResetting] = useState(false);

  const platformApi = platform === 'instagram' ? instagramApi : facebookApi;
  const platformName = platform === 'instagram' ? 'Instagram' : 'Facebook';
  const params = useMemo(() => ({ page, limit, status, q }), [page, limit, status, q]);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountRes, logRes] = await Promise.all([
        platformApi.getNurtureAccounts(params),
        platformApi.getNurtureLogs({ page: 1, limit: 20 }),
      ]);
      setRows(accountRes.data?.accounts || []);
      setCounts(accountRes.data?.status_counts || {});
      setPagination(accountRes.data?.pagination || null);
      setCooldownHours(accountRes.data?.cooldown_hours || 24);
      setLogs(logRes.data?.logs || []);
    } catch (err) {
      toast.error(err.message || `Không tải được dữ liệu ${platformName} Nuôi`);
    } finally {
      setLoading(false);
    }
  }, [params, platform, platformApi, platformName]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setSelected(new Set()); }, [page, limit, status, q, platform]);
  const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const selectedIds = [...selected];
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () => setSelected((current) => {
    const next = new Set(current);
    if (allChecked) rows.forEach((row) => next.delete(row.id));
    else rows.forEach((row) => next.add(row.id));
    return next;
  });
  const toggleOne = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const handleResetNurture = async () => {
    if (!selectedIds.length) return toast.warn('Chọn account cần reset trạng thái nuôi');
    const hasRunning = rows.some((row) => selected.has(row.id) && row.nurture_status === 'DANG_NUOI');
    const warning = hasRunning
      ? '\nCó account đang nuôi. Phiên đang chạy sẽ bị hủy lock và báo cáo cũ không còn được nhận.'
      : '';
    if (!confirm('Reset ' + selectedIds.length + ' account về Chưa nuôi?' + warning + '\nLịch sử và tổng số lần nuôi vẫn được giữ lại.')) return;
    setResetting(true);
    try {
      const res = await platformApi.resetNurtureAccounts(selectedIds);
      toast.success(res.message || 'Đã reset trạng thái nuôi');
      setSelected(new Set());
      await fetchData();
    } catch (err) {
      toast.error(err.message || 'Reset trạng thái nuôi thất bại');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🌱 {platformName} Nuôi</h1>
          <div className="subtitle">Chỉ lấy account {platformName} Job đã login thành công, khóa theo máy và theo dõi từng phiên nuôi.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
          {loading ? 'Đang tải...' : '🔄 Làm mới'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {['facebook','instagram'].map((item) => <button key={item} type="button" className="btn btn-sm" onClick={() => { setPlatform(item); setStatus(''); setPage(1); setSelected(new Set()); }} style={{ background: platform === item ? '#10b981' : '#fff', color: platform === item ? '#fff' : '#334155', border: `1px solid ${platform === item ? '#10b981' : '#cbd5e1'}`, fontWeight: 800 }}>{item === 'facebook' ? 'Facebook' : 'Instagram'}</button>)}
      </div>

      <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {TABS.map((tab) => {
          const count = tab.value ? (counts[tab.value] || 0) : total;
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className="btn btn-sm"
              style={{ background: active ? tab.color : '#fff', color: active ? '#fff' : '#334155', border: `1px solid ${active ? tab.color : '#cbd5e1'}`, fontWeight: 800 }}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
          <label className="filter-group">
            <span>Tìm UID / Mail / Máy</span>
            <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="UID, email, May1..." />
          </label>
          <label className="filter-group">
            <span>Số dòng</span>
            <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              {[20, 50, 100, 500].map((item) => <option key={item} value={item}>{item} dòng</option>)}
            </select>
          </label>
          <div style={{ color: '#475569', fontSize: '.82rem', paddingBottom: '.55rem' }}>
            Nuôi lại sau: <b>{cooldownHours} giờ</b>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <div className="card-header">
          <h3>Danh sách account nuôi</h3>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} account</span>
        </div>
        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', padding: '.7rem 1rem', background: '#0f172a', color: '#fff' }}>
            <strong>{selectedIds.length} account đã chọn</strong>
            <button type="button" className="btn btn-warning btn-sm" disabled={resetting} onClick={handleResetNurture}>{resetting ? 'Đang reset...' : '↻ Reset trạng thái nuôi'}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={resetting} onClick={() => setSelected(new Set())}>Bỏ chọn</button>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th><th>STT</th><th>UID</th><th>MÁY</th><th>JOB</th><th>NUÔI</th><th>KỊCH BẢN</th><th>TỔNG LẦN</th><th>LẦN CUỐI</th><th>LOCK NUÔI</th><th>COOKIES</th></tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>Chưa có account {platformName} Nuôi</td></tr>
              ) : rows.map((row, index) => {
                const current = STATUS_STYLE[row.nurture_status] || STATUS_STYLE.CHUA_NUOI;
                return (
                  <tr key={row.id}>
                    <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td>
                    <td>{(page - 1) * limit + index + 1}</td>
                    <td><strong>{row.uid}</strong></td>
                    <td>{row.device_id || '-'}</td>
                    <td>{row.status || '-'}</td>
                    <td><span style={{ color: current.color, background: current.bg, borderRadius: 6, padding: '.22rem .5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{current.label}</span></td>
                    <td title={row.nurture_scenario_id || ''}>{short(row.nurture_scenario_id)}</td>
                    <td style={{ fontWeight: 800 }}>{row.nurture_count || 0}</td>
                    <td>{fmt(row.last_nurture_at)}</td>
                    <td>{row.nurture_locked_by ? `${row.nurture_locked_by} - ${fmt(row.nurture_locked_at)}` : '-'}</td>
                    <td title={row.cookies || ''}>{short(row.cookies, 30)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination pagination={pagination} onPageChange={setPage} />

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '1rem' }}>
        <div className="card-header"><h3>20 báo cáo nuôi gần nhất</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>UID</th><th>MÁY</th><th>KỊCH BẢN</th><th>KẾT QUẢ</th><th>THỜI GIAN</th><th>HOÀN THÀNH</th><th>GHI CHÚ</th></tr></thead>
            <tbody>
              {!logs.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Chưa có báo cáo nuôi</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.uid}</strong></td><td>{log.device_id}</td><td>{short(log.scenario_id)}</td>
                  <td style={{ color: log.status === 'DA_NUOI' ? '#059669' : '#dc2626', fontWeight: 800 }}>{log.status === 'DA_NUOI' ? 'Đã nuôi' : 'Nuôi fail'}</td>
                  <td>{Math.round((Number(log.duration_seconds) || 0) / 60)} phút</td><td>{fmt(log.completed_at)}</td><td>{short(log.message, 40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}