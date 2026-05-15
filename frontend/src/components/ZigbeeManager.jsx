/**
 * ZigbeeManager.jsx
 * ─────────────────
 * Full Zigbee device management page.
 * Handles: discovery display, pairing wizard, device removal, rename, status.
 * Replaces the MQTT-only Devices tab for Zigbee devices.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getState,
  zigbeePermitJoin,
  zigbeeRemoveDevice,
  zigbeeRenameDevice,
  getZigbeeStatus,
  commandDevice,
  zigbeeSet,
} from '../api'

/* ─── Type metadata ─────────────────────────────────────────────────────── */
const ZIGBEE_TYPES = {
  zigbee_color_light:    { icon: '🌈', label: 'Color Light',     color: 'rgba(167,139,250,0.9)', canControl: true,  isSensor: false },
  zigbee_light:          { icon: '💡', label: 'Dimmable Light',  color: 'rgba(251,191,36,0.9)',  canControl: true,  isSensor: false },
  zigbee_plug:           { icon: '🔌', label: 'Smart Plug',      color: 'rgba(34,197,94,0.9)',   canControl: true,  isSensor: false },
  zigbee_switch:         { icon: '⚡', label: 'Switch',          color: 'rgba(37,99,235,0.9)',   canControl: true,  isSensor: false },
  zigbee_climate_sensor: { icon: '🌡️', label: 'Climate Sensor',  color: 'rgba(239,68,68,0.9)',   canControl: false, isSensor: true  },
  zigbee_motion_sensor:  { icon: '🚶', label: 'Motion Sensor',   color: 'rgba(234,179,8,0.9)',   canControl: false, isSensor: true  },
  zigbee_contact_sensor: { icon: '🚪', label: 'Door/Window',     color: 'rgba(251,146,60,0.9)',  canControl: false, isSensor: true  },
  zigbee_remote:         { icon: '🎛️', label: 'Remote/Switch',  color: 'rgba(99,102,241,0.9)',  canControl: false, isSensor: false },
  zigbee_sensor:         { icon: '📡', label: 'Sensor',          color: 'rgba(107,114,128,0.9)', canControl: false, isSensor: true  },
}

const getMeta = (type) => ZIGBEE_TYPES[type] || { icon: '⬡', label: type?.replace('zigbee_','').replace(/_/g,' ') || 'Unknown', color: 'rgba(107,114,128,0.9)', canControl: false, isSensor: false }

