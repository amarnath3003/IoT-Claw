import { useState, useEffect, useCallback } from 'react'
import { getHAStatus, haSetEntity, haCallService, haRefresh, haCommandDevice } from '../api'

// ── Domain → icon mapping ─────────────────────────────────────────────────
const DOMAIN_ICONS = {
  light:          '💡',
  switch:         '🔌',
  sensor:         '🌡️',
  binary_sensor:  '👁️',
  climate:        '🌡️',
  media_player:   '🎵',
  cover:          '🪟',
  lock:           '🔒',
  fan:            '💨',
  vacuum:         '🤖',
  input_boolean:  '🔘',
  automation:     '⚙️',
  scene:          '🎬',
  script:         '📜',
  camera:         '📷',
  ha_generic:     '🏠',
}

const DOMAIN_COLORS = {
  light:         '#f59e0b',
  switch:        '#6366f1',
  sensor:        '#22c55e',
  binary_sensor: '#84cc16',
  climate:       '#06b6d4',
  media_player:  '#ec4899',
  cover:         '#8b5cf6',
  lock:          '#ef4444',
  fan:           '#3b82f6',
  vacuum:        '#f97316',
  scene:         '#a855f7',
  script:        '#14b8a6',
}

const FILTER_TABS = [
  { label: 'All',          domain: '' },
  { label: '💡 Lights',   domain: 'light' },
  { label: '🔌 Switches', domain: 'switch' },
  { label: '🌡️ Sensors',  domain: 'sensor' },
  { label: '🌡️ Climate',  domain: 'climate' },
  { label: '🔒 Locks',    domain: 'lock' },
  { label: '🎵 Media',    domain: 'media_player' },
  { label: '🪟 Covers',   domain: 'cover' },
  { label: '🎬 Scenes',   domain: 'scene' },
]

// ── Minimal EntityCard ─────────────────────────────────────────────────────
function EntityCard({ entity, onToggle, onSlider }) {
  const domain = entity.ha_domain || 'ha_generic'
  const icon = DOMAIN_ICONS[domain] || '🏠'
  const color = DOMAIN_COLORS[domain] || '#6366f1'
  const isOn = ['ON', 'on', 'open', 'unlocked', 'playing', 'home'].includes(
    String(entity.status).toLowerCase()
  )
  const isReadOnly = ['sensor', 'binary_sensor', 'camera'].includes(domain)
  const [brightness, setBrightness] = useState(
    entity.brightness ? Math.round((entity.brightness / 255) * 100) : 50
  )
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (isReadOnly || busy) return
    setBusy(true)
    try {
      await onToggle(entity.name, isOn ? 'OFF' : 'ON')
    } finally {
      setBusy(false)
    }
  }

  const applyBrightness = async (val) => {
    setBrightness(val)
    await onSlider(entity.name, val)
  }

  const statusColor = isOn ? '#22c55e' : (isReadOnly ? '#94a3b8' : '#f87171')
  const statusLabel = isReadOnly
    ? String(entity.status) + (entity.unit ? ` ${entity.unit}` : '')
    : isOn ? 'ON' : (entity.status === 'unknown' ? 'unknown' : 'OFF')

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isOn ? `${color}33` : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14,
      padding: '18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: isOn ? `0 0 18px ${color}22` : 'none',
      cursor: isReadOnly ? 'default' : 'pointer',
      position: 'relative',
      overflow: 'hidden',
    }}
      onClick={!isReadOnly ? toggle : undefined}
    >
      {/* Glow strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: isOn ? `linear-gradient(90deg, ${color}, transparent)` : 'transparent',
        transition: 'background 0.3s',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: isOn ? `${color}22` : 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, transition: 'background 0.2s',
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>
              {entity.description || entity.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
              {entity.name}
            </div>
          </div>
        </div>

        {/* Status pill */}
        <div style={{
          padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: `${statusColor}18`, color: statusColor,
          border: `1px solid ${statusColor}30`, whiteSpace: 'nowrap',
        }}>
          {statusLabel}
        </div>
      </div>

      {/* Domain badge + location */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 4,
          background: `${color}15`, color: color, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          {domain}
        </span>
        {entity.location && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            📍 {entity.location}
          </span>
        )}
      </div>

      {/* Brightness slider for lights */}
      {domain === 'light' && isOn && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Brightness</span>
            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>{brightness}%</span>
          </div>
          <input
            type="range" min={1} max={100} value={brightness}
            onChange={e => setBrightness(Number(e.target.value))}
            onMouseUp={e => applyBrightness(Number(e.target.value))}
            onTouchEnd={e => applyBrightness(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
          />
        </div>
      )}

      {/* Toggle button for controllable, non-light entities */}
      {!isReadOnly && !busy && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
          <div style={{
            width: 38, height: 22, borderRadius: 11,
            background: isOn ? color : 'rgba(255,255,255,0.1)',
            transition: 'background 0.25s',
            position: 'relative', cursor: 'pointer',
          }}>
            <div style={{
              position: 'absolute', top: 3, left: isOn ? 18 : 3,
              width: 16, height: 16, borderRadius: 99,
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>
      )}
      {busy && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>sending…</div>
      )}
    </div>
  )
}

