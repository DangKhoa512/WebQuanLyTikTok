import { useMemo, useState } from 'react';
import { accountGroupApi } from '../services/api';
import { toast } from './Toast';

const inputStyle = {
  padding: '.55rem .75rem',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  width: '100%',
  boxSizing: 'border-box',
};

const dialogButton = {
  border: 'none',
  borderRadius: '8px',
  padding: '.6rem 1rem',
  cursor: 'pointer',
  fontWeight: 700,
};

function GroupDialog({ mode, groups, selectedId, onClose, onDone, accountType, onSelect }) {
  const firstGroupId = groups[0]?.id ? String(groups[0].id) : '';
  const [targetId, setTargetId] = useState(selectedId || firstGroupId);
  const current = useMemo(() => groups.find((group) => String(group.id) === String(targetId)), [groups, targetId]);
  const [name, setName] = useState(mode === 'edit' ? current?.name || '' : '');
  const [busy, setBusy] = useState(false);

  const title = mode === 'add' ? 'Them nhom' : mode === 'edit' ? 'Sua nhom' : 'Xoa nhom';
  const canSave = mode === 'delete' ? !!targetId : !!name.trim();

  const handleTargetChange = (value) => {
    setTargetId(value);
    if (mode === 'edit') {
      const group = groups.find((item) => String(item.id) === String(value));
      setName(group?.name || '');
    }
  };

  const submit = async () => {
    if (!canSave) {
      toast.error(mode === 'delete' ? 'Chon nhom can xoa' : 'Nhap ten nhom');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'add') {
        const res = await accountGroupApi.create(accountType, name.trim());
        const group = res.data?.group;
        if (group?.id) onSelect(String(group.id));
        toast.success('Da tao nhom');
      } else if (mode === 'edit') {
        await accountGroupApi.update(targetId, { name: name.trim() });
        toast.success('Da doi ten nhom');
      } else {
        await accountGroupApi.delete(targetId);
        if (String(selectedId) === String(targetId)) onSelect('');
        toast.success('Da xoa nhom');
      }
      await onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Thao tac nhom that bai');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '430px', background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.05rem' }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
        </div>

        {mode !== 'add' && (
          <div style={{ marginBottom: '.8rem' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '.78rem', marginBottom: '.35rem' }}>Chon nhom</label>
            <select value={targetId} onChange={(e) => handleTargetChange(e.target.value)} style={inputStyle}>
              {groups.length === 0 && <option value="">Chua co nhom</option>}
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
        )}

        {mode !== 'delete' && (
          <div style={{ marginBottom: '.8rem' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '.78rem', marginBottom: '.35rem' }}>Ten nhom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Acc VN, Acc US..." style={inputStyle} autoFocus />
          </div>
        )}

        {mode === 'delete' && (
          <div style={{ color: '#fca5a5', fontSize: '.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            Xoa nhom se khong xoa account. Account trong nhom nay se duoc chuyen ve khong co nhom.
          </div>
        )}

        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
          <button onClick={submit} disabled={busy || !canSave} style={{ ...dialogButton, flex: 1, background: mode === 'delete' ? '#dc2626' : '#2563eb', color: '#fff', opacity: busy || !canSave ? .6 : 1 }}>
            {busy ? 'Dang xu ly...' : mode === 'delete' ? 'Xoa' : 'Luu'}
          </button>
          <button onClick={onClose} disabled={busy} style={{ ...dialogButton, background: 'transparent', color: '#cbd5e1', border: '1px solid #334155' }}>Huy</button>
        </div>
      </div>
    </div>
  );
}

export default function AccountGroupPicker({ accountType, groups = [], value, onChange, onGroupsChanged }) {
  const [dialog, setDialog] = useState(null);

  return (
    <div>
      <label style={{ color: '#94a3b8', fontSize: '.8rem', display: 'block', marginBottom: '.4rem' }}>Nhom account:</label>
      <div style={{ display: 'flex', gap: '.45rem', alignItems: 'center' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
          <option value="">Khong chon nhom</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <button type="button" title="Them nhom" onClick={() => setDialog('add')} style={iconButtonStyle('#16a34a')}>＋</button>
        <button type="button" title="Sua nhom" onClick={() => setDialog('edit')} style={iconButtonStyle('#2563eb')}>✎</button>
        <button type="button" title="Xoa nhom" onClick={() => setDialog('delete')} style={iconButtonStyle('#dc2626')}>🗑</button>
      </div>
      {dialog && (
        <GroupDialog
          mode={dialog}
          groups={groups}
          selectedId={value}
          accountType={accountType}
          onSelect={onChange}
          onDone={onGroupsChanged}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function iconButtonStyle(color) {
  return {
    width: '38px',
    height: '38px',
    flex: '0 0 38px',
    borderRadius: '8px',
    border: `1px solid ${color}66`,
    background: `${color}22`,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '1rem',
    lineHeight: 1,
  };
}
