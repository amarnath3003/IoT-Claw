import ActivityLog from './ActivityLog'
import DeviceCard from './DeviceCard'

export default function Dashboard({ deviceStates }) {
  const devices = Object.entries(deviceStates || {})

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium text-gray-300">
            {devices.length} device{devices.length !== 1 ? 's' : ''} registered
          </h2>
        </div>

        {devices.length === 0 ? (
          <div className="text-center text-gray-500 mt-24 space-y-3 border border-dashed border-gray-800 rounded-lg p-10">
            <p className="text-lg font-medium text-gray-400">No devices registered yet</p>
            <p className="text-sm text-gray-600">
              Use the Devices tab to add an MQTT topic, or ask Chat to register a device.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map(([name, data]) => (
              <DeviceCard key={name} name={name} data={data} />
            ))}
          </div>
        )}
      </section>

      <ActivityLog refreshKey={JSON.stringify(deviceStates)} />
    </div>
  )
}
