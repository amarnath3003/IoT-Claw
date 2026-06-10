import { useState, useEffect, useRef, useCallback } from 'react'
import { Wifi, Radio, Home, Trash2, Search, Network, Layers, List } from 'lucide-react'
import { deleteDevice, registerDevice, getGroups } from '../api'
import ZigbeeManager from './ZigbeeManager'
import GroupManager from './GroupManager'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  depth:  'rgba(255,255,255,0.02)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  green:  '#22c55e',
  red:    '#ef4444',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

/* ── Per-protocol default forms ── */
const DEFAULT_FORMS = {
  mqtt: {
    protocol: 'mqtt', name: '', topic_base: '', type: 'switch',
    unit: '', location: '', description: '',
  },
  zigbee: {
    protocol: 'zigbee', name: '', ieee_address: '',
    type: 'zigbee_light', location: '', description: '',
  },
  ha: {
    protocol: 'ha', ha_entity_id: '', name: '',
    ha_domain: 'light', type: 'switch', location: '', description: '',
  },
}

const PROTOCOLS = [
  { key: 'mqtt',   label: 'MQTT',   Icon: Wifi,  color: '#6b8cff', bg: 'rgba(26,46,255,0.12)',   border: 'rgba(26,46,255,0.35)'   },
  { key: 'zigbee', label: 'Zigbee', Icon: Radio, color: '#a78bfa', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.35)'  },
  { key: 'ha',     label: 'HA',     Icon: Home,  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)'  },
]

const BADGE = {
  mqtt:   { label: 'MQTT',   color: '#6b8cff', bg: 'rgba(26,46,255,0.1)',   border: 'rgba(26,46,255,0.25)'   },
  zigbee: { label: 'Zigbee', color: '#a78bfa', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)'  },
  ha:     { label: 'HA',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)'  },
  rtsp:   { label: 'RTSP',   color: '#67e8f9', bg: 'rgba(103,232,249,0.1)', border: 'rgba(103,232,249,0.25)' },
}

const TYPE_LABELS = {
  switch: 'Switch', sensor: 'Sensor', dimmable_switch: 'Dimmable',
  security_camera: 'Camera', ip_camera: 'IP Camera', generic: 'Generic',
  micropython_edge_agent: 'Edge Agent',
  zigbee_light: 'Zigbee Light', zigbee_color_light: 'Zigbee RGB',
  zigbee_plug: 'Zigbee Plug', zigbee_climate_sensor: 'Zigbee Climate',
  zigbee_motion_sensor: 'Zigbee Motion', zigbee_contact_sensor: 'Zigbee Door',
  zigbee_remote: 'Zigbee Remote', zigbee_switch: 'Zigbee Switch',
  zigbee_sensor: 'Zigbee Sensor',
}

function resolveGlyph(name, type) {
  const n = (name || '').toLowerCase()
  if (/lamp|bulb|light|led/.test(n))       return '◉'
  if (/fan|ventil|exhaust/.test(n))        return '◎'
  if (/temp|therm|heat/.test(n))           return '◈'
  if (/humid|moisture|water/.test(n))      return '⬡'
  if (/cam|camera|security|eye/.test(n))   return '⊙'
  if (/door|lock|gate|entry/.test(n))      return '⬢'
  if (/motion|pir|presence/.test(n))       return '◐'
  if (/smoke|gas|co2|air/.test(n))         return '◑'
  if (/plug|socket|outlet|power/.test(n))  return '⏻'
  if (/tv|display|screen/.test(n))         return '▣'
  if (/speaker|audio|sound/.test(n))       return '◭'
  if (type === 'security_camera')          return '⊙'
  if (type === 'dimmable_switch')          return '◉'
  if (type === 'zigbee_color_light')       return '◈'
  if (type === 'zigbee_light')             return '◉'
  if (type === 'zigbee_plug')              return '⏻'
  if (type === 'zigbee_climate_sensor')    return '◈'
  if (type === 'zigbee_motion_sensor')     return '◐'
  if (type === 'zigbee_contact_sensor')    return '⬢'
  if (type === 'zigbee_remote')            return '◫'
  if (type === 'zigbee_switch')            return '⚡'
  if (type === 'zigbee_sensor')            return '⬡'
  return '⬡'
}

function srcOf(d) {
  return d.integration_source
    || (d.ha_entity ? 'ha' : (d.zigbee || d.type?.startsWith('zigbee_')) ? 'zigbee' : 'mqtt')
}

