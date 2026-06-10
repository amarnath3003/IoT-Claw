import { useState, useEffect, useCallback } from 'react'
import { Home, RefreshCw, Zap, Search, X } from 'lucide-react'
import { getHAStatus, haSetEntity, haCallService, haRefresh, commandDevice } from '../api'

const C = {
  depth:  'rgba(255,255,255,0.02)',
  panel:  'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.65)',
  text3:  'rgba(255,255,255,0.35)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  green:  '#22c55e',
  red:    '#ef4444',
  amber:  '#f59e0b',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
  rPanel: 16,
  rCard:  12,
  rBtn:   10,
}

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: C.text3, marginBottom: 4, fontFamily: C.mono,
}
const inputStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text1,
  fontFamily: C.sans, outline: 'none', boxSizing: 'border-box',
}

/* ── Domain config ── */
const DOMAIN_COLORS = {
  light:         '#6b8cff',
  switch:        '#6b8cff',
  sensor:        '#6b8cff',
  binary_sensor: '#6b8cff',
  climate:       '#6b8cff',
  media_player:  '#6b8cff',
  cover:         '#6b8cff',
  lock:          '#6b8cff',
  fan:           '#6b8cff',
  vacuum:        '#6b8cff',
  scene:         '#6b8cff',
  script:        '#6b8cff',
  ha_generic:    '#6b8cff',
}

const DOMAIN_GLYPHS = {
  light: '◉', switch: '⏻', sensor: '◈', binary_sensor: '⬡', climate: '◐',
  media_player: '◭', cover: '⬢', lock: '⬣', fan: '◎', vacuum: '⊙',
  input_boolean: '⊟', automation: '⊞', scene: '▣', script: '◫', camera: '⊙',
  ha_generic: '⬡',
}

const FILTER_TABS = [
  { label: 'All',      domain: '' },
  { label: 'Lights',   domain: 'light' },
  { label: 'Switches', domain: 'switch' },
  { label: 'Sensors',  domain: 'sensor' },
  { label: 'Climate',  domain: 'climate' },
  { label: 'Locks',    domain: 'lock' },
  { label: 'Media',    domain: 'media_player' },
  { label: 'Covers',   domain: 'cover' },
  { label: 'Scenes',   domain: 'scene' },
]

