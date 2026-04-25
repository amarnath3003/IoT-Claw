import { useState } from 'react'
import { deleteDevice, registerDevice } from '../api'

const DEFAULT_FORM = {
  name: '',
  topic_base: '',
  type: 'switch',
  unit: '',
  location: '',
  description: '',
}

/* Same icon resolver as DeviceCard */
function resolveIcon(name, type) {
  const n = name.toLowerCase()
  if (/lamp|bulb|light|led/.test(n))       return '💡'
  if (/fan|ventil|exhaust/.test(n))        return '🌀'
  if (/temp|therm|heat/.test(n))           return '🌡️'
  if (/humid|moisture|water/.test(n))      return '💧'
  if (/cam|camera|security|eye/.test(n))   return '📷'
  if (/door|lock|gate|entry/.test(n))      return '🚪'
  if (/motion|pir|presence/.test(n))       return '🚶'
  if (/smoke|gas|co2|air/.test(n))         return '💨'
  if (/plug|socket|outlet|power/.test(n))  return '🔌'
  if (/tv|display|screen/.test(n))         return '📺'
  if (/speaker|audio|sound/.test(n))       return '🔊'
  if (type === 'security_camera') return '📷'
  if (type === 'dimmable_switch') return '💡'
  if (type === 'switch')          return '🔌'
  if (type === 'sensor')          return '📡'
  return '⚙️'
}

const TYPE_LABELS = {
  switch:          'Switch',
  sensor:          'Sensor',
  dimmable_switch: 'Dimmable',
  security_camera: 'Camera',
  generic:         'Generic',
}

