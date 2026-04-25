import { useEffect, useMemo, useState } from 'react'
import { commandDevice, getDevicePreviewUrl } from '../api'

const TYPE_META = {
  switch:          { icon: '⏻', label: 'SW'  },
  sensor:          { icon: '◈', label: 'SNS' },
  dimmable_switch: { icon: '◑', label: 'DIM' },
  security_camera: { icon: '⊙', label: 'CAM' },
  generic:         { icon: '⬡', label: 'GEN' },
}

export default function DeviceCard({ name, data }) {
  const [toggling, setToggling]     = useState(false)
  const [previewTick, setPreviewTick] = useState(Date.now())
  const [previewError, setPreviewError] = useState(false)

  const statusStr   = String(data.status ?? '').toUpperCase()
  const isOn        = statusStr === 'ON'
  const isNumeric   = !isNaN(parseFloat(data.status)) && data.status !== 'ON' && data.status !== 'OFF'
  const deviceLabel = name.replace(/_/g, ' ')
  const meta        = TYPE_META[data.type] ?? TYPE_META.generic

  const toggle = async () => {
    if (toggling) return
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

  /* card accent based on state */
  const accentColor = isNumeric ? 'var(--accent)'
    : isOn  ? '#22c55e'
    : 'var(--text-muted)'

  return (
    <div className="neu-plate" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* type badge */}
          <span className="neu-badge neu-badge-accent" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deviceLabel}
          </span>
        </div>

        {/* hardware toggle */}
        {!isNumeric && (
          <label className="hw-toggle" title={isOn ? 'Turn off' : 'Turn on'} style={{ opacity: toggling ? 0.5 : 1, cursor: toggling ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={isOn}
              onChange={toggle}
              disabled={toggling}
              id={`toggle-${name}`}
            />
            <div className="hw-toggle-track" />
          </label>
        )}
      </div>

      {/* ── Status / Value ── */}
      <div className="neu-trough" style={{ padding: '10px 14px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {isNumeric ? (
          <>
            <span style={{ fontSize: 28, fontWeight: 700, color: accentColor, fontVariantNumeric: 'tabular-nums', fontFamily: 'JetBrains Mono, monospace' }}>
              {data.status}
            </span>
            {data.unit && (
              <span style={{ fontSize: 14, color: 'var(--text-dim)', paddingBottom: 2 }}>{data.unit}</span>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={isOn ? 'led-pulse' : 'led led-red'} />
            <span style={{ fontSize: 18, fontWeight: 700, color: accentColor, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2 }}>
              {isOn ? 'ON' : (statusStr || 'UNKNOWN')}
            </span>
          </div>
        )}
      </div>

      {/* ── Camera preview ── */}
      {data.type === 'security_camera' && (
        <div className="neu-trough" style={{ padding: 10 }}>
          {showCameraPreview && (
            <>
              <img
                src={previewUrl}
                alt={`${deviceLabel} live preview`}
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 6, display: previewError ? 'none' : 'block' }}
                onError={() => setPreviewError(true)}
                onLoad={() => setPreviewError(false)}
              />
              {previewError && (
                <p className="neu-alert-warn" style={{ margin: 0, fontSize: 11 }}>Preview warming up — keep camera ON.</p>
              )}
            </>
          )}
          {lastDetectionTime ? (
            <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: 11, color: 'var(--text-dim)' }}>
              Detection: <strong style={{ color: '#fbbf24' }}>{data.last_detection.detected?.join(', ') || 'movement'}</strong> @ {lastDetectionTime}
            </p>
          ) : (
            <p style={{ margin: showCameraPreview ? '8px 0 0' : 0, fontSize: 11, color: 'var(--text-dim)' }}>CV monitor ready. Turn on to scan.</p>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span className="neu-badge">{data.type ?? 'generic'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {lastUpdated ? lastUpdated : '—'}
        </span>
      </div>
    </div>
  )
}
