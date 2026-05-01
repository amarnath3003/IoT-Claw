import { useCallback, useEffect, useState } from 'react'

/**
 * usePushNotifications
 * ─────────────────────
 * Manages browser Push Notification subscription lifecycle.
 * Usage:
 *   const { permission, supported, subscribe, unsubscribe } = usePushNotifications()
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  // Check if already subscribed on mount
  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
    )
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError(null)
    try {
      // Ask notification permission
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') throw new Error('Permission denied by user.')

      // Fetch VAPID public key from backend
      const keyRes  = await fetch('/push/vapid-public-key')
      const keyData = await keyRes.json()
      const pubKey  = keyData.publicKey

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        ...(pubKey ? { applicationServerKey: urlBase64ToUint8Array(pubKey) } : {}),
      })

      // Send subscription to backend
      await fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })

      setSubscribed(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await fetch('/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
      }
      setSubscribed(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [supported])

  return { permission, subscribed, supported, loading, error, subscribe, unsubscribe }
}
