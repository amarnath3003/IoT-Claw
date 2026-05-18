import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../api'
import axios from 'axios'

const api = axios.create({ baseURL: API_BASE })

/* ── API helpers ─────────────────────────────────────────────────────────── */
const getStatus = () => api.get('/autonomous/status')
const getCycles = (limit = 30) => api.get(`/autonomous/cycles?limit=${limit}`)
const updateSettings = (s) => api.patch('/autonomous/settings', s)
const triggerCycle = () => api.post('/autonomous/trigger')

/* ── Mood config ─────────────────────────────────────────────────────────── */
const MOOD_CONFIG = {
  vigilant:   { color: '#fbbf24', icon: '◈', label: 'Vigilant' },
  calm:       { color: '#60a5fa', icon: '○', label: 'Calm' },
  concerned:  { color: '#f87171', icon: '⚠', label: 'Concerned' },
  optimizing: { color: '#34d399', icon: '⟳', label: 'Optimizing' },
  learning:   { color: '#a78bfa', icon: '⊙', label: 'Learning' },
}

const ACTION_TYPE_CONFIG = {
  device_control:  { color: '#34d399', icon: '⏻', label: 'Device Control' },
  create_workflow: { color: '#a78bfa', icon: '⟳', label: 'Create Workflow' },
  send_alert:      { color: '#fbbf24', icon: '⚠', label: 'Send Alert' },
  nothing:         { color: '#4a5568', icon: '—', label: 'No Action' },
}

/* ── Sparkline confidence history ─────────────────────────────────────────── */
function ConfidenceSparkline({ cycles }) {
  if (!cycles || cycles.length < 2) return null
  const vals = cycles.map(c => c.confidence || 0).reverse()
  const W = 120, H = 28, PAD = 2
  const max = 100, min = 0
  const range = max - min || 1
  const coords = vals.map((v, i) => {
    const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = coords[coords.length - 1].split(',')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} preserveAspectRatio="none">
      <polyline points={coords.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--accent)" />
    </svg>
  )
}

/* ── Pulsing brain indicator ─────────────────────────────────────────────── */
function BrainPulse({ mood, thinking }) {
  const cfg = MOOD_CONFIG[mood] || MOOD_CONFIG.calm
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      {/* Outer pulse ring */}
      <div style={{
        position: 'absolute', inset: -4,
        borderRadius: '50%',
        border: `2px solid ${cfg.color}`,
        opacity: thinking ? 0.6 : 0.3,
        animation: thinking ? 'brainPulse 1s ease-in-out infinite' : 'brainPulse 3s ease-in-out infinite',
      }} />
      {/* Inner glow */}
      <div style={{
        position: 'absolute', inset: 2,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${cfg.color}22 0%, transparent 70%)`,
        animation: thinking ? 'brainGlow 0.8s ease-in-out infinite alternate' : 'none',
      }} />
      {/* Core */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: 'var(--bg-card2)',
        border: `1px solid ${cfg.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
        color: cfg.color,
        filter: thinking ? `drop-shadow(0 0 6px ${cfg.color}88)` : 'none',
        transition: 'all 0.4s ease',
      }}>
        {cfg.icon}
      </div>
    </div>
  )
}

