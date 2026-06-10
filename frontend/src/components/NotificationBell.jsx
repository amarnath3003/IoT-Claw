import { Bell, BellOff, BellRing } from 'lucide-react'
import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'

const C = {
  panel:  'rgba(255,255,255,0.03)',
  bg:     '#0d0d18',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  green:  '#22c55e',
  red:    '#ef4444',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

export default function NotificationBell() {
  const { permission, subscribed, supported, loading, error, subscribe, unsubscribe } = usePushNotifications()
  const [open, setOpen] = useState(false)

  if (!supported) return null

  const color = subscribed ? C.green : permission === 'denied' ? C.red : C.text2

  return (
    <div style={{ position: 'relative' }}>
      <button
        id="notification-bell-btn"
        title={subscribed ? 'Push notifications ON' : 'Enable push notifications'}
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset', cursor: 'pointer',
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8,
          border: `1px solid ${subscribed ? 'rgba(34,197,94,0.25)' : C.border}`,
          background: subscribed ? 'rgba(34,197,94,0.07)' : C.panel,
          color,
          position: 'relative',
          transition: 'all 0.2s',
        }}
      >
        {subscribed ? <BellRing size={14} /> : permission === 'denied' ? <BellOff size={14} /> : <Bell size={14} />}
        {subscribed && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 5, height: 5, borderRadius: '50%',
            background: C.green, boxShadow: `0 0 5px ${C.green}`,
            animation: 'ledBlink 2s ease-in-out infinite',
          }} />
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
          <div style={{
            position: 'absolute', top: 42, right: 0, zIndex: 200,
            width: 264,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            padding: 16,
          }}>
            <div style={{
              fontFamily: C.sans,
              fontSize: '0.8rem', fontWeight: 600, color: C.text1,
              marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <Bell size={13} style={{ color: C.blue }} />
              Push Notifications
            </div>

            <div style={{
              fontFamily: C.sans,
              fontSize: '0.78rem', color: C.text3, lineHeight: 1.6, marginBottom: 14,
            }}>
              {subscribed
                ? 'Alerts will fire when automations trigger or sensors breach thresholds.'
                : permission === 'denied'
                ? 'Blocked in browser. Allow IoT-Claw in your browser notification settings.'
                : 'Get instant alerts when your automations trigger on this device.'}
            </div>

            {error && (
              <div style={{
                fontFamily: C.sans,
                fontSize: '0.75rem', color: C.red, marginBottom: 10,
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                {error}
              </div>
            )}

            {permission !== 'denied' && (
              <button
                id="push-toggle-btn"
                onClick={subscribed ? unsubscribe : subscribe}
                disabled={loading}
                style={{
                  all: 'unset', cursor: loading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '9px 0',
                  borderRadius: 8,
                  border: `1px solid ${subscribed ? 'rgba(239,68,68,0.25)' : 'rgba(26,46,255,0.3)'}`,
                  fontFamily: C.sans,
                  fontWeight: 600, fontSize: '0.72rem',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: subscribed ? 'rgba(239,68,68,0.08)' : 'rgba(26,46,255,0.12)',
                  color: subscribed ? C.red : C.blue,
                  opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
                  boxSizing: 'border-box',
                }}
              >
                {loading ? 'Please wait…' : subscribed
                  ? <><BellOff size={12} /> Disable</>
                  : <><BellRing size={12} /> Enable</>
                }
              </button>
            )}

            <div style={{
              fontFamily: C.mono,
              fontSize: '0.62rem', color: C.text3, marginTop: 10, textAlign: 'center',
            }}>
              STATUS: {
                permission === 'granted' && subscribed ? '● ACTIVE'
                : permission === 'denied' ? '● BLOCKED'
                : '○ INACTIVE'
              }
            </div>
          </div>
        </>
      )}
    </div>
  )
}