export default function Devices({ deviceStates }) {
  const [form, setForm]       = useState(DEFAULT_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const devices = Object.entries(deviceStates || {})

  const update = (field, value) => setForm(cur => ({ ...cur, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.name.trim())       return setError('Device name is required.')
    if (!form.topic_base.trim()) return setError('MQTT topic base is required.')
    setSaving(true)
    try {
      await registerDevice({ ...form, name: form.name.trim(), topic_base: form.topic_base.trim() })
      setSuccess(`"${form.name.trim()}" registered successfully.`)
      setForm(DEFAULT_FORM)
    } catch {
      setError('Failed to register device. Is the backend running?')
    } finally { setSaving(false) }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete device "${name}"?`)) return
    try { await deleteDevice(name); setSuccess(`Deleted "${name}".`) }
    catch { setError(`Failed to delete "${name}".`) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 28, alignItems: 'start' }}>

      {/* ── LEFT: Register Form ── */}
      <div className="neu-section">
        <div className="neu-section-header">
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>Add New Device</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Connect an MQTT device to the system</div>
          </div>
          <span className="neu-badge neu-badge-accent">MQTT</span>
        </div>

        <form onSubmit={handleSubmit} className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Name */}
          <div>
            <label className="neu-label" htmlFor="dev-name">Device Name <span style={{ color: '#f87171' }}>*</span></label>
            <input id="dev-name" className="neu-input" value={form.name}
              onChange={e => update('name', e.target.value)} placeholder="e.g. living_room_light" />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Use snake_case — this is the unique identifier</div>
          </div>

          {/* Topic */}
          <div>
            <label className="neu-label" htmlFor="dev-topic">MQTT Topic Base <span style={{ color: '#f87171' }}>*</span></label>
            <input id="dev-topic" className="neu-input" value={form.topic_base}
              onChange={e => update('topic_base', e.target.value)} placeholder="e.g. home/living_room/light" />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>The system will subscribe to <code style={{ color: 'var(--accent-light)' }}>[topic]/state</code></div>
          </div>

          {/* Type + Unit row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="neu-label" htmlFor="dev-type">Device Type</label>
              <select id="dev-type" className="neu-input" value={form.type} onChange={e => update('type', e.target.value)}>
                <option value="switch">💡 Switch</option>
                <option value="sensor">📡 Sensor</option>
                <option value="dimmable_switch">🔆 Dimmable</option>
                <option value="security_camera">📷 Camera</option>
                <option value="generic">⚙️ Generic</option>
              </select>
            </div>
            <div>
              <label className="neu-label" htmlFor="dev-unit">Unit (optional)</label>
              <input id="dev-unit" className="neu-input" value={form.unit}
                onChange={e => update('unit', e.target.value)} placeholder="°C, %, lux…" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="neu-label" htmlFor="dev-location">Location (optional)</label>
            <input id="dev-location" className="neu-input" value={form.location}
              onChange={e => update('location', e.target.value)} placeholder="e.g. Living Room" />
          </div>

          {/* Description */}
          <div>
            <label className="neu-label" htmlFor="dev-desc">Description (optional)</label>
            <textarea id="dev-desc" className="neu-input" value={form.description}
              onChange={e => update('description', e.target.value)} rows={2}
              placeholder="e.g. Relay controlling the ceiling light"
              style={{ resize: 'none', fontFamily: 'inherit', color: 'var(--text-main)' }} />
          </div>

          {error   && <div className="neu-alert-error">{error}</div>}
          {success && <div className="neu-alert-success">✓ {success}</div>}

          <button id="register-device-btn" type="submit" disabled={saving}
            style={{
              padding: '12px 0', width: '100%', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase', border: 'none',
              borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              background: 'var(--accent)', color: '#fff',
              boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
              transition: 'opacity 0.2s',
            }}>
            {saving ? 'Registering…' : '+ Register Device'}
          </button>
        </form>
      </div>

      {/* ── RIGHT: Device List ── */}
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-main)' }}>Registered Devices</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {devices.length === 0
                ? 'No devices yet — register one using the form.'
                : `${devices.length} device${devices.length !== 1 ? 's' : ''} connected to the system`}
            </p>
          </div>
          {devices.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="led-pulse" />
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>Live</span>
            </div>
          )}
        </div>

        {devices.length === 0 ? (
          <div className="neu-section" style={{ padding: 56, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.4 }}>📡</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-dim)' }}>No devices registered yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Use the form on the left to add your first MQTT device.<br />
              You can also ask Chat: <em style={{ color: 'var(--accent-light)' }}>"Register a light called desk_lamp"</em>
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devices.map(([name, device]) => {
              const isOn      = String(device.status).toUpperCase() === 'ON'
              const isNumeric = !isNaN(parseFloat(device.status)) && device.status !== 'ON' && device.status !== 'OFF'
              const label     = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const emoji     = resolveIcon(name, device.type)
              const typeLabel = TYPE_LABELS[device.type] || 'Generic'
              const lastSeen  = device.last_updated
                ? new Date(device.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null

              return (
                <div key={name} className="neu-plate" style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  borderLeft: `3px solid ${isOn ? '#22c55e' : isNumeric ? 'var(--accent)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.2s',
                }}>

                  {/* Emoji icon */}
                  <div style={{
                    fontSize: 28,
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                    filter: isOn ? 'brightness(1.1)' : 'grayscale(0.4) brightness(0.8)',
                  }}>
                    {emoji}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{label}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.07)' }}>
                        {typeLabel}
                      </span>
                      {device.location && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📍 {device.location}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {device.topic_base}
                    </div>
                    {device.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {device.description}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 64 }}>
                    {isNumeric ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {device.status}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{device.unit || 'value'}</div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                          color: isOn ? '#22c55e' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}>
                          <div className={isOn ? 'led-pulse' : 'led'} style={{ width: 7, height: 7 }} />
                          {isOn ? 'ON' : 'OFF'}
                        </div>
                        {lastSeen && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{lastSeen}</div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    id={`delete-${name}`}
                    onClick={() => handleDelete(name)}
                    title="Remove device"
                    style={{
                      all: 'unset', cursor: 'pointer',
                      width: 32, height: 32, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)', fontSize: 16,
                      transition: 'all 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
