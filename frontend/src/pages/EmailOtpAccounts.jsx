import { useCallback, useEffect, useMemo, useState } from 'react';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { emailOtpApi } from '../services/api';

const TABS = [
  { value: '', label: 'Tất cả', icon: '📋', color: '#475569' },
  { value: 'PENDING', label: 'Pending', icon: '⏳', color: '#10b981' },
  { value: 'PAUSED', label: 'Tạm dừng', icon: '⏸️', color: '#f59e0b' },
  { value: 'DONE', label: 'Đã đóng', icon: '✅', color: '#64748b' },
];
const STATUS_META = {
  PENDING: { label: 'Pending', bg: '#d1fae5', color: '#047857' },
  PAUSED: { label: 'Tạm dừng', bg: '#fef3c7', color: '#b45309' },
  DONE: { label: 'Đã đóng', bg: '#e2e8f0', color: '#475569' },
};
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const short = (value, length = 28) => {
  const text = String(value || '');
  return text.length > length ? text.slice(0, length) + '…' : text || '—';
};
const totalCounts = (counts) => Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

function AddEmailModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ site: 'SHOPMAILMMO', gmail: '', id_oder: '', otp_history: '', device_id: '' });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.site.trim() || !form.gmail.trim() || !form.id_oder.trim()) return toast.error('Cần nhập Site, Gmail và ID order');
    setSaving(true);
    try {
      const res = await emailOtpApi.create(form);
      toast.success(res.message);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.62)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ width: 'min(620px, 100%)', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div><h3 style={{ margin: 0 }}>✉️ Thêm Email OTP</h3><div className="subtitle">Email mới được lưu ở trạng thái Pending.</div></div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <div className="filter-row">
          <div className="filter-group"><label>Site</label><input value={form.site} onChange={(e) => set('site', e.target.value)} placeholder="SHOPMAILMMO" /></div>
          <div className="filter-group"><label>Máy mua email</label><input value={form.device_id} onChange={(e) => set('device_id', e.target.value)} placeholder="May1" /></div>
        </div>
        <div className="filter-row">
          <div className="filter-group" style={{ flex: 1 }}><label>Gmail</label><input value={form.gmail} onChange={(e) => set('gmail', e.target.value)} placeholder="example@gmail.com" /></div>
          <div className="filter-group" style={{ flex: 1 }}><label>ID order</label><input value={form.id_oder} onChange={(e) => set('id_oder', e.target.value)} placeholder="TUPEKIPAYCVKNRML" /></div>
        </div>
        <div className="filter-row">
          <div className="filter-group" style={{ flex: 1 }}><label>OTP ban đầu</label><input value={form.otp_history} onChange={(e) => set('otp_history', e.target.value)} placeholder="127412" /></div>
          <div style={{ alignSelf: 'end', color: '#64748b', fontSize: '.78rem', paddingBottom: 10 }}>Số lần tự động cộng theo mỗi báo cáo.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu Email'}</button>
        </div>
      </div>
    </div>
  );
}