/* small helper — convert hex color to rgba */
function hexA(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2), 16)
  const g = parseInt(h.slice(2,4), 16)
  const b = parseInt(h.slice(4,6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ── Entity card ── */
function EntityCard({ entity, onToggle, onSlider }) {
  const domain    = entity.ha_domain || 'ha_generic'
  const glyph     = DOMAIN_GLYPHS[domain] || '⬡'
  const color     = DOMAIN_COLORS[domain] || C.blue
  const isOn      = ['ON', 'on', 'open', 'unlocked', 'playing', 'home'].includes(String(entity.status).toLowerCase())
  const isReadOnly= ['sensor', 'binary_sensor', 'camera'].includes(domain)
  const [brightness, setBrightness] = useState(entity.brightness ? Math.round((entity.brightness / 255) * 100) : 50)
  const [busy, setBusy]             = useState(false)

  useEffect(() => {
    if (entity.brightness) setBrightness(Math.round((entity.brightness / 255) * 100))
  }, [entity.brightness])

  const toggle = async () => {
    if (isReadOnly || busy) return
    setBusy(true)
    try { await onToggle(entity.name, isOn ? 'OFF' : 'ON') }
    finally { setBusy(false) }
  }

  const applyBrightness = async (val) => {
    setBrightness(val)
    await onSlider(entity.name, val)
  }

  const statusColor = isOn ? '#6b8cff' : (isReadOnly ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.25)')
  const statusLabel = isReadOnly
    ? String(entity.status) + (entity.unit ? ` ${entity.unit}` : '')
    : isOn ? 'ON' : (entity.status === 'unknown' ? 'unknown' : 'OFF')

  return (
    <div
      onClick={!isReadOnly ? toggle : undefined}
      style={{
        padding: '16px 15px', display: 'flex', flexDirection: 'column', gap: 9,
        background: C.depth,
        border: `1px solid ${isOn ? hexA(color, 0.2) : C.border}`,
        borderTop: `3px solid ${isOn ? color : 'rgba(255,255,255,0.05)'}`,
        borderRadius: C.rCard,
        cursor: isReadOnly ? 'default' : 'pointer',
        transition: 'all 0.2s',
        boxShadow: isOn ? `0 0 16px ${hexA(color, 0.10)}` : 'none',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: isOn ? hexA(color, 0.12) : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isOn ? hexA(color, 0.20) : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: isOn ? color : C.text3,
            transition: 'all 0.2s',
          }}>
            {glyph}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text1, lineHeight: 1.2, fontFamily: C.sans }}>
              {entity.description || entity.name}
            </div>
            <div style={{ fontSize: 9, color: C.text3, marginTop: 2, fontFamily: C.mono }}>
              {entity.name}
            </div>
          </div>
        </div>
        <div style={{
          padding: '3px 9px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          background: hexA(statusColor, 0.10), color: statusColor,
          border: `1px solid ${hexA(statusColor, 0.25)}`,
          borderRadius: 6, fontFamily: C.mono, whiteSpace: 'nowrap',
        }}>
          {statusLabel}
        </div>
      </div>

      {/* Domain badge */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 4, color,
          background: hexA(color, 0.08),
          fontFamily: C.mono,
        }}>
          {domain}
        </span>
        {entity.location && (
          <span style={{ fontSize: 10, color: C.text3, fontFamily: C.sans }}>◍ {entity.location}</span>
        )}
      </div>

      {/* Brightness slider */}
      {domain === 'light' && isOn && (
        <div onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: C.text3, fontFamily: C.mono }}>Brightness</span>
            <span style={{ fontSize: 9, color: C.amber, fontWeight: 700, fontFamily: C.mono }}>{brightness}%</span>
          </div>
          <input type="range" min={1} max={100} value={brightness}
            onChange={e => setBrightness(Number(e.target.value))}
            onMouseUp={e => applyBrightness(Number(e.target.value))}
            onTouchEnd={e => applyBrightness(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.amber, cursor: 'pointer' }} />
        </div>
      )}

      {/* Toggle indicator */}
      {!isReadOnly && !busy && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            width: 34, height: 18,
            background: isOn ? color : 'rgba(255,255,255,0.08)',
            borderRadius: 9,
            transition: 'background 0.25s', position: 'relative', cursor: 'pointer',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: isOn ? 16 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>
      )}
      {busy && (
        <div style={{ fontSize: 9, color: C.text3, textAlign: 'right', fontFamily: C.mono }}>
          sending…
        </div>
      )}
    </div>
  )
}

/* ── Raw service call panel ── */
function ServiceCallPanel({ onClose }) {
  const [domain,   setDomain]   = useState('scene')
  const [service,  setService]  = useState('turn_on')
  const [entityId, setEntityId] = useState('')
  const [dataRaw,  setDataRaw]  = useState('{}')
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  const call = async () => {
    setLoading(true); setResult(null)
    try {
      let parsed = {}
      try { parsed = JSON.parse(dataRaw) } catch {}
      const res = await haCallService(domain, service, entityId, parsed)
      setResult({ ok: true, data: res.data })
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.detail || e.message })
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: C.rPanel,
      padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: C.text1,
          fontFamily: C.sans,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Zap size={12} style={{ color: C.blue }} />
          Raw Service Call
        </div>
        <button onClick={onClose} style={{
          all: 'unset', cursor: 'pointer', color: C.text3, lineHeight: 1,
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${C.border}`, borderRadius: 6,
        }}>
          <X size={12} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Domain',  value: domain,  set: setDomain,  ph: 'scene' },
          { label: 'Service', value: service, set: setService, ph: 'turn_on' },
        ].map(({ label, value, set, ph }) => (
          <div key={label}>
            <div style={labelStyle}>{label}</div>
            <input value={value} onChange={e => set(e.target.value)} placeholder={ph}
              style={{ ...inputStyle, fontSize: 12, fontFamily: C.mono }} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>Entity ID (optional)</div>
        <input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="scene.movie_night"
          style={{ ...inputStyle, fontSize: 12, fontFamily: C.mono }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Service Data (JSON)</div>
        <textarea value={dataRaw} onChange={e => setDataRaw(e.target.value)} rows={3}
          style={{ ...inputStyle, fontFamily: C.mono, fontSize: 11, resize: 'vertical' }} />
      </div>
      <button onClick={call} disabled={loading} style={{
        padding: '9px 18px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 11,
        border: 'none', letterSpacing: '0.07em', textTransform: 'uppercase',
        background: 'rgba(26,46,255,0.85)',
        color: '#fff', borderRadius: C.rBtn,
        opacity: loading ? 0.6 : 1, fontFamily: C.sans,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Zap size={12} />
        {loading ? 'Calling…' : 'Call Service'}
      </button>
      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: result.ok ? 'rgba(34,197,94,0.07)' : 'rgba(248,113,113,0.07)',
          border: `1px solid ${result.ok ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)'}`,
          fontSize: 11, color: result.ok ? C.green : C.red,
          fontFamily: C.mono,
        }}>
          {result.ok ? '✓ Success' : `✗ ${result.error}`}
        </div>
      )}
    </div>
  )
}

