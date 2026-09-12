import { useCallback, useEffect, useMemo, useState } from 'react';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { hotmailApi } from '../services/api';
import { copyText } from '../services/clipboard';

const STATUS_TABS = [
  { value: '', icon: '📋', label: 'Tất cả', color: '#64748b' },
  { value: 'CHUA_SU_DUNG', icon: '📥', label: 'Chưa sử dụng', color: '#06b6d4' },
  { value: 'DANG_SU_DUNG', icon: '🔒', label: 'Đang dùng', color: '#8b5cf6' },
  { value: 'DA_SU_DUNG', icon: '✅', label: 'Đã sử dụng', color: '#10b981' },
];
const STATUS_META = Object.fromEntries(STATUS_TABS.filter((tab) => tab.value).map((tab) => [tab.value, tab]));
const STATUS_COLOR = {
  CHUA_SU_DUNG: { bg: 'rgba(6,182,212,.15)', color: '#0891b2' },
  DANG_SU_DUNG: { bg: 'rgba(139,92,246,.15)', color: '#7c3aed' },
  DA_SU_DUNG: { bg: 'rgba(16,185,129,.15)', color: '#059669' },
};
const fmt = (value) => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—';
const short = (value, len = 28) => {
  const text = String(value || '');
  return text.length > len ? text.slice(0, len) + '...' : text || '—';
};
const totalFromCounts = (counts) => Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

function ImportModal({ onClose, onImported }) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const lineCount = text.trim().split('\n').filter((line) => line.trim()).length;
  const handleImport = async () => {
    if (!text.trim()) return toast.error('Nhập hotmail trước');
    setImporting(true);
    try {
      const res = await hotmailApi.import(text);
      toast.success(res.message);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '620px', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>📧 Import Hotmail</h3>
            <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: '.35rem' }}>Mỗi dòng: email|password</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="example@hotmail.com|password" style={{ width: '100%', height: 270, resize: 'vertical', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontFamily: 'monospace' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>{lineCount} dòng</span>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Đóng</button>
          <button className="btn btn-primary" disabled={importing} onClick={handleImport}>📥 {importing ? 'Đang import...' : 'Import'}</button>
        </div>
      </div>
    </div>
  );
}

