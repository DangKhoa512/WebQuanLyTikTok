export default function StatCard({ title, value, color = '#3b82f6', icon = '📊' }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-icon" style={{ background: color }}>
        {icon}
      </div>
      <div className="stat-info">
        <div className="stat-value">{(value ?? 0).toLocaleString()}</div>
        <div className="stat-title">{title}</div>
      </div>
    </div>
  );
}
