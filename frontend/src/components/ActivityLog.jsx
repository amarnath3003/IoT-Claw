import { useEffect, useState } from 'react'
import { getLogs } from '../api'

const LEVEL_CLASS = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-cyan-400',
}

export default function ActivityLog({ limit = 30, refreshKey }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await getLogs(limit)
      setLogs(res.data || [])
    } catch (err) {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
    const id = setInterval(loadLogs, 5000)
    return () => clearInterval(id)
  }, [limit, refreshKey])

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-medium text-gray-200">Recent Activity</h2>
        <button onClick={loadLogs} className="text-xs text-cyan-400 hover:text-cyan-300">
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-700/70">
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 p-4">No activity logged yet.</p>
        ) : (
          logs.map(log => (
            <div key={log.id} className="p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className={`font-medium uppercase ${LEVEL_CLASS[log.level] || 'text-gray-400'}`}>
                  {log.source || 'system'}
                </span>
                <span className="text-gray-600">
                  {log.ts ? new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-gray-300 mt-1">{log.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