// ── ServiceCallPanel ───────────────────────────────────────────────────────
function ServiceCallPanel({ onClose }) {
  const [domain, setDomain] = useState('scene')
  const [service, setService] = useState('turn_on')
  const [entityId, setEntityId] = useState('')
  const [dataRaw, setDataRaw] = useState('{}')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const call = async () => {
    setLoading(true)
    setResult(null)
    try {
      let parsed = {}
      try { parsed = JSON.parse(dataRaw) } catch { parsed = {} }
      const res = await haCallService(domain, service, entityId, parsed)
      setResult({ ok: true, data: res.data })
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.detail || e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>⚙️ Raw Service Call</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Domain', value: domain, set: setDomain, placeholder: 'scene' },
          { label: 'Service', value: service, set: setService, placeholder: 'turn_on' },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 12 }} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Entity ID (optional)</div>
        <input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder='scene.movie_night'
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 12 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Service Data (JSON)</div>
        <textarea value={dataRaw} onChange={e => setDataRaw(e.target.value)} rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
      </div>
      <button onClick={call} disabled={loading}
        style={{ padding: '9px 20px', borderRadius: 8, background: 'rgba(99,102,241,0.85)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Calling…' : '⚡ Call Service'}
      </button>
      {result && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${result.ok ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)'}`, fontSize: 11, color: result.ok ? '#22c55e' : '#f87171', fontFamily: 'monospace' }}>
          {result.ok ? `✓ Success` : `✗ ${result.error}`}
        </div>
      )}
    </div>
  )
}

