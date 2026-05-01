import { useState, useEffect, useRef } from 'react'

export default function EdgeConsole({ deviceName, wsMessages }) {
  const [logs, setLogs] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!wsMessages) return
    if (wsMessages.type === 'edge_console' && wsMessages.device === deviceName) {
      const now = new Date()
      const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + now.getMilliseconds().toString().padStart(3, '0')
      
      setLogs(cur => {
        const next = [...cur, { id: Date.now() + Math.random(), time, text: wsMessages.text }]
        // Keep last 50 logs to avoid memory bloat
        return next.length > 50 ? next.slice(next.length - 50) : next
      })
    }
  }, [wsMessages, deviceName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div style={{
      background: '#0a0a0c',
      border: '1px solid rgba(34, 197, 94, 0.2)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      marginTop: 8
    }}>
      <div style={{
        background: 'rgba(34, 197, 94, 0.1)',
        padding: '4px 10px',
        borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        color: '#22c55e',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="led-pulse" style={{ width: 6, height: 6 }} />
          Edge Console
        </span>
        <span>Live</span>
      </div>
      
      <div style={{
        padding: '10px',
        height: 150,
        overflowY: 'auto',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        color: '#d1d5db',
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>Waiting for print() statements...</div>
        ) : (
          logs.map(log => (
            <div key={log.id} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: '#6b7280', flexShrink: 0 }}>[{log.time}]</span>
              <span style={{ wordBreak: 'break-all' }}>{log.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
