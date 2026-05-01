import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'

/**
 * NotificationBell
 * ─────────────────
 * A compact bell icon that sits in the App header.
 * Click → shows a popover to enable / disable push notifications.
 */
export default function NotificationBell() {
  const { permission, subscribed, supported, loading, error, subscribe, unsubscribe } = usePushNotifications()
  const [open, setOpen] = useState(false)

  if (!supported) return null

  const bellColor = subscribed
    ? '#22c55e'
    : permission === 'denied'
    ? '#f87171'
    : 'var(--text-muted)'

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        id="notification-bell-btn"
        title={subscribed ? 'Push notifications ON' : 'Enable push notifications'}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '6px 10px',
          cursor: 'pointer',
          color: bellColor,
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        {subscribed ? '🔔' : '🔕'}
        {subscribed && (
          <div style={{
            position: 'absolute', top: 4, right: 4,
            width: 7, height: 7, borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 6px #22c55e',
          }} />
        )}
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          />
          <div style={{
            position: 'absolute',
            top: 44,
            right: 0,
            zIndex: 200,
            width: 270,
            background: 'var(--bg-card)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            padding: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)', marginBottom: 6 }}>
              🔔 Push Notifications
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
              {subscribed
                ? 'You will receive alerts when automations fire or sensors hit thresholds.'
                : permission === 'denied'
                ? '⛔ Blocked in browser settings. Allow iotClaw in your browser notification settings.'
                : 'Get instant alerts on this device when your automations trigger.'}
            </div>

            {error && (
              <div style={{ fontSize: 11, color: '#f87171', marginBottom: 10, padding: '6px 8px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>
                {error}
              </div>
            )}

            {permission !== 'denied' && (
              <button
                id="push-toggle-btn"
                onClick={subscribed ? unsubscribe : subscribe}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '9px 0',
                  borderRadius: 9,
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                  transition: 'all 0.2s',
                  background: subscribed
                    ? 'rgba(248,113,113,0.15)'
                    : 'rgba(99,102,241,0.2)',
                  color: subscribed ? '#f87171' : '#818cf8',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Please wait…' : subscribed ? '🔕 Disable Notifications' : '🔔 Enable Notifications'}
              </button>
            )}

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
              Status: {
                permission === 'granted' && subscribed ? '✅ Active'
                : permission === 'denied' ? '⛔ Blocked'
                : '⏸ Not enabled'
              }
            </div>
          </div>
        </>
      )}
    </div>
  )
}
