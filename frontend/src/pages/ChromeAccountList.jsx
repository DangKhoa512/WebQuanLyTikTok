import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { chromeAccountApi } from '../services/api';
import Pagination from '../components/Pagination';
import { toast } from '../components/Toast';
import { loadCheckLiveSettings } from '../services/checkLiveSettings';
import { checkLiveInBatches } from '../services/checkLiveRunner';
import { copyText } from '../services/clipboard';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString('vi-VN');

const STATUS_TABS = [
  { value: '',                  label: '📋 Tất cả',          color: '#64748b' },
  { value: 'ACC_LOGIN',         label: '🔐 Chờ Login',       color: '#06b6d4' },
  { value: 'LOGIN_THANH_CONG',  label: '✅ Login Thành Công', color: '#10b981' },
  { value: 'ACC_DA_KHANG',      label: '🛡️ Đã Kháng',       color: '#8b5cf6' },
  { value: 'ACC_CHUA_KHANG',    label: '⚠️ Chưa Kháng',      color: '#f97316' },
  { value: 'ACC_DU_DK',         label: '🎯 Đủ ĐK',           color: '#22c55e' },
  { value: '__USED__',          label: '📦 Đã sử dụng',       color: '#0ea5e9', to: '/used-accounts?account_type=chrome' },
  { value: 'ACC_DIE',           label: '💀 Die',               color: '#6b7280' },
];

const STATUS_COLOR = {
  ACC_LOGIN:        { bg: 'rgba(6,182,212,.15)',   color: '#67e8f9'  },
  LOGIN_THANH_CONG: { bg: 'rgba(16,185,129,.15)',  color: '#6ee7b7'  },
  ACC_DA_KHANG:     { bg: 'rgba(139,92,246,.15)',  color: '#c4b5fd'  },
  ACC_CHUA_KHANG:   { bg: 'rgba(249,115,22,.15)',  color: '#fdba74'  },
  ACC_DU_DK:        { bg: 'rgba(34,197,94,.15)',   color: '#86efac'  },
  ACC_DIE:          { bg: 'rgba(107,114,128,.15)', color: '#9ca3af'  },
};

const LIVE_COLOR = { live: '#4ade80', die: '#f87171', unknown: '#94a3b8' };

