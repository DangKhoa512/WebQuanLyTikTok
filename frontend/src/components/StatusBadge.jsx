const STATUS_MAP = {
  ACC_LOGIN:         { bg: '#f59e0b', label: 'CHO LOGIN' },
  LOGIN_THANH_CONG: { bg: '#10b981', label: 'LOGIN OK' },
  ACC_DA_KHANG:     { bg: '#0ea5e9', label: 'DA KHANG' },
  ACC_CHUA_KHANG:   { bg: '#f97316', label: 'CHUA KHANG' },
  ACC_DU_DK:        { bg: '#8b5cf6', label: 'DU DK' },
  ACC_DIE:          { bg: '#6b7280', label: 'DIE' },
  REG_DA_LAM:   { bg: '#f59e0b', label: 'REG' },
  CHO_UPVIDEO:  { bg: '#06b6d4', label: 'CHỜ UP' },
  UPVIDEO:      { bg: '#10b981', label: 'UPVIDEO' },
  UPVIDEO_FAIL: { bg: '#ef4444', label: 'FAIL' },
  DAT_CHI_TIEU: { bg: '#8b5cf6', label: 'ĐẠT CT' },
  DIE:          { bg: '#6b7280', label: 'DIE' },
  live:         { bg: '#10b981', label: '● live' },
  die:          { bg: '#ef4444', label: '● die' },
  unknown:      { bg: '#94a3b8', label: '● ?' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || { bg: '#94a3b8', label: status };
  return (
    <span className="badge" style={{ background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}
