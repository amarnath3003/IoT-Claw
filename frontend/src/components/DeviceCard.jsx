import { useState } from 'react'
import { sendChat } from '../api'

export default function DeviceCard({ name, data }) {
  const [toggling, setToggling] = useState(false)

  const statusStr = String(data.status ?? '').toUpperCase()
  const isOn = statusStr === 'ON'
  const isNumeric = !isNaN(parseFloat(data.status)) && data.status !== 'ON' && data.status !== 'OFF'

  const deviceLabel = name.replace(/_/g, ' ')

  const typeIcon = {
    switch: '⚡',
    sensor: '📡',
    dimmable_switch: '💡',
    generic: '🔧',
  }[data.type] ?? '🔧'

  const toggle = async () => {
    if (toggling) return
    setToggling(true)
    try {
      const action = isOn ? 'off' : 'on'
      await sendChat(`Turn ${action} the ${name}`, [])
    } catch (e) {
      console.error('[DeviceCard] toggle failed:', e)
    } finally {
      setToggling(false)
    }
  }

  const lastUpdated = data.last_updated
    ? new Date(data.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 flex flex-col gap-3 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 16 }}>{typeIcon}</span>
          <span className="text-sm font-medium text-gray-200 capitalize truncate">
            {deviceLabel}
          </span>
        </div>
        {/* Toggle switch for on/off devices */}
        {!isNumeric && (
          <button
            onClick={toggle}
            disabled={toggling}
            title={isOn ? 'Turn off' : 'Turn on'}
            className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none
              ${isOn ? 'bg-cyan-500' : 'bg-gray-600'}
              ${toggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                ${isOn ? 'translate-x-7' : 'translate-x-1'}`}
            />
          </button>
        )}
      </div>

      {/* Value */}
      <div className="flex items-end gap-1">
        {isNumeric ? (
          <>
            <span className="text-3xl font-bold text-white leading-none">{data.status}</span>
            {data.unit && (
              <span className="text-lg text-gray-400 leading-none pb-0.5">{data.unit}</span>
            )}
          </>
        ) : (
          <span className={`text-2xl font-bold leading-none ${isOn ? 'text-cyan-400' : 'text-gray-500'}`}>
            {isOn ? 'ON' : (statusStr || 'unknown')}
          </span>
        )}
      </div>

      {/* Type badge + last updated */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 capitalize">
          {data.type ?? 'generic'}
        </span>
        <span className="text-xs text-gray-500">
          {lastUpdated ? `${lastUpdated}` : 'No data yet'}
        </span>
      </div>
    </div>
  )
}
