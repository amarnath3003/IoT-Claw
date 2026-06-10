import { useState, useEffect } from 'react'
import { API_BASE } from '../api'
import axios from 'axios'

const api = axios.create({ baseURL: API_BASE })

const S = {
  sans:   '"Outfit", sans-serif',
  mono:   '"JetBrains Mono", ui-monospace, monospace',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  purple: '#a78bfa',
}

function timeAgo(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

function summarizeAction(cycle) {
  const act = (cycle?.actions ?? []).find(a => a.type !== 'nothing')
  if (!act) return null
  if (act.type === 'device_control') {
    return `${act.command === 'ON' ? 'On' : 'Off'}: ${act.device}`
  }
  if (act.type === 'create_workflow') return 'Created workflow'
  if (act.type === 'send_alert') return 'Alert sent'
  return null
}

export default function ClawModeToggle({ wsMessages, enabled, onToggle }) {
  const [loading, setLoading]     = useState(false)
  const [lastCycle, setLastCycle] = useState(null)

  // Fetch last cycle on mount
  useEffect(() => {
    api.get('/autonomous/cycles?limit=1')
      .then(r => { if (r.data?.length) setLastCycle(r.data[0]) })
      .catch(() => {})
  }, [])

  // Listen for live cycle broadcasts
  useEffect(() => {
    if (!wsMessages) return
    if (wsMessages?.type === 'autonomous_cycle' && wsMessages.cycle) {
      setLastCycle(wsMessages.cycle)
    }
  }, [wsMessages])

  const toggle = async () => {
    setLoading(true)
    const next = !enabled
    try {
      await api.patch('/autonomous/settings', { enabled: next })
      onToggle?.(next)
    } catch {}
    setLoading(false)
  }

  const actionLabel = summarizeAction(lastCycle)
  const since       = timeAgo(lastCycle?.timestamp)

  return (
    <div style={{
      borderTop: `1px solid ${S.border}`,
      margin: '8px 4px 0',
      paddingTop: 11,
    }}>
      {/* Row: label + toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        {/* Pulsing dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: enabled ? S.purple : 'rgba(255,255,255,0.14)',
            boxShadow: enabled ? `0 0 6px ${S.purple}88` : 'none',
            flexShrink: 0,
            animation: enabled ? 'ledBlink 2.5s ease-in-out infinite' : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }} />
          <span style={{
            fontFamily: S.sans,
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: enabled ? S.purple : S.text3,
            transition: 'color 0.3s',
          }}>
            Claw Mode
          </span>
        </div>

        {/* Toggle pill */}
        <button
          onClick={toggle}
          disabled={loading}
          title={enabled ? 'Disable autonomous AI' : 'Enable autonomous AI — AI monitors your home proactively'}
          style={{
            width: 36, height: 20,
            borderRadius: 10,
            border: 'none',
            background: enabled ? S.purple : 'rgba(255,255,255,0.1)',
            cursor: loading ? 'wait' : 'pointer',
            position: 'relative',
            transition: 'background 0.25s',
            flexShrink: 0,
            padding: 0,
            outline: 'none',
          }}
        >
          <span style={{
            position: 'absolute',
            top: 3,
            left: enabled ? 19 : 3,
            width: 14, height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
          }} />
        </button>
      </div>

      {/* Status line */}
      <div style={{
        fontFamily: S.sans,
        fontSize: '0.65rem',
        color: S.text3,
        lineHeight: 1.35,
        paddingLeft: 13,
        minHeight: 14,
      }}>
        {enabled ? (
          lastCycle ? (
            actionLabel
              ? <>{actionLabel} · <span style={{ opacity: 0.65 }}>{since}</span></>
              : <>All nominal · <span style={{ opacity: 0.65 }}>{since}</span></>
          ) : (
            <span style={{ color: `${S.purple}66` }}>Initializing...</span>
          )
        ) : (
          'AI monitors automatically when on'
        )}
      </div>
    </div>
  )
}
