import { useState, useEffect } from 'react'
import { getState, createWorkflow } from '../api'
import {
  LayoutTemplate, Thermometer, Lightbulb, Droplets,
  Shield, AlertTriangle, Wind, CheckCircle, X,
} from 'lucide-react'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  depth:  '#0d0d18',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.65)',
  text3:  'rgba(255,255,255,0.35)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  red:    '#ef4444',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
  rPanel: 16,
  rCard:  12,
  rBtn:   10,
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: C.text3, marginBottom: 5, fontFamily: C.sans,
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text1,
  fontFamily: C.sans, outline: 'none', boxSizing: 'border-box',
}

/* ── Template definitions ── */
const TEMPLATES = [
  {
    id: 'smart-thermostat',
    name: 'Smart Thermostat',
    description: 'Turn on AC/fan when temperature exceeds a threshold.',
    Icon: Thermometer,
    tag: 'Climate',
    defaults: { trigger_operator: '>', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'auto-lights-off',
    name: 'Auto Lights Off',
    description: 'Turn off lights when no motion is detected.',
    Icon: Lightbulb,
    tag: 'Lighting',
    defaults: { trigger_operator: '==', trigger_value: 0, action_command: 'OFF' },
  },
  {
    id: 'plant-watering',
    name: 'Plant Watering',
    description: 'Turn on water pump when soil moisture drops low.',
    Icon: Droplets,
    tag: 'Garden',
    defaults: { trigger_operator: '<', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'security-lights',
    name: 'Security Lights',
    description: 'Turn on lights when motion is detected at night.',
    Icon: Shield,
    tag: 'Security',
    defaults: { trigger_operator: '==', trigger_value: 1, action_command: 'ON' },
  },
  {
    id: 'overheat-protection',
    name: 'Overheat Protection',
    description: 'Turn off a device if temperature gets dangerously high.',
    Icon: AlertTriangle,
    tag: 'Safety',
    defaults: { trigger_operator: '>', trigger_value: 60, action_command: 'OFF' },
  },
  {
    id: 'humidity-control',
    name: 'Humidity Control',
    description: 'Turn on dehumidifier when humidity exceeds threshold.',
    Icon: Wind,
    tag: 'Climate',
    defaults: { trigger_operator: '>=', trigger_value: 80, action_command: 'ON' },
  },
]

const CATEGORY_COLORS = {
  Climate:  '#6b8cff',
  Lighting: '#6b8cff',
  Garden:   '#6b8cff',
  Security: '#6b8cff',
  Safety:   '#6b8cff',
}

/* ── Activation Modal ── */
function TemplateModal({ template, devices, onClose, onActivated }) {
  const catColor    = CATEGORY_COLORS[template.tag] || C.accent
  const { Icon }    = template
  const deviceNames = Object.keys(devices)

  const [triggerDevice, setTriggerDevice] = useState('')
  const [actionDevice,  setActionDevice]  = useState('')
  const [triggerValue,  setTriggerValue]  = useState(template.defaults.trigger_value)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

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
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.80)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#0d0d18',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderTop: `2px solid ${catColor}`,
        borderRadius: C.rPanel,
        boxShadow: `0 24px 64px rgba(0,0,0,0.7)`,
        animation: 'fadeInUp 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, flexShrink: 0,
              background: `${catColor}18`,
              border: `1px solid ${catColor}44`,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} color={catColor} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text1, fontFamily: C.sans }}>
                {template.name}
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 1, fontFamily: C.sans }}>
                {template.description}
              </div>
            </div>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            style={{
              width: 28, height: 28, flexShrink: 0,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.04)',
              color: C.text3,
              cursor: 'pointer', borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Rule preview */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${catColor}22`,
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: C.mono,
            fontSize: 12, lineHeight: 1.8,
          }}>
            <span style={{ color: catColor }}>IF</span>
            <span style={{ color: C.text3 }}> sensor </span>
            <span style={{ color: C.text1 }}>
              {template.defaults.trigger_operator} {triggerValue}
            </span>
            <br />
            <span style={{ color: C.blue }}>THEN</span>
            <span style={{ color: C.text3 }}> → </span>
            <span style={{
              color: '#6b8cff',
              fontWeight: 700,
            }}>
              {template.defaults.action_command}
            </span>
            <span style={{ color: C.text3 }}> device</span>
          </div>

          {/* Trigger device */}
          <div>
            <label style={labelStyle}>Trigger Device (Sensor)</label>
            <select id="modal-trigger-device" style={inputStyle} value={triggerDevice} onChange={e => setTriggerDevice(e.target.value)}>
              <option value="">— select sensor —</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Threshold */}
          <div>
            <label style={labelStyle}>
              Threshold Value&nbsp;
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(26,46,255,0.1)', border: '1px solid rgba(26,46,255,0.2)',
                color: C.blue, fontFamily: C.mono,
              }}>
                op: {template.defaults.trigger_operator}
              </span>
            </label>
            <input id="modal-threshold" type="number" style={inputStyle} value={triggerValue} onChange={e => setTriggerValue(e.target.value)} />
          </div>

          {/* Action device */}
          <div>
            <label style={labelStyle}>
              Action Device&nbsp;
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                color: '#6b8cff',
                border: '1px solid rgba(26,46,255,0.25)',
                background: 'rgba(26,46,255,0.07)',
                fontFamily: C.mono,
              }}>
                cmd: {template.defaults.action_command}
              </span>
            </label>
            <select id="modal-action-device" style={inputStyle} value={actionDevice} onChange={e => setActionDevice(e.target.value)}>
              <option value="">— select device —</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: C.red,
            }}>{error}</div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <button
              id="modal-cancel-btn"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
                color: C.text2, borderRadius: C.rBtn, fontFamily: C.sans,
              }}
            >
              Cancel
            </button>
            <button
              id="modal-activate-btn"
              onClick={handleActivate}
              disabled={saving}
              style={{
                flex: 2, padding: '10px 0',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? 'rgba(26,46,255,0.3)' : 'rgba(26,46,255,0.85)',
                color: '#fff', borderRadius: C.rBtn,
                opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
                fontFamily: C.sans,
              }}
            >
              {saving ? 'Activating…' : '⊞ Activate Workflow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function TemplateLibrary() {
  const [devices,     setDevices]     = useState({})
  const [activeModal, setActiveModal] = useState(null)
  const [activated,   setActivated]   = useState([])
  const [filter,      setFilter]      = useState('All')

  useEffect(() => { getState().then(r => setDevices(r.data)).catch(() => {}) }, [])

  const handleActivated = wf => setActivated(prev => [...prev, wf.name])

  const CATEGORIES = ['All', ...new Set(TEMPLATES.map(t => t.tag))]
  const visible    = filter === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.tag === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38,
            background: 'rgba(26,46,255,0.12)',
            border: '1px solid rgba(26,46,255,0.28)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LayoutTemplate size={17} color={C.accent} />
          </div>
          <div>
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              fontFamily: C.sans, color: C.text1,
            }}>
              Template Library
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: C.text3, marginTop: 1, fontFamily: C.sans }}>
              Pick a template, assign devices, activate — no code required.
            </p>
          </div>
        </div>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 6,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
          color: C.text3, fontFamily: C.mono,
        }}>
          {TEMPLATES.length} templates
        </span>
      </div>

      {/* Activated banner */}
      {activated.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(26,46,255,0.06)', border: '1px solid rgba(26,46,255,0.18)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {activated.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} color='#6b8cff' />
              <span style={{ fontSize: 12, color: '#6b8cff', fontFamily: C.sans }}>
                <strong>{name}</strong> activated successfully
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => {
          const active   = filter === cat
          const catColor = CATEGORY_COLORS[cat]
          return (
            <button
              key={cat}
              id={`filter-${cat.toLowerCase()}`}
              onClick={() => setFilter(cat)}
              style={{
                padding: '5px 14px',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                border: `1px solid ${active ? (catColor || C.accent) : C.border}`,
                background: active ? `${catColor || C.accent}18` : 'transparent',
                color: active ? (catColor || C.accent) : C.text3,
                cursor: 'pointer', transition: 'all 0.15s',
                borderRadius: 20,
                fontFamily: C.sans,
              }}
            >
              {cat !== 'All' && (
                <span style={{
                  display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                  background: catColor, marginRight: 6, verticalAlign: 'middle',
                }} />
              )}
              {cat}
            </button>
          )
        })}
      </div>

      {/* Template grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {visible.map(template => {
          const { Icon }         = template
          const alreadyActivated = activated.includes(template.name)
          const catColor         = CATEGORY_COLORS[template.tag] || C.accent

          return (
            <div
              key={template.id}
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${catColor}`,
                borderRadius: C.rCard,
                overflow: 'hidden',
                transition: 'box-shadow 0.3s',
                boxShadow: alreadyActivated ? `0 0 20px ${catColor}18` : 'none',
              }}
            >
              {/* Top accent line */}
              <div style={{
                height: 2,
                background: `linear-gradient(90deg, ${catColor} 0%, transparent 70%)`,
              }} />

              <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Icon + title */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, flexShrink: 0,
                      background: `${catColor}18`,
                      border: `1px solid ${catColor}33`,
                      borderRadius: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={16} color={catColor} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text1, fontFamily: C.sans }}>
                        {template.name}
                      </div>
                      <span style={{
                        display: 'inline-block', marginTop: 3,
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
                        padding: '1px 7px', borderRadius: 4,
                        background: `${catColor}14`,
                        border: `1px solid ${catColor}30`,
                        color: catColor, fontFamily: C.mono,
                      }}>
                        {template.tag}
                      </span>
                    </div>
                  </div>
                  {alreadyActivated && (
                    <CheckCircle size={16} color='#6b8cff' style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                </div>

                {/* Description */}
                <p style={{ margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.6, fontFamily: C.sans }}>
                  {template.description}
                </p>

                {/* Rule preview */}
                <div style={{
                  background: 'rgba(0,0,0,0.25)',
                  border: `1px solid ${catColor}18`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontFamily: C.mono,
                  fontSize: 11, lineHeight: 1.6,
                  color: C.text3,
                }}>
                  <span style={{ color: catColor }}>IF</span>
                  {' sensor '}
                  <span style={{ color: C.text1 }}>
                    {template.defaults.trigger_operator} {template.defaults.trigger_value}
                  </span>
                  {' → '}
                  <span style={{
                    color: '#6b8cff',
                    fontWeight: 700,
                  }}>
                    {template.defaults.action_command}
                  </span>
                </div>

                {/* CTA */}
                <button
                  id={`use-template-${template.id}`}
                  onClick={() => setActiveModal(template)}
                  style={{
                    width: '100%', padding: '10px 0', marginTop: 'auto',
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    border: `1px solid ${alreadyActivated ? 'rgba(26,46,255,0.3)' : 'rgba(26,46,255,0.5)'}`,
                    background: alreadyActivated ? 'rgba(26,46,255,0.08)' : 'rgba(26,46,255,0.85)',
                    color: alreadyActivated ? '#6b8cff' : '#fff',
                    cursor: 'pointer', borderRadius: C.rBtn,
                    transition: 'all 0.2s',
                    fontFamily: C.sans,
                  }}
                >
                  {alreadyActivated ? '✓ Activated — Use Again' : '⊞ Use Template'}
                </button>
              </div>
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
