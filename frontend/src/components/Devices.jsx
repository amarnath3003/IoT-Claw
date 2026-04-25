import { useState } from 'react'
import { deleteDevice, registerDevice } from '../api'

const DEFAULT_FORM = {
  name: '',
  topic_base: '',
  type: 'switch',
  unit: '',
  location: '',
  description: '',
}

export default function Devices({ deviceStates }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const devices = Object.entries(deviceStates || {})

  const update = (field, value) => setForm(current => ({ ...current, [field]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!form.name.trim()) return setError('Device name is required.')
    if (!form.topic_base.trim()) return setError('MQTT topic base is required.')

    setSaving(true)
    try {
      await registerDevice({
        ...form,
        name: form.name.trim(),
        topic_base: form.topic_base.trim(),
      })
      setSuccess(`Registered ${form.name.trim()}.`)
      setForm(DEFAULT_FORM)
    } catch (err) {
      setError('Failed to register device. Check that the backend is running.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete device "${name}"?`)) return
    try {
      await deleteDevice(name)
      setSuccess(`Deleted ${name}.`)
    } catch (err) {
      setError(`Failed to delete ${name}.`)
    }
  }

  const fieldClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors'
  const labelClass = 'block text-xs text-gray-400 mb-1'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4 h-max">
        <div>
          <h2 className="text-base font-medium text-white">Add MQTT Device</h2>
          <p className="text-xs text-gray-500 mt-1">Register a real device topic before using it in chat or workflows. The laptop camera simulator is added automatically.</p>
        </div>

        <div>
          <label className={labelClass}>Device name</label>
          <input className={fieldClass} value={form.name} onChange={e => update('name', e.target.value)} placeholder="living_room_light" />
        </div>

        <div>
          <label className={labelClass}>MQTT topic base</label>
          <input className={fieldClass} value={form.topic_base} onChange={e => update('topic_base', e.target.value)} placeholder="home/living_room/light" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <select className={fieldClass} value={form.type} onChange={e => update('type', e.target.value)}>
              <option value="switch">Switch</option>
              <option value="sensor">Sensor</option>
              <option value="dimmable_switch">Dimmable switch</option>
              <option value="security_camera">Security camera</option>
              <option value="generic">Generic</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Unit</label>
            <input className={fieldClass} value={form.unit} onChange={e => update('unit', e.target.value)} placeholder="C, %, lux" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Location</label>
          <input className={fieldClass} value={form.location} onChange={e => update('location', e.target.value)} placeholder="Living room" />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea className={fieldClass} value={form.description} onChange={e => update('description', e.target.value)} rows={3} placeholder="Relay controlling the main light" />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-400">{success}</p>}

        <button disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Saving...' : 'Register Device'}
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-300">Registered Devices</h2>
          <span className="text-xs text-gray-500">{devices.length} total</span>
        </div>

        {devices.length === 0 ? (
          <div className="border border-dashed border-gray-700 rounded-lg p-8 text-center text-sm text-gray-500">
            No devices registered.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map(([name, device]) => (
              <div key={name} className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{name}</h3>
                    <p className="text-xs text-gray-500 truncate">{device.topic_base}</p>
                  </div>
                  <button onClick={() => handleDelete(name)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-950/40">
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-gray-900 text-gray-400">{device.type || 'generic'}</span>
                  <span className="px-2 py-1 rounded bg-gray-900 text-gray-400">Status: {String(device.status ?? 'unknown')}</span>
                  {device.location && <span className="px-2 py-1 rounded bg-gray-900 text-gray-400">{device.location}</span>}
                </div>
                {device.description && <p className="text-xs text-gray-500">{device.description}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