/* ─── Pairing countdown timer ───────────────────────────────────────────── */
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
      background: 'rgba(99,102,241,0.08)',
      border: '1px solid rgba(99,102,241,0.30)',
      borderRadius: 16,
      padding: '18px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      animation: 'pairingPulse 2s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: 'rgba(99,102,241,0.9)',
            boxShadow: '0 0 10px rgba(99,102,241,0.8)',
            animation: 'ledPulse 1s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(167,139,250,1)' }}>
            🔗 Zigbee Pairing Mode OPEN
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 22, fontWeight: 800,
            color: remaining < 30 ? '#f87171' : 'rgba(167,139,250,1)',
          }}>
            {remaining}s
          </span>
          <button
            onClick={onStop}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: 'rgba(248,113,113,0.15)', color: '#f87171',
              cursor: 'pointer', fontWeight: 700, fontSize: 12,
            }}>
            Stop
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${pct}%`,
          background: 'linear-gradient(90deg, rgba(99,102,241,0.9), rgba(167,139,250,0.9))',
          boxShadow: '0 0 8px rgba(99,102,241,0.5)',
          transition: 'width 1s linear',
        }} />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'rgba(167,139,250,0.7)', lineHeight: 1.6 }}>
        Power on your Zigbee device now. It will appear in the list automatically once joined.
        Most devices need a <strong style={{ color: 'rgba(167,139,250,0.9)' }}>factory reset</strong> before pairing (hold button 5-10s until LED flashes).
      </p>
    </div>
  )
}

/* ─── Single device row ─────────────────────────────────────────────────── */
function ZigbeeDeviceRow({ name, data, onRemove, onRename, wsMessages }) {
  const meta      = getMeta(data.type)
  const isOn      = String(data.status).toUpperCase() === 'ON'
  const isOffline = String(data.status).toUpperCase() === 'OFFLINE'
  const label     = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const [toggling, setToggling]   = useState(false)
  const [renaming, setRenaming]   = useState(false)
  const [newName, setNewName]     = useState(name)
  const [removing, setRemoving]   = useState(false)
  const [showCaps, setShowCaps]   = useState(false)

  const toggle = async () => {
    if (toggling || meta.isSensor) return
    setToggling(true)
    try {
      if (data.zigbee) {
        await zigbeeSet(name, { state: isOn ? 'OFF' : 'ON' })
      } else {
        await commandDevice(name, isOn ? 'OFF' : 'ON')
      }
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }

  const handleRename = async () => {
    if (!newName.trim() || newName === name) { setRenaming(false); return }
    try {
      await zigbeeRenameDevice(name, newName.trim())
      onRename(name, newName.trim())
    } catch (e) { console.error(e) }
    setRenaming(false)
  }

  const handleRemove = async () => {
    if (!confirm(`Remove "${label}" from the Zigbee network? The device will need to be re-paired.`)) return
    setRemoving(true)
    try { await zigbeeRemoveDevice(name); onRemove(name) }
    catch (e) { console.error(e) }
    finally { setRemoving(false) }
  }

  // Format sensor value for display
  const sensorDisplay = () => {
    const s = data.status
    if (s === 'unknown') return '—'
    if (data.type === 'zigbee_contact_sensor') return s === 'OPEN' ? '🔓 Open' : '🔒 Closed'
    if (data.type === 'zigbee_motion_sensor')  return s === 'ON'   ? '🚶 Motion' : '😴 Clear'
    if (data.unit) return `${s} ${data.unit}`
    return s
  }

  const caps = data.capabilities || []

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isOffline ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
      borderLeft: `3px solid ${isOffline ? '#ef4444' : meta.color}`,
      borderRadius: 14,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'all 0.2s',
    }}>

      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        background: `${meta.color.replace('0.9','0.1')}`,
        border: `1px solid ${meta.color.replace('0.9','0.25')}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        filter: isOffline ? 'grayscale(1) brightness(0.5)' : 'none',
        boxShadow: !isOffline && isOn ? `0 0 14px ${meta.color.replace('0.9','0.3')}` : 'none',
      }}>
        {meta.icon}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
              style={{
                background: 'var(--bg-dark)', border: '1px solid var(--accent)',
                borderRadius: 6, padding: '4px 8px', color: 'var(--text-main)',
                fontSize: 13, fontWeight: 700, outline: 'none', flex: 1,
              }}
              autoFocus
            />
            <button onClick={handleRename} style={{ all: 'unset', cursor: 'pointer', color: '#22c55e', fontSize: 16, padding: '0 4px' }}>✓</button>
            <button onClick={() => setRenaming(false)} style={{ all: 'unset', cursor: 'pointer', color: '#f87171', fontSize: 16, padding: '0 4px' }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
            <button
              onClick={() => setRenaming(true)}
              title="Rename device"
              style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, opacity: 0.6 }}
            >✏️</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: meta.color, background: meta.color.replace('0.9', '0.1'),
            padding: '2px 7px', borderRadius: 99, border: `1px solid ${meta.color.replace('0.9','0.25')}`,
          }}>
            {meta.label}
          </span>
          {data.location && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📍 {data.location}</span>
          )}
          {data.vendor && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {data.vendor}
            </span>
          )}
          {data.ieee_address && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', opacity: 0.5 }}>
              {data.ieee_address.slice(0, 12)}…
            </span>
          )}
        </div>

        {/* Capabilities pill row */}
        {caps.length > 0 && showCaps && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {caps.map((c, i) => (
              <span key={i} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 99,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace',
              }}>
                {c.name}
              </span>
            ))}
          </div>
        )}

        {caps.length > 0 && (
          <button
            onClick={() => setShowCaps(s => !s)}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}
          >
            {showCaps ? '▲ hide' : `▼ ${caps.length} features`}
          </button>
        )}
      </div>

      {/* Status / value */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 64 }}>
        {meta.isSensor ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: meta.color, fontFamily: 'JetBrains Mono, monospace' }}>
              {sensorDisplay()}
            </div>
            {data.last_updated && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                {new Date(data.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        ) : (
          <>
            {isOffline && <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', letterSpacing: '0.06em' }}>OFFLINE</div>}
            {!isOffline && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end',
                fontSize: 12, fontWeight: 700,
                color: isOn ? '#22c55e' : 'var(--text-muted)',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: isOn ? '#22c55e' : '#3a4148',
                  boxShadow: isOn ? '0 0 6px #22c55e' : 'none',
                }} />
                {isOn ? 'ON' : 'OFF'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Toggle button */}
      {!meta.isSensor && (
        <button
          onClick={toggle}
          disabled={toggling || isOffline}
          style={{
            flexShrink: 0, width: 52, height: 30, borderRadius: 8,
            border: 'none', cursor: isOffline ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 11, letterSpacing: '0.06em',
            background: isOn
              ? 'linear-gradient(135deg, #16a34a, #22c55e)'
              : 'var(--bg-dark)',
            color: isOn ? '#fff' : 'var(--text-muted)',
            boxShadow: isOn ? '0 2px 10px rgba(34,197,94,0.35)' : 'var(--sh-trough)',
            opacity: isOffline ? 0.4 : 1,
            transition: 'all 0.18s',
          }}
        >
          {toggling ? '…' : isOn ? 'ON' : 'OFF'}
        </button>
      )}

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={removing}
        title="Remove from Zigbee network"
        style={{
          all: 'unset', cursor: removing ? 'not-allowed' : 'pointer',
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 14,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
      >
        {removing ? '⏳' : '✕'}
      </button>
    </div>
  )
}

/* ─── Pairing wizard ────────────────────────────────────────────────────── */
function PairingWizard({ onStartPairing, onClose }) {
  const STEPS = [
    {
      icon: '⚡',
      title: 'Make sure your dongle is connected',
      desc: 'The SONOFF ZBDongle-P (or similar) must be plugged into USB and Zigbee2MQTT must be running.',
      check: 'Zigbee2MQTT running',
    },
    {
      icon: '🔄',
      title: 'Reset your Zigbee device',
      desc: 'Most devices need a factory reset before pairing. Hold the button on your device for 5–10 seconds until the LED flashes rapidly. Refer to your device\\'s manual.',
      check: 'Device reset / ready',
    },
    {
      icon: '🔗',
      title: 'Open pairing mode',
      desc: 'Click "Start Pairing" below. The network will be open for 2 minutes. Power on or reset your device to trigger the join.',
      check: null,
    },
  ]

  const [checked, setChecked]   = useState([false, false])
  const [duration, setDuration] = useState(120)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 20,
        padding: 28,
        width: '100%', maxWidth: 500,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>Pair a New Zigbee Device</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Follow these steps before opening the network</div>
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '14px 16px',
              background: checked[i] ? 'rgba(34,197,94,0.05)' : 'var(--bg-dark)',
              border: `1px solid ${checked[i] ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 12,
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: checked[i] ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.1)',
                border: `1px solid ${checked[i] ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                {checked[i] ? '✅' : step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                  Step {i + 1}: {step.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
              {step.check && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox"
                    checked={checked[i]}
                    onChange={e => setChecked(cur => { const n = [...cur]; n[i] = e.target.checked; return n })}
                    style={{ accentColor: '#22c55e', width: 16, height: 16 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{step.check}</span>
                </label>
              )}
            </div>
          ))}
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20 }}>
          <label className="neu-label">Pairing window duration</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[60, 120, 254].map(d => (
              <button key={d} onClick={() => setDuration(d)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: duration === d ? 'var(--accent)' : 'var(--bg-dark)',
                  color: duration === d ? '#fff' : 'var(--text-muted)',
                  boxShadow: duration === d ? '0 2px 10px rgba(37,99,235,0.3)' : 'var(--sh-trough)',
                  transition: 'all 0.15s',
                }}>
                {d === 254 ? 'Max' : `${d}s`}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => { onStartPairing(duration); onClose() }}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontWeight: 800, fontSize: 13,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(167,139,250,0.9))',
            color: '#fff',
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
            transition: 'all 0.2s',
          }}>
          🔗 Start Pairing ({duration}s)
        </button>
      </div>
    </div>
  )
}

