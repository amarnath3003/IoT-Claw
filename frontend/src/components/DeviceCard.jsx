import { useEffect, useMemo, useState } from 'react'
import { commandDevice, getDevicePreviewUrl } from '../api'

/* ── Resolve a colorful emoji icon + bg color from name + type ── */
function resolveIcon(name, type) {
  const n = name.toLowerCase()

  // Name-based inference (more specific wins)
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

  // Fall back to type
  if (type === 'security_camera') return { emoji: '📷', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)' }
  if (type === 'dimmable_switch') return { emoji: '💡', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)' }
  if (type === 'switch')          return { emoji: '🔌', bg: 'rgba(34,197,94,0.12)',   glow: 'rgba(34,197,94,0.25)' }
  if (type === 'sensor')          return { emoji: '📡', bg: 'rgba(37,99,235,0.12)',   glow: 'rgba(37,99,235,0.25)' }
  return                                  { emoji: '⚙️', bg: 'rgba(107,114,128,0.12)', glow: 'rgba(107,114,128,0.2)' }
}

export default function DeviceCard({ name, data }) {
  const [toggling, setToggling]       = useState(false)
  const [previewTick, setPreviewTick] = useState(Date.now())
  const [previewError, setPreviewError] = useState(false)

  const statusStr   = String(data.status ?? '').toUpperCase()
  const isOn        = statusStr === 'ON'
  const isNumeric   = !isNaN(parseFloat(data.status)) && data.status !== 'ON' && data.status !== 'OFF'
  const deviceLabel = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const icon        = resolveIcon(name, data.type)

  const toggle = async () => {
    if (toggling || isNumeric) return
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

  const previewUrl = useMemo(() => getDevicePreviewUrl(name, previewTick), [name, previewTick])

  /* Glow effect when ON */
  const glowStyle = isOn && !isNumeric ? {
    borderColor: 'rgba(34,197,94,0.2)',
    boxShadow: 'var(--sh-flat), 0 0 20px rgba(34,197,94,0.07)',
  } : {}

  return (
    <>
      <style>{`
        .dev-card { transition: box-shadow 0.3s, transform 0.2s; }
        .dev-card:hover { transform: translateY(-2px); }
        .dev-onoff-btn {
          all: unset;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px 0;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: all 0.18s ease;
          position: relative;
          overflow: hidden;
          user-select: none;
        }
        .dev-onoff-btn.on {
          background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
          box-shadow: 0 4px 18px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
          color: #fff;
        }
        .dev-onoff-btn.off {
          background: var(--bg-dark);
          box-shadow: var(--sh-trough);
          color: var(--text-dim);
          border: 1px solid rgba(255,255,255,0.05);
        }
        .dev-onoff-btn.on:hover { box-shadow: 0 6px 28px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.2); }
        .dev-onoff-btn.off:hover { color: var(--text-main); background: rgba(255,255,255,0.04); }
        .dev-onoff-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .dev-onoff-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0);
          transition: background 0.15s;
        }
        .dev-onoff-btn:active::after { background: rgba(255,255,255,0.07); }
      `}</style>

      <div
        className="neu-plate dev-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, ...glowStyle }}
      >
        {/* ── Top: icon + name + last-updated ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          {/* Icon area */}
          <div style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: isOn ? icon.glow.replace('0.25', '0.15') : icon.bg,
            border: `1px solid ${isOn ? icon.glow : 'rgba(255,255,255,0.05)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 34,
            transition: 'all 0.4s ease',
            boxShadow: isOn ? `0 0 20px ${icon.glow}` : 'none',
            filter: isOn ? 'brightness(1.1)' : 'grayscale(0.3) brightness(0.85)',
          }}>
            {icon.emoji}
          </div>

          {/* Name + type + time */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-main)',
              letterSpacing: '0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 4,
            }}>
              {deviceLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="neu-badge" style={{ fontSize: 10 }}>{data.type ?? 'generic'}</span>
              {data.location && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📍 {data.location}</span>
              )}
            </div>
            {lastUpdated && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                Updated {lastUpdated}
              </div>
            )}
          </div>
        </div>

        {/* ── Middle: big value display for sensors ── */}
        {isNumeric && (
          <div className="neu-trough" style={{ padding: '14px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 36,
              fontWeight: 800,
              color: 'var(--accent)',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'JetBrains Mono, monospace',
              textShadow: 'var(--glow-sm)',
            }}>
              {data.status}
            </span>
            {data.unit && (
              <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>{data.unit}</span>
            )}
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

        {/* ── Big ON/OFF button ── */}
        {!isNumeric && (
          <button
            id={`toggle-${name}`}
            className={`dev-onoff-btn ${isOn ? 'on' : 'off'}`}
            onClick={toggle}
            disabled={toggling}
          >
            {/* Power icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v6"/>
              <path d="M6.3 5.3A9 9 0 1 0 17.7 5.3"/>
            </svg>
            {toggling ? 'Switching…' : isOn ? 'ON — Tap to turn off' : 'OFF — Tap to turn on'}
          </button>
        )}
      </div>
    </>
  )
}
