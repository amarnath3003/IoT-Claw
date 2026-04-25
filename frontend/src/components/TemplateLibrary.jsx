import { useState, useEffect } from 'react'
import { getState, createWorkflow } from '../api'

const TEMPLATES = [
  {
    id: 'smart-thermostat',
    name: 'Smart Thermostat',
    description: 'Turn on AC/fan when temperature exceeds a threshold.',
    icon: '◈',
    iconColor: '#f87171',
    tag: 'Climate',
    defaults: { trigger_operator: '>', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'auto-lights-off',
    name: 'Auto Lights Off',
    description: 'Turn off lights when no motion is detected.',
    icon: '◑',
    iconColor: '#fbbf24',
    tag: 'Lighting',
    defaults: { trigger_operator: '==', trigger_value: 0, action_command: 'OFF' },
  },
  {
    id: 'plant-watering',
    name: 'Plant Watering',
    description: 'Turn on water pump when soil moisture drops low.',
    icon: '⊡',
    iconColor: '#22c55e',
    tag: 'Garden',
    defaults: { trigger_operator: '<', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'security-lights',
    name: 'Security Lights',
    description: 'Turn on lights when motion is detected at night.',
    icon: '⊙',
    iconColor: 'var(--accent)',
    tag: 'Security',
    defaults: { trigger_operator: '==', trigger_value: 1, action_command: 'ON' },
  },
  {
    id: 'overheat-protection',
    name: 'Overheat Protection',
    description: 'Turn off a device if temperature gets dangerously high.',
    icon: '⏻',
    iconColor: '#f87171',
    tag: 'Safety',
    defaults: { trigger_operator: '>', trigger_value: 60, action_command: 'OFF' },
  },
  {
    id: 'humidity-control',
    name: 'Humidity Control',
    description: 'Turn on dehumidifier when humidity exceeds threshold.',
    icon: '⬡',
    iconColor: '#38bdf8',
    tag: 'Climate',
    defaults: { trigger_operator: '>=', trigger_value: 80, action_command: 'ON' },
  },
]

const CATEGORY_COLORS = {
  Climate:  '#38bdf8',
  Lighting: '#fbbf24',
  Garden:   '#22c55e',
  Security: 'var(--accent)',
  Safety:   '#f87171',
}

/* ──────────────────────────────────────────────
   Modal
────────────────────────────────────────────── */
function TemplateModal({ template, devices, onClose, onActivated }) {
  const deviceNames   = Object.keys(devices)
  const [triggerDevice, setTriggerDevice] = useState('')
  const [actionDevice,  setActionDevice]  = useState('')
  const [triggerValue,  setTriggerValue]  = useState(template.defaults.trigger_value)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleActivate = async () => {
    setError('')
    if (!triggerDevice) return setError('Select a trigger (sensor) device.')
    if (!actionDevice)  return setError('Select an action device.')
    setSaving(true)
    try {
      const res = await createWorkflow({
        name: template.name,
        enabled: true,
        trigger: {
          type: 'sensor',
          device: triggerDevice,
          operator: template.defaults.trigger_operator,
          value: parseFloat(triggerValue),
        },
        actions: [{ type: 'device', device: actionDevice, command: template.defaults.action_command }],
      })
      onActivated(res.data)
      onClose()
    } catch {
      setError('Failed to create workflow. Is the backend running?')
    } finally { setSaving(false) }
  }

  return (
    /* backdrop */
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* modal panel */}
      <div className="neu-section" style={{ width: '100%', maxWidth: 460 }}>
        {/* header */}
        <div className="neu-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, color: template.iconColor, textShadow: `0 0 12px ${template.iconColor}55` }}>
              {template.icon}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{template.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{template.description}</div>
            </div>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            className="neu-btn-sm"
            style={{ fontSize: 14 }}
          >✕</button>
        </div>

        {/* body */}
        <div className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Rule preview */}
          <div className="neu-terminal" style={{ padding: '10px 14px', fontSize: 12 }}>
            {`> IF sensor ${template.defaults.trigger_operator} ${triggerValue}\n> THEN ${template.defaults.action_command} device`}
          </div>

          <div>
            <label className="neu-label">Trigger device (sensor)</label>
            <select id="modal-trigger-device" className="neu-input" value={triggerDevice} onChange={e => setTriggerDevice(e.target.value)}>
              <option value="">— select sensor —</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="neu-label">
              Threshold value&nbsp;
              <span className="neu-badge neu-badge-accent" style={{ fontSize: 10 }}>
                operator: {template.defaults.trigger_operator}
              </span>
            </label>
            <input
              id="modal-threshold"
              type="number"
              className="neu-input"
              value={triggerValue}
              onChange={e => setTriggerValue(e.target.value)}
            />
          </div>

          <div>
            <label className="neu-label">
              Action device&nbsp;
              <span className="neu-badge neu-badge-green" style={{ fontSize: 10 }}>
                cmd: {template.defaults.action_command}
              </span>
            </label>
            <select id="modal-action-device" className="neu-input" value={actionDevice} onChange={e => setActionDevice(e.target.value)}>
              <option value="">— select device —</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {error && <div className="neu-alert-error">{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              id="modal-cancel-btn"
              onClick={onClose}
              className="neu-btn"
              style={{ flex: 1, padding: '11px 0', fontSize: 13, fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              id="modal-activate-btn"
              onClick={handleActivate}
              disabled={saving}
              className="neu-btn-primary"
              style={{ flex: 2, padding: '11px 0', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              {saving ? 'Activating…' : '⊞ Activate Workflow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main
────────────────────────────────────────────── */
export default function TemplateLibrary() {
  const [devices,     setDevices]     = useState({})
  const [activeModal, setActiveModal] = useState(null)
  const [activated,   setActivated]   = useState([])
  const [filter,      setFilter]      = useState('All')

  useEffect(() => { getState().then(r => setDevices(r.data)).catch(() => {}) }, [])

  const handleActivated = wf => setActivated(prev => [...prev, wf.name])

  const CATEGORIES = ['All', ...new Set(TEMPLATES.map(t => t.tag))]
  const visible = filter === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.tag === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="led-pulse" />
          <div>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Template Library
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Pick a template, assign devices, and activate — no code required.
            </p>
          </div>
        </div>
        <span className="neu-badge">{TEMPLATES.length} templates</span>
      </div>

      {/* ── Activated banner ── */}
      {activated.length > 0 && (
        <div className="neu-alert-success" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          {activated.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="led led-green" />
              <span><strong>{name}</strong> activated successfully</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Category filter ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => {
          const active = filter === cat
          return (
            <button
              key={cat}
              id={`filter-${cat.toLowerCase()}`}
              onClick={() => setFilter(cat)}
              className={active ? 'neu-btn-primary' : 'neu-btn'}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                letterSpacing: active ? '0.04em' : 0,
              }}
            >
              {cat !== 'All' && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: CATEGORY_COLORS[cat] || 'var(--accent)', display: 'inline-block', marginRight: 5 }} />
              )}
              {cat}
            </button>
          )
        })}
      </div>

      {/* ── Template grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {visible.map(template => {
          const alreadyActivated = activated.includes(template.name)
          const catColor = CATEGORY_COLORS[template.tag] || 'var(--accent)'

          return (
            <div
              key={template.id}
              className="neu-plate"
              style={{
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                borderLeft: `3px solid ${catColor}`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* faint glow bg */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 60,
                background: `linear-gradient(180deg, ${catColor}0d 0%, transparent 100%)`,
                pointerEvents: 'none',
              }} />

              {/* top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'var(--bg-dark)',
                    boxShadow: 'var(--sh-flat)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                    color: catColor,
                    textShadow: `0 0 10px ${catColor}66`,
                    flexShrink: 0,
                  }}>
                    {template.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{template.name}</div>
                    <span className="neu-badge" style={{ marginTop: 4, color: catColor, borderColor: `${catColor}33` }}>
                      {template.tag}
                    </span>
                  </div>
                </div>
                {alreadyActivated && <div className="led-pulse" title="Activated" />}
              </div>

              {/* description */}
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                {template.description}
              </p>

              {/* rule preview */}
              <div className="neu-trough" style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#8a8f98', lineHeight: 1.5 }}>
                <span style={{ color: catColor }}>IF</span> sensor <span style={{ color: 'var(--text-main)' }}>{template.defaults.trigger_operator} {template.defaults.trigger_value}</span>
                {' → '}
                <span style={{ color: template.defaults.action_command === 'ON' ? '#22c55e' : '#f87171', fontWeight: 700 }}>
                  {template.defaults.action_command}
                </span>
              </div>

              {/* CTA */}
              <button
                id={`use-template-${template.id}`}
                onClick={() => setActiveModal(template)}
                className={alreadyActivated ? 'neu-btn' : 'neu-btn-primary'}
                style={{
                  padding: '10px 0', width: '100%', fontSize: 12,
                  fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  marginTop: 'auto',
                }}
              >
                {alreadyActivated ? '✓ Activated — Use Again' : '⊞ Use Template'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {activeModal && (
        <TemplateModal
          template={activeModal}
          devices={devices}
          onClose={() => setActiveModal(null)}
          onActivated={handleActivated}
        />
      )}
    </div>
  )
}
