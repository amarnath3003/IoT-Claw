import { useEffect, useMemo, useState } from 'react'
import { commandDevice, getDevicePreviewUrl } from '../api'

/* ── Big SVG icons per device type ── */
const DEVICE_ICON = {
  switch: ({ color }) => (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <circle cx="32" cy="32" r="26" stroke={color} strokeWidth="3.5" opacity="0.25"/>
      <circle cx="32" cy="32" r="18" stroke={color} strokeWidth="3" opacity="0.5"/>
      <line x1="32" y1="10" x2="32" y2="26" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <circle cx="32" cy="32" r="6" fill={color}/>
      <circle cx="32" cy="32" r="3" fill="#0d0f11"/>
    </svg>
  ),
  dimmable_switch: ({ color }) => (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <circle cx="32" cy="28" r="12" stroke={color} strokeWidth="3" opacity="0.7"/>
      <path d="M32 16 Q32 8 32 8" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.4"/>
      {[0,45,90,135,180,225,270,315].map((a,i) => (
        <line key={i}
          x1={32 + 20*Math.cos(a*Math.PI/180)} y1={28 + 20*Math.sin(a*Math.PI/180)}
          x2={32 + 24*Math.cos(a*Math.PI/180)} y2={28 + 24*Math.sin(a*Math.PI/180)}
          stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.5"/>
      ))}
      <path d="M24 44 Q32 52 40 44" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7"/>
      <line x1="28" y1="50" x2="36" y2="50" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
    </svg>
  ),
  sensor: ({ color }) => (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <path d="M12 48 Q12 18 32 18 Q52 18 52 48" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3"/>
      <path d="M20 48 Q20 26 32 26 Q44 26 44 48" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55"/>
      <path d="M28 48 Q28 34 32 34 Q36 34 36 48" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8"/>
      <circle cx="32" cy="50" r="4" fill={color}/>
    </svg>
  ),
  security_camera: ({ color }) => (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <rect x="8" y="20" width="32" height="24" rx="5" stroke={color} strokeWidth="3" opacity="0.8"/>
      <path d="M40 28 L56 20 L56 44 L40 36 Z" stroke={color} strokeWidth="2.5" strokeLinejoin="round" fill="none" opacity="0.7"/>
      <circle cx="22" cy="32" r="5" stroke={color} strokeWidth="2.5" opacity="0.9"/>
      <circle cx="22" cy="32" r="2" fill={color}/>
    </svg>
  ),
  generic: ({ color }) => (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <rect x="12" y="12" width="40" height="40" rx="8" stroke={color} strokeWidth="3" opacity="0.7"/>
      <circle cx="32" cy="32" r="8" stroke={color} strokeWidth="3" opacity="0.9"/>
      <circle cx="32" cy="32" r="3" fill={color}/>
    </svg>
  ),
}

/* Color based on state */
function stateColor(isOn, isNumeric) {
  if (isNumeric) return 'var(--accent)'
  return isOn ? '#22c55e' : '#4e5762'
}

export default function DeviceCard({ name, data }) {
  const [toggling, setToggling]       = useState(false)
  const [previewTick, setPreviewTick] = useState(Date.now())
  const [previewError, setPreviewError] = useState(false)

  const statusStr   = String(data.status ?? '').toUpperCase()
  const isOn        = statusStr === 'ON'
  const isNumeric   = !isNaN(parseFloat(data.status)) && data.status !== 'ON' && data.status !== 'OFF'
  const deviceLabel = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const IconComp    = DEVICE_ICON[data.type] ?? DEVICE_ICON.generic
  const color       = stateColor(isOn, isNumeric)

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
    boxShadow: 'var(--sh-deep), 0 0 24px rgba(34,197,94,0.08)',
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
            background: isOn ? `rgba(34,197,94,0.07)` : isNumeric ? 'rgba(26,77,255,0.07)' : 'rgba(255,255,255,0.03)',
            boxShadow: 'var(--sh-trough)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.4s',
          }}>
            <IconComp color={color} />
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
