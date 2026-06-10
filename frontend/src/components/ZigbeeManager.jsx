import { useState, useEffect, useCallback } from 'react'
import { Radio, RefreshCw, X, Check, Edit2, Trash2 } from 'lucide-react'
import {
  zigbeePermitJoin,
  zigbeeRemoveDevice,
  zigbeeRenameDevice,
  getZigbeeStatus,
  commandDevice,
} from '../api'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  depth:  '#0d0d18',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  green:  '#22c55e',
  red:    '#ef4444',
  amber:  '#f59e0b',
  purple: '#a78bfa',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '7px 10px',
  fontFamily: C.sans, fontSize: '0.8rem', color: C.text1,
  outline: 'none',
}

/* ── Type metadata ── */
const ZIGBEE_TYPES = {
  zigbee_color_light:    { glyph: '◈', label: 'Color Light',    color: 'rgba(107,140,255,0.9)', canControl: true,  isSensor: false },
  zigbee_light:          { glyph: '◉', label: 'Dimmable Light', color: 'rgba(107,140,255,0.9)', canControl: true,  isSensor: false },
  zigbee_plug:           { glyph: '⏻', label: 'Smart Plug',     color: 'rgba(107,140,255,0.9)', canControl: true,  isSensor: false },
  zigbee_switch:         { glyph: '⚡', label: 'Switch',         color: 'rgba(107,140,255,0.9)', canControl: true,  isSensor: false },
  zigbee_climate_sensor: { glyph: '◈', label: 'Climate Sensor', color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: true  },
  zigbee_motion_sensor:  { glyph: '◐', label: 'Motion Sensor',  color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: true  },
  zigbee_contact_sensor: { glyph: '⬢', label: 'Door/Window',    color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: true  },
  zigbee_remote:         { glyph: '◫', label: 'Remote',         color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: false },
  zigbee_sensor:         { glyph: '⬡', label: 'Sensor',         color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: true  },
}
const getMeta = (type) => ZIGBEE_TYPES[type] || {
  glyph: '⬡', label: type?.replace('zigbee_','').replace(/_/g,' ') || 'Unknown',
  color: 'rgba(107,140,255,0.9)', canControl: false, isSensor: false,
}

/* ── Pairing countdown banner ── */
function PairingBanner({ duration, onStop }) {
  const [remaining, setRemaining] = useState(duration)
  useEffect(() => {
    if (remaining <= 0) { onStop(); return }
    const t = setInterval(() => setRemaining(r => r - 1), 1000)
    return () => clearInterval(t)
  }, [remaining, onStop])
  const pct = (remaining / duration) * 100
  return (
    <div style={{
      padding: '16px 20px',
      background: 'rgba(26,46,255,0.06)',
      border: '1px solid rgba(26,46,255,0.2)',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            background: '#1a2eff', boxShadow: `0 0 10px rgba(26,46,255,0.7)`,
            animation: 'ledBlink 0.8s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 700, color: '#6b8cff' }}>
            Zigbee Pairing Mode OPEN
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: C.mono, fontSize: '1.4rem', fontWeight: 800,
            color: remaining < 30 ? C.red : '#6b8cff',
          }}>
            {remaining}s
          </span>
          <button onClick={onStop} style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '5px 12px', borderRadius: 7,
            fontFamily: C.sans, fontSize: '0.68rem', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.12)', color: C.red,
          }}>
            STOP
          </button>
        </div>
      </div>
      <div style={{ height: 3, background: 'rgba(26,46,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: '#1a2eff',
          borderRadius: 3,
          transition: 'width 1s linear',
        }} />
      </div>
      <p style={{ margin: '10px 0 0', fontFamily: C.sans, fontSize: '0.78rem', color: 'rgba(107,140,255,0.7)', lineHeight: 1.6 }}>
        Power on your Zigbee device now. It will appear automatically once joined.
        Most devices need a <strong style={{ color: '#6b8cff' }}>factory reset</strong> before pairing.
      </p>
    </div>
  )
}

