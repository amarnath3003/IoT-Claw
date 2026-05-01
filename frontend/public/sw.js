/**
 * IoT-Claw Service Worker
 * ─────────────────────────
 * Handles:
 *  1. App shell caching for offline support
 *  2. Web Push Notifications when automations fire
 *  3. Notification click → open the app
 */

const CACHE_NAME = 'iotclaw-v1'
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// ── Install: cache the app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: network-first, fall back to cache ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only cache GET requests; skip API / WebSocket calls
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/chat') ||
      url.pathname.startsWith('/devices') || url.pathname.startsWith('/push')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy))
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// ── Push: show a notification ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'iotClaw Alert', body: 'An automation has fired.', tag: 'iotclaw', url: '/' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/logo.jpg',
      badge:   '/logo.jpg',
      tag:     data.tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data:    { url: data.url },
      actions: [
        { action: 'open',    title: 'Open Dashboard' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  )
})

// ── Notification click: open / focus the app ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const existing = cs.find((c) => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.navigate(targetUrl) }
      else clients.openWindow(targetUrl)
    })
  )
})
