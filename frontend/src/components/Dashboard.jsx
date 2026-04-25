import ActivityLog from './ActivityLog'
import DeviceCard from './DeviceCard'

export default function Dashboard({ deviceStates }) {
  const devices = Object.entries(deviceStates || {})
  const onCount  = devices.filter(([, d]) => String(d.status).toUpperCase() === 'ON').length
  const offCount = devices.length - onCount

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
      {/* ── Left: device grid ── */}
      <div>
        {/* Stats row */}
        {devices.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total',   value: devices.length, color: 'var(--text-main)' },
              { label: 'Online',  value: onCount,         color: '#22c55e' },
              { label: 'Offline', value: offCount,        color: 'var(--text-dim)' },
            ].map(s => (
              <div key={s.label} className="neu-plate" style={{ padding: '14px 20px', flex: 1 }}>
                <div className="neu-stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="neu-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="led led-on" />
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Device Grid
            </h2>
          </div>
          <span className="neu-badge">
            {devices.length} registered
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="neu-section" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>⊡</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-dim)' }}>No devices registered yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Use the Devices tab to add an MQTT topic, or ask Chat to register one.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {devices.map(([name, data]) => (
              <DeviceCard key={name} name={name} data={data} />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Activity log ── */}
      <ActivityLog refreshKey={JSON.stringify(deviceStates)} />
    </div>
  )
}
