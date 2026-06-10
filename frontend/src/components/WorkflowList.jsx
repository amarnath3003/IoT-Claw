import { useState } from 'react'
import { Play, Trash2, Zap, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { deleteWorkflow, runWorkflow, toggleWorkflow, deployWorkflowToEdge } from '../api'

const S = {
  sans: '"Outfit", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  text1: 'rgba(255,255,255,0.82)',
  text2: 'rgba(255,255,255,0.50)',
  text3: 'rgba(255,255,255,0.25)',
  border: 'rgba(255,255,255,0.07)',
}

function summarizeTrigger(t = {}) {
  if (t.type === 'chat')         return `phrase: "${t.code || '?'}"`
  if (t.type === 'schedule')     return `daily at ${t.time || '--:--'}`
  if (t.type === 'device_event') return `${t.device || 'device'} ${t.event || 'offline'}`
  return `${t.device || 'device'} ${t.operator || '>'} ${t.value ?? '?'}`
}

function summarizeActions(actions = []) {
  if (!actions.length) return 'no actions'
  if (actions.length === 1) {
    const a = actions[0]
    if (a.type === 'device')         return `${a.device || '?'} → ${a.command}`
    if (a.type === 'brightness')     return `${a.device || '?'} → ${a.level}%`
    if (a.type === 'camera_monitor') return `camera CV ${a.command}`
    if (a.type === 'log')            return `log: "${(a.message || '').slice(0, 20)}"`
    return a.type
  }
  return `${actions.length} actions`
}

const TRIGGER_ICON  = { sensor: '◈', chat: '⌘', schedule: '⏱', device_event: '⚡' }
const ACTION_ICON   = { device: '⏻', brightness: '◑', camera_monitor: '⊙', log: '⊟' }

const TRIG_COLOR = {
  sensor:       { text: '#6b8cff', bg: 'rgba(26,46,255,0.07)', border: 'rgba(26,46,255,0.15)' },
  chat:         { text: '#6b8cff', bg: 'rgba(26,46,255,0.07)', border: 'rgba(26,46,255,0.15)' },
  schedule:     { text: '#6b8cff', bg: 'rgba(26,46,255,0.07)', border: 'rgba(26,46,255,0.15)' },
  device_event: { text: '#6b8cff', bg: 'rgba(26,46,255,0.07)', border: 'rgba(26,46,255,0.15)' },
}

export default function WorkflowList({ workflows, onChanged }) {
  const [runningId,   setRunningId]   = useState(null)
  const [deployingId, setDeployingId] = useState(null)

  const handleDeploy = async (id, name) => {
    setDeployingId(id)
    try {
      await deployWorkflowToEdge(id)
      alert(`Workflow "${name}" deployed to edge.`)
      onChanged?.()
    } catch (e) {
      alert(`Deploy failed: ${e.response?.data?.detail || e.message}`)
    } finally { setDeployingId(null) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete workflow "${name}"?`)) return
    try { await deleteWorkflow(id); onChanged?.() }
    catch (e) { console.error(e) }
  }

  const handleToggle = async (id) => {
    try { await toggleWorkflow(id); onChanged?.() }
    catch (e) { console.error(e) }
  }

  const handleRun = async (id) => {
    setRunningId(id)
    try { await runWorkflow(id); onChanged?.() }
    catch (e) { console.error(e) }
    finally { setRunningId(null) }
  }

  if (!workflows || workflows.length === 0) {
    return (
      <div style={{
        padding: '40px 32px', textAlign: 'center',
        background: 'rgba(255,255,255,0.02)', border: `1px solid ${S.border}`, borderRadius: 16,
      }}>
        <div style={{ fontSize: 28, opacity: 0.12, marginBottom: 12 }}>⟳</div>
        <p style={{ margin: 0, fontFamily: S.sans, fontSize: 14, fontWeight: 600, color: S.text2 }}>
          No workflows yet
        </p>
        <p style={{ margin: '6px 0 0', fontFamily: S.sans, fontSize: 12, color: S.text3 }}>
          Build one above or ask the AI chat to create one.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* List header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#1a2eff', boxShadow: '0 0 6px rgba(26,46,255,0.6)',
            animation: 'ledBlink 2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: S.sans, fontSize: 13, fontWeight: 600, color: S.text2 }}>
            Saved Workflows
          </span>
        </div>
        <span style={{
          fontFamily: S.mono, fontSize: 10, color: '#4d6aff',
          background: 'rgba(26,46,255,0.08)', border: '1px solid rgba(26,46,255,0.18)',
          padding: '2px 8px', borderRadius: 6,
        }}>
          {workflows.length}
        </span>
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {workflows.map(wf => {
          const actions   = wf.actions || (wf.action ? [wf.action] : [])
          const trigType  = wf.trigger?.type || 'sensor'
          const trigIcon  = TRIGGER_ICON[trigType] || '◈'
          const tc        = TRIG_COLOR[trigType] || TRIG_COLOR.sensor
          const isRunning = runningId === wf.id
          const lastRun   = wf.last_run
            ? new Date(wf.last_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Never'

          return (
            <div key={wf.id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${wf.enabled ? S.border : 'rgba(255,255,255,0.04)'}`,
              borderLeft: `3px solid ${wf.enabled ? tc.text : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12,
              overflow: 'hidden',
              opacity: wf.enabled ? 1 : 0.6,
              transition: 'opacity 0.2s',
            }}>

              {/* Title row */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: wf.enabled ? '#1a2eff' : S.text3,
                    boxShadow: wf.enabled ? '0 0 5px rgba(26,46,255,0.6)' : 'none',
                  }} />
                  <span style={{
                    fontFamily: S.sans, fontSize: 14, fontWeight: 600, color: S.text1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {wf.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {wf.deployed_to_edge && (
                    <span style={{
                      fontFamily: S.mono, fontSize: 9, fontWeight: 600,
                      color: '#4d6aff', background: 'rgba(26,46,255,0.1)',
                      border: '1px solid rgba(26,46,255,0.2)', padding: '2px 6px', borderRadius: 5,
                    }}>⚡ EDGE</span>
                  )}
                  <span style={{
                    fontFamily: S.mono, fontSize: 9, fontWeight: 600,
                    color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`,
                    padding: '2px 7px', borderRadius: 5,
                  }}>
                    {trigIcon} {trigType.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* IF / THEN */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '0 14px 10px' }}>
                <div style={{
                  padding: '7px 9px', borderRadius: '8px 0 0 8px',
                  background: tc.bg, border: `1px solid ${tc.border}`, borderRight: 'none',
                }}>
                  <div style={{ fontFamily: S.mono, fontSize: 8, fontWeight: 700, color: tc.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>IF</div>
                  <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text1, wordBreak: 'break-word', lineHeight: 1.35 }}>
                    {summarizeTrigger(wf.trigger)}
                  </div>
                </div>
                <div style={{
                  padding: '7px 9px', borderRadius: '0 8px 8px 0',
                  background: 'rgba(26,46,255,0.05)', border: '1px solid rgba(26,46,255,0.13)',
                }}>
                  <div style={{ fontFamily: S.mono, fontSize: 8, fontWeight: 700, color: '#6b8cff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>THEN</div>
                  <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text1, wordBreak: 'break-word', lineHeight: 1.35 }}>
                    {summarizeActions(actions)}
                  </div>
                </div>
              </div>

              {/* Multiple action badges */}
              {actions.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 14px 10px' }}>
                  {actions.map((a, i) => (
                    <span key={i} style={{
                      fontFamily: S.mono, fontSize: 9, fontWeight: 500,
                      padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(26,46,255,0.06)', border: '1px solid rgba(26,46,255,0.15)', color: '#6b8cff',
                    }}>
                      {ACTION_ICON[a.type] || '⬡'} {a.type}{a.device ? ` → ${a.device}` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div style={{
                display: 'flex', gap: 14, padding: '7px 14px',
                borderTop: `1px solid ${S.border}`,
                background: 'rgba(255,255,255,0.01)',
                fontFamily: S.mono, fontSize: 10, color: S.text3,
              }}>
                <span>Runs <strong style={{ color: S.text2 }}>{wf.run_count || 0}</strong></span>
                <span>Cooldown <strong style={{ color: S.text2 }}>{wf.cooldown_seconds || 60}s</strong></span>
                <span>Last <strong style={{ color: S.text2 }}>{lastRun}</strong></span>
              </div>

              {/* Action buttons */}
              <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* Run — primary */}
                  <button className="neu-btn-primary" onClick={() => handleRun(wf.id)} disabled={isRunning}
                    style={{ flex: 1, justifyContent: 'center', gap: 5, padding: '7px 0', fontSize: 12 }}>
                    {isRunning
                      ? <><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Running…</>
                      : <><Play size={11} /> Run</>
                    }
                  </button>

                  {/* Pause / Enable — ghost */}
                  <button className="neu-btn" onClick={() => handleToggle(wf.id)}
                    style={{
                      flex: 1, justifyContent: 'center', gap: 5, padding: '7px 0', fontSize: 12,
                      color: wf.enabled ? 'rgba(255,255,255,0.40)' : '#6b8cff',
                      borderColor: wf.enabled ? 'rgba(255,255,255,0.10)' : 'rgba(26,46,255,0.25)',
                      background: wf.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(26,46,255,0.07)',
                    }}>
                    {wf.enabled
                      ? <><ToggleLeft size={12} /> Pause</>
                      : <><ToggleRight size={12} /> Enable</>
                    }
                  </button>

                  {/* Delete */}
                  <button className="neu-btn-danger" onClick={() => handleDelete(wf.id, wf.name)} title="Delete"
                    style={{ padding: '7px 10px', fontSize: 12 }}>
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Deploy */}
                {trigType === 'sensor' && (
                  <button className="neu-btn" onClick={() => handleDeploy(wf.id, wf.name)}
                    disabled={deployingId === wf.id}
                    style={{ width: '100%', justifyContent: 'center', gap: 5, fontSize: 12, color: '#4d6aff', borderColor: 'rgba(26,46,255,0.25)', background: 'rgba(26,46,255,0.06)' }}>
                    <Zap size={11} />
                    {deployingId === wf.id ? 'Deploying…' : 'Deploy to Edge'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
