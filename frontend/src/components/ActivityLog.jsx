import { useEffect, useState } from 'react'
import { getLogs } from '../api'

const LEVEL_STYLE = {
  success: { color: '#22c55e', badge: 'OK'   },
  error:   { color: '#f87171', badge: 'ERR'  },
  warning: { color: '#fbbf24', badge: 'WARN' },
  info:    { color: 'var(--accent-light)', badge: 'INFO' },
}

export default function ActivityLog({ limit = 30, refreshKey }) {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await getLogs(limit)
      setLogs(res.data || [])
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadLogs()
    const id = setInterval(loadLogs, 5000)
    return () => clearInterval(id)
  }, [limit, refreshKey])

  return (
    <div className="neu-section" style={{ height: 'max-content', position: 'sticky', top: 100 }}>
      {/* header */}
      <div className="neu-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={loading ? 'led led-amber' : 'led-pulse'} />
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Activity Log
          </h2>
        </div>
        <button
          id="activity-refresh-btn"
          onClick={loadLogs}
          className="neu-btn-sm"
          title="Refresh logs"
          style={{ fontSize: 12 }}
        >
          ⟳
        </button>
      </div>

      {/* log list — terminal style */}
      <div className="neu-terminal" style={{ maxHeight: 460, borderRadius: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
        {logs.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>{'> No activity logged yet.'}</span>
        ) : (
          logs.map(log => {
            const ls = LEVEL_STYLE[log.level] || LEVEL_STYLE.info
            const ts = log.ts
              ? new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '?'
            return (
              <div key={log.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ color: ls.color, fontWeight: 700, fontSize: 10, letterSpacing: '0.06em' }}>[{ls.badge}]</span>
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>{(log.source || 'system').toUpperCase()}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 'auto' }}>{ts}</span>
                </div>
                <div style={{ color: '#b0bec5', fontSize: 11, lineHeight: 1.5 }}>{'> '}{log.message}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
