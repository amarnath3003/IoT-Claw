import { useState, useEffect } from 'react'
import { API_BASE } from '../api'
import axios from 'axios'

const api = axios.create({ baseURL: API_BASE })

const C = {
  panel:  'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

const MOOD_COLORS = {
  vigilant:   '#fbbf24',
  calm:       '#60a5fa',
  concerned:  '#f87171',
  optimizing: '#34d399',
  learning:   '#a78bfa',
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function ClawActivity({ clawEnabled, wsMessages }) {
  const [lastCycle, setLastCycle] = useState(null)

  // Fetch last cycle on mount
  useEffect(() => {
    api.get('/autonomous/cycles?limit=1')
      .then(r => { if (r.data?.length) setLastCycle(r.data[0]) })
      .catch(() => {})
  }, [])

  // Update on live WebSocket broadcasts
  useEffect(() => {
    if (wsMessages?.type === 'autonomous_cycle' && wsMessages.cycle) {
      setLastCycle(wsMessages.cycle)
    }
  }, [wsMessages])

  const mood      = lastCycle?.mood ?? 'calm'
  const moodColor = MOOD_COLORS[mood] ?? '#60a5fa'
  const actions   = (lastCycle?.actions ?? []).filter(a => a.type !== 'nothing')

  function actionLabel(act) {
    if (act.type === 'device_control') {
      return `${act.command === 'ON' ? '↑' : '↓'} ${act.device}`
    }
    if (act.type === 'create_workflow') return '⟳ workflow'
    if (act.type === 'send_alert')      return '⚠ alert'
    return null
  }

  const leftBorderColor = clawEnabled
    ? (lastCycle ? moodColor : '#a78bfa')
    : 'rgba(255,255,255,0.07)'

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${leftBorderColor}`,
      borderRadius: 12,
      padding: '13px 15px',
      marginBottom: 12,
      transition: 'border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: clawEnabled && lastCycle ? 9 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {clawEnabled && lastCycle && (
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: moodColor,
              boxShadow: `0 0 5px ${moodColor}66`,
              flexShrink: 0,
              animation: 'ledBlink 2.5s ease-in-out infinite',
            }} />
          )}
          <span style={{
            fontFamily: C.sans, fontSize: '0.63rem', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: clawEnabled ? C.text2 : C.text3,
          }}>
            Claw Activity
          </span>
        </div>

        {clawEnabled && lastCycle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mood badge */}
            <span style={{
              fontFamily: C.sans, fontSize: '0.6rem', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'capitalize',
              color: moodColor, opacity: 0.85,
            }}>
              {mood}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: '0.59rem', color: C.text3 }}>
              {timeAgo(lastCycle.timestamp)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {!clawEnabled ? (
        <p style={{
          margin: 0, fontFamily: C.sans, fontSize: '0.76rem',
          color: C.text3, lineHeight: 1.55,
        }}>
          Enable <span style={{ color: '#a78bfa', fontWeight: 600 }}>Claw Mode</span> in
          the sidebar — AI will monitor and act on your home autonomously.
        </p>
      ) : !lastCycle ? (
        <p style={{
          margin: 0, fontFamily: C.sans, fontSize: '0.76rem',
          color: 'rgba(167,139,250,0.45)', lineHeight: 1.5,
        }}>
          Claw is initializing...
        </p>
      ) : (
        <>
          {/* Observation summary */}
          <p style={{
            margin: '0 0 9px',
            fontFamily: C.sans, fontSize: '0.78rem',
            color: C.text2, lineHeight: 1.55,
          }}>
            {lastCycle.observe}
          </p>

          {/* Action pills */}
          {actions.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {actions.map((act, i) => {
                const lbl = actionLabel(act)
                return lbl ? (
                  <span key={i} style={{
                    fontFamily: C.sans, fontSize: '0.67rem', fontWeight: 500,
                    padding: '3px 9px',
                    background: 'rgba(167,139,250,0.08)',
                    border: '1px solid rgba(167,139,250,0.22)',
                    borderRadius: 6, color: '#a78bfa',
                  }}>
                    {lbl}
                  </span>
                ) : null
              })}
            </div>
          ) : (
            <span style={{
              fontFamily: C.sans, fontSize: '0.68rem',
              color: C.text3,
            }}>
              No action needed
            </span>
          )}
        </>
      )}
    </div>
  )
}