function buildPayload(form) {
  switch (form.protocol) {
    case 'zigbee':
      return {
        name: form.name.trim(),
        topic_base: `zigbee2mqtt/${form.name.trim()}`,
        type: form.type, location: form.location, description: form.description,
        integration_source: 'zigbee', zigbee: true,
        ...(form.ieee_address.trim() ? { ieee_address: form.ieee_address.trim() } : {}),
      }
    case 'ha': {
      const entityId = form.ha_entity_id.trim()
      const domain   = entityId.includes('.') ? entityId.split('.')[0] : form.ha_domain
      return {
        name: form.name.trim() || entityId,
        topic_base: `ha/${entityId}`,
        type: form.type, location: form.location, description: form.description,
        integration_source: 'ha', ha_entity: true, ha_domain: domain, ha_entity_id: entityId,
      }
    }
    default:
      return {
        name: form.name.trim(), topic_base: form.topic_base.trim(),
        type: form.type, unit: form.unit, location: form.location, description: form.description,
        integration_source: 'mqtt',
      }
  }
}

/* ── Shared input style ── */
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid rgba(255,255,255,0.07)`,
  borderRadius: 8, padding: '8px 10px',
  fontFamily: "'Outfit', sans-serif",
  fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)',
  outline: 'none', transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block',
  fontFamily: "'Outfit', sans-serif",
  fontSize: '0.65rem', fontWeight: 600,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.50)', marginBottom: 5,
}

/* ── IP Camera inline tile ─────────────────────────────────────────────────── */
function CameraDeviceRow({ name, device, hasAlert }) {
  const [preview, setPreview] = useState('')
  const [toggling, setToggling] = useState(false)
  const imgRef = useRef(null)
  const timerRef = useRef(null)
  const isOn = String(device.status).toUpperCase() === 'ON'
  const det = device.last_detection
  const API = 'http://localhost:8000'

  // MJPEG polling — only when camera is ON
  useEffect(() => {
    if (!isOn) { setPreview(''); return }
    const tick = () => setPreview(`${API}/devices/${name}/preview?t=${Date.now()}`)
    tick()
    timerRef.current = setInterval(tick, 250)
    return () => clearInterval(timerRef.current)
  }, [isOn, name])

  const toggle = async () => {
    setToggling(true)
    try {
      const action = isOn ? 'stop' : 'start'
      await fetch(`${API}/cameras/${name}/${action}`, { method: 'POST' })
    } catch (e) { /* ignore */ }
    finally { setToggling(false) }
  }

  const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div style={{
      background: hasAlert ? 'rgba(239,68,68,0.04)' : C.depth,
      border: `1px solid ${hasAlert ? 'rgba(239,68,68,0.35)' : C.border}`,
      borderLeft: `3px solid ${isOn ? C.green : 'rgba(103,232,249,0.4)'}`,
      borderRadius: 10,
      overflow: 'hidden',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: hasAlert ? '0 0 16px rgba(239,68,68,0.2)' : 'none',
      animation: hasAlert ? 'cameraAlertPulse 2s ease-in-out infinite' : 'none',
    }}>
      {/* Top row: name + badges + toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
      }}>
        {/* Icon */}
        <div style={{
          fontSize: 16, width: 36, height: 36, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8,
          background: isOn ? 'rgba(34,197,94,0.08)' : C.panel,
          border: `1px solid ${isOn ? 'rgba(34,197,94,0.2)' : C.border}`,
          color: isOn ? C.green : C.text2,
        }}>⊙</div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, color: C.text1 }}>{label}</span>
            <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3, background: C.panel, padding: '1px 6px', borderRadius: 4, border: `1px solid ${C.border}` }}>IP Camera</span>
            <span style={{ fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#67e8f9', background: 'rgba(103,232,249,0.1)', border: '1px solid rgba(103,232,249,0.25)', padding: '1px 6px', borderRadius: 4 }}>RTSP</span>
            {device.location && <span style={{ fontFamily: C.sans, fontSize: '0.7rem', color: C.text3 }}>◍ {device.location}</span>}
            {hasAlert && <span style={{ fontFamily: C.sans, fontSize: '0.68rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 8px', borderRadius: 4 }}>🚨 Alert</span>}
          </div>
          {det?.label && (
            <div style={{ fontFamily: C.sans, fontSize: '0.72rem', color: '#f59e0b' }}>
              {det.label}
            </div>
          )}
        </div>

        {/* Status + toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: isOn ? C.green : C.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOn ? C.green : 'rgba(255,255,255,0.15)', boxShadow: isOn ? `0 0 5px ${C.green}` : 'none' }} />
            {isOn ? 'ON' : 'OFF'}
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            style={{
              all: 'unset', cursor: toggling ? 'not-allowed' : 'pointer',
              fontFamily: C.sans, fontSize: '0.7rem', fontWeight: 600,
              padding: '4px 11px', borderRadius: 7,
              background: isOn ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.12)',
              border: `1px solid ${isOn ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
              color: isOn ? '#ef4444' : '#22c55e',
              opacity: toggling ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {isOn ? '⏹ Stop' : '▶ Start'}
          </button>
        </div>
      </div>

      {/* Live preview (only when ON) */}
      {isOn && (
        <div style={{ position: 'relative', background: '#030308', lineHeight: 0 }}>
          {preview ? (
            <img
              ref={imgRef}
              src={preview}
              alt={`${name} live`}
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }}
              onError={() => setPreview('')}
            />
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontFamily: C.sans, fontSize: '0.75rem' }}>
              Connecting…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Devices({ deviceStates, wsMessages }) {
  const [protocol, setProtocol]           = useState('mqtt')
  const [form, setForm]                   = useState(DEFAULT_FORMS.mqtt)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')
  const [search, setSearch]               = useState('')
  const [showZigbeeMgr, setShowZigbeeMgr] = useState(false)
  const [viewMode, setViewMode]           = useState('flat')   // 'flat' | 'grouped'
  const [groups, setGroups]               = useState([])

  const fetchGroups = useCallback(async () => {
    try { const r = await getGroups(); setGroups(r.data) }
    catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const update = (field, value) => setForm(cur => ({ ...cur, [field]: value }))

  const switchProtocol = (p) => {
    setProtocol(p); setForm(DEFAULT_FORMS[p]); setError(''); setSuccess('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('')
    if (!form.name?.trim() && protocol !== 'ha')
      return setError('Device name is required.')
    if (protocol === 'ha' && !form.ha_entity_id?.trim())
      return setError('HA Entity ID is required (e.g. light.living_room).')
    if (protocol === 'mqtt' && !form.topic_base?.trim())
      return setError('MQTT topic base is required.')

    setSaving(true)
    try {
      const payload = buildPayload(form)
      await registerDevice(payload)
      setSuccess(`"${payload.name}" registered (${protocol.toUpperCase()}).`)
      setForm(DEFAULT_FORMS[protocol])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to register device. Is the backend running?')
    } finally { setSaving(false) }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete device "${name}"?`)) return
    try { await deleteDevice(name); setSuccess(`Deleted "${name}".`) }
    catch { setError(`Failed to delete "${name}".`) }
  }

  const allDevices = Object.entries(deviceStates || {})
  const devices    = search.trim()
    ? allDevices.filter(([name, d]) => {
        const q = search.toLowerCase()
        return name.toLowerCase().includes(q)
          || (d.type || '').toLowerCase().includes(q)
          || (d.location || '').toLowerCase().includes(q)
          || (d.description || '').toLowerCase().includes(q)
      })
    : allDevices

  const proto = PROTOCOLS.find(p => p.key === protocol)
  const ProtoIcon = proto.Icon

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="devices-grid-container" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 28, alignItems: 'start' }}>

        {/* ══ LEFT: Add Device Form ══ */}
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 700, color: C.text1 }}>
              Register Device
            </div>
            <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.text3, marginTop: 2 }}>
              MQTT · Zigbee · Home Assistant
            </div>
          </div>

          {/* Protocol selector */}
          <div style={{ padding: '14px 20px 0' }}>
            <div style={{ fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Protocol
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {PROTOCOLS.map(p => {
                const active = protocol === p.key
                const PIcon = p.Icon
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => switchProtocol(p.key)}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      flex: 1, padding: '9px 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      borderRadius: 8,
                      fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
                      border: `1px solid ${active ? p.border : C.border}`,
                      background: active ? p.bg : 'transparent',
                      color: active ? p.color : C.text3,
                      transition: 'all 0.18s',
                    }}
                  >
                    <PIcon size={11} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fields */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 20px' }}>

            {/* MQTT fields */}
            {protocol === 'mqtt' && <>
              <div>
                <label style={labelStyle} htmlFor="dev-name">
                  Device Name <span style={{ color: C.red }}>*</span>
                </label>
                <input id="dev-name" style={inputStyle} value={form.name}
                  onChange={e => update('name', e.target.value)} placeholder="e.g. living_room_light" />
                <div style={{ fontSize: '0.65rem', color: C.text3, marginTop: 3, fontFamily: C.mono }}>
                  snake_case — used as the unique ID
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor="dev-topic">
                  MQTT Topic Base <span style={{ color: C.red }}>*</span>
                </label>
                <input id="dev-topic" style={inputStyle} value={form.topic_base}
                  onChange={e => update('topic_base', e.target.value)} placeholder="e.g. home/living_room/light" />
                <div style={{ fontSize: '0.65rem', color: C.text3, marginTop: 3, fontFamily: C.mono }}>
                  Subscribes to <code style={{ color: C.blue }}>[topic]/state</code>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle} htmlFor="dev-type">Type</label>
                  <select id="dev-type" style={inputStyle} value={form.type} onChange={e => update('type', e.target.value)}>
                    <option value="switch">Switch</option>
                    <option value="sensor">Sensor</option>
                    <option value="dimmable_switch">Dimmable</option>
                    <option value="security_camera">Camera</option>
                    <option value="generic">Generic</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="dev-unit">Unit (optional)</label>
                  <input id="dev-unit" style={inputStyle} value={form.unit}
                    onChange={e => update('unit', e.target.value)} placeholder="°C, %, lux…" />
                </div>
              </div>
            </>}

            {/* Zigbee fields */}
            {protocol === 'zigbee' && <>
              <div>
                <label style={labelStyle} htmlFor="zbee-name">
                  Friendly Name <span style={{ color: C.red }}>*</span>
                </label>
                <input id="zbee-name" style={inputStyle} value={form.name}
                  onChange={e => update('name', e.target.value)} placeholder="e.g. bedroom_bulb" />
                <div style={{ fontSize: '0.65rem', color: C.text3, marginTop: 3, fontFamily: C.sans }}>
                  Must match the device name in Zigbee2MQTT
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor="zbee-type">Device Type</label>
                <select id="zbee-type" style={inputStyle} value={form.type} onChange={e => update('type', e.target.value)}>
                  <option value="zigbee_light">Dimmable Light</option>
                  <option value="zigbee_color_light">Color Light (RGB)</option>
                  <option value="zigbee_plug">Smart Plug</option>
                  <option value="zigbee_switch">Switch</option>
                  <option value="zigbee_climate_sensor">Climate Sensor</option>
                  <option value="zigbee_motion_sensor">Motion Sensor</option>
                  <option value="zigbee_contact_sensor">Door/Window Sensor</option>
                  <option value="zigbee_remote">Remote</option>
                  <option value="zigbee_sensor">Generic Sensor</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="zbee-ieee">IEEE Address (optional)</label>
                <input id="zbee-ieee" style={{ ...inputStyle, fontFamily: C.mono, fontSize: '0.75rem' }}
                  value={form.ieee_address}
                  onChange={e => update('ieee_address', e.target.value)}
                  placeholder="0x00158d0001234567" />
                <div style={{ fontSize: '0.65rem', color: C.text3, marginTop: 3, fontFamily: C.sans }}>
                  Leave blank if device is already joined in Zigbee2MQTT
                </div>
              </div>
            </>}

            {/* HA fields */}
            {protocol === 'ha' && <>
              <div>
                <label style={labelStyle} htmlFor="ha-entity">
                  HA Entity ID <span style={{ color: C.red }}>*</span>
                </label>
                <input id="ha-entity" style={{ ...inputStyle, fontFamily: C.mono, fontSize: '0.75rem' }}
                  value={form.ha_entity_id}
                  onChange={e => {
                    const val = e.target.value
                    const domain = val.includes('.') ? val.split('.')[0] : ''
                    update('ha_entity_id', val)
                    if (domain) update('ha_domain', domain)
                  }}
                  placeholder="e.g. light.living_room" />
                <div style={{ fontSize: '0.65rem', color: C.text3, marginTop: 3, fontFamily: C.sans }}>
                  From: Home Assistant → Developer Tools → States
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor="ha-name">Display Name (optional)</label>
                <input id="ha-name" style={inputStyle} value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="Defaults to entity ID if blank" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="ha-type">Device Type</label>
                <select id="ha-type" style={inputStyle} value={form.type} onChange={e => update('type', e.target.value)}>
                  <option value="switch">Light / Switch</option>
                  <option value="sensor">Sensor</option>
                  <option value="generic">Generic</option>
                </select>
              </div>
            </>}

            {/* Shared: location + description */}
            <div>
              <label style={labelStyle} htmlFor="dev-location">Location (optional)</label>
              <input id="dev-location" style={inputStyle} value={form.location}
                onChange={e => update('location', e.target.value)} placeholder="e.g. Living Room" />
            </div>
            <div>
              <label style={labelStyle} htmlFor="dev-desc">Description (optional)</label>
              <textarea id="dev-desc" style={{ ...inputStyle, resize: 'none', height: 60 }}
                value={form.description}
                onChange={e => update('description', e.target.value)} rows={2}
                placeholder="What does this device do?" />
            </div>

            {error && (
              <div style={{
                fontFamily: C.sans, fontSize: '0.75rem', color: C.red, padding: '8px 12px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
              }}>{error}</div>
            )}
            {success && (
              <div style={{
                fontFamily: C.sans, fontSize: '0.75rem', color: C.green, padding: '8px 12px',
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
              }}>✓ {success}</div>
            )}

            <button
              id="register-device-btn"
              type="submit"
              disabled={saving}
              style={{
                all: 'unset', cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '11px 0', width: '100%', borderRadius: 10, boxSizing: 'border-box',
                fontFamily: C.sans, fontSize: '0.78rem', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                background: proto.bg, border: `1px solid ${proto.border}`,
                color: proto.color,
                opacity: saving ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <ProtoIcon size={14} />
              {saving ? 'Registering…' : `Add ${proto.label} Device`}
            </button>
          </form>
        </div>

        {/* ══ RIGHT: Unified device list ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header row */}
          <div className="devices-header-row" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{
                margin: 0, fontFamily: C.sans, fontSize: '1rem', fontWeight: 700,
                color: C.text1, letterSpacing: '0.04em',
              }}>
                All Devices
              </h2>
              <p style={{ margin: '3px 0 0', fontFamily: C.mono, fontSize: '0.68rem', color: C.text3 }}>
                {allDevices.length === 0
                  ? 'No devices yet.'
                  : `${allDevices.length} device${allDevices.length !== 1 ? 's' : ''} across all integrations`}
              </p>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.text3 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search devices…"
                style={{ ...inputStyle, paddingLeft: 28, width: 180, fontSize: '0.75rem' }}
              />
            </div>

            {/* View toggle: Flat / Grouped */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'flat',    Icon: List,   label: 'List' },
                { id: 'grouped', Icon: Layers, label: 'Groups' },
              ].map(({ id, Icon, label }) => (
                <button
                  key={id}
                  onClick={() => { setViewMode(id); if (id === 'grouped') fetchGroups() }}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 11px', borderRadius: 8,
                    fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
                    border: `1px solid ${viewMode === id ? 'rgba(26,46,255,0.45)' : C.border}`,
                    background: viewMode === id ? 'rgba(26,46,255,0.12)' : 'rgba(255,255,255,0.03)',
                    color: viewMode === id ? C.blue : C.text3,
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {/* Zigbee Network button */}
            <button
              onClick={() => setShowZigbeeMgr(v => !v)}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
                border: `1px solid ${showZigbeeMgr ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.25)'}`,
                background: showZigbeeMgr ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.07)',
                color: '#a78bfa',
                transition: 'all 0.15s',
              }}
              title="Zigbee network management"
            >
              <Network size={12} />
              Zigbee Network
            </button>

            {allDevices.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6,
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.green, boxShadow: `0 0 6px ${C.green}`,
                  animation: 'ledBlink 2s ease-in-out infinite',
                }} />
                <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.green, fontWeight: 700, letterSpacing: '0.06em' }}>
                  LIVE
                </span>
              </div>
            )}
          </div>

          {/* ── Grouped View ── */}
          {viewMode === 'grouped' ? (
            <GroupManager deviceStates={deviceStates} />
          ) : devices.length === 0 ? (
            <div style={{
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '56px 32px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 36, color: C.text3, marginBottom: 14 }}>⬡</div>
              {search ? (
                <p style={{ margin: 0, fontFamily: C.sans, fontSize: '0.85rem', color: C.text2 }}>
                  No devices match "<strong>{search}</strong>"
                </p>
              ) : (
                <>
                  <p style={{ margin: 0, fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text2 }}>
                    No devices registered yet
                  </p>
                  <p style={{ margin: '8px 0 0', fontFamily: C.sans, fontSize: '0.8rem', color: C.text3, lineHeight: 1.6 }}>
                    Use the form on the left to add a device.<br />
                    Supports MQTT, Zigbee, and Home Assistant.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {devices.map(([name, device]) => {
                const isOn      = String(device.status).toUpperCase() === 'ON'
                const isNumeric = !isNaN(parseFloat(device.status)) && device.status !== 'ON' && device.status !== 'OFF'
                const label     = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                const glyph     = resolveGlyph(name, device.type)
                const typeLabel = TYPE_LABELS[device.type] || 'Generic'
                const lastSeen  = device.last_updated
                  ? new Date(device.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null
                const src   = srcOf(device)
                const badge = BADGE[src] || BADGE[device.integration_source] || BADGE.mqtt

                // IP Camera — rendered as an inline preview tile
                if (device.type === 'ip_camera') {
                  return (
                    <CameraDeviceRow
                      key={name}
                      name={name}
                      device={device}
                      hasAlert={false}
                    />
                  )
                }

                // Find groups this device belongs to
                const deviceGroups = groups.filter(g => g.devices?.includes(name))

                return (
                  <div key={name} style={{
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: C.depth,
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${isOn ? C.green : isNumeric ? C.accent : badge.border}`,
                    borderRadius: 10,
                    transition: 'background 0.2s',
                  }}>

                    {/* Glyph icon box */}
                    <div style={{
                      fontSize: 18, width: 40, height: 40, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 8,
                      background: isOn ? 'rgba(34,197,94,0.08)' : C.panel,
                      border: `1px solid ${isOn ? 'rgba(34,197,94,0.2)' : C.border}`,
                      color: isOn ? C.green : C.text2,
                      boxShadow: isOn ? '0 0 10px rgba(34,197,94,0.15)' : 'none',
                      transition: 'all 0.2s',
                    }}>
                      {glyph}
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, color: C.text1 }}>
                          {label}
                        </span>
                        <span style={{
                          fontFamily: C.mono, fontSize: '0.6rem',
                          color: C.text3, background: C.panel,
                          padding: '1px 6px', borderRadius: 4,
                          border: `1px solid ${C.border}`,
                        }}>
                          {typeLabel}
                        </span>
                        <span style={{
                          fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: badge.color, background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          padding: '1px 6px', borderRadius: 4,
                        }}>
                          {badge.label}
                        </span>
                        {device.location && (
                          <span style={{ fontFamily: C.sans, fontSize: '0.7rem', color: C.text3 }}>◍ {device.location}</span>
                        )}
                        {/* Group badges */}
                        {deviceGroups.map(g => (
                          <span
                            key={g.id}
                            title={`Group: ${g.name}`}
                            style={{
                              fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600,
                              color: g.color,
                              background: `${g.color}18`,
                              border: `1px solid ${g.color}40`,
                              padding: '1px 7px', borderRadius: 4,
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            {g.icon} {g.name}
                          </span>
                        ))}
                      </div>
                      {device.topic_base && (
                        <div style={{
                          fontFamily: C.mono, fontSize: '0.65rem', color: C.text3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {device.topic_base}
                        </div>
                      )}
                      {device.description && (
                        <div style={{
                          fontFamily: C.sans, fontSize: '0.75rem', color: C.text2,
                          marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {device.description}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 56 }}>
                      {isNumeric ? (
                        <>
                          <div style={{ fontFamily: C.mono, fontSize: '1.1rem', fontWeight: 700, color: C.blue }}>
                            {device.status}
                          </div>
                          <div style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3 }}>
                            {device.unit || 'value'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{
                            fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                            color: isOn ? C.green : C.text3,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                            <div style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: isOn ? C.green : 'rgba(255,255,255,0.15)',
                              boxShadow: isOn ? `0 0 5px ${C.green}` : 'none',
                            }} />
                            {isOn ? 'ON' : 'OFF'}
                          </div>
                          {lastSeen && (
                            <div style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3, marginTop: 2 }}>
                              {lastSeen}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Delete — MQTT only */}
                    {src === 'mqtt' && (
                      <button
                        id={`delete-${name}`}
                        onClick={() => handleDelete(name)}
                        title="Remove device"
                        style={{
                          all: 'unset', cursor: 'pointer', flexShrink: 0,
                          width: 28, height: 28, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: C.text3, transition: 'all 0.15s',
                          border: '1px solid transparent',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = C.red
                          e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                          e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = C.text3
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = 'transparent'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Zigbee Network panel (collapsible) */}
          {showZigbeeMgr && (
            <div style={{ borderTop: `1px solid rgba(139,92,246,0.2)`, paddingTop: 20, marginTop: 4 }}>
              <ZigbeeManager deviceStates={deviceStates} wsMessages={wsMessages} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
