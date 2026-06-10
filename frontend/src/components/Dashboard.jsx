import { useEffect, useState } from 'react'
import ActivityLog from './ActivityLog'
import DeviceCard from './DeviceCard'
import ClawActivity from './ClawActivity'
import { getWorkflows, getGroups } from '../api'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  accent: '#1a2eff',
  green:  '#22c55e',
  red:    '#ef4444',
  amber:  '#f59e0b',
  purple: '#a78bfa',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

export default function Dashboard({ deviceStates, wsMessages, clawEnabled }) {
  const [activeWorkflows, setActiveWorkflows] = useState(0)
  const [groupCount, setGroupCount]           = useState(0)

  useEffect(() => {
    getWorkflows()
      .then(r => setActiveWorkflows(r.data.filter(w => w.enabled !== false).length))
      .catch(() => {})
    getGroups()
      .then(r => setGroupCount(r.data.length))
      .catch(() => {})
  }, [])

  const devices      = Object.entries(deviceStates || {})
  const onCount      = devices.filter(([, d]) => String(d.status).toUpperCase() === 'ON').length
  const offlineCount = devices.filter(([, d]) => String(d.status).toUpperCase() === 'OFFLINE').length
  const edgeCount    = devices.filter(([, d]) => d.type === 'micropython_edge_agent').length

  const stats = [
    { label: 'Total',     value: devices.length,  color: C.text1,  accent: 'rgba(26,46,255,0.35)'                                             },
    { label: 'Online',    value: onCount,          color: '#6b8cff', accent: 'rgba(26,46,255,0.5)'                                             },
    { label: 'Offline',   value: offlineCount,     color: offlineCount > 0 ? C.red : C.text3, accent: offlineCount > 0 ? 'rgba(239,68,68,0.4)' : C.border },
    { label: 'Groups',    value: groupCount,       color: C.purple, accent: 'rgba(167,139,250,0.3)'                                            },
    { label: 'Edge',      value: edgeCount,        color: C.text2,  accent: 'rgba(255,255,255,0.08)'                                           },
    { label: 'Workflows', value: activeWorkflows,  color: C.text2,  accent: 'rgba(255,255,255,0.08)'                                           },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: 24,
      alignItems: 'start',
    }}>
      {/* ── LEFT: device grid ── */}
      <div>

        {/* Stats strip */}
        {devices.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            marginBottom: 28,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                style={{
                  padding: '20px 22px',
                  borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : 'none',
                  position: 'relative',
                  transition: 'background 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,46,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Colored bottom accent bar */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: 2, background: s.accent,
                }} />

                <div style={{
                  fontFamily: C.sans,
                  fontSize: '2.4rem', fontWeight: 700, lineHeight: 1,
                  letterSpacing: '-0.02em', color: s.color,
                  fontVariantNumeric: 'tabular-nums', marginBottom: 6,
                }}>
                  {s.value}
                </div>
                <div style={{
                  fontFamily: C.sans,
                  fontSize: '0.62rem', fontWeight: 600,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: C.text3,
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#1a2eff',
              boxShadow: `0 0 6px rgba(26,46,255,0.6)`,
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text2,
            }}>
              Device Grid
            </span>
          </div>
          <span style={{
            fontFamily: C.mono, fontSize: '0.65rem',
            color: C.text3, background: C.panel,
            border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '2px 8px',
          }}>
            {devices.length} registered
          </span>
        </div>

        {/* Device cards */}
        {devices.length === 0 ? (
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '56px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
              color: C.text3,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2"/>
                <line x1="9" y1="7" x2="15" y2="7"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
              </svg>
            </div>
            <p style={{
              margin: 0, fontFamily: C.sans, fontSize: '0.85rem', fontWeight: 600,
              letterSpacing: '0.04em', color: C.text2,
            }}>
              No devices registered yet
            </p>
            <p style={{
              margin: '10px 0 0', fontSize: '0.82rem',
              color: C.text3, fontFamily: C.sans, lineHeight: 1.6,
            }}>
              Use the Devices tab to add an MQTT topic,<br />
              or ask Chat to register one.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
            gap: 14,
          }}>
            {devices.map(([name, data]) => (
              <DeviceCard key={name} name={name} data={data} wsMessages={wsMessages} />
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Claw Activity + Activity log ── */}
      <div>
        <ClawActivity clawEnabled={clawEnabled} wsMessages={wsMessages} />
        <ActivityLog refreshKey={JSON.stringify(deviceStates)} />
      </div>
    </div>
  )
}