export default function HotmailAccounts() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [copying, setCopying] = useState(false);
  const params = useMemo(() => ({ page, limit, status, q }), [page, limit, status, q]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hotmailApi.getAll(params);
      setRows(res.data?.accounts || []);
      setStatusCounts(res.data?.status_counts || {});
      setPagination(res.data?.pagination || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedIds = [...selected];
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const totalCount = totalFromCounts(statusCounts);
  const rowOffset = (page - 1) * limit;
  const resetSelection = () => setSelected(new Set());
  const setFilter = (setter, value) => { setter(value); setPage(1); resetSelection(); };
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allChecked) rows.forEach((row) => next.delete(row.id));
    else rows.forEach((row) => next.add(row.id));
    return next;
  });
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const handleCopy = async () => {
    if (!selectedIds.length) return toast.warn('Chọn hotmail cần copy');
    setCopying(true);
    try {
      const res = await hotmailApi.bulkGet(selectedIds);
      await copyText(res.data?.text || '');
      toast.success('Đã copy ' + (res.data?.count || selectedIds.length) + ' hotmail');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCopying(false);
    }
  };
  const handleDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm('Xóa ' + selectedIds.length + ' hotmail?')) return;
    try {
      const res = await hotmailApi.bulkDelete(selectedIds);
      toast.success(res.message);
      resetSelection();
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page">
      <style>{'.hotmail-row:hover{background:rgba(6,182,212,.05)!important}.hotmail-row.row-selected{background:rgba(6,182,212,.08)!important}'}</style>
      <div className="page-header">
        <div>
          <h1>📧 Hotmail <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>Mail pool</span></h1>
          <div className="subtitle">Quản lý hotmail, khóa lock theo máy và chuyển sang đã sử dụng sau khi máy báo.</div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={() => setShowImport(true)} style={{ background: '#06b6d4', border: 'none', color: '#fff', borderRadius: '8px', padding: '.55rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '.875rem' }}>📥 Import</button>
          <button onClick={fetchData} disabled={loading} className="btn btn-secondary btn-sm">🔄 Làm mới</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button key={tab.value || 'ALL'} onClick={() => setFilter(setStatus, tab.value)} style={{ background: status === tab.value ? tab.color : 'rgba(255,255,255,.06)', color: status === tab.value ? '#fff' : '#94a3b8', border: status === tab.value ? 'none' : '1px solid rgba(255,255,255,.1)', borderRadius: '8px', padding: '.4rem .85rem', cursor: 'pointer', fontWeight: status === tab.value ? 700 : 400, fontSize: '.82rem', whiteSpace: 'nowrap' }}>
            {tab.icon} {tab.label} {tab.value ? '(' + (statusCounts[tab.value] || 0) + ')' : '(' + totalCount + ')'}
          </button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar"><div className="filter-row">
          <div className="filter-group" style={{ minWidth: 260, flex: '1 1 280px' }}>
            <label>Tìm email / máy</label>
            <input type="text" placeholder="email, May1..." value={q} onChange={(e) => setFilter(setQ, e.target.value)} />
          </div>
          <div className="filter-group"><label>Số dòng</label><select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); resetSelection(); }}>{[20, 50, 100, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} dòng</option>)}</select></div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setStatus(''); setPage(1); resetSelection(); }}>✕ Xóa bộ lọc</button>
        </div></div>
      </div>
      <div style={{ background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem', marginBottom: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#94a3b8', fontSize: '.85rem' }}>🔒 Lock timeout</span><b style={{ color: '#6ee7b7' }}>30 phút</b><div style={{ flex: 1 }} />
        {selectedIds.length > 0 && <button onClick={handleCopy} disabled={copying} className="btn btn-success btn-sm">📋 {copying ? 'Đang copy...' : 'Copy hotmail'}</button>}
        {selectedIds.length > 0 && <button onClick={handleDelete} className="btn btn-danger btn-sm">🗑️ Xóa</button>}
        {selectedIds.length > 0 && <button onClick={resetSelection} className="btn btn-secondary btn-sm">✕ Bỏ chọn</button>}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header"><h3>📋 Danh sách hotmail</h3><span style={{ color: '#64748b', fontSize: '.8rem' }}>{pagination?.total || 0} hotmail {loading ? '• đang tải...' : ''}</span></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th><th>STT</th><th>Email</th><th>Password</th><th>Trạng thái</th><th>Máy</th><th>Lock</th><th>Đã dùng lúc</th><th>Ngày tạo</th></tr></thead><tbody>
          {rows.length === 0 ? <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>Chưa có hotmail</td></tr> : rows.map((row, idx) => {
            const sc = STATUS_COLOR[row.status] || { bg: 'rgba(100,116,139,.1)', color: '#64748b' };
            const meta = STATUS_META[row.status];
            return <tr key={row.id} className={'hotmail-row' + (selected.has(row.id) ? ' row-selected' : '')}><td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td><td style={{ color: '#94a3b8' }}>{rowOffset + idx + 1}</td><td><strong>{row.email}</strong></td><td title={row.password || ''}>{short(row.password, 22)}</td><td><span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{meta?.icon} {meta?.label || row.status}</span></td><td>{row.device_id || '—'}</td><td>{row.locked_by ? '🔒 ' + row.locked_by + ' - ' + fmt(row.locked_at) : '—'}</td><td>{fmt(row.used_at)}</td><td>{fmt(row.created_at)}</td></tr>;
          })}
        </tbody></table></div>
      </div>
      <Pagination pagination={pagination} onPageChange={(next) => { setPage(next); resetSelection(); }} />
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={fetchData} />}
    </div>
  );
}