/* ── Main HAManager ── */
export default function HAManager({ deviceStates }) {
  const [status,           setStatus]           = useState(null)
  const [filterDomain,     setFilterDomain]     = useState('')
  const [search,           setSearch]           = useState('')
  const [showServicePanel, setShowServicePanel] = useState(false)
  const [refreshing,       setRefreshing]       = useState(false)
  const [toast,            setToast]            = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const loadStatus = useCallback(async () => {
    try { setStatus((await getHAStatus()).data) }
    catch { setStatus({ enabled: false, connected: false, entity_count: 0, error: 'Backend offline' }) }
  }, [])

  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 15000); return () => clearInterval(t) }, [loadStatus])

  const haEntities = Object.values(deviceStates || {}).filter(d => d.integration_source === 'ha' || d.ha_entity)
  const filtered   = haEntities
    .filter(e => !filterDomain || e.ha_domain === filterDomain)
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.description||'').toLowerCase().includes(search.toLowerCase()) || (e.location||'').toLowerCase().includes(search.toLowerCase()))

  const domainCounts = haEntities.reduce((acc, e) => { acc[e.ha_domain] = (acc[e.ha_domain] || 0) + 1; return acc }, {})

  const handleToggle = async (name, command) => {
    try { await commandDevice(name, command); showToast(`${name}: ${command}`) }
    catch (e) { showToast(e.response?.data?.detail || 'Command failed', 'error') }
  }

  const handleSlider = async (name, brightnessPct) => {
    try { await haSetEntity(name, { state: 'ON', brightness_pct: brightnessPct }) }
    catch (e) { console.error('HA brightness error', e) }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await haRefresh()
      showToast(`Refreshed — ${res.data.entity_count} entities`)
      loadStatus()
    } catch (e) { showToast(e.response?.data?.detail || 'Refresh failed', 'error') }
    finally { setRefreshing(false) }
  }

  const isEnabled   = status?.enabled
  const isConnected = status?.connected

  const btnBase = {
    padding: '6px 14px', cursor: 'pointer',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5,
    fontFamily: C.sans,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '10px 18px',
          background: toast.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          color: toast.type === 'error' ? C.red : C.green,
          fontSize: 12, fontWeight: 700, backdropFilter: 'blur(10px)',
          borderRadius: 10, fontFamily: C.mono,
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 18, fontWeight: 800, color: C.text1,
            fontFamily: C.sans,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Home size={18} style={{ color: C.blue }} />
            Home Assistant
          </h2>
          <p style={{ margin: '4px 0 0', color: C.text3, fontSize: 12, fontFamily: C.mono }}>
            {haEntities.length} entit{haEntities.length !== 1 ? 'ies' : 'y'} imported
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Connection pill */}
          <div style={{
            padding: '6px 12px', borderRadius: 8,
            background: isConnected ? 'rgba(34,197,94,0.08)' : isEnabled ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isConnected ? 'rgba(34,197,94,0.2)' : isEnabled ? 'rgba(239,68,68,0.2)' : C.border}`,
            color: isConnected ? C.green : isEnabled ? C.red : C.text3,
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: C.mono,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isConnected ? C.green : isEnabled ? C.red : '#64748b',
              animation: isConnected ? 'ledBlink 2s infinite' : 'none',
            }} />
            {isConnected ? `CONNECTED · ${status?.host}` : isEnabled ? 'DISCONNECTED' : 'DISABLED'}
          </div>

          {isEnabled && (
            <button onClick={handleRefresh} disabled={refreshing || !isConnected} style={{
              ...btnBase,
              border: '1px solid rgba(26,46,255,0.25)', background: 'rgba(26,46,255,0.07)',
              color: C.blue, opacity: refreshing || !isConnected ? 0.5 : 1,
              cursor: refreshing || !isConnected ? 'not-allowed' : 'pointer',
            }}>
              <RefreshCw size={11} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              {refreshing ? 'Syncing…' : 'Sync Entities'}
            </button>
          )}

          <button onClick={() => setShowServicePanel(p => !p)} style={{
            ...btnBase,
            border: `1px solid ${showServicePanel ? 'rgba(26,46,255,0.4)' : C.border}`,
            background: showServicePanel ? 'rgba(26,46,255,0.12)' : 'rgba(255,255,255,0.03)',
            color: showServicePanel ? C.blue : C.text2,
          }}>
            <Zap size={11} /> Call Service
          </button>
        </div>
      </div>

      {/* Disabled state */}
      {!isEnabled && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
          borderRadius: C.rPanel,
          padding: '40px 28px', textAlign: 'center',
        }}>
          <Home size={48} style={{ opacity: 0.1, color: C.blue, display: 'block', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text1, marginBottom: 8, fontFamily: C.sans }}>
            Home Assistant Not Enabled
          </div>
          <div style={{ fontSize: 12, color: C.text3, maxWidth: 480, margin: '0 auto', lineHeight: 1.7, fontFamily: C.sans }}>
            Set these in{' '}
            <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontFamily: C.mono }}>
              backend/.env
            </code>{' '}
            and restart:
          </div>
          <div style={{
            marginTop: 16, padding: '12px 18px', textAlign: 'left',
            background: 'rgba(0,0,0,0.35)', borderRadius: 10,
            fontSize: 11, color: '#94a3b8',
            maxWidth: 380, margin: '16px auto 0',
            fontFamily: C.mono, lineHeight: 2,
          }}>
            <div>HA_ENABLED=<span style={{ color: C.amber }}>true</span></div>
            <div>HA_HOST=<span style={{ color: C.blue }}>192.168.1.100</span></div>
            <div>HA_PORT=<span style={{ color: C.blue }}>8123</span></div>
            <div>HA_TOKEN=<span style={{ color: C.blue }}>your_token_here</span></div>
          </div>
        </div>
      )}

      {/* Service call panel */}
      {showServicePanel && isEnabled && (
        <ServiceCallPanel onClose={() => setShowServicePanel(false)} />
      )}

      {/* Main content */}
      {isEnabled && (
        <>
          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {[
              { label: 'Lights',   count: domainCounts['light'] || 0,              glyph: '◉' },
              { label: 'Switches', count: domainCounts['switch'] || 0,             glyph: '⏻' },
              { label: 'Sensors',  count: (domainCounts['sensor']||0)+(domainCounts['binary_sensor']||0), glyph: '◈' },
              { label: 'Climate',  count: domainCounts['climate'] || 0,            glyph: '◐' },
              { label: 'Locks',    count: domainCounts['lock'] || 0,               glyph: '⬣' },
              { label: 'Media',    count: domainCounts['media_player'] || 0,       glyph: '◭' },
            ].map(({ label, count, glyph }) => (
              <div key={label} style={{
                padding: '10px 12px', background: C.depth,
                border: `1px solid ${C.border}`, borderRadius: C.rCard,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16, color: 'rgba(107,140,255,0.5)' }}>{glyph}</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text1, fontFamily: C.mono }}>{count}</div>
                  <div style={{ fontSize: 9, color: C.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: C.sans }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter + search */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTER_TABS.map(({ label, domain }) => (
                <button key={domain || 'all'} onClick={() => setFilterDomain(domain)} style={{
                  padding: '5px 11px', cursor: 'pointer', fontSize: 11,
                  fontWeight: filterDomain === domain ? 700 : 500,
                  border: `1px solid ${filterDomain === domain ? 'rgba(26,46,255,0.35)' : C.border}`,
                  background: filterDomain === domain ? 'rgba(26,46,255,0.12)' : 'rgba(255,255,255,0.02)',
                  color: filterDomain === domain ? C.blue : C.text3,
                  borderRadius: 8, transition: 'all 0.15s', fontFamily: C.sans,
                }}>
                  {label}
                  {domain && domainCounts[domain] ? (
                    <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>({domainCounts[domain]})</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.text3 }} />
              <input
                placeholder="Search entities…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 27, width: 180, fontSize: 12 }}
              />
            </div>
          </div>

          {/* Entity grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: C.text3, fontSize: 13, fontFamily: C.sans }}>
              {haEntities.length === 0
                ? (isConnected ? 'Connecting and importing entities…' : 'Home Assistant is not connected. Check HA_HOST and HA_TOKEN in .env.')
                : `No entities match "${search || filterDomain}"`}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {filtered.map(entity => (
                <EntityCard key={entity.name} entity={entity} onToggle={handleToggle} onSlider={handleSlider} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
