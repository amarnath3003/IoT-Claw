import { useState, useEffect } from 'react'
import { getState, createWorkflow } from '../api'

const TEMPLATES = [
  {
    id: 'smart-thermostat',
    name: 'Smart Thermostat',
    description: 'Turn on AC/fan when temperature exceeds a threshold.',
    icon: '🌡️',
    defaults: { trigger_operator: '>', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'auto-lights-off',
    name: 'Auto Lights Off',
    description: 'Turn off lights when no motion is detected.',
    icon: '💡',
    defaults: { trigger_operator: '==', trigger_value: 0, action_command: 'OFF' },
  },
  {
    id: 'plant-watering',
    name: 'Plant Watering',
    description: 'Turn on water pump when soil moisture drops low.',
    icon: '🌱',
    defaults: { trigger_operator: '<', trigger_value: 30, action_command: 'ON' },
  },
  {
    id: 'security-lights',
    name: 'Security Lights',
    description: 'Turn on lights when motion is detected.',
    icon: '🔦',
    defaults: { trigger_operator: '==', trigger_value: 1, action_command: 'ON' },
  },
  {
    id: 'overheat-protection',
    name: 'Overheat Protection',
    description: 'Turn off a device if temperature gets dangerously high.',
    icon: '🔥',
    defaults: { trigger_operator: '>', trigger_value: 60, action_command: 'OFF' },
  },
  {
    id: 'humidity-control',
    name: 'Humidity Control',
    description: 'Turn on dehumidifier when humidity exceeds threshold.',
    icon: '💧',
    defaults: { trigger_operator: '>=', trigger_value: 80, action_command: 'ON' },
  },
]

function TemplateModal({ template, devices, onClose, onActivated }) {
  const deviceNames = Object.keys(devices)
  const [triggerDevice, setTriggerDevice] = useState('')
  const [actionDevice, setActionDevice] = useState('')
  const [triggerValue, setTriggerValue] = useState(template.defaults.trigger_value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleActivate = async () => {
    setError('')
    if (!triggerDevice) return setError('Select a trigger device.')
    if (!actionDevice) return setError('Select an action device.')

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
        actions: [
          {
            type: 'device',
            device: actionDevice,
            command: template.defaults.action_command,
          },
        ],
      })
      onActivated(res.data)
      onClose()
    } catch (e) {
      setError('Failed to create workflow. Is the backend running?')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 20 }}>{template.icon}</span>
              <h3 className="text-base font-medium text-white">{template.name}</h3>
            </div>
            <p className="text-xs text-gray-400">{template.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Trigger device (sensor)</label>
            <select className={fieldClass} value={triggerDevice} onChange={e => setTriggerDevice(e.target.value)}>
              <option value="">Select device</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Threshold value (operator: {template.defaults.trigger_operator})
            </label>
            <input
              type="number"
              className={fieldClass}
              value={triggerValue}
              onChange={e => setTriggerValue(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Action device (command: {template.defaults.action_command})
            </label>
            <select className={fieldClass} value={actionDevice} onChange={e => setActionDevice(e.target.value)}>
              <option value="">Select device</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2.5 rounded-xl text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleActivate}
            disabled={saving}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? 'Activating...' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TemplateLibrary() {
  const [devices, setDevices] = useState({})
  const [activeModal, setActiveModal] = useState(null)
  const [activated, setActivated] = useState([])

  useEffect(() => {
    getState().then(r => setDevices(r.data)).catch(() => {})
  }, [])

  const handleActivated = (workflow) => {
    setActivated(prev => [...prev, workflow.name])
  }

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-gray-400">
        Pick a template, assign your devices, and activate — no code required.
      </p>

      {activated.length > 0 && (
        <div className="bg-green-900/30 border border-green-700/40 rounded-xl px-4 py-3 text-sm text-green-400 space-y-1">
          {activated.map((name, i) => (
            <p key={i}>✓ <span className="font-medium">{name}</span> activated</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(template => (
          <div
            key={template.id}
            className="bg-gray-800 border border-gray-700 rounded-lg p-5 flex flex-col gap-3 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 20 }}>{template.icon}</span>
              <h3 className="text-sm font-medium text-white">{template.name}</h3>
            </div>
            <p className="text-xs text-gray-400 flex-1">{template.description}</p>
            <div className="text-xs text-gray-600 font-mono">
              IF sensor {template.defaults.trigger_operator} {template.defaults.trigger_value} → {template.defaults.action_command}
            </div>
            <button
              onClick={() => setActiveModal(template)}
              className="w-full mt-1 bg-gray-700 hover:bg-cyan-600 text-gray-300 hover:text-white py-2 rounded-xl text-xs font-medium transition-colors"
            >
              Use Template
            </button>
          </div>
        ))}
      </div>

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