export default function EmailOtpAccounts() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const params = useMemo(() => ({ page, limit, status, q }), [page, limit, status, q]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emailOtpApi.getAll(params);
      setRows(res.data?.emails || []);
      setCounts(res.data?.status_counts || {});
      setPagination(res.data?.pagination || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const ids = [...selected];
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const resetSelection = () => setSelected(new Set());
  const changeFilter = (setter, value) => { setter(value); setPage(1); resetSelection(); };
  const toggleOne = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((current) => {
    const next = new Set(current);
    if (allChecked) rows.forEach((row) => next.delete(row.id)); else rows.forEach((row) => next.add(row.id));
    return next;
  });
  const updateStatus = async (nextStatus) => {
    if (!ids.length) return;
    try {
      const res = await emailOtpApi.bulkStatus(ids, nextStatus);
      toast.success(res.message);
      resetSelection();
      fetchData();
    } catch (err) { toast.error(err.message); }
  };
  const remove = async () => {
    if (!ids.length || !confirm(`Xóa vĩnh viễn ${ids.length} Email OTP?`)) return;
    try {
      const res = await emailOtpApi.bulkDelete(ids);
      toast.success(res.message);
      resetSelection();
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="page">
      <style>{`.email-otp-row:hover{background:#f8fafc}.email-otp-row.selected{background:#ecfdf5}.otp-code{white-space:pre-line;font-family:monospace;color:#7c3aed;font-weight:700}`}</style>
      <div className="page-header">
        <div><h1>✉️ Email OTP <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 500 }}>Email dùng lại</span></h1><div className="subtitle">Mỗi máy chỉ nhận một email đúng một lần; email Pending vẫn được cấp cho máy khác.</div></div>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-success btn-sm" onClick={() => setShowAdd(true)}>＋ Thêm Email</button><button className="btn btn-secondary btn-sm" onClick={fetchData}>🔄 Làm mới</button></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {TABS.map((tab) => <button key={tab.value || 'all'} onClick={() => changeFilter(setStatus, tab.value)} className="btn btn-sm" style={{ background: status === tab.value ? tab.color : '#fff', color: status === tab.value ? '#fff' : '#334155', border: '1px solid #cbd5e1' }}>{tab.icon} {tab.label} ({tab.value ? counts[tab.value] || 0 : totalCounts(counts)})</button>)}
      </div>

      <div className="card" style={{ marginBottom: 14 }}><div className="filter-bar"><div className="filter-row">
        <div className="filter-group" style={{ flex: '1 1 320px' }}><label>Tìm Gmail / order / site / máy</label><input value={q} onChange={(e) => changeFilter(setQ, e.target.value)} placeholder="silasasare368@gmail.com, SHOPMAILMMO, May1..." /></div>
        <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); resetSelection(); }}>{[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} dòng</option>)}</select></div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus(''); setPage(1); resetSelection(); }}>Xóa lọc</button>
      </div></div></div>

      {ids.length > 0 && <div style={{ background: '#0f172a', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}><strong style={{ color: '#fff' }}>{ids.length} email đã chọn</strong><button className="btn btn-success btn-sm" onClick={() => updateStatus('PENDING')}>Đặt Pending</button><button className="btn btn-warning btn-sm" onClick={() => updateStatus('PAUSED')}>Tạm dừng</button><button className="btn btn-secondary btn-sm" onClick={() => updateStatus('DONE')}>Đã đóng</button><button className="btn btn-danger btn-sm" onClick={remove}>Xóa</button><button className="btn btn-secondary btn-sm" onClick={resetSelection}>Bỏ chọn</button></div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header"><h3>Danh sách Email OTP</h3><span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} email {loading ? '• đang tải...' : ''}</span></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th><th>STT</th><th>Site</th><th>Gmail</th><th>ID order</th><th>OTP history</th><th>Số lần</th><th>Máy đã dùng</th><th>Đang lock</th><th>Trạng thái</th><th>Cập nhật cuối</th></tr></thead><tbody>
          {!rows.length ? <tr><td colSpan="11" style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>Chưa có dữ liệu Email OTP</td></tr> : rows.map((row, index) => {
            const meta = STATUS_META[row.status] || STATUS_META.PENDING;
            return <tr key={row.id} className={`email-otp-row${selected.has(row.id) ? ' selected' : ''}`}><td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td><td>{(page - 1) * limit + index + 1}</td><td><strong>{row.site}</strong></td><td title={row.gmail}><strong>{short(row.gmail, 30)}</strong></td><td title={row.order_id}>{short(row.order_id, 20)}</td><td className="otp-code">{short(row.otp_history, 32)}</td><td><strong style={{ color: '#2563eb', fontSize: '.95rem' }}>{row.solan}</strong></td><td title={row.used_devices || ''}><strong>{row.used_device_count || 0}</strong><div style={{ color: '#64748b', fontSize: '.72rem', marginTop: 2 }}>{short(row.used_devices, 28)}</div></td><td>{row.locked_by ? <><strong style={{ color: '#7c3aed' }}>🔒 {row.locked_by}</strong><div style={{ color: '#64748b', fontSize: '.72rem' }}>{fmt(row.locked_at)}</div></> : '—'}</td><td><span style={{ display: 'inline-block', borderRadius: 7, padding: '4px 8px', background: meta.bg, color: meta.color, fontWeight: 800, whiteSpace: 'nowrap' }}>{meta.label}</span></td><td style={{ whiteSpace: 'nowrap' }}>{fmt(row.updated_at)}</td></tr>;
          })}
        </tbody></table></div>
      </div>
      <Pagination pagination={pagination} itemLabel="email" onPageChange={(next) => { setPage(next); resetSelection(); }} />
      {showAdd && <AddEmailModal onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  );
}