// ── Main HAManager Component ───────────────────────────────────────────────
export default function HAManager({ deviceStates }) {
  const [status, setStatus] = useState(null)
  const [filterDomain, setFilterDomain] = useState('')
  const [search, setSearch] = useState('')
  const [showServicePanel, setShowServicePanel] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadStatus = useCallback(async () => {
    try {
      const res = await getHAStatus()
      setStatus(res.data)
    } catch {
      setStatus({ enabled: false, connected: false, entity_count: 0, error: 'Backend offline' })
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 15000)
    return () => clearInterval(interval)
  }, [loadStatus])

  // Filter entities from deviceStates
  const haEntities = Object.values(deviceStates || {}).filter(d => d.ha_entity)
  const filtered = haEntities
    .filter(e => !filterDomain || e.ha_domain === filterDomain)
    .filter(e => !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.location || '').toLowerCase().includes(search.toLowerCase())
    )

  // Domain counts for tab badges
  const domainCounts = haEntities.reduce((acc, e) => {
    acc[e.ha_domain] = (acc[e.ha_domain] || 0) + 1
    return acc
  }, {})

  const handleToggle = async (name, command) => {
    try {
      await haCommandDevice(name, command)
      showToast(`${name}: ${command}`)
    } catch (e) {
      showToast(e.response?.data?.detail || 'Command failed', 'error')
    }
  }

  const handleSlider = async (name, brightnessPct) => {
    try {
      await haSetEntity(name, { state: 'ON', brightness_pct: brightnessPct })
    } catch (e) {
      console.error('HA brightness error', e)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await haRefresh()
      showToast(`Refreshed — ${res.data.entity_count} entities imported`)
      loadStatus()
    } catch (e) {
      showToast(e.response?.data?.detail || 'Refresh failed', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  const isEnabled = status?.enabled
  const isConnected = status?.connected

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10,
          background: toast.type === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(34,197,94,0.3)'}`,
          color: toast.type === 'error' ? '#f87171' : '#22c55e',
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(10px)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
            🏠 Home Assistant
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            {haEntities.length} entit{haEntities.length !== 1 ? 'ies' : 'y'} imported from your smart home
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Connection status pill */}
          <div style={{
            padding: '7px 14px', borderRadius: 99,
            background: isConnected ? 'rgba(34,197,94,0.1)' : isEnabled ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isConnected ? 'rgba(34,197,94,0.25)' : isEnabled ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
            color: isConnected ? '#22c55e' : isEnabled ? '#f87171' : 'var(--text-muted)',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: 99,
              background: isConnected ? '#22c55e' : isEnabled ? '#f87171' : '#64748b',
              boxShadow: isConnected ? '0 0 6px #22c55e' : 'none',
            }} />
            {isConnected ? `Connected · ${status?.host}` : isEnabled ? 'Disconnected' : 'Disabled'}
          </div>

          {isEnabled && (
            <button
              onClick={handleRefresh}
              disabled={refreshing || !isConnected}
              style={{
                padding: '7px 16px', borderRadius: 8,
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc', fontSize: 12, fontWeight: 600,
                cursor: refreshing || !isConnected ? 'not-allowed' : 'pointer',
                opacity: refreshing || !isConnected ? 0.5 : 1,
              }}
            >
              {refreshing ? '⟳ Syncing…' : '⟳ Sync Entities'}
            </button>
          )}

          <button
            onClick={() => setShowServicePanel(p => !p)}
            style={{
              padding: '7px 16px', borderRadius: 8,
              background: showServicePanel ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ⚙️ Call Service
          </button>
        </div>
      </div>

      {/* ── Disabled state ── */}
      {!isEnabled && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Home Assistant Not Enabled</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            To connect your smart home, set these values in <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>backend/.env</code> and restart the server:
          </div>
          <div style={{
            marginTop: 20, padding: 16, borderRadius: 10, textAlign: 'left',
            background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', fontSize: 12, color: '#94a3b8',
            maxWidth: 420, margin: '20px auto 0',
          }}>
            <div style={{ color: '#22c55e' }}>HA_ENABLED=<span style={{ color: '#f59e0b' }}>true</span></div>
            <div>HA_HOST=<span style={{ color: '#a5b4fc' }}>192.168.1.100</span></div>
            <div>HA_PORT=<span style={{ color: '#a5b4fc' }}>8123</span></div>
            <div>HA_TOKEN=<span style={{ color: '#a5b4fc' }}>your_token_here</span></div>
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)' }}>
            Get a Long-Lived Access Token from: HA Profile → Security → Long-Lived Access Tokens
          </div>
        </div>
      )}

      {/* ── Service call panel ── */}
      {showServicePanel && isEnabled && (
        <ServiceCallPanel onClose={() => setShowServicePanel(false)} />
      )}

      {/* ── Content when enabled ── */}
      {isEnabled && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Lights',    count: domainCounts['light'] || 0,          color: '#f59e0b', icon: '💡' },
              { label: 'Switches',  count: domainCounts['switch'] || 0,          color: '#6366f1', icon: '🔌' },
              { label: 'Sensors',   count: (domainCounts['sensor'] || 0) + (domainCounts['binary_sensor'] || 0), color: '#22c55e', icon: '🌡️' },
              { label: 'Climate',   count: domainCounts['climate'] || 0,         color: '#06b6d4', icon: '❄️' },
              { label: 'Locks',     count: domainCounts['lock'] || 0,            color: '#ef4444', icon: '🔒' },
              { label: 'Media',     count: domainCounts['media_player'] || 0,    color: '#ec4899', icon: '🎵' },
            ].map(({ label, count, color, icon }) => (
              <div key={label} style={{
                flex: '1 1 120px', padding: '12px 16px', borderRadius: 12,
                background: 'var(--bg-card)', border: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{count}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTER_TABS.map(({ label, domain }) => (
                <button key={domain || 'all'}
                  onClick={() => setFilterDomain(domain)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: filterDomain === domain
                      ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                    color: filterDomain === domain ? '#a5b4fc' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                  {domain && domainCounts[domain] ? (
                    <span style={{ marginLeft: 5, opacity: 0.7 }}>({domainCounts[domain]})</span>
                  ) : null}
                </button>
              ))}
            </div>

            <input
              placeholder="Search entities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                marginLeft: 'auto', padding: '7px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0', fontSize: 12, width: 200, outline: 'none',
              }}
            />
          </div>

          {/* Entity grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              {haEntities.length === 0
                ? (isConnected
                    ? '🔄 Connecting to Home Assistant and importing entities…'
                    : '❌ Home Assistant is not connected. Check your HA_HOST and HA_TOKEN in .env.')
                : `No entities match "${search || filterDomain}"`
              }
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}>
              {filtered.map(entity => (
                <EntityCard
                  key={entity.name}
                  entity={entity}
                  onToggle={handleToggle}
                  onSlider={handleSlider}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
