import { useEffect, useState } from 'react'
import { getLogs } from '../api'
import { RotateCcw } from 'lucide-react'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  green:  '#22c55e',
  red:    '#ef4444',
  amber:  '#f59e0b',
  blue:   '#6b8cff',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

const LEVEL = {
  success: { color: '#6b8cff',                badge: 'OK'   },
  error:   { color: '#ef4444',                badge: 'ERR'  },
  warning: { color: 'rgba(255,255,255,0.40)', badge: 'WARN' },
  info:    { color: 'rgba(255,255,255,0.28)', badge: 'INFO' },
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
    finally  { setLoading(false) }
  }

  useEffect(() => {
    loadLogs()
    const id = setInterval(loadLogs, 5000)
    return () => clearInterval(id)
  }, [limit, refreshKey])

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: loading ? 'rgba(255,255,255,0.25)' : '#1a2eff',
            boxShadow: `0 0 6px ${loading ? 'rgba(255,255,255,0.2)' : 'rgba(26,46,255,0.6)'}`,
            display: 'inline-block', flexShrink: 0,
            animation: loading ? 'ledPulse 1s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontFamily: C.sans, fontWeight: 600,
            fontSize: '0.82rem', color: C.text1,
          }}>
            Activity Log
          </span>
        </div>
        <button
          onClick={loadLogs}
          title="Refresh"
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            color: C.text2,
            transition: 'all 0.15s',
          }}
        >
          <RotateCcw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Log list */}
      <div style={{
        padding: '8px 0',
        maxHeight: 500,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: C.mono,
        fontSize: '0.7rem',
        lineHeight: 1.6,
      }}>
        {logs.length === 0 ? (
          <span style={{ color: C.text3, padding: '8px 18px' }}>
            {'> no activity logged yet.'}
          </span>
        ) : (
          logs.map((log, idx) => {
            const ls = LEVEL[log.level] || LEVEL.info
            const ts = log.ts
              ? new Date(log.ts).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })
              : '?'
            return (
              <div
                key={log.id}
                style={{
                  padding: '7px 18px',
                  borderBottom: idx < logs.length - 1 ? `1px solid ${C.border}` : 'none',
                  animation: 'rowIn 0.2s ease',
                  animationFillMode: 'both',
                  animationDelay: `${idx * 0.018}s`,
                }}
              >
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{
                    color: ls.color, fontWeight: 600,
                    fontSize: '0.62rem', letterSpacing: '0.06em',
                    minWidth: 34,
                  }}>
                    [{ls.badge}]
                  </span>
                  <span style={{
                    color: 'rgba(107,140,255,0.8)', fontSize: '0.62rem',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    {(log.source || 'system').replace(/_/g, '-')}
                  </span>
                  <span style={{ color: C.text3, fontSize: '0.6rem', marginLeft: 'auto' }}>
                    {ts}
                  </span>
                </div>
                {/* Message */}
                <div style={{ color: 'rgba(184,196,222,0.75)', paddingLeft: 8 }}>
                  <span style={{ color: C.text3, marginRight: 4 }}>{'>'}</span>
                  {log.message}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
