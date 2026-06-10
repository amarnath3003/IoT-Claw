import { useState, useEffect, useRef } from 'react'

const C = {
  mono:  "'JetBrains Mono', ui-monospace, monospace",
  sans:  "'Outfit', sans-serif",
  green: '#22c55e',
  text3: 'rgba(255,255,255,0.25)',
}

export default function EdgeConsole({ deviceName, wsMessages }) {
  const [logs, setLogs] = useState([])
  const bottomRef       = useRef(null)

  useEffect(() => {
    if (!wsMessages) return
    if (wsMessages.type === 'edge_console' && wsMessages.device === deviceName) {
      const now  = new Date()
      const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        + '.' + now.getMilliseconds().toString().padStart(3, '0')
      setLogs(cur => {
        const next = [...cur, { id: Date.now() + Math.random(), time, text: wsMessages.text }]
        return next.length > 50 ? next.slice(next.length - 50) : next
      })
    }
  }, [wsMessages, deviceName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const isEmpty = logs.length === 0

  return (
    <div style={{
      background: '#06080a',
      border: '1px solid rgba(34,197,94,0.12)',
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      marginTop: 8,
    }}>
      {/* Header bar */}
      <div style={{
        background: 'rgba(34,197,94,0.06)',
        padding: '5px 12px',
        borderBottom: '1px solid rgba(34,197,94,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9,
        fontFamily: C.mono,
        color: C.green,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block',
            width: 5, height: 5, borderRadius: '50%', background: C.green,
            animation: isEmpty ? 'none' : 'ledBlink 1.5s ease-in-out infinite',
          }} />
          Edge Console · {deviceName}
        </span>
        <span style={{ color: isEmpty ? 'rgba(34,197,94,0.3)' : C.green }}>
          {isEmpty ? 'IDLE' : 'LIVE'}
        </span>
      </div>

      {/* Log body */}
      <div style={{
        padding: '8px 12px',
        height: 150,
        overflowY: 'auto',
        fontFamily: C.mono,
        fontSize: 10,
        lineHeight: 1.6,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {isEmpty ? (
          <div style={{ color: 'rgba(107,114,128,0.5)', fontStyle: 'italic', fontSize: 10 }}>
            Waiting for print() statements from edge agent…
          </div>
        ) : (
          logs.map(log => {
            const isErr  = /error|fail|exception/i.test(log.text)
            const isWarn = /warn|timeout/i.test(log.text)
            return (
              <div key={log.id} style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: 'rgba(107,114,128,0.45)', flexShrink: 0, fontSize: 9 }}>
                  [{log.time}]
                </span>
                <span style={{
                  wordBreak: 'break-all',
                  color: isErr ? '#f87171' : isWarn ? 'rgba(251,191,36,0.8)' : 'rgba(209,213,219,0.8)',
                }}>
                  {log.text}
                </span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