// ── Chrome Bulk Bar ──────────────────────────────────────────────────────────
function ChromeBulkBar({ selected, onClear, onRefresh, onCheckLive, clChecking }) {
  const [busy,          setBusy]          = useState(false);
  const [promoting,     setPromoting]     = useState(false);
  const [statusPick,    setStatusPick]    = useState('');
  const [showStatusDlg, setShowStatusDlg] = useState(false);
  const ids = [...selected];

  const handleCopy = async () => {
    setBusy(true);
    try {
      const res = await chromeAccountApi.bulkGet(ids, 'pipe');
      await copyText(res.data?.text || '');
      toast.success(`Đã copy ${res.data?.count || ids.length} accounts`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleCopyAndMark = async () => {
    setBusy(true);
    try {
      const res = await chromeAccountApi.bulkGet(ids, 'pipe');
      await copyText(res.data?.text || '');
      await chromeAccountApi.bulkAction(ids, 'mark_used');
      toast.success(`Đã copy & đánh dấu ${res.data?.count || ids.length} accounts`);
      onClear(); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleMarkUsed = async () => {
    if (!confirm(`Đánh dấu ${ids.length} accounts là "Đã dùng"?`)) return;
    setBusy(true);
    try {
      const res = await chromeAccountApi.bulkAction(ids, 'mark_used');
      toast.success(res.message); onClear(); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleSetStatus = async () => {
    if (!statusPick) return;
    if (!confirm(`Đổi ${ids.length} accounts → ${statusPick}?`)) return;
    setBusy(true);
    try {
      const res = await chromeAccountApi.bulkAction(ids, 'set_status', { status: statusPick });
      toast.success(res.message); setShowStatusDlg(false); onClear(); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`⚠️ Xóa VĨNH VIỄN ${ids.length} accounts?\nHành động này không thể hoàn tác!`)) return;
    if (ids.length > 20 && !confirm(`Xác nhận lần 2: Xóa ${ids.length} accounts?`)) return;
    setBusy(true);
    try {
      const res = await chromeAccountApi.bulkDelete(ids);
      toast.success(res.message); onClear(); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await chromeAccountApi.promoteEligible(5, 20);
      toast.success(res.message);
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setPromoting(false); }
  };

  const anyBusy = busy || clChecking || promoting;

  const BB = ({ icon, label, onClick, color, extraDisabled }) => (
    <button onClick={onClick} disabled={anyBusy || extraDisabled} style={{
      background: color, border: 'none', color: '#fff',
      borderRadius: '7px', padding: '.4rem .85rem',
      cursor: anyBusy || extraDisabled ? 'not-allowed' : 'pointer',
      fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap',
      opacity: anyBusy || extraDisabled ? 0.65 : 1, transition: 'opacity .15s',
    }}>{icon} {label}</button>
  );

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100, background: '#1e293b', color: '#f8fafc',
      borderRadius: '10px', padding: '.75rem 1rem', marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)', animation: 'slideDown .2s ease',
    }}>
      <div style={{ background: '#06b6d4', borderRadius: '20px', padding: '.25rem .75rem', fontWeight: 700, fontSize: '.875rem' }}>
        ✓ {ids.length} đã chọn
      </div>
      <div style={{ flex: 1 }} />
      <BB icon="🔍" label={clChecking ? 'Đang check...' : 'Check Live'} onClick={() => onCheckLive(ids)} color="#0ea5e9" />
      <BB icon="🎯" label={promoting ? 'Đang chuyển...' : 'Chuyển đủ ĐK'} onClick={handlePromote} color="#22c55e" />
      <BB icon="📋" label="Copy"              onClick={handleCopy}        color="#3b82f6" />
      <BB icon="📋✅" label="Copy & Đánh dấu" onClick={handleCopyAndMark} color="#8b5cf6" />
      <BB icon="🏷️" label="Đánh dấu Đã dùng" onClick={handleMarkUsed}    color="#f59e0b" />
      <BB icon="🗑️" label="Xóa"              onClick={handleDelete}       color="#dc2626" />
      <div style={{ position: 'relative' }}>
        <BB icon="🔄" label="Đổi trạng thái" onClick={() => setShowStatusDlg((v) => !v)} color="#10b981" />
        {showStatusDlg && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: '#fff', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.15)',
            padding: '1rem', minWidth: '220px', zIndex: 200, color: '#0f172a',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '.5rem', fontSize: '.85rem' }}>Chọn trạng thái:</div>
            <select value={statusPick} onChange={(e) => setStatusPick(e.target.value)}
              style={{ width: '100%', padding: '.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '.75rem' }}>
              <option value="">-- Chọn --</option>
              {STATUS_TABS.filter((t) => t.value && !t.to).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button onClick={handleSetStatus} disabled={!statusPick || anyBusy} style={{ flex: 1, padding: '.5rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Xác nhận</button>
              <button onClick={() => setShowStatusDlg(false)} style={{ padding: '.5rem .75rem', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Huỷ</button>
            </div>
          </div>
        )}
      </div>
      <button onClick={onClear} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: '#94a3b8', borderRadius: '6px', padding: '.35rem .65rem', cursor: 'pointer', fontSize: '.8rem' }}>✕ Bỏ chọn</button>
    </div>
  );
}

// ── Chrome Toolbar (Promote) ─────────────────────────────────────────────────
function ChromeToolbar({ onRefresh, onCheckAll, checking }) {
  const settings   = loadCheckLiveSettings();
  const proxyCount = settings.proxies.split('\n').map((l) => l.trim()).filter(Boolean).length;

  return (
    <div style={{
      background: '#0f172a', borderRadius: '12px', padding: '.75rem 1.25rem',
      marginBottom: '1rem', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
        <span style={{ color: '#94a3b8' }}>🌐</span>
        <span style={{ color: proxyCount > 0 ? '#6ee7b7' : '#f87171', fontWeight: 600 }}>{proxyCount} proxy</span>
        <Link to="/proxy-settings" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '.78rem', background: 'rgba(59,130,246,.1)', borderRadius: '6px', padding: '.15rem .5rem', border: '1px solid rgba(59,130,246,.2)' }}>
          ⚙ Cài đặt
        </Link>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onCheckAll}
        disabled={checking}
        style={{
          background: '#0ea5e9', border: 'none', color: '#fff',
          borderRadius: '7px', padding: '.4rem .85rem',
          cursor: checking ? 'not-allowed' : 'pointer',
          fontSize: '.8rem', fontWeight: 700, whiteSpace: 'nowrap',
          opacity: checking ? 0.65 : 1,
        }}
      >
        🔍 {checking ? 'Đang check...' : 'Check live toàn bộ'}
      </button>
      <div style={{ fontSize: '.68rem', color: '#475569' }}>Điều kiện: ≥20 video + reg ≥ 5 ngày</div>
    </div>
  );
}

// ── Check Live Results ───────────────────────────────────────────────────────
function Chip({ color, label }) {
  return (
    <span style={{ background: `${color}22`, color, borderRadius: '12px', padding: '.2rem .65rem', fontSize: '.78rem', fontWeight: 700, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function CheckLiveResults({ results, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const { live, die, unknown, rows } = results;
  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', padding: '.75rem 1.25rem', borderBottom: expanded ? '1px solid #1e293b' : 'none' }}>
        <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>Kết quả Check Live:</span>
        <Chip color="#4ade80" label={`✓ ${live} live`} />
        <Chip color="#f87171" label={`✗ ${die} die`} />
        <Chip color="#94a3b8" label={`? ${unknown} unknown`} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded((v) => !v)} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', padding: '.2rem .6rem', cursor: 'pointer', fontSize: '.75rem' }}>
          {expanded ? '▲ Thu gọn' : '▼ Xem chi tiết'}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', padding: '.2rem .5rem', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
      </div>
      {expanded && rows.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
            <thead>
              <tr style={{ background: '#1e293b', position: 'sticky', top: 0 }}>
                {['#','Username','Kết quả','Followers','Following','Videos','Likes','Proxy'].map((h) => (
                  <th key={h} style={{ padding: '.4rem .6rem', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #334155' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #1e293b', background: i % 2 === 0 ? '#0f172a' : '#111827' }}>
                  <td style={{ padding: '.35rem .6rem', color: '#475569' }}>{r.id}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{r.username}</td>
                  <td style={{ padding: '.35rem .6rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '.75rem', color: LIVE_COLOR[r.result] || '#94a3b8' }}>
                      {r.result === 'live' ? '✓ live' : r.result === 'die' ? '✗ die' : '? unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(r.followers)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(r.following)}</td>
                  <td style={{ padding: '.35rem .6rem', color: r.videos > 0 ? '#6ee7b7' : '#e2e8f0' }}>{fmtNum(r.videos)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#e2e8f0' }}>{fmtNum(r.likes)}</td>
                  <td style={{ padding: '.35rem .6rem', color: '#475569', fontFamily: 'monospace', fontSize: '.7rem' }}>
                    {r.proxy === 'direct' ? '🌐 direct' : r.proxy?.split('@').pop() || r.proxy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }) {
  const [text,       setText]       = useState('');
  const [status,     setStatus]     = useState('ACC_LOGIN');
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);

  const handle = async () => {
    if (!text.trim()) { toast.error('Nhập dữ liệu trước'); return; }
    setImporting(true); setResult(null);
    try {
      const res = await chromeAccountApi.import(text, status);
      setResult(res.data);
      toast.success(res.message);
      onImported();
    } catch (e) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>📥 Import Chrome Accounts</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: '#94a3b8', fontSize: '.8rem', display: 'block', marginBottom: '.4rem' }}>Import vào status:</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '.5rem .75rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', width: '100%' }}>
            {STATUS_TABS.filter((t) => t.value && !t.to).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'user|pass|email|emailpass\nhay có datetime:\n16/05/2026 10:30:00\tuser|pass|email|emailpass'}
          rows={10}
          style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '.6rem .85rem', fontFamily: 'monospace', fontSize: '.8rem', lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
        />
        {result && (
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '.75rem 1rem', marginTop: '.75rem', fontSize: '.83rem' }}>
            <div style={{ color: '#6ee7b7' }}>✓ Imported: {result.imported}</div>
            {result.duplicates > 0 && <div style={{ color: '#fcd34d' }}>⚠ Trùng: {result.duplicates}</div>}
            {result.parse_errors > 0 && <div style={{ color: '#fca5a5' }}>✕ Lỗi parse: {result.parse_errors}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
          <button onClick={handle} disabled={importing} style={{ flex: 1, background: importing ? '#334155' : '#06b6d4', border: 'none', color: '#fff', borderRadius: '8px', padding: '.65rem', cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
            {importing ? '⏳ Đang import...' : '📥 Import'}
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: '8px', padding: '.65rem 1.25rem', cursor: 'pointer' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ── Quick bar cho Đã Kháng / Chưa Kháng ─────────────────────────────────────
function KhangQuickBar({ status, onFilter, onClearFilter, videoMax }) {
  const label = status === 'ACC_DA_KHANG' ? 'Đã Kháng' : 'Chưa Kháng';
  const color  = status === 'ACC_DA_KHANG' ? '#8b5cf6' : '#f97316';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}22, ${color}11)`,
      border:     `1px solid ${color}44`,
      borderRadius: '12px', padding: '.7rem 1.25rem',
      marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
    }}>
      <span style={{ color, fontWeight: 700, fontSize: '.9rem' }}>⚡ {label}</span>
      <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>Lọc nhanh acc cần xử lý:</span>
      <div style={{ flex: 1 }} />

      {/* Nút lọc dưới 20 video */}
      <button
        onClick={() => videoMax === '19' ? onClearFilter() : onFilter(19)}
        style={{
          background: videoMax === '19' ? color : 'transparent',
          border:     `1px solid ${color}`,
          color:      videoMax === '19' ? '#fff' : color,
          borderRadius: '8px', padding: '.4rem .9rem',
          cursor: 'pointer', fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap',
          transition: 'all .15s',
        }}
      >
        📹 Dưới 20 video {videoMax === '19' && '✓'}
      </button>

      {/* Nút lọc 0 video */}
      <button
        onClick={() => videoMax === '0' ? onClearFilter() : onFilter(0)}
        style={{
          background: videoMax === '0' ? color : 'transparent',
          border:     `1px solid ${color}`,
          color:      videoMax === '0' ? '#fff' : color,
          borderRadius: '8px', padding: '.4rem .9rem',
          cursor: 'pointer', fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap',
          transition: 'all .15s',
        }}
      >
        📭 Chưa có video {videoMax === '0' && '✓'}
      </button>

      {videoMax !== '' && (
        <button onClick={onClearFilter} style={{
          background: 'transparent', border: '1px solid #334155',
          color: '#94a3b8', borderRadius: '6px', padding: '.35rem .6rem',
          cursor: 'pointer', fontSize: '.78rem',
        }}>✕ Bỏ lọc video</button>
      )}

      <span style={{ color: '#475569', fontSize: '.75rem' }}>
        → Chọn tất cả rồi dùng BulkBar để copy hoặc đổi trạng thái
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChromeAccountList() {
  const [sp, setSp] = useSearchParams();

  const [accounts,   setAccounts]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [clChecking, setClChecking] = useState(false);
  const [clResults,  setClResults]  = useState(null);
  const [clProgress, setClProgress] = useState(null);

  const [filters, setFilters] = useState({
    status:      sp.get('status')      || '',
    live_status: sp.get('live_status') || '',
    device_id:   sp.get('device_id')   || '',
    search:      sp.get('search')      || '',
    date_from:   sp.get('date_from')   || '',
    date_to:     sp.get('date_to')     || '',
    video_min:   sp.get('video_min')   || '',
    video_max:   sp.get('video_max')   || '',
    page:        parseInt(sp.get('page') || '1'),
    limit:       parseInt(sp.get('limit') || '20'),
  });

  const fetchAccounts = useCallback(async (f) => {
    setLoading(true); setError(null);
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      const res = await chromeAccountApi.getAll(params);
      setAccounts(res.data?.accounts || []);
      setPagination(res.data?.pagination || null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAccounts(filters);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) params[k] = v; });
    setSp(params, { replace: true });
    setSelected(new Set());
  }, [filters]); // eslint-disable-line

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const setPage   = (page) => setFilters((prev) => ({ ...prev, page }));

  const allPageIds      = accounts.map((a) => a.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selected.has(id));
  const someSelected    = allPageIds.some((id) => selected.has(id));
  const rowOffset       = ((pagination?.page || filters.page || 1) - 1) * (pagination?.limit || filters.limit || 20);

  const toggleAll = () =>
    setSelected((prev) => { const next = new Set(prev); allPageSelected ? allPageIds.forEach((id) => next.delete(id)) : allPageIds.forEach((id) => next.add(id)); return next; });

  const toggleOne = (id, e) => {
    e.stopPropagation();
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleCheckLive = async (ids) => {
    if (ids.length === 0) { toast.error('Tick chọn accounts cần check trước'); return; }
    const settings  = loadCheckLiveSettings();
    setClChecking(true); setClResults(null); setClProgress(null);
    try {
      const { rows, live, die, unknown } = await checkLiveInBatches('/chrome-accounts/check-live', ids, settings, setClProgress);
      setClResults({ live, die, unknown, rows: rows || [] });
      toast.success(`Check xong: ${live} live · ${die} die · ${unknown} unknown`);
      fetchAccounts(filters);
    } catch (e) {
      const msg = e.message || '';
      toast.error(msg.includes('504') || msg.toLowerCase().includes('timeout')
        ? 'Check live quá lâu, hãy giảm số acc mỗi lượt hoặc đổi proxy'
        : (msg || 'Check live thất bại'));
    }
    finally { setClChecking(false); setClProgress(null); }
  };

  const collectAllFilteredIds = async () => {
    const pageLimit = 100;
    let page = 1;
    let pages = 1;
    const ids = [];

    do {
      const params = Object.fromEntries(Object.entries({
        ...filters,
        page,
        limit: pageLimit,
      }).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      const res = await chromeAccountApi.getAll(params);
      ids.push(...(res.data?.accounts || []).map((acc) => acc.id));
      const p = res.data?.pagination || {};
      pages = p.totalPages || p.pages || 1;
      page += 1;
    } while (page <= pages);

    return ids;
  };

  const handleCheckLiveAll = async () => {
    setClChecking(true);
    setClResults(null);
    setClProgress(null);
    try {
      const ids = await collectAllFilteredIds();
      if (ids.length === 0) {
        toast.error('Không có account nào trong bảng hiện tại');
        return;
      }
      await handleCheckLive(ids);
    } catch (e) {
      toast.error(e.message || 'Không lấy được danh sách account để check');
    } finally {
      setClChecking(false);
    }
  };

  const currentStatus = filters.status;
  const currentTab    = STATUS_TABS.find((t) => t.value === currentStatus) || STATUS_TABS[0];

  return (
    <div className="page">
      <style>{`
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .chrome-row:hover { background: rgba(6,182,212,.05) !important; cursor: pointer; }
        .chrome-row.row-selected { background: rgba(6,182,212,.08) !important; }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>🖥️ Chrome Accounts <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>Loại 2</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={() => setShowImport(true)} style={{ background: '#06b6d4', border: 'none', color: '#fff', borderRadius: '8px', padding: '.55rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '.875rem' }}>
            📥 Import
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => tab.to ? (
          <Link key={tab.value} to={tab.to} style={{
            background:   'rgba(255,255,255,.06)',
            color:        '#94a3b8',
            border:       '1px solid rgba(255,255,255,.1)',
            borderRadius: '8px', padding: '.4rem .85rem', cursor: 'pointer',
            fontWeight:   400,
            fontSize:     '.82rem', whiteSpace: 'nowrap', transition: 'all .15s',
            textDecoration: 'none',
          }}>{tab.label}</Link>
        ) : (
          <button key={tab.value} onClick={() => setFilter('status', tab.value)} style={{
            background:   currentStatus === tab.value ? tab.color : 'rgba(255,255,255,.06)',
            color:        currentStatus === tab.value ? '#fff' : '#94a3b8',
            border:       currentStatus === tab.value ? 'none' : '1px solid rgba(255,255,255,.1)',
            borderRadius: '8px', padding: '.4rem .85rem', cursor: 'pointer',
            fontWeight:   currentStatus === tab.value ? 700 : 400,
            fontSize:     '.82rem', whiteSpace: 'nowrap', transition: 'all .15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group">
              <label>Tìm username</label>
              <input type="text" placeholder="username…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Live status</label>
              <select value={filters.live_status} onChange={(e) => setFilter('live_status', e.target.value)}>
                {['','unknown','live','die'].map((s) => <option key={s} value={s}>{s || 'Tất cả'}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Video từ</label>
              <input type="number" min={0} placeholder="0" value={filters.video_min}
                onChange={(e) => setFilter('video_min', e.target.value)}
                style={{ minWidth: '70px', maxWidth: '80px' }} />
            </div>
            <div className="filter-group">
              <label>Video đến</label>
              <input type="number" min={0} placeholder="—" value={filters.video_max}
                onChange={(e) => setFilter('video_max', e.target.value)}
                style={{ minWidth: '70px', maxWidth: '80px' }} />
            </div>
            <div className="filter-group">
              <label>Device ID</label>
              <input type="text" placeholder="device_id…" value={filters.device_id} onChange={(e) => setFilter('device_id', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Từ ngày</label>
              <input type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Đến ngày</label>
              <input type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Số dòng</label>
              <select value={filters.limit} onChange={(e) => setFilter('limit', parseInt(e.target.value))}>
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} dòng</option>)}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', live_status: '', device_id: '', search: '', date_from: '', date_to: '', video_min: '', video_max: '', page: 1, limit: filters.limit })}>
              ✕ Xoá bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* Chrome toolbar (always visible) */}
      <ChromeToolbar
        onRefresh={() => fetchAccounts(filters)}
        onCheckAll={handleCheckLiveAll}
        checking={clChecking}
      />

      {/* Quick action bar cho Đã Kháng / Chưa Kháng */}
      {(currentStatus === 'ACC_DA_KHANG' || currentStatus === 'ACC_CHUA_KHANG') && (
        <KhangQuickBar
          status={currentStatus}
          onFilter={(max) => setFilters((p) => ({ ...p, video_max: String(max), video_min: '', page: 1 }))}
          onClearFilter={() => setFilters((p) => ({ ...p, video_max: '', video_min: '', page: 1 }))}
          videoMax={filters.video_max}
        />
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <ChromeBulkBar
          selected={selected}
          onClear={() => setSelected(new Set())}
          onRefresh={() => fetchAccounts(filters)}
          onCheckLive={handleCheckLive}
          clChecking={clChecking}
        />
      )}
      {clProgress && (
        <div className="info-bar">
          Đang check live: {clProgress.done}/{clProgress.total} · {clProgress.live} live · {clProgress.die} die · {clProgress.unknown} unknown
        </div>
      )}

      {/* Check live results */}
      {clResults && <CheckLiveResults results={clResults} onClose={() => setClResults(null)} />}

      {error && <div className="error-bar">⚠️ {error}</div>}

      {/* Table */}
      <div className="card">
        <div className="table-container">
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /> Đang tải…</div>
          ) : accounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🖥️</div>
              <p>Không tìm thấy account nào</p>
              <button onClick={() => setShowImport(true)} style={{ marginTop: '1rem', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>
                📥 Import accounts ngay
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="cb-cell">
                    <input type="checkbox" checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allPageSelected; }}
                      onChange={toggleAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  </th>
                  <th>STT</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Proxy</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Live</th>
                  <th>Videos</th>
                  <th>Followers</th>
                  <th>Following</th>
                  <th>Note</th>
                  <th>Reg At</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, index) => {
                  const sc = STATUS_COLOR[acc.status] || { bg: 'rgba(100,116,139,.1)', color: '#94a3b8' };
                  return (
                    <tr key={acc.id}
                      className={`chrome-row${selected.has(acc.id) ? ' row-selected' : ''}`}
                    >
                      <td className="cb-cell" onClick={(e) => toggleOne(acc.id, e)}>
                        <input type="checkbox" checked={selected.has(acc.id)} onChange={() => {}} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                      </td>
                      <td className="td-mono" style={{ color: '#94a3b8' }}>{rowOffset + index + 1}</td>
                      <td>
                        <strong style={{ fontSize: '.85rem' }}>{acc.username || <span style={{ color: '#94a3b8' }}>N/A</span>}</strong>
                        {acc.note && <div style={{ fontSize: '.7rem', color: '#8b5cf6', marginTop: 2 }}>📝 {acc.note.length > 30 ? acc.note.substring(0, 30) + '…' : acc.note}</div>}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '.78rem', fontFamily: 'monospace' }}>
                        {acc.email ? acc.email.substring(0, 20) + (acc.email.length > 20 ? '…' : '') : '—'}
                      </td>
                      <td style={{ color: '#475569', fontSize: '.75rem', fontFamily: 'monospace' }}>
                        {acc.proxy ? acc.proxy.split('@').pop().substring(0, 16) : <span style={{ color: '#334155' }}>—</span>}
                      </td>
                      <td style={{ color: '#475569', fontSize: '.75rem', fontFamily: 'monospace' }}>
                        {acc.device_id ? acc.device_id.substring(0, 10) + '…' : '—'}
                      </td>
                      <td>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {acc.status}
                        </span>
                      </td>
                      <td>
                        {acc.live_status === 'live'    ? <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '.78rem' }}>• live</span>
                        : acc.live_status === 'die'    ? <span style={{ color: '#f87171', fontWeight: 700, fontSize: '.78rem' }}>• die</span>
                        : <span style={{ color: '#475569', fontSize: '.78rem' }}>• unknown</span>}
                      </td>
                      <td style={{ color: acc.video_count > 0 ? '#047857' : '#64748b', fontWeight: acc.video_count >= 20 ? 800 : 700 }}>
                        {acc.video_count ?? 0}
                        {acc.video_count >= 20 && <span style={{ color: '#22c55e', marginLeft: '.3rem', fontSize: '.7rem' }}>✓</span>}
                      </td>
                      <td style={{ color: '#2563eb', fontWeight: 700 }}>{fmtNum(acc.followers)}</td>
                      <td style={{ color: '#7c3aed', fontWeight: 700 }}>{fmtNum(acc.following)}</td>
                      <td style={{ color: '#64748b', fontSize: '.75rem' }}>
                        {acc.note ? acc.note.substring(0, 25) + (acc.note.length > 25 ? '…' : '') : '—'}
                      </td>
                      <td style={{ color: '#475569', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmt(acc.reg_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {pagination && (pagination.totalPages || pagination.pages) > 1 && (
          <Pagination
            pagination={{
              ...pagination,
              totalPages: pagination.totalPages || pagination.pages,
            }}
            onPageChange={setPage}
          />
        )}
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={() => fetchAccounts(filters)} />
      )}
    </div>
  );
}
