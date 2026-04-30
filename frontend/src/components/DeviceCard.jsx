import { useEffect, useMemo, useRef, useState } from 'react'
import { commandDevice, getDevicePreviewUrl, getTelemetry, getScriptHistory, rollbackScript, getTelemetryExportUrl } from '../api'

/* ── Resolve a colorful emoji icon + bg color from name + type ── */
function resolveIcon(name, type) {
  const n = name.toLowerCase()
  if (/lamp|bulb|light|led/.test(n))       return { emoji: '💡', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)' }
  if (/fan|ventil|exhaust/.test(n))        return { emoji: '🌀', bg: 'rgba(52,211,153,0.12)',  glow: 'rgba(52,211,153,0.25)' }
  if (/temp|therm|heat/.test(n))           return { emoji: '🌡️', bg: 'rgba(239,68,68,0.12)',   glow: 'rgba(239,68,68,0.25)' }
  if (/humid|moisture|water/.test(n))      return { emoji: '💧', bg: 'rgba(96,165,250,0.12)',  glow: 'rgba(96,165,250,0.25)' }
  if (/cam|camera|security|eye/.test(n))   return { emoji: '📷', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)' }
  if (/door|lock|gate|entry/.test(n))      return { emoji: '🚪', bg: 'rgba(251,146,60,0.12)',  glow: 'rgba(251,146,60,0.25)' }
  if (/motion|pir|presence/.test(n))       return { emoji: '🚶', bg: 'rgba(234,179,8,0.12)',   glow: 'rgba(234,179,8,0.25)' }
  if (/smoke|gas|co2|air/.test(n))         return { emoji: '💨', bg: 'rgba(107,114,128,0.15)', glow: 'rgba(107,114,128,0.25)' }
  if (/pump|valve|flow/.test(n))           return { emoji: '⚗️', bg: 'rgba(56,189,248,0.12)',  glow: 'rgba(56,189,248,0.25)' }
  if (/curtain|blind|shade|roller/.test(n))return { emoji: '🪟', bg: 'rgba(96,165,250,0.10)',  glow: 'rgba(96,165,250,0.2)'  }
  if (/speaker|audio|sound/.test(n))       return { emoji: '🔊', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)' }
  if (/tv|display|screen/.test(n))         return { emoji: '📺', bg: 'rgba(96,165,250,0.12)',  glow: 'rgba(96,165,250,0.25)' }
  if (/plug|socket|outlet|power/.test(n))  return { emoji: '🔌', bg: 'rgba(34,197,94,0.12)',   glow: 'rgba(34,197,94,0.25)' }
  if (/esp32|edge|micropython/.test(n))    return { emoji: '🤖', bg: 'rgba(99,102,241,0.12)',  glow: 'rgba(99,102,241,0.25)' }
  if (type === 'micropython_edge_agent')   return { emoji: '🤖', bg: 'rgba(99,102,241,0.12)',  glow: 'rgba(99,102,241,0.25)' }
  if (type === 'security_camera') return { emoji: '📷', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)' }
  if (type === 'dimmable_switch') return { emoji: '💡', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)' }
  if (type === 'switch')          return { emoji: '🔌', bg: 'rgba(34,197,94,0.12)',   glow: 'rgba(34,197,94,0.25)' }
  if (type === 'sensor')          return { emoji: '📡', bg: 'rgba(37,99,235,0.12)',   glow: 'rgba(37,99,235,0.25)' }
  return                                  { emoji: '⚙️', bg: 'rgba(107,114,128,0.12)', glow: 'rgba(107,114,128,0.2)' }
}

