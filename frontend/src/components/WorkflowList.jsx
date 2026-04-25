import { useState } from 'react'
import { deleteWorkflow, runWorkflow, toggleWorkflow } from '../api'

function summarizeTrigger(trigger = {}) {
  if (trigger.type === 'chat')     return `Chat phrase: "${trigger.code || ''}"`
  if (trigger.type === 'schedule') return `Daily at ${trigger.time || '--:--'}`
  return `${trigger.device || 'device'} ${trigger.operator || '>'} ${trigger.value ?? 'value'}`
}

const TRIGGER_ICON = { sensor: '◈', chat: '⌘', schedule: '⏱' }
const ACTION_ICON  = { device: '⏻', brightness: '◑', camera_monitor: '⊙', log: '⊟' }

export default function WorkflowList({ workflows, onChanged }) {
  const [runningId, setRunningId] = useState(null)

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete workflow "${name}"?`)) return
    try { await deleteWorkflow(id); onChanged?.() }
    catch (e) { console.error('Failed to delete workflow:', e) }
  }

  const handleToggle = async (id) => {
    try { await toggleWorkflow(id); onChanged?.() }
    catch (e) { console.error('Failed to toggle workflow:', e) }
  }

  const handleRun = async (id) => {
    setRunningId(id)
    try { await runWorkflow(id); onChanged?.() }
    catch (e) { console.error('Failed to run workflow:', e) }
    finally { setRunningId(null) }
  }

  if (!workflows || workflows.length === 0) {
    return (
      <div className="neu-section" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 14 }}>⟳</div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>No workflows saved yet</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Build one with the editor above, or ask Chat to create one.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="led-pulse" />
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Saved Workflows
          </h3>
        </div>
        <span className="neu-badge">{workflows.length} total</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {workflows.map(wf => {
          const actions    = wf.actions || (wf.action ? [wf.action] : [])
          const trigType   = wf.trigger?.type || 'sensor'
          const trigIcon   = TRIGGER_ICON[trigType] || '◈'
          const isRunning  = runningId === wf.id
          const lastRun    = wf.last_run
            ? new Date(wf.last_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Never'

          return (
            <div key={wf.id} className="neu-plate" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── Title row ── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div className={wf.enabled ? 'led-pulse' : 'led'} />
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.name}
                    </h4>
                  </div>
                  {wf.description && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{wf.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span className="neu-badge neu-badge-accent" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {trigIcon} {trigType.toUpperCase()}
                  </span>
                  <span className={`neu-badge ${wf.enabled ? 'neu-badge-green' : ''}`}>
                    {wf.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* ── Stats trough ── */}
              <div className="neu-trough" style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {[
                  { label: 'Actions', value: actions.length },
                  { label: 'Runs',    value: wf.run_count || 0 },
                  { label: 'Cooldown', value: `${wf.cooldown_seconds || 60}s` },
                  { label: 'Last run', value: lastRun },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Trigger summary ── */}
              <div className="neu-chunk" style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Trigger: </span>
                <span style={{ fontSize: 11, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {summarizeTrigger(wf.trigger)}
                </span>
              </div>

              {/* ── Actions list ── */}
              {actions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {actions.map((a, i) => (
                    <span key={i} className="neu-badge" style={{ gap: 4 }}>
                      <span>{ACTION_ICON[a.type] || '⬡'}</span>
                      {a.type}{a.device ? ` → ${a.device}` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Action buttons ── */}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button
                  id={`toggle-wf-${wf.id}`}
                  onClick={() => handleToggle(wf.id)}
                  className="neu-btn"
                  style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600 }}
                >
                  {wf.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  id={`run-wf-${wf.id}`}
                  onClick={() => handleRun(wf.id)}
                  disabled={isRunning}
                  className="neu-btn-primary"
                  style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600 }}
                >
                  {isRunning ? '⟳ Running…' : '▶ Run'}
                </button>
                <button
                  id={`delete-wf-${wf.id}`}
                  onClick={() => handleDelete(wf.id, wf.name)}
                  className="neu-btn-danger neu-btn-sm"
                  title="Delete workflow"
                  style={{ fontSize: 14 }}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
