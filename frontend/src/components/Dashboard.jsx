import DeviceCard from './DeviceCard'

export default function Dashboard({ deviceStates }) {
  const devices = Object.entries(deviceStates || {})

  if (devices.length === 0) {
    return (
      <div className="text-center text-gray-500 mt-24 space-y-3">
        <p style={{ fontSize: 48 }}>🔌</p>
        <p className="text-lg font-medium text-gray-400">No devices registered yet</p>
        <p className="text-sm text-gray-600">
          Switch to the <span className="text-cyan-500">Chat</span> tab and say something like:<br />
          <span className="italic">"Register a sensor called greenhouse_temp, topic home/greenhouse/temperature, unit °C"</span>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-medium text-gray-300">
          {devices.length} device{devices.length !== 1 ? 's' : ''} registered
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {devices.map(([name, data]) => (
          <DeviceCard key={name} name={name} data={data} />
        ))}
      </div>
    </div>
  )
}