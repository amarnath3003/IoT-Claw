import { useEffect, useMemo, useState } from 'react'
import { commandDevice, getDevicePreviewUrl, getTelemetry, getScriptHistory, rollbackScript, getTelemetryExportUrl, callMcpTool } from '../api'
import EdgeConsole from './EdgeConsole'
import { Power, ScrollText, Terminal, Wrench, Download, MapPin } from 'lucide-react'

/* ── Design tokens ── */
const C = {
  panel:   'rgba(255,255,255,0.03)',
  depth:   'rgba(255,255,255,0.02)',
  bg:      '#09090f',
  border:  'rgba(255,255,255,0.07)',
  text1:   'rgba(255,255,255,0.82)',
  text2:   'rgba(255,255,255,0.50)',
  text3:   'rgba(255,255,255,0.25)',
  accent:  '#1a2eff',
  blue:    '#6b8cff',
  green:   '#22c55e',
  red:     '#ef4444',
  amber:   '#f59e0b',
  purple:  '#a78bfa',
  sans:    "'Outfit', sans-serif",
  mono:    "'JetBrains Mono', ui-monospace, monospace",
}

/* ── Integration badge ── */
const INTEGRATION_BADGE = {
  mqtt:   { label: 'MQTT',   color: '#6b8cff', bg: 'rgba(26,46,255,0.08)', border: 'rgba(26,46,255,0.18)' },
  zigbee: { label: 'Zigbee', color: '#6b8cff', bg: 'rgba(26,46,255,0.08)', border: 'rgba(26,46,255,0.18)' },
  ha:     { label: 'HA',     color: '#6b8cff', bg: 'rgba(26,46,255,0.08)', border: 'rgba(26,46,255,0.18)' },
}

