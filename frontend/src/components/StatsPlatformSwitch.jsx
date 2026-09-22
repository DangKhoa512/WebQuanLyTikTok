const PLATFORM_META = {
  tiktok: { label: 'TikTok', color: '#10b981' },
  facebook: { label: 'Facebook', color: '#10b981' },
  instagram: { label: 'Instagram', color: '#ec4899' },
};

export default function StatsPlatformSwitch({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
      {Object.entries(PLATFORM_META).map(([key, meta]) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.55rem',
              border: `1px solid ${selected ? meta.color : '#cbd5e1'}`,
              background: selected ? meta.color : '#fff',
              color: selected ? '#fff' : '#0f172a',
              borderRadius: 8,
              padding: '.7rem 1rem',
              cursor: 'pointer',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(15,23,42,.08)',
            }}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
