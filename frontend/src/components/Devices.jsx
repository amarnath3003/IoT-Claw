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
      setSuccess(`Registered ${form.name.trim()}.`)
      setForm(DEFAULT_FORM)
    } catch {
      setError('Failed to register device. Check that the backend is running.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete device "${name}"?`)) return
    try { await deleteDevice(name); setSuccess(`Deleted ${name}.`) }
    catch { setError(`Failed to delete ${name}.`) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, alignItems: 'start' }}>

      {/* ── Registration form ── */}
      <div className="neu-section">
        <div className="neu-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent)', fontSize: 16 }}>⊞</span>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Register Device
            </h2>
          </div>
          <span className="neu-badge neu-badge-accent">MQTT</span>
        </div>

        <form onSubmit={handleSubmit} className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Register a real device topic before using it in chat or workflows.
          </p>

          <div>
            <label className="neu-label" htmlFor="dev-name">Device name</label>
            <input
              id="dev-name"
              className="neu-input"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="living_room_light"
            />
          </div>

          <div>
            <label className="neu-label" htmlFor="dev-topic">MQTT topic base</label>
            <input
              id="dev-topic"
              className="neu-input"
              value={form.topic_base}
              onChange={e => update('topic_base', e.target.value)}
              placeholder="home/living_room/light"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="neu-label" htmlFor="dev-type">Type</label>
              <select
                id="dev-type"
                className="neu-input"
                value={form.type}
                onChange={e => update('type', e.target.value)}
              >
                <option value="switch">Switch</option>
                <option value="sensor">Sensor</option>
                <option value="dimmable_switch">Dimmable</option>
                <option value="security_camera">Camera</option>
                <option value="generic">Generic</option>
              </select>
            </div>
            <div>
              <label className="neu-label" htmlFor="dev-unit">Unit</label>
              <input
                id="dev-unit"
                className="neu-input"
                value={form.unit}
                onChange={e => update('unit', e.target.value)}
                placeholder="°C, %, lux"
              />
            </div>
          </div>

          <div>
            <label className="neu-label" htmlFor="dev-location">Location</label>
            <input
              id="dev-location"
              className="neu-input"
              value={form.location}
              onChange={e => update('location', e.target.value)}
              placeholder="Living room"
            />
          </div>

          <div>
            <label className="neu-label" htmlFor="dev-desc">Description</label>
            <textarea
              id="dev-desc"
              className="neu-input"
              value={form.description}
              onChange={e => update('description', e.target.value)}
              rows={2}
              placeholder="Relay controlling the main light"
              style={{ resize: 'none', fontFamily: 'inherit', color: 'var(--text-main)' }}
            />
          </div>

          {error   && <div className="neu-alert-error">{error}</div>}
          {success && <div className="neu-alert-success">{success}</div>}

          <button
            id="register-device-btn"
            type="submit"
            disabled={saving}
            className="neu-btn-primary"
            style={{ padding: '11px 0', width: '100%', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {saving ? 'Registering...' : '⊞ Register Device'}
          </button>
        </form>
      </div>

      {/* ── Registered devices list ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="led-pulse" />
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Registered Devices
            </h2>
          </div>
          <span className="neu-badge">{devices.length} total</span>
        </div>

        {devices.length === 0 ? (
          <div className="neu-section" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, opacity: 0.25, marginBottom: 12 }}>⊡</div>
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 13 }}>No devices registered yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {devices.map(([name, device]) => {
              const isOn = String(device.status).toUpperCase() === 'ON'
              return (
                <div key={name} className="neu-plate" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div className={isOn ? 'led-pulse' : 'led'} />
                        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                          {name.replace(/_/g, ' ')}
                        </h3>
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {device.topic_base}
                      </p>
                    </div>
                    <button
                      id={`delete-${name}`}
                      onClick={() => handleDelete(name)}
                      className="neu-btn-danger neu-btn-sm"
                      title="Delete device"
                      style={{ fontSize: 14 }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="neu-trough" style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span className="neu-badge">{device.type || 'generic'}</span>
                    <span className={`neu-badge ${isOn ? 'neu-badge-green' : ''}`}>
                      {String(device.status ?? 'unknown').toUpperCase()}
                    </span>
                    {device.location && <span className="neu-badge">{device.location}</span>}
                  </div>

                  {device.description && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      {device.description}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