/* ── Device icon resolver ── */
function resolveIcon(name, type) {
  const n = name.toLowerCase()
  if (/lamp|bulb|light|led/.test(n))       return { icon: '◈', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/fan|ventil|exhaust/.test(n))        return { icon: '⊙', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/temp|therm|heat/.test(n))           return { icon: '△', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/humid|moisture|water/.test(n))      return { icon: '◇', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/cam|camera|security|eye/.test(n))   return { icon: '⊗', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/door|lock|gate|entry/.test(n))      return { icon: '▣', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/motion|pir|presence/.test(n))       return { icon: '◉', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/smoke|gas|co2|air/.test(n))         return { icon: '≋', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/pump|valve|flow/.test(n))           return { icon: '⊕', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/plug|socket|outlet|power/.test(n))  return { icon: '⚡', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (/esp32|edge|micropython/.test(n) || type === 'micropython_edge_agent')
                                           return { icon: '⬡', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'security_camera')       return { icon: '⊗', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'dimmable_switch')       return { icon: '◈', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'switch')                return { icon: '⚡', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'sensor')                return { icon: '⊟', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_color_light')    return { icon: '◈', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_light')          return { icon: '◈', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_plug')           return { icon: '⚡', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_climate_sensor') return { icon: '△', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_motion_sensor')  return { icon: '◉', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_contact_sensor') return { icon: '▣', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_remote')         return { icon: '⊞', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_switch')         return { icon: '⚡', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  if (type === 'zigbee_sensor')         return { icon: '⊟', color: '#6b8cff', glow: 'rgba(107,140,255,0.18)' }
  return                                   { icon: '◫',  color: 'rgba(255,255,255,0.25)', glow: 'rgba(255,255,255,0.06)' }
}

/* ── SVG Sparkline ── */
function Sparkline({ points, color = '#1a2eff', height = 38 }) {
  if (!points || points.length < 2) return null
  const W = 200, H = height, PAD = 3
  const vals = points.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((p.v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const area = `${PAD},${H} ${coords.join(' ')} ${W - PAD},${H}`
  const id = `sg${color.replace(/[^a-z]/gi, '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={coords[coords.length - 1].split(',')[0]}
        cy={coords[coords.length - 1].split(',')[1]}
        r="2.5" fill={color}
      />
    </svg>
  )
}

/* ── Script History Drawer ── */
function ScriptHistoryDrawer({ name, onClose }) {
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [rolling, setRolling]   = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getScriptHistory(name)
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [name])

  const doRollback = async (index) => {
    setRolling(index)
    try {
      await rollbackScript(name, index)
      onClose()
    } catch (e) { console.error('[ScriptHistory] rollback failed:', e) }
    finally { setRolling(null) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90%', maxWidth: 560,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: '#0d0d18',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          animation: 'fadeInUp 0.2s ease',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.text1 }}>
            Script History — {name.replace(/_/g, ' ')}
          </span>
          <button onClick={onClose} style={{
            all: 'unset', cursor: 'pointer',
            color: C.text2, fontSize: 20, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          padding: 16, gap: 8,
        }}>
          {loading && (
            <p style={{ color: C.text3, fontSize: 13, fontFamily: C.mono }}>Loading…</p>
          )}
          {!loading && history.length === 0 && (
            <p style={{ color: C.text3, fontSize: 13, fontFamily: C.sans }}>No scripts pushed yet.</p>
          )}
          {history.map((entry, i) => (
            <div key={i} style={{
              background: C.depth,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: C.sans, fontSize: '0.75rem', fontWeight: 600,
                    color: C.text1, letterSpacing: '0.04em',
                  }}>
                    v{i} — {entry.description || '(no description)'}
                  </div>
                  <div style={{
                    fontSize: '0.62rem', color: C.text3,
                    fontFamily: C.mono, marginTop: 2,
                  }}>
                    {entry.ts ? new Date(entry.ts).toLocaleString() : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                      padding: '3px 8px', borderRadius: 6,
                      fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 500,
                      border: `1px solid ${C.border}`, color: C.text2,
                      transition: 'all 0.15s',
                    }}
                  >
                    {expanded === i ? 'hide' : 'view'}
                  </button>
                  {i > 0 && (
                    <button
                      onClick={() => doRollback(i)}
                      disabled={rolling === i}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 10px', borderRadius: 6,
                        fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600,
                        background: 'rgba(26,46,255,0.14)', border: '1px solid rgba(26,46,255,0.35)',
                        color: C.blue, transition: 'all 0.15s',
                        opacity: rolling === i ? 0.5 : 1,
                      }}
                    >
                      {rolling === i ? '…' : 'Rollback'}
                    </button>
                  )}
                </div>
              </div>
              {expanded === i && entry.script && (
                <pre style={{
                  marginTop: 10, padding: 10,
                  background: '#0a0a14',
                  borderRadius: 8,
                  fontSize: '0.68rem', color: C.green,
                  fontFamily: C.mono,
                  overflowX: 'auto', whiteSpace: 'pre', maxHeight: 200, overflowY: 'auto',
                  border: `1px solid ${C.border}`,
                  borderLeft: `2px solid ${C.accent}`,
                }}>
                  {entry.script}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── MCP Tools Panel ── */
function McpToolsPanel({ deviceName, capabilities }) {
  const tools = capabilities || []
  const [args, setArgs] = useState({})
  const [results, setResults] = useState({})
  const [calling, setCalling] = useState(null)

  const call = async (toolName) => {
    setCalling(toolName)
    try {
      const r = await callMcpTool(deviceName, toolName, args[toolName] || {})
      const text = r.data?.result?.content?.[0]?.text ?? JSON.stringify(r.data?.result ?? r.data, null, 2)
      setResults(prev => ({ ...prev, [toolName]: text }))
    } catch (e) {
      setResults(prev => ({ ...prev, [toolName]: `ERR: ${e.response?.data?.detail || e.message}` }))
    } finally { setCalling(null) }
  }

  if (tools.length === 0) return (
    <div style={{ color: C.text3, fontSize: '0.72rem', fontFamily: C.mono, padding: '8px 0' }}>
      No MCP tools published. Reboot device to publish capabilities.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tools.map(tool => (
        <div key={tool.name} style={{
          background: 'rgba(26,46,255,0.04)',
          border: '1px solid rgba(26,46,255,0.12)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <span style={{ fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 600, color: '#6b8cff' }}>
                {tool.name}
              </span>
              <span style={{ fontSize: '0.65rem', color: C.text3, marginLeft: 8, fontFamily: C.sans }}>
                {tool.description}
              </span>
            </div>
            <button
              onClick={() => call(tool.name)}
              disabled={calling === tool.name}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center',
                padding: '3px 10px', borderRadius: 6,
                fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 600,
                background: 'rgba(26,46,255,0.10)', border: '1px solid rgba(26,46,255,0.25)',
                color: '#6b8cff', transition: 'all 0.15s',
                opacity: calling === tool.name ? 0.5 : 1,
              }}
            >
              {calling === tool.name ? '…' : '▶ Run'}
            </button>
          </div>

          {tool.params && Object.entries(tool.params).map(([key, hint]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <label style={{
                fontSize: '0.62rem', color: C.text2,
                minWidth: 40, fontFamily: C.mono,
              }}>
                {key}
              </label>
              <input
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '3px 6px', fontSize: '0.7rem', fontFamily: C.mono,
                  color: C.text1, outline: 'none',
                }}
                placeholder={Array.isArray(hint) ? hint.join(' | ') : String(hint)}
                value={(args[tool.name] || {})[key] || ''}
                onChange={e => setArgs(prev => ({
                  ...prev,
                  [tool.name]: { ...(prev[tool.name] || {}), [key]: e.target.value }
                }))}
              />
            </div>
          ))}

          {results[tool.name] && (
            <pre style={{
              marginTop: 6, padding: '6px 8px',
              background: '#0a0a14', borderRadius: 8,
              fontSize: '0.65rem',
              color: results[tool.name].startsWith('ERR') ? C.red : '#86efac',
              fontFamily: C.mono,
              overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              borderLeft: `2px solid ${results[tool.name].startsWith('ERR') ? C.red : C.green}`,
            }}>
              {results[tool.name]}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Zigbee Color Panel ── */
function ZigbeeColorPanel({ name, data }) {
  const [brightness, setBrightness] = useState(data.brightness || 127)
  const [colorTemp, setColorTemp]   = useState(300)
  const [color, setColor]           = useState('#ffffff')
  const [mode, setMode]             = useState('white')

  const apply = async (patch) => {
    try { await commandDevice(name, 'set', patch) }
    catch (e) { console.error('[ZigbeeColorPanel]', e) }
  }

  return (
    <div style={{
      background: C.depth,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {['white', 'color'].map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              all: 'unset', cursor: 'pointer',
              flex: 1, padding: '6px 0',
              fontFamily: C.sans,
              fontSize: '0.68rem', fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: mode === m ? C.blue : C.text2,
              borderBottom: mode === m ? `2px solid ${C.accent}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s, border-color 0.15s',
              textAlign: 'center',
            }}
          >
            {m === 'white' ? '○ White' : '◈ Color'}
          </button>
        ))}
      </div>

      {/* Brightness */}
      <div>
        <label style={{ fontFamily: C.sans, fontSize: '0.65rem', fontWeight: 600, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Brightness — {Math.round(brightness / 254 * 100)}%
        </label>
        <input type="range" min="1" max="254" value={brightness}
          onChange={e => { setBrightness(+e.target.value); apply({ brightness: +e.target.value }) }}
          style={{ width: '100%', accentColor: C.accent, marginTop: 4 }} />
      </div>

      {mode === 'white' && (
        <div>
          <label style={{ fontFamily: C.sans, fontSize: '0.65rem', fontWeight: 600, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Color Temp — {colorTemp <= 200 ? 'Cool' : colorTemp >= 370 ? 'Warm' : 'Neutral'}
          </label>
          <input type="range" min="150" max="500" value={colorTemp}
            onChange={e => { setColorTemp(+e.target.value); apply({ color_temp: +e.target.value }) }}
            style={{ width: '100%', accentColor: C.amber, marginTop: 4 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: C.text3, marginTop: 2, fontFamily: C.mono }}>
            <span>Cool 6500K</span><span>Warm 2700K</span>
          </div>
        </div>
      )}

      {mode === 'color' && (
        <div>
          <label style={{ fontFamily: C.sans, fontSize: '0.65rem', fontWeight: 600, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            RGB Color
          </label>
          <input type="color" value={color}
            onChange={e => {
              setColor(e.target.value)
              const hex = e.target.value.replace('#', '')
              apply({ color: { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) } })
            }}
            style={{ width: '100%', height: 34, border: 'none', cursor: 'pointer', background: 'transparent', marginTop: 4 }}
          />
        </div>
      )}

      {/* Effect buttons */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {['blink','breathe','colorloop'].map(fx => (
          <button key={fx} onClick={() => apply({ effect: fx })}
            style={{
              all: 'unset', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center',
              padding: '3px 10px', borderRadius: 6,
              fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 500,
              border: `1px solid ${C.border}`, color: C.text2,
              transition: 'all 0.15s',
            }}>
            {fx}
          </button>
        ))}
        <button onClick={() => apply({ effect: 'stop_effect' })}
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 6,
            fontFamily: C.sans, fontSize: '0.62rem', fontWeight: 500,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: C.red, transition: 'all 0.15s',
          }}>
          stop
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════
   MAIN: DeviceCard
════════════════════════════════════════════════════ */
export default function DeviceCard({ name, data, wsMessages }) {
  const [toggling, setToggling]         = useState(false)
  const [previewTick, setPreviewTick]   = useState(Date.now())
  const [previewError, setPreviewError] = useState(false)
  const [telemetry, setTelemetry]       = useState([])
  const [showHistory, setShowHistory]   = useState(false)
  const [showConsole, setShowConsole]   = useState(false)
  const [showTools, setShowTools]       = useState(false)

  const statusStr   = String(data.status ?? '').toUpperCase()
  const isOffline   = statusStr === 'OFFLINE'
  const isOn        = statusStr === 'ON'
  const isNumeric   = !isNaN(parseFloat(data.status)) && data.status !== 'ON' && data.status !== 'OFF'
  const isEdge      = data.type === 'micropython_edge_agent'
  const deviceLabel = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const icon        = resolveIcon(name, data.type)

  const toggle = async () => {
    if (toggling || isNumeric || isOffline) return
    setToggling(true)
    try { await commandDevice(name, isOn ? 'OFF' : 'ON') }
    catch (e) { console.error('[DeviceCard] toggle failed:', e) }
    finally { setToggling(false) }
  }

  const lastUpdated = data.last_updated
    ? new Date(data.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const lastDetectionTime = data.last_detection?.time_utc
    ? new Date(data.last_detection.time_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const showCameraPreview = data.type === 'security_camera' && isOn

  useEffect(() => {
    if (!showCameraPreview) { setPreviewError(false); return }
    setPreviewError(false)
    setPreviewTick(Date.now())
    const t = setInterval(() => setPreviewTick(Date.now()), 100)
    return () => clearInterval(t)
  }, [showCameraPreview])

  useEffect(() => {
    if (!isNumeric && !isEdge) return
    let cancelled = false
    const poll = () => {
      getTelemetry(name)
        .then(r => { if (!cancelled) setTelemetry(r.data) })
        .catch(() => {})
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [name, isNumeric, isEdge])

  const previewUrl = useMemo(() => getDevicePreviewUrl(name, previewTick), [name, previewTick])

  /* Status-dependent colors */
  const borderColor = isOffline
    ? 'rgba(239,68,68,0.22)'
    : isOn && !isNumeric
      ? 'rgba(26,46,255,0.22)'
      : C.border

  const src = data.integration_source || (
    data.ha_entity ? 'ha' : data.zigbee || data.type?.startsWith('zigbee_') ? 'zigbee' : 'mqtt'
  )
  const badge = INTEGRATION_BADGE[src] || INTEGRATION_BADGE.mqtt

  /* Toggle button inline style */
  const toggleStyle = {
    all: 'unset', cursor: isOffline ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, width: '100%', padding: '11px 0',
    borderRadius: 10,
    fontFamily: C.sans,
    fontSize: '0.72rem', fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    transition: 'all 0.15s ease',
    border: '1px solid',
    userSelect: 'none',
    ...(isOffline ? {
      background: 'transparent',
      borderColor: 'rgba(239,68,68,0.15)',
      color: 'rgba(239,68,68,0.38)',
    } : isOn ? {
      background: 'rgba(26,46,255,0.10)',
      borderColor: 'rgba(26,46,255,0.35)',
      color: '#6b8cff',
      boxShadow: '0 0 18px rgba(26,46,255,0.08)',
    } : {
      background: 'transparent',
      borderColor: C.border,
      color: C.text2,
    }),
  }

  /* Edge action button style */
  const edgeBtnStyle = {
    all: 'unset', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontFamily: C.sans,
    fontSize: '0.62rem', fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: C.text2,
    padding: '4px 10px', borderRadius: 8,
    border: `1px solid rgba(26,46,255,0.18)`,
    background: 'rgba(26,46,255,0.05)',
    transition: 'all 0.15s',
  }

  return (
    <>
      {showHistory && <ScriptHistoryDrawer name={name} onClose={() => setShowHistory(false)} />}

      <div
        style={{
          background: C.panel,
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
      >
        {/* ── Header row: icon + name + badges ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>

          {/* Icon box */}
          <div style={{
            width: 48, height: 48,
            borderRadius: 10,
            background: isOffline
              ? 'rgba(239,68,68,0.06)'
              : icon.glow.replace('0.3', '0.08'),
            border: `1px solid ${isOffline ? 'rgba(239,68,68,0.2)' : icon.glow.replace('0.3', '0.2')}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 22,
            color: isOffline ? 'rgba(239,68,68,0.5)' : icon.color,
            filter: isOffline ? 'grayscale(1) brightness(0.5)' : 'none',
            textShadow: isOffline ? 'none' : `0 0 12px ${icon.glow}`,
            transition: 'all 0.3s ease',
            fontFamily: 'monospace',
          }}>
            {icon.icon}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: C.sans,
              fontSize: '0.95rem', fontWeight: 700,
              color: C.text1, letterSpacing: '0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 6,
            }}>
              {deviceLabel}
            </div>

            {/* Badges row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: C.mono, fontSize: '0.58rem', fontWeight: 500,
                color: C.text3, background: C.depth,
                border: `1px solid ${C.border}`, borderRadius: 4,
                padding: '1px 6px',
              }}>
                {data.type ?? 'generic'}
              </span>
              <span style={{
                fontFamily: C.mono,
                fontSize: '0.58rem', fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: badge.color, background: badge.bg,
                border: `1px solid ${badge.border}`,
                borderRadius: 4, padding: '1px 6px',
              }}>
                {badge.label}
              </span>
              {isOffline && (
                <span style={{
                  fontFamily: C.mono,
                  fontSize: '0.58rem', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: C.red,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 4, padding: '1px 6px',
                }}>
                  OFFLINE
                </span>
              )}
              {data.location && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: '0.6rem', color: C.text3,
                  fontFamily: C.mono,
                }}>
                  <MapPin size={9} />
                  {data.location}
                </span>
              )}
            </div>

            {/* Edge device action buttons */}
            {isEdge && (
              <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                <button style={edgeBtnStyle} onClick={() => setShowHistory(true)}>
                  <ScrollText size={10} /> Scripts
                </button>
                <button style={edgeBtnStyle} onClick={() => setShowConsole(!showConsole)}>
                  <Terminal size={10} /> Console
                </button>
                <button style={edgeBtnStyle} onClick={() => setShowTools(!showTools)}>
                  <Wrench size={10} /> Tools
                </button>
              </div>
            )}

            {/* Timestamps */}
            {lastUpdated && (
              <div style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>
                updated {lastUpdated}
              </div>
            )}
            {isEdge && data.last_heartbeat && (
              <div style={{
                fontFamily: C.mono, fontSize: '0.6rem',
                color: isOffline ? 'rgba(239,68,68,0.5)' : 'rgba(107,140,255,0.7)',
                marginTop: 2,
              }}>
                {isOffline
                  ? '● no heartbeat'
                  : `● ${new Date(data.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                }
              </div>
            )}
          </div>
        </div>

        {/* ── Numeric value + sparkline ── */}
        {isNumeric && (
          <div style={{
            background: C.depth,
            border: `1px solid ${C.border}`,
            borderLeft: `2px solid ${C.accent}`,
            borderRadius: 10,
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: telemetry.length > 1 ? 10 : 0 }}>
              <span style={{
                fontFamily: C.sans,
                fontSize: '2.4rem', fontWeight: 700,
                color: C.blue, letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 20px rgba(26,46,255,0.35)`,
              }}>
                {data.status}
              </span>
              {data.unit && (
                <span style={{ fontFamily: C.mono, fontSize: '0.85rem', color: C.text2 }}>
                  {data.unit}
                </span>
              )}
              {telemetry.length > 0 && (
                <a
                  href={getTelemetryExportUrl(name)}
                  download={`${name}_telemetry.csv`}
                  style={{
                    marginLeft: 'auto',
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.62rem', color: C.text3,
                    textDecoration: 'none', fontFamily: C.sans,
                    fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    transition: 'all 0.15s',
                  }}
                  title="Download CSV"
                >
                  <Download size={10} /> CSV
                </a>
              )}
            </div>
            {telemetry.length > 1 && <Sparkline points={telemetry} color={C.accent} />}
          </div>
        )}

        {/* ── Edge sparkline ── */}
        {isEdge && !isNumeric && telemetry.length > 1 && (
          <div style={{
            background: C.depth,
            border: `1px solid rgba(26,46,255,0.12)`,
            borderLeft: `2px solid rgba(26,46,255,0.4)`,
            borderRadius: 10,
            padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ADC telemetry
              </span>
              <a href={getTelemetryExportUrl(name)} download={`${name}_telemetry.csv`}
                style={{
                  fontSize: '0.6rem', color: C.text3, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 3, fontFamily: C.sans,
                  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                <Download size={9} /> CSV
              </a>
            </div>
            <Sparkline points={telemetry} color={C.accent} />
          </div>
        )}

        {/* ── Camera preview ── */}
        {data.type === 'security_camera' && (
          <div style={{
            background: C.depth,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 8,
          }}>
            {showCameraPreview && (
              <>
                <img
                  src={previewUrl}
                  alt={`${deviceLabel} live`}
                  style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 6, display: previewError ? 'none' : 'block' }}
                  onError={() => setPreviewError(true)}
                  onLoad={() => setPreviewError(false)}
                />
                 {previewError && (
                  <p style={{
                    margin: 0, fontSize: '0.72rem',
                    color: C.text3, fontFamily: C.sans,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: '6px 10px',
                  }}>
                    Preview warming up…
                  </p>
                )}
              </>
            )}
            {lastDetectionTime ? (
              <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: '0.72rem', color: C.text2, fontFamily: C.mono }}>
                detect: <strong style={{ color: '#6b8cff' }}>{data.last_detection.detected?.join(', ')}</strong> @ {lastDetectionTime}
              </p>
            ) : (
              <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: '0.72rem', color: C.text3, fontFamily: C.mono }}>
                CV monitor ready.
              </p>
            )}
          </div>
        )}

        {/* ── ON/OFF button ── */}
        {!isNumeric && (
          <button
            id={`toggle-${name}`}
            style={toggleStyle}
            onClick={toggle}
            disabled={toggling || isOffline}
          >
            <Power size={14} strokeWidth={2.5} />
            {isOffline ? 'OFFLINE' : toggling ? 'Switching…' : isOn ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </button>
        )}

        {/* ── Zigbee Color Panel ── */}
        {data.type === 'zigbee_color_light' && isOn && (
          <ZigbeeColorPanel name={name} data={data} />
        )}

        {/* ── Edge Console ── */}
        {isEdge && showConsole && (
          <EdgeConsole deviceName={name} wsMessages={wsMessages} />
        )}

        {/* ── MCP Tools ── */}
        {isEdge && showTools && (
          <div style={{
            background: 'rgba(26,46,255,0.04)',
            border: '1px solid rgba(26,46,255,0.12)',
            borderRadius: 10,
            padding: '10px 12px',
          }}>
            <div style={{
              fontFamily: C.sans,
              fontSize: '0.65rem', fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#6b8cff', marginBottom: 10,
            }}>
              MCP Native Tools
            </div>
            <McpToolsPanel deviceName={name} capabilities={data.capabilities} />
          </div>
        )}
      </div>
    </>
  )
}