/* ── SVG Sparkline ── */
function Sparkline({ points, color = 'var(--accent)', height = 40 }) {
  if (!points || points.length < 2) return null
  const W = 200
  const H = height
  const PAD = 4
  const vals = points.map(p => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1

  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((p.v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polyline = coords.join(' ')
  const area = `${PAD},${H} ${polyline} ${W - PAD},${H}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${color.replace(/[^a-z]/gi, '')})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Latest value dot */}
      <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]}
        r="3" fill={color} />
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
    } catch (e) {
      console.error('[ScriptHistory] rollback failed:', e)
    } finally {
      setRolling(null)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 560,
          boxShadow: 'var(--sh-raised)', border: '1px solid rgba(255,255,255,0.07)',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-main)' }}>
            Script History — {name.replace(/_/g, ' ')}
          </span>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>}
          {!loading && history.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No scripts pushed yet.</p>
          )}
          {history.map((entry, i) => (
            <div key={i} className="neu-trough" style={{ padding: 12, borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>
                    v{i} — {entry.description || '(no description)'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {entry.ts ? new Date(entry.ts).toLocaleString() : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)',
                      padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}
                  >
                    {expanded === i ? 'hide' : 'view'}
                  </button>
                  {i > 0 && (
                    <button
                      onClick={() => doRollback(i)}
                      disabled={rolling === i}
                      style={{ all: 'unset', cursor: rolling === i ? 'not-allowed' : 'pointer',
                        fontSize: 11, fontWeight: 700, color: '#fff', padding: '4px 10px',
                        borderRadius: 6, background: 'rgba(99,102,241,0.7)', opacity: rolling === i ? 0.6 : 1 }}
                    >
                      {rolling === i ? '…' : 'Rollback'}
                    </button>
                  )}
                </div>
              </div>
              {expanded === i && entry.script && (
                <pre style={{
                  marginTop: 10, padding: 10, borderRadius: 8,
                  background: 'rgba(0,0,0,0.3)', fontSize: 11,
                  color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace',
                  overflowX: 'auto', whiteSpace: 'pre', maxHeight: 200, overflowY: 'auto',
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

export default function DeviceCard({ name, data }) {
  const [toggling, setToggling]         = useState(false)
  const [previewTick, setPreviewTick]   = useState(Date.now())
  const [previewError, setPreviewError] = useState(false)
  const [telemetry, setTelemetry]       = useState([])
  const [showHistory, setShowHistory]   = useState(false)

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

  /* Camera preview refresh */
  useEffect(() => {
    if (!showCameraPreview) { setPreviewError(false); return }
    setPreviewError(false)
    setPreviewTick(Date.now())
    const t = setInterval(() => setPreviewTick(Date.now()), 100)
    return () => clearInterval(t)
  }, [showCameraPreview])

  /* Telemetry polling for numeric sensors */
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

  /* Card glow */
  const glowStyle = isOffline
    ? { borderColor: 'rgba(239,68,68,0.25)', boxShadow: 'var(--sh-flat), 0 0 16px rgba(239,68,68,0.08)' }
    : isOn && !isNumeric
      ? { borderColor: 'rgba(34,197,94,0.2)', boxShadow: 'var(--sh-flat), 0 0 20px rgba(34,197,94,0.07)' }
      : {}

  return (
    <>
      <style>{`
        .dev-card { transition: box-shadow 0.3s, transform 0.2s; }
        .dev-card:hover { transform: translateY(-2px); }
        .dev-onoff-btn {
          all: unset; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 8px; width: 100%; padding: 13px 0;
          border-radius: 12px; font-size: 14px; font-weight: 800;
          letter-spacing: 0.12em; text-transform: uppercase;
          transition: all 0.18s ease; position: relative; overflow: hidden; user-select: none;
        }
        .dev-onoff-btn.on {
          background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
          box-shadow: 0 4px 18px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
          color: #fff;
        }
        .dev-onoff-btn.off {
          background: var(--bg-dark); box-shadow: var(--sh-trough);
          color: var(--text-dim); border: 1px solid rgba(255,255,255,0.05);
        }
        .dev-onoff-btn.offline-btn {
          background: var(--bg-dark); box-shadow: var(--sh-trough);
          color: rgba(239,68,68,0.6); border: 1px solid rgba(239,68,68,0.15); cursor: not-allowed;
        }
        .dev-onoff-btn.on:hover  { box-shadow: 0 6px 28px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.2); }
        .dev-onoff-btn.off:hover { color: var(--text-main); background: rgba(255,255,255,0.04); }
        .dev-onoff-btn:disabled  { opacity: 0.5; cursor: not-allowed; }
        .dev-onoff-btn::after {
          content: ''; position: absolute; inset: 0;
          background: rgba(255,255,255,0); transition: background 0.15s;
        }
        .dev-onoff-btn:active::after { background: rgba(255,255,255,0.07); }
        .history-btn {
          all: unset; cursor: pointer; font-size: 11px; font-weight: 600;
          color: var(--text-dim); padding: 5px 10px; border-radius: 8px;
          background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2);
          transition: all 0.15s; letter-spacing: 0.04em;
        }
        .history-btn:hover { background: rgba(99,102,241,0.2); color: var(--text-main); }
      `}</style>

      {showHistory && <ScriptHistoryDrawer name={name} onClose={() => setShowHistory(false)} />}

      <div
        className="neu-plate dev-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, ...glowStyle }}
      >
        {/* ── Top: icon + name + badges ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: isOffline ? 'rgba(239,68,68,0.08)' : isOn ? icon.glow.replace('0.25', '0.15') : icon.bg,
            border: `1px solid ${isOffline ? 'rgba(239,68,68,0.2)' : isOn ? icon.glow : 'rgba(255,255,255,0.05)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 34, transition: 'all 0.4s ease',
            boxShadow: isOn && !isOffline ? `0 0 20px ${icon.glow}` : 'none',
            filter: isOffline ? 'grayscale(1) brightness(0.5)' : isOn ? 'brightness(1.1)' : 'grayscale(0.3) brightness(0.85)',
          }}>
            {icon.emoji}
          </div>

          {/* Name + type + time */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: 'var(--text-main)',
              letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', marginBottom: 4,
            }}>
              {deviceLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="neu-badge" style={{ fontSize: 10 }}>{data.type ?? 'generic'}</span>
              {data.location && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📍 {data.location}</span>
              )}
              {/* Offline badge */}
              {isOffline && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#ef4444',
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 6, padding: '2px 6px', letterSpacing: '0.08em',
                }}>
                  OFFLINE
                </span>
              )}
              {/* Edge device — script history button */}
              {isEdge && (
                <button className="history-btn" onClick={() => setShowHistory(true)}>
                  📜 Scripts
                </button>
              )}
            </div>
            {lastUpdated && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                Updated {lastUpdated}
              </div>
            )}
            {/* Heartbeat indicator for edge devices */}
            {isEdge && data.last_heartbeat && (
              <div style={{ fontSize: 10, color: isOffline ? '#ef4444' : 'rgba(34,197,94,0.7)', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                {isOffline ? '● no heartbeat' : `● alive ${new Date(data.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
              </div>
            )}
          </div>
        </div>

        {/* ── Big numeric value + sparkline ── */}
        {isNumeric && (
          <div className="neu-trough" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: telemetry.length > 1 ? 10 : 0 }}>
              <span style={{
                fontSize: 36, fontWeight: 800, color: 'var(--accent)',
                fontVariantNumeric: 'tabular-nums', fontFamily: 'JetBrains Mono, monospace',
                textShadow: 'var(--glow-sm)',
              }}>
                {data.status}
              </span>
              {data.unit && <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>{data.unit}</span>}
              {telemetry.length > 0 && (
                <a
                  href={getTelemetryExportUrl(name)}
                  download={`${name}_telemetry.csv`}
                  style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', textDecoration: 'none',
                    padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.15s' }}
                  title="Download CSV"
                >
                  ⬇ CSV
                </a>
              )}
            </div>
            {telemetry.length > 1 && <Sparkline points={telemetry} />}
          </div>
        )}

        {/* ── Edge device sparkline (non-numeric but has telemetry) ── */}
        {isEdge && !isNumeric && telemetry.length > 1 && (
          <div className="neu-trough" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ADC telemetry</span>
              <a
                href={getTelemetryExportUrl(name)}
                download={`${name}_telemetry.csv`}
                style={{ fontSize: 10, color: 'var(--text-muted)', textDecoration: 'none',
                  padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)' }}
                title="Download CSV"
              >
                ⬇ CSV
              </a>
            </div>
            <Sparkline points={telemetry} color="rgba(99,102,241,0.9)" />
          </div>
        )}

        {/* ── Camera preview ── */}
        {data.type === 'security_camera' && (
          <div className="neu-trough" style={{ padding: 8, borderRadius: 12 }}>
            {showCameraPreview && (
              <>
                <img
                  src={previewUrl}
                  alt={`${deviceLabel} live`}
                  style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, display: previewError ? 'none' : 'block' }}
                  onError={() => setPreviewError(true)}
                  onLoad={() => setPreviewError(false)}
                />
                {previewError && (
                  <p className="neu-alert-warn" style={{ margin: 0, fontSize: 11 }}>Preview warming up…</p>
                )}
              </>
            )}
            {lastDetectionTime ? (
              <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: 11, color: 'var(--text-dim)' }}>
                Detection: <strong style={{ color: '#fbbf24' }}>{data.last_detection.detected?.join(', ')}</strong> @ {lastDetectionTime}
              </p>
            ) : (
              <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: 11, color: 'var(--text-muted)' }}>CV monitor ready.</p>
            )}
          </div>
        )}

        {/* ── ON/OFF button ── */}
        {!isNumeric && (
          <button
            id={`toggle-${name}`}
            className={`dev-onoff-btn ${isOffline ? 'offline-btn' : isOn ? 'on' : 'off'}`}
            onClick={toggle}
            disabled={toggling || isOffline}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v6"/>
              <path d="M6.3 5.3A9 9 0 1 0 17.7 5.3"/>
            </svg>
            {isOffline ? 'OFFLINE — No heartbeat' : toggling ? 'Switching…' : isOn ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </button>
        )}
      </div>
    </>
  )
}
