import { useState, useEffect } from 'react'
import { getState, getWorkflows, createWorkflow } from '../api'
import WorkflowList from './WorkflowList'

const OPERATORS = [
  { value: '>', label: '> greater than' },
  { value: '<', label: '< less than' },
  { value: '>=', label: '≥ greater or equal' },
  { value: '<=', label: '≤ less or equal' },
  { value: '==', label: '= equals' },
  { value: '!=', label: '≠ not equal' },
]

const DEFAULT_FORM = {
  name: '',
  trigger_device: '',
  trigger_operator: '>',
  trigger_value: '',
  action_device: '',
  action_command: 'ON',
}

export default function WorkflowEditor() {
  const [devices, setDevices] = useState({})
  const [workflows, setWorkflows] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const deviceNames = Object.keys(devices)

  useEffect(() => {
    getState().then(r => setDevices(r.data)).catch(() => {})
    getWorkflows().then(r => setWorkflows(r.data)).catch(() => {})
  }, [])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!form.name.trim()) return setError('Please give this workflow a name.')
    if (!form.trigger_device) return setError('Select a trigger device.')
    if (form.trigger_value === '') return setError('Enter a threshold value.')
    if (!form.action_device) return setError('Select an action device.')

    setSaving(true)
    try {
      const res = await createWorkflow({
        name: form.name.trim(),
        enabled: true,
        trigger: {
          device: form.trigger_device,
          operator: form.trigger_operator,
          value: parseFloat(form.trigger_value),
        },
        action: {
          device: form.action_device,
          command: form.action_command,
        },
      })
      setWorkflows(prev => [...prev, res.data])
      setForm(DEFAULT_FORM)
      setSuccess(`Workflow "${res.data.name}" created!`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError('Failed to save workflow. Is the backend running?')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleted = (id) => setWorkflows(prev => prev.filter(w => w.id !== id))

  const fieldClass = "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
  const labelClass = "block text-xs text-gray-400 mb-1"

  return (
    <div className="max-w-2xl space-y-8">
      {/* Form */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
        <h2 className="text-base font-medium text-white">Create Automation</h2>

        {/* Name */}
        <div>
          <label className={labelClass}>Workflow name</label>
          <input
            className={fieldClass}
            placeholder="e.g. Greenhouse Cooling"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>

        {/* IF row */}
        <div>
          <label className={labelClass}>IF (trigger)</label>
          <div className="grid grid-cols-3 gap-2">
            <select className={fieldClass} value={form.trigger_device} onChange={e => set('trigger_device', e.target.value)}>
              <option value="">Select device</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
            <select className={fieldClass} value={form.trigger_operator} onChange={e => set('trigger_operator', e.target.value)}>
              {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <input
              type="number"
              className={fieldClass}
              placeholder="Threshold"
              value={form.trigger_value}
              onChange={e => set('trigger_value', e.target.value)}
            />
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center gap-3 text-gray-500">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-sm">THEN</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* THEN row */}
        <div>
          <label className={labelClass}>THEN (action)</label>
          <div className="grid grid-cols-2 gap-2">
            <select className={fieldClass} value={form.action_device} onChange={e => set('action_device', e.target.value)}>
              <option value="">Select device</option>
              {deviceNames.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
            <select className={fieldClass} value={form.action_command} onChange={e => set('action_command', e.target.value)}>
              <option value="ON">Turn ON</option>
              <option value="OFF">Turn OFF</option>
            </select>
          </div>
        </div>

        {/* Feedback */}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-400">{success}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save Workflow'}
        </button>
      </div>

      {/* List */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Active Workflows ({workflows.length})
        </h3>
        <WorkflowList workflows={workflows} onDeleted={handleDeleted} />
      </div>
    </div>
  )
}