/* ─── Status bar ────────────────────────────────────────────────────────── */
function ZigbeeStatusBar({ status }) {
  if (!status) return null

  const statusColor = status.adapter_running ? '#22c55e' : '#f87171'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 18px',
      background: 'var(--bg-dark)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 12,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: statusColor,
          boxShadow: `0 0 6px ${statusColor}`,
          animation: status.adapter_running ? 'ledPulse 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
          {status.adapter_running ? 'Zigbee2MQTT Connected' : 'Zigbee2MQTT Offline'}
        </span>
      </div>

      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{status.zigbee_device_count}</span> device{status.zigbee_device_count !== 1 ? 's' : ''} on network
      </div>

      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
        topic: <span style={{ color: 'var(--accent-light)' }}>{status.base_topic}</span>
      </div>

      {!status.enabled && (
        <div style={{ marginLeft: 'auto' }}>
          <span className="neu-badge" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', fontSize: 10 }}>
            Set ZIGBEE2MQTT_ENABLED=true in .env
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Filter/sort bar ───────────────────────────────────────────────────── */
function FilterBar({ filter, setFilter, sort, setSort, counts }) {
  const FILTERS = [
    { key: 'all',     label: 'All',     count: counts.all },
    { key: 'lights',  label: 'Lights',  count: counts.lights },
    { key: 'sensors', label: 'Sensors', count: counts.sensors },
    { key: 'plugs',   label: 'Plugs',   count: counts.plugs },
    { key: 'other',   label: 'Other',   count: counts.other },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 99, border: 'none',
              cursor: 'pointer', fontSize: 11, fontWeight: filter === f.key ? 700 : 500,
              background: filter === f.key ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: filter === f.key ? '#fff' : 'var(--text-muted)',
              boxShadow: filter === f.key ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            {f.label}
            {f.count > 0 && (
              <span style={{
                minWidth: 16, height: 16, borderRadius: 99, padding: '0 4px',
                background: filter === f.key ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sort:</span>
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{
            background: 'var(--bg-dark)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 7, padding: '4px 8px', color: 'var(--text-dim)',
            fontSize: 11, outline: 'none', cursor: 'pointer',
          }}>
          <option value="name">Name</option>
          <option value="type">Type</option>
          <option value="status">Status</option>
          <option value="recent">Recently Updated</option>
        </select>
      </div>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────────────── */
export default function ZigbeeManager({ deviceStates, wsMessages }) {
  const [status, setStatus]         = useState(null)
  const [pairing, setPairing]       = useState(false)
  const [pairingDuration, setPairingDuration] = useState(120)
  const [showWizard, setShowWizard] = useState(false)
  const [filter, setFilter]         = useState('all')
  const [sort, setSort]             = useState('name')
  const [search, setSearch]         = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [devices, setDevices]       = useState({})
  const stopPairingRef              = useRef(null)

  // Fetch status
  const refreshStatus = useCallback(async () => {
    try { setStatus(await getZigbeeStatus().then(r => r.data)) } catch {}
  }, [])

  useEffect(() => {
    refreshStatus()
    const t = setInterval(refreshStatus, 10000)
    return () => clearInterval(t)
  }, [refreshStatus])

  // Sync device states
  useEffect(() => {
    const zigbee = {}
    Object.entries(deviceStates || {}).forEach(([name, data]) => {
      if (data.type?.startsWith('zigbee_') || data.zigbee) {
        zigbee[name] = data
      }
    })
    setDevices(zigbee)
  }, [deviceStates])

  // Handle pairing WS event
  useEffect(() => {
    if (wsMessages?.type === 'zigbee_pairing') {
      setPairing(wsMessages.active)
      if (wsMessages.active) setPairingDuration(wsMessages.duration || 120)
    }
  }, [wsMessages])

  // Start pairing
  const handleStartPairing = async (duration) => {
    setError('')
    try {
      await zigbeePermitJoin(true, duration)
      setPairing(true)
      setPairingDuration(duration)
      setSuccess('Pairing mode opened. Power on your device.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError('Failed to open pairing mode. Is Zigbee2MQTT running?')
    }
  }

  const handleStopPairing = useCallback(async () => {
    try { await zigbeePermitJoin(false) }
    catch {}
    setPairing(false)
  }, [])

  const handleRemove = (name) => {
    setDevices(cur => { const n = { ...cur }; delete n[name]; return n })
    setSuccess(`Removed "${name}" from network.`)
    setTimeout(() => setSuccess(''), 3000)
    refreshStatus()
  }

  const handleRename = (oldName, newName) => {
    setDevices(cur => {
      const n = { ...cur }
      if (n[oldName]) { n[newName] = { ...n[oldName], name: newName }; delete n[oldName] }
      return n
    })
  }

  // Filter + sort
  const filterDevice = ([name, data]) => {
    const type = data.type || ''
    if (filter === 'lights')  return type.includes('light')
    if (filter === 'sensors') return type.includes('sensor')
    if (filter === 'plugs')   return type.includes('plug') || type.includes('switch')
    if (filter === 'other')   return type.includes('remote') || (!type.includes('light') && !type.includes('sensor') && !type.includes('plug') && !type.includes('switch'))
    return true
  }

  const sortDevices = (a, b) => {
    if (sort === 'name')    return a[0].localeCompare(b[0])
    if (sort === 'type')    return (a[1].type || '').localeCompare(b[1].type || '')
    if (sort === 'status')  return (a[1].status || '').localeCompare(b[1].status || '')
    if (sort === 'recent')  return new Date(b[1].last_updated || 0) - new Date(a[1].last_updated || 0)
    return 0
  }

  const allEntries = Object.entries(devices)
  const searchFiltered = allEntries.filter(([name, data]) =>
    !search || name.toLowerCase().includes(search.toLowerCase()) ||
    (data.vendor || '').toLowerCase().includes(search.toLowerCase()) ||
    (data.description || '').toLowerCase().includes(search.toLowerCase())
  )
  const visible = searchFiltered.filter(filterDevice).sort(sortDevices)

  const counts = {
    all:     searchFiltered.length,
    lights:  searchFiltered.filter(([,d]) => d.type?.includes('light')).length,
    sensors: searchFiltered.filter(([,d]) => d.type?.includes('sensor')).length,
    plugs:   searchFiltered.filter(([,d]) => d.type?.includes('plug') || d.type?.includes('switch')).length,
    other:   searchFiltered.filter(([,d]) => d.type?.includes('remote')).length,
  }

  return (
    <>
      <style>{`
        @keyframes pairingPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          50%       { box-shadow: 0 0 0 6px rgba(99,102,241,0.08); }
        }
      `}</style>

      {showWizard && (
        <PairingWizard
          onStartPairing={handleStartPairing}
          onClose={() => setShowWizard(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>🔗</div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-main)' }}>
                Zigbee Devices
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Auto-discovered from Zigbee2MQTT — all device types supported
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowWizard(true)}
              style={{
                padding: '9px 18px', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontWeight: 700, fontSize: 12,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(167,139,250,0.8))',
                color: '#fff',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
              🔗 Pair New Device
            </button>
            <button
              onClick={refreshStatus}
              className="neu-btn"
              style={{ padding: '9px 14px', fontSize: 12 }}
              title="Refresh device list">
              ⟳
            </button>
          </div>
        </div>

        {/* ── Status Bar ── */}
        <ZigbeeStatusBar status={status} />

        {/* ── Alerts ── */}
        {error   && <div className="neu-alert-error">{error}</div>}
        {success && <div className="neu-alert-success">✓ {success}</div>}

        {/* ── Active Pairing Banner ── */}
        {pairing && (
          <PairingBanner duration={pairingDuration} onStop={handleStopPairing} />
        )}

        {/* ── Search + Filters ── */}
        {allEntries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, vendor, model…"
                className="neu-input"
                style={{ paddingLeft: 36 }}
              />
            </div>
            <FilterBar filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} counts={counts} />
          </div>
        )}

        {/* ── Device List ── */}
        {allEntries.length === 0 ? (
          <div className="neu-section" style={{ padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.3 }}>🔗</div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-dim)' }}>
              No Zigbee devices discovered yet
            </p>
            <p style={{ margin: '10px 0 24px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Make sure Zigbee2MQTT is running and your USB dongle is connected.<br />
              Then pair your first device to get started.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowWizard(true)}
                style={{
                  padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(167,139,250,0.8))',
                  color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                }}>
                🔗 Pair First Device
              </button>
              <div className="neu-alert-info" style={{ padding: '10px 16px', fontSize: 12, textAlign: 'left', maxWidth: 360 }}>
                💡 Or ask AI Chat: <em style={{ color: 'var(--accent-light)' }}>"pair a new Zigbee bulb"</em>
              </div>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No devices match your filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Group by type */}
            {Object.entries(
              visible.reduce((groups, [name, data]) => {
                const type = data.type || 'unknown'
                if (!groups[type]) groups[type] = []
                groups[type].push([name, data])
                return groups
              }, {})
            ).map(([type, devs]) => {
              const meta = getMeta(type)
              return (
                <div key={type}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 2px', marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 14 }}>{meta.icon}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: meta.color,
                    }}>{meta.label}s</span>
                    <span style={{
                      fontSize: 9, color: 'var(--text-muted)',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '1px 6px', borderRadius: 99,
                    }}>{devs.length}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)', marginLeft: 4 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {devs.map(([name, data]) => (
                      <ZigbeeDeviceRow
                        key={name}
                        name={name}
                        data={data}
                        onRemove={handleRemove}
                        onRename={handleRename}
                        wsMessages={wsMessages}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Quick Stats ── */}
        {allEntries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'Total Devices',  value: allEntries.length,                                                            color: 'var(--text-main)' },
              { label: 'Online',         value: allEntries.filter(([,d]) => String(d.status).toUpperCase() !== 'OFFLINE' && d.status !== 'unknown').length, color: '#22c55e' },
              { label: 'Offline',        value: allEntries.filter(([,d]) => String(d.status).toUpperCase() === 'OFFLINE').length,  color: '#ef4444' },
              { label: 'Sensors',        value: allEntries.filter(([,d]) => (d.type||'').includes('sensor')).length,          color: 'rgba(251,191,36,0.9)' },
            ].map(s => (
              <div key={s.label} className="neu-plate" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