/* ── Pairing wizard modal ── */
function PairingWizard({ onStartPairing, onClose }) {
  const STEPS = [
    {
      glyph: '⚡', title: 'Verify dongle is connected',
      desc: 'The SONOFF ZBDongle-P (or similar) must be plugged in and Zigbee2MQTT must be running.',
      check: 'Zigbee2MQTT running',
    },
    {
      glyph: '⟳', title: 'Factory reset your device',
      desc: 'Hold the button 5–10 seconds until the LED flashes rapidly. Required before first pairing.',
      check: 'Device reset / ready',
    },
    {
      glyph: '◉', title: 'Open pairing mode',
      desc: 'Click "Start Pairing". The network opens for your chosen duration. Power on or reset your device.',
      check: null,
    },
  ]
  const [checked, setChecked] = useState([false, false])
  const [duration, setDuration] = useState(120)

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: C.depth,
        border: `1px solid rgba(26,46,255,0.25)`,
        borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 500,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        animation: 'fadeInUp 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: C.sans, fontSize: '1.05rem', fontWeight: 700, color: C.text1 }}>
              Pair New Zigbee Device
            </div>
            <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.text3, marginTop: 3 }}>
              Follow steps before opening the network
            </div>
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: C.text2 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 10,
              background: checked[i] ? 'rgba(26,46,255,0.05)' : C.panel,
              border: `1px solid ${checked[i] ? 'rgba(26,46,255,0.2)' : C.border}`,
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: 8,
                background: checked[i] ? 'rgba(26,46,255,0.10)' : 'rgba(26,46,255,0.06)',
                border: `1px solid ${checked[i] ? 'rgba(26,46,255,0.25)' : 'rgba(26,46,255,0.15)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: checked[i] ? '#6b8cff' : 'rgba(107,140,255,0.5)',
              }}>
                {checked[i] ? '✓' : step.glyph}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.text1, marginBottom: 3 }}>
                  Step {i + 1}: {step.title}
                </div>
                <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.text2, lineHeight: 1.6 }}>{step.desc}</div>
              </div>
              {step.check && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={checked[i] || false}
                    onChange={e => setChecked(cur => { const n=[...cur]; n[i]=e.target.checked; return n })}
                    style={{ accentColor: '#1a2eff', width: 14, height: 14 }} />
                  <span style={{ fontFamily: C.sans, fontSize: '0.65rem', color: C.text3, whiteSpace: 'nowrap' }}>
                    {step.check}
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Pairing Window
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[60, 120, 254].map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{
                all: 'unset', cursor: 'pointer',
                flex: 1, padding: '8px 0', borderRadius: 8, textAlign: 'center',
                fontFamily: C.sans, fontSize: '0.8rem', fontWeight: 600,
                border: `1px solid ${duration === d ? 'rgba(26,46,255,0.35)' : C.border}`,
                background: duration === d ? 'rgba(26,46,255,0.12)' : 'transparent',
                color: duration === d ? '#6b8cff' : C.text3,
                transition: 'all 0.15s',
              }}>
                {d === 254 ? 'Max' : `${d}s`}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => { onStartPairing(duration); onClose() }} style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '13px 0', borderRadius: 10, boxSizing: 'border-box',
          fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          background: 'rgba(26,46,255,0.15)', border: '1px solid rgba(26,46,255,0.35)',
          color: '#6b8cff',
        }}>
          <Radio size={14} />
          Start Pairing ({duration}s)
        </button>
      </div>
    </div>
  )
}

/* ── Status bar ── */
function ZigbeeStatusBar({ status }) {
  if (!status) return null
  const online = status.adapter_running
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '10px 16px', borderRadius: 10,
      background: C.panel, border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: online ? C.green : C.red,
          boxShadow: `0 0 6px ${online ? C.green : C.red}`,
          animation: online ? 'ledBlink 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 700, color: online ? C.green : C.red }}>
          {online ? 'Z2M ONLINE' : 'Z2M OFFLINE'}
        </span>
      </div>
      <div style={{ width: 1, height: 14, background: C.border }} />
      <span style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.text3 }}>
        <span style={{ color: C.blue, fontWeight: 700 }}>{status.zigbee_device_count}</span> devices on network
      </span>
      {status.base_topic && <>
        <div style={{ width: 1, height: 14, background: C.border }} />
        <span style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.text3 }}>
          topic: <span style={{ color: C.blue }}>{status.base_topic}</span>
        </span>
      </>}
      {!status.enabled && (
        <span style={{
          marginLeft: 'auto', fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.06em', color: C.red,
          background: 'rgba(239,68,68,0.08)', padding: '3px 8px',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5,
        }}>
          Set ZIGBEE2MQTT_ENABLED=true
        </span>
      )}
    </div>
  )
}

/* ── Single device row ── */
function ZigbeeDeviceRow({ name, data, onRemove, onRename }) {
  const meta     = getMeta(data.type)
  const isOn     = String(data.status).toUpperCase() === 'ON'
  const isOff    = String(data.status).toUpperCase() === 'OFFLINE'
  const label    = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const [toggling, setToggling] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName]   = useState(name)
  const [removing, setRemoving] = useState(false)
  const [showCaps, setShowCaps] = useState(false)

  const toggle = async () => {
    if (toggling || meta.isSensor) return
    setToggling(true)
    try { await commandDevice(name, isOn ? 'OFF' : 'ON') } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }

  const handleRename = async () => {
    if (!newName.trim() || newName === name) { setRenaming(false); return }
    try { await zigbeeRenameDevice(name, newName.trim()); onRename(name, newName.trim()) }
    catch (e) { console.error(e) }
    setRenaming(false)
  }

  const handleRemove = async () => {
    if (!confirm(`Remove "${label}" from the Zigbee network?`)) return
    setRemoving(true)
    try { await zigbeeRemoveDevice(name); onRemove(name) }
    catch (e) { console.error(e) }
    finally { setRemoving(false) }
  }

  const sensorDisplay = () => {
    const s = data.status
    if (s === 'unknown') return '—'
    if (data.type === 'zigbee_contact_sensor') return s === 'OPEN' ? 'OPEN' : 'CLOSED'
    if (data.type === 'zigbee_motion_sensor')  return s === 'ON'   ? 'MOTION' : 'CLEAR'
    if (data.unit) return `${s} ${data.unit}`
    return s
  }

  const caps = data.capabilities || []
  const colorBase = meta.color.replace(/[\d.]+\)$/, '')

  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 13,
      background: C.panel,
      border: `1px solid ${isOff ? 'rgba(239,68,68,0.18)' : C.border}`,
      borderLeft: `3px solid ${isOff ? C.red : isOn && !meta.isSensor ? '#1a2eff' : 'rgba(26,46,255,0.3)'}`,
      borderRadius: 10,
      transition: 'all 0.2s',
    }}>

      {/* Glyph box */}
      <div style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isOff ? C.panel : `${colorBase}0.1)`,
        border: `1px solid ${isOff ? C.border : `${colorBase}0.25)`}`,
        color: isOff ? C.text3 : meta.color,
        fontSize: 18,
        boxShadow: isOn && !meta.isSensor ? `0 0 10px rgba(26,46,255,0.15)` : 'none',
        filter: isOff ? 'grayscale(1) brightness(0.4)' : 'none',
        transition: 'all 0.2s',
      }}>
        {meta.glyph}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
              style={{ ...inputStyle, flex: 1, fontSize: '0.78rem', fontFamily: C.mono, padding: '4px 8px' }}
              autoFocus
            />
            <button onClick={handleRename} style={{ all:'unset', cursor:'pointer', color: '#6b8cff' }}><Check size={13} /></button>
            <button onClick={() => setRenaming(false)} style={{ all:'unset', cursor:'pointer', color: C.red }}><X size={13} /></button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{
              fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, color: C.text1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {label}
            </span>
            <button onClick={() => setRenaming(true)} style={{ all:'unset', cursor:'pointer', color: C.text3, opacity: 0.6 }} title="Rename">
              <Edit2 size={10} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: meta.color, background: `${colorBase}0.08)`,
            padding: '1px 6px', borderRadius: 4,
            border: `1px solid ${colorBase}0.2)`,
          }}>
            {meta.label}
          </span>
          {data.location && (
            <span style={{ fontFamily: C.sans, fontSize: '0.7rem', color: C.text3 }}>◍ {data.location}</span>
          )}
          {data.vendor && (
            <span style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.text3 }}>{data.vendor}</span>
          )}
          {data.ieee_address && (
            <span style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.text3, opacity: 0.45 }}>
              {data.ieee_address.slice(0, 12)}…
            </span>
          )}
        </div>

        {caps.length > 0 && (
          <>
            {showCaps && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {caps.map((c, i) => (
                  <span key={i} style={{
                    fontFamily: C.mono, fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4,
                    background: C.panel, border: `1px solid ${C.border}`, color: C.text3,
                  }}>{c.name}</span>
                ))}
              </div>
            )}
            <button onClick={() => setShowCaps(s => !s)}
              style={{ all: 'unset', cursor: 'pointer', fontFamily: C.sans, fontSize: '0.65rem', color: C.text3, marginTop: 3 }}>
              {showCaps ? '▲ hide' : `▼ ${caps.length} features`}
            </button>
          </>
        )}
      </div>

      {/* Status */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 58 }}>
        {meta.isSensor ? (
          <>
            <div style={{ fontFamily: C.mono, fontSize: '0.9rem', fontWeight: 700, color: meta.color }}>
              {sensorDisplay()}
            </div>
            {data.last_updated && (
              <div style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3 }}>
                {new Date(data.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        ) : (
          isOff
            ? <span style={{ fontFamily: C.mono, fontSize: '0.65rem', fontWeight: 700, color: C.red }}>OFFLINE</span>
            : <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 700, color: isOn ? '#6b8cff' : C.text3 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isOn ? '#1a2eff' : 'rgba(255,255,255,0.15)',
                  boxShadow: isOn ? `0 0 6px rgba(26,46,255,0.7)` : 'none',
                }} />
                {isOn ? 'ON' : 'OFF'}
              </div>
        )}
      </div>

      {/* Toggle */}
      {!meta.isSensor && (
        <button onClick={toggle} disabled={toggling || isOff} style={{
          all: 'unset', cursor: isOff ? 'not-allowed' : 'pointer',
          flexShrink: 0, width: 50, height: 28, borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: C.mono, fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.06em',
          background: isOn ? 'rgba(26,46,255,0.12)' : C.panel,
          border: `1px solid ${isOn ? 'rgba(26,46,255,0.30)' : C.border}`,
          color: isOn ? '#6b8cff' : C.text3,
          boxShadow: isOn ? '0 2px 10px rgba(26,46,255,0.15)' : 'none',
          opacity: isOff ? 0.4 : 1,
          transition: 'all 0.18s',
        }}>
          {toggling ? '…' : isOn ? 'ON' : 'OFF'}
        </button>
      )}

      {/* Remove */}
      <button onClick={handleRemove} disabled={removing} title="Remove from network"
        style={{
          all: 'unset', cursor: removing ? 'not-allowed' : 'pointer',
          width: 26, height: 26, flexShrink: 0, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.text3, transition: 'all 0.15s',
          border: '1px solid transparent',
        }}
        onMouseEnter={e => { e.currentTarget.style.color=C.red; e.currentTarget.style.background='rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.2)' }}
        onMouseLeave={e => { e.currentTarget.style.color=C.text3; e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent' }}
      >
        {removing ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />}
      </button>
    </div>
  )
}

/* ── Filter bar ── */
const FILTERS = [
  { key: 'all',     label: 'All' },
  { key: 'lights',  label: 'Lights' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'plugs',   label: 'Plugs' },
  { key: 'other',   label: 'Other' },
]

/* ── Main component ── */
export default function ZigbeeManager({ deviceStates, wsMessages }) {
  const [status, setStatus]         = useState(null)
  const [pairing, setPairing]       = useState(false)
  const [pairDur, setPairDur]       = useState(120)
  const [showWizard, setShowWizard] = useState(false)
  const [filter, setFilter]         = useState('all')
  const [sort, setSort]             = useState('name')
  const [search, setSearch]         = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [devices, setDevices]       = useState({})

  const refreshStatus = useCallback(async () => {
    try { setStatus(await getZigbeeStatus().then(r => r.data)) } catch {}
  }, [])

  useEffect(() => {
    refreshStatus()
    const t = setInterval(refreshStatus, 10000)
    return () => clearInterval(t)
  }, [refreshStatus])

  useEffect(() => {
    const z = {}
    Object.entries(deviceStates || {}).forEach(([n, d]) => {
      const src = d.integration_source || (d.zigbee || d.type?.startsWith('zigbee_') ? 'zigbee' : null)
      if (src === 'zigbee') z[n] = d
    })
    setDevices(z)
  }, [deviceStates])

  useEffect(() => {
    if (wsMessages?.type === 'zigbee_pairing') {
      setPairing(wsMessages.active)
      if (wsMessages.active) setPairDur(wsMessages.duration || 120)
    }
  }, [wsMessages])

  const handleStartPairing = async (dur) => {
    setError('')
    try {
      await zigbeePermitJoin(true, dur)
      setPairing(true); setPairDur(dur)
      setSuccess('Pairing mode open. Power on your device.')
      setTimeout(() => setSuccess(''), 4000)
    } catch { setError('Failed to open pairing mode. Is Zigbee2MQTT running?') }
  }

  const handleStopPairing = useCallback(async () => {
    try { await zigbeePermitJoin(false) } catch {}
    setPairing(false)
  }, [])

  const handleRemove = (name) => {
    setDevices(cur => { const n={...cur}; delete n[name]; return n })
    setSuccess(`Removed "${name}" from network.`)
    setTimeout(() => setSuccess(''), 3000)
    refreshStatus()
  }

  const handleRename = (oldName, newName) => {
    setDevices(cur => {
      const n = {...cur}
      if (n[oldName]) { n[newName] = {...n[oldName], name: newName}; delete n[oldName] }
      return n
    })
  }

  const filterDev = ([, d]) => {
    const t = d.type || ''
    if (filter === 'lights')  return t.includes('light')
    if (filter === 'sensors') return t.includes('sensor')
    if (filter === 'plugs')   return t.includes('plug') || t.includes('switch')
    if (filter === 'other')   return t.includes('remote') || (!t.includes('light') && !t.includes('sensor') && !t.includes('plug') && !t.includes('switch'))
    return true
  }

  const sortDev = (a, b) => {
    if (sort === 'name')   return a[0].localeCompare(b[0])
    if (sort === 'type')   return (a[1].type||'').localeCompare(b[1].type||'')
    if (sort === 'status') return (a[1].status||'').localeCompare(b[1].status||'')
    if (sort === 'recent') return new Date(b[1].last_updated||0) - new Date(a[1].last_updated||0)
    return 0
  }

  const allEntries     = Object.entries(devices)
  const searchFiltered = allEntries.filter(([name, d]) =>
    !search || name.toLowerCase().includes(search.toLowerCase())
    || (d.vendor||'').toLowerCase().includes(search.toLowerCase())
    || (d.description||'').toLowerCase().includes(search.toLowerCase())
  )
  const visible = searchFiltered.filter(filterDev).sort(sortDev)

  const counts = {
    all:     searchFiltered.length,
    lights:  searchFiltered.filter(([,d]) => d.type?.includes('light')).length,
    sensors: searchFiltered.filter(([,d]) => d.type?.includes('sensor')).length,
    plugs:   searchFiltered.filter(([,d]) => d.type?.includes('plug') || d.type?.includes('switch')).length,
    other:   searchFiltered.filter(([,d]) => d.type?.includes('remote')).length,
  }

  return (
    <>
      {showWizard && <PairingWizard onStartPairing={handleStartPairing} onClose={() => setShowWizard(false)} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: C.sans, fontSize: '1rem', fontWeight: 700, color: C.text1 }}>
              Zigbee Network
            </h2>
            <p style={{ margin: '3px 0 0', fontFamily: C.mono, fontSize: '0.68rem', color: C.text3 }}>
              {allEntries.length} device{allEntries.length !== 1 ? 's' : ''} via Zigbee2MQTT
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowWizard(true)} style={{
              all: 'unset', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 9,
              fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'rgba(26,46,255,0.12)', border: '1px solid rgba(26,46,255,0.30)',
              color: '#6b8cff',
            }}>
              <Radio size={12} /> Pair Device
            </button>
            <button onClick={refreshStatus} title="Refresh" style={{
              all: 'unset', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 10px', borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel, color: C.text2,
            }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Status bar */}
        <ZigbeeStatusBar status={status} />

        {error && (
          <div style={{
            fontFamily: C.sans, fontSize: '0.78rem', color: C.red, padding: '9px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            fontFamily: C.sans, fontSize: '0.78rem', color: '#6b8cff', padding: '9px 14px', borderRadius: 8,
            background: 'rgba(26,46,255,0.07)', border: '1px solid rgba(26,46,255,0.18)',
          }}>✓ {success}</div>
        )}

        {/* Pairing banner */}
        {pairing && <PairingBanner duration={pairDur} onStop={handleStopPairing} />}

        {/* Search + filter */}
        {allEntries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.text3, fontSize: 12 }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, vendor…"
                style={{ ...inputStyle, paddingLeft: 30 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 11px', borderRadius: 7,
                  fontFamily: C.sans, fontSize: '0.72rem', fontWeight: filter === f.key ? 600 : 400,
                  border: `1px solid ${filter === f.key ? 'rgba(26,46,255,0.4)' : C.border}`,
                  background: filter === f.key ? 'rgba(26,46,255,0.12)' : 'transparent',
                  color: filter === f.key ? C.blue : C.text2,
                  transition: 'all 0.15s',
                }}>
                  {f.label}
                  {counts[f.key] > 0 && (
                    <span style={{
                      minWidth: 14, height: 14, borderRadius: 99, padding: '0 3px',
                      background: filter === f.key ? 'rgba(26,46,255,0.3)' : C.panel,
                      fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{counts[f.key]}</span>
                  )}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.text3 }}>Sort:</span>
                <select value={sort} onChange={e => setSort(e.target.value)}
                  style={{ ...inputStyle, padding: '4px 8px', width: 'auto', fontSize: '0.7rem' }}>
                  <option value="name">Name</option>
                  <option value="type">Type</option>
                  <option value="status">Status</option>
                  <option value="recent">Recent</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Device list */}
        {allEntries.length === 0 ? (
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '56px 32px', textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, color: 'rgba(107,140,255,0.2)' }}>
              <Radio size={48} />
            </div>
            <p style={{ margin: 0, fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 700, color: C.text2 }}>
              No Zigbee devices discovered
            </p>
            <p style={{ margin: '10px 0 24px', fontFamily: C.sans, fontSize: '0.8rem', color: C.text3, lineHeight: 1.7 }}>
              Ensure Zigbee2MQTT is running and your USB dongle is connected.
            </p>
            <button onClick={() => setShowWizard(true)} style={{
              all: 'unset', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '11px 22px', borderRadius: 10,
              fontFamily: C.sans, fontSize: '0.8rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'rgba(26,46,255,0.12)', border: '1px solid rgba(26,46,255,0.30)',
              color: '#6b8cff',
            }}>
              <Radio size={13} /> Pair First Device
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontFamily: C.sans, fontSize: '0.85rem', color: C.text3 }}>
            No devices match your filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(
              visible.reduce((groups, [name, data]) => {
                const t = data.type || 'unknown'
                if (!groups[t]) groups[t] = []
                groups[t].push([name, data])
                return groups
              }, {})
            ).map(([type, devs]) => {
              const meta = getMeta(type)
              return (
                <div key={type}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, padding: '3px 0' }}>
                    <span style={{ fontSize: 13, color: meta.color }}>{meta.glyph}</span>
                    <span style={{
                      fontFamily: C.mono, fontSize: '0.62rem', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase', color: meta.color,
                    }}>{meta.label}s</span>
                    <span style={{
                      fontFamily: C.mono, fontSize: '0.6rem', color: C.text3,
                      background: C.panel, padding: '1px 6px', borderRadius: 4,
                    }}>{devs.length}</span>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {devs.map(([name, data]) => (
                      <ZigbeeDeviceRow key={name} name={name} data={data} onRemove={handleRemove} onRename={handleRename} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Stats strip */}
        {allEntries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Total',   value: allEntries.length,                                                                       color: C.text1  },
              { label: 'Online',  value: allEntries.filter(([,d]) => String(d.status).toUpperCase() !== 'OFFLINE' && d.status !== 'unknown').length, color: '#6b8cff' },
              { label: 'Offline', value: allEntries.filter(([,d]) => String(d.status).toUpperCase() === 'OFFLINE').length,        color: C.red    },
              { label: 'Sensors', value: allEntries.filter(([,d]) => (d.type||'').includes('sensor')).length,                    color: C.text2  },
            ].map(s => (
              <div key={s.label} style={{
                padding: '10px 14px', borderRadius: 10,
                background: C.panel, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontFamily: C.sans, fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{
                  fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: C.text3, marginTop: 2,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