/* ── Cycle card ─────────────────────────────────────────────────────────── */
function CycleCard({ cycle, isLatest }) {
  const [expanded, setExpanded] = useState(isLatest)
  const mood = MOOD_CONFIG[cycle.mood] || MOOD_CONFIG.calm
  const ts = cycle.ts ? new Date(cycle.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '?'
  const executedActions = (cycle.actions || []).filter(a => a._result?.executed)
  const hasActions = executedActions.length > 0

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 12,
        border: `1px solid ${isLatest ? mood.color + '33' : 'rgba(255,255,255,0.05)'}`,
        background: isLatest ? 'rgba(255,255,255,0.03)' : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Mood dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: mood.color,
          boxShadow: isLatest ? `0 0 8px ${mood.color}88` : 'none',
        }} />

        {/* Timestamp */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
          {ts}
        </span>

        {/* Mood badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          color: mood.color, flexShrink: 0,
          textTransform: 'uppercase',
        }}>
          {mood.label}
        </span>

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{
            width: 40, height: 3, borderRadius: 99,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${cycle.confidence || 0}%`,
              background: cycle.confidence > 70 ? '#34d399' : cycle.confidence > 40 ? '#fbbf24' : '#f87171',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {cycle.confidence || 0}%
          </span>
        </div>

        {/* Action badges */}
        {hasActions && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {executedActions.slice(0, 3).map((a, i) => {
              const aCfg = ACTION_TYPE_CONFIG[a.type] || ACTION_TYPE_CONFIG.nothing
              return (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                  padding: '2px 6px', borderRadius: 99,
                  background: aCfg.color + '18',
                  border: `1px solid ${aCfg.color}33`,
                  color: aCfg.color, textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {aCfg.icon} {a.device || a.type?.split('_')[0]}
                </span>
              )
            })}
          </div>
        )}

        {/* Expand chevron */}
        <span style={{
          fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto',
          transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none',
          flexShrink: 0,
        }}>▾</span>
      </div>

      {/* Observe preview (always visible) */}
      <div style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {cycle.observe?.slice(0, 120)}{cycle.observe?.length > 120 ? '…' : ''}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Think */}
          {cycle.think && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                💭 Reasoning
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>{cycle.think}</div>
            </div>
          )}

          {/* Actions */}
          {(cycle.actions || []).length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                ⚡ Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(cycle.actions || []).map((action, i) => {
                  const aCfg = ACTION_TYPE_CONFIG[action.type] || ACTION_TYPE_CONFIG.nothing
                  const executed = action._result?.executed
                  return (
                    <div key={i} style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: executed ? aCfg.color + '10' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${executed ? aCfg.color + '25' : 'rgba(255,255,255,0.05)'}`,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <span style={{ color: aCfg.color, fontSize: 12, flexShrink: 0, marginTop: 1 }}>{aCfg.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: executed ? 'var(--text-main)' : 'var(--text-dim)' }}>
                          {action.device && <><span style={{ color: 'var(--accent-light)', fontFamily: 'JetBrains Mono, monospace' }}>{action.device}</span> → </>}
                          {action.command || action.type}
                          {!executed && action.type !== 'nothing' && (
                            <span style={{ fontSize: 9, color: '#f87171', marginLeft: 6 }}>FAILED</span>
                          )}
                        </div>
                        {action.reason && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                            {action.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Reflect */}
          {cycle.reflect && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                📝 Memory
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>{cycle.reflect}</div>
            </div>
          )}

          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
            {cycle.cycle_duration_ms}ms · id:{cycle.id}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Settings panel ─────────────────────────────────────────────────────── */
function SettingsPanel({ settings, onUpdate, onClose }) {
  const [local, setLocal] = useState({ ...settings })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onUpdate(local)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const intervals = [15, 30, 60, 120, 300, 600]

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div className="neu-section" style={{ width: '100%', maxWidth: 440 }}>
        <div className="neu-section-header">
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>Autonomous Agent Settings</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Configure the Claw's behavior</div>
          </div>
          <button onClick={onClose} className="neu-btn-sm" style={{ fontSize: 14 }}>✕</button>
        </div>

        <div className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Agent Active</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Allow the Claw to act autonomously</div>
            </div>
            <label className="hw-toggle">
              <input type="checkbox"
                checked={local.enabled === 'true' || local.enabled === true}
                onChange={e => setLocal(l => ({ ...l, enabled: String(e.target.checked) }))} />
              <div className="hw-toggle-track" />
            </label>
          </div>

          {/* Interval */}
          <div>
            <label className="neu-label">Reasoning Interval</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {intervals.map(s => (
                <button key={s}
                  onClick={() => setLocal(l => ({ ...l, interval: String(s) }))}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    fontWeight: 600, border: 'none',
                    background: local.interval === String(s) ? 'var(--accent)' : 'var(--bg-dark)',
                    color: local.interval === String(s) ? '#fff' : 'var(--text-dim)',
                    boxShadow: local.interval === String(s) ? '0 2px 8px rgba(37,99,235,0.3)' : 'var(--sh-flat)',
                    transition: 'all 0.15s',
                  }}>
                  {s < 60 ? `${s}s` : `${s / 60}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Aggression */}
          <div>
            <label className="neu-label">Aggression Level</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { key: 'low', label: 'Conservative', desc: 'Only obvious safety & energy issues', color: '#60a5fa' },
                { key: 'medium', label: 'Balanced', desc: 'Patterns, efficiency, comfort', color: '#fbbf24' },
                { key: 'high', label: 'Proactive', desc: 'Continuous optimization & learning', color: '#f87171' },
              ].map(opt => (
                <div key={opt.key}
                  onClick={() => setLocal(l => ({ ...l, aggression: opt.key }))}
                  style={{
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${local.aggression === opt.key ? opt.color + '55' : 'rgba(255,255,255,0.06)'}`,
                    background: local.aggression === opt.key ? opt.color + '10' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: local.aggression === opt.key ? opt.color : 'rgba(255,255,255,0.15)',
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: local.aggression === opt.key ? opt.color : 'var(--text-dim)' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{opt.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Max actions */}
          <div>
            <label className="neu-label">Max Actions Per Cycle</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 5].map(n => (
                <button key={n}
                  onClick={() => setLocal(l => ({ ...l, max_actions: String(n) }))}
                  style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    fontWeight: 700, border: 'none',
                    background: local.max_actions === String(n) ? 'var(--accent)' : 'var(--bg-dark)',
                    color: local.max_actions === String(n) ? '#fff' : 'var(--text-dim)',
                    boxShadow: local.max_actions === String(n) ? '0 2px 8px rgba(37,99,235,0.3)' : 'var(--sh-flat)',
                    transition: 'all 0.15s',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Pause */}
          <div>
            <label className="neu-label">Pause Agent For</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: '30m', minutes: 30 },
                { label: '1h', minutes: 60 },
                { label: '3h', minutes: 180 },
                { label: '8h', minutes: 480 },
              ].map(p => (
                <button key={p.label}
                  onClick={() => {
                    const until = new Date(Date.now() + p.minutes * 60000).toISOString()
                    setLocal(l => ({ ...l, paused_until: until }))
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'var(--bg-dark)', color: 'var(--text-dim)',
                    transition: 'all 0.15s',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="neu-btn" style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{
                flex: 2, padding: '10px 0', fontSize: 12, fontWeight: 700, border: 'none',
                borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer',
                background: 'var(--accent)', color: '#fff',
                boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving…' : '✓ Apply Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function AutonomousClaw({ wsMessages }) {
  const [status, setStatus] = useState(null)
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [liveThinking, setLiveThinking] = useState(false)
  const bottomRef = useRef(null)

  const loadData = useCallback(async () => {
    try {
      const [statusRes, cyclesRes] = await Promise.all([getStatus(), getCycles(30)])
      setStatus(statusRes.data)
      setCycles(cyclesRes.data)
    } catch (e) {
      console.error('[AutonomousClaw] Load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 30000)
    return () => clearInterval(t)
  }, [loadData])

  // React to WebSocket pushes from the agent
  useEffect(() => {
    if (!wsMessages) return
    if (wsMessages.type === 'autonomous_cycle') {
      const newCycle = wsMessages.cycle
      setCycles(prev => {
        const updated = [newCycle, ...prev.filter(c => c.id !== newCycle.id)]
        return updated.slice(0, 50)
      })
      setLiveThinking(false)
    }
  }, [wsMessages])

  const handleTrigger = async () => {
    setTriggering(true)
    setLiveThinking(true)
    try {
      await triggerCycle()
      setTimeout(() => loadData(), 3000)
    } catch (e) {
      setLiveThinking(false)
    } finally {
      setTriggering(false)
    }
  }

  const handleUpdateSettings = async (newSettings) => {
    await updateSettings(newSettings)
    await loadData()
  }

  const latestCycle = cycles[0]
  const latestMood = latestCycle?.mood || 'calm'
  const moodCfg = MOOD_CONFIG[latestMood] || MOOD_CONFIG.calm
  const isEnabled = status?.enabled ?? true
  const totalActions = cycles.reduce((sum, c) => sum + (c.actions_executed || 0), 0)
  const avgConfidence = cycles.length
    ? Math.round(cycles.reduce((s, c) => s + (c.confidence || 0), 0) / cycles.length)
    : 0

  return (
    <>
      <style>{`
        @keyframes brainPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.08); opacity: 0.7; }
        }
        @keyframes brainGlow {
          from { opacity: 0.2; }
          to { opacity: 0.6; }
        }
        @keyframes thinkingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes scanLine {
          from { transform: translateY(0); opacity: 0.6; }
          to { transform: translateY(100%); opacity: 0; }
        }
        .claw-cycle-item:hover { background: rgba(255,255,255,0.02) !important; }
      `}</style>

      {showSettings && status && (
        <SettingsPanel
          settings={status.settings || {}}
          onUpdate={handleUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header Panel ── */}
        <div className="neu-section">
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>

              {/* Left: Brain + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <BrainPulse mood={latestMood} thinking={liveThinking} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                    Autonomous <span style={{ color: 'var(--accent)' }}>Claw</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {isEnabled
                      ? liveThinking
                        ? <span style={{ color: moodCfg.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>Reasoning</span>
                            {[0, 120, 240].map(d => (
                              <span key={d} style={{
                                width: 4, height: 4, borderRadius: '50%',
                                background: moodCfg.color,
                                display: 'inline-block',
                                animation: `thinkingDot 1.2s ease-in-out infinite`,
                                animationDelay: `${d}ms`,
                              }} />
                            ))}
                          </span>
                        : `Last cycle: ${status?.last_cycle_ts
                            ? new Date(status.last_cycle_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'never'} · Next in ~${status?.interval || 60}s`
                      : <span style={{ color: '#f87171' }}>Agent paused</span>
                    }
                  </div>
                </div>
              </div>

              {/* Right: Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                {/* Enabled badge */}
                <div style={{
                  padding: '6px 12px', borderRadius: 99,
                  background: isEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${isEnabled ? 'rgba(34,197,94,0.25)' : 'rgba(248,113,113,0.25)'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isEnabled ? '#22c55e' : '#f87171',
                    animation: isEnabled ? 'brainPulse 2s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: isEnabled ? '#22c55e' : '#f87171' }}>
                    {isEnabled ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>

                {/* Trigger */}
                <button
                  onClick={handleTrigger}
                  disabled={triggering}
                  className="neu-btn-primary"
                  style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700 }}
                >
                  {triggering ? '⟳ Thinking…' : '▶ Think Now'}
                </button>

                {/* Settings */}
                <button
                  onClick={() => setShowSettings(true)}
                  className="neu-btn-sm"
                  title="Agent settings"
                  style={{ fontSize: 13 }}
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* Stats row */}
            {!loading && (
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                {[
                  { label: 'Total Cycles', value: status?.cycle_count || cycles.length },
                  { label: 'Actions Taken', value: totalActions, color: '#34d399' },
                  { label: 'Avg Confidence', value: `${avgConfidence}%`, color: avgConfidence > 70 ? '#34d399' : '#fbbf24' },
                  { label: 'Aggression', value: (status?.aggression || 'medium').toUpperCase(), color: '#a78bfa' },
                  { label: 'Interval', value: `${status?.interval || 60}s` },
                ].map(s => (
                  <div key={s.label} className="neu-trough" style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color || 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Live State Panel ── */}
        {latestCycle && (
          <div className="neu-section">
            <div className="neu-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: moodCfg.color, animation: 'brainPulse 2s infinite' }} />
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                  Latest Brain State
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ConfidenceSparkline cycles={cycles} />
                <span className="neu-badge" style={{ color: moodCfg.color, borderColor: moodCfg.color + '44' }}>
                  {moodCfg.icon} {moodCfg.label}
                </span>
              </div>
            </div>

            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Observe */}
              <div className="neu-trough" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  👁 Observing
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  {latestCycle.observe || 'No observation yet'}
                </div>
              </div>

              {/* Think */}
              <div className="neu-trough" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  💭 Thinking
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  {latestCycle.think || 'No reasoning yet'}
                </div>
              </div>

              {/* Reflect (full width) */}
              {latestCycle.reflect && (
                <div className="neu-trough" style={{ padding: '12px 16px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    📝 Memory Update
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {latestCycle.reflect}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Cycle History ── */}
        <div className="neu-section">
          <div className="neu-section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="led-pulse" style={{ width: 6, height: 6 }} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                Decision Log
              </span>
            </div>
            <span className="neu-badge">{cycles.length} cycles</span>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                Loading history…
              </div>
            ) : cycles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>🧠</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>No cycles yet</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  Click "Think Now" to run the first reasoning cycle
                </div>
              </div>
            ) : (
              cycles.map((cycle, i) => (
                <CycleCard key={cycle.id || i} cycle={cycle} isLatest={i === 0} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Info box ── */}
        <div className="neu-alert-info" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>
            <strong>How the Autonomous Claw works:</strong> Every {status?.interval || 60} seconds, the agent wakes up, reads all your device states, sensor readings, and recent activity, then reasons about what's happening and what should be done — with no human input. It can turn devices on/off, create new automation workflows, and send alerts. Set <em>aggression</em> to control how proactive it is.
          </div>
        </div>
      </div>
    </>
  )
}